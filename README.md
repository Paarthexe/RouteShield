# RouteShield

**Agentic Evacuation Corridor Intelligence & Hazard-Infrastructure Risk Engine**

RouteShield is an intelligent evacuation routing system designed for emergency scenarios. Traditional GPS navigation optimizes strictly for travel time and distance. During natural disasters (wildfires, hurricane storm surges, flash floods, or earthquakes), the fastest route is often the most fragile—crossing aging bridges, traversing steep landslide-prone slopes, or passing through flood-prone lowlands.

RouteShield evaluates the physical conditions along entire evacuation corridors to derive risk signals that neither routing engines nor hazard datasets provide on their own.

---

## What RouteShield Does

1. **Multi-Corridor Discovery**: Generates multiple candidate evacuation paths via OSRM, including synthesized lateral bypass corridors to prevent corridor collapse.
2. **High-Resolution Spatial Sampling**: Interpolates corridors into discrete physical sample points at 500m intervals.
3. **Multi-Layer Infrastructure & Environmental Enrichment**:
   - **Bridge Vulnerability**: Spatial cross-referencing against 740,000+ FHWA National Bridge Inventory structures (deck/superstructure/substructure condition, age, traffic volume).
   - **Terrain Elevation & Slope**: Macro Digital Elevation Model (Open-Meteo DEM) and gradient percentage calculation between consecutive points.
   - **Ground-Truth Physical Facts**: Targeted Mireye API queries (`/v1/fetch` and `/v1/ask`) for seismic peak ground acceleration (PGA), flood plain indicators, and natural hazard intelligence.
4. **Hazard-Infrastructure Bottleneck Detection**: Calculates a composite **Bottleneck Severity Index (BSI)** for every sample point where vulnerable physical infrastructure coincides with environmental hazards.
5. **Route Viability Assessment**: Computes a 0–100 viability score per corridor and enforces hard rejection thresholds for catastrophic structural failure risks.
6. **Evacuation Decision Trace**: Ranks corridors into `PRIMARY`, `BACKUP`, and `HIGH RISK` with an evidence-backed narrative and speed-vs-safety trade-off analysis.

---

## Architecture & Data Flow

```
User Input (Origin, Waypoints, Destination)
                 │
                 ▼
[Mireye Geocoding Engine]
  └── Resolves addresses via Mireye /v1/geocode + /v1/lookup
                 │
                 ▼
[OSRM Routing & Corridor Synthesizer]
  └── Discovers 2–4 distinct driving corridors (with lateral bypass generation)
                 │
                 ▼
[Adaptive Two-Tier Sampling Pipeline]
  ├── Phase 1: Haversine physical distance interpolation (500m intervals)
  ├── Phase 2: Bulk DEM elevation querying (Open-Meteo chunked requests)
  ├── Phase 3: Spatial bridge search against local FHWA NBI SQLite index (300m radius)
  ├── Phase 4: Critical Point Selection (worst bridge, steepest slope, lowest elevation, midpoint)
  └── Phase 5: Targeted Mireye /v1/fetch (exact 4 physical-world probes per route)
                 │
                 ▼
[Corridor Risk Assessment Engine]
  ├── Bottleneck Severity Index (BSI = Hazard Risk × (1 + Bridge Vulnerability) × Terrain Penalty)
  ├── Route Viability Scoring (0–100) & Catastrophic Rejection Rules
  ├── Mireye /v1/ask Grounded Query on Peak Bottleneck
  └── Primary / Backup / High Risk Corridor Classification
                 │
                 ▼
[Mission Control Dashboard (Frontend)]
  ├── Geospatial Corridor HUD with hazard-colored sample points & bottleneck badges
  ├── Interactive SVG Terrain Elevation Cross-Section Chart with bridge overlays
  ├── Corridor Risk Assessment Report with Speed vs. Safety Trade-Off
  └── Physical Sample Inspector with NBI structure details & telemetry
```

---

## Derived Signals & Formulations

### 1. Bottleneck Severity Index (BSI)
$$BSI = \text{Hazard Risk} \times (1 + \text{Bridge Vulnerability}) \times \text{Terrain Penalty}$$

