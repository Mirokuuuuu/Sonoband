import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export default function DashboardScreen({ onNavigate, isWifiConnected }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sonoband</Text>
      
      {/* Live Cloud Status Indicators */}
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>System Status Map (Cloud Link)</Text>
        <Text style={styles.statusText}>
          Network: {isWifiConnected ? "🟢 Connected to Hotspot" : "🔴 Disconnected"}
        </Text>
        <Text style={styles.statusText}>
          Sync Status: {isWifiConnected ? "🟢 Active System Link" : "🟡 Offline Link Pending"}
        </Text>
        <Text style={styles.statusText}>
          Device Mode: "🔊 AUDIO TRACKING ACTIVE"
        </Text>
      </View>

      {/* 📊 Activity Logs */}
      <TouchableOpacity style={styles.menuBtn} onPress={() => onNavigate('activityLogs')}>
        <MaterialCommunityIcons name="clipboard-text-clock-outline" size={22} color="#06b6d4" />
        <Text style={styles.menuText}>View Activity Logs</Text>
      </TouchableOpacity>

      {/* 🔔 Notifications */}
      <TouchableOpacity style={styles.menuBtn} onPress={() => onNavigate('notifications')}>
        <MaterialCommunityIcons name="bell-outline" size={22} color="#06b6d4" />
        <Text style={styles.menuText}>View Notifications</Text>
      </TouchableOpacity>

      {/* ⚠️ Alerts */}
      <TouchableOpacity style={[styles.menuBtn, !isWifiConnected && styles.alertActiveBtn]} onPress={() => onNavigate('alerts')}>
        <MaterialCommunityIcons name="alert-circle-outline" size={22} color={!isWifiConnected ? "#ef4444" : "#06b6d4"} />
        <Text style={[styles.menuText, !isWifiConnected && { color: '#fca5a5' }]}>View System Alerts</Text>
      </TouchableOpacity>

      {/* ⚙️ Settings */}
      <TouchableOpacity style={styles.menuBtn} onPress={() => onNavigate('settings')}>
        <MaterialCommunityIcons name="cog-outline" size={22} color="#06b6d4" />
        <Text style={styles.menuText}>Go to Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' },
  title: { color: '#f8fafc', fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  statusCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, marginBottom: 30, borderWidth: 1, borderColor: '#334155' },
  statusTitle: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 6 },
  statusText: { color: '#94a3b8', fontSize: 14, marginVertical: 4, fontWeight: '500' },
  menuBtn: { backgroundColor: '#1e293b', flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  alertActiveBtn: { borderColor: '#7f1d1d', backgroundColor: '#180c0c' },
  menuText: { color: '#e2e8f0', fontSize: 16, fontWeight: '600', marginLeft: 12 }
});