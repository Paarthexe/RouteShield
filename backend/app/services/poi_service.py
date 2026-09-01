import logging
import math
import httpx
from typing import List, Dict, Any, Optional
from app.config import settings
from app.models.route_models import ShelterPOI, Route
from app.services.cache import cache_service
from app.utils.geo import haversine_distance

logger = logging.getLogger(__name__)


class POIService:
    def __init__(self):
        self.overpass_mirrors = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        ]
        self.timeout = settings.HTTP_TIMEOUT_S

    async def find_corridor_shelters_and_pois(
        self,
        routes: List[Route],
        limit: int = 8
    ) -> List[ShelterPOI]:
        """Query live OSM Overpass nodes for emergency shelters, hospitals, and fire stations along candidate routes."""
        if not routes:
            return []

        all_lons, all_lats = [], []
        for r in routes:
            if r.geometry and r.geometry.coordinates:
                for lon, lat in r.geometry.coordinates:
                    all_lons.append(lon)
                    all_lats.append(lat)

        if not all_lons or not all_lats:
            return []

        pad = 0.04
        min_lat = max(-90.0, min(all_lats) - pad)
        max_lat = min(90.0, max(all_lats) + pad)
        min_lon = max(-180.0, min(all_lons) - pad)
        max_lon = min(180.0, max(all_lons) + pad)

        cache_key = f"poi:shelters:live:{round(min_lat, 2)},{round(min_lon, 2)},{round(max_lat, 2)},{round(max_lon, 2)}"
        cached = cache_service.get(cache_key)
        if cached and isinstance(cached, list):
            try:
                return [ShelterPOI(**item) for item in cached]
            except Exception:
                pass

        query = f"""
        [out:json][timeout:8];
        (
          node({min_lat},{min_lon},{max_lat},{max_lon})["amenity"="hospital"];
          node({min_lat},{min_lon},{max_lat},{max_lon})["amenity"="fire_station"];
          node({min_lat},{min_lon},{max_lat},{max_lon})["amenity"="shelter"];
          node({min_lat},{min_lon},{max_lat},{max_lon})["emergency"="shelter"];
          node({min_lat},{min_lon},{max_lat},{max_lon})["amenity"="social_facility"];
        );
        out center {limit * 2};
        """

        headers = {"User-Agent": "RouteShield-EmergencyPOI/2.0 (LiveOSMIngestion)"}
        pois: List[ShelterPOI] = []
        primary_id = routes[0].route_id if routes else "route_1"

        for mirror in self.overpass_mirrors:
            try:
                async with httpx.AsyncClient(timeout=self.timeout, headers=headers) as client:
                    resp = await client.post(mirror, data={"data": query})
                    if resp.status_code == 200:
                        elements = resp.json().get("elements", [])
                        for el in elements:
                            tags = el.get("tags", {})
                            name = tags.get("name")
                            if not name:
                                continue
                            p_lat = el.get("lat") or el.get("center", {}).get("lat")
                            p_lon = el.get("lon") or el.get("center", {}).get("lon")
                            if p_lat is None or p_lon is None:
                                continue

                            amenity = tags.get("amenity") or tags.get("emergency") or "facility"
                            poi_type = (
                                "hospital" if amenity == "hospital" else
                                "fire_station" if amenity == "fire_station" else
                                "shelter" if "shelter" in amenity else
                                "assembly_point"
                            )

                            pois.append(ShelterPOI(
                                name=name,
                                poi_type=poi_type,
                                latitude=p_lat,
                                longitude=p_lon,
                                distance_to_route_m=0.0,
                                nearest_route_id=primary_id
                            ))
                        if pois:
                            break
            except Exception as e:
                logger.debug(f"Overpass POI query notice: {e}")

        result = pois[:limit]
        if result:
            cache_service.set(cache_key, [p.model_dump() for p in result], ttl_seconds=600)
        return result


poi_service = POIService()
