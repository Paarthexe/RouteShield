import React from 'react';
import { Network, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function CapacityPanel({ capacityAnalysis }) {
  if (!capacityAnalysis) return null;

  const {
    total_system_throughput_veh_hr = 0,
    shared_segment_conflicts = [],
    per_route_capacity = {}
  } = capacityAnalysis;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-3 font-mono w-full shrink-0 min-h-fit box-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center space-x-2 min-w-0">
          <Network className="h-4 w-4 text-emerald-400 shrink-0" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            Multi-Corridor Network Capacity
          </h3>
        </div>
        <span className="text-[10px] text-zinc-400 font-mono">HCM 6th Edition</span>
      </div>

      {/* Throughput Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
        <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-850 min-w-0">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">Total Outflow Throughput</span>
          <div className="flex items-baseline space-x-1.5 mt-0.5">
            <span className="text-xl font-extrabold text-emerald-400">
              {total_system_throughput_veh_hr.toLocaleString()}
            </span>
            <span className="text-xs text-zinc-400">veh / hour</span>
          </div>
        </div>

        <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-850 min-w-0">
          <span className="text-[10px] text-zinc-400 uppercase block font-sans">Corridor Flow Limits</span>
          <div className="space-y-1 mt-1">
            {Object.entries(per_route_capacity).map(([rId, flow]) => (
              <div key={rId} className="flex justify-between text-xs">
                <span className="text-zinc-400">{rId.toUpperCase()}</span>
                <span className="text-zinc-200 font-bold">{flow.toLocaleString()} vph</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Shared Trunk Warnings / Verification */}
      {shared_segment_conflicts.length > 0 ? (
        <div className="bg-rose-950/40 border border-rose-900/60 p-2.5 rounded-lg flex items-start space-x-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-rose-200 space-y-0.5 font-sans">
            <p className="font-bold font-mono">Shared Trunk Bottleneck Warning</p>
            <p>
              Multiple corridors funnel through the same {shared_segment_conflicts[0].segment_length_km}km arterial corridor. A blockage here fails backup independence.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-950/40 border border-zinc-850/60 p-2.5 rounded-lg flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-[11px] text-zinc-400 font-sans">
            Corridors maintain distinct physical roadbeds with no single-point trunk dependency.
          </span>
        </div>
      )}
    </div>
  );
}
