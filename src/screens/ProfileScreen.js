import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Image,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase, logSystemActivity } from '../services/supabaseClient';

const isValidUuid = (id) => {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(String(id).trim());
};

export default function ProfileScreen({ route, navigation, onNavigate, userId: propUserId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [authUuid, setAuthUuid] = useState(null);
  const [activeUserId, setActiveUserId] = useState(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('user');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [coords, setCoords] = useState({ latitude: 0.0, longitude: 0.0 });

  const fetchUserProfile = useCallback(async () => {
    try {
      setLoading(true);

      const [{ data: sessionData }, { data: authUserData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);
      const currentAuthUser = sessionData?.session?.user || authUserData?.user;

      const targetUserId =
        propUserId ||
        route?.params?.userId ||
        route?.params?.user?.id ||
        currentAuthUser?.id;

      if (!targetUserId) {
        Alert.alert('Session Expired', 'Please log in again to access your profile.', [
          {
            text: 'OK',
            onPress: () => {
              if (navigation?.replace) navigation.replace('Login');
              else if (onNavigate) onNavigate('login');
            },
          },
        ]);
        return;
      }

      const realAuthUuid = currentAuthUser?.id || (isValidUuid(targetUserId) ? targetUserId : null);
      setAuthUuid(realAuthUuid);

      // Construct user query
      let userQuery = supabase.from('users').select('*');
      if (isValidUuid(targetUserId)) {
        userQuery = userQuery.eq('uuid', targetUserId);
      } else if (!isNaN(Number(targetUserId))) {
        userQuery = userQuery.eq('id', Number(targetUserId));
      } else if (realAuthUuid) {
        userQuery = userQuery.eq('uuid', realAuthUuid);
      }

      const lookupUuid = realAuthUuid || (isValidUuid(targetUserId) ? targetUserId : null);
      
      // Parallelize table fetches for faster loading times
      const [userRes, locRes] = await Promise.all([
        userQuery.maybeSingle(),
        lookupUuid
          ? supabase.from('user_locations').select('*').eq('user_id', lookupUuid).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const userData = userRes.data;
      const locData = locRes.data;

      if (userData) {
        setActiveUserId(userData.id);
        if (userData.uuid) setAuthUuid(userData.uuid);
        setFullName(userData.name || userData.full_name || '');
        setEmail(userData.email || '');
        setAvatarUrl(userData.avatar_url || null);
        setRole(userData.role || 'user');
        setPhone(userData.phone_number || userData.phone || userData.contact_number || '');
      } else {
        setActiveUserId(targetUserId);
        if (currentAuthUser?.email) setEmail(currentAuthUser.email);
      }

      if (locData) {
        if (locData.full_name && !fullName) setFullName(locData.full_name);
        if (locData.phone_number && !phone) setPhone(locData.phone_number);
        if (locData.avatar_url && !avatarUrl) setAvatarUrl(locData.avatar_url);

        if (locData.latitude !== undefined && locData.latitude !== null) {
          setCoords({
            latitude: locData.latitude,
            longitude: locData.longitude ?? 0.0,
          });
        }
      }
    } catch (err) {
      console.error('Unexpected profile fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [propUserId, route?.params]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow gallery access to update your profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        uploadAvatar(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Image picking error:', err);
    }
  };

  const uploadAvatar = async (uri) => {
    setUploadingImage(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileId = authUuid || activeUserId || Date.now();
      const fileName = `avatar_${fileId}_${Date.now()}.${fileExt}`;
      const contentType = `image/${fileExt === 'png' ? 'png' : 'jpeg'}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, decode(base64), {
          contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const freshPublicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(freshPublicUrl);

      // Perform user and location updates
      const targetUuid = authUuid || (isValidUuid(activeUserId) ? activeUserId : null);
      const updatePromises = [];

      if (activeUserId && !isNaN(Number(activeUserId))) {
        updatePromises.push(
          supabase
            .from('users')
            .update({
              name: fullName.trim(),
              avatar_url: freshPublicUrl,
              phone_number: phone.trim(),
              email: email.trim().toLowerCase(),
            })
            .eq('id', Number(activeUserId))
        );
      }

      if (targetUuid) {
        updatePromises.push(
          supabase.from('user_locations').upsert(
            {
              user_id: targetUuid,
              full_name: fullName.trim(),
              phone_number: phone.trim(),
              avatar_url: freshPublicUrl,
              latitude: coords.latitude || 0.0,
              longitude: coords.longitude || 0.0,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
        );
      }

      await Promise.all(updatePromises);

      try {
        await logSystemActivity(
          activeUserId,
          'update_profile',
          'Updated profile picture',
          { role, ipAddress: 'Mobile App' },
          fullName,
          email
        );
      } catch (aErr) {
        console.log('Avatar audit skipped:', aErr.message);
      }

      Alert.alert('Success', 'Profile photo updated successfully!');
    } catch (err) {
      console.error('Avatar upload error:', err.message || err);
      Alert.alert('Error', err.message || 'Failed to upload photo.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProfile = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedPhone || !trimmedEmail) {
      Alert.alert('Incomplete Information', 'Please fill in all required fields (Name, Email, and Phone Number).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (!activeUserId && !authUuid) {
      Alert.alert('Error', 'User authentication session not found.');
      return;
    }

    try {
      setSaving(true);
      const targetUuid = authUuid || (isValidUuid(activeUserId) ? activeUserId : null);
      const updatePromises = [];

      if (activeUserId && !isNaN(Number(activeUserId))) {
        updatePromises.push(
          supabase
            .from('users')
            .update({
              name: trimmedName,
              email: trimmedEmail,
              avatar_url: avatarUrl,
              phone_number: trimmedPhone,
            })
            .eq('id', Number(activeUserId))
        );
      }

      if (targetUuid) {
        updatePromises.push(
          supabase.from('user_locations').upsert(
            {
              user_id: targetUuid,
              full_name: trimmedName,
              phone_number: trimmedPhone,
              avatar_url: avatarUrl,
              latitude: coords.latitude || 0.0,
              longitude: coords.longitude || 0.0,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
        );
      }

      await Promise.all(updatePromises);

      try {
        await logSystemActivity(
          activeUserId,
          'update_profile',
          'Updated profile details',
          { role, ipAddress: 'Mobile App' },
          trimmedName,
          trimmedEmail
        );
      } catch (aErr) {
        console.log('Profile save audit skipped:', aErr.message);
      }

      Alert.alert('Success', 'Profile details updated successfully!');
    } catch (err) {
      console.error('Save profile error:', err.message);
      Alert.alert('Error', err.message || 'An unexpected error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleBackNavigation = () => {
    const passedRole = route?.params?.userRole;
    const isCaregiver = passedRole === 'caregiver' || role === 'caregiver';

    if (onNavigate) {
      onNavigate(isCaregiver ? 'caregiverDashboard' : 'dashboard');
    } else if (navigation?.canGoBack()) {
      navigation.goBack();
    } else if (navigation?.replace) {
      navigation.replace(isCaregiver ? 'CaregiverDashboard' : 'Dashboard');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Loading profile details...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#1E293B" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBackNavigation}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Profile</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#0F172A" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Avatar Section */}
        <View style={styles.avatarCard}>
          <TouchableOpacity onPress={handlePickImage} disabled={uploadingImage} activeOpacity={0.8}>
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
              )}
              {uploadingImage && (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#0F172A" />
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handlePickImage} disabled={uploadingImage} style={styles.changePhotoBtn}>
            <Text style={styles.changePhotoText}>
              {uploadingImage ? 'Uploading...' : 'Change Profile Photo'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.profileName}>{fullName || 'Sonoband User'}</Text>
          <Text style={styles.profileEmail}>{email || 'No email associated'}</Text>

          <View style={styles.roleHeaderBadge}>
            <MaterialCommunityIcons 
              name={role === 'caregiver' ? 'heart-pulse' : 'account'} 
              size={14} 
              color="#38BDF8" 
              style={styles.roleBadgeIcon} 
            />
            <Text style={styles.roleHeaderBadgeText}>
              {role === 'caregiver' ? 'CAREGIVER' : 'PATIENT / USER'}
            </Text>
          </View>
        </View>

        {/* Input Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Details</Text>

          <Text style={styles.inputLabel}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Enter your full name"
            placeholderTextColor="#64748B"
          />

          <Text style={styles.inputLabel}>Email Address *</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="user@example.com"
            placeholderTextColor="#64748B"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.inputLabel}>Phone Number *</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+63 9XX XXX XXXX"
            placeholderTextColor="#64748B"
            keyboardType="phone-pad"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  center: {
    justify: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  iconButton: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#334155',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  saveBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  avatarCard: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  avatarWrapper: {
    position: 'relative',
    width: 84,
    height: 84,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#38BDF8',
    padding: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  changePhotoBtn: {
    marginTop: 8,
  },
  changePhotoText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  profileEmail: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  roleHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  roleBadgeIcon: {
    marginRight: 4,
  },
  roleHeaderBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 14,
    marginBottom: 16,
  },
});