import React, { useState } from 'react';
import { MapPin, Navigation, Search, Loader2, Plus, Minus, GripVertical, SlidersHorizontal } from 'lucide-react';

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
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-5 shadow-xl space-y-4.5 my-auto w-full">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-200 uppercase font-mono flex items-center gap-2">
          <Navigation className="h-4 w-4 text-sky-400" />
          Corridor Route Planner
        </h2>
        <button
          type="button"
          onClick={handleAddWaypoint}
          title="Add intermediate waypoint"
          className="text-[11px] font-mono text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Plus className="h-3 w-3" />
          <span>Add Stop</span>
        </button>
      </div>

      {/* Inputs Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Origin Location (A) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <label className="font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">A</span>
              <span className="text-zinc-300 uppercase tracking-wider">ORIGIN LOCATION</span>
            </label>
            <button
              type="button"
              onClick={() => setPickerMode(pickerMode === 'origin' ? null : 'origin')}
              className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-all cursor-pointer ${
                pickerMode === 'origin'
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {pickerMode === 'origin' ? 'Click map to set' : 'Pick on map'}
            </button>
          </div>
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="e.g. Asheville, NC or click map"
            className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-750 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono transition-colors shadow-inner"
            required
          />
        </div>

        {/* Waypoints (B, C, D...) */}
        {waypoints.map((wp, idx) => {
          const stopLetter = String.fromCharCode(66 + idx);
          return (
            <div
              key={idx}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              className={`space-y-1.5 transition-all rounded-lg ${
                draggedIndex === idx ? 'opacity-40 border border-dashed border-amber-500' : ''
              }`}
            >
              <div className="flex items-center justify-between text-[11px]">
                <label className="font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
                  <GripVertical className="h-3 w-3 text-zinc-500 cursor-grab" />
                  <span className="w-4 h-4 rounded bg-amber-600 text-white text-[10px] flex items-center justify-center font-bold">{stopLetter}</span>
                  <span className="text-zinc-300 uppercase tracking-wider">WAYPOINT {idx + 1}</span>
                </label>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setPickerMode(pickerMode === `waypoint_${idx}` ? null : `waypoint_${idx}`)}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-all cursor-pointer ${
                      pickerMode === `waypoint_${idx}`
                        ? 'bg-amber-950 border-amber-500 text-amber-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {pickerMode === `waypoint_${idx}` ? 'Click map to set' : 'Pick on map'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveWaypoint(idx)}
                    title="Remove stop"
                    className="p-1 text-zinc-400 hover:text-rose-400 bg-zinc-800 border border-zinc-700 rounded transition-colors cursor-pointer"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={wp}
                onChange={(e) => handleUpdateWaypoint(idx, e.target.value)}
                placeholder={`Waypoint (${stopLetter}) location`}
                className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-750 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono transition-colors shadow-inner"
              />
            </div>
          );
        })}

        {/* Destination Location */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <label className="font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-rose-600 text-white text-[10px] flex items-center justify-center font-bold">{destLetter}</span>
              <span className="text-zinc-300 uppercase tracking-wider">DESTINATION</span>
            </label>
            <button
              type="button"
              onClick={() => setPickerMode(pickerMode === 'destination' ? null : 'destination')}
              className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-all cursor-pointer ${
                pickerMode === 'destination'
                  ? 'bg-rose-950 border-rose-500 text-rose-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {pickerMode === 'destination' ? 'Click map to set' : 'Pick on map'}
            </button>
          </div>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Charlotte, NC or click map"
            className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-750 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono transition-colors shadow-inner"
            required
          />
        </div>

        {/* Sampling Interval Selector */}
        <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/80">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
            <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500" />
            <span>Sample Density</span>
          </div>
          <select
            value={sampleInterval}
            onChange={(e) => setSampleInterval(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-750 rounded px-2.5 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            <option value={250}>250m (High resolution)</option>
            <option value={500}>500m (Standard)</option>
            <option value={1000}>1000m (Sparse)</option>
          </select>
        </div>

        {/* Evacuation Capabilities Info Box */}
        <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg text-[11px] space-y-1 font-mono text-zinc-400">
          <div className="flex items-center justify-between text-sky-400 font-bold text-[10px] uppercase tracking-wider">
            <span>ACTIVE TERRAIN & HAZARD ENGINE</span>
            <span className="text-[9px] bg-sky-950 text-sky-300 px-1.5 py-0.2 rounded border border-sky-800">READY</span>
          </div>
          <p className="text-[10px] text-zinc-400 font-sans leading-relaxed">
            Samples corridors every {sampleInterval}m against Open-Meteo elevation maps, 618k FHWA bridges, & Mireye physical hazard facts.
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !origin.trim() || !destination.trim()}
          className="w-full py-3 px-4 bg-zinc-100 hover:bg-white text-zinc-900 disabled:bg-zinc-800 disabled:text-zinc-500 font-mono font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-zinc-900" />
              <span>Analyzing Corridors...</span>
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              <span>Evaluate Evacuation Corridors</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
