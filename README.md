# RouteShield

Agentic evacuation route analysis system. Takes an origin and destination, generates candidate driving corridors via OSRM, samples each route at fixed physical distance intervals, enriches every sample point with bridge infrastructure data and physical world facts, detects hazard-infrastructure bottlenecks, scores route viability, and selects a primary + backup evacuation corridor with an evidence-backed explanation.

---

## What It Does

Traditional navigation optimizes for time and distance. RouteShield evaluates what a route *passes through* — terrain, infrastructure vulnerabilities, and environmental hazards — to find corridors most likely to remain viable during an emergency.

The system:
1. **Generates multiple candidate routes** between origin and destination via OSRM
2. **Samples each route** at 500m intervals using Haversine interpolation
3. **Enriches every sample point** with elevation (Open-Meteo), bridge data (FHWA NBI), and targeted physical-world facts (Mireye)
4. **Detects hazard-infrastructure bottlenecks** where vulnerable bridges overlap with environmental hazards
5. **Scores route viability** (0–100) and rejects fragile corridors
6. **Selects primary + backup evacuation routes** with a step-by-step reasoning trace and trade-off explanation

---

## Architecture

```
User Input (Origin, Destination)
         │
         ▼
[Geocoding] → Mireye /v1/geocode
         │
         ▼
[OSRM Multi-Route Generation] → 2–5 candidate corridors
         │
         ▼
[Adaptive Two-Tier Sampling]
  ├── Phase 1: Haversine 500m interpolation (all points)
  ├── Phase 2: Bulk Open-Meteo elevation (1 free API call)
  ├── Phase 3: NBI bridge spatial lookup (local SQLite)
  ├── Phase 4: Smart selection of 4 critical points
  └── Phase 5: Targeted Mireye /v1/fetch on critical points only
         │
         ▼
[Agent Decision Pipeline]
  ├── Bottleneck Detection (BSI per sample)
  ├── Viability Scoring (0–100 per route)
  ├── Route Ranking (PRIMARY / BACKUP / REJECTED)
  ├── Mireye /v1/ask (1 call on worst bottleneck)
  └── Executive Summary + Trade-Off generation
         │
         ▼
[Frontend]
  ├── Route cards with viability gauges + status badges
  ├── Agent Briefing panel with reasoning timeline
  ├── Elevation profile (SVG) with bridge/slope overlays
  ├── Map with bottleneck markers + hazard-colored samples
  └── Sample Inspector with slope/hazard/Mireye details
```

---

## Backend (FastAPI + Python)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/location/resolve` | Resolves a text address to lat/lng |
| `POST` | `/api/routes/generate` | Generates candidate routes from coordinate pairs |
| `POST` | `/api/routes/analyze` | Full pipeline: resolve → route → sample → enrich → bottleneck → viability → agent decision |
| `GET` | `/api/health` | Health check |

### Services

| File | What it does |
|------|-------------|
| `geocoding.py` | Calls Mireye `/v1/geocode` to resolve text addresses into coordinates. On success, calls `/v1/lookup` to append county+state metadata to the display name. Results are SQLite-cached. |
| `routing.py` | Calls public OSRM (`router.project-osrm.org`) for 2–5 candidate driving routes with GeoJSON geometries. Chains into the agent analysis pipeline. |
| `sampling.py` | Adaptive two-tier sampling: bulk Open-Meteo elevation for all points (1 free call), NBI bridge lookup (local SQLite), then selects exactly 4 critical points for Mireye `/v1/fetch` based on worst bridge condition, steepest slope, lowest elevation, and route midpoint. Computes terrain slope grades between consecutive samples. |
| `mireye_service.py` | Wraps Mireye `/v1/fetch` (elevation + seismic PGA), `/v1/lookup` (county/FIPS metadata), and `/v1/ask` (grounded contextual hazard questions). |
| `nbi_service.py` | Parses 741,783 US bridge records from the FHWA NBI fixed-width file into SQLite with a spatial index. Returns bridges within 300m of any sample point. Falls back to deterministic synthetic bridges for demo when the NBI data file is absent. |
| `bottleneck_service.py` | Computes Bottleneck Severity Index (BSI) per sample: `BSI = hazard_risk × (1 + bridge_vulnerability) × terrain_penalty`. Classifies segments as Critical (BSI > 0.65) or Moderate (BSI > 0.35). |
| `viability_service.py` | Scores route viability (0–100): `Score = 100 - 40·hazard% - 25·bottleneck_penalty - 10·time_penalty`. Hard rejection for catastrophic BSI > 1.2 or > 40% hazard exposure. Ranks routes as PRIMARY / BACKUP / REJECTED. |
| `agent_service.py` | Agentic decision engine: orchestrates bottleneck → viability → ranking pipeline, fires 1 Mireye `/v1/ask` call on the worst bottleneck for grounded AI insight, generates executive summary + trade-off explanation with step-by-step reasoning log. |
| `open_meteo_service.py` | Bulk elevation lookup via Open-Meteo Elevation API (free, no key required). |
| `cache.py` | SQLite-backed key-value cache for geocoding and API results. |

### Data Collected Per Sample Point

- `lat`, `lng`, `distance_from_origin_m`
- `elevation_m` (Open-Meteo DEM or Mireye/USGS 3DEP)
- `seismic_pga_g` (Mireye/USGS NSHM, on probed points only)
- `slope_pct` (computed from consecutive elevation differences)
- `hazard_score` (0–1, composite of seismic + slope + elevation risk)
- `is_mireye_probed` (true for the 4 critical points per route)
- `nbi_bridges[]` — nearby bridge structures with structure ID, year built, age, ADT, deck/super/sub condition

