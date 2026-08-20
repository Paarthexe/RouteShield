import logging
import asyncio
from typing import List, Tuple
from app.models.route_models import GeoJSONLineString, RouteSample
from app.utils.geo import haversine_distance, interpolate_coordinate
from app.services.nbi_service import nbi_service
from app.services.mireye_service import mireye_data_service
from app.services.open_meteo_service import open_meteo_service

logger = logging.getLogger(__name__)

class SamplingService:
    async def sample_route(
        self,
        route_id: str,
        geometry: GeoJSONLineString,
        interval_m: float = 500.0
    ) -> List[RouteSample]:
        coords = geometry.coordinates
        if not coords:
            return []

        # If only 1 coordinate
        if len(coords) == 1:
            lon, lat = coords[0]
            m_facts = await mireye_data_service.fetch_location_facts(lat, lon, preset="natural_hazard")
            om_elevs = await open_meteo_service.fetch_elevations_bulk([(lat, lon)])
            om_data = om_elevs[0] if om_elevs else None
            
            combined_facts = m_facts if isinstance(m_facts, dict) else {}
            if om_data and "elevation_m" in om_data:
                if "elevation_m" not in combined_facts or combined_facts["elevation_m"] is None:
                    combined_facts["elevation_m"] = om_data["elevation_m"]
                    combined_facts["elevation_source"] = om_data["elevation_source"]

            return [
                RouteSample(
                    sample_id=f"{route_id}_sample_001",
                    route_id=route_id,
                    latitude=lat,
                    longitude=lon,
                    distance_from_origin_m=0.0,
                    nbi_bridges=nbi_service.get_nearby_bridges(lat, lon, radius_m=300.0),
                    mireye_data=combined_facts if combined_facts else None
                )
            ]

        # Calculate cumulative distances
        cum_dist = [0.0]
        for i in range(len(coords) - 1):
            lon1, lat1 = coords[i]
            lon2, lat2 = coords[i + 1]
            seg_dist = haversine_distance(lat1, lon1, lat2, lon2)
            cum_dist.append(cum_dist[-1] + seg_dist)

        total_distance = cum_dist[-1]
        safe_interval = max(1.0, interval_m)

        # 1. Generate all target coordinates first
        point_targets: List[Tuple[float, float, float]] = [] # (lat, lon, dist_m)
        target_d = 0.0

        while target_d < total_distance:
            lat, lon = self._find_point_at_distance(coords, cum_dist, target_d)
            point_targets.append((round(lat, 6), round(lon, 6), round(target_d, 2)))
            target_d += safe_interval

        end_lon, end_lat = coords[-1]
        round_end_lat = round(end_lat, 6)
        round_end_lon = round(end_lon, 6)

        if not point_targets or (total_distance - point_targets[-1][2] > 1.0):
            point_targets.append((round_end_lat, round_end_lon, round(total_distance, 2)))

        # 2. Fetch Open-Meteo elevation in bulk and Mireye data concurrently
        semaphore = asyncio.Semaphore(4)

        async def fetch_mireye(lat: float, lon: float):
            async with semaphore:
                return await mireye_data_service.fetch_location_facts(lat, lon, preset="natural_hazard")

        point_coords = [(lat, lon) for (lat, lon, _) in point_targets]
        
        mireye_tasks = [fetch_mireye(lat, lon) for (lat, lon, _) in point_targets]
        om_task = open_meteo_service.fetch_elevations_bulk(point_coords)

        all_results = await asyncio.gather(om_task, asyncio.gather(*mireye_tasks, return_exceptions=True), return_exceptions=True)
        
        om_results = all_results[0] if isinstance(all_results[0], list) else []
        mireye_results = all_results[1] if len(all_results) > 1 and isinstance(all_results[1], list) else []

        # 3. Construct RouteSample objects
        samples: List[RouteSample] = []
        for idx, (lat, lon, dist_m) in enumerate(point_targets):
            sample_id = f"{route_id}_sample_{idx + 1:03d}"
            nbi_bridges = nbi_service.get_nearby_bridges(lat, lon, radius_m=300.0)
            
            m_facts = mireye_results[idx] if idx < len(mireye_results) and isinstance(mireye_results[idx], dict) else {}
            if not isinstance(m_facts, dict):
                m_facts = {}

            om_data = om_results[idx] if idx < len(om_results) and isinstance(om_results[idx], dict) else None

            # Enrich with Open-Meteo elevation if not present
            if om_data and "elevation_m" in om_data:
                if "elevation_m" not in m_facts or m_facts["elevation_m"] is None:
                    m_facts["elevation_m"] = om_data["elevation_m"]
                    m_facts["elevation_source"] = om_data["elevation_source"]

            samples.append(
                RouteSample(
                    sample_id=sample_id,
                    route_id=route_id,
                    latitude=lat,
                    longitude=lon,
                    distance_from_origin_m=dist_m,
                    nbi_bridges=nbi_bridges if nbi_bridges else None,
                    mireye_data=m_facts if m_facts else None
                )
            )

        return samples

    def _find_point_at_distance(
        self,
        coords: List[List[float]],
        cum_dist: List[float],
        target_d: float
    ) -> Tuple[float, float]:
        if target_d <= 0.0:
            lon, lat = coords[0]
            return lat, lon

        if target_d >= cum_dist[-1]:
            lon, lat = coords[-1]
            return lat, lon

        for i in range(len(cum_dist) - 1):
            d_start = cum_dist[i]
            d_end = cum_dist[i + 1]

            if d_start <= target_d <= d_end:
                seg_length = d_end - d_start
                if seg_length <= 1e-6:
                    lon, lat = coords[i]
                    return lat, lon
                
                fraction = (target_d - d_start) / seg_length
                lon1, lat1 = coords[i]
                lon2, lat2 = coords[i + 1]
                return interpolate_coordinate(lat1, lon1, lat2, lon2, fraction)

        lon, lat = coords[-1]
        return lat, lon

sampling_service = SamplingService()
