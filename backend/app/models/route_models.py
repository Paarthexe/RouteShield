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


class Route(BaseModel):
    route_id: str
    geometry: GeoJSONLineString
    distance_m: float
    duration_s: float
    distance_km: float
    travel_time_min: float
    tag: Optional[str] = None
    samples: List[RouteSample] = []
    infrastructure_summary: Optional[Dict[str, Any]] = None
    viability_score: Optional[float] = None


class RouteAnalyzeResponse(BaseModel):
    origin: Location
    destination: Location
    waypoints: List[Location] = []
    routes: List[Route]
    sample_interval_m: float
    cache_hit: bool = False
