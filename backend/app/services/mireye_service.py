import logging
import httpx
from typing import Optional, Dict, Any
from app.config import settings
from app.services.cache import cache_service

logger = logging.getLogger(__name__)


# Complete mapping from Mireye /v1/fetch API field names (natural_hazard preset)
# to our internal RouteSample mireye_data keys.
# Every signal is tagged with provenance in raw_fields.
_FIELD_MAP: Dict[str, str] = {
    # Seismic - USGS
    "seismic_pga_2pct_50yr_g":           "seismic_pga_g",              # Peak Ground Acceleration (g)
    "seismic_hazard_tier":               "seismic_hazard_tier",        # low / moderate / high / very_high
    "seismic_design_category":           "seismic_design_category",    # ASCE 7 (A-F)
    # Wildfire - CAL FIRE / USFS / WUI
    "fire_hazard_severity_zone":         "fire_hazard_zone",           # Very High / High / Moderate
    "wui_class":                         "wui_class",                  # Interface / Intermix / Non-WUI
    "nearest_fire_perimeter_distance_m": "nearest_fire_perimeter_m",   # distance to historical burn
    "most_recent_burn_year":             "most_recent_burn_year",      # e.g. 2020
    # Dam Inundation - NID / USACE
    "nearest_dam_hazard_potential":      "nearest_dam_hazard",         # High / Significant / Low
    "nearest_dam_distance_m":            "nearest_dam_distance_m",
    "nearest_dam_name":                  "nearest_dam_name",
    # Landslide - USGS / CGS
    "landslide_susceptibility":          "landslide_susceptibility",   # 0-100 index
    # Karst / Sinkhole - USGS
    "karst_potential":                   "karst_potential",            # High / Moderate / None
    # Wind - ASCE 7
    "basic_wind_speed_mph":              "wind_speed_mph",
    # Flood - NFHL / FEMA
    "within_100yr_floodplain":           "within_floodplain",          # bool
    "within_500yr_floodplain":           "within_500yr_floodplain",    # bool
    # Soil
    "soil_shrink_swell_class":           "soil_shrink_swell",
    # Terrain - USGS 3DEP
    "slope_degrees":                     "slope_degrees",
    # Elevation - also extracted separately below
    "elevation":                         "elevation_m",

    # ---- Extended flood fields (flood_risk preset) ----
    "fema_flood_zone":                   "fema_flood_zone",            # AE/VE/X/A/AO
    "flood_zone_subtype":                "flood_zone_subtype",         # FLOODWAY, 0.2%, coastal-A
    "coastal_high_hazard":               "coastal_high_hazard",        # bool: V-zone wave action
    "fema_base_flood_elevation":         "fema_base_flood_elevation",  # feet NAVD88
    "coast_distance_m":                  "coast_distance_m",           # meters to shoreline
    "intersects_nhd_area":               "intersects_nhd_area",        # bool: on river/canal/inundation area
    "intersects_wetland":                "intersects_wetland",         # bool: NWI wetland
    "surface_water_permanence_pct":      "surface_water_permanence_pct",  # 0-100 JRC Global Surface Water
    "nearest_wetland_distance_m":        "nearest_wetland_distance_m",

    # ---- Road network (site_selection preset) ----
    "nearest_major_road_class":          "nearest_road_class",         # motorway/trunk/primary/secondary
    "nearest_major_road_distance_m":     "nearest_road_distance_m",
    "roads_within_500m_count":           "roads_within_500m_count",    # network density / chokepoint signal

    # ---- Emergency facilities (points_of_interest preset) ----
    "nearest_fire_station_distance_m":   "nearest_fire_station_m",
    "nearest_hospital_distance_m":       "nearest_hospital_m",
}


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
        """POST /v1/fetch - provenance-tagged physical world data at a coordinate.

        Returns a flat dict with named keys for every known natural_hazard field
        (seismic, wildfire, flood, landslide, dam, karst, wind, slope, elevation)
        plus 'raw_fields' with the full API response for forward-compatibility.
        """
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

                    # Base result - always include raw_fields for forward-compat
                    result: Dict[str, Any] = {
                        "lat": lat,
                        "lng": lon,
                        "fetched_at": data.get("fetched_at"),
                        "raw_fields": fields,
                    }

                    # Map all known field names to clean internal keys
                    for api_key, internal_key in _FIELD_MAP.items():
                        if api_key in fields:
                            entry = fields[api_key]
                            val = entry.get("value")
                            if val is not None:
                                result[internal_key] = val

                    # Elevation: prefer Mireye value; also capture source string
                    if "elevation" in fields:
                        elev_entry = fields["elevation"]
                        if elev_entry.get("value") is not None:
                            result["elevation_m"] = elev_entry["value"]
                            result["elevation_source"] = elev_entry.get("source", "Mireye")

                    # Seismic source annotation
                    if "seismic_pga_2pct_50yr_g" in fields:
                        result["seismic_source"] = fields["seismic_pga_2pct_50yr_g"].get("source")

                    named = [k for k in result if k not in ("lat", "lng", "fetched_at", "raw_fields")]
                    logger.info(
                        f"Mireye /v1/fetch success lat={lat:.4f}, lon={lon:.4f} "
                        f"- {len(named)} named fields extracted"
                    )
                    cache_service.set(cache_key, result)
                    return result
                else:
                    logger.warning(f"Mireye /v1/fetch returned status {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Mireye /v1/fetch failed: {e}")
        return None

    async def lookup_place(self, input_str: str) -> Optional[Dict[str, Any]]:
        """POST /v1/lookup - county, state, FIPS, and census metadata for an address."""
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
        """POST /v1/ask - grounded, cited contextual answer about a location."""
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
