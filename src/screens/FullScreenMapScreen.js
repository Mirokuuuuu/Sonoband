import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import { supabase, logSystemActivity } from '../services/supabaseClient';

// Clean Leaflet HTML template without inline variables
const MAP_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0F172A; }
      .custom-pin { background: transparent; border: none; }
      .custom-popup .leaflet-popup-content-wrapper {
        background: #1E293B;
        color: #F8FAFC;
        border-radius: 10px;
        padding: 6px 10px;
        border: 1px solid #334155;
      }
      .custom-popup .leaflet-popup-tip { background: #1E293B; }
      .popup-title { font-weight: 700; font-size: 13px; color: #38BDF8; }
      .popup-location { font-size: 11px; color: #94A3B8; margin-top: 2px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 19,
        attribution: 'OpenStreetMap'
      }).addTo(map);

      var marker = null;
      var circle = null;

      var pinSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36">' +
        '<path fill="#EF4444" stroke="#FFFFFF" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>' +
        '</svg>';

      var pinIcon = L.divIcon({
        className: 'custom-pin',
        html: pinSvg,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
      });

      function updateMapLocation(lat, lng, name, address) {
        if (!lat || !lng) return;

        if (marker) map.removeLayer(marker);
        if (circle) map.removeLayer(circle);

        circle = L.circle([lat, lng], {
          color: '#38BDF8',
          fillColor: '#38BDF8',
          fillOpacity: 0.15,
          radius: 50
        }).addTo(map);

        marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map);

        var div = document.createElement('div');
        var title = document.createElement('div');
        title.className = 'popup-title';
        title.textContent = name || 'User';

        var loc = document.createElement('div');
        loc.className = 'popup-location';
        loc.textContent = address || 'Location active';

        div.appendChild(title);
        div.appendChild(loc);

        marker.bindPopup(div, { className: 'custom-popup' }).openPopup();
        map.flyTo([lat, lng], 16, { animate: true });
      }

      function handleMessage(event) {
        try {
          var payload = JSON.parse(event.data);
          if (payload && payload.latitude && payload.longitude) {
            updateMapLocation(payload.latitude, payload.longitude, payload.userName, payload.locationName);
          }
        } catch (e) {
          console.error(e);
        }
      }

      document.addEventListener('message', handleMessage);
      window.addEventListener('message', handleMessage);
    </script>
  </body>
