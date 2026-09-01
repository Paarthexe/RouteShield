import React from 'react';
import { Shield, Activity, Database, GitBranch, Info } from 'lucide-react';

export default function Header({ onOpenAgentTools }) {
  return (
    <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/90 px-5 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
      <div className="flex items-center space-x-3">
        <div className="h-8 w-8 rounded-md bg-zinc-900 border border-zinc-700/60 flex items-center justify-center text-sky-400 shadow-sm">
          <Shield className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-sm font-bold tracking-wider text-zinc-100 font-mono uppercase">
              ROUTESHIELD
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-zinc-900 text-zinc-300 border border-zinc-700/60 rounded">
              Evidence &rarr; Resilience &rarr; Decision
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-medium">
            Evacuation resilience analysis workspace
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3 text-xs text-zinc-400">
        <div className="hidden sm:flex items-center space-x-1.5 bg-zinc-900/80 px-2.5 py-1 rounded border border-zinc-800 text-[11px] font-mono">
          <Database className="h-3 w-3 text-zinc-400" />
          <span className="text-zinc-300">FHWA NBI</span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-300">Mireye</span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-300">Open-Meteo Weather & DEM</span>
        </div>

        {/* Agent Tools Button */}
        <button
          onClick={onOpenAgentTools}
          title="View Agent Tools & Architecture"
          className="flex items-center gap-1.5 bg-sky-950/60 border border-sky-800/60 px-2.5 py-1 rounded text-[11px] font-mono text-sky-400 hover:bg-sky-950 hover:text-sky-300 transition-colors cursor-pointer"
        >
          <Info className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Agent Tools</span>
        </button>


      </div>
    </header>
  );
}
