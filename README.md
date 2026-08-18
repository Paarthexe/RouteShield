# RouteShield

Evacuation route analysis system. Takes an origin and destination, generates candidate driving corridors via OSRM, samples each route at fixed physical distance intervals, and enriches every sample point with bridge infrastructure data and physical world facts.

---

## What's Actually Built

### Backend (FastAPI + Python)

**Endpoints:**
- `POST /api/location/resolve` — resolves a text address to lat/lng
- `POST /api/routes/generate` — generates candidate routes from coordinate pairs
- `POST /api/routes/analyze` — full pipeline: resolve → route → sample → enrich
- `GET /api/health`

**Services:**

| File | What it does |
|------|-------------|
| `geocoding.py` | Calls Mireye `/v1/geocode` first. On success, calls `/v1/lookup` to append county+state to the display name. Falls back to OSM Nominatim on 404 or failure. Results are SQLite-cached. |
| `routing.py` | Calls public OSRM (`router.project-osrm.org`) for 2–5 candidate driving routes with GeoJSON geometries. |
| `sampling.py` | Haversine interpolation along each route at fixed intervals (default 500m). Fires Mireye `/v1/fetch` calls via `asyncio.gather` with a semaphore capped at 4 concurrent requests to avoid 429s. |
| `mireye_service.py` | Wraps Mireye `/v1/fetch` (elevation + seismic PGA) and `/v1/lookup` (county/FIPS/census metadata). Both are wired into the active pipeline. |
| `nbi_service.py` | Parses 741,783 US bridge records from the FHWA NBI fixed-width file into SQLite with a spatial index. Returns bridges within 300m of any sample point. |
| `cache.py` | SQLite-backed key-value cache for geocoding and Mireye fetch results. |

**Data on each sample point:**
- `lat`, `lng`, `distance_from_origin_m`
- `mireye_data`: elevation (USGS 3DEP), seismic PGA 2%/50yr (USGS NSHM) — `null` if Mireye returns 429 or is unreachable
- `nbi_bridges`: list of nearby bridge structures with structure ID, year built, age, ADT, deck condition

**Per-route summary:**
- `infrastructure_summary`: total bridge count, aging bridges (pre-1970 or poor condition), average age

### Frontend (React + Vite + Leaflet)

- Text input for origin/destination
- Leaflet map showing all candidate routes as colored polylines
- Clicking a route highlights it and shows a route card (distance, travel time, bridge summary)
- Clicking a sample marker opens `SampleInspector`: shows Mireye elevation/seismic data + NBI bridge cards for that point

---

## Run It

**Backend:**
```bash
cd routeshield/backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd routeshield/frontend
npm run dev
```

Open `http://localhost:3000` (or 3001 if 3000 is taken).

---

## Env

```env
MIREYE_API_KEY=your_key
MIREYE_BASE_URL=https://api.mireye.com/v1
OSRM_BASE_URL=http://router.project-osrm.org
ROUTE_SAMPLE_INTERVAL_M=500
ENABLE_CACHE=true
```

---

## Notes

- Mireye `/v1/fetch` is capped at 4 concurrent requests per route via `asyncio.Semaphore` to avoid 429 `fetch_busy` errors. Individual sample points can still get `mireye_data: null` if the API is under load.
- **NBI data file is not in the repo** (317MB, gitignored). Download `2025AllStatesNoDelimiterAllRecords.txt` from [FHWA NBI](https://www.fhwa.dot.gov/bridge/nbi/ascii.cfm) and place it at the repo root. The SQLite index is built automatically on first backend startup.