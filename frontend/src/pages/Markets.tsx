
import { motion } from 'framer-motion'
import { TrendingUp, ArrowUpRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { triggerHaptic } from '../utils/haptics'

type PairInfo = {
  name: string
  index: number
  from: string
  to: string
  raw: any
}

interface MarketsProps {
  pairs: PairInfo[]
  onPairSelect: (index: number) => void
}

export default function Markets({ pairs, onPairSelect }: MarketsProps) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [pairPrices, setPairPrices] = useState<Record<number, number>>({})
  const [historicalPrices, setHistoricalPrices] = useState<Record<number, number>>({})
  const [showAll, setShowAll] = useState(false)

  // Fetch prices for all pairs (WebSocket only)
  useEffect(() => {
    if (pairs.length === 0) return

    // Filter pairs by groupIndex (0, 1, 4) and exclude delisted
    const allowedPairs = pairs.filter(pair => {
      const groupIndex = pair.raw?.groupIndex
      if (groupIndex === undefined || ![0, 1, 4, 5].includes(groupIndex)) return false
      // Exclude pairs with "delisted" in from field (case insensitive)
      if (pair.from?.toLowerCase().includes('delisted')) return false
      return true
    })

    if (allowedPairs.length === 0) return

    // Create a map of feedId to pair indices for quick lookup
    const feedIdToPairIndices = new Map<string, number[]>()
    allowedPairs.forEach((pair) => {
      const feedId = pair.raw?.feed?.feedId
      if (feedId) {
        if (!feedIdToPairIndices.has(feedId)) {
          feedIdToPairIndices.set(feedId.slice(2), [])
        }
        feedIdToPairIndices.get(feedId.slice(2))!.push(pair.index)
      }
    })

    const rawFeedIds = Array.from(feedIdToPairIndices.keys())

    const feedIds = rawFeedIds.filter(feedId => feedId !== 'b98e7ae8af2d298d2651eb21ab5b8b5738212e13efb43bd0dfbce7a74ba4b5d0')

    if (feedIds.length === 0) return

    // Setup WebSocket for real-time updates
    const wsUrl = 'wss://hermes.pyth.network/ws'
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log('Pyth WebSocket connected')
          // Subscribe to price updates for all feedIds
          ws?.send(JSON.stringify({
            type: 'subscribe',
            ids: feedIds
          }))
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data?.type === 'price_update' && data?.price_feed) {
              const feedId = data.price_feed.id
              const p = data.price_feed.price
              
              if (feedId && p && typeof p?.price === 'string' && typeof p?.expo === 'number') {
                const price = Number(p.price) * Math.pow(10, p.expo)
                const pairIndices = feedIdToPairIndices.get(feedId)
                // console.log('pairIndices', pairIndices)
                
                if (pairIndices) {
                  const priceUpdates: Record<number, number> = {}
                  pairIndices.forEach(index => {
                    priceUpdates[index] = price
                  })
                  setPairPrices(prev => ({ ...prev, ...priceUpdates }))
                }
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
          console.log('Pyth WebSocket disconnected, reconnecting in 5s...')
          // Reconnect after 5 seconds
          reconnectTimeout = setTimeout(connectWebSocket, 5000)
        }
      } catch (e) {
        console.error('Error connecting to WebSocket:', e)
        reconnectTimeout = setTimeout(connectWebSocket, 5000)
      }
    }

    connectWebSocket()

    // Cleanup
    return () => {
      if (ws) {
        ws.close()
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
    }
  }, [pairs])

  // Fetch historical prices from backend API
  useEffect(() => {
    const fetchHistoricalPrices = async () => {
      try {
        const res = await fetch('https://avantis-backend.vercel.app/api/price-feeds/last-price', {
          headers: {
            'ngrok-skip-browser-warning': 'true'
          }
        })
        const data = await res.json()
        
        if (Array.isArray(data)) {
          const priceMap: Record<number, number> = {}
          data.forEach((item: any) => {
            if (typeof item?.pairIndex === 'number' && typeof item?.c === 'number') {
              priceMap[item.pairIndex] = item.c
            }
          })
          setHistoricalPrices(priceMap)
        }
      } catch (e) {
        console.error('Error fetching historical prices:', e)
      }
    }

    fetchHistoricalPrices()
  }, [])

  // Filter pairs by groupIndex (0, 1, 4) and search
  const filteredPairs = pairs.filter(pair => {
    const groupIndex = pair.raw?.groupIndex
    const allowedGroupIndices = [0, 1, 4, 5 ]
    const matchesGroupIndex = groupIndex !== undefined && allowedGroupIndices.includes(groupIndex)
    
    if (!matchesGroupIndex) return false
    
    // Exclude pairs with "delisted" in from field (case insensitive)
    if (pair.from?.toLowerCase().includes('delisted')) return false
    
    return pair.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pair.from?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pair.to?.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Show only first 10 initially
  const displayedPairs = showAll ? filteredPairs : filteredPairs.slice(0, 10)

  const handlePairClick = (pair: PairInfo) => {
    triggerHaptic('light')
    onPairSelect(pair.index)
    navigate(`/markets/${pair.index}`)
  } 
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 mb-20 md:mb-4"
    >
      {/* Markets Grid */}
      <div className="card">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-black">Available Markets</h3>
            <span className="text-xs text-black/50">
              Showing {displayedPairs.length} of {filteredPairs.length}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {displayedPairs.map((pair: PairInfo) => {
            const price = pairPrices[pair.index]
            const historicalPrice = historicalPrices[pair.index]
            const priceChange = price && historicalPrice 
              ? ((price - historicalPrice) / historicalPrice) * 100 
              : 0
            const formattedPrice = typeof price === 'number'
              ? price.toLocaleString(undefined, { maximumFractionDigits: price < 100 ? 5 : 2 })
              : ''

            return (
              <motion.div
                key={pair.index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handlePairClick(pair)}
                className="p-3 rounded-2xl border border-black/10 bg-white shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
              >
                <div className="flex flex-row items-center gap-3 sm:gap-4">
                  {/* Asset Info */}
                  <div className="flex items-center gap-3 flex-1">
                    {pair.from ? (
                      <img
                        src={`https://www.avantisfi.com/images/pairs/crypto/${pair.from}.svg`}
                        alt={pair.from}
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
                          {pair.name}
                        </h4>
                        {pair.raw?.leverages?.maxLeverage && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-black/10 text-black/70">
                            {pair.raw.leverages.maxLeverage}x
                          </span>
                        )}
                      </div>
                      {/* Moved 24h change to the right under price */}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="text-right">
                    {price ? (
                      <>
                        <p className="text-base sm:text-lg font-bold text-black">
                          ${formattedPrice}
                        </p>
                        <div className="flex items-center gap-1 justify-end mt-1">
                          <ArrowUpRight className={`w-3 h-3 ${priceChange >= 0 ? 'text-green-500' : 'text-red-500 rotate-90'}`} />
                          <span className={`text-xs font-semibold ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1">
                        <div className="h-5 bg-black/5 rounded animate-pulse w-20" />
                        <div className="h-4 bg-black/5 rounded animate-pulse w-12 ml-auto" />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Show More Button */}
        {!showAll && filteredPairs.length > 10 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAll(true)}
              className="btn-secondary"
            >
              Show All Markets ({filteredPairs.length - 10} more)
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
