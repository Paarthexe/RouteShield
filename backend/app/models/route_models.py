from typing import List, Tuple, Optional, Any, Dict
from pydantic import BaseModel


class Location(BaseModel):
    query: str
    latitude: float
    longitude: float
    display_name: str


class Coordinate(BaseModel):
    latitude: float
    longitude: float


class GeoJSONLineString(BaseModel):
    type: str = "LineString"
    coordinates: List[Tuple[float, float]]


class HazardBarrier(BaseModel):
    id: str
    latitude: float
    longitude: float
    radius_m: float = 600.0
    barrier_type: str = "ROADBLOCK"  # "ROADBLOCK", "FIRE_PERIMETER", "FLOODED_UNDERPASS"
    label: str = "Active Roadblock"


class RouteSample(BaseModel):
    sample_id: str
    route_id: str
    latitude: float
    longitude: float
    distance_from_origin_m: float
    nbi_bridges: Optional[List[Dict[str, Any]]] = None
    mireye_data: Optional[Dict[str, Any]] = None
    hazards: Optional[List[Dict[str, Any]]] = None
    slope_pct: Optional[float] = None
    hazard_score: Optional[float] = None
    is_mireye_probed: bool = False
    is_barrier_blocked: bool = False


class BottleneckInfo(BaseModel):
    sample_id: str
    latitude: float
    longitude: float
    distance_from_origin_m: float
    bsi_score: float
    hazard_risk: float
    bridge_vulnerability: float
    terrain_penalty: float
    severity_label: str  # "Critical", "Moderate", "Low"
    description: str


class RouteViability(BaseModel):
    score: float  # 0-100
    status: str  # "PRIMARY", "BACKUP", "REJECTED", "ALTERNATIVE"
    hazard_exposure_pct: float
    bottleneck_count: int
    critical_bottleneck_count: int
    max_bsi: float
    rejection_reasons: List[str] = []


class BackupIndependence(BaseModel):
    primary_route_id: str
    backup_route_id: str
    corridor_overlap_pct: float
    shared_bridge_ids: List[str] = []
    independence_score: float
    is_independent: bool
    explanation: str


class AgentStep(BaseModel):
    step_number: int
    action: str
    detail: str


class AgentDecision(BaseModel):
    primary_route_id: Optional[str] = None
    backup_route_id: Optional[str] = None
    rejected_route_ids: List[str] = []
    executive_summary: str = ""
    trade_off_explanation: str = ""
    steps: List[AgentStep] = []
    mireye_insight: Optional[str] = None
    backup_independence: Optional[BackupIndependence] = None
    risk_model: Dict[str, Any] = {}
    evidence_coverage: Dict[str, Any] = {}
    disaster_type: str = "ALL_HAZARDS"
    vehicle_profile: str = "STANDARD_VEHICLE"
    hazard_barriers: List[HazardBarrier] = []


class RouteSegment(BaseModel):
    segment_id: str
    segment_index: int
    start_coord: Tuple[float, float]  # [lon, lat]
    end_coord: Tuple[float, float]    # [lon, lat]
    geometry: GeoJSONLineString
    distance_m: float
    duration_s: float
    distance_km: float
    travel_time_min: float
    sample_ids: List[str] = []
    hazard_score: float = 0.0
    bottleneck_count: int = 0
    critical_bottleneck_count: int = 0
    max_bsi: float = 0.0
    status: str = "VIABLE"  # "VIABLE", "NEEDS_REPAIR", "REPAIRED", "FLAGGED"
    repair_reason: Optional[str] = None
    description: str = ""


class SegmentRepairDiff(BaseModel):
    segment_id: str
    original_distance_km: float
    new_distance_km: float
    original_travel_time_min: float
    new_travel_time_min: float
    original_viability_score: float
    new_viability_score: float
    original_critical_bottlenecks: int
    new_critical_bottlenecks: int
    summary: str


class SegmentRepairRequest(BaseModel):
    route_id: Optional[str] = None
    segment_id: Optional[str] = None
    action: str = "auto_repair"  # "auto_repair", "avoid_point", "mark_impassable"
    avoid_coordinate: Optional[Coordinate] = None
    disaster_type: str = "ALL_HAZARDS"
    vehicle_profile: str = "STANDARD_VEHICLE"
    hazard_barriers: List[HazardBarrier] = []



class LiveMonitoringEvent(BaseModel):
    event_type: str  # "status_update", "severity_changed", "corridor_alert", "heartbeat"
    route_id: str
    timestamp: float
    severity_level: str  # "LOW", "MODERATE", "CRITICAL"
    message: str
    affected_sample_id: Optional[str] = None
    affected_segment_id: Optional[str] = None
    updated_viability_score: Optional[float] = None
    remaining_distance_km: Optional[float] = None


# --- New models for Tier 1 + Tier 2 features ---

class EvacuationExposure(BaseModel):
    affected_population: int = 0
    estimated_vehicles: int = 0
    clearance_time_min_low: float = 0.0  # optimistic (100% compliance, all lanes)
    clearance_time_min_high: float = 0.0  # conservative (50% compliance)
    evacuation_radius_km: float = 10.0
    source: str = "US Census Bureau ACS"


class WeatherSnapshot(BaseModel):
    temperature_f: Optional[float] = None
    temperature_c: Optional[float] = None
    wind_speed_mph: Optional[float] = None
    wind_direction_deg: Optional[float] = None
    wind_direction_label: str = ""
    precipitation_mm: Optional[float] = None
    weather_code: Optional[int] = None
    weather_description: str = ""
    warnings: List[str] = []
    corridor_wind_alignment: str = ""  # "headwind", "tailwind", "crosswind"
    timestamp: Optional[float] = None


