import React from 'react';
import { ArrowUpRight, ShieldCheck, ShieldQuestion } from 'lucide-react';

export default function DecisionReadout({ routes, selectedRoute, agentDecision }) {
  if (!routes?.length) return null;
  const fastest = routes.reduce((best, route) => route.travel_time_min < best.travel_time_min ? route : best, routes[0]);
  const route = selectedRoute || fastest;
  const extraMinutes = Math.max(0, Math.round((route.travel_time_min - fastest.travel_time_min) * 10) / 10);
  const evidenceCount = route.samples?.filter((sample) => sample.mireye_data || sample.nbi_bridges?.length || sample.hazards?.length).length || 0;
  const hasDecision = Boolean(agentDecision);
  const noViableRoute = hasDecision && !agentDecision.primary_route_id;
  const primaryRoute = routes.find((item) => item?.viability?.status === 'PRIMARY') || routes.find((item) => item.route_id === agentDecision?.primary_route_id) || null;
  const backupRoute = routes.find((item) => item?.viability?.status === 'BACKUP') || routes.find((item) => item.route_id === agentDecision?.backup_route_id) || null;
  const rejectedRoutes = routes.filter((item) => item?.viability?.status === 'REJECTED');
  const selectedRole = route?.viability?.status === 'PRIMARY'
    ? 'Primary Route'
    : route?.viability?.status === 'BACKUP'
    ? 'Backup Route'
    : route?.viability?.status === 'REJECTED'
    ? 'Rejected Route'
    : route?.route_id === fastest?.route_id
    ? 'Fastest Route'
    : 'Alternate Route';

  const statusItems = [
    route ? { label: 'Selected', value: route.route_id.toUpperCase().replace('_', ' '), tone: 'border-cyan-800/60 bg-cyan-950/40 text-cyan-300' } : null,
    primaryRoute ? { label: 'Primary', value: primaryRoute.route_id.toUpperCase().replace('_', ' '), tone: 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300' } : null,
    fastest ? { label: 'Fastest', value: fastest.route_id.toUpperCase().replace('_', ' '), tone: 'border-sky-800/60 bg-sky-950/40 text-sky-300' } : null,
    backupRoute ? { label: 'Backup', value: backupRoute.route_id.toUpperCase().replace('_', ' '), tone: 'border-blue-800/60 bg-blue-950/40 text-blue-300' } : null,
    rejectedRoutes.length ? { label: 'Rejected', value: rejectedRoutes.map((item) => item.route_id.toUpperCase().replace('_', ' ')).join(', '), tone: 'border-rose-800/60 bg-rose-950/40 text-rose-300' } : null,
  ].filter(Boolean);

  return (
    <section className="rounded-xl border border-cyan-900/70 bg-gradient-to-br from-cyan-950/50 to-slate-900 p-4 shadow-lg shadow-cyan-950/20">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-700/70 bg-cyan-500/10 text-cyan-300">
          <ShieldQuestion className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300 font-mono">Decision preview</p>
          <h2 className="mt-1 text-base font-bold text-white">{noViableRoute ? 'No viable corridor identified' : hasDecision ? 'Resilience decision available' : 'Evidence is ready for resilience analysis'}</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{noViableRoute ? 'Every evaluated corridor violated the configured viability gate. Review the rejected routes and their evidence before proceeding.' : hasDecision ? 'The recommendation is based on the deterministic route analysis and its evidence trace.' : 'The current build identifies corridors and collects evidence while the decision layer completes.'}</p>
        </div>
      </div>
      {statusItems.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {statusItems.map((item) => (
            <div key={`${item.label}-${item.value}`} className={`rounded-full border px-2.5 py-1 text-[10px] font-mono font-bold ${item.tone}`}>
              <span className="mr-1 opacity-75">{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
        <ShieldCheck className={`h-3.5 w-3.5 ${noViableRoute ? 'text-rose-400' : 'text-emerald-400'}`} />
        <span>{noViableRoute ? 'No route is being presented as safe. The least-bad corridor remains available for review only.' : hasDecision ? `${selectedRole}${extraMinutes ? ` · +${extraMinutes} min vs fastest` : ' · fastest available'}${evidenceCount ? ` · ${evidenceCount} evidence points` : ''}` : 'Recommendation language will unlock after the decision engine returns.'}</span>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-slate-500" />
      </div>
    </section>
  );
}
