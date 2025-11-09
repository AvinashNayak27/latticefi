import { motion } from "framer-motion";
import { Rocket } from "lucide-react";

export default function Earn() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-[60vh] flex items-center justify-center"
    >
      <div className="card max-w-2xl mx-auto text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4"
        >
          <Rocket className="w-10 h-10 text-white" />
        </motion.div>
        
        <h2 className="text-3xl font-bold text-black mb-4">Coming Soon</h2>
        
        <p className="text-black/60 mb-4 text-lg">
          Launching staking and vault features soon!
        </p>
        
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-black/5 rounded-xl">
          <span className="text-sm text-black/60">View more on</span>
          <a 
            href="https://www.avantisfi.com/earn" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            avantisfi.com/earn
          </a>
        </div>
      </div>
    </motion.div>
  );
}
