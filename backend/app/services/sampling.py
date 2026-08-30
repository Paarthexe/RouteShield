import logging
import asyncio
from typing import List, Tuple, Set, Dict, Any, Optional
from app.models.route_models import GeoJSONLineString, RouteSample, HazardBarrier
from app.utils.geo import haversine_distance, interpolate_coordinate
from app.services.nbi_service import nbi_service
from app.services.mireye_service import mireye_data_service
from app.services.open_meteo_service import open_meteo_service
from app.config import settings

logger = logging.getLogger(__name__)


class SamplingService:
    async def sample_route(
        self,
        route_id: str,
        geometry: GeoJSONLineString,
        interval_m: float = 500.0,
        disaster_type: str = "ALL_HAZARDS",
        hazard_barriers: Optional[List[HazardBarrier]] = None
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

            is_blocked = False
            if hazard_barriers:
                for b in hazard_barriers:
                    if haversine_distance(lat, lon, b.latitude, b.longitude) <= b.radius_m:
                        is_blocked = True
                        break

            return [
                RouteSample(
                    sample_id=f"{route_id}_sample_001",
                    route_id=route_id,
                    latitude=lat,
                    longitude=lon,
                    distance_from_origin_m=0.0,
                    nbi_bridges=nbi_service.get_nearby_bridges(lat, lon, radius_m=300.0),
                    mireye_data=combined_facts if combined_facts else None,
                    is_mireye_probed=False,
                    is_barrier_blocked=is_blocked
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
        # PHASE 4: Compute slopes + Select critical points for Mireye
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
                    raw_slope = ((elev_curr - elev_prev) / dist_between) * 100.0
                    # Clamp unrealistic single-point DEM elevation jumps (cap at ±30% grade)
                    slopes[idx] = round(max(-30.0, min(30.0, raw_slope)), 2)

        # Smart critical point selection tailored to disaster type
        critical_indices = self._select_critical_points(
            point_targets, nbi_results, elevations, slopes, disaster_type=disaster_type
        )

        logger.info(
            f"Route {route_id} [{disaster_type}]: Selected {len(critical_indices)} critical points "
            f"for Mireye deep probe at indices {list(critical_indices)}"
        )

        # ====================================================================
        # PHASE 5: Mireye /v1/fetch on critical points (disaster-aware strategy)
        # ====================================================================
        semaphore = asyncio.Semaphore(settings.MIREYE_MAX_CONCURRENCY)
        mireye_results = {}

        # Identify which critical points are low-elevation (flood candidates)
        low_elev_indices = {
            idx for idx in critical_indices
            if elevations[idx] is not None and elevations[idx] < 50.0
        }

        async def fetch_mireye(idx: int, lat: float, lon: float, preset: str):
            async with semaphore:
                result = await mireye_data_service.fetch_location_facts(lat, lon, preset=preset)
                return idx, result

        # Primary: natural_hazard preset for critical points
        mireye_tasks = [
            fetch_mireye(idx, point_targets[idx][0], point_targets[idx][1], "natural_hazard")
            for idx in critical_indices
        ]
        # Secondary: flood_risk preset for low-elevation points
        flood_tasks = [
            fetch_mireye(idx, point_targets[idx][0], point_targets[idx][1], "flood_risk")
            for idx in low_elev_indices
        ]

        all_tasks = mireye_tasks + flood_tasks
        if all_tasks:
            results = await asyncio.gather(*all_tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, tuple):
                    idx, data = r
                    if isinstance(data, dict):
                        if idx not in mireye_results:
                            mireye_results[idx] = data
                        else:
                            for key, val in data.items():
                                if key not in ("lat", "lng", "fetched_at") and val is not None:
                                    mireye_results[idx][key] = val

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
                    for key, val in m_facts.items():
                        if key == "elevation_m" and val is not None:
                            facts["elevation_m"] = val
                            facts["elevation_source"] = m_facts.get("elevation_source", facts.get("elevation_source"))
                        elif key not in facts or facts[key] is None:
                            facts[key] = val
                        else:
                            facts[key] = val

            # Check if this point intersects any active hazard barrier
            is_blocked = False
            if hazard_barriers:
                for b in hazard_barriers:
                    dist_to_b = haversine_distance(lat, lon, b.latitude, b.longitude)
                    if dist_to_b <= b.radius_m:
                        is_blocked = True
                        break

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
                    is_mireye_probed=is_probed,
                    is_barrier_blocked=is_blocked
                )
            )

        return samples

    def _select_critical_points(
        self,
        point_targets: List[Tuple[float, float, float]],
        nbi_results: List[List[Dict[str, Any]]],
        elevations: List[Optional[float]],
        slopes: List[Optional[float]],
        disaster_type: str = "ALL_HAZARDS"
    ) -> Set[int]:
        """
        Select up to the configured maximum critical indices for Mireye deep probing.
        Selection criteria:
        1. Worst NBI bridge condition (most vulnerable bridge nearby)
        2. Steepest absolute slope change (landslide / terrain difficulty)
        3. Lowest absolute elevation (flood plain risk)
        4. Route midpoint (general area coverage)
        """
        n = len(point_targets)
        if n == 0:
            return set()
        max_probes = max(1, settings.MIREYE_MAX_PROBES)
        if n <= max_probes:
            return set(range(n))

        selected: Set[int] = set()


        def is_too_close(candidate: int, min_gap: int = 2) -> bool:
            return any(abs(candidate - s) < min_gap for s in selected)

        # 1. Worst bridge condition (prioritized heavily in EARTHQUAKE or ALL_HAZARDS)
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
                if b.get("structurally_deficient"):
                    score += 4.0
                age = b.get("age_years")
                if age and age > 50:
                    score += 2.0
                if score > worst_bridge_score:
                    worst_bridge_score = score
                    worst_bridge_idx = idx
        if worst_bridge_idx is not None and not is_too_close(worst_bridge_idx):
            selected.add(worst_bridge_idx)

        # 2. Steepest slope (prioritized heavily in LANDSLIDE or WILDFIRE)
        steepest_idx = None
        steepest_val = 0.0
        for idx, s in enumerate(slopes):
            if s is not None and abs(s) > steepest_val and idx not in selected:
                if not is_too_close(idx):
                    steepest_val = abs(s)
                    steepest_idx = idx
        if steepest_idx is not None:
            selected.add(steepest_idx)

        # 3. Lowest elevation / flood plain (prioritized heavily in FLOOD_HURRICANE)
        lowest_idx = None
        lowest_elev = float('inf')
        for idx, e in enumerate(elevations):
            if e is not None and e < lowest_elev and idx not in selected:
                if not is_too_close(idx):
                    lowest_elev = e
                    lowest_idx = idx
        if lowest_idx is not None:
            selected.add(lowest_idx)

        # 4. Route Waypoints (Quarter points & Midpoint)
        for frac in [0.25, 0.50, 0.75]:
            q_idx = int(n * frac)
            if q_idx not in selected and not is_too_close(q_idx, min_gap=1):
                selected.add(q_idx)

        # 5. Top pre-BSI estimate tailored to disaster type
        pre_bsi_scores = []
        for idx in range(n):
            if idx in selected:
                continue

            # Bridge vulnerability heuristic
            bridges = nbi_results[idx] or []
            b_vuln = 0.0
            for b in bridges:
                deck = str(b.get("deck_condition", "")).strip()
                if deck.isdigit():
                    cond = float(deck)
                    if cond <= 4 or b.get("structurally_deficient"):
                        b_vuln = max(b_vuln, 1.8)
                    elif cond <= 6:
                        b_vuln = max(b_vuln, 0.7)

            # Terrain penalty heuristic
            s = slopes[idx]
            abs_s = abs(s) if s is not None else 0.0
            t_pen = 1.7 if abs_s > 18 else (1.4 if abs_s > 10 else (1.15 if abs_s > 6 else 1.0))

            # Elevation flood risk heuristic
            e = elevations[idx]
            elev_risk = 0.25 if (e is not None and e < 4) else (0.15 if (e is not None and e < 15) else 0.05)

            # Disaster mode weight weighting
            if disaster_type == "FLOOD_HURRICANE":
                pre_bsi = (elev_risk * 2.0) * (1.0 + b_vuln * 1.5) * t_pen
            elif disaster_type == "EARTHQUAKE":
                pre_bsi = 0.15 * (1.0 + b_vuln * 2.5) * t_pen
            elif disaster_type == "LANDSLIDE":
                pre_bsi = (abs_s / 20.0) * (1.0 + b_vuln) * (t_pen * 2.0)
            elif disaster_type == "WILDFIRE":
                pre_bsi = 0.20 * (1.0 + b_vuln) * (t_pen * 1.5)
            else:
                pre_bsi = elev_risk * (1.0 + b_vuln) * t_pen

            pre_bsi_scores.append((pre_bsi, idx))

        pre_bsi_scores.sort(reverse=True)
        for pre_bsi, idx in pre_bsi_scores:
            if len(selected) >= max_probes:
                break
            if not is_too_close(idx, min_gap=1):
                selected.add(idx)

        # Fill remaining slots up to max_probes
        for pre_bsi, idx in pre_bsi_scores:
            if len(selected) >= max_probes:
                break
            selected.add(idx)

        # Respect a lower configured budget without ever exceeding it.
        return set(sorted(selected)[:max_probes])

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
