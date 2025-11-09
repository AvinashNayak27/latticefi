"""
Configuration tests
"""
import pytest
from backend.src.config import Settings


def test_settings_defaults():
    """Test that Settings has default values"""
    settings = Settings()
    assert settings.provider_url is not None
    assert isinstance(settings.allowed_origins, list)
    assert len(settings.allowed_origins) > 0


def test_settings_allowed_origins():
    """Test that allowed_origins contains expected values"""
    settings = Settings()
    assert "http://localhost:5173" in settings.allowed_origins
    assert "https://latticefi.vercel.app" in settings.allowed_origins


def test_settings_provider_url():
    """Test that provider_url is set to Base network"""
    settings = Settings()
    assert "base" in settings.provider_url.lower() or "alchemy" in settings.provider_url.lower()

