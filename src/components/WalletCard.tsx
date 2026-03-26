import { motion } from 'framer-motion';
import { Wallet, Coins, Wifi, WifiOff } from 'lucide-react';

interface WalletCardProps {
  realBalance: number;
  tokenBalance: number;
  isOnline: boolean;
}

export function WalletCard({ realBalance, tokenBalance, isOnline }: WalletCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="gradient-hero rounded-2xl p-6 text-primary-foreground shadow-elevated relative overflow-hidden"
    >
      {/* Decorative circles */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 opacity-80" />
            <span className="text-sm font-medium opacity-80">GridMukt Wallet</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium bg-white/10 rounded-full px-3 py-1">
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs opacity-60 mb-1">Real Balance</p>
            <p className="text-2xl font-bold">₹{realBalance.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs opacity-60 mb-1 flex items-center gap-1">
              <Coins className="w-3 h-3" /> Token Balance
            </p>
            <p className="text-2xl font-bold">{tokenBalance.toLocaleString()} <span className="text-sm font-normal opacity-70">TKN</span></p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
