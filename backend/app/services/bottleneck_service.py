import logging
from typing import List, Tuple, Optional
from app.models.route_models import Route, RouteSample, BottleneckInfo

logger = logging.getLogger(__name__)

# BSI thresholds (calibrated for real-world corridor evaluation)
BSI_CRITICAL = 0.70
BSI_MODERATE = 0.40


def _bridge_vulnerability(sample: RouteSample, disaster_type: str = "ALL_HAZARDS") -> float:
    """
    Compute bridge vulnerability score for a sample point across all FHWA NBI
    component ratings (Item 58 Deck, 59 Superstructure, 60 Substructure,
    61 Channel Scour, 62 Culvert) plus Sufficiency Rating (Item 66).
    Returns 0.0 (no bridge) to 2.2 (critically deficient structure).
    """
    bridges = sample.nbi_bridges or []
    if not bridges:
        return 0.0

    worst = 0.0
    for b in bridges:
        deck = str(b.get("deck_condition", "")).strip()
        super_cond = str(b.get("super_condition", "")).strip()
        sub_cond = str(b.get("sub_condition", "")).strip()
        channel_cond = str(b.get("channel_condition", "")).strip()
        culvert_cond = str(b.get("culvert_condition", "")).strip()

        # Parse numeric ratings (0-9)
        def parse_cond(val: str) -> Optional[float]:
            if val.isdigit():
                return float(val)
            return None

        ratings = [
            parse_cond(deck),
            parse_cond(super_cond),
            parse_cond(sub_cond),
            parse_cond(channel_cond),
            parse_cond(culvert_cond)
        ]
        valid_ratings = [r for r in ratings if r is not None]

        # Use worst component rating (standard FHWA structural deficiency criterion)
        min_cond = min(valid_ratings) if valid_ratings else 6.0

        # Age penalty (for structures built >45 or >60 years ago)
        age = b.get("age_years")
        age_penalty = 0.0
        if age is not None and min_cond <= 6:
            if age > 60:
                age_penalty = 0.3
            elif age > 45:
                age_penalty = 0.15

        # Sufficiency Rating penalty (Item 66, 0-100 scale)
        suff = b.get("sufficiency_rating")
        suff_penalty = 0.0
        if suff is not None:
            if suff < 50.0:
                suff_penalty = 0.3  # Severe deficiency
            elif suff < 75.0:
                suff_penalty = 0.15

        # Disaster-specific bridge multiplier
        disaster_boost = 0.0
        if disaster_type == "EARTHQUAKE" and min_cond <= 6:
            disaster_boost = 0.3  # Structural vulnerability under ground acceleration
        elif disaster_type == "FLOOD_HURRICANE" and (parse_cond(channel_cond) or 9.0) <= 5:
            disaster_boost = 0.3  # Scour critical channel vulnerability

        if min_cond <= 4 or b.get("structurally_deficient") is True:
            vuln = 1.8 + age_penalty + suff_penalty + disaster_boost
        elif min_cond <= 6:
            vuln = 0.7 + age_penalty + suff_penalty + disaster_boost
        elif min_cond <= 9:
            vuln = 0.1
        else:
            vuln = 0.3

        worst = max(worst, vuln)

    return min(worst, 2.2)


def _terrain_penalty(slope_pct: float) -> float:
    """
    Terrain penalty based on slope grade.
    Flat / standard highway grade (0-6%) = 1.0, moderate grade (6-10%) = 1.15,
    steep mountain grade (10-18%) = 1.4, extreme grade (>18%) = 1.7
    """
    abs_slope = abs(slope_pct) if slope_pct is not None else 0.0
    if abs_slope > 18.0:
        return 1.7
    elif abs_slope > 10.0:
        return 1.4
    elif abs_slope > 6.0:
        return 1.15
    return 1.0


