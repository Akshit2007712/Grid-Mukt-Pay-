import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, ArrowUp, CheckCircle2, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomNav } from '@/components/BottomNav';
import { useWallet } from '@/hooks/useWallet';
import { toast } from 'sonner';

type Mode = 'toTokens' | 'toCash';

export default function ConvertPage() {
  const { realBalance, tokenBalance, convertToTokens, convertToCash } = useWallet();
  const [amount, setAmount] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [mode, setMode] = useState<Mode>('toTokens');

  const handleConvert = () => {
    const num = parseInt(amount);
    if (!num || num <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    if (mode === 'toTokens') {
      if (num > realBalance) { toast.error('Insufficient real balance'); return; }
      const ok = convertToTokens(num);
      if (ok) { setShowSuccess(true); setAmount(''); setTimeout(() => setShowSuccess(false), 2000); }
    } else {
      if (num > tokenBalance) { toast.error('Insufficient tokens'); return; }
      const ok = convertToCash(num);
      if (ok) { setShowSuccess(true); setAmount(''); setTimeout(() => setShowSuccess(false), 2000); }
    }
  };

  const presets = [100, 500, 1000, 2000];
  const isToTokens = mode === 'toTokens';

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h1 className="text-xl font-extrabold text-foreground">Convert</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {isToTokens ? 'Convert ₹ into offline-usable tokens' : 'Cash out your tokens to real balance'}
          </p>
        </motion.div>

        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-xl">
          <button
            onClick={() => setMode('toTokens')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
              isToTokens ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground'
            }`}
          >
            ₹ → Tokens
          </button>
          <button
            onClick={() => setMode('toCash')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
              !isToTokens ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground'
            }`}
          >
            Tokens → ₹
          </button>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-2xl p-4 shadow-card ${isToTokens ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-card'}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              {isToTokens ? 'From' : 'To'}
            </p>
            <p className="text-lg font-bold text-foreground mt-1">₹{realBalance.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Real Balance</p>
          </div>
          <div className={`rounded-2xl p-4 shadow-card ${!isToTokens ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-card'}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              {isToTokens ? 'To' : 'From'}
            </p>
            <p className="text-lg font-bold text-foreground mt-1 flex items-center gap-1">
              <Coins className="w-4 h-4 text-token-gold" />
              {tokenBalance.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">Token Balance</p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground animate-float">
            {isToTokens ? <ArrowDown className="w-5 h-5" /> : <ArrowUp className="w-5 h-5" />}
          </div>
        </div>

        {/* Amount Input */}
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">
              {isToTokens ? '₹' : 'TKN'}
            </span>
            <Input
              type="number"
              placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className={`h-14 ${isToTokens ? 'pl-9' : 'pl-16'} text-2xl font-bold rounded-2xl bg-card border-2 border-transparent focus:border-primary`}
            />
          </div>

          <div className="flex gap-2">
            {presets.map(p => (
              <button
                key={p}
                onClick={() => setAmount(String(p))}
                className="flex-1 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-colors active:scale-95"
              >
                {isToTokens ? `₹${p}` : `${p}`}
              </button>
            ))}
          </div>
        </div>

        <Button variant="gradient" size="xl" className="w-full" onClick={handleConvert}>
          {isToTokens ? 'Convert to Tokens' : 'Convert to Cash'}
        </Button>

        {/* Success Animation */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="bg-card rounded-3xl p-8 text-center shadow-elevated"
              >
                <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-3" />
                <p className="text-lg font-bold text-foreground">
                  {isToTokens ? 'Tokens Converted!' : 'Cashed Out!'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isToTokens ? 'Your tokens are ready for offline use' : 'Tokens converted back to real balance'}
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
}
