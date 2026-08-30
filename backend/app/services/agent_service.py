import logging
from typing import List, Optional
from app.models.route_models import Route, AgentDecision, AgentStep, Location, HazardBarrier
from app.services.bottleneck_service import analyze_route_bottlenecks
from app.services.redundancy_service import select_independent_backup
from app.services.viability_service import assess_route_viability, rank_routes, risk_model_metadata
from app.services.mireye_service import mireye_data_service
from app.services.nbi_service import nbi_service
from app.services.segmentation_service import segmentation_service
from app.services.aar_service import aar_service
from app.config import settings

logger = logging.getLogger(__name__)



async def run_agent_analysis(
    routes: List[Route],
    origin: Location,
    destination: Location,
    disaster_type: str = "ALL_HAZARDS",
    vehicle_profile: str = "STANDARD_VEHICLE",
    hazard_barriers: Optional[List[HazardBarrier]] = None
) -> AgentDecision:
    """
    Agentic decision engine: orchestrates bottleneck analysis, viability scoring,
    route ranking, Mireye /v1/ask insight, and generates structured reasoning.
    """
    steps: List[AgentStep] = []
    step_num = 0

    # --- Step 1: Log corridor count ---
    step_num += 1
    disaster_label = disaster_type.replace("_", " ").title()
    vehicle_label = vehicle_profile.replace("_", " ").title()
    barrier_note = f" (evaluating {len(hazard_barriers)} active hazard barriers)" if hazard_barriers else ""
    steps.append(AgentStep(
        step_number=step_num,
        action="Corridor Intake",
        detail=f"Received {len(routes)} candidate evacuation corridors from {origin.display_name} to {destination.display_name} under {disaster_label} mode for {vehicle_label}{barrier_note}"
    ))

    # --- Step 2: Bottleneck & Segment Analysis ---
    step_num += 1
    total_bottlenecks = 0
    total_critical = 0
    for route in routes:
        bottlenecks, route = analyze_route_bottlenecks(
            route,
            disaster_type=disaster_type,
            vehicle_profile=vehicle_profile
        )
        route.segments = segmentation_service.segment_route(route)
        total_bottlenecks += len(bottlenecks)
        total_critical += sum(1 for b in bottlenecks if b.severity_label == "Critical")

    steps.append(AgentStep(
        step_number=step_num,
        action="Bottleneck Detection",
        detail=f"Identified {total_bottlenecks} hazard-infrastructure bottlenecks across all corridors ({total_critical} critical) calibrated for {disaster_label} and {vehicle_label}"
    ))

    # --- Step 3: Viability Scoring ---
    step_num += 1
    fastest_duration = min(r.duration_s for r in routes) if routes else 0
    for route in routes:
        assess_route_viability(
            route,
            fastest_duration,
            vehicle_profile=vehicle_profile
        )

    score_summary = ", ".join(
        f"{r.route_id}: {r.viability.score:.0f}/100" for r in routes if r.viability
    )
    steps.append(AgentStep(
        step_number=step_num,
        action="Viability Assessment",
        detail=f"Computed viability scores: {score_summary}"
    ))

    # --- Step 4: Route Ranking ---
    step_num += 1
    ranked_routes = rank_routes(routes)

    primary = next((r for r in ranked_routes if r.viability and r.viability.status == "PRIMARY"), None)
    backup = None
    backup_independence = None
    if primary:
        # A score-only runner-up is not necessarily a usable evacuation backup.
        for route in ranked_routes:
            if route.viability and route.viability.status in {"BACKUP", "ALTERNATIVE"}:
                route.viability.status = "ALTERNATIVE"
        backup, backup_independence = select_independent_backup(primary, ranked_routes)
        if backup and backup.viability:
            backup.viability.status = "BACKUP"
    rejected = [r for r in ranked_routes if r.viability and r.viability.status == "REJECTED"]

    ranking_detail = []
    if primary:
        ranking_detail.append(f"PRIMARY: {primary.route_id} (Score: {primary.viability.score:.0f})")
    if backup:
        ranking_detail.append(f"BACKUP: {backup.route_id} (Score: {backup.viability.score:.0f})")
        if backup_independence:
            ranking_detail.append(f"BACKUP INDEPENDENCE: {backup_independence.independence_score:.0f}/100")
    elif backup_independence:
        ranking_detail.append(f"NO INDEPENDENT BACKUP: {backup_independence.explanation}")
    for r in rejected:
        ranking_detail.append(f"REJECTED: {r.route_id} ({'; '.join(r.viability.rejection_reasons)})")

    steps.append(AgentStep(
        step_number=step_num,
        action="Route Ranking",
        detail=" | ".join(ranking_detail) if ranking_detail else "All corridors ranked"
    ))

    # --- Step 5: Mireye /v1/ask on worst bottleneck ---
    step_num += 1
    mireye_insight: Optional[str] = None

    # Find the single worst bottleneck across all routes
    worst_bottleneck = None
    worst_bsi = 0.0
    worst_route_id = None
    for route in routes:
        for bn in route.bottlenecks:
            if bn.bsi_score > worst_bsi:
                worst_bsi = bn.bsi_score
                worst_bottleneck = bn
                worst_route_id = route.route_id

    if worst_bottleneck and worst_bsi >= 0.35:
        question = _build_ask_question(worst_bottleneck, worst_route_id, origin, destination, routes, disaster_type=disaster_type)
        try:
            insight = await mireye_data_service.ask_question(
                worst_bottleneck.latitude,
                worst_bottleneck.longitude,
                question
            )
            if insight:
                mireye_insight = insight
                steps.append(AgentStep(
                    step_number=step_num,
                    action="Mireye Deep Analysis",
                    detail=f"Consulted Mireye AI for grounded hazard assessment at bottleneck on {worst_route_id} (BSI {worst_bsi:.2f}). Received cited analysis."
                ))
            else:
                steps.append(AgentStep(
                    step_number=step_num,
                    action="Mireye Deep Analysis",
                    detail=f"Attempted Mireye /v1/ask at bottleneck on {worst_route_id} (no response or unconfigured key)"
                ))
        except Exception as e:
            logger.warning(f"Agent: Mireye /v1/ask failed: {e}")
            steps.append(AgentStep(
                step_number=step_num,
                action="Mireye Deep Analysis",
                detail=f"Mireye /v1/ask failed for bottleneck on {worst_route_id}: {str(e)[:80]}"
            ))
    else:
        steps.append(AgentStep(
            step_number=step_num,
            action="Mireye Deep Analysis",
            detail="No severe bottleneck found - Mireye deep probe not required"
        ))

    # --- Step 6: Real-World Evacuation AAR Cross-Reference ---
    step_num += 1
    all_aar_matches = await aar_service.match_all_routes(routes, disaster_type=disaster_type)
    if all_aar_matches:
        match_summary = ", ".join(f"{m.incident_name} ({m.year})" for m in all_aar_matches)
        steps.append(AgentStep(
            step_number=step_num,
            action="Historical AAR Matching",
            detail=f"Corridors intersect {len(all_aar_matches)} documented disaster evacuation case study zones: {match_summary}. Tactical mitigation applied."
        ))
    else:
        steps.append(AgentStep(
            step_number=step_num,
            action="Historical AAR Matching",
            detail="No historical FEMA/NIST catastrophic gridlock zones detected along corridor geometries."
        ))

    # --- Step 7: Generate Executive Summary ---
    step_num += 1
    executive_summary = _generate_executive_summary(
        routes, primary, backup, rejected, origin, destination, disaster_type=disaster_type
    )
    trade_off_explanation = _generate_trade_off(
        routes, primary, backup, rejected, fastest_duration
    )

    steps.append(AgentStep(
        step_number=step_num,
        action="Decision Finalized",
        detail=(
            f"Selected {primary.route_id} as primary evacuation corridor"
            if primary else "No viable evacuation corridor identified"
        )
    ))

    decision = AgentDecision(
        primary_route_id=primary.route_id if primary else None,
        backup_route_id=backup.route_id if backup else None,
        rejected_route_ids=[r.route_id for r in rejected],
        executive_summary=executive_summary,
        trade_off_explanation=trade_off_explanation,
        steps=steps,
        mireye_insight=mireye_insight,
        backup_independence=backup_independence,
        risk_model=risk_model_metadata(),
        evidence_coverage=_build_evidence_coverage(routes),
        disaster_type=disaster_type,
        vehicle_profile=vehicle_profile,
        hazard_barriers=hazard_barriers or []
    )

    logger.info(f"Agent Decision [{disaster_type} | {vehicle_profile}]: Primary={decision.primary_route_id}, Backup={decision.backup_route_id}")
    return decision


