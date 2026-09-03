import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { supabase } from '../services/supabaseClient';

export default function DeviceControlScreen({ navigation, userId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [deviceIp, setDeviceIp] = useState(null);

  // Settings State
  const [vibrationIntensity, setVibrationIntensity] = useState(3); // Scale 1 - 5
  const [soundThreshold, setSoundThreshold] = useState(65); // Decibels (dB)
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [ledIndicators, setLedIndicators] = useState(true);

  useEffect(() => {
    fetchDeviceSettings();
  }, [userId]);

  const fetchDeviceSettings = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_devices')
        .select('id, ip_address, vibration_intensity, sound_threshold, haptic_enabled, led_enabled')
        .eq('user_id', String(userId).trim())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Device fetch warning:', error.message);
      }

      if (data) {
        setDeviceId(data.id);
        setDeviceIp(data.ip_address);
        if (data.vibration_intensity !== null) setVibrationIntensity(data.vibration_intensity);
        if (data.sound_threshold !== null) setSoundThreshold(data.sound_threshold);
        if (data.haptic_enabled !== null) setHapticFeedback(data.haptic_enabled);
        if (data.led_enabled !== null) setLedIndicators(data.led_enabled);
      }
    } catch (err) {
      console.error('Error loading device settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!userId) return;

    try {
      setSaving(true);

      // Attempt to post setting updates directly to local device IP if connected
      if (deviceIp) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);

          await fetch(
            `http://${deviceIp}/settings?vibe=${vibrationIntensity}&thresh=${soundThreshold}&led=${ledIndicators ? 1 : 0}`,
            { method: 'GET', signal: controller.signal }
          );
          clearTimeout(timeoutId);
        } catch (networkErr) {
          console.warn('Direct HTTP update to device timed out:', networkErr);
        }
      }

      // Sync settings to database
      const updates = {
        user_id: String(userId).trim(),
        vibration_intensity: vibrationIntensity,
        sound_threshold: soundThreshold,
        haptic_enabled: hapticFeedback,
        led_enabled: ledIndicators,
        last_seen: new Date().toISOString(),
      };

      let query = supabase.from('user_devices');
      if (deviceId) {
        query = query.update(updates).eq('id', deviceId);
      } else {
        query = query.upsert(updates, { onConflict: 'user_id' });
      }

      const { error } = await query;
      if (error) throw error;

      Alert.alert('Settings Saved', 'Device thresholds and preferences updated.');
    } catch (err) {
      Alert.alert('Save Failed', err.message || 'Could not update device controls.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation && navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Controls</Text>
        <TouchableOpacity style={styles.saveHeaderBtn} onPress={handleSaveSettings} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#38BDF8" /> : <Text style={styles.saveHeaderText}>Save</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Vibration Intensity */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <MaterialCommunityIcons name="vibrate" size={22} color="#38BDF8" />
              <Text style={styles.cardTitle}>Vibration Intensity Level</Text>
            </View>
            <Text style={styles.cardSubtext}>
              Adjust how strongly the wristband vibrates upon detecting a alert.
            </Text>

            <View style={styles.valueDisplayRow}>
              <Text style={styles.valueText}>Level {vibrationIntensity}</Text>
              <Text style={styles.valueSub}>
                {vibrationIntensity === 1 ? 'Soft' : vibrationIntensity === 5 ? 'Max' : 'Medium'}
              </Text>
            </View>

            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={5}
              step={1}
              value={vibrationIntensity}
              onValueChange={setVibrationIntensity}
              minimumTrackTintColor="#38BDF8"
              maximumTrackTintColor="#334155"
              thumbTintColor="#38BDF8"
            />
          </View>

          {/* Sound Threshold */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="volume-medium-outline" size={22} color="#38BDF8" />
              <Text style={styles.cardTitle}>Sound Sensitivity Threshold</Text>
            </View>
            <Text style={styles.cardSubtext}>
              Minimum decibel (dB) volume required to trigger a directional alert.
            </Text>

            <View style={styles.valueDisplayRow}>
              <Text style={styles.valueText}>{soundThreshold} dB</Text>
              <Text style={styles.valueSub}>
                {soundThreshold < 55 ? 'High Sensitivity' : soundThreshold > 75 ? 'Low Sensitivity' : 'Balanced'}
              </Text>
            </View>

            <Slider
              style={styles.slider}
              minimumValue={40}
              maximumValue={90}
              step={5}
              value={soundThreshold}
              onValueChange={setSoundThreshold}
              minimumTrackTintColor="#38BDF8"
              maximumTrackTintColor="#334155"
              thumbTintColor="#38BDF8"
            />
          </View>

          {/* Toggles */}
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleTitle}>Haptic Feedback</Text>
                <Text style={styles.toggleSub}>Vibrate phone screen along with wristband</Text>
              </View>
              <Switch
                value={hapticFeedback}
                onValueChange={setHapticFeedback}
                trackColor={{ false: '#334155', true: '#38BDF8' }}
                thumbColor="#F8FAFC"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleTitle}>Directional LED Lights</Text>
                <Text style={styles.toggleSub}>Flash directional LEDs on the physical device</Text>
              </View>
              <Switch
                value={ledIndicators}
                onValueChange={setLedIndicators}
                trackColor={{ false: '#334155', true: '#38BDF8' }}
                thumbColor="#F8FAFC"
              />
            </View>
          </View>

          {/* Save Action */}
          <TouchableOpacity style={styles.applyButton} onPress={handleSaveSettings} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <Text style={styles.applyButtonText}>Apply Settings to Device</Text>
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 5 : 0,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  saveHeaderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  saveHeaderText: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 15,
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
    marginBottom: 16,
  },
  valueDisplayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  valueText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#38BDF8',
  },
  valueSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  toggleSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
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