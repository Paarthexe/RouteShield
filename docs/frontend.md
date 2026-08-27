# Frontend guide

The frontend is a React 18 application built with Vite, Tailwind CSS, Leaflet, and React Leaflet. It makes the RouteShield decision understandable in a situation where people may need to assess risk quickly. Its source lives in `frontend/src`.

## Run it

```bash
cd frontend
npm install
npm run dev
```

Vite starts on [http://localhost:3000](http://localhost:3000). During development, it proxies `/api` requests to `http://127.0.0.1:8000`.

Create a production bundle with:

```bash
npm run build
```

The Docker image serves the built application through nginx and forwards `/api` requests to the backend container.

## User flow

1. Enter an origin and destination as a place name, address, or `latitude, longitude` pair.
2. Add optional waypoints.
3. Choose a disaster mode and sample density.
4. Run the analysis.
5. Review the selected route, candidate corridors, map, elevation profile, sample evidence, and decision briefing.

The map also supports point picking for the origin, destination, and waypoints. Before an analysis runs, the app resolves typed locations after a short pause to provide map context. Coordinate input is recognised in the browser without a location API call.

## Main pieces

| File | Responsibility |
|---|---|
| `src/App.jsx` | Application state, analysis request, selected route, and layout |
| `src/services/api.js` | Calls the analysis and location-resolution endpoints |
| `src/components/LocationInput.jsx` | Location fields, waypoint controls, disaster mode, and sampling settings |
| `src/components/MapView.jsx` | Leaflet map, route lines, markers, samples, and map picking |
| `src/components/RouteCard.jsx` | Selected-corridor summary and viability display |
| `src/components/RouteComparison.jsx` | Candidate-route comparison and selection |
| `src/components/ElevationProfile.jsx` | Route elevation chart |
| `src/components/SampleInspector.jsx` | Per-sample bridge, slope, and hazard evidence |
| `src/components/AgentBriefing.jsx` | Primary, backup, and decision explanation |
| `src/components/DecisionReadout.jsx` | Compact route decision readout |
| `src/components/AnalysisTrace.jsx` | Analysis progress and returned decision steps |

## API contract used by the UI

`analyzeRoutes` sends `POST /api/routes/analyze` with the origin, destination, non-empty waypoints, sample interval, and disaster type. `resolveLocation` sends `POST /api/location/resolve` with a text query.

The UI expects the analysis response to include `routes` and optionally `agent_decision`. Each route includes geometry, timing, samples, bottlenecks, and viability data. The map treats the route geometry as GeoJSON longitude and latitude pairs.

## Styling and map details

The interface uses Tailwind utility classes and a dark operational-map theme. `index.css` holds the shared global styling. `MapView.jsx` assigns a fixed colour to each of the five possible route IDs, displays bottleneck markers, and keeps the map bounds aligned with the current analysis.
