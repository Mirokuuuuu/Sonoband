import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function AlertsScreen({ navigation, userId }) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    if (!userId) return;

    fetchAlerts();

    // Real-time listener for incoming sound detection alerts from ESP32 -> Supabase
    const subscription = supabase
      .channel('public:alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
        if (payload.new.user_id === userId) {
          setAlerts((prevAlerts) => [payload.new, ...prevAlerts]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userId]);

  const fetchAlerts = async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAlerts(data);
    }
  };

  // Helper to pick an icon based on detected sound type
  const getSoundIcon = (soundType) => {
    const lower = (soundType || '').toLowerCase();
    if (lower.includes('siren')) return 'alarm-outline';
    if (lower.includes('horn')) return 'car-outline';
    if (lower.includes('bark')) return 'paw-outline';
    if (lower.includes('alarm')) return 'warning-outline';
    return 'volume-high-outline';
  };

  return (
    <View style={styles.container}>
      {/* Back Button Header */}
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => navigation && navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={22} color="#38BDF8" />
        <Text style={styles.backText}>Dashboard</Text>
      </TouchableOpacity>

      <Text style={styles.header}>Real-Time Sound Alerts</Text>
      <Text style={styles.subHeader}>Live log of target ambient sounds identified by SonoBand</Text>

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="notifications-off-outline" size={40} color="#64748B" />
            <Text style={styles.emptyText}>No sound alerts detected yet.</Text>
            <Text style={styles.emptySubtext}>Detected sounds from your band will appear here in real-time.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const formattedTime = item.created_at 
            ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : 'Just now';

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.soundTitleRow}>
                  <Ionicons name={getSoundIcon(item.sound_type)} size={22} color="#38BDF8" style={{ marginRight: 8 }} />
                  <Text style={styles.soundType}>{item.sound_type || "Loud Sound Detected"}</Text>
                </View>
                <Text style={styles.timestamp}>{formattedTime}</Text>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    Direction: {item.metadata ? item.metadata.toUpperCase() : 'CENTER'}
                  </Text>
                </View>

                {item.location && (
                  <Text style={styles.locationText}>Location: {item.location}</Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16, paddingTop: 50 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backText: { color: '#38BDF8', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  header: { fontSize: 22, color: '#fff', fontWeight: 'bold', marginBottom: 4 },
  subHeader: { fontSize: 13, color: '#94a3b8', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  soundTitleRow: { flexDirection: 'row', alignItems: 'center' },
  soundType: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  timestamp: { color: '#64748B', fontSize: 12, fontWeight: '500' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { backgroundColor: '#0284C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  locationText: { color: '#94A3B8', fontSize: 12 },
  emptyCard: { backgroundColor: '#1e293b', padding: 30, borderRadius: 12, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: '#334155' },
  emptyText: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', marginTop: 12 },
  emptySubtext: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 4 }
});