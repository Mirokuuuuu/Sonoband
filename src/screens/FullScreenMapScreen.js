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
import * as Location from 'expo-location'; // 1. IMPORT EXPO LOCATION
import Header from '../components/Header';
import { supabase } from '../services/supabaseClient';

export default function FullscreenMapScreen({ navigation }) {
  const webViewRef = useRef(null);
  const [coords, setCoords] = useState({ latitude: 14.5995, longitude: 120.9842 });
  const [userName, setUserName] = useState('User Location');
  const [loading, setLoading] = useState(true);

  // 2. RUN ON SCREEN LOAD
  useEffect(() => {
    fetchUserAndLocation();
  }, []);

  const fetchUserAndLocation = async () => {
    try {
      setLoading(true);

      // A. Get current user's profile name from Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        
        if (profile?.full_name) {
          setUserName(profile.full_name);
        }
      }

      // B. Request Phone Location Permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to view your live GPS position.');
        setLoading(false);
        return;
      }

      // C. Get Phone GPS Position
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = currentLocation.coords;
      setCoords({ latitude, longitude });

      // D. Sync position to Supabase database
      if (user) {
        await supabase
          .from('user_locations')
          .upsert({
            user_id: user.id,
            latitude,
            longitude,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
      }

    } catch (error) {
      console.error('Error fetching location:', error);
    } finally {
      setLoading(false);
    }
  };

  // 3. MAP HTML WITH USER NAME POPUP
  const mapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body, html, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #FAFAFA; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([${coords.latitude}, ${coords.longitude}], 15);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          var marker = L.marker([${coords.latitude}, ${coords.longitude}]).addTo(map);
          marker.bindPopup("<b>👤 ${userName}</b><br>Live GPS Location").openPopup();

          function centerMap() {
            map.flyTo([${coords.latitude}, ${coords.longitude}], 16);
          }
        </script>
      </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Fullscreen GPS Tracking" showBack={true} navigation={navigation} />

      <View style={styles.mapWrapper}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#38BDF8" />
            <Text style={{ color: '#94A3B8', marginTop: 10 }}>Fetching GPS location...</Text>
          </View>
        ) : (
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: mapHtml }}
            style={styles.webView}
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        )}

        {/* OVERLAY BADGE */}
        <View style={styles.floatingBadge}>
          <View style={styles.badgeIconBox}>
            <Text style={{ fontSize: 16 }}>📍</Text>
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.pinText}>{userName}</Text>
            <Text style={styles.coords}>{coords.latitude.toFixed(4)}° N, {coords.longitude.toFixed(4)}° E</Text>
          </View>
          <View style={styles.statusDot} />
        </View>

        {/* FLOATING BUTTONS */}
        <View style={styles.controlsBar}>
          <TouchableOpacity 
            style={[styles.actionBtn, styles.primaryBtn]}
            onPress={() => {
              fetchUserAndLocation();
              webViewRef.current?.injectJavaScript('centerMap(); true;');
            }}
          >
            <Text style={styles.btnText}>🎯 Recenter My Location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  mapWrapper: { flex: 1, position: 'relative' },
  webView: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  floatingBadge: {
    position: 'absolute',
    top: 15,
    left: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.92)',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 5,
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
  coords: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E' },
  controlsBar: { 
    position: 'absolute',
    bottom: 25,
    left: 15,
    right: 15,
    flexDirection: 'row', 
    justifyContent: 'space-between'
  },
  actionBtn: { 
    flex: 1, 
    paddingVertical: 14, 
    borderRadius: 14, 
    alignItems: 'center',
    elevation: 4
  },
  primaryBtn: { backgroundColor: '#38BDF8' },
  btnText: { color: '#0F172A', fontWeight: 'bold', fontSize: 13 }
});