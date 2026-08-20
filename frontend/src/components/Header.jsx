import React from 'react';
import { Shield, Navigation, Layers } from 'lucide-react';

export default function Header() {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/90 px-6 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
      <div className="flex items-center space-x-3">
        <div className="h-10 w-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm shadow-cyan-500/20">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-extrabold tracking-wider text-slate-100 font-mono uppercase">
              ROUTESHIELD
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded">
              Agentic Evacuation Intelligence
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Hazard-Infrastructure Bottleneck Detection & Resilient Corridor Selection
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="hidden md:flex items-center space-x-2 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-md border border-slate-700/50">
          <Layers className="h-3.5 w-3.5 text-cyan-400" />
          <span>Engine: <strong className="text-slate-200 font-mono">OSRM + Mireye + NBI Agent</strong></span>
        </div>
      </div>
    </header>
  );
}
