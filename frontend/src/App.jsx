import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import LocationInput from './components/LocationInput';
import RouteCard from './components/RouteCard';
import MapView from './components/MapView';
import SampleInspector from './components/SampleInspector';
import ErrorNotice from './components/ErrorNotice';
import AgentBriefing from './components/AgentBriefing';
import ElevationProfile from './components/ElevationProfile';
import { analyzeRoutes, resolveLocation } from './services/api';
import { Eye, EyeOff, Compass, Info } from 'lucide-react';
import AnalysisTrace from './components/AnalysisTrace';
import DecisionReadout from './components/DecisionReadout';
import RouteComparison from './components/RouteComparison';

export default function App() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState([]);
  const [sampleInterval, setSampleInterval] = useState(500);
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState('route_1');
  const [showSamples, setShowSamples] = useState(true);
  const [selectedSample, setSelectedSample] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pickerMode, setPickerMode] = useState(null);

  const [resolvedOrigin, setResolvedOrigin] = useState(null);
  const [resolvedDestination, setResolvedDestination] = useState(null);
  const [resolvedWaypoints, setResolvedWaypoints] = useState([]);

  const parseCoords = (val) => {
    if (!val || typeof val !== 'string') return null;
    const parts = val.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { latitude: parts[0], longitude: parts[1], display_name: `Point (${parts[0].toFixed(4)}, ${parts[1].toFixed(4)})` };
    }
    return null;
  };

  useEffect(() => {
    if (!origin.trim()) {
      setResolvedOrigin(null);
      return;
    }
    const directCoord = parseCoords(origin);
    if (directCoord) {
      setResolvedOrigin(directCoord);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const loc = await resolveLocation(origin);
        setResolvedOrigin(loc);
      } catch (e) {}
    }, 500);
    return () => clearTimeout(timer);
  }, [origin]);

  useEffect(() => {
    if (!destination.trim()) {
      setResolvedDestination(null);
      return;
    }
    const directCoord = parseCoords(destination);
    if (directCoord) {
      setResolvedDestination(directCoord);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const loc = await resolveLocation(destination);
        setResolvedDestination(loc);
      } catch (e) {}
    }, 500);
    return () => clearTimeout(timer);
  }, [destination]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const promises = waypoints.map(async (wp) => {
        if (!wp.trim()) return null;
        const direct = parseCoords(wp);
        if (direct) return direct;
        try {
          return await resolveLocation(wp);
        } catch (e) {
          return null;
        }
      });
      const results = await Promise.all(promises);
      setResolvedWaypoints(results);
    }, 500);
    return () => clearTimeout(timer);
  }, [waypoints]);

  const handleSetWaypointFromMap = (index, lat, lng) => {
    const updated = [...waypoints];
    updated[index] = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setWaypoints(updated);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelectedSample(null);

    try {
      const data = await analyzeRoutes(origin, destination, sampleInterval, waypoints);
      setAnalysisData(data);

      if (data.agent_decision && data.agent_decision.primary_route_id) {
        setSelectedRouteId(data.agent_decision.primary_route_id);
      } else if (data.routes && data.routes.length > 0) {
        setSelectedRouteId(data.routes[0].route_id);
      }

      if (data.routes && data.routes.length === 1) {
        setNotice("Only one feasible corridor was discovered for this terrain.");
      }
    } catch (err) {
      console.error("Analysis Error:", err);
      setError(err.message || "Failed to analyze evacuation corridors.");
      setAnalysisData(null);
    } finally {
      setLoading(false);
    }
  };

  const selectedRouteObj = analysisData?.routes?.find(r => r.route_id === selectedRouteId);
  const fastestDuration = analysisData?.routes?.[0]?.travel_time_min;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans">
      <Header />

      <main className="flex-1 w-full max-w-[1720px] mx-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* Left Column: Dispatch Panel & Corridor Details (4 cols on lg) */}
        <div className="lg:col-span-4 space-y-4">
          <LocationInput
            origin={origin}
            setOrigin={setOrigin}
            destination={destination}
            setDestination={setDestination}
            waypoints={waypoints}
            setWaypoints={setWaypoints}
            sampleInterval={sampleInterval}
            setSampleInterval={setSampleInterval}
            onAnalyze={handleAnalyze}
            loading={loading}
            pickerMode={pickerMode}
            setPickerMode={setPickerMode}
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

          {/* Candidate Corridors Deck */}
          {analysisData && analysisData.routes && analysisData.routes.length > 0 && (() => {
            const currentRouteIndex = analysisData.routes.findIndex(r => r.route_id === selectedRouteId);
            const activeIndex = currentRouteIndex >= 0 ? currentRouteIndex : 0;
            const activeRoute = analysisData.routes[activeIndex];
            const totalRoutes = analysisData.routes.length;

            const handlePrevRoute = () => {
              const prevIdx = (activeIndex - 1 + totalRoutes) % totalRoutes;
              setSelectedRouteId(analysisData.routes[prevIdx].route_id);
              setSelectedSample(null);
            };

            const handleNextRoute = () => {
              const nextIdx = (activeIndex + 1) % totalRoutes;
              setSelectedRouteId(analysisData.routes[nextIdx].route_id);
              setSelectedSample(null);
            };

            return (
              <div className="space-y-3 bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl">
                {/* Corridor Tabs Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                  <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-300 font-semibold uppercase">
                    <Compass className="h-3.5 w-3.5 text-sky-400" />
                    <span>Corridor {activeIndex + 1} of {totalRoutes}</span>
                  </div>

                  {totalRoutes > 1 && (
                    <div className="flex items-center space-x-1">
                      {analysisData.routes.map((rt, idx) => (
                        <button
                          key={rt.route_id}
                          type="button"
                          onClick={() => {
                            setSelectedRouteId(rt.route_id);
                            setSelectedSample(null);
                          }}
                          className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                            rt.route_id === selectedRouteId
                              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-bold'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                          }`}
                        >
                          C{idx + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Route Card */}
                {activeRoute && (
                  <RouteCard
                    key={activeRoute.route_id}
                    route={activeRoute}
                    isSelected={true}
                    onSelect={() => {}}
                    fastestDuration={fastestDuration}
                  />
                )}
              </div>
            );
          })()}

          {/* Assessment & Decision Briefing */}
          {analysisData?.agent_decision && (
            <AgentBriefing agentDecision={analysisData.agent_decision} />
          )}
        </div>

        {/* Right Column: Tactical Map, Terrain Elevation & Sample Inspector (8 cols on lg) */}
        <div className="lg:col-span-8 space-y-4">

          {analysisData && (
            <DecisionReadout routes={analysisData.routes} selectedRoute={selectedRouteObj} agentDecision={analysisData.agent_decision} />
          )}
          
          {/* Map Toolbar */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center space-x-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 font-mono">
                Geospatial Corridor HUD
              </span>
              {analysisData?.cache_hit && (
                <span className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700 rounded">
                  Cached
                </span>
              )}
            </div>

            {/* Toggle Show Samples */}
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowSamples(!showSamples)}
                className={`text-xs font-mono px-3 py-1.5 rounded-lg border flex items-center space-x-2 transition-colors cursor-pointer ${
                  showSamples
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {showSamples ? <Eye className="h-3.5 w-3.5 text-sky-400" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>{showSamples ? 'Samples Active' : 'Show Samples'}</span>
                {selectedRouteObj?.samples && (
                  <span className="ml-1 px-1.5 py-0.2 bg-zinc-950 text-[10px] font-mono rounded text-zinc-300 border border-zinc-700">
                    {selectedRouteObj.samples.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Map View */}
          <div className="h-[620px] w-full relative">
            <MapView
              origin={analysisData?.origin}
              destination={analysisData?.destination}
              waypoints={analysisData?.waypoints || []}
              routes={analysisData?.routes || []}
              selectedRouteId={selectedRouteId}
              onSelectRoute={(id) => {
                setSelectedRouteId(id);
                setSelectedSample(null);
              }}
              showSamples={showSamples}
              selectedSample={selectedSample}
              onSelectSample={(sample) => setSelectedSample(sample)}
              onSetOrigin={(lat, lng) => setOrigin(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)}
              onSetDestination={(lat, lng) => setDestination(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)}
              onSetWaypoint={handleSetWaypointFromMap}
              rawOriginStr={origin}
              rawDestinationStr={destination}
              rawWaypoints={waypoints}
              resolvedOrigin={resolvedOrigin}
              resolvedDestination={resolvedDestination}
              resolvedWaypoints={resolvedWaypoints}
              pickerMode={pickerMode}
              setPickerMode={setPickerMode}
            />
          </div>

          {/* Elevation Profile */}
          {selectedRouteObj && (
            <ElevationProfile route={selectedRouteObj} />
          )}

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
