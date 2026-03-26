/**
 * p2p-bridge.ts — GridMukt Offline P2P Transfer Engine
 *
 * Delivery layers (in priority order):
 * 1. BLE Advertisement payload — works between 2 physical phones in airplane mode (Bluetooth ON)
 * 2. Supabase Realtime        — works when online
 * 3. BroadcastChannel         — works between tabs on the same device
 * 4. localStorage polling     — same-device fallback
 */

export const BRIDGE_CHANNEL = 'gridmukt_p2p_channel';
export const BRIDGE_STORAGE_KEY = 'gridmukt_pending_payload';
export const BLE_AD_PREFIX = 'GM_'; // short prefix to fit BLE name limit (~26 bytes)

export interface P2PPayload {
  amount: number;
  senderName: string;
  transactionId: string;
  timestamp: string;
  signature: string;
  targetId?: string;
}

// ─────────────────────────────────────────────────────────────
// BLE NAME ENCODING  (Sender → Advertises → Receiver Decodes)
// Format: GM_<RECEIVERID8>_<AMOUNT>_<TX6>
// Example: GM_ABCD1234_100_F3A2B1   (22 chars — fits BLE limit)
// ─────────────────────────────────────────────────────────────

export function encodeBLEPayment(receiverId: string, amount: number, txId: string): string {
  const shortTx = txId.replace(/-/g, '').substring(0, 6).toUpperCase();
  const shortId = receiverId.substring(0, 8).toUpperCase();
  return `${BLE_AD_PREFIX}${shortId}_${Math.round(amount)}_${shortTx}`;
}

/**
 * Parse a BLE advertisement name and return decoded payment if it
 * was addressed to `myId`, otherwise null.
 */
export function decodeBLEPayment(
  bleName: string,
  myId: string,
  senderName: string = 'Nearby Phone'
): P2PPayload | null {
  if (!bleName || !bleName.startsWith(BLE_AD_PREFIX)) return null;
  const body = bleName.substring(BLE_AD_PREFIX.length); // RECEIVERID8_AMOUNT_TX6
  const parts = body.split('_');
  if (parts.length < 3) return null;

  const encodedId = parts[0].toUpperCase();
  const myIdShort = myId.substring(0, 8).toUpperCase();
  if (encodedId !== myIdShort) return null; // not for me

  const amount = parseInt(parts[1], 10);
  const shortTx = parts[2];
  if (isNaN(amount) || amount <= 0) return null;

  return {
    amount,
    senderName,
    transactionId: shortTx + '_ble_' + Date.now(),
    timestamp: Date.now().toString(),
    signature: 'gridmukt_ble_sig',
    targetId: myId,
  };
}

// ─────────────────────────────────────
// SAME-DEVICE CHANNELS (BroadcastChannel + localStorage)
// ─────────────────────────────────────

export function sendP2PPayload(payload: P2PPayload): void {
  // BroadcastChannel (cross-tab, same device)
  try {
    const bc = new BroadcastChannel(BRIDGE_CHANNEL);
    bc.postMessage(payload);
    setTimeout(() => bc.close(), 3000);
  } catch (e) {}

  // localStorage (polling fallback)
  try {
    localStorage.setItem(BRIDGE_STORAGE_KEY, JSON.stringify({ payload, sentAt: Date.now() }));
  } catch (e) {}
}

export function startP2PListener(
  onReceive: (payload: P2PPayload) => void,
  myId: string
): () => void {
  const seen = new Set<string>();

  function handle(payload: any) {
    if (!payload?.amount || !payload?.transactionId) return;
    if (payload.targetId && payload.targetId !== myId) return;
    if (seen.has(payload.transactionId)) return;
    seen.add(payload.transactionId);
    onReceive(payload as P2PPayload);
  }

  // BroadcastChannel
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(BRIDGE_CHANNEL);
    bc.onmessage = (e) => handle(e.data);
  } catch (e) {}

  // localStorage polling
  const lastId = { v: '' };
  const poll = setInterval(() => {
    try {
      const raw = localStorage.getItem(BRIDGE_STORAGE_KEY);
      if (!raw) return;
      const entry = JSON.parse(raw);
      const p = entry.payload || entry;
      if (!p?.transactionId || p.transactionId === lastId.v) return;
      if (Date.now() - (entry.sentAt || 0) > 30000) return;
      lastId.v = p.transactionId;
      handle(p);
    } catch {}
  }, 500);

  // StorageEvent (zero-latency cross-tab)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== BRIDGE_STORAGE_KEY || !e.newValue) return;
    try { handle(JSON.parse(e.newValue)?.payload); } catch {}
  };
  window.addEventListener('storage', onStorage);

  return () => {
    bc?.close();
    clearInterval(poll);
    window.removeEventListener('storage', onStorage);
  };
}
