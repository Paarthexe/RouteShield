import logging
import httpx
from typing import List, Optional
from fastapi import HTTPException, status
from app.config import settings
from app.models.route_models import Coordinate, Route, GeoJSONLineString
from app.services.sampling import sampling_service
from app.services.cache import cache_service

logger = logging.getLogger(__name__)


class RoutingService:
    def __init__(self):
        self.osrm_base_url = settings.OSRM_BASE_URL.rstrip("/")
        self.timeout = settings.HTTP_TIMEOUT_S

    async def generate_candidate_routes(
        self,
        origin: Coordinate,
        destination: Coordinate,
        sample_interval_m: Optional[float] = None
    ) -> List[Route]:
        interval = sample_interval_m or settings.ROUTE_SAMPLE_INTERVAL_M

        cache_key = (
            f"route:{round(origin.latitude, 5)},{round(origin.longitude, 5)}"
            f":{round(destination.latitude, 5)},{round(destination.longitude, 5)}"
            f":int_{int(interval)}"
        )
        cached = cache_service.get(cache_key)
        if cached:
            return [Route(**r) for r in cached]

        raw_routes = await self._fetch_osrm_routes(origin, destination)
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
            tag = "Primary" if idx == 0 else f"Alternative {idx}"

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

        cache_service.set(cache_key, [r.model_dump() for r in parsed_routes])
        return parsed_routes

    async def _fetch_osrm_routes(self, origin: Coordinate, destination: Coordinate) -> List[dict]:
        url = (
            f"{self.osrm_base_url}/route/v1/driving/"
            f"{origin.longitude},{origin.latitude};"
            f"{destination.longitude},{destination.latitude}"
        )
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
                        return data.get("routes", [])
                logger.warning(f"OSRM returned {resp.status_code}")
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Routing service timed out.")
        except Exception as e:
            logger.error(f"OSRM error: {e}")
            raise HTTPException(status_code=503, detail="Routing service unreachable.")
        return []


routing_service = RoutingService()
