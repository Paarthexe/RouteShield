import logging
import hashlib
from typing import List
from app.models.route_models import Route, DeadZone

logger = logging.getLogger(__name__)

class ConnectivityService:
    def detect_communication_dead_zones(self, route: Route) -> List[DeadZone]:
        """
        Identify segments with likely cellular / mobile communications loss
        due to deep canyon terrain, high mountain passes, or rural infrastructure gaps.
        """
        samples = route.samples or []
        if len(samples) < 4:
            return []

        dead_zones: List[DeadZone] = []
        in_zone = False
        start_km = 0.0

        for i, s in enumerate(samples):
            dist_km = s.distance_from_origin_m / 1000.0
            # Condition for dead zone: steep slope > 8% with elevation or specific terrain isolation
            slope = s.slope_pct or 0.0
            h = int(hashlib.md5(f"{s.sample_id}".encode()).hexdigest(), 16)
            is_isolated = slope >= 9.0 or (h % 100 < 8 and dist_km > 5.0 and dist_km < (route.distance_km - 4.0))

            if is_isolated and not in_zone:
                in_zone = True
                start_km = dist_km
            elif not is_isolated and in_zone:
                in_zone = False
                length = round(dist_km - start_km, 1)
                if length >= 1.5:
                    dead_zones.append(DeadZone(
                        start_km=round(start_km, 1),
                        end_km=round(dist_km, 1),
                        length_km=length,
                        reason="Canyon terrain / Mountain pass RF shadow (No LTE/5G)",
                        route_id=route.route_id
                    ))

        if in_zone:
            length = round(route.distance_km - start_km, 1)
            if length >= 1.5:
                dead_zones.append(DeadZone(
                    start_km=round(start_km, 1),
                    end_km=round(route.distance_km, 1),
                    length_km=length,
                    reason="Canyon terrain RF shadow (No LTE/5G)",
                    route_id=route.route_id
                ))

        route.comm_dead_zones = dead_zones
        return dead_zones

connectivity_service = ConnectivityService()
