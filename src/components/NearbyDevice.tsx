import { motion } from 'framer-motion';
import { Smartphone, Signal } from 'lucide-react';

interface NearbyDeviceProps {
  name: string;
  strength: number;
  onSelect: () => void;
  delay?: number;
}

export function NearbyDevice({ name, strength, onSelect, delay = 0 }: NearbyDeviceProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card shadow-card hover:shadow-elevated transition-all active:scale-[0.98]"
    >
      <div className="w-12 h-12 rounded-xl gradient-card flex items-center justify-center text-primary-foreground">
        <Smartphone className="w-5 h-5" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm font-bold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">Nearby device</p>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Signal className="w-4 h-4" />
        <span className="text-xs font-medium">{strength}%</span>
      </div>
    </motion.button>
  );
}
