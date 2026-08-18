from typing import List, Optional, Union
from pydantic import BaseModel, Field
from app.models.route_models import Coordinate, Route, Location

class RouteGenerateRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate
    sample_interval_m: Optional[float] = Field(default=None, description="Optional sampling interval in meters")

class RouteGenerateResponse(BaseModel):
    routes: List[Route]

class RouteAnalyzeRequest(BaseModel):
    # Origin can be either a text query string or direct coordinates
    origin: Union[str, Coordinate] = Field(..., description="Origin location query or coordinate object")
    destination: Union[str, Coordinate] = Field(..., description="Destination location query or coordinate object")
    sample_interval_m: Optional[float] = Field(default=None, description="Physical distance interval in meters for route sampling")
