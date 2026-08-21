import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView,
  Platform,
  StatusBar,
  Alert,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';
import { supabase } from '../services/supabaseClient';

let hasDismissedProfileAlert = false;

function DashboardTutorialModal({ visible, onClose }) {
  const steps = [
    { title: "1. Automatic Sound Sensing", icon: "ear-outline", desc: "Your connected Sonoband device listens continuously for critical ambient sounds (sirens, alarms, barks, horns)." },
    { title: "2. Direction & Intensity Analysis", icon: "compass-outline", desc: "The device estimates sound direction and decibel intensity in real-time, transmitting findings to your app." },
    { title: "3. Real-Time Haptic & Visual Alerts", icon: "notifications-outline", desc: "When a target sound exceeds safe thresholds, your phone vibrates and displays directional indicators." },
    { title: "4. Emergency GPS & Family Sync", icon: "people-outline", desc: "High-priority emergency alerts share your live GPS location with members of your Family Group." }
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={modalStyles.modalOverlay}>
        <View style={modalStyles.modalContent}>
          <View style={modalStyles.modalHeader}>
            <Text style={modalStyles.modalTitle}>How Sonoband Works</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={26} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ marginVertical: 12 }} showsVerticalScrollIndicator={false}>
            {steps.map((step, idx) => (
              <View key={idx} style={modalStyles.stepCard}>
                <Ionicons name={step.icon} size={28} color="#38BDF8" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={modalStyles.stepTitle}>{step.title}</Text>
                  <Text style={modalStyles.stepDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose}>
            <Text style={modalStyles.closeBtnText}>Got It!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function DashboardScreen({ 
  navigation, 
  isDeviceOn: propIsDeviceOn, 
  setIsDeviceOn,
  userId,
  currentScreen 
}) {
  const [userName, setUserName] = useState('User');
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeDeviceCount, setActiveDeviceCount] = useState(0);
  
  // Power defaults strictly to OFF (false) until toggled by user
  const [devicePower, setDevicePower] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const [deviceIp, setDeviceIp] = useState(null);

  const checkProfileCompletion = async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data && !error) {
        const resolvedName = data.name || data.full_name || data.first_name || data.username;
        const displayName = resolvedName ? String(resolvedName).split(' ')[0] : 'User';
        setUserName(displayName);

        const missingFields = [];
        if (!resolvedName || !String(resolvedName).trim()) missingFields.push('• Full Name');
        if (!data.phone_number || !String(data.phone_number).trim()) missingFields.push('• Phone Number');
        if (!data.emergency_contact || !String(data.emergency_contact).trim()) missingFields.push('• Emergency Contact');
        if (!data.avatar_url || !String(data.avatar_url).trim()) missingFields.push('• Profile Photo');

        if (missingFields.length > 0 && !hasDismissedProfileAlert) {
          Alert.alert(
            "Incomplete Profile Details",
            `Please update your account details to keep your information up to date.\n\nMissing Information:\n${missingFields.join('\n')}`,
            [
              { text: "Later", style: "cancel", onPress: () => { hasDismissedProfileAlert = true; } },
              { text: "Update Now", onPress: () => navigateToProfile() }
            ]
          );
        }
      }

      // Fetch paired device without triggering auto-connection or automatic HTTP requests
      const { data: deviceData } = await supabase
        .from('user_devices')
        .select('id, mac_address, last_seen, is_on, ip_address')
        .eq('user_id', String(userId).trim());
      
      if (deviceData && deviceData.length > 0) {
        const dev = deviceData[0];
        setActiveDeviceCount(deviceData.length);
        setCurrentDeviceId(dev.id);
        setDeviceIp(dev.ip_address);

        // Explicitly set default power state to OFF (false)
        setDevicePower(false);
        if (typeof setIsDeviceOn === 'function') setIsDeviceOn(false);
      } else {
        setActiveDeviceCount(0);
        setCurrentDeviceId(null);
        setDeviceIp(null);
      }

    } catch (err) {
      console.error("Error fetching profile details:", err);
    }
  };

  useEffect(() => {
    if (currentScreen === 'dashboard' || !currentScreen) {
      checkProfileCompletion();
    }
  }, [userId, currentScreen]);

  useEffect(() => {
    let sub = null;
    const setupBattery = async () => {
      try {
        const lvl = await Battery.getBatteryLevelAsync();
        if (lvl !== -1) setBatteryLevel(Math.round(lvl * 100));
        sub = Battery.addBatteryLevelListener(({ batteryLevel: newLvl }) => {
          setBatteryLevel(Math.round(newLvl * 100));
        });
      } catch (e) {}
    };
    setupBattery();
    return () => { if (sub) sub.remove(); };
  }, []);

  const handleTogglePower = async () => {
    if (!currentDeviceId && !userId) {
      Alert.alert('No Device Paired', 'Please pair a device on the Device Pairing page before toggling power.');
      return;
    }

    const newPowerState = !devicePower;

    // 1. Immediately update UI state
    setDevicePower(newPowerState);
    if (typeof setIsDeviceOn === 'function') setIsDeviceOn(newPowerState);

    try {
      // 2. Resolve hardware IP address if missing from state
      let targetIp = deviceIp;
      if (!targetIp) {
        const { data: devFetch } = await supabase
          .from('user_devices')
          .select('ip_address')
          .eq('user_id', String(userId).trim())
          .maybeSingle();
        targetIp = devFetch?.ip_address;
        if (targetIp) setDeviceIp(targetIp);
      }

      // 3. Send HTTP request directly to hardware endpoint
      if (targetIp) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);

          await fetch(`http://${targetIp}/power?state=${newPowerState ? 'on' : 'off'}`, {
            method: 'GET',
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (networkErr) {
          console.warn('Direct network request to device failed or timed out:', networkErr);
        }
      }

      // 4. Update ONLY the 'is_on' and 'last_seen' columns in Supabase matching your schema
      let query = supabase
        .from('user_devices')
        .update({ 
          is_on: newPowerState,
          last_seen: new Date().toISOString()
        });

      if (currentDeviceId) {
        query = query.eq('id', currentDeviceId);
      } else {
        query = query.eq('user_id', String(userId).trim());
      }

      const { error } = await query;

      if (error) {
        console.error('Database Sync Error:', error);
        // Rollback state on error
        setDevicePower(!newPowerState);
        if (typeof setIsDeviceOn === 'function') setIsDeviceOn(!newPowerState);
        Alert.alert('Sync Error', 'Could not update power state in database.');
      }
    } catch (err) {
      console.error('Power toggle exception:', err);
      setDevicePower(!newPowerState);
      if (typeof setIsDeviceOn === 'function') setIsDeviceOn(!newPowerState);
    }
  };

  const navigateToProfile = () => {
    if (navigation && typeof navigation.navigate === 'function') {
      navigation.navigate('profile', { userId });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HEADER AREA */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.userInfo} onPress={navigateToProfile} activeOpacity={0.7}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{userName ? userName.charAt(0).toUpperCase() : 'U'}</Text>
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.greetingText}>Hello, {userName}!</Text>
              <Text style={{ fontSize: 11, color: '#38BDF8', fontWeight: '600' }}>View Profile ›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.notifBell} onPress={() => navigation && navigation.navigate('Notifications')}>
            <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#38BDF8' }}>NOTIF</Text>
            <View style={styles.redBadge} />
          </TouchableOpacity>
        </View>

        <Text style={styles.mainTitle}>Device Dashboard</Text>

        {/* BENTO GRID AREA */}
        <View style={styles.bentoRow}>
          <View style={[styles.bentoCard, styles.smallCard]}>
            <Text style={styles.cardValue}>
              {batteryLevel !== null ? `${batteryLevel}%` : '--%'}
            </Text>
            <Text style={styles.cardLabel}>Phone Battery</Text>
            <Text style={styles.batteryStatusText}>
              {batteryLevel > 20 ? 'OPTIMAL' : 'LOW BATTERY'}
            </Text>
          </View>

          <TouchableOpacity 
            style={[styles.bentoCard, styles.largeCard]}
            onPress={() => navigation && navigation.navigate('DevicePairing', { userId })}
          >
            <Text style={styles.cardBadge}>{activeDeviceCount} Registered</Text>
            <Text style={styles.cardTitle}>Find & Pair Device</Text>
            <Text style={styles.cardSubtext}>Manage paired devices & list</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.bentoCard, styles.fullWidthCard]}
          onPress={() => navigation && navigation.navigate('DeviceControl')}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Device Controls</Text>
            <Text style={styles.cardActionText}>SETTINGS ›</Text>
          </View>
          <Text style={styles.cardSubtext}>Adjust vibration intensity & sound threshold</Text>
        </TouchableOpacity>

        {/* POWER TOGGLE BAR */}
        <TouchableOpacity 
          style={[styles.toggleBar, devicePower ? styles.onBar : styles.offBar]}
          onPress={handleTogglePower}
        >
          <Text style={styles.toggleBarText}>
            {devicePower ? "Device Power: ON" : "Device Power: OFF"}
          </Text>
          <View style={[styles.statusDot, { backgroundColor: devicePower ? '#22C55E' : '#EF4444' }]} />
        </TouchableOpacity>

        {/* GUIDES & TUTORIALS */}
        <Text style={[styles.mainTitle, { marginTop: 25 }]}>App Guides & Manuals</Text>

        <TouchableOpacity style={[styles.bentoCard, styles.fullWidthCard]} onPress={() => setShowTutorial(true)}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>📖 How Sonoband Works</Text>
            <Text style={styles.cardActionText}>VIEW TUTORIAL ›</Text>
          </View>
          <Text style={styles.cardSubtext}>Overview of sound detection, directional alerts & emergency GPS</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.bentoCard, styles.fullWidthCard]} onPress={() => navigation && navigation.navigate('SoundManual')}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>🔊 Core Sound Reference Manual</Text>
            <Text style={styles.cardActionText}>OPEN MANUAL ›</Text>
          </View>
          <Text style={styles.cardSubtext}>List of automatically identified sounds, decibel limits & alert types</Text>
        </TouchableOpacity>

        {/* QUICK NAVIGATION */}
        <Text style={[styles.mainTitle, { marginTop: 15 }]}>Quick Navigation</Text>

        <TouchableOpacity style={[styles.bentoCard, styles.fullWidthCard]} onPress={navigateToProfile}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>My Profile & Account</Text>
            <Text style={styles.cardActionText}>EDIT ›</Text>
          </View>
          <Text style={styles.cardSubtext}>Update avatar, personal details & contact info</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.bentoCard, styles.fullWidthCard]} onPress={() => navigation && navigation.navigate('GroupManagement')}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Family Group & Live GPS</Text>
            <Text style={styles.cardActionText}>VIEW GROUPS ›</Text>
          </View>
          <Text style={styles.cardSubtext}>Manage family groups, view maps & members</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.bentoCard, styles.fullWidthCard]} onPress={() => navigation && navigation.navigate('Alerts')}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Sound Direction & AI Alerts</Text>
            <Text style={styles.cardActionText}>ALERTS ›</Text>
          </View>
          <Text style={styles.cardSubtext}>Directional sound estimation logs</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.bentoCard, styles.fullWidthCard]} onPress={() => navigation && navigation.navigate('Notifications')}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Audit Logs & Notifications</Text>
            <Text style={styles.cardActionText}>LOGS ›</Text>
          </View>
          <Text style={styles.cardSubtext}>System activity & login history</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.bentoCard, styles.fullWidthCard]} onPress={() => navigation && navigation.navigate('Settings')}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>System Settings</Text>
            <Text style={styles.cardActionText}>ACCOUNT ›</Text>
          </View>
          <Text style={styles.cardSubtext}>Manage user profile & settings</Text>
        </TouchableOpacity>

      </ScrollView>

      <DashboardTutorialModal visible={showTutorial} onClose={() => setShowTutorial(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 5 : 0 },
  scrollContent: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarPlaceholder: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#38BDF8', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#0F172A', fontWeight: 'bold', fontSize: 18 },
  greetingText: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  notifBell: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', position: 'relative' },
  redBadge: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  mainTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#F8FAFC' },
  bentoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  bentoCard: { backgroundColor: '#1E293B', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#334155' },
  smallCard: { width: '38%', height: 135, justifyContent: 'space-between' },
  largeCard: { width: '58%', height: 135, justifyContent: 'space-between' },
  fullWidthCard: { width: '100%', marginBottom: 12 },
  cardBadge: { backgroundColor: '#38BDF8', color: '#0F172A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start', fontSize: 10, fontWeight: 'bold' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC' },
  cardValue: { fontSize: 32, fontWeight: 'bold', color: '#38BDF8' },
  cardLabel: { fontSize: 12, color: '#94A3B8' },
  batteryStatusText: { fontSize: 10, fontWeight: 'bold', color: '#22C55E' },
  cardSubtext: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardActionText: { fontSize: 11, fontWeight: 'bold', color: '#38BDF8' },
  toggleBar: { borderRadius: 18, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, borderWidth: 1 },
  onBar: { backgroundColor: '#064E3B', borderColor: '#059669' },
  offBar: { backgroundColor: '#451A03', borderColor: '#D97706' },
  toggleBarText: { fontSize: 14, fontWeight: 'bold', color: '#F8FAFC' },
  statusDot: { width: 12, height: 12, borderRadius: 6 }
});

const modalStyles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.85)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E293B', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#334155', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC' },
  stepCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#0F172A', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  stepTitle: { fontSize: 15, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 4 },
  stepDesc: { fontSize: 13, color: '#94A3B8', lineHeight: 18 },
  closeBtn: { backgroundColor: '#38BDF8', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  closeBtnText: { color: '#0F172A', fontWeight: 'bold', fontSize: 15 }
});