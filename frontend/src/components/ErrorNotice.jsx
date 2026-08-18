import React from 'react';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';

export default function ErrorNotice({ message, onRetry, type = 'error' }) {
  if (!message) return null;

  const isWarning = type === 'warning';

  return (
    <div
      className={`p-4 rounded-xl border flex items-start space-x-3 text-xs shadow-lg transition-all ${
        isWarning
          ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
          : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
      }`}
    >
      {isWarning ? (
        <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
      )}

      <div className="flex-1 space-y-1">
        <h4 className="font-bold uppercase tracking-wider font-mono">
          {isWarning ? 'Corridor Notice' : 'Routing Service Notice'}
        </h4>
        <p className="leading-relaxed font-sans">{message}</p>
        
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-[11px] font-semibold bg-rose-900/50 hover:bg-rose-800/60 text-rose-100 px-3 py-1 rounded border border-rose-700/60 flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Try Again</span>
          </button>
        )}
      </div>
    </div>
  );
}
