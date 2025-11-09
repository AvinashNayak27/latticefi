import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useSendTransaction, useDisconnect, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  Wallet,
  DollarSign,
  User,
  X,
  Check,
  AlertCircle,
  Bell,
  Network,
  ExternalLink,
  Loader2,
  Search,
  ChevronLeft
} from 'lucide-react' 

// Pages
import Markets from './pages/Markets'
import MarketDetail from './pages/MarketDetail'
import Earn from './pages/Earn'
import Profile from './pages/Profile'
import Portfolio from './pages/Portfolio'
import SearchMarketsModal from './components/SearchMarketsModal'
import sdk from "@farcaster/miniapp-sdk";
import { triggerHaptic } from './utils/haptics';

// Environment variables
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://avantis-backend.vercel.app'

// USDC Contract Constants
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC on Base
const USDC_ABI = [
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const

// Types
type PairInfo = {
  name: string
  index: number
  from: string
  to: string
  raw: any
}

type Notification = {
  id: string
  type: 'success' | 'error' | 'info' | 'pending' | 'confirming' | 'preparing'
  message: string
  txHash?: string
}

// Onboarding component
function OnboardingExperience({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)

  const steps = [
    {
      icon: <Network className="w-12 h-12" />,
      title: "Welcome to Lattice",
      description: "Transform your Avantis trading activity into a visible, social graph of conviction on Farcaster.",
      tagline: "A web of positions, insights, and reputation"
    },
    {
      icon: <TrendingUp className="w-12 h-12" />,
      title: "Avantis Positions, Seamlessly Mapped",
      description: "Your open positions from Avantis appear as dynamic nodes in your personal Lattice View.",
    },
    {
      icon: <User className="w-12 h-12" />,
      title: "Trading Moments, Socially Casted",
      description: "Turn your position into a visual trade card — shareable on Farcaster.",
    },
    {
      icon: <DollarSign className="w-12 h-12" />,
      title: "The Social Trading Graph",
      description: "See which traders share exposure, track sentiment shifts, and discover rising traders.",
    }
  ]

  const currentStep = steps[step]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[100] p-4"
    >
      <motion.div
        key={step}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl border border-black/10 max-w-lg w-full p-8 md:p-12 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="flex justify-center mb-4 text-black"
        >
          {currentStep.icon}
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl sm:text-2xl md:text-3xl font-bold text-black mb-4"
        >
          {currentStep.title}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-black/70 text-base mb-4 leading-relaxed"
        >
          {currentStep.description}
        </motion.p>

        {currentStep.tagline && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-black/50 italic text-sm mb-8"
          >
            {currentStep.tagline}
          </motion.p>
        )}

        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-black' : 'w-2 bg-black/30'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 btn-secondary"
            >
              Back
            </button>
          )}
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 btn-primary"
            >
              Next
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="flex-1 btn-primary"
            >
              Get Started
            </button>
          )}
        </div>

        <button
          onClick={onComplete}
          className="mt-4 text-black/50 text-xs hover:text-black/70 transition-colors"
        >
          Skip
        </button>
      </motion.div>
    </motion.div>
  )
}

// Custom ConnectButton component
function CustomConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button 
                    onClick={openConnectModal} 
                    type="button"
                    className="btn-primary flex items-center gap-2 px-4 py-4 text-sm font-semibold"
                  >
                    <Wallet className="w-4 h-4" />
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button 
                    onClick={openChainModal} 
                    type="button"
                    className="btn-danger flex items-center gap-2 px-4 py-4 text-sm font-semibold"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Wrong Network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={openAccountModal} 
                    type="button"
                    className="btn-primary flex items-center gap-2 px-4 py-4 text-sm font-semibold"
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    {account.displayName}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

