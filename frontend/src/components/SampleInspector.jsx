import React from 'react';
import { Target, MapPin, X, Info, Layers, Mountain, ShieldAlert, CheckCircle2, Zap, AlertTriangle } from 'lucide-react';

export default function SampleInspector({ sample, onClose }) {
  if (!sample) return null;

  const distKm = (sample.distance_from_origin_m / 1000.0).toFixed(2);
  const bridges = sample.nbi_bridges || [];
  const mireye = sample.mireye_data || null;
  const isMireyeProbed = sample.is_mireye_probed;
  const slopePct = sample.slope_pct;
  const hazardScore = sample.hazard_score;

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 shadow-2xl space-y-3 relative animate-fadeIn max-h-[520px] overflow-y-auto">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
        title="Close Inspector"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center space-x-2">
        <div className="h-7 w-7 rounded-md bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
          <Target className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
            Sample Point Inspector
          </h4>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-cyan-400 font-mono">
              {sample.sample_id}
            </p>
            {isMireyeProbed && (
              <span className="text-[9px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700 font-mono">
                Mireye Sample
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Location + Distance Grid */}
      <div className="grid grid-cols-2 gap-2 bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-xs">
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">
            Distance Along Route
          </span>
          <span className="text-sm font-bold text-slate-100 font-mono">
            {distKm} <span className="text-xs font-normal text-slate-400">km</span>
          </span>
          <span className="text-[10px] text-slate-400 block font-mono">
            ({sample.distance_from_origin_m.toLocaleString()} m)
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">
            Coordinates
          </span>
          <span className="text-xs font-mono text-slate-200 block">
            {sample.latitude.toFixed(5)}° N
          </span>
          <span className="text-xs font-mono text-slate-200 block">
            {sample.longitude.toFixed(5)}° W
          </span>
        </div>
      </div>

      {/* Slope & Hazard Score Row */}
      {(slopePct != null || hazardScore != null) && (
        <div className="grid grid-cols-2 gap-2">
          {slopePct != null && (
            <div className={`p-2.5 rounded-lg border text-xs ${
              Math.abs(slopePct) > 8
                ? 'bg-rose-950/50 border-rose-800/60'
                : Math.abs(slopePct) > 3
                ? 'bg-amber-950/30 border-amber-800/40'
                : 'bg-slate-950/80 border-slate-800'
            }`}>
              <span className="text-[9px] text-slate-400 block uppercase font-semibold">Terrain Slope</span>
              <span className={`text-sm font-bold font-mono ${
                Math.abs(slopePct) > 8 ? 'text-rose-400' :
                Math.abs(slopePct) > 3 ? 'text-amber-400' : 'text-slate-100'
              }`}>
                {slopePct > 0 ? '+' : ''}{slopePct.toFixed(1)}%
              </span>
              <span className="text-[9px] text-slate-500 block">
                {Math.abs(slopePct) > 15 ? 'Extreme Grade' :
                 Math.abs(slopePct) > 8 ? 'Steep Grade' :
                 Math.abs(slopePct) > 3 ? 'Moderate Grade' : 'Flat/Gentle'}
              </span>
            </div>
          )}
          {hazardScore != null && (
            <div className={`p-2.5 rounded-lg border text-xs ${
              hazardScore > 0.5
                ? 'bg-rose-950/50 border-rose-800/60'
                : hazardScore > 0.3
                ? 'bg-amber-950/30 border-amber-800/40'
                : 'bg-slate-950/80 border-slate-800'
            }`}>
              <span className="text-[9px] text-slate-400 block uppercase font-semibold">Hazard Risk</span>
              <span className={`text-sm font-bold font-mono ${
                hazardScore > 0.5 ? 'text-rose-400' :
                hazardScore > 0.3 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {(hazardScore * 100).toFixed(0)}%
              </span>
              <span className="text-[9px] text-slate-500 block">
                {hazardScore > 0.5 ? 'High Risk' :
                 hazardScore > 0.3 ? 'Moderate Risk' :
                 hazardScore > 0.1 ? 'Low Risk' : 'Minimal'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mireye Physical-World Data Section */}
      {mireye && (
        <div className={`p-3 rounded-lg text-xs space-y-2 border ${
          isMireyeProbed
            ? 'bg-emerald-950/20 border-emerald-500/60 shadow-lg shadow-emerald-950/30'
            : 'bg-slate-950 border-cyan-900/50'
        }`}>
          <div className="flex items-center justify-between">
            <h5 className="text-[11px] font-bold text-emerald-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Mountain className="h-3.5 w-3.5 text-emerald-400" />
              <span>{isMireyeProbed ? 'Mireye Provenance Ground-Truth Probe' : 'Physical Environmental Facts'}</span>
            </h5>
            <span className={`text-[9px] px-2 py-0.5 rounded font-mono border font-bold ${
              isMireyeProbed
                ? 'bg-emerald-900 text-emerald-100 border-emerald-400'
                : 'bg-cyan-950 text-cyan-300 border-cyan-800'
            }`}>
              {isMireyeProbed ? 'VERIFIED PROBE' : 'Open-Meteo DEM'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            {mireye.elevation_m !== undefined && (
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block uppercase">Elevation</span>
                <span className="text-xs font-bold text-slate-100">{mireye.elevation_m.toFixed(1)} m</span>
                <span className="text-[9px] text-slate-500 block truncate" title={mireye.elevation_source}>
                  {mireye.elevation_source || 'USGS 3DEP'}
                </span>
              </div>
            )}

            {mireye.seismic_pga_g !== undefined && (
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block uppercase">Seismic PGA (50yr)</span>
                <span className={`text-xs font-bold ${mireye.seismic_pga_g >= 0.4 ? 'text-rose-400' : mireye.seismic_pga_g >= 0.2 ? 'text-amber-300' : 'text-slate-100'}`}>
                  {mireye.seismic_pga_g.toFixed(2)} g
                </span>
                <span className="text-[9px] text-slate-500 block truncate" title={mireye.seismic_source}>
                  {mireye.seismic_source || 'USGS NSHM 2023'}
                </span>
              </div>
            )}

            {mireye.fire_hazard_zone && (
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block uppercase">CAL FIRE FHSZ</span>
                <span className={`text-xs font-bold ${mireye.fire_hazard_zone === 'Very High' ? 'text-rose-400' : 'text-amber-300'}`}>
                  {mireye.fire_hazard_zone}
                </span>
                <span className="text-[9px] text-slate-500 block">
                  {mireye.most_recent_burn_year ? `Burned ${mireye.most_recent_burn_year}` : 'CAL FIRE SRA/LRA'}
                </span>
              </div>
            )}

            {(mireye.fema_flood_zone || mireye.within_floodplain) && (
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block uppercase">FEMA Flood Zone</span>
                <span className={`text-xs font-bold ${mireye.coastal_high_hazard ? 'text-rose-400' : 'text-cyan-300'}`}>
                  {mireye.fema_flood_zone ? `Zone ${mireye.fema_flood_zone}` : '100-Yr Floodplain'}
                </span>
                <span className="text-[9px] text-slate-500 block truncate">
                  {mireye.coastal_high_hazard ? 'Coastal Wave Hazard' : 'FEMA NFHL'}
                </span>
              </div>
            )}

            {mireye.landslide_susceptibility !== undefined && (
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block uppercase">Landslide Susceptibility</span>
                <span className={`text-xs font-bold ${mireye.landslide_susceptibility >= 60 ? 'text-rose-400' : mireye.landslide_susceptibility >= 30 ? 'text-amber-300' : 'text-slate-200'}`}>
                  {mireye.landslide_susceptibility} / 100
                </span>
                <span className="text-[9px] text-slate-500 block">USGS Landslide Index</span>
              </div>
            )}

            {mireye.nearest_dam_hazard && (
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block uppercase">USACE Dam Hazard</span>
                <span className={`text-xs font-bold ${mireye.nearest_dam_hazard === 'High' ? 'text-rose-400' : 'text-amber-300'}`}>
                  {mireye.nearest_dam_hazard}
                </span>
                <span className="text-[9px] text-slate-500 block">
                  {mireye.nearest_dam_distance_m ? `${(mireye.nearest_dam_distance_m / 1000).toFixed(1)} km away` : 'National Dam Inventory'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}


      {/* FHWA National Bridge Inventory Section */}
      {bridges.length > 0 ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <h5 className="text-[11px] font-bold text-amber-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-amber-400" /> FHWA Bridge & Infrastructure ({bridges.length})
            </h5>
            <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded font-mono">
              NBI Multi-Component
            </span>
          </div>

          <div className="space-y-2">
            {bridges.map((b, idx) => {
              const isDeficient = b.structurally_deficient || b.condition_label?.includes('Poor') || b.condition_label?.includes('Deficient');
              const suff = b.sufficiency_rating;

              return (
                <div
                  key={b.structure_id + idx}
                  className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-cyan-400 block font-bold">
                        NBI Structure ID: {b.structure_id}
                      </span>
                      <h6 className="font-bold text-slate-100 text-xs">
                        {b.location || b.facility || 'Highway Bridge / Overpass'}
                      </h6>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        isDeficient
                          ? 'bg-rose-950 text-rose-300 border-rose-800'
                          : b.condition_label?.includes('Fair')
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      }`}>
                        {b.condition_label}
                      </span>
                      {isDeficient && (
                        <span className="text-[9px] font-mono uppercase font-bold text-rose-400 bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-800/80">
                          STRUCTURALLY DEFICIENT
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sufficiency Rating Bar (0-100) */}
                  {suff != null && (
                    <div className="bg-slate-900/90 p-2 rounded border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-400">Sufficiency Rating (Item 66)</span>
                        <span className={`font-bold ${suff < 50 ? 'text-rose-400' : suff < 75 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {suff.toFixed(1)} / 100
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            suff < 50 ? 'bg-rose-500' : suff < 75 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.max(5, Math.min(100, suff))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 5-Component Condition Rating Grid (Items 58-62) */}
                  <div className="grid grid-cols-5 gap-1 pt-1 text-center font-mono">
                    {[
                      { label: 'Deck (58)', val: b.deck_condition },
                      { label: 'Super (59)', val: b.super_condition },
                      { label: 'Sub (60)', val: b.sub_condition },
                      { label: 'Channel (61)', val: b.channel_condition },
                      { label: 'Culvert (62)', val: b.culvert_condition }
                    ].map((comp, cIdx) => {
                      const num = parseInt(comp.val, 10);
                      const isNum = !isNaN(num);
                      const colorClass = !isNum
                        ? 'text-slate-500 bg-slate-900/50'
                        : num <= 4
                        ? 'text-rose-400 bg-rose-950/40 border-rose-800/60'
                        : num <= 6
                        ? 'text-amber-400 bg-amber-950/40 border-amber-800/60'
                        : 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60';

                      return (
                        <div key={cIdx} className={`p-1 rounded border border-slate-800/80 ${colorClass}`}>
                          <span className="text-[8px] text-slate-400 block truncate">{comp.label}</span>
                          <span className="text-[11px] font-bold block">{comp.val || '-'}</span>
                        </div>
                      );
                    })}
                  </div>


                  {/* Structure Metadata Row */}
                  <div className="grid grid-cols-3 gap-2 text-[11px] pt-1.5 border-t border-slate-800/80 font-mono text-slate-300">
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase">Built</span>
                      <span>{b.year_built || 'N/A'} {b.age_years ? `(${b.age_years}y)` : ''}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase">Daily Traffic</span>
                      <span>{b.adt ? b.adt.toLocaleString() : 'N/A'} ADT</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase">Proximity</span>
                      <span>{b.distance_to_sample_m}m</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-center space-x-2">
          <Info className="h-4 w-4 text-slate-500 shrink-0" />
          <span>No NBI bridge or highway structures within 300m of this sample point.</span>
        </div>
      )}

    </div>
  );
}
