import React from 'react';
import { CloudRain, Wind, Thermometer, Compass, AlertTriangle, Sun, CloudFog, CloudLightning } from 'lucide-react';

export default function WeatherBar({ weather }) {
  if (!weather) return null;

  const {
    temperature_f,
    temperature_c,
    wind_speed_mph,
    wind_direction_deg,
    wind_direction_label,
    precipitation_mm,
    weather_description,
    warnings = [],
    corridor_wind_alignment
  } = weather;

  const hasWarnings = warnings && warnings.length > 0;

  return (
    <div className={`rounded-xl border p-3 font-mono shadow-md transition-all ${
      hasWarnings
        ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
        : 'bg-zinc-900/90 border-zinc-800 text-zinc-300'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Weather overview */}
        <div className="flex items-center space-x-4 flex-wrap gap-y-1.5">
          <div className="flex items-center space-x-1.5 text-zinc-100 font-bold">
            <Sun className="h-4 w-4 text-amber-400 shrink-0" />
            <span>{weather_description || 'Clear'}</span>
          </div>

          <div className="flex items-center space-x-1 text-zinc-300">
            <Thermometer className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>{temperature_f ? `${Math.round(temperature_f)}°F` : '--'}</span>
            <span className="text-[10px] text-zinc-500">({temperature_c ? `${Math.round(temperature_c)}°C` : '--'})</span>
          </div>

          <div className="flex items-center space-x-1.5 text-zinc-300">
            <Wind className="h-3.5 w-3.5 text-teal-400 shrink-0" />
            <span>{wind_speed_mph ? `${Math.round(wind_speed_mph)} mph` : '0 mph'}</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 border border-zinc-700 rounded text-zinc-300">
              {wind_direction_label || 'N'} ({wind_direction_deg ? `${Math.round(wind_direction_deg)}°` : '0°'})
            </span>
          </div>

          <div className="flex items-center space-x-1 text-zinc-300">
            <CloudRain className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span>{precipitation_mm !== undefined && precipitation_mm !== null ? `${precipitation_mm} mm/hr` : '0.0 mm'}</span>
          </div>

          {corridor_wind_alignment && corridor_wind_alignment !== 'N/A' && (
            <div className="flex items-center space-x-1 text-xs">
              <Compass className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span className="text-zinc-400 text-[11px]">Alignment:</span>
              <span className="font-semibold text-zinc-200 text-[11px]">{corridor_wind_alignment}</span>
            </div>
          )}
        </div>

        {/* Warning Badge */}
        {hasWarnings && (
          <div className="flex items-center space-x-1.5 bg-amber-900/60 border border-amber-700/80 px-2.5 py-1 rounded text-[11px] font-bold text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>{warnings[0]}</span>
          </div>
        )}
      </div>
    </div>
  );
}
