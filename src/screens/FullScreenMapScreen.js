import React, { useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Alert
} from 'react-native';
import { WebView } from 'react-native-webview';
import Header from '../components/Header';

export default function FullscreenMapScreen({ navigation }) {
  const webViewRef = useRef(null);
  const latitude = 14.5995;
  const longitude = 120.9842;

  // Bright / Standard OpenStreetMap Tiles
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
          var map = L.map('map', { zoomControl: false }).setView([${latitude}, ${longitude}], 15);
          
          // Standard OpenStreetMap (White/Light Mode Tiles)
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          var marker = L.marker([${latitude}, ${longitude}]).addTo(map);
          marker.bindPopup("<b>Sonoband Hardware</b><br>Live GPS Location").openPopup();

          function centerMap() {
            map.flyTo([${latitude}, ${longitude}], 16);
          }
        </script>
      </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Fullscreen GPS Tracking" showBack={true} navigation={navigation} />

      <View style={styles.mapWrapper}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />

        {/* OVERLAY BADGE (Glassmorphism Dark Floating Card) */}
        <View style={styles.floatingBadge}>
          <View style={styles.badgeIconBox}>
            <Text style={{ fontSize: 16 }}>📍</Text>
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.pinText}>Sonoband Wearable</Text>
            <Text style={styles.coords}>{latitude}° N, {longitude}° E</Text>
          </View>
          <View style={styles.statusDot} />
        </View>

        {/* FLOATING ACTION BUTTONS */}
        <View style={styles.controlsBar}>
          <TouchableOpacity 
            style={[styles.actionBtn, styles.primaryBtn]}
            onPress={() => webViewRef.current?.injectJavaScript('centerMap(); true;')}
          >
            <Text style={styles.btnText}>🎯 Center Device</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, styles.accentBtn]}
            onPress={() => Alert.alert('📡 Location Shared', 'Coordinates sent to family group!')}
          >
            <Text style={[styles.btnText, { color: '#0F172A' }]}>📡 Share Pin</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F172A' 
  },
  mapWrapper: {
    flex: 1,
    position: 'relative'
  },
  webView: {
    flex: 1
  },
  floatingBadge: {
    position: 'absolute',
    top: 15,
    left: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.92)', // Dark Slate Overlay
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4
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
    marginHorizontal: 5, 
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3
  },
  primaryBtn: { backgroundColor: '#38BDF8' },
  accentBtn: { backgroundColor: '#FACC15' },
  btnText: { color: '#0F172A', fontWeight: 'bold', fontSize: 13 }
});