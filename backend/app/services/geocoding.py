import logging
import httpx
from typing import Optional, List
from fastapi import HTTPException, status
from app.config import settings
from app.models.route_models import Location
from app.services.cache import cache_service


def _mireye():
    from app.services.mireye_service import mireye_data_service
    return mireye_data_service


logger = logging.getLogger(__name__)


class GeocodingService:
    def __init__(self):
        self.mireye_base_url = settings.MIREYE_BASE_URL.rstrip("/")
        self.timeout = settings.HTTP_TIMEOUT_S
        self._override_key = None

    @property
    def mireye_api_key(self) -> str:
        if self._override_key is not None:
            return self._override_key
        return settings.MIREYE_API_KEY

    @mireye_api_key.setter
    def mireye_api_key(self, value: str):
        self._override_key = value

    async def resolve_location(self, query: str) -> Location:
        clean = query.strip()
        if not clean:
            raise HTTPException(status_code=400, detail="Location query cannot be empty.")

        coord_parts = [p.strip() for p in clean.split(',')]
        if len(coord_parts) == 2:
            try:
                lat_val = float(coord_parts[0])
                lon_val = float(coord_parts[1])
                if -90.0 <= lat_val <= 90.0 and -180.0 <= lon_val <= 180.0:
                    logger.info(f"Direct coordinate input: ({lat_val:.5f}, {lon_val:.5f})")
                    return Location(
                        query=clean,
                        latitude=lat_val,
                        longitude=lon_val,
                        display_name=f"Point ({lat_val:.4f}, {lon_val:.4f})"
                    )
            except ValueError:
                pass

        cache_key = f"geocode:{clean.lower()}"
        cached = cache_service.get(cache_key)
        if cached:
            logger.info(f"Returning cached geocoding result for '{clean}'")
            return Location(**cached)

        if not self.mireye_api_key:
            logger.error("Mireye API Key is missing. Geocoding requires MIREYE_API_KEY.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Mireye API key is required for geocoding."
            )

        logger.info(f"Querying Mireye /v1/geocode API for address: '{clean}'")
        
        candidate_queries = [clean]
        if not any(char.isdigit() for char in clean):
            candidate_queries.append(f"Main St, {clean}")
            candidate_queries.append(f"City Hall, {clean}")

        location = None
        for q in candidate_queries:
            location = await self._mireye_geocode(q, original_display=clean)
            if location:
                break

        if not location:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Could not resolve location with Mireye: '{clean}'"
            )

        cache_service.set(cache_key, location.model_dump())
        return location

    async def _mireye_geocode(self, query: str, original_display: Optional[str] = None) -> Optional[Location]:
        try:
            url = f"{self.mireye_base_url}/geocode"
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {self.mireye_api_key}", "Content-Type": "application/json"},
                    json={"address": query}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    lat, lng = data.get("lat"), data.get("lng")
                    if lat is not None and lng is not None:
                        logger.info(f"Mireye /v1/geocode success: '{query}' -> lat={lat}, lng={lng}")
                        display = original_display or data.get("normalized_address", query)

                        # Append county+state from /v1/lookup if available
                        try:
                            meta = await _mireye().lookup_place(query)
                            if meta and meta.get("county") and meta.get("state"):
                                display = f"{display} [{meta['county']}, {meta['state']}]"
                        except Exception:
                            pass

                        return Location(
                            query=original_display or query,
                            latitude=float(lat),
                            longitude=float(lng),
                            display_name=display
                        )
                else:
                    logger.warning(f"Mireye /v1/geocode returned status {resp.status_code} for '{query}': {resp.text[:120]}")
        except Exception as e:
            logger.warning(f"Mireye /v1/geocode request failed: {e}")
        return None


geocoding_service = GeocodingService()
