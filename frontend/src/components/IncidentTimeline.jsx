import React, { useState } from 'react';
import { History, ChevronDown, ChevronUp, Flame, Waves, ShieldAlert, CloudRain } from 'lucide-react';

const INCIDENT_ICONS = {
  Wildfire: Flame,
  Fire: Flame,
  Flood: Waves,
  Landslide: ShieldAlert,
  'Severe Storm': CloudRain,
};

export default function IncidentTimeline({ incidents = [] }) {
  const [expanded, setExpanded] = useState(false);

  if (!incidents || incidents.length === 0) return null;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-3 font-mono">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <History className="h-4 w-4 text-purple-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            Historical Regional Incidents & FEMA Declarations
          </h3>
        </div>
        <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
          {incidents.length} Recorded
        </span>
      </div>

      <div className="space-y-2">
        {incidents.slice(0, expanded ? incidents.length : 2).map((inc, i) => {
          const Icon = INCIDENT_ICONS[inc.incident_type] || ShieldAlert;
          return (
            <div key={i} className="flex items-start space-x-2.5 p-2 bg-zinc-950/70 rounded-lg border border-zinc-850">
              <div className="p-1 rounded bg-purple-950/80 border border-purple-800/80 text-purple-300 shrink-0 mt-0.5">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold text-purple-300 bg-purple-950 px-1.5 py-0.2 rounded border border-purple-900">
                    {inc.year}
                  </span>
                  <span className="text-xs font-bold text-zinc-200 truncate">{inc.incident_type}</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug font-sans">{inc.title}</p>
              </div>
            </div>
          );
        })}
      </div>

      {incidents.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center space-x-1 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <span>{expanded ? 'Show Less' : `View All ${incidents.length} Historical Events`}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
