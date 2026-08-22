import logging
from typing import List
from app.models.route_models import Route, RouteViability

logger = logging.getLogger(__name__)

# Weights for viability score formula
W_HAZARD_EXPOSURE = 40.0
W_BOTTLENECK_PENALTY = 25.0
W_TIME_DELTA = 10.0

# Rejection thresholds
REJECT_BSI_THRESHOLD = 3.5          # Catastrophic bottleneck threshold
REJECT_HAZARD_EXPOSURE_PCT = 0.50   # > 50% of samples with hazard_score > 0.5 = auto-reject


def assess_route_viability(route: Route, fastest_duration_s: float) -> RouteViability:
    """
    Calculate viability score (0-100) for a route and determine its status.
    """
    samples = route.samples
    bottlenecks = route.bottlenecks
    total_samples = len(samples) if samples else 1

    # --- Hazard Exposure Percentage ---
    hazardous_count = sum(1 for s in samples if (s.hazard_score or 0) > 0.3)
    hazard_exposure_pct = round(hazardous_count / total_samples, 3)

    # --- Bottleneck Metrics ---
    bottleneck_count = len(bottlenecks)
    critical_bottleneck_count = sum(1 for b in bottlenecks if b.severity_label == "Critical")
    max_bsi = max((b.bsi_score for b in bottlenecks), default=0.0)

    # --- Bottleneck Penalty (0-1) ---
    if bottleneck_count == 0:
        bottleneck_penalty = 0.0
    else:
        bsi_sum = sum(b.bsi_score for b in bottlenecks)
        bottleneck_penalty = min(1.0, bsi_sum / (total_samples * 0.4))

    # --- Time Delta Penalty (0-1) ---
    time_delta_s = route.duration_s - fastest_duration_s
    if time_delta_s <= 0:
        time_delta_penalty = 0.0
    else:
        time_delta_penalty = min(1.0, time_delta_s / 1800.0)

    # --- Viability Score ---
    score = 100.0 - (
        W_HAZARD_EXPOSURE * hazard_exposure_pct +
        W_BOTTLENECK_PENALTY * bottleneck_penalty +
        W_TIME_DELTA * time_delta_penalty
    )
    score = round(max(0.0, min(100.0, score)), 1)

    # --- Rejection Rules ---
    rejection_reasons: List[str] = []

    if max_bsi > REJECT_BSI_THRESHOLD:
        rejection_reasons.append(
            f"Contains catastrophic bottleneck (BSI {max_bsi:.2f} > {REJECT_BSI_THRESHOLD})"
        )

    high_hazard_count = sum(1 for s in samples if (s.hazard_score or 0) > 0.5)
    high_hazard_pct = high_hazard_count / total_samples
    if high_hazard_pct > REJECT_HAZARD_EXPOSURE_PCT:
        rejection_reasons.append(
            f"Excessive hazard exposure ({high_hazard_pct:.0%} of corridor above threshold)"
        )

    status = "REJECTED" if rejection_reasons else "CANDIDATE"

    viability = RouteViability(
        score=score,
        status=status,
        hazard_exposure_pct=round(hazard_exposure_pct * 100, 1),
        bottleneck_count=bottleneck_count,
        critical_bottleneck_count=critical_bottleneck_count,
        max_bsi=round(max_bsi, 3),
        rejection_reasons=rejection_reasons
    )

    route.viability = viability
    route.viability_score = score

    logger.info(
        f"Route {route.route_id}: Viability={score:.1f}, "
        f"Status={status}, Bottlenecks={bottleneck_count} "
        f"(Critical={critical_bottleneck_count}), "
        f"HazardExposure={hazard_exposure_pct:.1%}"
    )

    return viability


def rank_routes(routes: List[Route]) -> List[Route]:
    """
    Rank routes by viability score and assign PRIMARY / BACKUP / REJECTED status.
    If all routes are rejected, preserve the rejection gate. A rejected route
    must never be relabeled as PRIMARY or BACKUP.
    """
    rejected = [r for r in routes if r.viability and r.viability.status == "REJECTED"]
    candidates = [r for r in routes if r.viability and r.viability.status != "REJECTED"]

    candidates.sort(key=lambda r: r.viability.score if r.viability else 0, reverse=True)

    if candidates:
        for i, route in enumerate(candidates):
            if i == 0:
                route.viability.status = "PRIMARY"
            elif i == 1:
                route.viability.status = "BACKUP"
            else:
                route.viability.status = "ALTERNATIVE"
        all_ranked = candidates + rejected
    else:
        # No viable corridor exists. Keep every route REJECTED and sort only for
        # display so the least-bad option can still be reviewed as a contingency.
        rejected.sort(key=lambda r: r.viability.score if r.viability else 0, reverse=True)
        all_ranked = rejected

    return all_ranked
