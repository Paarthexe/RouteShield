from pydantic import BaseModel, Field

class LocationResolveRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Location name, address, or search query")

class LocationResolveResponse(BaseModel):
    query: str
    latitude: float
    longitude: float
    display_name: str
