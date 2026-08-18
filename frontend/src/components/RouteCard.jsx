import React from 'react';
import { Clock, Navigation, MapPin, CheckCircle2 } from 'lucide-react';

const ROUTE_COLORS = {
  route_1: { border: 'border-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-500/10', badge: 'bg-cyan-500/20 text-cyan-300' },
  route_2: { border: 'border-purple-500', text: 'text-purple-400', bg: 'bg-purple-500/10', badge: 'bg-purple-500/20 text-purple-300' },
  route_3: { border: 'border-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', badge: 'bg-amber-500/20 text-amber-300' },
  route_4: { border: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', badge: 'bg-emerald-500/20 text-emerald-300' },
};

export default function RouteCard({ route, isSelected, onSelect, fastestDuration }) {
  const colorScheme = ROUTE_COLORS[route.route_id] || ROUTE_COLORS.route_1;
  const isFastest = route.route_id === 'route_1';

  const timeDiffMin = !isFastest && fastestDuration 
    ? Math.round(route.travel_time_min - fastestDuration)
    : 0;

  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? `${colorScheme.border} ${colorScheme.bg} shadow-lg shadow-black/40 ring-1 ring-cyan-500/30`
          : 'border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center space-x-2">
            <span className={`text-[10px] font-extrabold uppercase font-mono px-2 py-0.5 rounded ${colorScheme.badge}`}>
              {route.route_id.toUpperCase().replace('_', ' ')}
            </span>
            {isFastest && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/60">
                Fastest
              </span>
            )}
          </div>
          <h3 className="text-sm font-bold text-slate-100 mt-1">
            {route.tag || `Corridor ${route.route_id}`}
          </h3>
        </div>

        {isSelected && (
          <CheckCircle2 className={`h-5 w-5 ${colorScheme.text}`} />
        )}
      </div>

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

      {/* Infrastructure & Bridge Summary */}
      {route.infrastructure_summary && route.infrastructure_summary.total_bridges > 0 && (
        <div className="mb-2 py-1.5 px-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs flex items-center justify-between">
          <span className="text-slate-300 flex items-center gap-1.5 font-mono text-[11px]">
            <span>🌉</span>
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

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-slate-400">
          Candidate Evacuation Corridor
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
