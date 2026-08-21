import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function DevicePairingScreen({ 
  navigation, 
  route, 
  userId: propUserId, 
  onSelectDevice,
  syncState,
  setSyncState,
  deviceIp,
  setDeviceIp 
}) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeUserId, setActiveUserId] = useState(
    propUserId || route?.params?.userId || null
  );

  const isValidUserId = (id) => {
    return id !== null && id !== undefined && String(id).trim() !== '' && String(id) !== 'undefined' && String(id) !== 'null';
  };

  useEffect(() => {
    const loadUserId = async () => {
      if (!isValidUserId(activeUserId)) {
        const storedId = await AsyncStorage.getItem('user_id');
        if (isValidUserId(storedId)) {
          setActiveUserId(storedId);
        }
      }
    };
    loadUserId();
    handleScanDevices();
  }, []);

  const handleScanDevices = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_devices')
        .select('*');

      if (error) throw error;

      setDevices(data || []);
    } catch (err) {
      console.error('Scan error:', err);
      Alert.alert(
        'Unable to Search Devices',
        'We couldn\'t find any available devices right now. Please make sure your device is powered on and connected to Wi-Fi.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConnectDevice = async (device) => {
    try {
      let rawUserId = activeUserId;

      if (!isValidUserId(rawUserId)) {
        rawUserId = await AsyncStorage.getItem('user_id');
      }

      if (!isValidUserId(rawUserId)) {
        Alert.alert(
          'Please Sign In Again',
          'Your session has ended. Please log out and log back into your account to connect your device.'
        );
        return;
      }

      const targetUserId = String(rawUserId).trim();

      let query = supabase
        .from('user_devices')
        .update({ 
          user_id: targetUserId, 
          is_on: false,
          last_seen: new Date().toISOString()
        });

      if (device.id) {
        query = query.eq('id', device.id);
      } else if (device.mac_address) {
        query = query.eq('mac_address', device.mac_address.trim());
      }

      const { error } = await query.select();

      if (error) {
        Alert.alert(
          'Connection Failed',
          'We couldn\'t pair with this device. Please make sure your Wi-Fi is working and try again.'
        );
        return;
      }

      if (typeof setSyncState === 'function') setSyncState('SUCCESS');
      if (typeof setDeviceIp === 'function' && device.ip_address) setDeviceIp(device.ip_address);
      if (onSelectDevice) onSelectDevice(device);

      handleScanDevices();

      Alert.alert(
        'Device Connected!', 
        `Successfully paired with ${device.device_name || 'SonoBand Device'}. Your band is currently switched OFF.`
      );
      
      if (navigation?.navigate) {
        navigation.navigate('Dashboard');
      } else if (navigation?.goBack) {
        navigation.goBack();
      }
    } catch (err) {
      console.error('Connection Exception:', err);
      Alert.alert(
        'Connection Error',
        'Something unexpected happened while connecting. Please try again.'
      );
    }
  };

  const handleDisconnectDevice = (device) => {
    Alert.alert(
      'Disconnect Device',
      `Do you want to disconnect from ${device.device_name || 'this device'}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => confirmDisconnect(device),
        },
      ],
      { cancelable: true }
    );
  };

  const confirmDisconnect = async (device) => {
    try {
      let query = supabase
        .from('user_devices')
        .update({ 
          user_id: null, 
          is_on: false 
        });

      if (device.id) {
        query = query.eq('id', device.id);
      } else if (device.mac_address) {
        query = query.eq('mac_address', device.mac_address.trim());
      }

      await query;

      if (typeof setSyncState === 'function') setSyncState(null);
      if (typeof setDeviceIp === 'function') setDeviceIp(null);
      if (onSelectDevice) onSelectDevice(null);

      handleScanDevices();

      Alert.alert(
        'Disconnected',
        'You have successfully disconnected from your device.'
      );
    } catch (err) {
      console.error('Disconnect error:', err);
      Alert.alert(
        'Disconnect Failed',
        'We couldn\'t disconnect your device right now. Please try again.'
      );
    }
  };

  const isOnline = (lastSeen) => {
    if (!lastSeen) return false;
    const lastSeenMs = new Date(lastSeen).getTime();
    const nowMs = new Date().getTime();
    const diffInSeconds = Math.abs(nowMs - lastSeenMs) / 1000;
    return diffInSeconds < 300;
  };

  const renderDeviceItem = ({ item }) => {
    const online = isOnline(item.last_seen);
    
    const isUserConnected = (syncState === 'SUCCESS') && (
      (isValidUserId(activeUserId) && String(item.user_id) === String(activeUserId)) ||
      (deviceIp && item.ip_address === deviceIp)
    );

    return (
      <TouchableOpacity
        style={[styles.deviceCard, isUserConnected && styles.connectedCard]}
        onPress={() => {
          if (isUserConnected) {
            handleDisconnectDevice(item);
          } else {
            handleConnectDevice(item);
          }
        }}
        onLongPress={() => {
          if (isUserConnected) {
            handleDisconnectDevice(item);
          }
        }}
        delayLongPress={500}
      >
        <Ionicons name="hardware-chip-outline" size={32} color={isUserConnected ? "#38BDF8" : "#94A3B8"} />
        
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>
            {item.device_name || 'SonoBand Device'}
          </Text>
          <Text style={styles.deviceMeta}>MAC: {item.mac_address || 'Unavailable'}</Text>
          <Text style={styles.deviceMeta}>IP: {item.ip_address || 'Searching...'}</Text>
          {isUserConnected && (
            <Text style={styles.longPressHint}>Tap or hold to disconnect</Text>
          )}
        </View>

        <View style={styles.badgeContainer}>
          {isUserConnected ? (
            <View style={[styles.statusBadge, { backgroundColor: '#0284C7' }]}>
              <Text style={styles.statusText}>CONNECTED</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: online ? '#22C55E' : '#64748B' }]}>
              <Text style={styles.statusText}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation && navigation.goBack()}>
        <Ionicons name="arrow-back" size={22} color="#38BDF8" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Paired Devices</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item, index) => item?.id ? String(item.id) : item?.mac_address || String(index)}
          renderItem={renderDeviceItem}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No devices found. Make sure your device is plugged in and tap "Refresh Devices".
            </Text>
          }
        />
      )}

      <TouchableOpacity 
        style={[styles.scanBtn, loading && styles.disabledBtn]} 
        onPress={handleScanDevices}
        disabled={loading}
      >
        <Ionicons name="refresh-outline" size={20} color="#0F172A" />
        <Text style={styles.scanBtnText}>
          {loading ? 'Searching...' : 'Refresh Devices'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', padding: 20, paddingTop: 50 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  backText: { color: '#38BDF8', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 20 },
  deviceCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1E293B', 
    padding: 16, 
    borderRadius: 12, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: '#334155' 
  },
  connectedCard: {
    borderColor: '#38BDF8',
    backgroundColor: '#0F2942'
  },
  deviceInfo: { marginLeft: 12, flex: 1 },
  deviceName: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC' },
  deviceMeta: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  longPressHint: { fontSize: 10, color: '#38BDF8', marginTop: 4, fontStyle: 'italic' },
  badgeContainer: { alignItems: 'flex-end' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  emptyText: { color: '#94A3B8', textAlign: 'center', marginTop: 30, paddingHorizontal: 10 },
  scanBtn: { flexDirection: 'row', backgroundColor: '#38BDF8', padding: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  disabledBtn: { opacity: 0.5 },
  scanBtnText: { color: '#0F172A', fontWeight: 'bold', marginLeft: 8 }
});