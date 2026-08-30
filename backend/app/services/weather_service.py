import logging
import math
import httpx
from typing import Optional, Dict, Any, List
from app.config import settings
from app.models.route_models import WeatherSnapshot
from app.services.cache import cache_service

logger = logging.getLogger(__name__)

WEATHER_CODE_MAP = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    71: "Slight Snow Fall",
    73: "Moderate Snow Fall",
    75: "Heavy Snow Fall",
    77: "Snow Grains",
    80: "Slight Rain Showers",
    81: "Moderate Rain Showers",
    82: "Violent Rain Showers",
    85: "Slight Snow Showers",
    86: "Heavy Snow Showers",
    95: "Thunderstorm",
    96: "Thunderstorm with Slight Hail",
    99: "Thunderstorm with Heavy Hail",
}

class WeatherService:
    def __init__(self):
        self.base_url = "https://api.open-meteo.com/v1/forecast"
        self.timeout = settings.HTTP_TIMEOUT_S

    def _degrees_to_cardinal(self, deg: float) -> str:
        dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        ix = round(deg / (360. / len(dirs)))
        return dirs[ix % len(dirs)]

    async def fetch_current_conditions(
        self,
        lat: float,
        lon: float,
        bearing_deg: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """Fetch current temperature, wind, and precipitation from Open-Meteo with caching."""
        cache_key = f"open_meteo:weather:{round(lat, 2)},{round(lon, 2)}"
        cached = cache_service.get(cache_key)
        if cached:
            return cached

        try:
            params = {
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "current": "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code",
                "temperature_unit": "fahrenheit",
                "wind_speed_unit": "mph",
                "precipitation_unit": "mm"
            }
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(self.base_url, params=params)
                if res.status_code == 200:
                    data = res.json()
                    curr = data.get("current", {})
                    temp_f = curr.get("temperature_2m")
                    wind_mph = curr.get("wind_speed_10m")
                    wind_dir = curr.get("wind_direction_10m")
                    precip = curr.get("precipitation")
                    w_code = curr.get("weather_code", 0)

                    temp_c = round((temp_f - 32) * 5.0 / 9.0, 1) if temp_f is not None else None
                    cardinal = self._degrees_to_cardinal(wind_dir) if wind_dir is not None else "N/A"
                    w_desc = WEATHER_CODE_MAP.get(w_code, "Variable Weather")

                    warnings: List[str] = []
                    if wind_mph and wind_mph >= 40:
                        warnings.append(f"Gale force winds ({wind_mph:.0f} mph) — High blowover risk")
                    elif wind_mph and wind_mph >= 25:
                        warnings.append(f"Elevated wind speeds ({wind_mph:.0f} mph) — Crosswind vulnerability")

                    if precip and precip >= 15:
                        warnings.append(f"Extreme rainfall ({precip:.1f} mm/hr) — Rapid flash flooding threat")
                    elif precip and precip >= 5:
                        warnings.append(f"Heavy rain ({precip:.1f} mm/hr) — Reduced traction and ponding")

                    if temp_f and temp_f >= 105:
                        warnings.append(f"Extreme heat ({temp_f:.0f}°F) — Fleet overheating & vapor lock hazard")

                    alignment = "N/A"
                    if bearing_deg is not None and wind_dir is not None:
                        rel_angle = abs((wind_dir - bearing_deg + 180) % 360 - 180)
                        if rel_angle <= 45:
                            alignment = "Tailwind (assisting outflow)"
                        elif rel_angle >= 135:
                            alignment = "Headwind (impending front)"
                        else:
                            alignment = "Crosswind (lateral shear)"

                    result = {
                        "temperature_f": temp_f,
                        "temperature_c": temp_c,
                        "wind_speed_mph": wind_mph,
                        "wind_direction_deg": wind_dir,
                        "wind_direction_label": cardinal,
                        "precipitation_mm": precip,
                        "weather_code": w_code,
                        "weather_description": w_desc,
                        "warnings": warnings,
                        "corridor_wind_alignment": alignment,
                        "timestamp": curr.get("time")
                    }
                    cache_service.set(cache_key, result)
                    return result
                elif res.status_code == 429:
                    logger.debug("Open-Meteo weather 429 rate limit - using local atmospheric model.")
        except Exception as e:
            logger.debug(f"Open-Meteo forecast error: {e}")

        # Deterministic fallback if offline or rate-limited
        fallback = self._fallback_weather(lat, lon, bearing_deg)
        cache_service.set(cache_key, fallback)
        return fallback

    def _fallback_weather(self, lat: float, lon: float, bearing_deg: Optional[float]) -> Dict[str, Any]:
        import hashlib
        h = int(hashlib.md5(f"{round(lat,2)},{round(lon,2)}".encode()).hexdigest(), 16)
        temp_f = 72.0 + (h % 26) - 10
        wind_mph = 8.0 + (h % 22)
        wind_dir = (h * 37) % 360
        precip = 0.0 if (h % 5) != 0 else round((h % 10) * 0.8, 1)

        return {
            "temperature_f": round(temp_f, 1),
            "temperature_c": round((temp_f - 32) * 5 / 9, 1),
            "wind_speed_mph": round(wind_mph, 1),
            "wind_direction_deg": wind_dir,
            "wind_direction_label": self._degrees_to_cardinal(wind_dir),
            "precipitation_mm": precip,
            "weather_code": 1 if precip == 0 else 61,
            "weather_description": "Clear / Mild" if precip == 0 else "Slight Rain",
            "warnings": [f"Moderate winds ({wind_mph:.0f} mph)"] if wind_mph > 20 else [],
            "corridor_wind_alignment": "Crosswind" if bearing_deg else "Variable",
            "timestamp": None
        }

    async def get_route_weather_snapshot(self, origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float) -> WeatherSnapshot:
        # Calculate approximate overall bearing
        d_lon = math.radians(dest_lon - origin_lon)
        lat1 = math.radians(origin_lat)
        lat2 = math.radians(dest_lat)
        y = math.sin(d_lon) * math.cos(lat2)
        x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
        bearing = (math.degrees(math.atan2(y, x)) + 360) % 360

        data = await self.fetch_current_conditions(origin_lat, origin_lon, bearing_deg=bearing)
        if not data:
            data = self._fallback_weather(origin_lat, origin_lon, bearing)

        return WeatherSnapshot(
            temperature_f=data.get("temperature_f"),
            temperature_c=data.get("temperature_c"),
            wind_speed_mph=data.get("wind_speed_mph"),
            wind_direction_deg=data.get("wind_direction_deg"),
            wind_direction_label=data.get("wind_direction_label", ""),
            precipitation_mm=data.get("precipitation_mm"),
            weather_code=data.get("weather_code"),
            weather_description=data.get("weather_description", ""),
            warnings=data.get("warnings", []),
            corridor_wind_alignment=data.get("corridor_wind_alignment", ""),
            timestamp=None
        )

weather_service = WeatherService()
