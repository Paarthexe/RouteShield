import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Compass, CheckCircle2, XCircle, ShieldAlert, Trash2, Ban, Flame } from 'lucide-react';

const ROUTE_LINE_COLORS = {
  route_1: '#06b6d4', // Cyan
  route_2: '#a855f7', // Purple
  route_3: '#f59e0b', // Amber
  route_4: '#10b981', // Emerald
  route_5: '#f43f5e', // Rose
};

const getRouteColor = (routeId) => ROUTE_LINE_COLORS[routeId] || '#38bdf8';

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

const createBarrierIcon = () => {
  return L.divIcon({
    className: 'hazard-barrier-marker',
    html: `
      <div style="
        background-color: #ef4444;
        border: 2.5px solid #ffffff;
        color: white;
        width: 30px;
        height: 30px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 14px;
        box-shadow: 0 0 16px rgba(239, 68, 68, 0.9);
        animation: pulse 1.5s infinite;
      ">
        🚫
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
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
const bridgeIcon = createCustomMarkerIcon('≈', '#f59e0b', '#fde68a');

const createShelterIcon = (poiType) => {
  const symbol = poiType === 'hospital' ? '🏥' : poiType === 'fire_station' ? '🚒' : '🏛️';
  return L.divIcon({
    className: 'shelter-poi-marker',
    html: `<div style="background:#0284c7;border:2px solid #ffffff;color:white;width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 10px rgba(2,132,199,0.8);">${symbol}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

const createFuelIcon = () => L.divIcon({
  className: 'fuel-poi-marker',
  html: `<div style="background:#d97706;border:2px solid #ffffff;color:white;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 0 8px rgba(217,119,6,0.8);">⛽</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const createAARHistoricIcon = () => L.divIcon({
  className: 'aar-historic-marker',
  html: `<div style="background:#b45309;border:2px solid #fef3c7;color:#ffffff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 0 12px rgba(245,158,11,0.9);animation:pulse 2s infinite;">📜</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const createTTCInterceptIcon = () => L.divIcon({
  className: 'ttc-intercept-marker',
  html: `<div style="background:#dc2626;border:2px solid #ffffff;color:#ffffff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 0 14px rgba(220,38,38,0.95);animation:pulse 1.5s infinite;">⏱️</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const createMireyeProbeMarkerIcon = (isSelected = false) => {
  const size = isSelected ? 22 : 16;
  return L.divIcon({
    className: 'custom-mireye-icon',
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
          background: ${isSelected ? '#38bdf8' : '#10b981'};
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
  onAvoidPointPicked,
  onAddHazardBarrier
}) {
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
      } else if (pickerMode === 'avoid_point') {
        if (onAvoidPointPicked) onAvoidPointPicked(lat, lng);
        setPickerMode(null);
      } else if (pickerMode === 'hazard_barrier') {
        if (onAddHazardBarrier) onAddHazardBarrier(lat, lng);
        setPickerMode(null);
      }
    }
  });

  return null;
}

// Avoid-point marker icon — red crosshair
const createAvoidIcon = () => L.divIcon({
  className: 'avoid-point-marker',
  html: `
    <div style="
      width: 28px; height: 28px;
      background: rgba(239,68,68,0.18);
      border: 2.5px solid #ef4444;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 14px #ef444480;
    ">
      <div style="font-size:14px;font-weight:900;color:#ef4444;line-height:1">✕</div>
    </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

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
  rawOriginStr,
  rawDestinationStr,
  rawWaypoints = [],
  resolvedOrigin,
  resolvedDestination,
  resolvedWaypoints = [],
  pickerMode,
  setPickerMode,
  avoidPointMarker = null,
  onAvoidPointPicked,
  repairedGeometry = null,
  originalGeometry = null,
  hazardBarriers = [],
  onAddHazardBarrier,
  onRemoveHazardBarrier,
  shelters = [],
  fuelStops = [],
  commDeadZones = [],
  aarCaseStudies = [],
  hazardIsochrones = [],
  timeCutoff = null,
}) {
  const [showIsochroneLayers, setShowIsochroneLayers] = useState(true);
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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
          onAvoidPointPicked={onAvoidPointPicked}
          onAddHazardBarrier={onAddHazardBarrier}
        />

        {/* Original geometry (faded) shown during avoid-point repair diff */}
        {originalGeometry && repairedGeometry && (
          <Polyline
            positions={originalGeometry.coordinates.map(([lon, lat]) => [lat, lon])}
            pathOptions={{
              color: '#6b7280',
              weight: 4,
              opacity: 0.45,
              dashArray: '6, 8',
            }}
          />
        )}

        {/* Repaired geometry overlay — highlighted green diff */}
        {repairedGeometry && (
          <Polyline
            positions={repairedGeometry.coordinates.map(([lon, lat]) => [lat, lon])}
            pathOptions={{
              color: '#22c55e',
              weight: 5,
              opacity: 0.9,
              dashArray: null,
            }}
          />
        )}

        {/* Render Active Hazard Barriers / Roadblock Exclusion Zones */}
        {hazardBarriers && hazardBarriers.map((barrier) => (
          <React.Fragment key={barrier.id}>
            <Circle
              center={[barrier.latitude, barrier.longitude]}
              radius={barrier.radius_m || 800}
              pathOptions={{
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.28,
                weight: 2,
                dashArray: '6, 6'
              }}
            />
            <Marker
              position={[barrier.latitude, barrier.longitude]}
              icon={createBarrierIcon()}
            >
              <Popup>
                <div className="p-1 space-y-1.5 font-sans text-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-rose-900/60 pb-1">
                    <span className="text-[10px] font-bold text-rose-400 font-mono flex items-center gap-1">
                      <span>🚫</span> ROADBLOCK BARRIER
                    </span>
                    <span className="text-[9px] bg-rose-950 text-rose-300 px-1 py-0.5 rounded border border-rose-700 font-mono">
                      Radius: {(barrier.radius_m || 800)}m
                    </span>
                  </div>
                  <div className="font-semibold text-slate-100 text-[11px]">
                    {barrier.label || 'Active Roadblock Exclusion Zone'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {barrier.latitude.toFixed(5)}, {barrier.longitude.toFixed(5)}
                  </div>
                  {onRemoveHazardBarrier && (
                    <button
                      type="button"
                      onClick={() => onRemoveHazardBarrier(barrier.id)}
                      className="w-full mt-1.5 py-1 px-2 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700 rounded text-[10px] font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Remove Barrier</span>
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        ))}

        {/* Avoid-point marker */}
        {avoidPointMarker && (
          <Marker
            position={[avoidPointMarker.lat, avoidPointMarker.lng]}
            icon={createAvoidIcon()}
          >
            <Popup>
              <div className="p-1 space-y-1 font-sans">
                <span className="text-[10px] font-bold uppercase text-rose-400 font-mono block">Avoided Point</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {avoidPointMarker.lat.toFixed(5)}, {avoidPointMarker.lng.toFixed(5)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

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

          return (
            <React.Fragment key={route.route_id}>
              {/* Outer Glow for Selected Route */}
              {isSelected && (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: strokeColor,
                    weight: 10,
                    opacity: 0.35,
                    lineCap: 'round',
                    lineJoin: 'round'
                  }}
                />
              )}

              {/* Main Line */}
              <Polyline
                positions={positions}
                eventHandlers={{
                  click: () => onSelectRoute(route.route_id)
                }}
                pathOptions={{
                  color: strokeColor,
                  weight: isSelected ? 6 : 4,
                  opacity: isSelected ? 1.0 : 0.45,
                  dashArray: isSelected ? null : '6, 8',
                  lineCap: 'round',
                  lineJoin: 'round'
                }}
              />
            </React.Fragment>
          );
        })}

        {/* Render physical distance samples with distinct Mireye probe highlights */}
        {showSamples && selectedRouteObj && selectedRouteObj.samples && (
          selectedRouteObj.samples.map(sample => {
            const isSampleSelected = selectedSample && selectedSample.sample_id === sample.sample_id;
            const isMireyeProbed = sample.is_mireye_probed;
            const hazardScore = sample.hazard_score || 0;
            const distKm = (sample.distance_from_origin_m / 1000.0).toFixed(2);

            // Subtle color coding by hazard score
            let fillColor = '#06b6d4'; // Default cyan
            if (sample.is_barrier_blocked || hazardScore > 0.5) fillColor = '#ef4444'; // Red
            else if (hazardScore > 0.3) fillColor = '#f59e0b'; // Amber
            else if (hazardScore > 0.1) fillColor = '#22d3ee'; // Light cyan

            const popupContent = (
              <Popup>
                <div className="p-1 space-y-1.5 font-sans text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-cyan-400 font-mono block">
                      {sample.sample_id}
                    </span>
                    {sample.is_barrier_blocked ? (
                      <span className="text-[9px] bg-rose-950 text-rose-300 px-1.5 py-0.5 rounded border border-rose-600 font-mono font-bold">
                        ROADBLOCK BLOCKED
                      </span>
                    ) : isMireyeProbed && (
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
                      Hazard Score: <span className={hazardScore > 0.3 ? 'text-amber-400 font-bold' : 'text-slate-300'}>{hazardScore.toFixed(2)}</span>
                    </div>
                  )}
                  {sample.slope_pct != null && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      Slope: <span className={Math.abs(sample.slope_pct) > 8 ? 'text-rose-400 font-bold' : 'text-slate-300'}>{sample.slope_pct.toFixed(1)}%</span>
                    </div>
                  )}
                  {sample.nbi_bridges && sample.nbi_bridges.length > 0 && (
                    <div className="text-[10px] text-amber-300 font-mono">
                      Bridges nearby: {sample.nbi_bridges.length}
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
                    click: () => onSelectSample(sample)
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
                  click: () => onSelectSample(sample)
                }}
                pathOptions={{
                  fillColor: isSampleSelected ? '#38bdf8' : fillColor,
                  fillOpacity: isSampleSelected ? 1.0 : 0.45,
                  color: isSampleSelected ? '#ffffff' : '#0f172a',
                  weight: isSampleSelected ? 2 : 1
                }}
              >
                {popupContent}
              </CircleMarker>
            );
          })
        )}

        {/* Peak Bottleneck Markers (Top Critical & Moderate Chokepoints - Spaced >= 5km) */}
        {(() => {
          const criticalBns = (selectedRouteObj?.bottlenecks || [])
            .filter(bn => bn.severity_label === 'Critical' || bn.bsi_score >= 0.40)
            .sort((a, b) => b.bsi_score - a.bsi_score);

          // Deduplicate spatially so we only show top distinct chokepoints
          const distinctBns = [];
          for (const bn of criticalBns) {
            const isNear = distinctBns.some(
              d => Math.hypot(d.latitude - bn.latitude, d.longitude - bn.longitude) < 0.03
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
                    const matchedSample = selectedRouteObj.samples.find(s => s.sample_id === bn.sample_id);
                    if (matchedSample) onSelectSample(matchedSample);
                  }
                }
              }}
            >
              <Popup>
                <div className="p-1 space-y-1 font-sans text-xs max-w-[240px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[10px] font-bold uppercase font-mono px-1.5 py-0.5 rounded ${
                      bn.severity_label === 'Critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
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
                    <span>{(bn.distance_from_origin_m / 1000).toFixed(1)} km along route</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ));
        })()}

        {/* Render Emergency Shelters and POIs */}
        {shelters && shelters.map((s, idx) => (
          <Marker
            key={`shelter_${idx}`}
            position={[s.latitude, s.longitude]}
            icon={createShelterIcon(s.poi_type)}
          >
            <Popup>
              <div className="p-1 space-y-1 font-sans text-xs max-w-[220px]">
                <span className="text-[10px] font-bold text-sky-400 font-mono uppercase block">
                  {s.poi_type.replace('_', ' ')}
                </span>
                <p className="text-xs font-bold text-slate-100">{s.name}</p>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {s.distance_to_route_m}m from corridor
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Render Fuel Stops */}
        {fuelStops && fuelStops.map((f, idx) => (
          <Marker
            key={`fuel_${idx}`}
            position={[f.latitude, f.longitude]}
            icon={createFuelIcon()}
          >
            <Popup>
              <div className="p-1 space-y-1 font-sans text-xs max-w-[220px]">
                <span className="text-[10px] font-bold text-amber-400 font-mono uppercase block">
                  Fuel & Refueling Depot
                </span>
                <p className="text-xs font-bold text-slate-100">{f.name}</p>
                <span className="text-[10px] text-slate-400 font-mono block">
                  Mile {f.distance_along_route_km} along corridor
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Render RF Communication Dead Zones */}
        {selectedRouteObj?.geometry?.coordinates?.length > 0 && selectedRouteObj?.comm_dead_zones && selectedRouteObj.comm_dead_zones.map((dz, idx) => {
          const coords = selectedRouteObj.geometry.coordinates;
          const targetIdx = Math.max(0, Math.min(coords.length - 1, Math.floor(coords.length * (dz.start_km / Math.max(1, selectedRouteObj.distance_km || 1)))));
          const pt = coords[targetIdx];
          if (!pt || pt.length < 2) return null;
          return (
            <Circle
              key={`deadzone_${idx}`}
              center={[pt[1], pt[0]]}
              radius={Math.max(200, (dz.length_km || 1) * 500)}
              pathOptions={{
                color: '#a855f7',
                fillColor: '#a855f7',
                fillOpacity: 0.2,
                weight: 2,
                dashArray: '4, 6'
              }}
            />
          );
        })}

        {/* Render Real-World Documented AAR Case Study Chokepoints */}
        {aarCaseStudies && aarCaseStudies.map((aar, idx) => (
          <React.Fragment key={`aar_${idx}`}>
            <Circle
              center={[aar.latitude, aar.longitude]}
              radius={1500}
              pathOptions={{
                color: '#f59e0b',
                fillColor: '#f59e0b',
                fillOpacity: 0.18,
                weight: 1.5,
                dashArray: '5, 5'
              }}
            />
            <Marker
              position={[aar.latitude, aar.longitude]}
              icon={createAARHistoricIcon()}
            >
              <Popup>
                <div className="p-1 space-y-1 font-sans text-xs max-w-[240px]">
                  <div className="flex items-center justify-between border-b border-amber-800/60 pb-1">
                    <span className="text-[10px] font-bold text-amber-400 font-mono uppercase">
                      Historic AAR Failure Zone
                    </span>
                    <span className="text-[9px] font-mono text-zinc-400">{aar.year}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-100">{aar.incident_name}</p>
                  <p className="text-[11px] text-amber-200/90 leading-tight">{aar.gridlock_cause}</p>
                  <div className="pt-1 text-[9px] text-zinc-400 font-mono border-t border-zinc-800">
                    Source: {aar.agency_report}
                  </div>
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        ))}

        {/* Render Predictive Hazard Isochrones (T+30m, T+60m, T+120m) */}
        {showIsochroneLayers && hazardIsochrones && hazardIsochrones.map((iso, idx) => {
          // GeoJSON is [lon, lat], Leaflet expects [lat, lon]
          const positions = (iso.polygon_coordinates || []).map(p => [p[1], p[0]]);
          if (positions.length < 3) return null;
          return (
            <Polygon
              key={`isochrone_${idx}`}
              positions={positions}
              pathOptions={{
                color: iso.color || '#ef4444',
                fillColor: iso.color || '#ef4444',
                fillOpacity: iso.time_min === 30 ? 0.28 : iso.time_min === 60 ? 0.18 : 0.10,
                weight: iso.time_min === 30 ? 2.5 : 1.5,
                dashArray: iso.time_min === 120 ? '4, 4' : undefined,
              }}
            >
              <Popup>
                <div className="p-1 space-y-1 font-mono text-xs">
                  <span className="text-rose-400 font-bold block">
                    T+{iso.time_min} min Hazard Isochrone
                  </span>
                  <span className="text-zinc-300 text-[11px] block">
                    Spread Velocity: {iso.hazard_front_speed_kmh} km/h
                  </span>
                  <span className="text-zinc-400 text-[10px] block">
                    Projected Enclosed Area: {iso.area_sq_km} sq km
                  </span>
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* Render Hazard Intercept Choke Marker */}
        {timeCutoff && timeCutoff.intercept_latitude && timeCutoff.intercept_longitude && (
          <Marker
            position={[timeCutoff.intercept_latitude, timeCutoff.intercept_longitude]}
            icon={createTTCInterceptIcon()}
          >
            <Popup>
              <div className="p-1 space-y-1 font-mono text-xs max-w-[220px]">
                <div className="flex items-center justify-between border-b border-rose-800 pb-1">
                  <span className="text-rose-400 font-bold uppercase">
                    ⚡ Hazard Intercept Point
                  </span>
                </div>
                <p className="text-zinc-100 font-bold">
                  Cutoff in {timeCutoff.time_to_cutoff_min} min
                </p>
                <p className="text-[10px] text-zinc-300 font-sans">
                  Mile {(timeCutoff.intercept_distance_km * 0.621371).toFixed(1)} along corridor
                </p>
                <p className="text-[10px] text-rose-300 font-bold">
                  {timeCutoff.clearance_deadline_iso}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

      </MapContainer>

      {/* Floating Toolbar Buttons */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {hazardIsochrones && hazardIsochrones.length > 0 && (
          <button
            type="button"
            onClick={() => setShowIsochroneLayers(!showIsochroneLayers)}
            className={`px-3 py-1.5 rounded-lg border font-mono text-[11px] font-bold shadow-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              showIsochroneLayers
                ? 'bg-rose-950/90 text-rose-300 border-rose-600 ring-1 ring-rose-500'
                : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-rose-400" />
            <span>{showIsochroneLayers ? 'Isochrones ON' : 'Isochrones OFF'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setPickerMode(pickerMode === 'hazard_barrier' ? null : 'hazard_barrier')}
          className={`px-3 py-1.5 rounded-lg border font-mono text-[11px] font-bold shadow-lg flex items-center gap-1.5 transition-all cursor-pointer ${
            pickerMode === 'hazard_barrier'
              ? 'bg-rose-600 text-white border-rose-400 ring-2 ring-rose-400/50'
              : 'bg-zinc-900/90 hover:bg-zinc-800 text-rose-300 border-rose-900/80 hover:border-rose-700'
          }`}
        >
          <Ban className="h-3.5 w-3.5 text-rose-400" />
          <span>{pickerMode === 'hazard_barrier' ? 'Cancel Barrier Tool' : '+ Draw Roadblock'}</span>
          {hazardBarriers.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-rose-950 text-rose-200 rounded-full text-[9px] border border-rose-700">
              {hazardBarriers.length}
            </span>
          )}
        </button>
      </div>

      {/* Hazard barrier picker active banner */}
      {pickerMode === 'hazard_barrier' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-950/95 border border-rose-600 shadow-2xl text-[12px] font-bold font-mono text-rose-200">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping" />
          Click anywhere on the map to place an active Roadblock Barrier (800m exclusion zone)
          <button
            onClick={() => setPickerMode(null)}
            className="ml-2 text-rose-400 hover:text-rose-100 cursor-pointer"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Avoid-point picker active banner */}
      {pickerMode === 'avoid_point' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-950/90 border border-rose-700 shadow-xl text-[12px] font-bold font-mono text-rose-300">
          <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
          Click anywhere on the route to mark it as blocked
          <button
            onClick={() => setPickerMode(null)}
            className="ml-2 text-rose-400 hover:text-rose-200 cursor-pointer"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Repair diff legend */}
      {repairedGeometry && (
        <div className="absolute top-12 right-3 z-30 flex items-center gap-3 px-3 py-2 rounded-xl bg-zinc-950/90 border border-zinc-700 text-[11px] font-mono shadow-xl">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded bg-gray-500 opacity-50" />
            <span className="text-zinc-400">Original</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded bg-green-500" />
            <span className="text-green-400">Repaired</span>
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
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ROUTE_LINE_COLORS[route.route_id] || '#06b6d4' }}></span>
                <span className={route.route_id === selectedRouteId ? 'text-slate-100' : 'text-slate-400'}>{route.tag || `Corridor ${index + 1}`}{route.route_id === selectedRouteId ? ' · selected' : ''}</span>
              </div>
            ))}
            {selectedRouteObj?.samples?.some((sample) => sample.nbi_bridges?.length) && (
              <div className="flex items-center space-x-2"><span className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[8px] text-slate-950">≈</span><span className="text-slate-300">NBI bridge evidence</span></div>
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
