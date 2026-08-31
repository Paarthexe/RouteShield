import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.models.route_models import Location, Route, GeoJSONLineString, RouteSample, AgentDecision
from app.services.geocoding import geocoding_service

client = TestClient(app)


@patch("app.services.geocoding.GeocodingService._nominatim_geocode", new_callable=AsyncMock)
def test_analyze_endpoint_uses_nominatim_fallback_without_mireye_key(mock_nominatim):
    original_key = geocoding_service.mireye_api_key
    geocoding_service.mireye_api_key = ""
    mock_nominatim.return_value = Location(
        query="New Delhi Railway Station",
        latitude=28.6430,
        longitude=77.2194,
        display_name="Resolved by fallback"
    )

    try:
        response = client.post("/api/location/resolve", json={"query": "New Delhi Railway Station"})
        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] == "Resolved by fallback"
    finally:
        geocoding_service.mireye_api_key = original_key

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "subsystems" in data


@patch("app.api.routes.isochrone_service.evaluate_all_routes")
@patch("app.api.routes.aar_service.match_all_routes", new_callable=AsyncMock)
@patch("app.api.routes.capacity_service.analyze_network_capacity")
@patch("app.api.routes.poi_service.find_corridor_shelters_and_pois", new_callable=AsyncMock)
@patch("app.api.routes.incident_service.get_historical_incidents", new_callable=AsyncMock)
@patch("app.api.routes.population_service.estimate_evacuation_exposure", new_callable=AsyncMock)
@patch("app.api.routes.weather_service.get_route_weather_snapshot", new_callable=AsyncMock)
@patch("app.api.routes.fuel_service.evaluate_route_refueling")
@patch("app.api.routes.connectivity_service.detect_communication_dead_zones")
@patch("app.services.routing.routing_service.generate_and_analyze")
def test_analyze_endpoint_tolerates_enrichment_failures(
    mock_generate_and_analyze,
    mock_connectivity,
    mock_fuel,
    mock_weather,
    mock_population,
    mock_incidents,
    mock_shelters,
    mock_capacity,
    mock_aar,
    mock_isochrones,
):
    mock_route = Route(
        route_id="route_1",
        geometry=GeoJSONLineString(type="LineString", coordinates=[[-122.5209, 37.96854], [-122.09312, 37.64121]]),
        distance_m=15000.0,
        duration_s=1200.0,
        distance_km=15.0,
        travel_time_min=20.0,
        tag="Fastest Evacuation Corridor",
        samples=[
            RouteSample(sample_id="route_1_sample_001", route_id="route_1", latitude=37.96854, longitude=-122.5209, distance_from_origin_m=0.0),
            RouteSample(sample_id="route_1_sample_002", route_id="route_1", latitude=37.64121, longitude=-122.09312, distance_from_origin_m=15000.0),
        ],
    )
    mock_decision = AgentDecision(primary_route_id="route_1", executive_summary="ok", disaster_type="WILDFIRE")
    mock_generate_and_analyze.return_value = ([mock_route], mock_decision)

    mock_connectivity.side_effect = RuntimeError("connectivity boom")
    mock_fuel.side_effect = RuntimeError("fuel boom")
    mock_weather.side_effect = RuntimeError("weather boom")
    mock_population.side_effect = RuntimeError("population boom")
    mock_incidents.side_effect = RuntimeError("incidents boom")
    mock_shelters.side_effect = RuntimeError("shelters boom")
    mock_capacity.side_effect = RuntimeError("capacity boom")
    mock_aar.side_effect = RuntimeError("aar boom")
    mock_isochrones.side_effect = RuntimeError("isochrone boom")

    response = client.post("/api/routes/analyze", json={
        "origin": {"latitude": 37.96854, "longitude": -122.52090},
        "destination": {"latitude": 37.64121, "longitude": -122.09312},
        "disaster_type": "WILDFIRE",
        "sample_interval_m": 500
    })

    assert response.status_code == 200
    data = response.json()
    assert data["routes"][0]["route_id"] == "route_1"
    assert data["agent_decision"]["primary_route_id"] == "route_1"
    assert data["weather_conditions"] is None
    assert data["evacuation_exposure"] is None
    assert data["historical_incidents"] == []
    assert data["shelters"] == []
    assert data["capacity_analysis"] is None
    assert data["aar_case_studies"] == []
    assert data["hazard_isochrones"] == []

@patch("app.services.geocoding.geocoding_service.resolve_location")
@patch("app.services.routing.routing_service.generate_and_analyze")
def test_analyze_endpoint_e2e(mock_generate_and_analyze, mock_geocoding):
    mock_geocoding.side_effect = lambda query: Location(
        query=query,
        latitude=28.6430 if "Station" in query else 28.5562,
        longitude=77.2194 if "Station" in query else 77.1000,
        display_name=f"Resolved {query}"
    )

    mock_route = Route(
        route_id="route_1",
        geometry=GeoJSONLineString(type="LineString", coordinates=[[77.2194, 28.6430], [77.1000, 28.5562]]),
        distance_m=15000.0,
        duration_s=1200.0,
        distance_km=15.0,
        travel_time_min=20.0,
        tag="Fastest Evacuation Corridor",
        samples=[
            RouteSample(
                sample_id="route_1_sample_001",
                route_id="route_1",
                latitude=28.6430,
                longitude=77.2194,
                distance_from_origin_m=0.0
            ),
            RouteSample(
                sample_id="route_1_sample_002",
                route_id="route_1",
                latitude=28.5562,
                longitude=77.1000,
                distance_from_origin_m=15000.0
            )
        ]
    )

    mock_decision = AgentDecision(
        primary_route_id="route_1",
        executive_summary="Test summary",
        disaster_type="ALL_HAZARDS",
    )

    # generate_and_analyze returns (routes, agent_decision) tuple
    mock_generate_and_analyze.return_value = ([mock_route], mock_decision)

    payload = {
        "origin": "New Delhi Railway Station",
        "destination": "Indira Gandhi International Airport",
        "sample_interval_m": 500
    }

    response = client.post("/api/routes/analyze", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["origin"]["query"] == "New Delhi Railway Station"
    assert data["destination"]["query"] == "Indira Gandhi International Airport"
    assert len(data["routes"]) == 1
    assert data["routes"][0]["route_id"] == "route_1"
    assert len(data["routes"][0]["samples"]) == 2
    assert data["agent_decision"]["primary_route_id"] == "route_1"
