'use client';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import { sdk } from '@farcaster/miniapp-sdk';
import { Maximize2, X, Pencil, Plus, Minus, RotateCcw } from 'lucide-react';
import TradingViewWidget from './TradingViewWidget';

const TIMEFRAMES = [
  { label: '1M', res: '1' },
  { label: '5M', res: '5' },
  { label: '4H', res: '240' },
  { label: '1D', res: 'D' },
  { label: '1W', res: '1W' },
];

const STREAMING_URL = 'https://benchmarks.pyth.network/v1/shims/tradingview/streaming';

// Convert symbol prop (e.g., "btc") to API format (e.g., "Crypto.BTC/USD")
function getSymbolForAPI(symbol: string): string {
  const upperSymbol = symbol.toUpperCase();
  return `Crypto.${upperSymbol}/USD`;
}

// Global streaming subscription management
const channelToSubscription = new Map<string, {
  lastDailyBar: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null;
  resolution: string;
  handlers: Array<{
    id: string;
    resolution: string;
    callback: (bar: {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }) => void;
  }>;
}>();

let streamReaderInstance: ReadableStreamDefaultReader<Uint8Array> | null = null;
let isStreamingActive = false;
let streamSubscriberCount = 0;

interface CandlestickData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BAR_WIDTH = 9;
const BAR_GAP = 4;
const BAR_SPACING = BAR_WIDTH + BAR_GAP;
const LEFT_PADDING = 10;
const RIGHT_PADDING = 70; // Fixed price labels on right side
const CHART_TOP_PADDING = 10;
const TIMESTAMP_SPACE = 20;
const VOLUME_HEIGHT_FACTOR = 0.175;
const VOLUME_GAP = 4;

const COLORS = {
  green: '#28D02C',
  red: '#FF043C',
  background: '#18181b',
  backgroundSecondary: '#27272a',
  backgroundTertiary: '#3f3f46',
  textTertiary: '#a1a1aa',
};

function getUnixRange(res: string, numCandles: number = 200) {
  const now = dayjs();
  let seconds: number;
  switch (res) {
    case '1': seconds = 60; break;
    case '5': seconds = 300; break;
    case '240': seconds = 14400; break;
    case 'D': seconds = 86400; break;
    case '1W': seconds = 604800; break;
    default: seconds = 60;
  }
  const to = now.unix();
  let from = to - seconds * numCandles;
  const oneYearAgo = now.subtract(1, 'year').unix();
  if (from < oneYearAgo) {
    from = oneYearAgo;
    numCandles = Math.floor((to - from) / seconds);
  }
  console.log('from', from, 'to', to);
  return { from, to };
}

function getResolutionSeconds(res: string): number {
  switch (res) {
    case '1': return 60;
    case '5': return 300;
    case '240': return 14400;
    case 'D': return 86400;
    case '1W': return 604800;
    default: return 60;
  }
}

function getNextBarTime(barTimestamp: number, resolution: string): number {
  const barDate = dayjs(barTimestamp);
  const seconds = getResolutionSeconds(resolution);
  
  if (resolution === '1W') {
    // Move to start of next week (Monday)
    return barDate.add(1, 'week').startOf('week').unix() * 1000;
  } else if (resolution === 'D') {
    // Move to start of next day
    return barDate.add(1, 'day').startOf('day').unix() * 1000;
  } else {
    // For minute-based resolutions, add the resolution seconds
    return barDate.add(seconds, 'second').unix() * 1000;
  }
}

function getNextDailyBarTime(barTime: number): number {
  const barDate = dayjs(barTime);
  return barDate.add(1, 'day').startOf('day').unix() * 1000;
}

function handleStreamingData(data: { id?: string; p?: number; t?: number }) {
  const { id, p, t } = data;

  if (!id || !p || !t) return;

  const tradePrice = p;
  const tradeTime = t * 1000; // Multiplying by 1000 to get milliseconds

  const channelString = id;
  const subscriptionItem = channelToSubscription.get(channelString);

  if (!subscriptionItem) {
    return;
  }

  // Process each handler with its own resolution
  subscriptionItem.handlers.forEach((handler) => {
    const handlerResolution = handler.resolution;
    // Use the subscription's lastDailyBar as a starting point, but calculate based on handler's resolution
    const lastBar = subscriptionItem.lastDailyBar;

    if (!lastBar) {
      // If no last bar, initialize with current trade
      const currentBarStartTime = getBarStartTime(tradeTime, handlerResolution);
      const newBar = {
        time: currentBarStartTime,
        open: tradePrice,
        high: tradePrice,
        low: tradePrice,
        close: tradePrice,
      };
      // Update lastDailyBar for this handler's resolution context
      subscriptionItem.lastDailyBar = newBar;
      handler.callback(newBar);
      return;
    }

    // Calculate bar times based on handler's resolution
    const lastBarStartTime = getBarStartTime(lastBar.time, handlerResolution);
    const currentBarStartTime = getBarStartTime(tradeTime, handlerResolution);
    const nextBarTime = getNextBarTime(lastBar.time, handlerResolution);

    let bar: {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
    };

    if (tradeTime >= nextBarTime || currentBarStartTime !== lastBarStartTime) {
      // Create a new bar
      bar = {
        time: currentBarStartTime,
        open: tradePrice,
        high: tradePrice,
        low: tradePrice,
        close: tradePrice,
      };
      console.log('[stream] Generate new bar', bar, 'for resolution', handlerResolution);
    } else {
      // Update existing bar
      bar = {
        ...lastBar,
        high: Math.max(lastBar.high, tradePrice),
        low: Math.min(lastBar.low, tradePrice),
        close: tradePrice,
      };
      console.log('[stream] Update the latest bar by price', tradePrice, 'for resolution', handlerResolution);
    }

    // Update lastDailyBar (this will be used by all handlers, so use the most recent bar)
    // In practice, since we typically have one handler per symbol, this should be fine
    subscriptionItem.lastDailyBar = bar;
    handler.callback(bar);
  });

  channelToSubscription.set(channelString, subscriptionItem);
}

async function startStreaming(retries = 3, delay = 3000) {
  if (isStreamingActive) {
    return;
  }

  let retriesLeft = retries;

  const attemptStream = async () => {
    try {
      const response = await fetch(STREAMING_URL);
      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      streamReaderInstance = reader;
      isStreamingActive = true;

      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            
            if (done) {
              console.log('[stream] Streaming ended.');
              isStreamingActive = false;
              streamReaderInstance = null;
              
              // Attempt to reconnect if we have active subscriptions
              if (streamSubscriberCount > 0 && retriesLeft > 0) {
                retriesLeft--;
                setTimeout(attemptStream, delay);
              }
              return;
            }

            // Process the streamed data
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            lines.forEach((line) => {
              const trimmedLine = line.trim();
              if (trimmedLine) {
                try {
                  const jsonData = JSON.parse(trimmedLine);
                  handleStreamingData(jsonData);
                } catch (e) {
                  console.error('[stream] Error parsing JSON:', e);
                }
              }
            });
          }
        } catch (error) {
          console.error('[stream] Error reading from stream:', error);
          isStreamingActive = false;
          streamReaderInstance = null;

          // Attempt to reconnect if we have active subscriptions
          if (streamSubscriberCount > 0 && retriesLeft > 0) {
            retriesLeft--;
            setTimeout(attemptStream, delay);
          }
        }
      };

      processStream();
    } catch (error) {
      console.error('[stream] Error fetching from streaming endpoint:', error);
      isStreamingActive = false;

      // Attempt to reconnect if we have active subscriptions
      if (streamSubscriberCount > 0 && retriesLeft > 0) {
        retriesLeft--;
        setTimeout(attemptStream, delay);
      }
    }
  };

  attemptStream();
}

function stopStreaming() {
  if (streamReaderInstance) {
    streamReaderInstance.cancel().catch(() => {
      // Ignore cancellation errors
    });
    streamReaderInstance = null;
  }
  isStreamingActive = false;
}

