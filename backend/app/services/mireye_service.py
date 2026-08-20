import logging
import httpx
from typing import Optional, Dict, Any
from app.config import settings
from app.services.cache import cache_service

logger = logging.getLogger(__name__)


class MireyeDataService:
    def __init__(self):
        self.base_url = settings.MIREYE_BASE_URL.rstrip("/")
        self.timeout = settings.HTTP_TIMEOUT_S
        self._override_key = None

    @property
    def api_key(self) -> str:
        if self._override_key is not None:
            return self._override_key
        return settings.MIREYE_API_KEY

    @api_key.setter
    def api_key(self, value: str):
        self._override_key = value

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    async def fetch_location_facts(self, lat: float, lon: float, preset: str = "natural_hazard") -> Optional[Dict[str, Any]]:
        """POST /v1/fetch — provenance-tagged physical world data at a coordinate."""
        if not self.api_key:
            return None

        cache_key = f"mireye:fetch:{round(lat, 4)},{round(lon, 4)}:{preset}"
        cached = cache_service.get(cache_key)
        if cached:
            return cached

        try:
            logger.info(f"Mireye /v1/fetch request for point: lat={lat:.4f}, lon={lon:.4f}")
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

                    logger.info(f"Mireye /v1/fetch success for point: lat={lat:.4f}, lon={lon:.4f}")
                    cache_service.set(cache_key, result)
                    return result
                else:
                    logger.warning(f"Mireye /v1/fetch returned status {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Mireye /v1/fetch failed: {e}")
        return None

    async def lookup_place(self, input_str: str) -> Optional[Dict[str, Any]]:
        """POST /v1/lookup — county, state, FIPS, and census metadata for an address."""
        if not self.api_key:
            return None
        try:
            logger.info(f"Mireye /v1/lookup request for input: '{input_str}'")
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/lookup",
                    headers=self._headers(),
                    json={"input": input_str}
                )
                if resp.status_code == 200:
                    logger.info(f"Mireye /v1/lookup success for: '{input_str}'")
                    return resp.json()
                else:
                    logger.warning(f"Mireye /v1/lookup status {resp.status_code}: {resp.text[:150]}")
        except Exception as e:
            logger.warning(f"Mireye /v1/lookup failed: {e}")
        return None

    async def ask_question(self, lat: float, lon: float, question: str) -> Optional[str]:
        """POST /v1/ask — grounded, cited contextual answer about a location."""
        if not self.api_key:
            return None

        cache_key = f"mireye:ask:{round(lat, 4)},{round(lon, 4)}:{question[:80]}"
        cached = cache_service.get(cache_key)
        if cached:
            return cached

        try:
            logger.info(f"Mireye /v1/ask request at lat={lat:.4f}, lon={lon:.4f}: '{question[:60]}...'")
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/ask",
                    headers=self._headers(),
                    json={"lat": lat, "lng": lon, "question": question}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    answer = data.get("answer", "")
                    if answer:
                        logger.info(f"Mireye /v1/ask success at lat={lat:.4f}, lon={lon:.4f}")
                        cache_service.set(cache_key, answer)
                        return answer
                else:
                    logger.warning(f"Mireye /v1/ask returned status {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Mireye /v1/ask failed: {e}")
        return None


mireye_data_service = MireyeDataService()
