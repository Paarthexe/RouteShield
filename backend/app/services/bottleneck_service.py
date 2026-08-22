import logging
from typing import List, Tuple
from app.models.route_models import Route, RouteSample, BottleneckInfo

logger = logging.getLogger(__name__)

# BSI thresholds (calibrated for real-world corridor evaluation)
BSI_CRITICAL = 0.70
BSI_MODERATE = 0.40


def _bridge_vulnerability(sample: RouteSample) -> float:
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
                suff_penalty = 0.3  # Ineligible for federal repair / severe deficiency
            elif suff < 75.0:
                suff_penalty = 0.15

        if min_cond <= 4 or b.get("structurally_deficient") is True:
            vuln = 1.8 + age_penalty + suff_penalty  # Poor / Structurally Deficient
        elif min_cond <= 6:
            vuln = 0.7 + age_penalty + suff_penalty  # Fair
        elif min_cond <= 9:
            vuln = 0.1  # Good condition
        else:
            vuln = 0.3  # Serviceable / Enclosed Culvert

        worst = max(worst, vuln)

    return min(worst, 2.2)  # Cap at 2.2



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


def _hazard_risk(sample: RouteSample) -> float:
    """
    Compute hazard risk score for a sample [0.0 - 1.0].

    Uses confirmed Mireye natural_hazard fields with calibrated
    weights avoiding false alarms on standard road geography.
    """
    risk = 0.0
    mireye = sample.mireye_data or {}
    bridges = sample.nbi_bridges or []

    # ---- Seismic PGA (0–0.40) ----
    pga = mireye.get("seismic_pga_g")
    if pga is not None:
        if pga >= 0.6:
            risk += 0.40
        elif pga >= 0.4:
            risk += 0.30
        elif pga >= 0.2:
            risk += 0.15
        elif pga >= 0.1:
            risk += 0.05

    # ---- Slope / terrain (0–0.25) ----
    # slope_pct is computed from Open-Meteo DEM (all samples);
    # slope_degrees may also be present from Mireye USGS 3DEP.
    slope = sample.slope_pct
    if slope is None:
        slope_deg = mireye.get("slope_degrees")
        if slope_deg is not None:
            import math
            slope = math.tan(math.radians(slope_deg)) * 100.0
    if slope is not None:
        abs_slope = abs(slope)
        if abs_slope > 18.0:
            risk += 0.25
        elif abs_slope > 12.0:
            risk += 0.15
        elif abs_slope > 7.0:
            risk += 0.08

    # ---- Elevation / coastal flood (0–0.25) ----
    elev = mireye.get("elevation_m")
    if elev is not None:
        is_coastal = (
            (mireye.get("coast_distance_m") is not None and mireye.get("coast_distance_m") < 20000)
            or mireye.get("coastal_high_hazard") is True
        )
        if elev < 4.0 and is_coastal:
            risk += 0.25   # Immediate coastal / tidal storm surge zone
        elif elev < 12.0 and is_coastal:
            risk += 0.15   # Low-lying coastal plain
        elif elev < 15.0 and mireye.get("within_floodplain"):
            risk += 0.10   # Low inland floodplain

    # ---- FEMA NFHL floodplain polygon (0–0.25) ----
    flood_zone = str(mireye.get("fema_flood_zone", ""))
    if mireye.get("coastal_high_hazard") is True:
        risk += 0.25   # V-zone: high-velocity wave action (breaking waves ≥3ft)
    elif flood_zone.startswith("A") or mireye.get("within_floodplain") is True:
        risk += 0.18   # A-zone SFHA or NFHL floodplain polygon
    elif mireye.get("flood_zone_subtype", "") == "0.2 PCT ANNUAL CHANCE FLOOD HAZARD":
        risk += 0.06   # 0.2% annual (500-yr) flood hazard


    # NHD hydrographic area (river, canal, inundation zone) — bridge scour risk
    if mireye.get("intersects_nhd_area") is True:
        risk += 0.10

    # JRC Surface Water permanence — high = permanent water body nearby
    swp = mireye.get("surface_water_permanence_pct")
    if swp is not None and swp >= 75:
        risk += 0.10  # Permanent water channel
    elif swp is not None and swp >= 25:
        risk += 0.05  # Seasonal water

    # ---- Wildfire: FEMA NRI annual frequency (0–0.25) ----
    wf_freq = mireye.get("wildfire_annual_freq")
    if wf_freq is not None:
        if wf_freq >= 0.001:      # ≥ 0.1% annual chance — significant fire corridor
            risk += 0.25
        elif wf_freq >= 0.0003:
            risk += 0.15
        elif wf_freq > 0.0:
            risk += 0.05

    # ---- Wildfire: CAL FIRE FHSZ class (California only) (0–0.25) ----
    fhsz = mireye.get("fire_hazard_zone")
    if fhsz == "Very High":
        risk += 0.25
    elif fhsz == "High":
        risk += 0.15
    elif fhsz == "Moderate":
        risk += 0.08

    # ---- Recent burn history: nearest fire perimeter (0–0.15) ----
    fire_dist = mireye.get("nearest_fire_perimeter_m")
    burn_year = mireye.get("most_recent_burn_year")
    if fire_dist is not None and fire_dist < 100.0:
        # Point was inside or immediately adjacent to a historical burn perimeter
        risk += 0.15
    elif fire_dist is not None and fire_dist < 2000.0 and burn_year and burn_year >= 2015:
        risk += 0.08  # Recent fire within 2 km

    # ---- Landslide susceptibility 0–100 index (0–0.25) ----
    ls = mireye.get("landslide_susceptibility")
    if ls is not None:
        if ls >= 70:
            risk += 0.25
        elif ls >= 40:
            risk += 0.15
        elif ls >= 20:
            risk += 0.07

    # ---- Dam hazard (0–0.20) ----
    dam_dist = mireye.get("nearest_dam_distance_m")
    dam_hazard = mireye.get("nearest_dam_hazard")
    hh_dams = mireye.get("high_hazard_dams_10km", 0) or 0
    if dam_hazard == "High" and dam_dist is not None and dam_dist < 1000.0:
        risk += 0.20
    elif dam_hazard == "High" and dam_dist is not None and dam_dist < 5000.0:
        risk += 0.12
    elif dam_hazard == "Significant" and dam_dist is not None and dam_dist < 2000.0:
        risk += 0.06
    if hh_dams >= 5:
        risk += 0.05  # Dense upstream dam concentration

    # ---- Karst / sinkhole (0–0.10) ----
    if mireye.get("in_karst_area") is True:
        karst_class = mireye.get("karst_exposure_class", "")
        if karst_class == "exposed":
            risk += 0.10
        else:
            risk += 0.05

    # ---- High wind speed (0–0.08) ----
    wind_mph = mireye.get("wind_speed_mph")
    if wind_mph is not None:
        if wind_mph >= 150:
            risk += 0.08   # Hurricane-force design wind
        elif wind_mph >= 130:
            risk += 0.05

    # ---- Compound: floodplain + bridge → bridge scour risk bonus (0–0.15) ----
    if mireye.get("within_floodplain") is True and bridges:
        risk += 0.15

    # ---- Compound: high seismic + bridge → liquefaction/structural bonus (0–0.10) ----
    if pga is not None and pga >= 0.4 and bridges:
        risk += 0.10

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

                # Seismic
                pga = mireye.get("seismic_pga_g")
                if pga and pga >= 0.2:
                    sdc = mireye.get("seismic_design_category", "")
                    risk_factors.append(f"seismic PGA {pga:.2f}g (SDC {sdc})" if sdc else f"seismic PGA {pga:.2f}g")

                # Slope
                if sample.slope_pct and abs(sample.slope_pct) > 8:
                    risk_factors.append(f"steep grade {abs(sample.slope_pct):.1f}%")

                # FEMA flood zone (specific code when available from flood_risk preset)
                flood_zone = mireye.get("fema_flood_zone", "")
                if mireye.get("coastal_high_hazard") is True:
                    risk_factors.append(f"FEMA V-zone (coastal wave action)")
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

                # NHD hydrographic area — river/canal crossing (bridge scour)
                if mireye.get("intersects_nhd_area") is True:
                    risk_factors.append("hydrographic area (river/canal crossing)")

                # Elevation
                elev = mireye.get("elevation_m")
                if elev is not None and elev < 20 and not mireye.get("within_floodplain"):
                    risk_factors.append(f"low elevation {elev:.0f}m")

                # Wildfire — CAL FIRE FHSZ
                fhsz = mireye.get("fire_hazard_zone")
                if fhsz in ("Very High", "High"):
                    burn_year = mireye.get("most_recent_burn_year")
                    fhsz_str = f"CAL FIRE {fhsz} FHSZ"
                    if burn_year:
                        fhsz_str += f" (burned {burn_year})"
                    risk_factors.append(fhsz_str)
                elif mireye.get("nearest_fire_perimeter_m", float("inf")) < 100.0:
                    burn_year = mireye.get("most_recent_burn_year")
                    risk_factors.append(f"inside burn perimeter ({burn_year})" if burn_year else "inside historical burn perimeter")

                # Wildfire — FEMA NRI (non-CA)
                wf_freq = mireye.get("wildfire_annual_freq")
                if wf_freq and wf_freq >= 0.001 and not fhsz:
                    risk_factors.append(f"wildfire freq {wf_freq:.4f}/yr (FEMA NRI)")

                # Landslide
                ls = mireye.get("landslide_susceptibility")
                if ls and ls >= 40:
                    risk_factors.append(f"landslide susceptibility {ls}/100")

                # Dam
                dam_dist = mireye.get("nearest_dam_distance_m")
                dam_hazard = mireye.get("nearest_dam_hazard")
                if dam_hazard == "High" and dam_dist is not None and dam_dist < 1000.0:
                    risk_factors.append(f"High-hazard dam {dam_dist:.0f}m upstream")

                # Karst
                if mireye.get("in_karst_area") is True:
                    risk_factors.append(f"karst terrain ({mireye.get('karst_exposure_class', 'unknown')} exposure)")

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
