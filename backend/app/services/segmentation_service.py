import logging
import math
from typing import List, Tuple
from app.models.route_models import Route, RouteSegment, GeoJSONLineString

logger = logging.getLogger(__name__)

# Target segment length in meters (~3km to 6km per decision block)
TARGET_SEGMENT_LENGTH_M = 4000.0


class SegmentationService:
    def segment_route(self, route: Route) -> List[RouteSegment]:
        """
        Break a candidate route into logical road corridor segments.
        Groups physical 500m samples and evaluates segment-level viability.
        """
        coords = route.geometry.coordinates
        samples = route.samples or []
        bottlenecks = route.bottlenecks or []
        total_dist_m = route.distance_m

        if not coords or len(coords) < 2:
            return []

        # If route is very short (< 5km), treat as single segment
        if total_dist_m <= TARGET_SEGMENT_LENGTH_M * 1.3:
            num_segments = 1
        else:
            num_segments = max(2, min(8, round(total_dist_m / TARGET_SEGMENT_LENGTH_M)))

        coords_per_segment = max(2, len(coords) // num_segments)
        segments: List[RouteSegment] = []

        for i in range(num_segments):
            start_idx = i * coords_per_segment
            if i == num_segments - 1:
                end_idx = len(coords) - 1
            else:
                end_idx = min(len(coords) - 1, (i + 1) * coords_per_segment)

            seg_coords = coords[start_idx : end_idx + 1]
            if len(seg_coords) < 2:
                continue

            # Calculate distance of this segment
            seg_dist_m = 0.0
            for k in range(len(seg_coords) - 1):
                p1 = seg_coords[k]
                p2 = seg_coords[k + 1]
                # Fast equirectangular distance approximation for consecutive vertices
                dx = (p2[0] - p1[0]) * math.cos(math.radians((p1[1] + p2[1]) / 2.0)) * 111320.0
                dy = (p2[1] - p1[1]) * 110540.0
                seg_dist_m += math.hypot(dx, dy)

            seg_dist_km = round(seg_dist_m / 1000.0, 2)
            seg_dur_s = (seg_dist_m / max(1.0, total_dist_m)) * route.duration_s
            seg_time_min = round(seg_dur_s / 60.0, 1)

            # Match samples to this segment based on coordinate index or bounding range
            # Fraction along route
            f_start = start_idx / max(1, len(coords) - 1)
            f_end = end_idx / max(1, len(coords) - 1)

            seg_samples = []
            for s in samples:
                s_frac = s.distance_from_origin_m / max(1.0, total_dist_m)
                if f_start - 0.02 <= s_frac <= f_end + 0.02 or (i == 0 and s_frac < f_start):
                    seg_samples.append(s)

            seg_sample_ids = [s.sample_id for s in seg_samples]

            # Match bottlenecks in this segment
            seg_bns = [bn for bn in bottlenecks if bn.sample_id in seg_sample_ids]
            bn_count = len(seg_bns)
            crit_count = sum(1 for bn in seg_bns if bn.severity_label == "Critical")
            max_bsi = max((bn.bsi_score for bn in seg_bns), default=0.0)

            avg_hazard = (
                sum((s.hazard_score or 0.0) for s in seg_samples) / max(1, len(seg_samples))
                if seg_samples else 0.0
            )

            # Determine Segment Status
            # A segment needs repair if it has critical bottlenecks (BSI >= 0.70) or severe hazard risk > 0.45
            status = "VIABLE"
            repair_reason = None
            if max_bsi >= 1.2 or crit_count >= 2:
                status = "NEEDS_REPAIR"
                repair_reason = f"Critical bottleneck cluster (Max BSI {max_bsi:.2f}, {crit_count} critical)"
            elif crit_count == 1:
                status = "NEEDS_REPAIR"
                repair_reason = f"Isolated critical bottleneck (BSI {max_bsi:.2f})"
            elif avg_hazard >= 0.40:
                status = "NEEDS_REPAIR"
                repair_reason = f"High hazard exposure (avg hazard {avg_hazard:.2f})"

            seg_id = f"{route.route_id}_seg_{i + 1}"
            start_coord = (seg_coords[0][0], seg_coords[0][1])
            end_coord = (seg_coords[-1][0], seg_coords[-1][1])

            desc = f"Corridor Segment {i + 1} ({seg_dist_km} km, {seg_time_min} min)"
            if status == "NEEDS_REPAIR":
                desc += f" — {repair_reason}"
            else:
                desc += " — Clear & Viable"

            segments.append(RouteSegment(
                segment_id=seg_id,
                segment_index=i + 1,
                start_coord=start_coord,
                end_coord=end_coord,
                geometry=GeoJSONLineString(type="LineString", coordinates=seg_coords),
                distance_m=round(seg_dist_m, 1),
                duration_s=round(seg_dur_s, 1),
                distance_km=seg_dist_km,
                travel_time_min=seg_time_min,
                sample_ids=seg_sample_ids,
                hazard_score=round(avg_hazard, 3),
                bottleneck_count=bn_count,
                critical_bottleneck_count=crit_count,
                max_bsi=round(max_bsi, 3),
                status=status,
                repair_reason=repair_reason,
                description=desc
            ))

        route.segments = segments
        return segments


segmentation_service = SegmentationService()
