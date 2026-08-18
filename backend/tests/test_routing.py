import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from app.services.routing import RoutingService
from app.models.route_models import Coordinate

@pytest.mark.asyncio
async def test_generate_candidate_routes_success():
    service = RoutingService()
    
    mock_osrm_data = {
        "code": "Ok",
        "routes": [
            {
                "distance": 18400.0,
                "duration": 1440.0,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[77.2194, 28.6430], [77.1000, 28.5562]]
                }
            },
            {
                "distance": 20100.0,
                "duration": 1740.0,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[77.2194, 28.6430], [77.1500, 28.6000], [77.1000, 28.5562]]
                }
            }
        ]
    }

    origin = Coordinate(latitude=28.6430, longitude=77.2194)
    destination = Coordinate(latitude=28.5562, longitude=77.1000)

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_osrm_data
        mock_get.return_value = mock_resp

        routes = await service.generate_candidate_routes(origin, destination, sample_interval_m=1000.0)

        assert len(routes) == 2
        assert routes[0].route_id == "route_1"
        assert routes[0].distance_m == 18400.0
        assert routes[0].distance_km == 18.4
        assert routes[0].travel_time_min == 24.0
        assert routes[0].tag == "Fastest Evacuation Corridor"
        assert len(routes[0].samples) >= 2

        assert routes[1].route_id == "route_2"
        assert routes[1].tag == "Alternative Evacuation Corridor 1"

@pytest.mark.asyncio
async def test_generate_candidate_routes_no_routes():
    service = RoutingService()
    origin = Coordinate(latitude=28.6430, longitude=77.2194)
    destination = Coordinate(latitude=28.5562, longitude=77.1000)

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"code": "NoRoute", "routes": []}
        mock_get.return_value = mock_resp

        with pytest.raises(HTTPException) as excinfo:
            await service.generate_candidate_routes(origin, destination)
        assert excinfo.value.status_code == 404
