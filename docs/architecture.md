# RouteShield architecture

RouteShield is a web application for analysing evacuation corridors when a routing choice may affect public safety. It is a concrete use of Mireye's physical-world intelligence: the app takes location evidence that would otherwise remain a set of individual facts and applies it to the corridor people would actually travel.

The frontend gathers an origin, destination, optional waypoints, a sample interval, vehicle profile, and a disaster mode. The backend resolves locations, builds candidate routes, enriches samples along those routes, scores risk, evaluates network capacity, models hazard spread, and returns a structured decision for the interface to show. This makes it possible to see where a route is exposed, what infrastructure is involved, and whether a backup is genuinely separate enough to be useful.

## System shape

```text
React and Leaflet frontend
          |
          | /api  (REST + SSE live streams)
          v
FastAPI backend
  |       |       |        |        |
  |       |       |        |        +-- SQLite cache & spatial index
  |       |       |        +----------- Open-Meteo elevation & weather APIs
  |       |       +-------------------- Mireye geocoding, fetch, & AI ask APIs
  |       +---------------------------- OSRM routing & nearest APIs
  +------------------------------------ NOAA Alerts & OpenFEMA Declarations
  |
  +------------------------------------ Local FHWA NBI SQLite index & Overpass
```

In development, Vite proxies `/api` calls to FastAPI on port 8000. In Docker, nginx serves the frontend and proxies the same path to the backend container.

## Analysis flow

1. The API receives text locations or latitude and longitude coordinates.
2. Text locations are resolved through Mireye geocoding with Nominatim fallback. Direct coordinate inputs require no geocoding.
3. The routing service asks OSRM for driving alternatives. If fewer than five routes are returned and no waypoints were supplied, it synthesises extra lateral corridors through road-snapped anchor points while filtering detours, loops, and backtracking.
4. Each route is processed concurrently. The sampling service creates equidistant points at the requested interval while preserving exact endpoints.
5. Open-Meteo returns elevations and real-time weather in bulk. The service calculates grade between samples, models wind vector alignment, and looks up nearby NBI bridge records for every point.
6. The service selects high-value critical samples for Mireye hazard probes based on bridge condition, steepness, low elevation, route coverage, and the active disaster mode. Low-elevation points also receive a flood-risk probe.
7. The bottleneck service calculates hazard risk, bridge vulnerability, terrain penalty, and bottleneck severity for every sample.
8. The viability service scores each corridor and applies safety gates. If all routes encounter active hazard gate breaches, the service designates the highest-resilience path as the primary contingency corridor with explicit hazard warnings rather than leaving the user with no viable route.
9. Redundancy analysis checks candidate backups against the primary route using spatial buffering (350 m overlap limit) and FHWA structure ID deduplication.
10. Dynamic isochrones calculate hazard perimeter propagation and time-to-cutoff clearance windows for each corridor using the Rothermel spread equation.
11. Census exposure models population count and estimated evacuation clearance time (ETE) bounds. Multi-corridor capacity models network throughput and shared trunk conflicts.
12. The response includes routes, samples, bottlenecks, viability details, weather conditions, population exposure, capacity analysis, after-action reports, and a structured decision briefing.

Every step preserves the link between the decision and the underlying location evidence. A route recommendation is easier to trust and act on when the reason for it is visible at corridor and sample level.

## Risk model

The bottleneck severity index (BSI) is calculated as:

```text
hazard risk × (1 + bridge vulnerability) × terrain penalty
```

Hazard risk combines the available Mireye signals, including seismic PGA, fire severity, flood-zone and water indicators, landslide susceptibility, dam proximity, coastal elevation, and grade. The disaster mode increases the contribution of signals relevant to that event.

Bridge vulnerability uses the worst available NBI component rating across deck, superstructure, substructure, channel, and culvert condition. Age, sufficiency rating, and relevant disaster conditions can increase the result.

Terrain penalties are based on absolute route grade:

| Grade | Penalty |
|---|---:|
| 0 to 6% | 1.00 |
| Above 6 to 10% | 1.15 |
| Above 10 to 18% | 1.40 |
| Above 18% | 1.70 |

The route viability score begins at 100 and deducts for hazard exposure, bottleneck severity, and additional travel time. A corridor is flagged for rejection if its maximum bottleneck severity exceeds 2.00, if critical bottleneck density exceeds 35%, or if more than 60% of samples have hazard risk above 0.50. In emergency situations where all candidate corridors breach these thresholds, the highest-scoring corridor is recommended as a contingency path with prominent hazard alerts.

## Backup independence

A backup must provide a genuinely separate alternate corridor. RouteShield compares sample points with the primary route using a 350-metre overlap buffer. It also checks for shared NBI bridge structure IDs. A route is eligible as an independent backup when it has no shared bridge structures and an independence score of at least 60.

## Main modules

| Area | Responsibility |
|---|---|
| `backend/app/api/` | Route analysis, location resolution, live SSE streaming, and segment repair |
| `backend/app/services/routing.py` | OSRM routing, nearest-road snapping, and alternative-corridor synthesis |
| `backend/app/services/sampling.py` | Distance sampling, parallel elevation, bridge lookup, and Mireye probing |
| `backend/app/services/open_meteo_service.py` | Bulk elevation and weather lookup |
| `backend/app/services/nbi_service.py` | NBI index creation and nearby-bridge lookup |
| `backend/app/services/mireye_service.py` | Mireye fetch, geocode, and AI ask requests |
| `backend/app/services/bottleneck_service.py` | Sample-level risk and bottleneck severity calculation |
| `backend/app/services/viability_service.py` | Route scoring, rejection gates, and contingency ranking |
| `backend/app/services/redundancy_service.py` | Backup overlap and shared-bridge checks |
| `backend/app/services/isochrone_service.py` | Hazard propagation modeling and time-to-cutoff evaluation |
| `backend/app/services/capacity_service.py` | Multi-corridor throughput and shared trunk bottleneck analysis |
| `backend/app/services/population_service.py` | Census population exposure and ETE clearance estimation |
| `backend/app/services/aar_service.py` | Live NOAA alerts and OpenFEMA disaster matching |
| `backend/app/services/agent_service.py` | Decision assembly, trade-off explanation, and evidence synthesis |
| `frontend/src/components/` | Map, interactive controls, route cards, elevation profiles, and evidence inspectors |

## Data behaviour

The cache service stores external responses in SQLite. The NBI service creates its own SQLite index from the supplied FHWA fixed-width dataset.
