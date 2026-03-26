/**
 * p2p-bridge.ts
 * 
 * GridMukt Offline P2P Transfer Engine
 * 
 * Strategy (multi-layer fallback):
 * 1. Supabase Realtime (online) — fastest, works cross-network
 * 2. BroadcastChannel API — works between app tabs / PWA windows on same device
 * 3. localStorage polling — universal fallback, works on same device / shared storage
 * 4. BLE Advertisement payload — encodes payment into the device name (offline, cross-device)
 */

export const BRIDGE_CHANNEL = 'gridmukt_p2p_channel';
export const BRIDGE_STORAGE_KEY = 'gridmukt_pending_payload';
export const BRIDGE_ACK_KEY = 'gridmukt_payload_ack';

export interface P2PPayload {
  amount: number;
  senderName: string;
  transactionId: string;
  timestamp: string;
  signature: string;
  targetId?: string; // receiver's myId
}

let broadcastChannel: BroadcastChannel | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// ─────────────────────────────────────────────
// SENDER SIDE
// ─────────────────────────────────────────────

/**
 * Send a payment payload via all available offline channels.
 * Returns true immediately — delivery is best-effort.
 */
export function sendP2PPayload(payload: P2PPayload): void {
  const serialized = JSON.stringify(payload);

  // Channel 1: BroadcastChannel (same device / PWA tabs)
  try {
    const bc = new BroadcastChannel(BRIDGE_CHANNEL);
    bc.postMessage(payload);
    setTimeout(() => bc.close(), 3000);
    console.log('[P2P] BroadcastChannel: payload sent');
  } catch (e) {
    console.warn('[P2P] BroadcastChannel not available', e);
  }

  // Channel 2: localStorage piggyback (polling fallback)
  try {
    const entry = { payload, sentAt: Date.now() };
    localStorage.setItem(BRIDGE_STORAGE_KEY, JSON.stringify(entry));
    console.log('[P2P] localStorage: payload written');
  } catch (e) {
    console.warn('[P2P] localStorage write failed', e);
  }

  // Channel 3: Storage event (cross-tab on same origin)
  try {
    // Writes trigger 'storage' events in other tabs
    window.dispatchEvent(new StorageEvent('storage', {
      key: BRIDGE_STORAGE_KEY,
      newValue: serialized,
      storageArea: localStorage
    }));
  } catch (e) {}
}

// ─────────────────────────────────────────────
// RECEIVER SIDE
// ─────────────────────────────────────────────

/**
 * Start listening for incoming P2P payloads via all offline channels.
 * @param onReceive callback when a payment is received
 * @param myId the receiver's bridge ID (to filter targeted payloads)
 * @returns cleanup function
 */
export function startP2PListener(
  onReceive: (payload: P2PPayload) => void,
  myId: string
): () => void {
  const processedIds = new Set<string>();

  function handlePayload(payload: any) {
    if (!payload?.amount || !payload?.transactionId) return;
    // Accept if targeted to us OR broadcast to all
    if (payload.targetId && payload.targetId !== myId) return;
    if (processedIds.has(payload.transactionId)) return;
    processedIds.add(payload.transactionId);

    console.log('[P2P] Received payload:', payload);
    onReceive(payload as P2PPayload);

    // Acknowledge so sender side can confirm
    localStorage.setItem(BRIDGE_ACK_KEY, JSON.stringify({
      txId: payload.transactionId,
      receivedAt: Date.now(),
      receiverId: myId
    }));
  }

  // Channel 1: BroadcastChannel
  try {
    broadcastChannel = new BroadcastChannel(BRIDGE_CHANNEL);
    broadcastChannel.onmessage = (e) => {
      console.log('[P2P] BroadcastChannel: got message');
      handlePayload(e.data);
    };
    console.log('[P2P] BroadcastChannel: listening');
  } catch (e) {
    console.warn('[P2P] BroadcastChannel not available');
  }

  // Channel 2: localStorage polling (cross-device on same WiFi via shared Supabase storage or same device)
  const lastSeen = { id: '' };
  pollInterval = setInterval(() => {
    try {
      const raw = localStorage.getItem(BRIDGE_STORAGE_KEY);
      if (!raw) return;
      const entry = JSON.parse(raw);
      const payload = entry.payload || entry;
      if (!payload?.transactionId) return;
      if (payload.transactionId === lastSeen.id) return;
      lastSeen.id = payload.transactionId;
      // Only process if recent (within last 30 seconds)
      const age = Date.now() - (entry.sentAt || 0);
      if (age > 30000) return;
      handlePayload(payload);
    } catch (e) {}
  }, 500);

  // Channel 3: storage event (cross-tab)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== BRIDGE_STORAGE_KEY || !e.newValue) return;
    try {
      const entry = JSON.parse(e.newValue);
      handlePayload(entry.payload || entry);
    } catch {}
  };
  window.addEventListener('storage', onStorage);

  console.log(`[P2P] All listeners active for receiver: ${myId}`);

  // Return cleanup
  return () => {
    if (broadcastChannel) {
      broadcastChannel.close();
      broadcastChannel = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    window.removeEventListener('storage', onStorage);
    console.log('[P2P] All listeners stopped');
  };
}

/**
 * Encode a compact payload into a BLE advertisement name suffix.
 * Format: GridMukt_<receiverId>_<amount>_<shortTxId>
 * This is readable by scanner and allows the receiver to self-detect.
 */
export function encodeBLEName(receiverId: string, amount: number, txId: string): string {
  const shortTx = txId.replace(/-/g, '').substring(0, 6).toUpperCase();
  return `GridMukt_${receiverId}_${Math.round(amount)}_${shortTx}`;
}

/**
 * Try to parse a payment from a BLE device name.
 * Returns null if not a payment advertisement.
 */
export function decodeBLEName(bleName: string): { receiverId: string; amount: number; txId: string } | null {
  // Format: GridMukt_<receiverId>_<amount>_<shortTxId>
  const parts = bleName.split('_');
  // GridMukt _ <id> _ <amount> _ <txId>
  if (parts.length < 4 || parts[0] !== 'GridMukt') return null;
  const amount = parseInt(parts[2]);
  if (isNaN(amount) || amount <= 0) return null;
  return {
    receiverId: parts[1],
    amount,
    txId: parts[3]
  };
}
