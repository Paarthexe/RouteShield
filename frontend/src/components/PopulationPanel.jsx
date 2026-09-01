import React from 'react';
import { Users, Car, Clock } from 'lucide-react';

export default function PopulationPanel({ exposure }) {
  if (!exposure) return null;

  const {
    affected_population,
    estimated_vehicles,
    clearance_time_min_low,
    clearance_time_min_high,
    evacuation_radius_km,
    source
  } = exposure;

  const lowHours = clearance_time_min_low ? Math.round(clearance_time_min_low / 60) : 0;
  const highHours = clearance_time_min_high ? Math.round(clearance_time_min_high / 60) : 0;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-3 font-mono w-full shrink-0 min-h-fit box-border">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <Users className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            Evacuation Population Exposure (ETE)
          </h3>
        </div>
        <span className="text-[10px] text-zinc-500 font-sans">{evacuation_radius_km}km Radius Sector</span>
      </div>

      {/* Metrics Layout */}
      <div className="space-y-2.5">
        {/* Top 2 equal-width cards */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-850 flex flex-col justify-between">
            <span className="text-[10px] text-zinc-400 uppercase font-sans font-medium">Affected Residents</span>
            <div className="flex items-baseline space-x-1 mt-1">
              <span className="text-xl font-bold font-mono text-zinc-100">
                {affected_population ? affected_population.toLocaleString() : '--'}
              </span>
              <span className="text-[10px] font-mono text-zinc-500">pop</span>
            </div>
          </div>

          <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-850 flex flex-col justify-between">
            <span className="text-[10px] text-zinc-400 uppercase font-sans font-medium">Estimated Fleet</span>
            <div className="flex items-baseline space-x-1 mt-1">
              <span className="text-xl font-bold font-mono text-zinc-100">
                {estimated_vehicles ? estimated_vehicles.toLocaleString() : '--'}
              </span>
              <span className="text-[10px] font-mono text-zinc-500">veh</span>
            </div>
          </div>
        </div>

        {/* Full-width Clearance Window card */}
        <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-850 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] text-zinc-400 uppercase font-sans font-medium block">
              Clearance Window (ETE)
            </span>
            <span className="text-[10px] text-zinc-500 font-sans block truncate">
              Staged vs. staggered mobilization
            </span>
          </div>
          <div className="flex items-center space-x-2 bg-amber-950/40 border border-amber-800/50 px-3 py-1.5 rounded-lg text-amber-400 shrink-0">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="text-sm font-extrabold font-mono whitespace-nowrap">
              {lowHours || '--'}h – {highHours || '--'}h
            </span>
          </div>
        </div>
      </div>

      {/* Source Footnote */}
      <div className="bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-850/60 text-[10px] text-zinc-400 font-sans leading-relaxed">
        <p>Source: {source || 'US Census Bureau ACS & TRB NCHRP 752 ETE Guidelines. Clearance bounds model 100% staged compliance vs 50% staggered mobilization.'}</p>
      </div>
    </div>
  );
}
