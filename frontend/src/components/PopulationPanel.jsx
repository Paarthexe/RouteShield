import React from 'react';
import { Users, Car, Clock, ShieldAlert } from 'lucide-react';

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

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-3 font-mono">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <Users className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            Evacuation Population Exposure (ETE)
          </h3>
        </div>
        <span className="text-[10px] text-zinc-500">{evacuation_radius_km}km Radius Sector</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-850">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">Affected Residents</span>
          <div className="flex items-baseline space-x-1 mt-0.5">
            <span className="text-lg font-bold text-zinc-100">
              {affected_population ? affected_population.toLocaleString() : '--'}
            </span>
            <span className="text-[10px] text-zinc-500">pop</span>
          </div>
        </div>

        <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-850">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">Estimated Fleet</span>
          <div className="flex items-baseline space-x-1 mt-0.5">
            <Car className="h-3.5 w-3.5 text-zinc-400 mr-0.5" />
            <span className="text-lg font-bold text-zinc-100">
              {estimated_vehicles ? estimated_vehicles.toLocaleString() : '--'}
            </span>
            <span className="text-[10px] text-zinc-500">veh</span>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-850">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">Clearance Window (ETE)</span>
          <div className="flex items-baseline space-x-1 mt-0.5 text-amber-400 font-bold text-base">
            <Clock className="h-3.5 w-3.5 mr-0.5 text-amber-400 shrink-0" />
            <span>{Math.round(clearance_time_min_low / 60)}h - {Math.round(clearance_time_min_high / 60)}h</span>
          </div>
        </div>
      </div>

      <div className="bg-zinc-950/40 p-2 rounded border border-zinc-850 text-[10px] text-zinc-500 leading-relaxed font-sans">
        Source: {source || 'US Census Bureau ACS & TRB NCHRP 752 ETE Guidelines'}. Clearance bounds model 100% staged compliance vs 50% staggered mobilization.
      </div>
    </div>
  );
}
