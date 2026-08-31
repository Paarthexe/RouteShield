import pytest
import time
from app.models.route_models import (
    Route,
    GeoJSONLineString,
    RouteSample,
    ZoneDefinition,
    Coordinate,
    ZoneEvacuationRequest
)
from app.services.weather_service import weather_service
from app.services.population_service import population_service
from app.services.capacity_service import capacity_service
from app.services.incident_service import incident_service
from app.services.poi_service import poi_service
from app.services.connectivity_service import connectivity_service
from app.services.infrastructure_service import infrastructure_service
from app.services.zone_service import zone_service
from app.services.cache import cache_service

@pytest.mark.asyncio
async def test_weather_service_returns_snapshot():
    snapshot = await weather_service.get_route_weather_snapshot(39.7596, -121.6219, 39.7285, -121.8375)
    assert snapshot is not None
    assert snapshot.temperature_f is not None
    assert snapshot.wind_direction_label != ""
    assert snapshot.corridor_wind_alignment != ""

@pytest.mark.asyncio
async def test_population_ete_service():
    exposure = await population_service.estimate_evacuation_exposure(39.7596, -121.6219, radius_km=10.0)
    assert exposure.affected_population > 0
    assert exposure.estimated_vehicles > 0
    assert exposure.clearance_time_min_low > 0
    assert exposure.clearance_time_min_high >= exposure.clearance_time_min_low

def test_road_capacity_and_contraflow():
    geom = GeoJSONLineString(coordinates=[[-121.6219, 39.7596], [-121.7000, 39.7400], [-121.8375, 39.7285]])
    route = Route(
        route_id="route_1",
        geometry=geom,
        distance_m=20000.0,
        duration_s=1200.0,
        distance_km=20.0,
        travel_time_min=20.0
    )
    cap = capacity_service.analyze_route_road_capacity(route)
    assert cap.avg_lanes >= 2.0
    assert cap.estimated_throughput_veh_hr > 0

    analysis = capacity_service.analyze_network_capacity([route])
    assert analysis.total_system_throughput_veh_hr > 0
    assert len(analysis.contraflow_candidates) > 0

@pytest.mark.asyncio
async def test_historical_incidents_service():
    incidents = await incident_service.get_historical_incidents(39.7596, -121.6219, disaster_type="WILDFIRE")
    assert len(incidents) > 0
    assert any(inc.incident_type in ["Wildfire", "Fire", "Severe Storm", "Flood"] for inc in incidents)

@pytest.mark.asyncio
async def test_poi_shelters_service():
    geom = GeoJSONLineString(coordinates=[[-121.6219, 39.7596], [-121.8375, 39.7285]])
    route = Route(
        route_id="route_1",
        geometry=geom,
        distance_m=20000.0,
        duration_s=1200.0,
        distance_km=20.0,
        travel_time_min=20.0
    )
    pois = await poi_service.find_corridor_shelters_and_pois([route])
    assert len(pois) > 0
    assert any(p.poi_type in ["shelter", "hospital", "fire_station", "assembly_point"] for p in pois)

def test_connectivity_dead_zones_and_infrastructure_projection():
    samples = [
        RouteSample(sample_id=f"r1_{i}", route_id="r1", latitude=39.0 + (i * 0.01), longitude=-121.0 - (i * 0.01), distance_from_origin_m=i * 500.0, slope_pct=10.5 if 10 <= i <= 15 else 2.0)
        for i in range(30)
    ]
    route = Route(
        route_id="r1",
        geometry=GeoJSONLineString(coordinates=[[-121.0, 39.0], [-121.3, 39.3]]),
        distance_m=15000.0,
        duration_s=900.0,
        distance_km=15.0,
        travel_time_min=15.0,
        samples=samples
    )
    dead_zones = connectivity_service.detect_communication_dead_zones(route)
    assert len(dead_zones) > 0
    assert dead_zones[0].length_km > 0

    elements = [
        {
            "id": 101,
            "lat": 39.102,
            "lon": -121.102,
            "tags": {"amenity": "fuel", "brand": "Chevron", "name": "Chevron Gas", "capacity": "12"}
        },
        {
            "id": 102,
            "lat": 39.145,
            "lon": -121.145,
            "tags": {"amenity": "charging_station", "brand": "Tesla", "name": "Tesla Supercharger", "capacity": "8", "max_power": "250"}
        },
        {
            "id": 103,
            "lat": 39.175,
            "lon": -121.175,
            "tags": {"amenity": "charging_station", "name": "Hotel Parking Charger", "capacity": "2"}
        },
    ]
    infra = infrastructure_service.project_stations_for_route(elements, route.geometry.coordinates, route.distance_m)
    assert infra["total_gas_stations"] == 1
    assert infra["total_ev_fast_stations"] == 1
    assert infra["total_ev_standard_stations"] == 1
    assert infra["total_ev_chargers"] == 2
    assert infra["max_gas_gap_km"] > 0

