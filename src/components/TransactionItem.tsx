import { ArrowDownUp, Send, Download, Clock, CheckCircle2, XCircle } from 'lucide-react';
import type { Transaction } from '@/lib/token-store';

const icons = {
  convert: ArrowDownUp,
  send: Send,
  receive: Download,
};

const statusIcons = {
  pending: Clock,
  completed: CheckCircle2,
  failed: XCircle,
};

const statusColors = {
  pending: 'text-warning',
  completed: 'text-success',
  failed: 'text-destructive',
};

export function TransactionItem({ tx }: { tx: Transaction }) {
  const Icon = icons[tx.type];
  const StatusIcon = statusIcons[tx.status];

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card shadow-sm hover:shadow-card transition-shadow">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        tx.type === 'convert' ? 'gradient-primary' : tx.type === 'send' ? 'gradient-accent' : 'gradient-success'
      } text-primary-foreground`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground capitalize">{tx.type} Tokens</p>
        <p className="text-xs text-muted-foreground truncate">
          {tx.counterparty ? `${tx.type === 'send' ? 'To' : 'From'}: ${tx.counterparty}` : new Date(tx.timestamp).toLocaleString()}
        </p>
      </div>
      <div className="text-right flex flex-col items-end gap-0.5">
        <p className={`text-sm font-bold ${tx.type === 'receive' ? 'text-success' : 'text-foreground'}`}>
          {tx.type === 'receive' ? '+' : tx.type === 'send' ? '-' : ''}{tx.amount} TKN
        </p>
        <StatusIcon className={`w-3.5 h-3.5 ${statusColors[tx.status]}`} />
      </div>
    </div>
  );
}
