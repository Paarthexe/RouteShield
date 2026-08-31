import React from 'react';
import { Clock, Navigation, MapPin, CheckCircle2, AlertTriangle, ShieldCheck, ShieldX, ShieldAlert, Layers } from 'lucide-react';

const ROUTE_COLORS = {
  route_1: { border: 'border-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-500/10', badge: 'bg-cyan-500/20 text-cyan-300' },
  route_2: { border: 'border-purple-500', text: 'text-purple-400', bg: 'bg-purple-500/10', badge: 'bg-purple-500/20 text-purple-300' },
  route_3: { border: 'border-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', badge: 'bg-amber-500/20 text-amber-300' },
  route_4: { border: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', badge: 'bg-emerald-500/20 text-emerald-300' },
  route_5: { border: 'border-rose-500', text: 'text-rose-400', bg: 'bg-rose-500/10', badge: 'bg-rose-500/20 text-rose-300' },
};

const STATUS_CONFIG = {
  PRIMARY: { label: 'PRIMARY', bg: 'bg-emerald-950', text: 'text-emerald-300', border: 'border-emerald-700' },
  BACKUP: { label: 'BACKUP', bg: 'bg-blue-950', text: 'text-blue-300', border: 'border-blue-700' },
  REJECTED: { label: 'REJECTED', bg: 'bg-rose-950', text: 'text-rose-300', border: 'border-rose-700' },
  ALTERNATIVE: { label: 'ALTERNATIVE', bg: 'bg-amber-950', text: 'text-amber-300', border: 'border-amber-700' },
  CANDIDATE: { label: 'CANDIDATE', bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-600' },
};

function ViabilityGauge({ score }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 48, height: 48 }}>
      <svg width="48" height="48" className="transform -rotate-90">
        <circle cx="24" cy="24" r={radius} stroke="#1e293b" strokeWidth="4" fill="none" />
        <circle
          cx="24" cy="24" r={radius}
          stroke={color}
          strokeWidth="4"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
      </svg>
      <span className="absolute text-[11px] font-extrabold font-mono" style={{ color }}>
        {Math.round(score)}
      </span>
    </div>
  );
}

