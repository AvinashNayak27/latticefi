import asyncio
import logging
from typing import Any, Dict, Optional, Set

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
import httpx

from .config import settings
from .avantis_client import get_trader_client
from .models import (
    OpenTradeRequest,
    CloseTradeRequest,
    BuildTxResponse,
    GetTradesResponse,
    TradeExtended,
    PendingLimitOrderExtended,
    CancelOrderRequest,
    UpdateTpSlRequest,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Lattice Trade Builder API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"📨 {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.info(f"✅ {request.method} {request.url.path} - Status: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"❌ {request.method} {request.url.path} - Error: {e}", exc_info=True)
        raise


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


def _normalize_tx(tx: Any) -> BuildTxResponse:
    """Best-effort normalization of SDK tx into fields usable by wallets.

    Returns minimal EVM tx fields and also a raw payload for debugging.
    """
    raw = jsonable_encoder(tx)

    def _get(key: str) -> Optional[Any]:
        if isinstance(tx, dict):
            return tx.get(key)
        try:
            return getattr(tx, key)
        except Exception:
            return None

    # Common keys the SDKs typically expose
    to = _get("to") or (raw.get("to") if isinstance(raw, dict) else None)
    data = _get("data") or _get("input") or (
        raw.get("data") if isinstance(raw, dict) else None
    )
    value = _get("value") or (raw.get("value") if isinstance(raw, dict) else None)
    chain_id = _get("chainId") or (raw.get("chainId") if isinstance(raw, dict) else None)

    # Convert ints to hex strings where appropriate
    if isinstance(value, int):
        value = hex(value)

    return BuildTxResponse(to=to, data=data, value=value, chainId=chain_id, raw=raw if isinstance(raw, dict) else None)


@app.get("/pairs")
async def get_pairs(pidx: int = None) -> Any:
    logger.info(f"📥 Fetching pairs{f' (pidx={pidx})' if pidx is not None else ''}")
    trader_client = get_trader_client()
    result = await trader_client.pairs_cache.get_pairs_info()
    
    if pidx is not None:
        # Defensive: keys might be int or str; allow both, else raise 404
        str_pidx = str(pidx)
        if str_pidx in result:
            logger.info(f"✅ Found pair with index {pidx}")
            return result[str_pidx]
        elif pidx in result:
            logger.info(f"✅ Found pair with index {pidx}")
            return result[pidx]
        else:
            logger.error(f"❌ Pair index '{pidx}' not found")
            raise HTTPException(status_code=404, detail=f"Pair index '{pidx}' not found.")
    logger.info(f"✅ Returning all pairs: {len(result)} pairs")
    return result


@app.get("/trades")
async def get_trades(trader_address: str):
    logger.info(f"📥 Fetching trades for trader: {trader_address}")
    try:
        api_url = f"https://core.avantisfi.com/user-data?trader={trader_address}"
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url)
            response.raise_for_status()
            data = response.json()
        logger.info(f"✅ Successfully fetched trades: {len(data.get('positions', []))} positions, {len(data.get('limitOrders', []))} limit orders")
        return data
    except httpx.HTTPError as e:
        logger.error(f"❌ HTTP error fetching trades: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to fetch trades from API: {e}") from e
    except Exception as e:
        logger.error(f"❌ Failed to get trades: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to get trades: {e}") from e


@app.post("/trades/open", response_model=BuildTxResponse)
async def build_open_trade_tx(req: OpenTradeRequest) -> BuildTxResponse:
    import logging
    logger = logging.getLogger(__name__)
    
    trader_client = get_trader_client()
    
    # Log incoming request
    logger.info(f"📥 Received open trade request: trader={req.trader_address}, pair={req.pair}, pair_index={req.pair_index}, collateral={req.collateral_in_trade}, leverage={req.leverage}, is_long={req.is_long}, tp={req.tp}, sl={req.sl}, order_type={req.order_type}")

    try:
        # Resolve pair index
        if req.pair_index is not None:
            pair_index = req.pair_index
            logger.info(f"✅ Using provided pair_index: {pair_index}")
        elif req.pair:
            pair_index = await trader_client.pairs_cache.get_pair_index(req.pair)
            logger.info(f"✅ Resolved pair '{req.pair}' to pair_index: {pair_index}")
        else:
            logger.error("❌ Neither pair nor pair_index provided")
            raise HTTPException(status_code=400, detail="Provide either pair or pair_index")

        # Import types lazily
        from avantis_trader_sdk.types import TradeInput, TradeInputOrderType

        trade_input = TradeInput(
            trader=req.trader_address,
            open_price=None,
            pair_index=pair_index,
            collateral_in_trade=req.collateral_in_trade,
            is_long=req.is_long,
            leverage=req.leverage,
            index=0,
            tp=req.tp or 0,
            sl=req.sl or 0,
            timestamp=0,
        )
        
        logger.info(f"🔧 Created TradeInput: {trade_input}")

        order_type = getattr(TradeInputOrderType, req.order_type)
        logger.info(f"📊 Order type: {order_type}")

        open_tx = await trader_client.trade.build_trade_open_tx(
            trade_input, order_type, req.slippage_percentage
        )
        
        logger.info(f"✅ Successfully built trade open tx: to={getattr(open_tx, 'to', None)}")

        return _normalize_tx(open_tx)
    except HTTPException:
        raise
    except Exception as e:
        # Provide readable error for frontend
        logger.error(f"❌ Failed to build open trade tx: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to build open trade tx: {e}") from e


