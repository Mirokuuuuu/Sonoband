import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

/**
 * Fetches the user's current GPS location.
 * Prompts the user to enable Location Services via device settings if disabled.
 */
export const getCurrentUserLocation = async () => {
  try {
    // 1. Check if location services (GPS) are enabled on the phone
    const isGpsOn = await Location.hasServicesEnabledAsync();

    if (!isGpsOn) {
      Alert.alert(
        "Location Services Disabled",
        "Please enable GPS/Location services in your device settings to share your current location.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Open Settings", 
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
              }
            } 
          }
        ]
      );
      return null;
    }

    // 2. Request location permissions from the user
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        "Permission Denied",
        "Permission to access location was denied. Please allow location access in your device settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() }
        ]
      );
      return null;
    }

    // 3. Fetch exact GPS coordinates from the phone hardware
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const { latitude, longitude } = location.coords;

    // 4. Reverse geocode coordinates to a readable address
    const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
    const addressDetails = reverseGeocode[0] || {};
    const fullAddress = `${addressDetails.street || ''} ${addressDetails.city || addressDetails.subregion || ''}, ${addressDetails.region || ''}`.trim();

    return {
      latitude,
      longitude,
      address: fullAddress || 'Unknown Location',
    };

  } catch (error) {
    console.error("Location service error:", error);
    Alert.alert("Location Error", "Unable to retrieve GPS location. Please try again.");
    return null;
  }
};