- **Hazard Risk ($0.0 - 1.0$)**: Derived from seismic PGA ($\ge 0.4g$), low flood plain elevation ($<20m$), and steep gradient ($>8\%$).
- **Bridge Vulnerability ($0.0 - 2.5$)**: Derived from FHWA NBI deck, superstructure, and substructure condition codes (Poor $= 2.0$, Fair $= 1.0$, Good $= 0.2$) with bridge age penalties ($>40$ years built).
- **Terrain Penalty ($1.0 - 1.8$)**: Grade multipliers for steep ($\ge 8\%$) and extreme ($\ge 15\%$) mountain grades.

| BSI Score | Classification | Action |
| :--- | :--- | :--- |
| $\ge 0.65$ | **Critical Bottleneck** | Chokepoint marker rendered; penalized in viability scoring. |
| $\ge 0.35$ | **Moderate Bottleneck** | Advisory warning on corridor segment. |
| $> 3.50$ | **Catastrophic Risk** | Automatic route rejection trigger. |

### 2. Corridor Viability Score ($0 - 100$)
$$\text{Score} = 100 - (40 \times \text{Hazard Exposure \%}) - (25 \times \text{Bottleneck Penalty}) - (10 \times \text{Time Delta Penalty})$$

---

## What Has Been Completed

- [x] **Mireye Geocoding Integration**: Property-level geocoding via `/v1/geocode` with anchor fallback for coarse city queries and county/state metadata from `/v1/lookup`.
- [x] **Credit-Efficient Two-Tier Sampling**: Reduced API credit burn from 200+ calls to $\le 4$ targeted `/v1/fetch` probes per corridor based on worst bridge condition, steepest slope, lowest elevation, and route midpoint.
- [x] **FHWA National Bridge Inventory Engine**: Spatial indexing and condition parsing for 740,000+ US bridges with deterministic fallback dataset.
- [x] **Open-Meteo DEM Integration**: Batch-chunked elevation lookups ($\le 80$ coords per request) to prevent API payload limits on long corridors.
- [x] **Alternative Corridor Synthesizer**: Perpendicular lateral waypoint generation to force OSRM to discover true bypass highways when standard routing returns only 1 path.
- [x] **Bottleneck Severity Index (BSI) Engine**: Multi-factor vulnerability scoring across bridges, seismic data, elevation, and terrain grade.
- [x] **Viability & Rejection Engine**: Dynamic scoring with catastrophic bottleneck filters and primary/backup ranking.
- [x] **Mireye `/v1/ask` Deep Insight**: Contextual environmental assessment query fired on the worst detected corridor bottleneck.
- [x] **Tactical Mission Control UI**: Clean dark geospatial HUD (Inter + JetBrains Mono) with SVG elevation cross-sections, interactive sample inspector, and corridor risk report.

---

## Quickstart & Local Setup

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm

### 1. Configure Environment
Create a `.env` file in the project root directory:

```env
MIREYE_API_KEY=your_mireye_api_key_here
MIREYE_BASE_URL=https://api.mireye.com/v1
OSRM_BASE_URL=http://router.project-osrm.org
ROUTE_SAMPLE_INTERVAL_M=500
ENABLE_CACHE=true
```

### 2. Run Backend (FastAPI)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Run Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` (or `3001`).

---

## Recommended Test Corridors

| Scenario | Origin | Destination | What It Demonstrates |
| :--- | :--- | :--- | :--- |
| **Mountain Flood & Landslides** | `Asheville, NC` | `Charlotte, NC` | Identifies steep river gorge bridges, elevation drops, and recommends safer valley corridors. |
| **Wildfire Canyon Evacuation** | `Paradise, CA` | `Chico, CA` | Evaluates single-point-of-failure canyon routes vs. secondary bypass roads. |
| **Seismic Faultline Crossing** | `Santa Cruz, CA` | `San Jose, CA` | Detects high seismic PGA and aging overpasses on Highway 17; evaluates coastal/valley bypasses. |
| **Coastal Hurricane Surge** | `Key West, FL` | `Miami, FL` | Flags low-elevation causeways and tidal flood risks across the Overseas Highway. |

---

## Test Suite

```bash
cd backend
python3 -m pytest tests/ -v
```