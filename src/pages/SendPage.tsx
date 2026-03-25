import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Nfc, Bluetooth, CheckCircle2, Smartphone, Loader2, Radio, QrCode } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomNav } from '@/components/BottomNav';
import { NearbyDevice } from '@/components/NearbyDevice';
import { useWallet } from '@/hooks/useWallet';
import { toast } from 'sonner';
import {
  checkNfcStatus,
  openNfcSettings,
  isNfcAvailable,
  shareViaNfc,
  stopSharing,
  simulateNfcSend,
  type NfcTokenPayload,
} from '@/lib/nfc-service';
import {
  isBluetoothAvailable,
  ensureBluetoothEnabled,
  scanForDevices,
  simulateBluetoothSend,
  simulateBluetoothReceive, // Added simulateBluetoothReceive as per the user's provided code snippet
  type BluetoothTokenPayload,
  type NearbyDevice as NearbyDeviceType,
} from '@/lib/bluetooth-service';
import { v4 as uuidv4 } from 'uuid';

type TransferMethod = 'nfc' | 'bluetooth';

export default function SendPage() {
  const { tokenBalance, sendTokens } = useWallet();
  const [amount, setAmount] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [method, setMethod] = useState<TransferMethod>('bluetooth');
  const [nfcStatus, setNfcStatus] = useState<{ available: boolean; enabled: boolean }>({ available: false, enabled: false });
  const [btReady, setBtReady] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<NearbyDeviceType[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [nfcRecipientName, setNfcRecipientName] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    checkNfcStatus().then(setNfcStatus);
    isBluetoothAvailable().then(setBtReady);

    // Support Cloud Deep-links (for "dur baithe hue" payments)
    const params = new URLSearchParams(window.location.search);
    const to = params.get('to');
    if (to) {
      toast.info(`Sending to Global Wallet: ${to}`);
      setSelectedDevice(to);
      setNfcRecipientName(to);
      // If payment link specify amount...
      const amt = params.get('amount');
      if (amt) setAmount(amt);
    }
  }, []);

  const nfcReady = nfcStatus.enabled;


  const handleScan = async () => {
    setScanning(true);
    setDevices([]);
    setSelectedDevice(null);

    try {
      // 1. First ensure BT is actually enabled (especially on Android)
      const isEnabled = await isBluetoothAvailable();
      if (!isEnabled) {
        toast.info("Opening Bluetooth settings...");
        const forced = await ensureBluetoothEnabled();
        if (!forced) {
          throw new Error("Bluetooth must be enabled to scan.");
        }
        // Give it a moment to actually turn on
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      await scanForDevices((device) => {
        setDevices((prev) => {
          // Update strength if exists, or append if new
          const exists = prev.find((d) => d.id === device.id);
          if (exists) {
            return prev.map((d) => (d.id === device.id ? device : d));
          }
          return [...prev, device];
        });
      }, 5000);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Bluetooth scanning failed. Ensure Bluetooth and Location are ON.');
    } finally {
      setScanning(false);
    }
  };


  const handleQRScan = () => {
    setShowScanner(true);
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      scanner.render((decodedText) => {
        try {
          // Check if it's a Cloud URL first
          if (decodedText.startsWith('http')) {
            const url = new URL(decodedText);
            const name = url.searchParams.get('to');
            const id = url.searchParams.get('id');
            const methodParam = url.searchParams.get('method');
            
            if (name && id) {
              toast.success(`Cloud Wallet Found: ${name}`);
              setNfcRecipientName(name);
              setSelectedDevice(name); // Reuse this for destination display
              setAmount("100"); // default or keep empty
              scanner.clear();
              setShowScanner(false);
              return;
            }
          }

          const data = JSON.parse(decodedText);
          if (data.type === 'wallet_pair') {
            toast.success(`Found device: ${data.name}. Pairing...`);
            scanner.clear();
            setShowScanner(false);
            // Initiate scan with specific target
            startAutoBtPair(data.name);
          }
        } catch (e) {
          console.error("QR decode error", e);
        }
      }, (err) => {
        // console.warn(err);
      });
    }, 100);
  };

  const startAutoBtPair = async (targetName: string) => {
     setScanning(true);
     setDevices([]);
     try {
       await scanForDevices((device) => {
         if (device.name === targetName) {
           setSelectedDevice(device.name);
         }
         setDevices((prev) => {
           const exists = prev.find((d) => d.id === device.id);
           if (exists) return prev.map((d) => (d.id === device.id ? device : d));
           return [...prev, device];
         });
       }, 8000);
     } catch (err: any) {
       toast.error("Auto-pairing failed. Try manual scan.");
     } finally {
       setScanning(false);
     }
  };

  const handleSend = async () => {
    const num = parseInt(amount);
    if (!num || num <= 0) { toast.error('Enter a valid amount'); return; }
    if (num > tokenBalance) { toast.error('Insufficient tokens'); return; }

    if (method === 'bluetooth' && !selectedDevice) {
      toast.error('Select a device first');
      return;
    }

    if (method === 'nfc' && !nfcRecipientName.trim()) {
      toast.error('Enter recipient name for NFC transfer');
      return;
    }

    setIsSending(true);

    const payload = {
      amount: num,
      transactionId: uuidv4(),
      signature: uuidv4().replace(/-/g, ''),
      senderName: 'My Wallet',
      timestamp: new Date().toISOString(),
    };

    let sent = false;

    if (method === 'nfc') {
      const status = await checkNfcStatus();
      if (status.available && !status.enabled) {
        toast.info("NFC is off. Opening settings...");
        await openNfcSettings();
        setIsSending(false);
        return;
      }

      if (status.available && status.enabled) {
        let hosted = await shareViaNfc(payload as NfcTokenPayload);
        if (hosted) {
          toast.info('Hold phones together to transfer...');
          // Delay to simulate tap duration and prevent "automatic" immediate payment
          await new Promise(resolve => setTimeout(resolve, 4000));
          stopSharing();
          sent = true;
        }
      } else {
        toast.info('Simulating NFC transfer...');
        sent = await simulateNfcSend(payload as NfcTokenPayload);
      }
    } else {
      toast.info('Sending via Bluetooth...');
      sent = await simulateBluetoothSend(payload as BluetoothTokenPayload);
    }

    if (sent) {
      sendTokens(num, method === 'nfc' ? nfcRecipientName : (selectedDevice || 'BT Device'));
      setShowSuccess(true);
      setAmount('');
      setNfcRecipientName('');
      setSelectedDevice(null);
      setDevices([]);
      setTimeout(() => setShowSuccess(false), 2500);
    } else {
      toast.error('Transfer failed. Try again.');
    }

    setIsSending(false);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-5">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h1 className="text-xl font-extrabold text-foreground">Send Tokens</h1>
          <p className="text-xs text-muted-foreground mt-1">Choose your transfer method below</p>
        </motion.div>

        {/* Method Toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-xl">
          <button
            onClick={() => { setMethod('bluetooth'); setDevices([]); setSelectedDevice(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
              method === 'bluetooth' ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground'
            }`}
          >
            <Bluetooth className="w-4 h-4" />
            Bluetooth
          </button>
          <button
            onClick={() => { setMethod('nfc'); setDevices([]); setSelectedDevice(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
              method === 'nfc' ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground'
            }`}
          >
            <Nfc className="w-4 h-4" />
            NFC
          </button>
        </div>

        {/* Status Indicator */}
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
          {method === 'nfc' ? <Nfc className="w-4 h-4 shrink-0" /> : <Bluetooth className="w-4 h-4 shrink-0" />}
          <span className="text-xs font-medium">
            {method === 'nfc'
              ? (nfcStatus.available 
                  ? (nfcStatus.enabled ? 'NFC active — ready for tap-to-pay' : 'NFC disabled — will prompt to enable') 
                  : 'NFC unavailable — using simulation')
              : (btReady ? 'Bluetooth active — scan for devices' : 'Bluetooth unavailable — using simulation')}
          </span>
        </motion.div>

        {/* Token Balance */}
        <div className="gradient-card rounded-2xl p-4 text-primary-foreground">
          <p className="text-xs opacity-70">Available Tokens</p>
          <p className="text-2xl font-bold">{tokenBalance.toLocaleString()} TKN</p>
        </div>

        {/* Bluetooth: Scan + Device List */}
        {method === 'bluetooth' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="gradient-accent"
                size="lg"
                className="flex-1"
                onClick={handleScan}
                disabled={scanning}
              >
                {scanning ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
                ) : (
                  <><Radio className="w-4 h-4" /> Scan Nearby Devices</>
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-14 w-14 rounded-2xl"
                onClick={handleQRScan}
              >
                <QrCode className="w-6 h-6" />
              </Button>
            </div>

            {devices.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nearby Devices</p>
                {devices.map((d, i) => (
                  <div key={d.id} className={selectedDevice === d.name ? 'ring-2 ring-primary rounded-2xl' : ''}>
                    <NearbyDevice
                      name={d.name}
                      strength={d.strength}
                      onSelect={() => setSelectedDevice(d.name)}
                      delay={i * 0.1}
                    />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Scanner Modal */}
        <AnimatePresence>
          {showScanner && (
            <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden p-4 relative">
                <h3 className="text-black text-center font-bold mb-4">Scan Recipient's QR</h3>
                <div id="qr-reader" className="w-full"></div>
                <Button 
                  className="mt-4 w-full" 
                  variant="destructive" 
                  onClick={() => setShowScanner(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* NFC Recipient Input */}
        {method === 'nfc' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <Input
              type="text"
              placeholder="Enter Recipient's Name"
              value={nfcRecipientName}
              onChange={e => setNfcRecipientName(e.target.value)}
              className="h-14 text-lg font-medium rounded-2xl bg-card"
            />
          </motion.div>
        )}

        {/* Amount Input */}
        <div className="space-y-3">
          <Input
            type="number"
            placeholder="Enter token amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="h-14 text-xl font-bold rounded-2xl bg-card"
          />
          <div className="flex gap-2">
            {[50, 100, 500, 1000].map(p => (
              <button
                key={p}
                onClick={() => setAmount(String(p))}
                className="flex-1 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-colors active:scale-95"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Send Button */}
        <Button
          variant="gradient"
          size="xl"
          className="w-full"
          onClick={handleSend}
          disabled={isSending || !amount || (method === 'bluetooth' && !selectedDevice) || (method === 'nfc' && !nfcRecipientName.trim())}
        >
          {isSending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Transferring...</>
          ) : method === 'nfc' ? (
            <><Nfc className="w-5 h-5" /> Tap to Send</>
          ) : (
            <><Bluetooth className="w-5 h-5" /> Send via Bluetooth</>
          )}
        </Button>

        {/* NFC sending animation */}
        {isSending && method === 'nfc' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3">
            <div className="relative mx-auto w-24 h-24">
              <motion.div className="absolute inset-0 rounded-full border-2 border-primary/30" animate={{ scale: [1, 1.8], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} />
              <motion.div className="absolute inset-0 rounded-full border-2 border-primary/30" animate={{ scale: [1, 1.8], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.5 }} />
              <div className="absolute inset-0 flex items-center justify-center"><Smartphone className="w-10 h-10 text-primary" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Hold phones close together</p>
          </motion.div>
        )}

        {/* Bluetooth sending animation */}
        {isSending && method === 'bluetooth' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3">
            <div className="relative mx-auto w-24 h-24">
              <motion.div className="absolute inset-0 rounded-full border-2 border-secondary/30" animate={{ scale: [1, 1.6], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 1.2 }} />
              <div className="absolute inset-0 flex items-center justify-center"><Bluetooth className="w-10 h-10 text-secondary" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Sending to {selectedDevice}...</p>
          </motion.div>
        )}

        <AnimatePresence>
          {showSuccess && (
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
                <p className="text-lg font-bold text-foreground">Tokens Sent!</p>
                <p className="text-sm text-muted-foreground">
                  Via {method === 'nfc' ? 'NFC' : 'Bluetooth'} • will sync when online
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
