import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function CaregiverNotificationsScreen({ navigation, onNavigate, userId }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Helper to standardise and parse timestamp dates
  const parseTimestamp = (dateString) => {
    if (!dateString) return null;
    let formattedStr = typeof dateString === 'string' ? dateString.trim().replace(' ', 'T') : dateString;
    if (typeof formattedStr === 'string' && !formattedStr.endsWith('Z') && !formattedStr.includes('+')) {
      formattedStr += 'Z';
    }
    const parsedDate = new Date(formattedStr);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
  };

  const formatLocalDateTime = (dateString) => {
    const localDate = parseTimestamp(dateString);
    if (!localDate) return 'Recently';

    const dateStr = localDate.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = localDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return `${dateStr} • ${timeStr}`;
  };

  const getActiveCaregiverId = async () => {
    if (userId && !isNaN(Number(userId))) return Number(userId);

    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.email) {
      const { data: customUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', userData.user.email)
        .maybeSingle();

      if (customUser?.id) return customUser.id;
    }
    return userData?.user?.id || null;
  };

  const fetchCaregiverNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const caregiverId = await getActiveCaregiverId();
      if (!caregiverId) return;

      // 1. Get linked patients assigned to this caregiver
      const { data: links } = await supabase
        .from('caregiver_links')
        .select('patient_id')
        .eq('caregiver_id', caregiverId);

      const patientIds = (links || []).map((link) => link.patient_id);
      const targetUserIds = [caregiverId, ...patientIds];

      // 2. Fetch Notifications AND Audit Logs
      const [notifRes, auditRes] = await Promise.all([
        supabase
          .from('notifications')
          .select('*')
          .in('user_id', targetUserIds)
          .in('notification_type', ['group_created', 'location_update', 'geofence_alert'])
          .order('created_at', { ascending: false }),
        supabase
          .from('audit_logs')
          .select('*')
          .in('user_id', targetUserIds)
          .in('action', ['login', 'logout'])
          .order('created_at', { ascending: false })
      ]);

      if (notifRes.error) throw notifRes.error;
      if (auditRes.error) throw auditRes.error;

      const rawNotifs = notifRes.data || [];

      // 3. Format notifications (Group & Location Events)
      const formattedNotifs = rawNotifs.map((item) => ({
        id: `notif_${item.id}`,
        type: item.notification_type,
        title: item.title,
        message: item.message,
        metadata: item.metadata,
        created_at: item.created_at,
      }));

      // 4. Format audit logs (Login & Logout Events mapped, but filtered out below)
      const formattedAudits = (auditRes.data || []).map((item) => ({
        id: `audit_${item.id}`,
        type: item.action, // 'login' or 'logout'
        title: `${item.user_name || 'User'} (${item.action.toUpperCase()})`,
        message: item.details || `${item.user_name || 'User'} performed ${item.action}.`,
        metadata: null,
        created_at: item.created_at,
      }));

      // 5. Combine and filter out login/logout events from being displayed
      const combined = [...formattedNotifs, ...formattedAudits]
        .filter((item) => item.type !== 'login' && item.type !== 'logout')
        .sort((a, b) => {
          const dateA = parseTimestamp(a.created_at) || new Date(0);
          const dateB = parseTimestamp(b.created_at) || new Date(0);
          return dateB - dateA;
        });

      setNotifications(combined);
    } catch (err) {
      console.error("Error fetching activity logs:", err.message);
      Alert.alert("Error", "Failed to load activity logs.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCaregiverNotifications();

    const channel = supabase
      .channel('caregiver_activity_stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => fetchCaregiverNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        () => fetchCaregiverNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCaregiverNotifications]);

  const handleGoBack = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('caregiverDashboard');
    } else if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  const getNotificationBadge = (type) => {
    const key = type?.toLowerCase() || '';

    if (key === 'group_created') return { icon: 'users', color: '#38BDF8', bg: '#38BDF820' };
    if (key === 'location_update' || key === 'geofence_alert') {
      return { icon: 'map-pin', color: '#F59E0B', bg: '#F59E0B20' };
    }

    return { icon: 'bell', color: '#38BDF8', bg: '#38BDF820' };
  };

  const renderItem = ({ item }) => {
    const badge = getNotificationBadge(item.type);
    const formattedTime = formatLocalDateTime(item.created_at);

    return (
      <View style={styles.card}>
        <View style={[styles.iconContainer, { backgroundColor: badge.bg }]}>
          <Feather name={badge.icon} size={22} color={badge.color} />
        </View>

        <View style={styles.textContainer}>
          <View style={styles.cardHeader}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.time}>{formattedTime}</Text>
          </View>
          <Text style={styles.message}>{item.message}</Text>
          {item.metadata && (
            <Text style={styles.metadata}>Location Details: {item.metadata}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activity & Location Logs</Text>
        <TouchableOpacity onPress={fetchCaregiverNotifications} style={styles.refreshButton}>
          <Feather name="refresh-cw" size={18} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Feather name="bell-off" size={40} color="#64748B" />
                <Text style={styles.emptyText}>No activity logs or notifications found.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backButton: { padding: 4 },
  backButtonText: { color: '#38BDF8', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold' },
  refreshButton: { padding: 4 },
  content: { flex: 1, padding: 16 },
  card: { backgroundColor: '#1E293B', padding: 14, borderRadius: 12, flexDirection: 'row', marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  iconContainer: { width: 42, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  textContainer: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  title: { color: '#F8FAFC', fontSize: 15, fontWeight: 'bold', flex: 1, marginRight: 8 },
  time: { color: '#64748B', fontSize: 11 },
  message: { color: '#94A3B8', fontSize: 13, lineHeight: 18 },
  metadata: { color: '#38BDF8', fontSize: 11, marginTop: 6, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#64748B', fontSize: 14 }
});