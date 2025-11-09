import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { triggerHaptic } from '../utils/haptics'
import { createPortal } from 'react-dom'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string | React.ReactNode
  children: React.ReactNode
  zIndexClass?: string
}

export default function BottomSheet({ isOpen, onClose, title, children, zIndexClass = 'z-[100]' }: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const handleClose = () => {
    triggerHaptic('light')
    onClose()
  }

  return createPortal(
    (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className={`fixed inset-0 bg-black/50 backdrop-blur-sm ${zIndexClass}`}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`fixed bottom-0 left-0 right-0 ${zIndexClass} bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-hidden`}
          >
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="w-12 h-1 bg-black/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center px-3 pb-4 border-b border-black/10">
              <div className="flex-1">{title}</div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-black/5 rounded-full transition-colors active:scale-95 ml-2 flex-shrink-0"
              >
                <X className="w-5 h-5 text-black/70" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(92vh-80px)] p-3 pb-5">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    ),
    document.body
  )
}
