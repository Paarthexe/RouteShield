import React, { useMemo } from 'react';
import { Mountain } from 'lucide-react';

const CHART_WIDTH = 800;
const CHART_HEIGHT = 150;
const PADDING = { top: 18, right: 20, bottom: 26, left: 45 };

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

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.dist).toFixed(1)},${yScale(p.elev).toFixed(1)}`).join(' ');
  const areaPath = linePath +
    ` L${xScale(points[points.length - 1].dist).toFixed(1)},${(PADDING.top + innerH).toFixed(1)}` +
    ` L${xScale(points[0].dist).toFixed(1)},${(PADDING.top + innerH).toFixed(1)} Z`;

  const yTicks = [];
  const elevStep = (maxElev - minElev) / 3;
  for (let i = 0; i <= 3; i++) {
    const val = minElev + elevStep * i;
    yTicks.push({ val, y: yScale(val) });
  }

  const xTicks = [];
  const distStep = maxDist / 4;
  for (let i = 0; i <= 4; i++) {
    const val = distStep * i;
    xTicks.push({ val, x: xScale(val) });
  }

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 shadow-xl">
      <div className="flex items-center justify-between mb-2 border-b border-zinc-800/80 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 font-mono flex items-center gap-1.5">
          <Mountain className="h-3.5 w-3.5 text-zinc-400" />
          Terrain Elevation Cross-Section ({route.route_id.toUpperCase().replace('_', ' ')})
        </h3>
        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-3 bg-sky-400 rounded-full"></span>
            <span>Elevation Profile</span>
          </span>
          {bridges.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-amber-500"></span>
              <span>NBI Bridge</span>
            </span>
          )}
          {steepZones.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-rose-500"></span>
              <span>Grade &gt; 8%</span>
            </span>
          )}
          {probed.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full border border-emerald-400 bg-emerald-950"></span>
              <span>Mireye Point</span>
            </span>
          )}
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="overflow-visible">
        <defs>
          <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line x1={PADDING.left} y1={t.y} x2={CHART_WIDTH - PADDING.right} y2={t.y} stroke="#27272a" strokeWidth="1" strokeDasharray="2,2" />
            <text x={PADDING.left - 6} y={t.y + 3} textAnchor="end" className="fill-zinc-500" fontSize="9" fontFamily="monospace">
              {t.val.toFixed(0)}m
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <g key={`x-${i}`}>
            <line x1={t.x} y1={PADDING.top} x2={t.x} y2={PADDING.top + innerH} stroke="#27272a" strokeWidth="1" strokeDasharray="2,2" />
            <text x={t.x} y={PADDING.top + innerH + 14} textAnchor="middle" className="fill-zinc-500" fontSize="9" fontFamily="monospace">
              {t.val.toFixed(1)}km
            </text>
          </g>
        ))}

        {/* Steep grade zones */}
        {steepZones.map((sz, i) => (
          <circle
            key={`steep-${i}`}
            cx={xScale(sz.dist)}
            cy={yScale(sz.elev)}
            r={5}
            fill="#f43f5e"
            fillOpacity={0.25}
            stroke="#f43f5e"
            strokeWidth={1}
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#elevGrad)" />

        {/* Elevation line */}
        <path d={linePath} fill="none" stroke="#38bdf8" strokeWidth="1.75" strokeLinejoin="round" />

        {/* Bridge markers */}
        {bridges.map((b, i) => (
          <g key={`bridge-${i}`}>
            <line
              x1={xScale(b.dist)} y1={yScale(b.elev) - 3}
              x2={xScale(b.dist)} y2={PADDING.top + innerH}
              stroke="#f59e0b" strokeWidth="1" strokeDasharray="2,2" strokeOpacity="0.4"
            />
            <rect
              x={xScale(b.dist) - 3} y={yScale(b.elev) - 6}
              width="6" height="6" rx="1"
              fill="#f59e0b"
            />
          </g>
        ))}

        {/* Mireye probed markers */}
        {probed.map((p, i) => (
          <g key={`probed-${i}`}>
            <circle
              cx={xScale(p.dist)} cy={yScale(p.elev)}
              r={3.5} fill="#10b981"
              stroke="#042f2e" strokeWidth={1}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
