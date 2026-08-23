import logging
from typing import List, Tuple
from app.models.route_models import Route, RouteSample, BottleneckInfo

logger = logging.getLogger(__name__)

# BSI thresholds
BSI_CRITICAL = 0.65
BSI_MODERATE = 0.35


def _bridge_vulnerability(sample: RouteSample) -> float:
    """
    Compute bridge vulnerability score according to official FHWA NBIS (23 CFR 650) standards.
    Condition 7-9 (Good): 0.0 vulnerability
    Condition 5-6 (Fair): 0.20 vulnerability
    Condition 4 (Poor / Structurally Deficient): 1.0 vulnerability
    Condition 0-3 (Critical / Imminent Failure): 2.5 vulnerability
    """
    bridges = sample.nbi_bridges or []
    if not bridges:
        return 0.0

    worst = 0.0
    for b in bridges:
        deck = str(b.get("deck_condition", "")).strip()
        super_cond = str(b.get("super_condition", "")).strip()
        sub_cond = str(b.get("sub_condition", "")).strip()

        def parse_cond(val: str) -> float:
            if val.isdigit():
                return float(val)
            return 7.0  # Default to good/operational if unrated

        deck_val = parse_cond(deck)
        super_val = parse_cond(super_cond)
        sub_val = parse_cond(sub_cond)

        min_cond = min(deck_val, super_val, sub_val)

        if min_cond <= 3:
            vuln = 2.5  # Critical / Imminent Failure
        elif min_cond <= 4:
            vuln = 1.0  # Structurally Deficient (Poor)
        elif min_cond <= 6:
            vuln = 0.20 # Fair condition
        else:
            vuln = 0.0  # Good / Excellent (No penalty)

        worst = max(worst, vuln)

    return min(worst, 2.5)


def _terrain_penalty(slope_pct: float) -> float:
    """
    Terrain penalty based on slope grade (AASHTO Green Book standards).
    Flat (0-3%) = 1.0, moderate (3-8%) = 1.15, steep (8-15%) = 1.35, extreme (>15%) = 1.60
    """
    abs_slope = abs(slope_pct) if slope_pct is not None else 0.0
    if abs_slope > 15.0:
        return 1.60
    elif abs_slope > 8.0:
        return 1.35
    elif abs_slope > 3.0:
        return 1.15
    return 1.0


def _hazard_risk(sample: RouteSample) -> float:
    """
    Compute hazard risk score for a sample [0.0 - 1.0].
    Based on seismic PGA, severe terrain grade, active alerts, and Mireye hazard facts.
    """
    risk = 0.0
    mireye = sample.mireye_data or {}

    # Seismic Peak Ground Acceleration (PGA) — USGS ShakeMap Scale
    pga = mireye.get("seismic_pga_g")
    if pga is not None:
        if pga >= 0.50:
            risk += 0.50  # Violent shaking / structural damage threshold
        elif pga >= 0.30:
            risk += 0.35  # Strong shaking
        elif pga >= 0.15:
            risk += 0.15  # Moderate shaking
        elif pga >= 0.08:
            risk += 0.05

    # Slope grade risk
    slope = sample.slope_pct
    if slope is not None:
        abs_slope = abs(slope)
        if abs_slope > 15.0:
            risk += 0.35  # Extreme mountain pass
        elif abs_slope > 8.0:
            risk += 0.20  # Steep highway grade
        elif abs_slope > 5.0:
            risk += 0.08

    # Check Mireye raw fields for environmental hazard signals (wildfire, flood, landslide)
    raw_fields = mireye.get("raw_fields", {})
    for field_name, field_data in raw_fields.items():
        fname_lower = field_name.lower()
        if any(kw in fname_lower for kw in ["flood", "wildfire", "fire", "landslide", "tsunami", "hazard"]):
            val = field_data.get("value") if isinstance(field_data, dict) else None
            if val is not None and isinstance(val, (int, float)) and val > 0:
                risk += min(0.40, (val / 10.0) * 0.40)

    # Active NWS Weather / Flood Warnings at this coordinate
    if sample.traffic_flow and sample.traffic_flow.get("alerts"):
        risk += 0.30

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
