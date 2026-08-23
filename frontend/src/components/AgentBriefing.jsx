import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Shield, AlertTriangle, FileText, Route as RouteIcon, Database } from 'lucide-react';

export default function AgentBriefing({ agentDecision }) {
  const [expandedTrace, setExpandedTrace] = useState(false);

  if (!agentDecision) return null;

  const {
    primary_route_id,
    backup_route_id,
    rejected_route_ids = [],
    executive_summary,
    trade_off_explanation,
    steps = [],
    mireye_insight,
    backup_independence,
    risk_model,
    evidence_coverage = {}
  } = agentDecision;
  const noViableRoute = !primary_route_id && rejected_route_ids.length > 0;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-3.5">
      {/* Verdict Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
            <Shield className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200 font-mono">
              Corridor Risk Assessment
            </h3>
          </div>
        </div>

        {/* Primary recommendation / no-viable badge */}
        {primary_route_id && (
          <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-800/80 px-2.5 py-0.5 rounded text-[11px] font-mono text-emerald-300">
            <span className="text-zinc-400">RECOMMENDED:</span>
            <span className="font-bold">{primary_route_id.toUpperCase().replace('_', ' ')}</span>
          </div>
        )}
        {noViableRoute && (
          <div className="flex items-center gap-1.5 bg-rose-950/70 border border-rose-800/80 px-2.5 py-0.5 rounded text-[11px] font-mono text-rose-300">
            <AlertTriangle className="h-3 w-3" />
            <span className="font-bold">NO VIABLE ROUTE</span>
          </div>
        )}
      </div>

      {backup_independence && (
        <div className={`rounded-lg border p-3 text-xs ${
          backup_independence.is_independent ? 'bg-emerald-950/25 border-emerald-900/60' : 'bg-amber-950/25 border-amber-900/60'
        }`}>
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider">
            <RouteIcon className={`h-3.5 w-3.5 ${backup_independence.is_independent ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className={backup_independence.is_independent ? 'text-emerald-300' : 'text-amber-300'}>
              {backup_independence.is_independent ? 'Independent backup verified' : 'No independent backup verified'}
            </span>
          </div>
          <p className="mt-1.5 leading-relaxed text-zinc-300">{backup_independence.explanation}</p>
          <p className="mt-1 text-[10px] font-mono text-zinc-500">Independence score: {backup_independence.independence_score}/100 · Shared corridor: {backup_independence.corridor_overlap_pct}%</p>
        </div>
      )}

      {(risk_model || evidence_coverage.collection_policy) && (
        <details className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
          <summary className="cursor-pointer list-none flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
            <Database className="h-3.5 w-3.5 text-sky-400" /> Methodology & evidence coverage
          </summary>
          <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-zinc-400">
            {risk_model?.interpretation && <p>{risk_model.interpretation}</p>}
            {risk_model?.viability_gate && <p>Gate: reject at BSI above {risk_model.viability_gate.catastrophic_bottleneck_bsi} or high-hazard exposure above {risk_model.viability_gate.high_hazard_exposure_pct}%.</p>}
            {evidence_coverage.collection_policy && <p>{evidence_coverage.collection_policy}</p>}
            <p>{evidence_coverage.mireye_probe_count || 0} Mireye sample(s), {evidence_coverage.bridge_evidence_sample_count || 0} bridge-evidence sample(s).</p>
          </div>
        </details>
      )}

      {/* Executive Summary */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 space-y-1">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400 block">
          Assessment Summary
        </span>
        <p className="text-xs text-zinc-300 leading-relaxed font-sans">
          {executive_summary}
        </p>
      </div>

      {/* Trade-Off Explanation */}
      {trade_off_explanation && (
        <div className="bg-zinc-950/80 border border-amber-900/30 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            <span>Speed vs Safety Trade-Off</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed font-sans">
            {trade_off_explanation}
          </p>
        </div>
      )}

      {/* Mireye Environmental Assessment */}
      {mireye_insight && (
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-300">
              <FileText className="h-3 w-3 text-sky-400" />
              <span>Mireye Environmental Assessment</span>
            </div>
            <span className="text-[9px] font-mono text-zinc-500">Mireye API /v1/ask</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed font-sans">
            "{mireye_insight}"
          </p>
        </div>
      )}

      {/* Route Classification Grid */}
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono pt-1">
        <div className="bg-zinc-950 border border-emerald-900/40 rounded-lg p-2">
          <span className="text-[10px] text-emerald-400 font-bold block mb-0.5">PRIMARY</span>
          <span className="text-zinc-200 font-semibold">
            {primary_route_id ? primary_route_id.toUpperCase().replace('_', ' ') : '-'}
          </span>
        </div>
        <div className="bg-zinc-950 border border-blue-900/40 rounded-lg p-2">
          <span className="text-[10px] text-blue-400 font-bold block mb-0.5">BACKUP</span>
          <span className="text-zinc-200 font-semibold">
            {backup_route_id ? backup_route_id.toUpperCase().replace('_', ' ') : '-'}
          </span>
        </div>

        <div className="bg-zinc-950 border border-rose-900/40 rounded-lg p-2">
          <span className="text-[10px] text-rose-400 font-bold block mb-0.5">HIGH RISK</span>
          <span className="text-zinc-200 font-semibold truncate block" title={rejected_route_ids.join(', ')}>
            {rejected_route_ids.length > 0
              ? rejected_route_ids.map(id => id.toUpperCase().replace('_', ' ')).join(', ')
              : 'None'}
          </span>
        </div>
      </div>

      {/* Collapsible Technical Decision Trace */}
      {steps.length > 0 && (
        <div className="border-t border-zinc-800/80 pt-2">
          <button
            onClick={() => setExpandedTrace(!expandedTrace)}
            className="w-full flex items-center justify-between text-[11px] font-mono text-zinc-400 hover:text-zinc-200 py-1 transition-colors cursor-pointer"
          >
            <span>Evaluation Trace ({steps.length} steps)</span>
            {expandedTrace ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {expandedTrace && (
            <div className="mt-2 space-y-1.5 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-850 font-mono text-[11px]">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2 text-zinc-400">
                  <span className="text-zinc-500 shrink-0">[{step.step_number}]</span>
                  <div>
                    <span className="text-zinc-300 font-semibold mr-1.5">{step.action}:</span>
                    <span className="text-zinc-400">{step.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
