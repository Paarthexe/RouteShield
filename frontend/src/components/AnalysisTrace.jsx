import React from 'react';
import { CheckCircle2, Circle, Loader2, AlertTriangle } from 'lucide-react';

const STEPS = [
  ['resolve', 'Resolve locations'],
  ['routes', 'Generate candidate corridors'],
  ['samples', 'Sample route geometry'],
  ['evidence', 'Collect physical-world evidence'],
  ['decision', 'Evaluate resilience & select routes'],
];

export default function AnalysisTrace({ loading, analysisData, error }) {
  const hasRoutes = Boolean(analysisData?.routes?.length);
  const hasEvidence = analysisData?.routes?.some((route) =>
    route.samples?.some((sample) => sample.mireye_data || sample.nbi_bridges?.length || sample.hazards?.length)
  );
  const hasDecision = Boolean(analysisData?.agent_decision);

  const statusFor = (key) => {
    if (error && key === 'decision') return 'error';
    if (loading) {
      if (key === 'resolve') return 'complete';
      return key === 'routes' ? 'active' : 'pending';
    }
    if (key === 'resolve' || key === 'routes' || key === 'samples') return hasRoutes ? 'complete' : 'pending';
    if (key === 'evidence') return hasEvidence ? 'complete' : 'pending';
    return hasDecision ? 'complete' : 'pending';
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4" aria-label="Analysis workflow">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400 font-mono">Analysis workflow</p>
          <p className="mt-1 text-xs text-slate-400">Traceable stages, no hidden reasoning</p>
        </div>
        <span className="rounded border border-amber-800/70 bg-amber-950/40 px-2 py-1 text-[10px] font-mono text-amber-300">STAGE 2</span>
      </div>
      <ol className="space-y-2">
        {STEPS.map(([key, label], index) => {
          const status = statusFor(key);
          return (
            <li key={key} className="flex items-center gap-2.5 text-xs">
              {status === 'complete' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {status === 'active' && <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />}
              {status === 'error' && <AlertTriangle className="h-4 w-4 text-rose-400" />}
              {status === 'pending' && <Circle className="h-4 w-4 text-slate-600" />}
              <span className={status === 'pending' ? 'text-slate-500' : 'text-slate-200'}>{label}</span>
              {index < STEPS.length - 1 && <span className="ml-auto text-[10px] font-mono text-slate-600">›</span>}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
        RouteShield exposes the deterministic evidence and decision trace so every recommendation—or no-viable-route result—can be audited.
      </p>
    </section>
  );
}
