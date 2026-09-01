import React, { useEffect, useRef, useState } from 'react';
import { X, Activity, AlertTriangle, CheckCircle2, Radio, Zap, Shield } from 'lucide-react';

const SEVERITY_CONFIG = {
  ok: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/60',
    border: 'border-emerald-800/60',
    dot: 'bg-emerald-400',
    icon: CheckCircle2,
    label: 'NOMINAL',
  },
  warning: {
    color: 'text-amber-400',
    bg: 'bg-amber-950/60',
    border: 'border-amber-800/60',
    dot: 'bg-amber-400',
    icon: AlertTriangle,
    label: 'ELEVATED',
  },
  critical: {
    color: 'text-rose-400',
    bg: 'bg-rose-950/60',
    border: 'border-rose-800/60',
    dot: 'bg-rose-500',
    icon: Zap,
    label: 'CRITICAL',
  },
};

const EVENT_LABELS = {
  status_update: 'STATUS',
  severity_changed: 'SEVERITY',
  corridor_alert: 'ALERT',
  heartbeat: 'HEARTBEAT',
};

function EventEntry({ event }) {
  const sev = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG.ok;
  const Icon = sev.icon;
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${sev.bg} ${sev.border}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${sev.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-bold font-mono uppercase ${sev.color}`}>
            {EVENT_LABELS[event.type] || event.type}
          </span>
          <span className="text-[9px] font-mono text-zinc-500">{time}</span>
        </div>
        <p className={`text-[11px] font-mono leading-snug mt-0.5 ${sev.color === 'text-emerald-400' ? 'text-zinc-300' : sev.color}`}>
          {event.message}
        </p>
      </div>
    </div>
  );
}

export default function LiveMonitorHUD({ routeId, disasterType = 'ALL_HAZARDS', currentSampleId = null, onClose }) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [currentSeverity, setCurrentSeverity] = useState('ok');
  const [tickCount, setTickCount] = useState(0);
  const esRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (!routeId) return;

    const params = new URLSearchParams({ disaster_type: disasterType });
    if (currentSampleId) params.set('current_sample_id', currentSampleId);

    const url = `/api/routes/${routeId}/live?${params}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    const handleEvent = (e) => {
      try {
        const data = JSON.parse(e.data);
        const normSev = (data.severity_level || data.severity || 'LOW').toLowerCase();
        const mappedSev = normSev === 'critical' ? 'critical' : normSev === 'moderate' || normSev === 'warning' ? 'warning' : 'ok';
        
        setEvents(prev => [
          {
            ...data,
            severity: mappedSev,
            type: data.event_type || e.type || 'status_update'
          },
          ...prev
        ].slice(0, 50));
        
        setCurrentSeverity(mappedSev);
        setTickCount(n => n + 1);
      } catch (_) {}
    };

    es.onmessage = handleEvent;
    es.addEventListener('status_update', handleEvent);
    es.addEventListener('severity_changed', handleEvent);
    es.addEventListener('corridor_alert', handleEvent);
    es.addEventListener('heartbeat', handleEvent);

    es.onerror = () => {
      setConnected(false);
    };


    return () => {
      es.close();
      setConnected(false);
    };
  }, [routeId, disasterType, currentSampleId]);

  // Scroll log to top when new events arrive
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [events.length]);

  const sev = SEVERITY_CONFIG[currentSeverity] || SEVERITY_CONFIG.ok;
  const StatusIcon = sev.icon;

  return (
    <div className={`rounded-xl border shadow-xl transition-all w-full shrink-0 min-h-fit box-border overflow-hidden ${sev.border} bg-zinc-950`}>
      {/* HUD Header */}

      <div className={`flex items-center justify-between px-4 py-2.5 ${sev.bg} border-b ${sev.border}`}>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Radio className={`h-4 w-4 ${sev.color}`} />
            {connected && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 border border-zinc-950 animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold font-mono text-zinc-100 uppercase tracking-widest">
                Live Monitor
              </span>
              <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${sev.bg} ${sev.color} ${sev.border}`}>
                {sev.label}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono">
              {routeId?.toUpperCase().replace('_', ' ')} · {connected ? `${tickCount} events` : 'connecting…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-5 w-5 ${sev.color}`} />
          {onClose && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Severity Pulse Banner */}
      {currentSeverity !== 'ok' && (
        <div className={`flex items-center gap-2 px-4 py-2 ${sev.bg}`}>
          <span className={`h-2 w-2 rounded-full ${sev.dot} animate-ping`} />
          <span className={`text-[11px] font-bold font-mono uppercase ${sev.color}`}>
            {currentSeverity === 'critical'
              ? '⚠ Corridor condition degraded — consider segment repair'
              : '⚡ Elevated hazard detected on route ahead'}
          </span>
        </div>
      )}

      {/* Event Log */}
      <div
        ref={logRef}
        className="max-h-56 overflow-y-auto p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800"
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-zinc-600 text-[11px] font-mono gap-2">
            <Activity className="h-5 w-5 animate-pulse" />
            <span>Awaiting live corridor events…</span>
          </div>
        ) : (
          events.map((ev, i) => <EventEntry key={i} event={ev} />)
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/60 bg-zinc-900/60">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <Shield className="h-3 w-3" />
          <span>Real-time re-probe · {disasterType}</span>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-mono ${connected ? 'text-emerald-400' : 'text-zinc-600'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span>{connected ? 'SSE LIVE' : 'OFFLINE'}</span>
        </div>
      </div>
    </div>
  );
}
