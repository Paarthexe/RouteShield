import logging
import math
import httpx
from typing import List, Tuple, Dict, Any, Optional
from app.config import settings
from app.services.cache import cache_service

logger = logging.getLogger(__name__)

# Maximum perpendicular distance from route line to consider station accessible (1.5 km)
MAX_OFFSET_DISTANCE_M = 1500.0

# Refuel desert gap threshold (km)
REFUEL_DESERT_THRESHOLD_KM = 45.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def point_to_segment_distance(
    p_lat: float, p_lon: float,
    a_lat: float, a_lon: float,
    b_lat: float, b_lon: float
) -> Tuple[float, float]:
    """
    Compute perpendicular distance in meters from point P to line segment AB,
    and the projection fraction t along AB (clamped 0..1).
    Returns (distance_m, fraction_t).
    """
    # Flat-earth approximation in meters around segment A
    lat_mid = math.radians((a_lat + b_lat) / 2.0)
    m_per_deg_lat = 111132.954 - 559.822 * math.cos(2 * lat_mid)
    m_per_deg_lon = 111412.84 * math.cos(lat_mid)

    ax, ay = a_lon * m_per_deg_lon, a_lat * m_per_deg_lat
    bx, by = b_lon * m_per_deg_lon, b_lat * m_per_deg_lat
    px, py = p_lon * m_per_deg_lon, p_lat * m_per_deg_lat

    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy

    if seg_len_sq <= 1e-6:
        dist = math.hypot(px - ax, py - ay)
        return dist, 0.0

    t = ((px - ax) * dx + (py - ay) * dy) / seg_len_sq
    t_clamped = max(0.0, min(1.0, t))
    proj_x = ax + t_clamped * dx
    proj_y = ay + t_clamped * dy

    dist = math.hypot(px - proj_x, py - proj_y)
    return dist, t_clamped


