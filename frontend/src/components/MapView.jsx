import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Compass, CheckCircle2 } from 'lucide-react';

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
  rawOriginStr,
  rawDestinationStr,
  rawWaypoints = [],
  resolvedOrigin,
  resolvedDestination,
  resolvedWaypoints = [],
  pickerMode,
  setPickerMode
}) {
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
            if (hazardScore > 0.5) fillColor = '#ef4444'; // Red
            else if (hazardScore > 0.3) fillColor = '#f59e0b'; // Amber
            else if (hazardScore > 0.1) fillColor = '#22d3ee'; // Light cyan

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



        {/* Peak Bottleneck Markers (Top Critical Chokepoints Only - Spaced >= 5km) */}
        {showSamples && (() => {
          const criticalBns = (selectedRouteObj?.bottlenecks || [])
            .filter(bn => bn.severity_label === 'Critical' || bn.bsi_score >= 0.70)
            .sort((a, b) => b.bsi_score - a.bsi_score);

          // Deduplicate spatially so we only show top distinct chokepoints
          const distinctBns = [];
          for (const bn of criticalBns) {
            const isNear = distinctBns.some(
              d => Math.hypot(d.latitude - bn.latitude, d.longitude - bn.longitude) < 0.04
            );
            if (!isNear && distinctBns.length < 5) {
              distinctBns.push(bn);
            }
          }

          return distinctBns.map((bn, idx) => (
            <Marker
              key={`peak-bn-${idx}`}
              position={[bn.latitude, bn.longitude]}
              icon={createBottleneckIcon(bn.severity_label)}
            >
              <Popup>
                <div className="p-1 space-y-1 font-sans text-xs max-w-[220px]">
                  <span className="text-[10px] font-bold uppercase font-mono text-rose-400 block">
                    Critical Bottleneck
                  </span>
                  <div className="text-[10px] text-slate-300 font-mono">
                    BSI: <span className="font-bold text-rose-400">{bn.bsi_score.toFixed(2)}</span>
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
          ));
        })()}

      </MapContainer>

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