def _build_evidence_coverage(routes: List[Route]) -> dict:
    samples = [sample for route in routes for sample in route.samples]
    mireye_samples = [sample for sample in samples if sample.is_mireye_probed]
    bridge_samples = [sample for sample in samples if sample.nbi_bridges]
    source_names = set()
    for sample in mireye_samples:
        for field in (sample.mireye_data or {}).get("raw_fields", {}).values():
            if isinstance(field, dict) and field.get("source"):
                source_names.add(field["source"])
    
    nbi_mode_str = "Synthetic Fallback Model" if nbi_service.is_fallback_mode() else "FHWA National Bridge Inventory (SQLite indexed)"
    
    return {
        "route_count": len(routes),
        "sample_count": len(samples),
        "mireye_probe_count": len(mireye_samples),
        "bridge_evidence_sample_count": len(bridge_samples),
        "nbi_mode": nbi_mode_str,
        "nbi_fallback_mode": nbi_service.is_fallback_mode(),
        "sources": sorted(source_names),
        "collection_policy": f"Open-Meteo elevation covers all samples; Mireye fetch targets up to {settings.MIREYE_MAX_PROBES} high-value samples per route with at most {settings.MIREYE_MAX_CONCURRENCY} concurrent requests; Mireye Ask is reserved for the single worst bottleneck.",
    }


