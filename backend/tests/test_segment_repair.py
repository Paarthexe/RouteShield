import pytest
from app.models.route_models import GeoJSONLineString, Route, RouteSample, BottleneckInfo
from app.services.segmentation_service import segmentation_service
from app.services.segment_repair_service import segment_repair_service
from app.services.viability_service import assess_route_viability


def create_test_route(route_id="route_1", num_points=12):
    coords = [[-80.19 + (i * 0.02), 25.76 + (i * 0.02)] for i in range(num_points)]
    samples = [
        RouteSample(
            sample_id=f"{route_id}_{i}",
            route_id=route_id,
            latitude=coords[i][1],
            longitude=coords[i][0],
            distance_from_origin_m=i * 500,
            hazard_score=0.75 if (4 <= i <= 6) else 0.1,
        )
        for i in range(num_points)
    ]
    bottlenecks = [
        BottleneckInfo(
            sample_id=f"{route_id}_{i}",
            latitude=coords[i][1],
            longitude=coords[i][0],
            distance_from_origin_m=i * 500,
            bsi_score=0.9,
            hazard_risk=0.75,
            bridge_vulnerability=0.3,
            terrain_penalty=1.0,
            severity_label="Critical",
            description="Chokepoint"
        )
        for i in [4, 5]
    ]
    route = Route(
        route_id=route_id,
        geometry=GeoJSONLineString(type="LineString", coordinates=coords),
        distance_m=num_points * 500,
        duration_s=600,
        distance_km=num_points * 0.5,
        travel_time_min=10.0,
        samples=samples,
        bottlenecks=bottlenecks
    )
    assess_route_viability(route, fastest_duration_s=600)
    return route


def test_segmentation_breaks_route_into_scored_segments():
    route = create_test_route("route_1", num_points=15)
    segments = segmentation_service.segment_route(route)

    assert len(segments) >= 2
    assert any(s.status == "NEEDS_REPAIR" for s in segments)
    assert any(s.status == "VIABLE" for s in segments)


@pytest.mark.asyncio
async def test_segment_repair_preserves_unaffected_route():
    route = create_test_route("route_1", num_points=15)
    segments = segmentation_service.segment_route(route)
    repair_candidate = next(s for s in segments if s.status == "NEEDS_REPAIR")

    response = await segment_repair_service.repair_segment(
        route=route,
        segment_id=repair_candidate.segment_id,
        action="auto_repair"
    )

    assert response.success is True
    assert response.repaired_segment_id == repair_candidate.segment_id
    assert response.diff.summary is not None
    assert len(response.route.segments) > 0
