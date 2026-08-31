import logging
import math
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.services.cache import cache_service

logger = logging.getLogger(__name__)

MAX_OFFSET_DISTANCE_M = 1500.0
REFUEL_DESERT_THRESHOLD_KM = 45.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def point_to_segment_distance(
    p_lat: float, p_lon: float,
    a_lat: float, a_lon: float,
    b_lat: float, b_lon: float,
) -> Tuple[float, float]:
    lat_mid = math.radians((a_lat + b_lat) / 2.0)
    m_per_deg_lat = 111132.954 - 559.822 * math.cos(2 * lat_mid)
    m_per_deg_lon = 111412.84 * math.cos(lat_mid)

    ax, ay = a_lon * m_per_deg_lon, a_lat * m_per_deg_lat
    bx, by = b_lon * m_per_deg_lon, b_lat * m_per_deg_lat
    px, py = p_lon * m_per_deg_lon, p_lat * m_per_deg_lat

    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq <= 1e-6:
        return math.hypot(px - ax, py - ay), 0.0

    t = ((px - ax) * dx + (py - ay) * dy) / seg_len_sq
    t_clamped = max(0.0, min(1.0, t))
    proj_x = ax + t_clamped * dx
    proj_y = ay + t_clamped * dy
    return math.hypot(px - proj_x, py - proj_y), t_clamped


