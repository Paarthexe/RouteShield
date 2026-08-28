import React, { useState } from 'react';
import { Layers, CheckCircle2, AlertTriangle, Zap, Wrench, XCircle, ChevronDown, ChevronUp, ArrowRightLeft, MapPin } from 'lucide-react';
import { repairSegment } from '../services/api';

const SEGMENT_STATUS_CONFIG = {
  VIABLE: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/50',
    border: 'border-emerald-800/60',
    icon: CheckCircle2,
    label: 'Viable',
  },
  NEEDS_REPAIR: {
    color: 'text-amber-400',
    bg: 'bg-amber-950/50',
    border: 'border-amber-800/60',
    icon: AlertTriangle,
    label: 'Needs Repair',
  },
  CRITICAL: {
    color: 'text-rose-400',
    bg: 'bg-rose-950/60',
    border: 'border-rose-800/60',
    icon: Zap,
    label: 'Critical',
  },
};

function DiffSummary({ diff }) {
  if (!diff) return null;
  const distDeltaKm = Math.round((diff.new_distance_km - diff.original_distance_km) * 100) / 100;
  const timeDeltaMin = Math.round((diff.new_travel_time_min - diff.original_travel_time_min) * 10) / 10;
  const scoreDelta = Math.round((diff.new_viability_score - diff.original_viability_score) * 10) / 10;
  const critDelta = diff.new_critical_bottlenecks - diff.original_critical_bottlenecks;

  return (
    <div className="mt-2 p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-1.5">
      <p className="text-[10px] font-bold font-mono text-zinc-300 uppercase tracking-wider">Repair Diff Summary</p>
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div>
          <span className="text-zinc-500 block">Δ Distance</span>
          <span className={distDeltaKm >= 0 ? 'text-amber-400' : 'text-emerald-400'}>
            {distDeltaKm >= 0 ? '+' : ''}{distDeltaKm} km
          </span>
        </div>
        <div>
          <span className="text-zinc-500 block">Δ Viability</span>
          <span className={scoreDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {scoreDelta >= 0 ? '+' : ''}{scoreDelta} pts ({diff.new_viability_score?.toFixed(0)}/100)
          </span>
        </div>
        <div>
          <span className="text-zinc-500 block">Δ Travel Time</span>
          <span className={timeDeltaMin >= 0 ? 'text-amber-400' : 'text-emerald-400'}>
            {timeDeltaMin >= 0 ? '+' : ''}{timeDeltaMin} min
          </span>
        </div>
        <div>
          <span className="text-zinc-500 block">Critical Chokepoints</span>
          <span className={critDelta <= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {critDelta > 0 ? '+' : ''}{critDelta} ({diff.new_critical_bottlenecks} remaining)
          </span>
        </div>
      </div>
      {diff.summary && (
        <p className="text-[11px] text-zinc-300 font-mono border-t border-zinc-800 pt-1.5 mt-1 leading-snug">
          {diff.summary}
        </p>
      )}
    </div>
  );
}

function SegmentRow({ segment, routeId, disasterType, onRepaired, onArmAvoidPicker }) {
  const cfg = SEGMENT_STATUS_CONFIG[segment.status] || SEGMENT_STATUS_CONFIG.VIABLE;
  const Icon = cfg.icon;
  const [expanded, setExpanded] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRepair = async (action = 'auto_repair', avoidCoord = null) => {
    setRepairing(true);
    setError(null);
    setRepairResult(null);
    try {
      const payload = { action, disaster_type: disasterType };
      if (avoidCoord) {
        payload.avoid_coordinate = { latitude: avoidCoord.lat, longitude: avoidCoord.lng };
      }
      const result = await repairSegment(routeId, segment.segment_id, payload);
      setRepairResult(result);
      if (result.success && onRepaired) {
        onRepaired(result.route, result.diff);
      }
    } catch (err) {
      setError(err.message || 'Repair failed');
    } finally {
      setRepairing(false);
    }
  };

  const sampleCount = segment.sample_ids?.length || 0;
  const distKm = segment.distance_km != null ? segment.distance_km.toFixed(1) : '—';
  const timeMin = segment.travel_time_min != null ? segment.travel_time_min.toFixed(1) : '—';
  const needsAction = segment.status !== 'VIABLE';

  return (
    <div className={`rounded-lg border transition-all ${cfg.border} ${cfg.bg}`}>
      {/* Row Header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
        onClick={() => needsAction && setExpanded(e => !e)}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold font-mono text-zinc-100">
              Seg {segment.segment_index + 1}
            </span>
            <span className="text-[9px] font-mono text-zinc-400">
              {distKm} km · {timeMin} min
            </span>
            <span className={`text-[9px] font-bold uppercase font-mono px-1.5 py-0.5 rounded border ${cfg.color} ${cfg.border} bg-transparent`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] font-mono text-zinc-400">
            <span>{sampleCount} samples</span>
            {segment.critical_bottleneck_count > 0 ? (
              <span className="text-rose-400 font-bold">{segment.critical_bottleneck_count} critical chokepoint(s)</span>
            ) : segment.bottleneck_count > 0 ? (
              <span className="text-amber-400">{segment.bottleneck_count} moderate</span>
            ) : (
              <span className="text-emerald-400">0 bottlenecks</span>
            )}
            {segment.max_bsi > 0 && (
              <span>Max BSI: {segment.max_bsi.toFixed(2)}</span>
            )}
          </div>
        </div>
        {needsAction && (
          <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </div>


      {/* Expanded Actions */}
      {expanded && needsAction && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-800/50 pt-2">
          {error && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-400 font-mono">
              <XCircle className="h-3.5 w-3.5" /> {error}
            </div>
          )}
          {repairResult?.success ? (
            <DiffSummary diff={repairResult.diff} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleRepair('auto_repair')}
                disabled={repairing}
                className="flex items-center gap-1.5 text-[11px] font-bold font-mono px-3 py-1.5 rounded-lg bg-amber-900/60 border border-amber-700/60 text-amber-300 hover:bg-amber-900 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                <Wrench className="h-3.5 w-3.5" />
                {repairing ? 'Repairing…' : 'Auto Repair'}
              </button>
              <button
                onClick={() => onArmAvoidPicker && onArmAvoidPicker(segment.segment_id, (coord) => handleRepair('avoid_point', coord))}
                disabled={repairing}
                className="flex items-center gap-1.5 text-[11px] font-bold font-mono px-3 py-1.5 rounded-lg bg-rose-950/60 border border-rose-700/60 text-rose-400 hover:bg-rose-950 transition-colors cursor-pointer disabled:opacity-50"
              >
                <MapPin className="h-3.5 w-3.5" />
                Avoid Point on Map
              </button>
              <button
                onClick={() => handleRepair('mark_impassable')}
                disabled={repairing}
                className="flex items-center gap-1.5 text-[11px] font-bold font-mono px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Mark Impassable
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SegmentManager({ route, disasterType = 'ALL_HAZARDS', onRouteUpdated, onArmAvoidPicker }) {
  const [collapsed, setCollapsed] = useState(false);
  const segments = route?.segments || [];

  if (!segments.length) return null;

  const viableCount = segments.filter(s => s.status === 'VIABLE').length;
  const repairCount = segments.filter(s => s.status === 'NEEDS_REPAIR').length;
  const criticalCount = segments.filter(s => s.status === 'CRITICAL').length;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden shadow-xl">
      {/* Panel Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <Layers className="h-4 w-4 text-sky-400" />
          <span className="text-[11px] font-bold font-mono text-zinc-100 uppercase tracking-wider">
            Segment Manager
          </span>
          <div className="flex items-center gap-1.5">
            {viableCount > 0 && (
              <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                {viableCount} OK
              </span>
            )}
            {repairCount > 0 && (
              <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60">
                {repairCount} Repair
              </span>
            )}
            {criticalCount > 0 && (
              <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800/60">
                {criticalCount} Critical
              </span>
            )}
          </div>
        </div>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-zinc-500" />
          : <ChevronUp className="h-4 w-4 text-zinc-500" />
        }
      </button>

      {/* Segment List */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-1.5 max-h-72 overflow-y-auto">
          {segments.map(seg => (
            <SegmentRow
              key={seg.segment_id}
              segment={seg}
              routeId={route.route_id}
              disasterType={disasterType}
              onRepaired={onRouteUpdated}
              onArmAvoidPicker={onArmAvoidPicker}
            />
          ))}
        </div>
      )}

      {/* Footer hint */}
      {!collapsed && (repairCount > 0 || criticalCount > 0) && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/40 text-[10px] font-mono text-zinc-500">
          <ArrowRightLeft className="h-3 w-3" />
          <span>Click a flagged segment to auto-repair, avoid a point on the map, or mark impassable</span>
        </div>
      )}
    </div>
  );
}
