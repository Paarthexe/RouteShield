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
        sample_interval_m: Optional[float] = None
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
                interval_m=interval
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
        sample_interval_m: Optional[float] = None
    ) -> tuple:
        """
        Generate routes AND run the full agent analysis pipeline.
        Returns (routes, agent_decision).
        """
        routes = await self.generate_candidate_routes(
            origin=origin,
            destination=destination,
            waypoints=waypoints,
            sample_interval_m=sample_interval_m
        )

        # Run agentic analysis pipeline
        agent_decision = await run_agent_analysis(routes, origin_loc, destination_loc)

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
                    "steps": "false"
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
        Generate high-quality lateral bypass corridors by:
        1. Calculating trisection & midpoint corridor coordinates (33%, 50%, 67%).
        2. Applying perpendicular lateral offsets (both directions, moderate & wide).
        3. Snapping waypoints to real drivable roads via OSRM /nearest.
        4. Enforcing quality filters (detour ratio <= 1.85x distance / 2.2x duration)
           and uniqueness filters (>= 5% distance variance) to eliminate zig-zags.
        """
        lat1, lon1 = origin.latitude, origin.longitude
        lat2, lon2 = destination.latitude, destination.longitude

        d_lat = lat2 - lat1
        d_lon = lon2 - lon1

        base_dist = float(existing_routes[0].get("distance", 0.0)) if existing_routes else 1.0
        base_dur = float(existing_routes[0].get("duration", 0.0)) if existing_routes else 1.0

        # Anchor configs: (fraction along corridor vector, lateral perpendicular scale)
        anchor_configs = [
            (0.50, 0.25), (0.50, -0.25),
            (0.35, 0.30), (0.35, -0.30),
            (0.65, 0.30), (0.65, -0.30),
            (0.50, 0.45), (0.50, -0.45),
            (0.35, 0.50), (0.65, -0.50),
        ]
        new_routes: List[dict] = []

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for fraction, scale in anchor_configs:
                if len(existing_routes) + len(new_routes) >= max_total:
                    break

                # Interpolate point along route vector
                p_lat = lat1 + d_lat * fraction
                p_lon = lon1 + d_lon * fraction

                # Apply perpendicular lateral offset
                raw_w_lat = p_lat - d_lon * scale
                raw_w_lon = p_lon + d_lat * scale

                # Snap waypoint to nearest real drivable road node
                snap_url = f"{self.osrm_base_url}/nearest/v1/driving/{raw_w_lon:.5f},{raw_w_lat:.5f}"
                w_lat, w_lon = raw_w_lat, raw_w_lon
                road_name = "bypass corridor"
                try:
                    snap_res = await client.get(snap_url, params={"number": "1"})
                    if snap_res.status_code == 200:
                        snap_data = snap_res.json()
                        wps = snap_data.get("waypoints", [])
                        if wps:
                            w_lon, w_lat = wps[0]["location"]
                            road_name = wps[0].get("name") or "bypass corridor"
                except Exception:
                    pass

                # Route through snapped waypoint
                path_str = f"{lon1},{lat1};{w_lon:.5f},{w_lat:.5f};{lon2},{lat2}"
                synth_url = f"{self.osrm_base_url}/route/v1/driving/{path_str}"

                try:
                    resp = await client.get(synth_url, params={
                        "overview": "full",
                        "geometries": "geojson",
                        "steps": "false"
                    })
                    if resp.status_code == 200:
                        d = resp.json()
                        if d.get("code") == "Ok" and d.get("routes"):
                            cand = d["routes"][0]
                            cand_dist = float(cand.get("distance", 0.0))
                            cand_dur = float(cand.get("duration", 0.0))

                            # Quality Gate 1: Reject absurdly long or tortuous routes
                            if base_dist > 0 and (cand_dist > base_dist * 1.85 or cand_dur > base_dur * 2.2):
                                continue

                            # Quality Gate 2: Uniqueness check (at least 5% variance from existing corridors)
                            all_dists = [float(r.get("distance", 0.0)) for r in existing_routes + new_routes]
                            is_duplicate = any(abs(cand_dist - ed) / max(1.0, ed) < 0.05 for ed in all_dists)

                            if not is_duplicate and cand_dist > 0:
                                logger.info(
                                    f"Synthesized high-quality bypass corridor via {road_name}: "
                                    f"{cand_dist/1000.0:.1f} km ({cand_dur/60.0:.1f} min)"
                                )
                                new_routes.append(cand)
                except Exception as e:
                    logger.debug(f"Lateral bypass query failed: {e}")

        return new_routes


routing_service = RoutingService()
