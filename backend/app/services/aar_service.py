import logging
import httpx
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.config import settings
from app.models.route_models import Route, AARCaseStudy
from app.services.cache import cache_service
from app.services.geocoding import geocoding_service

logger = logging.getLogger(__name__)


def map_fema_incident_filter(disaster_type: str) -> Optional[str]:
    """Map RouteShield disaster types to OpenFEMA OData incidentType filters."""
    dt = (disaster_type or "").upper()
    if "WILD" in dt or "FIRE" in dt:
        return "incidentType eq 'Fire'"
    elif "FLOOD" in dt or "HURRICANE" in dt:
        return "(incidentType eq 'Flood' or incidentType eq 'Severe Storm' or incidentType eq 'Hurricane')"
    elif "QUAKE" in dt:
        return "incidentType eq 'Earthquake'"
    elif "SLIDE" in dt:
        return "(incidentType eq 'Mud/Landslide' or incidentType eq 'Severe Storm')"
    return None


class AARService:
    def __init__(self):
        self.fema_api_url = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries"
        self.nws_api_url = "https://api.weather.gov/alerts/active"
        self.timeout = settings.HTTP_TIMEOUT_S

    async def _fetch_live_nws_alerts(self, lat: float, lon: float) -> List[AARCaseStudy]:
        """Query real-time live NOAA NWS active alerts and extract official directives directly."""
        alerts: List[AARCaseStudy] = []
        try:
            headers = {"User-Agent": "RouteShield-EvacuationIntelligence/2.0 (LiveGovIngestion)"}
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = f"{self.nws_api_url}?point={round(lat, 4)},{round(lon, 4)}"
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    features = data.get("features", [])
                    for feat in features[:3]:
                        props = feat.get("properties", {})
                        event = props.get("event", "Active Hazard Alert")
                        headline = props.get("headline") or props.get("description") or "Active meteorological alert issued by NWS."
                        instruction = props.get("instruction") or "Monitor official municipal emergency evacuation channels."
                        area = props.get("areaDesc", "Regional Corridor Sector")
                        severity = props.get("severity", "Severe")

                        clean_headline = headline.replace("\n", " ").strip()
                        clean_instruction = instruction.replace("\n", " ").strip()

                        alerts.append(AARCaseStudy(
                            incident_name=f"Live Alert: {event}",
                            year=datetime.now().year,
                            location_name=area,
                            hazard_type=event,
                            gridlock_cause=f"Active Meteorological Event: {clean_headline[:180]}",
                            agency_report=f"National Weather Service Live Bulletin ({severity})",
                            lessons_learned=f"Official NWS Directive: {clean_instruction[:180]}",
                            mitigation_strategy=f"Execute emergency evacuation management protocol for {area} per NWS guidance.",
                            latitude=lat,
                            longitude=lon,
                            distance_to_route_m=0.0,
                            severity="CRITICAL" if severity in ("Extreme", "Severe") else "MODERATE"
                        ))
        except Exception as e:
            logger.debug(f"NOAA NWS live alert fetch notice: {e}")
        return alerts

    async def _fetch_fema_historical_disasters(self, lat: float, lon: float, disaster_type: str) -> List[AARCaseStudy]:
        """Query OpenFEMA API dynamically filtered by route state and disaster protocol."""
        studies: List[AARCaseStudy] = []
        cache_key = f"fema:aar:live_api:{round(lat, 2)},{round(lon, 2)}:{disaster_type}"
        cached = cache_service.get(cache_key)
        if cached and isinstance(cached, list):
            try:
                return [AARCaseStudy(**c) for c in cached]
            except Exception:
                pass

        state_code = await geocoding_service.reverse_lookup_state(lat, lon)
        incident_filter = map_fema_incident_filter(disaster_type)

        filter_clauses = []
        if state_code:
            filter_clauses.append(f"state eq '{state_code}'")
        if incident_filter:
            filter_clauses.append(incident_filter)

        filter_str = " and ".join(filter_clauses) if filter_clauses else None

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                params = {
                    "$top": 4,
                    "$orderby": "declarationDate desc",
                    "$select": "incidentType,declarationTitle,fyDeclared,designatedArea,fipsStateCode,state,declarationDate,disasterNumber"
                }
                if filter_str:
                    params["$filter"] = filter_str

                resp = await client.get(self.fema_api_url, params=params)

                # If specific disaster filter returned 0, try with state-only filter
                if resp.status_code == 200 and not resp.json().get("DisasterDeclarationsSummaries") and state_code:
                    params["$filter"] = f"state eq '{state_code}'"
                    resp = await client.get(self.fema_api_url, params=params)

                if resp.status_code == 200:
                    data = resp.json()
                    records = data.get("DisasterDeclarationsSummaries", [])
                    for r in records:
                        title = r.get("declarationTitle", "Emergency Declaration")
                        inc_type = r.get("incidentType", "Disaster")
                        year = int(r.get("fyDeclared", datetime.now().year))
                        county = r.get("designatedArea", "Designated County")
                        state = r.get("state", state_code or "US")
                        disaster_num = r.get("disasterNumber", "FEMA")
                        decl_date = (r.get("declarationDate") or "")[:10]

                        studies.append(AARCaseStudy(
                            incident_name=f"FEMA {title} ({disaster_num})",
                            year=year,
                            location_name=f"{county}, {state}",
                            hazard_type=inc_type,
                            gridlock_cause=f"Federal emergency declaration DR-{disaster_num} declared for {title} ({decl_date}).",
                            agency_report=f"OpenFEMA Disaster Summary Report DR-{disaster_num} ({state})",
                            lessons_learned=f"Public assistance and emergency protective measures activated for {county} under DR-{disaster_num}.",
                            mitigation_strategy=f"Review FEMA Hazard Mitigation Plan and evacuation corridor clearances for {county}.",
                            latitude=lat,
                            longitude=lon,
                            distance_to_route_m=0.0,
                            severity="CRITICAL" if inc_type in ("Fire", "Wildfire", "Flood", "Hurricane") else "MODERATE"
                        ))

                    if studies:
                        cache_service.set(cache_key, [s.model_dump() for s in studies], ttl_seconds=300)
                        return studies
        except Exception as e:
            logger.debug(f"OpenFEMA live disaster lookup notice: {e}")

        return studies

    async def match_route_aar_case_studies(
        self,
        route: Route,
        disaster_type: str = "ALL_HAZARDS"
    ) -> List[AARCaseStudy]:
        """
        Dynamically query live NOAA NWS alerts and OpenFEMA disaster declarations
        for the route's exact coordinates.
        """
        coords = route.geometry.coordinates if route.geometry else []
        if not coords:
            return []

        mid_idx = len(coords) // 2
        mid_lon, mid_lat = coords[mid_idx][0], coords[mid_idx][1]

        # 1. Fetch live NWS alerts for route midpoint
        live_alerts = await self._fetch_live_nws_alerts(mid_lat, mid_lon)

        # 2. Fetch OpenFEMA historical disaster records for this coordinate
        fema_studies = await self._fetch_fema_historical_disasters(mid_lat, mid_lon, disaster_type)

        combined = live_alerts + fema_studies
        route.aar_case_studies = combined
        return combined

    async def match_all_routes(
        self,
        routes: List[Route],
        disaster_type: str = "ALL_HAZARDS"
    ) -> List[AARCaseStudy]:
        """Match and deduplicate live NWS alerts & FEMA AAR case studies across all corridors."""
        if not routes:
            return []

        all_studies: List[AARCaseStudy] = []
        for r in routes:
            studies = await self.match_route_aar_case_studies(r, disaster_type=disaster_type)
            for s in studies:
                if not any(existing.incident_name == s.incident_name for existing in all_studies):
                    all_studies.append(s)

        return all_studies


aar_service = AARService()
