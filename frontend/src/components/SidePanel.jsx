import React, { useState } from 'react';
import {
  ArrowLeft, Shield, AlertTriangle, Info, Compass,
  Eye, EyeOff, Radio, Maximize2, Minimize2, Columns,
} from 'lucide-react';
import RouteCard        from './RouteCard';
import SegmentManager   from './SegmentManager';
import PopulationPanel  from './PopulationPanel';
import CapacityPanel    from './CapacityPanel';
import IncidentTimeline from './IncidentTimeline';
import AARCaseStudyPanel from './AARCaseStudyPanel';
import TTCCountdownPanel from './TTCCountdownPanel';
import FuelReadinessPanel from './FuelReadinessPanel';
import AgentBriefing    from './AgentBriefing';
import ExportPanel      from './ExportPanel';
import DecisionReadout  from './DecisionReadout';
import ElevationProfile from './ElevationProfile';
import SampleInspector  from './SampleInspector';
import RouteComparison  from './RouteComparison';
import LiveMonitorHUD   from './LiveMonitorHUD';
import AnalysisTrace    from './AnalysisTrace';
import ErrorNotice      from './ErrorNotice';
import ZonePlanner      from './ZonePlanner';
import WeatherBar       from './WeatherBar';

export default function SidePanel({
  isOpen, onClose,
  isDarkMode,
  activeTab,
  // Analysis state
  analysisData,
  selectedRouteId, setSelectedRouteId,
  selectedSample,  setSelectedSample,
  showSamples,     setShowSamples,
  showLiveMonitor, setShowLiveMonitor,
  loading, error, notice,
  // Handlers
  handleAnalyze, handleRouteUpdated, handleArmAvoidPicker,
  disasterType, vehicleProfile,
  // Expansion controls
  widthMode = 'standard',
  onCycleWidth = null,
}) {
  const routes        = analysisData?.routes || [];
  const selectedRouteObj = routes.find(r => r.route_id === selectedRouteId);
  const fastestDuration  = routes[0]?.travel_time_min;
  const activeIndex      = Math.max(0, routes.findIndex(r => r.route_id === selectedRouteId));
  const activeRoute      = routes[activeIndex];
  const totalRoutes      = routes.length;

  const getRouteChipMeta = (route) => {
    const isFastest = route?.travel_time_min === fastestDuration;
    const status = route?.viability?.status || 'CANDIDATE';
    if (status === 'PRIMARY') return { label: 'Primary', short: 'Best', bg: 'rgba(16, 185, 129, 0.18)', border: 'rgba(16, 185, 129, 0.5)', color: '#6ee7b7' };
    if (isFastest) return { label: 'Fastest', short: 'Fastest', bg: 'rgba(56, 189, 248, 0.18)', border: 'rgba(56, 189, 248, 0.45)', color: '#7dd3fc' };
    if (status === 'BACKUP') return { label: 'Backup', short: 'Backup', bg: 'rgba(59, 130, 246, 0.16)', border: 'rgba(96, 165, 250, 0.4)', color: '#93c5fd' };
    if (status === 'REJECTED') return { label: 'Rejected', short: 'Reject', bg: 'rgba(244, 63, 94, 0.16)', border: 'rgba(251, 113, 133, 0.4)', color: '#fda4af' };
    return { label: 'Candidate', short: `Alt ${route?.route_id?.split('_')[1] || ''}`.trim(), bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(251, 191, 36, 0.35)', color: '#fcd34d' };
  };

  const primaryRoute = routes.find((route) => route?.viability?.status === 'PRIMARY') || null;
  const backupRoute = routes.find((route) => route?.viability?.status === 'BACKUP') || null;
  const fastestRoute = routes.find((route) => route?.travel_time_min === fastestDuration) || null;

  /* Hazard warning: fire isochrones present or route viability is bad */
  const hasHazard =
    (analysisData?.hazard_isochrones?.length > 0) ||
    (selectedRouteObj?.viability?.status === 'REJECTED') ||
    (selectedRouteObj?.viability?.score != null && selectedRouteObj.viability.score < 40);

  return (
    <aside className={`rs-sidebar ${isOpen ? 'rs-open' : ''}`}>
      {/* ── Sticky header ── */}
      <div className="rs-sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap', flex: 1 }}>
          <Shield size={15} style={{ color: 'var(--rs-accent-blue)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rs-text-primary)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {activeTab === 'zones' ? 'Zone Planner' : 'Route Analysis'}
          </span>
          {analysisData && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
              background: 'var(--rs-accent-green-light)', color: 'var(--rs-accent-green)',
              whiteSpace: 'nowrap',
            }}>
              {totalRoutes} corridor{totalRoutes !== 1 ? 's' : ''}
            </span>
          )}
          {totalRoutes > 1 && activeTab !== 'zones' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
              {routes.map((rt, idx) => {
                const active = rt.route_id === selectedRouteId;
                return (
                  <button
                    key={`header_route_${rt.route_id}`}
                    onClick={() => { setSelectedRouteId(rt.route_id); setSelectedSample(null); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '3px 9px',
                      borderRadius: 8,
                      border: `1px solid ${active ? 'var(--rs-accent-blue)' : 'var(--rs-border)'}`,
                      background: active ? 'var(--rs-accent-blue)' : 'var(--rs-bg-panel-secondary)',
                      color: active ? '#fff' : 'var(--rs-text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                      minWidth: 0,
                      flex: '0 1 auto',
                    }}
                    title={`Switch to route ${idx + 1}`}
                  >
                    <span style={{ flexShrink: 0 }}>R{idx + 1}</span>
                  </button>
                );
              })}
              </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
          {/* Expand Sideways (Width cycle) */}
          {onCycleWidth && (
            <button
              className="rs-icon-btn"
              onClick={onCycleWidth}
              title={
                widthMode === 'standard'
                  ? 'Expand width sideways (Wide 640px)'
                  : widthMode === 'wide'
                  ? 'Expand width sideways (Ultra-Wide 880px)'
                  : 'Collapse width (Standard 390px)'
              }
              style={{
                color: widthMode !== 'standard' ? 'var(--rs-accent-blue)' : undefined,
                background: widthMode !== 'standard' ? 'var(--rs-accent-blue-light)' : undefined,
              }}
            >
              {widthMode === 'ultrawide' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}

          {/* Live monitor toggle */}
          {analysisData && selectedRouteObj && (
            <button
              className="rs-icon-btn"
              onClick={() => setShowLiveMonitor(!showLiveMonitor)}
              title="Toggle live monitor"
              style={{ color: showLiveMonitor ? 'var(--rs-accent-blue)' : undefined }}
            >
              <Radio size={13} />
            </button>
          )}

          <button className="rs-icon-btn" onClick={onClose} title="Back to planner">
            <ArrowLeft size={13} />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="rs-sidebar-inner">

        {/* Zone Planner mode */}
        {activeTab === 'zones' && (
          <ZonePlanner disasterType={disasterType} vehicleProfile={vehicleProfile} />
        )}

        {/* Corridor mode */}
        {activeTab !== 'zones' && (
          <>
            {/* Weather bar */}
            {analysisData?.weather_conditions && (
              <WeatherBar weather={analysisData.weather_conditions} />
            )}

            {/* Hazard warning banner */}
            {hasHazard && (
              <div className="rs-hazard-banner">
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
                    Active Hazard Detected
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.4 }}>
                    Fire perimeter intersects this route corridor. Proceed with caution.
                  </div>
                </div>
              </div>
            )}

            {/* Analysis trace / loading */}
            <AnalysisTrace loading={loading} analysisData={analysisData} error={error} />

            {/* Errors / notices */}
            {error  && <ErrorNotice message={error}  onRetry={() => handleAnalyze()} type="error"   />}
            {notice && !error && <ErrorNotice message={notice} type="warning" />}

            {/* Decision readout */}
            {analysisData && (
              <DecisionReadout
                routes={routes}
                selectedRoute={selectedRouteObj}
                agentDecision={analysisData.agent_decision}
              />
            )}

            {/* ── Corridor card deck ── */}
            {totalRoutes > 0 && (
              <div style={{
                border: '1px solid var(--rs-border)',
                borderRadius: 14,
                overflow: 'hidden',
                background: 'var(--rs-bg-panel-secondary)',
              }}>
                {/* Tab bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 13px', borderBottom: '1px solid var(--rs-border)',
                  gap: 10, flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 11, fontWeight: 600, color: 'var(--rs-text-secondary)',
                    }}>
                      <Compass size={12} style={{ color: 'var(--rs-accent-blue)' }} />
                      Corridor {activeIndex + 1} / {totalRoutes}
                    </div>
                    {totalRoutes > 1 && null}
                  </div>
                  {totalRoutes > 1 && null}
                </div>

                {/* Active route card */}
                <div style={{ padding: '12px 13px 4px' }}>
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

                {/* Samples toggle + cache badge */}
                <div style={{
                  padding: '0 13px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <button
                    onClick={() => setShowSamples(!showSamples)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 99,
                      border: `1px solid ${showSamples ? 'var(--rs-chip-border-active)' : 'var(--rs-border)'}`,
                      background: showSamples ? 'var(--rs-chip-bg-active)' : 'transparent',
                      color: showSamples ? 'var(--rs-chip-text-active)' : 'var(--rs-text-muted)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {showSamples ? <Eye size={11} /> : <EyeOff size={11} />}
                    {showSamples ? 'Samples Active' : 'Show Samples'}
                    {selectedRouteObj?.samples && (
                      <span style={{
                        fontSize: 10, padding: '0 5px', borderRadius: 4,
                        background: 'var(--rs-border)', color: 'var(--rs-text-muted)',
                      }}>
                        {selectedRouteObj.samples.length}
                      </span>
                    )}
                  </button>
                  {analysisData?.cache_hit && (
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 5,
                      background: 'var(--rs-chip-bg)', color: 'var(--rs-text-muted)',
                      border: '1px solid var(--rs-border)',
                    }}>
                      Cached
                    </span>
                  )}
                  {analysisData?.shelters?.length > 0 && (
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 5,
                      background: 'var(--rs-accent-blue-light)', color: 'var(--rs-accent-blue)',
                      border: '1px solid var(--rs-chip-border-active)',
                    }}>
                      {analysisData.shelters.length} shelters
                    </span>
                  )}
                </div>
              </div>
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

            {/* Live Monitor HUD */}
            {analysisData && showLiveMonitor && selectedRouteObj && (
              <LiveMonitorHUD
                routeId={selectedRouteObj.route_id}
                disasterType={disasterType}
                onClose={() => setShowLiveMonitor(false)}
              />
            )}

            {/* Population Exposure */}
            {analysisData?.evacuation_exposure && (
              <PopulationPanel exposure={analysisData.evacuation_exposure} />
            )}

            {/* Multi-Corridor Capacity */}
            {analysisData?.capacity_analysis && (
              <CapacityPanel capacityAnalysis={analysisData.capacity_analysis} />
            )}

            {/* Historical Incident Timeline */}
            {analysisData?.historical_incidents?.length > 0 && (
              <IncidentTimeline incidents={analysisData.historical_incidents} />
            )}

            {/* AAR Case Studies */}
            {analysisData?.aar_case_studies?.length > 0 && (
              <AARCaseStudyPanel caseStudies={analysisData.aar_case_studies} />
            )}

            {/* Time-to-Cutoff countdown */}
            {(selectedRouteObj?.time_cutoff || analysisData?.time_cutoff) && (
              <TTCCountdownPanel
                timeCutoff={selectedRouteObj?.time_cutoff || analysisData?.time_cutoff}
                disasterType={disasterType}
              />
            )}

            {/* Refueling & range readiness */}
            {selectedRouteObj && (
              <FuelReadinessPanel route={selectedRouteObj} />
            )}

            {/* Agent Briefing */}
            {analysisData?.agent_decision && (
              <AgentBriefing agentDecision={analysisData.agent_decision} />
            )}

            {/* Elevation Profile */}
            {selectedRouteObj && (
              <ElevationProfile route={selectedRouteObj} />
            )}

            {/* Sample Inspector */}
            {selectedSample && (
              <SampleInspector
                sample={selectedSample}
                onClose={() => setSelectedSample(null)}
              />
            )}

            {/* Route Comparison */}
            {analysisData && (
              <RouteComparison
                routes={routes}
                selectedRouteId={selectedRouteId}
                onSelectRoute={id => { setSelectedRouteId(id); setSelectedSample(null); }}
              />
            )}

            {/* Export Panel */}
            {analysisData && selectedRouteObj && (
              <ExportPanel analysisData={analysisData} selectedRoute={selectedRouteObj} />
            )}

            {/* Disclaimer */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '9px 11px', borderRadius: 10,
              border: '1px solid var(--rs-border)',
              background: 'var(--rs-bg-panel-secondary)',
              fontSize: 11, lineHeight: 1.55, color: 'var(--rs-text-muted)',
            }}>
              <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              Decision-support prototype. Conditions change during emergencies. Not an official dispatch instruction.
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
