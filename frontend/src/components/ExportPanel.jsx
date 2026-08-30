import React from 'react';
import { Download, Printer, FileSpreadsheet, FileText } from 'lucide-react';

export default function ExportPanel({ analysisData, selectedRoute }) {
  if (!analysisData || !selectedRoute) return null;

  const handleExportCSV = () => {
    const samples = selectedRoute.samples || [];
    if (samples.length === 0) return;

    const headers = [
      'sample_id',
      'latitude',
      'longitude',
      'distance_from_origin_m',
      'slope_pct',
      'hazard_score',
      'is_barrier_blocked',
      'is_mireye_probed',
      'nbi_bridges_count'
    ];

    const rows = samples.map(s => [
      s.sample_id,
      s.latitude,
      s.longitude,
      s.distance_from_origin_m,
      s.slope_pct || 0,
      s.hazard_score || 0,
      s.is_barrier_blocked ? 'YES' : 'NO',
      s.is_mireye_probed ? 'YES' : 'NO',
      (s.nbi_bridges || []).length
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `routeshield_${selectedRoute.route_id}_telemetry.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl space-y-3 font-mono print:hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <Download className="h-4 w-4 text-sky-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            Export Operations Briefing
          </h3>
        </div>
        <span className="text-[10px] text-zinc-400 font-bold">
          {selectedRoute.route_id.toUpperCase().replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={handleExportCSV}
          className="flex items-center justify-center space-x-2 py-2 px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 rounded-lg border border-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
          <span>Export CSV Data</span>
        </button>

        <button
          onClick={handlePrintReport}
          className="flex items-center justify-center space-x-2 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg border border-sky-500 text-xs font-bold transition-colors cursor-pointer shadow-lg shadow-sky-950"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>Print / PDF Brief</span>
        </button>
      </div>
    </div>
  );
}
