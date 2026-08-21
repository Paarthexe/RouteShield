import React from 'react';
import { ArrowUpRight, ShieldCheck, ShieldQuestion } from 'lucide-react';

export default function DecisionReadout({ routes, selectedRoute }) {
  if (!routes?.length) return null;
  const fastest = routes.reduce((best, route) => route.travel_time_min < best.travel_time_min ? route : best, routes[0]);
  const route = selectedRoute || fastest;
  const extraMinutes = Math.max(0, Math.round((route.travel_time_min - fastest.travel_time_min) * 10) / 10);
  const evidenceCount = route.samples?.filter((sample) => sample.mireye_data || sample.nbi_bridges?.length || sample.hazards?.length).length || 0;

  return (
    <section className="rounded-xl border border-cyan-900/70 bg-gradient-to-br from-cyan-950/50 to-slate-900 p-4 shadow-lg shadow-cyan-950/20">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-700/70 bg-cyan-500/10 text-cyan-300">
          <ShieldQuestion className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300 font-mono">Decision preview</p>
          <h2 className="mt-1 text-base font-bold text-white">Evidence is ready for resilience analysis</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">The current build identifies corridors and collects evidence. It does not yet declare a safe or primary evacuation route.</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <span className="block text-[9px] uppercase tracking-wider text-slate-500">Selected view</span>
          <span className="mt-1 block truncate text-sm font-bold text-white">{route.tag || route.route_id}</span>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <span className="block text-[9px] uppercase tracking-wider text-slate-500">vs fastest</span>
          <span className="mt-1 block text-sm font-bold text-amber-300">{extraMinutes ? `+${extraMinutes} min` : 'Fastest'}</span>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <span className="block text-[9px] uppercase tracking-wider text-slate-500">Evidence points</span>
          <span className="mt-1 block text-sm font-bold text-cyan-300">{evidenceCount || '—'}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        <span>Recommendation language will unlock after viability rules and bottleneck detection are connected.</span>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-slate-500" />
      </div>
    </section>
  );
}
