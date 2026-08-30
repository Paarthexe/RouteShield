import logging
from typing import List
from app.models.route_models import (
    ZoneDefinition,
    Coordinate,
    ZoneAssignment,
    ZoneEvacuationRequest,
    ZoneEvacuationResponse
)
from app.services.routing import routing_service
from app.utils.geo import haversine_distance

logger = logging.getLogger(__name__)

class ZoneService:
    async def plan_zone_evacuation(self, request: ZoneEvacuationRequest) -> ZoneEvacuationResponse:
        """
        Plan and optimize multi-origin zone evacuation assignments to candidate staging destinations.
        """
        zones = request.zones or []
        destinations = request.destinations or []
        labels = request.destination_labels or []

        assignments: List[ZoneAssignment] = []
        total_pop = sum(z.estimated_population or 2500 for z in zones)
        max_time = 0.0

        for i, zone in enumerate(zones):
            # Find closest/most viable destination for this zone
            best_dest = None
            best_label = "Evacuation Hub"
            min_dist = float("inf")

            for j, dest in enumerate(destinations):
                dist = haversine_distance(zone.center.latitude, zone.center.longitude, dest.latitude, dest.longitude)
                if dist < min_dist:
                    min_dist = dist
                    best_dest = dest
                    best_label = labels[j] if j < len(labels) else f"Destination {j+1}"

            if not best_dest and destinations:
                best_dest = destinations[0]
                best_label = labels[0] if labels else "Primary Staging Area"

            dist_km = round(min_dist / 1000.0, 1) if min_dist != float("inf") else 25.0
            time_min = round(dist_km * 1.35 + 15.0, 1)
            viability = max(55.0, min(95.0, 100.0 - (dist_km * 0.4)))

            if time_min > max_time:
                max_time = time_min

            assignments.append(ZoneAssignment(
                zone_id=zone.zone_id or f"Zone {i+1}",
                destination_label=best_label,
                destination=best_dest or Coordinate(latitude=0.0, longitude=0.0),
                route_id=f"corridor_zone_{i+1}",
                viability_score=viability,
                travel_time_min=time_min,
                distance_km=dist_km
            ))

        return ZoneEvacuationResponse(
            assignments=assignments,
            total_affected_population=total_pop,
            total_clearance_time_min=round(max_time + 40.0, 1),
            disaster_type=request.disaster_type or "ALL_HAZARDS"
        )

zone_service = ZoneService()
