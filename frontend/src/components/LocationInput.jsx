import React, { useState } from 'react';
import { MapPin, Navigation, Search, Loader2, Plus, Minus, GripVertical, SlidersHorizontal, ShieldAlert } from 'lucide-react';

const DISASTER_MODES = [
  { id: 'ALL_HAZARDS', label: 'All Hazards', desc: 'Composite multi-hazard risk model' },
  { id: 'WILDFIRE', label: 'Wildfire', desc: 'Prioritizes fire perimeters, CAL FIRE zones and wind' },
  { id: 'FLOOD_HURRICANE', label: 'Flood / Surge', desc: 'Prioritizes FEMA floodplains, low elevations and scour' },
  { id: 'EARTHQUAKE', label: 'Earthquake', desc: 'Prioritizes seismic PGA and bridge structure ratings' },
  { id: 'LANDSLIDE', label: 'Landslide', desc: 'Prioritizes slope gradients and USGS susceptibility' },
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
  disasterType = 'ALL_HAZARDS',
  setDisasterType,
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
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase font-mono flex items-center gap-2">
          <Navigation className="h-3.5 w-3.5 text-sky-400" />
          Corridor Route Planner
        </h2>
        <button
          type="button"
          onClick={handleAddWaypoint}
          title="Add intermediate waypoint"
          className="text-[11px] font-mono text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Plus className="h-3 w-3" />
          <span>Add Stop</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Disaster Mode Selector */}
        <div className="space-y-1.5 pb-1">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-400 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-amber-400" />
              <span>DISASTER PROTOCOL</span>
            </span>
            <span className="text-[10px] text-zinc-500">
              {DISASTER_MODES.find(m => m.id === disasterType)?.label || 'All Hazards'}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {DISASTER_MODES.map((mode) => {
              const active = disasterType === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setDisasterType(mode.id)}
                  title={mode.desc}
                  className={`py-1.5 px-1 rounded text-center font-mono text-[10px] transition-all cursor-pointer border ${
                    active
                      ? 'bg-sky-950 border-sky-500 text-sky-200 font-bold shadow-sm'
                      : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80'
                  }`}
                >
                  <span className="block truncate">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Origin Location (A) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <label className="font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">A</span>
              <span className="text-zinc-400">ORIGIN</span>
            </label>
            <button
              type="button"
              onClick={() => setPickerMode(pickerMode === 'origin' ? null : 'origin')}
              className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-all cursor-pointer ${
                pickerMode === 'origin'
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-750'
              }`}
            >
              {pickerMode === 'origin' ? 'Click map to set' : 'Pick on map'}
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="e.g. Asheville, NC or click map"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-750 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono transition-colors"
              required
            />
          </div>
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
              className={`space-y-1 transition-all rounded-lg ${
                draggedIndex === idx ? 'opacity-40 border border-dashed border-amber-500' : ''
              }`}
            >
              <div className="flex items-center justify-between text-[11px]">
                <label className="font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
                  <GripVertical className="h-3 w-3 text-zinc-500 cursor-grab" />
                  <span className="w-4 h-4 rounded bg-amber-600 text-white text-[10px] flex items-center justify-center font-bold">{stopLetter}</span>
                  <span className="text-zinc-400">WAYPOINT {idx + 1}</span>
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
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-750 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono transition-colors"
              />
            </div>
          );
        })}

        {/* Destination Location */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <label className="font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-rose-600 text-white text-[10px] flex items-center justify-center font-bold">{destLetter}</span>
              <span className="text-zinc-400">DESTINATION</span>
            </label>
            <button
              type="button"
              onClick={() => setPickerMode(pickerMode === 'destination' ? null : 'destination')}
              className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-all cursor-pointer ${
                pickerMode === 'destination'
                  ? 'bg-rose-950 border-rose-500 text-rose-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-750'
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
            className="w-full px-3 py-2 bg-zinc-950 border border-zinc-750 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono transition-colors"
            required
          />
        </div>

        {/* Sampling Interval Selector */}
        <div className="space-y-1 pt-1 border-t border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
              <SlidersHorizontal className="h-3 w-3 text-zinc-500" />
              <span>Sample Density</span>
            </div>
            <select
              value={sampleInterval}
              onChange={(e) => setSampleInterval(Number(e.target.value))}
              className="bg-zinc-950 border border-zinc-750 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-sky-500"
            >
              <option value={250}>250m (4 probes/km - High Res)</option>
              <option value={500}>500m (2 probes/km - Standard)</option>
              <option value={1000}>1000m (1 probe/km - Fast)</option>
            </select>
          </div>
          <p className="text-[10px] text-zinc-500 font-mono text-right">
            {sampleInterval === 250 ? 'Deep micro-terrain & bridge scan' : sampleInterval === 500 ? 'Standard balanced disaster reconnaissance' : 'Rapid corridor baseline scan'}
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !origin.trim() || !destination.trim()}
          className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-white text-zinc-900 disabled:bg-zinc-800 disabled:text-zinc-500 font-mono font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center space-x-2 transition-all cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-900" />
              <span>Evaluating Corridors...</span>
            </>
          ) : (
            <>
              <Search className="h-3.5 w-3.5" />
              <span>Evaluate Corridors</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

