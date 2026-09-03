import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
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
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [pairedDevices, setPairedDevices] = useState([]);
  const [isRegisterModalVisible, setIsRegisterModalVisible] = useState(false);
  
  // Registration Form States
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [macAddressInput, setMacAddressInput] = useState('');
  const [ipAddressInput, setIpAddressInput] = useState(deviceIp || '192.168.1.15');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValidUserId = (id) => typeof id === 'string' && id.trim().length > 0;

  useEffect(() => {
    fetchPairedDevices();
  }, [userId]);

  const fetchPairedDevices = async () => {
    if (!isValidUserId(userId)) return;

    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      setPairedDevices(data || []);
    } catch (err) {
      console.error('Fetch Paired Devices Error:', err.message);
    }
  };

  const handleScanDevices = async () => {
    setIsScanning(true);
    setDiscoveredDevices([]);

    try {
      const targetIp = deviceIp || '192.168.1.15';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`http://${targetIp}:5000/discovered-devices`, {
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (response && response.ok) {
        const data = await response.json();
        setDiscoveredDevices(data.devices || []);
      } else {
        // Fallback: search registered devices in Supabase
        const { data } = await supabase.from('devices').select('*').limit(5);
        setDiscoveredDevices(data || []);
      }
    } catch (err) {
      console.log('Scan warning:', err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handlePairDevice = async (device) => {
    if (!isValidUserId(userId)) {
      Alert.alert('Authentication Error', 'Invalid user session. Please log in again.');
      return;
    }

    try {
      setSyncState('SYNCING');

      const { data, error } = await supabase
        .from('devices')
        .upsert([
          {
            user_id: userId,
            device_name: device.device_name || device.name || 'Guardian Node',
            mac_address: device.mac_address || '00:00:00:00:00:00',
            ip_address: device.ip_address || deviceIp,
            status: 'ONLINE',
            last_sync: new Date().toISOString(),
          },
        ])
        .select();

      if (error) throw error;

      await logSystemActivity(userId, 'PAIR_DEVICE', `Paired device: ${device.device_name || 'Guardian Node'}`);
      
      if (onSelectDevice) {
        onSelectDevice(device);
      } else {
        setSyncState('SUCCESS');
      }

      Alert.alert('Success', 'Device paired successfully!');
      fetchPairedDevices();
    } catch (err) {
      setSyncState('FAILED');
      Alert.alert('Pairing Failed', err.message);
    }
  };

  const handleDisconnectDevice = async (deviceId) => {
    Alert.alert('Unpair Device', 'Are you sure you want to remove this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unpair',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('devices').delete().eq('id', deviceId);
            if (error) throw error;

            if (onDisconnectDevice) {
              onDisconnectDevice();
            } else {
              setSyncState('IDLE');
            }

            await logSystemActivity(userId, 'UNPAIR_DEVICE', `Unpaired device ID: ${deviceId}`);
            Alert.alert('Disconnected', 'Device successfully removed.');
            fetchPairedDevices();
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleManualRegister = async () => {
    if (!deviceNameInput.trim()) {
      Alert.alert('Input Error', 'Please enter a device name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('devices').insert([
        {
          user_id: userId,
          device_name: deviceNameInput.trim(),
          mac_address: macAddressInput.trim() || 'UNKNOWN_MAC',
          ip_address: ipAddressInput.trim() || deviceIp,
          status: 'OFFLINE',
          last_sync: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      Alert.alert('Success', 'Device registered successfully!');
      setIsRegisterModalVisible(false);
      setDeviceNameInput('');
      setMacAddressInput('');
      fetchPairedDevices();
    } catch (err) {
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
          onPress={() => (navigation ? navigation.goBack() : onNavigate('dashboard'))}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Pairing</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsRegisterModalVisible(true)}>
          <MaterialCommunityIcons name="plus" size={24} color="#38BDF8" />
        </TouchableOpacity>
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
            <Text style={styles.statusSubtitle}>Target IP: {deviceIp}</Text>
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.scanButton, isScanning && styles.disabledButton]}
            onPress={handleScanDevices}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="radar" size={20} color="#FFF" />
                <Text style={styles.scanButtonText}>Scan Local Network</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Discovered Section */}
        {discoveredDevices.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Discovered Devices</Text>
            {discoveredDevices.map((item, index) => (
              <View key={item.id || index} style={styles.deviceCard}>
                <MaterialCommunityIcons name="harddisk" size={24} color="#38BDF8" />
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{item.device_name || item.name || 'Guardian Node'}</Text>
                  <Text style={styles.deviceSubText}>{item.ip_address || '192.168.1.15'}</Text>
                </View>
                <TouchableOpacity style={styles.pairButton} onPress={() => handlePairDevice(item)}>
                  <Text style={styles.pairButtonText}>Pair</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Paired Devices Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Paired Devices</Text>
          <FlatList
            data={pairedDevices}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.deviceCard}>
                <MaterialCommunityIcons name="shield-check" size={24} color="#4ADE80" />
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{item.device_name}</Text>
                  <Text style={styles.deviceSubText}>MAC: {item.mac_address}</Text>
                </View>
                <TouchableOpacity
                  style={styles.unpairButton}
                  onPress={() => handleDisconnectDevice(item.id)}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No paired devices found for this account.</Text>
            }
          />
        </View>
      </View>

      {/* Manual Registration Modal */}
      <Modal visible={isRegisterModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Register New Device</Text>
            <TextInput
              style={styles.input}
              placeholder="Device Name (e.g. Living Room Node)"
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
              placeholder="IP Address"
              placeholderTextColor="#64748B"
              value={ipAddressInput}
              onChangeText={setIpAddressInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setIsRegisterModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleManualRegister}
                disabled={isSubmitting}
              >
                {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save</Text>}
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
  addButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },
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
  actionRow: { marginBottom: 20 },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  disabledButton: { opacity: 0.6 },
  scanButtonText: { color: '#FFF', fontWeight: '600' },
  sectionContainer: { marginBottom: 24, flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#94A3B8', marginBottom: 8 },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  deviceInfo: { flex: 1, marginLeft: 12 },
  deviceName: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  deviceSubText: { fontSize: 12, color: '#64748B' },
  pairButton: { backgroundColor: '#38BDF8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  pairButtonText: { color: '#0F172A', fontWeight: '700', fontSize: 12 },
  unpairButton: { padding: 6 },
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