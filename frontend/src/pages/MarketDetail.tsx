import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, TrendingUp, Info, Maximize2, X, ArrowLeftRight, ChevronRight, Check, Loader2, XCircle, Pencil } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BottomSheet from '../components/BottomSheet'
import TradingViewWidget from '../components/TradingViewWidget'
import { useAccount } from 'wagmi'
import { formatUnits } from 'viem'
import CandlestickChart from '../components/CandlestickChart'
import { triggerHaptic } from '../utils/haptics'

interface MarketDetailProps {
  pairs: any[]
  onOpenTrade: () => Promise<'success' | 'rejected' | 'error'>
  collateral: string
  setCollateral: (val: string) => void
  leverage: string
  setLeverage: (val: string) => void
  leverageMin: number | null
  leverageMax: number | null
  isLong: boolean
  setIsLong: (val: boolean) => void
  tp: string
  setTp: (val: string) => void
  sl: string
  setSl: (val: string) => void
  loading: boolean
  onPairSelect: (index: number) => void
  isZeroFee: boolean
  setIsZeroFee: (val: boolean) => void
  usdcBalance: bigint | undefined
  onTradeModalChange?: (isOpen: boolean) => void
}

function fullLossLiquidationPrice({
  entryPrice,
  collateral,
  leverage,
  side = 'long',
  zeroFeeTrade = false,
  fees = 0
}: {
  entryPrice: number,
  collateral: number,
  leverage: number,
  side?: 'long' | 'short',
  zeroFeeTrade?: boolean,
  fees?: number
}): number {
  const openPrice = Number(entryPrice);
  const liqThreshold = 85;
  const rolloverFee = Number(fees);
  const long = Boolean(side === 'long');

  // Calculate opening fee
  const openingFeeBps = zeroFeeTrade ? 0 : 0.00045; // 4.5 bps
  const positionSize = collateral * leverage;
  const openingFee = positionSize * openingFeeBps;

  // Adjust collateral: collateral - openingFee (which is zero for zero fee trades)
  const adjustedCollateral = collateral - openingFee;

  // Calculate liquidation distance
  const liqPriceDistance =
    (openPrice * ((adjustedCollateral * liqThreshold) / 100 - rolloverFee)) /
    (adjustedCollateral * leverage);

  // Adjust price based on position direction
  const liqPrice = long
    ? openPrice - liqPriceDistance
    : openPrice + liqPriceDistance;

  // Return non-negative
  return liqPrice > 0 ? liqPrice : 0;
}

