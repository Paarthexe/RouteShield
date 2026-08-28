import logging
import asyncio
import httpx
from typing import List, Dict, Any, Tuple, Optional
from app.config import settings
from app.services.cache import cache_service

logger = logging.getLogger(__name__)

BATCH_SIZE = 80  # Open-Meteo limit is 100 points per request


class OpenMeteoService:
    def __init__(self):
        self.base_url = "https://api.open-meteo.com/v1/elevation"
        self.forecast_url = "https://api.open-meteo.com/v1/forecast"
        self.timeout = settings.HTTP_TIMEOUT_S

    async def fetch_elevations_bulk(
        self,
        points: List[Tuple[float, float]]
    ) -> List[Optional[Dict[str, Any]]]:
        """
        Fetch elevations for a list of (lat, lon) tuples using Open-Meteo API in bulk chunks.
        Returns a list of dicts with 'elevation_m' and 'elevation_source'.
        """
        if not points:
            return []

        results: List[Optional[Dict[str, Any]]] = [None] * len(points)
        uncached_indices: List[int] = []
        uncached_lats: List[float] = []
        uncached_lons: List[float] = []

        # Check cache first for each point
        for idx, (lat, lon) in enumerate(points):
            cache_key = f"open_meteo:elevation:{round(lat, 4)},{round(lon, 4)}"
            cached = cache_service.get(cache_key)
            if cached:
                results[idx] = cached
            else:
                uncached_indices.append(idx)
                uncached_lats.append(lat)
                uncached_lons.append(lon)

        if not uncached_indices:
            return results

        # Process uncached in batches of up to BATCH_SIZE
        for chunk_start in range(0, len(uncached_indices), BATCH_SIZE):
            chunk_indices = uncached_indices[chunk_start:chunk_start + BATCH_SIZE]
            chunk_lats = uncached_lats[chunk_start:chunk_start + BATCH_SIZE]
            chunk_lons = uncached_lons[chunk_start:chunk_start + BATCH_SIZE]

            try:
                lat_str = ",".join(str(lat) for lat in chunk_lats)
                lon_str = ",".join(str(lon) for lon in chunk_lons)
                url = f"{self.base_url}?latitude={lat_str}&longitude={lon_str}"

                logger.info(f"Querying Open-Meteo elevation chunk ({len(chunk_indices)} points)...")
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        data = resp.json()
                        elevations = data.get("elevation", [])
                        
                        for i, orig_idx in enumerate(chunk_indices):
                            if i < len(elevations) and elevations[i] is not None:
                                elev_m = float(elevations[i])
                                item = {
                                    "elevation_m": elev_m,
                                    "elevation_source": "Open-Meteo DEM (90m)"
                                }
                                results[orig_idx] = item
                                lat, lon = chunk_lats[i], chunk_lons[i]
                                cache_key = f"open_meteo:elevation:{round(lat, 4)},{round(lon, 4)}"
                                cache_service.set(cache_key, item)
                        logger.info(f"Open-Meteo elevation chunk fetch success ({len(elevations)} points)")
                    else:
                        logger.warning(f"Open-Meteo API returned status {resp.status_code}: {resp.text[:150]}")
            except Exception as e:
                logger.warning(f"Open-Meteo API request failed: {e}")

        return results

    async def fetch_weather_bulk(
        self,
        points: List[Tuple[float, float]],
        hour_offsets: Optional[List[int]] = None,
    ) -> List[Optional[Dict[str, Any]]]:
        """
        Fetch current weather / near-term operational weather for a list of points.
        Returns weather descriptors aligned to the input coordinate order.
        """
        if not points:
            return []

        if hour_offsets is None:
            hour_offsets = [0] * len(points)

        results: List[Optional[Dict[str, Any]]] = [None] * len(points)

        async def fetch_single(idx: int, lat: float, lon: float, hour_offset: int):
            bounded_hour_offset = max(0, min(23, int(hour_offset)))
            cache_key = f"open_meteo:weather:{round(lat, 3)},{round(lon, 3)}:{bounded_hour_offset}"
            cached = cache_service.get(cache_key)
            if cached:
                results[idx] = cached
                return

            params = {
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,precipitation,rain,showers,snowfall,wind_speed_10m,wind_gusts_10m,weather_code",
                "hourly": "precipitation_probability,visibility,relative_humidity_2m",
                "forecast_days": 1,
                "timezone": "auto",
            }

            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.get(self.forecast_url, params=params)
                    if resp.status_code != 200:
                        logger.warning(f"Open-Meteo weather API returned status {resp.status_code}: {resp.text[:150]}")
                        return

                    data = resp.json()
                    current = data.get("current", {}) or {}
                    hourly = data.get("hourly", {}) or {}
                    precip_probs = hourly.get("precipitation_probability") or []
                    visibilities = hourly.get("visibility") or []
                    humidities = hourly.get("relative_humidity_2m") or []

                    precip_prob = precip_probs[bounded_hour_offset] if bounded_hour_offset < len(precip_probs) else (precip_probs[0] if precip_probs else None)
                    visibility = visibilities[bounded_hour_offset] if bounded_hour_offset < len(visibilities) else (visibilities[0] if visibilities else None)
                    humidity = humidities[bounded_hour_offset] if bounded_hour_offset < len(humidities) else (humidities[0] if humidities else None)

                    item = {
                        "temperature_c": current.get("temperature_2m"),
                        "precipitation_mm": current.get("precipitation"),
                        "rain_mm": current.get("rain"),
                        "showers_mm": current.get("showers"),
                        "snowfall_cm": current.get("snowfall"),
                        "wind_speed_kmh": current.get("wind_speed_10m"),
                        "wind_gust_kmh": current.get("wind_gusts_10m"),
                        "weather_code": current.get("weather_code"),
                        "precipitation_probability_pct": precip_prob,
                        "visibility_m": visibility,
                        "relative_humidity_pct": humidity,
                        "forecast_hour_offset": bounded_hour_offset,
                        "weather_source": "Open-Meteo Forecast (ETA-aligned)",
                    }
                    results[idx] = item
                    cache_service.set(cache_key, item)
            except Exception as e:
                logger.warning(f"Open-Meteo weather API request failed: {e}")

        await asyncio.gather(*[
            fetch_single(idx, lat, lon, hour_offsets[idx] if idx < len(hour_offsets) else 0)
            for idx, (lat, lon) in enumerate(points)
        ])

        return results


open_meteo_service = OpenMeteoService()
