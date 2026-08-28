from app.models.route_models import GeoJSONLineString, Route, RouteSample
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


def test_route_with_over_60_pct_severe_hazards_is_rejected():
    # 10 samples, 7 have hazard_score = 0.8 (>0.5 threshold) => 70% severe hazard
    points = [(0.0, index * 0.01) for index in range(10)]
    route = make_route("route_severe_hazard", points)
    for i, s in enumerate(route.samples):
        s.hazard_score = 0.8 if i < 7 else 0.1
    
    viability = assess_route_viability(route, fastest_duration_s=600)
    assert viability.status == "REJECTED"
    assert any("Excessive severe hazard exposure" in reason for reason in viability.rejection_reasons)


def test_route_with_critical_bottlenecks_density_is_rejected():
    from app.models.route_models import BottleneckInfo
    points = [(0.0, index * 0.01) for index in range(10)]
    route = make_route("route_critical_bns", points)
    # 5 out of 10 samples are critical bottlenecks (50% >= 35% gate)
    bottlenecks = [
        BottleneckInfo(
            sample_id=f"route_critical_bns_{i}",
            latitude=0.0,
            longitude=i * 0.01,
            distance_from_origin_m=i * 500,
            bsi_score=0.85,
            hazard_risk=0.55,
            bridge_vulnerability=0.4,
            terrain_penalty=1.0,
            severity_label="Critical",
            description="Severe chokepoint"
        )
        for i in range(5)
    ]
    route.bottlenecks = bottlenecks
    viability = assess_route_viability(route, fastest_duration_s=600)
    assert viability.status == "REJECTED"
    assert any("Excessive critical bottleneck density" in reason for reason in viability.rejection_reasons)


def test_route_with_catastrophic_bsi_is_rejected():
    from app.models.route_models import BottleneckInfo
    points = [(0.0, index * 0.01) for index in range(10)]
    route = make_route("route_catastrophic", points)
    route.bottlenecks = [
        BottleneckInfo(
            sample_id="route_catastrophic_0",
            latitude=0.0,
            longitude=0.0,
            distance_from_origin_m=0,
            bsi_score=2.2,  # >= 2.0 catastrophic threshold
            hazard_risk=0.8,
            bridge_vulnerability=1.8,
            terrain_penalty=1.0,
            severity_label="Critical",
            description="Bridge collapse risk"
        )
    ]
    viability = assess_route_viability(route, fastest_duration_s=600)
    assert viability.status == "REJECTED"
    assert any("Contains catastrophic bottleneck" in reason for reason in viability.rejection_reasons)


def test_trade_off_copy_acknowledges_bottlenecks_on_fastest_route():
    from app.services.agent_service import _generate_trade_off
    points = [(0.0, index * 0.01) for index in range(5)]
    primary = make_route("route_1", points, duration_s=600)
    assess_route_viability(primary, fastest_duration_s=600)
    primary.viability.critical_bottleneck_count = 3
    primary.viability.hazard_exposure_pct = 45.0

    copy = _generate_trade_off([primary], primary, None, [], fastest_duration_s=600)
    assert "No speed-safety trade-off is required" not in copy
    assert "3 critical bottleneck(s)" in copy

