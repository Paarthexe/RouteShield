"""Route overlap and backup-independence checks for evacuation corridors."""

from __future__ import annotations
from typing import Iterable, List, Tuple

from app.models.route_models import BackupIndependence, Route
from app.utils.geo import haversine_distance


OVERLAP_DISTANCE_M = 350.0
MIN_INDEPENDENCE_SCORE = 60.0


def _route_points(route: Route) -> List[Tuple[float, float]]:
    if route.samples:
        return [(sample.latitude, sample.longitude) for sample in route.samples]
    return [(lat, lon) for lon, lat in route.geometry.coordinates]


def _bridge_ids(route: Route) -> set[str]:
    return {
        str(bridge["structure_id"])
        for sample in route.samples
        for bridge in (sample.nbi_bridges or [])
        if bridge.get("structure_id")
    }


def assess_backup_independence(primary: Route, candidate: Route) -> BackupIndependence:
    """Measure whether a candidate gives the primary corridor a meaningful bypass."""
    primary_points = _route_points(primary)
    candidate_points = _route_points(candidate)

    if not primary_points or not candidate_points:
        return BackupIndependence(
            primary_route_id=primary.route_id,
            backup_route_id=candidate.route_id,
            corridor_overlap_pct=100.0,
            shared_bridge_ids=[],
            independence_score=0.0,
            is_independent=False,
            explanation="Insufficient route geometry to verify corridor independence.",
        )

    overlapping = sum(
        1
        for candidate_lat, candidate_lon in candidate_points
        if min(
            haversine_distance(candidate_lat, candidate_lon, primary_lat, primary_lon)
            for primary_lat, primary_lon in primary_points
        ) <= OVERLAP_DISTANCE_M
    )
    overlap_pct = round((overlapping / len(candidate_points)) * 100.0, 1)
    shared_bridges = sorted(_bridge_ids(primary) & _bridge_ids(candidate))

    score = max(0.0, 100.0 - overlap_pct - min(40.0, len(shared_bridges) * 20.0))
    is_independent = score >= MIN_INDEPENDENCE_SCORE and not shared_bridges

    if shared_bridges:
        explanation = (
            f"Shares {len(shared_bridges)} bridge record(s) with the primary corridor "
            f"and overlaps {overlap_pct:.0f}% of sampled route points."
        )
    elif is_independent:
        explanation = f"Uses a meaningfully separate corridor with only {overlap_pct:.0f}% sampled overlap."
    else:
        explanation = f"Overlaps {overlap_pct:.0f}% of sampled route points, so it is not an independent bypass."

    return BackupIndependence(
        primary_route_id=primary.route_id,
        backup_route_id=candidate.route_id,
        corridor_overlap_pct=overlap_pct,
        shared_bridge_ids=shared_bridges,
        independence_score=round(score, 1),
        is_independent=is_independent,
        explanation=explanation,
    )


def select_independent_backup(primary: Route, routes: Iterable[Route]) -> tuple[Route | None, BackupIndependence | None]:
    """Choose the strongest viable candidate that is also a separate corridor."""
    candidates = sorted(
        (
            route for route in routes
            if route.route_id != primary.route_id and route.viability and route.viability.status != "REJECTED"
        ),
        key=lambda route: route.viability.score if route.viability else 0.0,
        reverse=True,
    )

    assessments = [(route, assess_backup_independence(primary, route)) for route in candidates]
    independent = [(route, assessment) for route, assessment in assessments if assessment.is_independent]
    if independent:
        return independent[0]
    return None, assessments[0][1] if assessments else None
