import React from 'react';
import { MapPin, Navigation, Search, Loader2, Sparkles } from 'lucide-react';

const PRESET_CORRIDORS = [
  {
    name: 'San Francisco Corridor',
    origin: 'Financial District, San Francisco, CA',
    destination: 'San Francisco International Airport, CA'
  },
  {
    name: 'Los Angeles Corridor',
    origin: 'Downtown Los Angeles, CA',
    destination: 'Santa Monica Pier, CA'
  },
  {
    name: 'New York Corridor',
    origin: 'Times Square, New York, NY',
    destination: 'JFK Airport, Queens, NY'
  }
];

export default function LocationInput({
  origin,
  setOrigin,
  destination,
  setDestination,
  sampleInterval,
  setSampleInterval,
  onAnalyze,
  loading
}) {
  const handlePreset = (preset) => {
    setOrigin(preset.origin);
    setDestination(preset.destination);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (origin.trim() && destination.trim()) {
      onAnalyze();
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wider text-slate-400 uppercase font-mono flex items-center gap-2">
          <Navigation className="h-4 w-4 text-cyan-400" />
          Evacuation Corridor Parameters
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Incident Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>INCIDENT LOCATION (ORIGIN)</span>
            <span className="text-[10px] text-cyan-400/80 font-mono">Geocoded</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-400">
              <MapPin className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="e.g. New Delhi Railway Station or 28.643, 77.219"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-sans"
              required
            />
          </div>
        </div>

        {/* Destination Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>EVACUATION DESTINATION</span>
            <span className="text-[10px] text-cyan-400/80 font-mono">Geocoded</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-rose-400">
              <MapPin className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Indira Gandhi International Airport"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-sans"
              required
            />
          </div>
        </div>

        {/* Sampling Interval Selector */}
        <div className="flex items-center justify-between pt-1">
          <label className="text-xs font-medium text-slate-400">
            Physical Sampling Interval:
          </label>
          <select
            value={sampleInterval}
            onChange={(e) => setSampleInterval(Number(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded-md text-xs text-cyan-300 px-2.5 py-1 font-mono focus:outline-none focus:border-cyan-500"
          >
            <option value={250}>250 m (Dense)</option>
            <option value={500}>500 m (Standard)</option>
            <option value={1000}>1000 m (Sparse)</option>
          </select>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !origin.trim() || !destination.trim()}
          className="w-full py-3 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-cyan-600/20 flex items-center justify-center space-x-2 transition-all cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />
              <span>Generating Candidate Corridors...</span>
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              <span>ANALYZE ROUTES</span>
            </>
          )}
        </button>
      </form>

      {/* Preset Corridors */}
      <div className="pt-2 border-t border-slate-800">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-amber-400" />
          Quick Test Corridors:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_CORRIDORS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handlePreset(preset)}
              type="button"
              className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded border border-slate-700 transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
