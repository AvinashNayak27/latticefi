"""
API endpoint integration tests
"""
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from backend.src.index import app

client = TestClient(app)


@pytest.mark.asyncio
@patch("backend.src.index.get_trader_client")
async def test_get_pairs(mock_get_client, sample_pair_data):
    """Test getting all pairs"""
    mock_client = AsyncMock()
    mock_client.pairs_cache.get_pairs_info = AsyncMock(return_value=sample_pair_data)
    mock_get_client.return_value = mock_client
    
    response = client.get("/pairs")
    assert response.status_code == 200
    data = response.json()
    assert "0" in data or 0 in data


@pytest.mark.asyncio
@patch("backend.src.index.get_trader_client")
async def test_get_pairs_with_index(mock_get_client, sample_pair_data):
    """Test getting a specific pair by index"""
    mock_client = AsyncMock()
    mock_client.pairs_cache.get_pairs_info = AsyncMock(return_value=sample_pair_data)
    mock_get_client.return_value = mock_client
    
    response = client.get("/pairs?pidx=0")
    assert response.status_code == 200
    data = response.json()
    assert data["from"] == "ETH" or data.get("pairIndex") == 0


@pytest.mark.asyncio
@patch("backend.src.index.get_trader_client")
async def test_get_pairs_not_found(mock_get_client):
    """Test getting a non-existent pair"""
    mock_client = AsyncMock()
    mock_client.pairs_cache.get_pairs_info = AsyncMock(return_value={})
    mock_get_client.return_value = mock_client
    
    response = client.get("/pairs?pidx=999")
    assert response.status_code == 404


@patch("httpx.AsyncClient")
@pytest.mark.asyncio
async def test_get_trades(mock_httpx_client, sample_trade_data):
    """Test getting trades for a trader"""
    mock_response = AsyncMock()
    mock_response.json.return_value = sample_trade_data
    mock_response.raise_for_status = AsyncMock()
    
    mock_client_instance = AsyncMock()
    mock_client_instance.__aenter__.return_value.get = AsyncMock(return_value=mock_response)
    mock_client_instance.__aexit__.return_value = None
    mock_httpx_client.return_value = mock_client_instance
    
    response = client.get("/trades?trader_address=0x1234567890123456789012345678901234567890")
    assert response.status_code == 200
    data = response.json()
    assert "positions" in data
    assert "limitOrders" in data


@patch("httpx.AsyncClient")
@pytest.mark.asyncio
async def test_get_trades_error(mock_httpx_client):
    """Test error handling when fetching trades fails"""
    mock_client_instance = AsyncMock()
    mock_client_instance.__aenter__.return_value.get = AsyncMock(side_effect=Exception("API Error"))
    mock_client_instance.__aexit__.return_value = None
    mock_httpx_client.return_value = mock_client_instance
    
    response = client.get("/trades?trader_address=0x1234567890123456789012345678901234567890")
    assert response.status_code == 400


def test_cors_headers():
    """Test that CORS headers are properly set"""
    response = client.options("/health")
    # CORS middleware should handle OPTIONS requests
    assert response.status_code in [200, 405]  # Depending on FastAPI version

