import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  StyleSheet,
  StatusBar,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function SettingsScreen({ navigation, onNavigate, userId, onLogout }) {
  const [pushNotifications, setPushNotifications] = useState(true);
  const [vibrationAlerts, setVibrationAlerts] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [autoSync, setAutoSync] = useState(true);

  const executeLogout = async () => {
    try {
      if (userId && supabase) {
        const { data: userData } = await supabase
          .from('users')
          .select('email, name, role')
          .eq('id', userId)
          .maybeSingle();

        try {
          const { error: insertErr } = await supabase
            .from('audit_logs')
            .insert([
              {
                user_id: userId,
                user_name: userData?.name || userData?.email || 'User',
                user_email: userData?.email || '',
                role: userData?.role || 'user',
                action: 'Logout',
                details: 'User logged out of application',
                ip_address: Platform.OS === 'ios' ? 'iOS Device' : 'Android Device',
                created_at: new Date().toISOString()
              }
            ]);
          if (insertErr) console.log('Audit log insert note:', insertErr.message);
        } catch (insertErr) {
          console.log('Audit log write skipped:', insertErr.message);
        }
      }
    } catch (err) {
      console.error('Logout logging error:', err);
    } finally {
      if (onLogout) {
        await onLogout();
      } else if (onNavigate) {
        onNavigate('login');
      } else if (navigation?.replace) {
        navigation.replace('Login');
      }
    }
  };

  const handleSystemLogout = () => {
    Alert.alert(
      'Logout Confirmation',
      'Are you sure you want to log out of Sonoband?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: executeLogout }
      ]
    );
  };

  const handleBackNavigation = () => {
    if (navigation?.goBack) {
      navigation.goBack();
    } else if (onNavigate) {
      onNavigate('dashboard');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E293B" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBackNavigation}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Application Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Screen Body */}
      <View style={styles.body}>
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          {/* Notifications Section */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notifications & Alerts</Text>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingSub}>Receive real-time alerts for sound events</Text>
              </View>
              <Switch
                value={pushNotifications}
                onValueChange={setPushNotifications}
                trackColor={{ false: '#334155', true: '#06B6D4' }}
                thumbColor={pushNotifications ? '#F8FAFC' : '#94A3B8'}
              />
            </View>

            <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Wrist Vibration Alerts</Text>
                <Text style={styles.settingSub}>Trigger Sonoband hardware vibration</Text>
              </View>
              <Switch
                value={vibrationAlerts}
                onValueChange={setVibrationAlerts}
                trackColor={{ false: '#334155', true: '#06B6D4' }}
                thumbColor={vibrationAlerts ? '#F8FAFC' : '#94A3B8'}
              />
            </View>
          </View>

          {/* Preferences Section */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>App Preferences</Text>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Dark Slate Theme</Text>
                <Text style={styles.settingSub}>Keep dark contrast active across screens</Text>
              </View>
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: '#334155', true: '#06B6D4' }}
                thumbColor={darkMode ? '#F8FAFC' : '#94A3B8'}
              />
            </View>

            <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Cloud Data Sync</Text>
                <Text style={styles.settingSub}>Automatically upload logs to Supabase</Text>
              </View>
              <Switch
                value={autoSync}
                onValueChange={setAutoSync}
                trackColor={{ false: '#334155', true: '#06B6D4' }}
                thumbColor={autoSync ? '#F8FAFC' : '#94A3B8'}
              />
            </View>
          </View>
        </ScrollView>

        {/* Anchored Sign Out Button */}
        <View style={styles.footerBar}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleSystemLogout} activeOpacity={0.8}>
            <Feather name="power" size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Sign Out Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: '#334155' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  body: { flex: 1, justifyContent: 'space-between' },
  scrollContainer: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 20 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 12 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  settingLabel: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  settingSub: { color: '#94A3B8', fontSize: 12, marginTop: 2, paddingRight: 8 },
  footerBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 20 : 16,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  logoutText: { color: '#EF4444', fontWeight: '700', marginLeft: 8, fontSize: 16 },
});