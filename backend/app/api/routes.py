from typing import List
from fastapi import APIRouter, HTTPException, status
from app.schemas.routes import RouteGenerateRequest, RouteGenerateResponse, RouteAnalyzeRequest
from app.models.route_models import Coordinate, Location, RouteAnalyzeResponse
from app.services.geocoding import geocoding_service
from app.services.routing import routing_service
from app.config import settings

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("/generate", response_model=RouteGenerateResponse)
async def generate_routes(payload: RouteGenerateRequest):
    routes = await routing_service.generate_candidate_routes(
        origin=payload.origin,
        destination=payload.destination,
        waypoints=payload.waypoints,
        sample_interval_m=payload.sample_interval_m
    )
    return RouteGenerateResponse(routes=routes)


@router.post("/analyze", response_model=RouteAnalyzeResponse)
async def analyze_corridor(payload: RouteAnalyzeRequest):
    if isinstance(payload.origin, str):
        origin_loc = await geocoding_service.resolve_location(payload.origin)
        origin_coord = Coordinate(latitude=origin_loc.latitude, longitude=origin_loc.longitude)
    else:
        origin_coord = payload.origin
        origin_loc = Location(
            query=f"{origin_coord.latitude:.4f},{origin_coord.longitude:.4f}",
            latitude=origin_coord.latitude,
            longitude=origin_coord.longitude,
            display_name=f"({origin_coord.latitude:.4f}, {origin_coord.longitude:.4f})"
        )

    if isinstance(payload.destination, str):
        dest_loc = await geocoding_service.resolve_location(payload.destination)
        dest_coord = Coordinate(latitude=dest_loc.latitude, longitude=dest_loc.longitude)
    else:
        dest_coord = payload.destination
        dest_loc = Location(
            query=f"{dest_coord.latitude:.4f},{dest_coord.longitude:.4f}",
            latitude=dest_coord.latitude,
            longitude=dest_coord.longitude,
            display_name=f"({dest_coord.latitude:.4f}, {dest_coord.longitude:.4f})"
        )

    waypoint_locs: List[Location] = []
    waypoint_coords: List[Coordinate] = []

    for wp in (payload.waypoints or []):
        if isinstance(wp, str):
            w_loc = await geocoding_service.resolve_location(wp)
            w_coord = Coordinate(latitude=w_loc.latitude, longitude=w_loc.longitude)
        else:
            w_coord = wp
            w_loc = Location(
                query=f"{w_coord.latitude:.4f},{w_coord.longitude:.4f}",
                latitude=w_coord.latitude,
                longitude=w_coord.longitude,
                display_name=f"({w_coord.latitude:.4f}, {w_coord.longitude:.4f})"
            )
        waypoint_locs.append(w_loc)
        waypoint_coords.append(w_coord)

    interval = payload.sample_interval_m or settings.ROUTE_SAMPLE_INTERVAL_M

    # Run the full agent pipeline: route gen → sampling → bottleneck → viability → decision
    routes, agent_decision = await routing_service.generate_and_analyze(
        origin=origin_coord,
        destination=dest_coord,
        origin_loc=origin_loc,
        destination_loc=dest_loc,
        waypoints=waypoint_coords,
        sample_interval_m=interval
    )

    return RouteAnalyzeResponse(
        origin=origin_loc,
        destination=dest_loc,
        waypoints=waypoint_locs,
        routes=routes,
        sample_interval_m=interval,
        agent_decision=agent_decision
    )
