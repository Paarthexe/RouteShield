import logging
import asyncio
import httpx
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from app.config import settings
from app.models.route_models import Coordinate, Route, GeoJSONLineString, AgentDecision, Location, IncidentContext
from app.services.sampling import sampling_service, compute_traffic_adjusted_duration
from app.services.infrastructure_service import infrastructure_service
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
        disaster_type: str = "ALL_HAZARDS",
        incident_context: Optional[IncidentContext] = None,
    ) -> List[Route]:
        interval = sample_interval_m or settings.ROUTE_SAMPLE_INTERVAL_M
        w_list = waypoints or []

        raw_routes = await self._fetch_osrm_routes(origin, destination, w_list)
        if not raw_routes:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No route found between these locations."
            )

        # Pre-fetch regional refuel infrastructure for all candidate routes combined in a single request
        all_routes_coords = [r.get("geometry", {}).get("coordinates", []) for r in raw_routes if r.get("geometry")]
        regional_stations = await infrastructure_service.fetch_regional_stations(all_routes_coords)

        # Parallelize physical route sampling across ALL candidate corridors
        async def process_single_route(idx: int, r_data: Dict[str, Any]) -> Route:
            route_id = f"route_{idx + 1}"
            dist_m = float(r_data.get("distance", 0.0))
            dur_s = float(r_data.get("duration", 0.0))
            coords = r_data.get("geometry", {}).get("coordinates", [])

            geometry = GeoJSONLineString(type="LineString", coordinates=coords)
            tag = "Fastest Evacuation Corridor" if idx == 0 else f"Alternative Evacuation Corridor {idx + 1}"

            # Sample route physics and project pre-fetched infrastructure
            samples = await sampling_service.sample_route(
                route_id=route_id,
                geometry=geometry,
                interval_m=interval,
                disaster_type=disaster_type,
                estimated_duration_s=dur_s,
            )
            infra_data = infrastructure_service.project_stations_for_route(regional_stations, coords, dist_m)

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

            # Compute traffic-adjusted duration from TomTom speed probes
            final_dur_s = compute_traffic_adjusted_duration(samples, dur_s)

            return Route(
                route_id=route_id,
                geometry=geometry,
                distance_m=round(dist_m, 1),
                duration_s=round(final_dur_s, 1),
                distance_km=round(dist_m / 1000.0, 2),
                travel_time_min=round(final_dur_s / 60.0, 1),
                tag=tag,
                samples=samples,
                infrastructure=infra_data,
                infrastructure_summary={
                    "total_bridges": len(bridge_list),
                    "aging_bridges": aging,
                    "average_bridge_age_years": avg_age,
                    "critical_bridges": [
                        b["structure_id"] for b in bridge_list
                        if b.get("deck_condition") in ["1", "2", "3", "4"]
                    ],
                    "total_gas_stations": infra_data.get("total_gas_stations", 0),
                    "total_ev_fast_stations": infra_data.get("total_ev_fast_stations", 0),
                    "total_ev_standard_stations": infra_data.get("total_ev_standard_stations", 0),
                    "total_ev_chargers": infra_data.get("total_ev_chargers", 0),
                    "max_gas_gap_km": infra_data.get("max_gas_gap_km", 0.0),
                    "max_ev_gap_km": infra_data.get("max_ev_gap_km", 0.0),
                    "max_ev_fast_gap_km": infra_data.get("max_ev_fast_gap_km", 0.0),
                    "fuel_desert_warning": infra_data.get("fuel_desert_warning")
                }
            )

        parsed_routes = list(await asyncio.gather(
            *[process_single_route(idx, r_data) for idx, r_data in enumerate(raw_routes)]
        ))

        # Dynamically assign the Fastest tag to the corridor with the lowest actual duration
        if parsed_routes:
            min_time = min(r.travel_time_min for r in parsed_routes)
            for idx, r in enumerate(parsed_routes):
                if abs(r.travel_time_min - min_time) < 0.05:
                    r.tag = "Fastest Evacuation Corridor"
                else:
                    r.tag = f"Alternative Evacuation Corridor {idx + 1}"

        return parsed_routes

    async def generate_and_analyze(
        self,
        origin: Coordinate,
        destination: Coordinate,
        origin_loc: Location,
        destination_loc: Location,
        waypoints: Optional[List[Coordinate]] = None,
        sample_interval_m: Optional[float] = None,
        disaster_type: str = "ALL_HAZARDS",
        incident_context: Optional[IncidentContext] = None,
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
            disaster_type=disaster_type,
            incident_context=incident_context,
        )

        # Run agentic analysis pipeline
        agent_decision = await run_agent_analysis(
            routes,
            origin_loc,
            destination_loc,
            disaster_type=disaster_type,
            incident_context=incident_context,
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

        # If OSRM returns < 3 routes and no custom waypoints were specified,
        # synthesize distinct lateral bypass corridors via perpendicular lateral anchors
        if len(routes) < 3 and not waypoints:
            synthesized = await self._synthesize_alternative_corridors(origin, destination, existing_routes=routes)
            routes.extend(synthesized)

        # Sort candidate routes by duration so route_1 is the fastest
        routes.sort(key=lambda r: float(r.get("duration", 0.0)))
        return routes[:4]  # Up to 4 distinct corridors

    async def _synthesize_alternative_corridors(
        self,
        origin: Coordinate,
        destination: Coordinate,
        existing_routes: List[dict]
    ) -> List[dict]:
        """
        Generate lateral bypass corridors by querying OSRM through perpendicular midpoint anchors.
        Ensures RouteShield discovers real alternative evacuation paths even when OSRM defaults to 1.
        """
        import math
        lat1, lon1 = origin.latitude, origin.longitude
        lat2, lon2 = destination.latitude, destination.longitude

        mid_lat = (lat1 + lat2) / 2.0
        mid_lon = (lon1 + lon2) / 2.0

        d_lat = lat2 - lat1
        d_lon = lon2 - lon1
        mag = math.sqrt(d_lat * d_lat + d_lon * d_lon)
        if mag < 1e-6:
            return []

        # Unit perpendicular vector
        perp_lat = -d_lon / mag
        perp_lon = d_lat / mag

        # Base minimum duration from existing routes
        fastest_duration = min((float(r.get("duration", 0.0)) for r in existing_routes), default=0.0)

        # Perpendicular offsets (~1.5 km, ~3 km, ~5 km)
        offsets_deg = [0.015, -0.015, 0.03, -0.03, 0.05, -0.05]
        new_routes: List[dict] = []

        existing_distances = [float(r.get("distance", 0.0)) for r in existing_routes]

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for offset in offsets_deg:
                if len(existing_routes) + len(new_routes) >= 3:
                    break

                w_lat = mid_lat + perp_lat * offset
                w_lon = mid_lon + perp_lon * offset

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
                            
                            # Filter out duplicate routes (<3% dist difference)
                            is_duplicate = any(abs(cand_dist - ed) / max(1.0, ed) < 0.03 for ed in (existing_distances + [float(r.get("distance", 0.0)) for r in new_routes]))
                            
                            # Filter out extreme detours (>2.2x duration of primary route)
                            is_excessive_detour = fastest_duration > 0 and (cand_dur / fastest_duration > 2.2)

                            if not is_duplicate and not is_excessive_detour and cand_dist > 0:
                                logger.info(f"Synthesized distinct bypass corridor: {cand_dist/1000.0:.1f} km ({cand_dur/60.0:.1f} min)")
                                new_routes.append(cand)
                except Exception as e:
                    logger.debug(f"Lateral bypass query failed: {e}")

        return new_routes


routing_service = RoutingService()
