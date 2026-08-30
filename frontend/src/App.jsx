import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import LocationInput from './components/LocationInput';
import RouteCard from './components/RouteCard';
import MapView from './components/MapView';
import SampleInspector from './components/SampleInspector';
import ErrorNotice from './components/ErrorNotice';
import AgentBriefing from './components/AgentBriefing';
import ElevationProfile from './components/ElevationProfile';
import WeatherBar from './components/WeatherBar';
import PopulationPanel from './components/PopulationPanel';
import CapacityPanel from './components/CapacityPanel';
import IncidentTimeline from './components/IncidentTimeline';
import ExportPanel from './components/ExportPanel';
import ZonePlanner from './components/ZonePlanner';
import AARCaseStudyPanel from './components/AARCaseStudyPanel';
import TTCCountdownPanel from './components/TTCCountdownPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { analyzeRoutes, resolveLocation } from './services/api';
import { Eye, EyeOff, Compass, Info, Radio, Layers, Route as RouteIcon } from 'lucide-react';
import AnalysisTrace from './components/AnalysisTrace';
import DecisionReadout from './components/DecisionReadout';
import RouteComparison from './components/RouteComparison';
import AgentToolsModal from './components/AgentToolsModal';
import LiveMonitorHUD from './components/LiveMonitorHUD';
import SegmentManager from './components/SegmentManager';

