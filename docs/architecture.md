# RouteShield architecture

RouteShield is a web application for analysing evacuation corridors when a routing choice may affect public safety. It is a concrete use of Mireye's physical-world intelligence: the app takes location evidence that would otherwise remain a set of individual facts and applies it to the corridor people would actually travel.

The frontend gathers an origin, destination, optional waypoints, a sample interval, and a disaster mode. The backend resolves locations, builds candidate routes, enriches samples along those routes, scores risk, and returns a structured decision for the interface to show. This makes it possible to see where a route is exposed, what infrastructure is involved, and whether a backup is genuinely separate enough to be useful.

## System shape

```text
React and Leaflet frontend
          |
          | /api
          v
FastAPI backend
  |       |       |        |
  |       |       |        +-- SQLite cache
  |       |       +----------- Open-Meteo elevation API
  |       +------------------- Mireye geocoding and hazard APIs
  +--------------------------- OSRM routing API
  |
  +--------------------------- Local FHWA NBI SQLite index
```

In development, Vite proxies `/api` calls to FastAPI on port 8000. In Docker, nginx serves the frontend and proxies the same path to the backend container.

## Analysis flow

1. The API receives text locations or latitude and longitude coordinates.
2. Text locations are resolved through Mireye. Coordinate input needs no geocoding.
3. The routing service asks OSRM for driving alternatives. If fewer than five routes are returned and no waypoints were supplied, it attempts to build extra lateral corridors through road-snapped anchor points. Detour, duplicate, loop, and backtracking checks filter these candidates.
4. Each route is processed concurrently. The sampling service creates points at the requested interval while preserving both endpoints.
5. Open-Meteo returns elevations in bulk. The service calculates grade between samples and looks up nearby NBI bridge records for every point.
6. The service selects a small set of high-value samples for Mireye hazard probes. Selection considers bridge condition, steepness, low elevation, route coverage, and the active disaster mode. Low-elevation points also receive a flood-risk probe.
7. The bottleneck service calculates hazard risk, bridge vulnerability, terrain penalty, and bottleneck severity for every sample.
8. The viability service scores each corridor and applies rejection gates. The decision service selects the best viable primary route and verifies that any backup route has adequate spatial separation and no shared bridge records.
9. The response includes routes, samples, bottlenecks, viability details, evidence coverage, and a concise decision briefing.

Every step is intended to preserve the link between the decision and the underlying location evidence. A route recommendation is easier to trust and act on when the reason for it is visible at corridor and sample level.

## Risk model

The bottleneck severity index is calculated as:

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

The route viability score begins at 100 and deducts for hazard exposure, bottleneck severity, and additional travel time. A corridor is rejected if its maximum bottleneck severity exceeds 4.00 or if more than 60% of samples have hazard risk above 0.50.

## Backup independence

A backup must provide a useful alternate corridor. RouteShield compares its sample points with the primary route using a 350 metre overlap buffer. It also checks for shared NBI bridge structure IDs. A route is eligible as a backup when it has no shared bridge records and an independence score of at least 60.

## Main modules

| Area | Responsibility |
|---|---|
| `backend/app/api/` | Route, location, and health endpoints |
| `backend/app/services/routing.py` | OSRM routing and alternative-corridor synthesis |
| `backend/app/services/sampling.py` | Distance sampling and enrichment orchestration |
| `backend/app/services/open_meteo_service.py` | Bulk elevation lookup |
| `backend/app/services/nbi_service.py` | NBI index creation and nearby-bridge lookup |
| `backend/app/services/mireye_service.py` | Mireye fetch, lookup, and ask requests |
| `backend/app/services/bottleneck_service.py` | Sample-level risk and bottleneck calculation |
| `backend/app/services/viability_service.py` | Route scoring and rejection gates |
| `backend/app/services/redundancy_service.py` | Backup overlap and shared-bridge checks |
| `backend/app/services/agent_service.py` | Decision assembly and human-readable explanation |
| `frontend/src/components/` | Map, controls, route presentation, and evidence views |

## Data behaviour

The cache service stores external responses in SQLite. The NBI service creates its own SQLite index from the supplied FHWA fixed-width dataset. If that source file is missing, the service returns deterministic fallback bridge data for local demo behaviour. It should be replaced with the NBI dataset for real analysis.
