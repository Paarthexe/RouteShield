import React, { useMemo } from 'react';
import { Mountain, MapPin } from 'lucide-react';

const CHART_WIDTH = 800;
const CHART_HEIGHT = 160;
const PADDING = { top: 20, right: 20, bottom: 30, left: 50 };

export default function ElevationProfile({ route }) {
  if (!route || !route.samples || route.samples.length < 2) return null;

  const chartData = useMemo(() => {
    const samples = route.samples;
    const points = [];
    const bridges = [];
    const probed = [];
    const steepZones = [];

    let minElev = Infinity;
    let maxElev = -Infinity;
    let maxDist = 0;

    for (const s of samples) {
      const elev = s.mireye_data?.elevation_m;
      const dist = s.distance_from_origin_m / 1000.0; // km
      if (elev != null) {
        points.push({ dist, elev, sample: s });
        if (elev < minElev) minElev = elev;
        if (elev > maxElev) maxElev = elev;
      }
      if (dist > maxDist) maxDist = dist;

      if (s.nbi_bridges && s.nbi_bridges.length > 0) {
        bridges.push({ dist, elev: elev ?? 0, sample: s });
      }
      if (s.is_mireye_probed) {
        probed.push({ dist, elev: elev ?? 0, sample: s });
      }
      if (s.slope_pct != null && Math.abs(s.slope_pct) > 8) {
        steepZones.push({ dist, elev: elev ?? 0, slope: s.slope_pct, sample: s });
      }
    }

    if (points.length < 2) return null;

    // Add padding to elevation range
    const elevRange = maxElev - minElev || 1;
    minElev = minElev - elevRange * 0.1;
    maxElev = maxElev + elevRange * 0.1;

    return { points, bridges, probed, steepZones, minElev, maxElev, maxDist };
  }, [route]);

  if (!chartData) return null;

  const { points, bridges, probed, steepZones, minElev, maxElev, maxDist } = chartData;

  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const xScale = (dist) => PADDING.left + (dist / (maxDist || 1)) * innerW;
  const yScale = (elev) => PADDING.top + innerH - ((elev - minElev) / ((maxElev - minElev) || 1)) * innerH;

  // Build area path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.dist).toFixed(1)},${yScale(p.elev).toFixed(1)}`).join(' ');
  const areaPath = linePath +
    ` L${xScale(points[points.length - 1].dist).toFixed(1)},${(PADDING.top + innerH).toFixed(1)}` +
    ` L${xScale(points[0].dist).toFixed(1)},${(PADDING.top + innerH).toFixed(1)} Z`;

  // Y-axis ticks
  const yTicks = [];
  const elevStep = (maxElev - minElev) / 4;
  for (let i = 0; i <= 4; i++) {
    const val = minElev + elevStep * i;
    yTicks.push({ val, y: yScale(val) });
  }

  // X-axis ticks
  const xTicks = [];
  const distStep = maxDist / 5;
  for (let i = 0; i <= 5; i++) {
    const val = distStep * i;
    xTicks.push({ val, x: xScale(val) });
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
          <Mountain className="h-4 w-4 text-cyan-400" />
          Elevation Profile — {route.route_id.toUpperCase().replace('_', ' ')}
        </h3>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
            <span className="text-slate-400">Elevation</span>
          </span>
          {bridges.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-amber-400"></span>
              <span className="text-slate-400">Bridge</span>
            </span>
          )}
          {steepZones.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-rose-400"></span>
              <span className="text-slate-400">Steep Grade</span>
            </span>
          )}
          {probed.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-emerald-300"></span>
              <span className="text-slate-400">Mireye Probed</span>
            </span>
          )}
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="overflow-visible">
        <defs>
          <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line x1={PADDING.left} y1={t.y} x2={CHART_WIDTH - PADDING.right} y2={t.y} stroke="#1e293b" strokeWidth="1" />
            <text x={PADDING.left - 8} y={t.y + 3} textAnchor="end" className="fill-slate-500" fontSize="9" fontFamily="monospace">
              {t.val.toFixed(0)}m
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <g key={`x-${i}`}>
            <line x1={t.x} y1={PADDING.top} x2={t.x} y2={PADDING.top + innerH} stroke="#1e293b" strokeWidth="1" />
            <text x={t.x} y={PADDING.top + innerH + 16} textAnchor="middle" className="fill-slate-500" fontSize="9" fontFamily="monospace">
              {t.val.toFixed(1)}km
            </text>
          </g>
        ))}

        {/* Steep grade highlight zones */}
        {steepZones.map((sz, i) => (
          <circle
            key={`steep-${i}`}
            cx={xScale(sz.dist)}
            cy={yScale(sz.elev)}
            r={6}
            fill="#ef4444"
            fillOpacity={0.2}
            stroke="#ef4444"
            strokeWidth={1}
            strokeOpacity={0.5}
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#elevGrad)" />

        {/* Elevation line */}
        <path d={linePath} fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinejoin="round" />

        {/* Bridge markers */}
        {bridges.map((b, i) => (
          <g key={`bridge-${i}`}>
            <line
              x1={xScale(b.dist)} y1={yScale(b.elev) - 4}
              x2={xScale(b.dist)} y2={PADDING.top + innerH}
              stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.5"
            />
            <rect
              x={xScale(b.dist) - 4} y={yScale(b.elev) - 8}
              width="8" height="8" rx="1"
              fill="#f59e0b" fillOpacity="0.8"
            />
          </g>
        ))}

        {/* Mireye probed markers */}
        {probed.map((p, i) => (
          <g key={`probed-${i}`}>
            <circle
              cx={xScale(p.dist)} cy={yScale(p.elev)}
              r={5} fill="#10b981" fillOpacity={0.3}
              stroke="#10b981" strokeWidth={2}
            />
            <circle
              cx={xScale(p.dist)} cy={yScale(p.elev)}
              r={2.5} fill="#10b981"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
