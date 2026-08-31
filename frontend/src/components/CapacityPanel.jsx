import React, { useState } from 'react';
import { Network, ArrowRightLeft, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';

export default function CapacityPanel({ capacityAnalysis }) {
  const [contraflowActive, setContraflowActive] = useState(false);

  if (!capacityAnalysis) return null;

  const {
    total_system_throughput_veh_hr = 0,
    shared_segment_conflicts = [],
    contraflow_candidates = [],
    per_route_capacity = {}
  } = capacityAnalysis;

  const contraflowBonus = contraflow_candidates.length > 0
    ? Math.round(contraflow_candidates[0].current_throughput_veh_hr * 0.75)
    : 0;

  const effectiveThroughput = contraflowActive
    ? total_system_throughput_veh_hr + contraflowBonus
    : total_system_throughput_veh_hr;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-3 font-mono max-w-full overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-zinc-800 pb-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <Network className="h-4 w-4 text-emerald-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200 break-words">
            Multi-Corridor Network Capacity & Contraflow
          </h3>
        </div>
        <button
          onClick={() => setContraflowActive(!contraflowActive)}
          className={`w-full sm:w-auto text-[10px] font-bold px-2.5 py-1 rounded border transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
            contraflowActive
              ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-950'
              : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-zinc-100'
          }`}
        >
          <ArrowRightLeft className="h-3 w-3" />
          <span>{contraflowActive ? 'Contraflow Active (+75%)' : 'Simulate Contraflow'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
        <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-850 min-w-0">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">Total Outflow Throughput</span>
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 mt-0.5 min-w-0">
            <span className="text-xl font-extrabold text-emerald-400">
              {effectiveThroughput.toLocaleString()}
            </span>
            <span className="text-xs text-zinc-400">veh / hour</span>
            {contraflowActive && (
              <span className="text-[10px] text-emerald-300 bg-emerald-950 border border-emerald-800/80 px-1 rounded">
                +{contraflowBonus.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-850 min-w-0 overflow-hidden">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">Corridor Allocations</span>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-300 min-w-0">
            {Object.entries(per_route_capacity).map(([rId, cap]) => (
              <div key={rId} className="max-w-full px-1.5 py-0.5 bg-zinc-900 border border-zinc-750 rounded break-words">
                <span className="text-zinc-400 mr-1 break-words">{rId.toUpperCase().replace('_', ' ')}:</span>
                <span className="font-bold">{cap.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {shared_segment_conflicts.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center space-x-1.5 text-amber-400 text-[11px] font-bold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Shared Trunk Bottleneck Detected</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-snug font-sans">
            {shared_segment_conflicts[0].conflict_description} Shared road segments cap aggregate simultaneous clearance.
          </p>
        </div>
      )}

      {contraflow_candidates.length > 0 && (
        <div className="text-[10px] text-zinc-400 bg-zinc-950/60 p-2 rounded border border-zinc-850 flex items-start space-x-1.5 font-sans">
          <TrendingUp className="h-3.5 w-3.5 text-sky-400 shrink-0 mt-0.5" />
          <span><strong>Contraflow candidate:</strong> {contraflow_candidates[0].segment_name}. Reversing inbound lanes increases single-corridor throughput from {contraflow_candidates[0].current_throughput_veh_hr?.toLocaleString()} to {contraflow_candidates[0].contraflow_throughput_veh_hr?.toLocaleString()} veh/hr.</span>
        </div>
      )}
    </div>
  );
}
