from fastapi import APIRouter, HTTPException
from app.schemas.location import LocationResolveRequest, LocationResolveResponse
from app.services.geocoding import geocoding_service

router = APIRouter(prefix="/location", tags=["Location Resolution"])

@router.post("/resolve", response_model=LocationResolveResponse)
async def resolve_location(payload: LocationResolveRequest):
    """
    Resolve a freeform location query (address, place name, landmark) 
    into exact latitude and longitude coordinates.
    """
    location = await geocoding_service.resolve_location(payload.query)
    return LocationResolveResponse(
        query=location.query,
        latitude=location.latitude,
        longitude=location.longitude,
        display_name=location.display_name
    )
