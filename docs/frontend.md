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

1. Enter an origin and destination as a place name, address, or `latitude, longitude` coordinate pair.
2. Add optional intermediate stops or waypoints.
3. Choose a disaster protocol (`All Hazards`, `Wildfire`, `Flood / Surge`, `Earthquake`, or `Landslide`) and vehicle fleet profile.
4. Optionally place road barriers or roadblocks on the map to model closures.
5. Run the analysis.
6. Review the selected route, candidate corridors, map, elevation profile, sample evidence, population exposure, capacity analysis, and decision briefing.
7. Switch between corridors, inspect bottlenecks, review multi-corridor capacity, or engage live monitoring.

The map supports direct point picking for origin, destination, waypoints, and custom hazard roadblocks. Typed locations are resolved through the backend geocoder with debouncing. Direct coordinate input is recognised immediately in the browser without external geocoding calls.

## Component structure

| Component | Responsibility |
|---|---|
| `src/App.jsx` | Application state, analysis orchestration, selected route, and layout containers |
| `src/services/api.js` | REST client and SSE live stream consumer |
| `src/components/SearchPanel.jsx` | Origin/destination inputs, protocol selection, vehicle fleet profile, and layer controls |
| `src/components/SidePanel.jsx` | Expandable sidebar housing route cards, metrics, profiles, and evidence drawers |
| `src/components/MapView.jsx` | Interactive Leaflet map, route polyline rendering, bottleneck markers, isochrones, and point picking |
| `src/components/RouteCard.jsx` | Corridor card with viability gauge, metrics, traffic, energy readiness, and contingency status badges |
| `src/components/DecisionReadout.jsx` | Compact decision preview banner with active hazard warnings and role badges |
| `src/components/PopulationPanel.jsx` | Census population exposure (ETE) and clearance time window estimation |
| `src/components/CapacityPanel.jsx` | Multi-corridor network outflow throughput, shared trunk conflicts, and corridor flow limits |
| `src/components/TTCCountdownPanel.jsx` | Time-to-Cutoff (TTC) hazard intercept countdown and sector distance alerts |
| `src/components/ElevationProfile.jsx` | Route elevation graph, slope percentages, and terrain classification |
| `src/components/SampleInspector.jsx` | Deep-dive modal inspecting bridge condition, slope, and Mireye physical-world facts |
| `src/components/SegmentManager.jsx` | Sub-segment repair interface supporting automatic rerouting and manual avoidance |
| `src/components/ScrapedAlertsPanel.jsx` | Real-time web-scraped emergency feeds, USGS seismic events, and live dispatch bulletins |
| `src/components/LiveMonitorHUD.jsx` | Real-time SSE telemetry feed and corridor condition change notifications |
| `src/components/AgentBriefing.jsx` | Full decision synthesis, trade-off narrative, and evidence coverage summary |
| `src/components/ZonePlanner.jsx` | Multi-origin zone evacuation allocator balancing regional destination network capacity |
| `src/components/ExportPanel.jsx` | Emergency route manifest and waypoint data export (JSON / CSV / GeoJSON) |

## Styling and Layout

The interface uses Tailwind CSS utility classes and an operational dark theme (`rs-dark`). Custom tokens and panel animations reside in `index.css`. Sidebar child containers maintain natural content height (`shrink-0 min-h-fit`) to prevent vertical clipping on compact viewports, while the left container supports horizontal drag-resizing between standard, wide, and ultra-wide modes.