@app.post("/trades/close", response_model=BuildTxResponse)
async def build_close_trade_tx(req: CloseTradeRequest) -> BuildTxResponse:
    import logging
    logger = logging.getLogger(__name__)
    
    trader_client = get_trader_client()
    
    logger.info(f"📥 Received close trade request: trader={req.trader_address}, pair={req.pair}, pair_index={req.pair_index}, index={req.index}, close_percent={req.close_percent}, collateral_to_close={req.collateral_to_close}")

    try:
        if req.pair_index is not None:
            pair_index = req.pair_index
        elif req.pair:
            pair_index = await trader_client.pairs_cache.get_pair_index(req.pair)
        else:
            raise HTTPException(status_code=400, detail="Provide either pair or pair_index")

        # Many SDKs expose a builder for close trade transactions.
        # Referenced in docs: https://sdk.avantisfi.com/trade.html (Closing a Trade)
        # We attempt to call the dedicated builder if available.
        build_close = getattr(trader_client.trade, "build_trade_close_tx", None)
        if build_close is None:
            raise HTTPException(status_code=500, detail="SDK does not expose build_trade_close_tx on this version")

        # SDK expects `trade_index` and `collateral_to_close` now.
        # We support both absolute `collateral_to_close` and percent-based `close_percent`.
        trade_index = req.index

        collateral_to_close = req.collateral_to_close
        if collateral_to_close is None:
            # Compute from percent by fetching the current open collateral
            # Percent is 0-100; default 100 if missing
            percent = req.close_percent or 100.0
            try:
                # Fetch data from the Avantis REST API
                api_url = f"https://core.avantisfi.com/user-data?trader={req.trader_address}"
                
                async with httpx.AsyncClient() as client:
                    response = await client.get(api_url)
                    response.raise_for_status()
                    data = response.json()
                
                positions = data.get("positions", [])
                
                # Find the specific trade by pair and index
                target = None
                for pos in positions:
                    if pos.get("pairIndex") == pair_index and pos.get("index") == trade_index:
                        target = pos
                        break
                
                if target is None:
                    raise HTTPException(status_code=404, detail="Trade not found to compute collateral_to_close")
                
                open_collateral = float(target.get("collateral", 0)) / 1e6  # Convert from 6 decimals to USDC
                if open_collateral == 0:
                    raise HTTPException(status_code=400, detail="Trade missing open_collateral to compute collateral_to_close")
                
                collateral_to_close = float(open_collateral) * float(percent) / 100.0
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to compute collateral_to_close: {e}") from e

        logger.info(f"🔧 Calling build_trade_close_tx with pair_index={pair_index}, trade_index={trade_index}, collateral_to_close={collateral_to_close}")
        
        close_tx = await build_close(
            pair_index=pair_index,
            trade_index=trade_index,
            collateral_to_close=collateral_to_close,
            trader=req.trader_address,
        )
        
        logger.info(f"✅ Successfully built trade close tx")

        return _normalize_tx(close_tx)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to build close trade tx: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to build close trade tx: {e}") from e


@app.post("/orders/cancel", response_model=BuildTxResponse)
async def build_order_cancel_tx(req: CancelOrderRequest) -> BuildTxResponse:
    import logging
    logger = logging.getLogger(__name__)
    
    trader_client = get_trader_client()
    
    logger.info(f"📥 Received cancel order request: trader={req.trader_address}, pair_index={req.pair_index}, trade_index={req.trade_index}")

    try:
        # Some SDK versions accept trader as optional. Pass it for compatibility.
        cancel_tx = await trader_client.trade.build_order_cancel_tx(
            pair_index=req.pair_index,
            trade_index=req.trade_index,
            trader=req.trader_address,
        )
        
        logger.info(f"✅ Successfully built cancel order tx")

        return _normalize_tx(cancel_tx)
    except Exception as e:
        logger.error(f"❌ Failed to build cancel order tx: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to build cancel order tx: {e}") from e


