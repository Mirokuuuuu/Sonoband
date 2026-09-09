import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function CaregiverDashboard({ navigation, onNavigate, userId, route }) {
  const activeUserId = userId || route?.params?.userId;
  
  const [patientCount, setPatientCount] = useState(0);
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const navigateTo = (screen, params = {}) => {
    // Standardize passing activeUserId if navigating to profile
    const enrichedParams = screen === 'profile' ? { userId: activeUserId, ...params } : params;
    if (onNavigate) {
      onNavigate(screen, enrichedParams);
    } else if (navigation?.navigate) {
      navigation.navigate(screen, enrichedParams);
    }
  };

  // Fetch Dashboard Metrics
  const fetchDashboardMetrics = useCallback(async () => {
    try {
      // 1. Resolve Auth User ID if not provided as prop
      let currentUserId = activeUserId;
      if (!currentUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        currentUserId = user?.id;
      }

      if (!currentUserId) return;

      // 2. Fetch Assigned Patients Count for this specific caregiver
      const { count: patients, error: patientError } = await supabase
        .from('caregiver_links')
        .select('id', { count: 'exact', head: true })
        .eq('caregiver_id', currentUserId);

      if (!patientError && patients !== null) {
        setPatientCount(patients);
      }

      // 3. Fetch Active Unread Notifications/Alerts for this caregiver
      const { count: alerts, error: alertError } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', currentUserId)
        .eq('is_read', false);

      if (!alertError && alerts !== null) {
        setActiveAlertCount(alerts);
      }
    } catch (err) {
      console.error('Error fetching caregiver metrics:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeUserId]);

  useEffect(() => {
    fetchDashboardMetrics();

    // Set up Realtime listener for incoming notifications
    const channel = supabase
      .channel('caregiver_dashboard_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => fetchDashboardMetrics()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDashboardMetrics]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardMetrics();
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
          } catch (e) {
            console.log('Error logging out:', e.message);
          } finally {
            navigateTo('login');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Caregiver Portal</Text>
          <Text style={styles.headerSub}>Monitoring & Patient Overview</Text>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigateTo('caregiverNotifications')}
          >
            <Feather name="bell" size={20} color="#38BDF8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: '#451A03', marginLeft: 8 }]}
            onPress={handleLogout}
          >
            <Feather name="log-out" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />
        }
      >
        {/* Quick Stats Grid */}
        <View style={styles.statsRow}>
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => navigateTo('assignedPatients')}
          >
            <Ionicons name="people-outline" size={24} color="#06B6D4" />
            {loading ? (
              <ActivityIndicator color="#06B6D4" style={{ marginVertical: 6 }} />
            ) : (
              <Text style={styles.statNumber}>{patientCount}</Text>
            )}
            <Text style={styles.statLabel}>Assigned Patients</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => navigateTo('caregiverNotifications')}
          >
            <Feather name="alert-triangle" size={24} color="#EF4444" />
            {loading ? (
              <ActivityIndicator color="#EF4444" style={{ marginVertical: 6 }} />
            ) : (
              <Text style={[styles.statNumber, activeAlertCount > 0 && { color: '#EF4444' }]}>
                {activeAlertCount}
              </Text>
            )}
            <Text style={styles.statLabel}>Active Alerts</Text>
          </TouchableOpacity>
        </View>

        {/* Action Quick Links */}
        <Text style={styles.sectionTitle}>Quick Management</Text>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigateTo('assignedPatients')}
        >
          <View style={styles.actionIconBg}>
            <Ionicons name="medical-outline" size={22} color="#06B6D4" />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={styles.actionTitle}>Assigned Patients</Text>
            <Text style={styles.actionSub}>View patient health updates and status</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#64748B" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigateTo('groupManagement')}
        >
          <View style={styles.actionIconBg}>
            <Feather name="users" size={22} color="#38BDF8" />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={styles.actionTitle}>Family Group Settings</Text>
            <Text style={styles.actionSub}>Manage group members and invite codes</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#64748B" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionCard}
          onPress={() => navigateTo('caregiverNotifications')}
        >
          <View style={styles.actionIconBg}>
            <Feather name="bell" size={22} color="#F59E0B" />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={styles.actionTitle}>Caregiver Notifications</Text>
            <Text style={styles.actionSub}>Review urgent triggers and logs</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#64748B" />
        </TouchableOpacity>
      </ScrollView>

      {/* Centered Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        {/* Tab 1: Home */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigateTo('caregiverDashboard')}
        >
          <Feather name="home" size={22} color="#38BDF8" />
          <Text style={[styles.navText, styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        {/* Tab 2: Patients */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigateTo('assignedPatients')}
        >
          <Ionicons name="people-outline" size={22} color="#94A3B8" />
          <Text style={styles.navText}>Patients</Text>
        </TouchableOpacity>

        {/* Tab 3: Groups */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigateTo('groupManagement')}
        >
          <MaterialCommunityIcons name="account-group-outline" size={22} color="#94A3B8" />
          <Text style={styles.navText}>Groups</Text>
        </TouchableOpacity>

        {/* Tab 4: Profile */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigateTo('profile', { userRole: 'caregiver' })}
        >
          <Feather name="user" size={22} color="#94A3B8" />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitleContainer: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  headerSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: '#334155' },
  scrollContent: { padding: 16, paddingBottom: 90 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statNumber: { fontSize: 22, fontWeight: '800', color: '#F8FAFC', marginVertical: 4 },
  statLabel: { fontSize: 12, color: '#94A3B8', textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 12 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionIconBg: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionTextContainer: { flex: 1, marginLeft: 12 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  actionSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 65,
    backgroundColor: '#1E293B',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  navText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 3,
    textAlign: 'center',
  },
  activeNavText: {
    color: '#38BDF8',
    fontWeight: '700',
  },
});