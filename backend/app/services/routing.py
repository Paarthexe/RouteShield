import logging
import httpx
from typing import List, Optional
from fastapi import HTTPException, status
from app.config import settings
from app.models.route_models import Coordinate, Route, GeoJSONLineString, AgentDecision, Location
from app.services.sampling import sampling_service
from app.services.cache import cache_service
from app.services.agent_service import run_agent_analysis

logger = logging.getLogger(__name__)


class RoutingService:
    def __init__(self):
        self.osrm_base_url = settings.OSRM_BASE_URL.rstrip("/")
        self.timeout = settings.HTTP_TIMEOUT_S

    async def generate_candidate_routes(
        self,
        origin: Coordinate,
        destination: Coordinate,
        waypoints: Optional[List[Coordinate]] = None,
        sample_interval_m: Optional[float] = None,
        disaster_type: str = "ALL_HAZARDS"
    ) -> List[Route]:
        interval = sample_interval_m or settings.ROUTE_SAMPLE_INTERVAL_M
        w_list = waypoints or []

        raw_routes = await self._fetch_osrm_routes(origin, destination, w_list)
        if not raw_routes:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No route found between these locations."
            )

        parsed_routes: List[Route] = []
        for idx, r_data in enumerate(raw_routes):
            route_id = f"route_{idx + 1}"
            dist_m = float(r_data.get("distance", 0.0))
            dur_s = float(r_data.get("duration", 0.0))
            coords = r_data.get("geometry", {}).get("coordinates", [])

            geometry = GeoJSONLineString(type="LineString", coordinates=coords)
            tag = "Fastest Evacuation Corridor" if idx == 0 else f"Alternative Evacuation Corridor {idx}"

            samples = await sampling_service.sample_route(
                route_id=route_id,
                geometry=geometry,
                interval_m=interval,
                disaster_type=disaster_type
            )

            # Deduplicate bridges across all sample points, compute summary
            unique_bridges = {}
            for s in samples:
                for b in (s.nbi_bridges or []):
                    sid = b.get("structure_id")
                    if sid and sid not in unique_bridges:
                        unique_bridges[sid] = b

            bridge_list = list(unique_bridges.values())
            aging = sum(
                1 for b in bridge_list
                if (b.get("year_built") and b["year_built"] < 1970)
                or b.get("deck_condition") in ["1", "2", "3", "4"]
            )
            valid_ages = [b["age_years"] for b in bridge_list if b.get("age_years") is not None]
            avg_age = round(sum(valid_ages) / len(valid_ages), 1) if valid_ages else 0

            route_obj = Route(
                route_id=route_id,
                geometry=geometry,
                distance_m=round(dist_m, 1),
                duration_s=round(dur_s, 1),
                distance_km=round(dist_m / 1000.0, 2),
                travel_time_min=round(dur_s / 60.0, 1),
                tag=tag,
                samples=samples,
                infrastructure_summary={
                    "total_bridges": len(bridge_list),
                    "aging_bridges": aging,
                    "average_bridge_age_years": avg_age,
                    "critical_bridges": [
                        b["structure_id"] for b in bridge_list
                        if b.get("deck_condition") in ["1", "2", "3", "4"]
                    ]
                }
            )
            parsed_routes.append(route_obj)

        return parsed_routes

    async def generate_and_analyze(
        self,
        origin: Coordinate,
        destination: Coordinate,
        origin_loc: Location,
        destination_loc: Location,
        waypoints: Optional[List[Coordinate]] = None,
        sample_interval_m: Optional[float] = None,
        disaster_type: str = "ALL_HAZARDS"
    ) -> tuple:
        """
        Generate routes AND run the full agent analysis pipeline.
        Returns (routes, agent_decision).
        """
        routes = await self.generate_candidate_routes(
            origin=origin,
            destination=destination,
            waypoints=waypoints,
            sample_interval_m=sample_interval_m,
            disaster_type=disaster_type
        )

        # Run agentic analysis pipeline
        agent_decision = await run_agent_analysis(
            routes, origin_loc, destination_loc, disaster_type=disaster_type
        )

        return routes, agent_decision


    async def _fetch_osrm_routes(
        self,
        origin: Coordinate,
        destination: Coordinate,
        waypoints: List[Coordinate]
    ) -> List[dict]:
        coord_strings = [f"{origin.longitude},{origin.latitude}"]
        for w in waypoints:
            coord_strings.append(f"{w.longitude},{w.latitude}")
        coord_strings.append(f"{destination.longitude},{destination.latitude}")

        path_coords = ";".join(coord_strings)
        url = f"{self.osrm_base_url}/route/v1/driving/{path_coords}"

        routes: List[dict] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params={
                    "overview": "full",
                    "geometries": "geojson",
                    "alternatives": "true",
                    "steps": "false",
                    "continue_straight": "true"
                })
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("code") == "Ok":
                        routes = data.get("routes", [])
                else:
                    logger.warning(f"OSRM returned {resp.status_code}")
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Routing service timed out.")
        except Exception as e:
            logger.error(f"OSRM error: {e}")
            raise HTTPException(status_code=503, detail="Routing service unreachable.")

        # If OSRM returns < 5 routes and no custom waypoints were specified,
        # synthesize distinct lateral bypass corridors via road-snapped anchor points
        if len(routes) < 5 and not waypoints:
            synthesized = await self._synthesize_alternative_corridors(origin, destination, existing_routes=routes, max_total=5)
            routes.extend(synthesized)

        # Sort candidate routes by duration so route_1 is the fastest
        routes.sort(key=lambda r: float(r.get("duration", 0.0)))
        return routes[:5]  # Up to 5 distinct, high-quality corridors

    async def _synthesize_alternative_corridors(
        self,
        origin: Coordinate,
        destination: Coordinate,
        existing_routes: List[dict],
        max_total: int = 5
    ) -> List[dict]:
        """
        Generate high-quality lateral bypass corridors with zero loops or backtracking:
        1. Calculating trisection & midpoint corridor coordinates (35%, 50%, 65%).
        2. Applying gentle perpendicular lateral offsets (10% - 16% of direct distance).
        3. Enforcing geometric ellipse constraints (D_AW + D_WB <= 1.22 * D_AB) to eliminate V-hooks.
        4. Snapping waypoints to real drivable roads via OSRM /nearest.
        5. Setting continue_straight=true to forbid OSRM from generating intermediate U-turns.
        6. Filtering through _is_clean_highway_geometry to eliminate any trajectory self-intersection.
        7. Enforcing strict highway viability gates (detour <= 1.35x distance / 1.45x duration).
        """
        import math

        lat1, lon1 = origin.latitude, origin.longitude
        lat2, lon2 = destination.latitude, destination.longitude

        d_lat = lat2 - lat1
        d_lon = lon2 - lon1
        direct_dist = math.hypot(d_lat, d_lon)
        if direct_dist < 1e-5:
            return []

        base_dist = float(existing_routes[0].get("distance", 0.0)) if existing_routes else 1.0
        base_dur = float(existing_routes[0].get("duration", 0.0)) if existing_routes else 1.0

        # Gentle, realistic highway bypass anchors: (fraction along corridor, perpendicular scale)
        # Moderate lateral offsets (10% - 16%) strictly target real parallel highways
        anchor_configs = [
            (0.50, 0.12), (0.50, -0.12),
            (0.35, 0.15), (0.35, -0.15),
            (0.65, 0.15), (0.65, -0.15),
            (0.40, 0.10), (0.40, -0.10),
            (0.60, 0.10), (0.60, -0.10),
        ]
        new_routes: List[dict] = []

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for fraction, scale in anchor_configs:
                if len(existing_routes) + len(new_routes) >= max_total:
                    break

                # Interpolate point along route vector
                p_lat = lat1 + d_lat * fraction
                p_lon = lon1 + d_lon * fraction

                # Apply gentle perpendicular lateral offset
                raw_w_lat = p_lat - d_lon * scale
                raw_w_lon = p_lon + d_lat * scale

                # Ellipse geometric check: ensure waypoint does not force a detour or hairpin
                d_aw = math.hypot(raw_w_lat - lat1, raw_w_lon - lon1)
                d_wb = math.hypot(lat2 - raw_w_lat, lon2 - raw_w_lon)
                if (d_aw + d_wb) > 1.22 * direct_dist:
                    continue

                # Snap waypoint to nearest real drivable road node
                snap_url = f"{self.osrm_base_url}/nearest/v1/driving/{raw_w_lon:.5f},{raw_w_lat:.5f}"
                w_lat, w_lon = raw_w_lat, raw_w_lon
                road_name = "parallel corridor"
                try:
                    snap_res = await client.get(snap_url, params={"number": "1"})
                    if snap_res.status_code == 200:
                        snap_data = snap_res.json()
                        wps = snap_data.get("waypoints", [])
                        if wps:
                            w_lon, w_lat = wps[0]["location"]
                            road_name = wps[0].get("name") or "parallel corridor"
                except Exception:
                    pass

                # Route through snapped waypoint with continue_straight=true to strictly prevent U-turns
                path_str = f"{lon1},{lat1};{w_lon:.5f},{w_lat:.5f};{lon2},{lat2}"
                synth_url = f"{self.osrm_base_url}/route/v1/driving/{path_str}"

                try:
                    resp = await client.get(synth_url, params={
                        "overview": "full",
                        "geometries": "geojson",
                        "steps": "false",
                        "continue_straight": "true"
                    })
                    if resp.status_code == 200:
                        d = resp.json()
                        if d.get("code") == "Ok" and d.get("routes"):
                            cand = d["routes"][0]
                            cand_dist = float(cand.get("distance", 0.0))
                            cand_dur = float(cand.get("duration", 0.0))
                            coords = cand.get("geometry", {}).get("coordinates", [])

                            # Quality Gate 1: Reject long detours (> 1.35x distance or > 1.45x duration)
                            if base_dist > 0 and (cand_dist > base_dist * 1.35 or cand_dur > base_dur * 1.45):
                                continue

                            # Quality Gate 2: Mathematical anti-backtracking and loop verification
                            if not self._is_clean_highway_geometry(coords):
                                logger.debug(f"Rejected corridor via {road_name} due to trajectory backtracking/looping.")
                                continue

                            # Quality Gate 3: Uniqueness check (at least 3.5% variance from existing corridors)
                            all_dists = [float(r.get("distance", 0.0)) for r in existing_routes + new_routes]
                            is_duplicate = any(abs(cand_dist - ed) / max(1.0, ed) < 0.035 for ed in all_dists)

                            if not is_duplicate and cand_dist > 0:
                                logger.info(
                                    f"Synthesized clean highway corridor via {road_name}: "
                                    f"{cand_dist/1000.0:.1f} km ({cand_dur/60.0:.1f} min)"
                                )
                                new_routes.append(cand)
                except Exception as e:
                    logger.debug(f"Lateral bypass query failed: {e}")

        return new_routes

    def _is_clean_highway_geometry(self, coords: List[List[float]]) -> bool:
        """
        Verify that a route geometry is a smooth forward highway path without
        self-intersection, hairpin spurs, or 180-degree backtracking.
        """
        import math
        if len(coords) < 8:
            return True

        # Sample points along route to check for opposite heading overlap
        step = max(1, len(coords) // 40)
        sampled = coords[::step]
        n = len(sampled)

        for i in range(n - 1):
            p1 = sampled[i]
            p2 = sampled[i + 1]
            v1_x = p2[0] - p1[0]
            v1_y = p2[1] - p1[1]
            len1 = math.hypot(v1_x, v1_y)
            if len1 < 1e-5:
                continue

            for j in range(i + 4, n - 1):
                p3 = sampled[j]
                p4 = sampled[j + 1]

                # Check if distant parts of route are too close (< 250m) in opposite directions
                dist_pts = math.hypot(p3[0] - p1[0], p3[1] - p1[1])
                if dist_pts < 0.0025:  # ~250m
                    v2_x = p4[0] - p3[0]
                    v2_y = p4[1] - p3[1]
                    len2 = math.hypot(v2_x, v2_y)
                    if len2 > 1e-5:
                        dot = (v1_x * v2_x + v1_y * v2_y) / (len1 * len2)
                        if dot < -0.55:  # Route is doubling back along the exact same roadway
                            return False

        return True


routing_service = RoutingService()

