import { motion } from 'framer-motion';
import { LogOut, Shield, Bell, HelpCircle, Zap } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { useWallet } from '@/hooks/useWallet';

const menuItems = [
  { icon: Shield, label: 'Security', desc: 'Token encryption & signatures' },
  { icon: Bell, label: 'Notifications', desc: 'Payment alerts & sync updates' },
  { icon: HelpCircle, label: 'Help & Support', desc: 'FAQ and contact' },
];

export default function ProfilePage() {
  const { user } = useWallet();

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="gradient-hero rounded-2xl p-6 text-primary-foreground text-center relative overflow-hidden"
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5" />
          <div className="relative z-10">
            <div className="w-16 h-16 rounded-full bg-white/20 mx-auto mb-3 flex items-center justify-center">
              <Zap className="w-8 h-8" />
            </div>
            <p className="font-bold text-lg">{user?.email ?? 'TokenPay User'}</p>
            <p className="text-xs opacity-70 mt-1">Member since {new Date().getFullYear()}</p>
          </div>
        </motion.div>

        {/* Menu */}
        <div className="space-y-2">
          {menuItems.map((item, i) => (
            <motion.button
              key={item.label}
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card shadow-sm hover:shadow-card transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground">
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>

        <button className="w-full flex items-center justify-center gap-2 p-3 text-destructive text-sm font-semibold hover:bg-destructive/5 rounded-xl transition-colors">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
