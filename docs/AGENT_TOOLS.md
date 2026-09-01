# RouteShield Agent Tools & Architecture

## Overview

RouteShield uses a **multi-stage agentic pipeline** to transform raw geospatial coordinates and hazard signals into a ranked, evidence-backed evacuation decision. Each stage calls specialized *agent tools* with defined inputs, outputs, and deterministic fallbacks. This document catalogs every tool, its responsibility, and how it fits into the pipeline.

---

## Pipeline Stages

```
User Query (Origin, Destination, Mode, Fleet Profile)
    │
    ▼
[1] OSRM Route Generator ──► Candidate Polylines (1–5 corridors)
    │
    ▼
[2] Physical Sampler ──────► RouteSample[] (500 m intervals, lat/lon/elevation)
    │
    ▼
[3a] NBI Bridge Fetcher ───► Bridge metadata & component condition ratings
[3b] Mireye Hazard Fetcher ─► Provenance-tagged physical world hazard facts
[3c] Open-Meteo DEM & Met ─► Elevation, route grade, and wind vector alignment
    │  (executed in parallel)
    ▼
[4] Bottleneck Detector ───► BottleneckInfo[] (BSI scoring & severity classifications)
    │
    ▼
[5] Segmentation Engine ───► RouteSegment[] (VIABLE / NEEDS_REPAIR / CRITICAL)
    │
    ▼
[6] Viability Assessor ────► ViabilityAssessment (0-100 score, gates, contingency status)
    │
    ▼
[7] Redundancy Assessor ───► BackupIndependenceAssessment (overlap %, shared bridges)
    │
    ▼
[8] Isochrone & TTC Engine ─► Hazard propagation and time-to-cutoff clearance window
    │
    ▼
[9] Capacity & ETE Engine ─► Network throughput, shared trunk conflicts, and census exposure
    │
    ▼
[10] Decision Engine ──────► AgentDecision (PRIMARY / BACKUP / REJECTED ranking)
    │
    ▼
[11] Live Monitor (SSE) ───► Continuous real-time telemetry streaming
```

---

## Safety Gate & Rejection Rules

Corridors are evaluated against strict physical safety gates before receiving a PRIMARY or BACKUP recommendation:

| Safety Gate | Trigger Condition | Rationale |
|-------------|-------------------|-----------|
| **Active Barrier / Roadblock** | Sample intersects roadblock exclusion zone | Physical road closure or obstacle makes corridor impassable |
| **Catastrophic Bottleneck** | Any single bottleneck BSI ≥ 2.0 | Structural bridge failure or severe inundation prevents vehicular transit |
| **Critical Bottleneck Density** | ≥ 35% of samples are Critical **and** ≥ 2 critical bottlenecks | Distributed criticality across the corridor fabric |
| **Severe Hazard Exposure** | > 60% of samples have `hazard_score > 0.5` | Corridor traverses active wildfire or flood perimeters |
| **Vehicle Operating Limits** | Slope > 12% for buses or > 10% for heavy tankers | Grade exceeds safe fleet operational limits |

**Contingency Handling:** In severe emergency scenarios where every candidate corridor violates one or more safety gates, RouteShield ranks corridors by resilience score and designates the highest-scoring path as the **Primary Evacuation Corridor** (`is_contingency: True`). The decision and UI immediately display active hazard warnings and specific risk reasons so evacuees always have an actionable recommended route.

---

## Segment Repair Modes

The Segment Repair Engine (`POST /api/routes/{route_id}/segments/{segment_id}/repair`) supports three operational actions:

| Action | Behavior |
|--------|----------|
| `auto_repair` | Engine computes an optimal local bypass avoiding the compromised segment |
| `avoid_point` | Bypasses a user-selected hazard coordinate via lateral anchor injection |
| `mark_impassable` | Flags segment as permanently blocked and updates route viability |

---

## SSE Event Stream Schema (`GET /api/routes/{route_id}/live`)

```json
event: status_update
data: {"route_id": "route_1", "type": "status_update", "severity": "ok", "message": "Corridor status nominal", "timestamp": "2026-09-01T16:20:00Z"}

event: severity_changed
data: {"route_id": "route_1", "type": "severity_changed", "severity": "warning", "message": "Hazard score elevated at sample route_1_sample_004", "timestamp": "2026-09-01T16:20:15Z"}

event: corridor_alert
data: {"route_id": "route_1", "type": "corridor_alert", "severity": "critical", "message": "Hazard perimeter interception window narrowed to 24 min", "timestamp": "2026-09-01T16:20:30Z"}

event: heartbeat
data: {"route_id": "route_1", "type": "heartbeat", "severity": "ok", "message": "Telemetry stream active", "timestamp": "2026-09-01T16:20:45Z"}
```

---

## Data Source Provenance

| Source | Coverage | Update Frequency | Purpose in RouteShield |
|--------|----------|-----------------|------------------------|
| **FHWA National Bridge Inventory (NBI)** | United States | Annual snapshot | 600,000+ bridge structures, deck/substructure condition ratings, scour criticality |
| **Mireye Physical Hazard API** | United States | Near-real-time | Seismic PGA, CAL FIRE hazard zones, FEMA NFHL floodplains, USGS landslides, high-hazard dams |
| **Open-Meteo DEM & Forecast** | Global | Real-time & forecast | High-resolution elevation, route grade percentages, temperature, precipitation, wind vectors |
| **OSRM Engine** | Global | Live routing | Drive-time geometry discovery, alternative corridors, and sub-segment repair |
| **NOAA Active Alerts & OpenFEMA** | United States | Real-time & historical | Active weather warnings and historical disaster declarations for After-Action Report matching |
| **US Census Bureau ACS** | United States | 5-Year ACS | Evacuation population exposure counts and TRB NCHRP 752 clearance time estimation |
| **Public Emergency Web Portals** | Multi-jurisdiction | Real-time web scraping | NWS active alerts, USGS real-time seismic feeds, and state emergency alerts |
