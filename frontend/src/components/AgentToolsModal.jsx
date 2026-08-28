import React, { useState } from 'react';
import { X, Cpu, Table, Network, GitBranch, Zap, Database, Shield, Clock, AlertTriangle, ChevronRight } from 'lucide-react';

const PIPELINE_STAGES = [
  { id: 1, icon: Network, label: 'OSRM Route Generator', desc: 'Generates 1–5 candidate polylines via OpenStreetMap routing', latency: '~200ms', source: 'OSRM (local)' },
  { id: 2, icon: GitBranch, label: 'Physical Sampler', desc: 'Interpolates RouteSamples at 500m intervals along each polyline', latency: '<5ms', source: 'Internal' },
  { id: 3, icon: Database, label: 'NBI Bridge Fetcher', desc: 'Queries FHWA National Bridge Inventory SQLite (600k+ structures)', latency: '10–40ms', source: 'FHWA NBI' },
  { id: 4, icon: Zap, label: 'Mireye Hazard Fetcher', desc: 'Fetches real-time hazard_score ∈ [0,1] per sample point (US-only)', latency: '80–150ms', source: 'Mireye API' },
  { id: 5, icon: Shield, label: 'Bottleneck Detector', desc: 'Computes BSI score per sample; labels Critical / Warning / Moderate', latency: '<5ms', source: 'Internal' },
  { id: 6, icon: GitBranch, label: 'Segmentation Engine', desc: 'Partitions route into ~4km segments; assigns VIABLE / NEEDS_REPAIR / CRITICAL', latency: '<5ms', source: 'Internal' },
  { id: 7, icon: Shield, label: 'Viability Assessor', desc: 'Applies rejection gates (BSI≥2.0, density≥35%, hazard>60%); scores 0–100', latency: '<2ms', source: 'Internal' },
  { id: 8, icon: Cpu, label: 'Decision Engine', desc: 'Ranks corridors; selects PRIMARY + BACKUP; generates trade-off narrative', latency: '<5ms', source: 'Internal' },
];

const REJECTION_GATES = [
  {
    gate: 'Catastrophic BSI',
    threshold: 'Any single bottleneck BSI ≥ 2.0',
    desc: 'A single structural failure point makes the entire corridor impassable',
    color: 'text-rose-400',
    bg: 'bg-rose-950/40',
    border: 'border-rose-800/60',
  },
  {
    gate: 'Critical Density',
    threshold: '≥ 35% of samples are Critical + ≥ 2 critical bottlenecks',
    desc: 'Distributed criticality means the corridor fabric itself is compromised',
    color: 'text-amber-400',
    bg: 'bg-amber-950/40',
    border: 'border-amber-800/60',
  },
  {
    gate: 'Severe Hazard Exposure',
    threshold: '> 60% of samples have hazard_score > 0.5',
    desc: 'Over half the route traverses actively hazardous terrain',
    color: 'text-orange-400',
    bg: 'bg-orange-950/40',
    border: 'border-orange-800/60',
  },
];

const TOOL_TABLE = [
  { tool: 'OSRM Route Generator', input: 'Origin, Destination', output: 'GeoJSON LineString', failure: 'Single route fallback' },
  { tool: 'Physical Sampler', input: 'LineString, interval_m', output: 'RouteSample[]', failure: 'Empty if single point' },
  { tool: 'NBI Bridge Fetcher', input: 'Lat/Lon per sample', output: 'NBIBridge[]', failure: 'Returns [] out-of-bounds' },
  { tool: 'Mireye Hazard Fetcher', input: 'Lat/Lon per sample', output: 'hazard_score [0–1]', failure: 'Falls back to 0.0' },
  { tool: 'Bottleneck Detector', input: 'RouteSample[] enriched', output: 'BottleneckInfo[]', failure: 'Empty below threshold' },
  { tool: 'Segmentation Engine', input: 'Route + samples', output: 'RouteSegment[]', failure: 'Single segment fallback' },
  { tool: 'Viability Assessor', input: 'Route, fastest_duration_s', output: 'ViabilityAssessment', failure: 'Always produces result' },
  { tool: 'Decision Engine', input: 'All routes + viability', output: 'AgentDecision', failure: 'REJECTED-only set' },
  { tool: 'Segment Repair Engine', input: 'route_id, segment_id, action', output: 'SegmentRepairResponse', failure: 'Falls back to original geometry' },
  { tool: 'Live Monitor (SSE)', input: 'route_id, sample_id', output: 'SSE event stream', failure: 'Stops on client disconnect' },
];