@pytest.mark.asyncio
async def test_zone_evacuation_planner():
    req = ZoneEvacuationRequest(
        zones=[
            ZoneDefinition(zone_id="Zone A", center=Coordinate(latitude=39.7596, longitude=-121.6219), radius_km=5.0, estimated_population=6000),
            ZoneDefinition(zone_id="Zone B", center=Coordinate(latitude=39.7000, longitude=-121.5800), radius_km=4.0, estimated_population=3500),
        ],
        destinations=[
            Coordinate(latitude=39.7285, longitude=-121.8375),
            Coordinate(latitude=39.5138, longitude=-121.5564),
        ],
        destination_labels=["Chico Depot", "Oroville Staging"]
    )
    plan = await zone_service.plan_zone_evacuation(req)
    assert len(plan.assignments) == 2
    assert plan.total_affected_population == 9500
    assert plan.total_clearance_time_min > 0

def test_cache_ttl_expiration():
    cache_service.set("test_key", {"data": 123})
    assert cache_service.get("test_key") == {"data": 123}

@pytest.mark.asyncio
async def test_aar_case_studies_matching():
    from app.services.aar_service import aar_service
    # Paradise CA coordinates should match dynamic FEMA / NWS AAR records
    paradise_geom = GeoJSONLineString(coordinates=[[-121.6219, 39.7596], [-121.7500, 39.7400], [-121.8375, 39.7285]])
    route = Route(
        route_id="paradise_chico",
        geometry=paradise_geom,
        distance_m=22000.0,
        duration_s=1400.0,
        distance_km=22.0,
        travel_time_min=23.3
    )
    matches = await aar_service.match_route_aar_case_studies(route, disaster_type="WILDFIRE")
    assert len(matches) > 0
    assert matches[0].agency_report != ""
    assert matches[0].lessons_learned != ""
    assert matches[0].mitigation_strategy != ""

def test_isochrone_and_time_to_cutoff_service():
    from app.services.isochrone_service import isochrone_service
    from app.models.route_models import WeatherSnapshot
    
    geom = GeoJSONLineString(coordinates=[[-121.6219, 39.7596], [-121.7500, 39.7400], [-121.8375, 39.7285]])
    route = Route(
        route_id="paradise_chico",
        geometry=geom,
        distance_m=22000.0,
        duration_s=1400.0,
        distance_km=22.0,
        travel_time_min=23.3
    )
    weather = WeatherSnapshot(
        wind_speed_mph=25.0,
        wind_direction_deg=210.0,
        temperature_f=85.0
    )
    assessment = isochrone_service.evaluate_route_time_cutoff(route, disaster_type="WILDFIRE", weather=weather)
    assert assessment is not None
    assert assessment.time_to_cutoff_min is not None
    assert assessment.time_to_cutoff_min > 0
    assert assessment.spread_rate_kmh > 0
    assert len(assessment.isochrones) == 3
    assert assessment.urgency_level in ["IMMINENT", "CRITICAL", "ELEVATED", "CLEAR"]
    assert assessment.intercept_distance_km is not None



