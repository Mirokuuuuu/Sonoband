import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabaseClient';
import { Alert } from 'react-native';

export const pickAndUploadAvatar = async (userId) => {
  try {
    // 1. Request photo library permission
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission Required", "Photo library access is required to upload a profile picture.");
      return null;
    }

    // 2. Open image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square crop for rounded avatar
      quality: 0.5,   // Compressed for faster loading
    });

    if (result.canceled) return null;

    const photo = result.assets[0];
    const fileExt = photo.uri.split('.').pop();
    const filePath = `${userId}/avatar.${fileExt}`;

    // 3. Convert image to ArrayBuffer for Supabase Storage
    const response = await fetch(photo.uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    // 4. Upload to Supabase Storage ('avatars' bucket)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, arrayBuffer, {
        contentType: photo.mimeType || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // 5. Get Public URL
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = publicUrlData.publicUrl;

    // 6. Update ONLY avatar_url in 'users' table
    await supabase
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId);

    return avatarUrl;
  } catch (error) {
    console.error("Avatar Upload Error:", error);
    Alert.alert("Upload Failed", "Unable to upload image. Please try again.");
    return null;
  }
};