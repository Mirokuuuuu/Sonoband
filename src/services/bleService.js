// src/services/bleService.js

import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { supabase } from './supabaseClient';

const SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const CHARACTERISTIC_RX = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; 
const CHARACTERISTIC_TX = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; 

class BLEService {
  constructor() {
    this.manager = null;
    this.connectedDevice = null;
    this.scanTimeout = null;
    this.activeUserId = 1; // Default fallback ID
  }

  getManager() {
    if (!this.manager) {
      try {
        this.manager = new BleManager();
      } catch (e) {
        console.warn('BLE Native module not available. Use Development Build.');
      }
    }
    return this.manager;
  }

  // Pass dynamic currentUserId when connecting
  scanAndConnect(onConnected, onError, currentUserId = 1) {
    this.activeUserId = currentUserId;
    const manager = this.getManager();
    if (!manager) {
      if (onError) onError(new Error('Bluetooth native code not compiled.'));
      return;
    }

    let deviceFound = false;

    this.scanTimeout = setTimeout(() => {
      if (!deviceFound) {
        manager.stopDeviceScan();
        if (onError) onError(new Error('Device scan timed out.'));
      }
    }, 12000);

    manager.startDeviceScan(null, null, async (error, device) => {
      if (error) {
        if (this.scanTimeout) clearTimeout(this.scanTimeout);
        if (onError) onError(error);
        return;
      }

      if (device) {
        const devName = (device.name || device.localName || '').toUpperCase();
        
        if (devName.includes('SONOBAND')) {
          deviceFound = true;
          if (this.scanTimeout) clearTimeout(this.scanTimeout);
          manager.stopDeviceScan();

          try {
            console.log('🔗 Connecting to:', device.name || device.id);
            const connected = await device.connect();
            await connected.discoverAllServicesAndCharacteristics();
            this.connectedDevice = connected;

            this.startAlertListener();
            if (onConnected) onConnected(connected);
          } catch (err) {
            console.error('Connection error:', err);
            if (onError) onError(err);
          }
        }
      }
    });
  }

  startAlertListener() {
    if (!this.connectedDevice) return;

    this.connectedDevice.monitorCharacteristicForService(
      SERVICE_UUID,
      CHARACTERISTIC_TX,
      async (error, characteristic) => {
        if (error || !characteristic?.value) return;

        // Parse packet: "ALERT|userId|soundType|direction"
        const rawData = Buffer.from(characteristic.value, 'base64').toString('ascii');
        console.log('📥 Received from ESP32:', rawData);

        if (rawData.startsWith('ALERT|')) {
          const parts = rawData.split('|');
          const parsedId = parseInt(parts[1]);
          // Use parsed ID, or fallback to actively logged-in user
          const targetUserId = !isNaN(parsedId) && parsedId > 0 ? parsedId : this.activeUserId;
          const soundType = parts[2] || 'Loud Sound';
          const direction = parts[3] || 'center';

          const { error: dbError } = await supabase.from('alerts').insert([{
            user_id: targetUserId,
            sound_type: soundType,
            metadata: direction,
            status: 'unread',
            location: 'indoor'
          }]);

          if (dbError) {
            console.error('❌ Supabase Upload Error:', dbError);
          } else {
            console.log('✅ Alert saved to Supabase!');
          }
        }
      }
    );
  }

  async sendCommand(command) {
    if (!this.connectedDevice) {
      console.warn('Cannot send command: No BLE device connected.');
      return false;
    }

    try {
      const base64Command = Buffer.from(command).toString('base64');
      await this.connectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        CHARACTERISTIC_RX,
        base64Command
      );
      console.log(`📤 Sent BLE command: ${command}`);
      return true;
    } catch (err) {
      console.error('Failed to send BLE command:', err);
      return false;
    }
  }
}

export default new BLEService();