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
import { supabase } from '../services/supabaseClient';

export default function GroupManagementScreen({ navigation, onNavigate, userId, currentScreen }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (userId && (currentScreen === 'groupManagement' || !currentScreen)) {
      fetchUserGroups();
    }
  }, [userId, currentScreen]);

  const fetchUserGroups = async () => {
    if (!userId) return;
    setLoading(true);
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
          owner_id: item.groups.owner_id,
          invite_code: item.groups.invite_code || 'N/A',
          created_at: item.groups.created_at,
          userRole: item.role
        }));

      setGroups(formattedGroups);
    } catch (err) {
      console.error("Error fetching groups:", err.message);
      Alert.alert("Error", "Failed to fetch group list.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert("Validation Error", "Please provide a valid group name.");
      return;
    }

    if (!userId) {
      Alert.alert("Error", "User session not found.");
      return;
    }

    setCreating(true);
    try {
      // Generate short random invite code
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

      Alert.alert("Success", "New group created successfully!");
      setNewGroupName('');
      setIsModalVisible(false);
      fetchUserGroups();
    } catch (err) {
      console.error("Error creating group:", err.message);
      Alert.alert("Error", "Unable to create group. Please try again.");
    } finally {
      setCreating(false);
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
    if (typeof onNavigate === 'function') {
      onNavigate('dashboard');
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
        <Text style={styles.groupRole}>Role: {item.userRole || 'Member'}</Text>
      </View>

      {item.owner_id === userId && (
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => handleDeleteGroup(item.id, item.name)}
        >
          <Text style={styles.deleteText}>🗑️</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Management</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.content}>
        <TouchableOpacity 
          style={styles.createButton} 
          onPress={() => setIsModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ Create New Group</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderGroupItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No groups found. Tap above to create one.</Text>
            }
          />
        )}
      </View>

      <Modal visible={isModalVisible} animationType="fade" transparent>
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
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalBtn, styles.saveBtn]} 
                onPress={handleCreateGroup}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#0F172A" />
                ) : (
                  <Text style={styles.saveBtnText}>Create</Text>
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
  createButton: { backgroundColor: '#38BDF8', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  createButtonText: { color: '#0F172A', fontWeight: 'bold', fontSize: 15 },
  groupCard: { backgroundColor: '#1E293B', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  groupInfo: { flex: 1 },
  groupName: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  groupRole: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  deleteButton: { padding: 6 },
  deleteText: { fontSize: 18 },
  emptyText: { color: '#64748B', textAlign: 'center', marginTop: 40, fontSize: 14 },
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