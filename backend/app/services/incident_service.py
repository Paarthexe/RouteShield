import logging
import httpx
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.config import settings
from app.models.route_models import HistoricalIncident
from app.services.aar_service import map_fema_incident_filter
from app.services.geocoding import geocoding_service

logger = logging.getLogger(__name__)


class IncidentService:
    def __init__(self):
        self.fema_api_url = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries"
        self.timeout = settings.HTTP_TIMEOUT_S

    async def get_historical_incidents(
        self,
        lat: float,
        lon: float,
        disaster_type: str = "ALL_HAZARDS",
        limit: int = 5
    ) -> List[HistoricalIncident]:
        """Fetch past real FEMA declarations from OpenFEMA API filtered by route state and disaster protocol."""
        incidents: List[HistoricalIncident] = []
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
                    "$top": limit,
                    "$orderby": "declarationDate desc",
                    "$select": "incidentType,declarationTitle,fyDeclared,designatedArea,fipsStateCode,state"
                }
                if filter_str:
                    params["$filter"] = filter_str

                res = await client.get(self.fema_api_url, params=params)

                # If specific disaster filter returned 0, try with state-only filter
                if res.status_code == 200 and not res.json().get("DisasterDeclarationsSummaries") and state_code:
                    params["$filter"] = f"state eq '{state_code}'"
                    res = await client.get(self.fema_api_url, params=params)

                if res.status_code == 200:
                    data = res.json()
                    records = data.get("DisasterDeclarationsSummaries", [])
                    for r in records:
                        incidents.append(HistoricalIncident(
                            incident_type=r.get("incidentType", "Disaster"),
                            year=int(r.get("fyDeclared", datetime.now().year)),
                            title=r.get("declarationTitle", "Federal Emergency Declaration"),
                            county=f"{r.get('designatedArea', 'Region')}, {r.get('state', state_code or 'US')}",
                            fips_code=str(r.get("fipsStateCode", "06")),
                            source="OpenFEMA API v2 Live Feed"
                        ))
        except Exception as e:
            logger.debug(f"OpenFEMA API query notice: {e}")

        return incidents


incident_service = IncidentService()
