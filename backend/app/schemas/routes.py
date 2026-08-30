from typing import List, Optional, Union
from pydantic import BaseModel, Field
from app.models.route_models import Coordinate, Route, Location, HazardBarrier

class RouteGenerateRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate
    waypoints: Optional[List[Coordinate]] = Field(default_factory=list, max_length=15, description="Optional intermediate stop coordinates (max 15)")
    sample_interval_m: Optional[float] = Field(default=None, ge=50.0, le=5000.0, description="Optional sampling interval in meters [50m - 5000m]")
    disaster_type: Optional[str] = Field(default="ALL_HAZARDS", description="Active disaster mode: ALL_HAZARDS, WILDFIRE, FLOOD_HURRICANE, EARTHQUAKE, LANDSLIDE")
    vehicle_profile: Optional[str] = Field(default="STANDARD_VEHICLE", description="Vehicle fleet profile: STANDARD_VEHICLE, EMERGENCY_BUS, RESCUE_4X4, HEAVY_SUPPLY")
    hazard_barriers: Optional[List[HazardBarrier]] = Field(default_factory=list, description="Active roadblock and fire barrier exclusion zones")

class RouteGenerateResponse(BaseModel):
    routes: List[Route]

class RouteAnalyzeRequest(BaseModel):
    # Origin can be either a text query string or direct coordinates
    origin: Union[str, Coordinate] = Field(..., description="Origin location query or coordinate object")
    destination: Union[str, Coordinate] = Field(..., description="Destination location query or coordinate object")
    waypoints: Optional[List[Union[str, Coordinate]]] = Field(default_factory=list, max_length=15, description="Optional list of intermediate stop queries or coordinates (max 15)")
    sample_interval_m: Optional[float] = Field(default=None, ge=50.0, le=5000.0, description="Physical distance interval in meters for route sampling [50m - 5000m]")
    disaster_type: Optional[str] = Field(default="ALL_HAZARDS", description="Active disaster mode: ALL_HAZARDS, WILDFIRE, FLOOD_HURRICANE, EARTHQUAKE, LANDSLIDE")
    vehicle_profile: Optional[str] = Field(default="STANDARD_VEHICLE", description="Vehicle fleet profile: STANDARD_VEHICLE, EMERGENCY_BUS, RESCUE_4X4, HEAVY_SUPPLY")
    hazard_barriers: Optional[List[HazardBarrier]] = Field(default_factory=list, description="Active roadblock and fire barrier exclusion zones")
