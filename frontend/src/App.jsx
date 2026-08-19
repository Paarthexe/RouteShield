import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import LocationInput from './components/LocationInput';
import RouteCard from './components/RouteCard';
import MapView from './components/MapView';
import SampleInspector from './components/SampleInspector';
import ErrorNotice from './components/ErrorNotice';
import { analyzeRoutes, resolveLocation } from './services/api';
import { Layers, Eye, EyeOff, MapPin, Compass, ShieldAlert, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [pickerMode, setPickerMode] = useState(null); // 'origin' | 'destination' | 'waypoint_N' | null

  // Live resolved location state for immediate map markers when typing
  const [resolvedOrigin, setResolvedOrigin] = useState(null);
  const [resolvedDestination, setResolvedDestination] = useState(null);
  const [resolvedWaypoints, setResolvedWaypoints] = useState([]);

  // Helper to parse raw numeric coordinate strings
  const parseCoords = (val) => {
    if (!val || typeof val !== 'string') return null;
    const parts = val.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { latitude: parts[0], longitude: parts[1], display_name: `Point (${parts[0].toFixed(4)}, ${parts[1].toFixed(4)})` };
    }
    return null;
  };

  // Live geocoding resolution for Origin
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
      } catch (e) {
        // live lookup fail ignored until submit
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [origin]);

  // Live geocoding resolution for Destination
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
      } catch (e) {
        // live lookup fail ignored until submit
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [destination]);

  // Live geocoding resolution for Waypoints
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

      <main className="flex-1 w-full max-w-[1800px] mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Form & Route Cards (4 cols on lg) */}
        <div className="lg:col-span-4 space-y-5">
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

          {/* Candidate Evacuation Corridors Slider / Slideshow */}
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
              <div className="space-y-3 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                {/* Slider Control Header */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                    <Compass className="h-4 w-4 text-cyan-400" />
                    Candidate Corridor {activeIndex + 1} of {totalRoutes}
                  </h3>

                  {totalRoutes > 1 && (
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={handlePrevRoute}
                        title="Previous Corridor"
                        className="p-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer flex items-center gap-0.5 text-xs font-semibold px-2"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        <span>Prev</span>
                      </button>

                      <span className="text-[11px] font-mono font-bold text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {activeIndex + 1} / {totalRoutes}
                      </span>

                      <button
                        type="button"
                        onClick={handleNextRoute}
                        title="Next Corridor"
                        className="p-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer flex items-center gap-0.5 text-xs font-semibold px-2"
                      >
                        <span>Next</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
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

                {/* Dots Indicator */}
                {totalRoutes > 1 && (
                  <div className="flex items-center justify-center space-x-2 pt-1">
                    {analysisData.routes.map((rt, idx) => (
                      <button
                        key={rt.route_id}
                        type="button"
                        onClick={() => {
                          setSelectedRouteId(rt.route_id);
                          setSelectedSample(null);
                        }}
                        title={`Switch to Corridor ${idx + 1}`}
                        className={`h-2 rounded-full transition-all cursor-pointer ${
                          idx === activeIndex
                            ? 'w-6 bg-cyan-400 shadow-sm shadow-cyan-500/50'
                            : 'w-2 bg-slate-700 hover:bg-slate-500'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Right Column: Map & Sampling Inspector (8 cols on lg) */}
        <div className="lg:col-span-8 space-y-4">
          
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
          <div className="h-[640px] w-full relative">
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

          {/* Physical Sample Point Inspector Panel */}
          {selectedSample && (
            <SampleInspector
              sample={selectedSample}
              onClose={() => setSelectedSample(null)}
            />
          )}

        </div>
      </main>
    </div>
  );
}