def _build_ask_question(bottleneck, route_id: str, origin, destination, routes: list, disaster_type: str = "ALL_HAZARDS") -> str:
    """
    Build a hazard-type-specific /v1/ask prompt tailored directly to the active disaster protocol.
    """
    mireye = {}
    for route in routes:
        for sample in route.samples:
            if sample.sample_id == bottleneck.sample_id:
                mireye = sample.mireye_data or {}
                break

    corridor = f"evacuation corridor between {origin.display_name} and {destination.display_name}"

    fhsz = mireye.get("fire_hazard_zone")
    is_floodplain = mireye.get("within_floodplain") is True
    dam_hazard = mireye.get("nearest_dam_hazard")
    dam_dist = mireye.get("nearest_dam_distance_m")
    pga = mireye.get("seismic_pga_g", 0) or 0
    ls = mireye.get("landslide_susceptibility", 0) or 0
    burn_perimeter = mireye.get("nearest_fire_perimeter_m", float("inf"))
    burn_year = mireye.get("most_recent_burn_year")
    flood_zone = mireye.get("fema_flood_zone", "")

    # Disaster-specific prompt tailoring
    if disaster_type == "WILDFIRE":
        burn_note = f" Historical burn perimeter from {burn_year} was recorded within {burn_perimeter:.0f}m." if burn_year else ""
        return (
            f"During an active wildfire evacuation along the {corridor}, what are the fire perimeter expansion risks, "
            f"CAL FIRE severity zone classifications ({fhsz or 'High'}), and roadway accessibility challenges at this coordinate?{burn_note} "
            f"Specifically evaluate flame impingement risk on highway egress corridors and historical road closure precedents."
        )

    if disaster_type == "FLOOD_HURRICANE":
        dam_note = f" A High-hazard dam is located {dam_dist:.0f}m upstream." if dam_hazard == "High" and dam_dist else ""
        zone_note = f" (FEMA Flood Zone {flood_zone})" if flood_zone else ""
        return (
            f"During a major flood or hurricane storm surge event along the {corridor}, what are the water inundation depths{zone_note}, "
            f"bridge abutment scour vulnerabilities, and road wash-out risks at this coordinate?{dam_note} "
            f"Include historical flood records and emergency vehicle accessibility."
        )

    if disaster_type == "EARTHQUAKE":
        sdc = mireye.get("seismic_design_category", "")
        sdc_note = f" (ASCE 7 Seismic Design Category {sdc})" if sdc else ""
        return (
            f"Following a major earthquake (Peak Ground Acceleration {pga:.2f}g){sdc_note} along the {corridor}, "
            f"what are the structural failure risks for bridges, highway overpasses, and soil liquefaction at this coordinate? "
            f"Identify whether this section is vulnerable to post-earthquake structural collapse or blockage."
        )

    if disaster_type == "LANDSLIDE":
        return (
            f"During heavy rain or ground saturation triggering debris flows along the {corridor}, what is the slope instability "
            f"and landslide risk (USGS landslide susceptibility index {ls}/100) at this coordinate? "
            f"Evaluate steep road cuts, embankment failure history, and rockfall hazards."
        )

    # All Hazards / Fallback
    if fhsz in ("Very High", "High") or burn_perimeter < 100:
        return (
            f"What are the wildfire evacuation risks and road accessibility challenges at this coordinate? "
            f"CAL FIRE classification is {fhsz or 'High'}. This is a critical segment of the {corridor}."
        )

    if is_floodplain or (dam_hazard == "High" and dam_dist is not None and dam_dist < 5000):
        dam_note = f" A High-hazard dam is {dam_dist:.0f}m away." if dam_hazard == "High" and dam_dist else ""
        return (
            f"What are the flood inundation and bridge scour risks at this coordinate during an emergency?{dam_note} "
            f"This is a critical segment of the {corridor}."
        )

    return (
        f"What are the primary natural hazard risks (flood, wildfire, seismic, and terrain stability) at this coordinate? "
        f"Focus on factors most likely to cause road closure or structural failure during emergency evacuation along the {corridor}."
    )


