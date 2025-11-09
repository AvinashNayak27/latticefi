import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, useMemo } from 'react'
import { triggerHaptic } from '../utils/haptics'

interface IOSPickerProps {
  isOpen: boolean
  onClose: () => void
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  label: string
  color?: 'green' | 'red'
  formatValue?: (value: number) => string
}

export default function IOSPicker({
  isOpen,
  onClose,
  value,
  onChange,
  min,
  max,
  step,
  label,
  color = 'green',
  formatValue
}: IOSPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null)

  // Generate values array
  const values = useMemo(() => {
    const vals: number[] = []
    for (let i = min; i <= max; i += step) {
      vals.push(Math.round(i * 100) / 100)
    }
    return vals
  }, [min, max, step])

  const ITEM_HEIGHT = 44
  const VISIBLE_ITEMS = 5
  const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS

  const scrollToIndex = (index: number, smooth = true) => {
    if (!scrollRef.current) return
    const targetScroll = index * ITEM_HEIGHT
    scrollRef.current.scrollTo({
      top: targetScroll,
      behavior: smooth ? 'smooth' : 'auto'
    })
  }

  // Find initial index
  useEffect(() => {
    if (isOpen && values.length > 0) {
      const index = values.findIndex(v => Math.abs(v - value) < step / 2)
      const targetIndex = index >= 0 ? index : Math.floor(values.length / 2)
      setSelectedIndex(targetIndex)
      // Scroll to initial position after a brief delay
      setTimeout(() => {
        scrollToIndex(targetIndex, false)
      }, 100)
    }
  }, [isOpen, value, values, step])

  const handleScroll = () => {
    if (!scrollRef.current || isScrolling.current) return
    
    isScrolling.current = true
    
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current)
    }

    scrollTimeout.current = setTimeout(() => {
      if (!scrollRef.current) return
      
      const scrollTop = scrollRef.current.scrollTop
      const newIndex = Math.round(scrollTop / ITEM_HEIGHT)
      const clampedIndex = Math.max(0, Math.min(newIndex, values.length - 1))
      
      setSelectedIndex(clampedIndex)
      scrollToIndex(clampedIndex, true)
      
      const newValue = values[clampedIndex]
      if (Math.abs(newValue - value) >= step / 2) {
        triggerHaptic('selection')
        onChange(newValue)
      }
      
      isScrolling.current = false
    }, 100)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (!scrollRef.current) return
    
    const delta = e.deltaY > 0 ? 1 : -1
    const newIndex = Math.max(0, Math.min(selectedIndex + delta, values.length - 1))
    setSelectedIndex(newIndex)
    scrollToIndex(newIndex, true)
    triggerHaptic('light')
    onChange(values[newIndex])
  }

  const handleConfirm = () => {
    triggerHaptic('success')
    onChange(values[selectedIndex])
    onClose()
  }

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

          {/* Picker Container */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl shadow-2xl"
          >
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="w-12 h-1 bg-black/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-4 border-b border-black/10">
              <button
                onClick={onClose}
                className="text-black/70 font-medium text-base"
              >
                Cancel
              </button>
              <span className="font-semibold text-black text-base">{label}</span>
              <button
                onClick={handleConfirm}
                className={`font-semibold text-base ${
                  color === 'green' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                Done
              </button>
            </div>

            {/* Picker Wheel */}
            <div className="relative py-8" style={{ height: CONTAINER_HEIGHT }}>
              {/* Selection Indicator */}
              <div
                className="absolute left-0 right-0 pointer-events-none z-10"
                style={{
                  top: `${(VISIBLE_ITEMS - 1) / 2 * ITEM_HEIGHT}px`,
                  height: `${ITEM_HEIGHT}px`,
                  borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.03), transparent, rgba(0,0,0,0.03))'
                }}
              />

              {/* Scrollable Values */}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                onWheel={handleWheel}
                className="overflow-y-auto h-full snap-y snap-mandatory"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {/* Top padding */}
                <div style={{ height: `${(VISIBLE_ITEMS - 1) / 2 * ITEM_HEIGHT}px` }} />

                {/* Values */}
                {values.map((val, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-center text-center transition-all duration-150 ${
                      index === selectedIndex
                        ? `text-black font-semibold text-xl ${color === 'green' ? 'text-green-600' : 'text-red-600'}`
                        : 'text-black/40 text-lg'
                    }`}
                    style={{
                      height: `${ITEM_HEIGHT}px`,
                      scrollSnapAlign: 'start'
                    }}
                    onClick={() => {
                      setSelectedIndex(index)
                      scrollToIndex(index, true)
                      triggerHaptic('selection')
                      onChange(val)
                    }}
                  >
                    {formatValue ? formatValue(val) : val.toFixed(2)}
                  </div>
                ))}

                {/* Bottom padding */}
                <div style={{ height: `${(VISIBLE_ITEMS - 1) / 2 * ITEM_HEIGHT}px` }} />
              </div>
            </div>

            {/* Hide scrollbar */}
            <style>{`
              .overflow-y-auto::-webkit-scrollbar {
                display: none;
              }
            `}</style>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