def _hazard_risk(sample: RouteSample, disaster_type: str = "ALL_HAZARDS") -> float:
    """
    Compute hazard risk score for a sample [0.0 - 1.0] calibrated to the active disaster
    and modeling real physical disaster cascades (e.g. Wildfire -> Debris Flow in burn scars,
    Earthquake -> Co-seismic Rockslides & Overpass Collapses, Flood -> Bridge Scour).
    """
    risk = 0.0
    mireye = sample.mireye_data or {}
    weather = sample.weather or {}
    bridges = sample.nbi_bridges or []

    # Extract base environmental facts
    pga = mireye.get("seismic_pga_g") or 0.0
    fhsz = mireye.get("fire_hazard_zone")
    wf_freq = mireye.get("wildfire_annual_freq") or 0.0
    fire_dist = mireye.get("nearest_fire_perimeter_m", float("inf"))
    burn_year = mireye.get("most_recent_burn_year")
    flood_zone = str(mireye.get("fema_flood_zone", ""))
    is_floodplain = (
        mireye.get("within_floodplain") is True
        or flood_zone.startswith("A")
        or mireye.get("coastal_high_hazard") is True
    )
    dam_dist = mireye.get("nearest_dam_distance_m")
    dam_hazard = mireye.get("nearest_dam_hazard")
    ls = mireye.get("landslide_susceptibility") or 0
    elev = mireye.get("elevation_m")
    precip_prob = weather.get("precipitation_probability_pct") or 0
    wind_speed_kmh = weather.get("wind_speed_kmh") or 0
    wind_gust_kmh = weather.get("wind_gust_kmh") or 0
    visibility_m = weather.get("visibility_m")
    humidity_pct = weather.get("relative_humidity_pct")

    slope = sample.slope_pct
    if slope is None:
        slope_deg = mireye.get("slope_degrees")
        if slope_deg is not None:
            import math
            slope = math.tan(math.radians(slope_deg)) * 100.0
    abs_slope = abs(slope) if slope is not None else 0.0

    # Has active wildfire exposure?
    has_fire_risk = (
        fhsz in ("Very High", "High", "Moderate")
        or fire_dist < 2000.0
        or wf_freq >= 0.0003
    )

    # Has active flood exposure?
    has_flood_risk = (
        is_floodplain
        or (elev is not None and elev < 10.0 and mireye.get("coastal_high_hazard") is True)
        or mireye.get("intersects_nhd_area") is True
    )

    # Has active seismic ground motion?
    has_seismic_risk = pga >= 0.25

    # -------------------------------------------------------------
    # 1. WILDFIRE PROTOCOL & CASCADES
    # -------------------------------------------------------------
    if disaster_type == "WILDFIRE":
        # Direct Wildfire Signals (2.0x base weight)
        if fhsz == "Very High":
            risk += 0.50
        elif fhsz == "High":
            risk += 0.35
        elif fhsz == "Moderate":
            risk += 0.18

        if fire_dist < 100.0:
            risk += 0.35
        elif fire_dist < 1500.0 and burn_year and burn_year >= 2015:
            risk += 0.20

        if wf_freq >= 0.001:
            risk += 0.35
        elif wf_freq >= 0.0003:
            risk += 0.20

        # High wind fan the flames (1.5x)
        wind_mph = mireye.get("wind_speed_mph")
        if wind_mph and wind_mph >= 130:
            risk += 0.12
        if wind_gust_kmh >= 45:
            risk += 0.18
        elif wind_speed_kmh >= 30:
            risk += 0.10
        if humidity_pct is not None and humidity_pct <= 25:
            risk += 0.10

        # CASCADING DISASTER: Post-Wildfire Debris Flow & Rockfall
        # If the area has wildfire/burn exposure AND steep slopes, soil hydrophobicity triggers mudslides!
        if has_fire_risk:
            if abs_slope > 15.0 or ls >= 70:
                risk += 0.30  # Severe post-fire debris flow cascade
            elif abs_slope > 10.0 or ls >= 40:
                risk += 0.18
        else:
            # Suppress isolated landslide/slope/flood noise in non-burned areas during wildfire evacuation
            if ls >= 70 or abs_slope > 18.0:
                risk += 0.05

    # -------------------------------------------------------------
    # 2. FLOOD & HURRICANE PROTOCOL & CASCADES
    # -------------------------------------------------------------
    elif disaster_type == "FLOOD_HURRICANE":
        # Direct Inundation Signals (2.0x base weight)
        if mireye.get("coastal_high_hazard") is True:
            risk += 0.50
        elif is_floodplain:
            risk += 0.40
        elif mireye.get("flood_zone_subtype", "") == "0.2 PCT ANNUAL CHANCE FLOOD HAZARD":
            risk += 0.15

        if elev is not None and elev < 4.0:
            risk += 0.40
        elif elev is not None and elev < 12.0:
            risk += 0.25

        if mireye.get("intersects_nhd_area") is True:
            risk += 0.20
        if precip_prob >= 80:
            risk += 0.20
        elif precip_prob >= 60:
            risk += 0.10

        swp = mireye.get("surface_water_permanence_pct")
        if swp is not None and swp >= 75:
            risk += 0.20

        # CASCADING DISASTER: Bridge Abutment Scour & Dam Inundation
        if is_floodplain and bridges:
            risk += 0.30  # Hydrodynamic bridge scour collapse cascade

        if dam_hazard == "High" and dam_dist is not None and dam_dist < 2000.0:
            risk += 0.35  # Dam overtopping / breach cascade
        elif dam_hazard == "High" and dam_dist is not None and dam_dist < 5000.0:
            risk += 0.20

        # Heavy rain mudslide cascade in floodplains with steep canyon walls
        if has_flood_risk and abs_slope > 12.0:
            risk += 0.20
        if visibility_m is not None and visibility_m < 4000:
            risk += 0.08

    # -------------------------------------------------------------
    # 3. EARTHQUAKE PROTOCOL & CASCADES
    # -------------------------------------------------------------
    elif disaster_type == "EARTHQUAKE":
        # Direct Ground Motion (2.0x base weight)
        if pga >= 0.6:
            risk += 0.60
        elif pga >= 0.4:
            risk += 0.45
        elif pga >= 0.2:
            risk += 0.25

        # CASCADING DISASTER: Co-seismic Rockslides & Overpass Collapses
        if has_seismic_risk and (abs_slope > 12.0 or ls >= 50):
            risk += 0.35  # Co-seismic slope failure / rockfall

        if has_seismic_risk and bridges:
            risk += 0.30  # Structural bridge resonance / unseating

        if has_seismic_risk and dam_hazard == "High" and dam_dist and dam_dist < 3000.0:
            risk += 0.30  # Co-seismic dam structural failure
        if visibility_m is not None and visibility_m < 3000:
            risk += 0.05

    # -------------------------------------------------------------
    # 4. LANDSLIDE PROTOCOL & CASCADES
    # -------------------------------------------------------------
    elif disaster_type == "LANDSLIDE":
        if ls >= 70:
            risk += 0.50
        elif ls >= 40:
            risk += 0.35
        elif ls >= 20:
            risk += 0.18

        if abs_slope > 18.0:
            risk += 0.45
        elif abs_slope > 12.0:
            risk += 0.30
        elif abs_slope > 7.0:
            risk += 0.15

        # Saturated slope cascade (near river channel or floodplain)
        if (has_flood_risk or mireye.get("intersects_nhd_area")) and abs_slope > 8.0:
            risk += 0.25  # Water-saturated debris flow
        if precip_prob >= 75:
            risk += 0.22
        elif precip_prob >= 50:
            risk += 0.12

        # Post-fire scar slope failure cascade
        if has_fire_risk and abs_slope > 8.0:
            risk += 0.25  # Burn scar debris flow

    # -------------------------------------------------------------
    # 5. ALL HAZARDS (Composite)
    # -------------------------------------------------------------
    else:
        if pga >= 0.4:
            risk += 0.30
        elif pga >= 0.2:
            risk += 0.15

        if abs_slope > 15.0:
            risk += 0.20
        elif abs_slope > 8.0:
            risk += 0.10

        if is_floodplain:
            risk += 0.20
        if fhsz in ("Very High", "High"):
            risk += 0.20
        if fire_dist < 100.0:
            risk += 0.15
        if ls >= 50:
            risk += 0.15
        if dam_hazard == "High" and dam_dist and dam_dist < 2000.0:
            risk += 0.15
        if precip_prob >= 70:
            risk += 0.12
        if wind_gust_kmh >= 50:
            risk += 0.08
        if visibility_m is not None and visibility_m < 3000:
            risk += 0.10

    return min(risk, 1.0)



