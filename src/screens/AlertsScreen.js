import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function AlertsScreen({ navigation, userId }) {
  const [alerts, setAlerts] = useState([]);
  const [filteredAlerts, setFilteredAlerts] = useState([]);

  // Filter States
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState('ALL');

  useEffect(() => {
    if (!userId) return;

    fetchAlerts();

    // Real-time listener for incoming sound detection alerts
    const subscription = supabase
      .channel('public:alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
        if (String(payload.new.user_id) === String(userId)) {
          setAlerts((prevAlerts) => [payload.new, ...prevAlerts]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alerts' }, (payload) => {
        if (String(payload.new.user_id) === String(userId)) {
          setAlerts((prevAlerts) =>
            prevAlerts.map((alert) => (alert.id === payload.new.id ? payload.new : alert))
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userId]);

  // Apply filters whenever alerts or filter selections change
  useEffect(() => {
    let result = [...alerts];

    // Filter by Severity
    if (selectedSeverity !== 'ALL') {
      result = result.filter(
        (item) => (item.alert_type || '').toLowerCase() === selectedSeverity.toLowerCase()
      );
    }

    // Filter by Month
    if (selectedMonth !== 'ALL') {
      result = result.filter((item) => {
        if (!item.detected_at) return false;
        const alertMonth = new Date(item.detected_at).getMonth() + 1; // 1-12
        return alertMonth === parseInt(selectedMonth, 10);
      });
    }

    setFilteredAlerts(result);
  }, [alerts, selectedSeverity, selectedMonth]);

  const fetchAlerts = async () => {
    if (!userId) return;

    // Convert userId to Number in case it is passed as a string
    const numericUserId = Number(userId);

    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', numericUserId)
      .order('detected_at', { ascending: false });

    if (error) {
      console.error('Error fetching alerts:', error.message);
    } else if (data) {
      setAlerts(data);
    }
  };

  const toggleAlertStatus = async (alertId, currentStatus) => {
    const newStatus = currentStatus === 'read' ? 'unread' : 'read';

    setAlerts((prev) =>
      prev.map((item) => (item.id === alertId ? { ...item, status: newStatus } : item))
    );

    const { error } = await supabase
      .from('alerts')
      .update({ status: newStatus })
      .eq('id', alertId);

    if (error) {
      console.error('Error updating status:', error.message);
      fetchAlerts();
    }
  };

  const markAllAsRead = async () => {
    if (!userId) return;

    setAlerts((prev) => prev.map((item) => ({ ...item, status: 'read' })));

    const { error } = await supabase
      .from('alerts')
      .update({ status: 'read' })
      .eq('user_id', Number(userId))
      .eq('status', 'unread');

    if (error) {
      console.error('Error marking all as read:', error.message);
      fetchAlerts();
    }
  };

  const getSoundIcon = (soundType) => {
    const lower = (soundType || '').toLowerCase();
    if (lower.includes('fire') || lower.includes('smoke')) return 'flame-outline';
    if (lower.includes('siren')) return 'alarm-outline';
    if (lower.includes('fall') || lower.includes('crash')) return 'warning-outline';
    if (lower.includes('glass')) return 'wine-outline';
    if (lower.includes('baby') || lower.includes('cry')) return 'sad-outline';
    if (lower.includes('doorbell') || lower.includes('bell')) return 'notifications-outline';
    if (lower.includes('dog') || lower.includes('bark')) return 'paw-outline';
    return 'volume-high-outline';
  };

  const getAlertTypeStyle = (alertType) => {
    switch ((alertType || '').toLowerCase()) {
      case 'critical':
        return { bg: 'rgba(239, 68, 68, 0.2)', text: '#EF4444', border: '#EF4444' };
      case 'high':
        return { bg: 'rgba(249, 115, 22, 0.2)', text: '#F97316', border: '#F97316' };
      case 'medium':
        return { bg: 'rgba(234, 179, 8, 0.2)', text: '#EAB308', border: '#EAB308' };
      case 'low':
      default:
        return { bg: 'rgba(56, 189, 248, 0.2)', text: '#38BDF8', border: '#38BDF8' };
    }
  };

  const monthsList = [
    { label: 'All Months', value: 'ALL' },
    { label: 'Jan (1)', value: '1' },
    { label: 'Feb (2)', value: '2' },
    { label: 'Mar (3)', value: '3' },
    { label: 'Apr (4)', value: '4' },
    { label: 'May (5)', value: '5' },
    { label: 'Jun (6)', value: '6' },
    { label: 'Jul (7)', value: '7' },
    { label: 'Aug (8)', value: '8' },
    { label: 'Sep (9)', value: '9' },
    { label: 'Oct (10)', value: '10' },
    { label: 'Nov (11)', value: '11' },
    { label: 'Dec (12)', value: '12' }
  ];

  const severityList = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation && navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#38BDF8" />
          <Text style={styles.backText}>Dashboard</Text>
        </TouchableOpacity>

        {alerts.some((a) => a.status === 'unread') && (
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.header}>Real-Time Sound Alerts</Text>
      <Text style={styles.subHeader}>Live log of target ambient sounds identified by SonoBand</Text>

      {/* Severity Filter ScrollView */}
      <Text style={styles.filterLabel}>Type / Severity:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
        {severityList.map((sev) => (
          <TouchableOpacity
            key={sev}
            style={[styles.filterChip, selectedSeverity === sev && styles.activeFilterChip]}
            onPress={() => setSelectedSeverity(sev)}
          >
            <Text style={[styles.filterChipText, selectedSeverity === sev && styles.activeFilterText]}>
              {sev}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Month Filter ScrollView */}
      <Text style={styles.filterLabel}>Month:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
        {monthsList.map((m) => (
          <TouchableOpacity
            key={m.value}
            style={[styles.filterChip, selectedMonth === m.value && styles.activeFilterChip]}
            onPress={() => setSelectedMonth(m.value)}
          >
            <Text style={[styles.filterChipText, selectedMonth === m.value && styles.activeFilterText]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Alert List */}
      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="notifications-off-outline" size={40} color="#64748B" />
            <Text style={styles.emptyText}>No sound alerts found.</Text>
            <Text style={styles.emptySubtext}>Try clearing or changing your filters.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const rawDate = item.detected_at ? new Date(item.detected_at) : null;
          const formattedTime = rawDate
            ? rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now';
          const formattedDate = rawDate
            ? rawDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
            : '';

          const typeStyle = getAlertTypeStyle(item.alert_type);

          return (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => toggleAlertStatus(item.id, item.status)}
              style={[styles.card, item.status === 'unread' && styles.unreadCard]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.soundTitleRow}>
                  <Ionicons name={getSoundIcon(item.sound_type)} size={22} color={typeStyle.text} style={{ marginRight: 8 }} />
                  <Text style={styles.soundType}>{item.sound_type || 'Loud Sound Detected'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.timestamp}>{formattedTime}</Text>
                  {formattedDate ? <Text style={styles.dateText}>{formattedDate}</Text> : null}
                </View>
              </View>

              {item.metadata && (
                <View style={styles.cardBody}>
                  <Text style={styles.metadataText}>
                    Direction/Info: <Text style={{ color: '#F8FAFC' }}>{item.metadata}</Text>
                  </Text>
                </View>
              )}

              <View style={styles.cardFooter}>
                <View style={[styles.typeBadge, { backgroundColor: typeStyle.bg, borderColor: typeStyle.border }]}>
                  <Text style={[styles.typeBadgeText, { color: typeStyle.text }]}>
                    {(item.alert_type || 'LOW').toUpperCase()}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.statusBadge,
                    { backgroundColor: item.status === 'read' ? 'rgba(100, 116, 139, 0.2)' : 'rgba(56, 189, 248, 0.2)' }
                  ]}
                  onPress={() => toggleAlertStatus(item.id, item.status)}
                >
                  <Text style={[styles.statusText, { color: item.status === 'read' ? '#94A3B8' : '#38BDF8' }]}>
                    {item.status ? item.status.toUpperCase() : 'UNREAD'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 10
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: '#38BDF8', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  markAllText: { color: '#38BDF8', fontSize: 13, fontWeight: '600' },
  header: { fontSize: 22, color: '#FFF', fontWeight: 'bold', marginBottom: 4 },
  subHeader: { fontSize: 13, color: '#94A3B8', marginBottom: 12 },
  filterLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  filterBar: { flexGrow: 0, marginBottom: 12 },
  filterChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  activeFilterChip: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  filterChipText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  activeFilterText: { color: '#0F172A', fontWeight: 'bold' },
  card: { backgroundColor: '#1E293B', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  unreadCard: { borderColor: '#38BDF8' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  soundTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  soundType: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  timestamp: { color: '#F8FAFC', fontSize: 12, fontWeight: '600' },
  dateText: { color: '#64748B', fontSize: 10, marginTop: 1 },
  cardBody: { marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(51, 65, 85, 0.5)' },
  metadataText: { color: '#94A3B8', fontSize: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  typeBadgeText: { fontSize: 11, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700' },
  emptyCard: { backgroundColor: '#1E293B', padding: 30, borderRadius: 12, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: '#334155' },
  emptyText: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', marginTop: 12 },
  emptySubtext: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 4 }
});