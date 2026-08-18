import logging
import httpx
from typing import Optional, Dict, Any
from app.config import settings
from app.services.cache import cache_service

logger = logging.getLogger(__name__)


class MireyeDataService:
    def __init__(self):
        self.api_key = settings.MIREYE_API_KEY
        self.base_url = settings.MIREYE_BASE_URL.rstrip("/")
        self.timeout = settings.HTTP_TIMEOUT_S

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    async def fetch_location_facts(self, lat: float, lon: float, preset: str = "natural_hazard") -> Optional[Dict[str, Any]]:
        """POST /v1/fetch — provenance-tagged physical world data at a coordinate."""
        if not self.api_key:
            return None

        cache_key = f"mireye:fetch:{round(lat, 4)},{round(lon, 4)}:{preset}"
        cached = cache_service.get(cache_key)
        if cached:
            return cached

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/fetch",
                    headers=self._headers(),
                    json={"lat": lat, "lng": lon, "preset": preset}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    fields = data.get("fields", {})
                    result = {"lat": lat, "lng": lon, "fetched_at": data.get("fetched_at"), "raw_fields": fields}

                    if "elevation" in fields:
                        result["elevation_m"] = fields["elevation"].get("value")
                        result["elevation_source"] = fields["elevation"].get("source")
                    if "seismic_pga_2pct_50yr_g" in fields:
                        result["seismic_pga_g"] = fields["seismic_pga_2pct_50yr_g"].get("value")
                        result["seismic_source"] = fields["seismic_pga_2pct_50yr_g"].get("source")

                    cache_service.set(cache_key, result)
                    return result
                else:
                    logger.warning(f"Mireye /v1/fetch returned {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Mireye /v1/fetch failed: {e}")
        return None

    async def lookup_place(self, input_str: str) -> Optional[Dict[str, Any]]:
        """POST /v1/lookup — county, state, FIPS, and census metadata for an address."""
        if not self.api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/lookup",
                    headers=self._headers(),
                    json={"input": input_str}
                )
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            logger.warning(f"Mireye /v1/lookup failed: {e}")
        return None


mireye_data_service = MireyeDataService()
