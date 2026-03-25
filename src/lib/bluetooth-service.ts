import { BleClient } from '@capacitor-community/bluetooth-le';

export interface BluetoothTokenPayload {
  amount: number;
  transactionId: string;
  signature: string;
  senderName: string;
  timestamp: string;
}

export interface NearbyDevice {
  name: string;
  id: string;
  strength: number;
}

/**
 * Check if the current platform (especially web/laptop) supports Bluetooth.
 */
function isBluetoothSupported(): boolean {
  if (typeof window === 'undefined') return false;
  // Check for Web Bluetooth API or Capacitor platform
  return !!((navigator as any).bluetooth || (window as any).Capacitor?.isNativePlatform());
}

/**
 * Initialize and check if Bluetooth is available and enabled.
 */
export async function isBluetoothAvailable(): Promise<boolean> {
  try {
    if (!isBluetoothSupported()) {
      console.warn("Bluetooth is not supported in this browser/platform.");
      return false;
    }

    await BleClient.initialize({ androidNeverForLocation: false });
    
    // On some browsers, isEnabled() might be pending or require permission
    const enabled = await BleClient.isEnabled();
    return enabled;
  } catch (error) {
    console.error("BLE check failed:", error);
    // If it's a laptop browser, it might throw if permissions aren't set yet, 
    // but the API could still be available.
    return !!(navigator as any).bluetooth;
  }
}

/**
 * Request to enable Bluetooth (Android only) or show prompt.
 */
export async function ensureBluetoothEnabled(): Promise<boolean> {
  try {
    await BleClient.initialize({ androidNeverForLocation: false });
    const enabled = await BleClient.isEnabled();
    if (!enabled) {
      // On Android this will prompt to enable. On iOS it might just throw or do nothing depending on system.
      await BleClient.requestEnable();
    }
    return true;
  } catch (error) {
    console.error("Failed to enable Bluetooth:", error);
    return false;
  }
}

/**
 * Scan for nearby Bluetooth devices using Capacitor BLE API.
 */
export async function scanForDevices(onDeviceFound: (device: NearbyDevice) => void, timeoutMs = 5000): Promise<void> {
  try {
    await BleClient.initialize({ androidNeverForLocation: false });
    
    // Request permissions before scanning (crucial for Android 12+)
    try {
      // Some platforms might not support this call or it might be internal to requestLEScan
      // but explicit check is safer.
    } catch (e) {}

    const enabled = await BleClient.isEnabled();
    if (!enabled) {
      throw new Error("Bluetooth is disabled. Please turn it ON.");
    }

    console.log("BLE initialized, starting scan");
    
    // If on Web and requestLEScan is not supported or fails, try requestDevice fallback
    const isWeb = !((window as any).Capacitor?.isNativePlatform());
    
    try {
      await BleClient.requestLEScan(
        {}, 
        (result) => {
          const deviceName = result.localName || result.device?.name || "";
          
          if (deviceName && deviceName.trim().length > 1) {
            const rssi = result.rssi || -100;
            const strength = Math.min(100, Math.max(0, (rssi + 95) * (100 / 65)));

            onDeviceFound({
              name: deviceName,
              id: result.device.deviceId,
              strength: Math.round(strength),
            });
          }
        }
      );

      // Wait for the requested timeout duration
      await new Promise(resolve => setTimeout(resolve, timeoutMs));

      // Stop scanning
      await BleClient.stopLEScan();
    } catch (scanErr) {
      if (isWeb) {
        console.log("LE Scan not supported or failed on Web, trying requestDevice browser picker...");
        // Fallback for Web: Open the browser's native device picker
        const device = await BleClient.requestDevice();
        if (device) {
          onDeviceFound({
            name: device.name || "Web Bluetooth Device",
            id: device.deviceId,
            strength: 100,
          });
        }
      } else {
        throw scanErr;
      }
    }
    
    console.log("BLE scan session finished");
  } catch (err: any) {
    console.error('Bluetooth scan failed:', err);
    throw err;
  }
}

/**
 * Send tokens over Bluetooth 
 * (For now simulates transmission, as true P2P BLE roles require GATT server)
 */
export async function simulateBluetoothSend(
  payload: BluetoothTokenPayload,
  deviceId?: string,
  delayMs = 2500
): Promise<boolean> {
  return new Promise(resolve => {
    setTimeout(() => resolve(true), delayMs);
  });
}

/**
 * Simulate receiving tokens via Bluetooth
 */
export function simulateBluetoothReceive(
  onReceive: (payload: BluetoothTokenPayload) => void,
  delayMs = 3500
): () => void {
  const timeout = setTimeout(() => {
    onReceive({
      amount: 250,
      transactionId: crypto.randomUUID(),
      signature: crypto.randomUUID().replace(/-/g, ''),
      senderName: "Nearby Device",
      timestamp: new Date().toISOString(),
    });
  }, delayMs);
  return () => clearTimeout(timeout);
}

