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
        assert routes[1].tag == "Alternative Evacuation Corridor 2"

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


def test_compute_traffic_adjusted_duration():
    from app.services.sampling import compute_traffic_adjusted_duration
    from app.models.route_models import RouteSample

    # Test fallback to OSRM duration when no traffic data present
    samples_no_traffic = [
        RouteSample(sample_id="s1", route_id="r1", latitude=10.0, longitude=10.0, distance_from_origin_m=0.0),
        RouteSample(sample_id="s2", route_id="r1", latitude=10.1, longitude=10.1, distance_from_origin_m=10000.0)
    ]
    assert compute_traffic_adjusted_duration(samples_no_traffic, fallback_duration_s=600.0) == 600.0

    # Test TomTom probe speed scaling (30 km/h on 10 km segment = 1200 seconds)
    samples_with_traffic = [
        RouteSample(
            sample_id="s1",
            route_id="r1",
            latitude=10.0,
            longitude=10.0,
            distance_from_origin_m=0.0,
            traffic_flow={"current_speed_kmh": 30.0, "free_flow_speed_kmh": 60.0, "congestion_condition": "Heavy Congestion"}
        ),
        RouteSample(
            sample_id="s2",
            route_id="r1",
            latitude=10.1,
            longitude=10.1,
            distance_from_origin_m=10000.0,
            traffic_flow={"current_speed_kmh": 30.0, "free_flow_speed_kmh": 60.0, "congestion_condition": "Heavy Congestion"}
        )
    ]
    adj_dur = compute_traffic_adjusted_duration(samples_with_traffic, fallback_duration_s=600.0)
    assert adj_dur == 1200.0
