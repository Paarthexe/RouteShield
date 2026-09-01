# RouteShield

RouteShield is built for the moment when a routing decision carries real consequences. During a wildfire, flood, earthquake, landslide, or severe storm, a route that looks efficient on a normal map can lead people toward a washed-out crossing, an ageing bridge, a steep unstable slope, or a corridor exposed to the hazard itself.

The project gives Mireye a practical evacuation intelligence experience: it turns physical-world evidence into a route decision that emergency planners, operators, and residents can inspect. RouteShield brings together route geometry, bridge condition, elevation, terrain, and hazard evidence to identify safer corridors, verify meaningful backups, and make the reasoning visible.

It produces a primary evacuation corridor when one is viable, provides a best-available contingency route with clear danger advisories when all corridors face active hazards, checks whether a separate backup corridor exists, and explains the decision with the evidence collected along each route. The result is designed to support judgement under pressure, where a few minutes saved can matter less than avoiding a route that is likely to fail.

## What it does

- Generates up to five driving corridors between an origin and destination using OSRM.
- Samples each corridor at a configurable physical interval, 500 metres by default.
- Collects elevation for every sample and calculates route grade.
- Looks up nearby bridges in the FHWA National Bridge Inventory when the local dataset is available.
- Probes selected high-value samples for disaster data through Mireye when an API key is configured.
- Models hazard spread isochrones (Rothermel wildfire propagation & flood surge velocity) and computes time-to-cutoff clearance windows for each corridor.
- Evaluates multi-corridor network capacity, corridor throughput, and shared trunk bottlenecks using Highway Capacity Manual (HCM 6th Edition) standards.
- Estimates affected population exposure and evacuation clearance times using US Census demographic density and TRB NCHRP 752 ETE guidelines.
- Collects real-time weather conditions and wind vector alignment along routes via Open-Meteo.
- Ingests live NOAA/NWS active emergency alerts and OpenFEMA federal disaster declaration summaries.
- Collects real-time traffic flow speeds and road closure data through TomTom when configured.
- Locates live OpenStreetMap emergency shelters, hospitals, fire stations, and refueling stops along corridors via Overpass.

- Identifies communication and cellular dead zones in steep canyons and mountain passes.
- Scores bottlenecks from hazard risk, bridge vulnerability, and terrain slope.
- Scores route viability, rejects fragile corridors, checks backup-route independence, and designates the most feasible contingency corridor even under severe hazard conditions.
- Allocates multi-zone evacuations across distributed destinations to balance network load.
- Supports vehicle clearance profiles, custom interactive roadblock barriers, and sub-segment rerouting.
- Scrapes real-time emergency web feeds from NOAA/NWS, USGS seismic feeds, and state emergency alerts.
- Streams live corridor re-evaluation updates through Server-Sent Events (SSE).
- Shows the analysis on an interactive dark-mode map with route cards, elevation profiles, bottleneck markers, sample details, and a decision briefing.

## Why this matters

Evacuation is a physical-world coordination problem. A route must remain passable while conditions are changing, infrastructure is under stress, and people are moving at the same time. Travel time alone cannot answer whether a corridor is resilient enough to rely on.

RouteShield demonstrates how Mireye can make location intelligence directly useful in that setting. Mireye evidence is attached to the points along a route where risk is most likely to concentrate. The application then connects those facts to bridge condition and terrain, producing a clear explanation of where the route is vulnerable and why another corridor may be safer.

The goal is a decision that can be reviewed quickly without hiding the evidence behind a single score.

## How a route is analysed

```text
Origin, destination, waypoints, vehicle profile, and disaster mode
                                 |
                                 v
        OSRM route discovery and alternative-corridor synthesis
                                 |
                                 v
Parallel sampling, elevation, bridge lookup, weather, and hazard probes
                                 |
                                 v
    Bottleneck severity, isochrone time-to-cutoff, and viability scoring
                                 |
                                 v
        Primary-route selection and independent-backup check
                                 |
                                 v
Decision summary, capacity analysis, AAR case studies, and live monitoring
```

The active disaster mode changes the emphasis of the scoring and probe selection:

- `ALL_HAZARDS` uses a balanced view of environmental and infrastructure risk.
- `WILDFIRE` gives more weight to fire zones, burn history, wind, and constrained terrain.
- `FLOOD_HURRICANE` gives more weight to flood zones, low elevation, water, dams, and bridge scour.
- `EARTHQUAKE` gives more weight to seismic exposure and bridge condition.
- `LANDSLIDE` gives more weight to slope and landslide susceptibility.

RouteShield calculates a bottleneck severity index at each sample:

```text
hazard risk × (1 + bridge vulnerability) × terrain penalty
```

It marks scores of 0.40 or higher as moderate bottlenecks and scores of 0.70 or higher as critical bottlenecks. If every evaluated corridor crosses configured safety limits, RouteShield selects the highest-viability path as the primary contingency corridor, accompanied by an explicit danger warning so operators and residents are never left without an evacuation path. Full details are in [docs/architecture.md](docs/architecture.md).

## Project layout

```text
Routeshield/
├── backend/       FastAPI application, scoring services, and tests
├── frontend/      React and Leaflet application
├── docs/          Architecture, backend, frontend, and agent tools documentation
└── docker-compose.yml
```

- [Backend guide](docs/backend.md)
- [Frontend guide](docs/frontend.md)
- [Architecture](docs/architecture.md)
- [Agent tools and pipeline](docs/AGENT_TOOLS.md)

## Run locally

Requirements:

- Python 3.10 or later
- Node.js 18 or later
- Docker and Docker Compose, if you want to run the containerised stack

Create a root `.env` file from `.env.example` and set the services you intend to use:

```env
MIREYE_API_KEY=your_mireye_api_key
MIREYE_BASE_URL=https://api.mireye.com/v1
TOMTOM_API_KEY=your_tomtom_api_key
OSRM_BASE_URL=http://router.project-osrm.org
ROUTE_SAMPLE_INTERVAL_M=500
ENABLE_CACHE=true
```

Start the backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs), and health information is available at [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health).

To run both services with Docker:

```bash
docker compose up --build
```

## Data and service setup

OSRM provides route geometry. Open-Meteo provides elevation and real-time weather. Mireye provides geocoding and physical-world hazard data. TomTom provides live traffic flow speeds and road closures. NOAA and OpenFEMA provide hazard alerts and disaster records. The US Census Bureau provides population data. Overpass provides emergency shelter and refueling infrastructure.


## Tests

Run the backend test suite:

```bash
cd backend
python3 -m pytest tests/ -v
```
