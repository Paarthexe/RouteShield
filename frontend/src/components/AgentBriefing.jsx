import React, { useState } from 'react';
import { Compass, ChevronDown, ChevronUp, Shield, AlertTriangle, CheckCircle2, FileText, ArrowRight } from 'lucide-react';

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
    mireye_insight
  } = agentDecision;

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

        {/* Primary recommendation badge */}
        {primary_route_id && (
          <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-800/80 px-2.5 py-0.5 rounded text-[11px] font-mono text-emerald-300">
            <span className="text-zinc-400">RECOMMENDED:</span>
            <span className="font-bold">{primary_route_id.toUpperCase().replace('_', ' ')}</span>
          </div>
        )}
      </div>

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
            {primary_route_id ? primary_route_id.toUpperCase().replace('_', ' ') : '—'}
          </span>
        </div>
        <div className="bg-zinc-950 border border-blue-900/40 rounded-lg p-2">
          <span className="text-[10px] text-blue-400 font-bold block mb-0.5">BACKUP</span>
          <span className="text-zinc-200 font-semibold">
            {backup_route_id ? backup_route_id.toUpperCase().replace('_', ' ') : '—'}
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
