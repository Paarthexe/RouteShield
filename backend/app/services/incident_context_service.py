from app.models.route_models import IncidentContext


def normalize_incident_context(disaster_type: str = "ALL_HAZARDS", incident_context: IncidentContext = None) -> IncidentContext:
    if incident_context:
        return IncidentContext(
            disaster_type=incident_context.disaster_type or disaster_type or "ALL_HAZARDS",
            context_mode=incident_context.context_mode or "SUSCEPTIBILITY",
            event_name=incident_context.event_name,
            start_time=incident_context.start_time,
            end_time=incident_context.end_time,
            confidence=incident_context.confidence,
            geometry=incident_context.geometry,
            source=incident_context.source,
            notes=incident_context.notes,
        )

    return IncidentContext(
        disaster_type=disaster_type or "ALL_HAZARDS",
        context_mode="SUSCEPTIBILITY",
        confidence="medium",
        notes="Derived from disaster_type fallback without explicit incident geometry or event metadata.",
    )