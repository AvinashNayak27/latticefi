import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ArrowUpRight } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type PairInfo = {
  name: string;
  index: number;
  from: string;
  to: string;
  raw: any;
};

interface SearchMarketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pairs: PairInfo[];
  onPairSelect: (index: number) => void;
}

export default function SearchMarketsModal({
  isOpen,
  onClose,
  pairs,
  onPairSelect,
}: SearchMarketsModalProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [pairPrices, setPairPrices] = useState<Record<number, number>>({});
  const [historicalPrices, setHistoricalPrices] = useState<
    Record<number, number>
  >({});

  // Fetch prices for all pairs
  useEffect(() => {
    if (!isOpen || pairs.length === 0) return;

    // Filter pairs by groupIndex (0, 1, 4) and exclude delisted
    const allowedPairs = pairs.filter((pair) => {
      const groupIndex = pair.raw?.groupIndex;
      if (groupIndex === undefined || ![0, 1, 4, 5].includes(groupIndex))
        return false;
      // Exclude pairs with "delisted" in from field (case insensitive)
      if (pair.from?.toLowerCase().includes("delisted")) return false;
      return true;
    });

    if (allowedPairs.length === 0) return;

    const feedIdToPairIndices = new Map<string, number[]>();
    allowedPairs.forEach((pair) => {
      const feedId = pair.raw?.feed?.feedId;
      if (feedId) {
        const cleanFeedId = feedId.slice(2);
        if (!feedIdToPairIndices.has(cleanFeedId)) {
          feedIdToPairIndices.set(cleanFeedId, []);
        }
        feedIdToPairIndices.get(cleanFeedId)!.push(pair.index);
      }
    });

    const rawFeedIds = Array.from(feedIdToPairIndices.keys());
    const feedIds = rawFeedIds.filter(
      (feedId) =>
        feedId !==
        "b98e7ae8af2d298d2651eb21ab5b8b5738212e13efb43bd0dfbce7a74ba4b5d0"
    );

    if (feedIds.length === 0) return;

    const wsUrl = `wss://hermes.pyth.network/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("SearchModal: Pyth WebSocket connected");
          ws?.send(
            JSON.stringify({
              type: "subscribe",
              ids: feedIds,
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data?.type === "price_update" && data?.price_feed) {
              const feedId = data.price_feed.id;
              const p = data.price_feed.price;

              if (
                feedId &&
                p &&
                typeof p?.price === "string" &&
                typeof p?.expo === "number"
              ) {
                const price = Number(p.price) * Math.pow(10, p.expo);
                const pairIndices = feedIdToPairIndices.get(feedId);

                if (pairIndices) {
                  const priceUpdates: Record<number, number> = {};
                  pairIndices.forEach((index) => {
                    priceUpdates[index] = price;
                  });
                  setPairPrices((prev) => ({ ...prev, ...priceUpdates }));
                }
              }
            }
          } catch (e) {
            console.error("Error parsing WebSocket message:", e);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
          console.log("SearchModal: Pyth WebSocket disconnected");
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        };
      } catch (e) {
        console.error("Error connecting to WebSocket:", e);
        reconnectTimeout = setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [isOpen, pairs]);

  // Fetch historical prices
  useEffect(() => {
    if (!isOpen) return;

    const fetchHistoricalPrices = async () => {
      try {
        const res = await fetch(
          "https://avantis-backend.vercel.app/api/price-feeds/last-price",
          {
            headers: {
              "ngrok-skip-browser-warning": "true",
            },
          }
        );
        const data = await res.json();

        if (Array.isArray(data)) {
          const priceMap: Record<number, number> = {};
          data.forEach((item: any) => {
            if (
              typeof item?.pairIndex === "number" &&
              typeof item?.c === "number"
            ) {
              priceMap[item.pairIndex] = item.c;
            }
          });
          setHistoricalPrices(priceMap);
        }
      } catch (e) {
        console.error("Error fetching historical prices:", e);
      }
    };

    fetchHistoricalPrices();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      setSearchQuery(""); // Clear search when closing
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Filter pairs by groupIndex (0, 1, 4) and search
  const filteredPairs = pairs.filter((pair) => {
    const groupIndex = pair.raw?.groupIndex;
    const allowedGroupIndices = [0, 1, 4, 5];
    const matchesGroupIndex =
      groupIndex !== undefined && allowedGroupIndices.includes(groupIndex);

    if (!matchesGroupIndex) return false;

    // Exclude pairs with "delisted" in from field (case insensitive)
    if (pair.from?.toLowerCase().includes("delisted")) return false;

    return (
      pair.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pair.from?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pair.to?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handlePairClick = (pair: PairInfo) => {
    onPairSelect(pair.index);
    navigate(`/markets/${pair.index}`);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-20 md:pt-24"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-3xl shadow-2xl border border-black/10 w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-black/10">
                <h3 className="text-lg font-bold text-black">Search Markets</h3>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-black/70" />
                </button>
              </div>

              {/* Search Input */}
              <div className="px-4 py-4 border-b border-black/10">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/40" />
                  <input
                    type="text"
                    placeholder="Search markets (ETH, BTC, etc.)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full pl-12 pr-4 py-3 bg-black/5 border border-black/10 rounded-2xl text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-black/20 transition-all"
                  />
                </div>
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {filteredPairs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-black/50 text-sm">
                      {searchQuery
                        ? "No markets found"
                        : "Start typing to search markets"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredPairs.map((pair: PairInfo) => {
                      const price = pairPrices[pair.index];
                      const historicalPrice = historicalPrices[pair.index];
                      const priceChange =
                        price && historicalPrice
                          ? ((price - historicalPrice) / historicalPrice) * 100
                          : 0;

                      return (
                        <motion.div
                          key={pair.index}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => handlePairClick(pair)}
                          className="p-4 rounded-2xl border border-black/10 hover:border-black/30 cursor-pointer transition-all bg-gradient-to-br from-white to-gray-50"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-bold text-base text-black">
                                {pair.name}
                              </h4>
                              <span className="text-xs text-black/40">
                                #{pair.index}
                              </span>
                            </div>
                            {price && (
                              <div className="px-2 py-1 bg-green-500/10 rounded-lg">
                                <span className="text-xs font-semibold text-green-600">
                                  LIVE
                                </span>
                              </div>
                            )}
                          </div>

                          {price ? (
                            <div className="mt-2">
                              <p className="text-xl font-bold text-black">
                                $
                                {price.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                              <div className="flex items-center gap-1 mt-1">
                                <ArrowUpRight
                                  className={`w-3 h-3 ${
                                    priceChange >= 0
                                      ? "text-green-500"
                                      : "text-red-500 rotate-90"
                                  }`}
                                />
                                <span
                                  className={`text-xs ${
                                    priceChange >= 0
                                      ? "text-green-500"
                                      : "text-red-500"
                                  }`}
                                >
                                  {priceChange >= 0 ? "+" : ""}
                                  {priceChange.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2">
                              <div className="h-6 bg-black/5 rounded animate-pulse" />
                            </div>
                          )}

                          {pair.raw?.leverages && (
                            <div className="mt-2 pt-2 border-t border-black/10">
                              <span className="text-xs text-black/50">
                                Max Leverage:{" "}
                                <span className="font-semibold text-black">
                                  {pair.raw.leverages.maxLeverage}x
                                </span>
                              </span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
