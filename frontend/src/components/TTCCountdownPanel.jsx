import React, { useState, useEffect } from 'react';
import { Timer, AlertTriangle, ShieldAlert, ArrowRight, Wind, Flame } from 'lucide-react';

export default function TTCCountdownPanel({ timeCutoff, disasterType = 'WILDFIRE' }) {
  if (!timeCutoff || !timeCutoff.time_to_cutoff_min) return null;

  const [secondsRemaining, setSecondsRemaining] = useState(
    Math.round(timeCutoff.time_to_cutoff_min * 60)
  );

  useEffect(() => {
    setSecondsRemaining(Math.round(timeCutoff.time_to_cutoff_min * 60));
  }, [timeCutoff]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isImminent = minutes < 30;
  const isCritical = minutes < 60;

  const urgencyColor = isImminent
    ? 'text-rose-400 bg-rose-950/80 border-rose-600'
    : isCritical
    ? 'text-amber-400 bg-amber-950/80 border-amber-600'
    : 'text-yellow-400 bg-yellow-950/80 border-yellow-700';

  const pulseRing = isImminent ? 'animate-pulse' : '';

  return (
    <div className="bg-zinc-900/90 border border-rose-900/70 rounded-xl p-4 shadow-xl space-y-3 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <Timer className="h-4 w-4 text-rose-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-rose-200">
            {timeCutoff.hazard_label || 'Time-to-Cutoff (TTC)'}
          </h3>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${urgencyColor} ${pulseRing}`}>
          {timeCutoff.urgency_level}
        </span>

      </div>

      {/* Countdown Display */}
      <div className="bg-zinc-950/90 border border-zinc-800/80 rounded-lg p-3 flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-[10px] text-zinc-400 uppercase font-mono block">
            Corridor Intercept Window
          </span>
          <div className="flex items-baseline space-x-2">
            <span className={`text-2xl font-black font-mono tracking-tight ${isImminent ? 'text-rose-400' : isCritical ? 'text-amber-400' : 'text-yellow-300'}`}>
              {formattedTime}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">mm:ss</span>
          </div>
        </div>

        <div className="text-right space-y-0.5">
          <span className="text-[10px] text-zinc-400 uppercase font-mono block">
            Mandatory Clearance
          </span>
          <span className="text-xs font-bold text-zinc-200 font-mono">
            {timeCutoff.clearance_deadline_iso || 'Clear ASAP'}
          </span>
        </div>
      </div>

      {/* Intercept Telemetry Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="p-2 rounded bg-zinc-950/60 border border-zinc-850">
          <span className="text-[10px] text-zinc-400 block">Intercept Location</span>
          <span className="text-zinc-200 font-bold">
            Mile {(timeCutoff.intercept_distance_km * 0.621371).toFixed(1)} ({timeCutoff.intercept_distance_km} km)
          </span>
        </div>
        <div className="p-2 rounded bg-zinc-950/60 border border-zinc-850">
          <span className="text-[10px] text-zinc-400 block">Advance Velocity</span>
          <span className="text-rose-300 font-bold flex items-center gap-1">
            <Flame className="h-3 w-3 text-rose-400" />
            {timeCutoff.spread_rate_kmh} km/h front
          </span>
        </div>
      </div>

      {/* Operational Directive */}
      <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/50 text-[11px] font-sans text-rose-200/90 leading-relaxed">
        <span className="font-bold font-mono text-rose-400 block mb-0.5">
          TACTICAL EVACUATION DIRECTIVE:
        </span>
        {timeCutoff.hazard_origin_description}. Convoys deployed on this corridor must clear the mile {(timeCutoff.intercept_distance_km * 0.621371).toFixed(1)} sector before the hazard perimeter intersects the road.
      </div>
    </div>
  );
}
