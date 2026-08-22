# RouteShield

When a disaster hits, Google Maps routes you fast. RouteShield routes you **safe**.

Standard navigation optimizes for time. During a wildfire, hurricane, or earthquake, the fastest road is often the first one that fails — a bridge that's been rated "poor condition" for 20 years, a canyon road that floods in 30 minutes, a highway overpass sitting on a fault line.

RouteShield analyzes the full physical picture along every candidate evacuation corridor and tells you which route to take, which to keep as a backup, and which to avoid entirely.

---

## How it works

You give it an origin and destination. It:

1. **Finds multiple routes** — not just the fastest, but lateral bypass corridors too, so you're never stuck with one option
2. **Samples every 500m** along each route and pulls physical data at each point:
   - Elevation and slope from USGS 3DEP
   - Bridge condition from the FHWA National Bridge Inventory (740k+ US bridges)
   - Seismic hazard, wildfire risk, flood zone, landslide susceptibility, dam proximity and more from [Mireye](https://mireye.ai)
3. **Scores each point** with a Bottleneck Severity Index — a composite of hazard exposure, bridge vulnerability, and terrain difficulty
4. **Ranks routes** into Primary, Backup, and High Risk with a plain-English explanation of what's wrong and why

The worst bottleneck on the worst route gets a deep-dive AI analysis from Mireye's `/v1/ask` endpoint — grounded in real datasets with citations.

---

## Data sources

| What | Source |
|---|---|
| Routing | OSRM (public) |
| Elevation + slope | Open-Meteo DEM / USGS 3DEP via Mireye |
| Bridge conditions | FHWA National Bridge Inventory (local SQLite) |
| Seismic PGA | USGS NSHM 2023 via Mireye |
| Flood zones | FEMA NFHL (SFHA + zone codes) via Mireye |
| Wildfire | FEMA NRI + CAL FIRE FHSZ via Mireye |
| Landslide | USGS Landslide Susceptibility via Mireye |
| Dam hazard | USACE National Inventory of Dams via Mireye |
| Geocoding | Mireye `/v1/geocode` + `/v1/lookup` |

---

## Running it

**Requirements:** Python 3.10+, Node 18+

**1. Set up your `.env`**
```env
MIREYE_API_KEY=your_key_here
MIREYE_BASE_URL=https://api.mireye.com/v1
OSRM_BASE_URL=http://router.project-osrm.org
ROUTE_SAMPLE_INTERVAL_M=500
ENABLE_CACHE=true
```

**2. Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**3. Frontend**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Good corridors to test

| Scenario | From | To |
|---|---|---|
| Mountain flooding + landslides | Asheville, NC | Charlotte, NC |
| Wildfire canyon (Camp Fire corridor) | Paradise, CA | Chico, CA |
| Seismic fault crossings | Santa Cruz, CA | San Jose, CA |
| Coastal hurricane surge | Key West, FL | Miami, FL |

---

## Tests

```bash
cd backend && python3 -m pytest tests/ -v
```