export default function RouteCard({ route, isSelected, onSelect, fastestDuration }) {
  const colorScheme = ROUTE_COLORS[route.route_id] || ROUTE_COLORS.route_1;
  const isFastest = route.travel_time_min === fastestDuration;
  const viability = route.viability;
  const statusKey = viability?.status || 'CANDIDATE';
  const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.CANDIDATE;

  const routeLabel =
    statusKey === 'PRIMARY' ? 'Primary Route' :
    statusKey === 'BACKUP' ? 'Backup Route' :
    statusKey === 'REJECTED' ? 'Rejected Route' :
    isFastest ? 'Fastest Route' :
    'Alternate Route';

  const timeDiffMin = !isFastest && fastestDuration !== undefined
    ? Math.round((route.travel_time_min - fastestDuration) * 10) / 10
    : 0;

  const trafficSamples = (route.samples || []).filter((sample) => sample.traffic_flow && sample.traffic_flow.current_speed_kmh);
  const avgTrafficSpeed = trafficSamples.length
    ? Math.round(trafficSamples.reduce((sum, sample) => sum + (sample.traffic_flow.current_speed_kmh || 0), 0) / trafficSamples.length)
    : null;
  const hasRoadClosure = trafficSamples.some((sample) => sample.traffic_flow?.road_closed);
  const heavyTrafficCount = trafficSamples.filter((sample) => sample.traffic_flow?.congestion_condition === 'Heavy Congestion').length;
  const moderateTrafficCount = trafficSamples.filter((sample) => sample.traffic_flow?.congestion_condition === 'Moderate Traffic').length;
  const lowTrafficCount = trafficSamples.filter((sample) => sample.traffic_flow?.congestion_condition === 'Low Traffic').length;
  const heavyTrafficShare = trafficSamples.length ? heavyTrafficCount / trafficSamples.length : 0;
  const moderateTrafficShare = trafficSamples.length ? moderateTrafficCount / trafficSamples.length : 0;
  const lowTrafficShare = trafficSamples.length ? lowTrafficCount / trafficSamples.length : 0;
  const worstTrafficLabel = hasRoadClosure
    ? 'Road Closed'
    : heavyTrafficShare >= 0.25
    ? 'Heavy Congestion'
    : heavyTrafficShare + moderateTrafficShare >= 0.35
    ? 'Moderate Traffic'
    : lowTrafficShare >= 0.3 || (avgTrafficSpeed != null && avgTrafficSpeed < 95)
    ? 'Low Traffic'
    : trafficSamples.length
    ? 'Free Flow'
    : null;

  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? `${colorScheme.border} ${colorScheme.bg} shadow-lg shadow-black/40 ring-1 ring-cyan-500/30`
          : 'border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Top Row: Route ID + Status Badge */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className={`text-[10px] font-extrabold uppercase font-mono px-2 py-0.5 rounded ${colorScheme.badge}`}>
              {route.route_id.toUpperCase().replace('_', ' ')}
            </span>
            {isFastest && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/60">
                Fastest
              </span>
            )}
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
              {statusCfg.label}
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-100 mt-1">
            {routeLabel}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {route.tag || `Corridor ${route.route_id}`}
          </p>
        </div>

        {/* Viability Gauge */}
        {viability && (
          <ViabilityGauge score={viability.score} />
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 py-2 my-2 border-y border-slate-800/60">
        <div>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            ESTIMATED ETA
          </span>
          <div className="flex items-baseline space-x-1.5 mt-0.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-lg font-extrabold text-slate-100">
              {route.travel_time_min} <span className="text-xs font-normal text-slate-400">min</span>
            </span>
          </div>
          {timeDiffMin > 0 && (
            <span className="text-[11px] font-medium text-amber-400">
              +{timeDiffMin} min vs fastest
            </span>
          )}
        </div>

        <div>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            DISTANCE
          </span>
          <div className="flex items-baseline space-x-1.5 mt-0.5">
            <Navigation className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-lg font-extrabold text-slate-100">
              {route.distance_km} <span className="text-xs font-normal text-slate-400">km</span>
            </span>
          </div>
          <span className="text-[11px] text-slate-400 block font-mono">
            {route.samples ? route.samples.length : 0} physical samples
          </span>
        </div>
      </div>

      {/* Viability & Bottleneck Bar */}
      {viability && (
        <div className="space-y-2 mb-2">
          {/* Hazard Exposure Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-slate-400 uppercase font-semibold">Hazard Exposure</span>
              <span className={viability.hazard_exposure_pct > 20 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                {viability.hazard_exposure_pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  viability.hazard_exposure_pct > 30 ? 'bg-rose-500' :
                  viability.hazard_exposure_pct > 15 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, viability.hazard_exposure_pct)}%` }}
              />
            </div>
          </div>

          {/* Bottleneck Count */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-mono flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Bottlenecks
            </span>
            <div className="flex items-center gap-2">
              {viability.critical_bottleneck_count > 0 && (
                <span className="text-[10px] font-bold text-rose-400 bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800/60 font-mono">
                  {viability.critical_bottleneck_count} Critical
                </span>
              )}
              <span className="text-slate-300 font-mono font-bold">
                {viability.bottleneck_count} total
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Reasons */}
      {viability && viability.rejection_reasons && viability.rejection_reasons.length > 0 && (
        <div className="mb-2 p-2 bg-rose-950/60 border border-rose-800/60 rounded-lg">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-400 uppercase mb-1">
            <ShieldX className="h-3 w-3" />
            Rejection Reason
          </div>
          {viability.rejection_reasons.map((reason, i) => (
            <p key={i} className="text-[11px] text-rose-300/80 font-mono">{reason}</p>
          ))}
        </div>
      )}

      {/* Infrastructure & Bridge Summary */}
      {route.infrastructure_summary && route.infrastructure_summary.total_bridges > 0 && (
        <div className="mb-2 py-1.5 px-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs flex items-center justify-between">
          <span className="text-slate-300 flex items-center gap-1.5 font-mono text-[11px]">
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            <strong>{route.infrastructure_summary.total_bridges} NBI Bridges</strong>
          </span>
          {route.infrastructure_summary.aging_bridges > 0 ? (
            <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60 font-mono">
              {route.infrastructure_summary.aging_bridges} Aged (&lt;1970)
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 font-mono">
              Avg Age: {route.infrastructure_summary.average_bridge_age_years} yrs
            </span>
          )}
        </div>
      )}

      {/* Road Capacity & Dead Zones Telemetry */}
      <div className="mb-2 space-y-1">
        {route.road_capacity && (
          <div className="py-1 px-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-[11px] flex items-center justify-between font-mono">
            <span className="text-slate-400">Road Capacity</span>
            <span className="text-emerald-400 font-bold">
              ~{route.road_capacity.estimated_throughput_veh_hr?.toLocaleString()} veh/hr ({route.road_capacity.avg_lanes} avg lanes)
            </span>
          </div>
        )}
        {route.comm_dead_zones && route.comm_dead_zones.length > 0 && (
          <div className="py-1 px-2.5 bg-purple-950/40 border border-purple-800/60 rounded-lg text-[11px] flex items-center justify-between font-mono">
            <span className="text-purple-300 flex items-center gap-1">
              <span>📡</span> RF Dead Zone
            </span>
            <span className="text-purple-300 font-bold">
              {route.comm_dead_zones.reduce((acc, d) => acc + d.length_km, 0).toFixed(1)} km total
            </span>
          </div>
        )}
        {avgTrafficSpeed && (
          <div className="py-1 px-2.5 bg-emerald-950/30 border border-emerald-800/50 rounded-lg text-[11px] flex items-center justify-between font-mono gap-2">
            <span className="text-emerald-300 flex items-center gap-1 min-w-0">
              <span>🚦</span> Traffic
            </span>
            <span className={`font-bold text-right ${hasRoadClosure ? 'text-rose-300' : 'text-emerald-300'}`}>
              {avgTrafficSpeed} km/h · {worstTrafficLabel}
            </span>
          </div>
        )}
        {route.infrastructure && (route.infrastructure.total_gas_stations > 0 || route.infrastructure.total_ev_chargers > 0 || route.infrastructure.fuel_desert_warning) && (
          <div className="py-1 px-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-[11px] flex items-center justify-between font-mono gap-2">
            <span className="text-amber-300 flex items-center gap-1 min-w-0">
              <span>⛽</span> Energy Readiness
            </span>
            <span className="text-amber-300 font-bold text-right">
              {route.infrastructure.fuel_desert_warning
                ? route.infrastructure.fuel_desert_warning
                : `${route.infrastructure.total_gas_stations || 0} fuel · ${route.infrastructure.total_ev_fast_stations || 0} fast EV`}
            </span>
          </div>
        )}
        {route.infrastructure && route.infrastructure.total_ev_chargers > 0 && (
          <div className="py-1 px-2.5 bg-teal-950/40 border border-teal-800/60 rounded-lg text-[11px] flex items-center justify-between font-mono gap-2">
            <span className="text-teal-300 flex items-center gap-1 min-w-0">
              <span>⚡</span> EV Charge Ready
            </span>
            <span className="text-teal-300 font-bold text-right">
              {route.infrastructure.total_ev_fast_stations || 0} fast · max gap {Math.round(route.infrastructure.max_ev_fast_gap_km || 0)} km
            </span>
          </div>
        )}
        {route.aar_case_studies && route.aar_case_studies.length > 0 && (
          <div className="py-1 px-2.5 bg-amber-950/50 border border-amber-800/80 rounded-lg text-[11px] flex items-center justify-between font-mono">
            <span className="text-amber-300 flex items-center gap-1">
              <span>📜</span> Historic AAR Failure Zone
            </span>
            <span className="text-amber-300 font-bold">
              {route.aar_case_studies[0].incident_name} ({route.aar_case_studies[0].year})
            </span>
          </div>
        )}
        {route.time_cutoff && route.time_cutoff.time_to_cutoff_min && (
          <div className={`py-1 px-2.5 rounded-lg text-[11px] flex items-center justify-between font-mono border ${
            route.time_cutoff.time_to_cutoff_min <= 30
              ? 'bg-rose-950/70 border-rose-700 text-rose-300'
              : route.time_cutoff.time_to_cutoff_min <= 60
              ? 'bg-amber-950/60 border-amber-700 text-amber-300'
              : 'bg-yellow-950/40 border-yellow-800/60 text-yellow-300'
          }`}>
            <span className="flex items-center gap-1 font-bold">
              <span>⏱️</span> TTC: {route.time_cutoff.time_to_cutoff_min} min
            </span>
            <span className="font-bold">
              Cutoff @ Mile {(route.time_cutoff.intercept_distance_km * 0.621371).toFixed(1)}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-slate-400">
          {statusKey === 'PRIMARY' ? 'Recommended Evacuation Corridor' :
           statusKey === 'BACKUP' ? 'Secondary Backup Corridor' :
           statusKey === 'REJECTED' ? 'Fragile Corridor - Not Recommended' :
           'Candidate Evacuation Corridor'}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`text-xs font-semibold px-3 py-1 rounded transition-colors ${
            isSelected
              ? `${colorScheme.badge} font-bold`
              : 'text-slate-300 bg-slate-800 hover:bg-slate-700'
          }`}
        >
          {isSelected ? 'Selected' : 'View Route'}
        </button>
      </div>
    </div>
  );
}