def analyze_route_bottlenecks(route: Route, disaster_type: str = "ALL_HAZARDS") -> Tuple[List[BottleneckInfo], Route]:
    """
    Analyze all sample points in a route to identify bottlenecks under active disaster.
    Returns (list of bottlenecks, updated route with hazard_score on samples).
    """
    bottlenecks: List[BottleneckInfo] = []
    updated_samples: List[RouteSample] = []

    for sample in route.samples:
        h_risk = _hazard_risk(sample, disaster_type=disaster_type)
        b_vuln = _bridge_vulnerability(sample, disaster_type=disaster_type)
        t_penalty = _terrain_penalty(sample.slope_pct)

        bsi = h_risk * (1.0 + b_vuln) * t_penalty

        sample.hazard_score = round(h_risk, 3)
        updated_samples.append(sample)

        if bsi >= BSI_MODERATE:
            if bsi >= BSI_CRITICAL:
                severity = "Critical"
            else:
                severity = "Moderate"

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

                # Seismic
                pga = mireye.get("seismic_pga_g")
                if pga and pga >= 0.2:
                    sdc = mireye.get("seismic_design_category", "")
                    risk_factors.append(f"seismic PGA {pga:.2f}g (SDC {sdc})" if sdc else f"seismic PGA {pga:.2f}g")

                # Slope
                if sample.slope_pct and abs(sample.slope_pct) > 8:
                    risk_factors.append(f"steep grade {abs(sample.slope_pct):.1f}%")

                # FEMA flood zone
                flood_zone = mireye.get("fema_flood_zone", "")
                if mireye.get("coastal_high_hazard") is True:
                    risk_factors.append("FEMA V-zone (coastal wave action)")
                elif flood_zone:
                    subtype = mireye.get("flood_zone_subtype", "")
                    bfe = mireye.get("fema_base_flood_elevation")
                    bfe_str = f" BFE {bfe:.0f}ft" if bfe else ""
                    zone_str = f"FEMA Zone {flood_zone}"
                    if subtype and "FLOODWAY" in subtype:
                        zone_str += " (Floodway)"
                    risk_factors.append(f"{zone_str}{bfe_str}")
                elif mireye.get("within_floodplain") is True:
                    risk_factors.append("FEMA NFHL floodplain (SFHA)")

                # NHD hydrographic area
                if mireye.get("intersects_nhd_area") is True:
                    risk_factors.append("hydrographic area (river/canal crossing)")

                # Elevation
                elev = mireye.get("elevation_m")
                if elev is not None and elev < 20 and not mireye.get("within_floodplain"):
                    risk_factors.append(f"low elevation {elev:.0f}m")

                # Wildfire - CAL FIRE FHSZ
                fhsz = mireye.get("fire_hazard_zone")
                burn_year = mireye.get("most_recent_burn_year")
                fire_dist = mireye.get("nearest_fire_perimeter_m", float("inf"))
                abs_slope = abs(sample.slope_pct) if sample.slope_pct is not None else 0.0

                if disaster_type == "WILDFIRE" and (fhsz or fire_dist < 2000.0) and abs_slope > 10.0:
                    risk_factors.append(f"Post-wildfire debris flow risk ({fhsz or 'burn area'} + {abs_slope:.1f}% slope)")
                elif fhsz in ("Very High", "High"):
                    fhsz_str = f"CAL FIRE {fhsz} FHSZ"
                    if burn_year:
                        fhsz_str += f" (burned {burn_year})"
                    risk_factors.append(fhsz_str)
                elif fire_dist < 100.0:
                    risk_factors.append(f"inside burn perimeter ({burn_year})" if burn_year else "inside historical burn perimeter")

                # Wildfire - FEMA NRI
                wf_freq = mireye.get("wildfire_annual_freq")
                if wf_freq and wf_freq >= 0.001 and not fhsz:
                    risk_factors.append(f"wildfire freq {wf_freq:.4f}/yr (FEMA NRI)")

                # Landslide / Slope
                ls = mireye.get("landslide_susceptibility")
                if disaster_type == "EARTHQUAKE" and pga and pga >= 0.25 and abs_slope > 10.0:
                    risk_factors.append(f"co-seismic rockfall hazard (PGA {pga:.2f}g + {abs_slope:.1f}% slope)")
                elif disaster_type != "WILDFIRE" and ls and ls >= 40:
                    risk_factors.append(f"landslide susceptibility {ls}/100")
                elif disaster_type != "WILDFIRE" and sample.slope_pct and abs(sample.slope_pct) > 10:
                    risk_factors.append(f"steep grade {abs(sample.slope_pct):.1f}%")

                # Dam
                dam_dist = mireye.get("nearest_dam_distance_m")
                dam_hazard = mireye.get("nearest_dam_hazard")
                if dam_hazard == "High" and dam_dist is not None and dam_dist < 2000.0:
                    risk_factors.append(f"High-hazard dam {dam_dist:.0f}m upstream (flood cascade)")

                # Compound: Flood + Bridge scour
                if disaster_type == "FLOOD_HURRICANE" and mireye.get("within_floodplain") is True and sample.nbi_bridges:
                    risk_factors.append("hydrodynamic bridge scour & wash-out hazard")

                if risk_factors:
                    desc_parts.append(f"Hazard factors: {', '.join(risk_factors)}")

            if t_penalty > 1.2 and disaster_type != "WILDFIRE":
                desc_parts.append(f"Terrain grade penalty {t_penalty:.1f}x")

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
        f"Route {route.route_id} [{disaster_type}]: {len(bottlenecks)} bottlenecks detected "
        f"({sum(1 for b in bottlenecks if b.severity_label == 'Critical')} critical)"
    )

    return bottlenecks, route

