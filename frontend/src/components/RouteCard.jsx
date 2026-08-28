import React, { useState } from "react";
import {
  Clock,
  Navigation,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Layers,
  Fuel,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";

const ROUTE_COLORS = {
  route_1: {
    border: "border-cyan-500",
    text: "text-cyan-400",
    bg: "bg-cyan-500/10",
    badge: "bg-cyan-500/20 text-cyan-300",
  },
  route_2: {
    border: "border-purple-500",
    text: "text-purple-400",
    bg: "bg-purple-500/10",
    badge: "bg-purple-500/20 text-purple-300",
  },
  route_3: {
    border: "border-amber-500",
    text: "text-amber-400",
    bg: "bg-amber-500/10",
    badge: "bg-amber-500/20 text-amber-300",
  },
  route_4: {
    border: "border-emerald-500",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    badge: "bg-emerald-500/20 text-emerald-300",
  },
  route_5: {
    border: "border-rose-500",
    text: "text-rose-400",
    bg: "bg-rose-500/10",
    badge: "bg-rose-500/20 text-rose-300",
  },
};

const STATUS_CONFIG = {
  PRIMARY: {
    label: "PRIMARY",
    bg: "bg-emerald-950",
    text: "text-emerald-300",
    border: "border-emerald-700",
  },
  BACKUP: {
    label: "BACKUP",
    bg: "bg-blue-950",
    text: "text-blue-300",
    border: "border-blue-700",
  },
  REJECTED: {
    label: "REJECTED",
    bg: "bg-rose-950",
    text: "text-rose-300",
    border: "border-rose-700",
  },
  ALTERNATIVE: {
    label: "ALTERNATIVE",
    bg: "bg-amber-950",
    text: "text-amber-300",
    border: "border-amber-700",
  },
  CANDIDATE: {
    label: "CANDIDATE",
    bg: "bg-slate-800",
    text: "text-slate-300",
    border: "border-slate-600",
  },
};

function ViabilityGauge({ score }) {
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 48, height: 48 }}
    >
      <svg width="48" height="48" className="transform -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={radius}
          stroke="#1e293b"
          strokeWidth="4"
          fill="none"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          stroke={color}
          strokeWidth="4"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <span
        className="absolute text-[11px] font-extrabold font-mono"
        style={{ color }}
      >
        {Math.round(score)}
      </span>
    </div>
  );
}

