import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function AlertsScreen({ navigation, userId }) {
  const [alerts, setAlerts] = useState([]);
  const [filteredAlerts, setFilteredAlerts] = useState([]);

  // Filter States
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState('ALL');

  // Helper function to safely parse DB timestamps to local Date object
  const parseTimestamp = (timestamp) => {
    if (!timestamp) return null;
    
    // Ensure string ISO format ends with 'Z' if missing offset (forces UTC interpretation)
    let formattedTs = typeof timestamp === 'string' ? timestamp.trim() : timestamp;
    if (typeof formattedTs === 'string' && !formattedTs.endsWith('Z') && !formattedTs.includes('+')) {
      formattedTs = formattedTs.replace(' ', 'T') + 'Z';
    }

    const d = new Date(formattedTs);
    return isNaN(d.getTime()) ? null : d;
  };

  // Fetch alerts directly from Supabase
  const fetchAlerts = useCallback(async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('detected_at', { ascending: false });

    if (error) {
      console.error('Error fetching alerts:', error.message);
      return;
    }

    if (data) {
      setAlerts(data);
    }
  }, [userId]);

  // Run initial fetch and re-run whenever the screen gains focus
  useEffect(() => {
    fetchAlerts();

    if (navigation?.addListener) {
      const unsubscribeFocus = navigation.addListener('focus', () => {
        fetchAlerts();
      });
      return unsubscribeFocus;
    }
  }, [navigation, fetchAlerts]);

  // Real-time listener setup
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`public-alerts-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setAlerts((prevAlerts) => [payload.new, ...prevAlerts]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setAlerts((prevAlerts) =>
            prevAlerts.map((alert) => (alert.id === payload.new.id ? payload.new : alert))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
        const alertDate = parseTimestamp(item.detected_at);
        if (!alertDate) return false;
        return alertDate.getMonth() + 1 === parseInt(selectedMonth, 10);
      });
    }

    setFilteredAlerts(result);
  }, [alerts, selectedSeverity, selectedMonth]);

  const getSoundIcon = (soundType, metadata) => {
    const lowerType = (soundType || '').toLowerCase();
    const lowerMeta = (metadata || '').toLowerCase();

    if (lowerMeta.includes('left')) return 'arrow-back-circle-outline';
    if (lowerMeta.includes('right')) return 'arrow-forward-circle-outline';
    if (lowerType.includes('fire') || lowerType.includes('smoke')) return 'flame-outline';
    if (lowerType.includes('siren')) return 'alarm-outline';
    if (lowerType.includes('fall') || lowerType.includes('crash')) return 'warning-outline';
    if (lowerType.includes('glass')) return 'wine-outline';
    if (lowerType.includes('baby') || lowerType.includes('cry')) return 'sad-outline';
    if (lowerType.includes('doorbell') || lowerType.includes('bell')) return 'notifications-outline';
    if (lowerType.includes('dog') || lowerType.includes('bark')) return 'paw-outline';

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
    { label: 'Jan', value: '1' },
    { label: 'Feb', value: '2' },
    { label: 'Mar', value: '3' },
    { label: 'Apr', value: '4' },
    { label: 'May', value: '5' },
    { label: 'Jun', value: '6' },
    { label: 'Jul', value: '7' },
    { label: 'Aug', value: '8' },
    { label: 'Sep', value: '9' },
    { label: 'Oct', value: '10' },
    { label: 'Nov', value: '11' },
    { label: 'Dec', value: '12' },
  ];

  const severityList = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header Bar */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#38BDF8" />
          <Text style={styles.backText}>Dashboard</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.header}>Real-Time Sound Alerts</Text>

      {/* Filter Bar */}
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {/* Severity Filters */}
          <View style={styles.filterChipGroup}>
            <Ionicons name="options-outline" size={13} color="#64748B" style={styles.filterIcon} />
            {severityList.map((sev) => (
              <TouchableOpacity
                key={sev}
                activeOpacity={0.7}
                style={[styles.filterChip, selectedSeverity === sev && styles.activeFilterChip]}
                onPress={() => setSelectedSeverity(sev)}
              >
                <Text style={[styles.filterChipText, selectedSeverity === sev && styles.activeFilterText]}>
                  {sev}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.filterDivider} />

          {/* Month Filters */}
          <View style={styles.filterChipGroup}>
            <Ionicons name="calendar-outline" size={13} color="#64748B" style={styles.filterIcon} />
            {monthsList.map((m) => (
              <TouchableOpacity
                key={m.value}
                activeOpacity={0.7}
                style={[styles.filterChip, selectedMonth === m.value && styles.activeFilterChip]}
                onPress={() => setSelectedMonth(m.value)}
              >
                <Text style={[styles.filterChipText, selectedMonth === m.value && styles.activeFilterText]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Alert List */}
      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="notifications-off-outline" size={36} color="#64748B" />
            <Text style={styles.emptyText}>No sound alerts found.</Text>
            <Text style={styles.emptySubtext}>Try clearing or changing your filters.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const rawDate = parseTimestamp(item.detected_at);
          
          // Formats to the device's local timezone automatically
          const formattedTime = rawDate
            ? rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
            : 'Just now';

          const formattedDate = rawDate
            ? rawDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
            : '';

          const typeStyle = getAlertTypeStyle(item.alert_type);

          const displayTitle = item.sound_type
            ? item.sound_type
            : item.metadata
            ? `Sound Detected (${item.metadata.toUpperCase()})`
            : 'Loud Sound Detected';

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.soundTitleRow}>
                  <Ionicons name={getSoundIcon(item.sound_type, item.metadata)} size={20} color={typeStyle.text} style={{ marginRight: 8 }} />
                  <Text style={styles.soundType}>{displayTitle}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.timestamp}>{formattedTime}</Text>
                  {formattedDate ? <Text style={styles.dateText}>{formattedDate}</Text> : null}
                </View>
              </View>

              {item.metadata && (
                <View style={styles.cardBody}>
                  <Text style={styles.metadataText}>
                    Direction/Info: <Text style={{ color: '#F8FAFC', textTransform: 'capitalize' }}>{item.metadata}</Text>
                  </Text>
                </View>
              )}

              <View style={styles.cardFooter}>
                <View style={[styles.typeBadge, { backgroundColor: typeStyle.bg, borderColor: typeStyle.border }]}>
                  <Text style={[styles.typeBadgeText, { color: typeStyle.text }]}>
                    {(item.alert_type || 'LOW').toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
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
    paddingTop: 8,
  },
  topRow: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  backText: {
    color: '#38BDF8',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  header: {
    fontSize: 20,
    color: '#FFF',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  filterWrapper: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  filterChipGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterIcon: {
    marginRight: 6,
  },
  filterChip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  activeFilterChip: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  activeFilterText: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
  filterDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#334155',
    marginHorizontal: 8,
  },
  card: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  soundTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  soundType: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  timestamp: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  dateText: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },
  cardBody: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.5)',
  },
  metadataText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 10,
  },
  emptySubtext: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});