### Per-Route Analysis

- `infrastructure_summary` — total bridges, aging bridges, critical bridges
- `viability` — score (0–100), status (PRIMARY/BACKUP/REJECTED), hazard exposure %, bottleneck counts, rejection reasons
- `bottlenecks[]` — BSI score, severity label, hazard risk, bridge vulnerability, terrain penalty, description
- `agent_decision` — primary/backup route IDs, rejected route IDs, executive summary, trade-off explanation, reasoning steps, Mireye AI insight

### Frontend (React + Vite + Leaflet)

- Text input for origin/destination with live geocoding and map click-to-pick
- Intermediate waypoint stops with drag-to-reorder
- Leaflet map showing all candidate routes as colored polylines
- **Hazard-colored sample dots** (green = safe, amber = moderate, red = high risk)
- **Pulsing bottleneck warning markers** at detected hazard-infrastructure chokepoints
- **Mireye-probed points** highlighted with distinct emerald border
- Route cards with **circular viability score gauge**, **PRIMARY/BACKUP/REJECTED badges**, hazard exposure bar, bottleneck counts
- **Agent Decision Briefing panel** — executive summary, speed-vs-safety trade-off, Mireye AI ground-truth insight, step-by-step reasoning timeline
- **Elevation Profile** — pure SVG area chart showing terrain from origin to destination with bridge markers, steep grade highlights, and Mireye-probed point indicators
- **Sample Inspector** — slope grade, hazard risk %, bridge condition cards, Mireye data

---

## Run It

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm

### Backend

```bash
cd backend

# Create and activate virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables (or create a .env file in backend/ or repo root)
export MIREYE_API_KEY=your_key_here

# Start the backend
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open `http://localhost:3000` (or whatever port Vite assigns).

### Both at Once

Terminal 1:
```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

Terminal 2:
```bash
cd frontend && npm run dev
```

---

## Environment Variables

Create a `.env` file in the repo root or `backend/` directory:

```env
MIREYE_API_KEY=your_key           # Required. Powers Mireye geocoding, hazard data, and /v1/ask insights.
MIREYE_BASE_URL=https://api.mireye.com/v1
OSRM_BASE_URL=http://router.project-osrm.org
ROUTE_SAMPLE_INTERVAL_M=500
ENABLE_CACHE=true
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MIREYE_API_KEY` | **Yes** | `""` | Mireye API key (Required). Powers address geocoding (`/v1/geocode`), seismic PGA data (`/v1/fetch`), place lookup (`/v1/lookup`), and grounded hazard analysis (`/v1/ask`). |
| `MIREYE_BASE_URL` | No | `https://api.mireye.com/v1` | Mireye API base URL |
| `OSRM_BASE_URL` | No | `http://router.project-osrm.org` | OSRM routing engine URL |
| `ROUTE_SAMPLE_INTERVAL_M` | No | `500` | Physical distance interval in meters for route sampling |
| `ENABLE_CACHE` | No | `true` | Enable/disable SQLite caching for geocoding and API results |

---

## NBI Bridge Data

The FHWA National Bridge Inventory data file is **not included in the repo** (317MB, gitignored).

To use real NBI data:
1. Download `2025AllStatesNoDelimiterAllRecords.txt` from [FHWA NBI](https://www.fhwa.dot.gov/bridge/nbi/ascii.cfm)
2. Place it at the repo root (`routeshield/2025AllStatesNoDelimiterAllRecords.txt`)
3. The SQLite spatial index is built automatically on first backend startup

Without the NBI file, the system generates deterministic synthetic bridge data for demo purposes.

---

## Tests

```bash
cd backend
python3 -m pytest tests/ -v
```

12 tests covering geocoding, routing, sampling, and API endpoints.

---

## How Credit-Efficient Sampling Works

Instead of brute-force querying Mireye for every sample point (which would burn 100+ API credits per route), RouteShield uses **adaptive two-tier sampling**:

1. **Macro scan (free):** Bulk Open-Meteo elevation for ALL 100+ sample points in 1 HTTP call
2. **NBI bridge lookup (free):** Local SQLite spatial query for bridges near every sample point
3. **Smart selection:** Algorithm picks exactly **4 critical points** per route:
   - Point with the worst NBI bridge condition (most vulnerable infrastructure)
   - Point with the steepest elevation change (landslide/terrain risk)
   - Point with the lowest absolute elevation (flood plain exposure)
   - Route midpoint (general area assessment)
4. **Targeted probing:** Only those 4 points get Mireye `/v1/fetch` calls
5. **Agent insight:** 1 single Mireye `/v1/ask` call on the worst bottleneck across all routes

**Result:** ~5 Mireye API calls total per analysis instead of 200+.

---

## Key Derived Signals

| Signal | Description |
|--------|-------------|
| **Bottleneck Severity Index (BSI)** | `hazard_risk × (1 + bridge_vulnerability) × terrain_penalty` — identifies points where environmental hazards overlap with vulnerable infrastructure |
| **Hazard Exposure %** | Proportion of route samples with hazard_score > 0.3 |
| **Viability Score (0–100)** | Composite score: `100 - 40·hazard% - 25·bottleneck_penalty - 10·time_delta` |
| **Route Status** | PRIMARY (recommended), BACKUP (secondary safe option), REJECTED (fragile, not recommended) |
| **Terrain Slope Grade %** | Computed between consecutive elevation samples — flags steep grades > 8% |
| **Bridge Vulnerability** | NBI deck/superstructure/substructure condition codes normalized to 0–2.5 scale with age penalty |