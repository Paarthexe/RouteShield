import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import LocationInput from './components/LocationInput';
import RouteCard from './components/RouteCard';
import MapView from './components/MapView';
import SampleInspector from './components/SampleInspector';
import ErrorNotice from './components/ErrorNotice';
import { analyzeRoutes } from './services/api';
import { Eye, EyeOff, Compass, Info } from 'lucide-react';
import AnalysisTrace from './components/AnalysisTrace';
import DecisionReadout from './components/DecisionReadout';
import RouteComparison from './components/RouteComparison';

export default function App() {
  const [origin, setOrigin] = useState('Financial District, San Francisco, CA');
  const [destination, setDestination] = useState('San Francisco International Airport, CA');
  const [sampleInterval, setSampleInterval] = useState(500);
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState('route_1');
  const [showSamples, setShowSamples] = useState(true);
  const [selectedSample, setSelectedSample] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Initial load
  useEffect(() => {
    handleAnalyze();
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelectedSample(null);

    try {
      const data = await analyzeRoutes(origin, destination, sampleInterval);
      setAnalysisData(data);
      if (data.routes && data.routes.length > 0) {
        setSelectedRouteId(data.routes[0].route_id);
        if (data.routes.length === 1) {
          setNotice("Only one feasible route was returned for this corridor.");
        }
      }
    } catch (err) {
      console.error("Analysis Error:", err);
      setError(err.message || "Failed to analyze evacuation routes.");
      setAnalysisData(null);
    } finally {
      setLoading(false);
    }
  };

  const selectedRouteObj = analysisData?.routes?.find(r => r.route_id === selectedRouteId);
  const fastestDuration = analysisData?.routes?.[0]?.travel_time_min;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Form & Route Cards (4 cols on lg) */}
        <div className="lg:col-span-4 space-y-5">
          <LocationInput
            origin={origin}
            setOrigin={setOrigin}
            destination={destination}
            setDestination={setDestination}
            sampleInterval={sampleInterval}
            setSampleInterval={setSampleInterval}
            onAnalyze={handleAnalyze}
            loading={loading}
          />

          <AnalysisTrace loading={loading} analysisData={analysisData} error={error} />

          {error && (
            <ErrorNotice
              message={error}
              onRetry={handleAnalyze}
              type="error"
            />
          )}

          {notice && !error && (
            <ErrorNotice
              message={notice}
              type="warning"
            />
          )}

          {/* Candidate Evacuation Corridors List */}
          {analysisData && analysisData.routes && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-cyan-400" />
                  Candidate Evacuation Corridors ({analysisData.routes.length})
                </h3>
              </div>

              <div className="space-y-3">
                {analysisData.routes.map(route => (
                  <RouteCard
                    key={route.route_id}
                    route={route}
                    isSelected={route.route_id === selectedRouteId}
                    onSelect={() => {
                      setSelectedRouteId(route.route_id);
                      setSelectedSample(null);
                    }}
                    fastestDuration={fastestDuration}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Map & Sampling Inspector (8 cols on lg) */}
        <div className="lg:col-span-8 space-y-4">

          {analysisData && (
            <DecisionReadout routes={analysisData.routes} selectedRoute={selectedRouteObj} />
          )}
          
          {/* Map Toolbar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                Spatial View
              </span>
              {analysisData?.cache_hit && (
                <span className="px-2 py-0.5 text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 rounded">
                  Cache Hit
                </span>
              )}
            </div>

            {/* Toggle Show Samples */}
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowSamples(!showSamples)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border flex items-center space-x-2 transition-all cursor-pointer ${
                  showSamples
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {showSamples ? <Eye className="h-3.5 w-3.5 text-cyan-400" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>{showSamples ? 'Samples Visible' : 'Show Samples'}</span>
                {selectedRouteObj?.samples && (
                  <span className="ml-1 px-1.5 py-0.2 bg-slate-950 text-[10px] font-mono rounded text-cyan-400">
                    {selectedRouteObj.samples.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Map View */}
          <div className="h-[560px] w-full relative">
            <MapView
              origin={analysisData?.origin}
              destination={analysisData?.destination}
              routes={analysisData?.routes || []}
              selectedRouteId={selectedRouteId}
              onSelectRoute={(id) => {
                setSelectedRouteId(id);
                setSelectedSample(null);
              }}
              showSamples={showSamples}
              selectedSample={selectedSample}
              onSelectSample={(sample) => setSelectedSample(sample)}
            />
          </div>

          {/* Physical Sample Point Inspector Panel */}
          {selectedSample && (
            <SampleInspector
              sample={selectedSample}
              onClose={() => setSelectedSample(null)}
            />
          )}

          {analysisData && (
            <RouteComparison
              routes={analysisData.routes}
              selectedRouteId={selectedRouteId}
              onSelectRoute={(id) => {
                setSelectedRouteId(id);
                setSelectedSample(null);
              }}
            />
          )}

          <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>Decision-support prototype: route conditions can change during an active emergency. Current results are based on the configured routing and physical-world data sources and are not an official dispatch instruction.</span>
          </div>

        </div>
      </main>
    </div>
  );
}
