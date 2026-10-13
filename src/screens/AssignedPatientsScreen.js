import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Modal,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase, logSystemActivity } from '../services/supabaseClient';

// Helper component to dynamically render vector icons from different libraries
const RenderDynamicIcon = ({ library, icon, size = 18, color = '#38BDF8' }) => {
  if (library === 'Ionicons') {
    return <Ionicons name={icon} size={size} color={color} />;
  }
  if (library === 'MaterialCommunityIcons') {
    return <MaterialCommunityIcons name={icon} size={size} color={color} />;
  }
  return <Feather name={icon} size={size} color={color} />;
};

export default function AssignedPatientsScreen({ navigation, onNavigate, userId }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Patient Alerts Modal State
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientAlerts, setPatientAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  // Resolves the current caregiver's integer user_id from public.users
  const getActiveCaregiverId = async () => {
    if (userId) return Number(userId);

    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.email) {
      const { data: customUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', userData.user.email)
        .maybeSingle();

      if (customUser?.id) return Number(customUser.id);
    }
    return null;
  };

  const fetchAssignedPatients = useCallback(async () => {
    setLoading(true);
    try {
      const caregiverId = await getActiveCaregiverId();
      if (!caregiverId) {
        setPatients([]);
        return;
      }

      // Query caregiver_links foreign key joined with users table
      const { data, error } = await supabase
        .from('caregiver_links')
        .select(`
          id,
          created_at,
          patient:users!patient_id (
            id,
            name,
            email,
            role
          )
        `)
        .eq('caregiver_id', caregiverId);

      if (error) throw error;

      // Fetch latest notification for each patient from public.notifications
      const patientList = data || [];
      const formattedPatients = await Promise.all(
        patientList.map(async (item) => {
          const patientId = item.patient?.id;
          let latestAlert = null;

          if (patientId) {
            const { data: notificationData } = await supabase
              .from('notifications')
              .select('*')
              .eq('user_id', patientId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            latestAlert = notificationData;
          }

          return {
            linkId: item.id,
            patientId: item.patient?.id,
            name: item.patient?.name || 'Unknown User',
            email: item.patient?.email || 'No email',
            role: item.patient?.role || 'user',
            linkedAt: item.created_at,
            latestAlert: latestAlert || null
          };
        })
      );

      setPatients(formattedPatients);
    } catch (err) {
      console.error("Error fetching assigned patients:", err.message);
      Alert.alert("Error", "Failed to load assigned patients list.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAssignedPatients();
  }, [fetchAssignedPatients]);

  // Fetch individual patient notification history
  const openPatientAlerts = async (patient) => {
    setSelectedPatient(patient);
    setAlertsLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', patient.patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPatientAlerts(data || []);
    } catch (err) {
      console.error("Error fetching patient alerts:", err.message);
      Alert.alert("Error", "Failed to load notification history.");
    } finally {
      setAlertsLoading(false);
    }
  };

  // Unlink patient action
  const handleUnlinkPatient = (linkId, identifier) => {
    Alert.alert(
      "Unlink Member",
      `Are you sure you want to remove ${identifier} from your assigned members?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: async () => {
            try {
              const caregiverId = await getActiveCaregiverId();
              const { error } = await supabase
                .from('caregiver_links')
                .delete()
                .eq('id', linkId);

              if (error) throw error;

              if (logSystemActivity && caregiverId) {
                try {
                  await logSystemActivity(caregiverId, 'unlink_patient', `Unlinked member: ${identifier}`);
                } catch (aErr) {
                  console.log("Audit log error:", aErr.message);
                }
              }

              Alert.alert("Success", "Member unlinked successfully.");
              fetchAssignedPatients();
            } catch (err) {
              Alert.alert("Error", "Failed to unlink member.");
            }
          }
        }
      ]
    );
  };

  const handleGoBack = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('caregiverDashboard');
    } else if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  // Sound Icon & Color Mapping logic aligned with NotificationScreen.js & AlertsScreen.js
  const getEventIcon = (title, message, notification_type, metadata) => {
    const safeTitle = typeof title === 'string' ? title : '';
    const safeMessage = typeof message === 'string' ? message : '';
    const safeType = typeof notification_type === 'string' ? notification_type : '';
    const safeMeta = typeof metadata === 'string' ? metadata : (metadata ? JSON.stringify(metadata) : '');

    const text = `${safeTitle} ${safeMessage} ${safeType} ${safeMeta}`.toLowerCase();

    // Sound Detections
    if (safeType === 'sound_detection' || text.includes('siren') || text.includes('horn') || text.includes('bark') || text.includes('cry') || text.includes('knock') || text.includes('alarm') || text.includes('shout') || text.includes('glass') || text.includes('fall')) {
      if (text.includes('siren') || text.includes('emergency')) {
        return { library: 'Ionicons', icon: 'warning', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
      }
      if (text.includes('horn') || text.includes('car horn') || text.includes('vehicle')) {
        return { library: 'MaterialCommunityIcons', icon: 'car-horn', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
      }
      if (text.includes('bark') || text.includes('dog')) {
        return { library: 'MaterialCommunityIcons', icon: 'dog-side', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
      }
      if (text.includes('cry') || text.includes('baby')) {
        return { library: 'MaterialCommunityIcons', icon: 'baby-bottle-outline', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)' };
      }
      if (text.includes('knock') || text.includes('doorbell') || text.includes('door')) {
        return { library: 'MaterialCommunityIcons', icon: 'doorbell', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' };
      }
      if (text.includes('alarm') || text.includes('fire')) {
        return { library: 'Ionicons', icon: 'alarm-outline', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
      }
      if (text.includes('glass') || text.includes('fall')) {
        return { library: 'Ionicons', icon: 'wine-outline', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
      }
      if (text.includes('shout') || text.includes('scream') || text.includes('yell')) {
        return { library: 'Ionicons', icon: 'mega-outline', color: '#F97316', bg: 'rgba(249, 115, 22, 0.15)' };
      }
      return { library: 'Feather', icon: 'volume-2', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)' };
    }

    // Connectivity & Power
    if (safeType === 'connection_status' || text.includes('disconnected')) {
      return { library: 'Feather', icon: 'link-2', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
    }
    if (text.includes('connected') || text.includes('paired')) {
      return { library: 'Feather', icon: 'link', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.15)' };
    }

    // Battery
    if (safeType === 'battery_update' || text.includes('battery')) {
      return { library: 'Feather', icon: 'battery-charging', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.15)' };
    }

    return { library: 'Feather', icon: 'bell', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)' };
  };

  // Severity classification logic matching NotificationScreen format
  const getSeverityBadge = (type, title = '', message = '', metadata = '') => {
    const iconConfig = getEventIcon(title, message, type, metadata);
    const lowerType = (type || '').toLowerCase();

    if (lowerType === 'critical' || lowerType === 'emergency' || lowerType === 'alert' || lowerType === 'high') {
      return { label: 'High Severity', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', iconConfig };
    }
    if (lowerType === 'warning' || lowerType === 'medium') {
      return { label: 'Moderate Level', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', iconConfig };
    }
    return { label: 'Normal / Info', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', iconConfig };
  };

  const renderPatientCard = ({ item }) => {
    const alertItem = item.latestAlert;
    const badge = getSeverityBadge(
      alertItem?.notification_type, 
      alertItem?.title, 
      alertItem?.message, 
      alertItem?.metadata
    );

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.patientInfo}>
            <View style={styles.avatar}>
              <Feather name="user" size={20} color="#38BDF8" />
            </View>
            <View>
              <Text style={styles.patientName}>{item.name}</Text>
              <Text style={styles.patientEmail}>{item.email}</Text>
              <Text style={styles.linkedDate}>
                Linked: {item.linkedAt ? new Date(item.linkedAt).toLocaleDateString() : 'N/A'}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            onPress={() => handleUnlinkPatient(item.linkId, item.name || item.email)}
            style={styles.unlinkBtn}
          >
            <Feather name="user-x" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {/* Dynamic Severity Box aligned with Notification/Alert screen icon styling */}
        <View style={[styles.statusBox, { backgroundColor: badge.bg }]}>
          <RenderDynamicIcon 
            library={badge.iconConfig.library} 
            icon={badge.iconConfig.icon} 
            size={18} 
            color={badge.color} 
          />
          <Text style={[styles.statusText, { color: badge.color }]}>
            {alertItem ? `${alertItem.title || 'Notification'} (${badge.label})` : 'No Recent Alerts'}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.viewAlertsBtn} 
          onPress={() => openPatientAlerts(item)}
          activeOpacity={0.8}
        >
          <Text style={styles.viewAlertsText}>View Alert History</Text>
          <Feather name="chevron-right" size={16} color="#38BDF8" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Assigned Members</Text>
        <View style={styles.headerRightActions}>
          <TouchableOpacity onPress={fetchAssignedPatients} style={styles.actionBtn}>
            <Feather name="refresh-cw" size={18} color="#38BDF8" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={patients}
            keyExtractor={(item) => item.linkId.toString()}
            renderItem={renderPatientCard}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Feather name="users" size={40} color="#64748B" />
                <Text style={styles.emptyText}>No members assigned yet.</Text>
              </View>
            }
          />
        )}
      </View>

      {/* --- NOTIFICATIONS / ALERTS HISTORY MODAL --- */}
      <Modal visible={!!selectedPatient} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Alerts: {selectedPatient?.name}
              </Text>
              <TouchableOpacity onPress={() => setSelectedPatient(null)}>
                <Feather name="x" size={22} color="#F8FAFC" />
              </TouchableOpacity>
            </View>

            {alertsLoading ? (
              <ActivityIndicator color="#38BDF8" size="large" style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={patientAlerts}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => {
                  const iconConfig = getEventIcon(item.title, item.message, item.notification_type, item.metadata);
                  return (
                    <View style={styles.alertCard}>
                      <View style={[styles.alertIcon, { backgroundColor: iconConfig.bg }]}>
                        <RenderDynamicIcon 
                          library={iconConfig.library} 
                          icon={iconConfig.icon} 
                          size={18} 
                          color={iconConfig.color} 
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.alertTitle}>{item.title || 'Notification'}</Text>
                        <Text style={styles.alertMsg}>{item.message}</Text>
                        <Text style={styles.alertTime}>
                          {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                        </Text>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptyAlertsText}>No alerts logged for this member.</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backButton: { padding: 4 },
  backButtonText: { color: '#38BDF8', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold' },
  headerRightActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 4 },
  content: { flex: 1, padding: 16 },
  card: { backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  patientInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#38BDF820', justifyContent: 'center', alignItems: 'center' },
  patientName: { color: '#F8FAFC', fontSize: 15, fontWeight: 'bold' },
  patientEmail: { color: '#94A3B8', fontSize: 12, marginTop: 1 },
  linkedDate: { color: '#64748B', fontSize: 11, marginTop: 2 },
  unlinkBtn: { padding: 6 },
  statusBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, marginVertical: 12 },
  statusText: { fontSize: 13, fontWeight: '600', flex: 1 },
  viewAlertsBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#334155' },
  viewAlertsText: { color: '#38BDF8', fontSize: 13, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#64748B', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, maxHeight: '80%', borderWidth: 1, borderColor: '#334155' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  alertCard: { flexDirection: 'row', gap: 12, backgroundColor: '#0F172A', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  alertIcon: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  alertTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold' },
  alertMsg: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  alertTime: { color: '#64748B', fontSize: 10, marginTop: 4 },
  emptyAlertsText: { color: '#64748B', textAlign: 'center', marginVertical: 20 }
});