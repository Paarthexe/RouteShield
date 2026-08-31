import React, { useState } from 'react';
import { Fuel, AlertTriangle, Gauge, MapPinned, Zap, ChevronDown, ChevronUp } from 'lucide-react';

const TONE_STYLES = {
  amber: {
    icon: AlertTriangle,
    text: 'text-amber-300',
    border: 'border-amber-800/60',
    bg: 'bg-amber-950/20',
  },
  rose: {
    icon: AlertTriangle,
    text: 'text-rose-300',
    border: 'border-rose-800/60',
    bg: 'bg-rose-950/20',
  },
};

function getEvReadiness(chargers = [], routeDistanceKm = 0) {
  if (!chargers.length) {
    return {
      label: 'No EV Fast Charging Coverage',
      tone: 'rose',
      detail: 'No candidate EV fast-charging sites were identified along this corridor.',
    };
  }

  const ordered = [...chargers].sort((a, b) => a.distance_along_route_km - b.distance_along_route_km);
  const maxGap = ordered.reduce((gap, charger, idx) => {
    const prev = idx === 0 ? 0 : ordered[idx - 1].distance_along_route_km;
    return Math.max(gap, charger.distance_along_route_km - prev);
  }, 0);
  const tailGap = routeDistanceKm > 0 ? Math.max(0, routeDistanceKm - ordered[ordered.length - 1].distance_along_route_km) : 0;
  const uncovered = Math.max(maxGap, tailGap);

  if (chargers.length >= 3 || uncovered <= 35) {
    return {
      label: 'Good EV charging coverage',
      tone: 'emerald',
      detail: `Fast charging is available across the route with a largest uncovered span of ${uncovered.toFixed(1)} km.`,
    };
  }

  if (chargers.length >= 2 || uncovered <= 55) {
    return {
      label: 'Moderate EV charging coverage',
      tone: 'amber',
      detail: `Charging exists, but one corridor segment stretches ${uncovered.toFixed(1)} km without a fast charger.`,
    };
  }

  return {
    label: 'Sparse EV charging coverage',
    tone: 'rose',
    detail: `Only limited EV support is available, leaving a ${uncovered.toFixed(1)} km uncovered span.`,
  };
}

