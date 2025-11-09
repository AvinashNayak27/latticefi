import { motion } from 'framer-motion'
import { Users, TrendingUp, ExternalLink, Copy, Check, Trophy, ArrowUp, ArrowDown, X, ChevronLeft, ChevronRight, Edit3, DollarSign, Share2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import sdk from "@farcaster/miniapp-sdk";
import BottomSheet from '../components/BottomSheet'
import { triggerHaptic } from '../utils/haptics'
import { Settings } from "lucide-react";

// Skeleton Components
const SkeletonBox = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse bg-black/10 rounded ${className}`} />
)

const ProfileHeaderSkeleton = () => (
  <div className="card">
    <div className="flex flex-row gap-4 md:gap-6">
      <SkeletonBox className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-2xl sm:rounded-3xl" />
      <div className="flex-1">
        <div className="flex flex-row items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <SkeletonBox className="h-6 w-32 mb-2" />
            <SkeletonBox className="h-4 w-24 mb-2" />
          </div>
          <div className="flex gap-2">
            <SkeletonBox className="h-8 w-20 rounded-xl" />
          </div>
        </div>
        
        {/* FID Display skeleton */}
        <div className="flex gap-4 sm:gap-6 mt-4 pt-4 border-t border-black/10">
          <div>
            <SkeletonBox className="h-6 w-8 mb-1" />
            <SkeletonBox className="h-3 w-8" />
          </div>
        </div>
      </div>
    </div>
  </div>
)


const TradeItemSkeleton = () => (
  <div className="p-3 sm:p-4 bg-black/5 rounded-2xl">
    <div className="flex flex-row items-center gap-3 sm:gap-4">
      <SkeletonBox className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
          <SkeletonBox className="h-4 w-20" />
          <SkeletonBox className="h-5 w-12 rounded-full" />
          <SkeletonBox className="h-5 w-8 rounded-full" />
        </div>
        <SkeletonBox className="h-3 w-16" />
      </div>
      <div className="text-right">
        <SkeletonBox className="h-5 w-16 mb-1" />
        <SkeletonBox className="h-3 w-12" />
      </div>
    </div>
  </div>
)

const TradingActivitySkeleton = () => (
  <div className="card">
    <div className="flex gap-1 sm:gap-2 mb-4 sm:mb-4 border-b border-black/10">
      <SkeletonBox className="h-8 w-16" />
      <SkeletonBox className="h-8 w-20" />
    </div>
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <TradeItemSkeleton key={i} />
      ))}
    </div>
  </div>
)

interface TopTrade {
  _id: string
  event: {
    args: {
      t: {
        index: number
        initialPosToken: number
        leverage: number
        openPrice: number
        pairIndex: number
        positionSizeUSDC: number
        sl: number
        tp: number
        trader: string
        buy: boolean
        timestamp: number
      }
      price: number
      positionSizeUSDC: number
      usdcSentToTrader: number
      _feeInfo: {
        closingFee: number
        r: number
        lossProtectionPSum: number
        lossProtection: number
      }
    }
  }
  _mapped_netPnl: number
  _grossPnl: number
  timeStamp: string
  pairInfo?: {
    from: string
    to: string
  }
  to?: string
}

interface TradeDetailsModalProps {
  trade: TopTrade
  onClose: () => void
}

interface PortfolioStats {
  totalPnl: number
  totalCollateral: number
  totalTrades: number
  winRate: number
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://avantis-backend.vercel.app'

// USDC Contract Constants
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC on Base
const SPENDER_ADDRESS = '0x8a311D7048c35985aa31C131B9A13e03a5f7422d' // Avantis Spender
const USDC_ABI = [
  {
    "inputs": [
      {"name": "owner", "type": "address"},
      {"name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
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


export default function Profile() {
  const { address } = useAccount()
  const [isMiniApp,setIsMiniApp] = useState(false)
  const [userData,setUserData ] = useState<{fid: number; username?: string; displayName?: string; pfpUrl?: string} | null>(null)
  const [topTrades, setTopTrades] = useState<TopTrade[]>([])
  const [portfolioHistory, setPortfolioHistory] = useState<TopTrade[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [activeTab, setActiveTab] = useState<'activity' | 'top'>('activity')
  const [loading, setLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [tradesLoading, setTradesLoading] = useState(false)
  const [selectedTrade, setSelectedTrade] = useState<TopTrade | null>(null)
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats | null>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalAmount, setApprovalAmount] = useState('')
  const [showPnlSheet, setShowPnlSheet] = useState(false)
  const [showWinRateSheet, setShowWinRateSheet] = useState(false)
  const { writeContract: writeApproveContract, data: approvalHash, isPending: isApprovePending } = useWriteContract()
  const { isLoading: isConfirmingApproval, isSuccess: isApprovalSuccess } = useWaitForTransactionReceipt({
    hash: approvalHash,
  })

  // USDC Contract Hooks
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: address ? [address, SPENDER_ADDRESS as `0x${string}`] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  useEffect(() => {
    if (isApprovalSuccess) {
      refetchAllowance()
    }
  }, [isApprovalSuccess, refetchAllowance])

  const formatUSDC = (amount: bigint) => {
    return parseFloat(formatUnits(amount, 6)).toFixed(2)
  }

  const handleApproveAmount = async () => {
    if (!approvalAmount) return
    try {
      const amount = parseUnits(approvalAmount, 6)
      await writeApproveContract({
        address: USDC_ADDRESS as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [SPENDER_ADDRESS as `0x${string}`, amount],
      })
    } catch (e) {
      console.error(e)
    }
  }

  const handleMaxApprove = async () => {
    try {
      const maxAmount = parseUnits('1000000', 6)
      await writeApproveContract({
        address: USDC_ADDRESS as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [SPENDER_ADDRESS as `0x${string}`, maxAmount],
      })
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    const init = async () => {
      await sdk.actions.ready({
        disableNativeGestures: true,
      });
      const isInMiniApp = await sdk.isInMiniApp();
      const ctx = await sdk.context;
      const user = ctx.user
      setUserData(user)
      setIsMiniApp(isInMiniApp);
    };
    init();
  }, []);

  // Fetch trades when address is available
  useEffect(() => {
    if (address) {
      fetchTopTrades(address)
      fetchPortfolioHistory(address, 1)
      fetchPortfolioStats(address)
    }
  }, [address])

  const fetchTopTrades = async (userAddress: string) => {
    setTradesLoading(true)
    try {
      const response = await fetch(`${BACKEND_URL}/api/portfolio/top-trades/${userAddress}`)
      if (!response.ok) throw new Error('Failed to fetch top trades')
      
      const data = await response.json()
      const trades = data || []
      setTopTrades(trades)
    } catch (error) {
      console.error('Error fetching top trades:', error)
    } finally {
      setTradesLoading(false)
    }
  }

  const fetchPortfolioHistory = async (userAddress: string, page: number) => {
    setTradesLoading(true)
    try {
      const response = await fetch(`${BACKEND_URL}/api/portfolio/history/${userAddress}/${page}`)
      if (!response.ok) throw new Error('Failed to fetch portfolio history')
      
      const data = await response.json()
      const trades = data.portfolio || []
      setPortfolioHistory(trades)
      setHasMore(data.hasMore || false)
      setCurrentPage(page)
    } catch (error) {
      console.error('Error fetching portfolio history:', error)
    } finally {
      setTradesLoading(false)
    }
  }

  const fetchPortfolioStats = async (userAddress: string) => {
    setStatsLoading(true)
    try {
      // Fetch profit/loss data from backend proxy
      const pnlResponse = await fetch(`${BACKEND_URL}/api/portfolio/profit-loss/${userAddress}`)
      if (!pnlResponse.ok) throw new Error('Failed to fetch PnL data')
      const pnlData = await pnlResponse.json()
      
      // Fetch win rate data from backend proxy
      const winRateResponse = await fetch(`${BACKEND_URL}/api/portfolio/win-rate/${userAddress}`)
      if (!winRateResponse.ok) throw new Error('Failed to fetch win rate data')
      const winRateData = await winRateResponse.json()
      
      if (pnlData.success && winRateData.success) {
        setPortfolioStats({
          totalPnl: pnlData.data[0]?.total || 0,
          totalCollateral: pnlData.data[0]?.totalCollateral || 0,
          totalTrades: pnlData.totalCount || 0,
          winRate: winRateData.winRate || 0
        })
      }
    } catch (error) {
      console.error('Error fetching portfolio stats:', error)
    } finally {
      setStatsLoading(false)
    }
  }

  const handleNextPage = () => {
    if (address && hasMore) {
      triggerHaptic('selection')
      fetchPortfolioHistory(address, currentPage + 1)
    }
  }

  const handlePrevPage = () => {
    if (address && currentPage > 1) {
      triggerHaptic('selection')
      fetchPortfolioHistory(address, currentPage - 1)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4 md:space-y-6 pb-20 md:pb-24"
    >
      {/* Profile Header */}
      {!userData && !address ? (
        <ProfileHeaderSkeleton />
      ) : (
        <div className="card overflow-hidden p-0">
        <div className="relative flex flex-row gap-4 md:gap-6 bg-white text-black p-4 sm:p-4 pb-2">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {isMiniApp && userData ? (
              <img
                src={userData.pfpUrl}
                alt={userData.displayName}
                className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl sm:rounded-3xl border-2 border-black/10 object-cover"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl sm:rounded-3xl border-2 border-black/10 bg-black/5 flex items-center justify-center">
                <Users className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 text-black/40" />
              </div>
            )}
          </div>

          {/* Profile Info */}
          <div className="flex-1">
            <div className="flex flex-row items-start justify-between gap-4 mb-2">
              <div className="flex-1">
                {isMiniApp && userData ? (
                  <>
                    <h2 className="text-2xl sm:text-3xl font-extrabold mb-1 tracking-wide">{userData.displayName}</h2>
                    <div className="flex items-center gap-2">
                      <p className="text-sm/6 text-black/70">@{userData.username}</p>
                      {usdcBalance !== undefined && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                          {parseFloat(formatUnits(usdcBalance, 6)).toFixed(2)} USDC
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl sm:text-3xl font-extrabold mb-1 tracking-wide">Wallet</h2>
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm text-black/70 font-mono break-all">
                        {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}
                      </p>
                      {usdcBalance !== undefined && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                          {parseFloat(formatUnits(usdcBalance, 6)).toFixed(2)} USDC
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2 absolute right-4 top-4 sm:right-6 sm:top-6">
                <button
                  onClick={() => setShowApprovalModal(true)}
                  className="relative p-2 rounded-xl bg-white border border-black/10 hover:bg-black/5 active:scale-95 transition"
                  aria-label="Settings"
                >
                  <Settings className="w-4 h-4 text-black" />
                  {usdcAllowance !== undefined && usdcAllowance === 0n && (
                    <span className="absolute -top-1 -right-1 inline-block w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
        {/* Header Stats (full width) */}
        <div className="px-4 sm:px-4 pb-4">
            <div className="pt-2 border-t border-black/10">
              {statsLoading ? (
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {[1,2].map((i) => (
                    <div key={i} className="p-3 rounded-xl bg-black/10">
                      <div className="h-3 w-16 bg-black/20 rounded mb-2" />
                      <div className="h-5 w-20 bg-black/20 rounded" />
                    </div>
                  ))}
                </div>
              ) : portfolioStats ? (
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    onClick={() => { triggerHaptic('selection'); setShowPnlSheet(true) }}
                    className="p-3 rounded-xl bg-black/5 text-left active:scale-[0.99] transition"
                  >
                    <p className="text-xs text-black/60">Net PnL %</p>
                    {(() => {
                      const pct = portfolioStats.totalCollateral > 0 ? (portfolioStats.totalPnl / portfolioStats.totalCollateral) * 100 : 0
                      return (
                        <p className={`text-lg font-extrabold ${pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pct.toFixed(1)}%</p>
                      )
                    })()}
                  </button>
                  <button
                    onClick={() => { triggerHaptic('selection'); setShowWinRateSheet(true) }}
                    className="p-3 rounded-xl bg-black/5 text-left active:scale-[0.99] transition"
                  >
                    <p className="text-xs text-black/60">Win Rate</p>
                    <p className={`text-lg font-extrabold ${portfolioStats.winRate >= 0.5 ? 'text-green-600' : 'text-red-600'}`}>{(portfolioStats.winRate * 100).toFixed(1)}%</p>
                  </button>
                </div>
              ) : null}
            </div>
        </div>
      </div>
      )}


      {/* Trading Activity */}
      {tradesLoading ? (
        <TradingActivitySkeleton />
      ) : (
        <div>
        {/* Tabs (Portfolio-style segmented control) */}
        <div className="mb-4 sm:mb-4">
          <div className="grid grid-cols-2 p-1 rounded-2xl border border-black/10 bg-black/5">
            {(['activity','top'] as const).map((tab) => {
              const active = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => { triggerHaptic('selection'); setActiveTab(tab) }}
                  className={`relative py-2.5 rounded-xl text-sm sm:text-base font-semibold transition-all ${
                    active ? 'bg-white shadow' : 'text-black/60'
                  }`}
                >
                  <span>{tab === 'activity' ? 'Activity' : 'Top Trades'}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* (no top pagination) */}

        {tradesLoading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-black/20 border-t-black rounded-full animate-spin mb-4"></div>
            <p className="text-sm text-black/50">Loading trades...</p>
          </div>
        ) : activeTab === 'activity' ? (
          // Activity Tab
          <>
            {portfolioHistory.length === 0 ? (
              currentPage > 1 ? (
                <div className="text-center py-10">
                  <div className="w-14 h-14 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-3">
                    <TrendingUp className="w-7 h-7 text-black/30" />
                  </div>
                  <p className="text-sm text-black/60 mb-3">Looks like you got lost.</p>
                  <button
                    onClick={() => { triggerHaptic('selection'); if (address) fetchPortfolioHistory(address, 1) }}
                    className="px-4 py-2 rounded-xl bg-black text-white text-sm font-semibold hover:bg-black/80"
                  >
                    Go to first page
                  </button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-8 h-8 text-black/30" />
                  </div>
                  <p className="text-sm text-black/50 mb-2">No trading activity yet</p>
                  <p className="text-xs text-black/40">
                    Your trade history will appear here once you start trading
                  </p>
                </div>
              )
            ) : (
              <>
              <div className="space-y-2">
                  {portfolioHistory.map((trade) => {
                    const isLong = trade?.event?.args?.t?.buy ?? false
                    const netPnl = trade?.event?.args?.usdcSentToTrader - trade?.event?.args?.positionSizeUSDC 
                    const pnlPercentage = ((netPnl / trade?.event?.args?.positionSizeUSDC) * 100).toFixed(2)
                    const isProfit = netPnl > 0
                    const leverage = trade?.event?.args?.t?.leverage ?? 1
                    const timestamp = new Date(trade?.timeStamp ?? Date.now()).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric', 
                      year: 'numeric'
                    })

                    return (
                      <motion.div
                        key={trade?._id ?? Math.random()}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 rounded-2xl border border-black/10 bg-white shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
                        onClick={() => { triggerHaptic('light'); setSelectedTrade(trade) }}
                      >
                        <div className="flex flex-row items-center gap-3 sm:gap-4">
                          {/* Asset Info */}
                          <div className="flex items-center gap-3 flex-1">
                            {trade?.pairInfo?.from ? (
                              <img
                                src={`https://www.avantisfi.com/images/pairs/crypto/${trade.pairInfo.from}.svg`}
                                alt={trade.pairInfo.from}
                                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white p-1 flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            ) : (
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/10 flex items-center justify-center flex-shrink-0">
                                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-black/30" />
                              </div>
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                                <h4 className="font-bold text-black text-sm sm:text-base">
                                  {trade?.pairInfo?.from && trade?.pairInfo?.to 
                                    ? `${trade.pairInfo.from}/${trade.pairInfo.to}` 
                                    : `Pair #${trade?.event?.args?.t?.pairIndex ?? 'Unknown'}`}
                                </h4>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  isLong ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                                }`}>
                                  {isLong ? (
                                    <span className="flex items-center gap-1">
                                      <ArrowUp className="w-3 h-3" /> <span className="hidden sm:inline">Long</span>
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1">
                                      <ArrowDown className="w-3 h-3" /> <span className="hidden sm:inline">Short</span>
                                    </span>
                                  )}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-black/10 text-black/70">
                                  {leverage}x
                                </span>
                              </div>
                              <p className="text-xs text-black/50">{timestamp}</p>
                            </div>
                          </div>

                          {/* PnL */}
                          <div className="text-right">
                            <p className={`text-base sm:text-lg font-bold ${
                              isProfit ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {isProfit ? '+' : ''}{netPnl.toFixed(2)} USDC
                            </p>
                            <p className={`text-xs ${
                              isProfit ? 'text-green-600' : 'text-red-600'
                            }`}>
                              ({pnlPercentage}%)
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Pagination Controls */}
                {/* Bottom pagination - simple */}
                <div className="flex items-center justify-center gap-3 mt-4">
                  {currentPage > 1 && (
                    <button
                      onClick={handlePrevPage}
                      className="px-3 py-2 rounded-lg bg-black text-white text-sm font-semibold hover:bg-black/80"
                    >
                      Previous
                    </button>
                  )}
                  <span className="text-sm text-black/50">Page {currentPage}</span>
                  <button
                    onClick={handleNextPage}
                    disabled={!hasMore}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                      hasMore ? 'bg-black text-white hover:bg-black/80' : 'bg-black/5 text-black/30 cursor-not-allowed'
                    }`}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          // Top Trades Tab
          <>
            {topTrades.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-8 h-8 text-yellow-500/50" />
                </div>
                <p className="text-sm text-black/50 mb-2">No top trades yet</p>
                <p className="text-xs text-black/40">
                  Your best trades will appear here once you start trading
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {topTrades.map((trade) => {
                  const isLong = trade.event.args.t.buy
                  const netPnl = trade.event.args.usdcSentToTrader - trade.event.args.positionSizeUSDC
                  const pnlPercentage = ((netPnl / trade.event.args.positionSizeUSDC) * 100).toFixed(2)
                  const isProfit = netPnl > 0
                  const leverage = trade.event.args.t.leverage
                  const timestamp = new Date(trade.timeStamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })

                  return (
                    <motion.div
                      key={trade._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded-2xl border border-black/10 bg-white shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
                      onClick={() => { triggerHaptic('light'); setSelectedTrade(trade) }}
                    >
                      <div className="flex flex-row items-center gap-3 sm:gap-4">
                        {/* Asset Info */}
                        <div className="flex items-center gap-3 flex-1">
                          {trade.pairInfo?.from ? (
                            <img
                              src={`https://www.avantisfi.com/images/pairs/crypto/${trade.pairInfo.from}.svg`}
                              alt={trade.pairInfo.from}
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white p-1 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/10 flex items-center justify-center flex-shrink-0">
                              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-black/30" />
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                              <h4 className="font-bold text-black text-sm sm:text-base">
                                {trade.pairInfo?.from && trade.pairInfo?.to ? `${trade.pairInfo.from}/${trade.pairInfo.to}` : `Pair #${trade.event.args.t.pairIndex}`}
                              </h4>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                isLong ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                              }`}>
                                {isLong ? (
                                  <span className="flex items-center gap-1">
                                    <ArrowUp className="w-3 h-3" /> <span className="hidden sm:inline">Long</span>
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <ArrowDown className="w-3 h-3" /> <span className="hidden sm:inline">Short</span>
                                  </span>
                                )}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-black/10 text-black/70">
                                {leverage}x
                              </span>
                            </div>
                            <p className="text-xs text-black/50">{timestamp}</p>
                          </div>
                        </div>

                        {/* PnL */}
                        <div className="text-right">
                          <p className={`text-base sm:text-lg font-bold ${
                            isProfit ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {isProfit ? '+' : ''}{netPnl.toFixed(2)} USDC
                          </p>
                          <p className={`text-xs ${
                            isProfit ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ({pnlPercentage}%)
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* Trade Details - BottomSheet */}
      <BottomSheet
        isOpen={!!selectedTrade}
        onClose={() => setSelectedTrade(null)}
        title={selectedTrade ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {selectedTrade.pairInfo?.from && (
                <img
                  src={`https://www.avantisfi.com/images/pairs/crypto/${selectedTrade.pairInfo.from}.svg`}
                  alt={selectedTrade.pairInfo.from}
                  className="w-5 h-5 rounded-full border border-black/10 bg-white"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <span className="text-base font-bold text-black">
                {selectedTrade.pairInfo?.from && selectedTrade.pairInfo?.to 
                  ? `${selectedTrade.pairInfo.from}/${selectedTrade.pairInfo.to}`
                  : `Pair #${selectedTrade.event?.args?.t?.pairIndex ?? ''}`}
              </span>
            </div>
            <button
              onClick={() => { triggerHaptic('selection') /* no-op share for now */ }}
              className="p-2 rounded-lg bg-white border border-black/10 hover:bg-black/5 active:scale-95 transition"
              aria-label="Share"
            >
              <Share2 className="w-4 h-4 text-black/70" />
            </button>
          </div>
        ) : ''}
      >
        {selectedTrade && (() => {
          const netPnl = selectedTrade.event.args.usdcSentToTrader - selectedTrade.event.args.positionSizeUSDC
          const isProfit = netPnl > 0
          const pnlPercentage = ((netPnl / selectedTrade.event.args.positionSizeUSDC) * 100).toFixed(2)
          return (
            <div className="space-y-3">
              {/* Net PnL summary */}
              <div className="p-4 rounded-xl border border-black/10 bg-black/5 flex items-center justify-between">
                <div className="text-xs text-black/60">Net P&L</div>
                <div className={`text-base font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                  {isProfit ? '+' : ''}{netPnl.toFixed(2)} USDC
                  <span className="ml-1 text-sm">({pnlPercentage}%)</span>
                </div>
              </div>

              {/* Entry */}
              <div className="p-3 sm:p-4 bg-white rounded-xl border border-black/10">
                <h4 className="font-semibold mb-2 text-sm sm:text-base">Entry</h4>
                <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div>Entry Price: <span className="font-mono font-medium">${selectedTrade.event.args.t.openPrice}</span></div>
                  <div>Position Size: <span className="font-mono font-medium">${selectedTrade.event.args.t.positionSizeUSDC}</span></div>
                  <div>Leverage: <span className="font-mono font-medium">{selectedTrade.event.args.t.leverage}x</span></div>
                  <div>Direction: <span className={`font-medium ${selectedTrade.event.args.t.buy ? 'text-green-600' : 'text-red-600'}`}>{selectedTrade.event.args.t.buy ? 'Long' : 'Short'}</span></div>
                </div>
              </div>

              {/* Exit */}
              <div className="p-3 sm:p-4 bg-white rounded-xl border border-black/10">
                <h4 className="font-semibold mb-2 text-sm sm:text-base">Exit</h4>
                <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div>Exit Price: <span className="font-mono font-medium">${selectedTrade.event.args.price}</span></div>
                  <div>USDC Received: <span className="font-mono font-medium">${selectedTrade.event.args.usdcSentToTrader}</span></div>
                </div>
              </div>

              {/* Fees */}
              <div className="p-3 sm:p-4 bg-white rounded-xl border border-black/10">
                <h4 className="font-semibold mb-2 text-sm sm:text-base">Fees & Protection</h4>
                <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div className="text-red-600">Closing Fee: <span className="font-mono">-${selectedTrade.event.args._feeInfo.closingFee}</span></div>
                  <div className="text-orange-600">Referral Fee: <span className="font-mono">-${selectedTrade.event.args._feeInfo.r}</span></div>
                  <div className="text-green-600">Loss Protection: <span className="font-mono">+${selectedTrade.event.args._feeInfo.lossProtection}</span></div>
                  <div>Protection Sum: <span className="font-mono">${selectedTrade.event.args._feeInfo.lossProtectionPSum}</span></div>
                </div>
              </div>

              {/* Gross vs Net */}
              <div className="p-3 sm:p-4 bg-white rounded-xl border border-black/10">
                <h4 className="font-semibold mb-2 text-sm sm:text-base">Profit/Loss Summary</h4>
                <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div>Gross PnL: <span className={`font-mono ${selectedTrade._grossPnl > 0 ? 'text-green-600' : 'text-red-600'}`}>${selectedTrade._grossPnl.toFixed(2)}</span></div>
                  <div>Net PnL: <span className={`font-mono ${isProfit ? 'text-green-600' : 'text-red-600'}`}>${netPnl.toFixed(2)} ({pnlPercentage}%)</span></div>
                </div>
              </div>
            </div>
          )
        })()}
      </BottomSheet>

      {/* PnL Details Sheet */}
      <BottomSheet
        isOpen={showPnlSheet}
        onClose={() => setShowPnlSheet(false)}
        title={<span className="font-bold">Net PnL Details</span>}
      >
        {portfolioStats && (
          <div className="space-y-3">
            {(() => {
              const pct = portfolioStats.totalCollateral > 0 ? (portfolioStats.totalPnl / portfolioStats.totalCollateral) * 100 : 0
              return (
                <div className="p-3 rounded-xl border border-black/10 bg-black/5 flex items-center justify-between">
                  <span className="text-sm text-black/60">Net PnL %</span>
                  <span className={`text-base font-bold ${pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pct.toFixed(2)}%</span>
                </div>
              )
            })()}
            <div className="p-3 rounded-xl bg-white border border-black/10 flex items-center justify-between">
              <span className="text-sm text-black/60">Collateral</span>
              <span className="text-base font-bold">{portfolioStats.totalCollateral.toFixed(2)} USDC</span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-black/10 flex items-center justify-between">
              <span className="text-sm text-black/60">Profit/Loss</span>
              <span className={`text-base font-bold ${portfolioStats.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{portfolioStats.totalPnl >= 0 ? '+' : ''}{portfolioStats.totalPnl.toFixed(2)} USDC</span>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Win Rate Details Sheet */}
      <BottomSheet
        isOpen={showWinRateSheet}
        onClose={() => setShowWinRateSheet(false)}
        title={<span className="font-bold">Win Rate Details</span>}
      >
        {portfolioStats && (() => {
          const total = portfolioStats.totalTrades
          const wins = Math.round(total * portfolioStats.winRate)
          const losses = Math.max(0, total - wins)
          return (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-white border border-black/10 flex items-center justify-between">
                <span className="text-sm text-black/60">Total Trades</span>
                <span className="text-base font-bold">{total}</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-black/10 flex items-center justify-between">
                <span className="text-sm text-black/60">Wins</span>
                <span className="text-base font-bold text-green-600">{wins}</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-black/10 flex items-center justify-between">
                <span className="text-sm text-black/60">Losses</span>
                <span className="text-base font-bold text-red-600">{losses}</span>
              </div>
            </div>
          )
        })()}
      </BottomSheet>

      {/* USDC Approval - BottomSheet */}
      <BottomSheet
        isOpen={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        title={
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            <span className="font-bold">USDC Approval</span>
            {usdcAllowance !== undefined && (
              <span className="ml-2 text-xs text-black/50">Allowance: {formatUSDC(usdcAllowance)} USDC</span>
            )}
          </div>
        }
      >
        {address && usdcAllowance !== undefined && usdcBalance !== undefined && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-xl">
              <h4 className="font-semibold mb-2 text-sm">Current Status</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Your USDC Balance:</span><span className="font-mono">{formatUSDC(usdcBalance)} USDC</span></div>
                <div className="flex justify-between"><span>Current Allowance:</span><span className="font-mono">{formatUSDC(usdcAllowance)} USDC</span></div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Approval Amount (USDC)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={approvalAmount}
                  onChange={(e) => setApprovalAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/20"
                  disabled={isApprovePending || isConfirmingApproval}
                />
                <button
                  onClick={() => setApprovalAmount(formatUSDC(usdcBalance))}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all"
                  disabled={isApprovePending || isConfirmingApproval}
                >
                  Max
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleApproveAmount}
                disabled={!approvalAmount || isApprovePending || isConfirmingApproval}
                className="flex-1 px-4 py-3 bg-black text-white rounded-xl font-semibold hover:bg-black/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApprovePending || isConfirmingApproval ? 'Processing...' : 'Approve Amount'}
              </button>
              <button
                onClick={handleMaxApprove}
                disabled={isApprovePending || isConfirmingApproval}
                className="px-4 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Max Approve
              </button>
            </div>

            {approvalHash && (
              <div className="p-3 bg-blue-50 rounded-xl">
                <p className="text-sm text-blue-600">Transaction submitted: {approvalHash.slice(0, 10)}...</p>
                {isConfirmingApproval && <p className="text-xs text-blue-500 mt-1">Waiting for confirmation...</p>}
                {isApprovalSuccess && <p className="text-xs text-green-600 mt-1">Transaction confirmed!</p>}
              </div>
            )}

            <div className="text-xs text-gray-500">
              <p>• Approval allows Avantis to use your USDC for trading</p>
              <p>• You can revoke approval anytime by setting amount to 0</p>
              <p>• Max approve sets a high limit for convenience</p>
            </div>
          </div>
        )}
      </BottomSheet>
    </motion.div>
  )
}

function StatItem({ label, value, isProfit, showPencilIcon, onPencilClick }: { 
  label: string; 
  value: string; 
  isProfit?: boolean;
  showPencilIcon?: boolean;
  onPencilClick?: () => void;
}) {
  return (
    <div className="p-3 sm:p-4 bg-black/5 rounded-2xl">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs text-black/50">{label}</p>
        {showPencilIcon && onPencilClick && (
          <button
            onClick={onPencilClick}
            className="p-1 hover:bg-black/5 rounded-full transition-all"
            title="Edit"
          >
            <Edit3 className="w-3 h-3 text-black/60" />
          </button>
        )}
      </div>
      <p className={`text-base sm:text-lg font-bold ${
        isProfit !== undefined 
          ? (isProfit ? 'text-green-600' : 'text-red-600')
          : 'text-black'
      }`}>
        {value}
      </p>
    </div>
  )
}
