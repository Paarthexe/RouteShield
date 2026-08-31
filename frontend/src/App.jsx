import React, { useState, useEffect, useCallback, useRef } from 'react';
import SearchPanel   from './components/SearchPanel';
import SidePanel     from './components/SidePanel';
import MapView       from './components/MapView';
import AgentToolsModal from './components/AgentToolsModal';
import ErrorBoundary from './components/ErrorBoundary';
import { analyzeRoutes, resolveLocation } from './services/api';
import { Locate, Plus, Minus, Navigation } from 'lucide-react';

export default function App() {
  // ─── Mode / theme ───────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState('corridor');
  const [isDarkMode,  setIsDarkMode]  = useState(true);

  // ─── Route inputs ────────────────────────────────────────────
  const [origin,      setOrigin]      = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints,   setWaypoints]   = useState([]);
  const [sampleInterval,  setSampleInterval]  = useState(500);
  const [disasterType,    setDisasterType]    = useState('ALL_HAZARDS');
  const [vehicleProfile,  setVehicleProfile]  = useState('STANDARD_VEHICLE');

  // ─── Map / analysis state ────────────────────────────────────
  const [hazardBarriers,    setHazardBarriers]    = useState([]);
  const [loading,           setLoading]           = useState(false);
  const [analysisData,      setAnalysisData]      = useState(null);
  const [selectedRouteId,   setSelectedRouteId]   = useState('route_1');
  const [showSamples,       setShowSamples]       = useState(false);
  const [selectedSample,    setSelectedSample]    = useState(null);
  const [showAgentTools,    setShowAgentTools]    = useState(false);
  const [showLiveMonitor,   setShowLiveMonitor]   = useState(false);

  // ─── UI overlay state ────────────────────────────────────────
  const [showSidebar,    setShowSidebar]    = useState(false);
  const [showLiveFires,  setShowLiveFires]  = useState(true);
  const [showHistorical, setShowHistorical] = useState(false);

  // ─── Panel sizing & expansion state ──────────────────────────
  const [panelWidth,        setPanelWidth]        = useState(390);
  const [widthMode,         setWidthMode]         = useState('standard'); // 'standard' (390), 'wide' (640), 'ultrawide' (880)
  const [isSearchCollapsed, setIsSearchCollapsed] = useState(false);
  const [isPanelMaximized,  setIsPanelMaximized]  = useState(false);
  const [isDragging,        setIsDragging]        = useState(false);

  // ─── Errors / notices ────────────────────────────────────────
  const [error,  setError]  = useState(null);
  const [notice, setNotice] = useState(null);

  // ─── Picker mode / avoid-point ──────────────────────────────
  const [pickerMode,          setPickerMode]          = useState(null);
  const [avoidPointMarker,    setAvoidPointMarker]    = useState(null);
  const [pendingAvoidCallback, setPendingAvoidCallback] = useState(null);
  const [repairedGeometry,    setRepairedGeometry]    = useState(null);
  const [originalGeometry,    setOriginalGeometry]    = useState(null);

  // ─── Geocoded coords ─────────────────────────────────────────
  const [resolvedOrigin,      setResolvedOrigin]      = useState(null);
  const [resolvedDestination, setResolvedDestination] = useState(null);
  const [resolvedWaypoints,   setResolvedWaypoints]   = useState([]);

  // ─── Leaflet map instance (for FABs) ─────────────────────────
  const mapRef = useRef(null);
  const handleMapReady = useCallback((map) => { mapRef.current = map; }, []);

  // ─── Helpers ─────────────────────────────────────────────────
  const parseCoords = (val) => {
    if (!val || typeof val !== 'string') return null;
    const parts = val.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { latitude: parts[0], longitude: parts[1], display_name: `Point (${parts[0].toFixed(4)}, ${parts[1].toFixed(4)})` };
    }
    return null;
  };

  // ─── Debounced geocoding – origin ────────────────────────────
  useEffect(() => {
    if (!origin.trim()) { setResolvedOrigin(null); return; }
    const direct = parseCoords(origin);
    if (direct) { setResolvedOrigin(direct); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try { setResolvedOrigin(await resolveLocation(origin, ctrl.signal)); }
      catch (e) { if (e.name !== 'AbortError') {} }
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [origin]);

  // ─── Debounced geocoding – destination ───────────────────────
  useEffect(() => {
    if (!destination.trim()) { setResolvedDestination(null); return; }
    const direct = parseCoords(destination);
    if (direct) { setResolvedDestination(direct); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try { setResolvedDestination(await resolveLocation(destination, ctrl.signal)); }
      catch (e) { if (e.name !== 'AbortError') {} }
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [destination]);

  // ─── Debounced geocoding – waypoints ─────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const results = await Promise.all(waypoints.map(async (wp) => {
        if (!wp.trim()) return null;
        const d = parseCoords(wp);
        if (d) return d;
        try { return await resolveLocation(wp, ctrl.signal); } catch { return null; }
      }));
      setResolvedWaypoints(results);
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [waypoints]);

  const handleSetWaypointFromMap = (index, lat, lng) => {
    const updated = [...waypoints];
    updated[index] = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setWaypoints(updated);
  };

  // ─── Analysis ────────────────────────────────────────────────
  const handleAnalyze = async (overrideBarriers = null, overrideProfile = null) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelectedSample(null);

    const activeBarriers = Array.isArray(overrideBarriers) ? overrideBarriers : hazardBarriers;
    const activeProfile  = (typeof overrideProfile === 'string') ? overrideProfile : vehicleProfile;

    try {
      const data = await analyzeRoutes(
        origin, destination, sampleInterval, waypoints,
        disasterType, activeProfile, activeBarriers,
      );
      setAnalysisData(data);
      setShowSidebar(true);
      setShowLiveMonitor(true);

      if (data.agent_decision?.primary_route_id) {
        setSelectedRouteId(data.agent_decision.primary_route_id);
      } else if (data.routes?.length > 0) {
        setSelectedRouteId(data.routes[0].route_id);
      }
      if (data.routes?.length === 1) {
        setNotice('Only one feasible corridor was discovered for this terrain.');
      }
    } catch (err) {
      console.error('Analysis Error:', err);
      setError(err.message || 'Failed to analyze evacuation corridors.');
      setAnalysisData(null);
      setShowSidebar(true); // still open sidebar to show error
    } finally {
      setLoading(false);
    }
  };

  const handleAddHazardBarrier = (lat, lng) => {
    const newBarrier = {
      id: `barrier_${Date.now()}`,
      latitude: lat, longitude: lng,
      radius_m: 800.0, barrier_type: 'ROADBLOCK',
      label: `Active Roadblock #${hazardBarriers.length + 1}`,
    };
    const updated = [...hazardBarriers, newBarrier];
    setHazardBarriers(updated);
    if (origin.trim() && destination.trim()) handleAnalyze(updated, vehicleProfile);
  };

  const handleRemoveHazardBarrier = (id) => {
    const updated = hazardBarriers.filter(b => b.id !== id);
    setHazardBarriers(updated);
    if (origin.trim() && destination.trim()) handleAnalyze(updated, vehicleProfile);
  };

  const handleVehicleProfileChange = (newProfile) => {
    setVehicleProfile(newProfile);
    if (origin.trim() && destination.trim()) handleAnalyze(hazardBarriers, newProfile);
  };

  const handleRouteUpdated = (updatedRoute, diff = null) => {
    if (!analysisData) return;
    const oldRoute = analysisData.routes.find(r => r.route_id === updatedRoute.route_id);
    if (oldRoute && diff) {
      setOriginalGeometry(oldRoute.geometry);
      setRepairedGeometry(updatedRoute.geometry);
    }
    setAnalysisData(prev => ({
      ...prev,
      routes: prev.routes.map(r => r.route_id === updatedRoute.route_id ? updatedRoute : r),
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

  const selectedRouteObj = analysisData?.routes?.find(r => r.route_id === selectedRouteId);

  // ─── Resize & Expansion Handlers ────────────────────────────
  const startDrag = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);

    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxWidth = Math.min(window.innerWidth - 60, 960);
      const newWidth = Math.max(340, Math.min(maxWidth, startWidth + deltaX));
      setPanelWidth(newWidth);
      if (newWidth > 750) setWidthMode('ultrawide');
      else if (newWidth > 520) setWidthMode('wide');
      else setWidthMode('standard');
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);

  const handleCycleWidth = () => {
    if (widthMode === 'standard') {
      setWidthMode('wide');
      setPanelWidth(640);
    } else if (widthMode === 'wide') {
      setWidthMode('ultrawide');
      setPanelWidth(880);
    } else {
      setWidthMode('standard');
      setPanelWidth(390);
    }
  };

  const handleToggleMaximize = () => {
    const nextMax = !isPanelMaximized;
    setIsPanelMaximized(nextMax);
    setIsSearchCollapsed(nextMax);
  };

  // ─── FAB handlers ────────────────────────────────────────────
  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (resolvedOrigin) {
      map.setView([resolvedOrigin.latitude, resolvedOrigin.longitude], 13, { animate: true });
    } else {
      map.locate({ setView: true, maxZoom: 13 });
    }
  };

  return (
    <ErrorBoundary>
      <div className={`rs-root ${isDarkMode ? 'rs-dark' : 'rs-light'}`}>

        {/* Agent Tools Modal – portal-style, above everything */}
        {showAgentTools && (
          <AgentToolsModal onClose={() => setShowAgentTools(false)} />
        )}

        {/* ── Layer 0: Full-bleed map ── */}
        <MapView
          origin={analysisData?.origin}
          destination={analysisData?.destination}
          waypoints={analysisData?.waypoints || []}
          routes={analysisData?.routes || []}
          selectedRouteId={selectedRouteId}
          onSelectRoute={(id) => {
            setSelectedRouteId(id);
            setSelectedSample(null);
            setShowSidebar(true);
          }}
          showSamples={showSamples}
          selectedSample={selectedSample}
          onSelectSample={(sample) => {
            setSelectedSample(sample);
            setShowSidebar(true);
          }}
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
          infrastructure={selectedRouteObj?.infrastructure || null}
          commDeadZones={selectedRouteObj?.comm_dead_zones || []}
          aarCaseStudies={analysisData?.aar_case_studies || []}
          hazardIsochrones={analysisData?.hazard_isochrones || []}
          timeCutoff={selectedRouteObj?.time_cutoff || analysisData?.time_cutoff}
          // New layout props
          isDarkMode={isDarkMode}
          onMapReady={handleMapReady}
          showHistorical={showHistorical}
          containerClassName="absolute inset-0 z-0"
        />

        {/* ── Left Container: Floating Search & Analysis Stack ── */}
        <div
          className={`rs-left-panel-container ${isDragging ? 'rs-dragging' : ''}`}
          style={{ width: `${panelWidth}px` }}
        >
          {/* Top Search Card (collapsible) */}
          <SearchPanel
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            onOpenAgentTools={() => setShowAgentTools(true)}
            // route inputs
            origin={origin}              setOrigin={setOrigin}
            destination={destination}    setDestination={setDestination}
            waypoints={waypoints}        setWaypoints={setWaypoints}
            sampleInterval={sampleInterval}   setSampleInterval={setSampleInterval}
            disasterType={disasterType}       setDisasterType={setDisasterType}
            vehicleProfile={vehicleProfile}   setVehicleProfile={handleVehicleProfileChange}
            onAnalyze={handleAnalyze}         loading={loading}
            pickerMode={pickerMode}           setPickerMode={setPickerMode}
            hazardBarriers={hazardBarriers}
            // layer toggles
            showLiveFires={showLiveFires}     setShowLiveFires={setShowLiveFires}
            showHistorical={showHistorical}   setShowHistorical={setShowHistorical}
            // mode tab
            activeTab={activeTab}             setActiveTab={(tab) => {
              setActiveTab(tab);
              setShowSidebar(true);
            }}
            isCollapsed={isSearchCollapsed}
            setIsCollapsed={setIsSearchCollapsed}
            hasResults={Boolean(analysisData)}
          />

          {/* Results Side Panel */}
          {showSidebar && (
            <SidePanel
              isOpen={showSidebar}
              onClose={() => setShowSidebar(false)}
              isDarkMode={isDarkMode}
              activeTab={activeTab}
              // analysis state
              analysisData={analysisData}
              selectedRouteId={selectedRouteId}   setSelectedRouteId={setSelectedRouteId}
              selectedSample={selectedSample}     setSelectedSample={setSelectedSample}
              showSamples={showSamples}           setShowSamples={setShowSamples}
              showLiveMonitor={showLiveMonitor}   setShowLiveMonitor={setShowLiveMonitor}
              loading={loading}
              error={error}
              notice={notice}
              // handlers
              handleAnalyze={handleAnalyze}
              handleRouteUpdated={handleRouteUpdated}
              handleArmAvoidPicker={handleArmAvoidPicker}
              disasterType={disasterType}
              vehicleProfile={vehicleProfile}
              // expansion controls
              widthMode={widthMode}
              onCycleWidth={handleCycleWidth}
              isMaximized={isPanelMaximized}
              onToggleMaximize={handleToggleMaximize}
            />
          )}

          {/* Interactive Drag Handle on Right Border */}
          <div
            className="rs-resize-handle"
            onMouseDown={startDrag}
            onDoubleClick={() => { setPanelWidth(390); setWidthMode('standard'); }}
            title="Drag horizontally to resize panel (Double-click to reset)"
          />
        </div>

        {/* ── Layer 3: FAB cluster (bottom-right) ── */}
        <div className="rs-fab-cluster">
          {/* Recenter / Locate */}
          <button
            className="rs-fab"
            onClick={handleRecenter}
            title="Recenter map on your location"
            aria-label="Recenter map"
          >
            <Locate size={17} />
          </button>

          {/* Zoom in */}
          <button
            className="rs-fab"
            onClick={() => mapRef.current?.zoomIn()}
            title="Zoom in"
            aria-label="Zoom in"
            style={{ fontSize: 20, fontWeight: 300 }}
          >
            +
          </button>

          {/* Zoom out */}
          <button
            className="rs-fab"
            onClick={() => mapRef.current?.zoomOut()}
            title="Zoom out"
            aria-label="Zoom out"
            style={{ fontSize: 20, fontWeight: 300 }}
          >
            −
          </button>

          {/* Open sidebar if closed and data exists */}
          {analysisData && !showSidebar && (
            <button
              className="rs-fab"
              onClick={() => setShowSidebar(true)}
              title="Open route panel"
              aria-label="Open route panel"
              style={{ background: 'var(--rs-accent-blue)', color: '#fff', borderColor: 'var(--rs-accent-blue)' }}
            >
              <Navigation size={15} />
            </button>
          )}
        </div>

        {/* ── ONLINE status dot (bottom-left, unobtrusive) ── */}
        <div style={{
          position: 'absolute', bottom: 12, left: showSidebar ? panelWidth + 24 : 16,
          zIndex: 400, display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 99,
          background: 'var(--rs-bg-panel)', border: '1px solid var(--rs-border)',
          boxShadow: 'var(--rs-shadow-sm)',
          fontSize: 11, fontWeight: 600, color: 'var(--rs-accent-green)',
          transition: isDragging ? 'none' : 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          fontFamily: 'monospace',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--rs-accent-green)',
            animation: 'pulse 2s cubic-bezier(.4,0,.6,1) infinite',
          }} />
          ONLINE
        </div>

      </div>
    </ErrorBoundary>
  );
}
