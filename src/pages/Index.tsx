import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, CloudOff, Zap, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WalletCard } from '@/components/WalletCard';
import { QuickActions } from '@/components/QuickActions';
import { TransactionItem } from '@/components/TransactionItem';
import { BottomNav } from '@/components/BottomNav';
import { useWallet } from '@/hooks/useWallet';

export default function Index() {
  const navigate = useNavigate();
  const { realBalance, tokenBalance, transactions, isOnline, isSyncing, syncTransactions } = useWallet();
  const pendingCount = transactions.filter(t => t.status === 'pending').length;
  const recentTx = transactions.slice(0, 5);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-5">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
              <Zap className="w-6 h-6 text-primary" />
              GridMukt Pay
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Your hybrid payment wallet</p>
          </div>
          {isOnline ? (
            <div className="flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-3 py-1.5 rounded-full">
              <Wifi className="w-3.5 h-3.5" />
              Online
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-3 py-1.5 rounded-full">
              <CloudOff className="w-3.5 h-3.5" />
              Offline
            </div>
          )}
        </motion.div>

        {/* Wallet Card */}
        <WalletCard realBalance={realBalance} tokenBalance={tokenBalance} isOnline={isOnline} />

        {/* Sync Banner */}
        {pendingCount > 0 && isOnline && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-accent rounded-xl p-3 flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-semibold text-accent-foreground">{pendingCount} pending transaction{pendingCount > 1 ? 's' : ''}</p>
              <p className="text-[10px] text-muted-foreground">Sync to update balances</p>
            </div>
            <Button variant="gradient" size="sm" onClick={() => syncTransactions()} disabled={isSyncing}>
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </motion.div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-bold text-foreground mb-3">Quick Actions</h2>
          <QuickActions onNavigate={navigate} />
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
            {transactions.length > 0 && (
              <button onClick={() => navigate('/history')} className="text-xs font-semibold text-primary">
                View All
              </button>
            )}
          </div>
          {recentTx.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No transactions yet</p>
              <p className="text-xs mt-1">Convert some tokens to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTx.map(tx => (
                <TransactionItem key={tx.id} tx={tx} />
              ))}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
