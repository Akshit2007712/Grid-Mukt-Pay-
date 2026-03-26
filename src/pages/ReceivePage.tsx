import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Nfc, Bluetooth, CheckCircle2, Wifi, WifiOff, QrCode, SendIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { useWallet } from '@/hooks/useWallet';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { startP2PListener, decodeBLEPayment, BLE_AD_PREFIX, type P2PPayload } from '@/lib/p2p-bridge';
import {
  checkNfcStatus,
  openNfcSettings,
  startListening,
  simulateNfcReceive,
  type NfcTokenPayload,
} from '@/lib/nfc-service';
import {
  isBluetoothAvailable,
  ensureBluetoothEnabled,
  simulateBluetoothReceive,
  APP_PREFIX,
  type BluetoothTokenPayload,
} from '@/lib/bluetooth-service';

type TransferMethod = 'nfc' | 'bluetooth';

export default function ReceivePage() {
  const { tokenBalance, receiveTokens } = useWallet();
  const [listening, setListening] = useState(false);
  const [method, setMethod] = useState<TransferMethod>('bluetooth');
  const [nfcStatus, setNfcStatus] = useState<{ available: boolean; enabled: boolean }>({ available: false, enabled: false });
  const [btReady, setBtReady] = useState(false);
  const [received, setReceived] = useState<{ amount: number; senderName: string; transactionId: string } | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [pairingPayload, setPairingPayload] = useState('');
  const [isNative, setIsNative] = useState(false);
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState('');
  const [isBridged, setIsBridged] = useState(false);
  const channelRef = useRef<any>(null);
  const p2pCleanupRef = useRef<(() => void) | null>(null);
  const bleScanActive = useRef(false);

  // Initialise persistent identity and status checks
  useEffect(() => {
    checkNfcStatus().then(setNfcStatus);
    isBluetoothAvailable().then(setBtReady);
    setIsNative(!!(window as any).Capacitor?.isNativePlatform());

    // Request Notification Permissions if native
    if (!!(window as any).Capacitor?.isNativePlatform()) {
      LocalNotifications.requestPermissions().then((result) => {
        console.log("GridMukt Notifications Permission:", result.display);
      });
    }

    let savedId = localStorage.getItem('gridmukt_receiver_id');
    let savedName = localStorage.getItem('gridmukt_receiver_name');
    if (!savedId) {
      savedId = crypto.randomUUID().split('-')[0].toUpperCase();
      savedName = APP_PREFIX + savedId;
      localStorage.setItem('gridmukt_receiver_id', savedId);
      localStorage.setItem('gridmukt_receiver_name', savedName);
    }
    setMyId(savedId);
    setMyName(savedName);
    setPairingPayload(JSON.stringify({ v: '1', type: 'wallet_pair', name: savedName, id: savedId }));
  }, []);

  const handleReceive = useCallback(async (payload: any) => {
    if (!payload?.amount) return;
    if (received?.transactionId === payload.transactionId) return;

    console.log("Receiving tokens:", payload.amount, "from", payload.senderName);
    receiveTokens(payload.amount, payload.senderName || 'GridMukt Sender');
    setReceived({ 
      amount: payload.amount, 
      senderName: payload.senderName || 'GridMukt Sender', 
      transactionId: payload.transactionId || crypto.randomUUID() 
    });
    setListening(false);
    toast.success(`GridMukt Sync: Received ${payload.amount} TKN!`);
    
    try {
      const { display } = await LocalNotifications.checkPermissions();
      if (display === 'granted') {
        await LocalNotifications.schedule({
          notifications: [{ 
            title: 'GridMukt Asset Received', 
            body: `Incoming ${payload.amount} TKN from ${payload.senderName || 'Nearby Phone'}`, 
            id: Date.now() 
          }],
        });
      }
    } catch (e) {
      console.log('Notification failed', e);
    }
    setTimeout(() => setReceived(null), 4000);
  }, [receiveTokens, received]);

  // Persistent bridge listeners — Supabase (online) + Offline P2P fallback
  useEffect(() => {
    if (!myId) return;
    
    // ── Layer 1: Supabase Realtime (online only) ──
    console.log(`GridMukt Sync: Subscribing to bridge_${myId}`);
    const channel = supabase.channel(`p2p_bridge_${myId}`, { 
      config: { broadcast: { ack: true } } 
    })
      .on('broadcast', { event: 'PAY_LOAD_INIT' }, ({ payload }) => {
        console.log("Bridge: Received Asset Payload via Supabase", payload);
        handleReceive(payload);
      })
      .subscribe((status) => {
        console.log(`Bridge Status for ${myId}:`, status);
        if (status === 'SUBSCRIBED') setIsBridged(true);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setIsBridged(false);
      });
      
    channelRef.current = channel;

    // ── Layer 2: Offline P2P (BroadcastChannel + localStorage polling) ──
    // This works even in airplane mode when Supabase is down
    console.log(`[P2P] Starting offline listener for: ${myId}`);
    const cleanup = startP2PListener((payload: P2PPayload) => {
      console.log("Bridge: Received via Offline P2P", payload);
      handleReceive(payload);
    }, myId);
    p2pCleanupRef.current = cleanup;

    return () => {
      if (channelRef.current) {
        console.log("Bridge: Removing Supabase listener");
        supabase.removeChannel(channelRef.current);
      }
      if (p2pCleanupRef.current) {
        p2pCleanupRef.current();
        p2pCleanupRef.current = null;
      }
      // Stop BLE scan and advertising
      bleScanActive.current = false;
      import('@capacitor-community/bluetooth-le').then(({ BleClient }) => {
        BleClient.stopLEScan().catch(() => {});
        (BleClient as any).stopAdvertising().catch(() => {});
      });
    };
  }, [myId, handleReceive]);

  const handleListen = useCallback(async () => {
    setListening(true);
    setReceived(null);

    // ── NFC ──
    if (method === 'nfc') {
      const status = await checkNfcStatus();
      if (status.available && !status.enabled) {
        toast.info('Opening NFC settings...');
        await openNfcSettings();
        setListening(false);
        return;
      }
      if (status.available && status.enabled) {
        startListening(handleReceive);
        toast.info('NFC ready — tap phones together');
      } else {
        toast.warning('NFC not available — switching to BLE scan');
      }
    }

    // ── BLE: Advertise our identity + scan for incoming payments ──
    if (isNative) {
      try {
        const { BleClient } = await import('@capacitor-community/bluetooth-le');
        await BleClient.initialize({ androidNeverForLocation: false });

        // 1) Advertise our identity so sender can discover us
        try {
          await (BleClient as any).startAdvertising({
            name: myName,  // GridMukt_<myId>
            services: [],
          });
          console.log('[BLE] Advertising as:', myName);
        } catch (e) {
          console.warn('[BLE] Advertising not supported on this device:', e);
        }

        // 2) CONTINUOUSLY SCAN for incoming payment advertisements
        // The sender encodes the payment in its BLE advertisement name:
        // Format: GM_<myId8>_<amount>_<shortTxId>
        bleScanActive.current = true;
        await BleClient.requestLEScan(
          { allowDuplicates: true },
          (result) => {
            if (!bleScanActive.current) return;
            const name = result.localName || result.device?.name || '';
            if (!name.startsWith(BLE_AD_PREFIX)) return;

            console.log('[BLE] Found advertisement:', name);
            const decoded = decodeBLEPayment(name, myId, 'Nearby Phone');
            if (decoded) {
              console.log('[BLE] Payment decoded from advertisement!', decoded);
              // Stop scan once we receive
              bleScanActive.current = false;
              BleClient.stopLEScan().catch(() => {});
              handleReceive(decoded);
            }
          }
        );
        console.log('[BLE] Continuous scan started — waiting for payment ad...');
        toast.success(`Listening via BLE: ${myName.replace(APP_PREFIX, '')}`);
      } catch (e: any) {
        console.error('[BLE] Error:', e);
        toast.error('BLE init failed: ' + (e?.message || e));
      }
    } else {
      // Web/browser fallback
      toast.info(`Offline bridge active for: ${myName.replace(APP_PREFIX, '')}`);
    }
  }, [method, isNative, handleReceive, myName, myId]);

  const triggerMock = () => {
    if (method === 'nfc') simulateNfcReceive(handleReceive, 500);
    else simulateBluetoothReceive(handleReceive, 500);
  };

  const MethodIcon = method === 'nfc' ? Nfc : Bluetooth;

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="max-w-md mx-auto px-4 pt-8 space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-foreground tracking-tighter">Receive</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest bg-muted px-2 py-0.5 rounded-full w-fit">
              Identity: {myName.replace(APP_PREFIX, '')}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase transition-all ${isBridged ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
            {isBridged ? <><Wifi className="w-3 h-3" /> Bridge Live</> : <><WifiOff className="w-3 h-3" /> Bridge Idle</>}
          </div>
        </motion.div>
        {/* Method selector */}
        <div className="grid grid-cols-2 gap-3 p-1.5 bg-muted rounded-3xl">
          <button onClick={() => { setMethod('bluetooth'); setListening(false); }} className={`flex items-center justify-center gap-2 py-4 rounded-2xl text-xs font-black transition-all ${method === 'bluetooth' ? 'bg-card text-foreground shadow-sm shadow-black/5' : 'text-muted-foreground'}`}>
            <Bluetooth className="w-4 h-4" /> Bluetooth
          </button>
          <button onClick={() => { setMethod('nfc'); setListening(false); }} className={`flex items-center justify-center gap-2 py-4 rounded-2xl text-xs font-black transition-all ${method === 'nfc' ? 'bg-card text-foreground shadow-sm shadow-black/5' : 'text-muted-foreground'}`}>
            <Nfc className="w-4 h-4" /> NFC Tap
          </button>
        </div>
        {/* Visual target area */}
        <motion.div onClick={handleListen} className={`aspect-square max-w-[280px] mx-auto rounded-[60px] flex flex-col items-center justify-center gap-6 cursor-pointer transition-all duration-500 relative overflow-hidden group border-2 ${listening ? 'bg-primary/5 border-primary shadow-2xl shadow-primary/10' : 'bg-card border-border hover:border-primary/40'}`}>
          {listening ? (
            <>
              <div className="relative">
                <motion.div className="absolute inset-0 rounded-full border-4 border-primary/20" animate={{ scale: [1, 2.5], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2.5 }} />
                <motion.div className="absolute inset-0 rounded-full border-4 border-primary/20" animate={{ scale: [1, 2.5], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2.5, delay: 1 }} />
                <div className="bg-primary text-primary-foreground p-8 rounded-full shadow-lg relative">
                  <MethodIcon className="w-12 h-12" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-black uppercase tracking-tight">Listening...</p>
                <p className="text-[10px] text-muted-foreground font-black opacity-60">Wait for sender to pair or click demo</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-muted text-muted-foreground p-8 rounded-full group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <MethodIcon className="w-12 h-12" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-black uppercase tracking-tight">Tap to Start</p>
                <p className="text-[10px] text-muted-foreground font-black opacity-60">Ready to receive GridMukt assets</p>
              </div>
            </>
          )}
        </motion.div>
        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button variant={listening ? 'secondary' : 'gradient-accent'} size="xl" className="flex-1 h-16 rounded-[24px] shadow-xl text-base font-black shadow-primary/10" onClick={handleListen} disabled={listening}>
            {listening ? 'SCANNER ACTIVE' : 'START RECEIVING'}
          </Button>
          <Button variant="outline" size="icon" className="h-16 w-16 rounded-[24px] border-border/50" onClick={() => setShowQR(true)}>
            <QrCode className="w-7 h-7" />
          </Button>
        </div>
        {/* Demo fallback */}
        {listening && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button onClick={triggerMock} className="w-full py-4 rounded-2xl border-2 border-dashed border-primary/20 text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:bg-primary/5 transition-all">
              <div className="flex items-center justify-center gap-2">
                <SendIcon className="w-3 h-3" /> Trigger Simulation (Phone 2 Tool)
              </div>
            </button>
          </motion.div>
        )}
        {/* Balance */}
        <div className="bg-muted/40 p-4 rounded-3xl flex items-center justify-between border border-border/50">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase font-black opacity-50">Local Balance</p>
            <p className="text-lg font-black">{tokenBalance.toLocaleString()} TKN</p>
          </div>
          <div className="h-10 w-10 rounded-2xl bg-success/20 flex items-center justify-center text-success">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* QR Modal */}
      <AnimatePresence>
        {showQR && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowQR(false)} className="fixed inset-0 z-100 bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }} onClick={e => e.stopPropagation()} className="bg-card rounded-[48px] p-8 max-w-sm w-full text-center space-y-6 shadow-2xl border border-border">
              <div className="space-y-1">
                <h2 className="text-2xl font-black tracking-tight">GridMukt Pair</h2>
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{myId}</p>
              </div>
              <div className="bg-white p-6 rounded-[40px] shadow-inner mx-auto w-fit">
                <QRCodeSVG value={pairingPayload} size={220} />
              </div>
              <p className="text-[10px] font-bold text-muted-foreground leading-relaxed px-4 opacity-70 italic">Sender must scan this QR to establish the secure demo bridge between devices.</p>
              <Button variant="secondary" className="w-full h-14 rounded-2xl text-xs font-black" onClick={() => setShowQR(false)}>CLOSE</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {received && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-110 flex items-center justify-center bg-background/90 backdrop-blur-2xl">
            <motion.div initial={{ scale: 0.8, y: 40 }} animate={{ scale: 1, y: 0 }} className="bg-card rounded-[50px] p-12 text-center shadow-elevated border border-success/20 max-w-md w-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-3 bg-success shadow-lg shadow-success/40" />
              <div className="w-24 h-24 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner ring-4 ring-success/10">
                <CheckCircle2 className="w-14 h-14 text-success" />
              </div>
              <h2 className="text-4xl font-black text-foreground tracking-tighter">SUCCESS!</h2>
              <div className="mt-8 space-y-2">
                <p className="text-5xl font-black text-success tracking-tighter">+{received.amount}</p>
                <p className="text-xs uppercase font-black text-muted-foreground tracking-widest">Received from {received.senderName.replace(APP_PREFIX, '')}</p>
              </div>
              <div className="mt-12 pt-8 border-t border-border/60">
                <p className="text-[10px] text-muted-foreground italic font-medium">Session ID: {received.transactionId.substring(0, 8)}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
