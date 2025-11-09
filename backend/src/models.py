from typing import Optional, Literal, Any, Dict, List, Tuple

from pydantic import BaseModel, Field


TradeInputOrderTypeLiteral = Literal[
    "MARKET",
    "LIMIT",
    "STOP_LIMIT",
    "MARKET_ZERO_FEE",
]


class OpenTradeRequest(BaseModel):
    trader_address: str = Field(..., description="EVM address of the trader")
    pair: Optional[str] = Field(
        None, description='Pair name like "ETH/USD". Supply either pair or pair_index.'
    )
    pair_index: Optional[int] = Field(
        None, description="Pair index. Supply either pair or pair_index."
    )
    collateral_in_trade: float = Field(..., description="Collateral amount in USDC")
    is_long: bool = Field(..., description="True for long, False for short")
    leverage: int = Field(..., description="Leverage multiplier, e.g. 25")
    tp: float = Field(0, description="Take profit price; 0 to skip")
    sl: float = Field(0, description="Stop loss price; 0 to skip")
    slippage_percentage: int = Field(1, ge=0, le=100)
    order_type: TradeInputOrderTypeLiteral = "MARKET"


class CloseTradeRequest(BaseModel):
    trader_address: str
    pair: Optional[str] = None
    pair_index: Optional[int] = None
    index: int = Field(..., description="Trade index for the pair (0, 1, ...)")
    slippage_percentage: float = Field(1.0, ge=0, le=100)
    close_percent: float = Field(100.0, ge=0, le=100, description="Percent to close")
    # New SDK behavior prefers an absolute collateral amount. Keep percent for
    # backward compatibility and also allow passing the absolute value.
    collateral_to_close: Optional[float] = Field(
        None,
        description="Absolute collateral to close in USDC. If not provided, computed from close_percent",
    )


class BuildTxResponse(BaseModel):
    to: Optional[str] = None
    data: Optional[str] = None
    value: Optional[str] = None
    chainId: Optional[int] = None
    raw: Optional[Dict[str, Any]] = None


class PairIndexRequest(BaseModel):
    pair: str


class GetTradesRequest(BaseModel):
    trader_address: str


class TradeExtended(BaseModel):
    # Minimal subset; surface raw so UI can pick fields
    raw: Dict[str, Any]


class PendingLimitOrderExtended(BaseModel):
    raw: Dict[str, Any]


class GetTradesResponse(BaseModel):
    trades: List[TradeExtended]
    pending_open_limit_orders: List[PendingLimitOrderExtended]


class CancelOrderRequest(BaseModel):
    trader_address: str
    pair_index: int
    trade_index: int


class UpdateTpSlRequest(BaseModel):
    trader_address: str
    pair_index: int
    trade_index: int
    tp: float = Field(0)
    sl: float = Field(0)


