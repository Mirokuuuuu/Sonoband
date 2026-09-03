import React, { useState, useEffect } from 'react';
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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../services/supabaseClient';

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
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [coords, setCoords] = useState({ latitude: 0.0, longitude: 0.0 });

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const { data: authUserData } = await supabase.auth.getUser();
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
              if (navigation && typeof navigation.replace === 'function') {
                navigation.replace('Login');
              } else if (onNavigate) {
                onNavigate('login');
              }
            },
          },
        ]);
        return;
      }

      const realAuthUuid = currentAuthUser?.id || (isValidUuid(targetUserId) ? targetUserId : null);
      setAuthUuid(realAuthUuid);
      setActiveUserId(targetUserId);

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      if (userError) console.warn('users table fetch warning:', userError.message);

      if (userData) {
        if (userData.name || userData.full_name) setFullName(userData.name || userData.full_name);
        if (userData.email) setEmail(userData.email);
        if (userData.avatar_url) setAvatarUrl(userData.avatar_url);

        const userPhone = userData.phone_number || userData.phone || userData.contact_number;
        if (userPhone) setPhone(userPhone);
      } else if (currentAuthUser?.email) {
        setEmail(currentAuthUser.email);
      }

      const lookupUuid = realAuthUuid || (isValidUuid(targetUserId) ? targetUserId : null);

      if (lookupUuid) {
        const { data: locData, error: locError } = await supabase
          .from('user_locations')
          .select('*')
          .eq('user_id', lookupUuid)
          .maybeSingle();

        if (locError) console.warn('user_locations fetch warning:', locError.message);

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
      }
    } catch (err) {
      console.error('Unexpected profile fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow gallery access to update your profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
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

      if (activeUserId) {
        await supabase
          .from('users')
          .update({
            name: fullName.trim(),
            avatar_url: freshPublicUrl,
            phone_number: phone.trim(),
          })
          .eq('id', activeUserId);
      }

      const targetUuid = authUuid || (isValidUuid(activeUserId) ? activeUserId : null);

      if (targetUuid) {
        const { data: existingLoc } = await supabase
          .from('user_locations')
          .select('latitude, longitude')
          .eq('user_id', targetUuid)
          .maybeSingle();

        const finalLat = existingLoc?.latitude ?? coords.latitude ?? 0.0;
        const finalLng = existingLoc?.longitude ?? coords.longitude ?? 0.0;

        await supabase.from('user_locations').upsert(
          {
            user_id: targetUuid,
            full_name: fullName.trim(),
            phone_number: phone.trim(),
            avatar_url: freshPublicUrl,
            latitude: finalLat,
            longitude: finalLng,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
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
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert(
        'Incomplete Information',
        'Please fill in both Full Name and Phone Number before saving.'
      );
      return;
    }

    if (!activeUserId && !authUuid) {
      Alert.alert('Error', 'User authentication session not found.');
      return;
    }

    try {
      setSaving(true);

      if (activeUserId) {
        const { error: userError } = await supabase
          .from('users')
          .update({
            name: fullName.trim(),
            avatar_url: avatarUrl,
            phone_number: phone.trim(),
          })
          .eq('id', activeUserId);

        if (userError) console.warn('users update warning:', userError.message);
      }

      const targetUuid = authUuid || (isValidUuid(activeUserId) ? activeUserId : null);

      if (targetUuid) {
        const { data: existingLoc } = await supabase
          .from('user_locations')
          .select('latitude, longitude')
          .eq('user_id', targetUuid)
          .maybeSingle();

        const finalLat = existingLoc?.latitude ?? coords.latitude ?? 0.0;
        const finalLng = existingLoc?.longitude ?? coords.longitude ?? 0.0;

        const { error: locError } = await supabase.from('user_locations').upsert(
          {
            user_id: targetUuid,
            full_name: fullName.trim(),
            phone_number: phone.trim(),
            avatar_url: avatarUrl,
            latitude: finalLat,
            longitude: finalLng,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

        if (locError) throw locError;
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
    if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    } else if (onNavigate) {
      onNavigate('dashboard');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={{ color: '#94A3B8', marginTop: 12 }}>Loading profile details...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E293B" />

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

          <TouchableOpacity onPress={handlePickImage} disabled={uploadingImage} style={{ marginTop: 8 }}>
            <Text style={styles.changePhotoText}>
              {uploadingImage ? 'Uploading...' : 'Change Profile Photo'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.profileName}>{fullName || 'Sonoband User'}</Text>
          <Text style={styles.profileEmail}>{email || 'No gmail associated'}</Text>
        </View>

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

          <Text style={styles.inputLabel}>Gmail Address (Read Only)</Text>
          <TextInput
            style={[styles.input, styles.readOnlyInput]}
            value={email}
            editable={false}
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
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
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
  readOnlyInput: {
    opacity: 0.6,
    backgroundColor: '#1E293B',
  },
});