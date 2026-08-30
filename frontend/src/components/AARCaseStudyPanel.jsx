import React, { useState } from 'react';
import { BookOpen, AlertOctagon, ChevronDown, ChevronUp, ShieldCheck, FileText, Compass } from 'lucide-react';

export default function AARCaseStudyPanel({ caseStudies = [] }) {
  const [expandedIndex, setExpandedIndex] = useState(0);

  if (!caseStudies || caseStudies.length === 0) return null;

  return (
    <div className="bg-zinc-900/90 border border-amber-850/80 rounded-xl p-4 shadow-xl space-y-3 font-mono">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <BookOpen className="h-4 w-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-200">
            Real-World Evacuation AAR Case Studies ({caseStudies.length})
          </h3>
        </div>
        <span className="text-[10px] text-amber-300 bg-amber-950/80 border border-amber-800/80 px-2 py-0.5 rounded font-bold">
          FEMA / NIST Ground Truth
        </span>
      </div>

      <div className="space-y-2.5">
        {caseStudies.map((study, idx) => {
          const isExpanded = expandedIndex === idx;
          return (
            <div
              key={idx}
              className="bg-zinc-950/90 rounded-lg border border-amber-900/40 overflow-hidden transition-all"
            >
              {/* Card Header */}
              <button
                onClick={() => setExpandedIndex(isExpanded ? -1 : idx)}
                className="w-full p-3 flex items-start justify-between text-left hover:bg-zinc-900/50 transition-colors cursor-pointer"
              >
                <div className="space-y-1 min-w-0 flex-1 pr-2">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-950 px-1.5 py-0.2 rounded border border-amber-800">
                      {study.year} · {study.hazard_type}
                    </span>
                    <span className="text-xs font-bold text-zinc-100 truncate">
                      {study.incident_name}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-sans">
                    {study.location_name}
                  </p>
                </div>
                <div className="flex items-center space-x-1.5 shrink-0 mt-1">
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {(study.distance_to_route_m / 1000).toFixed(1)} km away
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                </div>
              </button>

              {/* Expanded Case Study Details */}
              {isExpanded && (
                <div className="p-3 border-t border-zinc-850/80 bg-zinc-950/60 space-y-2.5 text-xs font-sans">
                  {/* Gridlock Root Cause */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-rose-400 uppercase font-mono flex items-center gap-1">
                      <AlertOctagon className="h-3 w-3" />
                      Documented Failure Mechanism
                    </span>
                    <p className="text-zinc-300 text-[11px] leading-relaxed pl-4 border-l-2 border-rose-800/80">
                      {study.gridlock_cause}
                    </p>
                  </div>

                  {/* Lessons Learned */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-sky-400 uppercase font-mono flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      After-Action Report Findings
                    </span>
                    <p className="text-zinc-300 text-[11px] leading-relaxed pl-4 border-l-2 border-sky-800/80">
                      {study.lessons_learned}
                    </p>
                  </div>

                  {/* Tactical Mitigation Strategy */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase font-mono flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Operational Mitigation Strategy
                    </span>
                    <p className="text-zinc-300 text-[11px] leading-relaxed pl-4 border-l-2 border-emerald-800/80">
                      {study.mitigation_strategy}
                    </p>
                  </div>

                  {/* Agency Citation */}
                  <div className="pt-1.5 border-t border-zinc-850 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                    <span className="truncate max-w-[85%]">Report: {study.agency_report}</span>
                    <span className="text-amber-400 font-bold">{study.severity}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
