# RouteShield

RouteShield is built for the moment when a routing decision carries real consequences. During a wildfire, flood, earthquake, landslide, or severe storm, a route that looks efficient on a normal map can lead people toward a washed-out crossing, an ageing bridge, a steep unstable slope, or a corridor exposed to the hazard itself.

The project gives Mireye a practical evacuation intelligence experience: it turns physical-world evidence into a route decision that emergency planners, operators, and residents can inspect. RouteShield brings together route geometry, bridge condition, elevation, terrain, and hazard evidence to identify safer corridors, verify meaningful backups, and make the reasoning visible.

It produces a primary route when one is viable, checks whether a separate backup corridor exists, and explains the decision with the evidence collected along each route. The result is designed to support judgement under pressure, where a few minutes saved can matter less than avoiding a route that is likely to fail.

## What it does

- Generates up to five driving corridors between an origin and destination.
- Samples each corridor at a configurable physical interval, 500 metres by default.
- Collects elevation for every sample and calculates route grade.
- Looks up nearby bridges in the FHWA National Bridge Inventory when the local dataset is available.
- Probes selected high-value samples for disaster data through Mireye when an API key is configured.
- Scores bottlenecks from hazard risk, bridge vulnerability, and terrain.
- Scores route viability, rejects corridors that cross configured safety limits, and checks backup-route independence.
- Shows the analysis on an interactive map with route cards, elevation profiles, bottleneck markers, sample details, and a decision briefing.

## Why this matters

Evacuation is a physical-world coordination problem. A route must remain passable while conditions are changing, infrastructure is under stress, and people are moving at the same time. Travel time alone cannot answer whether a corridor is resilient enough to rely on.

RouteShield demonstrates how Mireye can make location intelligence directly useful in that setting. Mireye evidence is attached to the points along a route where risk is most likely to concentrate. The application then connects those facts to bridge condition and terrain, producing a clear explanation of where the route is vulnerable and why another corridor may be safer.

The goal is a decision that can be reviewed quickly without hiding the evidence behind a single score.

## How a route is analysed

```text
Origin, destination, waypoints, and disaster mode
                  |
                  v
OSRM route discovery and alternative-corridor synthesis
                  |
                  v
Parallel sampling, elevation lookup, bridge lookup, and targeted hazard probes
                  |
                  v
Bottleneck severity and corridor viability scoring
                  |
                  v
Primary-route selection and independent-backup check
                  |
                  v
Decision summary, map layers, and sample-level evidence
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

It marks scores of 0.40 or higher as moderate bottlenecks and scores of 0.70 or higher as critical bottlenecks. A route is rejected when a bottleneck exceeds the catastrophic threshold or when severe hazard exposure covers too much of the corridor. Full details are in [docs/architecture.md](docs/architecture.md).

## Project layout

```text
Routeshield/
├── backend/       FastAPI application, scoring services, and tests
├── frontend/      React and Leaflet application
├── docs/          Architecture, backend, and frontend documentation
└── docker-compose.yml
```

- [Backend guide](docs/backend.md)
- [Frontend guide](docs/frontend.md)
- [Architecture](docs/architecture.md)

## Run locally

Requirements:

- Python 3.10 or later
- Node.js 18 or later
- Docker and Docker Compose, if you want to run the containerised stack

Create a root `.env` file from `.env.example` and set the services you intend to use:

```env
MIREYE_API_KEY=your_mireye_api_key
MIREYE_BASE_URL=https://api.mireye.com/v1
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

OSRM provides route geometry. Open-Meteo provides elevation data. Mireye provides geocoding and physical-world hazard data.

## Tests

Run the backend test suite:

```bash
cd backend
python3 -m pytest tests/ -v
```
