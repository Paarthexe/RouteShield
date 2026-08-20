import logging
from typing import List, Tuple
from app.models.route_models import Route, RouteSample, BottleneckInfo

logger = logging.getLogger(__name__)

# BSI thresholds
BSI_CRITICAL = 0.65
BSI_MODERATE = 0.35


def _bridge_vulnerability(sample: RouteSample) -> float:
    """
    Compute bridge vulnerability score for a sample point.
    Returns 0.0 (no bridge) to 2.0 (poor condition bridge).
    """
    bridges = sample.nbi_bridges or []
    if not bridges:
        return 0.0

    worst = 0.0
    for b in bridges:
        deck = str(b.get("deck_condition", "")).strip()
        super_cond = str(b.get("super_condition", "")).strip()
        sub_cond = str(b.get("sub_condition", "")).strip()

        # Normalize condition codes to numeric (0-9, higher = better)
        def parse_cond(val: str) -> float:
            if val.isdigit():
                return float(val)
            return 5.0  # unknown defaults to fair

        deck_val = parse_cond(deck)
        super_val = parse_cond(super_cond)
        sub_val = parse_cond(sub_cond)

        # Use worst of the three conditions
        min_cond = min(deck_val, super_val, sub_val)

        # Age penalty
        age = b.get("age_years")
        age_penalty = 0.0
        if age is not None:
            if age > 60:
                age_penalty = 0.4
            elif age > 40:
                age_penalty = 0.2

        if min_cond <= 4:
            vuln = 2.0 + age_penalty  # Poor
        elif min_cond <= 6:
            vuln = 1.0 + age_penalty  # Fair
        elif min_cond <= 9:
            vuln = 0.2  # Good
        else:
            vuln = 0.5  # Unknown

        worst = max(worst, vuln)

    return min(worst, 2.5)  # Cap at 2.5


def _terrain_penalty(slope_pct: float) -> float:
    """
    Terrain penalty based on slope grade.
    Flat (0-3%) = 1.0, moderate (3-8%) = 1.2, steep (8-15%) = 1.5, extreme (>15%) = 1.8
    """
    abs_slope = abs(slope_pct) if slope_pct is not None else 0.0
    if abs_slope > 15.0:
        return 1.8
    elif abs_slope > 8.0:
        return 1.5
    elif abs_slope > 3.0:
        return 1.2
    return 1.0


def _hazard_risk(sample: RouteSample) -> float:
    """
    Compute hazard risk score for a sample [0.0 - 1.0].
    Based on seismic PGA, steep slope, low elevation, and Mireye raw fields.
    Scaled for higher sensitivity to physical environmental hazards.
    """
    risk = 0.0
    mireye = sample.mireye_data or {}

    # Seismic PGA contribution (0 - 0.50)
    pga = mireye.get("seismic_pga_g")
    if pga is not None:
        if pga >= 0.5:
            risk += 0.50
        elif pga >= 0.3:
            risk += 0.35
        elif pga >= 0.15:
            risk += 0.20
        elif pga >= 0.08:
            risk += 0.10

    # Slope contribution (0 - 0.40)
    slope = sample.slope_pct
    if slope is not None:
        abs_slope = abs(slope)
        if abs_slope > 12.0:
            risk += 0.40
        elif abs_slope > 7.0:
            risk += 0.28
        elif abs_slope > 3.5:
            risk += 0.15

    # Low elevation / flood plain contribution (0 - 0.40)
    elev = mireye.get("elevation_m")
    if elev is not None:
        if elev < 5.0:
            risk += 0.40  # Coastal / tidal flood zone
        elif elev < 20.0:
            risk += 0.28  # Low-lying flood plain
        elif elev < 50.0:
            risk += 0.12

    # Check Mireye raw fields for additional hazard signals (wildfire, flood, landslide)
    raw_fields = mireye.get("raw_fields", {})
    for field_name, field_data in raw_fields.items():
        fname_lower = field_name.lower()
        if any(kw in fname_lower for kw in ["flood", "wildfire", "fire", "landslide", "tsunami", "hazard"]):
            val = field_data.get("value") if isinstance(field_data, dict) else None
            if val is not None and isinstance(val, (int, float)) and val > 0:
                risk += min(0.40, (val / 10.0) * 0.40)

    return min(risk, 1.0)


def analyze_route_bottlenecks(route: Route) -> Tuple[List[BottleneckInfo], Route]:
    """
    Analyze all sample points in a route to identify bottlenecks.
    Returns (list of bottlenecks, updated route with hazard_score on samples).
    """
    bottlenecks: List[BottleneckInfo] = []
    updated_samples: List[RouteSample] = []

    for sample in route.samples:
        h_risk = _hazard_risk(sample)
        b_vuln = _bridge_vulnerability(sample)
        t_penalty = _terrain_penalty(sample.slope_pct)

        bsi = h_risk * (1.0 + b_vuln) * t_penalty

        # Update sample with hazard score
        sample.hazard_score = round(h_risk, 3)
        updated_samples.append(sample)

        if bsi >= BSI_MODERATE:
            # Determine severity label
            if bsi >= BSI_CRITICAL:
                severity = "Critical"
            else:
                severity = "Moderate"

            # Build description
            desc_parts = []
            if b_vuln > 1.5:
                bridges = sample.nbi_bridges or []
                bridge_ids = [b.get("structure_id", "Unknown") for b in bridges[:2]]
                desc_parts.append(f"Poor-condition bridge(s) {', '.join(bridge_ids)}")
            elif b_vuln > 0.5:
                desc_parts.append("Aging/fair-condition bridge infrastructure")

            if h_risk > 0.3:
                risk_factors = []
                mireye = sample.mireye_data or {}
                if mireye.get("seismic_pga_g", 0) >= 0.2:
                    risk_factors.append(f"seismic PGA {mireye['seismic_pga_g']:.2f}g")
                if sample.slope_pct and abs(sample.slope_pct) > 8:
                    risk_factors.append(f"steep grade {abs(sample.slope_pct):.1f}%")
                elev = mireye.get("elevation_m")
                if elev is not None and elev < 20:
                    risk_factors.append(f"low elevation {elev:.0f}m")
                if risk_factors:
                    desc_parts.append(f"Hazard exposure: {', '.join(risk_factors)}")

            if t_penalty > 1.2:
                desc_parts.append(f"Terrain difficulty (penalty {t_penalty:.1f}x)")

            description = ". ".join(desc_parts) if desc_parts else f"BSI {bsi:.2f} detected"

            bottlenecks.append(BottleneckInfo(
                sample_id=sample.sample_id,
                latitude=sample.latitude,
                longitude=sample.longitude,
                distance_from_origin_m=sample.distance_from_origin_m,
                bsi_score=round(bsi, 3),
                hazard_risk=round(h_risk, 3),
                bridge_vulnerability=round(b_vuln, 3),
                terrain_penalty=round(t_penalty, 3),
                severity_label=severity,
                description=description
            ))

    route.samples = updated_samples
    route.bottlenecks = bottlenecks

    logger.info(
        f"Route {route.route_id}: {len(bottlenecks)} bottlenecks detected "
        f"({sum(1 for b in bottlenecks if b.severity_label == 'Critical')} critical)"
    )

    return bottlenecks, route