function Tab({ id, label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold font-mono uppercase tracking-wide rounded-t-lg border-b-2 transition-colors cursor-pointer ${
        active
          ? 'text-sky-300 border-sky-400 bg-zinc-900'
          : 'text-zinc-500 border-transparent hover:text-zinc-300'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export default function AgentToolsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('pipeline');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-sky-950 border border-sky-800 flex items-center justify-center">
              <Cpu className="h-4 w-4 text-sky-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-widest">
                Agent Tools & Architecture
              </h2>
              <p className="text-[11px] text-zinc-400 font-mono">
                Multi-stage agentic decision pipeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-end gap-1 px-6 pt-3 border-b border-zinc-800 bg-zinc-950 shrink-0">
          <Tab id="pipeline" label="Pipeline" icon={GitBranch} active={activeTab === 'pipeline'} onClick={setActiveTab} />
          <Tab id="tools" label="Tool Reference" icon={Table} active={activeTab === 'tools'} onClick={setActiveTab} />
          <Tab id="gates" label="Rejection Gates" icon={AlertTriangle} active={activeTab === 'gates'} onClick={setActiveTab} />
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">

          {/* Pipeline Tab */}
          {activeTab === 'pipeline' && (
            <div className="p-6 space-y-3">
              <p className="text-[12px] text-zinc-400 font-mono mb-4">
                Each analysis runs the full pipeline sequentially. Stages 3a–3c (NBI, Mireye, DEM) execute in parallel per corridor.
              </p>
              {PIPELINE_STAGES.map((stage, i) => {
                const Icon = stage.icon;
                return (
                  <div key={stage.id} className="flex items-start gap-3">
                    {/* Connector */}
                    <div className="flex flex-col items-center">
                      <div className="h-7 w-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                        <Icon className="h-3.5 w-3.5 text-sky-400" />
                      </div>
                      {i < PIPELINE_STAGES.length - 1 && (
                        <div className="w-px h-4 bg-zinc-700 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-bold text-zinc-100 font-mono">{stage.label}</span>
                        <span className="text-[9px] font-mono text-zinc-500 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />{stage.latency}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400">
                          {stage.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{stage.desc}</p>
                    </div>
                  </div>
                );
              })}

              {/* SSE + Repair addendum */}
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <p className="text-[10px] text-zinc-500 font-mono uppercase font-bold mb-2">Post-Dispatch Tools</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                    <p className="text-[11px] font-bold text-sky-400 font-mono">Live Monitor (SSE)</p>
                    <p className="text-[10px] text-zinc-400 font-mono mt-1">Continuous re-probing via Server-Sent Events. Emits status_update, severity_changed, corridor_alert, heartbeat.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                    <p className="text-[11px] font-bold text-amber-400 font-mono">Segment Repair Engine</p>
                    <p className="text-[10px] text-zinc-400 font-mono mt-1">Human-in-the-loop local sub-corridor repair via OSRM alternatives. Returns geometry diff and viability delta.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tools Table Tab */}
          {activeTab === 'tools' && (
            <div className="p-6">
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="bg-zinc-900 border-b border-zinc-800">
                      <th className="text-left px-3 py-2 text-zinc-400 font-bold uppercase tracking-wider w-[32%]">Tool</th>
                      <th className="text-left px-3 py-2 text-zinc-400 font-bold uppercase tracking-wider w-[22%]">Input</th>
                      <th className="text-left px-3 py-2 text-zinc-400 font-bold uppercase tracking-wider w-[22%]">Output</th>
                      <th className="text-left px-3 py-2 text-zinc-400 font-bold uppercase tracking-wider">Failure Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOOL_TABLE.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors ${
                          i % 2 === 0 ? 'bg-transparent' : 'bg-zinc-900/20'
                        }`}
                      >
                        <td className="px-3 py-2.5 text-zinc-100 font-bold">{row.tool}</td>
                        <td className="px-3 py-2.5 text-zinc-400">{row.input}</td>
                        <td className="px-3 py-2.5 text-sky-400">{row.output}</td>
                        <td className="px-3 py-2.5 text-zinc-500">{row.failure}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rejection Gates Tab */}
          {activeTab === 'gates' && (
            <div className="p-6 space-y-4">
              <p className="text-[12px] text-zinc-400 font-mono">
                Gates are evaluated <strong className="text-zinc-200">in order</strong> before viability scoring. A route failing any gate is marked <span className="text-rose-400 font-bold">REJECTED</span> and excluded from PRIMARY/BACKUP candidacy.
              </p>
              {REJECTION_GATES.map((gate, i) => (
                <div key={i} className={`rounded-xl border p-4 ${gate.bg} ${gate.border}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-bold font-mono text-zinc-500 uppercase">Gate {i + 1}</span>
                    <AlertTriangle className={`h-3.5 w-3.5 ${gate.color}`} />
                    <span className={`text-[13px] font-bold font-mono ${gate.color}`}>{gate.gate}</span>
                  </div>
                  <div className={`flex items-start gap-2 text-[11px] font-mono px-3 py-2 rounded-lg bg-zinc-950/60 border ${gate.border} mb-2`}>
                    <ChevronRight className={`h-3 w-3 shrink-0 mt-0.5 ${gate.color}`} />
                    <span className="text-zinc-200">{gate.threshold}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">{gate.desc}</p>
                </div>
              ))}

              <div className="mt-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                <p className="text-[11px] font-bold font-mono text-zinc-200 mb-2">Recommended Corridor Label</p>
                <p className="text-[11px] text-zinc-400 font-mono">
                  The PRIMARY route is always labeled <span className="text-emerald-400 font-bold">"Recommended Corridor"</span> in the UI — not "Fastest Evacuation Corridor". The fastest route by travel time may still have bottlenecks, so the trade-off narrative will explicitly acknowledge them.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-800 bg-zinc-900/60 shrink-0">
          <a
            href="/docs/AGENT_TOOLS.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-sky-400 hover:text-sky-300 font-mono transition-colors"
          >
            View full AGENT_TOOLS.md →
          </a>
          <button
            onClick={onClose}
            className="text-[11px] font-bold font-mono px-4 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
