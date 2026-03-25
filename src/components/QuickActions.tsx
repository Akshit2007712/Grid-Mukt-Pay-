import { motion } from 'framer-motion';
import { ArrowDownUp, Send, Download, History } from 'lucide-react';

interface QuickActionsProps {
  onNavigate: (path: string) => void;
}

const actions = [
  { icon: ArrowDownUp, label: 'Convert', path: '/convert', color: 'gradient-primary' },
  { icon: Send, label: 'Send', path: '/send', color: 'gradient-accent' },
  { icon: Download, label: 'Receive', path: '/receive', color: 'gradient-success' },
  { icon: History, label: 'History', path: '/history', color: 'gradient-card' },
];

export function QuickActions({ onNavigate }: QuickActionsProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map((action, i) => (
        <motion.button
          key={action.label}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          onClick={() => onNavigate(action.path)}
          className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card shadow-card hover:shadow-elevated transition-all duration-200 active:scale-95"
        >
          <div className={`${action.color} w-12 h-12 rounded-xl flex items-center justify-center text-primary-foreground`}>
            <action.icon className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-foreground">{action.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