export default function RouteCard({
  route,
  isSelected,
  onSelect,
  fastestDuration,
  onAddWaypoint,
}) {
  const [showStopsList, setShowStopsList] = useState(false);
  const colorScheme = ROUTE_COLORS[route.route_id] || ROUTE_COLORS.route_1;
  const isFastest = route.travel_time_min === fastestDuration;
  const viability = route.viability;
  const statusKey = viability?.status || "CANDIDATE";
  const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.CANDIDATE;

  const timeDiffMin =
    !isFastest && fastestDuration !== undefined
      ? Math.round((route.travel_time_min - fastestDuration) * 10) / 10
      : 0;

  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? `${colorScheme.border} ${colorScheme.bg} shadow-lg shadow-black/40 ring-1 ring-cyan-500/30`
          : "border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 hover:border-slate-700"
      }`}
    >
      {/* Top Row: Route ID + Status Badge */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span
              className={`text-[10px] font-extrabold uppercase font-mono px-2 py-0.5 rounded ${colorScheme.badge}`}
            >
              {route.route_id.toUpperCase().replace("_", " ")}
            </span>
            {isFastest && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/60">
                Fastest
              </span>
            )}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
            >
              {statusCfg.label}
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-100 mt-1">
            {route.tag || `Corridor ${route.route_id}`}
          </h3>
        </div>

        {/* Viability Gauge */}
        {viability && <ViabilityGauge score={viability.score} />}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 my-3 p-2 bg-slate-950/60 rounded-lg border border-slate-800/60">
        {/* Travel Time */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-1 text-slate-400 mb-0.5">
            <Clock className="w-3 h-3" />
            <span className="text-[10px] uppercase font-mono">Time</span>
          </div>
          <div className="flex items-baseline justify-center space-x-1.5 mt-0.5">
            <span className="text-lg font-extrabold text-slate-100 font-mono">
              {route.travel_time_min}
            </span>
            <span className="text-[10px] font-normal text-slate-400">min</span>
          </div>
          {timeDiffMin > 0 && (
            <span className="block text-[9px] text-amber-400 font-mono">
              +{timeDiffMin}m vs fast
            </span>
          )}
        </div>

        {/* Distance */}
        <div className="text-center border-l border-r border-slate-800/60">
          <div className="flex items-center justify-center space-x-1 text-slate-400 mb-0.5">
            <Navigation className="w-3 h-3" />
            <span className="text-[10px] uppercase font-mono">Dist</span>
          </div>
          <div className="flex items-baseline justify-center space-x-1.5 mt-0.5">
            <span className="text-lg font-extrabold text-slate-100 font-mono">
              {route.distance_km}
            </span>
            <span className="text-[10px] font-normal text-slate-400">km</span>
          </div>
        </div>

        {/* Hazard Exposure */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-1 text-slate-400 mb-0.5">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-[10px] uppercase font-mono">Hazard</span>
          </div>
          <div className="flex items-baseline justify-center space-x-1.5 mt-0.5">
            <span
              className={`text-lg font-extrabold font-mono ${
                (route.viability?.hazard_exposure_pct || 0) > 30
                  ? "text-rose-400"
                  : (route.viability?.hazard_exposure_pct || 0) > 10
                    ? "text-amber-400"
                    : "text-emerald-400"
              }`}
            >
              {Math.round(route.viability?.hazard_exposure_pct || 0)}%
            </span>
          </div>
          <span className="text-[9px] text-slate-400 block font-mono mt-0.5">
            {route.samples ? route.samples.length : 0} samples
          </span>
        </div>
      </div>

      {/* Viability & Bottleneck Bar */}
      {viability && (
        <div className="space-y-2 mb-2">
          {/* Bottleneck Count */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-mono flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Bottlenecks
            </span>
            <div className="flex items-center gap-2">
              {viability.critical_bottleneck_count > 0 && (
                <span className="text-[10px] font-bold text-rose-400 bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800/60 font-mono">
                  {viability.critical_bottleneck_count} Critical
                </span>
              )}
              <span className="text-slate-300 font-mono font-bold">
                {viability.bottleneck_count} total
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Reasons */}
      {viability &&
        viability.rejection_reasons &&
        viability.rejection_reasons.length > 0 && (
          <div className="mb-2 p-2 bg-rose-950/60 border border-rose-800/60 rounded-lg">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-400 uppercase mb-1">
              <ShieldX className="h-3 w-3" />
              Rejection Reason
            </div>
            {viability.rejection_reasons.map((reason, i) => (
              <p key={i} className="text-[11px] text-rose-300/80 font-mono">
                {reason}
              </p>
            ))}
          </div>
        )}

      {/* Infrastructure & Bridge Summary */}
      {route.infrastructure_summary &&
        route.infrastructure_summary.total_bridges > 0 && (
          <div className="mb-2 py-1.5 px-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs flex items-center justify-between">
            <span className="text-slate-300 flex items-center gap-1.5 font-mono text-[11px]">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              <strong>
                {route.infrastructure_summary.total_bridges} NBI Bridges
              </strong>
            </span>
            {route.infrastructure_summary.aging_bridges > 0 ? (
              <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60 font-mono">
                {route.infrastructure_summary.aging_bridges} Aged (&lt;1970)
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 font-mono">
                Avg Age: {route.infrastructure_summary.average_bridge_age_years}{" "}
                yrs
              </span>
            )}
          </div>
        )}

      {/* Refueling & Energy Readiness Panel */}
      {route.infrastructure_summary &&
        (() => {
          const infra = route.infrastructure_summary;
          const allStations = route?.infrastructure?.stations || [
            ...(route?.infrastructure?.gas_stations || []),
            ...(route?.infrastructure?.ev_fast_stations || []),
            ...(route?.infrastructure?.ev_standard_stations || []),
          ];

          const isFuelDesert = infra.max_gas_gap_km > 45.0;
          const maxGasGap = Math.round(infra.max_gas_gap_km || 0);
          const maxEvGap = Math.round(infra.max_ev_fast_gap_km || 0);

          return (
            <div className="mb-3 p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs space-y-2">
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                  <Fuel className="h-4 w-4 text-amber-400" />
                  Refuel & Range Readiness
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono">
                <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800/80">
                  <span className="text-[9px] text-slate-400 uppercase block font-semibold">
                    Gas / Diesel
                  </span>
                  <span className="text-sm font-bold text-amber-400">
                    {infra.total_gas_stations || 0}
                  </span>
                  <span className="text-[8px] text-slate-400 block mt-0.5">
                    Max gap: {maxGasGap} km
                  </span>
                </div>
                <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800/80">
                  <span className="text-[9px] text-slate-400 uppercase block font-semibold">
                    DC Fast EV
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    {infra.total_ev_fast_stations || 0}
                  </span>
                  <span className="text-[8px] text-slate-400 block mt-0.5">
                    Max gap: {maxEvGap} km
                  </span>
                </div>
                <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800/80">
                  <span className="text-[9px] text-slate-400 uppercase block font-semibold">
                    Level 2 EV
                  </span>
                  <span className="text-sm font-bold text-sky-400">
                    {infra.total_ev_standard_stations || 0}
                  </span>
                  <span className="text-[8px] text-slate-400 block mt-0.5">
                    Standard AC
                  </span>
                </div>
              </div>

              {/* Expandable Corridor Station List */}
              {allStations.length > 0 && (
                <div className="pt-1 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowStopsList(!showStopsList);
                    }}
                    className="w-full flex items-center justify-between text-[11px] text-cyan-400 hover:text-cyan-300 font-mono font-semibold transition-colors cursor-pointer py-1"
                  >
                    <span>
                      {showStopsList
                        ? "Hide Station List"
                        : `View ${allStations.length} Stations Along Corridor`}
                    </span>
                    {showStopsList ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {showStopsList && (
                    <div className="mt-2 space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {allStations.map((st, sIdx) => {
                        const isGas = st.station_type === "gas";
                        const isFast =
                          st.station_type === "ev_fast" ||
                          st.speed_tier === "fast";
                        return (
                          <div
                            key={st.id || `st-item-${sIdx}`}
                            className="bg-slate-950/90 border border-slate-800 rounded-lg p-2 flex items-center justify-between text-xs font-mono gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {isGas ? (
                                  <span className="px-1.5 py-0.5 bg-amber-950/80 border border-amber-800 text-amber-300 text-[9px] font-bold rounded uppercase tracking-wider">
                                    Gasoline / Diesel
                                  </span>
                                ) : isFast ? (
                                  <span className="px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-[9px] font-bold rounded uppercase tracking-wider">
                                    DC Fast Charger
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-sky-950/80 border border-sky-800 text-sky-300 text-[9px] font-bold rounded uppercase tracking-wider">
                                    Standard AC
                                  </span>
                                )}
                                <span className="font-bold text-slate-100 truncate text-xs">
                                  {st.name}
                                </span>
                              </div>
                              <div className="text-slate-400 text-[10px] mt-0.5">
                                {st.distance_from_origin_km} km along route ·{" "}
                                {st.stalls_display ||
                                  (isGas ? "Multi-Pump" : "Stalls")}
                              </div>
                            </div>
                            {onAddWaypoint && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddWaypoint({
                                    latitude: st.latitude ?? st.lat,
                                    longitude: st.longitude ?? st.lon,
                                    query: st.name,
                                    display_name: st.name,
                                  });
                                }}
                                className="shrink-0 px-2 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-200 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Plus className="h-3 w-3 text-cyan-400" /> Add
                                Stop
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-slate-400">
          {statusKey === "PRIMARY"
            ? "Recommended Evacuation Corridor"
            : statusKey === "BACKUP"
              ? "Secondary Backup Corridor"
              : statusKey === "REJECTED"
                ? "Fragile Corridor - Not Recommended"
                : "Candidate Evacuation Corridor"}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`text-xs font-semibold px-3 py-1 rounded transition-colors ${
            isSelected
              ? `${colorScheme.badge} font-bold`
              : "text-slate-300 bg-slate-800 hover:bg-slate-700"
          }`}
        >
          {isSelected ? "Selected" : "View Route"}
        </button>
      </div>
    </div>
  );
}
