# RouteShield Agent Tools & Architecture

## Overview

RouteShield uses a **multi-stage agentic pipeline** to transform raw geospatial coordinates into a ranked, evidence-backed evacuation decision. Each stage calls one or more specialized *agent tools* — stateless functions with defined inputs, outputs, and failure modes. This document catalogs every tool, its responsibility, and how it fits into the pipeline.

---

## Pipeline Stages

```
User Query
    │
    ▼
[1] OSRM Route Generator ──► Candidate Polylines (1–5 corridors)
    │
    ▼
[2] Physical Sampler ──────► RouteSample[] (500 m intervals, lat/lon/elevation)
    │
    ▼
[3a] NBI Bridge Fetcher ───► Bridge metadata per sample
[3b] Mireye Hazard Fetcher ─► Real-time hazard score per sample
[3c] Open-Meteo DEM ───────► Elevation + terrain penalty per sample
    │  (run in parallel)
    ▼
[4] Bottleneck Detector ───► BottleneckInfo[] (BSI scoring, severity label)
    │
    ▼
[5] Segmentation Engine ───► RouteSegment[] (VIABLE / NEEDS_REPAIR / CRITICAL)
    │
    ▼
[6] Viability Assessor ────► ViabilityAssessment (score 0-100, status, gates)
    │
    ▼
[7] Redundancy Assessor ───► BackupIndependenceAssessment (overlap %, shared bridges)
    │
    ▼
[8] Decision Engine ───────► AgentDecision (PRIMARY / BACKUP / REJECTED ranking)
    │
    ▼
[9] Live Monitor (SSE) ────► Continuous delta events after route is dispatched
```

---

## Tool Comparison Table

| # | Tool | Input | Output | Failure Mode | Latency (typical) |
|---|------|-------|--------|--------------|-------------------|
| 1 | **OSRM Route Generator** | Origin, Destination, optional Waypoints | GeoJSON LineString, distance_m, duration_s | Falls back to single route if alternatives unavailable | ~200 ms |
| 2 | **Physical Sampler** | GeoJSON LineString, interval_m | `RouteSample[]` with lat/lon/distance | No samples if geometry is a single point | <5 ms |
| 3a | **FHWA NBI Bridge Fetcher** | Lat/lon per sample, radius_m | `NBIBridge[]` with structure_id, year_built, material, condition rating | Returns `[]` on out-of-bounds; uses 600k+ SQLite snapshot | ~10–40 ms per sample |
| 3b | **Mireye Hazard Fetcher** | Lat/lon per sample | `hazard_score` ∈ [0,1], threat categories | Returns 0.0 on API error or out-of-bounds (US-only) | ~80–150 ms per sample |
| 3c | **Open-Meteo DEM + Weather** | Lat/lon per sample | `elevation_m`, terrain class, precipitation forecast | Graceful fallback to 0.0 on timeout | ~50–100 ms |
| 4 | **Bottleneck Detector** | `RouteSample[]` with enriched scores | `BottleneckInfo[]` (BSI score, severity label, description) | Empty list if no samples exceed threshold | <5 ms |
| 5 | **Segmentation Engine** | `Route` with samples and bottlenecks | `RouteSegment[]` — each ≈4 km, scored VIABLE/NEEDS_REPAIR/CRITICAL | Single segment if route is very short | <5 ms |
| 6 | **Viability Assessor** | `Route`, `fastest_duration_s` reference | `ViabilityAssessment` — score, status, rejection_reasons | Always produces a result; rejection gates applied before scoring | <2 ms |
| 7 | **Redundancy Assessor** | Primary route, candidate routes | `BackupIndependenceAssessment` — overlap_pct, shared_bridge_ids, is_independent | Returns 100% overlap if no candidates | <2 ms |
| 8 | **Decision Engine** | All routes with viability + redundancy | `AgentDecision` — ranked list, trade-off narrative, evidence citations | Emits REJECTED-only result set if all routes fail gates | <5 ms |
| 9 | **Live Monitor** | `route_id`, `current_sample_id`, `disaster_type` | SSE stream: `status_update`, `severity_changed`, `corridor_alert`, `heartbeat` | Stops streaming when route is deregistered or client disconnects | Continuous, 15s heartbeat |
| 10 | **Segment Repair Engine** | `route_id`, `segment_id`, `action`, optional `avoid_coordinate` | `SegmentRepairResponse` — repaired route, `SegmentRepairDiff`, viability delta | Falls back to original geometry if OSRM returns no alternatives | ~300–800 ms |

