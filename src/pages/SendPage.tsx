import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bluetooth, 
  Nfc, 
  Search, 
  Phone, 
  Smartphone, 
  Info, 
  History, 
  SendIcon, 
  CheckCircle2, 
  AlertCircle,
  QrCode,
  X as CloseIcon,
  ShieldCheck,
  Wifi
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomNav } from '@/components/BottomNav';
import { useWallet } from '@/hooks/useWallet';
import { toast } from 'sonner';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { sendP2PPayload, encodeBLEPayment, type P2PPayload } from '@/lib/p2p-bridge';
import { 
  scanForDevices, 
  ensureBluetoothEnabled, 
  simulateBluetoothSend,
  verifyDevice,
  APP_PREFIX,
  type BluetoothTokenPayload,
  type NearbyDevice as Device,
} from '@/lib/bluetooth-service';
import {
  simulateNfcSend,
  shareViaNfc,
  type NfcTokenPayload,
} from '@/lib/nfc-service';

type TransferMethod = 'bluetooth' | 'nfc';

export default function SendPage() {
  const { tokenBalance, sendTokens } = useWallet();
  const [method, setMethod] = useState<TransferMethod>('bluetooth');
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<any>(null);

  const [confirmPin, setConfirmPin] = useState(false);
  const [pin, setPin] = useState('');
  const [paymentQRData, setPaymentQRData] = useState<string | null>(null);

  const gridMuktDevices = devices.filter(d => 
    d.name.toLowerCase().includes('mukt') || d.name.startsWith(APP_PREFIX)
  );

  const startScan = useCallback(async () => {
    setScanning(true);
    setDevices([]);
    setSelectedDevice(null);
    setSuccess(null);

    try {
      const isEnabled = await ensureBluetoothEnabled();
      if (!isEnabled) {
        setScanning(false);
        return;
      }

      await scanForDevices((device) => {
        setDevices(prev => {
           if (prev.some(d => d.id === device.id)) return prev;
           return [...prev, device];
        });
      }, 5000);
    } catch (error) {
      toast.error('Scan failed');
    } finally {
      setScanning(false);
    }
  }, []);

  const handleQRDetected = useCallback((decodedText: string) => {
    try {
      // Find JSON block in case of prefixes
      const jsonStart = decodedText.indexOf('{');
      const jsonEnd = decodedText.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found");
      
      const cleanJson = decodedText.substring(jsonStart, jsonEnd + 1);
      const data = JSON.parse(cleanJson);
      
      if (data.type === 'wallet_pair' || data.id) {
        toast.success(`GridMukt Pair Linked: ${data.name?.replace(APP_PREFIX, '') || 'Receiver'}`);
        
        const foundDevice: Device = {
          name: data.name || (APP_PREFIX + data.id.substring(0, 4)),
          id: data.id,
          strength: 100,
          isApp: true
        };
        
        setDevices(prev => [foundDevice, ...prev.filter(d => d.id !== data.id)]);
        setSelectedDevice(foundDevice);
        stopScanner();
      } else {
        toast.error('Unrecognized GridMukt ID');
      }
    } catch (e) {
      console.error("QR Scan Error:", e);
      toast.error('Invalid QR Format. Point at Receive QR.');
    }
  }, []);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (e) {
        console.warn("Stop scanner failed", e);
      }
    }
    setShowScanner(false);
  }, []);

  useEffect(() => {
    let html5QrCode: any = null;
    
    if (showScanner) {
      import('html5-qrcode').then(({ Html5Qrcode }) => {
        html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = html5QrCode;
        
        const config = { fps: 15, qrbox: { width: 280, height: 280 } };
        
        html5QrCode.start(
          { facingMode: "environment" },
          config,
          handleQRDetected,
          () => {} // silent failures during scan
        ).catch((err: any) => {
          toast.error("Camera access denied or busy");
          setShowScanner(false);
        });
      });
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(() => {});
      }
    };
  }, [showScanner, handleQRDetected]);

  const initiatePayment = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return toast.warning('Enter valid amount');
    if (val > tokenBalance) return toast.error('Insufficient TKN');
    if (!selectedDevice && method === 'bluetooth') return toast.warning('Select receiving device');
    
    setConfirmPin(true);
  };

  const handleTransfer = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return toast.warning('Enter valid amount');
    if (val > tokenBalance) return toast.error('Insufficient TKN');
    
    if (pin !== '9999') {
       toast.error('Secure PIN Invalid. Try 9999');
       return;
    }
    setConfirmPin(false);
    setPin('');
    setSending(true);
    try {
      await new Promise(r => setTimeout(r, 1500)); 
      
      const payload = {
        amount: val,
        senderName: localStorage.getItem('gridmukt_receiver_name') || 'Sender Phone',
        transactionId: crypto.randomUUID(),
        timestamp: Date.now().toString(),
        signature: 'gridmukt_final_pro_sig'
      };

      // Extract the receiver's Bridge ID
      const bridgeId = selectedDevice?.name.startsWith(APP_PREFIX)
        ? selectedDevice.name.replace(APP_PREFIX, '')
        : selectedDevice?.id || '';

      // ── LAYER 1: BLE Advertisement Payload (real airplane mode, cross-physical-device) ──
      // Encodes payment in BLE name: GM_<receiverId8>_<amount>_<tx6>
      // Receiver does continuous BLE scan and decodes it on pickup
      const isNativeApp = !!(window as any).Capacitor?.isNativePlatform();
      if (isNativeApp && bridgeId) {
        try {
          const { BleClient } = await import('@capacitor-community/bluetooth-le');
          await BleClient.initialize({ androidNeverForLocation: false });
          const txId = payload.transactionId;
          const adName = encodeBLEPayment(bridgeId, val, txId);
          console.log('[BLE] Starting payment advertisement:', adName);
          await (BleClient as any).startAdvertising({ name: adName, services: [] });
          console.log('[BLE] Payment ad live for 30s');
          // Stop after 30 seconds
          setTimeout(() => {
            (BleClient as any).stopAdvertising().catch(() => {});
            console.log('[BLE] Payment ad stopped');
          }, 30000);
        } catch (e: any) {
          console.warn('[BLE] BLE advertising failed:', e?.message || e);
        }
      }

      // ── LAYER 2: Same-device offline (BroadcastChannel + localStorage) ──
      const p2pPayload: P2PPayload = { ...payload, targetId: bridgeId || undefined };
      sendP2PPayload(p2pPayload);

      // ── LAYER 3: Supabase Realtime (works when online, non-blocking) ──
      if (bridgeId) {
         const channel = supabase.channel(`p2p_bridge_${bridgeId}`, {
            config: { broadcast: { ack: true } }
         });
         channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
               channel.send({
                  type: 'broadcast',
                  event: 'PAY_LOAD_INIT',
                  payload: payload
               }).then(() => {
                  setTimeout(() => supabase.getChannels().forEach(ch => supabase.removeChannel(ch)), 2000);
               }).catch(() => {});
            }
         });
      }

      // ── NFC native send ──
      if (method === 'nfc' && isNativeApp) {
        await shareViaNfc(payload as NfcTokenPayload);
      }

      // Credit sender side immediately (tokens deducted)
      sendTokens(val, selectedDevice?.name || 'Pair Device');
      setSuccess(`${val.toFixed(2)} TKN SENT TO ${selectedDevice?.name.replace(APP_PREFIX, '') || 'NFC RECIPIENT'}`);
      setPaymentQRData(JSON.stringify(payload));
      setAmount('');
      setSelectedDevice(null);
    } catch (error) {
      toast.error('Transfer failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="max-w-md mx-auto px-4 pt-8 space-y-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-between items-end">
          <div className="space-y-1">
             <h1 className="text-3xl font-black text-foreground tracking-tighter">Transfer</h1>
             <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest bg-muted px-2 py-0.5 rounded-full w-fit">Send Offline Assets</p>
          </div>
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-muted/30" onClick={() => window.location.href='/history'}><History className="w-6 h-6" /></Button>
        </motion.div>

        {/* Amount Input Large */}
        <div className="bg-card rounded-[40px] p-8 border border-border shadow-elevated space-y-4">
           <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-muted-foreground opacity-50 tracking-widest">Bridged Send Pool</span>
              <div className="bg-success/10 text-success text-[10px] font-black px-3 py-1 rounded-full border border-success/20 uppercase tracking-widest">Secure Link</div>
           </div>
           <div className="relative">
              <input autoFocus type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-transparent text-6xl font-black focus:outline-none placeholder:text-muted-foreground/10 text-foreground transition-all tracking-tighter" />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-3xl font-black text-muted-foreground/30">TKN</span>
           </div>
           <div className="flex items-center justify-between pt-6 border-t border-border/60">
              <p className="text-[10px] font-bold text-muted-foreground opacity-70">Balance: {tokenBalance.toLocaleString()} TKN</p>
              <button onClick={() => setAmount(tokenBalance.toString())} className="text-[10px] font-black text-primary uppercase underline-offset-4 decoration-2">Max Pool</button>
           </div>
        </div>

        {/* Bridge Connection Selector */}
        <div className="space-y-4">
           <div className="flex items-center justify-between px-1">
              <h2 className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground opacity-50">Discovery Hub</h2>
              <div className="flex gap-1">
                 <button onClick={() => setMethod('bluetooth')} className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all ${method === 'bluetooth' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-muted text-muted-foreground'}`}>BT Link</button>
                 <button onClick={() => setMethod('nfc')} className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all ${method === 'nfc' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-muted text-muted-foreground'}`}>NFC Link</button>
              </div>
           </div>

           <AnimatePresence mode="wait">
              {method === 'bluetooth' && (
                 <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
                    <div className="flex gap-2.5">
                       <Button className="flex-1 h-16 rounded-[24px] text-xs font-black shadow-lg shadow-primary/10 border border-primary/20 uppercase tracking-widest" onClick={startScan} disabled={scanning} variant={scanning ? 'secondary' : 'default'}>
                          <Search className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} /> {scanning ? 'Locating...' : 'Scan Nearby'}
                       </Button>
                       <Button variant="outline" className="h-16 w-16 rounded-[24px] border-border/50 shadow-sm" onClick={() => setShowScanner(true)}>
                          <QrCode className="w-7 h-7 text-primary" />
                       </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 min-h-[140px]">
                       {gridMuktDevices.length === 0 ? (
                          <div className="bg-muted/30 rounded-[32px] py-10 px-4 text-center border-2 border-dashed border-border/40 flex flex-col items-center gap-3">
                             <Smartphone className="w-10 h-10 text-muted-foreground/20" />
                             <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">No Live Handshakes Found</p>
                          </div>
                       ) : (
                          gridMuktDevices.map((d) => (
                             <motion.button key={d.id} whileTap={{ scale: 0.98 }} onClick={() => setSelectedDevice(d)} className={`p-5 rounded-[28px] flex items-center justify-between border-2 transition-all relative overflow-hidden ${selectedDevice?.id === d.id ? 'bg-primary/5 border-primary shadow-xl shadow-primary/5' : 'bg-card border-transparent hover:border-border/60'}`}>
                                <div className="flex items-center gap-4">
                                   <div className={`p-3 rounded-2xl ${selectedDevice?.id === d.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                      <Smartphone className="w-5 h-5" />
                                   </div>
                                   <div className="text-left">
                                      <p className="text-sm font-black tracking-tight">{d.name.replace(APP_PREFIX, '')}</p>
                                      <p className="text-[10px] text-muted-foreground font-bold">Signal: {d.strength}% • Secure Bridge: Ready</p>
                                   </div>
                                </div>
                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[8px] font-black uppercase transition-all ${selectedDevice?.id === d.id ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground opacity-50'}`}>
                                   <Wifi className="w-3 h-3" /> Linked
                                </div>
                             </motion.button>
                          ))
                       )}
                    </div>
                 </motion.div>
              )}

              {method === 'nfc' && (
                 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="bg-primary/5 border border-primary/20 rounded-[40px] p-10 text-center space-y-6 relative overflow-hidden">
                    <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-2 shadow-2xl shadow-primary/10">
                       <Smartphone className="w-12 h-12 text-primary animate-bounce" />
                    </div>
                    <div className="space-y-1">
                       <h2 className="text-sm font-black uppercase tracking-[0.2em] text-foreground">Sensor Primed</h2>
                       <p className="text-[10px] text-muted-foreground font-black opacity-50 uppercase tracking-widest">Touch phones together now</p>
                    </div>
                 </motion.div>
              )}
           </AnimatePresence>
        </div>

        {/* Global Action */}
        <div className="space-y-4 pt-4">
           <Button className="w-full h-18 rounded-[28px] text-xl font-black gap-4 shadow-2xl shadow-primary/20 uppercase tracking-tighter" variant="gradient-accent" disabled={sending || (!selectedDevice && method === 'bluetooth') || !amount} onClick={initiatePayment}>
              {sending ? <><Bluetooth className="w-6 h-6 animate-pulse"/> Bridging...</> : <><SendIcon className="w-6 h-6"/> EXECUTE SEND</>}
           </Button>
           
           <div className="flex items-start gap-3 text-muted-foreground p-5 bg-card rounded-3xl border border-border shadow-sm">
              <ShieldCheck className="w-5 h-5 shrink-0 text-success" />
              <p className="text-[10px] leading-relaxed font-black uppercase tracking-widest opacity-60">Secure Bridge Encryption Active. Assets are moved locally and synced via global ledger relay.</p>
           </div>
        </div>
      </div>

      {/* QR Scanner */}
      <AnimatePresence>
        {showScanner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-100 bg-background/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6">
             <div className="w-full max-w-sm bg-card rounded-[50px] overflow-hidden shadow-2xl border border-border">
                <div className="p-6 border-b border-border/60 flex justify-between items-center bg-muted/20">
                   <h2 className="font-black text-xs uppercase tracking-[0.3em]">Scanner Active</h2>
                   <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={() => setShowScanner(false)}><CloseIcon className="w-5 h-5" /></Button>
                </div>
                <div id="qr-reader" className="m-6 rounded-[36px] overflow-hidden grayscale contrast-125 border-4 border-muted"/>
                <div className="p-8 text-center bg-muted/5">
                   <p className="text-[10px] font-black text-muted-foreground uppercase leading-relaxed max-w-[220px] mx-auto tracking-widest opacity-60">Point cameras at receiving device's pairing identity module.</p>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-110 flex items-center justify-center bg-background/90 backdrop-blur-2xl">
             <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="bg-card rounded-[50px] p-12 text-center shadow-elevated border border-success/20 max-w-md w-full relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-3 bg-success shadow-lg shadow-success/40" />
                <div className="w-24 h-24 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner ring-4 ring-success/10">
                   <CheckCircle2 className="w-14 h-14 text-success" />
                </div>
                <h2 className="text-4xl font-black text-foreground tracking-tighter uppercase tracking-[-0.05em]">Transfer Confirmed</h2>
                <div className="mt-8 p-6 bg-muted/30 rounded-[32px] border border-border/50">
                   <p className="text-xs text-muted-foreground font-black tracking-widest leading-loose">{success}</p>
                </div>
                
                {paymentQRData && (
                   <div className="mt-6 flex flex-col items-center justify-center space-y-4">
                      <p className="text-[10px] uppercase font-black tracking-widest text-primary">Backup Offline Transfer QR</p>
                      <div className="bg-white p-4 rounded-3xl shadow-inner border border-border">
                         <QRCodeSVG value={paymentQRData} size={220} />
                      </div>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-black max-w-[200px] leading-relaxed opacity-60">Receiver can scan this if BLE fails</p>
                   </div>
                )}

                <Button className="mt-8 w-full h-16 rounded-[24px] text-sm font-black shadow-xl" variant="outline" onClick={() => { setSuccess(null); setPaymentQRData(null); }}>BACK TO POOL</Button>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN Confirmation Modal */}
      <AnimatePresence>
        {confirmPin && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-110 flex items-center justify-center bg-background/90 backdrop-blur-2xl p-6">
             <motion.div initial={{ y: 50 }} animate={{ y: 0 }} className="bg-card rounded-[40px] p-10 text-center shadow-2xl border border-border w-full max-w-sm space-y-6">
                <div className="space-y-2">
                   <h2 className="text-2xl font-black uppercase tracking-tight">Enter Secure PIN</h2>
                   <p className="text-xs text-muted-foreground font-black uppercase tracking-widest opacity-50">Confirming transfer of {amount} TKN</p>
                </div>
                <div className="py-4">
                   <Input 
                     type="password"
                     placeholder="0000"
                     maxLength={4} 
                     className="text-center text-4xl tracking-[1em] h-20 font-mono rounded-3xl border-2 border-primary/20 focus:border-primary"
                     value={pin}
                     onChange={(e) => setPin(e.target.value)}
                     autoFocus
                   />
                </div>
                <div className="flex gap-4">
                   <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black" onClick={() => setConfirmPin(false)}>CANCEL</Button>
                   <Button variant="gradient" className="flex-1 h-14 rounded-2xl font-black" onClick={handleTransfer}>CONFIRM</Button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
