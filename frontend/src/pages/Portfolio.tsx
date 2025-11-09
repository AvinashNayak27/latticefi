import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  RefreshCw,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Edit3,
  Check,
  Eye,
  ShieldAlert,
  Settings2,
  Percent,
  Pencil,
} from "lucide-react";
import { calculatePnL } from "../utils/pnlCalculations";
import { triggerHaptic } from "../utils/haptics";
import BottomSheet from "../components/BottomSheet";

interface PortfolioProps {
  isConnected: boolean;
  trades: any[];
  pendingOrders: any[];
  getPairName: (idx: number | null | undefined) => string;
  loading: boolean;
  onCloseTrade: (pairIndex: number, tradeIndex: number) => void;
  onUpdateTpSl: (
    pairIndex: number,
    tradeIndex: number,
    newTp: number,
    newSl: number
  ) => void;
  pairs: any[];
  realtimePrices: Record<string, number>;
}

/**
 * Mobile-first, tabbed positions page with BottomSheets for
 * - PnL breakdown
 * - TP/SL editor (+ quick % helpers)
 * - Position actions
 */
export default function PositionsMobile({
  isConnected,
  trades,
  pendingOrders,
  getPairName,
  loading,
  onCloseTrade,
  onUpdateTpSl,
  pairs,
  realtimePrices,
}: PortfolioProps) {
  const navigate = useNavigate();
  // ---- Tabs -----------------------------------------------------------------
  type TabKey = "positions" | "orders" | "stats";
  const [activeTab, setActiveTab] = useState<TabKey>("positions");

  // ---- Realtime price lookup ------------------------------------------------
  const getRealtimePrice = useCallback(
    (pairIndex: number): number | null => {
      const pair = pairs.find((p: any) => p.index === pairIndex);
      const feedId = pair?.raw?.feed?.feedId;
      if (!feedId) return null;
      const key = feedId.toLowerCase().replace(/^0x/, "");
      const price =
        realtimePrices[key] !== undefined
          ? realtimePrices[key]
          : realtimePrices[feedId];
      return typeof price === "number" ? price : null;
    },
    [pairs, realtimePrices]
  );

  // ---- Helpers --------------------------------------------------------------
  const getTpPercent = (
    entryPrice: number,
    tpPrice: number,
    isLong: boolean
  ): number | null => {
    if (!tpPrice || tpPrice === 0) return null;
    return isLong
      ? ((tpPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - tpPrice) / entryPrice) * 100;
  };

  const getSlPercent = (
    entryPrice: number,
    slPrice: number,
    isLong: boolean
  ): number | null => {
    if (!slPrice || slPrice === 0) return null;
    return isLong
      ? ((entryPrice - slPrice) / entryPrice) * 100
      : ((slPrice - entryPrice) / entryPrice) * 100;
  };

  const formatUSD = (n: number, max = 2) =>
    `$${n.toLocaleString(undefined, { maximumFractionDigits: max })}`;

  // ---- Derived stats --------------------------------------------------------
  const { totalNetPnL, portfolioValue } = useMemo(() => {
    let net = 0;
    let value = 0;
    for (const t of trades) {
      const pnlData = calculatePnL(
        {
          ...t,
          openPrice: Number(t.openPrice),
          collateral: Number(t.collateral),
          leverage: Number(t.leverage),
          liquidationPrice: t.liquidationPrice
            ? Number(t.liquidationPrice)
            : undefined,
          tp: t.tp ? Number(t.tp) : 0,
          sl: t.sl ? Number(t.sl) : 0,
        },
        null,
        getRealtimePrice
      );
      if (pnlData) {
        const netPnl =
          (pnlData as any).type === "nonZeroFeePerp"
            ? (pnlData as any).netPnl
            : (pnlData as any).pnl;
        net += netPnl;
      }
      value += Number(t.collateral) / 1e6;
    }
    return { totalNetPnL: net, portfolioValue: value };
  }, [trades, getRealtimePrice]);

  // ---- TP/SL editor state (pre-seeded on trades change) ---------------------
  type TpSlMap = Record<
    string,
    { tp: string; sl: string; entry: number; isLong: boolean }
  >;
  const [editingTpSl, setEditingTpSl] = useState<TpSlMap>({});
  useEffect(() => {
    const next: TpSlMap = {};
    for (const t of trades) {
      const key = `${t.pairIndex}:${t.index}`;
      const isLong = Boolean(t.buy);
      const entry = Number(t.openPrice) / 1e10;
      const currentTp =
        t.tp && Number(t.tp) > 0 ? Number(t.tp) / 1e10 : undefined;
      const currentSl =
        t.sl && Number(t.sl) > 0 ? Number(t.sl) / 1e10 : undefined;
      next[key] = {
        tp: currentTp ? String(currentTp) : "",
        sl: currentSl ? String(currentSl) : "",
        entry,
        isLong,
      };
    }
    setEditingTpSl(next);
  }, [trades]);

  const setTp = (key: string, v: string) =>
    setEditingTpSl((prev) => ({ ...prev, [key]: { ...prev[key], tp: v } }));
  const setSl = (key: string, v: string) =>
    setEditingTpSl((prev) => ({ ...prev, [key]: { ...prev[key], sl: v } }));

  const applyTpPercent = (
    key: string,
    currentPrice: number | null,
    percent: number
  ) => {
    if (!currentPrice) return;
    triggerHaptic("selection");
    const isLong = editingTpSl[key]?.isLong;
    const multiplier = isLong ? 1 + percent / 100 : 1 - percent / 100;
    const newTp = Number((currentPrice * multiplier).toFixed(6));
    setTp(key, String(newTp));
  };

  const applySlPercent = (
    key: string,
    currentPrice: number | null,
    percent: number
  ) => {
    if (!currentPrice) return;
    triggerHaptic("selection");
    const isLong = editingTpSl[key]?.isLong;
    const multiplier = isLong ? 1 - percent / 100 : 1 + percent / 100;
    const newSl = Number((currentPrice * multiplier).toFixed(6));
    setSl(key, String(newSl));
  };

  // ---- Bottom sheet state ---------------------------------------------------
  const [pnlSheet, setPnlSheet] = useState<{ open: boolean; data: any | null }>(
    { open: false, data: null }
  );
  const [tpSlSheet, setTpSlSheet] = useState<{
    open: boolean;
    key: string | null;
    meta?: {
      pairIndex: number;
      tradeIndex: number;
      currentPrice: number | null;
    } | null;
  }>({ open: false, key: null, meta: null });

  // ---- TP/SL widget (collateral-based, tabbed like MarketDetail) -----------
  const [tpSlActiveTab, setTpSlActiveTab] = useState<"tp" | "sl">("tp");
  const [tpInputValue, setTpInputValue] = useState<string>("");
  const [slInputValue, setSlInputValue] = useState<string>("");
  const [tpPercent, setTpPercent] = useState<number>(5);
  const [slPercent, setSlPercent] = useState<number>(2);
  const [tpBasePrice, setTpBasePrice] = useState<number | null>(null);
  const [slBasePrice, setSlBasePrice] = useState<number | null>(null);
  const [showTpPriceEdit, setShowTpPriceEdit] = useState<boolean>(false);
  const [showSlPriceEdit, setShowSlPriceEdit] = useState<boolean>(false);

  const getOpeningFeeBps = (isZeroFee: boolean) => (isZeroFee ? 0 : 0.00045);

  const getTradeByKey = useCallback(
    (key: string | null) => {
      if (!key) return null;
      const [pairIndexStr, tradeIndexStr] = key.split(":");
      const pidxNum = Number(pairIndexStr);
      const tidxNum = Number(tradeIndexStr);
      return (
        trades.find(
          (t: any) => Number(t.pairIndex) === pidxNum && Number(t.index) === tidxNum
        ) || null
      );
    },
    [trades]
  );

  const computeShares = (
    entry: number,
    collateral: number,
    leverage: number,
    isZeroFee: boolean
  ): number => {
    const openingFee = collateral * leverage * getOpeningFeeBps(isZeroFee);
    const adjustedCollateral = collateral - openingFee;
    return entry > 0 ? (leverage * adjustedCollateral) / entry : 0;
  };

  const computeClosingFee = (
    collateral: number,
    leverage: number,
    isZeroFee: boolean
  ): number => {
    const positionSize = collateral * leverage;
    return positionSize * getOpeningFeeBps(isZeroFee);
  };

  const computeTpPriceFromPnlPercent = (
    percent: number,
    entry: number,
    collateral: number,
    leverage: number,
    isLong: boolean,
    isZeroFee: boolean
  ): number | null => {
    if (entry <= 0 || percent <= 0) return null;
    const shares = computeShares(entry, collateral, leverage, isZeroFee);
    if (shares <= 0) return null;
    const closingFee = computeClosingFee(collateral, leverage, isZeroFee);
    const targetNet = collateral * (percent / 100);
    const delta = (targetNet + closingFee) / shares;
    const exit = isLong ? entry + delta : entry - delta;
    return Number(exit.toFixed(2));
  };

  const computeNetPnlPercentForPrice = (
    exitPrice: number,
    entry: number,
    collateral: number,
    leverage: number,
    isLong: boolean,
    isZeroFee: boolean
  ): number => {
    if (entry <= 0) return 0;
    const shares = computeShares(entry, collateral, leverage, isZeroFee);
    const closingFee = computeClosingFee(collateral, leverage, isZeroFee);
    const gross = (isLong ? exitPrice - entry : entry - exitPrice) * shares;
    const net = gross - closingFee;
    const pct = (net / collateral) * 100;
    return Math.max(0, pct);
  };

  const computeSlPriceFromLossPercent = (
    percent: number,
    entry: number,
    collateral: number,
    leverage: number,
    isLong: boolean,
    isZeroFee: boolean
  ): number | null => {
    if (entry <= 0 || percent <= 0) return null;
    const shares = computeShares(entry, collateral, leverage, isZeroFee);
    if (shares <= 0) return null;
    const closingFee = computeClosingFee(collateral, leverage, isZeroFee);
    const targetNet = -collateral * (percent / 100);
    const gross = targetNet + closingFee;
    const delta = gross / shares;
    const exit = isLong ? entry + delta : entry - delta;
    return Number(exit.toFixed(2));
  };

  const computeLossPercentForPrice = (
    exitPrice: number,
    entry: number,
    collateral: number,
    leverage: number,
    isLong: boolean,
    isZeroFee: boolean
  ): number => {
    if (entry <= 0) return 0;
    const shares = computeShares(entry, collateral, leverage, isZeroFee);
    const closingFee = computeClosingFee(collateral, leverage, isZeroFee);
    const gross = (isLong ? exitPrice - entry : entry - exitPrice) * shares;
    const net = gross - closingFee;
    const pct = (-net / collateral) * 100;
    return Math.max(0, pct);
  };

  const computeNetPnlAmountForPrice = (
    exitPrice: number,
    entry: number,
    collateral: number,
    leverage: number,
    isLong: boolean,
    isZeroFee: boolean
  ): number => {
    if (entry <= 0) return 0;
    const shares = computeShares(entry, collateral, leverage, isZeroFee);
    const closingFee = computeClosingFee(collateral, leverage, isZeroFee);
    const gross = (isLong ? exitPrice - entry : entry - exitPrice) * shares;
    const net = gross - closingFee;
    return net;
  };

  const formatPriceDynamic = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(Number(val))) return "";
    const n = Number(val);
    const max = n < 100 ? 4 : 2;
    return n.toLocaleString(undefined, { maximumFractionDigits: max });
  };

  // Initialize TP/SL widget state when opening
  useEffect(() => {
    if (!tpSlSheet.open || !tpSlSheet.key) return;
    const trade = getTradeByKey(tpSlSheet.key);
    if (!trade) return;
    const entry = editingTpSl[tpSlSheet.key]?.entry || 0;
    const isLong = editingTpSl[tpSlSheet.key]?.isLong || false;
    const collateral = Number(trade.collateral) / 1e6;
    const leverage = Number(trade.leverage) / 1e10;
    const isZeroFee = Boolean(trade.isPnl);
    const base = tpSlSheet.meta?.currentPrice ?? entry;
    setTpBasePrice(base);
    setSlBasePrice(base);
    setShowTpPriceEdit(false);
    setShowSlPriceEdit(false);

    // Seed TP
    const existingTp = editingTpSl[tpSlSheet.key]?.tp;
    if (existingTp && Number(existingTp) > 0) {
      setTpInputValue(String(existingTp));
      const pct = computeNetPnlPercentForPrice(
        Number(existingTp),
        entry,
        collateral,
        leverage,
        isLong,
        isZeroFee
      );
      setTpPercent(Math.max(1, Math.min(2500, pct)));
    } else {
      const p = computeTpPriceFromPnlPercent(
        tpPercent,
        entry,
        collateral,
        leverage,
        isLong,
        isZeroFee
      );
      if (p !== null) setTpInputValue(String(p));
    }

    // Seed SL
    const existingSl = editingTpSl[tpSlSheet.key]?.sl;
    if (existingSl && Number(existingSl) > 0) {
      setSlInputValue(String(existingSl));
      const lossPct = computeLossPercentForPrice(
        Number(existingSl),
        entry,
        collateral,
        leverage,
        isLong,
        isZeroFee
      );
      setSlPercent(Math.max(1, Math.min(80, lossPct)));
    } else {
      const sp = computeSlPriceFromLossPercent(
        slPercent,
        entry,
        collateral,
        leverage,
        isLong,
        isZeroFee
      );
      if (sp !== null) setSlInputValue(String(sp));
    }
  }, [tpSlSheet.open, tpSlSheet.key]);

  const [actionSheet, setActionSheet] = useState<{
    open: boolean;
    pairIndex?: number;
    tradeIndex?: number;
    pairName?: string;
  }>({ open: false });

  const [positionDetail, setPositionDetail] = useState<{
    open: boolean;
    pairIndex?: number;
    tradeIndex?: number;
    pairName?: string;
  }>({ open: false });

  const selectedTrade = useMemo(() => {
    if (!positionDetail.open) return null;
    const pidx = positionDetail.pairIndex;
    const tidx = positionDetail.tradeIndex;
    if (pidx === undefined || tidx === undefined) return null;
    return (
      trades.find(
        (t: any) => Number(t.pairIndex) === Number(pidx) && Number(t.index) === Number(tidx)
      ) || null
    );
  }, [positionDetail, trades]);

  const positionSheetTitle = useMemo(() => {
    if (!positionDetail.open) return "Position Details";
    const pidx = positionDetail.pairIndex;
    if (pidx === undefined) return "Position Details";
    const name = getPairName(pidx);
    const base = String(name || "").split("/")[0].trim();
    const img = `https://www.avantisfi.com/images/pairs/crypto/${base}.svg`;
    return (
      <button
        onClick={() => navigate(`/markets/${pidx}`)}
        className="flex items-center gap-2 hover:opacity-80 active:scale-95 transition"
      >
        <img
          src={img}
          alt={base}
          className="w-5 h-5 rounded-full border border-black/10 bg-white"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="text-base font-bold text-black underline decoration-dotted underline-offset-2">
          {base}
        </span>
        <ArrowUpRight className="w-4 h-4 text-black/60" />
      </button>
    );
  }, [positionDetail, getPairName, navigate]);

  // ---- Renderers ------------------------------------------------------------
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-24"
    >
      {!isConnected ? (
        <div className="card text-center py-12">
          <Wallet className="w-16 h-16 mx-auto text-black/20 mb-4" />
          <h3 className="text-lg font-bold text-black mb-2">
            Connect Your Wallet
          </h3>
          <p className="text-sm text-black/50">
            Connect your wallet to view your portfolio
          </p>
        </div>
      ) : (
        <>
          {/* Top Stats (sticky on mobile) */}
          <div className="grid grid-cols-2 gap-3 sticky top-0 z-20 bg-gradient-to-b from-white via-white to-white/80 pt-2 pb-3">
            <StatsCard
              title="Portfolio Value"
              value={formatUSD(portfolioValue, 2)}
              icon={<Wallet className="w-5 h-5" />}
            />
            <StatsCard
              title="Net P&L"
              value={formatUSD(totalNetPnL, 2)}
              icon={
                totalNetPnL >= 0 ? (
                  <ArrowUpRight className="w-5 h-5" />
                ) : (
                  <ArrowDownRight className="w-5 h-5" />
                )
              }
              valueColor={totalNetPnL >= 0 ? "text-green-600" : "text-red-600"}
            />
          </div>

          {/* Tabs */}
          <TabBar
            active={activeTab}
            onChange={(t) => {
              triggerHaptic("selection");
              setActiveTab(t);
            }}
            counts={{
              positions: trades.length,
              orders: pendingOrders.length,
            }}
          />

          {/* Tab Panels */}
          <div className="mt-3">
            <AnimatePresence mode="wait">
              {activeTab === "positions" && (
                <motion.div
                  key="positions"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3"
                >
                  {trades.length === 0 ? (
                    <EmptyState
                      icon={<TrendingUp className="w-12 h-12 mx-auto mb-3" />}
                      title="No open positions"
                      subtitle="When you open a trade, it’ll appear here."
                    />
                  ) : (
                    trades.map((t: any) => {
                      const pidx = t.pairIndex;
                      const tidx = t.index;
                      const key = `${pidx}:${tidx}`;
                      const isLong = Boolean(t.buy);
                      const leverage = Number(t.leverage) / 1e10;
                      const collateral = Number(t.collateral) / 1e6;
                      const positionSize = collateral * leverage;
                      const entry = Number(t.openPrice) / 1e10;
                      const pairNameDisplay = getPairName(pidx);
                      const baseSymbol = String(pairNameDisplay || "").split("/")[0].trim();
                      const symbolImg = `https://www.avantisfi.com/images/pairs/crypto/${baseSymbol}.svg`;
                      const liq = t.liquidationPrice
                        ? Number(t.liquidationPrice) / 1e10
                        : undefined;
                      const currentTp =
                        t.tp && Number(t.tp) > 0 ? Number(t.tp) / 1e10 : 0;
                      const currentSl =
                        t.sl && Number(t.sl) > 0 ? Number(t.sl) / 1e10 : 0;
                      const currentPrice = getRealtimePrice(pidx);

                      const pnlData = calculatePnL(
                        {
                          ...t,
                          openPrice: Number(t.openPrice),
                          collateral: Number(t.collateral),
                          leverage: Number(t.leverage),
                          liquidationPrice: t.liquidationPrice
                            ? Number(t.liquidationPrice)
                            : undefined,
                          tp: t.tp ? Number(t.tp) : 0,
                          sl: t.sl ? Number(t.sl) : 0,
                        },
                        null,
                        getRealtimePrice
                      );

                      const displayNetPnl =
                        pnlData &&
                        ((pnlData as any).type === "nonZeroFeePerp"
                          ? (pnlData as any).netPnl
                          : (pnlData as any).pnl);
                      const displayNetPnlPercent =
                        pnlData &&
                        ((pnlData as any).type === "nonZeroFeePerp"
                          ? (pnlData as any).netPnlPercent
                          : (pnlData as any).pnlPercent);

                      const tpPct =
                        currentTp > 0
                          ? getTpPercent(entry, currentTp, isLong)
                          : null;
                      const slPct =
                        currentSl > 0
                          ? getSlPercent(entry, currentSl, isLong)
                          : null;

                      return (
                        <div
                          key={key}
                          onClick={() => {
                            triggerHaptic("selection");
                            setPositionDetail({
                              open: true,
                              pairIndex: pidx,
                              tradeIndex: tidx,
                              pairName: getPairName(pidx),
                            });
                          }}
                          className="p-3 rounded-2xl border border-black/10 bg-white shadow-sm active:scale-[0.99] transition-transform"
                        >
                          {/* Header row */}
                          <div className="grid grid-cols-2 gap-3 items-start">
                            {/* (0,0) Name + type tag */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <img
                                  src={symbolImg}
                                  alt={baseSymbol}
                                  className="w-5 h-5 rounded-full border border-black/10 bg-white"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                                <h4 className="text-sm font-bold text-black truncate">
                                  {baseSymbol}
                                </h4>
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${t.isPnl ? "bg-purple-500/20 text-purple-700" : "bg-black/10 text-black/60"}`}
                                >
                                  {t.isPnl ? "Zero" : "Perp"}
                                </span>
                              </div>
                            </div>

                            {/* (0,1) Collateral + Leverage */}
                            <div className="text-right min-w-[92px] flex items-center justify-end gap-1.5">
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-black/5 text-black/70 whitespace-nowrap">
                                {formatUSD(collateral, 2)}
                              </span>
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-black/10 text-black/70">
                                {leverage.toFixed(0)}x
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${isLong ? "bg-green-500/20 text-green-700" : "bg-red-500/20 text-red-700"}`}
                              >
                                {isLong ? "LONG" : "SHORT"}
                              </span>
                            </div>

                            {/* (1,0) Current price */}
                            <div>
                              {currentPrice !== null && (
                                <div className="text-base font-bold text-black">
                                  {`$${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                                </div>
                              )}
                            </div>

                            {/* (1,1) PnL value + percent */}
                            <div className="text-right">
                              {pnlData && displayNetPnl !== undefined && displayNetPnlPercent !== undefined && (
                                <div className={`text-base font-bold ${displayNetPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {displayNetPnl >= 0 ? "+" : "-"}
                                  {formatUSD(Math.abs(displayNetPnl), 2)}
                                  <span className="ml-1 text-sm">
                                    ({Math.abs(Number(displayNetPnlPercent)).toFixed(2)}%)
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Compact card: no additional metrics, details in bottom sheet */}
                        </div>
                      );
                    })
                  )}
                </motion.div>
              )}

              {activeTab === "orders" && (
                <motion.div
                  key="orders"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3"
                >
                  {pendingOrders.length === 0 ? (
                    <EmptyState
                      icon={<RefreshCw className="w-12 h-12 mx-auto mb-3" />}
                      title="No pending orders"
                      subtitle="Your limit orders will appear here."
                    />
                  ) : (
                    pendingOrders.map((o: any, i: number) => {
                      const pidx = o.pairIndex;
                      const tidx = o.index;
                      const orderPrice = o.price;
                      const isLong = Boolean(o.buy);
                      const lev = o.leverage;
                      const size = o.positionSize;
                      const currentPrice = getRealtimePrice(pidx);
                      return (
                        <div
                          key={`${pidx}:${tidx}:${i}`}
                          className="p-3 rounded-2xl border border-black/10 bg-white shadow-sm"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-black">
                                {getPairName(pidx)}
                              </h4>
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${isLong ? "bg-green-500/20 text-green-700" : "bg-red-500/20 text-red-700"}`}
                              >
                                {isLong ? "Long" : "Short"}
                              </span>
                              <span className="text-[10px] text-black/60">
                                #{tidx}
                              </span>
                              {lev && (
                                <span className="text-[10px] text-black/60">
                                  {lev}x
                                </span>
                              )}
                            </div>
                            {currentPrice !== null && (
                              <div className="flex items-center gap-2 px-2 py-1 bg-black/5 rounded-lg">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                <span className="text-xs font-semibold text-black">
                                  $
                                  {currentPrice.toLocaleString(undefined, {
                                    maximumFractionDigits: 6,
                                  })}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              {size !== undefined && (
                                <div>
                                  <span className="text-[10px] text-black/50">
                                    Size
                                  </span>
                                  <p className="text-sm font-semibold text-black">
                                    ${Number(size).toLocaleString()}
                                  </p>
                                </div>
                              )}
                              {orderPrice !== undefined && (
                                <div>
                                  <span className="text-[10px] text-black/50">
                                    Order Price
                                  </span>
                                  <p className="text-sm font-semibold text-black">
                                    ${orderPrice}
                                  </p>
                                </div>
                              )}
                            </div>
                            <button className="btn-danger px-3 py-1.5 text-xs whitespace-nowrap">
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </motion.div>
              )}

              {/* {activeTab === "stats" && (
                <motion.div
                  key="stats"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <div className="card">
                    <h3 className="text-base font-bold text-black mb-3">
                      Portfolio Snapshot
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <InfoItem label="Value" value={formatUSD(portfolioValue)} />
                      <InfoItem
                        label="Net P&L"
                        value={formatUSD(totalNetPnL)}
                      />
                      <InfoItem
                        label="Open Positions"
                        value={String(trades.length)}
                      />
                      <InfoItem
                        label="Pending Orders"
                        value={String(pendingOrders.length)}
                      />
                    </div>
                  </div>
                </motion.div>
              )} */}
            </AnimatePresence>
          </div>

          {/* ---- BottomSheet: PnL Details ----------------------------------- */}
          <BottomSheet
            isOpen={pnlSheet.open}
            onClose={() => setPnlSheet({ open: false, data: null })}
            title="PnL Details"
            zIndexClass="z-[130]"
          >
            {pnlSheet.data && (
              <div className="space-y-3">
                {/* nonZeroFeePerp vs pnl-based */}
                {(pnlSheet.data as any).type === "nonZeroFeePerp" ? (
                  <>
                    <SheetMetric
                      label="Gross P&L"
                      primary={formatUSD(pnlSheet.data.grossPnl, 2)}
                      hint={`${pnlSheet.data.grossPnlPercent.toFixed(2)}%`}
                    />
                    <SheetMetric
                      label="Closing Fee"
                      primary={`-${formatUSD(pnlSheet.data.closingFee, 2)}`}
                      tone="red"
                    />
                    <SheetMetric
                      label="Rollover Fee"
                      primary={`-${formatUSD(pnlSheet.data.rolloverFee, 2)}`}
                      tone="red"
                    />
                    <div className="p-4 rounded-xl border-2 border-black/20">
                      <div className="text-xs text-black/60 mb-1">
                        Net P&amp;L
                      </div>
                      <div
                        className={`text-xl font-bold ${
                          pnlSheet.data.netPnl >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {pnlSheet.data.netPnl >= 0 ? "+" : "-"}
                        {formatUSD(Math.abs(pnlSheet.data.netPnl), 2)}
                        <span className="ml-2 text-base">
                          {pnlSheet.data.netPnlPercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <SheetMetric
                      label="Gross P&L"
                      primary={formatUSD(pnlSheet.data.grossPnl, 2)}
                      hint={`${pnlSheet.data.grossPnlPercent.toFixed(2)}%`}
                    />
                    <SheetMetric
                      label="PnL-Based Fee"
                      primary={`-${formatUSD(pnlSheet.data.fee, 2)}`}
                      tone="red"
                    />
                    <div className="p-4 rounded-xl border-2 border-black/20">
                      <div className="text-xs text-black/60 mb-1">
                        Net P&amp;L
                      </div>
                      <div
                        className={`text-xl font-bold ${
                          pnlSheet.data.pnl >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {pnlSheet.data.pnl >= 0 ? "+" : "-"}
                        {formatUSD(Math.abs(pnlSheet.data.pnl), 2)}
                        <span className="ml-2 text-base">
                          {pnlSheet.data.pnlPercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </BottomSheet>

          {/* ---- BottomSheet: TP/SL Editor ---------------------------------- */}
          <BottomSheet
            isOpen={tpSlSheet.open}
            onClose={() => setTpSlSheet({ open: false, key: null, meta: null })}
            title="Edit TP / SL"
          >
            {tpSlSheet.key && editingTpSl[tpSlSheet.key] && tpSlSheet.meta && (() => {
              const trade = getTradeByKey(tpSlSheet.key);
              if (!trade) return null;
              const entry = editingTpSl[tpSlSheet.key].entry;
              const isLong = editingTpSl[tpSlSheet.key].isLong;
              const collateral = Number(trade.collateral) / 1e6;
              const leverage = Number(trade.leverage) / 1e10;
              const isZeroFee = Boolean(trade.isPnl);
              const baseForTp = tpBasePrice ?? (tpSlSheet.meta?.currentPrice ?? entry);
              const baseForSl = slBasePrice ?? (tpSlSheet.meta?.currentPrice ?? entry);

              return (
                <div className="space-y-4">
                  {/* Tabs */}
                  <div className="grid grid-cols-2 p-1 rounded-2xl border border-black/10 bg-black/5">
                    {(["tp", "sl"] as const).map((tab) => {
                      const active = tpSlActiveTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => {
                            triggerHaptic("selection");
                            setTpSlActiveTab(tab);
                          }}
                          className={`relative py-2 rounded-xl text-sm font-semibold transition-all ${
                            active ? "bg-white shadow" : "text-black/60"
                          }`}
                        >
                          <span>{tab === "tp" ? "Edit TP" : "Edit SL"}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Content per tab */}
                  {tpSlActiveTab === "tp" ? (
                    <div className="space-y-4">
                      {/* Current Price Info */}
                      <div className="p-3 bg-black/5 rounded-xl">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-black/60">Current Price</span>
                          <span className="font-semibold text-black">
                            ${formatPriceDynamic(baseForTp)}
                          </span>
                        </div>
                      </div>

                      {/* Percentage Slider */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-semibold text-black">Take Profit (PnL % of collateral)</label>
                          <span className="text-lg font-bold text-green-600">+{tpPercent.toFixed(2)}%</span>
                        </div>
                        <input
                          type="range"
                          value={tpPercent}
                          onChange={(e) => {
                            triggerHaptic("light");
                            const val = Number(e.target.value);
                            setTpPercent(val);
                            setShowTpPriceEdit(false);
                            const p = computeTpPriceFromPnlPercent(
                              val,
                              entry,
                              collateral,
                              leverage,
                              isLong,
                              isZeroFee
                            );
                            if (p !== null) setTpInputValue(String(p));
                          }}
                          min="1"
                          max="2500"
                          step="0.1"
                          className="w-full h-2 bg-black/10 rounded-full appearance-none cursor-pointer slider-thumb"
                          style={{
                            background: `linear-gradient(to right, #10b981 0%, #10b981 ${(tpPercent - 1) / (2500 - 1) * 100}%, #e5e7eb ${(tpPercent - 1) / (2500 - 1) * 100}%, #e5e7eb 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-black/50">
                          <span>1%</span>
                          <span>2500%</span>
                        </div>
                      </div>

                      {/* Price Display with Edit Button */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-semibold text-black">Take Profit Price</label>
                          <button
                            onClick={() => {
                              triggerHaptic("selection");
                              setShowTpPriceEdit(!showTpPriceEdit);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-700 hover:bg-green-500/20 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span className="text-xs font-semibold">Edit</span>
                          </button>
                        </div>
                        {showTpPriceEdit ? (
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/60 font-semibold">$</span>
                            <input
                              type="number"
                              value={tpInputValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTpInputValue(val);
                                const num = parseFloat(val);
                                if (!isNaN(num) && num > 0) {
                                  const pct = computeNetPnlPercentForPrice(
                                    num,
                                    entry,
                                    collateral,
                                    leverage,
                                    isLong,
                                    isZeroFee
                                  );
                                  setTpPercent(Math.max(1, Math.min(2500, pct)));
                                }
                              }}
                              placeholder={`${formatPriceDynamic(baseForTp)}`}
                              className="w-full pl-8 pr-4 py-4 bg-black/5 rounded-xl border border-black/10 text-lg font-semibold text-black focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            />
                          </div>
                        ) : (
                          <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20">
                            <span className="text-xl font-bold text-green-600">
                              ${tpInputValue && !isNaN(parseFloat(tpInputValue)) && parseFloat(tpInputValue) > 0 
                                ? formatPriceDynamic(parseFloat(tpInputValue))
                                : formatPriceDynamic(baseForTp)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              triggerHaptic("success");
                              if (!tpSlSheet.key || !tpSlSheet.meta) return;
                              setTp(tpSlSheet.key, tpInputValue || "");
                              const { pairIndex, tradeIndex } = tpSlSheet.meta!;
                              const tpVal = tpInputValue && parseFloat(tpInputValue) > 0 ? Math.round(parseFloat(tpInputValue) * 1e10) : 0;
                              const slVal = editingTpSl[tpSlSheet.key].sl !== "" ? Math.round(Number(editingTpSl[tpSlSheet.key].sl) * 1e10) : 0;
                              onUpdateTpSl(pairIndex, tradeIndex, tpVal, slVal);
                              setTpSlSheet({ open: false, key: null, meta: null });
                            }}
                            className="btn-primary w-full"
                          >
                            Update TP
                          </button>
                        </div>
                      </div>

                      {/* Calculations */}
                      {tpInputValue && !isNaN(parseFloat(tpInputValue)) && parseFloat(tpInputValue) > 0 && (
                        <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-green-700">Price Change</span>
                            <span className="text-lg font-bold text-green-600">
                              {(() => {
                                const tpPrice = parseFloat(tpInputValue);
                                const base = baseForTp ?? entry;
                                if (!base) return "";
                                const percent = isLong ? ((tpPrice - base) / base) * 100 : ((base - tpPrice) / base) * 100;
                                return `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-top border-green-500/20">
                            <span className="text-sm font-semibold text-green-700">Projected Profit</span>
                            <span className="text-lg font-bold text-green-600">
                              ${(() => {
                                const tpPrice = parseFloat(tpInputValue);
                                const net = computeNetPnlAmountForPrice(
                                  tpPrice,
                                  entry,
                                  collateral,
                                  leverage,
                                  isLong,
                                  isZeroFee
                                );
                                return Math.max(0, net).toLocaleString(undefined, { maximumFractionDigits: 2 });
                              })()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Current Price Info */}
                      <div className="p-3 bg-black/5 rounded-xl">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-black/60">Current Price</span>
                          <span className="font-semibold text-black">
                            ${formatPriceDynamic(baseForSl)}
                          </span>
                        </div>
                      </div>

                      {/* Percentage Slider */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-semibold text-black">Stop Loss (PnL % of collateral)</label>
                          <span className="text-lg font-bold text-red-600">-{slPercent.toFixed(2)}%</span>
                        </div>
                        <input
                          type="range"
                          value={slPercent}
                          onChange={(e) => {
                            triggerHaptic("light");
                            const val = Number(e.target.value);
                            setSlPercent(val);
                            setShowSlPriceEdit(false);
                            const p = computeSlPriceFromLossPercent(
                              val,
                              entry,
                              collateral,
                              leverage,
                              isLong,
                              isZeroFee
                            );
                            if (p !== null) setSlInputValue(String(p));
                          }}
                          min="1"
                          max="80"
                          step="0.1"
                          className="w-full h-2 bg-black/10 rounded-full appearance-none cursor-pointer slider-thumb"
                          style={{
                            background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${(slPercent - 1) / (80 - 1) * 100}%, #e5e7eb ${(slPercent - 1) / (80 - 1) * 100}%, #e5e7eb 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-black/50">
                          <span>1%</span>
                          <span>80%</span>
                        </div>
                      </div>

                      {/* Price Display with Edit Button */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-semibold text-black">Stop Loss Price</label>
                          <button
                            onClick={() => {
                              triggerHaptic("selection");
                              setShowSlPriceEdit(!showSlPriceEdit);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-700 hover:bg-red-500/20 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span className="text-xs font-semibold">Edit</span>
                          </button>
                        </div>
                        {showSlPriceEdit ? (
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/60 font-semibold">$</span>
                            <input
                              type="number"
                              value={slInputValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSlInputValue(val);
                                const num = parseFloat(val);
                                if (!isNaN(num) && num > 0) {
                                  const pct = computeLossPercentForPrice(
                                    num,
                                    entry,
                                    collateral,
                                    leverage,
                                    isLong,
                                    isZeroFee
                                  );
                                  setSlPercent(Math.max(1, Math.min(80, pct)));
                                }
                              }}
                              placeholder={`${formatPriceDynamic(baseForSl)}`}
                              className="w-full pl-8 pr-4 py-4 bg-black/5 rounded-xl border border-black/10 text-lg font-semibold text-black focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            />
                          </div>
                        ) : (
                          <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                            <span className="text-xl font-bold text-red-600">
                              ${slInputValue && !isNaN(parseFloat(slInputValue)) && parseFloat(slInputValue) > 0 
                                ? formatPriceDynamic(parseFloat(slInputValue))
                                : formatPriceDynamic(baseForSl)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              triggerHaptic("success");
                              if (!tpSlSheet.key || !tpSlSheet.meta) return;
                              setSl(tpSlSheet.key, slInputValue || "");
                              const { pairIndex, tradeIndex } = tpSlSheet.meta!;
                              const slVal = slInputValue && parseFloat(slInputValue) > 0 ? Math.round(parseFloat(slInputValue) * 1e10) : 0;
                              const tpVal = editingTpSl[tpSlSheet.key].tp !== "" ? Math.round(Number(editingTpSl[tpSlSheet.key].tp) * 1e10) : 0;
                              onUpdateTpSl(pairIndex, tradeIndex, tpVal, slVal);
                              setTpSlSheet({ open: false, key: null, meta: null });
                            }}
                            className="btn-primary w-full"
                          >
                            Update SL
                          </button>
                        </div>
                      </div>

                      {/* Calculations */}
                      {slInputValue && !isNaN(parseFloat(slInputValue)) && parseFloat(slInputValue) > 0 && (
                        <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-red-700">Price Change</span>
                            <span className={`text-lg font-bold ${(() => {
                              const slPrice = parseFloat(slInputValue);
                              const base = baseForSl ?? entry;
                              if (!base) return "text-red-600";
                              const percent = isLong ? ((slPrice - base) / base) * 100 : ((base - slPrice) / base) * 100;
                              return percent < 0 ? "text-red-600" : "text-green-600";
                            })()}`}>
                              {(() => {
                                const slPrice = parseFloat(slInputValue);
                                const base = baseForSl ?? entry;
                                if (!base) return "";
                                const percent = isLong ? ((slPrice - base) / base) * 100 : ((base - slPrice) / base) * 100;
                                return `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-top border-red-500/20">
                            <span className="text-sm font-semibold text-red-700">Expected Loss</span>
                            <span className="text-lg font-bold text-red-600">
                              ${(() => {
                                const exit = parseFloat(slInputValue);
                                const net = computeNetPnlAmountForPrice(
                                  exit,
                                  entry,
                                  collateral,
                                  leverage,
                                  isLong,
                                  isZeroFee
                                );
                                return Math.abs(Math.min(0, net)).toLocaleString(undefined, { maximumFractionDigits: 2 });
                              })()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </BottomSheet>

          {/* ---- BottomSheet: Position Details (opened by tapping card) ----- */}
          <BottomSheet
            isOpen={positionDetail.open}
            onClose={() => setPositionDetail({ open: false })}
            title={positionSheetTitle}
          >
            {selectedTrade && (
              <div className="space-y-4">
                {(() => {
                  const pidx = Number(selectedTrade.pairIndex);
                  const tidx = Number(selectedTrade.index);
                  const isLong = Boolean(selectedTrade.buy);
                  const leverage = Number(selectedTrade.leverage) / 1e10;
                  const collateral = Number(selectedTrade.collateral) / 1e6;
                  const entry = Number(selectedTrade.openPrice) / 1e10;
                  const liq = selectedTrade.liquidationPrice
                    ? Number(selectedTrade.liquidationPrice) / 1e10
                    : undefined;
                  const currentTp =
                    selectedTrade.tp && Number(selectedTrade.tp) > 0
                      ? Number(selectedTrade.tp) / 1e10
                      : 0;
                  const currentSl =
                    selectedTrade.sl && Number(selectedTrade.sl) > 0
                      ? Number(selectedTrade.sl) / 1e10
                      : 0;
                  const currentPrice = getRealtimePrice(pidx);
                  const tpPct =
                    currentTp > 0 ? getTpPercent(entry, currentTp, isLong) : null;
                  const slPct =
                    currentSl > 0 ? getSlPercent(entry, currentSl, isLong) : null;

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${isLong ? "bg-green-500/20 text-green-700" : "bg-red-500/20 text-red-700"}`}
                          >
                            {isLong ? "Long" : "Short"}
                          </span>
                          <span className="text-[11px] text-black/60">#{tidx}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-black/50">Collateral</div>
                          <div className="text-sm font-semibold text-black">
                            {formatUSD(collateral, 2)}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <InfoItem label="Leverage" value={`${leverage.toFixed(2)}x`} />
                        <InfoItem
                          label="Entry"
                          value={`$${entry.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}`}
                        />
                        <InfoItem
                          label="Curr Price"
                          value={
                            currentPrice !== null
                              ? `$${currentPrice.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}`
                              : "—"
                          }
                        />
                        <InfoItem
                          label="Liquidation"
                          value={
                            liq
                              ? `$${liq.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}`
                              : "—"
                          }
                        />
                        <InfoItem
                          label="TP"
                          value={
                            currentTp > 0
                              ? `$${currentTp.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}${tpPct !== null ? ` · +${tpPct.toFixed(2)}%` : ""}`
                              : "Not set"
                          }
                        />
                        <InfoItem
                          label="SL"
                          value={
                            currentSl > 0
                              ? `$${currentSl.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}${slPct !== null ? ` · -${slPct.toFixed(2)}%` : ""}`
                              : "Not set"
                          }
                        />
                      </div>

                      {(() => {
                        const pnlData = calculatePnL(
                          {
                            ...selectedTrade,
                            openPrice: Number(selectedTrade.openPrice),
                            collateral: Number(selectedTrade.collateral),
                            leverage: Number(selectedTrade.leverage),
                            liquidationPrice: selectedTrade.liquidationPrice
                              ? Number(selectedTrade.liquidationPrice)
                              : undefined,
                            tp: selectedTrade.tp ? Number(selectedTrade.tp) : 0,
                            sl: selectedTrade.sl ? Number(selectedTrade.sl) : 0,
                          },
                          null,
                          getRealtimePrice
                        );
                        if (!pnlData) return null;
                        const isNonZero = (pnlData as any).type === "nonZeroFeePerp";
                        const netVal = isNonZero ? (pnlData as any).netPnl : (pnlData as any).pnl;
                        const netPct = isNonZero ? (pnlData as any).netPnlPercent : (pnlData as any).pnlPercent;
                        const tone = netVal >= 0 ? "text-green-600" : "text-red-600";
                        return (
                          <div className="p-3 rounded-xl border border-black/10 bg-black/5 flex items-center justify-between">
                            <div className="text-xs text-black/60">Net P&L</div>
                            <div className="flex items-center gap-2">
                              <div className={`text-base font-bold ${tone}`}>
                                {netVal >= 0 ? "+" : "-"}
                                {formatUSD(Math.abs(netVal), 2)}
                                <span className="ml-1 text-sm">({Number(netPct).toFixed(2)}%)</span>
                              </div>
                              <button
                                onClick={() => {
                                  triggerHaptic("selection");
                                  setPnlSheet({ open: true, data: pnlData });
                                }}
                                className="p-2 rounded-lg bg-white border border-black/10 hover:bg-black/5 active:scale-95 transition"
                                aria-label="View PnL breakdown"
                              >
                                <Eye className="w-4 h-4 text-black/70" />
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => {
                            triggerHaptic("selection");
                            const key = `${pidx}:${tidx}`;
                            setTpSlSheet({
                              open: true,
                              key,
                              meta: {
                                pairIndex: pidx,
                                tradeIndex: tidx,
                                currentPrice,
                              },
                            });
                            setPositionDetail({ open: false });
                          }}
                          className="p-3 rounded-xl border border-black/10 bg-white hover:bg-black/5 active:scale-95 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                        >
                          <Edit3 className="w-4 h-4" />
                          Edit TP/SL
                        </button>

                        <button
                          onClick={() => {
                            triggerHaptic("medium");
                            onCloseTrade(pidx, tidx);
                            setPositionDetail({ open: false });
                          }}
                          disabled={loading}
                          className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:scale-95 transition-all text-sm font-semibold"
                        >
                          Close Position
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </BottomSheet>

          {/* ---- BottomSheet: Quick Actions --------------------------------- */}
          <BottomSheet
            isOpen={actionSheet.open}
            onClose={() => setActionSheet({ open: false })}
            title={actionSheet.pairName ? `Actions · ${actionSheet.pairName}` : "Actions"}
          >
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  triggerHaptic("selection");
                  // Find the key to open TP/SL sheet from actionSheet indices
                  if (
                    actionSheet.pairIndex === undefined ||
                    actionSheet.tradeIndex === undefined
                  )
                    return;
                  const key = `${actionSheet.pairIndex}:${actionSheet.tradeIndex}`;
                  const currentPrice = getRealtimePrice(actionSheet.pairIndex);
                  setTpSlSheet({
                    open: true,
                    key,
                    meta: {
                      pairIndex: actionSheet.pairIndex,
                      tradeIndex: actionSheet.tradeIndex,
                      currentPrice,
                    },
                  });
                  setActionSheet({ open: false });
                }}
                className="p-4 rounded-2xl border border-black/10 bg-white hover:bg-black/5 active:scale-95 transition-all text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Edit TP/SL
              </button>

              <button
                onClick={() => {
                  triggerHaptic("medium");
                  if (
                    actionSheet.pairIndex === undefined ||
                    actionSheet.tradeIndex === undefined
                  )
                    return;
                  onCloseTrade(actionSheet.pairIndex, actionSheet.tradeIndex);
                  setActionSheet({ open: false });
                }}
                className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:scale-95 transition-all text-sm font-semibold"
              >
                Close Position
              </button>
            </div>
          </BottomSheet>
        </>
      )}
    </motion.div>
  );
}

/* ------------------------ UI Subcomponents -------------------------------- */

function TabBar({
  active,
  onChange,
  counts,
}: {
  active: "positions" | "orders" | "stats";
  onChange: (t: "positions" | "orders" | "stats") => void;
  counts?: Partial<Record<"positions" | "orders" | "stats", number | undefined>>;
}) {
  const tabs: Array<{ key: "positions" | "orders" | "stats"; label: string }> =
    [
      { key: "positions", label: "Positions" },
      { key: "orders", label: "Orders" },
    ];
  return (
    <div className="sticky top-[74px] z-10 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="grid grid-cols-2 p-1 rounded-2xl border border-black/10 bg-black/5 mx-1">
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={`relative py-2 rounded-xl text-sm font-semibold transition-all ${
                isActive ? "bg-white shadow" : "text-black/60"
              }`}
            >
              <span>{t.label}</span>
              {typeof counts?.[t.key] === "number" && (
                <span
                  className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-md ${
                    isActive ? "bg-black text-white" : "bg-black/10 text-black/70"
                  }`}
                >
                  {counts?.[t.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon,
  valueColor,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="card">
      <div className="flex justify-between items-start mb-1">
        <p className="text-[11px] text-black/60">{title}</p>
        <div className="p-2 rounded-xl bg-black text-white">{icon}</div>
      </div>
      <p className={`text-xl font-bold ${valueColor || "text-black"}`}>
        {value}
      </p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-black/50">{label}</p>
      <p className="font-semibold text-sm text-black truncate">{value}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center py-12 text-black/40 bg-white rounded-2xl border border-black/10">
      <div className="opacity-60">{icon}</div>
      <p className="text-sm font-semibold">{title}</p>
      {subtitle && <p className="text-xs mt-1">{subtitle}</p>}
    </div>
  );
}

function SheetMetric({
  label,
  primary,
  hint,
  tone,
}: {
  label: string;
  primary: string;
  hint?: string;
  tone?: "red" | "green";
}) {
  return (
    <div className="p-4 rounded-xl border border-black/10 bg-black/5">
      <div className="text-xs text-black/60 mb-1">{label}</div>
      <div
        className={`text-base font-semibold ${
          tone === "red"
            ? "text-red-600"
            : tone === "green"
            ? "text-green-700"
            : "text-black"
        }`}
      >
        {primary}
        {hint && <span className="ml-2 text-xs text-black/60">({hint})</span>}
      </div>
    </div>
  );
}

/* ------------------------ Tailwind helper classes ---------------------------
.card = "rounded-2xl border border-black/10 bg-white p-3 shadow-sm"
.btn-primary = "px-4 py-2 rounded-xl bg-black text-white font-semibold hover:opacity-90 disabled:opacity-50"
.btn-danger  = "px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:opacity-90 disabled:opacity-50"
----------------------------------------------------------------------------- */