class InfrastructureService:
    def __init__(self):
        self.overpass_mirrors = [
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass-api.de/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        ]
        self.timeout = 10.0

    async def fetch_regional_stations(self, all_routes_coords: List[List[List[float]]]) -> List[Dict[str, Any]]:
        all_lons, all_lats = [], []
        for coords in all_routes_coords:
            for lon, lat in coords:
                all_lons.append(lon)
                all_lats.append(lat)
        if not all_lons or not all_lats:
            return []

        pad_deg = 0.035
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
        for mirror_url in self.overpass_mirrors:
            try:
                async with httpx.AsyncClient(timeout=self.timeout, headers=headers) as client:
                    resp = await client.post(mirror_url, data={"data": query})
                    if resp.status_code == 200:
                        elements = resp.json().get("elements", [])
                        cache_service.set(cache_key, elements)
                        return elements
            except Exception as exc:
                logger.debug("Overpass mirror failed: %s", exc)
        return []

    def project_stations_for_route(self, regional_stations: List[Dict[str, Any]], geometry_coords: List[List[float]], total_distance_m: float) -> Dict[str, Any]:
        if not geometry_coords:
            return self._empty_response()
        return self._filter_and_project_stations(regional_stations, geometry_coords, total_distance_m)

    def _filter_and_project_stations(self, elements: List[Dict[str, Any]], geometry_coords: List[List[float]], total_distance_m: float) -> Dict[str, Any]:
        gas_stations: List[Dict[str, Any]] = []
        ev_fast_stations: List[Dict[str, Any]] = []
        ev_standard_stations: List[Dict[str, Any]] = []
        total_route_d = total_distance_m

        cumulative = [0.0]
        for i in range(1, len(geometry_coords)):
            prev_lon, prev_lat = geometry_coords[i - 1]
            lon, lat = geometry_coords[i]
            cumulative.append(cumulative[-1] + haversine_distance(prev_lat, prev_lon, lat, lon))

        for el in elements:
            tags = el.get("tags", {})
            s_lat = el.get("lat")
            s_lon = el.get("lon")
            if s_lat is None or s_lon is None:
                continue

            amenity = tags.get("amenity")
            name = tags.get("name") or tags.get("brand") or "Unnamed Station"
            brand_display = tags.get("brand") or "Independent"
            capacity = str(tags.get("capacity") or "").strip()

            station_type = None
            speed_tier = "standard"
            speed_label = ""
            est_charge_time = None
            power_label = None
            stalls_display = None

            if amenity == "fuel":
                station_type = "gas"
                stalls_display = f"{capacity} Pumps" if capacity.isdigit() else "Fuel Depot"
            elif amenity == "charging_station":
                socket = (tags.get("socket:type2") or "") + (tags.get("socket:tesla_supercharger") or "") + (tags.get("socket:chademo") or "")
                power_raw = tags.get("capacity:charging") or tags.get("socket:output") or tags.get("max_power") or ""
                power_text = str(power_raw).lower()
                is_fast = any(token in power_text for token in ["50", "100", "150", "250", "350", "dc"]) or "supercharger" in name.lower() or "tesla" in brand_display.lower()
                if is_fast:
                    station_type = "ev_fast"
                    speed_tier = "fast"
                    speed_label = "DC Fast"
                    est_charge_time = "20-40 min"
                    power_label = str(power_raw) if power_raw else "High-speed"
                    stalls_display = f"{capacity} Fast Stalls" if capacity.isdigit() else "Fast Charge"
                else:
                    station_type = "ev_standard"
                    speed_tier = "standard"
                    speed_label = "AC / Level 2"
                    est_charge_time = "2-6 hr"
                    power_label = str(power_raw) if power_raw else "Standard"
                    stalls_display = f"{capacity} Ports" if capacity.isdigit() else "Charging Point"
            if not station_type:
                continue

            min_offset = float("inf")
            best_route_dist = 0.0
            for i in range(1, len(geometry_coords)):
                a_lon, a_lat = geometry_coords[i - 1]
                b_lon, b_lat = geometry_coords[i]
                offset_m, frac = point_to_segment_distance(s_lat, s_lon, a_lat, a_lon, b_lat, b_lon)
                if offset_m < min_offset:
                    min_offset = offset_m
                    seg_len = cumulative[i] - cumulative[i - 1]
                    best_route_dist = cumulative[i - 1] + (seg_len * frac)

            if min_offset <= MAX_OFFSET_DISTANCE_M:
                item = {
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
                    "offset_distance_m": round(min_offset, 0),
                }
                if station_type == "gas":
                    gas_stations.append(item)
                elif station_type == "ev_fast":
                    ev_fast_stations.append(item)
                else:
                    ev_standard_stations.append(item)

        gas_stations.sort(key=lambda s: s["distance_from_origin_km"])
        ev_fast_stations.sort(key=lambda s: s["distance_from_origin_km"])
        ev_standard_stations.sort(key=lambda s: s["distance_from_origin_km"])
        ev_all = sorted(ev_fast_stations + ev_standard_stations, key=lambda s: s["distance_from_origin_km"])

        max_gas_gap_km = self._calculate_max_gap(gas_stations, total_route_d)
        max_ev_fast_gap_km = self._calculate_max_gap(ev_fast_stations, total_route_d)

        warnings = []
        if max_gas_gap_km > REFUEL_DESERT_THRESHOLD_KM:
            warnings.append(f"Fuel desert: {max_gas_gap_km:.0f} km without Fuel Station")
        if total_route_d > 150_000 and max_ev_fast_gap_km > 80.0:
            warnings.append(f"EV fast charging desert: {max_ev_fast_gap_km:.0f} km without high-speed charger")

        gas_penalty = 0.0
        if max_gas_gap_km > REFUEL_DESERT_THRESHOLD_KM:
            gas_penalty = min(10.0, (max_gas_gap_km - REFUEL_DESERT_THRESHOLD_KM) * 0.25)

        return {
            "total_gas_stations": len(gas_stations),
            "total_ev_fast_stations": len(ev_fast_stations),
            "total_ev_standard_stations": len(ev_standard_stations),
            "total_ev_chargers": len(ev_all),
            "max_gas_gap_km": max_gas_gap_km,
            "max_ev_gap_km": max_ev_fast_gap_km,
            "max_ev_fast_gap_km": max_ev_fast_gap_km,
            "fuel_desert_warning": "; ".join(warnings) if warnings else None,
            "infrastructure_penalty": round(gas_penalty, 1),
            "stations": gas_stations + ev_fast_stations + ev_standard_stations,
            "gas_stations": gas_stations,
            "ev_fast_stations": ev_fast_stations,
            "ev_standard_stations": ev_standard_stations,
            "ev_chargers": ev_all,
        }

    def _calculate_max_gap(self, stations: List[Dict[str, Any]], total_distance_m: float) -> float:
        total_km = round(total_distance_m / 1000.0, 1)
        if not stations:
            return total_km
        distances = [0.0] + [s["distance_from_origin_km"] for s in stations] + [total_km]
        return round(max(distances[i + 1] - distances[i] for i in range(len(distances) - 1)), 1)

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
            "stations": [],
            "gas_stations": [],
            "ev_fast_stations": [],
            "ev_standard_stations": [],
            "ev_chargers": [],
        }


infrastructure_service = InfrastructureService()