class HistoricalIncident(BaseModel):
    incident_type: str  # "Fire", "Flood", "Earthquake", "Hurricane", "Severe Storm", etc.
    year: int
    title: str
    county: str = ""
    fips_code: str = ""
    source: str = "FEMA"


class AARCaseStudy(BaseModel):
    incident_name: str
    year: int
    location_name: str
    hazard_type: str  # "Wildfire", "Flood", "Hurricane", "Severe Storm"
    gridlock_cause: str
    agency_report: str  # e.g. "NIST Technical Note 2135", "FEMA USFA Case Study"
    lessons_learned: str
    mitigation_strategy: str
    latitude: float
    longitude: float
    distance_to_route_m: float = 0.0
    severity: str = "CRITICAL"  # "CRITICAL", "MODERATE"



class ShelterPOI(BaseModel):
    name: str
    poi_type: str  # "hospital", "fire_station", "shelter", "assembly_point"
    latitude: float
    longitude: float
    distance_to_route_m: float = 0.0
    nearest_route_id: str = ""


class FuelStop(BaseModel):
    name: str
    latitude: float
    longitude: float
    distance_to_route_m: float = 0.0
    distance_along_route_km: float = 0.0
    nearest_route_id: str = ""


class DeadZone(BaseModel):
    start_km: float
    end_km: float
    length_km: float
    reason: str
    route_id: str = ""


class HazardIsochrone(BaseModel):
    time_min: int  # 30, 60, 120
    polygon_coordinates: List[List[float]] = []  # [[lon, lat], ...]
    area_sq_km: float = 0.0
    hazard_front_speed_kmh: float = 0.0
    color: str = "#ef4444"


class TimeCutoffAssessment(BaseModel):
    time_to_cutoff_min: Optional[float] = None
    intercept_distance_km: Optional[float] = None
    intercept_latitude: Optional[float] = None
    intercept_longitude: Optional[float] = None
    urgency_level: str = "CLEAR"  # "IMMINENT", "CRITICAL", "ELEVATED", "CLEAR"
    spread_rate_kmh: float = 0.0
    hazard_origin_description: str = ""
    clearance_deadline_iso: Optional[str] = None
    isochrones: List[HazardIsochrone] = []



class RoadCapacitySummary(BaseModel):
    avg_lanes: float = 2.0
    min_lanes: int = 1
    estimated_throughput_veh_hr: int = 0
    chokepoints: List[Dict[str, Any]] = []
    road_class_breakdown: Dict[str, float] = {}  # e.g. {"motorway": 0.6, "primary": 0.3, "secondary": 0.1}


class CapacityAnalysis(BaseModel):
    total_system_throughput_veh_hr: int = 0
    shared_segment_conflicts: List[Dict[str, Any]] = []
    contraflow_candidates: List[Dict[str, Any]] = []
    per_route_capacity: Dict[str, int] = {}


class ZoneDefinition(BaseModel):
    zone_id: str
    center: Coordinate
    radius_km: float = 10.0
    label: str = ""
    estimated_population: int = 0


class ZoneAssignment(BaseModel):
    zone_id: str
    destination_label: str
    destination: Coordinate
    route_id: str
    viability_score: float = 0.0
    travel_time_min: float = 0.0
    distance_km: float = 0.0


class Route(BaseModel):
    route_id: str
    geometry: GeoJSONLineString
    distance_m: float
    duration_s: float
    distance_km: float
    travel_time_min: float
    tag: Optional[str] = None
    samples: List[RouteSample] = []
    segments: List[RouteSegment] = []
    infrastructure_summary: Optional[Dict[str, Any]] = None
    viability_score: Optional[float] = None
    viability: Optional[RouteViability] = None
    bottlenecks: List[BottleneckInfo] = []
    # Tier 2 features (per-route)
    road_capacity: Optional[RoadCapacitySummary] = None
    comm_dead_zones: List[DeadZone] = []
    fuel_stops: List[FuelStop] = []
    aar_case_studies: List[AARCaseStudy] = []
    time_cutoff: Optional[TimeCutoffAssessment] = None


class SegmentRepairResponse(BaseModel):
    success: bool
    route: Route
    repaired_segment_id: str
    diff: SegmentRepairDiff
    agent_decision: Optional[AgentDecision] = None


class RouteAnalyzeResponse(BaseModel):
    origin: Location
    destination: Location
    waypoints: List[Location] = []
    routes: List[Route]
    sample_interval_m: float
    disaster_type: str = "ALL_HAZARDS"
    vehicle_profile: str = "STANDARD_VEHICLE"
    hazard_barriers: List[HazardBarrier] = []
    cache_hit: bool = False
    nbi_fallback_mode: bool = False
    agent_decision: Optional[AgentDecision] = None
    # Tier 1+2 enrichment
    evacuation_exposure: Optional[EvacuationExposure] = None
    weather_conditions: Optional[WeatherSnapshot] = None
    historical_incidents: List[HistoricalIncident] = []
    shelters: List[ShelterPOI] = []
    capacity_analysis: Optional[CapacityAnalysis] = None
    aar_case_studies: List[AARCaseStudy] = []
    time_cutoff: Optional[TimeCutoffAssessment] = None
    hazard_isochrones: List[HazardIsochrone] = []


class ZoneEvacuationRequest(BaseModel):
    zones: List[ZoneDefinition]
    destinations: List[Coordinate]
    destination_labels: List[str] = []
    disaster_type: str = "ALL_HAZARDS"
    vehicle_profile: str = "STANDARD_VEHICLE"


class ZoneEvacuationResponse(BaseModel):
    assignments: List[ZoneAssignment] = []
    total_affected_population: int = 0
    total_clearance_time_min: float = 0.0
    disaster_type: str = "ALL_HAZARDS"
