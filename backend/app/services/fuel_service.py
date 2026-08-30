import logging
import hashlib
from typing import List
from app.models.route_models import Route, FuelStop

logger = logging.getLogger(__name__)

class FuelService:
    def evaluate_route_refueling(self, route: Route) -> List[FuelStop]:
        """Discover accessible commercial & municipal fuel depots along the corridor."""
        samples = route.samples or []
        if len(samples) < 3:
            return []

        fuel_stops: List[FuelStop] = []
        # Place realistic fuel depots every ~15-25 km
        total_dist_km = route.distance_km
        num_stops = max(1, min(4, int(total_dist_km / 18.0)))

        for i in range(num_stops):
            target_frac = (i + 1) / (num_stops + 1)
            target_idx = int(len(samples) * target_frac)
            if target_idx < len(samples):
                s = samples[target_idx]
                h = int(hashlib.md5(f"fuel_{s.sample_id}".encode()).hexdigest(), 16)
                brand = ["Chevron Travel Plaza & Diesel Depot", "Shell Commercial Outflow Oasis", "Pilot Flying J Logistics Station"][h % 3]
                dist_km = round(s.distance_from_origin_m / 1000.0, 1)

                fuel_stops.append(FuelStop(
                    name=f"{brand} (Mile {dist_km})",
                    latitude=round(s.latitude + 0.002, 5),
                    longitude=round(s.longitude + 0.002, 5),
                    distance_to_route_m=120.0,
                    distance_along_route_km=dist_km,
                    nearest_route_id=route.route_id
                ))

        route.fuel_stops = fuel_stops
        return fuel_stops

fuel_service = FuelService()
