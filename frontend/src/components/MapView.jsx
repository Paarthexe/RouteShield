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

        {/* Render Physical Distance Samples */}
        {showSamples && selectedRouteObj && selectedRouteObj.samples && (
          selectedRouteObj.samples.map(sample => {
            const isSampleSelected = selectedSample && selectedSample.sample_id === sample.sample_id;
            const distKm = (sample.distance_from_origin_m / 1000.0).toFixed(2);

            return (
              <CircleMarker
                key={sample.sample_id}
                center={[sample.latitude, sample.longitude]}
                radius={isSampleSelected ? 7 : 4}
                eventHandlers={{
                  click: () => onSelectSample(sample)
                }}
                pathOptions={{
                  fillColor: isSampleSelected ? '#38bdf8' : '#06b6d4',
                  fillOpacity: 0.9,
                  color: isSampleSelected ? '#ffffff' : '#0f172a',
                  weight: isSampleSelected ? 3 : 1.5
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
                    <div className="text-[10px] text-slate-400 font-mono">
                      {sample.latitude.toFixed(5)}, {sample.longitude.toFixed(5)}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })
        )}
      </MapContainer>

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
        </div>
      )}
    </div>
  );
}