</html>
`;

export default function FullscreenMapScreen({ navigation }) {
  const webViewRef = useRef(null);
  const [coords, setCoords] = useState({ latitude: 14.5995, longitude: 120.9842 });
  const [userName, setUserName] = useState('User Location');
  const [locationName, setLocationName] = useState('Fetching address...');
  const [loading, setLoading] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchUserAndLocation(false);
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (isMapReady) {
      sendDataToMap(coords.latitude, coords.longitude, userName, locationName);
    }
  }, [coords, userName, locationName, isMapReady]);

  const sendDataToMap = (lat, lng, name, address) => {
    if (!webViewRef.current) return;
    const payload = JSON.stringify({
      latitude: Number(lat),
      longitude: Number(lng),
      userName: name || 'User',
      locationName: address || 'Location updated',
    });
    webViewRef.current.postMessage(payload);
  };

  const locateUserOnly = () => {
    sendDataToMap(coords.latitude, coords.longitude, userName, locationName);
  };

  const fetchUserAndLocation = async (isManualRefresh = false) => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Session Error', 'Please log in again.');
        setLoading(false);
        return;
      }

      let fetchedName = 'User';
      let phoneNum = null;
      let numericUserId = null;

      const { data: userData } = await supabase
        .from('users')
        .select('id, name, email, phone_number')
        .eq('uuid', user.id)
        .maybeSingle();

      if (userData) {
        fetchedName = userData.name || userData.email || 'User';
        phoneNum = userData.phone_number || null;
        numericUserId = userData.id;
        setUserName(fetchedName);
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required.');
        setLoading(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = currentLocation.coords;
      setCoords({ latitude, longitude });

      let addressString = 'Location updated';
      try {
        const addressData = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (addressData && addressData.length > 0) {
          const item = addressData[0];
          const parts = [
            item.name || item.street,
            item.district || item.subregion,
            item.city,
            item.region
          ].filter(Boolean);
          addressString = parts.length > 0 ? parts.join(', ') : 'Location updated';
        }
      } catch (geoError) {
        console.log('Geocoding error:', geoError.message);
      }
      setLocationName(addressString);

      const nowIso = new Date().toISOString();
      await supabase
        .from('user_locations')
        .upsert({
          user_id: user.id,
          latitude,
          longitude,
          address_text: addressString,
          is_online: true,
          last_active: nowIso,
          updated_at: nowIso,
          full_name: fetchedName,
          phone_number: phoneNum,
        }, { onConflict: 'user_id' });

      if (isManualRefresh) {
        if (numericUserId) {
          await supabase.from('notifications').insert([{
            user_id: Number(numericUserId),
            notification_type: 'location_update',
            title: 'Location Updated',
            message: `Updated location to: ${addressString}`,
            metadata: JSON.stringify({ latitude, longitude }),
            is_read: false,
            created_at: nowIso,
          }]);
        }

        if (typeof logSystemActivity === 'function') {
          try {
            await logSystemActivity(
              user.id,
              'location_update',
              `Updated location: ${addressString}`,
              { latitude, longitude, address: addressString }
            );
          } catch (aErr) {
            console.log('Audit log skipped:', aErr.message);
          }
        }

        Alert.alert('Location Updated', `Your location (${addressString}) has been updated.`);
      }

    } catch (error) {
      console.error('Location error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Fullscreen GPS Tracking" showBack={true} navigation={navigation} />

      {/* TOP USER BADGE BAR */}
      <View style={styles.topInfoCard}>
        <View style={styles.badgeIconBox}>
          <Ionicons name="location-sharp" size={20} color="#38BDF8" />
        </View>
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={styles.pinText}>{userName}</Text>
          <Text style={styles.locationText} numberOfLines={1}>{locationName}</Text>
        </View>
        <View style={styles.statusDot} />
      </View>

      {/* MAP AREA */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: MAP_HTML }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          geolocationEnabled={true}
          mixedContentMode="always"
          onLoadEnd={() => {
            setIsMapReady(true);
            sendDataToMap(coords.latitude, coords.longitude, userName, locationName);
          }}
        />

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#38BDF8" />
            <Text style={{ color: '#F8FAFC', marginTop: 8, fontWeight: '600' }}>Locating GPS...</Text>
          </View>
        )}
      </View>

      {/* BOTTOM ACTION BUTTONS BAR */}
      <View style={styles.bottomBar}>
        <TouchableOpacity 
          style={[styles.actionBtn, styles.secondaryBtn]} 
          onPress={locateUserOnly}
        >
          <Ionicons name="navigate-outline" size={18} color="#38BDF8" style={styles.btnIcon} />
          <Text style={styles.secondaryBtnText}>Locate User</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionBtn, styles.primaryBtn]} 
          onPress={() => fetchUserAndLocation(true)}
        >
          <Ionicons name="refresh-outline" size={18} color="#0F172A" style={styles.btnIcon} />
          <Text style={styles.primaryBtnText}>Update Location</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F172A' 
  },
  topInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  badgeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center'
  },
  pinText: { fontWeight: 'bold', fontSize: 14, color: '#F8FAFC' },
  locationText: { fontSize: 12, color: '#38BDF8', marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E' },
  
  mapContainer: { 
    flex: 1, 
    position: 'relative',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155'
  },
  webView: { 
    flex: 1, 
    backgroundColor: '#0F172A' 
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  bottomBar: { 
    flexDirection: 'row', 
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0F172A',
  },
  actionBtn: { 
    flex: 1, 
    flexDirection: 'row',
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIcon: { marginRight: 6 },
  primaryBtn: { backgroundColor: '#38BDF8' },
  primaryBtnText: { color: '#0F172A', fontWeight: 'bold', fontSize: 13 },
  secondaryBtn: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  secondaryBtnText: { color: '#38BDF8', fontWeight: 'bold', fontSize: 13 }
});