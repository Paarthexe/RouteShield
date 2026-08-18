# RouteShield Architecture Specification

## Overview

RouteShield is an agentic evacuation planning system. While traditional navigation platforms (Google Maps, Waze) optimize primarily for travel time and distance during normal conditions, RouteShield evaluates physical-world viability and infrastructure resilience during hazardous conditions.

## Pipeline Evolution

```text
STAGE 1A (Implemented):
  Incident Query / Coordinates
         │
         ▼
  Location Resolution (GeocodingService)
         │
         ▼
  Candidate Route Generation (RoutingService - OSRM)
         │
         ▼
  Route Distance Sampling (SamplingService - 500m intervals)
         │
         ▼
  Interactive Map Visualization & Sample Inspector

STAGE 1B (Planned):
  Mireye Physical-World Data + FHWA Infrastructure Data Enrichment per Sample Point

STAGE 1C (Planned):
  Hazard-Infrastructure Analysis, Bottleneck Detection, Viability Scoring

STAGE 2 (Planned):
  Agentic Decision Model & Primary/Backup Route Selection

STAGE 3 (Planned):
  Full Product & Automated Alert Dispatch
```

## Backend Modular Design (`backend/app/`)

- **`api/`**: REST API endpoints for `/location/resolve`, `/routes/generate`, `/routes/analyze`.
- **`services/geocoding.py`**: Modular `GeocodingService` querying Mireye API when configured, with fallback to OpenStreetMap Nominatim and persistent SQLite caching.
- **`services/routing.py`**: `RoutingService` interfacing with OSRM routing engine requesting `alternatives=true` to parse candidate driving corridors.
- **`services/sampling.py`**: `SamplingService` performing Haversine distance calculations along LineString geometry at physical distance intervals (e.g. 500m), preserving exact endpoints.
- **`services/cache.py`**: SQLite persistent cache layer for zero-redundancy external calls.
- **`models/route_models.py`**: Pydantic models (`Location`, `RouteSample`, `Route`, `RouteAnalyzeResponse`) prepared for Stage 1B/1C schema extensions.
