from app.models.route_models import GeoJSONLineString, Route, RouteSample, BottleneckInfo
from app.services.redundancy_service import assess_backup_independence, select_independent_backup
from app.services.viability_service import assess_route_viability, rank_routes


def make_route(route_id, points, duration_s=600, bridges=None):
    samples = [
        RouteSample(
            sample_id=f"{route_id}_{index}",
            route_id=route_id,
            latitude=lat,
            longitude=lon,
            distance_from_origin_m=index * 500,
            nbi_bridges=(bridges or {}).get(index),
        )
        for index, (lat, lon) in enumerate(points)
    ]
    return Route(
        route_id=route_id,
        geometry=GeoJSONLineString(type="LineString", coordinates=[[lon, lat] for lat, lon in points]),
        distance_m=max(1, len(points) - 1) * 500,
        duration_s=duration_s,
        distance_km=1.0,
        travel_time_min=duration_s / 60,
        samples=samples,
    )


def test_all_rejected_routes_never_become_primary_or_backup():
    routes = [
        make_route("route_1", [(0.0, 0.0), (0.0, 0.01)]),
        make_route("route_2", [(1.0, 1.0), (1.0, 1.01)]),
    ]
    for route in routes:
        for sample in route.samples:
            sample.hazard_score = 0.9
        assess_route_viability(route, fastest_duration_s=600)

    ranked = rank_routes(routes)

    assert all(route.viability.status == "REJECTED" for route in ranked)


def test_isolated_catastrophic_bottleneck_is_penalized_not_rejected():
    route = make_route(
        "route_1",
        [(0.0, 0.0), (0.0, 0.01), (0.0, 0.02), (0.0, 0.03), (0.0, 0.04)],
        duration_s=600,
    )
    route.samples[2].hazard_score = 0.18
    route.bottlenecks = [
        BottleneckInfo(
            sample_id=route.samples[2].sample_id,
            latitude=route.samples[2].latitude,
            longitude=route.samples[2].longitude,
            distance_from_origin_m=route.samples[2].distance_from_origin_m,
            bsi_score=4.2,
            hazard_risk=0.35,
            bridge_vulnerability=1.2,
            terrain_penalty=1.1,
            severity_label="Critical",
            description="Single critical chokepoint at one turn",
        )
    ]

    viability = assess_route_viability(route, fastest_duration_s=600)

    assert viability.status == "CANDIDATE"
    assert viability.rejection_reasons == []
    assert viability.score <= 57.0


def test_multiple_catastrophic_bottlenecks_still_reject_route():
    route = make_route(
        "route_1",
        [(0.0, 0.0), (0.0, 0.01), (0.0, 0.02), (0.0, 0.03), (0.0, 0.04)],
        duration_s=600,
    )
    route.samples[1].hazard_score = 0.2
    route.samples[3].hazard_score = 0.22
    route.bottlenecks = [
        BottleneckInfo(
            sample_id=route.samples[1].sample_id,
            latitude=route.samples[1].latitude,
            longitude=route.samples[1].longitude,
            distance_from_origin_m=route.samples[1].distance_from_origin_m,
            bsi_score=4.1,
            hazard_risk=0.4,
            bridge_vulnerability=1.3,
            terrain_penalty=1.2,
            severity_label="Critical",
            description="First critical chokepoint",
        ),
        BottleneckInfo(
            sample_id=route.samples[3].sample_id,
            latitude=route.samples[3].latitude,
            longitude=route.samples[3].longitude,
            distance_from_origin_m=route.samples[3].distance_from_origin_m,
            bsi_score=4.4,
            hazard_risk=0.42,
            bridge_vulnerability=1.1,
            terrain_penalty=1.3,
            severity_label="Critical",
            description="Second critical chokepoint",
        ),
    ]

    viability = assess_route_viability(route, fastest_duration_s=600)

    assert viability.status == "REJECTED"
    assert any("catastrophic bottleneck" in reason.lower() for reason in viability.rejection_reasons)


def test_road_closure_keeps_route_rejected_even_with_single_bottleneck():
    route = make_route(
        "route_1",
        [(0.0, 0.0), (0.0, 0.01), (0.0, 0.02), (0.0, 0.03)],
        duration_s=600,
    )
    route.samples[2].traffic_flow = {"road_closed": True}
    route.bottlenecks = [
        BottleneckInfo(
            sample_id=route.samples[2].sample_id,
            latitude=route.samples[2].latitude,
            longitude=route.samples[2].longitude,
            distance_from_origin_m=route.samples[2].distance_from_origin_m,
            bsi_score=4.0,
            hazard_risk=0.3,
            bridge_vulnerability=1.0,
            terrain_penalty=1.0,
            severity_label="Critical",
            description="Closure at critical turn",
        )
    ]

    viability = assess_route_viability(route, fastest_duration_s=600)

    assert viability.status == "REJECTED"
    assert "Active road closure reported along corridor" in viability.rejection_reasons


def test_independent_backup_is_selected_over_overlapping_runner_up():
    primary = make_route("route_1", [(0.0, 0.0), (0.0, 0.01), (0.0, 0.02)])
    overlapping = make_route("route_2", [(0.0, 0.0), (0.0, 0.01), (0.0, 0.02)])
    independent = make_route("route_3", [(1.0, 1.0), (1.0, 1.01), (1.0, 1.02)])

    for score_route, score in [(primary, 90), (overlapping, 85), (independent, 80)]:
        assess_route_viability(score_route, fastest_duration_s=600)
        score_route.viability.score = score
        score_route.viability.status = "PRIMARY" if score_route is primary else "ALTERNATIVE"

    backup, assessment = select_independent_backup(primary, [primary, overlapping, independent])

    assert backup.route_id == "route_3"
    assert assessment.is_independent is True
    assert assessment.corridor_overlap_pct == 0.0


def test_shared_bridge_disqualifies_backup_independence():
    bridge = {"structure_id": "NBI-123"}
    primary = make_route("route_1", [(0.0, 0.0), (0.0, 0.01)], bridges={1: [bridge]})
    candidate = make_route("route_2", [(1.0, 1.0), (1.0, 1.01)], bridges={1: [bridge]})

    assessment = assess_backup_independence(primary, candidate)

    assert assessment.shared_bridge_ids == ["NBI-123"]
    assert assessment.is_independent is False