// Navigation button component
function NavButton({ to, icon, label, isActive, onClick }: { to: string; icon: React.ReactNode; label: string; isActive: boolean; onClick?: () => void }) {
  return (
    <Link to={to}>
      <button
        className={`nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}
        onClick={onClick}
      >
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </button>
    </Link>
  )
}

// Desktop nav button
function DesktopNavButton({ to, icon, label, isActive }: { to: string; icon: React.ReactNode; label: string; isActive: boolean }) {
  return (
    <Link to={to}>
      <button
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all duration-300 text-sm ${
          isActive
            ? 'text-black'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <span className="flex items-center">{icon}</span>
        <span className="font-semibold">{label}</span>
      </button>
    </Link>
  )
}

function AppContent() {
  const { address, isConnected } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { disconnect } = useDisconnect()
  const location = useLocation()
  const navigate = useNavigate()

  // USDC Balance Hook
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  // State
  const [pairs, setPairs] = useState<PairInfo[]>([])
  const [selectedPairIndex, setSelectedPairIndex] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [collateral, setCollateral] = useState<string>('100')
  const [leverage, setLeverage] = useState<string>('10')
  const [isLong, setIsLong] = useState<boolean>(true)
  const [tp, setTp] = useState<string>('0')
  const [sl, setSl] = useState<string>('0')
  const [leverageMin, setLeverageMin] = useState<number | null>(null)
  const [leverageMax, setLeverageMax] = useState<number | null>(null)
  const [isZeroFee, setIsZeroFee] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [trades, setTrades] = useState<any[]>([])
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [realtimePrices, setRealtimePrices] = useState<Record<string, number>>({})

  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem('lattice_onboarding_seen')
  })

  const [userData, setUserData] = useState<{fid: number; username?: string; displayName?: string; pfpUrl?: string} | null>(null)
  const [showSearchMarkets, setShowSearchMarkets] = useState(false)
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false)

    useEffect(() => {
      const init = async () => {
        await sdk.actions.ready({
          disableNativeGestures: true,
        });
        const isInMiniApp = await sdk.isInMiniApp();
        console.log('isInMiniApp', isInMiniApp);
        try {
          const ctx = await sdk.context;
          const user = ctx.user;
          setUserData(user);
        } catch (e) {
          console.error('Failed to get user context', e);
        }
      };
      init();
    }, []);

  const addNotification = (type: 'success' | 'error' | 'info' | 'pending' | 'confirming' | 'preparing', message: string, txHash?: string, id?: string) => {
    const notifId = id || Math.random().toString(36).substr(2, 9)
    setNotifications((prev) => {
      const existing = prev.find((n) => n.id === notifId)
      if (existing) {
        return prev.map((n) => n.id === notifId ? { ...n, type, message, txHash } : n)
      }
      return [...prev, { id: notifId, type, message, txHash }]
    })
    
    // Only auto-remove success and error notifications
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notifId))
      }, 5000)
    }
    
    return notifId
  }

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const completeOnboarding = () => {
    localStorage.setItem('lattice_onboarding_seen', 'true')
    setShowOnboarding(false)
  }

  // Fetch pairs
  useEffect(() => {
    const run = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/pairs`, {
          headers: {
            'ngrok-skip-browser-warning': 'true'
          }
        })
        const data = res.data as Record<string, any>
        const mapped: PairInfo[] = Object.entries(data).map(([key, value]) => ({
          name: value.from && value.to ? `${value.from}/${value.to}` : `Pair ${key}`,
          index: Number(key),
          from: value.from,
          to: value.to,
          raw: value,
        }))
        setPairs(mapped)
        if (mapped.length > 0) setSelectedPairIndex(mapped[0].index)
      } catch (e) {
        console.error(e)
        addNotification('error', 'Failed to load trading pairs')
      }
    }
    run()
  }, [])

  // Decode Pyth price
  const decodePythPrice = (obj: any): number | null => {
    try {
      const p = obj?.price
      if (!p || typeof p?.price !== 'string' || typeof p?.expo !== 'number') return null
      return Number(p.price) * Math.pow(10, p.expo)
    } catch {
      return null
    }
  }

  // Fetch price and update leverage constraints
  useEffect(() => {
    const sel = pairs.find((p) => p.index === selectedPairIndex)
    const leverages = sel?.raw?.leverages
    if (leverages) {
      const min = isZeroFee ? (Number(leverages.pnlMinLeverage) || 75) : (Number(leverages.minLeverage) || 1)
      const max = isZeroFee ? (Number(leverages.pnlMaxLeverage) || 500) : (Number(leverages.maxLeverage) || 75)
      setLeverageMin(min)
      setLeverageMax(max)
      const levNum = Number(leverage)
      if (Number.isNaN(levNum) || levNum < min || levNum > max) {
        setLeverage(String(min))
      }
    }

    let interval: number | undefined
    const fetchPrice = async () => {
      try {
        const feedId: string | undefined = sel?.raw?.feed?.feedId
        if (!feedId) {
          setPrice(null)
          return
        }
        const u = new URL('https://hermes.pyth.network/v2/updates/price/latest')
        u.searchParams.append('ids[]', feedId)
        u.searchParams.append('encoding', 'hex')
        u.searchParams.append('parsed', 'true')
        const res = await fetch(u.toString(), {
          headers: { accept: 'application/json' }
        })
        const data = await res.json()
        let item: any = null
        if (Array.isArray(data?.parsed)) {
          item = data.parsed.find((d: any) => d?.id === feedId) ?? data.parsed[0]
        }
        const parsed = decodePythPrice(item)
        setPrice(parsed)

        if (parsed != null && (tp === '0' || !tp)) {
          setTp(String(Number((parsed * (isLong ? 1.15 : 0.85)).toFixed(2))))
        }
        if (parsed != null && (sl === '0' || !sl)) {
          setSl(String(Number((parsed * (isLong ? 0.95 : 1.05)).toFixed(2))))
        }
      } catch (e) {
        console.error('Failed to fetch price', e)
        setPrice(null)
      }
    }

    fetchPrice()
    interval = window.setInterval(fetchPrice, 10000)

    return () => {
      if (interval) window.clearInterval(interval)
    }
  }, [pairs, selectedPairIndex, isLong, isZeroFee])

  // Fetch trades
  useEffect(() => {
    if (!isConnected || !address) return

    let interval: number | undefined

    const load = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/trades`, { 
          params: { trader_address: address },
          headers: { 'ngrok-skip-browser-warning': 'true' }
        })
        const t = res.data.positions
        const p = res.data.limitOrders

        setTrades(t)
        setPendingOrders(p)
      } catch (e) {
        console.error('Failed to load trades', e)
      }
    }

    load()
    interval = window.setInterval(load, 10000)
    return () => {
      if (interval) window.clearInterval(interval)
    }
  }, [isConnected, address])

  // WebSocket for real-time prices
  useEffect(() => {
    if (!isConnected || (trades.length === 0 && pendingOrders.length === 0)) return

    const ws = new WebSocket('wss://hermes.pyth.network/ws')
    const feedIds = new Set<string>()

    const allPositions = [...trades, ...pendingOrders]
    allPositions.forEach((item) => {
      const pairIndex = item.pairIndex ?? item.pair_index ?? item.trade?.pairIndex ?? item.trade?.pair_index
      const pair = pairs.find((p) => p.index === pairIndex)
      if (pair?.raw?.feed?.feedId) {
        feedIds.add(pair.raw.feed.feedId)
      }
    })

    if (feedIds.size === 0) {
      return
    }

    ws.onopen = () => {
      feedIds.forEach((feedId) => {
        const subscribeMsg = {
          type: 'subscribe',
          ids: [feedId],
        }
        ws.send(JSON.stringify(subscribeMsg))
      })
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'price_update') {
          const feedId = data.price_feed?.id
          const priceData = data.price_feed?.price

          if (feedId && priceData?.price && priceData?.expo !== undefined) {
            const price = Number(priceData.price) * Math.pow(10, priceData.expo)
            setRealtimePrices((prev) => ({ ...prev, [feedId]: price }))
          }
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [isConnected, trades, pendingOrders, pairs])

  const buildAndSend = async (path: string, body: any, successMsg: string): Promise<'success' | 'rejected' | 'error'> => {
    setLoading(true)
    const notifId = Math.random().toString(36).substr(2, 9)
    
    try {
      // Show preparing notification when request starts
      addNotification('preparing', 'Preparing transaction...', undefined, notifId)

      const bodyWithTraderAddr = { ...body, trader_address: address }
      const res = await axios.post(`${BACKEND_URL}${path}`, bodyWithTraderAddr, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      })
      const tx = res.data as { to?: `0x${string}`; data?: `0x${string}`; value?: string | number | bigint }
      if (!tx.to || !tx.data) throw new Error('Invalid tx payload from backend')
      const valueToSend = typeof tx.value === 'string'
        ? (tx.value.startsWith('0x') ? BigInt(tx.value) : BigInt(Math.floor(Number(tx.value))))
        : (typeof tx.value === 'number' ? BigInt(Math.floor(tx.value)) : (tx.value as bigint | undefined))

      // Update to pending when backend responds
      addNotification('pending', 'Waiting for wallet approval...', undefined, notifId)

      try {
        const txHash = await sendTransactionAsync({
          to: tx.to,
          data: tx.data,
          value: valueToSend,
        })

        // Update to confirming with tx hash
        addNotification('confirming', 'Confirming transaction...', txHash, notifId)

        // Wait for confirmation (optional - can be done in background)
        // The transaction is considered submitted at this point
        setTimeout(() => {
          addNotification('success', successMsg, txHash, notifId)
        }, 2000)

        return 'success'
      } catch (txError: any) {
        // User rejected the transaction
        if (txError?.message?.includes('rejected') || txError?.message?.includes('denied') || txError?.code === 4001) {
          addNotification('error', 'Transaction rejected', undefined, notifId)
          return 'rejected'
        }
        throw txError
      }

    } catch (e: any) {
      console.error(e)
      addNotification('error', e?.response?.data?.details ?? e.message.split('.')[0] ?? 'Transaction failed', undefined, notifId)
      return 'error'
    } finally {
      setLoading(false)
    }
  }

  const onOpenTrade = async (): Promise<'success' | 'rejected' | 'error'> => {
    if (!isConnected || !address || selectedPairIndex === null) return 'error'
    triggerHaptic('success')

    const collateralAmount = Number(collateral)

    const selPair = pairs.find((p) => p.index === selectedPairIndex)
    const body: any = {
      trader_address: address,
      collateral_in_trade: collateralAmount,
      is_long: isLong,
      leverage: Number(leverage),
      tp: Number(tp),
      sl: Number(sl),
      order_type: isZeroFee ? 'MARKET_ZERO_FEE' : 'MARKET',
      slippage_percentage: 1
    }
    if (selPair) {
      body.pair = selPair.name
    } else {
      body.pair_index = selectedPairIndex
    }
    return await buildAndSend('/trades/open', body, 'Trade opened successfully!')
  }

  const onCloseTrade = async (pairIndex: number, tradeIndex: number) => {
    if (!isConnected || !address) return
    triggerHaptic('medium')
    await buildAndSend(
      '/trades/close',
      {
        trader_address: address,
        pair_index: pairIndex,
        index: tradeIndex,
        close_percent: 100,
      },
      'Trade closed successfully!'
    )
  }

  const onUpdateTpSl = async (pairIndex: number, tradeIndex: number, newTp: number, newSl: number) => {
    if (!isConnected || !address) return
    triggerHaptic('success')
    await buildAndSend(
      '/trades/tp-sl',
      {
        trader_address: address,
        pair_index: pairIndex,
        trade_index: tradeIndex,
        tp: newTp,
        sl: newSl,
      },
      'TP/SL updated successfully!'
    )
  }

  const getPairName = (idx: number | null | undefined): string => {
    if (idx == null) return '#?'
    const p = pairs.find((x) => x.index === Number(idx))
    return p ? p.name : `#${idx}`
  }

  const currentPath = location.pathname
  // Get current pair for market detail pages by extracting ID from pathname
  const isMarketDetailPage = currentPath.startsWith('/markets/') && currentPath !== '/markets'
  const marketMatch = currentPath.match(/^\/markets\/(\d+)$/)
  const currentPairId = marketMatch ? parseInt(marketMatch[1], 10) : null
  const currentPair = currentPairId !== null && pairs.length > 0 ? pairs.find(p => p.index === currentPairId) : null

  return (
    <>
      {/* Onboarding */}
      <AnimatePresence>
        {showOnboarding && <OnboardingExperience onComplete={completeOnboarding} />}
      </AnimatePresence>

      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
        {/* Notifications */}
        <div className="fixed top-4 left-1/2 -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0 z-50 space-y-2 max-w-sm w-full px-4">
          <AnimatePresence>
            {notifications.map((notif) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: 100, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.9 }}
                className={`flex flex-col gap-2 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border ${
                  notif.type === 'success'
                    ? 'bg-green-500/95 text-white border-green-400'
                    : notif.type === 'error'
                    ? 'bg-red-500/95 text-white border-red-400'
                    : notif.type === 'preparing'
                    ? 'bg-purple-500/95 text-white border-purple-400'
                    : notif.type === 'pending'
                    ? 'bg-blue-500/95 text-white border-blue-400'
                    : notif.type === 'confirming'
                    ? 'bg-orange-500/95 text-white border-orange-400'
                    : 'bg-black/95 text-white border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  {notif.type === 'success' && <Check className="w-5 h-5 flex-shrink-0" />}
                  {notif.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                  {notif.type === 'info' && <Bell className="w-5 h-5 flex-shrink-0" />}
                  {notif.type === 'preparing' && <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />}
                  {notif.type === 'pending' && <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />}
                  {notif.type === 'confirming' && <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />}
                  <span className="font-medium text-sm flex-1">{notif.message}</span>
                  {(notif.type === 'success' || notif.type === 'error') && (
                    <button
                      onClick={() => removeNotification(notif.id)}
                      className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {notif.txHash && (
                  <a
                    href={`https://basescan.org/tx/${notif.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs hover:underline opacity-90 hover:opacity-100 transition-opacity ml-8"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View on BaseScan
                  </a>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden">
          {/* Mobile Header */}
          <motion.header
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mobile-header px-4 py-3"
          >
            <div className="flex items-center justify-between">
              {/* Left: Profile Icon or Back Arrow */}
              {currentPath.startsWith('/markets/') ? (
                <button
                  onClick={() => navigate('/markets')}
                  className="w-10 h-10 rounded-xl bg-white shadow-md flex items-center justify-center hover:bg-black/5 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-black" />
                </button>
              ) : (
                <button
                  onClick={() => navigate('/profile')}
                  className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 shadow-md p-0 border-0 bg-transparent"
                  style={{appearance: "none"}}
                  aria-label="Go to profile"
                >
                  {userData?.pfpUrl ? (
                    <img 
                      src={userData.pfpUrl} 
                      alt={userData.displayName || 'Profile'} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#81D8D0]"></div>
                  )}
                </button>
              )}
              
              {/* Center: Asset Logo & Name or Lattice Logo */}
              {isMarketDetailPage && currentPair ? (
                <div className="flex items-center gap-3">
                  <img 
                    src={`https://www.avantisfi.com/images/pairs/crypto/${currentPair.from}.svg`}
                    alt={currentPair.from}
                    className="w-10 h-10 rounded-full"
                    onError={(e) => {
                      // Fallback to a placeholder if image fails to load
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                  <h1 className="text-2xl font-bold text-black">
                    {currentPair.from}/USD
                  </h1>
                </div>
              ) : (
                <h1 
                  className="text-2xl font-bold text-black/70"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Lattice
                </h1>
              )}
              
              {/* Right: Search Button */}
              <button
                onClick={() => setShowSearchMarkets(true)}
                className="w-10 h-10 rounded-xl bg-white shadow-md flex items-center justify-center hover:bg-black/5 transition-colors"
              >
                <Search className="w-5 h-5 text-black" />
              </button>
            </div>
          </motion.header>

          {/* Mobile Content */}
          <div className="mobile-container pt-20 pb-2">
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<Navigate to="/markets" replace />} />
                <Route path="/markets" element={
                  <Markets 
                    pairs={pairs} 
                    onPairSelect={setSelectedPairIndex}
                  />
                } />
                <Route path="/markets/:id" element={
                  <MarketDetail
                    pairs={pairs}
                    onOpenTrade={onOpenTrade}
                    collateral={collateral}
                    setCollateral={setCollateral}
                    leverage={leverage}
                    setLeverage={setLeverage}
                    leverageMin={leverageMin}
                    leverageMax={leverageMax}
                    isLong={isLong}
                    setIsLong={setIsLong}
                    tp={tp}
                    setTp={setTp}
                    sl={sl}
                    setSl={setSl}
                    loading={loading}
                    onPairSelect={setSelectedPairIndex}
                    isZeroFee={isZeroFee}
                    setIsZeroFee={setIsZeroFee}
                    usdcBalance={usdcBalance}
                    onTradeModalChange={setIsTradeModalOpen}
                  />
                } />
                <Route path="/portfolio" element={
                  <Portfolio
                    isConnected={isConnected}
                    trades={trades}
                    pendingOrders={pendingOrders}
                    getPairName={getPairName}
                    loading={loading}
                    onCloseTrade={onCloseTrade}
                    onUpdateTpSl={onUpdateTpSl}
                    pairs={pairs}
                    realtimePrices={realtimePrices}
                  />
                } />
                {/* <Route path="/earn" element={<Earn />} /> */}
                <Route path="/profile" element={<Profile />} />
              </Routes>
            </AnimatePresence>
          </div>

          {/* Mobile Bottom Navigation */}
          {!isTradeModalOpen && (
            <nav className="bottom-nav">
            <div className="flex justify-around items-center max-w-screen-sm mx-auto">
              <NavButton
                to="/markets"
                icon={<TrendingUp className="w-5 h-5" />}
                label="Markets"
                isActive={currentPath === '/markets'}
                onClick={() => triggerHaptic('selection')}
              />
              <NavButton
                to="/portfolio"
                icon={<Wallet className="w-5 h-5" />}
                label="Portfolio"
                isActive={currentPath === '/portfolio'}
                onClick={() => triggerHaptic('selection')}
              />
              {/* <NavButton
                to="/earn"
                icon={<DollarSign className="w-5 h-5" />}
                label="Earn"
                isActive={currentPath === '/earn'}
              /> */}
              <NavButton
                to="/profile"
                icon={<User className="w-5 h-5" />}
                label="Profile"
                isActive={currentPath === '/profile'}
                onClick={() => triggerHaptic('selection')}
              />
            </div>
          </nav>
          )}

          {/* Search Markets Modal */}
          <SearchMarketsModal
            isOpen={showSearchMarkets}
            onClose={() => setShowSearchMarkets(false)}
            pairs={pairs}
            onPairSelect={setSelectedPairIndex}
          />
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:block">
          {/* Desktop Sidebar */}
          <div className="fixed left-0 top-0 h-screen w-64 glass-card m-4 p-4 flex flex-col rounded-3xl">
            <div className="mb-8">
              <h1 className="text-3xl sm:text-2xl font-bold text-black flex items-center gap-2" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                <Network className="w-8 h-8 sm:w-7 sm:h-7" />
                Lattice
              </h1>
              <p className="text-xs text-black/60 mt-2">A web of positions, insights, reputation</p>
            </div>

            <nav className="flex-1 space-y-2">
              <DesktopNavButton
                to="/markets"
                icon={<TrendingUp className="w-5 h-5" />}
                label="Markets"
                isActive={currentPath === '/markets'}
              />
              <DesktopNavButton
                to="/portfolio"
                icon={<Wallet className="w-5 h-5" />}
                label="Portfolio"
                isActive={currentPath === '/portfolio'}
              />
              <DesktopNavButton
                to="/earn"
                icon={<DollarSign className="w-5 h-5" />}
                label="Earn"
                isActive={currentPath === '/earn'}
              />
              <DesktopNavButton
                to="/profile"
                icon={<User className="w-5 h-5" />}
                label="Profile"
                isActive={currentPath === '/profile'}
              />
            </nav>

            <div className="mt-auto">
              <div className="p-4 bg-black/5 rounded-2xl">
                <p className="text-xs text-black/50 mb-2">Connected to</p>
                <p className="text-sm font-semibold text-black">Base Network</p>
              </div>
            </div>
          </div>

          {/* Desktop Content */}
          <div className="ml-80 mr-8 py-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl sm:text-2xl font-bold text-black">
                  {currentPath === '/markets' && 'Markets'}
                  {currentPath === '/trade' && 'Trade'}
                  {currentPath === '/portfolio' && 'Portfolio'}
                  {currentPath === '/earn' && 'Earn'}
                  {currentPath === '/profile' && 'Profile'}
                </h2>
                <p className="text-black/50 mt-1 text-sm">
                  {currentPath === '/markets' && 'Explore available trading pairs'}
                  {currentPath === '/trade' && 'Open and manage your trades'}
                  {currentPath === '/portfolio' && 'View and manage your positions'}
                  {currentPath === '/earn' && 'Stake and earn rewards'}
                  {currentPath === '/profile' && 'Your trading profile'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CustomConnectButton />
                {isConnected && (
                  <button
                    onClick={() => disconnect()}
                    className="p-3 rounded-2xl hover:bg-red-50 transition-all group"
                  >
                    <X className="w-5 h-5 text-black/70 group-hover:text-red-600 transition-colors" />
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<Navigate to="/markets" replace />} />
                <Route path="/markets" element={
                  <Markets 
                    pairs={pairs} 
                    onPairSelect={setSelectedPairIndex}
                  />
                } />
                <Route path="/markets/:id" element={
                  <MarketDetail
                    pairs={pairs}
                    onOpenTrade={onOpenTrade}
                    collateral={collateral}
                    setCollateral={setCollateral}
                    leverage={leverage}
                    setLeverage={setLeverage}
                    leverageMin={leverageMin}
                    leverageMax={leverageMax}
                    isLong={isLong}
                    setIsLong={setIsLong}
                    tp={tp}
                    setTp={setTp}
                    sl={sl}
                    setSl={setSl}
                    loading={loading}
                    onPairSelect={setSelectedPairIndex}
                    isZeroFee={isZeroFee}
                    setIsZeroFee={setIsZeroFee}
                    usdcBalance={usdcBalance}
                    onTradeModalChange={setIsTradeModalOpen}
                  />
                } />
                <Route path="/portfolio" element={
                  <Portfolio
                    isConnected={isConnected}
                    trades={trades}
                    pendingOrders={pendingOrders}
                    getPairName={getPairName}
                    loading={loading}
                    onCloseTrade={onCloseTrade}
                    onUpdateTpSl={onUpdateTpSl}
                    pairs={pairs}
                    realtimePrices={realtimePrices}
                  />
                } />
                {/* <Route path="/earn" element={<Earn />} /> */}
                <Route path="/profile" element={<Profile />} />
              </Routes>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  )
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

