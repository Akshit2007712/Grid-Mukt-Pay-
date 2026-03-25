import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Nfc, Bluetooth, Download, CheckCircle2, Smartphone, Radio, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { useWallet } from '@/hooks/useWallet';
import { toast } from 'sonner';
import {
  checkNfcStatus,
  openNfcSettings,
  isNfcAvailable,
  startListening,
  simulateNfcReceive,
  type NfcTokenPayload,
} from '@/lib/nfc-service';
import {
  isBluetoothAvailable,
  ensureBluetoothEnabled,
  simulateBluetoothReceive,
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
  const [qrType, setQrType] = useState<'local' | 'cloud'>('local');
  const [pairingPayload, setPairingPayload] = useState("");
  const [cloudPayload, setCloudPayload] = useState("");

  useEffect(() => {
     checkNfcStatus().then(setNfcStatus);
     isBluetoothAvailable().then(setBtReady);
     
     // Generate local pairing ID
     const myName = "TokenPay_" + Math.random().toString(36).substring(7).toUpperCase();
     const myId = crypto.randomUUID().split('-')[0];
     
     setPairingPayload(JSON.stringify({
       v: '1',
       type: 'wallet_pair',
       name: myName,
       id: myId
     }));

     // Generate cloud payment link (for "dur baithe hue" transfers)
     const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://tokenpay.app';
     setCloudPayload(`${baseUrl}/send?to=${myName}&id=${myId}&method=cloud`);
  }, []);

  const nfcReady = nfcStatus.enabled;


  const handleReceive = useCallback(async (payload: NfcTokenPayload | BluetoothTokenPayload) => {
    receiveTokens(payload.amount, payload.senderName);
    setReceived({ amount: payload.amount, senderName: payload.senderName, transactionId: payload.transactionId });
    setListening(false);
    toast.success(`Received ${payload.amount} TKN from ${payload.senderName}!`);
    
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'Tokens Received',
            body: `You received ${payload.amount} TKN from ${payload.senderName}`,
            id: new Date().getTime(),
          }
        ]
      });
    } catch (e) {
      console.log('Local notifications not available', e);
    }

    setTimeout(() => setReceived(null), 3000);
  }, [receiveTokens]);

  const handleListen = useCallback(async () => {
    setListening(true);
    setReceived(null);

    // Ensure Bluetooth is enabled if using Bluetooth method
    if (method === 'bluetooth') {
      const isEnabled = await isBluetoothAvailable();
      if (!isEnabled) {
        toast.info("Opening Bluetooth settings...");
        await ensureBluetoothEnabled();
        // Give it a moment to turn on
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    if (method === 'nfc') {
      const status = await checkNfcStatus();
      if (status.available && !status.enabled) {
        toast.info("NFC is off. Please enable it in settings.");
        await openNfcSettings();
        setListening(false);
        return;
      }

      if (status.available && status.enabled) {
        const cleanup = await startListening(handleReceive);
        if (!cleanup) {
          toast.error('Failed to start NFC listener');
          setListening(false);
        }
      } else {
        simulateNfcReceive(handleReceive, 3000);
      }
    } else {
      // Bluetooth receive (Real implementation would use a GATT server, but for now we simulate or use what's available)
      simulateBluetoothReceive(handleReceive, 3500);
    }
  }, [method, nfcReady, handleReceive]);

  const isReady = method === 'nfc' ? nfcReady : btReady;
  const MethodIcon = method === 'nfc' ? Nfc : Bluetooth;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h1 className="text-xl font-extrabold text-foreground">Receive Tokens</h1>
          <p className="text-xs text-muted-foreground mt-1">Accept token payments via {method === 'nfc' ? 'NFC tap' : 'Bluetooth'}</p>
        </motion.div>

        {/* Method Toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-xl">
          <button
            onClick={() => { setMethod('bluetooth'); setListening(false); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
              method === 'bluetooth' ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground'
            }`}
          >
            <Bluetooth className="w-4 h-4" />
            Bluetooth
          </button>
          <button
            onClick={() => { setMethod('nfc'); setListening(false); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
              method === 'nfc' ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground'
            }`}
          >
            <Nfc className="w-4 h-4" />
            NFC
          </button>
        </div>

        {/* Status */}
        <motion.div
          key={method}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-3 p-3 rounded-xl ${
            (method === 'nfc' ? nfcStatus.available : btReady)
              ? (method === 'nfc' && !nfcStatus.enabled ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success')
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <MethodIcon className="w-4 h-4 shrink-0" />
          <span className="text-xs font-medium">
            {method === 'nfc'
              ? (nfcStatus.available 
                  ? (nfcStatus.enabled ? 'NFC active — ready to receive' : 'NFC disabled — will prompt to enable')
                  : 'NFC unavailable — using simulation')
              : (btReady ? 'Bluetooth active — ready to receive' : 'Bluetooth unavailable — using simulation')}
          </span>
        </motion.div>

        {/* Balance */}
        <div className="gradient-success rounded-2xl p-4 text-primary-foreground">
          <p className="text-xs opacity-70">Current Token Balance</p>
          <p className="text-2xl font-bold">{tokenBalance.toLocaleString()} TKN</p>
        </div>

        {/* Animation Area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card rounded-2xl p-8 shadow-card flex flex-col items-center gap-4"
        >
          {listening ? (
            <div className="relative w-32 h-32">
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-secondary/30"
                animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-secondary/30"
                animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                transition={{ repeat: Infinity, duration: 2, delay: 0.7 }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                {method === 'nfc'
                  ? <Smartphone className="w-14 h-14 text-secondary" />
                  : <Radio className="w-14 h-14 text-secondary" />}
              </div>
            </div>
          ) : (
            <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center">
              <MethodIcon className="w-14 h-14 text-muted-foreground" />
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center">
            {listening
              ? (method === 'nfc' ? 'Waiting for sender to tap...' : 'Waiting for Bluetooth connection...')
              : (method === 'nfc' ? 'Tap "Start Receiving" then hold phones together' : 'Tap "Start Receiving" to listen for nearby senders')}
          </p>
        </motion.div>

        {/* Listen Button */}
        <div className="flex gap-2">
          <Button
            variant={listening ? 'secondary' : 'gradient-accent'}
            size="xl"
            className="flex-1"
            onClick={handleListen}
            disabled={listening}
          >
            {listening ? (
              <><MethodIcon className="w-5 h-5 animate-pulse" /> Listening...</>
            ) : (
              <><Download className="w-5 h-5" /> Start Receiving</>
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-14 w-14 rounded-2xl"
            onClick={() => setShowQR(true)}
          >
            <QrCode className="w-6 h-6" />
          </Button>
        </div>

        {/* QR Modal */}
        <AnimatePresence>
          {showQR && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQR(false)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-card rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-elevated"
              >
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Share Wallet QR</h2>
                  <p className="text-xs text-muted-foreground">Select QR type for the sender</p>
                </div>

                {/* QR Type Toggle */}
                <div className="flex gap-2 p-1 bg-muted rounded-xl">
                  <button 
                    onClick={() => setQrType('local')}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${qrType === 'local' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                  >
                    Local (BT/NFC)
                  </button>
                  <button 
                    onClick={() => setQrType('cloud')}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${qrType === 'cloud' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                  >
                    Cloud (Global)
                  </button>
                </div>

                <div className="bg-white p-4 rounded-3xl mx-auto w-fit shadow-inner">
                  <QRCodeSVG value={qrType === 'local' ? pairingPayload : cloudPayload} size={200} />
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {qrType === 'local' ? 'Nearby Pairing ID' : 'Global Payment Link'}
                  </div>
                  <div className="text-xs font-mono bg-muted p-2 rounded-lg break-all">
                    {qrType === 'local' ? JSON.parse(pairingPayload).name : cloudPayload}
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground italic">
                  {qrType === 'local' 
                    ? "Best for face-to-face transfers" 
                    : "Works from anywhere in the world via internet"}
                </p>

                <Button variant="secondary" className="w-full" onClick={() => setShowQR(false)}>
                  Done
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success */}
        <AnimatePresence>
          {received && (
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
                <p className="text-lg font-bold text-foreground">Received {received.amount} TKN!</p>
                <p className="text-sm text-muted-foreground">From {received.senderName}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  via {method === 'nfc' ? 'NFC' : 'Bluetooth'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  TX: {received.transactionId.slice(0, 12)}...
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
