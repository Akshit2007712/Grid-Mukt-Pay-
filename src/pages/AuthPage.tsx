import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Mail, Phone, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function AuthPage() {
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [value, setValue] = useState('');
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const navigate = useNavigate();

  const handleSendOTP = () => {
    if (!value) {
      toast.error('Please enter your details');
      return;
    }
    setOtpMode(true);
    toast.success('OTP sent successfully (Simulated: 1234)');
  };

  const handleVerify = () => {
    if (otp === '1234') {
      localStorage.setItem('gridmukt_auth', 'true');
      toast.success('Successfully logged in!');
      navigate('/');
    } else {
      toast.error('Invalid OTP. Use 1234');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-secondary/20">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm space-y-8 text-center"
      >
        <div className="space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-primary fill-primary/20" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">GridMukt Pay</h1>
          <p className="text-muted-foreground">Secure P2P Hybrid Payments</p>
        </div>

        {!otpMode ? (
          <div className="space-y-4 text-left">
            <div className="flex bg-secondary p-1 rounded-lg">
              <button
                onClick={() => setMethod('email')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${method === 'email' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                Email
              </button>
              <button
                onClick={() => setMethod('phone')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${method === 'phone' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                Phone
              </button>
            </div>

            <div className="relative">
              <div className="absolute left-3 top-3 text-muted-foreground">
                {method === 'email' ? <Mail className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
              </div>
              <Input
                placeholder={method === 'email' ? 'Enter email address' : 'Enter mobile number'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="pl-10 h-12"
                onKeyDown={(e) => e.key === 'Enter' && handleSendOTP()}
              />
            </div>

            <Button onClick={handleSendOTP} className="w-full h-12 text-lg font-bold">
              Continue
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold text-muted-foreground">
                <span className="bg-background px-2 tracking-widest">Or for Judging Demo</span>
              </div>
            </div>

            <Button onClick={() => { localStorage.setItem('gridmukt_auth', 'true'); navigate('/'); }} variant="outline" className="w-full h-12 text-xs border-dashed">
              QUICK JUDGE LOG-IN
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Verification</h2>
            <p className="text-sm text-muted-foreground">Type 1234 to unlock your vault</p>
            
            <div className="flex justify-center gap-4">
               <Input 
                 placeholder="----"
                 maxLength={4} 
                 className="text-center text-3xl tracking-[0.5em] h-16 font-mono border-2 border-primary/20"
                 value={otp}
                 onChange={(e) => {
                    setOtp(e.target.value);
                    if (e.target.value === '1234') {
                       localStorage.setItem('gridmukt_auth', 'true');
                       toast.success('Access Granted!');
                       navigate('/');
                    }
                 }}
                 autoFocus
               />
            </div>

            <Button onClick={handleVerify} className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20">
              Verify & Enter
            </Button>
            
            <button 
              onClick={() => setOtpMode(false)}
              className="text-xs text-primary font-medium"
            >
              Change {method === 'email' ? 'email' : 'number'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
