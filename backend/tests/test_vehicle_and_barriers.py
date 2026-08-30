import pytest
from app.models.route_models import (
    Route,
    RouteSample,
    GeoJSONLineString,
    HazardBarrier,
)
from app.services.bottleneck_service import analyze_route_bottlenecks
from app.services.viability_service import assess_route_viability
from app.services.sampling import sampling_service


@pytest.mark.asyncio
async def test_hazard_barrier_blocks_sample():
    coords = [[-121.6219, 39.7596], [-121.7000, 39.7400], [-121.8375, 39.7285]]
    geom = GeoJSONLineString(coordinates=coords)

    # Place barrier right on the middle point
    barrier = HazardBarrier(
        id="barrier_1",
        latitude=39.7400,
        longitude=-121.7000,
        radius_m=800.0,
        label="Test Roadblock"
    )

    samples = await sampling_service.sample_route(
        route_id="test_route",
        geometry=geom,
        interval_m=500.0,
        hazard_barriers=[barrier]
    )

    blocked_samples = [s for s in samples if s.is_barrier_blocked]
    assert len(blocked_samples) > 0

    route = Route(
        route_id="test_route",
        geometry=geom,
        distance_m=10000.0,
        duration_s=600.0,
        distance_km=10.0,
        travel_time_min=10.0,
        samples=samples
    )

    bottlenecks, route = analyze_route_bottlenecks(route)
    assert any("ROADBLOCK" in b.description for b in bottlenecks)

    viability = assess_route_viability(route, fastest_duration_s=600.0)
    assert viability.status == "REJECTED"
    assert any("roadblock" in r.lower() for r in viability.rejection_reasons)


def test_emergency_bus_profile_rejects_steep_grade():
    samples = [
        RouteSample(
            sample_id="s1",
            route_id="r1",
            latitude=34.0,
            longitude=-118.0,
            distance_from_origin_m=0.0,
            slope_pct=15.0  # Excessive slope for bus
        ),
        RouteSample(
            sample_id="s2",
            route_id="r1",
            latitude=34.01,
            longitude=-118.01,
            distance_from_origin_m=500.0,
            slope_pct=14.0  # Excessive slope for bus
        )
    ]
    route = Route(
        route_id="r1",
        geometry=GeoJSONLineString(coordinates=[[-118.0, 34.0], [-118.01, 34.01]]),
        distance_m=1000.0,
        duration_s=100.0,
        distance_km=1.0,
        travel_time_min=1.6,
        samples=samples
    )

    bottlenecks, route = analyze_route_bottlenecks(route, vehicle_profile="EMERGENCY_BUS")
    viability = assess_route_viability(route, fastest_duration_s=100.0, vehicle_profile="EMERGENCY_BUS")

    assert viability.status == "REJECTED"
    assert any("bus" in r.lower() for r in viability.rejection_reasons)


def test_rescue_4x4_profile_allows_steep_grade():
    samples = [
        RouteSample(
            sample_id="s1",
            route_id="r1",
            latitude=34.0,
            longitude=-118.0,
            distance_from_origin_m=0.0,
            slope_pct=15.0  # Moderate for 4x4
        ),
        RouteSample(
            sample_id="s2",
            route_id="r1",
            latitude=34.01,
            longitude=-118.01,
            distance_from_origin_m=500.0,
            slope_pct=14.0
        )
    ]
    route = Route(
        route_id="r1",
        geometry=GeoJSONLineString(coordinates=[[-118.0, 34.0], [-118.01, 34.01]]),
        distance_m=1000.0,
        duration_s=100.0,
        distance_km=1.0,
        travel_time_min=1.6,
        samples=samples
    )

    bottlenecks, route = analyze_route_bottlenecks(route, vehicle_profile="RESCUE_4X4")
    viability = assess_route_viability(route, fastest_duration_s=100.0, vehicle_profile="RESCUE_4X4")

    # Rescue 4x4 should not reject 14-15% slope
    assert not any("bus" in r.lower() for r in viability.rejection_reasons)
