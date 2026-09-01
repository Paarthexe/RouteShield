# Backend guide

The backend is a FastAPI application in `backend/app`. It is the decision engine behind RouteShield: it turns a proposed evacuation journey into evidence about the roads, infrastructure, terrain, and hazards that shape whether that journey remains viable. It owns location resolution, route generation, sampling, enrichment, risk scoring, network capacity, hazard propagation, and the final route decision.

## Run it

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

FastAPI serves the application on port 8000. Swagger UI is available at `/docs`.

## Configuration

Settings are read from `.env` in the backend directory or repository root.

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8000` | Server port |
| `MIREYE_API_KEY` | empty | Enables Mireye geocoding and physical-world hazard data |
| `MIREYE_BASE_URL` | `https://api.mireye.com/v1` | Mireye API base URL |
| `MIREYE_MAX_PROBES` | `6` | Maximum targeted probes per route |
| `MIREYE_MAX_CONCURRENCY` | `4` | Concurrent Mireye requests |
| `TOMTOM_API_KEY` | empty | Enables TomTom real-time traffic flow speeds and road closures |
| `OSRM_BASE_URL` | `http://router.project-osrm.org` | OSRM API base URL |

| `ROUTE_SAMPLE_INTERVAL_M` | `500` | Default sample spacing in metres |
| `CACHE_DB_PATH` | `./data/routeshield_cache.db` | SQLite cache location |
| `ENABLE_CACHE` | `true` | Cache toggle |
| `HTTP_TIMEOUT_S` | `10` | External request timeout |

## API Endpoints

### `GET /api/health`

Returns service configuration and readiness details for the cache, NBI dataset, Mireye configuration, and OSRM endpoint.

### `POST /api/location/resolve`

Resolves a text location to geographic coordinates.

```json
{
  "query": "Paradise, CA"
}
```

The service tries Mireye geocoding first and uses Nominatim when Mireye is not configured or does not resolve the location. Direct `lat, lon` strings bypass external geocoders.

### `POST /api/routes/generate`

Generates and samples candidate routes between coordinates without running full multi-layer enrichment or decision scoring.

```json
{
  "origin": { "latitude": 39.7596, "longitude": -121.6219 },
  "destination": { "latitude": 39.7285, "longitude": -121.8375 },
  "sample_interval_m": 500,
  "disaster_type": "WILDFIRE"
}
```

### `POST /api/routes/analyze`

Runs the complete analysis pipeline. Origins, destinations, and waypoints may be text strings or coordinate objects.

```json
{
  "origin": "Paradise, CA",
  "destination": "Chico, CA",
  "waypoints": [],
  "sample_interval_m": 500,
  "disaster_type": "WILDFIRE",
  "vehicle_profile": "STANDARD_VEHICLE",
  "hazard_barriers": []
}
```

Supported disaster types are `ALL_HAZARDS`, `WILDFIRE`, `FLOOD_HURRICANE`, `EARTHQUAKE`, and `LANDSLIDE`.
Supported vehicle fleet profiles are `STANDARD_VEHICLE`, `EMERGENCY_BUS`, `RESCUE_4X4`, and `HEAVY_SUPPLY`.

The response contains:
- `origin` and `destination` (resolved location objects)
- `routes` (geometry, elevation profiles, samples, bottlenecks, viability metrics, and time-to-cutoff)
- `agent_decision` (primary, backup, and rejected routes, executive summary, trade-offs, and evidence coverage)
- `evacuation_exposure` (census population count, vehicle fleet, and clearance time bounds)
- `capacity_analysis` (aggregate network throughput, corridor flow limits, and shared trunk bottleneck conflicts)
- `weather_conditions` (temperature, precipitation, wind speed, and wind vector alignment)
- `historical_incidents` (NOAA alerts and OpenFEMA disaster declarations)
- `shelters` (nearby emergency shelters, hospitals, fire stations, and staging points)
- `scraped_live_updates` (real-time scraped emergency web bulletins, USGS seismic feeds, and incident dispatch orders)

### `GET /api/routes/live-web-alerts`

Returns real-time emergency web bulletins, USGS seismic alerts, and meteorological advisories scraped for the specified latitude, longitude, and active disaster protocol.

### `GET /api/routes/{route_id}/live`

Streams live Server-Sent Events (SSE) re-evaluating route conditions, traffic shifts, and hazard perimeters.

### `POST /api/routes/{route_id}/segments/{segment_id}/repair`

Re-routes a compromised or hazardous corridor sub-segment using `auto_repair`, `avoid_point`, or `mark_impassable`.

### `POST /api/routes/zone-plan`

Allocates multi-zone evacuations across distributed destinations to balance network capacity and minimize collective clearance times.

## Data services

The backend contacts OSRM for routing, Open-Meteo for elevation and weather, Mireye for physical-world hazard probes and AI reasoning, NOAA for weather alerts, OpenFEMA for historical disaster records, and public emergency feeds (NWS, USGS, OpenStreetMap Overpass) for real-time situational awareness. The NBI service builds and queries `backend/data/nbi_bridges.db` from the FHWA dataset.

## Tests

```bash
cd backend
python3 -m pytest tests/ -v
```

Tests cover API endpoints, location resolution, sampling rules, OSRM generation, disaster weighting, safety gates, contingency ranking, and backup independence.
