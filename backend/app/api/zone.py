from fastapi import APIRouter
from app.models.route_models import ZoneEvacuationRequest, ZoneEvacuationResponse
from app.services.zone_service import zone_service

router = APIRouter(prefix="/zones", tags=["zones"])

@router.post("/plan", response_model=ZoneEvacuationResponse)
async def plan_zone_evacuation(payload: ZoneEvacuationRequest):
    """
    Plan multi-origin evacuation zone assignments to safe staging centers.
    """
    return await zone_service.plan_zone_evacuation(payload)