@app.post("/trades/tp-sl", response_model=BuildTxResponse)
async def build_trade_tp_sl_update_tx(req: UpdateTpSlRequest) -> BuildTxResponse:
    import logging
    logger = logging.getLogger(__name__)
    
    trader_client = get_trader_client()
    
    logger.info(f"📥 Received TP/SL update request: trader={req.trader_address}, pair_index={req.pair_index}, trade_index={req.trade_index}, tp={req.tp}, sl={req.sl}")

    try:
        update_tx = await trader_client.trade.build_trade_tp_sl_update_tx(
            pair_index=req.pair_index,
            trade_index=req.trade_index,
            take_profit_price=req.tp / 1e10 or 0,
            stop_loss_price=req.sl / 1e10 or 0,
            trader=req.trader_address,
        )
        
        logger.info(f"✅ Successfully built TP/SL update tx")

        return _normalize_tx(update_tx)
    except Exception as e:
        logger.error(f"❌ Failed to build TP/SL update tx: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to build TP/SL update tx: {e}") from e


@app.get("/api/price-feeds/last-price")
async def get_last_prices():
    """
    Proxy endpoint to fetch latest prices from Avantis feed API.
    Returns array of price data for all pairs.
    """
    logger.info("📊 Fetching latest prices from Avantis feed")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://feed-v3.avantisfi.com/v1/price-feeds/last-price",
                timeout=10.0
            )
            response.raise_for_status()
            prices = response.json()
            
            logger.info(f"✅ Successfully fetched prices for {len(prices)} pairs")
            return prices
            
    except httpx.HTTPError as e:
        logger.error(f"❌ Failed to fetch prices from Avantis feed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch prices: {e}") from e
    except Exception as e:
        logger.error(f"❌ Unexpected error fetching prices: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}") from e


@app.get("/api/price-feeds/last-price/{pair_index}")
async def get_last_price_by_pair(pair_index: int):
    """
    Proxy endpoint to fetch latest price for a specific pair from Avantis feed API.
    Returns price data for the requested pair index.
    """
    logger.info(f"📊 Fetching latest price for pair {pair_index} from Avantis feed")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://feed-v3.avantisfi.com/v1/price-feeds/last-price",
                timeout=10.0
            )
            response.raise_for_status()
            prices = response.json()
            
            # Find the price for the requested pair
            pair_price = next((p for p in prices if p.get("pairIndex") == pair_index), None)
            
            if pair_price is None:
                logger.warning(f"⚠️ Price not found for pair {pair_index}")
                raise HTTPException(status_code=404, detail=f"Price not found for pair {pair_index}")
            
            logger.info(f"✅ Successfully fetched price for pair {pair_index}: ${pair_price.get('c')}")
            return pair_price
            
    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.error(f"❌ Failed to fetch price from Avantis feed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch price: {e}") from e
    except Exception as e:
        logger.error(f"❌ Unexpected error fetching price: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}") from e



