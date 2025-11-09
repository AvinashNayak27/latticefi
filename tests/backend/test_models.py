"""
Pydantic models validation tests
"""
import pytest
from pydantic import ValidationError
from backend.src.models import (
    OpenTradeRequest,
    CloseTradeRequest,
    CancelOrderRequest,
    UpdateTpSlRequest,
    BuildTxResponse,
)


def test_open_trade_request_valid():
    """Test valid OpenTradeRequest creation"""
    request = OpenTradeRequest(
        trader_address="0x1234567890123456789012345678901234567890",
        pair="ETH/USD",
        collateral_in_trade=100.0,
        is_long=True,
        leverage=10,
        tp=2000.0,
        sl=1800.0,
        slippage_percentage=1,
        order_type="MARKET",
    )
    assert request.trader_address == "0x1234567890123456789012345678901234567890"
    assert request.pair == "ETH/USD"
    assert request.collateral_in_trade == 100.0
    assert request.is_long is True
    assert request.leverage == 10


def test_open_trade_request_with_pair_index():
    """Test OpenTradeRequest with pair_index instead of pair"""
    request = OpenTradeRequest(
        trader_address="0x1234567890123456789012345678901234567890",
        pair_index=0,
        collateral_in_trade=100.0,
        is_long=True,
        leverage=10,
    )
    assert request.pair_index == 0
    assert request.pair is None


def test_open_trade_request_defaults():
    """Test OpenTradeRequest with default values"""
    request = OpenTradeRequest(
        trader_address="0x1234567890123456789012345678901234567890",
        collateral_in_trade=100.0,
        is_long=True,
        leverage=10,
    )
    assert request.tp == 0
    assert request.sl == 0
    assert request.slippage_percentage == 1
    assert request.order_type == "MARKET"


def test_open_trade_request_invalid_slippage():
    """Test OpenTradeRequest with invalid slippage percentage"""
    with pytest.raises(ValidationError):
        OpenTradeRequest(
            trader_address="0x1234567890123456789012345678901234567890",
            collateral_in_trade=100.0,
            is_long=True,
            leverage=10,
            slippage_percentage=101,  # Invalid: > 100
        )


def test_close_trade_request_valid():
    """Test valid CloseTradeRequest creation"""
    request = CloseTradeRequest(
        trader_address="0x1234567890123456789012345678901234567890",
        pair_index=0,
        index=0,
        close_percent=100.0,
    )
    assert request.trader_address == "0x1234567890123456789012345678901234567890"
    assert request.pair_index == 0
    assert request.index == 0
    assert request.close_percent == 100.0


def test_close_trade_request_with_collateral():
    """Test CloseTradeRequest with collateral_to_close"""
    request = CloseTradeRequest(
        trader_address="0x1234567890123456789012345678901234567890",
        pair_index=0,
        index=0,
        collateral_to_close=50.0,
    )
    assert request.collateral_to_close == 50.0


def test_cancel_order_request_valid():
    """Test valid CancelOrderRequest creation"""
    request = CancelOrderRequest(
        trader_address="0x1234567890123456789012345678901234567890",
        pair_index=0,
        trade_index=0,
    )
    assert request.pair_index == 0
    assert request.trade_index == 0


def test_update_tp_sl_request_valid():
    """Test valid UpdateTpSlRequest creation"""
    request = UpdateTpSlRequest(
        trader_address="0x1234567890123456789012345678901234567890",
        pair_index=0,
        trade_index=0,
        tp=2000.0,
        sl=1800.0,
    )
    assert request.tp == 2000.0
    assert request.sl == 1800.0


def test_build_tx_response_valid():
    """Test valid BuildTxResponse creation"""
    response = BuildTxResponse(
        to="0x1234567890123456789012345678901234567890",
        data="0xabcdef",
        value="0x0",
        chainId=8453,
    )
    assert response.to == "0x1234567890123456789012345678901234567890"
    assert response.data == "0xabcdef"
    assert response.chainId == 8453


def test_build_tx_response_optional_fields():
    """Test BuildTxResponse with optional fields"""
    response = BuildTxResponse()
    assert response.to is None
    assert response.data is None
    assert response.value is None
    assert response.chainId is None

