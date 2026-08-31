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
            logger.warning("Mireye API Key is missing. Falling back to Nominatim geocoding.")
            location = await self._nominatim_geocode(clean)
            if not location:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Could not resolve location: '{clean}'"
                )
            cache_service.set(cache_key, location.model_dump())
            return location

        logger.info(f"Resolving location: '{clean}'")

        # Tier 1: Try Mireye /v1/geocode (ideal for street addresses)
        location = await self._mireye_geocode(clean, original_display=clean)

        # Tier 2: If Mireye returns 404/address_too_coarse (common for cities/places), fallback to Nominatim
        if not location:
            location = await self._nominatim_geocode(clean)

        if not location:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Could not resolve location: '{clean}'"
            )

        cache_service.set(cache_key, location.model_dump())
        return location

    async def _mireye_geocode(self, query: str, original_display: Optional[str] = None) -> Optional[Location]:
        if not self.mireye_api_key:
            return None
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
                    logger.info(f"Mireye /v1/geocode for '{query}' returned status {resp.status_code} (falling back to place geocoder)")
        except Exception as e:
            logger.warning(f"Mireye /v1/geocode request failed: {e}")
        return None

    async def _nominatim_geocode(self, query: str) -> Optional[Location]:
        """High-precision city/town/place resolver fallback."""
        try:
            headers = {"User-Agent": "RouteShield-Evacuation-Engine/1.0"}
            async with httpx.AsyncClient(timeout=self.timeout, headers=headers) as client:
                resp = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": query, "format": "json", "countrycodes": "us", "limit": 1}
                )
                if resp.status_code == 200 and resp.json():
                    item = resp.json()[0]
                    lat = float(item["lat"])
                    lon = float(item["lon"])
                    display_name = item.get("display_name", query)
                    # Clean up long display name (keep first 3 comma parts)
                    parts = [p.strip() for p in display_name.split(",")]
                    short_display = ", ".join(parts[:3]) if len(parts) >= 3 else display_name

                    logger.info(f"Nominatim geocode success: '{query}' -> ({lat:.4f}, {lon:.4f})")
                    return Location(
                        query=query,
                        latitude=lat,
                        longitude=lon,
                        display_name=short_display
                    )
        except Exception as e:
            logger.warning(f"Nominatim geocode fallback failed for '{query}': {e}")
        return None


geocoding_service = GeocodingService()

