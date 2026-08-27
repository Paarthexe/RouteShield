# Backend guide

The backend is a FastAPI application in `backend/app`. It is the decision engine behind RouteShield: it turns a proposed evacuation journey into evidence about the roads, infrastructure, terrain, and hazards that shape whether that journey remains viable. It owns location resolution, route generation, sampling, enrichment, risk scoring, and the final route decision.

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
| `MIREYE_API_KEY` | empty | Enables Mireye geocoding and hazard data |
| `MIREYE_BASE_URL` | `https://api.mireye.com/v1` | Mireye API base URL |
| `MIREYE_MAX_PROBES` | `6` | Maximum targeted probes per route |
| `MIREYE_MAX_CONCURRENCY` | `4` | Concurrent Mireye requests |
| `OSRM_BASE_URL` | `http://router.project-osrm.org` | OSRM API base URL |
| `ROUTE_SAMPLE_INTERVAL_M` | `500` | Default sample spacing in metres |
| `CACHE_DB_PATH` | `./data/routeshield_cache.db` | SQLite cache location |
| `ENABLE_CACHE` | `true` | Cache toggle |
| `HTTP_TIMEOUT_S` | `10` | External request timeout |

## API

### `GET /api/health`

Returns service configuration and readiness details for the cache, NBI dataset, Mireye configuration, and OSRM endpoint.

### `POST /api/location/resolve`

Resolves a text location.

```json
{
  "query": "Paradise, CA"
}
```

Text resolution requires `MIREYE_API_KEY`. The service tries Mireye geocoding first and uses Nominatim when Mireye does not resolve the location.

### `POST /api/routes/generate`

Generates and samples candidate routes from coordinates. It does not return the full decision analysis.

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
  "disaster_type": "WILDFIRE"
}
```

Supported disaster types are `ALL_HAZARDS`, `WILDFIRE`, `FLOOD_HURRICANE`, `EARTHQUAKE`, and `LANDSLIDE`.

The response contains resolved locations, candidate routes, route samples, bottlenecks, viability results, and `agent_decision`. The decision includes the selected primary and backup IDs, rejected route IDs, decision steps, evidence coverage, and backup-independence data.

## Data services

The backend contacts OSRM and Open-Meteo during analysis. Mireye is used for geocoding and deep dives at certain sample models. The NBI service looks for `2025AllStatesNoDelimiterAllRecords.txt` in the repository root and builds `backend/data/nbi_bridges.db` from it.

## Tests

```bash
cd backend
python3 -m pytest tests/ -v
```

Tests cover API responses, location resolution, sampling rules, OSRM handling, disaster weighting, viability rejection, and backup independence.
