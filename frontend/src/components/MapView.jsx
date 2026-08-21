import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';

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
const bridgeIcon = createCustomMarkerIcon('≈', '#f59e0b', '#fde68a');

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

export default function MapView({
  origin,
  destination,
  routes,
  selectedRouteId,
  onSelectRoute,
  showSamples,
  selectedSample,
  onSelectSample
}) {
  // Center fallback (San Francisco coordinates)
  const defaultCenter = [37.7749, -122.4194];
  const defaultZoom = 11;

  // Calculate bounds if origin, destination or routes present
  let mapBounds = [];
  if (origin && destination) {
    mapBounds.push([origin.latitude, origin.longitude]);
    mapBounds.push([destination.latitude, destination.longitude]);
  }

  if (routes && routes.length > 0) {
    routes.forEach(route => {
      route.geometry.coordinates.forEach(([lon, lat]) => {
        mapBounds.push([lat, lon]);
      });
    });
  }

  const selectedRouteObj = routes.find(r => r.route_id === selectedRouteId) || routes[0];

  return (
    <div className="relative w-full h-full min-h-[450px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
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

        {/* Origin Marker */}
        {origin && (
          <Marker
            position={[origin.latitude, origin.longitude]}
            icon={originIcon}
          >
            <Popup>
              <div className="p-1 space-y-1 font-sans">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block font-mono">
                  INCIDENT LOCATION (ORIGIN)
                </span>
                <p className="text-xs font-semibold text-slate-100">
                  {origin.display_name}
                </p>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {origin.latitude.toFixed(5)}, {origin.longitude.toFixed(5)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destination && (
          <Marker
            position={[destination.latitude, destination.longitude]}
            icon={destinationIcon}
          >
            <Popup>
              <div className="p-1 space-y-1 font-sans">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block font-mono">
                  EVACUATION DESTINATION
                </span>
                <p className="text-xs font-semibold text-slate-100">
                  {destination.display_name}
                </p>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {destination.latitude.toFixed(5)}, {destination.longitude.toFixed(5)}
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

        {/* Render infrastructure evidence associated with samples */}
        {selectedRouteObj?.samples?.flatMap((sample) => (sample.nbi_bridges || []).map((bridge, index) => ({ sample, bridge, index }))).map(({ sample, bridge, index }) => (
          <Marker
            key={`${sample.sample_id}-bridge-${bridge.structure_id || index}`}
            position={[bridge.latitude ?? sample.latitude, bridge.longitude ?? sample.longitude]}
            icon={bridgeIcon}
          >
            <Popup>
              <div className="space-y-1 p-1 text-xs">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300 font-mono">FHWA NBI infrastructure</span>
                <strong className="block text-slate-100">{bridge.structure_id || 'Bridge record'}</strong>
                <span className="block text-slate-400">{bridge.condition_label || 'Condition not classified'}</span>
                <span className="block text-[10px] text-slate-500">Associated near {sample.sample_id}</span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Render physical distance samples */}
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

      {/* Legend & Controls Overlay */}
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
      </div>
    </div>
  );
}
