import React, { useState } from 'react';
import { Compass, ChevronDown, ChevronUp, Zap, Shield, AlertTriangle, CheckCircle2, Info, FileText } from 'lucide-react';

const STEP_ICONS = {
  'Corridor Intake': Zap,
  'Bottleneck Detection': AlertTriangle,
  'Viability Assessment': Shield,
  'Route Ranking': CheckCircle2,
  'Mireye Deep Analysis': FileText,
  'Decision Finalized': Compass,
};

export default function AgentBriefing({ agentDecision }) {
  const [expanded, setExpanded] = useState(true);

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
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-750 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
            <Compass className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-left">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
              Corridor Evaluation & Decision
            </h3>
            <p className="text-[10px] text-slate-400">
              {steps.length} decision steps • {primary_route_id ? `Primary: ${primary_route_id.toUpperCase().replace('_', ' ')}` : 'Evaluating...'}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Executive Summary */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 mt-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono mb-1.5 flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              Executive Summary
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {executive_summary}
            </p>
          </div>

          {/* Trade-Off Explanation */}
          {trade_off_explanation && (
            <div className="bg-slate-950/80 border border-amber-900/40 rounded-lg p-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                Speed vs. Safety Trade-Off
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {trade_off_explanation}
              </p>
            </div>
          )}

          {/* Mireye Environmental Assessment */}
          {mireye_insight && (
            <div className="bg-cyan-950/30 border border-cyan-800/40 rounded-lg p-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 font-mono mb-1.5 flex items-center gap-1.5">
                <FileText className="h-3 w-3" />
                Mireye Environmental Assessment
              </h4>
              <p className="text-xs text-cyan-100/80 leading-relaxed italic">
                "{mireye_insight}"
              </p>
              <span className="text-[9px] text-cyan-500/60 font-mono mt-1 block">
                Source: Mireye API (/v1/ask)
              </span>
            </div>
          )}

          {/* Decision Steps Timeline */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-2">
              Decision Trace
            </h4>
            <div className="space-y-0">
              {steps.map((step, idx) => {
                const IconComponent = STEP_ICONS[step.action] || Info;
                const isLast = idx === steps.length - 1;
                return (
                  <div key={idx} className="flex gap-3">
                    {/* Timeline line + dot */}
                    <div className="flex flex-col items-center">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                        isLast ? 'bg-emerald-500/20 border border-emerald-500/40' : 'bg-slate-800 border border-slate-700'
                      }`}>
                        <IconComponent className={`h-3 w-3 ${isLast ? 'text-emerald-400' : 'text-slate-400'}`} />
                      </div>
                      {!isLast && (
                        <div className="w-px h-full min-h-[16px] bg-slate-800" />
                      )}
                    </div>
                    {/* Content */}
                    <div className="pb-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-slate-300 uppercase">
                          Step {step.step_number}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          isLast ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {step.action}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Route Assignment Summary */}
          <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
            <div className="bg-emerald-950/50 border border-emerald-800/40 rounded-lg p-2">
              <span className="text-emerald-400 font-bold block">PRIMARY</span>
              <span className="text-slate-200 font-bold text-xs">
                {primary_route_id ? primary_route_id.toUpperCase().replace('_', ' ') : '—'}
              </span>
            </div>
            <div className="bg-blue-950/50 border border-blue-800/40 rounded-lg p-2">
              <span className="text-blue-400 font-bold block">BACKUP</span>
              <span className="text-slate-200 font-bold text-xs">
                {backup_route_id ? backup_route_id.toUpperCase().replace('_', ' ') : '—'}
              </span>
            </div>
            <div className="bg-rose-950/50 border border-rose-800/40 rounded-lg p-2">
              <span className="text-rose-400 font-bold block">REJECTED</span>
              <span className="text-slate-200 font-bold text-xs">
                {rejected_route_ids.length > 0
                  ? rejected_route_ids.map(id => id.toUpperCase().replace('_', ' ')).join(', ')
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
