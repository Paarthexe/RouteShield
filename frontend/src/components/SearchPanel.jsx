import React, { useState } from 'react';
import {
  Shield, MapPin, Navigation, Flame, Clock, Search, Loader2,
  Settings, Info, Sun, Moon, Layers, ChevronDown, ChevronUp,
  Plus, Minus, GripVertical, ShieldAlert, Truck, SlidersHorizontal, Ban,
} from 'lucide-react';

const DISASTER_MODES = [
  { id: 'ALL_HAZARDS', label: 'All Hazards' },
  { id: 'WILDFIRE',    label: 'Wildfire'   },
  { id: 'FLOOD_HURRICANE', label: 'Flood' },
  { id: 'EARTHQUAKE', label: 'Quake'      },
  { id: 'LANDSLIDE',  label: 'Landslide'  },
];

const VEHICLE_PROFILES = [
  { id: 'STANDARD_VEHICLE', label: '🚗 Standard' },
  { id: 'EMERGENCY_BUS',    label: '🚌 Evac Bus' },
  { id: 'RESCUE_4X4',       label: '🚙 4x4'      },
  { id: 'HEAVY_SUPPLY',     label: '🚛 Supply'   },
];

export default function SearchPanel({
  isDarkMode, setIsDarkMode,
  onOpenAgentTools,
  // route inputs
  origin, setOrigin,
  destination, setDestination,
  waypoints, setWaypoints,
  sampleInterval, setSampleInterval,
  disasterType, setDisasterType,
  vehicleProfile, setVehicleProfile,
  onAnalyze, loading,
  pickerMode, setPickerMode,
  hazardBarriers = [],
  // layer toggles
  showLiveFires, setShowLiveFires,
  showHistorical, setShowHistorical,
  // mode
  activeTab, setActiveTab,
  // collapse state
  isCollapsed = false,
  setIsCollapsed = null,
  hasResults = false,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canAnalyze = origin.trim() && destination.trim() && !loading;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && canAnalyze) onAnalyze();
  };

  /* ── Waypoint helpers ── */
  const [draggedIdx, setDraggedIdx] = useState(null);
  const handleAddWaypoint   = () => setWaypoints([...waypoints, '']);
  const handleRemoveWaypoint = (i) => setWaypoints(waypoints.filter((_, idx) => idx !== i));
  const handleUpdateWaypoint = (i, v) => { const u = [...waypoints]; u[i] = v; setWaypoints(u); };
  const handleDragStart = (e, i) => { e.dataTransfer.setData('text/plain', i); setDraggedIdx(i); };
  const handleDrop = (e, to) => {
    const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(from) && from !== to) {
      const u = [...waypoints];
      const [m] = u.splice(from, 1);
      u.splice(to, 0, m);
      setWaypoints(u);
    }
    setDraggedIdx(null);
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 34px 8px 36px',
    border: '1px solid var(--rs-border)',
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'inherit',
    background: 'var(--rs-bg-panel-secondary)',
    color: 'var(--rs-text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const selectStyle = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 12,
    border: '1px solid var(--rs-border)',
    background: 'var(--rs-bg-panel-secondary)',
    color: 'var(--rs-text-primary)',
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: 'none',
  };

  /* ── Compact collapsed bar when exploring analysis results ── */
  if (isCollapsed && setIsCollapsed) {
    return (
      <div className="rs-search-panel">
        <div className="rs-panel rs-search-collapsed">
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, cursor: 'pointer' }}
            onClick={() => setIsCollapsed(false)}
            title="Click to edit route coordinates"
          >
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: 'var(--rs-accent-blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', flexShrink: 0,
            }}>
              <Shield size={13} />
            </div>
            <div style={{
              fontSize: 12, fontWeight: 600, color: 'var(--rs-text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {origin ? origin.slice(0, 16) : 'Origin'} ➔ {destination ? destination.slice(0, 16) : 'Destination'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            <button
              className="rs-icon-btn"
              onClick={() => setIsCollapsed(false)}
              title="Expand route inputs"
              style={{ width: 28, height: 28 }}
            >
              <ChevronDown size={13} />
            </button>
            <button
              className="rs-icon-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ width: 28, height: 28 }}
            >
              {isDarkMode ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rs-search-panel">
      <div className="rs-panel" style={{ padding: 14 }}>

        {/* ── Wordmark row ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: 'var(--rs-accent-blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', flexShrink: 0,
              boxShadow: '0 1px 4px rgba(26,115,232,.35)',
            }}>
              <Shield size={15} />
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--rs-text-primary)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                RouteShield
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--rs-text-muted)', fontWeight: 500 }}>
                Wildfire Evacuation
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {hasResults && setIsCollapsed && (
              <button
                className="rs-icon-btn"
                onClick={() => setIsCollapsed(true)}
                title="Collapse search box to expand route panel"
              >
                <ChevronUp size={14} />
              </button>
            )}
            <button
              className="rs-icon-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button className="rs-icon-btn" onClick={onOpenAgentTools} title="Agent Tools & Architecture">
              <Info size={14} />
            </button>
          </div>
        </div>

        {/* ── Origin input ── */}
        <div style={{ position: 'relative', marginBottom: 7 }}>
          <MapPin size={14} style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--rs-accent-green)', pointerEvents: 'none', zIndex: 1,
          }} />
          <input
            style={inputStyle}
            placeholder="Enter your location (A)"
            value={origin}
            onChange={e => setOrigin(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: pickerMode === 'origin' ? 'var(--rs-accent-blue)' : 'var(--rs-text-muted)',
              padding: 2, display: 'flex', alignItems: 'center',
            }}
            title={pickerMode === 'origin' ? 'Cancel pick' : 'Pick on map'}
            onClick={() => setPickerMode(pickerMode === 'origin' ? null : 'origin')}
          >
            <Navigation size={12} />
          </button>
        </div>

        {/* ── Waypoints ── */}
        {waypoints.map((wp, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={e => handleDragStart(e, idx)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop(e, idx)}
            style={{
              position: 'relative', marginBottom: 7,
              opacity: draggedIdx === idx ? 0.45 : 1,
            }}
          >
            <GripVertical size={11} style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--rs-text-muted)', cursor: 'grab', pointerEvents: 'none',
            }} />
            <input
              style={{ ...inputStyle, paddingLeft: 28 }}
              placeholder={`Waypoint (${String.fromCharCode(66 + idx)})`}
              value={wp}
              onChange={e => handleUpdateWaypoint(idx, e.target.value)}
            />
            <button
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--rs-text-muted)', padding: 2, display: 'flex',
              }}
              onClick={() => handleRemoveWaypoint(idx)}
            >
              <Minus size={11} />
            </button>
          </div>
        ))}

        {/* ── Destination input ── */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <MapPin size={14} style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--rs-accent-red)', pointerEvents: 'none', zIndex: 1,
          }} />
          <input
            style={inputStyle}
            placeholder="Safe zone / destination"
            value={destination}
            onChange={e => setDestination(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: pickerMode === 'destination' ? 'var(--rs-accent-blue)' : 'var(--rs-text-muted)',
              padding: 2, display: 'flex', alignItems: 'center',
            }}
            title={pickerMode === 'destination' ? 'Cancel pick' : 'Pick on map'}
            onClick={() => setPickerMode(pickerMode === 'destination' ? null : 'destination')}
          >
            <Navigation size={12} />
          </button>
        </div>

        {/* ── Filter chips ── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <button
            className={`rs-chip ${showLiveFires ? 'rs-active' : ''}`}
            onClick={() => setShowLiveFires(!showLiveFires)}
          >
            <Flame size={11} />
            Live Fires
          </button>
          <button
            className={`rs-chip ${showHistorical ? 'rs-active' : ''}`}
            onClick={() => setShowHistorical(!showHistorical)}
          >
            <Clock size={11} />
            Historical
          </button>
          <button
            className={`rs-chip ${activeTab === 'zones' ? 'rs-active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'zones' ? 'corridor' : 'zones')}
          >
            <Layers size={11} />
            Zones
          </button>
          <button
            className={`rs-chip ${pickerMode === 'hazard_barrier' ? 'rs-active' : ''}`}
            onClick={() => setPickerMode(pickerMode === 'hazard_barrier' ? null : 'hazard_barrier')}
            title="Mark an impassable roadblock barrier on map to trigger auto-rerouting"
            style={{
              color: pickerMode === 'hazard_barrier' ? '#ef4444' : undefined,
              borderColor: pickerMode === 'hazard_barrier' ? '#ef4444' : undefined,
            }}
          >
            <Ban size={11} />
            {pickerMode === 'hazard_barrier' ? 'Draw Barrier…' : '+ Roadblock'}
            {hazardBarriers && hazardBarriers.length > 0 && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 99,
                background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444',
                fontWeight: 700, marginLeft: 2,
              }}>
                {hazardBarriers.length}
              </span>
            )}
          </button>
          <button
            className="rs-chip"
            onClick={handleAddWaypoint}
            title="Add intermediate waypoint"
          >
            <Plus size={11} />
            Stop
          </button>
        </div>

        {/* ── Advanced toggle ── */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '5px 0', fontSize: 11, fontWeight: 500, color: 'var(--rs-text-muted)',
            background: 'none', border: 'none', cursor: 'pointer',
            borderTop: '1px solid var(--rs-border)', paddingTop: 8, marginBottom: showAdvanced ? 10 : 0,
            fontFamily: 'inherit',
          }}
        >
          <Settings size={11} />
          {showAdvanced ? 'Hide' : 'Show'} advanced options
          {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {/* ── Advanced options ── */}
        {showAdvanced && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rs-text-muted)', marginBottom: 4 }}>
                Hazard Protocol
              </div>
              <select style={selectStyle} value={disasterType} onChange={e => setDisasterType(e.target.value)}>
                {DISASTER_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rs-text-muted)', marginBottom: 4 }}>
                Vehicle Fleet
              </div>
              <select style={selectStyle} value={vehicleProfile} onChange={e => setVehicleProfile(e.target.value)}>
                {VEHICLE_PROFILES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rs-text-muted)', marginBottom: 4 }}>
                Sample Density
              </div>
              <select style={selectStyle} value={sampleInterval} onChange={e => setSampleInterval(Number(e.target.value))}>
                <option value={250}>250 m — High resolution</option>
                <option value={500}>500 m — Standard</option>
                <option value={1000}>1000 m — Fast scan</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Analyze button ── */}
        <button
          className="rs-btn-primary"
          onClick={() => onAnalyze()}
          disabled={!canAnalyze}
          style={{ marginTop: showAdvanced ? 0 : 2 }}
        >
          {loading ? (
            <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Evaluating corridors…</>
          ) : (
            <><Search size={14} /> Find Safe Route</>
          )}
        </button>

        {/* ── Picker mode banner ── */}
        {pickerMode && pickerMode !== 'hazard_barrier' && pickerMode !== 'avoid_point' && (
          <div style={{
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderRadius: 8,
            background: 'var(--rs-accent-blue-light)',
            border: '1px solid var(--rs-chip-border-active)',
            color: 'var(--rs-accent-blue)', fontSize: 11, fontWeight: 500,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rs-accent-blue)', flexShrink: 0, animation: 'ping 1s cubic-bezier(0,0,.2,1) infinite' }} />
            Click the map to set {pickerMode === 'origin' ? 'origin' : pickerMode === 'destination' ? 'destination' : 'waypoint'}
            <button
              onClick={() => setPickerMode(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 12, fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
