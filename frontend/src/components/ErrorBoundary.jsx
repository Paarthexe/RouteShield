import React from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("RouteShield UI Crash Boundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-zinc-100 font-sans">
          <div className="max-w-md w-full bg-zinc-900 border border-rose-800/80 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertOctagon className="h-7 w-7 shrink-0" />
              <h2 className="text-lg font-bold">RouteShield Interface Alert</h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed font-mono">
              An unexpected UI state interruption occurred while rendering geospatial telemetry.
            </p>
            {this.state.error && (
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-[11px] font-mono text-rose-300 break-all">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reload Tactical Console</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
