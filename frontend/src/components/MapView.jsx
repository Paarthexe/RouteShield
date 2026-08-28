import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  MapPin,
  Navigation,
  Compass,
  CheckCircle2,
  Fuel,
  Plus,
} from "lucide-react";


const normalizeLatLon = (item) => {
  const latitude = Number(item?.latitude ?? item?.lat);
  const longitude = Number(item?.longitude ?? item?.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
};

const dedupeStationsForDisplay = (stations, maxStations = 15) => {
  const distinctStations = [];

  for (const station of stations) {
    const coords = normalizeLatLon(station);
    if (!coords) continue;

    const isNear = distinctStations.some((existing) => {
      const existingCoords = normalizeLatLon(existing);
      if (!existingCoords) return false;

      return (
        Math.hypot(
          existingCoords.latitude - coords.latitude,
          existingCoords.longitude - coords.longitude,
        ) < 0.006
      );
    });

    if (!isNear || distinctStations.length < maxStations) {
      distinctStations.push(station);
    }
  }

  return distinctStations;
};

const createStationChipIcon = (isGas, isFast) => {
  const shortLabel = isGas ? "Fuel" : isFast ? "Fast EV" : "AC";
  const bgColor = isGas ? "rgba(88, 28, 135, 0.92)" : isFast ? "rgba(6, 78, 59, 0.92)" : "rgba(7, 89, 133, 0.92)";
  const borderColor = isGas ? "#c084fc" : isFast ? "#10b981" : "#38bdf8";
  const textColor = isGas ? "#f3e8ff" : isFast ? "#a7f3d0" : "#bae6fd";
  const dotColor = isGas ? "#c084fc" : isFast ? "#10b981" : "#38bdf8";

  return L.divIcon({
    className: "custom-station-chip-marker",
    html: `
      <div style="
        transform: translate(-50%, -50%);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px 2px 4px;
        border-radius: 999px;
        border: 1px solid ${borderColor};
        background: ${bgColor};
        color: ${textColor};
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 9px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.02em;
        white-space: nowrap;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
      ">
        <span style="
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: ${dotColor};
          box-shadow: 0 0 6px ${dotColor};
          flex: 0 0 auto;
        "></span>
        <span>${shortLabel}</span>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

const createStationDotIcon = (isGas, isFast) => {
  const dotColor = isGas ? "#c084fc" : isFast ? "#10b981" : "#38bdf8";

  return L.divIcon({
    className: "custom-station-dot-marker",
    html: `
      <div style="
        transform: translate(-50%, -50%);
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: ${dotColor};
        border: 1.5px solid rgba(9, 9, 11, 0.95);
        box-shadow: 0 0 8px ${dotColor}aa;
      "></div>
    `,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
};

const ROUTE_LINE_COLORS = {
  route_1: "#06b6d4", // Cyan
  route_2: "#a855f7", // Purple
  route_3: "#f59e0b", // Amber
  route_4: "#10b981", // Emerald
  route_5: "#f43f5e", // Rose
};

const getRouteColor = (routeId) => ROUTE_LINE_COLORS[routeId] || "#38bdf8";

// Custom Icon Helpers
const createCustomMarkerIcon = (label, colorBg, borderColor) => {
  return L.divIcon({
    className: "custom-map-marker",
    html: `
      <div style="
        background-color: ${colorBg};
        border: 2px solid ${borderColor};
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 12px;
        box-shadow: 0 0 12px ${colorBg};
      ">
        ${label}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

const createBottleneckIcon = (severity) => {
  const color = severity === "Critical" ? "#ef4444" : "#f59e0b";
  const size = severity === "Critical" ? 24 : 20;
  return L.divIcon({
    className: "bottleneck-marker",
    html: `
      <div style="
        background-color: ${color}25;
        border: 2px solid ${color};
        color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 11px;
        box-shadow: 0 0 10px ${color}80;
        animation: pulse 2s infinite;
      ">
        !
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const originIcon = createCustomMarkerIcon("A", "#10b981", "#ffffff");
const destinationIcon = createCustomMarkerIcon("B", "#f43f5e", "#ffffff");
const bridgeIcon = createCustomMarkerIcon("≈", "#f59e0b", "#fde68a");

const createMireyeProbeMarkerIcon = (isSelected = false) => {
  const size = isSelected ? 22 : 16;
  return L.divIcon({
    className: "custom-mireye-icon",
    html: `
      <div style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.25);
          border: 1.5px dashed #10b981;
        "></div>
        <div style="
          width: ${isSelected ? 10 : 7}px;
          height: ${isSelected ? 10 : 7}px;
          background: ${isSelected ? "#38bdf8" : "#10b981"};
          border: 1.5px solid #ffffff;
          transform: rotate(45deg);
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.85);
        "></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Map view bounds adjuster component
function MapBoundsAdjuster({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [bounds, map]);
  return null;
}

// Map Click Event Handler & Location Picker Component
function MapClickHandler({
  onSetOrigin,
  onSetDestination,
  onSetWaypoint,
  pickerMode,
  setPickerMode,
}) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (pickerMode === "origin") {
        onSetOrigin(lat, lng);
        setPickerMode(null);
      } else if (pickerMode === "destination") {
        onSetDestination(lat, lng);
        setPickerMode(null);
      } else if (pickerMode && pickerMode.startsWith("waypoint_")) {
        const idx = parseInt(pickerMode.replace("waypoint_", ""), 10);
        if (!isNaN(idx) && onSetWaypoint) {
          onSetWaypoint(idx, lat, lng);
        }
        setPickerMode(null);
      }
    },
  });

  return null;
}

const parseCoordStr = (val) => {
  if (!val) return null;
  if (
    typeof val === "object" &&
    Number.isFinite(Number(val.latitude)) &&
    Number.isFinite(Number(val.longitude))
  ) {
    const latitude = Number(val.latitude);
    const longitude = Number(val.longitude);

    return {
      latitude,
      longitude,
      display_name:
        val.display_name ||
        `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    };
  }
  if (typeof val === "string") {
    const parts = val.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return {
        latitude: parts[0],
        longitude: parts[1],
        display_name: `Point (${parts[0].toFixed(4)}, ${parts[1].toFixed(4)})`,
      };
    }
  }
  return null;
};

export default function MapView({
  origin,
  destination,
  waypoints = [],
  routes = [],
  selectedRouteId,
  onSelectRoute,
  showSamples,
  selectedSample,
  onSelectSample,
  onSetOrigin,
  onSetDestination,
  onSetWaypoint,
  onAddWaypoint,
  rawOriginStr,
  rawDestinationStr,
  rawWaypoints = [],
  resolvedOrigin,
  resolvedDestination,
  resolvedWaypoints = [],
  pickerMode,
  setPickerMode,
}) {
  const [showRefuelHubs, setShowRefuelHubs] = useState(false);
  const [refuelFilter, setRefuelFilter] = useState("all"); // 'all' | 'gas' | 'fast_ev' | 'std_ev'
  const originObj =
    parseCoordStr(origin) || resolvedOrigin || parseCoordStr(rawOriginStr);
  const destinationObj =
    parseCoordStr(destination) ||
    resolvedDestination ||
    parseCoordStr(rawDestinationStr);

  const rawWpObjs = (waypoints.length > 0 ? waypoints : rawWaypoints).map(
    (wp) => parseCoordStr(wp),
  );
  const waypointObjs = rawWpObjs
    .map((obj, i) => obj || (resolvedWaypoints && resolvedWaypoints[i]))
    .filter(Boolean);

  // Center fallback (San Francisco coordinates)
  const defaultCenter = [37.7749, -122.4194];
  const defaultZoom = 11;

  // Calculate bounds if origin, waypoints, destination or routes present
  let mapBounds = [];
  if (originObj) {
    mapBounds.push([originObj.latitude, originObj.longitude]);
  }
  waypointObjs.forEach((wp) => {
    mapBounds.push([wp.latitude, wp.longitude]);
  });
  if (destinationObj) {
    mapBounds.push([destinationObj.latitude, destinationObj.longitude]);
  }

  if (routes && routes.length > 0) {
    routes.forEach((route) => {
      route.geometry.coordinates.forEach(([lon, lat]) => {
        mapBounds.push([lat, lon]);
      });
    });
  }

  const selectedRouteObj =
    routes.find((r) => r.route_id === selectedRouteId) || routes[0] || null;

  const allStations = selectedRouteObj?.infrastructure?.stations || [
    ...(selectedRouteObj?.infrastructure?.gas_stations || []),
    ...(selectedRouteObj?.infrastructure?.ev_fast_stations || []),
    ...(selectedRouteObj?.infrastructure?.ev_standard_stations || []),
  ];

  const gasStations =
    selectedRouteObj?.infrastructure?.gas_stations?.length > 0
      ? selectedRouteObj.infrastructure.gas_stations
      : allStations.filter((s) => s.station_type === "gas");

  const evFastStations =
    selectedRouteObj?.infrastructure?.ev_fast_stations?.length > 0
      ? selectedRouteObj.infrastructure.ev_fast_stations
      : allStations.filter(
          (s) => s.station_type === "ev_fast" || s.speed_tier === "fast",
        );

  const evStdStations =
    selectedRouteObj?.infrastructure?.ev_standard_stations?.length > 0
      ? selectedRouteObj.infrastructure.ev_standard_stations
      : allStations.filter(
          (s) => s.station_type === "ev_standard" && s.speed_tier !== "fast",
        );

  const stationsToRender =
    refuelFilter === "gas"
      ? gasStations
      : refuelFilter === "fast_ev"
        ? evFastStations
        : refuelFilter === "std_ev"
          ? evStdStations
          : allStations;

  // Construct preview path coordinates (Origin -> Waypoints -> Destination)
  const previewPositions = [];
  if (originObj)
    previewPositions.push([originObj.latitude, originObj.longitude]);
  waypointObjs.forEach((wp) =>
    previewPositions.push([wp.latitude, wp.longitude]),
  );
  if (destinationObj)
    previewPositions.push([destinationObj.latitude, destinationObj.longitude]);

  // Build bottleneck data for the selected route
  const bottlenecks = selectedRouteObj?.bottlenecks || [];

  // CARTO raster basemaps watermark tiles unless ?key= is a valid free basemap API key
  // Request one at https://carto.com/basemaps/apikey (param name is `key`, not `api_key`)
  const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY || "";
  const tileUrl = cartoApiKey
    ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoApiKey)}`
    : `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`;

  return (
    <div className="relative w-full h-full min-h-[600px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        scrollWheelZoom={true}
        className="w-full h-full z-10"
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={tileUrl}
          subdomains="abcd"
          maxZoom={19}
        />

        <MapBoundsAdjuster bounds={mapBounds.length > 0 ? mapBounds : null} />

        {/* Map Click Picker Handler */}
        <MapClickHandler
          onSetOrigin={onSetOrigin}
          onSetDestination={onSetDestination}
          onSetWaypoint={onSetWaypoint}
          pickerMode={pickerMode}
          setPickerMode={setPickerMode}
        />

        {/* Dashed Preview Line between Origin -> Waypoints -> Destination before route generation */}
        {previewPositions.length >= 2 && (!routes || routes.length === 0) && (
          <Polyline
            positions={previewPositions}
            pathOptions={{
              color: "#38bdf8",
              weight: 2.5,
              opacity: 0.7,
              dashArray: "6, 8",
            }}
          />
        )}

        {/* Origin Marker (A) */}
        {originObj && (
          <Marker
            position={[originObj.latitude, originObj.longitude]}
            icon={createCustomMarkerIcon("A", "#10b981", "#ffffff")}
          >
            <Popup>
              <div className="p-1 space-y-1 font-sans">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block font-mono">
                  INCIDENT LOCATION (ORIGIN A)
                </span>
                <p className="text-xs font-semibold text-slate-100">
                  {originObj.display_name}
                </p>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {originObj.latitude.toFixed(5)},{" "}
                  {originObj.longitude.toFixed(5)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Intermediate Waypoint Markers (B, C, D...) */}
        {waypointObjs.map((wp, idx) => {
          const letter = String.fromCharCode(66 + idx);
          return (
            <Marker
              key={idx}
              position={[wp.latitude, wp.longitude]}
              icon={createCustomMarkerIcon(letter, "#f59e0b", "#ffffff")}
            >
              <Popup>
                <div className="p-1 space-y-1 font-sans">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block font-mono">
                    INTERMEDIATE STOP ({letter})
                  </span>
                  <p className="text-xs font-semibold text-slate-100">
                    {wp.display_name}
                  </p>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)}
                  </span>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Destination Marker (B, C, D, E...) */}
        {destinationObj && (
          <Marker
            position={[destinationObj.latitude, destinationObj.longitude]}
            icon={createCustomMarkerIcon(
              String.fromCharCode(66 + waypointObjs.length),
              "#f43f5e",
              "#ffffff",
            )}
          >
            <Popup>
              <div className="p-1 space-y-1 font-sans">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block font-mono">
                  EVACUATION DESTINATION (
                  {String.fromCharCode(66 + waypointObjs.length)})
                </span>
                <p className="text-xs font-semibold text-slate-100">
                  {destinationObj.display_name}
                </p>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {destinationObj.latitude.toFixed(5)},{" "}
                  {destinationObj.longitude.toFixed(5)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Render Route Polylines */}
        {routes &&
          routes.map((route) => {
            const isSelected = route.route_id === selectedRouteId;
            const positions = route.geometry.coordinates.map(([lon, lat]) => [
              lat,
              lon,
            ]);
            const strokeColor = ROUTE_LINE_COLORS[route.route_id] || "#06b6d4";

            // Build Google Maps style traffic color sub-segments if selected & traffic data exists
            const hasTraffic =
              isSelected &&
              route.samples &&
              route.samples.some((s) => s.traffic_flow);
            const trafficSegments = [];

            if (
              hasTraffic &&
              route.samples.length > 1 &&
              positions.length > 1
            ) {
              // Find nearest coordinate index in full road geometry for each sample point
              const sampleGeoIndices = route.samples.map((s) => {
                let minD = Infinity;
                let bestIdx = 0;
                for (let pIdx = 0; pIdx < positions.length; pIdx++) {
                  const d = Math.hypot(
                    positions[pIdx][0] - s.latitude,
                    positions[pIdx][1] - s.longitude,
                  );
                  if (d < minD) {
                    minD = d;
                    bestIdx = pIdx;
                  }
                }
                return bestIdx;
              });

              for (let i = 0; i < route.samples.length - 1; i++) {
                const s1 = route.samples[i];
                const tf = s1.traffic_flow;

                const idxStart = sampleGeoIndices[i];
                const idxEnd = Math.max(idxStart + 1, sampleGeoIndices[i + 1]);
                const segCoords = positions.slice(idxStart, idxEnd + 1);

                if (segCoords.length < 2) continue;

                let segColor = strokeColor;
                let condStr = "Traffic Flow Normal";
                let speedStr = "";

                if (tf) {
                  if (tf.road_closed) {
                    segColor = "#991b1b"; // Dark Crimson (Closed)
                    condStr = "ROAD CLOSED";
                  } else if (
                    tf.congestion_condition &&
                    tf.congestion_condition.includes("Heavy")
                  ) {
                    segColor = "#ef4444"; // Red (Heavy)
                    condStr = "Heavy Congestion";
                  } else if (
                    tf.congestion_condition &&
                    tf.congestion_condition.includes("Moderate")
                  ) {
                    segColor = "#f59e0b"; // Amber (Moderate)
                    condStr = "Moderate Traffic";
                  } else if (
                    tf.congestion_condition &&
                    tf.congestion_condition.includes("Free")
                  ) {
                    segColor = "#10b981"; // Green (Free Flow)
                    condStr = "Free Flow";
                  }
                  speedStr = `${tf.current_speed_kmh} km/h`;
                }

                trafficSegments.push({
                  coords: segCoords,
                  color: segColor,
                  condition: condStr,
                  speed: speedStr,
                });
              }
            }

            return (
              <React.Fragment key={route.route_id}>
                {/* Invisible click target so alternate corridors are easy to select from the map */}
                <Polyline
                  positions={positions}
                  eventHandlers={{
                    click: () => onSelectRoute(route.route_id),
                  }}
                  pathOptions={{
                    color: strokeColor,
                    weight: isSelected ? 16 : 18,
                    opacity: 0,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />

                {/* Outer Glow for Selected Route */}
                {isSelected && (
                  <Polyline
                    positions={positions}
                    pathOptions={{
                      color: strokeColor,
                      weight: 10,
                      opacity: 0.35,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                )}

                {/* Main Line */}
                <Polyline
                  positions={positions}
                  eventHandlers={{
                    click: () => onSelectRoute(route.route_id),
                  }}
                  pathOptions={{
                    color: strokeColor,
                    weight: isSelected ? 6 : 4,
                    opacity: isSelected ? 1.0 : 0.45,
                    dashArray: isSelected ? null : "6, 8",
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
                {/* Selected Route with Multi-Color Traffic Segments */}
                {isSelected && hasTraffic && trafficSegments.length > 0 ? (
                  trafficSegments.map((seg, sIdx) => (
                    <Polyline
                      key={`seg-${route.route_id}-${sIdx}`}
                      positions={seg.coords}
                      eventHandlers={{
                        click: () => onSelectRoute(route.route_id),
                      }}
                      pathOptions={{
                        color: seg.color,
                        weight: 6,
                        opacity: 1.0,
                        lineCap: "round",
                        lineJoin: "round",
                      }}
                    >
                      <Tooltip
                        sticky
                        className="custom-traffic-tooltip"
                        direction="top"
                        offset={[0, -4]}
                      >
                        <div className="font-mono text-[10px] text-zinc-100 flex items-center gap-1.5 leading-none">
                          <span
                            className={`font-bold ${
                              seg.color === "#10b981"
                                ? "text-emerald-400"
                                : seg.color === "#f59e0b"
                                  ? "text-amber-400"
                                  : seg.color === "#ef4444"
                                    ? "text-rose-400"
                                    : "text-rose-500"
                            }`}
                          >
                            {seg.condition}
                          </span>
                          {seg.speed && (
                            <span className="text-zinc-400">· {seg.speed}</span>
                          )}
                        </div>
                      </Tooltip>
                    </Polyline>
                  ))
                ) : (
                  /* Unselected Route OR Selected Route without Traffic data */
                  <Polyline
                    positions={positions}
                    eventHandlers={{
                      click: () => onSelectRoute(route.route_id),
                    }}
                    pathOptions={{
                      color: strokeColor,
                      weight: isSelected ? 6 : 4,
                      opacity: isSelected ? 1.0 : 0.45,
                      dashArray: isSelected ? null : "6, 8",
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}

        {/* Render physical distance samples with distinct Mireye probe highlights */}
        {showSamples &&
          selectedRouteObj &&
          selectedRouteObj.samples &&
          selectedRouteObj.samples.map((sample) => {
            const isSampleSelected =
              selectedSample && selectedSample.sample_id === sample.sample_id;
            const isMireyeProbed = sample.is_mireye_probed;
            const hazardScore = sample.hazard_score || 0;
            const distKm = (sample.distance_from_origin_m / 1000.0).toFixed(2);

            // Subtle color coding by hazard score
            let fillColor = "#06b6d4"; // Default cyan
            if (hazardScore > 0.5)
              fillColor = "#ef4444"; // Red
            else if (hazardScore > 0.3)
              fillColor = "#f59e0b"; // Amber
            else if (hazardScore > 0.1) fillColor = "#22d3ee"; // Light cyan

            const popupContent = (
              <Popup>
                <div className="p-1 space-y-1.5 font-sans text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-cyan-400 font-mono block">
                      {sample.sample_id}
                    </span>
                    {isMireyeProbed && (
                      <span className="text-[9px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-600 font-mono font-bold">
                        MIREYE PROBE
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-slate-100 font-mono text-[11px]">
                    Distance: <span className="text-cyan-300">{distKm} km</span>
                  </div>
                  {hazardScore > 0 && (
                    <div className="text-[10px] text-slate-300 font-mono">
                      Hazard Score:{" "}
                      <span
                        className={
                          hazardScore > 0.3
                            ? "text-amber-400 font-bold"
                            : "text-slate-300"
                        }
                      >
                        {hazardScore.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {sample.slope_pct != null && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      Slope:{" "}
                      <span
                        className={
                          Math.abs(sample.slope_pct) > 8
                            ? "text-rose-400 font-bold"
                            : "text-slate-300"
                        }
                      >
                        {sample.slope_pct.toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {sample.nbi_bridges && sample.nbi_bridges.length > 0 && (
                    <div className="text-[10px] text-amber-300 font-mono">
                      Bridges nearby: {sample.nbi_bridges.length}
                    </div>
                  )}
                  {sample.traffic_flow && (
                    <div className="text-[10px] text-emerald-300 font-mono flex items-center gap-1 mt-1 border-t border-slate-800 pt-1">
                      <span>
                        Speed: {sample.traffic_flow.current_speed_kmh} km/h (
                        {sample.traffic_flow.congestion_condition})
                      </span>
                    </div>
                  )}
                </div>
              </Popup>
            );

            if (isMireyeProbed) {
              return (
                <Marker
                  key={sample.sample_id}
                  position={[sample.latitude, sample.longitude]}
                  icon={createMireyeProbeMarkerIcon(isSampleSelected)}
                  eventHandlers={{
                    click: () => onSelectSample(sample),
                  }}
                >
                  {popupContent}
                </Marker>
              );
            }

            return (
              <CircleMarker
                key={sample.sample_id}
                center={[sample.latitude, sample.longitude]}
                radius={isSampleSelected ? 7 : 2.5}
                eventHandlers={{
                  click: () => onSelectSample(sample),
                }}
                pathOptions={{
                  fillColor: isSampleSelected ? "#38bdf8" : fillColor,
                  fillOpacity: isSampleSelected ? 1.0 : 0.45,
                  color: isSampleSelected ? "#ffffff" : "#0f172a",
                  weight: isSampleSelected ? 2 : 1,
                }}
              >
                {popupContent}
              </CircleMarker>
            );
          })}

        {/* Peak Bottleneck Markers (Top Critical & Moderate Chokepoints - Spaced >= 5km) */}
        {(() => {
          const criticalBns = (selectedRouteObj?.bottlenecks || [])
            .filter(
              (bn) => bn.severity_label === "Critical" || bn.bsi_score >= 0.4,
            )
            .sort((a, b) => b.bsi_score - a.bsi_score);

          // Deduplicate spatially so we only show top distinct chokepoints
          const distinctBns = [];
          for (const bn of criticalBns) {
            const isNear = distinctBns.some(
              (d) =>
                Math.hypot(
                  d.latitude - bn.latitude,
                  d.longitude - bn.longitude,
                ) < 0.03,
            );
            if (!isNear && distinctBns.length < 6) {
              distinctBns.push(bn);
            }
          }

          return distinctBns.map((bn, idx) => (
            <Marker
              key={`peak-bn-${idx}`}
              position={[bn.latitude, bn.longitude]}
              icon={createBottleneckIcon(bn.severity_label)}
              eventHandlers={{
                click: () => {
                  if (onSelectSample && selectedRouteObj?.samples) {
                    const matchedSample = selectedRouteObj.samples.find(
                      (s) => s.sample_id === bn.sample_id,
                    );
                    if (matchedSample) onSelectSample(matchedSample);
                  }
                },
              }}
            >
              <Popup>
                <div className="p-1 space-y-1 font-sans text-xs max-w-[240px]">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-[10px] font-bold uppercase font-mono px-1.5 py-0.5 rounded ${
                        bn.severity_label === "Critical"
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : "bg-amber-950 text-amber-300 border border-amber-800"
                      }`}
                    >
                      {bn.severity_label} Chokepoint
                    </span>
                    <span className="text-[10px] font-bold font-mono text-rose-400">
                      BSI: {bn.bsi_score.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-200 font-medium leading-tight">
                    {bn.description}
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[9px] text-slate-400 font-mono">
                    <span>Sample: {bn.sample_id}</span>
                    <span>
                      {(bn.distance_from_origin_m / 1000).toFixed(1)} km along
                      route
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ));
        })()}
        {/* Refueling Infrastructure Station Markers */}
        {showRefuelHubs &&
          (() => {
            const distinctStations = dedupeStationsForDisplay(stationsToRender);

            return distinctStations.map((st, sIdx) => {
              const coords = normalizeLatLon(st);
              if (!coords) return null;

              const isGas = st.station_type === "gas";
              const isFast =
                st.station_type === "ev_fast" || st.speed_tier === "fast";
              const quickLabel = isGas
                ? "Fuel stop"
                : isFast
                  ? "Fast EV charger"
                  : "Standard AC charger";
              const useCompactDot = refuelFilter === "all";
                
              const badgeClasses = isGas
                ? "bg-fuchsia-950/80 border-fuchsia-700 text-fuchsia-200"
                : isFast
                  ? "bg-emerald-950/80 border-emerald-700 text-emerald-300"
                  : "bg-sky-950/80 border-sky-700 text-sky-300";

              return (
                <Marker
                  key={st.id || `st-${sIdx}`}
                  position={[coords.latitude, coords.longitude]}
                  icon={
                    useCompactDot
                      ? createStationDotIcon(isGas, isFast)
                      : createStationChipIcon(isGas, isFast)
                  }
                >
                  <Tooltip
                    direction="top"
                    offset={useCompactDot ? [0, -6] : [0, -8]}
                    opacity={1}
                    className="custom-traffic-tooltip"
                  >
                    <div className="font-mono text-[10px] text-zinc-100 leading-tight">
                      <span className="font-bold text-slate-100">{quickLabel}</span>
                      <span className="text-zinc-400"> · {st.name}</span>
                    </div>
                  </Tooltip>
                  <Popup>
                    <div className="p-1 space-y-1.5 font-sans text-xs min-w-[220px]">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[9px] font-extrabold uppercase font-mono px-1.5 py-0.5 rounded border ${badgeClasses}`}
                        >
                          {st.speed_label ||
                            (isGas
                              ? "Gasoline / Diesel"
                              : isFast
                                ? "DC Fast Charger"
                                : "Standard AC")}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {st.offset_distance_m}m off-route
                        </span>
                      </div>

                      <div className="font-bold text-slate-100 text-xs leading-snug">
                        {st.name}
                      </div>

                      {st.brand && st.brand !== st.name && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          Network: {st.brand}
                        </div>
                      )}

                      {/* Stall Capacity & Power Tier */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded p-1.5 space-y-1 text-[10px] font-mono">
                        <div className="flex items-center justify-between text-slate-300">
                          <span>Capacity:</span>
                          <span className="font-bold text-slate-100">
                            {st.stalls_display ||
                              (isGas ? "Multi-Pump" : "Standard Stalls")}
                          </span>
                        </div>
                        {st.power_label && (
                          <div className="flex items-center justify-between text-slate-300">
                            <span>Output:</span>
                            <span className="text-slate-300">
                              {st.power_label}
                            </span>
                          </div>
                        )}
                        {st.est_charge_time && (
                          <div className="flex items-center justify-between text-slate-300">
                            <span>Est. Service:</span>
                            <span
                              className={
                                isGas
                                  ? "text-fuchsia-200 font-semibold"
                                  : isFast
                                    ? "text-emerald-300 font-semibold"
                                    : "text-sky-300"
                              }
                            >
                              {st.est_charge_time}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-cyan-300 font-mono">
                        Corridor Point: {st.distance_from_origin_km} km from
                        origin
                      </div>

                      {onAddWaypoint && (
                        <button
                          type="button"
                          onClick={() =>
                            onAddWaypoint({
                              latitude: st.latitude ?? st.lat,
                              longitude: st.longitude ?? st.lon,
                              query: st.name,
                              display_name: st.name,
                            })
                          }
                          className="w-full mt-1 px-2 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-200 text-[10px] font-mono font-semibold rounded flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="h-3 w-3 text-cyan-400" /> Add as
                          Refuel Waypoint
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            });
          })()}
      </MapContainer>

      {/* Minimalist Floating Refuel & EV Map HUD */}
      {selectedRouteObj && allStations.length > 0 && (
        <div className="absolute top-4 right-4 z-30 flex flex-col items-end gap-1.5">
          <div className="glass-panel border border-slate-800/80 rounded-xl p-1.5 shadow-2xl flex items-center gap-1.5 text-xs font-mono backdrop-blur-md bg-slate-950/85">
            <button
              type="button"
              onClick={() => setShowRefuelHubs(!showRefuelHubs)}
              title={
                showRefuelHubs
                  ? "Hide Fuel & EV Stations"
                  : "Show Fuel & EV Stations"
              }
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                showRefuelHubs
                  ? "bg-amber-950/90 border-amber-500/80 text-amber-300 shadow-md shadow-amber-950/50 font-bold"
                  : "bg-slate-900/80 border-slate-700/60 text-slate-300 hover:text-amber-300 hover:border-amber-700/50"
              }`}
            >
              <Fuel
                className={`h-4 w-4 ${showRefuelHubs ? "text-amber-400" : "text-slate-400"}`}
              />
              <span className="px-1.5 py-0.2 bg-slate-950 rounded text-[10px] font-mono font-bold text-amber-400 border border-amber-900/60">
                {allStations.length}
              </span>
            </button>

            {showRefuelHubs && (
              <div className="flex items-center gap-1 pl-1.5 border-l border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setRefuelFilter("all")}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    refuelFilter === "all"
                      ? "bg-slate-800 text-slate-100 font-bold border border-slate-600"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  All ({allStations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRefuelFilter("gas")}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    refuelFilter === "gas"
                      ? "bg-amber-900/80 border border-amber-600/60 text-amber-200 font-bold"
                      : "text-slate-400 hover:text-amber-300"
                  }`}
                >
                  Gas ({gasStations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRefuelFilter("fast_ev")}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    refuelFilter === "fast_ev"
                      ? "bg-emerald-900/80 border border-emerald-600/60 text-emerald-200 font-bold"
                      : "text-slate-400 hover:text-emerald-300"
                  }`}
                >
                  Fast EV ({evFastStations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRefuelFilter("std_ev")}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    refuelFilter === "std_ev"
                      ? "bg-sky-900/80 border border-sky-600/60 text-sky-200 font-bold"
                      : "text-slate-400 hover:text-sky-300"
                  }`}
                >
                  Std EV ({evStdStations.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend & Controls Overlay - ONLY SHOWN IF ROUTES ARE PRESENT */}
      {routes && routes.length > 0 && (
        <div className="absolute bottom-4 left-4 z-20 glass-panel p-3 rounded-xl border border-slate-800 text-xs shadow-xl max-w-xs space-y-2">
          <div className="flex items-center justify-between font-mono font-bold text-[11px] text-slate-300 uppercase">
            <span>CORRIDOR LEGEND</span>
          </div>
          <div className="space-y-1 text-[11px]">
            {routes.map((route, index) => (
              <div key={route.route_id} className="flex items-center space-x-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor:
                      ROUTE_LINE_COLORS[route.route_id] || "#06b6d4",
                  }}
                ></span>
                <span
                  className={
                    route.route_id === selectedRouteId
                      ? "text-slate-100"
                      : "text-slate-400"
                  }
                >
                  {route.tag || `Corridor ${index + 1}`}
                  {route.route_id === selectedRouteId ? " · Selected" : ""}
                </span>
              </div>
            ))}
            {selectedRouteObj?.samples?.some(
              (sample) => sample.nbi_bridges?.length,
            ) && (
              <div className="flex items-center space-x-2">
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[8px] text-slate-950">
                  ≈
                </span>
                <span className="text-slate-300">NBI bridge evidence</span>
              </div>
            )}
            {selectedRouteObj && allStations.length > 0 && (
              <>
                <div className="flex items-center space-x-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.6)]"></span>
                  <span className="text-slate-400">Gasoline / diesel stop</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]"></span>
                  <span className="text-slate-400">High-speed charging</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.55)]"></span>
                  <span className="text-slate-400">Standard charger</span>
                </div>
              </>
            )}
          </div>
          {/* Hazard color key */}
          <div className="border-t border-slate-800 pt-1 space-y-1 text-[10px]">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="text-slate-400">Low Risk Sample</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              <span className="text-slate-400">Moderate Hazard</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-rose-500"></span>
              <span className="text-slate-400">High Hazard</span>
            </div>
            {bottlenecks.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="h-3 w-3 rounded-sm bg-rose-500/20 border border-rose-500 text-[9px] font-bold flex items-center justify-center text-rose-400">
                  !
                </span>
                <span className="text-slate-400">
                  Bottleneck ({bottlenecks.length})
                </span>
              </div>
            )}
          </div>
          {/* Traffic speed indicator key */}
          <div className="border-t border-slate-800 pt-1 space-y-1 text-[10px]">
            <div className="flex items-center space-x-2">
              <span className="h-1.5 w-3 rounded bg-emerald-500"></span>
              <span className="text-slate-400">Live Traffic: Free Flow</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-1.5 w-3 rounded bg-amber-500"></span>
              <span className="text-slate-400">Live Traffic: Moderate</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-1.5 w-3 rounded bg-rose-500"></span>
              <span className="text-slate-400">
                Live Traffic: Heavy Congestion
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
