import pytest
from app.services.infrastructure_service import (
    haversine_distance,
    point_to_segment_distance,
    infrastructure_service
)

def test_point_to_segment_distance():
    # Segment along equator from (0.0, 0.0) to (0.0, 1.0)
    # Point at (0.005, 0.5) which is ~550m north of midpoint
    dist, t = point_to_segment_distance(0.005, 0.5, 0.0, 0.0, 0.0, 1.0)
    assert 500.0 < dist < 600.0
    assert 0.49 < t < 0.51

def test_infrastructure_filter_and_project():
    geometry_coords = [[-122.40, 37.75], [-122.30, 37.75], [-122.20, 37.75]]
    elements = [
        # Near route (gas station ~200m north)
        {
            "id": 101,
            "lat": 37.752,
            "lon": -122.35,
            "tags": {"amenity": "fuel", "brand": "Chevron", "name": "Chevron Gas", "capacity": "12"}
        },
        # Near route (Fast EV charger ~400m south)
        {
            "id": 102,
            "lat": 37.746,
            "lon": -122.25,
            "tags": {"amenity": "charging_station", "brand": "Tesla", "name": "Tesla Supercharger", "capacity": "8"}
        },
        # Near route (Standard AC EV charger ~300m north)
        {
            "id": 103,
            "lat": 37.753,
            "lon": -122.30,
            "tags": {"amenity": "charging_station", "name": "Hotel Parking Charger", "capacity": "2"}
        },
        # Far off route (~5km away, should be filtered out)
        {
            "id": 104,
            "lat": 37.795,
            "lon": -122.35,
            "tags": {"amenity": "fuel", "brand": "Shell"}
        }
    ]

    res = infrastructure_service._filter_and_project_stations(elements, geometry_coords, total_distance_m=18000.0)
    assert res["total_gas_stations"] == 1
    assert res["total_ev_fast_stations"] == 1
    assert res["total_ev_standard_stations"] == 1
    assert res["total_ev_chargers"] == 2
    assert res["gas_stations"][0]["brand"] == "Chevron"
    assert res["gas_stations"][0]["stalls_display"] == "12 Pumps"
    assert res["ev_fast_stations"][0]["brand"] == "Tesla"
    assert res["ev_fast_stations"][0]["stalls_display"] == "8 Fast Stalls"
    assert res["ev_fast_stations"][0]["speed_tier"] == "fast"
    assert res["ev_standard_stations"][0]["speed_tier"] == "standard"
    assert res["max_gas_gap_km"] > 0.0

def test_fuel_desert_warning_and_penalty():
    # ~61.6 km route with no stations
    geometry_coords = [[-122.60, 37.75], [-121.90, 37.75]]
    res = infrastructure_service._filter_and_project_stations([], geometry_coords, total_distance_m=61600.0)
    assert res["total_gas_stations"] == 0
    assert res["total_ev_chargers"] == 0
    assert res["max_gas_gap_km"] > 45.0
    assert "Fuel desert" in res["fuel_desert_warning"]
    assert res["infrastructure_penalty"] > 0.0
