import logging
import math
import hashlib
from typing import List, Dict, Any, Tuple, Optional
from app.models.route_models import (
    Route,
    RoadCapacitySummary,
    CapacityAnalysis,
    GeoJSONLineString
)
from app.utils.geo import haversine_distance

logger = logging.getLogger(__name__)

# Standard lane capacities (vehicles/hour/lane)
HIGHWAY_CLASS_CAPACITY = {
    "motorway": {"lanes": 4, "cap_per_lane": 1800, "name": "Interstate / Motorway"},
    "trunk": {"lanes": 3, "cap_per_lane": 1500, "name": "Divided Highway / Trunk"},
    "primary": {"lanes": 2, "cap_per_lane": 1200, "name": "Primary State Route"},
    "secondary": {"lanes": 2, "cap_per_lane": 900, "name": "Secondary Arterial"},
    "tertiary": {"lanes": 2, "cap_per_lane": 650, "name": "Tertiary Collector"},
    "residential": {"lanes": 1, "cap_per_lane": 450, "name": "Local Road"}
}

class CapacityService:
    def analyze_route_road_capacity(self, route: Route) -> RoadCapacitySummary:
        """Analyze road types, lane counts, and bottleneck choke points along the route."""
        coords = route.geometry.coordinates if route.geometry else []
        if not coords or len(coords) < 2:
            return RoadCapacitySummary()

        # Deterministic road classification simulation along route segments based on coordinate seeds
        h = int(hashlib.md5(route.route_id.encode()).hexdigest(), 16)
        
        # Route 1 tends to favor primary/motorway, Route 2/3 more arterial/secondary
        r_num = int(route.route_id.replace("route_", "")) if "route_" in route.route_id else 1
        
        if r_num == 1:
            class_weights = {"motorway": 0.55, "primary": 0.35, "secondary": 0.10}
            avg_lanes = 3.2
            min_lanes = 2
        elif r_num == 2:
            class_weights = {"primary": 0.50, "trunk": 0.30, "secondary": 0.20}
            avg_lanes = 2.6
            min_lanes = 2
        else:
            class_weights = {"primary": 0.40, "secondary": 0.40, "tertiary": 0.20}
            avg_lanes = 2.0
            min_lanes = 1

        # Calculate estimated hourly vehicle capacity
        hourly_capacity = int(sum(
            weight * HIGHWAY_CLASS_CAPACITY[k]["cap_per_lane"] * HIGHWAY_CLASS_CAPACITY[k]["lanes"]
            for k, weight in class_weights.items()
        ))

        # Identify any narrow choke sections (e.g. lane reduction at bridges/mountain passes)
        chokepoints = []
        if min_lanes == 1 or (h % 3 == 0):
            chokepoint_km = round(route.distance_km * 0.42, 1)
            chokepoints.append({
                "location_km": chokepoint_km,
                "lane_drop": f"{int(avg_lanes)} lanes → 1 lane",
                "reason": "Bridge throat / 2-lane mountain pass restriction",
                "capacity_impact_pct": -45
            })

        return RoadCapacitySummary(
            avg_lanes=round(avg_lanes, 1),
            min_lanes=min_lanes,
            estimated_throughput_veh_hr=hourly_capacity,
            chokepoints=chokepoints,
            road_class_breakdown=class_weights
        )

    def analyze_network_capacity(self, routes: List[Route]) -> CapacityAnalysis:
        """
        Analyze multi-corridor capacity conflicts, shared segments,
        and contraflow candidate sections across all viable routes.
        """
        if not routes:
            return CapacityAnalysis()

        viable_routes = [r for r in routes if not (r.viability and r.viability.status == "REJECTED")]
        if not viable_routes:
            viable_routes = routes[:2]

        per_route_capacity: Dict[str, int] = {}
        for r in routes:
            cap = self.analyze_route_road_capacity(r)
            r.road_capacity = cap
            per_route_capacity[r.route_id] = cap.estimated_throughput_veh_hr

        # Detect shared segments between routes
        shared_conflicts = []
        contraflow_candidates = []

        for i in range(len(viable_routes)):
            for j in range(i + 1, len(viable_routes)):
                r1 = viable_routes[i]
                r2 = viable_routes[j]
                overlap_m = self._calculate_geometry_overlap_m(r1.geometry, r2.geometry)
                overlap_pct = round((overlap_m / max(1.0, r1.distance_m)) * 100.0, 1)

                if overlap_pct >= 20.0:
                    shared_conflicts.append({
                        "routes": [r1.route_id, r2.route_id],
                        "shared_distance_km": round(overlap_m / 1000.0, 1),
                        "overlap_pct": overlap_pct,
                        "conflict_description": f"Shared {round(overlap_m/1000.0, 1)}km trunk corridor limits aggregate outflow."
                    })

        # Identify contraflow candidates on primary route
        primary_route = viable_routes[0] if viable_routes else None
        if primary_route and primary_route.road_capacity and primary_route.road_capacity.avg_lanes >= 2.0:
            contraflow_gain_veh_hr = int(primary_route.road_capacity.estimated_throughput_veh_hr * 0.75)
            contraflow_candidates.append({
                "route_id": primary_route.route_id,
                "segment_name": f"Outbound Arterial Corridor ({primary_route.distance_km} km)",
                "reversible_lanes": 2,
                "current_throughput_veh_hr": primary_route.road_capacity.estimated_throughput_veh_hr,
                "contraflow_throughput_veh_hr": primary_route.road_capacity.estimated_throughput_veh_hr + contraflow_gain_veh_hr,
                "throughput_gain_pct": 75,
                "implementation_recommendation": "Deploy Highway Patrol / DOT pilot cars to reverse inbound lanes."
            })

        total_system_veh = sum(per_route_capacity.get(r.route_id, 0) for r in viable_routes)

        return CapacityAnalysis(
            total_system_throughput_veh_hr=total_system_veh,
            shared_segment_conflicts=shared_conflicts,
            contraflow_candidates=contraflow_candidates,
            per_route_capacity=per_route_capacity
        )

    def _calculate_geometry_overlap_m(self, g1: GeoJSONLineString, g2: GeoJSONLineString) -> float:
        if not g1 or not g2 or not g1.coordinates or not g2.coordinates:
            return 0.0
        c1 = g1.coordinates
        c2 = g2.coordinates

        overlap_count = 0
        for p1 in c1:
            for p2 in c2:
                d = haversine_distance(p1[1], p1[0], p2[1], p2[0])
                if d < 120.0:  # within 120m considered same road corridor
                    overlap_count += 1
                    break

        frac = overlap_count / max(1, len(c1))
        # Approximate distance
        return frac * len(c1) * 300.0

capacity_service = CapacityService()
