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
    cache_hit: bool = False
    nbi_fallback_mode: bool = False
    agent_decision: Optional[AgentDecision] = None


