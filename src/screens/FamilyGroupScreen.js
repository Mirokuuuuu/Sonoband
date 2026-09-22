import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase, logSystemActivity } from '../services/supabaseClient';

export default function FamilyGroupScreen({ route, navigation, onNavigate, userRole }) {
  // Gracefully handles both direct route params and custom state navigation
  const selectedGroup = route?.params?.group || {
    id: null,
    group_name: 'Group Details',
    name: 'Group Details',
    invite_code: 'N/A',
    owner_id: null,
  };

  const groupName = selectedGroup.group_name || selectedGroup.name || 'Group Details';

  const [activeTab, setActiveTab] = useState('Overview');
  const [members, setMembers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Dynamic coordinates fetched from live user locations
  const [mapCoords, setMapCoords] = useState({ latitude: 14.5800, longitude: 121.0600 });

  useEffect(() => {
    fetchUserAndRoleStatus();
    if (selectedGroup.id) {
      fetchGroupDetails();
      fetchGroupLocation();
    }
  }, [selectedGroup.id]);

  const fetchUserAndRoleStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let { data: userData } = await supabase
        .from('users')
        .select('*')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .maybeSingle();

      const activeUserId = userData?.id || userData?.user_id || user.id;
      setCurrentUserId(activeUserId);

      // Check ownership
      const ownerMatch =
        String(activeUserId) === String(selectedGroup.owner_id) ||
        String(user.id) === String(selectedGroup.owner_id);

      setIsOwner(ownerMatch);
    } catch (err) {
      console.log('Error verifying user status:', err.message);
    }
  };

  const fetchGroupLocation = async () => {
    try {
      const { data: locData } = await supabase
        .from('user_locations')
        .select('latitude, longitude')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (locData?.latitude && locData?.longitude) {
        setMapCoords({
          latitude: Number(locData.latitude),
          longitude: Number(locData.longitude),
        });
      }
    } catch (err) {
      console.log('Location fetch fallback:', err.message);
    }
  };

  const fetchGroupDetails = async () => {
    setLoading(true);
    try {
      const { data: memberData, error: memberError } = await supabase
        .from('group_members')
        .select(`
          role,
          user_id,
          users (
            full_name,
            name,
            email
          )
        `)
        .eq('group_id', selectedGroup.id);

      if (!memberError && memberData) {
        setMembers(memberData);
      }

      const { data: alertsData, error: alertError } = await supabase
        .from('alerts')
        .select('*')
        .eq('group_id', selectedGroup.id)
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

  const handleDeleteGroup = () => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const { error } = await supabase
                .from('groups')
                .delete()
                .eq('id', selectedGroup.id);

              if (error) {
                Alert.alert('Error', error.message);
              } else {
                if (currentUserId && logSystemActivity) {
                  try {
                    await logSystemActivity(
                      currentUserId,
                      'delete_group',
                      `Deleted family group: ${groupName}`,
                      { groupId: selectedGroup.id }
                    );
                  } catch (aErr) {
                    console.log('Audit log skipped:', aErr.message);
                  }
                }
                Alert.alert('Success', 'Group deleted successfully.');
                handleBackNavigation();
              }
            } catch (err) {
              Alert.alert('Error', 'An unexpected error occurred while deleting the group.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      `Are you sure you want to leave "${groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            if (!currentUserId) return;
            setActionLoading(true);
            try {
              const { error } = await supabase
                .from('group_members')
                .delete()
                .eq('group_id', selectedGroup.id)
                .eq('user_id', currentUserId);

              if (error) {
                Alert.alert('Error', error.message);
              } else {
                if (logSystemActivity) {
                  try {
                    await logSystemActivity(
                      currentUserId,
                      'leave_group',
                      `Left family group: ${groupName}`,
                      { groupId: selectedGroup.id }
                    );
                  } catch (aErr) {
                    console.log('Audit log skipped:', aErr.message);
                  }
                }
                Alert.alert('Success', 'You have left the group.');
                handleBackNavigation();
              }
            } catch (err) {
              Alert.alert('Error', 'An unexpected error occurred while leaving the group.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
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
        var map = L.map('map', { zoomControl: false }).setView([${mapCoords.latitude}, ${mapCoords.longitude}], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

        var customIcon = L.divIcon({
          className: 'custom-div-icon',
          html: "<div style='background-color:#06B6D4;width:18px;height:18px;border-radius:50%;border:3px solid #FFFFFF;'></div>",
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        L.marker([${mapCoords.latitude}], [${mapCoords.longitude}], {icon: customIcon}).addTo(map)
          .bindPopup("<b>SonoBand Member</b><br>Active location");
      </script>
    </body>
    </html>
  `;

  const handleBackNavigation = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('groupManagement');
    } else if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBackNavigation}>
          <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{groupName}</Text>
          <Text style={styles.headerSub}>
            {selectedGroup.id ? `Code: ${selectedGroup.invite_code}` : 'Family Group'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {selectedGroup.id && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => Alert.alert('Invite Code', `Share this code to let others join: ${selectedGroup.invite_code}`)}
            >
              <Feather name="share-2" size={18} color="#38BDF8" />
            </TouchableOpacity>
          )}

          {isOwner && selectedGroup.id && (
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: '#451A03' }]}
              onPress={handleDeleteGroup}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Feather name="trash-2" size={18} color="#EF4444" />
              )}
            </TouchableOpacity>
          )}

          {!isOwner && selectedGroup.id && (
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: '#451A03' }]}
              onPress={handleLeaveGroup}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Feather name="log-out" size={18} color="#EF4444" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab Selectors */}
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

      {/* Main Views */}
      {loading ? (
        <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 40 }} />
      ) : activeTab === 'Live Map' ? (
        <View style={styles.mapContainer}>
          <WebView originWhitelist={['*']} source={{ html: leafletHTML }} style={{ flex: 1 }} />
        </View>
      ) : activeTab === 'Members' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>Group Members ({members.length})</Text>

          {members.map((m, index) => {
            const fullName = m.users?.full_name || m.users?.name || m.users?.email || 'Member';
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
          {/* Status Metrics */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Device telemetry</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusBox}>
                <Feather name="battery-charging" size={20} color="#10B981" />
                <Text style={styles.statusValue}>92%</Text>
                <Text style={styles.statusLabel}>Battery</Text>
              </View>
              <View style={styles.statusBox}>
                <Feather name="wifi" size={20} color="#06B6D4" />
                <Text style={styles.statusValue}>Online</Text>
                <Text style={styles.statusLabel}>Network</Text>
              </View>
              <View style={styles.statusBox}>
                <Feather name="shield" size={20} color="#38BDF8" />
                <Text style={styles.statusValue}>Active</Text>
                <Text style={styles.statusLabel}>Alert Monitor</Text>
              </View>
            </View>
          </View>

          {/* Location Map Preview */}
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

          {/* Sound Alert Audit Log */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Group Sound Alerts</Text>
            {auditLogs.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 12 }}>No alerts recorded for this group.</Text>
            ) : (
              auditLogs.map((log) => (
                <View key={log.id} style={styles.activityItem}>
                  <Feather name="bell" size={16} color="#EF4444" style={{ marginTop: 2 }} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.activityTitle}>{log.sound_type || 'Alert Triggered'}</Text>
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
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  iconButton: { padding: 8, borderRadius: 10, backgroundColor: '#334155' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  headerSub: { fontSize: 12, color: '#94A3B8' },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  activeTabButton: { backgroundColor: '#06B6D4' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  activeTabText: { color: '#0F172A', fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 80 },
  mapContainer: { flex: 1 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statusBox: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusValue: { fontSize: 14, fontWeight: '700', color: '#F8FAFC', marginTop: 6 },
  statusLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  miniMapContainer: { height: 160, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 12 },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#06B6D4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#0F172A', fontWeight: '700', fontSize: 14 },
  memberName: { color: '#F8FAFC', fontWeight: '600', fontSize: 14 },
  memberRole: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  activityTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  activityTime: { color: '#64748B', fontSize: 11, marginTop: 2 },
});