def _generate_executive_summary(
    routes: List[Route],
    primary: Optional[Route],
    backup: Optional[Route],
    rejected: List[Route],
    origin: Location,
    destination: Location,
    disaster_type: str = "ALL_HAZARDS"
) -> str:
    """Generate a concise executive summary of the evacuation route decision."""
    parts = []
    disaster_label = disaster_type.replace("_", " ").title()

    parts.append(
        f"RouteShield evaluated {len(routes)} candidate corridor(s) "
        f"from {origin.display_name} to {destination.display_name} under {disaster_label} evacuation protocol."
    )

    if primary and primary.viability:
        v = primary.viability
        parts.append(
            f"RECOMMENDED: {primary.route_id.upper().replace('_', ' ')} "
            f"({primary.distance_km} km, {primary.travel_time_min} min) "
            f"with a viability score of {v.score:.0f}/100. "
            f"Hazard exposure: {v.hazard_exposure_pct:.0f}% of corridor. "
            f"Bottlenecks: {v.bottleneck_count} total ({v.critical_bottleneck_count} critical)."
        )
    else:
        parts.append("NO VIABLE CORRIDOR: every evaluated route violated at least one configured viability rule. Review the rejected-route evidence before acting.")

    if backup and backup.viability:
        v = backup.viability
        time_diff = round(backup.travel_time_min - (primary.travel_time_min if primary else 0), 1)
        parts.append(
            f"BACKUP: {backup.route_id.upper().replace('_', ' ')} "
            f"({backup.distance_km} km, {backup.travel_time_min} min, "
            f"+{time_diff} min vs primary) - Viability: {v.score:.0f}/100."
        )

    for r in rejected:
        if r.viability:
            reasons = "; ".join(r.viability.rejection_reasons)
            parts.append(
                f"REJECTED: {r.route_id.upper().replace('_', ' ')} - {reasons}."
            )

    return " ".join(parts)


def _generate_trade_off(
    routes: List[Route],
    primary: Optional[Route],
    backup: Optional[Route],
    rejected: List[Route],
    fastest_duration_s: float
) -> str:
    """Generate a trade-off explanation comparing the primary route against fastest."""
    if not primary or not primary.viability:
        return "Insufficient data to generate trade-off analysis."

    fastest_route = next((r for r in routes if r.duration_s == fastest_duration_s), None)

    # If the primary IS the fastest
    if fastest_route and fastest_route.route_id == primary.route_id:
        crit_count = primary.viability.critical_bottleneck_count
        haz_pct = primary.viability.hazard_exposure_pct
        if crit_count == 0 and haz_pct < 20.0:
            return (
                f"The recommended primary corridor ({primary.route_id.upper().replace('_', ' ')}) "
                f"is also the fastest route at {primary.travel_time_min} min with low hazard exposure ({haz_pct:.0f}%). "
                f"No speed-safety trade-off is required."
            )
        else:
            return (
                f"The recommended primary corridor ({primary.route_id.upper().replace('_', ' ')}) "
                f"is the fastest available route at {primary.travel_time_min} min (Viability: {primary.viability.score:.0f}/100), "
                f"with {crit_count} critical bottleneck(s) and {haz_pct:.0f}% hazard exposure. "
                f"Proceed with situational awareness."
            )

    # Primary is NOT the fastest - explain the trade-off
    if fastest_route:
        time_penalty = round(primary.travel_time_min - fastest_route.travel_time_min, 1)
        fastest_v = fastest_route.viability

        parts = [
            f"The fastest route ({fastest_route.route_id.upper().replace('_', ' ')}, "
            f"{fastest_route.travel_time_min} min) "
        ]

        if fastest_v and fastest_v.status == "REJECTED":
            parts.append(
                f"was REJECTED due to: {'; '.join(fastest_v.rejection_reasons)}. "
            )
        elif fastest_v:
            parts.append(
                f"has a viability score of {fastest_v.score:.0f}/100 "
                f"with {fastest_v.critical_bottleneck_count} critical bottleneck(s). "
            )

        parts.append(
            f"The recommended corridor ({primary.route_id.upper().replace('_', ' ')}) "
            f"adds {time_penalty:+.1f} min of travel time but achieves a viability score of "
            f"{primary.viability.score:.0f}/100 with {primary.viability.critical_bottleneck_count} "
            f"critical bottleneck(s) - a safer evacuation path."
        )

        return "".join(parts)

    return (
        f"Primary corridor {primary.route_id.upper().replace('_', ' ')} selected with "
        f"viability score {primary.viability.score:.0f}/100."
    )