export default function FuelReadinessPanel({ route }) {
  const [showFuelStops, setShowFuelStops] = useState(false);
  const [showFastEv, setShowFastEv] = useState(false);
  if (!route) return null;

  const infra = route.infrastructure;
  if (!infra) return null;

  const orderedStops = [...(infra.gas_stations || [])].sort((a, b) => a.distance_from_origin_km - b.distance_from_origin_km);
  const orderedChargers = [...(infra.ev_chargers || [])].sort((a, b) => a.distance_from_origin_km - b.distance_from_origin_km);
  const fastChargers = [...(infra.ev_fast_stations || [])].sort((a, b) => a.distance_from_origin_km - b.distance_from_origin_km);
  const fuelWarning = infra.fuel_desert_warning?.split(';').map((part) => part.trim()).find((part) => part.toLowerCase().includes('fuel desert')) || null;
  const evWarning = infra.fuel_desert_warning?.split(';').map((part) => part.trim()).find((part) => part.toLowerCase().includes('ev fast charging desert')) || null;
  const routeDistanceKm = route.distance_km || 0;
  const firstStopKm = orderedStops[0]?.distance_from_origin_km ?? null;
  const lastStopKm = orderedStops[orderedStops.length - 1]?.distance_from_origin_km ?? null;
  const isFuelDesert = (infra.max_gas_gap_km || 0) > 45;
  const readiness = {
    label: isFuelDesert ? 'Fuel Desert Risk Detected' : 'Fuel corridor coverage available',
    tone: isFuelDesert ? 'rose' : 'amber',
    detail: fuelWarning || `Longest fuel gap is ${Math.round(infra.max_gas_gap_km || 0)} km along this corridor.`,
  };
  const evReadiness = getEvReadiness(orderedChargers, routeDistanceKm);
  if (evWarning) {
    evReadiness.label = 'EV Charging Desert Risk Detected';
    evReadiness.tone = 'rose';
    evReadiness.detail = evWarning;
  }
  const tone = TONE_STYLES[readiness.tone] || TONE_STYLES.rose;
  const evTone = TONE_STYLES[evReadiness.tone] || TONE_STYLES.amber;
  const ToneIcon = tone.icon;
  const EvToneIcon = evTone.icon;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-3 font-mono">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center space-x-2 min-w-0">
          <Fuel className="h-4 w-4 text-amber-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            Refuel & Range Readiness
          </h3>
        </div>
        <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
          {infra.total_gas_stations || 0} fuel · {infra.total_ev_fast_stations || 0} fast EV
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className={`rounded-lg border p-2.5 ${tone.border} ${tone.bg}`}>
          <div className={`flex items-center gap-1.5 text-[11px] font-bold ${tone.text}`}>
            <ToneIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{readiness.label}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-300 font-sans">
            {readiness.detail}
          </p>
        </div>

        <div className={`rounded-lg border p-2.5 ${evTone.border} ${evTone.bg}`}>
          <div className={`flex items-center gap-1.5 text-[11px] font-bold ${evTone.text}`}>
            <EvToneIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{evReadiness.label}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-300 font-sans">
            {evReadiness.detail}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-850">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">First Fuel</span>
          <div className="mt-0.5 text-sm font-bold text-zinc-100">
            {firstStopKm != null ? `${firstStopKm.toFixed(1)} km` : '--'}
          </div>
        </div>
        <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-850">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">Last Fuel</span>
          <div className="mt-0.5 text-sm font-bold text-zinc-100">
            {lastStopKm != null ? `${lastStopKm.toFixed(1)} km` : '--'}
          </div>
        </div>
        <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-850 col-span-2 sm:col-span-1">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">Max Fuel Gap</span>
          <div className="mt-0.5 text-sm font-bold text-zinc-100">
            {infra.max_gas_gap_km ? `${infra.max_gas_gap_km.toFixed(1)} km` : '--'}
          </div>
        </div>
        <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-850 col-span-2 sm:col-span-1">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">EV Fast Gap</span>
          <div className="mt-0.5 text-sm font-bold text-zinc-100">
            {infra.max_ev_fast_gap_km ? `${infra.max_ev_fast_gap_km.toFixed(1)} km` : '--'}
          </div>
        </div>
      </div>

      {orderedStops.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowFuelStops(!showFuelStops)}
            className="w-full flex items-center justify-between rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-left cursor-pointer"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              <Fuel className="h-3.5 w-3.5" />
              Fuel Stops ({orderedStops.length})
            </span>
            {showFuelStops ? <ChevronUp className="h-4 w-4 text-amber-300" /> : <ChevronDown className="h-4 w-4 text-amber-300" />}
          </button>
          {showFuelStops && orderedStops.map((stop, idx) => (
            <div key={`${stop.name}_${idx}`} className="bg-zinc-950/80 border border-zinc-850 rounded-lg p-2.5 flex items-start gap-2.5">
              <div className="p-1 rounded-md bg-amber-950/80 border border-amber-800/60 text-amber-300 shrink-0 mt-0.5">
                <MapPinned className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-100 truncate">{stop.name}</span>
                  <span className="text-[10px] text-amber-300 font-bold shrink-0">
                    km {stop.distance_from_origin_km.toFixed(1)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-400 font-sans">
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3 w-3" />
                    {stop.offset_distance_m.toFixed(0)}m from route
                  </span>
                  <span>{stop.stalls_display || 'Fuel access'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {orderedChargers.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowFastEv(!showFastEv)}
            className="w-full flex items-center justify-between rounded-lg border border-teal-800/40 bg-teal-950/20 px-3 py-2 text-left cursor-pointer"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-300">
              <Zap className="h-3.5 w-3.5" />
              Fast EV ({fastChargers.length})
            </span>
            {showFastEv ? <ChevronUp className="h-4 w-4 text-teal-300" /> : <ChevronDown className="h-4 w-4 text-teal-300" />}
          </button>
          {showFastEv && fastChargers.map((charger, idx) => (
            <div key={`${charger.name}_${idx}`} className="bg-zinc-950/80 border border-zinc-850 rounded-lg p-2.5 flex items-start gap-2.5">
              <div className="p-1 rounded-md bg-teal-950/80 border border-teal-800/60 text-teal-300 shrink-0 mt-0.5">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-100 truncate">{charger.name}</span>
                  <span className="text-[10px] text-teal-300 font-bold shrink-0">
                    km {charger.distance_from_origin_km.toFixed(1)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-400 font-sans">
                  <span>{charger.speed_label || charger.station_type}</span>
                  <span>{charger.power_label || 'Standard output'}</span>
                  <span>{charger.stalls_display || 'Charging site'}</span>
                  <span>{charger.offset_distance_m.toFixed(0)}m from route</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}