import asyncio
import json
import time
import logging
from typing import Dict, Optional, AsyncGenerator, List
from app.models.route_models import Route, LiveMonitoringEvent

logger = logging.getLogger(__name__)


class MonitoringService:
    def __init__(self):
        # In-memory store of active monitored routes
        self._active_routes: Dict[str, Route] = {}
        self._last_checked: Dict[str, float] = {}

    def register_route(self, route: Route):
        """Register a route for active background monitoring."""
        self._active_routes[route.route_id] = route
        self._last_checked[route.route_id] = time.time()

    def get_route(self, route_id: str) -> Optional[Route]:
        return self._active_routes.get(route_id)

    async def stream_live_events(
        self,
        route_id: str,
        current_sample_id: Optional[str] = None,
        disaster_type: str = "ALL_HAZARDS",
        interval_s: float = 3.5
    ) -> AsyncGenerator[str, None]:
        """
        SSE Generator yielding JSON-formatted live monitoring events.
        Re-evaluates remaining untraveled samples and simulates real-time hazard deltas.
        """
        route = self.get_route(route_id)
        
        # 1. Initial Connection Handshake
        init_event = LiveMonitoringEvent(
            event_type="status_update",
            route_id=route_id,
            timestamp=time.time(),
            severity_level="LOW" if (route and (route.viability_score or 0) >= 70) else "MODERATE",
            message=f"Live telemetry connected for corridor {route_id}. Continuous monitoring active under {disaster_type.replace('_', ' ').title()} protocol.",
            updated_viability_score=route.viability.score if route and route.viability else 75.0,
            remaining_distance_km=route.distance_km if route else 0.0
        )
        yield f"event: {init_event.event_type}\ndata: {init_event.model_dump_json()}\n\n"

        iteration = 0
        while True:
            await asyncio.sleep(interval_s)
            iteration += 1
            now = time.time()

            # Refresh route reference if available
            route = self.get_route(route_id)
            if not route:
                yield f"event: heartbeat\ndata: {json.dumps({'event_type': 'heartbeat', 'severity_level': 'LOW', 'message': 'Corridor ping nominal', 'timestamp': now})}\n\n"
                continue

            samples = route.samples or []
            bottlenecks = route.bottlenecks or []
            segments = route.segments or []

            # Determine remaining samples past current_sample_id
            start_index = 0
            if current_sample_id:
                for idx, s in enumerate(samples):
                    if s.sample_id == current_sample_id:
                        start_index = idx + 1
                        break

            remaining_samples = samples[start_index:]
            remaining_dist_km = sum(500 for _ in remaining_samples) / 1000.0 if remaining_samples else 0.0

            # Delta simulation triggers for realistic testing and demonstration
            if iteration % 4 == 2 and bottlenecks:
                # Moderate condition change alert
                worst_bn = max(bottlenecks, key=lambda b: b.bsi_score, default=bottlenecks[0])
                alert = LiveMonitoringEvent(
                    event_type="severity_changed",
                    route_id=route_id,
                    timestamp=now,
                    severity_level="MODERATE",
                    message=f"Signal delta at km {(worst_bn.distance_from_origin_m/1000.0):.1f}: Upstream runoff / localized hazard index elevated.",
                    affected_sample_id=worst_bn.sample_id,
                    updated_viability_score=max(30.0, (route.viability.score if route.viability else 70.0) - 4.0),
                    remaining_distance_km=remaining_dist_km
                )
                yield f"event: {alert.event_type}\ndata: {alert.model_dump_json()}\n\n"

            elif iteration % 4 == 0 and segments:
                # Segment-specific telemetry check
                candidate_seg = next((s for s in segments if s.status == "NEEDS_REPAIR"), segments[0])
                alert = LiveMonitoringEvent(
                    event_type="corridor_alert",
                    route_id=route_id,
                    timestamp=now,
                    severity_level="CRITICAL" if candidate_seg.status == "NEEDS_REPAIR" else "LOW",
                    message=f"Segment {candidate_seg.segment_index + 1} telemetry check: Continuous gauge monitoring active.",
                    affected_segment_id=candidate_seg.segment_id,
                    updated_viability_score=route.viability.score if route.viability else 70.0,
                    remaining_distance_km=remaining_dist_km
                )
                yield f"event: {alert.event_type}\ndata: {alert.model_dump_json()}\n\n"

            else:
                # Standard pulse heartbeat
                heartbeat = LiveMonitoringEvent(
                    event_type="heartbeat",
                    route_id=route_id,
                    timestamp=now,
                    severity_level="LOW",
                    message=f"Corridor conditions stable across {len(remaining_samples)} remaining sample points.",
                    remaining_distance_km=remaining_dist_km,
                    updated_viability_score=route.viability.score if route.viability else 75.0
                )
                yield f"event: {heartbeat.event_type}\ndata: {heartbeat.model_dump_json()}\n\n"



monitoring_service = MonitoringService()
