import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Compass, CheckCircle2, Fuel, Plus } from 'lucide-react';

const ROUTE_LINE_COLORS = {
  route_1: '#06b6d4', // Cyan
  route_2: '#a855f7', // Purple
  route_3: '#f59e0b', // Amber
  route_4: '#10b981', // Emerald
};

// Custom Icon Helpers
const createCustomMarkerIcon = (label, colorBg, borderColor) => {
  return L.divIcon({
    className: 'custom-map-marker',
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

const createStationIcon = (type) => {
  const isGas = type === 'gas';
  const colorBg = isGas ? '#f59e0b' : '#10b981';
  const borderCol = isGas ? '#fbbf24' : '#34d399';
  const label = isGas ? 'GAS' : 'EV';
  return L.divIcon({
    className: 'custom-station-marker',
    html: `
      <div style="
        background-color: ${colorBg};
        border: 1.5px solid ${borderCol};
        color: #09090b;
        font-family: monospace;
        font-weight: 800;
        font-size: 9px;
        letter-spacing: -0.5px;
        padding: 2px 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 10px ${colorBg}80;
      ">
        ${label}
      </div>
    `,
    iconSize: [26, 16],
    iconAnchor: [13, 8],
  });
};

const createBottleneckIcon = (severity) => {
  const color = severity === 'Critical' ? '#ef4444' : '#f59e0b';
  const size = severity === 'Critical' ? 24 : 20;
  return L.divIcon({
    className: 'bottleneck-marker',
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

const originIcon = createCustomMarkerIcon('A', '#10b981', '#ffffff');
const destinationIcon = createCustomMarkerIcon('B', '#f43f5e', '#ffffff');

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
function MapClickHandler({ onSetOrigin, onSetDestination, onSetWaypoint, pickerMode, setPickerMode }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (pickerMode === 'origin') {
        onSetOrigin(lat, lng);
        setPickerMode(null);
      } else if (pickerMode === 'destination') {
        onSetDestination(lat, lng);
        setPickerMode(null);
      } else if (pickerMode && pickerMode.startsWith('waypoint_')) {
        const idx = parseInt(pickerMode.replace('waypoint_', ''), 10);
        if (!isNaN(idx) && onSetWaypoint) {
          onSetWaypoint(idx, lat, lng);
        }
        setPickerMode(null);
      }
    }
  });

  return null;
}

const parseCoordStr = (val) => {
  if (!val) return null;
  if (typeof val === 'object' && val.latitude && val.longitude) {
    return { latitude: val.latitude, longitude: val.longitude, display_name: val.display_name || `${val.latitude.toFixed(4)}, ${val.longitude.toFixed(4)}` };
  }
  if (typeof val === 'string') {
    const parts = val.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { latitude: parts[0], longitude: parts[1], display_name: `Point (${parts[0].toFixed(4)}, ${parts[1].toFixed(4)})` };
    }
  }
  return null;
};

export default function MapView({
  origin,
  destination,
  waypoints = [],
  routes,
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
  setPickerMode
}) {
  const [showRefuelHubs, setShowRefuelHubs] = useState(false);
  const [refuelFilter, setRefuelFilter] = useState('all');

  const originObj = parseCoordStr(origin) || resolvedOrigin || parseCoordStr(rawOriginStr);
  const destinationObj = parseCoordStr(destination) || resolvedDestination || parseCoordStr(rawDestinationStr);

  const rawWpObjs = (waypoints.length > 0 ? waypoints : rawWaypoints).map(wp => parseCoordStr(wp));
  const waypointObjs = rawWpObjs.map((obj, i) => obj || (resolvedWaypoints && resolvedWaypoints[i])).filter(Boolean);

  // Center fallback (San Francisco coordinates)
  const defaultCenter = [37.7749, -122.4194];
  const defaultZoom = 11;

  // Calculate bounds if origin, waypoints, destination or routes present
  let mapBounds = [];
  if (originObj) {
    mapBounds.push([originObj.latitude, originObj.longitude]);
  }
  waypointObjs.forEach(wp => {
    mapBounds.push([wp.latitude, wp.longitude]);
  });
  if (destinationObj) {
    mapBounds.push([destinationObj.latitude, destinationObj.longitude]);
  }

  if (routes && routes.length > 0) {
    routes.forEach(route => {
      route.geometry.coordinates.forEach(([lon, lat]) => {
        mapBounds.push([lat, lon]);
      });
    });
  }

  const selectedRouteObj = routes.find(r => r.route_id === selectedRouteId) || routes[0];

  // Refueling infrastructure stations extraction
  const infra = selectedRouteObj?.infrastructure || selectedRouteObj?.infrastructure_summary || {};
  const gasStations = infra.gas_stations || [];
  const evChargers = infra.ev_chargers || [];
  const allStations = [...gasStations, ...evChargers];
  const stationsToRender = refuelFilter === 'gas' ? gasStations : refuelFilter === 'ev' ? evChargers : allStations;

  // Construct preview path coordinates (Origin -> Waypoints -> Destination)
  const previewPositions = [];
  if (originObj) previewPositions.push([originObj.latitude, originObj.longitude]);
  waypointObjs.forEach(wp => previewPositions.push([wp.latitude, wp.longitude]));
  if (destinationObj) previewPositions.push([destinationObj.latitude, destinationObj.longitude]);

  // Build bottleneck data for the selected route
  const bottlenecks = selectedRouteObj?.bottlenecks || [];

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
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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
              color: '#38bdf8',
              weight: 2.5,
              opacity: 0.7,
              dashArray: '6, 8'
            }}
          />
        )}

        {/* Origin Marker (A) */}
        {originObj && (
          <Marker
            position={[originObj.latitude, originObj.longitude]}
            icon={createCustomMarkerIcon('A', '#10b981', '#ffffff')}
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
                  {originObj.latitude.toFixed(5)}, {originObj.longitude.toFixed(5)}
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
              icon={createCustomMarkerIcon(letter, '#f59e0b', '#ffffff')}
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
            icon={createCustomMarkerIcon(String.fromCharCode(66 + waypointObjs.length), '#f43f5e', '#ffffff')}
          >
            <Popup>
              <div className="p-1 space-y-1 font-sans">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block font-mono">
                  EVACUATION DESTINATION ({String.fromCharCode(66 + waypointObjs.length)})
                </span>
                <p className="text-xs font-semibold text-slate-100">
                  {destinationObj.display_name}
                </p>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {destinationObj.latitude.toFixed(5)}, {destinationObj.longitude.toFixed(5)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Render Route Polylines */}
        {routes && routes.map(route => {
          const isSelected = route.route_id === selectedRouteId;
          const positions = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
          const strokeColor = ROUTE_LINE_COLORS[route.route_id] || '#06b6d4';

          // Build Google Maps style traffic color sub-segments if selected & traffic data exists
          const hasTraffic = isSelected && route.samples && route.samples.some(s => s.traffic_flow);
          const trafficSegments = [];

          if (hasTraffic && route.samples.length > 1 && positions.length > 1) {
            // Find nearest coordinate index in full road geometry for each sample point
            const sampleGeoIndices = route.samples.map(s => {
              let minD = Infinity;
              let bestIdx = 0;
              for (let pIdx = 0; pIdx < positions.length; pIdx++) {
                const [lat, lon] = positions[pIdx];
                const d = (lat - s.latitude) ** 2 + (lon - s.longitude) ** 2;
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
                  segColor = '#991b1b'; // Dark Crimson (Closed)
                  condStr = "Road Closed";
                } else if (tf.congestion_condition.includes('Heavy')) {
                  segColor = '#ef4444'; // Red (Heavy)
                  condStr = "Heavy Congestion";
                } else if (tf.congestion_condition.includes('Moderate')) {
                  segColor = '#f59e0b'; // Amber (Moderate)
                  condStr = "Moderate Traffic";
                } else if (tf.congestion_condition.includes('Free')) {
                  segColor = '#10b981'; // Green (Free Flow)
                  condStr = "Free Flow";
                }
                speedStr = `${tf.current_speed_kmh} km/h`;
              }

              trafficSegments.push({
                coords: segCoords,
                color: segColor,
                condition: condStr,
                speed: speedStr
              });
            }
          }

          return (
            <React.Fragment key={route.route_id}>
              {/* Outer Glow for Selected Route */}
              {isSelected && (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: strokeColor,
                    weight: 10,
                    opacity: 0.25,
                    lineCap: 'round',
                    lineJoin: 'round'
                  }}
                />
              )}

              {/* Selected Route with Google Maps Multi-Color Traffic Segments */}
              {isSelected && hasTraffic && trafficSegments.length > 0 ? (
                trafficSegments.map((seg, sIdx) => (
                  <Polyline
                    key={`seg-${route.route_id}-${sIdx}`}
                    positions={seg.coords}
                    eventHandlers={{
                      click: () => onSelectRoute(route.route_id)
                    }}
                    pathOptions={{
                      color: seg.color,
                      weight: 6,
                      opacity: 1.0,
                      lineCap: 'round',
                      lineJoin: 'round'
                    }}
                  >
                    <Tooltip sticky className="custom-traffic-tooltip" direction="top" offset={[0, -4]}>
                      <div className="font-mono text-[10px] text-zinc-100 flex items-center gap-1.5 leading-none">
                        <span className={`font-bold ${
                          seg.color === '#10b981' ? 'text-emerald-400' :
                          seg.color === '#f59e0b' ? 'text-amber-400' :
                          seg.color === '#ef4444' ? 'text-rose-400' : 'text-rose-500'
                        }`}>
                          ● {seg.condition}
                        </span>
                        {seg.speed && <span className="text-zinc-400 font-normal">({seg.speed})</span>}
                      </div>
                    </Tooltip>
                  </Polyline>
                ))
              ) : (
                /* Unselected Route OR Selected Route without Traffic data */
                <Polyline
                  positions={positions}
                  eventHandlers={{
                    click: () => onSelectRoute(route.route_id)
                  }}
                  pathOptions={{
                    color: strokeColor,
                    weight: isSelected ? 6 : 4,
                    opacity: isSelected ? 1.0 : 0.40,
                    dashArray: isSelected ? null : '6, 8',
                    lineCap: 'round',
                    lineJoin: 'round'
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Render Mireye Natural Hazard Probe Samples Only (Hides non-Mireye speed dots) */}
        {showSamples && selectedRouteObj && selectedRouteObj.samples && (
          selectedRouteObj.samples
            .filter(sample => sample.is_mireye_probed || (selectedSample && selectedSample.sample_id === sample.sample_id))
            .map(sample => {
              const isSampleSelected = selectedSample && selectedSample.sample_id === sample.sample_id;
              const isMireyeProbed = sample.is_mireye_probed;
              const hazardScore = sample.hazard_score || 0;
              const distKm = (sample.distance_from_origin_m / 1000.0).toFixed(2);

            // Color by hazard score
            let fillColor = '#06b6d4'; // Default cyan
            if (hazardScore > 0.5) fillColor = '#ef4444'; // Red
            else if (hazardScore > 0.3) fillColor = '#f59e0b'; // Amber
            else if (hazardScore > 0.1) fillColor = '#22d3ee'; // Light cyan

            const radius = isSampleSelected ? 7 : isMireyeProbed ? 6 : 4;

            return (
              <CircleMarker
                key={sample.sample_id}
                center={[sample.latitude, sample.longitude]}
                radius={radius}
                eventHandlers={{
                  click: () => onSelectSample(sample)
                }}
                pathOptions={{
                  fillColor: isSampleSelected ? '#38bdf8' : fillColor,
                  fillOpacity: 0.9,
                  color: isMireyeProbed ? '#10b981' : isSampleSelected ? '#ffffff' : '#0f172a',
                  weight: isMireyeProbed ? 3 : isSampleSelected ? 3 : 1.5
                }}
              >
                <Popup>
                  <div className="p-1 space-y-1 font-sans text-xs">
                    <span className="text-[10px] font-bold text-cyan-400 font-mono block">
                      {sample.sample_id}
                    </span>
                    <div className="font-bold text-slate-100">
                      Distance: <span className="text-cyan-300 font-mono">{distKm} km</span>
                    </div>
                    {isMireyeProbed && (
                      <span className="text-[9px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700 font-mono inline-block">
                        Mireye Sample
                      </span>
                    )}
                    {hazardScore > 0 && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        Hazard Score: <span className={hazardScore > 0.3 ? 'text-amber-400 font-bold' : 'text-slate-300'}>{hazardScore.toFixed(2)}</span>
                      </div>
                    )}
                    {sample.slope_pct != null && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        Slope: <span className={Math.abs(sample.slope_pct) > 8 ? 'text-rose-400 font-bold' : 'text-slate-300'}>{sample.slope_pct.toFixed(1)}%</span>
                      </div>
                    )}
                    {sample.traffic_flow && (
                      <div className="text-[10px] text-amber-300 font-mono flex items-center gap-1 mt-1 border-t border-slate-800 pt-1">
                        <span>Speed: {sample.traffic_flow.current_speed_kmh} km/h ({sample.traffic_flow.congestion_condition})</span>
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })
        )}

        {/* Bottleneck Warning Markers */}
        {showSamples && bottlenecks.map((bn, idx) => (
          <Marker
            key={`bn-${idx}`}
            position={[bn.latitude, bn.longitude]}
            icon={createBottleneckIcon(bn.severity_label)}
          >
            <Popup>
              <div className="p-1 space-y-1 font-sans text-xs max-w-[220px]">
                <span className={`text-[10px] font-bold uppercase font-mono block ${
                  bn.severity_label === 'Critical' ? 'text-rose-400' : 'text-amber-400'
                }`}>
                  {bn.severity_label} Bottleneck
                </span>
                <div className="text-[10px] text-slate-300 font-mono">
                  BSI: <span className="font-bold">{bn.bsi_score.toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {bn.description}
                </p>
                <div className="text-[9px] text-slate-500 font-mono">
                  {(bn.distance_from_origin_m / 1000).toFixed(1)} km from origin
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        {/* Refueling Infrastructure Station Markers */}
        {showRefuelHubs && stationsToRender.map(st => (
          <Marker
            key={st.id}
            position={[st.latitude, st.longitude]}
            icon={createStationIcon(st.station_type)}
          >
            <Popup>
              <div className="p-1 space-y-1.5 font-sans text-xs min-w-[200px]">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold uppercase font-mono px-1.5 py-0.5 rounded border ${
                    st.station_type === 'gas'
                      ? 'bg-amber-950/80 border-amber-800 text-amber-300'
                      : 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                  }`}>
                    {st.station_type === 'gas' ? 'Gas / Diesel' : 'EV Fast Charging'}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    {st.offset_distance_m}m off-route
                  </span>
                </div>
                <div className="font-bold text-slate-100 text-xs">
                  {st.name}
                </div>
                {st.brand && st.brand !== st.name && (
                  <div className="text-[10px] text-slate-400 font-mono">
                    Brand: {st.brand}
                  </div>
                )}
                <div className="text-[10px] text-cyan-300 font-mono">
                  Corridor Point: {st.distance_from_origin_km} km from origin
                </div>
                {onAddWaypoint && (
                  <button
                    type="button"
                    onClick={() => onAddWaypoint({
                      latitude: st.latitude,
                      longitude: st.longitude,
                      query: st.name,
                      display_name: st.name
                    })}
                    className="w-full mt-1.5 px-2 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-200 text-[10px] font-mono font-semibold rounded flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="h-3 w-3 text-cyan-400" /> Add as Refuel Waypoint
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Minimalist Floating Refuel & EV Map HUD */}
      {routes && routes.length > 0 && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md p-1 rounded-lg border border-zinc-800 shadow-xl">
          <button
            type="button"
            onClick={() => setShowRefuelHubs(!showRefuelHubs)}
            title={showRefuelHubs ? "Hide Gas & EV Stations" : "Show Gas & EV Stations"}
            className={`p-1.5 rounded-md text-[11px] font-mono flex items-center justify-center transition-all cursor-pointer ${
              showRefuelHubs
                ? 'bg-amber-950/90 border border-amber-500/80 text-amber-200 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Fuel className={`h-4 w-4 ${showRefuelHubs ? 'text-amber-400' : 'text-zinc-400'}`} />
          </button>

          {/* Micro Filter Pills when active */}
          {showRefuelHubs && (
            <div className="flex items-center gap-1 border-l border-zinc-800 pl-1.5 text-[9px] font-mono">
              {allStations.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setRefuelFilter('all')}
                    className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                      refuelFilter === 'all'
                        ? 'bg-zinc-700 text-white font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    All ({allStations.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefuelFilter('gas')}
                    className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                      refuelFilter === 'gas'
                        ? 'bg-amber-900/80 border border-amber-600/60 text-amber-200 font-bold'
                        : 'text-zinc-400 hover:text-amber-300'
                    }`}
                  >
                    Gas ({gasStations.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefuelFilter('ev')}
                    className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                      refuelFilter === 'ev'
                        ? 'bg-emerald-900/80 border border-emerald-600/60 text-emerald-200 font-bold'
                        : 'text-zinc-400 hover:text-emerald-300'
                    }`}
                  >
                    EV ({evChargers.length})
                  </button>
                </>
              ) : (
                <span className="px-1.5 py-0.5 text-zinc-400 text-[9px]">None within 1.5km</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legend & Controls Overlay - ONLY SHOWN IF ROUTES ARE PRESENT */}
      {routes && routes.length > 0 && (
        <div className="absolute bottom-4 left-4 z-20 glass-panel p-3 rounded-xl border border-slate-800 text-xs shadow-xl max-w-xs space-y-2">
          <div className="flex items-center justify-between font-mono font-bold text-[11px] text-slate-300 uppercase">
            <span>CORRIDOR LEGEND</span>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/50"></span>
              <span className="text-slate-200">Route 1 (Primary / Fastest)</span>
            </div>
            {routes.length > 1 && (
              <div className="flex items-center space-x-2">
                <span className="h-3 w-3 rounded-full bg-purple-500 shadow-sm shadow-purple-500/50"></span>
                <span className="text-slate-300">Route 2 (Alternative 1)</span>
              </div>
            )}
            {routes.length > 2 && (
              <div className="flex items-center space-x-2">
                <span className="h-3 w-3 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50"></span>
                <span className="text-slate-300">Route 3 (Alternative 2)</span>
              </div>
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
                <span className="h-3 w-3 rounded-sm bg-rose-500/20 border border-rose-500 text-[9px] font-bold flex items-center justify-center text-rose-400">!</span>
                <span className="text-slate-400">Bottleneck ({bottlenecks.length})</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
