import logging
import httpx
from typing import Optional
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
                    logger.info(f"📍 Direct coordinate input: ({lat_val:.5f}, {lon_val:.5f})")
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
            logger.info(f"⚡ Returning cached geocoding result for '{clean}'")
            return Location(**cached)

        location = None
        if self.mireye_api_key:
            logger.info(f"🌐 Querying Mireye /v1/geocode API for address: '{clean}'")
            location = await self._mireye_geocode(clean)

        if not location:
            logger.info(f"🌐 Falling back to OpenStreetMap Nominatim for address: '{clean}'")
            location = await self._nominatim(clean)

        if not location:
            raise HTTPException(
                status_code=404,
                detail=f"Could not resolve location: '{clean}'"
            )

        cache_service.set(cache_key, location.model_dump())
        return location

    async def _mireye_geocode(self, query: str) -> Optional[Location]:
        try:
            url = f"{self.mireye_base_url}/geocode"
            logger.info(f"📡 Sending POST {url} with address payload: {{'address': '{query}'}}")
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
                        logger.info(f"✅ Mireye /v1/geocode success: '{query}' -> lat={lat}, lng={lng}")
                        display = data.get("normalized_address", query)

                        # Append county+state from /v1/lookup
                        try:
                            meta = await _mireye().lookup_place(query)
                            if meta and meta.get("county") and meta.get("state"):
                                display = f"{display} [{meta['county']}, {meta['state']}]"
                        except Exception:
                            pass

                        return Location(query=query, latitude=float(lat), longitude=float(lng), display_name=display)
                else:
                    logger.warning(f"⚠️ Mireye /v1/geocode returned status {resp.status_code}: {resp.text[:150]}")
        except Exception as e:
            logger.warning(f"❌ Mireye /v1/geocode request failed: {e}")
        return None

    async def _nominatim(self, query: str) -> Optional[Location]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    headers={"User-Agent": "RouteShield/0.1"},
                    params={"q": query, "format": "json", "limit": 1}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data:
                        r = data[0]
                        return Location(
                            query=query,
                            latitude=float(r["lat"]),
                            longitude=float(r["lon"]),
                            display_name=r.get("display_name", query)
                        )
                elif resp.status_code == 429:
                    raise HTTPException(status_code=429, detail="Geocoding rate limit hit.")
        except HTTPException:
            raise
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Geocoding timed out.")
        except Exception as e:
            logger.error(f"Nominatim error: {e}")
            raise HTTPException(status_code=503, detail="Geocoding service unavailable.")
        return None


geocoding_service = GeocodingService()