# --- Top Trades Proxy Route ---
@app.get("/api/portfolio/top-trades/{address}")
async def get_top_trades(address: str):
    """
    Proxy endpoint to fetch top trades for a user from Avantis API.
    Enriches each trade with 'from' and 'to' info from pair metadata.
    """
    logger.info(f"🏆 Fetching top trades for address: {address}")

    try:
        # Step 1: Fetch top trades from Avantis API
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.avantisfi.com/v2/history/portfolio/top/{address}",
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()

        portfolio = data.get("portfolio", []) or []
        logger.info(f"✅ Got {len(portfolio)} top trades for {address}")

        # Step 2: Extract all unique pair indices
        unique_pair_indices: Set[int] = set()
        for t in portfolio:
            try:
                pidx = t.get("event", {}).get("args", {}).get("t", {}).get("pairIndex")
                if pidx is not None:
                    unique_pair_indices.add(int(pidx))
            except Exception:
                continue

        logger.info(f"📊 Found {len(unique_pair_indices)} unique pair indices: {unique_pair_indices}")

        # Step 3: Fetch all pairs once, then filter for only the ones we need
        all_pairs = await get_pairs()  # returns dict[str|int, PairInfoWithData]
        pair_map: Dict[str, Any] = {}
        for idx in unique_pair_indices:
            key = str(idx)
            pair_info = all_pairs.get(key) or all_pairs.get(idx)
            if pair_info:
                pair_map[key] = pair_info

        # Step 4: Enrich each trade with its pair's from/to
        enriched_portfolio = []
        for trade in portfolio:
            pidx = trade.get("event", {}).get("args", {}).get("t", {}).get("pairIndex")
            if pidx is not None:
                key = str(int(pidx))
                info = pair_map.get(key)
                if info:
                    # Convert PairInfoWithData (Pydantic model) safely to dict
                    info_dict = (
                        info.model_dump() if hasattr(info, "model_dump")
                        else info.dict() if hasattr(info, "dict")
                        else dict(info)
                    )
                trade["pairInfo"] = {
        "from": info_dict.get("from") or info_dict.get("from_"),
        "to": info_dict.get("to") or info_dict.get("to_"),
    }

            enriched_portfolio.append(trade)

        logger.info(f"✅ Enriched {len(enriched_portfolio)} trades with pair info")

        return enriched_portfolio

    except httpx.HTTPStatusError as e:
        logger.error(f"❌ Avantis API error: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.exception("💥 Unexpected error while fetching top trades")
        raise HTTPException(status_code=500, detail="Internal Server Error")


# --- Portfolio History Proxy Route ---
@app.get("/api/portfolio/history/{address}/{page_number}")
async def get_portfolio_history(address: str, page_number: int):
    """
    Proxy endpoint to fetch portfolio history for a user from Avantis API with pagination.
    Enriches each trade with 'from' and 'to' info from pair metadata.
    """
    logger.info(f"📜 Fetching portfolio history for address: {address}, page: {page_number}")

    try:
        # Step 1: Fetch portfolio history from Avantis API
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.avantisfi.com/v2/history/portfolio/history/{address}/{page_number}",
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()

        portfolio = data.get("portfolio", []) or []
        logger.info(f"✅ Got {len(portfolio)} trades for {address} on page {page_number}")

        # Step 2: Extract all unique pair indices
        unique_pair_indices: Set[int] = set()
        for t in portfolio:
            try:
                pidx = t.get("event", {}).get("args", {}).get("t", {}).get("pairIndex")
                if pidx is not None:
                    unique_pair_indices.add(int(pidx))
            except Exception:
                continue

        logger.info(f"📊 Found {len(unique_pair_indices)} unique pair indices: {unique_pair_indices}")

        # Step 3: Fetch all pairs once, then filter for only the ones we need
        all_pairs = await get_pairs()  # returns dict[str|int, PairInfoWithData]
        pair_map: Dict[str, Any] = {}
        for idx in unique_pair_indices:
            key = str(idx)
            pair_info = all_pairs.get(key) or all_pairs.get(idx)
            if pair_info:
                pair_map[key] = pair_info

        # Step 4: Enrich each trade with its pair's from/to
        enriched_portfolio = []
        for trade in portfolio:
            pidx = trade.get("event", {}).get("args", {}).get("t", {}).get("pairIndex")
            if pidx is not None:
                key = str(int(pidx))
                info = pair_map.get(key)
                if info:
                    # Convert PairInfoWithData (Pydantic model) safely to dict
                    info_dict = (
                        info.model_dump() if hasattr(info, "model_dump")
                        else info.dict() if hasattr(info, "dict")
                        else dict(info)
                    )
                    trade["pairInfo"] = {
                        "from": info_dict.get("from") or info_dict.get("from_"),
                        "to": info_dict.get("to") or info_dict.get("to_"),
                    }

            enriched_portfolio.append(trade)

        logger.info(f"✅ Enriched {len(enriched_portfolio)} trades with pair info")

        return {
            "portfolio": enriched_portfolio,
            "page": page_number,
            "hasMore": len(portfolio) > 0  # Simple heuristic: if we got data, there might be more
        }

    except httpx.HTTPStatusError as e:
        logger.error(f"❌ Avantis API error: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.exception("💥 Unexpected error while fetching portfolio history")
        raise HTTPException(status_code=500, detail="Internal Server Error")


# --- Portfolio Stats Proxy Routes ---
@app.get("/api/portfolio/profit-loss/{address}")
async def get_portfolio_profit_loss(address: str):
    """
    Proxy endpoint to fetch portfolio profit/loss data for a user from Avantis API.
    """
    logger.info(f"📊 Fetching profit/loss data for address: {address}")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.avantisfi.com/v1/history/portfolio/profit-loss/{address}",
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()

        logger.info(f"✅ Successfully fetched profit/loss data for {address}")
        return data

    except httpx.HTTPStatusError as e:
        logger.error(f"❌ Avantis API error: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.exception("💥 Unexpected error while fetching profit/loss data")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.get("/api/portfolio/win-rate/{address}")
async def get_portfolio_win_rate(address: str):
    """
    Proxy endpoint to fetch portfolio win rate data for a user from Avantis API.
    """
    logger.info(f"🎯 Fetching win rate data for address: {address}")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.avantisfi.com/v1/history/portfolio/win-rate/{address}",
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()

        logger.info(f"✅ Successfully fetched win rate data for {address}")
        return data

    except httpx.HTTPStatusError as e:
        logger.error(f"❌ Avantis API error: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.exception("💥 Unexpected error while fetching win rate data")
        raise HTTPException(status_code=500, detail="Internal Server Error")