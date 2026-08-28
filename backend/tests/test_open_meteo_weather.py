from unittest.mock import MagicMock, patch

import pytest

from app.services.open_meteo_service import open_meteo_service


@pytest.mark.asyncio
async def test_fetch_weather_bulk_success():
    payload = {
        "current": {
            "temperature_2m": 23.4,
            "precipitation": 1.2,
            "rain": 1.0,
            "showers": 0.2,
            "snowfall": 0.0,
            "wind_speed_10m": 18.5,
            "wind_gusts_10m": 32.0,
            "weather_code": 63,
        },
        "hourly": {
            "precipitation_probability": [70, 15],
            "visibility": [8000, 12000],
            "relative_humidity_2m": [61, 40],
        },
    }

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = payload
        mock_get.return_value = mock_resp

        results = await open_meteo_service.fetch_weather_bulk([(37.77, -122.42)])

    assert len(results) == 1
    assert results[0]["temperature_c"] == 23.4
    assert results[0]["precipitation_probability_pct"] == 70
    assert results[0]["wind_gust_kmh"] == 32.0
    assert results[0]["visibility_m"] == 8000
    assert results[0]["forecast_hour_offset"] == 0
    assert results[0]["weather_source"] == "Open-Meteo Forecast (ETA-aligned)"


@pytest.mark.asyncio
async def test_fetch_weather_bulk_uses_eta_hour_offset():
    payload = {
        "current": {
            "temperature_2m": 23.4,
            "precipitation": 1.2,
            "rain": 1.0,
            "showers": 0.2,
            "snowfall": 0.0,
            "wind_speed_10m": 18.5,
            "wind_gusts_10m": 32.0,
            "weather_code": 63,
        },
        "hourly": {
            "precipitation_probability": [10, 20, 90],
            "visibility": [16000, 12000, 3000],
            "relative_humidity_2m": [35, 40, 88],
        },
    }

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = payload
        mock_get.return_value = mock_resp

        results = await open_meteo_service.fetch_weather_bulk([(37.79, -122.44)], hour_offsets=[2])

    assert results[0]["precipitation_probability_pct"] == 90
    assert results[0]["visibility_m"] == 3000
    assert results[0]["relative_humidity_pct"] == 88
    assert results[0]["forecast_hour_offset"] == 2


@pytest.mark.asyncio
async def test_fetch_weather_bulk_handles_api_failure():
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "upstream error"
        mock_get.return_value = mock_resp

        results = await open_meteo_service.fetch_weather_bulk([(37.78, -122.43)])

    assert results == [None]