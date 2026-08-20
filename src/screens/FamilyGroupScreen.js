import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';

export default function FamilyGroupScreen({ route, navigation, onNavigate }) {
  const selectedGroup = route?.params?.group || {
    id: null,
    name: 'Group Details',
    invite_code: 'N/A',
  };

  const [activeTab, setActiveTab] = useState('Overview');
  const [members, setMembers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const initialLat = 14.5800;
  const initialLng = 121.0600;

  useEffect(() => {
    if (selectedGroup.id) {
      fetchGroupDetails();
    }
  }, [selectedGroup.id]);

  const fetchGroupDetails = async () => {
    setLoading(true);
    try {
      // 1. Fetch real group members from Supabase
      const { data: memberData, error: memberError } = await supabase
        .from('group_members')
        .select(`
          role,
          user_id,
          profiles (
            full_name,
            email
          )
        `)
        .eq('group_id', selectedGroup.id);

      if (!memberError && memberData) {
        setMembers(memberData);
      }

      // 2. Fetch group activity alerts
      const { data: alertsData, error: alertError } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!alertError && alertsData) {
        setAuditLogs(alertsData);
      }
    } catch (err) {
      console.log('Error fetching group info:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const leafletHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; background-color: #0F172A; }
        #map { width: 100%; height: 100vh; }
        .leaflet-tile-layer {
          filter: brightness(0.6) invert(100%) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([${initialLat}, ${initialLng}], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);

        var customIcon = L.divIcon({
          className: 'custom-div-icon',
          html: "<div style='background-color:#06B6D4;width:18px;height:18px;border-radius:50%;border:3px solid #FFFFFF;'></div>",
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        L.marker([${initialLat}, ${initialLng}], {icon: customIcon}).addTo(map)
          .bindPopup("<b>SonoBand User</b><br>Active location");
      </script>
    </body>
    </html>
  `;

  const handleBackNavigation = () => {
    if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    } else if (onNavigate) {
      onNavigate('groupManagement');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBackNavigation}>
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{selectedGroup.name}</Text>
          <Text style={styles.headerSub}>Invite Code: {selectedGroup.invite_code}</Text>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => Alert.alert('Share Code', `Share invite code "${selectedGroup.invite_code}" to join ${selectedGroup.name}.`)}
        >
          <Feather name="share-2" size={20} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {['Overview', 'Members', 'Live Map'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Dynamic Tab Views */}
      {loading ? (
        <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 40 }} />
      ) : activeTab === 'Live Map' ? (
        <View style={styles.mapContainer}>
          <WebView
            originWhitelist={['*']}
            source={{ html: leafletHTML }}
            style={{ flex: 1 }}
          />
        </View>
      ) : activeTab === 'Members' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>Group Members ({members.length})</Text>
          
          {members.map((m, index) => {
            const fullName = m.profiles?.full_name || m.profiles?.email || 'Group Member';
            const initials = fullName.substring(0, 2).toUpperCase();

            return (
              <View key={index} style={styles.memberCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.memberName}>{fullName}</Text>
                  <Text style={styles.memberRole}>{m.role ? m.role.toUpperCase() : 'MEMBER'}</Text>
                </View>
                <Feather name="check-circle" size={18} color="#10B981" />
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Live Device Status */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Live Device Status</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusBox}>
                <Feather name="battery-charging" size={20} color="#10B981" />
                <Text style={styles.statusValue}>--%</Text>
                <Text style={styles.statusLabel}>Battery</Text>
              </View>
              <View style={styles.statusBox}>
                <Feather name="wifi" size={20} color="#06B6D4" />
                <Text style={styles.statusValue}>Connected</Text>
                <Text style={styles.statusLabel}>Wi-Fi</Text>
              </View>
              <View style={styles.statusBox}>
                <Feather name="shield" size={20} color="#38BDF8" />
                <Text style={styles.statusValue}>Active</Text>
                <Text style={styles.statusLabel}>Protection</Text>
              </View>
            </View>
          </View>

          {/* Map Preview Card */}
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={styles.cardTitle}>Current Location</Text>
              <TouchableOpacity onPress={() => setActiveTab('Live Map')}>
                <Text style={{ color: '#38BDF8', fontWeight: '600', fontSize: 13 }}>Expand Map</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.miniMapContainer}>
              <WebView
                originWhitelist={['*']}
                source={{ html: leafletHTML }}
                style={{ flex: 1 }}
                scrollEnabled={false}
              />
            </View>
          </View>

          {/* Group Audit Log Preview */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Group Audit Trail</Text>
            {auditLogs.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 12 }}>No group sound alerts recorded yet.</Text>
            ) : (
              auditLogs.map((log) => (
                <View key={log.id} style={styles.activityItem}>
                  <Feather name="bell" size={16} color="#EF4444" style={{ marginTop: 2 }} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.activityTitle}>{log.sound_type || "Alert Detected"}</Text>
                    <Text style={styles.activityTime}>
                      {log.created_at ? new Date(log.created_at).toLocaleTimeString() : 'Recently'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 44, paddingBottom: 12, backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#334155' },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: '#334155' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  headerSub: { fontSize: 12, color: '#94A3B8' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#1E293B', padding: 6, borderBottomWidth: 1, borderBottomColor: '#334155' },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  activeTabButton: { backgroundColor: '#06B6D4' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  activeTabText: { color: '#0F172A', fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  mapContainer: { flex: 1 },
  card: { backgroundColor: '#1E293B', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statusBox: { flex: 1, backgroundColor: '#0F172A', borderRadius: 10, padding: 12, alignItems: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#334155' },
  statusValue: { fontSize: 14, fontWeight: '700', color: '#F8FAFC', marginTop: 6 },
  statusLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  miniMapContainer: { height: 160, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 12 },
  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#06B6D4', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#0F172A', fontWeight: '700', fontSize: 14 },
  memberName: { color: '#F8FAFC', fontWeight: '600', fontSize: 14 },
  memberRole: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  activityItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  activityTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  activityTime: { color: '#64748B', fontSize: 11, marginTop: 2 }
});