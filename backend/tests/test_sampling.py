import pytest
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
