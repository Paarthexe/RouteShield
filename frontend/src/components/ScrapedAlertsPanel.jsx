import React, { useState } from 'react';
import { Globe, Radio, ExternalLink, AlertOctagon, AlertTriangle, Info, ChevronDown, ChevronUp, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react';

const URGENCY_CONFIG = {
  CRITICAL: {
    bg: 'bg-rose-950/80',
    border: 'border-rose-700/80',
    text: 'text-rose-300',
    badge: 'bg-rose-900/90 text-rose-200 border-rose-600',
    icon: AlertOctagon,
  },
  WARNING: {
    bg: 'bg-amber-950/80',
    border: 'border-amber-700/80',
    text: 'text-amber-300',
    badge: 'bg-amber-900/90 text-amber-200 border-amber-600',
    icon: AlertTriangle,
  },
  ADVISORY: {
    bg: 'bg-sky-950/80',
    border: 'border-sky-700/80',
    text: 'text-sky-300',
    badge: 'bg-sky-900/90 text-sky-200 border-sky-600',
    icon: Info,
  },
};

export default function ScrapedAlertsPanel({ notices = [] }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasNotices = Array.isArray(notices) && notices.length > 0;
  const criticalCount = hasNotices ? notices.filter(n => n.urgency === 'CRITICAL').length : 0;
  const warningCount = hasNotices ? notices.filter(n => n.urgency === 'WARNING').length : 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-xl space-y-3 font-mono w-full shrink-0 min-h-fit box-border p-3.5">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between pb-1 hover:opacity-90 transition-opacity cursor-pointer text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex items-center justify-center">
            <Globe className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
            Live Emergency Web Dispatches ({hasNotices ? notices.length : 0})
          </h3>
          {hasNotices ? (
            <div className="flex items-center gap-1.5 ml-1">
              {criticalCount > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800/60">
                  {criticalCount} Critical
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60">
                  {warningCount} Active
                </span>
              )}
            </div>
          ) : (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60">
              Clear
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
      </button>

      {/* Notice List or Clean Status */}
      {!collapsed && (
        <div className="space-y-2.5 pt-1">
          {hasNotices ? (
            notices.map((item) => {
              const urgencyCfg = URGENCY_CONFIG[item.urgency] || URGENCY_CONFIG.ADVISORY;
              const IconComponent = urgencyCfg.icon;

              return (
                <div
                  key={item.notice_id}
                  className={`p-3 rounded-lg border ${urgencyCfg.border} ${urgencyCfg.bg} space-y-2 transition-all shadow-sm`}
                >
                  {/* Notice Top Bar */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${urgencyCfg.badge}`}>
                        {item.urgency}
                      </span>
                      <span className="text-[10px] font-bold text-zinc-300">
                        {item.hazard_category}
                      </span>
                      {item.distance_km != null && item.distance_km > 0 && (
                        <span className="text-[9px] text-zinc-400">
                          · {item.distance_km.toFixed(1)} km from corridor
                        </span>
                      )}
                    </div>
                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-zinc-400 hover:text-zinc-100 flex items-center gap-1 transition-colors shrink-0 underline"
                      >
                        <span>Official Source</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>

                  {/* Title */}
                  <div className="flex items-start gap-2">
                    <IconComponent className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${urgencyCfg.text}`} />
                    <h4 className="text-xs font-bold text-zinc-100 leading-snug">
                      {item.title}
                    </h4>
                  </div>

                  {/* Snippet / Extracted Web Content */}
                  <p className="text-[11px] text-zinc-300 font-sans leading-relaxed pl-5">
                    {item.snippet}
                  </p>

                  {/* Footer / Scrape Provenance */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 text-[9px] text-zinc-500 font-sans pl-5">
                    <span>Feed: {item.source_name}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {item.scraped_at || 'Real-time feed'}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-3 rounded-lg border border-zinc-850 bg-zinc-950/60 flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-zinc-400 text-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="font-sans text-[11px]">No active emergency dispatches or road closures currently in effect for this sector.</span>
              </div>
              <span className="text-[9px] text-zinc-500 font-mono shrink-0">NWS & USGS Online</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
