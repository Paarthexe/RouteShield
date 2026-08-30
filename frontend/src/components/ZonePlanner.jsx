import React, { useState } from 'react';
import { Layers, Plus, Trash2, Navigation, Play, CheckCircle2, ShieldAlert, Users, Clock } from 'lucide-react';
import { planZoneEvacuation } from '../services/api';

export default function ZonePlanner({ disasterType, vehicleProfile }) {
  const [zones, setZones] = useState([
    { zone_id: 'Zone A (North Ridge)', center: { latitude: 39.7596, longitude: -121.6219 }, radius_km: 8.0, estimated_population: 8500 },
    { zone_id: 'Zone B (East Valley)', center: { latitude: 39.7200, longitude: -121.5800 }, radius_km: 6.0, estimated_population: 5200 },
  ]);

  const [destinations, setDestinations] = useState([
    { label: 'Chico Municipal Shelter Depot', coord: { latitude: 39.7285, longitude: -121.8375 } },
    { label: 'Oroville Regional Staging Base', coord: { latitude: 39.5138, longitude: -121.5564 } },
  ]);

  const [planResult, setPlanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAddZone = () => {
    const num = zones.length + 1;
    setZones([
      ...zones,
      {
        zone_id: `Zone ${String.fromCharCode(64 + num)} (Sector ${num})`,
        center: { latitude: 39.7000, longitude: -121.6000 },
        radius_km: 5.0,
        estimated_population: 4000
      }
    ]);
  };

  const handleRemoveZone = (idx) => {
    setZones(zones.filter((_, i) => i !== idx));
  };

  const handleRunPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        zones: zones.map(z => ({
          zone_id: z.zone_id,
          center: z.center,
          radius_km: z.radius_km,
          estimated_population: z.estimated_population
        })),
        destinations: destinations.map(d => d.coord),
        destination_labels: destinations.map(d => d.label),
        disaster_type: disasterType,
        vehicle_profile: vehicleProfile
      };
      const res = await planZoneEvacuation(payload);
      setPlanResult(res);
    } catch (err) {
      setError(err.message || 'Failed to compute zone allocation plan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 font-mono">
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              Multi-Origin Zone Evacuation Allocator
            </h2>
          </div>
          <button
            onClick={handleAddZone}
            className="flex items-center space-x-1 py-1 px-2.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded text-xs text-zinc-300 transition-colors cursor-pointer"
          >
            <Plus className="h-3 w-3" />
            <span>Add Hazard Sector</span>
          </button>
        </div>

        {/* Zones List */}
        <div className="space-y-2">
          <span className="text-[11px] text-zinc-400 font-bold uppercase block">Active Evacuation Sectors ({zones.length})</span>
          {zones.map((z, idx) => (
            <div key={idx} className="flex items-center justify-between p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-850 gap-3 flex-wrap sm:flex-nowrap">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-zinc-200 block truncate">{z.zone_id}</span>
                <span className="text-[10px] text-zinc-500">
                  {z.center.latitude.toFixed(4)}, {z.center.longitude.toFixed(4)} · ~{z.estimated_population.toLocaleString()} pop
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  {z.radius_km}km Radius
                </span>
                {zones.length > 1 && (
                  <button
                    onClick={() => handleRemoveZone(idx)}
                    className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Destinations */}
        <div className="space-y-2">
          <span className="text-[11px] text-zinc-400 font-bold uppercase block">Target Emergency Destinations ({destinations.length})</span>
          {destinations.map((d, idx) => (
            <div key={idx} className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-850 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Navigation className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-zinc-200">{d.label}</span>
              </div>
              <span className="text-[10px] text-zinc-500">{d.coord.latitude.toFixed(4)}, {d.coord.longitude.toFixed(4)}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleRunPlan}
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-950 transition-all cursor-pointer"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>{loading ? 'Optimizing Sector Clearance Flow...' : 'Calculate Optimal Zone Routing'}</span>
        </button>

        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-xs text-rose-300">
            {error}
          </div>
        )}
      </div>

      {/* Plan Results */}
      {planResult && (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center space-x-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Optimized Zone Allocations ({planResult.assignments.length} Sectors)
              </h3>
            </div>
            <div className="flex items-center space-x-3 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3 text-sky-400" />
                {planResult.total_affected_population.toLocaleString()} pop
              </span>
              <span className="flex items-center gap-1 text-amber-400 font-bold">
                <Clock className="h-3 w-3" />
                {planResult.total_clearance_time_min} min ETE
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {planResult.assignments.map((a, i) => (
              <div key={i} className="p-3 bg-zinc-950/90 rounded-lg border border-zinc-800 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-zinc-100">{a.zone_id}</span>
                    <span className="text-[10px] text-zinc-500 font-normal">→</span>
                    <span className="text-xs font-bold text-emerald-400">{a.destination_label}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 flex items-center space-x-3">
                    <span>Distance: {a.distance_km} km</span>
                    <span>Travel Time: {a.travel_time_min} min</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 uppercase block">Viability</span>
                  <span className="text-sm font-extrabold text-emerald-400">{Math.round(a.viability_score)}/100</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
