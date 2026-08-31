from typing import List, Optional, Union
from pydantic import BaseModel, Field
from app.models.route_models import Coordinate, Route, Location, IncidentContext

class RouteGenerateRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate
    waypoints: Optional[List[Coordinate]] = Field(default_factory=list, description="Optional intermediate stop coordinates")
    sample_interval_m: Optional[float] = Field(default=None, description="Optional sampling interval in meters")
    disaster_type: Optional[str] = Field(default="ALL_HAZARDS", description="Active disaster mode: ALL_HAZARDS, WILDFIRE, FLOOD_HURRICANE, EARTHQUAKE, LANDSLIDE")
    incident_context: Optional[IncidentContext] = Field(default=None, description="Optional structured incident context")

class RouteGenerateResponse(BaseModel):
    routes: List[Route]

class RouteAnalyzeRequest(BaseModel):
    # Origin can be either a text query string or direct coordinates
    origin: Union[str, Coordinate] = Field(..., description="Origin location query or coordinate object")
    destination: Union[str, Coordinate] = Field(..., description="Destination location query or coordinate object")
    waypoints: Optional[List[Union[str, Coordinate]]] = Field(default_factory=list, description="Optional list of intermediate stop queries or coordinates")
    sample_interval_m: Optional[float] = Field(default=None, description="Physical distance interval in meters for route sampling")
    disaster_type: Optional[str] = Field(default="ALL_HAZARDS", description="Active disaster mode: ALL_HAZARDS, WILDFIRE, FLOOD_HURRICANE, EARTHQUAKE, LANDSLIDE")
    incident_context: Optional[IncidentContext] = Field(default=None, description="Optional structured incident context")

