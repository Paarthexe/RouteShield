import React from 'react';
import { Clock3, Gauge, Route as RouteIcon } from 'lucide-react';

export default function RouteComparison({ routes, selectedRouteId, onSelectRoute }) {
  if (!routes?.length) return null;
  const fastest = Math.min(...routes.map((route) => route.travel_time_min));

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80">
      <div className="border-b border-slate-800 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 font-mono">Corridor comparison</p>
        <p className="mt-1 text-xs text-slate-500">Compare time and evidence coverage before the decision engine ranks resilience.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="bg-slate-950/70 text-[10px] uppercase tracking-wider text-slate-500 font-mono">
            <tr><th className="px-4 py-2.5">Corridor</th><th className="px-3 py-2.5">Time</th><th className="px-3 py-2.5">Distance</th><th className="px-3 py-2.5">Evidence</th><th className="px-4 py-2.5">State</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {routes.map((route) => {
              const evidence = route.samples?.filter((sample) => sample.mireye_data || sample.nbi_bridges?.length || sample.hazards?.length).length || 0;
              const active = route.route_id === selectedRouteId;
              return <tr key={route.route_id} onClick={() => onSelectRoute(route.route_id)} className={`cursor-pointer transition-colors ${active ? 'bg-cyan-950/30' : 'hover:bg-slate-800/60'}`}>
                <td className="px-4 py-3"><span className="flex items-center gap-2 font-semibold text-slate-200"><RouteIcon className="h-3.5 w-3.5 text-cyan-400" />{route.tag || route.route_id}</span></td>
                <td className="px-3 py-3"><span className="flex items-center gap-1.5 text-slate-200"><Clock3 className="h-3.5 w-3.5 text-slate-500" />{route.travel_time_min} min</span><span className="text-[10px] text-slate-500">{route.travel_time_min === fastest ? 'Fastest' : `+${Math.round(route.travel_time_min - fastest)} min`}</span></td>
                <td className="px-3 py-3 text-slate-300">{route.distance_km} km</td>
                <td className="px-3 py-3 text-cyan-300">{evidence || '-'} <span className="text-slate-500">pts</span></td>
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-800/60 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-300"><Gauge className="h-3 w-3" />Analysis pending</span></td>

              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
