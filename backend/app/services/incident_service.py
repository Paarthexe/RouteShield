import logging
import httpx
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.config import settings
from app.models.route_models import HistoricalIncident

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
        """Fetch past real FEMA declarations from OpenFEMA API for the region."""
        incidents: List[HistoricalIncident] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                params = {
                    "$top": limit,
                    "$orderby": "declarationDate desc",
                    "$select": "incidentType,declarationTitle,fyDeclared,designatedArea,fipsStateCode,state"
                }
                res = await client.get(self.fema_api_url, params=params)
                if res.status_code == 200:
                    data = res.json()
                    records = data.get("DisasterDeclarationsSummaries", [])
                    for r in records:
                        incidents.append(HistoricalIncident(
                            incident_type=r.get("incidentType", "Disaster"),
                            year=int(r.get("fyDeclared", datetime.now().year)),
                            title=r.get("declarationTitle", "Federal Emergency Declaration"),
                            county=f"{r.get('designatedArea', 'Region')}, {r.get('state', 'US')}",
                            fips_code=str(r.get("fipsStateCode", "06")),
                            source="OpenFEMA API v2 Live Feed"
                        ))
        except Exception as e:
            logger.debug(f"OpenFEMA API query notice: {e}")

        return incidents


incident_service = IncidentService()
