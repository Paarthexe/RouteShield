import React, { useState } from 'react';
import { MapPin, Navigation, Search, Loader2, Sparkles, Plus, Minus, GripVertical } from 'lucide-react';

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
  waypoints = [],
  setWaypoints,
  sampleInterval,
  setSampleInterval,
  onAnalyze,
  loading,
  pickerMode,
  setPickerMode
}) {
  const [draggedIndex, setDraggedIndex] = useState(null);

  const handlePreset = (preset) => {
    setOrigin(preset.origin);
    setDestination(preset.destination);
    if (setWaypoints) setWaypoints([]);
  };

  const handleAddWaypoint = () => {
    setWaypoints([...waypoints, '']);
  };

  const handleUpdateWaypoint = (index, value) => {
    const updated = [...waypoints];
    updated[index] = value;
    setWaypoints(updated);
  };

  const handleRemoveWaypoint = (index) => {
    const updated = waypoints.filter((_, i) => i !== index);
    setWaypoints(updated);
    if (pickerMode === `waypoint_${index}`) {
      setPickerMode(null);
    }
  };

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', index);
    setDraggedIndex(index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(fromIndex) && fromIndex !== targetIndex) {
      const updated = [...waypoints];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(targetIndex, 0, moved);
      setWaypoints(updated);
    }
    setDraggedIndex(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (origin.trim() && destination.trim()) {
      onAnalyze();
    }
  };

  const destLetter = String.fromCharCode(66 + waypoints.length);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wider text-slate-400 uppercase font-mono flex items-center gap-2">
          <Navigation className="h-4 w-4 text-cyan-400" />
          Evacuation Corridor Parameters
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Incident Location (A) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">A</span>
              <span>INCIDENT LOCATION (ORIGIN)</span>
            </label>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => setPickerMode(pickerMode === 'origin' ? null : 'origin')}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded border flex items-center space-x-1 transition-all cursor-pointer ${
                  pickerMode === 'origin'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 animate-pulse'
                    : 'bg-slate-800 border-slate-700 text-emerald-400 hover:text-emerald-300 hover:bg-slate-750'
                }`}
              >
                <MapPin className="h-3 w-3" />
                <span>{pickerMode === 'origin' ? 'Click Map Point...' : 'Pick on map'}</span>
              </button>
              <button
                type="button"
                onClick={handleAddWaypoint}
                title="Add intermediate stop"
                className="p-1 text-amber-400 hover:text-amber-300 bg-slate-800 border border-slate-700 rounded hover:border-amber-500/50 transition-colors cursor-pointer flex items-center space-x-1 text-[11px] font-semibold px-2"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Stop</span>
              </button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-400">
              <MapPin className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="e.g. Asheville, NC or click 'Pick on map'"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-sans"
              required
            />
          </div>
        </div>

        {/* Intermediate Waypoints / Stops (B, C, D...) */}
        {waypoints.map((wp, idx) => {
          const stopLetter = String.fromCharCode(66 + idx);
          return (
            <div
              key={idx}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              className={`space-y-1.5 transition-all rounded-lg p-1 ${
                draggedIndex === idx ? 'opacity-40 border border-dashed border-amber-500' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <GripVertical className="h-3.5 w-3.5 text-slate-500 cursor-grab hover:text-slate-300 transition-colors" />
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">{stopLetter}</span>
                  <span>INTERMEDIATE STOP {idx + 1}</span>
                </label>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setPickerMode(pickerMode === `waypoint_${idx}` ? null : `waypoint_${idx}`)}
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded border flex items-center space-x-1 transition-all cursor-pointer ${
                      pickerMode === `waypoint_${idx}`
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 animate-pulse'
                        : 'bg-slate-800 border-slate-700 text-amber-400 hover:text-amber-300'
                    }`}
                  >
                    <MapPin className="h-3 w-3" />
                    <span>{pickerMode === `waypoint_${idx}` ? 'Click Map Point...' : 'Pick on map'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveWaypoint(idx)}
                    title="Remove stop"
                    className="p-1 text-slate-400 hover:text-rose-400 bg-slate-800 border border-slate-700 rounded hover:border-rose-500/50 transition-colors cursor-pointer"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-amber-400">
                  <MapPin className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={wp}
                  onChange={(e) => handleUpdateWaypoint(idx, e.target.value)}
                  placeholder={`Stop (${stopLetter}) location or click 'Pick on map'`}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-sans"
                />
              </div>
            </div>
          );
        })}

        {/* Destination Location (E/D/C) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">{destLetter}</span>
              <span>EVACUATION DESTINATION</span>
            </label>
            <button
              type="button"
              onClick={() => setPickerMode(pickerMode === 'destination' ? null : 'destination')}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded border flex items-center space-x-1 transition-all cursor-pointer ${
                pickerMode === 'destination'
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                  : 'bg-slate-800 border-slate-700 text-rose-400 hover:text-rose-300 hover:bg-slate-750'
              }`}
            >
              <MapPin className="h-3 w-3" />
              <span>{pickerMode === 'destination' ? 'Click Map Point...' : 'Pick on map'}</span>
            </button>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-rose-400">
              <MapPin className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Charlotte, NC or click 'Pick on map'"
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
