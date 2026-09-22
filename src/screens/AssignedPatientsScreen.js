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
import { Feather } from '@expo/vector-icons';
import { supabase, logSystemActivity } from '../services/supabaseClient';

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

  const getSeverityBadge = (type) => {
    switch (type?.toLowerCase()) {
      case 'emergency':
      case 'alert':
      case 'high':
        return { label: 'High Severity', color: '#EF4444', bg: '#EF444420', icon: 'volume-2' };
      case 'warning':
      case 'medium':
        return { label: 'Moderate Level', color: '#F59E0B', bg: '#F59E0B20', icon: 'volume-1' };
      default:
        return { label: 'Normal / Info', color: '#10B981', bg: '#10B98120', icon: 'volume-x' };
    }
  };

  const renderPatientCard = ({ item }) => {
    const badge = getSeverityBadge(item.latestAlert?.notification_type);

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

        <View style={[styles.statusBox, { backgroundColor: badge.bg }]}>
          <Feather name={badge.icon} size={16} color={badge.color} />
          <Text style={[styles.statusText, { color: badge.color }]}>
            {item.latestAlert ? `${item.latestAlert.title || 'Notification'} (${badge.label})` : 'No Recent Alerts'}
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
                  const badge = getSeverityBadge(item.notification_type);
                  return (
                    <View style={styles.alertCard}>
                      <View style={[styles.alertIcon, { backgroundColor: badge.bg }]}>
                        <Feather name={badge.icon} size={18} color={badge.color} />
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