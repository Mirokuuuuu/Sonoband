import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  StatusBar,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function SettingsScreen({ navigation, onNavigate, userId, onLogout }) {

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

  // Navigates directly to the Forgot Password screen
  const handleNavigateToForgotPassword = () => {
    if (onNavigate) {
      onNavigate('forgotPassword');
    } else if (navigation?.navigate) {
      navigation.navigate('ForgotPassword');
    }
  };

  const handleNavigateToDeviceSettings = () => {
    if (onNavigate) {
      onNavigate('deviceControl');
    } else if (navigation?.navigate) {
      navigation.navigate('DeviceControl');
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
        <Text style={styles.headerTitle}>Account Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Screen Body */}
      <View style={styles.body}>
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            {/* Change Password (Navigates to Forgot Password) */}
            <TouchableOpacity 
              style={styles.settingRow} 
              onPress={handleNavigateToForgotPassword}
              activeOpacity={0.7}
            >
              <View style={styles.settingIconContainer}>
                <Feather name="lock" size={18} color="#06B6D4" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Change Password</Text>
                <Text style={styles.settingSub}>Reset or update your account password</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#64748B" />
            </TouchableOpacity>

            {/* Device Settings Option */}
            <TouchableOpacity 
              style={[styles.settingRow, { borderBottomWidth: 0 }]} 
              onPress={handleNavigateToDeviceSettings}
              activeOpacity={0.7}
            >
              <View style={styles.settingIconContainer}>
                <Feather name="cpu" size={18} color="#06B6D4" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Device Settings</Text>
                <Text style={styles.settingSub}>Manage paired Sonoband hardware & controls</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Sign Out Button */}
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
    padding: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  settingIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingLabel: { color: '#F8FAFC', fontSize: 15, fontWeight: '600' },
  settingSub: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
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