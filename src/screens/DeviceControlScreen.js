import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function DeviceControlScreen({ navigation, onNavigate, userId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [deviceIp, setDeviceIp] = useState(null);
  const [macAddress, setMacAddress] = useState(null);

  // Device Settings State
  const [devicePower, setDevicePower] = useState(false);
  const [vibrationLevel, setVibrationLevel] = useState('medium'); // 'low', 'medium', 'high'
  const [micRange, setMicRange] = useState('narrow'); // 'narrow', 'broad'

  // Reference to background keep-alive ping interval
  const pingIntervalRef = useRef(null);

  // Helper function to insert notifications directly into public.notifications
  const createNotification = async (type, title, message, metadata) => {
    if (!userId) return;
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

  // Load device settings whenever userId changes or when screen mounts
  useEffect(() => {
    fetchDeviceSettings();
  }, [userId]);

  // Background Heartbeat Loop to keep ESP32 alive
  useEffect(() => {
    if (deviceIp && devicePower) {
      pingIntervalRef.current = setInterval(async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          await fetch(`http://${deviceIp}:5000/ping`, {
            method: 'GET',
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
        } catch (error) {
          console.log('[Heartbeat] Ping missed:', error.message);
        }
      }, 5000);
    }

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [deviceIp, devicePower]);

  const fetchDeviceSettings = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', String(userId).trim())
        .order('last_seen', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('Device fetch warning:', error.message);
      }

      if (data && data.length > 0) {
        const device = data[0];
        setDeviceId(device.id);
        setMacAddress(device.mac_address || null);
        setDeviceIp(device.ip_address || device.ip);

        // Power Status
        setDevicePower(device.is_on === true);

        // Parse Vibration Level
        if (device.vibration_intensity !== null && device.vibration_intensity !== undefined) {
          if (typeof device.vibration_intensity === 'string') {
            setVibrationLevel(device.vibration_intensity);
          } else {
            setVibrationLevel(
              device.vibration_intensity <= 2 ? 'low' : device.vibration_intensity >= 4 ? 'high' : 'medium'
            );
          }
        }

        // Parse Sound Threshold / Range
        const rawSensitivity = device.sound_threshold ?? device.sensitivity;
        if (rawSensitivity !== null && rawSensitivity !== undefined) {
          if (typeof rawSensitivity === 'string') {
            setMicRange(rawSensitivity);
          } else {
            setMicRange(rawSensitivity >= 65 ? 'narrow' : 'broad');
          }
        }
      } else {
        setDevicePower(false);
      }
    } catch (err) {
      console.error('Error loading device settings:', err);
    } finally {
      setLoading(false);
    }
  };

  // Dispatch HTTP commands directly to ESP32 WebServer
  const sendHardwareCommand = async (ip, action, payload = {}) => {
    if (!ip) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      let endpoint = `http://${ip}:5000/config`;

      if (action === 'power_on') {
        endpoint = `http://${ip}:5000/connect`;
      } else if (action === 'power_off') {
        endpoint = `http://${ip}:5000/disconnect`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn(`Hardware HTTP command [${action}] failed for ${ip}:`, e.message);
      return false;
    }
  };

  // Power switch toggle handler
  const handlePowerToggle = async (newValue) => {
    setDevicePower(newValue);

    if (deviceIp) {
      if (newValue) {
        await sendHardwareCommand(deviceIp, 'power_on', { is_on: true });
      } else {
        await sendHardwareCommand(deviceIp, 'power_off', { is_on: false });
      }
    }

    if (!userId) return;

    try {
      const updates = {
        is_on: newValue,
        last_seen: new Date().toISOString(),
      };

      if (deviceId) {
        await supabase.from('user_devices').update(updates).eq('id', deviceId);
      } else if (macAddress) {
        await supabase.from('user_devices').update(updates).eq('mac_address', macAddress);
      }

      const statusText = newValue ? 'ON' : 'OFF';
      const actionText = newValue ? 'turned ON and activated.' : 'turned OFF / placed on standby.';

      await createNotification(
        'device_toggle',
        `Device Turned ${statusText}`,
        `Your SonoBand device was ${actionText}`,
        statusText
      );
    } catch (err) {
      console.error('Failed to sync power state in Supabase:', err);
    }
  };

  // Save settings and redirect to Dashboard
  const handleSaveSettings = async () => {
    if (!userId) return;

    try {
      setSaving(true);

      const settingsPayload = {
        is_on: devicePower,
        vibration_intensity: vibrationLevel,
        sound_threshold: micRange,
        sensitivity: micRange,
      };

      // 1. Push settings directly to ESP32
      if (deviceIp) {
        await sendHardwareCommand(deviceIp, 'update_config', settingsPayload);
      }

      // 2. Sync settings into Supabase
      const updates = {
        ...settingsPayload,
        user_id: String(userId).trim(),
        last_seen: new Date().toISOString(),
      };

      let query = supabase.from('user_devices');
      if (deviceId) {
        query = query.update(updates).eq('id', deviceId);
      } else if (macAddress) {
        query = query.update(updates).eq('mac_address', macAddress);
      } else {
        query = query.upsert(updates, { onConflict: 'user_id' });
      }

      const { error } = await query;
      if (error) throw error;

      Alert.alert(
        'Settings Applied',
        'Your SonoBand settings have been updated successfully.',
        [
          {
            text: 'OK',
            onPress: () => {
              if (navigation && typeof navigation.navigate === 'function') {
                navigation.navigate('dashboard');
              } else if (onNavigate) {
                onNavigate('dashboard');
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Save Failed', err.message || 'Could not update device controls.');
    } finally {
      setSaving(false);
    }
  };

  const handleBackPress = () => {
    if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    } else if (onNavigate) {
      onNavigate('dashboard');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Controls</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>

          {/* Device Power Switch Card */}
          <View style={[styles.card, devicePower ? styles.cardActiveBorder : null]}>
            <View style={styles.toggleRow}>
              <View style={styles.cardTitleRow}>
                <Ionicons
                  name="power-outline"
                  size={22}
                  color={devicePower ? '#4ADE80' : '#94A3B8'}
                />
                <Text style={styles.cardTitle}>Device Power Status</Text>
              </View>
              <Switch
                value={devicePower}
                onValueChange={handlePowerToggle}
                trackColor={{ false: '#334155', true: '#22C55E' }}
                thumbColor="#F8FAFC"
              />
            </View>
            <Text style={styles.cardSubtext}>
              Turn your SonoBand ON to start detecting sound alerts, or OFF to pause sampling and conserve battery.
            </Text>

            <View style={[styles.statusBadge, devicePower ? styles.badgeOn : styles.badgeOff]}>
              <View style={[styles.statusDot, devicePower ? styles.dotOn : styles.dotOff]} />
              <Text style={[styles.statusBadgeText, devicePower ? styles.textOn : styles.textOff]}>
                {devicePower ? 'Active & Listening' : 'Powered Off / Standby'}
              </Text>
            </View>
          </View>

          {/* Vibration Level Card */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <MaterialCommunityIcons name="vibrate" size={22} color="#38BDF8" />
              <Text style={styles.cardTitle}>Vibration Strength</Text>
            </View>
            <Text style={styles.cardSubtext}>
              Choose how strongly the wristband vibrates when a sound is detected.
            </Text>

            <View style={styles.segmentContainer}>
              <TouchableOpacity
                style={[styles.segmentButton, vibrationLevel === 'low' && styles.segmentActive]}
                onPress={() => setVibrationLevel('low')}
              >
                <Text style={[styles.segmentText, vibrationLevel === 'low' && styles.segmentTextActive]}>Low</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentButton, vibrationLevel === 'medium' && styles.segmentActive]}
                onPress={() => setVibrationLevel('medium')}
              >
                <Text style={[styles.segmentText, vibrationLevel === 'medium' && styles.segmentTextActive]}>Medium</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentButton, vibrationLevel === 'high' && styles.segmentActive]}
                onPress={() => setVibrationLevel('high')}
              >
                <Text style={[styles.segmentText, vibrationLevel === 'high' && styles.segmentTextActive]}>High</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Microphone Sensitivity Card */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="mic-outline" size={22} color="#38BDF8" />
              <Text style={styles.cardTitle}>Microphone Listening Range</Text>
            </View>
            <Text style={styles.cardSubtext}>
              Select whether the device detects loud nearby sounds or open background sounds.
            </Text>

            <View style={styles.segmentContainer}>
              <TouchableOpacity
                style={[styles.segmentButton, micRange === 'narrow' && styles.segmentActive]}
                onPress={() => setMicRange('narrow')}
              >
                <Text style={[styles.segmentText, micRange === 'narrow' && styles.segmentTextActive]}>Narrow</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentButton, micRange === 'broad' && styles.segmentActive]}
                onPress={() => setMicRange('broad')}
              >
                <Text style={[styles.segmentText, micRange === 'broad' && styles.segmentTextActive]}>Broad</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.rangeDescription}>
              {micRange === 'narrow'
                ? 'Narrow: Focuses on prominent, nearby alerts and ignores distant noise.'
                : 'Broad: Picks up subtle sounds over a wider surrounding area.'}
            </Text>
          </View>

          {/* Bottom Apply Settings Button */}
          <TouchableOpacity style={styles.applyButton} onPress={handleSaveSettings} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <Text style={styles.applyButtonText}>Apply Settings</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  center: {
    flex: 1,
    justify: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justify: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  cardActiveBorder: {
    borderColor: '#16A34A',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  cardSubtext: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 18,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  badgeOn: {
    backgroundColor: '#14532D',
  },
  badgeOff: {
    backgroundColor: '#0F172A',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOn: {
    backgroundColor: '#22C55E',
  },
  dotOff: {
    backgroundColor: '#64748B',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  textOn: {
    color: '#4ADE80',
  },
  textOff: {
    color: '#94A3B8',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#38BDF8',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  segmentTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  rangeDescription: {
    fontSize: 11,
    color: '#38BDF8',
    marginTop: 10,
    fontStyle: 'italic',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justify: 'space-between',
  },
  applyButton: {
    backgroundColor: '#38BDF8',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  applyButtonText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 15,
  },
});