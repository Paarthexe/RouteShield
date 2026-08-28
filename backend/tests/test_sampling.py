import pytest
from unittest.mock import AsyncMock, patch
from app.services.sampling import sampling_service
from app.models.route_models import GeoJSONLineString

@pytest.mark.asyncio
async def test_sampling_1km_route_500m_interval():
    geometry = GeoJSONLineString(
        type="LineString",
        coordinates=[
            [0.0, 0.0],
            [0.008983, 0.0]
        ]
    )

    samples = await sampling_service.sample_route("route_test", geometry, interval_m=500.0)

    assert len(samples) >= 3
    assert samples[0].distance_from_origin_m == 0.0
    assert samples[0].latitude == 0.0
    assert samples[0].longitude == 0.0
    assert abs(samples[1].distance_from_origin_m - 500.0) < 5.0

@pytest.mark.asyncio
async def test_sampling_route_shorter_than_interval():
    geometry = GeoJSONLineString(
        type="LineString",
        coordinates=[
            [0.0, 0.0],
            [0.001796, 0.0]
        ]
    )

    samples = await sampling_service.sample_route("short_route", geometry, interval_m=500.0)

    assert len(samples) == 2
    assert samples[0].distance_from_origin_m == 0.0
    assert abs(samples[1].distance_from_origin_m - 200.0) < 5.0

@pytest.mark.asyncio
async def test_sampling_endpoint_not_divisible():
    geometry = GeoJSONLineString(
        type="LineString",
        coordinates=[
            [0.0, 0.0],
            [0.01078, 0.0]
        ]
    )

    samples = await sampling_service.sample_route("indivisible_route", geometry, interval_m=500.0)

    distances = [s.distance_from_origin_m for s in samples]
    assert distances[0] == 0.0
    assert abs(distances[1] - 500.0) < 5.0
    assert abs(distances[2] - 1000.0) < 5.0

@pytest.mark.asyncio
async def test_sampling_empty_or_single_point_geometry():
    empty_geo = GeoJSONLineString(type="LineString", coordinates=[])
    res = await sampling_service.sample_route("empty", empty_geo)
    assert res == []

    single_geo = GeoJSONLineString(type="LineString", coordinates=[[10.0, 20.0]])
    single_samples = await sampling_service.sample_route("single", single_geo)
    assert len(single_samples) == 1
    assert single_samples[0].latitude == 20.0
    assert single_samples[0].longitude == 10.0


@pytest.mark.asyncio
async def test_sampling_passes_eta_aligned_weather_offsets():
    geometry = GeoJSONLineString(
        type="LineString",
        coordinates=[
            [0.0, 0.0],
            [0.026949, 0.0],
        ]
    )

    with patch("app.services.sampling.open_meteo_service.fetch_elevations_bulk", new=AsyncMock(return_value=[None, None, None, None])) as _elev, \
         patch("app.services.sampling.open_meteo_service.fetch_weather_bulk", new=AsyncMock(return_value=[None, None, None, None])) as mock_weather, \
         patch("app.services.sampling.traffic_service.fetch_point_alerts", new=AsyncMock(return_value=[])), \
         patch("app.services.sampling.traffic_service.fetch_tomtom_traffic_flow", new=AsyncMock(return_value=None)), \
         patch("app.services.sampling.traffic_service.fetch_corridor_alerts", new=AsyncMock(return_value={})), \
         patch("app.services.sampling.mireye_data_service.fetch_location_facts", new=AsyncMock(return_value=None)):
        await sampling_service.sample_route(
            "eta_route",
            geometry,
            interval_m=1000.0,
            estimated_duration_s=10800.0,
        )

    hour_offsets = mock_weather.await_args.kwargs["hour_offsets"]
    assert hour_offsets[0] == 0
    assert max(hour_offsets) >= 2
