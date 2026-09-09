import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function CaregiverNotificationsScreen({ navigation, onNavigate, userId }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchCaregiverNotifications();
    }
  }, [userId]);

  const fetchCaregiverNotifications = async () => {
    setLoading(true);
    try {
      // Fetch notifications filtered for the caregiver
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error("Error fetching notifications:", err.message);
      Alert.alert("Error", "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('caregiverDashboard');
    } else if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  // Icon and color mapper based on notification_type
  const getNotificationBadge = (type) => {
    switch (type?.toLowerCase()) {
      case 'emergency':
        return { icon: 'alert-triangle', color: '#EF4444', bg: '#EF444420' }; // Red for SOS / Vitals
      case 'device':
        return { icon: 'cpu', color: '#F59E0B', bg: '#F59E0B20' }; // Amber for Device status
      case 'group':
        return { icon: 'users', color: '#38BDF8', bg: '#38BDF820' }; // Blue for Group changes
      default:
        return { icon: 'bell', color: '#10B981', bg: '#10B98120' }; // Green for System / Logins
    }
  };

  const renderItem = ({ item }) => {
    const badge = getNotificationBadge(item.notification_type);
    const formattedTime = item.created_at 
      ? new Date(item.created_at).toLocaleString() 
      : 'Recently';

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
          {item.metadata ? (
            <Text style={styles.metadata}>Ref: {item.metadata}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Caregiver Alerts</Text>
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
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Feather name="bell-off" size={40} color="#64748B" />
                <Text style={styles.emptyText}>No alerts or updates found.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0 },
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
  metadata: { color: '#38BDF8', fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#64748B', fontSize: 14 }
});