from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query, Path
from fastapi.responses import StreamingResponse
from app.schemas.routes import RouteGenerateRequest, RouteGenerateResponse, RouteAnalyzeRequest
from app.models.route_models import (
    Coordinate,
    Location,
    RouteAnalyzeResponse,
    SegmentRepairRequest,
    SegmentRepairResponse,
)
from app.services.geocoding import geocoding_service
from app.services.routing import routing_service
from app.services.monitoring_service import monitoring_service
from app.services.segment_repair_service import segment_repair_service
from app.services.nbi_service import nbi_service
from app.config import settings

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("/generate", response_model=RouteGenerateResponse)
async def generate_routes(payload: RouteGenerateRequest):
    routes = await routing_service.generate_candidate_routes(
        origin=payload.origin,
        destination=payload.destination,
        waypoints=payload.waypoints,
        sample_interval_m=payload.sample_interval_m,
        disaster_type=payload.disaster_type or "ALL_HAZARDS"
    )
    for r in routes:
        monitoring_service.register_route(r)
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
    disaster_mode = payload.disaster_type or "ALL_HAZARDS"

    # Run the full agent pipeline: route gen -> sampling -> bottleneck -> viability -> decision
    routes, agent_decision = await routing_service.generate_and_analyze(
        origin=origin_coord,
        destination=dest_coord,
        origin_loc=origin_loc,
        destination_loc=dest_loc,
        waypoints=waypoint_coords,
        sample_interval_m=interval,
        disaster_type=disaster_mode
    )

    # Register routes for live monitoring
    for r in routes:
        monitoring_service.register_route(r)

    return RouteAnalyzeResponse(
        origin=origin_loc,
        destination=dest_loc,
        waypoints=waypoint_locs,
        routes=routes,
        sample_interval_m=interval,
        disaster_type=disaster_mode,
        nbi_fallback_mode=nbi_service.is_fallback_mode(),
        agent_decision=agent_decision
    )


@router.get("/{route_id}/live")
async def stream_live_monitoring(
    route_id: str = Path(..., description="ID of route to monitor"),
    current_sample_id: Optional[str] = Query(None, description="Sample ID representing current traveler position"),
    disaster_type: str = Query("ALL_HAZARDS", description="Active disaster protocol")
):
    """
    Server-Sent Events (SSE) stream for real-time corridor monitoring and delta detection.
    """
    event_generator = monitoring_service.stream_live_events(
        route_id=route_id,
        current_sample_id=current_sample_id,
        disaster_type=disaster_type
    )
    return StreamingResponse(
        event_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/{route_id}/segments/{segment_id}/repair", response_model=SegmentRepairResponse)
async def repair_route_segment(
    route_id: str = Path(...),
    segment_id: str = Path(...),
    payload: Optional[SegmentRepairRequest] = None
):
    """
    Human-in-the-loop and automatic segment-level repair endpoint.
    Queries OSRM for alternative sub-corridors and splices the repaired geometry into the route.
    """
    route = monitoring_service.get_route(route_id)
    if not route:
        raise HTTPException(
            status_code=404,
            detail=f"Route '{route_id}' is not in active session. Please analyze corridors first."
        )

    action = payload.action if payload else "auto_repair"
    avoid_coord = payload.avoid_coordinate if payload else None
    disaster_type = payload.disaster_type if payload else "ALL_HAZARDS"

    result = await segment_repair_service.repair_segment(
        route=route,
        segment_id=segment_id,
        action=action,
        avoid_coordinate=avoid_coord,
        disaster_type=disaster_type
    )

    # Re-register updated route in monitoring store
    monitoring_service.register_route(result.route)

    return result


