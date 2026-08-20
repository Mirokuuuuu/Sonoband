import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function NotificationScreen({ navigation, onNavigate, userId }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [userId]);

  const formatLocalDateTime = (dateString) => {
    if (!dateString || typeof dateString !== 'string') {
      return { dateStr: 'N/A', timeStr: '' };
    }
    let formattedStr = dateString.replace(' ', 'T');
    if (!formattedStr.endsWith('Z') && !formattedStr.includes('+')) {
      formattedStr += 'Z';
    }
    const localDate = new Date(formattedStr);
    return {
      dateStr: localDate.toLocaleDateString(),
      timeStr: localDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error || !data) {
        setNotifications([]);
      } else {
        setNotifications(data);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear Notifications',
      'Are you sure you want to clear all notification logs from view?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: () => setNotifications([]) },
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBackNavigation}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>System Notifications</Text>
          <Text style={styles.headerSub}>Audit & Session History</Text>
        </View>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#06B6D4" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id?.toString() || item.created_at || Math.random().toString()}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
              tintColor="#06B6D4"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="bell-off" size={48} color="#475569" />
              <Text style={styles.emptyText}>No event activity recorded.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const { dateStr, timeStr } = formatLocalDateTime(item.created_at);
            const isLogout = item.action === 'Logout';

            return (
              <View style={styles.itemCard}>
                <View style={[styles.iconWrapper, isLogout && { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                  <Feather
                    name={isLogout ? "power" : "shield"}
                    size={20}
                    color={isLogout ? "#EF4444" : "#38BDF8"}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.actionTitle}>{item.action || 'System Event'}</Text>
                  <Text style={styles.detailsText}>{item.details || 'No details specified.'}</Text>
                  <Text style={styles.timeText}>{dateStr} • {timeStr}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: '#334155' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#F8FAFC' },
  headerSub: { fontSize: 12, color: '#94A3B8' },
  clearText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  itemCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconWrapper: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  actionTitle: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  detailsText: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  timeText: { fontSize: 11, color: '#64748B', marginTop: 6 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#64748B', fontSize: 15, marginTop: 12 },
});