import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  Switch, 
  StyleSheet, 
  Alert, 
  TouchableOpacity, 
  ActivityIndicator,
  ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, logSystemActivity } from '../services/supabaseClient';

export default function DeviceControlScreen({ navigation, userId, selectedMacAddress, isDeviceOn, setIsDeviceOn }) {
  const [isEnabled, setIsEnabled] = useState(isDeviceOn ?? false);
  const [sensitivity, setSensitivity] = useState('narrow');
  const [vibrationIntensity, setVibrationIntensity] = useState('medium');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchSettings();
    }
  }, [userId, selectedMacAddress]);

  const fetchSettings = async () => {
    if (!userId) return;
    try {
      let query = supabase.from('user_devices').select('*').eq('user_id', userId);
      if (selectedMacAddress) {
        query = query.eq('mac_address', selectedMacAddress);
      }

      const { data, error } = await query.maybeSingle();

      if (data && !error) {
        setIsEnabled(data.is_on ?? false);
        setSensitivity(data.sensitivity || 'narrow');
        setVibrationIntensity(data.vibration_intensity || 'medium');
        if (setIsDeviceOn) setIsDeviceOn(data.is_on ?? false);
      }
    } catch (err) {
      console.log('Fetching settings info:', err.message);
    }
  };

  const saveSettings = async (newOn, newSens, newVib) => {
    if (!userId) {
      Alert.alert("Error", "User session not loaded.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        is_on: newOn,
        sensitivity: newSens,
        vibration_intensity: newVib,
        updated_at: new Date().toISOString()
      };

      if (selectedMacAddress) {
        payload.mac_address = selectedMacAddress.trim();
      }

      let error;
      if (selectedMacAddress) {
        const res = await supabase
          .from('user_devices')
          .upsert(payload, { onConflict: 'mac_address' });
        error = res.error;
      } else {
        const res = await supabase
          .from('user_devices')
          .update(payload)
          .eq('user_id', userId);
        error = res.error;
      }

      if (error) throw error;

      await logSystemActivity(
        userId, 
        'SETTINGS_CHANGE', 
        `Power: ${newOn ? 'ON' : 'OFF'} | Sensitivity: ${newSens} | Vib: ${newVib}`
      );

    } catch (err) {
      console.error('Save Settings Error:', err);
      Alert.alert("Sync Error", err.message || "Failed to update settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePower = (val) => {
    setIsEnabled(val);
    if (setIsDeviceOn) setIsDeviceOn(val);
    saveSettings(val, sensitivity, vibrationIntensity);
  };

  const handleSensitivityChange = (mode) => {
    setSensitivity(mode);
    saveSettings(isEnabled, mode, vibrationIntensity);
  };

  const handleVibrationChange = (level) => {
    setVibrationIntensity(level);
    saveSettings(isEnabled, sensitivity, level);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => navigation && navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={22} color="#38BDF8" />
        <Text style={styles.backText}>Dashboard</Text>
      </TouchableOpacity>

      <Text style={styles.title}>SonoBand Device Controls</Text>

      {/* POWER TOGGLE */}
      <View style={styles.card}>
        <View style={styles.row}>
          <View>
            <Text style={styles.cardTitle}>Device Power</Text>
            <Text style={styles.cardSubtext}>Turn detection engine ON or OFF</Text>
          </View>
          <Switch value={isEnabled} onValueChange={handleTogglePower} />
        </View>
      </View>

      {/* SENSITIVITY RANGE */}
      <Text style={styles.sectionHeader}>Sound Detection Range</Text>
      <View style={styles.card}>
        <TouchableOpacity 
          style={[styles.optionCard, sensitivity === 'narrow' && styles.selectedOptionCard]}
          onPress={() => handleSensitivityChange('narrow')}
        >
          <Ionicons name="contract-outline" size={24} color={sensitivity === 'narrow' ? '#38BDF8' : '#64748B'} />
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>Narrow Mode (Low Sensitivity)</Text>
            <Text style={styles.optionDesc}>Filters out distant noise. Triggers only on prominent nearby sounds.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.optionCard, sensitivity === 'wide' && styles.selectedOptionCard, { marginTop: 10 }]}
          onPress={() => handleSensitivityChange('wide')}
        >
          <Ionicons name="expand-outline" size={24} color={sensitivity === 'wide' ? '#38BDF8' : '#64748B'} />
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>Wide Mode (High Sensitivity)</Text>
            <Text style={styles.optionDesc}>Captures faint, distant ambient sounds like sirens or doorbells.</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* VIBRATION INTENSITY */}
      <Text style={styles.sectionHeader}>Vibration Haptic Feedback</Text>
      <View style={styles.card}>
        <Text style={styles.cardSubtext}>Select motor vibration intensity upon alert trigger:</Text>
        <View style={styles.vibeButtonGroup}>
          {['low', 'medium', 'high'].map((level) => (
            <TouchableOpacity
              key={level}
              style={[
                styles.vibeButton,
                vibrationIntensity === level && styles.selectedVibeButton
              ]}
              onPress={() => handleVibrationChange(level)}
            >
              <Text style={[
                styles.vibeButtonText,
                vibrationIntensity === level && styles.selectedVibeText
              ]}>
                {level.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {saving && <ActivityIndicator color="#38BDF8" style={{ marginTop: 15 }} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#0f172a' },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backText: { color: '#38BDF8', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
  sectionHeader: { fontSize: 15, fontWeight: 'bold', color: '#94A3B8', marginTop: 15, marginBottom: 8 },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#334155' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  cardSubtext: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  optionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  selectedOptionCard: { borderColor: '#38BDF8', backgroundColor: '#0c4a6e' },
  optionTextContainer: { marginLeft: 12, flex: 1 },
  optionTitle: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  optionDesc: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  vibeButtonGroup: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  vibeButton: { flex: 1, backgroundColor: '#0f172a', paddingVertical: 12, marginHorizontal: 4, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  selectedVibeButton: { backgroundColor: '#0284c7', borderColor: '#38BDF8' },
  vibeButtonText: { color: '#94a3b8', fontWeight: 'bold', fontSize: 12 },
  selectedVibeText: { color: '#fff' }
});