export default function MarketDetail({
  pairs,
  onOpenTrade,
  collateral,
  setCollateral,
  leverage,
  setLeverage,
  leverageMin,
  leverageMax,
  isLong,
  setIsLong,
  tp,
  setTp,
  sl,
  setSl,
  loading,
  onPairSelect,
  isZeroFee,
  setIsZeroFee,
  usdcBalance,
  onTradeModalChange
}: MarketDetailProps) {
  const { id } = useParams()
  const { isConnected } = useAccount()
  const [price, setPrice] = useState<number | null>(null)
  const [showTradeModal, setShowTradeModal] = useState(false)
  const [priceChange24h, setPriceChange24h] = useState<number>(0)
  const [price24hAgo, setPrice24hAgo] = useState<number | null>(null)
  const [isFullScreenChart, setIsFullScreenChart] = useState(false)
  const fullScreenChartRef = useRef<HTMLDivElement>(null)
  const [showTpPicker, setShowTpPicker] = useState(false)
  const [showSlPicker, setShowSlPicker] = useState(false)
  const [tpLocked, setTpLocked] = useState(false)
  const [slLocked, setSlLocked] = useState(false)
  const [swipeProgress, setSwipeProgress] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const swipeRef = useRef<HTMLDivElement>(null)
  const swipeStartX = useRef<number>(0)
  const lastHapticMilestone = useRef<number>(0)
  const currentSwipeProgress = useRef<number>(0)
  const hasInitializedTpSl = useRef<boolean>(false)
  const [tradeResult, setTradeResult] = useState<{
    positionSize: number
    collateral: number
    fees: number
    entryPrice: number
  } | null>(null)
  const [tradeStatus, setTradeStatus] = useState<'idle' | 'opening' | 'opened' | 'rejected'>('idle')
  const prevLoadingRef = useRef<boolean>(false)
  const navigate = useNavigate()

  const pairIndex = parseInt(id || '0')
  const pair = pairs.find(p => p.index === pairIndex)

  useEffect(() => {
    if (pair) {
      onPairSelect(pairIndex)
    }
  }, [pairIndex, pair, onPairSelect])

  // Fetch 24h ago price from backend for price change calculation
  useEffect(() => {
    const fetch24hPrice = async () => {
      try {
        if (!pair) return

        const response = await fetch(`https://avantis-backend.vercel.app/api/price-feeds/last-price/${pairIndex}`, {
          headers: {
            'ngrok-skip-browser-warning': '1'
          }
        })
        if (!response.ok) throw new Error('Failed to fetch 24h price')
        
        const data = await response.json()
        if (data && typeof data.c === 'number') {
          setPrice24hAgo(data.c)
        }
      } catch (e) {
        console.error('Failed to fetch 24h price from backend', e)
      }
    }

    if (pair) {
      fetch24hPrice()
    }
  }, [pair, pairIndex])

  // Calculate 24h price change when both current price and 24h ago price are available
  useEffect(() => {
    if (price !== null && price24hAgo !== null && price24hAgo !== 0) {
      const change = ((price - price24hAgo) / price24hAgo) * 100
      setPriceChange24h(change)
    }
  }, [price, price24hAgo])

  // Initialize TP/SL defaults once per modal open; don't overwrite user inputs
  useEffect(() => {
    if (!showTradeModal) {
      hasInitializedTpSl.current = false
      return
    }
    if (!price) return
    if (hasInitializedTpSl.current) return

    const tpUnset = !tp || Number(tp) === 0
    const slUnset = !sl || Number(sl) === 0
    if (isLong) {
      if (tpUnset && !tpLocked) setTp(String(Number((price * 1.15).toFixed(2))))
      if (slUnset && !slLocked) setSl(String(Number((price * 0.95).toFixed(2))))
    } else {
      if (tpUnset && !tpLocked) setTp(String(Number((price * 0.85).toFixed(2))))
      if (slUnset && !slLocked) setSl(String(Number((price * 1.05).toFixed(2))))
    }
    hasInitializedTpSl.current = true
  }, [showTradeModal, price, isLong, tpLocked, slLocked])

  // Notify parent when trade modal state changes
  useEffect(() => {
    if (onTradeModalChange) {
      onTradeModalChange(showTradeModal)
    }
  }, [showTradeModal, onTradeModalChange])

  // Handle escape key to close full-screen chart
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreenChart) {
        console.log('[MarketDetail] Closing full screen chart via Escape key')
        setIsFullScreenChart(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isFullScreenChart])

  // Log full screen state changes
  useEffect(() => {
    console.log('[MarketDetail] Full screen chart state:', isFullScreenChart)
  }, [isFullScreenChart])

  // WebSocket price updates
  useEffect(() => {
    const feedId = pair?.raw?.feed?.feedId
    if (!feedId) return

    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let isSubscribed = false

    const connect = () => {
      try {
        ws = new WebSocket('wss://hermes.pyth.network/ws')

        ws.onopen = () => {
          console.log('WebSocket connected')
          // Subscribe to price updates for this feed
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'subscribe',
              ids: [feedId]
            }))
            isSubscribed = true
          }
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            
            // Handle price update messages
            if (data.type == 'price_update' && data.price_feed) {
              const priceFeed = data.price_feed
              if (priceFeed.id.toLowerCase().replace(/^0x/, '') === feedId.toLowerCase().replace(/^0x/, '')) {
                const p = priceFeed.price
                if (p && p.price !== undefined && typeof p.expo === 'number') {
                  // Handle price as either string or number
                  const priceValue = typeof p.price === 'string' ? p.price : String(p.price)
                  const parsedPrice = Number(priceValue) * Math.pow(10, p.expo)
                
                  
                  setPrice(parsedPrice)

                  // Set default TP/SL based on direction only if not user-locked
                  if ((tp === '0' || !tp) && !tpLocked) {
                    setTp(String(Number((parsedPrice * (isLong ? 1.15 : 0.85)).toFixed(2))))
                  }
                  if ((sl === '0' || !sl) && !slLocked) {
                    setSl(String(Number((parsedPrice * (isLong ? 0.95 : 1.05)).toFixed(2))))
                  }
                }
              }
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message', e)
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
        }

        ws.onclose = () => {
          console.log('WebSocket disconnected')
          isSubscribed = false
          // Attempt to reconnect after 5 seconds
          reconnectTimeout = setTimeout(() => {
            console.log('Attempting to reconnect...')
            connect()
          }, 5000)
        }
      } catch (e) {
        console.error('Failed to create WebSocket connection', e)
      }
    }

    connect()

    // Cleanup function
    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (ws) {
        if (isSubscribed && ws.readyState === WebSocket.OPEN) {
          // Unsubscribe before closing
          ws.send(JSON.stringify({
            type: 'unsubscribe',
            ids: [feedId]
          }))
        }
        ws.close()
      }
    }
  }, [pair, isLong])

  const handleOpenTradeModal = (long: boolean) => {
    if (!isConnected) {
      alert('Please connect your wallet first')
      return
    }
    triggerHaptic('light')
    setIsLong(long)
    setShowTradeModal(true)
  }

  const handleConfirmTrade = useCallback(async () => {
    triggerHaptic('success')
    // Calculate trade details before opening
    const positionSize = Number(collateral) * Number(leverage)
    const openingFeeBps = isZeroFee ? 0 : 0.00045 // 4.5 bps
    const fees = positionSize * openingFeeBps
    
    setTradeResult({
      positionSize,
      collateral: Number(collateral),
      fees,
      entryPrice: price ?? 0
    })
    
    // Set status to opening
    setTradeStatus('opening')
    
    // Open the trade and wait for result
    try {
      const result = await onOpenTrade()
      if (result === 'success') {
        setTradeStatus('opened')
      } else if (result === 'rejected') {
        setTradeStatus('rejected')
      } else {
        setTradeStatus('rejected') // Treat errors as rejected for UX
      }
    } catch (error) {
      setTradeStatus('rejected')
    }
  }, [collateral, leverage, isZeroFee, price, onOpenTrade])

  // Swipe handlers
  const handleSwipeStart = (clientX: number) => {
    if (loading || !swipeRef.current) return
    setIsSwiping(true)
    swipeStartX.current = clientX
    lastHapticMilestone.current = 0
    currentSwipeProgress.current = 0
    triggerHaptic('light')
  }

  const handleSwipeMove = useCallback((clientX: number) => {
    if (!isSwiping || !swipeRef.current || loading) return
    
    const rect = swipeRef.current.getBoundingClientRect()
    const buttonWidth = 56 // w-14 = 56px
    const deltaX = clientX - swipeStartX.current
    const maxSwipe = rect.width - buttonWidth
    
    // More accurate progress calculation
    const clampedDeltaX = Math.max(0, Math.min(maxSwipe, deltaX))
    const progress = maxSwipe > 0 ? (clampedDeltaX / maxSwipe) * 100 : 0
    
    currentSwipeProgress.current = progress
    setSwipeProgress(progress)
    
    // Trigger haptics at milestones (only once per milestone)
    const milestones = [25, 50, 75]
    const currentMilestone = milestones.find(m => progress >= m && lastHapticMilestone.current < m)
    if (currentMilestone !== undefined) {
      triggerHaptic('medium')
      lastHapticMilestone.current = currentMilestone
    }
  }, [isSwiping, loading])

  const handleSwipeEnd = useCallback(() => {
    if (!isSwiping || loading) {
      setIsSwiping(false)
      return
    }
    
    const currentProgress = currentSwipeProgress.current
    setIsSwiping(false)
    lastHapticMilestone.current = 0
    
    if (currentProgress >= 90) {
      // Complete swipe - trigger confirmation
      triggerHaptic('success')
      handleConfirmTrade()
      setSwipeProgress(0)
      currentSwipeProgress.current = 0
    } else {
      // Reset swipe with smooth animation
      triggerHaptic('light')
      setSwipeProgress(0)
      currentSwipeProgress.current = 0
    }
  }, [isSwiping, loading, handleConfirmTrade])

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    handleSwipeStart(e.touches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    handleSwipeMove(e.touches[0].clientX)
  }

  const handleTouchEnd = () => {
    handleSwipeEnd()
  }

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    handleSwipeStart(e.clientX)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSwiping) {
      handleSwipeMove(e.clientX)
    }
  }

  const handleMouseUp = () => {
    handleSwipeEnd()
  }

  // Track when trade completes (loading goes from true to false)
  useEffect(() => {
    if (prevLoadingRef.current && !loading && tradeStatus === 'opening') {
      // Trade completed - status will be set by handleConfirmTrade based on result
      // Don't auto-set to opened here, let the promise result handle it
    }
    prevLoadingRef.current = loading
  }, [loading, tradeStatus])

  // Reset trade status when modal closes
  useEffect(() => {
    if (!showTradeModal) {
      setTradeStatus('idle')
      setTradeResult(null)
      prevLoadingRef.current = false
      setSwipeProgress(0)
      setIsSwiping(false)
      lastHapticMilestone.current = 0
      currentSwipeProgress.current = 0
      // Reset leverage and collateral to defaults
      setLeverage('10') // Reset to 10x
      if (usdcBalance !== undefined) {
        const balance = parseFloat(formatUnits(usdcBalance, 6))
        const defaultCollateral = Math.floor(balance * 10 / 100) // 10% of balance
        setCollateral(String(defaultCollateral))
      } else {
        setCollateral('0')
      }
      setIsZeroFee(false) // Disable zero fee trading
      // Reset TP/SL related state
      setTpLocked(false)
      setSlLocked(false)
      setTpInputValue('')
      setSlInputValue('')
      setShowTpPriceEdit(false)
      setShowSlPriceEdit(false)
      setTpBasePrice(null)
      setSlBasePrice(null)
      setTpPercent(5) // Reset to default 5%
      setSlPercent(2) // Reset to default 2%
      // Reset picker modals
      setShowTpPicker(false)
      setShowSlPicker(false)
    }
  }, [showTradeModal, usdcBalance, setLeverage, setCollateral, setIsZeroFee])

  // Global mouse event listeners for swipe
  useEffect(() => {
    if (isSwiping) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        handleSwipeMove(e.clientX)
      }
      const handleGlobalMouseUp = () => {
        handleSwipeEnd()
      }
      
      window.addEventListener('mousemove', handleGlobalMouseMove)
      window.addEventListener('mouseup', handleGlobalMouseUp)
      
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove)
        window.removeEventListener('mouseup', handleGlobalMouseUp)
      }
    }
  }, [isSwiping, handleSwipeMove, handleSwipeEnd])

  const handleCollateralQuickSelect = (percent: number) => {
    if (usdcBalance === undefined) return
    triggerHaptic('light')
    const balance = parseFloat(formatUnits(usdcBalance, 6))
    const amount = Math.floor(balance * percent / 100)
    setCollateral(String(amount))
  }


  const getTpPercent = (): number => {
    if (!price || !tp || Number(tp) === 0) return 0
    const collateralNum = Number(collateral)
    const netPnl = calculateProjectedPnL(Number(tp), true)
    const pct = collateralNum > 0 ? (netPnl / collateralNum) * 100 : 0
    return Math.max(0, pct)
  }

  const getSlPercent = (): number => {
    if (!price || !sl || Number(sl) === 0) return 0
    const collateralNum = Number(collateral)
    const netPnl = calculateProjectedPnL(Number(sl), false)
    const pctLoss = collateralNum > 0 ? (-netPnl / collateralNum) * 100 : 0
    return Math.max(0, pctLoss)
  }

  // Calculate projected profit/loss
  const calculateProjectedPnL = (exitPrice: number, isProfit: boolean): number => {
    if (!price || !exitPrice || Number(collateral) === 0 || Number(leverage) === 0) return 0
    
    const entryPrice = price
    const collateralAmount = Number(collateral)
    const leverageAmount = Number(leverage)
    
    // Calculate position size (minus opening fee if applicable)
    const openingFeeBps = isZeroFee ? 0 : 0.00045 // 4.5 bps
    const positionSize = collateralAmount * leverageAmount
    const openingFee = positionSize * openingFeeBps
    const adjustedCollateral = collateralAmount - openingFee
    
    // Calculate shares
    const shares = (leverageAmount * adjustedCollateral) / entryPrice
    
    // Calculate gross PnL
    let grossPnl: number
    if (isLong) {
      grossPnl = (exitPrice - entryPrice) * shares
    } else {
      grossPnl = (entryPrice - exitPrice) * shares
    }
    
    // Calculate closing fee (assuming same as opening fee)
    const closingFee = positionSize * openingFeeBps
    
    // Net PnL
    const netPnl = grossPnl - closingFee
    
    return netPnl
  }

  // Local state for modal inputs
  const [tpInputValue, setTpInputValue] = useState('')
  const [slInputValue, setSlInputValue] = useState('')
  const [tpPercent, setTpPercent] = useState<number>(5) // Default 5%
  const [showTpPriceEdit, setShowTpPriceEdit] = useState(false)
  const [tpBasePrice, setTpBasePrice] = useState<number | null>(null)
  const [slPercent, setSlPercent] = useState<number>(2) // Default 2%
  const [showSlPriceEdit, setShowSlPriceEdit] = useState(false)
  const [slBasePrice, setSlBasePrice] = useState<number | null>(null)

  // Apply helpers
  const applyTpFromInput = () => {
    const value = parseFloat(tpInputValue)
    if (!isNaN(value) && value > 0) {
      setTp(String(value))
      setTpLocked(true)
    }
  }

  const applySlFromInput = () => {
    const value = parseFloat(slInputValue)
    if (!isNaN(value) && value > 0) {
      setSl(String(value))
      setSlLocked(true)
    }
  }

  // Helpers to convert between PnL% (of collateral) and TP price
  const getOpeningFeeBps = () => (isZeroFee ? 0 : 0.00045)
  const computeShares = (entry: number): number => {
    const collateralAmount = Number(collateral)
    const leverageAmount = Number(leverage)
    const openingFee = collateralAmount * leverageAmount * getOpeningFeeBps()
    const adjustedCollateral = collateralAmount - openingFee
    return (leverageAmount * adjustedCollateral) / entry
  }

  const computeClosingFee = (): number => {
    const collateralAmount = Number(collateral)
    const leverageAmount = Number(leverage)
    const positionSize = collateralAmount * leverageAmount
    return positionSize * getOpeningFeeBps()
  }

  const computeTpPriceFromPnlPercent = (percent: number): number | null => {
    if (tpBasePrice === null || percent <= 0) return null
    const entry = tpBasePrice
    const shares = computeShares(entry)
    if (shares <= 0) return null
    const closingFee = computeClosingFee()
    const targetNet = Number(collateral) * (percent / 100)
    const delta = (targetNet + closingFee) / shares
    const exit = isLong ? entry + delta : entry - delta
    return Number(exit.toFixed(2))
  }

  const computeNetPnlPercentForPrice = (exitPrice: number): number => {
    if (tpBasePrice === null) return 0
    const entry = tpBasePrice
    const shares = computeShares(entry)
    const closingFee = computeClosingFee()
    const gross = (isLong ? (exitPrice - entry) : (entry - exitPrice)) * shares
    const net = gross - closingFee
    const pct = (net / Number(collateral)) * 100
    return Math.max(0, pct)
  }

  // SL conversions: loss percent (positive) of collateral
  const computeSlPriceFromLossPercent = (percent: number): number | null => {
    if (slBasePrice === null || percent <= 0) return null
    const entry = slBasePrice
    const shares = computeShares(entry)
    if (shares <= 0) return null
    const closingFee = computeClosingFee()
    const targetNet = -Number(collateral) * (percent / 100)
    const gross = targetNet + closingFee
    const delta = gross / shares
    const exit = isLong ? entry + delta : entry - delta
    return Number(exit.toFixed(2))
  }

  const computeLossPercentForPrice = (exitPrice: number): number => {
    if (slBasePrice === null) return 0
    const entry = slBasePrice
    const shares = computeShares(entry)
    const closingFee = computeClosingFee()
    const gross = (isLong ? (exitPrice - entry) : (entry - exitPrice)) * shares
    const net = gross - closingFee
    const pct = (-net / Number(collateral)) * 100
    return Math.max(0, pct)
  }

  // Sync input values once when TP modal opens; snapshot the current price
  useEffect(() => {
    if (showTpPicker && price) {
      const base = price
      setTpBasePrice(base)
      if (tp && Number(tp) > 0) {
        setTpInputValue(tp)
        // Calculate percentage from existing TP using base price
        if (isLong) {
          const percent = ((Number(tp) - base) / base) * 100
          setTpPercent(Math.max(1, Math.min(2500, percent)))
        } else {
          const percent = ((base - Number(tp)) / base) * 100
          setTpPercent(Math.max(1, Math.min(2500, percent)))
        }
      } else {
        // Initialize input from current slider percent and base
        const multiplier = isLong ? (1 + tpPercent / 100) : (1 - tpPercent / 100)
        const calculatedPrice = Number((base * multiplier).toFixed(2))
        setTpInputValue(String(calculatedPrice))
      }
      setShowTpPriceEdit(false)
    }
  }, [showTpPicker])

  // Calculate TP price from percentage using the snapshot base price
  useEffect(() => {
    if (showTpPicker && tpBasePrice !== null && !showTpPriceEdit) {
      const p = computeTpPriceFromPnlPercent(tpPercent)
      if (p !== null) setTpInputValue(String(p))
    }
  }, [tpPercent, isLong, showTpPicker, showTpPriceEdit, tpBasePrice])

  useEffect(() => {
    if (showSlPicker && sl && Number(sl) > 0) {
      setSlInputValue(sl)
    } else if (showSlPicker && price) {
      setSlInputValue('')
    }
  }, [showSlPicker, sl, price])

  // Sync SL when modal opens; snapshot base and initialize percent/value
  useEffect(() => {
    if (showSlPicker && price) {
      const base = price
      setSlBasePrice(base)
      if (sl && Number(sl) > 0) {
        setSlInputValue(sl)
        const lossPct = computeLossPercentForPrice(Number(sl))
        setSlPercent(Math.max(1, Math.min(80, lossPct)))
      } else {
        const p = computeSlPriceFromLossPercent(slPercent)
        if (p !== null) setSlInputValue(String(p))
      }
      setShowSlPriceEdit(false)
    }
  }, [showSlPicker])

  // Update SL price from percent using snapshot base
  useEffect(() => {
    if (showSlPicker && slBasePrice !== null && !showSlPriceEdit) {
      const p = computeSlPriceFromLossPercent(slPercent)
      if (p !== null) setSlInputValue(String(p))
    }
  }, [slPercent, isLong, showSlPicker, showSlPriceEdit, slBasePrice])

  if (!pair) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12"
      >
        <p className="text-black/50">Market not found</p>
      </motion.div>
    )
  }

  const positionSize = Number(collateral) * Number(leverage) - (Number(collateral) * Number(leverage) * 0.00045)

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="space-y-2"
      >

        <CandlestickChart symbol={pair.from} />

      </motion.div>

      {/* Fixed Bottom Trading Buttons - Mobile Only */}
      <div className="md:hidden left-0 right-0 px-4 bg-gradient-to-t from-white via-white to-transparent pt-4 z-40">
        <div className="grid grid-cols-2 gap-3 max-w-screen-sm mx-auto">
          <button
            onClick={() => handleOpenTradeModal(true)}
            disabled={!isConnected}
            className="btn-success flex items-center justify-center gap-2 py-4 shadow-2xl active:scale-95 transition-transform"
          >
            <ArrowUpRight className="w-5 h-5" />
            <span className="font-bold">Long</span>
          </button>
          <button
            onClick={() => handleOpenTradeModal(false)}
            disabled={!isConnected}
            className="btn-danger flex items-center justify-center gap-2 py-4 shadow-2xl active:scale-95 transition-transform"
          >
            <ArrowDownRight className="w-5 h-5" />
            <span className="font-bold">Short</span>
          </button>
        </div>
      </div>

      {/* Desktop Trading Buttons */}
      <div className="hidden md:block fixed bottom-8 right-8 z-40">
        <div className="flex gap-3">
          <button
            onClick={() => handleOpenTradeModal(true)}
            disabled={!isConnected}
            className="btn-success flex items-center gap-2 py-4 px-8 shadow-2xl active:scale-95 transition-transform"
          >
            <ArrowUpRight className="w-5 h-5" />
            <span className="font-bold">Open Long</span>
          </button>
          <button
            onClick={() => handleOpenTradeModal(false)}
            disabled={!isConnected}
            className="btn-danger flex items-center gap-2 py-4 px-8 shadow-2xl active:scale-95 transition-transform"
          >
            <ArrowDownRight className="w-5 h-5" />
            <span className="font-bold">Open Short</span>
          </button>
        </div>
      </div>

      {/* Trade Modal - Bottom Sheet */}
      <BottomSheet
        isOpen={showTradeModal}
        onClose={() => {
          setShowTpPicker(false)
          setShowSlPicker(false)
          setShowTradeModal(false)
        }}
        title={
          tradeStatus === 'idle' ? (
            <div className="relative flex items-center w-full">
              <div className="flex items-center gap-2 flex-shrink-0">
                <img 
                  src={`https://www.avantisfi.com/images/pairs/crypto/${pair.from}.svg`}
                  alt={pair.from}
                  className="w-6 h-6 rounded-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
                <span className="font-semibold text-black">
                  {price ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Loading...'}
                </span>
              </div>
              <div className="absolute left-1/2 transform -translate-x-1/2 ml-4">
                <button
                  onClick={() => {
                    triggerHaptic('selection')
                    setIsLong(!isLong)
                  }}
                  className={`px-4 py-1.5 rounded-lg font-semibold text-sm transition-all active:scale-95 flex items-center gap-2 ${
                    isLong 
                      ? 'bg-green-600 text-white hover:bg-green-700' 
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {isLong ? 'Long' : 'Short'}
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : ''
        }
      >
        <AnimatePresence mode="wait">
          {tradeStatus === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3 pb-4"
            >
              {/* Amount Slider */}
          <div className="p-3 bg-black/5 rounded-xl border border-black/10">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-black">Collateral</span>
                {usdcBalance !== undefined && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                    {parseFloat(formatUnits(usdcBalance, 6)) === 0
                      ? '0 Available'
                      : `${parseFloat(formatUnits(usdcBalance, 6)).toFixed(2)} USDC`
                    }
                  </span>
                )}
                {usdcBalance === undefined && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
                    Loading...
                  </span>
                )}
              </div>
              <span className="text-sm font-bold text-black">${Math.floor(Number(collateral)).toLocaleString()}</span>
            </div>
            {/* <div className="mb-2">
              <span className="text-xs text-black/50">
                {usdcBalance !== undefined ? `${parseFloat(formatUnits(usdcBalance, 6)).toFixed(2)} Available` : 'Loading...'}
              </span>
            </div> */}
            <input
              type="range"
              value={collateral}
              onChange={(e) => {
                triggerHaptic('light')
                setCollateral(String(Math.floor(Number(e.target.value))))
              }}
              min="0"
              max={usdcBalance !== undefined ? Math.floor(parseFloat(formatUnits(usdcBalance, 6))) : '1000'}
              step="1"
              className="w-full h-2 bg-black/10 rounded-full appearance-none cursor-pointer slider-thumb"
              style={{
                background: `linear-gradient(to right, ${isLong ? '#10b981' : '#ef4444'} 0%, ${isLong ? '#10b981' : '#ef4444'} ${usdcBalance !== undefined ? (Number(collateral) / parseFloat(formatUnits(usdcBalance, 6))) * 100 : 0}%, #e5e7eb ${usdcBalance !== undefined ? (Number(collateral) / parseFloat(formatUnits(usdcBalance, 6))) * 100 : 0}%, #e5e7eb 100%)`
              }}
            />
            <div className="grid grid-cols-5 gap-2 mt-2">
              {[10,25, 50, 75, 100].map((percent) => (
                <button
                  key={percent}
                  onClick={() => handleCollateralQuickSelect(percent)}
                  className={`py-1.5 rounded-lg font-semibold text-xs transition-all ${
                    Number(collateral) > 0 && usdcBalance !== undefined &&
                    Math.floor(Number(collateral)) === Math.floor(parseFloat(formatUnits(usdcBalance, 6)) * percent / 100)
                      ? 'bg-black text-white shadow-md scale-105' 
                      : 'bg-white text-black/70 hover:bg-black/5 active:scale-95'
                  }`}
                >
                  {percent}%
                </button>
              ))}
            </div>
          </div>
                    {/* Zero Fee Toggle - Compact */}
                    <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-blue-600 text-xs">Zero Fee Trading</p>
              </div>
              <button
                onClick={() => {
                  triggerHaptic('selection')
                  setIsZeroFee(!isZeroFee)
                }}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  isZeroFee ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    isZeroFee ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>


          {/* Leverage Slider */}
          <div className="p-3 bg-black/5 rounded-xl border border-black/10">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-black">Leverage</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                Max {leverageMax ?? 75}x
                </span>
              </div>
              <span className="text-sm font-bold text-black">{leverage}x</span>
            </div>

            <input
              type="range"
              value={leverage}
              onChange={(e) => {
                triggerHaptic('light')
                setLeverage(e.target.value)
              }}
              min={leverageMin ?? 1}
              max={leverageMax ?? 75}
              step="1"
              className="w-full h-2 bg-black/10 rounded-full appearance-none cursor-pointer slider-thumb"
              style={{
                background: `linear-gradient(to right, ${isLong ? '#10b981' : '#ef4444'} 0%, ${isLong ? '#10b981' : '#ef4444'} ${(Number(leverage) - (leverageMin ?? 1)) / ((leverageMax ?? 75) - (leverageMin ?? 1)) * 100}%, #e5e7eb ${(Number(leverage) - (leverageMin ?? 1)) / ((leverageMax ?? 75) - (leverageMin ?? 1)) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>


          {/* TP/SL */}
          <div className="space-y-2">
            {/* Take Profit */}
              <button
                onClick={() => {
                  triggerHaptic('selection')
                setTpInputValue(tp && Number(tp) > 0 ? tp : '')
                setShowTpPicker(true)
                }}
              className="w-full p-3 bg-white border border-black/10 rounded-xl hover:bg-black/5 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <ArrowUpRight className={`w-4 h-4 ${tp && Number(tp) > 0 ? 'text-green-600' : 'text-black/40'}`} />
                  <span className="text-sm font-semibold text-black">
                    {tp && Number(tp) > 0
                      ? `Take Profit: +${getTpPercent().toFixed(2)}%`
                      : 'Add Take Profit'}
                  </span>
                </div>
              <ChevronRight className="w-4 h-4 text-black/40" />
              </button>
              
            {/* Stop Loss */}
                      <button
                        onClick={() => {
                          triggerHaptic('selection')
                setSlInputValue(sl && Number(sl) > 0 ? sl : '')
                setShowSlPicker(true)
              }}
              className="w-full p-3 bg-white border border-black/10 rounded-xl hover:bg-black/5 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <ArrowDownRight className={`w-4 h-4 ${sl && Number(sl) > 0 ? 'text-red-600' : 'text-black/40'}`} />
                  <span className="text-sm font-semibold text-black">
                    {sl && Number(sl) > 0
                      ? `Stop Loss: -${getSlPercent().toFixed(2)}%`
                      : 'Add Stop Loss'}
                  </span>
                </div>
              <ChevronRight className="w-4 h-4 text-black/40" />
              </button>
          </div>

          <div className="p-3 bg-gradient-to-br from-black/5 to-black/10 rounded-xl border border-black/10 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-black/60">Position Size</span>
              <span className="font-bold text-base text-black">${Math.floor(positionSize).toLocaleString()}</span>
            </div>
            {/* <div className="flex justify-between items-center">
              <span className="text-xs text-black/60">Entry Price</span>
              <span className="font-semibold text-sm text-black">${price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div> */}
            <div className="flex justify-between items-center">
              <span className="text-xs text-black/60">Liquidation Price</span>
              <span className="font-semibold text-sm text-red-600">
                ${fullLossLiquidationPrice({
                  entryPrice: price ?? 0,
                  collateral: Number(collateral),
                  leverage: Number(leverage),
                  side: isLong ? 'long' : 'short',
                  zeroFeeTrade: isZeroFee
                }).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-black/10">
              <span className="text-xs text-black/60">Liquidation Distance</span>
              <span className="font-semibold text-sm text-red-600">
                {price ? (-Math.abs(((fullLossLiquidationPrice({
                  entryPrice: price,
                  collateral: Number(collateral),
                  leverage: Number(leverage),
                  side: isLong ? 'long' : 'short',
                  zeroFeeTrade: isZeroFee
                }) - price) / price) * 100)).toFixed(2) : '0.00'}%
              </span>
            </div>
          </div>


          {/* Swipe to Confirm */}
          <div
            ref={swipeRef}
            className={`relative w-full h-14 rounded-2xl overflow-hidden ${
              isLong ? 'bg-green-600' : 'bg-red-600'
            } ${loading ? 'opacity-50' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
          >
            {/* Progress fill */}
            <div
              className={`absolute inset-0 transition-all duration-150 ${
                isLong ? 'bg-green-700' : 'bg-red-700'
              }`}
              style={{ width: `${swipeProgress}%` }}
            />
            
            {/* Swipe button */}
            <motion.div
              className="absolute left-0 top-0 h-full flex items-center justify-center cursor-grab active:cursor-grabbing z-10"
              animate={{ 
                x: swipeRef.current ? (swipeProgress / 100) * (swipeRef.current.offsetWidth - 56) : 0 
              }}
              transition={{ 
                type: 'spring', 
                stiffness: swipeProgress >= 90 ? 400 : 300, 
                damping: swipeProgress >= 90 ? 25 : 30 
              }}
            >
              <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-lg">
                <ChevronRight className={`w-6 h-6 ${isLong ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </motion.div>
            
            {/* Text overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="font-bold text-white text-base">
                {loading ? 'Processing...' : swipeProgress >= 90 ? 'Release to Confirm' : `Swipe to ${isLong ? 'Long' : 'Short'}`}
              </span>
            </div>
          </div>
            </motion.div>
          )}

          {tradeStatus === 'opening' && (
            <motion.div
              key="opening"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              {/* Loading State */}
              <div className="flex flex-col items-center justify-center py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                    isLong ? 'bg-green-100' : 'bg-red-100'
                  }`}
                >
                  <Loader2 className={`w-8 h-8 ${isLong ? 'text-green-600' : 'text-red-600'}`} />
                </motion.div>
                <h3 className={`text-2xl font-bold mb-2 ${isLong ? 'text-green-600' : 'text-red-600'}`}>
                  Opening {isLong ? 'Long' : 'Short'} Position
                </h3>
                <p className="text-black/60 text-sm">Waiting for wallet confirmation...</p>
              </div>
            </motion.div>
          )}

          {tradeStatus === 'opened' && tradeResult && (
            <motion.div
              key="opened"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4 pb-4"
            >
              {/* Success State */}
              <div className="flex flex-col items-center justify-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                  className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                    isLong ? 'bg-green-100' : 'bg-red-100'
                  }`}
                >
                  <Check className={`w-8 h-8 ${isLong ? 'text-green-600' : 'text-red-600'}`} />
                </motion.div>
                <h3 className={`text-2xl font-bold mb-2 ${isLong ? 'text-green-600' : 'text-red-600'}`}>
                  {isLong ? 'Long' : 'Short'} Position Opened
                </h3>
                
                {/* Asset Info */}
                <div className="flex items-center gap-3 mb-4">
                  <img 
                    src={`https://www.avantisfi.com/images/pairs/crypto/${pair.from}.svg`}
                    alt={pair.from}
                    className="w-12 h-12 rounded-full"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                  <h4 className="text-2xl font-bold text-black">{pair.from}</h4>
                </div>

                {/* Transaction Details */}
                <div className="w-full space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-black/10">
                    <span className="text-sm text-black/60">Position Size</span>
                    <span className="font-bold text-base text-black">
                      ${Math.floor(tradeResult.positionSize).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-black/10">
                    <span className="text-sm text-black/60">Collateral</span>
                    <span className="font-semibold text-sm text-black">
                      ${tradeResult.collateral.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-black/10">
                    <span className="text-sm text-black/60">Entry Price</span>
                    <span className="font-semibold text-sm text-black">
                      ${tradeResult.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-black/60">Fees</span>
                    <span className="font-semibold text-sm text-black">
                      ${tradeResult.fees.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  onClick={() => {
                    triggerHaptic('light')
                    setShowTradeModal(false)
                  }}
                  className={`w-full py-3 rounded-2xl font-bold text-white text-base transition-all active:scale-95 mt-4 ${
                    isLong 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-red-600 hover:bg-red-700'
                  } shadow-lg`}
                >
                  Done
                </button>
              </div>
            </motion.div>
          )}

          {tradeStatus === 'rejected' && (
            <motion.div
              key="rejected"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4 pb-4"
            >
              {/* Rejected State */}
              <div className="flex flex-col items-center justify-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-red-100"
                >
                  <XCircle className="w-8 h-8 text-red-600" />
                </motion.div>
                <h3 className="text-2xl font-bold mb-2 text-red-600">
                  Transaction Rejected
                </h3>
                <p className="text-black/60 text-sm text-center mb-4">
                  The transaction was rejected. You can try again or view your existing positions.
                </p>

                {/* Action Button */}
                <button
                  onClick={() => {
                    triggerHaptic('light')
                    navigate('/portfolio')
                    setShowTradeModal(false)
                  }}
                  className="w-full py-3 rounded-2xl font-bold text-white text-base transition-all active:scale-95 bg-black hover:bg-black/90 shadow-lg"
                >
                  View Positions
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </BottomSheet>

      {/* Take Profit Modal */}
      <AnimatePresence>
        {showTpPicker && price && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { applyTpFromInput(); setShowTpPicker(false) }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120]"
            />

            {/* Modal */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[121] bg-white rounded-t-3xl shadow-2xl"
            >
              {/* Handle */}
              <div className="flex justify-center py-3">
                <div className="w-12 h-1 bg-black/20 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-4 border-b border-black/10">
                <button
                  onClick={() => { applyTpFromInput(); setShowTpPicker(false) }}
                  className="text-black/70 font-medium text-base"
                >
                  Cancel
                </button>
                <span className="font-semibold text-black text-base">Take Profit</span>
                <button
                  onClick={() => {
                    applyTpFromInput()
                    triggerHaptic('success')
                    setShowTpPicker(false)
                  }}
                  className="font-semibold text-base text-green-600"
                >
                  Done
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-6">
                {/* Current Price Info */}
                <div className="p-3 bg-black/5 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-black/60">Current Price</span>
                    <span className="font-semibold text-black">${(tpBasePrice ?? price)?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
                      triggerHaptic('light')
                      setTpPercent(Number(e.target.value))
                      setShowTpPriceEdit(false)
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
                        triggerHaptic('selection')
                        setShowTpPriceEdit(!showTpPriceEdit)
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
                          const val = e.target.value
                          if (val === '' || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0)) {
                            setTpInputValue(val)
                            // Update percentage when price is manually edited
                          if (val && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
                            const tpPrice = parseFloat(val)
                            const pct = computeNetPnlPercentForPrice(tpPrice)
                            setTpPercent(Math.max(1, Math.min(2500, pct)))
                          }
                          }
                        }}
                        placeholder={`${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                        className="w-full pl-8 pr-4 py-4 bg-black/5 rounded-xl border border-black/10 text-lg font-semibold text-black focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  ) : (
                    <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20">
                      <span className="text-xl font-bold text-green-600">
                        ${tpInputValue && !isNaN(parseFloat(tpInputValue)) && parseFloat(tpInputValue) > 0 
                          ? parseFloat(tpInputValue).toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        }
                      </span>
                    </div>
                  )}
                </div>

                {/* Calculations */}
                {tpInputValue && !isNaN(parseFloat(tpInputValue)) && parseFloat(tpInputValue) > 0 && (
                  <>
                    {/* Percentage Change */}
                    <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-green-700">Price Change</span>
                        <span className={`text-lg font-bold ${(() => {
                            const tpPrice = parseFloat(tpInputValue)
                            const base = tpBasePrice ?? price
                            if (!base) return false
                            if (isLong) {
                              const percent = ((tpPrice - base) / base) * 100
                              return percent > 0
                            } else {
                              const percent = ((base - tpPrice) / base) * 100
                              return percent > 0
                            }
                          })() ? 'text-green-600' : 'text-red-600'}`}>
                          {(() => {
                            const tpPrice = parseFloat(tpInputValue)
                            const base = tpBasePrice ?? price
                            if (!base) return ''
                            if (isLong) {
                              const percent = ((tpPrice - base) / base) * 100
                              return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
                            } else {
                              const percent = ((base - tpPrice) / base) * 100
                              return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
                            }
                          })()}
                        </span>
                      </div>

                      {/* Projected Profit */}
                      <div className="flex justify-between items-center pt-2 border-t border-green-500/20">
                        <span className="text-sm font-semibold text-green-700">Projected Profit</span>
                        <span className="text-lg font-bold text-green-600">
                          ${calculateProjectedPnL(parseFloat(tpInputValue), true).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Stop Loss Modal */}
      <AnimatePresence>
        {showSlPicker && price && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { applySlFromInput(); setShowSlPicker(false) }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120]"
            />

            {/* Modal */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[121] bg-white rounded-t-3xl shadow-2xl"
            >
              {/* Handle */}
              <div className="flex justify-center py-3">
                <div className="w-12 h-1 bg-black/20 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-4 border-b border-black/10">
                <button
                  onClick={() => { applySlFromInput(); setShowSlPicker(false) }}
                  className="text-black/70 font-medium text-base"
                >
                  Cancel
                </button>
                <span className="font-semibold text-black text-base">Stop Loss</span>
                <button
                  onClick={() => {
                    applySlFromInput()
                    triggerHaptic('success')
                    setShowSlPicker(false)
                  }}
                  className="font-semibold text-base text-red-600"
                >
                  Done
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-6">
                {/* Current Price Info */}
                <div className="p-3 bg-black/5 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-black/60">Current Price</span>
                    <span className="font-semibold text-black">${(slBasePrice ?? price)?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
                      triggerHaptic('light')
                      setSlPercent(Number(e.target.value))
                      setShowSlPriceEdit(false)
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
                        triggerHaptic('selection')
                        setShowSlPriceEdit(!showSlPriceEdit)
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
                          const val = e.target.value
                          if (val === '' || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0)) {
                            setSlInputValue(val)
                            if (val && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
                              const slPrice = parseFloat(val)
                              const pct = computeLossPercentForPrice(slPrice)
                              setSlPercent(Math.max(1, Math.min(80, pct)))
                            }
                          }
                        }}
                        placeholder={`${(slBasePrice ?? price)?.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                        className="w-full pl-8 pr-4 py-4 bg-black/5 rounded-xl border border-black/10 text-lg font-semibold text-black focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                  ) : (
                    <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                      <span className="text-xl font-bold text-red-600">
                        ${slInputValue && !isNaN(parseFloat(slInputValue)) && parseFloat(slInputValue) > 0 
                          ? parseFloat(slInputValue).toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : (slBasePrice ?? price)?.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        }
                      </span>
                    </div>
                  )}
                </div>

                {/* Calculations */}
                {slInputValue && !isNaN(parseFloat(slInputValue)) && parseFloat(slInputValue) > 0 && (
                  <>
                    {/* Price Change */}
                    <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-red-700">Price Change</span>
                        <span className={`text-lg font-bold ${(() => {
                            const slPrice = parseFloat(slInputValue)
                            const base = slBasePrice ?? price
                            if (!base) return false
                            if (isLong) {
                              const percent = ((slPrice - base) / base) * 100
                              return percent < 0
                            } else {
                              const percent = ((base - slPrice) / base) * 100
                              return percent < 0
                            }
                          })() ? 'text-red-600' : 'text-green-600'}`}>
                          {(() => {
                            const slPrice = parseFloat(slInputValue)
                            const base = slBasePrice ?? price
                            if (!base) return ''
                            if (isLong) {
                              const percent = ((slPrice - base) / base) * 100
                              return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
                            } else {
                              const percent = ((base - slPrice) / base) * 100
                              return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
                            }
                          })()}
                        </span>
                      </div>

                      {/* Projected Loss */}
                      <div className="flex justify-between items-center pt-2 border-t border-red-500/20">
                        <span className="text-sm font-semibold text-red-700">Projected Loss</span>
                        <span className="text-lg font-bold text-red-600">
                          ${Math.abs(calculateProjectedPnL(parseFloat(slInputValue), false)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Custom slider styles */}
      <style>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 2px solid ${isLong ? '#10b981' : '#ef4444'};
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .slider-thumb::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 2px solid ${isLong ? '#10b981' : '#ef4444'};
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
      `}</style>

      {/* Full Screen Chart Modal */}
      {isFullScreenChart && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-white"
          style={{ isolation: 'isolate' }}
        >
          <div className="h-full w-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-4 py-3 border-b border-black/10 bg-white z-10">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg md:text-xl font-bold text-black">{pair.name} Chart</h2>
                {price && (
                  <div className="flex items-center gap-2">
                    <span className="text-base md:text-lg font-semibold text-black">
                      ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-xs md:text-sm font-semibold ${priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  console.log('[MarketDetail] Closing full screen chart via X button')
                  setIsFullScreenChart(false)
                }}
                className="p-2 hover:bg-black/5 rounded-lg transition-colors shrink-0"
                aria-label="Close full screen chart"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

          </div>
        </motion.div>
      )}
    </>
  )
}
