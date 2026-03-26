/**
 * NFC Service — wraps @capgo/capacitor-nfc for token transfers.
 * Works on native Capacitor builds (Android/iOS). Falls back to simulation in browser.
 */

import type { Transaction } from './token-store';

// We dynamically import so the web build doesn't break when Capacitor isn't present
let CapacitorNfc: any = null;

async function loadNfc() {
  if (CapacitorNfc) return CapacitorNfc;
  try {
    const mod = await import('@capgo/capacitor-nfc');
    CapacitorNfc = mod.CapacitorNfc;
    return CapacitorNfc;
  } catch {
    return null;
  }
}

export interface NfcTokenPayload {
  amount: number;
  transactionId: string;
  signature: string;
  senderName: string;
  timestamp: string;
}

function isNativeAvailable(): boolean {
  try {
    return typeof (window as any).Capacitor !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Check if NFC is available and enabled on this device.
 */
export async function checkNfcStatus(): Promise<{ available: boolean; enabled: boolean }> {
  if (!isNativeAvailable()) return { available: false, enabled: false };
  try {
    const nfc = await loadNfc();
    if (!nfc) return { available: false, enabled: false };
    
    // Some plugins might throw if hardware is missing
    const status = await nfc.isEnabled();
    return { 
      available: true, 
      enabled: status.isEnabled === true 
    };
  } catch (error) {
    console.error("NFC status check failed:", error);
    return { available: false, enabled: false };
  }
}

/**
 * Open NFC settings if disabled (Android).
 */
export async function openNfcSettings(): Promise<void> {
  if (!isNativeAvailable()) return;
  try {
    const nfc = await loadNfc();
    if (nfc && nfc.openSettings) {
      await nfc.openSettings();
    }
  } catch (err) {
    console.error('Failed to open NFC settings:', err);
  }
}

/**
 * Check if NFC is available on this device
 */
export async function isNfcAvailable(): Promise<boolean> {
  const status = await checkNfcStatus();
  return status.available && status.enabled;
}

/**
 * Share token data via NFC (Uses MIME type for structured JSON).
 */
export async function shareViaNfc(payload: NfcTokenPayload): Promise<boolean> {
  if (!isNativeAvailable()) return false;
  try {
    const nfc = await loadNfc();
    if (!nfc) return false;

    // Use a custom MIME type to avoid NDEF text prefix issues
    const message = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const bytes = Array.from(encoder.encode(message));

    await nfc.share({
      message: {
        records: [
          {
            type: 'application/json',
            payload: bytes,
          },
        ],
      },
    });
    return true;
  } catch (err) {
    console.error('NFC share failed:', err);
    return false;
  }
}

/**
 * Stop sharing NFC data
 */
export async function stopSharing(): Promise<void> {
  if (!isNativeAvailable()) return;
  try {
    const nfc = await loadNfc();
    if (nfc) await nfc.unshare();
  } catch {
    // ignore
  }
}

/**
 * Start listening for incoming NFC tags/messages.
 */
export async function startListening(
  onReceive: (payload: NfcTokenPayload) => void
): Promise<(() => void) | null> {
  if (!isNativeAvailable()) return null;
  try {
    const nfc = await loadNfc();
    if (!nfc) return null;

    const handle = await nfc.addListener('ndefTag', (event: any) => {
      try {
        console.log('NFC Tag Detected:', event);
        const records = event?.tag?.message?.records || [];
        
        for (const record of records) {
          if (record?.payload) {
            const decoder = new TextDecoder();
            const payloadData = new Uint8Array(record.payload);
            
            // If it's a Text record (TNF 1, Type 'T'), it has a prefix
            // Byte 0 is status, then lang code.
            // We try to parse as JSON directly, if fail, we try as string
            let text = "";
            try {
              text = decoder.decode(payloadData);
              // Simple check if it looks like JSON
              if (text.includes('{') && text.includes('}')) {
                const jsonStart = text.indexOf('{');
                const jsonEnd = text.lastIndexOf('}') + 1;
                const jsonStr = text.substring(jsonStart, jsonEnd);
                const payload: NfcTokenPayload = JSON.parse(jsonStr);
                onReceive(payload);
                return; // Success
              }
            } catch (e) {
              // Try stripping potential NDEF prefix if JSON parse failed
              // NDEF Text records: [Status Byte][Lang Code...][Text...]
              // Usually first byte is 0x02 for 'en'
              const stripped = payloadData.slice(3); // skip status + 'en' (rough heuristic)
              text = decoder.decode(stripped);
              if (text.includes('{')) {
                const payload: NfcTokenPayload = JSON.parse(text);
                onReceive(payload);
                return;
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse NFC payload:', err);
      }
    });

    await nfc.startScanSession({ techTypes: ['ndef'] });

    return () => {
      handle.remove();
      nfc.stopScanSession().catch(() => {});
    };
  } catch (err) {
    console.error('NFC listen failed:', err);
    throw err;
  }
}

/**
 * Simulate NFC for web/preview builds
 */
export function simulateNfcReceive(
  onReceive: (payload: NfcTokenPayload) => void,
  delayMs = 3000
): () => void {
  const timeout = setTimeout(() => {
    onReceive({
      amount: 250,
      transactionId: crypto.randomUUID(),
      signature: crypto.randomUUID().replace(/-/g, ''),
      senderName: "Rahul's Phone",
      timestamp: new Date().toISOString(),
    });
  }, delayMs);
  return () => clearTimeout(timeout);
}

/**
 * Simulate NFC send for web/preview builds
 */
export function simulateNfcSend(
  payload: NfcTokenPayload,
  delayMs = 2000
): Promise<boolean> {
  return new Promise(resolve => {
    setTimeout(() => resolve(true), delayMs);
  });
}
