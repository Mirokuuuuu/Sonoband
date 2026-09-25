import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  StatusBar,
  Alert,
  Modal,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

let hasDismissedProfileAlert = false;

function NotificationSelectionModal({ visible, onClose, onSelectOption }) {
  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <TouchableOpacity style={modalStyles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={modalStyles.modalContent}>
          <View style={modalStyles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="notifications" size={22} color="#38BDF8" />
              <Text style={modalStyles.modalTitle}>Select Destination</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text style={modalStyles.modalSubtitle}>
            Choose where you would like to go:
          </Text>

          <TouchableOpacity 
            style={modalStyles.optionCard}
            onPress={() => onSelectOption('AlertsScreen')}
            activeOpacity={0.7}
          >
            <View style={[modalStyles.optionIconBg, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
              <Ionicons name="volume-high-outline" size={22} color="#38BDF8" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={modalStyles.optionTitle}>Alert Sound Notification</Text>
              <Text style={modalStyles.optionSub}>View real-time sound detection and logs</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={modalStyles.optionCard}
            onPress={() => onSelectOption('Notifications')}
            activeOpacity={0.7}
          >
            <View style={[modalStyles.optionIconBg, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
              <Ionicons name="notifications-outline" size={22} color="#A855F7" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={modalStyles.optionTitle}>Notifications</Text>
              <Text style={modalStyles.optionSub}>General app updates and system messages</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

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
  onNavigate,
  isDeviceOn: propIsDeviceOn, 
  setIsDeviceOn,
  userId: propUserId,
  currentScreen 
}) {
  const [userName, setUserName] = useState('User');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const [devicePower, setDevicePower] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const [deviceIp, setDeviceIp] = useState(null);

  const navigateTo = (screen, params = {}) => {
    if (typeof onNavigate === 'function') {
      onNavigate(screen, params);
    } else if (navigation && typeof navigation.navigate === 'function') {
      navigation.navigate(screen, { userId: propUserId, ...params });
    }
  };

  const handleNotificationPress = () => {
    setShowNotifMenu(true);
  };

  const handleSelectNotifOption = (destinationScreen) => {
    setShowNotifMenu(false);
    navigateTo(destinationScreen);
  };

  // FIXED: Explicitly checks if the hardware responds AND if is_connected is true
  const pingHardwareDirectly = async (ip) => {
    if (!ip) return false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`http://${ip}:5000/ping`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        // Return true ONLY if ESP32 state confirms is_connected is true
        return Boolean(data && data.is_connected === true);
      }
      return false;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  };

  const checkProfileCompletion = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const activeUserId = propUserId || authUser?.id;

      if (!activeUserId) return;

      const authMeta = authUser?.user_metadata || {};
      const authName = authMeta.full_name || authMeta.name || authUser?.email?.split('@')[0];
      const authAvatar = authMeta.avatar_url || authMeta.picture || null;

      const parsedUserId = parseInt(activeUserId, 10);
      const queryUserId = isNaN(parsedUserId) ? activeUserId : parsedUserId;

      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', queryUserId)
        .maybeSingle();

      const resolvedName = data?.name || data?.full_name || data?.first_name || data?.username || authName;
      const resolvedAvatar = data?.avatar_url || authAvatar;

      if (resolvedName) {
        setUserName(String(resolvedName).trim().split(' ')[0]);
      }

      setAvatarUrl(resolvedAvatar && String(resolvedAvatar).trim() ? String(resolvedAvatar).trim() : null);

      const missingFields = [];
      if (!resolvedName || !String(resolvedName).trim()) missingFields.push('• Full Name');
      if (!data?.phone_number || !String(data.phone_number).trim()) missingFields.push('• Phone Number');
      if (!resolvedAvatar || !String(resolvedAvatar).trim()) missingFields.push('• Profile Photo');

      if (missingFields.length > 0 && !hasDismissedProfileAlert) {
        Alert.alert(
          "Incomplete Profile Details",
          `Please update your account details to keep your information up to date.\n\nMissing Information:\n${missingFields.join('\n')}`,
          [
            { text: "Later", style: "cancel", onPress: () => { hasDismissedProfileAlert = true; } },
            { text: "Update Now", onPress: () => navigateTo('profile') }
          ]
        );
      }

      // Fetch paired device
      const { data: deviceData } = await supabase
        .from('user_devices')
        .select('id, mac_address, last_seen, is_on, ip_address')
        .eq('user_id', queryUserId)
        .order('last_seen', { ascending: false });

      if (deviceData && deviceData.length > 0) {
        const dev = deviceData[0];

        // FIXED: Verifies active hardware ping AND is_connected status
        const isHardwareOnline = await pingHardwareDirectly(dev.ip_address);
        const powerState = Boolean(dev.is_on && isHardwareOnline);

        setIsConnected(isHardwareOnline);
        setDevicePower(powerState);
        setCurrentDeviceId(dev.id);
        setDeviceIp(dev.ip_address);

        if (typeof setIsDeviceOn === 'function') {
          setIsDeviceOn(powerState);
        }
      } else {
        setIsConnected(false);
        setDevicePower(false);
        setCurrentDeviceId(null);
        setDeviceIp(null);
        if (typeof setIsDeviceOn === 'function') {
          setIsDeviceOn(false);
        }
      }

    } catch (err) {
      console.error("Error fetching profile details:", err);
    }
  }, [propUserId, setIsDeviceOn]);

  useEffect(() => {
    checkProfileCompletion();
  }, [propUserId, currentScreen, checkProfileCompletion]);

  useEffect(() => {
    if (!propUserId) return;

    const parsedUserId = parseInt(propUserId, 10);
    const queryUserId = isNaN(parsedUserId) ? propUserId : parsedUserId;

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_devices',
          filter: `user_id=eq.${queryUserId}`,
        },
        () => {
          checkProfileCompletion();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [propUserId, checkProfileCompletion]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HEADER AREA */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.userInfo} onPress={() => navigateTo('profile')} activeOpacity={0.7}>
            <View style={styles.avatarPlaceholder}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{userName ? userName.charAt(0).toUpperCase() : 'U'}</Text>
              )}
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.greetingText}>Hello, {userName}!</Text>
              <Text style={{ fontSize: 11, color: '#38BDF8', fontWeight: '600' }}>View Profile ›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.notifBell} onPress={handleNotificationPress} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={22} color="#38BDF8" />
            <View style={styles.redBadge} />
          </TouchableOpacity>
        </View>

        <Text style={styles.mainTitle}>Device Dashboard</Text>

        {/* BENTO GRID AREA */}
        <View style={styles.bentoRow}>
          {/* DEVICE POWER STATUS CARD */}
          <View style={[styles.bentoCard, styles.smallCard]}>
            <Ionicons 
              name={devicePower ? "power" : "power-outline"} 
              size={24} 
              color={devicePower ? "#22C55E" : "#EF4444"} 
            />
            <Text style={[styles.cardValue, { fontSize: 22, color: devicePower ? '#22C55E' : '#EF4444' }]}>
              {devicePower ? 'ON' : 'OFF'}
            </Text>
            <Text style={styles.cardLabel}>Device Power</Text>
            <Text style={[styles.batteryStatusText, { color: devicePower ? '#22C55E' : '#64748B' }]}>
              {devicePower ? 'ACTIVE' : 'STANDBY'}
            </Text>
          </View>

          {/* PAIRING CARD */}
          <TouchableOpacity 
            style={[styles.bentoCard, styles.largeCard]}
            onPress={() => navigateTo('DevicePairing')}
          >
            <Text 
              style={[
                styles.cardBadge, 
                { backgroundColor: isConnected ? '#22C55E' : '#64748B' }
              ]}
            >
              {isConnected ? 'CONNECTED' : 'NOT CONNECTED'}
            </Text>
            <Text style={styles.cardTitle}>Find & Pair Device</Text>
            <Text style={styles.cardSubtext}>
              {isConnected ? (devicePower ? 'Device online & listening' : 'Device paired (Standby)') : 'No active connection'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* DEVICE CONTROLS / SETTINGS CARD */}
        <TouchableOpacity 
          style={[styles.bentoCard, styles.fullWidthCard]}
          onPress={() => navigateTo('DeviceControl')}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Device Controls</Text>
            <Text style={styles.cardActionText}>CONTROLS ›</Text>
          </View>
          <Text style={styles.cardSubtext}>Adjust vibration intensity & sound threshold</Text>
        </TouchableOpacity>

        {/* GROUP MANAGEMENT CARD */}
        <TouchableOpacity 
          style={[styles.bentoCard, styles.fullWidthCard, { backgroundColor: '#1E293B', borderColor: '#334155' }]}
          onPress={() => navigateTo('groupManagement')}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="people-outline" size={20} color="#38BDF8" />
              <Text style={styles.cardTitle}>Group Management</Text>
            </View>
            <Text style={styles.cardActionText}>MANAGE ›</Text>
          </View>
          <Text style={styles.cardSubtext}>Manage family emergency sync & connected contacts</Text>
        </TouchableOpacity>

        <Text style={[styles.mainTitle, { marginTop: 25 }]}>App Guides & Manuals</Text>

        <View style={styles.bentoRow}>
          <TouchableOpacity 
            style={[styles.bentoCard, styles.squareBoxCard]} 
            onPress={() => setShowTutorial(true)}
          >
            <Ionicons name="book-outline" size={28} color="#38BDF8" style={{ marginBottom: 8 }} />
            <Text style={styles.cardTitle}>How Sonoband Works</Text>
            <Text style={styles.cardSubtext}>Overview of sound detection & alerts</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.bentoCard, styles.squareBoxCard]} 
            onPress={() => navigateTo('SoundManual')}
          >
            <Ionicons name="volume-high-outline" size={28} color="#38BDF8" style={{ marginBottom: 8 }} />
            <Text style={styles.cardTitle}>Core Sound Reference</Text>
            <Text style={styles.cardSubtext}>Identified sounds & alert types</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* BOTTOM NAV */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => navigateTo('dashboard')}>
          <Feather name="home" size={22} color="#38BDF8" />
          <Text style={[styles.navText, styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={handleNotificationPress}>
          <Feather name="bell" size={22} color="#94A3B8" />
          <Text style={styles.navText}>Notifications</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => navigateTo('profile')}>
          <Feather name="user" size={22} color="#94A3B8" />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => navigateTo('Settings')}>
          <Feather name="settings" size={22} color="#94A3B8" />
          <Text style={styles.navText}>Settings</Text>
        </TouchableOpacity>
      </View>

      <NotificationSelectionModal 
        visible={showNotifMenu} 
        onClose={() => setShowNotifMenu(false)} 
        onSelectOption={handleSelectNotifOption} 
      />

      <DashboardTutorialModal visible={showTutorial} onClose={() => setShowTutorial(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  scrollContent: { padding: 20, paddingBottom: 90 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarPlaceholder: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#38BDF8', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 21 },
  avatarText: { color: '#0F172A', fontWeight: 'bold', fontSize: 18 },
  greetingText: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  notifBell: { padding: 10, borderRadius: 12, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', position: 'relative', justifyContent: 'center', alignItems: 'center' },
  redBadge: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  mainTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#F8FAFC' },
  bentoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  bentoCard: { backgroundColor: '#1E293B', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#334155' },
  smallCard: { width: '38%', height: 135, justifyContent: 'space-between' },
  largeCard: { width: '58%', height: 135, justifyContent: 'space-between' },
  squareBoxCard: { width: '48%', height: 140, justifyContent: 'center' },
  fullWidthCard: { width: '100%', marginBottom: 12 },
  cardBadge: { color: '#0F172A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start', fontSize: 10, fontWeight: 'bold' },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#F8FAFC' },
  cardValue: { fontSize: 28, fontWeight: 'bold', color: '#38BDF8' },
  cardLabel: { fontSize: 12, color: '#94A3B8' },
  batteryStatusText: { fontSize: 10, fontWeight: 'bold', color: '#22C55E' },
  cardSubtext: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardActionText: { fontSize: 11, fontWeight: 'bold', color: '#38BDF8' },
  
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 65, backgroundColor: '#1E293B', flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#334155', paddingHorizontal: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  navText: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: 3, textAlign: 'center' },
  activeNavText: { color: '#38BDF8', fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.85)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E293B', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#334155', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC' },
  modalSubtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 16 },
  optionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', padding: 14, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  optionIconBg: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  optionTitle: { fontSize: 15, fontWeight: 'bold', color: '#F8FAFC' },
  optionSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelBtnText: { color: '#94A3B8', fontWeight: '600', fontSize: 14 },
  stepCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#0F172A', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  stepTitle: { fontSize: 15, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 4 },
  stepDesc: { fontSize: 13, color: '#94A3B8', lineHeight: 18 },
  closeBtn: { backgroundColor: '#38BDF8', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  closeBtnText: { color: '#0F172A', fontWeight: 'bold', fontSize: 15 }
});