from typing import Optional

from .config import settings


_trader_client = None


def get_trader_client():
    """Lazy-initialize and return a singleton TraderClient.

    We import the SDK inside the function so the app can start even if
    dependencies are being installed, and to make testing easier.
    """
    global _trader_client
    if _trader_client is None:
        # Import here to avoid slowing module import time
        from avantis_trader_sdk import TraderClient

        _trader_client = TraderClient(settings.provider_url)
    return _trader_client


