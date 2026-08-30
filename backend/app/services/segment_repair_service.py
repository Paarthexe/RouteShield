import logging
import math
import httpx
from typing import Optional, List, Tuple
from fastapi import HTTPException
from app.config import settings
from app.models.route_models import (
    Route,
    RouteSegment,
    GeoJSONLineString,
    Coordinate,
    SegmentRepairDiff,
    SegmentRepairResponse,
)
from app.services.sampling import sampling_service
from app.services.bottleneck_service import analyze_route_bottlenecks
from app.services.viability_service import assess_route_viability
from app.services.segmentation_service import segmentation_service

logger = logging.getLogger(__name__)


class SegmentRepairService:
    def __init__(self):
        self.osrm_base_url = settings.OSRM_BASE_URL.rstrip("/")
        self.timeout = settings.HTTP_TIMEOUT_S

    async def repair_segment(
        self,
        route: Route,
        segment_id: str,
        action: str = "auto_repair",
        avoid_coordinate: Optional[Coordinate] = None,
        disaster_type: str = "ALL_HAZARDS",
        fastest_duration_s: Optional[float] = None
    ) -> SegmentRepairResponse:
        """
        Locally repair a single flagged segment without discarding the rest of the corridor.
        Splices new geometry into the route, re-runs sampling/scoring, and generates a diff summary.
        """
        segments = route.segments or segmentation_service.segment_route(route)
        target_seg = next((s for s in segments if s.segment_id == segment_id), None)

        if not target_seg:
            raise HTTPException(
                status_code=404,
                detail=f"Segment '{segment_id}' not found on corridor {route.route_id}"
            )

        orig_dist_km = route.distance_km
        orig_time_min = route.travel_time_min
        orig_viability = route.viability.score if route.viability else (route.viability_score or 50.0)
        orig_critical_bns = route.viability.critical_bottleneck_count if route.viability else sum(
            1 for b in route.bottlenecks if b.severity_label == "Critical"
        )

        start_lon, start_lat = target_seg.start_coord
        end_lon, end_lat = target_seg.end_coord

        # Find replacement sub-path
        replacement_coords, subpath_dur_s, subpath_dist_m = await self._query_subpath(
            start_coord=(start_lon, start_lat),
            end_coord=(end_lon, end_lat),
            avoid_coord=avoid_coordinate,
            action=action
        )

        # Splice the new coordinates into the route geometry
        coords = list(route.geometry.coordinates)
        seg_start_idx = -1
        seg_end_idx = -1

        # Match coordinates to find slice bounds
        for idx, (c_lon, c_lat) in enumerate(coords):
            if math.hypot(c_lon - start_lon, c_lat - start_lat) < 1e-4 and seg_start_idx == -1:
                seg_start_idx = idx
            if math.hypot(c_lon - end_lon, c_lat - end_lat) < 1e-4 and idx >= seg_start_idx:
                seg_end_idx = idx

        if seg_start_idx == -1:
            seg_start_idx = 0
        if seg_end_idx == -1:
            seg_end_idx = len(coords) - 1

        prefix_coords = coords[:seg_start_idx]
        suffix_coords = coords[seg_end_idx + 1 :]
        spliced_coords = prefix_coords + replacement_coords + suffix_coords

        if len(spliced_coords) < 2:
            spliced_coords = coords

        new_geometry = GeoJSONLineString(type="LineString", coordinates=spliced_coords)

        # Calculate prefix and suffix distances to preserve accurate speeds on unaffected segments
        def _calc_dist_m(pts: List[Any]) -> float:
            tot = 0.0
            for k in range(len(pts) - 1):
                p1 = pts[k]
                p2 = pts[k + 1]
                dx = (p2[0] - p1[0]) * math.cos(math.radians((p1[1] + p2[1]) / 2.0)) * 111320.0
                dy = (p2[1] - p1[1]) * 110540.0
                tot += math.hypot(dx, dy)
            return tot

        orig_dist_m = route.distance_m or (orig_dist_km * 1000.0)
        orig_dur_s = route.duration_s or (orig_time_min * 60.0)
        orig_speed_mps = orig_dist_m / max(1.0, orig_dur_s)

        prefix_dist_m = _calc_dist_m(prefix_coords) if len(prefix_coords) >= 2 else 0.0
        suffix_dist_m = _calc_dist_m(suffix_coords) if len(suffix_coords) >= 2 else 0.0

        prefix_dur_s = prefix_dist_m / orig_speed_mps if prefix_dist_m > 0 else 0.0
        suffix_dur_s = suffix_dist_m / orig_speed_mps if suffix_dist_m > 0 else 0.0

        tot_dist_m = prefix_dist_m + subpath_dist_m + suffix_dist_m
        dur_s = prefix_dur_s + subpath_dur_s + suffix_dur_s

        route.geometry = new_geometry
        route.distance_m = round(tot_dist_m, 1)
        route.duration_s = round(dur_s, 1)
        route.distance_km = round(tot_dist_m / 1000.0, 2)
        route.travel_time_min = round(dur_s / 60.0, 1)

        # Re-sample route
        interval = settings.ROUTE_SAMPLE_INTERVAL_M
        new_samples = await sampling_service.sample_route(
            route_id=route.route_id,
            geometry=new_geometry,
            interval_m=interval,
            disaster_type=disaster_type
        )
        route.samples = new_samples

        # Re-run bottleneck analysis
        _, route = analyze_route_bottlenecks(route, disaster_type=disaster_type)

        # Re-assess viability
        ref_fastest = fastest_duration_s or route.duration_s
        assess_route_viability(route, ref_fastest)

        # Re-segment
        new_segments = segmentation_service.segment_route(route)
        for s in new_segments:
            if s.segment_id == segment_id or s.segment_index == target_seg.segment_index:
                s.status = "REPAIRED"
                s.description = f"Repaired Segment {s.segment_index} ({s.distance_km} km, {s.travel_time_min} min) — Local bypass spliced"
        route.segments = new_segments

        new_crit_bns = route.viability.critical_bottleneck_count if route.viability else 0
        new_score = route.viability.score if route.viability else 50.0

        # Construct diff summary
        time_change = round(route.travel_time_min - orig_time_min, 1)
        score_change = round(new_score - orig_viability, 1)
        bns_reduced = orig_critical_bns - new_crit_bns

        time_str = f"+{time_change} min" if time_change >= 0 else f"{time_change} min"
        score_str = f"+{score_change}" if score_change >= 0 else f"{score_change}"

        summary = (
            f"Repaired Segment {target_seg.segment_index} of {len(new_segments)}: "
            f"Bypass spliced ({time_str} travel time). "
            f"Viability score shifted {score_str} (now {new_score:.0f}/100) with "
            f"{new_crit_bns} critical bottlenecks remaining ({bns_reduced:+d} change)."
        )

        diff = SegmentRepairDiff(
            segment_id=segment_id,
            original_distance_km=orig_dist_km,
            new_distance_km=route.distance_km,
            original_travel_time_min=orig_time_min,
            new_travel_time_min=route.travel_time_min,
            original_viability_score=orig_viability,
            new_viability_score=new_score,
            original_critical_bottlenecks=orig_critical_bns,
            new_critical_bottlenecks=new_crit_bns,
            summary=summary
        )

        logger.info(f"Segment Repair [{segment_id}]: {summary}")

        return SegmentRepairResponse(
            success=True,
            route=route,
            repaired_segment_id=segment_id,
            diff=diff
        )

    async def _query_subpath(
        self,
        start_coord: Tuple[float, float],
        end_coord: Tuple[float, float],
        avoid_coord: Optional[Coordinate] = None,
        action: str = "auto_repair"
    ) -> Tuple[List[Tuple[float, float]], float, float]:
        """Query OSRM for an alternative sub-path with lateral bypass. Returns (coords, duration_s, distance_m)."""
        lon1, lat1 = start_coord
        lon2, lat2 = end_coord

        d_lat = lat2 - lat1
        d_lon = lon2 - lon1
        direct_dist = math.hypot(d_lat, d_lon)
        approx_dist_m = direct_dist * 111320.0 * 1.15
        approx_dur_s = approx_dist_m / 16.6

        # Calculate a perpendicular bypass anchor point
        if avoid_coord:
            # Shift away from the avoided point
            v_x = avoid_coord.longitude - (lon1 + lon2) / 2.0
            v_y = avoid_coord.latitude - (lat1 + lat2) / 2.0
            v_len = math.hypot(v_x, v_y)
            if v_len > 1e-5:
                # Push anchor in opposite direction
                anchor_lon = (lon1 + lon2) / 2.0 - (v_x / v_len) * max(0.01, direct_dist * 0.25)
                anchor_lat = (lat1 + lat2) / 2.0 - (v_y / v_len) * max(0.01, direct_dist * 0.25)
            else:
                anchor_lon = (lon1 + lon2) / 2.0 - d_lat * 0.2
                anchor_lat = (lat1 + lat2) / 2.0 + d_lon * 0.2
        else:
            # Moderate lateral bypass anchor
            anchor_lon = (lon1 + lon2) / 2.0 - d_lat * 0.22
            anchor_lat = (lat1 + lat2) / 2.0 + d_lon * 0.22

        # Snap anchor to nearest road
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            snap_url = f"{self.osrm_base_url}/nearest/v1/driving/{anchor_lon:.5f},{anchor_lat:.5f}"
            w_lon, w_lat = anchor_lon, anchor_lat
            try:
                snap_res = await client.get(snap_url, params={"number": "1"})
                if snap_res.status_code == 200:
                    snap_data = snap_res.json()
                    wps = snap_data.get("waypoints", [])
                    if wps:
                        w_lon, w_lat = wps[0]["location"]
            except Exception as e:
                logger.debug(f"Anchor snap failed: {e}")

            # Route via bypass waypoint
            route_url = f"{self.osrm_base_url}/route/v1/driving/{lon1:.5f},{lat1:.5f};{w_lon:.5f},{w_lat:.5f};{lon2:.5f},{lat2:.5f}"
            try:
                resp = await client.get(route_url, params={
                    "overview": "full",
                    "geometries": "geojson",
                    "continue_straight": "true"
                })
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("code") == "Ok" and data.get("routes"):
                        cand = data["routes"][0]
                        coords = cand.get("geometry", {}).get("coordinates", [])
                        if coords and len(coords) >= 2:
                            subpath_dist = float(cand.get("distance", approx_dist_m))
                            subpath_dur = float(cand.get("duration", approx_dur_s))
                            return [tuple(c) for c in coords], subpath_dur, subpath_dist
            except Exception as e:
                logger.warning(f"OSRM subpath query failed: {e}")

        # Fallback: simple interpolated line
        return [start_coord, (w_lon, w_lat), end_coord], approx_dur_s, approx_dist_m


segment_repair_service = SegmentRepairService()