function subscribeOnStream(
  channelString: string,
  subscriberUID: string,
  resolution: string,
  lastBar: CandlestickData | null,
  callback: (bar: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }) => void
) {
  // Initialize or get subscription for this channel
  let subscriptionItem = channelToSubscription.get(channelString);
  
  if (!subscriptionItem) {
    subscriptionItem = {
      lastDailyBar: lastBar ? {
        time: lastBar.timestamp,
        open: lastBar.open,
        high: lastBar.high,
        low: lastBar.low,
        close: lastBar.close,
      } : null,
      resolution,
      handlers: [],
    };
    channelToSubscription.set(channelString, subscriptionItem);
  }

  // Check if handler already exists
  const existingHandlerIndex = subscriptionItem.handlers.findIndex(
    (handler) => handler.id === subscriberUID
  );

  if (existingHandlerIndex === -1) {
    // Add new handler
    subscriptionItem.handlers.push({
      id: subscriberUID,
      resolution,
      callback,
    });
    streamSubscriberCount++;

    // Start streaming if not already active
    if (!isStreamingActive && streamSubscriberCount > 0) {
      startStreaming();
    }
  } else {
    // Update existing handler
    subscriptionItem.handlers[existingHandlerIndex].callback = callback;
    subscriptionItem.handlers[existingHandlerIndex].resolution = resolution;
  }

  // Update lastDailyBar if provided
  if (lastBar) {
    subscriptionItem.lastDailyBar = {
      time: lastBar.timestamp,
      open: lastBar.open,
      high: lastBar.high,
      low: lastBar.low,
      close: lastBar.close,
    };
  }

  channelToSubscription.set(channelString, subscriptionItem);
  console.log('[subscribeOnStream]: Subscribe to streaming. Channel:', channelString);
}

function unsubscribeFromStream(subscriberUID: string) {
  // Find a subscription with id === subscriberUID
  for (const channelString of channelToSubscription.keys()) {
    const subscriptionItem = channelToSubscription.get(channelString);
    if (!subscriptionItem) continue;

    const handlerIndex = subscriptionItem.handlers.findIndex(
      (handler) => handler.id === subscriberUID
    );

    if (handlerIndex !== -1) {
      // Remove the handler
      subscriptionItem.handlers.splice(handlerIndex, 1);
      streamSubscriberCount--;

      // Unsubscribe from the channel if it is the last handler
      if (subscriptionItem.handlers.length === 0) {
        console.log(
          '[unsubscribeBars]: Unsubscribe from streaming. Channel:',
          channelString
        );
        channelToSubscription.delete(channelString);
      } else {
        channelToSubscription.set(channelString, subscriptionItem);
      }
      break;
    }
  }

  // Stop streaming if no more subscribers
  if (streamSubscriberCount === 0 && isStreamingActive) {
    stopStreaming();
  }
}

function getBarStartTime(timestamp: number, resolution: string): number {
  const date = dayjs(timestamp);
  const seconds = getResolutionSeconds(resolution);
  
  if (resolution === '1W') {
    return date.startOf('week').unix() * 1000;
  } else if (resolution === 'D') {
    return date.startOf('day').unix() * 1000;
  } else {
    // For minute-based resolutions, round down to the nearest interval
    const unixTimestamp = date.unix();
    const roundedUnix = Math.floor(unixTimestamp / seconds) * seconds;
    return roundedUnix * 1000;
  }
}

