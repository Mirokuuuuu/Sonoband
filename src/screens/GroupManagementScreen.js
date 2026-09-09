import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  Alert, 
  Modal, 
  TextInput, 
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase, logSystemActivity } from '../services/supabaseClient';

export default function GroupManagementScreen({ navigation, onNavigate, userId, userRole: initialUserRole, currentScreen }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(initialUserRole ? String(initialUserRole).trim().toLowerCase() : null); // 'patient', 'user', or 'caregiver'
  
  // Modals
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
  
  // Input states
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  
  // Loading states for actions
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (userId && (currentScreen === 'groupManagement' || !currentScreen)) {
      fetchUserRoleAndGroups();
    }
  }, [userId, currentScreen]);

  const fetchUserRoleAndGroups = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Fetch User Role if not passed via props
      let detectedRole = initialUserRole ? String(initialUserRole).trim().toLowerCase() : 'patient';

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle();

      if (!userError && userData?.role) {
        detectedRole = String(userData.role).trim().toLowerCase();
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.role) {
          detectedRole = String(user.user_metadata.role).trim().toLowerCase();
        }
      }

      setUserRole(detectedRole);

      // 2. Fetch User Groups
      await fetchUserGroups();
    } catch (err) {
      console.error("Error initializing group management:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select(`
          group_id,
          role,
          groups (
            id,
            group_name,
            owner_id,
            invite_code,
            created_at
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      const formattedGroups = (data || [])
        .filter(item => item.groups !== null)
        .map(item => ({
          id: item.groups.id,
          name: item.groups.group_name,
          group_name: item.groups.group_name,
          owner_id: item.groups.owner_id,
          invite_code: item.groups.invite_code || 'N/A',
          created_at: item.groups.created_at,
          userRole: item.role
        }));

      setGroups(formattedGroups);
    } catch (err) {
      console.error("Error fetching groups:", err.message);
      Alert.alert("Error", "Failed to fetch group list.");
    }
  };

  const isCaregiver = userRole === 'caregiver';
  const isPatientOrUser = userRole === 'patient' || userRole === 'user' || !userRole;

  // --- CREATE GROUP ---
  const handleCreateGroup = async () => {
    if (isCaregiver) {
      Alert.alert("Permission Denied", "Caregivers cannot create groups.");
      return;
    }

    if (!newGroupName.trim()) {
      Alert.alert("Validation Error", "Please provide a valid group name.");
      return;
    }

    setActionLoading(true);
    try {
      const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const { data: newGroup, error: groupError } = await supabase
        .from('groups')
        .insert([{ group_name: newGroupName.trim(), owner_id: userId, invite_code: generatedCode }])
        .select()
        .single();

      if (groupError) throw groupError;

      const { error: memberError } = await supabase
        .from('group_members')
        .insert([{ group_id: newGroup.id, user_id: userId, role: 'admin' }]);

      if (memberError) throw memberError;

      // Audit Log Entry
      if (logSystemActivity) {
        try {
          await logSystemActivity(userId, 'create_group', `Created group: ${newGroupName.trim()}`, { groupId: newGroup.id });
        } catch (aErr) {
          console.log("Audit log skipped:", aErr.message);
        }
      }

      Alert.alert("Success", "New group created successfully!");
      setNewGroupName('');
      setIsCreateModalVisible(false);
      fetchUserGroups();
    } catch (err) {
      console.error("Error creating group:", err.message);
      Alert.alert("Error", "Unable to create group. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  // --- JOIN GROUP ---
  const handleJoinGroup = async () => {
    if (isPatientOrUser) {
      Alert.alert("Permission Denied", "Patients/Users cannot join external groups via code.");
      return;
    }

    const cleanCode = inviteCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      Alert.alert("Validation Error", "Please enter a valid invite code.");
      return;
    }

    setActionLoading(true);
    try {
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('id, group_name')
        .eq('invite_code', cleanCode)
        .maybeSingle();

      if (groupError || !group) {
        Alert.alert("Invalid Code", "No group was found matching that invite code.");
        setActionLoading(false);
        return;
      }

      const { data: existingMember } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', group.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingMember) {
        Alert.alert("Already Joined", `You are already a member of "${group.group_name}".`);
        setActionLoading(false);
        return;
      }

      const { error: joinError } = await supabase
        .from('group_members')
        .insert([{ group_id: group.id, user_id: userId, role: 'caregiver' }]);

      if (joinError) throw joinError;

      // Audit Log Entry
      if (logSystemActivity) {
        try {
          await logSystemActivity(userId, 'join_group', `Joined group: ${group.group_name}`, { groupId: group.id });
        } catch (aErr) {
          console.log("Audit log skipped:", aErr.message);
        }
      }

      Alert.alert("Success", `You have joined "${group.group_name}".`);
      setInviteCodeInput('');
      setIsJoinModalVisible(false);
      fetchUserGroups();
    } catch (err) {
      console.error("Error joining group:", err.message);
      Alert.alert("Error", "Failed to join group. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGroup = (groupId, groupName) => {
    Alert.alert(
      "Delete Group",
      `Are you sure you want to delete "${groupName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('groups')
                .delete()
                .eq('id', groupId);

              if (error) throw error;

              if (logSystemActivity) {
                try {
                  await logSystemActivity(userId, 'delete_group', `Deleted group: ${groupName}`, { groupId });
                } catch (aErr) {
                  console.log("Audit log skipped:", aErr.message);
                }
              }

              Alert.alert("Success", "Group removed successfully.");
              fetchUserGroups();
            } catch (err) {
              console.error("Error deleting group:", err.message);
              Alert.alert("Error", "Failed to delete group.");
            }
          } 
        }
      ]
    );
  };

  const handleSelectGroup = (groupItem) => {
    if (typeof onNavigate === 'function') {
      onNavigate('familyGroup', { group: groupItem });
    } else if (navigation && typeof navigation.navigate === 'function') {
      navigation.navigate('FamilyGroup', { group: groupItem });
    }
  };

  const handleGoBack = () => {
    const targetScreen = isCaregiver ? 'caregiverDashboard' : 'dashboard';
    if (typeof onNavigate === 'function') {
      onNavigate(targetScreen);
    } else if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  const renderGroupItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.groupCard}
      onPress={() => handleSelectGroup(item)}
      activeOpacity={0.7}
    >
      <View style={styles.groupInfo}>
        <Text style={styles.groupName}>{item.name}</Text>
        <Text style={styles.groupRole}>Role: {item.userRole ? item.userRole.toUpperCase() : 'MEMBER'}</Text>
      </View>

      {item.owner_id === userId && (
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => handleDeleteGroup(item.id, item.name)}
        >
          <Feather name="trash-2" size={18} color="#EF4444" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Management</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.content}>
        {/* Role-Based Action Controls */}
        <View style={styles.actionContainer}>
          {!isCaregiver && (
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => setIsCreateModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>
                + Create New Group
              </Text>
            </TouchableOpacity>
          )}

          {isCaregiver && (
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: '#06B6D4' }]} 
              onPress={() => setIsJoinModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>
                Join a Group
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderGroupItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {isCaregiver 
                  ? 'No groups joined yet. Tap "Join a Group" using an invite code from your patient.'
                  : 'No groups found. Tap "+ Create New Group" to create one.'}
              </Text>
            }
          />
        )}
      </View>

      {/* --- CREATE GROUP MODAL --- */}
      <Modal visible={isCreateModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Group</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Group Name (e.g. Family, Caregivers)"
              placeholderTextColor="#94A3B8"
              value={newGroupName}
              onChangeText={setNewGroupName}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => setIsCreateModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalBtn, styles.saveBtn]} 
                onPress={handleCreateGroup}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#0F172A" />
                ) : (
                  <Text style={styles.saveBtnText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- JOIN GROUP MODAL --- */}
      <Modal visible={isJoinModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join a Group</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Enter 6-character Invite Code"
              placeholderTextColor="#94A3B8"
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              autoCapitalize="characters"
              maxLength={6}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => setIsJoinModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: '#06B6D4' }]} 
                onPress={handleJoinGroup}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#0F172A" />
                ) : (
                  <Text style={styles.saveBtnText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backButton: { padding: 4 },
  backButtonText: { color: '#38BDF8', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 16 },
  actionContainer: { gap: 10, marginBottom: 16 },
  actionButton: { backgroundColor: '#38BDF8', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  actionButtonText: { color: '#0F172A', fontWeight: 'bold', fontSize: 15 },
  groupCard: { backgroundColor: '#1E293B', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  groupInfo: { flex: 1 },
  groupName: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  groupRole: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  deleteButton: { padding: 6 },
  emptyText: { color: '#64748B', textAlign: 'center', marginTop: 40, fontSize: 14, paddingHorizontal: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E293B', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#334155' },
  modalTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  cancelBtn: { backgroundColor: '#334155' },
  cancelBtnText: { color: '#F8FAFC' },
  saveBtn: { backgroundColor: '#38BDF8' },
  saveBtnText: { color: '#0F172A', fontWeight: 'bold' }
});