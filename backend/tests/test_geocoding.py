import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from app.services.geocoding import GeocodingService
from app.models.route_models import Location

@pytest.mark.asyncio
async def test_resolve_location_mireye_success():
    service = GeocodingService()
    service.mireye_api_key = "test_key"
    
    mock_mireye_data = {
        "lat": 37.792554,
        "lng": -122.39863,
        "normalized_address": "100 Pine St, San Francisco, CA 94111",
        "provider": "geocodio"
    }

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_mireye_data
        mock_post.return_value = mock_resp

        location = await service.resolve_location("100 Pine St, San Francisco, CA")

        assert isinstance(location, Location)
        assert location.latitude == 37.792554
        assert location.longitude == -122.39863
        assert "100 Pine St" in location.display_name

@pytest.mark.asyncio
async def test_resolve_location_empty_query():
    service = GeocodingService()
    with pytest.raises(HTTPException) as excinfo:
        await service.resolve_location("   ")
    assert excinfo.value.status_code == 400

@pytest.mark.asyncio
async def test_resolve_location_missing_api_key():
    service = GeocodingService()
    service.mireye_api_key = ""
    with pytest.raises(HTTPException) as excinfo:
        await service.resolve_location("Uncached Test Address 999")
    assert excinfo.value.status_code == 500

@pytest.mark.asyncio
async def test_resolve_location_not_found():
    service = GeocodingService()
    service.mireye_api_key = "test_key"
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.text = "Not found"
        mock_post.return_value = mock_resp

        with pytest.raises(HTTPException) as excinfo:
            await service.resolve_location("nonexistent_place_123456789")
        assert excinfo.value.status_code == 404