class InfrastructureService:
    def __init__(self):
        self.overpass_mirrors = [
            "https://overpass-api.de/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
        ]
        self.timeout = 10.0

    async def fetch_regional_stations(
        self,
        all_routes_coords: List[List[List[float]]]
    ) -> List[Dict[str, Any]]:
        """
        Fetch gas and EV stations for the combined bounding box of all candidate routes in a single query.
        """
        all_lons = []
        all_lats = []
        for coords in all_routes_coords:
            for lon, lat in coords:
                all_lons.append(lon)
                all_lats.append(lat)

        if not all_lons or not all_lats:
            return []

        pad_deg = 0.035  # ~3.8 km padding
        min_lat = max(-90.0, min(all_lats) - pad_deg)
        max_lat = min(90.0, max(all_lats) + pad_deg)
        min_lon = max(-180.0, min(all_lons) - pad_deg)
        max_lon = min(180.0, max(all_lons) + pad_deg)

        cache_key = f"infra:refuel:region:{round(min_lat, 3)},{round(min_lon, 3)},{round(max_lat, 3)},{round(max_lon, 3)}"
        cached = cache_service.get(cache_key)
        if cached:
            return cached

        query = f"""
        [out:json][timeout:12];
        (
          node({min_lat},{min_lon},{max_lat},{max_lon})["amenity"="fuel"];
          node({min_lat},{min_lon},{max_lat},{max_lon})["amenity"="charging_station"];
        );
        out body 120;
        """

        headers = {"User-Agent": "RouteShield-Evacuation/1.0 (infrastructure-engine)"}
        raw_elements = []

        for mirror_url in self.overpass_mirrors:
            try:
                async with httpx.AsyncClient(timeout=self.timeout, headers=headers) as client:
                    resp = await client.post(mirror_url, data=query)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_elements = data.get("elements", [])
                        if raw_elements:
                            cache_service.set(cache_key, raw_elements)
                            return raw_elements
                    else:
                        logger.warning(f"Overpass mirror {mirror_url} returned status {resp.status_code}")
            except Exception as e:
                logger.warning(f"Overpass mirror {mirror_url} request failed: {e}")

        if raw_elements:
            cache_service.set(cache_key, raw_elements)
        return raw_elements

    async def fetch_corridor_refuel_hubs(
        self,
        geometry_coords: List[List[float]],
        total_distance_m: float
    ) -> Dict[str, Any]:
        """
        Fetch gas stations and EV fast chargers along a single corridor geometry.
        """
        elements = await self.fetch_regional_stations([geometry_coords])
        return self._filter_and_project_stations(elements, geometry_coords, total_distance_m)

    def project_stations_for_route(
        self,
        elements: List[Dict[str, Any]],
        geometry_coords: List[List[float]],
        total_distance_m: float
    ) -> Dict[str, Any]:
        """
        Public helper to project pre-fetched station elements onto a specific route.
        """
        return self._filter_and_project_stations(elements, geometry_coords, total_distance_m)

    def _filter_and_project_stations(
        self,
        elements: List[Dict[str, Any]],
        geometry_coords: List[List[float]],
        total_distance_m: float
    ) -> Dict[str, Any]:
        """
        Filter stations by perpendicular distance to route, categorize EV speed tiers (Fast vs Standard),
        track stall capacity, apply 150km EV buffer, and decouple gas viability penalty.
        """
        # Precompute cumulative distance along route coordinates
        cum_dist = [0.0]
        for i in range(len(geometry_coords) - 1):
            lon1, lat1 = geometry_coords[i]
            lon2, lat2 = geometry_coords[i + 1]
            seg_d = haversine_distance(lat1, lon1, lat2, lon2)
            cum_dist.append(cum_dist[-1] + seg_d)

        total_route_d = cum_dist[-1] if cum_dist[-1] > 0 else total_distance_m

        gas_stations = []
        ev_fast_stations = []
        ev_standard_stations = []

        for el in elements:
            s_lat = el.get("lat")
            s_lon = el.get("lon")
            if s_lat is None or s_lon is None:
                continue

            tags = el.get("tags", {})
            amenity = tags.get("amenity")
            brand = tags.get("brand") or tags.get("operator") or tags.get("network") or ""

            # Classify Gas vs EV Speed Tiers
            if amenity == "fuel":
                station_type = "gas"
                speed_tier = "gas"
                speed_label = "Gasoline / Diesel"
                est_charge_time = "3–5 min Refueling"
                power_label = "Standard Fuel"
                name = tags.get("name") or brand or "Gas Station"
                stalls = tags.get("capacity") or tags.get("pumps")
                stalls_display = f"{stalls} Pumps" if stalls else "Standard Station"
            else:
                # EV Station — Determine Speed Tier (Level 3 DC Fast vs Level 2 Standard AC)
                name = tags.get("name") or brand or "EV Charging Hub"
                name_lower = name.lower()
                brand_lower = brand.lower()

                is_fast = (
                    tags.get("fast_charge") in ["yes", "1"]
                    or any(k in tags for k in ["socket:type2_combo", "socket:tesla_supercharger", "socket:chademo", "socket:nacs"])
                    or any(kw in name_lower or kw in brand_lower for kw in ["supercharger", "electrify america", "evgo", "fast", "hyper", "high power"])
                )

                cap_val = tags.get("capacity")
                if is_fast:
                    station_type = "ev_fast"
                    speed_tier = "fast"
                    speed_label = "DC Fast Charger"
                    est_charge_time = "20–30 min (20-80%)"
                    power_label = "50–350 kW High-Power"
                    stalls_display = f"{cap_val} Fast Stalls" if cap_val else "Fast Charging Hub"
                else:
                    station_type = "ev_standard"
                    speed_tier = "standard"
                    speed_label = "Standard AC Charger"
                    est_charge_time = "6–8 hrs (Overnight / Shelter / Rescue)"
                    power_label = "7–22 kW AC Power"
                    stalls_display = f"{cap_val} AC Stalls" if cap_val else "Standard AC Hub"

            brand_display = brand if brand else name

            # Find closest segment on the route
            min_offset = float("inf")
            best_route_dist = 0.0

            for i in range(len(geometry_coords) - 1):
                lon1, lat1 = geometry_coords[i]
                lon2, lat2 = geometry_coords[i + 1]
                dist_m, t = point_to_segment_distance(s_lat, s_lon, lat1, lon1, lat2, lon2)
                if dist_m < min_offset:
                    min_offset = dist_m
                    seg_len = cum_dist[i + 1] - cum_dist[i]
                    best_route_dist = cum_dist[i] + t * seg_len

            # Check if within accessible corridor offset (1.5 km)
            if min_offset <= MAX_OFFSET_DISTANCE_M:
                station_item = {
                    "id": f"station_{el.get('id', len(gas_stations) + len(ev_fast_stations) + len(ev_standard_stations))}",
                    "name": name,
                    "brand": brand_display,
                    "station_type": station_type,
                    "speed_tier": speed_tier,
                    "speed_label": speed_label,
                    "est_charge_time": est_charge_time,
                    "power_label": power_label,
                    "stalls_display": stalls_display,
                    "latitude": s_lat,
                    "longitude": s_lon,
                    "distance_from_origin_km": round(best_route_dist / 1000.0, 1),
                    "offset_distance_m": round(min_offset, 0)
                }

                if station_type == "gas":
                    gas_stations.append(station_item)
                elif station_type == "ev_fast":
                    ev_fast_stations.append(station_item)
                else:
                    ev_standard_stations.append(station_item)

        # Sort stations by distance from origin
        gas_stations.sort(key=lambda s: s["distance_from_origin_km"])
        ev_fast_stations.sort(key=lambda s: s["distance_from_origin_km"])
        ev_standard_stations.sort(key=lambda s: s["distance_from_origin_km"])

        ev_all_chargers = ev_fast_stations + ev_standard_stations
        ev_all_chargers.sort(key=lambda s: s["distance_from_origin_km"])

        # Calculate max refuel gap for Gas and DC Fast EV
        max_gas_gap_km = self._calculate_max_gap(gas_stations, total_route_d)
        max_ev_fast_gap_km = self._calculate_max_gap(ev_fast_stations, total_route_d)

        # Desert warning calculation with 150 km EV range buffer
        warnings = []
        if max_gas_gap_km > REFUEL_DESERT_THRESHOLD_KM:
            warnings.append(f"Fuel desert: {max_gas_gap_km:.0f} km without gas station")

        # Only trigger EV charging desert warning if corridor exceeds 150 km battery range buffer
        if total_route_d > 150_000 and max_ev_fast_gap_km > 80.0:
            warnings.append(f"EV fast charging desert: {max_ev_fast_gap_km:.0f} km without high-speed charger")

        # Decoupled viability penalty (based on Gas availability to avoid penalizing rural gas routes)
        gas_penalty = 0.0
        if max_gas_gap_km > REFUEL_DESERT_THRESHOLD_KM:
            gas_penalty = min(10.0, (max_gas_gap_km - REFUEL_DESERT_THRESHOLD_KM) * 0.25)

        penalty = round(gas_penalty, 1)

        return {
            "total_gas_stations": len(gas_stations),
            "total_ev_fast_stations": len(ev_fast_stations),
            "total_ev_standard_stations": len(ev_standard_stations),
            "total_ev_chargers": len(ev_all_chargers),
            "max_gas_gap_km": max_gas_gap_km,
            "max_ev_gap_km": max_ev_fast_gap_km,
            "max_ev_fast_gap_km": max_ev_fast_gap_km,
            "fuel_desert_warning": "; ".join(warnings) if warnings else None,
            "infrastructure_penalty": penalty,
            "gas_stations": gas_stations,
            "ev_fast_stations": ev_fast_stations,
            "ev_standard_stations": ev_standard_stations,
            "ev_chargers": ev_all_chargers
        }

    def _calculate_max_gap(self, stations: List[Dict[str, Any]], total_distance_m: float) -> float:
        """Calculate the longest distance in km between consecutive stations along route."""
        total_km = round(total_distance_m / 1000.0, 1)
        if not stations:
            return total_km

        distances = [0.0] + [s["distance_from_origin_km"] for s in stations] + [total_km]
        max_gap = 0.0
        for i in range(len(distances) - 1):
            gap = distances[i + 1] - distances[i]
            if gap > max_gap:
                max_gap = gap
        return round(max_gap, 1)

    def _empty_response(self) -> Dict[str, Any]:
        return {
            "total_gas_stations": 0,
            "total_ev_fast_stations": 0,
            "total_ev_standard_stations": 0,
            "total_ev_chargers": 0,
            "max_gas_gap_km": 0.0,
            "max_ev_gap_km": 0.0,
            "max_ev_fast_gap_km": 0.0,
            "fuel_desert_warning": None,
            "infrastructure_penalty": 0.0,
            "gas_stations": [],
            "ev_fast_stations": [],
            "ev_standard_stations": [],
            "ev_chargers": []
        }


infrastructure_service = InfrastructureService()
