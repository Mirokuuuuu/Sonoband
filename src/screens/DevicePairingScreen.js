import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase, logSystemActivity } from '../services/supabaseClient';

export default function DevicePairingScreen({
  navigation,
  onNavigate,
  syncState,
  setSyncState,
  deviceIp,
  setDeviceIp,
  userId,
  onSelectDevice,
  onDisconnectDevice,
}) {
  const [pairedDevices, setPairedDevices] = useState([]);
  const [isRegisterModalVisible, setIsRegisterModalVisible] = useState(false);

  // Registration Form States
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [macAddressInput, setMacAddressInput] = useState('');
  const [ipAddressInput, setIpAddressInput] = useState(deviceIp || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValidUserId = (id) => id !== null && id !== undefined && String(id).trim().length > 0;

  // Helper function to insert notifications into public.notifications
  const createNotification = async (type, title, message, metadata) => {
    if (!isValidUserId(userId)) return;
    try {
      await supabase.from('notifications').insert([
        {
          user_id: parseInt(userId, 10),
          notification_type: type,
          title: title,
          message: message,
          metadata: metadata,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Failed to log notification:', err);
    }
  };

  const fetchPairedDevices = useCallback(async () => {
    if (!isValidUserId(userId)) return;

    try {
      const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      setPairedDevices(data || []);
    } catch (err) {
      console.error('Fetch Paired Devices Error:', err.message);
    }
  }, [userId]);

  useEffect(() => {
    fetchPairedDevices();
  }, [fetchPairedDevices]);

  // Send connect/disconnect commands aligned with ESP32 WebServer
  const sendHardwareCommand = async (ip, action) => {
    if (!ip) {
      console.warn('Cannot send hardware command: IP address missing.');
      return false;
    }

    const isStart = action === 'start';
    const endpoint = `http://${ip}:5000/${isStart ? 'connect' : 'disconnect'}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          is_on: isStart,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn(`Hardware command [${action}] failed for IP ${ip}:`, e.message);
      return false;
    }
  };

  const handleConnectSavedDevice = async (device) => {
    try {
      if (typeof setSyncState === 'function') setSyncState('SYNCING');
      const resolvedIp = device.ip_address || deviceIp;

      if (!resolvedIp) {
        throw new Error('No valid IP address associated with this device.');
      }

      if (typeof setDeviceIp === 'function') setDeviceIp(resolvedIp);

      await sendHardwareCommand(resolvedIp, 'start');

      await supabase
        .from('user_devices')
        .update({ is_on: true, last_seen: new Date().toISOString() })
        .eq('id', device.id);

      // Log notification entry for successful pairing/connection
      await createNotification(
        'connection_event',
        'Device Connected',
        `Connected to ${device.device_name || 'SonoBand'}`,
        'connected'
      );

      if (typeof onSelectDevice === 'function') {
        onSelectDevice(device);
      } else if (typeof setSyncState === 'function') {
        setSyncState('SUCCESS');
      }

      Alert.alert('Connected', `Connected to ${device.device_name}.`);
      fetchPairedDevices();
    } catch (err) {
      if (typeof setSyncState === 'function') setSyncState('FAILED');
      Alert.alert('Connection Failed', err.message);
    }
  };

  const handleDisconnectDevice = async (device) => {
    Alert.alert('Disconnect Device', `Disconnect from ${device.device_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            const resolvedIp = device.ip_address || deviceIp;

            if (resolvedIp) {
              await sendHardwareCommand(resolvedIp, 'stop');
            }

            const { error } = await supabase
              .from('user_devices')
              .update({ is_on: false, last_seen: new Date().toISOString() })
              .eq('id', device.id);

            if (error) throw error;

            if (typeof setDeviceIp === 'function') setDeviceIp('');
            if (typeof setSyncState === 'function') setSyncState('IDLE');

            if (typeof onDisconnectDevice === 'function') {
              onDisconnectDevice();
            }

            await logSystemActivity(userId, 'DISCONNECT_DEVICE', `Disconnected device ID: ${device.id}`);
            
            // Log notification entry for disconnection
            await createNotification(
              'connection_event',
              'Device Disconnected',
              `Disconnected from ${device.device_name || 'SonoBand'}`,
              'disconnected'
            );

            Alert.alert('Disconnected', 'Device disconnected successfully.');
            fetchPairedDevices();
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleForgetDevice = async (deviceId) => {
    Alert.alert('Forget Device', 'Permanently remove device from saved list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: async () => {
          try {
            const targetDevice = pairedDevices.find((d) => d.id === deviceId);
            const resolvedIp = targetDevice?.ip_address || deviceIp;

            if (resolvedIp) {
              await sendHardwareCommand(resolvedIp, 'stop');
            }

            const { error } = await supabase.from('user_devices').delete().eq('id', deviceId);
            if (error) throw error;

            if (typeof setDeviceIp === 'function') setDeviceIp('');
            if (typeof setSyncState === 'function') setSyncState('IDLE');

            if (typeof onDisconnectDevice === 'function') {
              onDisconnectDevice();
            }

            await logSystemActivity(userId, 'FORGET_DEVICE', `Removed device ID: ${deviceId}`);
            Alert.alert('Device Removed', 'Device deleted successfully.');
            fetchPairedDevices();
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleManualRegister = async () => {
    if (!isValidUserId(userId)) {
      Alert.alert('Authentication Error', 'Invalid user session.');
      return;
    }

    if (!deviceNameInput.trim()) {
      Alert.alert('Input Error', 'Please enter a device name.');
      return;
    }

    const resolvedIp = ipAddressInput.trim() || deviceIp;
    if (!resolvedIp) {
      Alert.alert('Input Error', 'Please enter a valid target IP Address.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (typeof setSyncState === 'function') setSyncState('SYNCING');
      const uniqueMac = macAddressInput.trim() || `MANUAL_${Date.now()}`;

      await sendHardwareCommand(resolvedIp, 'start');

      const { data, error } = await supabase
        .from('user_devices')
        .insert([
          {
            user_id: userId,
            device_name: deviceNameInput.trim(),
            mac_address: uniqueMac,
            ip_address: resolvedIp,
            is_on: true,
            last_seen: new Date().toISOString(),
          },
        ])
        .select();

      if (error) throw error;

      const registeredDevice =
        data && data.length > 0
          ? data[0]
          : {
              device_name: deviceNameInput.trim(),
              ip_address: resolvedIp,
              mac_address: uniqueMac,
            };

      if (typeof setDeviceIp === 'function') setDeviceIp(resolvedIp);

      // Log notification entry upon initial registration & pairing
      await createNotification(
        'connection_event',
        'Device Registered',
        `Registered and connected to ${deviceNameInput.trim()}`,
        'connected'
      );

      if (typeof onSelectDevice === 'function') {
        onSelectDevice(registeredDevice);
      } else if (typeof setSyncState === 'function') {
        setSyncState('SUCCESS');
      }

      Alert.alert('Success', 'Device registered and connected!');
      setIsRegisterModalVisible(false);
      setDeviceNameInput('');
      setMacAddressInput('');
      fetchPairedDevices();
    } catch (err) {
      if (typeof setSyncState === 'function') setSyncState('FAILED');
      console.error('Registration Failure:', err);
      Alert.alert('Registration Failed', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (navigation) {
              navigation.goBack();
            } else if (typeof onNavigate === 'function') {
              onNavigate('dashboard');
            }
          }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Pairing</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {/* Connection Status Card */}
        <View style={styles.statusCard}>
          <MaterialCommunityIcons
            name={syncState === 'SUCCESS' ? 'link' : 'link-off'}
            size={32}
            color={syncState === 'SUCCESS' ? '#4ADE80' : '#94A3B8'}
          />
          <View style={styles.statusTextContainer}>
            <Text style={styles.statusTitle}>
              {syncState === 'SUCCESS' ? 'Device Connected' : 'No Active Connection'}
            </Text>
            <Text style={styles.statusSubtitle}>
              {`Active IP: ${deviceIp ? deviceIp : 'Not configured'}`}
            </Text>
          </View>
        </View>

        {/* Primary Action Button: Add Device */}
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={styles.addDeviceButton}
            onPress={() => setIsRegisterModalVisible(true)}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#0F172A" />
            <Text style={styles.addDeviceButtonText}>Add Device</Text>
          </TouchableOpacity>
        </View>

        {/* Saved Devices List */}
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>Saved Devices</Text>
          <FlatList
            data={pairedDevices}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.flatListContent}
            renderItem={({ item }) => (
              <View style={styles.deviceCard}>
                <TouchableOpacity
                  style={styles.deviceTouchArea}
                  onPress={() => handleConnectSavedDevice(item)}
                >
                  <MaterialCommunityIcons
                    name={item.is_on ? 'shield-check' : 'shield-outline'}
                    size={24}
                    color={item.is_on ? '#4ADE80' : '#64748B'}
                  />
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{item.device_name}</Text>
                    <Text style={styles.deviceSubText}>
                      {`IP: ${item.ip_address ? item.ip_address : 'Unconfigured'}`}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.actionIconButtonRow}>
                  <TouchableOpacity
                    style={styles.actionIconButton}
                    onPress={() => handleDisconnectDevice(item)}
                  >
                    <MaterialCommunityIcons name="link-off" size={20} color="#F59E0B" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionIconButton}
                    onPress={() => handleForgetDevice(item.id)}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No saved devices found for this account.</Text>
            }
          />
        </View>
      </View>

      {/* Device Registration Modal */}
      <Modal visible={isRegisterModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Register New Device</Text>
            <TextInput
              style={styles.input}
              placeholder="Device Name (e.g. SonoBand-ESP32)"
              placeholderTextColor="#64748B"
              value={deviceNameInput}
              onChangeText={setDeviceNameInput}
            />
            <TextInput
              style={styles.input}
              placeholder="MAC Address (Optional)"
              placeholderTextColor="#64748B"
              value={macAddressInput}
              onChangeText={setMacAddressInput}
            />
            <TextInput
              style={styles.input}
              placeholder="IP Address (e.g. 192.168.1.50)"
              placeholderTextColor="#64748B"
              value={ipAddressInput}
              onChangeText={setIpAddressInput}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsRegisterModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleManualRegister}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#0F172A" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save & Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  headerSpacer: { width: 24 },
  content: { flex: 1, padding: 16 },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusTextContainer: { marginLeft: 12 },
  statusTitle: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  statusSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  actionSection: { marginBottom: 16 },
  addDeviceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  addDeviceButtonText: { color: '#0F172A', fontWeight: '700', fontSize: 14 },
  listContainer: { flex: 1 },
  flatListContent: { paddingBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#94A3B8', marginBottom: 8 },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  deviceTouchArea: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  deviceInfo: { flex: 1, marginLeft: 12 },
  deviceName: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  deviceSubText: { fontSize: 12, color: '#64748B' },
  actionIconButtonRow: { flexDirection: 'row', alignItems: 'center' },
  actionIconButton: { padding: 6, marginLeft: 2 },
  emptyText: { color: '#64748B', fontStyle: 'italic', marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E293B', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 16 },
  input: {
    backgroundColor: '#0F172A',
    color: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelButton: { padding: 10 },
  cancelButtonText: { color: '#94A3B8', fontWeight: '600' },
  saveButton: { backgroundColor: '#38BDF8', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 6 },
  saveButtonText: { color: '#0F172A', fontWeight: '700' },
});