export default function App() {
  const [activeTab, setActiveTab] = useState('corridor'); // 'corridor' | 'zones'
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState([]);
  const [sampleInterval, setSampleInterval] = useState(500);
  const [disasterType, setDisasterType] = useState('ALL_HAZARDS');
  const [vehicleProfile, setVehicleProfile] = useState('STANDARD_VEHICLE');
  const [hazardBarriers, setHazardBarriers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState('route_1');
  const [showSamples, setShowSamples] = useState(false);
  const [selectedSample, setSelectedSample] = useState(null);
  const [showAgentTools, setShowAgentTools] = useState(false);
  const [showLiveMonitor, setShowLiveMonitor] = useState(false);

  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pickerMode, setPickerMode] = useState(null);

  // Avoid-point feedback loop state
  const [avoidPointMarker, setAvoidPointMarker] = useState(null);
  const [pendingAvoidCallback, setPendingAvoidCallback] = useState(null);
  const [repairedGeometry, setRepairedGeometry] = useState(null);
  const [originalGeometry, setOriginalGeometry] = useState(null);

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

  // Debounced Origin Geocoding with AbortController
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
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const loc = await resolveLocation(origin, controller.signal);
        setResolvedOrigin(loc);
      } catch (e) {
        if (e.name !== 'AbortError') {
          // ignore error
        }
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [origin]);

  // Debounced Destination Geocoding with AbortController
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
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const loc = await resolveLocation(destination, controller.signal);
        setResolvedDestination(loc);
      } catch (e) {
        if (e.name !== 'AbortError') {
          // ignore error
        }
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destination]);

  // Debounced Waypoints Geocoding with AbortController
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const promises = waypoints.map(async (wp) => {
        if (!wp.trim()) return null;
        const direct = parseCoords(wp);
        if (direct) return direct;
        try {
          return await resolveLocation(wp, controller.signal);
        } catch (e) {
          return null;
        }
      });
      const results = await Promise.all(promises);
      setResolvedWaypoints(results);
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [waypoints]);

  const handleSetWaypointFromMap = (index, lat, lng) => {
    const updated = [...waypoints];
    updated[index] = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setWaypoints(updated);
  };

  const handleAnalyze = async (overrideBarriers = null, overrideProfile = null) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelectedSample(null);

    const activeBarriers = overrideBarriers !== null ? overrideBarriers : hazardBarriers;
    const activeProfile = overrideProfile !== null ? overrideProfile : vehicleProfile;

    try {
      const data = await analyzeRoutes(
        origin,
        destination,
        sampleInterval,
        waypoints,
        disasterType,
        activeProfile,
        activeBarriers
      );
      setAnalysisData(data);
      setShowLiveMonitor(true);

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

  const handleAddHazardBarrier = (lat, lng) => {
    const newBarrier = {
      id: `barrier_${Date.now()}`,
      latitude: lat,
      longitude: lng,
      radius_m: 800.0,
      barrier_type: 'ROADBLOCK',
      label: `Active Roadblock #${hazardBarriers.length + 1}`
    };
    const updated = [...hazardBarriers, newBarrier];
    setHazardBarriers(updated);
    if (origin.trim() && destination.trim()) {
      handleAnalyze(updated, vehicleProfile);
    }
  };

  const handleRemoveHazardBarrier = (id) => {
    const updated = hazardBarriers.filter(b => b.id !== id);
    setHazardBarriers(updated);
    if (origin.trim() && destination.trim()) {
      handleAnalyze(updated, vehicleProfile);
    }
  };

  const handleVehicleProfileChange = (newProfile) => {
    setVehicleProfile(newProfile);
    if (origin.trim() && destination.trim()) {
      handleAnalyze(hazardBarriers, newProfile);
    }
  };

  const selectedRouteObj = analysisData?.routes?.find(r => r.route_id === selectedRouteId);
  const fastestDuration = analysisData?.routes?.[0]?.travel_time_min;

  const handleRouteUpdated = (updatedRoute, diff = null) => {
    if (!analysisData) return;
    const oldRoute = analysisData.routes.find(r => r.route_id === updatedRoute.route_id);
    if (oldRoute && diff) {
      setOriginalGeometry(oldRoute.geometry);
      setRepairedGeometry(updatedRoute.geometry);
    }
    setAnalysisData(prev => ({
      ...prev,
      routes: prev.routes.map(r =>
        r.route_id === updatedRoute.route_id ? updatedRoute : r
      ),
    }));
  };

  const handleArmAvoidPicker = (segmentId, repairCallback) => {
    setPickerMode('avoid_point');
    setPendingAvoidCallback(() => repairCallback);
  };

  const handleAvoidPointPicked = (lat, lng) => {
    setAvoidPointMarker({ lat, lng });
    if (pendingAvoidCallback) {
      pendingAvoidCallback({ lat, lng });
      setPendingAvoidCallback(null);
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans">
        {showAgentTools && (
          <AgentToolsModal onClose={() => setShowAgentTools(false)} />
        )}
        <Header onOpenAgentTools={() => setShowAgentTools(true)} />

        {/* Global Weather Bar if weather data available */}
        {analysisData?.weather_conditions && (
          <div className="w-full max-w-[1720px] mx-auto px-4 pt-3">
            <WeatherBar weather={analysisData.weather_conditions} />
          </div>
        )}

        {/* Mode Navigation Bar */}
        <div className="w-full max-w-[1720px] mx-auto px-4 pt-3 flex items-center justify-between border-b border-zinc-850 pb-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('corridor')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTab === 'corridor'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <RouteIcon className="h-3.5 w-3.5" />
              <span>Corridor Intelligence</span>
            </button>

            <button
              onClick={() => setActiveTab('zones')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTab === 'zones'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Multi-Zone Planner</span>
            </button>
          </div>
        </div>

        <main className="flex-1 w-full max-w-[1720px] mx-auto p-4 sm:p-5">
          {activeTab === 'zones' ? (
            <div className="max-w-4xl mx-auto">
              <ZonePlanner disasterType={disasterType} vehicleProfile={vehicleProfile} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Dispatch Panel & Corridor Details */}
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
                  disasterType={disasterType}
                  setDisasterType={setDisasterType}
                  vehicleProfile={vehicleProfile}
                  setVehicleProfile={handleVehicleProfileChange}
                  onAnalyze={() => handleAnalyze()}
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

                      {/* Segment Manager */}
                      {activeRoute && (
                        <SegmentManager
                          route={activeRoute}
                          disasterType={disasterType}
                          onRouteUpdated={handleRouteUpdated}
                          onArmAvoidPicker={handleArmAvoidPicker}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Tier 1 Feature: Population Exposure & ETE Panel */}
                {analysisData?.evacuation_exposure && (
                  <PopulationPanel exposure={analysisData.evacuation_exposure} />
                )}

                {/* Tier 1 Feature: Multi-Corridor Capacity & Contraflow Panel */}
                {analysisData?.capacity_analysis && (
                  <CapacityPanel capacityAnalysis={analysisData.capacity_analysis} />
                )}

                {/* Tier 1 Feature: Historical Incident Timeline */}
                {analysisData?.historical_incidents && analysisData.historical_incidents.length > 0 && (
                  <IncidentTimeline incidents={analysisData.historical_incidents} />
                )}

                {/* Real-World FEMA / NIST After-Action Report Case Studies */}
                {analysisData?.aar_case_studies && analysisData.aar_case_studies.length > 0 && (
                  <AARCaseStudyPanel caseStudies={analysisData.aar_case_studies} />
                )}

                {/* Dynamic Hazard Isochrone Time-to-Cutoff (TTC) Countdown */}
                {(selectedRouteObj?.time_cutoff || analysisData?.time_cutoff) && (
                  <TTCCountdownPanel
                    timeCutoff={selectedRouteObj?.time_cutoff || analysisData?.time_cutoff}
                    disasterType={disasterType}
                  />
                )}

                {/* Assessment & Decision Briefing */}
                {analysisData?.agent_decision && (
                  <AgentBriefing agentDecision={analysisData.agent_decision} />
                )}

                {/* Tier 1 Feature: Export Operations Briefing (CSV / Print PDF) */}
                {analysisData && selectedRouteObj && (
                  <ExportPanel analysisData={analysisData} selectedRoute={selectedRouteObj} />
                )}
              </div>

              {/* Right Column: Tactical Map, Terrain Elevation & Sample Inspector */}
              <div className="lg:col-span-8 space-y-4">
                {analysisData && (
                  <DecisionReadout routes={analysisData.routes} selectedRoute={selectedRouteObj} agentDecision={analysisData.agent_decision} />
                )}

                {/* Live Monitor HUD */}
                {analysisData && showLiveMonitor && selectedRouteObj && (
                  <LiveMonitorHUD
                    routeId={selectedRouteObj.route_id}
                    disasterType={disasterType}
                    onClose={() => setShowLiveMonitor(false)}
                  />
                )}
                
                {/* Map Toolbar */}
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 font-mono">
                      Geospatial Tactical HUD
                    </span>
                    {analysisData?.cache_hit && (
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700 rounded">
                        Cached
                      </span>
                    )}
                    {analysisData?.shelters && analysisData.shelters.length > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-800/80 rounded">
                        {analysisData.shelters.length} Shelters/POIs
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
                    avoidPointMarker={avoidPointMarker}
                    onAvoidPointPicked={handleAvoidPointPicked}
                    repairedGeometry={repairedGeometry}
                    originalGeometry={originalGeometry}
                    hazardBarriers={hazardBarriers}
                    onAddHazardBarrier={handleAddHazardBarrier}
                    onRemoveHazardBarrier={handleRemoveHazardBarrier}
                    shelters={analysisData?.shelters || []}
                    fuelStops={selectedRouteObj?.fuel_stops || []}
                    commDeadZones={selectedRouteObj?.comm_dead_zones || []}
                    aarCaseStudies={analysisData?.aar_case_studies || []}
                    hazardIsochrones={analysisData?.hazard_isochrones || []}
                    timeCutoff={selectedRouteObj?.time_cutoff || analysisData?.time_cutoff}
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
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