function formatPrice(price: number): string {
  if (price >= 1e9) return `$${(price / 1e9).toFixed(2)}B`;
  if (price >= 1e6) return `$${(price / 1e6).toFixed(2)}M`;
  if (price > 1) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(4)}`;
}

function formatTimestamp(timestamp: number, resolution?: string): string {
  if (resolution === '1W') {
    return dayjs(timestamp).format('MMM DD, YYYY');
  }
  return dayjs(timestamp).format('MMM DD, HH:mm');
}

function applyRubberBanding(value: number, min: number, max: number): number {
  if (value < min) {
    const distance = min - value;
    const damping = 0.4;
    return min - distance * damping;
  }
  if (value > max) {
    const distance = value - max;
    const damping = 0.4;
    return max + distance * damping;
  }
  return value;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function linearInterpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  if (radius <= 0) {
    ctx.fillRect(x, y, width, height);
    return;
  }
  
  radius = Math.min(radius, width / 2, height / 2);
  
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

interface CandlestickChartProps {
  symbol?: string; // e.g., "btc", "eth"
}

export default function CandlestickChart({ symbol = 'btc' }: CandlestickChartProps) {
  // Build API URL dynamically based on symbol
  const apiSymbol = getSymbolForAPI(symbol);
  const API_BASE = `https://benchmarks.pyth.network/v1/shims/tradingview/history?symbol=${encodeURIComponent(apiSymbol)}`;
  const [resolution, setResolution] = useState('5');
  const [data, setData] = useState<CandlestickData[]>([]);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [earliestTimestamp, setEarliestTimestamp] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSideToolbar, setShowSideToolbar] = useState(false);
  // Vertical price scale factor: >1 squeezes (more range, shorter candles), <1 expands (less range, taller candles)
  const [priceScaleFactor, setPriceScaleFactor] = useState(1);

  // Streaming subscription ID - unique per component instance
  const subscriberUIDRef = useRef<string>(`subscriber-${Date.now()}-${Math.random()}`);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastRenderTime = useRef<number>(0);
  const dprRef = useRef<number>(1);
  
  // Responsive dimensions
  const [chartDimensions, setChartDimensions] = useState({ width: 800, height: 400 });
  const VIEWPORT_WIDTH_PCT = 100; // percent of device width
  const VIEWPORT_HEIGHT_PCT = 54; // percent of device height
  
  useEffect(() => {
    // Get device pixel ratio for crisp rendering
    dprRef.current = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    
    const updateDimensions = () => {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
      setChartDimensions({
        width: (vw * VIEWPORT_WIDTH_PCT) / 100,
        height: (vh * VIEWPORT_HEIGHT_PCT) / 100,
      });
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const init = async () => {
      await sdk.actions.ready({
        disableNativeGestures: true,
      });
    }
    init();
  }, []);
  
  const CHART_WIDTH = chartDimensions.width;
  const CHART_HEIGHT = chartDimensions.height;

  // Gesture state
  const isLongPressing = useRef(false);
  const isPanning = useRef(false);
  const longPressTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const panStartX = useRef(0);
  const panStartOffset = useRef(0);
  const offsetX = useRef(0);
  const startOffsetX = useRef(0);
  const activeCandleIndex = useRef(-1);
  const opacityTransition = useRef(0);
  const recentlyScrolled = useRef(false);
  const mouseX = useRef(-1);
  const mouseY = useRef(-1);

  // Animation state
  const animatedPriceHigh = useRef(0);
  const animatedPriceLow = useRef(0);
  const animatedMaxVolume = useRef(1);
  const targetPriceHigh = useRef(0);
  const targetPriceLow = useRef(0);
  const targetMaxVolume = useRef(1);
  const animationStartHigh = useRef(0);
  const animationStartLow = useRef(0);
  const animationStartVolume = useRef(1);
  const priceAnimationProgress = useRef(0);
  const volumeAnimationProgress = useRef(0);
  const volumeBarsProgress = useRef(0);

  // Display state
  const [priceLabelState, setPriceLabelState] = useState<{
    high: { price: number; y: number };
    middle: { price: number; y: number };
    low: { price: number; y: number };
    current: { price: number; y: number };
  } | null>(null);
  const [displayTimestampState, setDisplayTimestampState] = useState<string>('');
  const [displayActivePriceState, setDisplayActivePriceState] = useState<string>('');
  const [displayActiveTimestampState, setDisplayActiveTimestampState] = useState<string>('');
  const [isLongPressingState, setIsLongPressingState] = useState(false);
  const [cursorStyle, setCursorStyle] = useState<'grab' | 'grabbing'>('grab');
  const [activeCandleOHLC, setActiveCandleOHLC] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);
  const [activeCandlePosition, setActiveCandlePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const displayPrice = useRef<string>('');
  const displayTimestamp = useRef<string>('');
  const displayActivePrice = useRef<string>('');
  const displayActiveTimestamp = useRef<string>('');

  // Price bar drag state for vertical scaling
  const isScalingDrag = useRef(false);
  const scaleStartY = useRef(0);
  // Pinch-to-zoom state
  const isPinching = useRef(false);
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);

  const totalWidth = useMemo(() => {
    return LEFT_PADDING + data.length * BAR_SPACING + RIGHT_PADDING;
  }, [data.length]);

  // Allow sliding into empty space to the right (not rendering candles there)
  const EMPTY_RIGHT_CANDLES = 40;
  const extraRightSpace = useMemo(() => {
    return Math.max(EMPTY_RIGHT_CANDLES * BAR_SPACING, Math.floor(chartDimensions.width * 0.5));
  }, [chartDimensions.width]);

  const totalWidthWithExtra = useMemo(() => {
    return totalWidth + extraRightSpace;
  }, [totalWidth, extraRightSpace]);

  const initialScrollX = useMemo(() => {
    // Start aligned to the last actual candle (exclude extra right space from initial)
    return Math.max(0, totalWidth - chartDimensions.width);
  }, [totalWidth, chartDimensions.width]);

  useEffect(() => {
    offsetX.current = initialScrollX;
  }, [initialScrollX]);

  const fetchData = useCallback(async (numCandles: number = 200, append: boolean = false) => {
    if (append && loadingMore) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    
    setError('');
    const { from, to } = getUnixRange(resolution, numCandles);
    
    try {
      const url = `${API_BASE}&resolution=${resolution}&from=${from}&to=${to}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.s !== 'ok') throw new Error('No data');
      
      const candlestickData: CandlestickData[] = (json.t || []).map((t: number, i: number) => ({
        timestamp: t * 1000,
        open: json.o[i],
        high: json.h[i],
        low: json.l[i],
        close: json.c[i],
        volume: json.v[i] || 0,
      }));
      
      if (append && json.t && json.t.length > 0) {
        setData((prev) => {
          const existingTimestamps = new Set(prev.map((d) => d.timestamp));
          const newData = candlestickData.filter((d) => !existingTimestamps.has(d.timestamp));
          return [...newData, ...prev];
        });
        if (json.t && json.t.length > 0) {
          setEarliestTimestamp(json.t[0] * 1000);
        }
      } else {
        setData(candlestickData);
        if (json.t && json.t.length > 0) {
          setEarliestTimestamp(json.t[0] * 1000);
        }
      }
      
      if (json.c && json.c.length > 0) {
        setPrice(json.c.at(-1));
        setChange(json.c.at(-1) && json.o[0] ? ((json.c.at(-1) - json.o[0]) / json.o[0]) * 100 : 0);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load');
      if (!append) {
        setData([]);
        setPrice(null);
        setChange(null);
      }
    }
    
    if (append) setLoadingMore(false);
    else setLoading(false);
  }, [resolution, API_BASE]);

  useEffect(() => {
    // Unsubscribe from previous symbol/resolution before fetching new data
    unsubscribeFromStream(subscriberUIDRef.current);
    fetchData(200, false);
  }, [resolution, apiSymbol, fetchData]);

  // Handle streaming bar updates from subscription
  const handleStreamingBar = useCallback((bar: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }) => {
    setData((prevData) => {
      if (prevData.length === 0) {
        // If no data, initialize with the bar
        const newCandle: CandlestickData = {
          timestamp: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: 0,
        };
        setPrice(bar.close);
        return [newCandle];
      }

      const lastCandle = prevData[prevData.length - 1];
      const lastBarStartTime = getBarStartTime(lastCandle.timestamp, resolution);
      const currentBarStartTime = getBarStartTime(bar.time, resolution);
      const nextBarTime = getNextBarTime(lastCandle.timestamp, resolution);

      // If we're still in the same bar, update it
      if (bar.time < nextBarTime && lastBarStartTime === currentBarStartTime) {
        const updatedCandle: CandlestickData = {
          ...lastCandle,
          high: Math.max(lastCandle.high, bar.high),
          low: Math.min(lastCandle.low, bar.low),
          close: bar.close,
        };

        // Update price and change
        setPrice(bar.close);
        if (prevData.length > 0 && prevData[0].open) {
          setChange(((bar.close - prevData[0].open) / prevData[0].open) * 100);
        }

        return [...prevData.slice(0, -1), updatedCandle];
      } else if (bar.time >= nextBarTime || currentBarStartTime !== lastBarStartTime) {
        // Create a new bar
        const newCandle: CandlestickData = {
          timestamp: currentBarStartTime,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: 0, // Volume will be updated by next historical fetch
        };

        setPrice(bar.close);
        if (prevData.length > 0 && prevData[0].open) {
          setChange(((bar.close - prevData[0].open) / prevData[0].open) * 100);
        }

        // Add new candle and maintain scroll position
        const currentTotalWidth = LEFT_PADDING + prevData.length * BAR_SPACING + RIGHT_PADDING;
        const wasAtEnd = offsetX.current >= currentTotalWidth - chartDimensions.width - 10;
        const newData = [...prevData, newCandle];
        
        // If we were viewing the latest, stay at the end
        if (wasAtEnd) {
          setTimeout(() => {
            const newTotalWidth = LEFT_PADDING + newData.length * BAR_SPACING + RIGHT_PADDING;
            offsetX.current = Math.max(0, newTotalWidth - chartDimensions.width);
          }, 0);
        }

        return newData;
      }

      return prevData;
    });
  }, [resolution, chartDimensions.width]);

  // Subscribe to streaming when data is loaded
  useEffect(() => {
    if (!loading && data.length > 0) {
      const lastBar = data[data.length - 1];
      console.log('[stream] Subscribing to streaming for symbol:', apiSymbol, 'resolution:', resolution);
      
      subscribeOnStream(
        apiSymbol,
        subscriberUIDRef.current,
        resolution,
        lastBar,
        handleStreamingBar
      );
    }

    // Cleanup: unsubscribe when symbol/resolution changes or component unmounts
    return () => {
      console.log('[stream] Unsubscribing from streaming for symbol:', apiSymbol);
      unsubscribeFromStream(subscriberUIDRef.current);
    };
  }, [loading, data.length, resolution, apiSymbol, handleStreamingBar]);

  const handleLoadMore = useCallback(() => {
    if (!earliestTimestamp || loadingMore) return;
    
    const now = dayjs();
    let seconds: number;
    switch (resolution) {
      case '1': seconds = 60; break;
      case '5': seconds = 300; break;
      case '240': seconds = 14400; break;
      case 'D': seconds = 86400; break;
      case 'W': seconds = 604800; break;
      default: seconds = 60;
    }
    
    const to = earliestTimestamp / 1000 - 1;
    const from = to - seconds * 200;
    
    async function loadMoreData() {
      try {
        const url = `${API_BASE}&resolution=${resolution}&from=${from}&to=${to}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.s !== 'ok') return;
        
        const candlestickData: CandlestickData[] = (json.t || []).map((t: number, i: number) => ({
          timestamp: t * 1000,
          open: json.o[i],
          high: json.h[i],
          low: json.l[i],
          close: json.c[i],
          volume: json.v[i] || 0,
        }));

        if (candlestickData.length > 0) {
          setData((prev) => {
            const existingTimestamps = new Set(prev.map((d) => d.timestamp));
            const newData = candlestickData.filter((d) => !existingTimestamps.has(d.timestamp));
            return [...newData, ...prev];
          });
          setEarliestTimestamp(json.t[0] * 1000);
        }
      } catch (e) {
        console.error('Failed to load more data:', e);
      }
    }
    
    setLoadingMore(true);
    loadMoreData().finally(() => setLoadingMore(false));
  }, [earliestTimestamp, resolution, loadingMore, API_BASE]);

  const getCandleIndexAtX = useCallback((x: number): number => {
    const currentOffsetX = offsetX.current;
    const touchX = x;
    const candleIndex = Math.round((touchX + currentOffsetX - LEFT_PADDING) / BAR_SPACING);
    return Math.max(0, Math.min(data.length - 1, candleIndex));
  }, [data.length]);

  // Haptic feedback helper
  const triggerHaptic = useCallback((type: 'light' | 'medium' | 'heavy' | 'selection' = 'selection') => {
    try {
      // Use Farcaster SDK haptic methods
      if (type === 'selection' && sdk?.haptics?.selectionChanged) {
        sdk.haptics.selectionChanged();
      } else if (sdk?.haptics?.impactOccurred) {
        const impactStyle = type === 'light' ? 'light' : type === 'medium' ? 'medium' : 'heavy';
        sdk.haptics.impactOccurred(impactStyle);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        // Fallback to Web Vibration API
        const pattern = type === 'light' ? 10 : type === 'medium' ? 20 : type === 'heavy' ? 30 : 15;
        navigator.vibrate(pattern);
      }
    } catch (error) {
      // Silently fail if haptics aren't available
      console.debug('Haptic feedback not available:', error);
    }
  }, []);

  const clearHoldMode = useCallback(() => {
    opacityTransition.current = 0;
    setTimeout(() => {
      activeCandleIndex.current = -1;
      isLongPressing.current = false;
      setIsLongPressingState(false);
      displayActivePrice.current = '';
      displayActiveTimestamp.current = '';
      setDisplayActivePriceState('');
      setDisplayActiveTimestampState('');
      setActiveCandleOHLC(null);
      setActiveCandlePosition(null);
    }, 150);
  }, []);

  const getCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const { x, y } = getCoordinates(e.clientX, e.clientY);

    panStartX.current = x;
    panStartOffset.current = offsetX.current;
    isPanning.current = false;
    recentlyScrolled.current = false;

    if (data.length === 0) return;

    longPressTimer.current = setTimeout(() => {
      if (isPanning.current || recentlyScrolled.current || data.length === 0) return;

      const candleIndex = getCandleIndexAtX(x);
      if (candleIndex >= 0 && candleIndex < data.length) {
        isLongPressing.current = true;
        setIsLongPressingState(true);
        activeCandleIndex.current = candleIndex;
        opacityTransition.current = 1;
        
        const candle = data[candleIndex];
        displayActivePrice.current = formatPrice(candle.close);
        displayActiveTimestamp.current = formatTimestamp(candle.timestamp, resolution);
        setDisplayActivePriceState(formatPrice(candle.close));
        setDisplayActiveTimestampState(formatTimestamp(candle.timestamp, resolution));
        setActiveCandleOHLC({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
        
        // Haptic feedback on long press activation
        triggerHaptic('medium');
      }
    }, 300);
  }, [data, getCandleIndexAtX, getCoordinates, triggerHaptic, resolution]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const { x, y } = getCoordinates(e.clientX, e.clientY);
    mouseX.current = x;
    mouseY.current = y;

    if (isLongPressing.current && data.length > 0) {
      const candleIndex = getCandleIndexAtX(x);
      if (candleIndex !== activeCandleIndex.current && candleIndex >= 0 && candleIndex < data.length) {
        activeCandleIndex.current = candleIndex;
        const candle = data[candleIndex];
        displayActivePrice.current = formatPrice(candle.close);
        displayActiveTimestamp.current = formatTimestamp(candle.timestamp, resolution);
        setDisplayActivePriceState(formatPrice(candle.close));
        setDisplayActiveTimestampState(formatTimestamp(candle.timestamp, resolution));
        setActiveCandleOHLC({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
        // Light haptic feedback when switching between candles
        triggerHaptic('light');
      }
      return;
    }
    
    if (longPressTimer.current !== undefined && !isLongPressing.current) {
      const deltaX = Math.abs(x - panStartX.current);
      if (deltaX > 5) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
        }
        longPressTimer.current = undefined;
        isPanning.current = true;
        setCursorStyle('grabbing');
      }
    }

    if (isPanning.current && !isLongPressing.current) {
      const deltaX = x - panStartX.current;
      const hasMovement = Math.abs(deltaX) > 5;
      if (hasMovement) recentlyScrolled.current = true;

      const minOffset = 0;
      const maxOffset = Math.max(0, totalWidthWithExtra - chartDimensions.width);
      const proposed = panStartOffset.current - deltaX;
      const newOffset = applyRubberBanding(proposed, minOffset, maxOffset);
      
      // Haptic feedback when hitting boundaries (rubber banding)
      const wasAtBoundary = offsetX.current === minOffset || offsetX.current === maxOffset;
      const isNowAtBoundary = newOffset === minOffset || newOffset === maxOffset;
      if (!wasAtBoundary && isNowAtBoundary) {
        triggerHaptic('light');
      }
      
      offsetX.current = newOffset;

      // Check for load more
      const startVisibleIndex = Math.max(0, Math.floor((offsetX.current - LEFT_PADDING) / BAR_SPACING));
      if (startVisibleIndex <= 60 && !loadingMore && earliestTimestamp) {
          handleLoadMore();
        }
    }
  }, [data, getCandleIndexAtX, totalWidth, loadingMore, earliestTimestamp, handleLoadMore, getCoordinates, triggerHaptic, resolution]);

  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current !== undefined) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      longPressTimer.current = undefined;
    }

    if (isLongPressing.current) {
      clearHoldMode();
    }

    if (isPanning.current) {
      const minOffset = 0;
      const maxOffset = Math.max(0, totalWidthWithExtra - chartDimensions.width);
      const currentOffset = offsetX.current;

      if (currentOffset < minOffset || currentOffset > maxOffset) {
        // Animate to bounds
        const target = Math.max(minOffset, Math.min(maxOffset, currentOffset));
        const startOffset = currentOffset;
        const duration = 400;
        const startTime = Date.now();

        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = easeOutCubic(progress);
          offsetX.current = linearInterpolate(startOffset, target, eased);

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            offsetX.current = target;
          }
        };
        animate();
      }
    }

    isPanning.current = false;
    setCursorStyle('grab');
  }, [totalWidth, clearHoldMode]);

  const handleMouseLeave = useCallback(() => {
    if (longPressTimer.current !== undefined) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      longPressTimer.current = undefined;
    }

    if (isLongPressing.current) {
      clearHoldMode();
    }

    isPanning.current = false;
    setCursorStyle('grab');
    mouseX.current = -1;
    mouseY.current = -1;
  }, [clearHoldMode]);

  // Touch handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    // Pinch start (two fingers)
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      isPinching.current = true;
      pinchStartDistance.current = Math.max(1, dist);
      pinchStartScale.current = priceScaleFactor;
      // Disable panning during pinch
      isPanning.current = false;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      longPressTimer.current = undefined;
      return;
    }

    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const { x, y } = getCoordinates(touch.clientX, touch.clientY);

    panStartX.current = x;
    panStartOffset.current = offsetX.current;
    isPanning.current = false;
    recentlyScrolled.current = false;

    if (data.length === 0) return;

    longPressTimer.current = setTimeout(() => {
      if (isPanning.current || recentlyScrolled.current || data.length === 0) return;

      const candleIndex = getCandleIndexAtX(x);
      if (candleIndex >= 0 && candleIndex < data.length) {
        isLongPressing.current = true;
        setIsLongPressingState(true);
        activeCandleIndex.current = candleIndex;
        opacityTransition.current = 1;
        
        const candle = data[candleIndex];
        displayActivePrice.current = formatPrice(candle.close);
        displayActiveTimestamp.current = formatTimestamp(candle.timestamp, resolution);
        setDisplayActivePriceState(formatPrice(candle.close));
        setDisplayActiveTimestampState(formatTimestamp(candle.timestamp, resolution));
        setActiveCandleOHLC({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
        
        // Haptic feedback on long press activation
        triggerHaptic('medium');
      }
    }, 300);
  }, [data, getCandleIndexAtX, getCoordinates, triggerHaptic, resolution]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    // Pinch move
    if (isPinching.current && e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = Math.max(0.2, Math.min(5, dist / Math.max(1, pinchStartDistance.current)));
      // Pinch out (ratio>1) expands (less range), pinch in squeezes (more range)
      const newScale = Math.max(0.5, Math.min(3, Number((pinchStartScale.current / ratio).toFixed(3))));
      setPriceScaleFactor(newScale);
      return;
    }

    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const { x, y } = getCoordinates(touch.clientX, touch.clientY);
    mouseX.current = x;
    mouseY.current = y;

    if (isLongPressing.current && data.length > 0) {
      const candleIndex = getCandleIndexAtX(x);
      if (candleIndex !== activeCandleIndex.current && candleIndex >= 0 && candleIndex < data.length) {
        activeCandleIndex.current = candleIndex;
        const candle = data[candleIndex];
        displayActivePrice.current = formatPrice(candle.close);
        displayActiveTimestamp.current = formatTimestamp(candle.timestamp, resolution);
        setDisplayActivePriceState(formatPrice(candle.close));
        setDisplayActiveTimestampState(formatTimestamp(candle.timestamp, resolution));
        setActiveCandleOHLC({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
        // Light haptic feedback when switching between candles
        triggerHaptic('light');
      }
      return;
    }

    if (longPressTimer.current !== undefined && !isLongPressing.current) {
      const deltaX = Math.abs(x - panStartX.current);
      if (deltaX > 5) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
        }
        longPressTimer.current = undefined;
        isPanning.current = true;
        setCursorStyle('grabbing');
      }
    }

    if (isPanning.current && !isLongPressing.current) {
      const deltaX = x - panStartX.current;
      const hasMovement = Math.abs(deltaX) > 5;
      if (hasMovement) recentlyScrolled.current = true;

      const minOffset = 0;
      const maxOffset = Math.max(0, totalWidthWithExtra - chartDimensions.width);
      const proposed = panStartOffset.current - deltaX;
      const newOffset = applyRubberBanding(proposed, minOffset, maxOffset);
      
      // Haptic feedback when hitting boundaries (rubber banding)
      const wasAtBoundary = offsetX.current === minOffset || offsetX.current === maxOffset;
      const isNowAtBoundary = newOffset === minOffset || newOffset === maxOffset;
      if (!wasAtBoundary && isNowAtBoundary) {
        triggerHaptic('light');
      }
      
      offsetX.current = newOffset;

      // Check for load more
      const startVisibleIndex = Math.max(0, Math.floor((offsetX.current - LEFT_PADDING) / BAR_SPACING));
      if (startVisibleIndex <= 60 && !loadingMore && earliestTimestamp) {
        handleLoadMore();
      }
    }
  }, [data, getCandleIndexAtX, totalWidth, loadingMore, earliestTimestamp, handleLoadMore, getCoordinates, chartDimensions.width, triggerHaptic, resolution]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    // End pinch if fingers lifted
    if (isPinching.current && e.touches.length < 2) {
      isPinching.current = false;
    }
    if (longPressTimer.current !== undefined) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      longPressTimer.current = undefined;
    }

    if (isLongPressing.current) {
      clearHoldMode();
    }

    if (isPanning.current) {
      const minOffset = 0;
      const maxOffset = Math.max(0, totalWidthWithExtra - chartDimensions.width);
      const currentOffset = offsetX.current;

      if (currentOffset < minOffset || currentOffset > maxOffset) {
        const target = Math.max(minOffset, Math.min(maxOffset, currentOffset));
        const startOffset = currentOffset;
        const duration = 400;
        const startTime = Date.now();

        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = easeOutCubic(progress);
          offsetX.current = linearInterpolate(startOffset, target, eased);

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            offsetX.current = target;
          }
        };
        animate();
      }
    }

    isPanning.current = false;
    setCursorStyle('grab');
  }, [totalWidth, clearHoldMode, chartDimensions.width]);

  const renderChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = dprRef.current;
    const currentChartWidth = chartDimensions.width;
    const currentChartHeight = chartDimensions.height;

    // Set canvas internal size (scaled for high DPI)
    const scaledWidth = currentChartWidth * dpr;
    const scaledHeight = currentChartHeight * dpr;
    
    // Only update if dimensions changed to avoid unnecessary re-scaling
    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }

    // Reset transformation matrix and scale for high DPI
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Enable high-quality image smoothing for crisp anti-aliased rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Now clear and draw at logical coordinates
    ctx.clearRect(0, 0, currentChartWidth, currentChartHeight);

    if (data.length === 0) {
      // Draw fade gradients
      const fadeHeight = 10;
      const topGradient = ctx.createLinearGradient(0, 0, 0, fadeHeight);
      topGradient.addColorStop(0, COLORS.background);
      topGradient.addColorStop(1, `${COLORS.background}00`);
      ctx.fillStyle = topGradient;
      ctx.fillRect(0, 0, currentChartWidth, fadeHeight);

      const bottomY = currentChartHeight - TIMESTAMP_SPACE - fadeHeight + 10;
      const bottomGradient = ctx.createLinearGradient(0, bottomY, 0, bottomY + fadeHeight);
      bottomGradient.addColorStop(0, `${COLORS.background}00`);
      bottomGradient.addColorStop(1, COLORS.background);
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(0, bottomY, currentChartWidth, fadeHeight);

      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, bottomY + fadeHeight, currentChartWidth, currentChartHeight - bottomY - fadeHeight);
      return;
    }

    const currentOffsetX = offsetX.current;
    // Calculate end index accounting for right padding to avoid overlap with price labels
    const chartDrawWidth = currentChartWidth - RIGHT_PADDING;
    const startIndex = Math.max(0, Math.floor((currentOffsetX - LEFT_PADDING) / BAR_SPACING));
    const endIndex = Math.min(data.length - 1, Math.ceil((currentOffsetX + chartDrawWidth - LEFT_PADDING) / BAR_SPACING) + 1);

    const visibleCandles = data.slice(startIndex, endIndex + 1);
    if (visibleCandles.length === 0) return;

    // Calculate price range
    const wickHighs = visibleCandles.map((c) => c.high).sort((a, b) => a - b);
    const wickLows = visibleCandles.map((c) => c.low).sort((a, b) => a - b);

    const p99Index = Math.min(Math.floor(wickHighs.length * 0.99), wickHighs.length - 1);
    const p1Index = Math.floor(wickLows.length * 0.01);

    const highestWick = wickHighs[p99Index];
    const lowestWick = wickLows[p1Index];

    const rawRange = highestWick - lowestWick;
    const padding = rawRange * 0.05;

    const isViewingLatest = endIndex === data.length - 1;
    const currentPrice = data[data.length - 1]?.close || 0;

    let targetHigh = highestWick + padding;
    let targetLow = lowestWick - padding;

    if (isViewingLatest) {
      targetHigh = Math.max(targetHigh, currentPrice);
      targetLow = Math.min(targetLow, currentPrice);
    }

    if (targetHigh - targetLow === 0) return;

    // Apply vertical scale factor around the center to squeeze/expand price range
    const centerPriceForScale = (targetHigh + targetLow) / 2;
    const halfRangeHigh = targetHigh - centerPriceForScale;
    const halfRangeLow = centerPriceForScale - targetLow;
    const scaledHalfRangeHigh = halfRangeHigh * priceScaleFactor;
    const scaledHalfRangeLow = halfRangeLow * priceScaleFactor;
    targetHigh = centerPriceForScale + scaledHalfRangeHigh;
    targetLow = centerPriceForScale - scaledHalfRangeLow;
    if (targetHigh - targetLow === 0) return;

    // Animate price range
    if (targetHigh !== targetPriceHigh.current || targetLow !== targetPriceLow.current) {
      animationStartHigh.current = animatedPriceHigh.current || targetHigh;
      animationStartLow.current = animatedPriceLow.current || targetLow;
      targetPriceHigh.current = targetHigh;
      targetPriceLow.current = targetLow;
      priceAnimationProgress.current = 0;

      const animatePrice = () => {
        priceAnimationProgress.current = Math.min(priceAnimationProgress.current + 0.05, 1);
        const eased = 1 - Math.pow(1 - priceAnimationProgress.current, 3);
        animatedPriceHigh.current = linearInterpolate(animationStartHigh.current, targetHigh, eased);
        animatedPriceLow.current = linearInterpolate(animationStartLow.current, targetLow, eased);

        if (priceAnimationProgress.current < 1) {
          requestAnimationFrame(animatePrice);
        }
      };
      animatePrice();
    }

    const high = animatedPriceHigh.current || targetHigh;
    const low = animatedPriceLow.current || targetLow;
    const range = high - low;

    if (range === 0) return;

    // Calculate volume range
    const targetMaxVol = Math.max(...visibleCandles.map((c) => c.volume), 1);
    if (targetMaxVol !== targetMaxVolume.current) {
      animationStartVolume.current = animatedMaxVolume.current || targetMaxVol;
      targetMaxVolume.current = targetMaxVol;
      volumeAnimationProgress.current = 0;

      const animateVolume = () => {
        volumeAnimationProgress.current = Math.min(volumeAnimationProgress.current + 0.05, 1);
        const eased = 1 - Math.pow(1 - volumeAnimationProgress.current, 3);
        animatedMaxVolume.current = linearInterpolate(animationStartVolume.current, targetMaxVol, eased);

        if (volumeAnimationProgress.current < 1) {
          requestAnimationFrame(animateVolume);
        }
      };
      animateVolume();
    }

    // Animate volume bars on load
    if (volumeBarsProgress.current < 1) {
      volumeBarsProgress.current = Math.min(volumeBarsProgress.current + 0.03, 1);
    }

    const maxVol = animatedMaxVolume.current;

    // Calculate regions
    const totalChartHeight = currentChartHeight - CHART_TOP_PADDING - TIMESTAMP_SPACE;
    const volumeRegionHeight = totalChartHeight * VOLUME_HEIGHT_FACTOR;
    const candleRegionHeight = totalChartHeight - volumeRegionHeight - VOLUME_GAP;
    const volumeStartY = CHART_TOP_PADDING + candleRegionHeight + VOLUME_GAP;

    const scalePrice = (price: number): number => {
      const normalized = (price - low) / range;
      return CHART_TOP_PADDING + candleRegionHeight * (1 - normalized);
    };

    // Draw grid lines
    ctx.strokeStyle = COLORS.backgroundSecondary;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.lineDashOffset = currentOffsetX % 4;

    const middle = (high + low) / 2;
    const maxOffset = Math.max(0, totalWidthWithExtra - currentChartWidth);
    const isAtOrPastNewest = currentOffsetX >= maxOffset - 1;
    // Always stop before right padding to avoid overlapping with price labels
    const lineEndX = currentChartWidth - RIGHT_PADDING;

    [high, middle, low].forEach((price) => {
      const y = scalePrice(price) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(lineEndX, y);
      ctx.stroke();
    });

    // Draw current price line
    const currentPriceColor = change && change < 0 ? `${COLORS.red}50` : `${COLORS.green}50`;
    ctx.strokeStyle = currentPriceColor;
    const currentY = scalePrice(currentPrice) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, currentY);
    ctx.lineTo(lineEndX, currentY);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw active candle indicator line BEHIND candles
    if (isLongPressing.current && activeCandleIndex.current >= 0) {
      const activeIndex = activeCandleIndex.current;
      if (activeIndex >= 0 && activeIndex < data.length) {
        const x = LEFT_PADDING + activeIndex * BAR_SPACING - currentOffsetX;
        const centerX = x + BAR_WIDTH / 2;

        const activeCandle = data[activeIndex];
        const fullHeight = Math.min((activeCandle.volume / maxVol) * volumeRegionHeight, volumeRegionHeight);
        const normalizedHeight = fullHeight * volumeBarsProgress.current;
        const volumeBarTopY = volumeStartY + (volumeRegionHeight - normalizedHeight);

        // Calculate Y position of candle's close price for positioning OHLC display
        const candleCloseY = scalePrice(activeCandle.close);

        // Update active candle position state (throttled to avoid too many updates)
        const now = Date.now();
        if (now - lastRenderTime.current > 16) {
          setActiveCandlePosition({
            x: centerX,
            y: candleCloseY,
          });
          lastRenderTime.current = now;
        }

        ctx.strokeStyle = COLORS.backgroundSecondary;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(centerX, CHART_TOP_PADDING);
        ctx.lineTo(centerX, volumeBarTopY);
        ctx.stroke();
      }
    } else {
      // Clear position when not long pressing
      if (activeCandlePosition !== null) {
        setActiveCandlePosition(null);
      }
    }

    // Draw volume bars
    ctx.fillStyle = COLORS.backgroundTertiary;
    const transitionProgress = opacityTransition.current;
    const activeIndexForVolume = activeCandleIndex.current;

    for (let i = startIndex; i <= endIndex && i < data.length; i++) {
      const candle = data[i];
      const isActive = i === activeIndexForVolume;
      const opacity = isActive ? 1 : 1 - transitionProgress * 0.7;

      ctx.globalAlpha = opacity;

      const x = LEFT_PADDING + i * BAR_SPACING - currentOffsetX;
      const fullHeight = Math.min((candle.volume / maxVol) * volumeRegionHeight, volumeRegionHeight);
      const normalizedHeight = fullHeight * volumeBarsProgress.current;
      const y = volumeStartY + (volumeRegionHeight - normalizedHeight);

      ctx.fillRect(x, y, BAR_WIDTH, normalizedHeight);
    }

    ctx.globalAlpha = 1;

    // Draw candles
    const activeIndex = activeCandleIndex.current;

    // Green candles
    ctx.fillStyle = COLORS.green;
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';

    for (let i = startIndex; i <= endIndex && i < data.length; i++) {
      const candle = data[i];
      if (candle.close < candle.open) continue;

      const isActive = i === activeIndex;
      const opacity = isActive ? 1 : 1 - transitionProgress * 0.7;
      ctx.globalAlpha = opacity;

      const x = LEFT_PADDING + i * BAR_SPACING - currentOffsetX;
      const centerX = x + BAR_WIDTH / 2;

      const highY = scalePrice(candle.high);
      const lowY = scalePrice(candle.low);
      const openY = scalePrice(candle.open);
      const closeY = scalePrice(candle.close);

      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyHeight = Math.max(Math.abs(closeY - openY), 1);

      // Draw wick
      if (highY < bodyTop) {
        ctx.beginPath();
        ctx.moveTo(centerX, highY);
        ctx.lineTo(centerX, bodyTop);
        ctx.stroke();
      }
      if (lowY > bodyBottom) {
        ctx.beginPath();
        ctx.moveTo(centerX, bodyBottom);
        ctx.lineTo(centerX, lowY);
        ctx.stroke();
      }

      // Draw body with rounded corners
      const radius = Math.min(2, BAR_WIDTH / 2, bodyHeight / 2);
      drawRoundedRect(ctx, x, bodyTop, BAR_WIDTH, bodyHeight, radius);
    }

    // Red candles
    ctx.fillStyle = COLORS.red;
    ctx.strokeStyle = COLORS.red;

    for (let i = startIndex; i <= endIndex && i < data.length; i++) {
      const candle = data[i];
      if (candle.close >= candle.open) continue;

      const isActive = i === activeIndex;
      const opacity = isActive ? 1 : 1 - transitionProgress * 0.7;
      ctx.globalAlpha = opacity;

      const x = LEFT_PADDING + i * BAR_SPACING - currentOffsetX;
      const centerX = x + BAR_WIDTH / 2;

      const highY = scalePrice(candle.high);
      const lowY = scalePrice(candle.low);
      const openY = scalePrice(candle.open);
      const closeY = scalePrice(candle.close);

      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyHeight = Math.max(Math.abs(closeY - openY), 1);

      // Draw wick
      if (highY < bodyTop) {
        ctx.beginPath();
        ctx.moveTo(centerX, highY);
        ctx.lineTo(centerX, bodyTop);
        ctx.stroke();
      }
      if (lowY > bodyBottom) {
        ctx.beginPath();
        ctx.moveTo(centerX, bodyBottom);
        ctx.lineTo(centerX, lowY);
        ctx.stroke();
      }

      // Draw body with rounded corners
      const radius = Math.min(2, BAR_WIDTH / 2, bodyHeight / 2);
      drawRoundedRect(ctx, x, bodyTop, BAR_WIDTH, bodyHeight, radius);
    }

    ctx.globalAlpha = 1;

    // Draw fade gradients
    const fadeHeight = 10;
    const topGradient = ctx.createLinearGradient(0, 0, 0, fadeHeight);
    topGradient.addColorStop(0, COLORS.background);
    topGradient.addColorStop(1, `${COLORS.background}00`);
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, currentChartWidth, fadeHeight);

    const bottomY = currentChartHeight - TIMESTAMP_SPACE - fadeHeight + 10;
    const bottomGradient = ctx.createLinearGradient(0, bottomY, 0, bottomY + fadeHeight);
    bottomGradient.addColorStop(0, `${COLORS.background}00`);
    bottomGradient.addColorStop(1, COLORS.background);
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, bottomY, currentChartWidth, fadeHeight);

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, bottomY + fadeHeight, currentChartWidth, currentChartHeight - bottomY - fadeHeight);

    // Update display values for labels (throttled to avoid too many re-renders)
    const now = Date.now();
    if (now - lastRenderTime.current > 16) { // ~60fps max
      if (startIndex >= 0 && startIndex < data.length) {
        let timestampStr = formatTimestamp(data[startIndex].timestamp, resolution);
        if (endIndex >= 0 && endIndex < data.length && endIndex !== startIndex) {
          const endTimestamp = formatTimestamp(data[endIndex].timestamp, resolution);
          timestampStr += ` - ${endTimestamp}`;
        }
        displayTimestamp.current = timestampStr;
        setDisplayTimestampState(timestampStr);
      }

      const currentPrice = data[data.length - 1]?.close || 0;
      const range = high - low;
      const totalChartHeight = currentChartHeight - CHART_TOP_PADDING - TIMESTAMP_SPACE;
      const volumeRegionHeight = totalChartHeight * VOLUME_HEIGHT_FACTOR;
      const candleRegionHeight = totalChartHeight - volumeRegionHeight - VOLUME_GAP;
      
      const scalePriceForLabels = (price: number): number => {
        if (range === 0) return candleRegionHeight / 2;
        const normalized = (price - low) / range;
        return CHART_TOP_PADDING + candleRegionHeight * (1 - normalized);
      };
      
      setPriceLabelState({
        high: { price: high, y: scalePriceForLabels(high) },
        middle: { price: middle, y: scalePriceForLabels(middle) },
        low: { price: low, y: scalePriceForLabels(low) },
        current: { price: currentPrice, y: scalePriceForLabels(currentPrice) },
      });
      lastRenderTime.current = now;
    }
  }, [data, change, totalWidth, loadingMore, earliestTimestamp, handleLoadMore, chartDimensions, resolution]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      renderChart();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderChart]);

  // Reset volume animation on data change
  useEffect(() => {
    volumeBarsProgress.current = 0;
  }, [data.length]);

  // Track offsetX changes with state for memo updates
  const [currentOffset, setCurrentOffset] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentOffset(offsetX.current);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const visibleCandles = useMemo(() => {
    const chartDrawWidth = chartDimensions.width - RIGHT_PADDING;
    const startIndex = Math.max(0, Math.floor((currentOffset - LEFT_PADDING) / BAR_SPACING));
    const endIndex = Math.min(data.length - 1, Math.ceil((currentOffset + chartDrawWidth - LEFT_PADDING) / BAR_SPACING) + 1);
    return data.slice(startIndex, endIndex + 1);
  }, [data, currentOffset, chartDimensions.width]);

  const priceLabels = priceLabelState || {
    high: { price: 0, y: 0 },
    middle: { price: 0, y: 0 },
    low: { price: 0, y: 0 },
    current: { price: 0, y: 0 },
  };

  // Convert symbol to TradingView format (e.g., "btc" -> "PYTH:BTCUSD")
  const tradingViewSymbol = `PYTH:${symbol.toUpperCase()}USD`;

  // Prevent body scroll when fullscreen is open
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // Handlers for scaling via right price bar interactions
  const adjustScale = useCallback((direction: 'squeeze' | 'expand', magnitude: number = 1) => {
    setPriceScaleFactor((prev) => {
      const factor = direction === 'squeeze' ? prev * (1 + 0.08 * magnitude) : prev / (1 + 0.08 * magnitude);
      const clamped = Math.max(0.5, Math.min(3, Number(factor.toFixed(3))));
      return clamped;
    });
  }, []);

  const handlePriceBarWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const isScrollDown = e.deltaY > 0;
    adjustScale(isScrollDown ? 'squeeze' : 'expand', Math.min(2, Math.max(0.5, Math.abs(e.deltaY) / 80)));
  }, [adjustScale, triggerHaptic]);

  const handlePriceBarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isScalingDrag.current = true;
    scaleStartY.current = e.clientY;
  }, []);

  const handlePriceBarMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isScalingDrag.current) return;
    e.preventDefault();
    e.stopPropagation();
    const deltaY = e.clientY - scaleStartY.current;
    // Drag down squeezes, drag up expands
    if (Math.abs(deltaY) >= 4) {
      const magnitude = Math.min(2.5, Math.max(0.2, Math.abs(deltaY) / 120));
      if (deltaY > 0) adjustScale('squeeze', magnitude); else adjustScale('expand', magnitude);
      scaleStartY.current = e.clientY;
    }
  }, [adjustScale]);

  const handlePriceBarMouseUp = useCallback(() => {
    if (isScalingDrag.current) {
      isScalingDrag.current = false;
    }
  }, []);

  const handlePriceBarTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    isScalingDrag.current = true;
    scaleStartY.current = touch.clientY;
  }, []);

  const handlePriceBarTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isScalingDrag.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - scaleStartY.current;
    if (Math.abs(deltaY) >= 4) {
      const magnitude = Math.min(2.5, Math.max(0.2, Math.abs(deltaY) / 120));
      if (deltaY > 0) adjustScale('squeeze', magnitude); else adjustScale('expand', magnitude);
      scaleStartY.current = touch.clientY;
    }
  }, [adjustScale]);

  const handlePriceBarTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isScalingDrag.current) {
      isScalingDrag.current = false;
    }
  }, []);

  return (
    <>
      <div className="w-full max-w-xl mx-auto p-0.5 md:p-1 bg-zinc-900 rounded-lg shadow-lg flex flex-col items-center text-zinc-100 min-h-[400px] md:min-h-[520px]">
        {/* Price and change % */}
        <div className="w-full flex items-baseline justify-between pt-3 md:pt-4 px-2 md:px-4 pb-1 relative">
          {/* Controls on right: Expand/Squeeze + Fullscreen */}
          <div className="absolute top-3 md:top-6 right-2 md:right-4 flex items-center gap-1 md:gap-2 z-10">
            {/* Expand (taller candles, limited price range) */}
            <button
              onClick={() => {
                triggerHaptic('selection');
                setPriceScaleFactor((prev) => Math.max(0.5, Number((prev / 1.2).toFixed(3))));
              }}
              className="p-1.5 md:p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              aria-label="Expand price (taller candles)"
              title="Expand price (taller candles)"
            >
              <Minus className="w-4 h-4 md:w-5 md:h-5 text-zinc-300" />
            </button>
            {/* Squeeze (shorter candles, higher price range) */}
            <button
              onClick={() => {
                triggerHaptic('selection');
                setPriceScaleFactor((prev) => Math.min(3, Number((prev * 1.2).toFixed(3))));
              }}
              className="p-1.5 md:p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              aria-label="Squeeze price (shorter candles)"
              title="Squeeze price (shorter candles)"
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5 text-zinc-300" />
            </button>
            {/* Reset price range scaling */}
            <button
              onClick={() => {
                triggerHaptic('selection');
                setPriceScaleFactor(1);
                // Snap view to the last actual candle position
                setTimeout(() => {
                  const endOffset = Math.max(
                    0,
                    (LEFT_PADDING + data.length * BAR_SPACING + RIGHT_PADDING) - chartDimensions.width
                  );
                  offsetX.current = endOffset;
                }, 0);
              }}
              className="p-1.5 md:p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              aria-label="Reset price scale"
              title="Reset price scale"
            >
              <RotateCcw className="w-4 h-4 md:w-5 md:h-5 text-zinc-300" />
            </button>
            {/* Fullscreen button */}
            <button
              onClick={() => {
                triggerHaptic('selection');
                setIsFullscreen(true);
              }}
              className="p-1.5 md:p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              aria-label="Open fullscreen chart"
            >
              <Maximize2 className="w-4 h-4 md:w-5 md:h-5 text-zinc-300" />
            </button>
          </div>
        <div>
          {loading ? (
            <>
              <div className="text-xl md:text-4xl font-extrabold tracking-tight">
                <span className="inline-block w-24 md:w-32 h-6 md:h-10 bg-zinc-800 rounded animate-pulse" />
              </div>
              <div className="text-xs md:text-sm font-bold mt-0.5 md:mt-1">
                <span className="inline-block w-12 md:w-16 h-4 md:h-5 bg-zinc-800 rounded animate-pulse" />
              </div>
            </>
          ) : (
            <>
              <div className="text-xl md:text-4xl font-extrabold tracking-tight">
                {price != null ? formatPrice(price) : '--'}
              </div>
              <div className="text-xs md:text-sm font-bold mt-0.5 md:mt-1" style={{ color: change && change < 0 ? COLORS.red : COLORS.green }}>
                {change != null ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : ''}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chart */}
      <div ref={chartContainerRef} className="flex-1 w-full relative overflow-hidden" style={{ minHeight: `${VIEWPORT_HEIGHT_PCT}vh` }}>
        {loading && <div className="flex items-center justify-center" style={{ height: `${VIEWPORT_HEIGHT_PCT}vh` }}>Loading…</div>}
        {error && <div className="text-center text-red-500 py-3">{error}</div>}
        {!loading && !error && (
          <div
            ref={containerRef}
            className="relative w-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              userSelect: 'none',
              cursor: cursorStyle,
              touchAction: 'none',
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ 
                display: 'block', 
                width: `${VIEWPORT_WIDTH_PCT}vw`, 
                height: `${VIEWPORT_HEIGHT_PCT}vh`, 
                maxWidth: '100%'
              }}
              className="relative"
              onContextMenu={(e) => e.preventDefault()}
            />

            {/* OHLC Display positioned dynamically based on active candle - Vertical Stack */}
            {isLongPressingState && activeCandleOHLC && displayActiveTimestampState && activeCandlePosition && (
              (() => {
                const chartCenterY = chartDimensions.height / 2;
                const isAboveCenter = activeCandlePosition.y < chartCenterY;
                const offset = 12; // Offset from the line
                
                return (
                  <div
                    className="absolute pointer-events-none z-20"
                    style={{
                      left: `${activeCandlePosition.x}px`,
                      transform: 'translateX(-50%)', // Center horizontally on the line
                      ...(isAboveCenter 
                        ? { top: `${activeCandlePosition.y + offset}px` } // Below the line if candle is above center
                        : { top: `${Math.max(10, activeCandlePosition.y - 130)}px` } // Above the line if candle is below center (approx 120px height + 10px padding)
                      ),
                    }}
                  >
                    <div className="bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2 shadow-lg">
                      <div className="flex flex-col gap-2 text-xs">
                        <div className="text-zinc-400 text-[10px] mb-1">
                          {displayActiveTimestampState}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 text-[10px] w-6">O:</span>
                            <span className="font-semibold">{formatPrice(activeCandleOHLC.open)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 text-[10px] w-6">H:</span>
                            <span className="font-semibold" style={{ color: COLORS.green }}>{formatPrice(activeCandleOHLC.high)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 text-[10px] w-6">L:</span>
                            <span className="font-semibold" style={{ color: COLORS.red }}>{formatPrice(activeCandleOHLC.low)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 text-[10px] w-6">C:</span>
                            <span className="font-semibold">{formatPrice(activeCandleOHLC.close)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}

            {/* Price Labels on RIGHT (Fixed) */}
            {data.length > 0 && (
              <div className="absolute right-0 top-0 bottom-0 pointer-events-none z-10" style={{ width: RIGHT_PADDING }}>
                {/* Interactive hit area for scaling via right price bar */}
                <div
                  className="absolute inset-0 pointer-events-auto"
                  onWheel={handlePriceBarWheel}
                  onMouseDown={handlePriceBarMouseDown}
                  onMouseMove={handlePriceBarMouseMove}
                  onMouseUp={handlePriceBarMouseUp}
                  onMouseLeave={handlePriceBarMouseUp}
                  onTouchStart={handlePriceBarTouchStart}
                  onTouchMove={handlePriceBarTouchMove}
                  onTouchEnd={handlePriceBarTouchEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ cursor: 'ns-resize' }}
                />
                {priceLabels.high && (
                  <div
                    className="absolute right-1 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ top: `${priceLabels.high.y - 9}px` }}
                  >
                    {formatPrice(priceLabels.high.price)}
                  </div>
                )}
                {priceLabels.middle && (
                  <div
                    className="absolute right-1 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ top: `${priceLabels.middle.y - 9}px` }}
                  >
                    {formatPrice(priceLabels.middle.price)}
                  </div>
                )}
                {priceLabels.low && (
                  <div
                    className="absolute right-1 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ top: `${priceLabels.low.y - 9}px` }}
                  >
                    {formatPrice(priceLabels.low.price)}
                  </div>
                )}
                {priceLabels.current && (
                  <div
                    className="absolute right-1 bg-zinc-800 border border-zinc-600 rounded-full px-1.5 py-0.5 text-[10px] font-semibold shadow-lg"
                    style={{
                      top: `${priceLabels.current.y - 9}px`,
                      color: change && change < 0 ? COLORS.red : COLORS.green,
                    }}
                  >
                    {formatPrice(priceLabels.current.price)}
                  </div>
                )}
              </div>
            )}

            {/* Timestamp Labels */}
            <div className="absolute bottom-0 left-0 right-0 pt-2 pointer-events-none">
              <div className="absolute left-1 bottom-0 text-[10px] font-semibold text-zinc-400">
                {displayTimestampState}
              </div>
            </div>
          </div>
        )}
        {loadingMore && (
          <div className="absolute top-0 left-0 right-0 flex items-center justify-center gap-2 pt-2 pointer-events-none z-10">
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-zinc-600 rounded-full animate-pulse"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
            <span className="text-xs text-zinc-400 ml-2">Loading historical data...</span>
          </div>
        )}
      </div>

      {/* Timeframe tabs */}
      <div className="flex items-center justify-between w-full mt-1 md:mt-2 px-2 md:px-3 py-1.5 md:py-2 bg-zinc-900 gap-1 md:gap-2">
        {TIMEFRAMES.map(({ label, res }) => (
          <button
            key={res}
            className={`flex-1 rounded-lg md:rounded-xl py-1 text-center text-xs md:text-sm font-medium transition-colors ${
              resolution === res ? 'bg-zinc-100 text-black shadow' : 'bg-zinc-800 text-zinc-300'
            }`}
            onClick={() => {
              if (resolution !== res) {
                triggerHaptic('selection');
              }
              setResolution(res);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>

    {/* Fullscreen TradingView Modal */}
    {isFullscreen && (
      <div 
        className="fixed inset-0 z-[9999] bg-white m-0 p-0 flex flex-col"
        style={{ 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0,
          width: '100vw',
          height: '100vh',
          margin: 0,
          padding: 0
        }}
      >
        {/* Header bar */}
        <div className="w-full bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
          {/* Asset symbol on left */}
          <div className="text-lg font-bold text-gray-900">
            {symbol.toUpperCase()}/USD
          </div>

          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            {/* Pencil icon to toggle side toolbar */}
            <button
              onClick={() => {
                triggerHaptic('selection');
                setShowSideToolbar(!showSideToolbar);
              }}
              className={`p-1.5 rounded-full transition-colors ${
                showSideToolbar 
                  ? 'bg-gray-300 hover:bg-gray-400' 
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
              aria-label="Toggle side toolbar"
            >
              <Pencil className="w-4 h-4 text-gray-700" />
            </button>

            {/* Close button */}
            <button
              onClick={() => {
                triggerHaptic('selection');
                setShowSideToolbar(false);
                setIsFullscreen(false);
              }}
              className="p-1.5 bg-gray-200 hover:bg-gray-300 rounded-full transition-colors"
              aria-label="Close fullscreen"
            >
              <X className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        </div>

        {/* TradingView Widget - Remaining space */}
        <div 
          className="flex-1 w-full m-0 p-0 overflow-hidden"
          style={{ 
            margin: 0,
            padding: 0
          }}
        >
          <TradingViewWidget 
            symbol={tradingViewSymbol}
            theme="light"
            fullscreen={true}
            showSideToolbar={showSideToolbar}
          />
        </div>
      </div>
    )}
    </>
  );
}