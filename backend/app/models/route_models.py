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
    weather: Optional[Dict[str, Any]] = None
    hazards: Optional[List[Dict[str, Any]]] = None
    realtime_hazards: Optional[List[Dict[str, Any]]] = None
    traffic_flow: Optional[Dict[str, Any]] = None
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


class Route(BaseModel):
    route_id: str
    geometry: GeoJSONLineString
    distance_m: float
    duration_s: float
    distance_km: float
    travel_time_min: float
    tag: Optional[str] = None
    samples: List[RouteSample] = []
    infrastructure: Optional[Dict[str, Any]] = None
    infrastructure_summary: Optional[Dict[str, Any]] = None
    active_realtime_alerts: List[Dict[str, Any]] = []
    viability_score: Optional[float] = None
    viability: Optional[RouteViability] = None
    bottlenecks: List[BottleneckInfo] = []


class RouteAnalyzeResponse(BaseModel):
    origin: Location
    destination: Location
    waypoints: List[Location] = []
    routes: List[Route]
    sample_interval_m: float
    disaster_type: str = "ALL_HAZARDS"
    cache_hit: bool = False
    agent_decision: Optional[AgentDecision] = None
