"""
Pytest configuration and fixtures for backend tests
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from backend.src.index import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app"""
    return TestClient(app)


@pytest.fixture
def mock_trader_client():
    """Mock TraderClient for testing"""
    mock_client = MagicMock()
    mock_client.pairs_cache = AsyncMock()
    mock_client.trade = AsyncMock()
    return mock_client


@pytest.fixture
def sample_trader_address():
    """Sample trader address for testing"""
    return "0x1234567890123456789012345678901234567890"


@pytest.fixture
def sample_pair_data():
    """Sample pair data for testing"""
    return {
        "0": {
            "from": "ETH",
            "to": "USD",
            "pairIndex": 0,
            "feed": {
                "feedId": "test-feed-id"
            }
        }
    }


@pytest.fixture
def sample_trade_data():
    """Sample trade data for testing"""
    return {
        "positions": [
            {
                "pairIndex": 0,
                "index": 0,
                "collateral": 100000000,  # 100 USDC in 6 decimals
                "isLong": True,
                "leverage": 10,
            }
        ],
        "limitOrders": []
    }

