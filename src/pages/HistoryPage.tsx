import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TransactionItem } from '@/components/TransactionItem';
import { BottomNav } from '@/components/BottomNav';
import { useWallet } from '@/hooks/useWallet';

type Filter = 'all' | 'pending' | 'completed';

export default function HistoryPage() {
  const { transactions, isOnline, isSyncing, syncTransactions } = useWallet();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = transactions.filter(tx => {
    if (filter === 'all') return true;
    return tx.status === filter;
  });

  const pendingCount = transactions.filter(t => t.status === 'pending').length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Transaction History</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{transactions.length} total transactions</p>
          </div>
          {pendingCount > 0 && isOnline && (
            <Button variant="gradient" size="sm" onClick={syncTransactions} disabled={isSyncing}>
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          )}
        </motion.div>

        {/* Filters */}
        <div className="flex gap-2">
          {(['all', 'pending', 'completed'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {f} {f === 'pending' && pendingCount > 0 ? `(${pendingCount})` : ''}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No {filter !== 'all' ? filter : ''} transactions</p>
            </div>
          ) : (
            filtered.map((tx, i) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <TransactionItem tx={tx} />
              </motion.div>
            ))
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
