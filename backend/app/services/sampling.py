import logging
import asyncio
from typing import List, Tuple, Set
from app.models.route_models import GeoJSONLineString, RouteSample
from app.utils.geo import haversine_distance, interpolate_coordinate
from app.services.nbi_service import nbi_service
from app.services.mireye_service import mireye_data_service
from app.services.open_meteo_service import open_meteo_service

logger = logging.getLogger(__name__)

# Maximum number of Mireye /v1/fetch calls per route
MAX_MIREYE_PROBES = 4


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
            om_elevs = await open_meteo_service.fetch_elevations_bulk([(lat, lon)])
            om_data = om_elevs[0] if om_elevs else None

            combined_facts = {}
            if om_data and "elevation_m" in om_data:
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
                    mireye_data=combined_facts if combined_facts else None,
                    is_mireye_probed=False
                )
            ]

        # ====================================================================
        # PHASE 1: Generate all sample point coordinates (Haversine)
        # ====================================================================
        cum_dist = [0.0]
        for i in range(len(coords) - 1):
            lon1, lat1 = coords[i]
            lon2, lat2 = coords[i + 1]
            seg_dist = haversine_distance(lat1, lon1, lat2, lon2)
            cum_dist.append(cum_dist[-1] + seg_dist)

        total_distance = cum_dist[-1]
        safe_interval = max(1.0, interval_m)

        point_targets: List[Tuple[float, float, float]] = []  # (lat, lon, dist_m)
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

        # ====================================================================
        # PHASE 2: Bulk Open-Meteo elevation for ALL points (free, 1 HTTP call)
        # ====================================================================
        point_coords = [(lat, lon) for (lat, lon, _) in point_targets]
        om_results = await open_meteo_service.fetch_elevations_bulk(point_coords)
        if not isinstance(om_results, list):
            om_results = []

        # ====================================================================
        # PHASE 3: NBI bridge lookup for ALL points (local SQLite, instant)
        # ====================================================================
        nbi_results = []
        for lat, lon, _ in point_targets:
            nbi_results.append(nbi_service.get_nearby_bridges(lat, lon, radius_m=300.0))

        # ====================================================================
        # PHASE 4: Compute slopes + Select 4 critical points for Mireye
        # ====================================================================
        # Build elevation array and compute slopes
        elevations = []
        for idx in range(len(point_targets)):
            om_data = om_results[idx] if idx < len(om_results) and isinstance(om_results[idx], dict) else None
            elev = om_data.get("elevation_m") if om_data else None
            elevations.append(elev)

        slopes = [None] * len(point_targets)
        for idx in range(1, len(point_targets)):
            elev_prev = elevations[idx - 1]
            elev_curr = elevations[idx]
            if elev_prev is not None and elev_curr is not None:
                dist_between = point_targets[idx][2] - point_targets[idx - 1][2]
                if dist_between > 0:
                    slopes[idx] = round(((elev_curr - elev_prev) / dist_between) * 100.0, 2)

        # Smart critical point selection
        critical_indices = self._select_critical_points(
            point_targets, nbi_results, elevations, slopes
        )

        logger.info(
            f"Route {route_id}: Selected {len(critical_indices)} critical points "
            f"for Mireye deep probe at indices {list(critical_indices)}"
        )

        # ====================================================================
        # PHASE 5: Fire exactly N Mireye /v1/fetch calls on critical points
        # ====================================================================
        semaphore = asyncio.Semaphore(4)
        mireye_results = {}

        async def fetch_mireye(idx: int, lat: float, lon: float):
            async with semaphore:
                result = await mireye_data_service.fetch_location_facts(lat, lon, preset="natural_hazard")
                return idx, result

        mireye_tasks = [
            fetch_mireye(idx, point_targets[idx][0], point_targets[idx][1])
            for idx in critical_indices
        ]
        if mireye_tasks:
            results = await asyncio.gather(*mireye_tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, tuple):
                    idx, data = r
                    if isinstance(data, dict):
                        mireye_results[idx] = data

        # ====================================================================
        # PHASE 6: Construct RouteSample objects
        # ====================================================================
        samples: List[RouteSample] = []
        for idx, (lat, lon, dist_m) in enumerate(point_targets):
            sample_id = f"{route_id}_sample_{idx + 1:03d}"
            is_probed = idx in critical_indices

            # Start with Open-Meteo data
            facts = {}
            om_data = om_results[idx] if idx < len(om_results) and isinstance(om_results[idx], dict) else None
            if om_data and "elevation_m" in om_data:
                facts["elevation_m"] = om_data["elevation_m"]
                facts["elevation_source"] = om_data["elevation_source"]

            # Merge Mireye data if this point was probed
            if idx in mireye_results:
                m_facts = mireye_results[idx]
                if isinstance(m_facts, dict):
                    # Mireye elevation overrides Open-Meteo if available
                    for key, val in m_facts.items():
                        if key == "elevation_m" and val is not None:
                            facts["elevation_m"] = val
                            facts["elevation_source"] = m_facts.get("elevation_source", facts.get("elevation_source"))
                        elif key not in facts or facts[key] is None:
                            facts[key] = val
                        else:
                            facts[key] = val

            samples.append(
                RouteSample(
                    sample_id=sample_id,
                    route_id=route_id,
                    latitude=lat,
                    longitude=lon,
                    distance_from_origin_m=dist_m,
                    nbi_bridges=nbi_results[idx] if nbi_results[idx] else None,
                    mireye_data=facts if facts else None,
                    slope_pct=slopes[idx],
                    is_mireye_probed=is_probed
                )
            )

        return samples

    def _select_critical_points(
        self,
        point_targets: List[Tuple[float, float, float]],
        nbi_results: List[list],
        elevations: List[float],
        slopes: List[float]
    ) -> Set[int]:
        """
        Select up to MAX_MIREYE_PROBES critical indices for Mireye deep probing.
        Selection criteria:
        1. Worst NBI bridge condition (most vulnerable bridge nearby)
        2. Steepest absolute slope change (landslide / terrain difficulty)
        3. Lowest absolute elevation (flood plain risk)
        4. Route midpoint (general area coverage)
        """
        n = len(point_targets)
        if n == 0:
            return set()
        if n <= MAX_MIREYE_PROBES:
            return set(range(n))

        selected: Set[int] = set()

        # 1. Worst bridge condition
        worst_bridge_idx = None
        worst_bridge_score = -1.0
        for idx, bridges in enumerate(nbi_results):
            if not bridges:
                continue
            for b in bridges:
                deck = str(b.get("deck_condition", "")).strip()
                score = 0.0
                if deck.isdigit():
                    score = 10.0 - float(deck)  # Lower condition = higher score
                age = b.get("age_years")
                if age and age > 50:
                    score += 2.0
                if score > worst_bridge_score:
                    worst_bridge_score = score
                    worst_bridge_idx = idx
        if worst_bridge_idx is not None:
            selected.add(worst_bridge_idx)

        # 2. Steepest absolute slope
        steepest_idx = None
        steepest_val = 0.0
        for idx, s in enumerate(slopes):
            if s is not None and abs(s) > steepest_val and idx not in selected:
                steepest_val = abs(s)
                steepest_idx = idx
        if steepest_idx is not None:
            selected.add(steepest_idx)

        # 3. Lowest elevation (flood plain)
        lowest_idx = None
        lowest_elev = float('inf')
        for idx, e in enumerate(elevations):
            if e is not None and e < lowest_elev and idx not in selected:
                lowest_elev = e
                lowest_idx = idx
        if lowest_idx is not None:
            selected.add(lowest_idx)

        # 4. Midpoint of route
        mid_idx = n // 2
        if mid_idx not in selected:
            selected.add(mid_idx)

        # Fill remaining slots if we have fewer than MAX_MIREYE_PROBES
        # Use next-steepest slopes or next-worst bridges
        remaining_candidates = []
        for idx in range(n):
            if idx not in selected:
                score = 0.0
                if slopes[idx] is not None:
                    score += abs(slopes[idx])
                if nbi_results[idx]:
                    score += 3.0
                remaining_candidates.append((score, idx))
        remaining_candidates.sort(reverse=True)

        for score, idx in remaining_candidates:
            if len(selected) >= MAX_MIREYE_PROBES:
                break
            selected.add(idx)

        return selected

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
