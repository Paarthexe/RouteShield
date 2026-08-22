import logging
import httpx
from typing import List, Dict, Any, Tuple, Optional
from app.config import settings
from app.services.cache import cache_service

logger = logging.getLogger(__name__)

BATCH_SIZE = 80  # Open-Meteo limit is 100 points per request


class OpenMeteoService:
    def __init__(self):
        self.base_url = "https://api.open-meteo.com/v1/elevation"
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


open_meteo_service = OpenMeteoService()