---

## Rejection Gates (Viability Assessor)

Gates are evaluated **in order** and are hard stops — a route failing any gate is immediately marked `REJECTED` and excluded from PRIMARY/BACKUP candidacy.

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| **Catastrophic BSI** | Any single bottleneck BSI ≥ 2.0 | A single structural failure point (bridge, underpass) that exceeds the catastrophic threshold makes the entire corridor impassable |
| **Critical Bottleneck Density** | ≥ 35% of samples are Critical bottlenecks **and** ≥ 2 critical bottlenecks | Distributed criticality means repair is not local — the corridor fabric itself is compromised |
| **Severe Hazard Exposure** | > 60% of samples have `hazard_score > 0.5` | Over half the route traverses actively hazardous terrain — unacceptable for evacuation |

---

## Segment Repair Actions

The Segment Repair Engine (`POST /api/routes/{route_id}/segments/{segment_id}/repair`) supports three action modes:

| Action | Behavior |
|--------|----------|
| `auto_repair` | Engine selects best OSRM alternative sub-corridor automatically |
| `avoid_point` | Avoids a user-specified coordinate (human-in-the-loop) via lateral waypoint injection |
| `mark_impassable` | Flags segment as permanently blocked without re-routing |

---

## SSE Event Schema (`GET /api/routes/{route_id}/live`)

```
event: status_update
data: {"route_id": "route_1", "type": "status_update", "severity": "ok", "message": "...", "timestamp": "..."}

event: severity_changed
data: {"route_id": "route_1", "type": "severity_changed", "severity": "warning", "message": "Hazard elevated at sample route_1_4", ...}

event: corridor_alert
data: {"route_id": "route_1", "type": "corridor_alert", "severity": "critical", "message": "Critical bottleneck detected ahead", ...}

event: heartbeat
data: {"route_id": "route_1", "type": "heartbeat", "severity": "ok", "message": "Route status nominal", ...}
```

---

## Data Source Provenance

| Source | Coverage | Update Frequency | Notes |
|--------|----------|-----------------|-------|
| **FHWA National Bridge Inventory (NBI)** | United States only | Annual snapshot | 600,000+ bridge structures; SQLite local snapshot |
| **Mireye Hazard API** | United States only | Near-real-time | Returns HTTP 400 for non-US coordinates; RouteShield falls back to score=0.0 |
| **Open-Meteo DEM** | Global | On-demand | 90 m SRTM-derived elevation; weather forecast for precipitation |
| **OSRM** | Global (OpenStreetMap) | Self-hosted | Drive-time routing; used for both main corridors and sub-segment repair |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (React)                    │
│  LocationInput → App → MapView + RouteCard + LiveHUD     │
│                         SegmentManager + AgentTools Modal│
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / SSE
┌────────────────────────▼────────────────────────────────┐
│                  FastAPI Backend                          │
│  POST /api/routes/analyze                                │
│  GET  /api/routes/{id}/live          (SSE)               │
│  POST /api/routes/{id}/segments/{sid}/repair             │
└──┬──────────────┬───────────────┬────────────────────────┘
   │              │               │
   ▼              ▼               ▼
 OSRM          NBI SQLite     Mireye API
 (local)       (local)        + Open-Meteo
```
