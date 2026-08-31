import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.models.route_models import Location, Route, GeoJSONLineString, RouteSample

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "Stage 1A" in data["stage"]

@patch("app.services.geocoding.geocoding_service.resolve_location")
@patch("app.services.routing.routing_service.generate_candidate_routes")
def test_analyze_endpoint_e2e(mock_routing, mock_geocoding):
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

    mock_routing.return_value = [mock_route]

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
    assert data["incident_context"]["disaster_type"] == "ALL_HAZARDS"
    assert data["incident_context"]["context_mode"] == "SUSCEPTIBILITY"


@patch("app.services.geocoding.geocoding_service.resolve_location")
@patch("app.services.routing.routing_service.generate_and_analyze")
def test_analyze_endpoint_accepts_explicit_incident_context(mock_generate_and_analyze, mock_geocoding):
    def geocode_side_effect(query):
        if "Paradise" in query:
            return Location(
                query=query,
                latitude=39.7596,
                longitude=-121.6219,
                display_name=f"Resolved {query}"
            )
        return Location(
            query=query,
            latitude=39.7285,
            longitude=-121.8375,
            display_name=f"Resolved {query}"
        )

    mock_geocoding.side_effect = geocode_side_effect

    mock_route = Route(
        route_id="route_1",
        geometry=GeoJSONLineString(type="LineString", coordinates=[[-121.6219, 39.7596], [-121.8375, 39.7285]]),
        distance_m=25000.0,
        duration_s=1800.0,
        distance_km=25.0,
        travel_time_min=30.0,
        tag="Fastest Evacuation Corridor",
        samples=[],
    )

    mock_generate_and_analyze.return_value = ([mock_route], None)

    payload = {
        "origin": "Paradise, CA",
        "destination": "Chico, CA",
        "disaster_type": "WILDFIRE",
        "incident_context": {
            "disaster_type": "WILDFIRE",
            "context_mode": "HISTORICAL",
            "event_name": "Camp Fire",
            "confidence": "high",
            "source": "historical perimeter"
        }
    }

    response = client.post("/api/routes/analyze", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["incident_context"]["disaster_type"] == "WILDFIRE"
    assert data["incident_context"]["context_mode"] == "HISTORICAL"
    assert data["incident_context"]["event_name"] == "Camp Fire"
    assert data["incident_context"]["source"] == "historical perimeter"
