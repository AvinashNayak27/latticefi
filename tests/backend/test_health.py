"""
Health check endpoint tests
"""
import pytest
from fastapi.testclient import TestClient
from backend.src.index import app

client = TestClient(app)


def test_health_endpoint():
    """Test that health endpoint returns ok status"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_endpoint_method_not_allowed():
    """Test that POST method is not allowed on health endpoint"""
    response = client.post("/health")
    assert response.status_code == 405  # Method Not Allowed

