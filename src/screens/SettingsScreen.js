import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, Switch } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient';

// 🔌 Props signature modified below to accept deviceIp and setDeviceIp from App.js directly
export default function SettingsScreen({ onNavigate, isDeviceOn, setIsDeviceOn, syncState, setSyncState, isWifiConnected, userId, deviceIp, setDeviceIp }) {
  const [isSwitchLoading, setIsSwitchLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [userData, setUserData] = useState(null);

  // 🚫 DELETED: Local state configuration hook variable removed safely from here

  // Pull active user metadata parameters to populate explicit auditing targets cleanly
  useEffect(() => {
    const fetchUserDataAndDevice = async () => {
      if (!userId) return;
      
      const userRes = await supabase.from('users').select('name, email, role').eq('id', userId).single();
      if (userRes.data) setUserData(userRes.data);

      const deviceRes = await supabase.from('devices').select('device_ip').eq('user_id', userId).maybeSingle();
      if (deviceRes.data && deviceRes.data.device_ip) {
        setDeviceIp(deviceRes.data.device_ip); // ⚡ Updates the global state layout up inside App.js!
      }
    };

    fetchUserDataAndDevice();
  }, [userId]);

  // 🔌 MASTER CONNECTION/DISCONNECTION PIPELINE
  const handleConnectionToggle = async () => {
    setIsConnecting(true);
    
    if (syncState === 'SUCCESS') {
      // 🚫 DISCONNECT OPERATION
      try {
        setSyncState('IDLE');
        
        // Log explicit hardware tracking state removal event into notifications table setup
        await supabase.from('notifications').insert([
          { 
            user_id: userId, 
            notification_type: 'connection_event',
            title: 'Device Disconnected',
            message: 'Device disconnected successfully.',
            metadata: 'disconnected'
          }
        ]);
        
        Alert.alert("Disconnected", "Sonoband has been disconnected successfully.");
      } catch (err) {
        console.error(err);
      } finally {
        setIsConnecting(false);
      }
    } else {
      // 🟢 CONNECT OPERATION
      setSyncState('SCANNING');
      try {
        const response = await fetch(`http://${deviceIp}/status`);
        if (response.ok) {
          setSyncState('SUCCESS');
          
          // Log explicit hardware linking event into notifications table setup
          await supabase.from('notifications').insert([
            { 
              user_id: userId, 
              notification_type: 'connection_event',
              title: 'Device Connected',
              message: 'Your hardware device is securely paired and tracking live audio.',
              metadata: 'connected'
            }
          ]);
          
          Alert.alert("Success", "Sonoband Hardware Connected & Logged!");
        } else {
          throw new Error("Protocol Validation Refused");
        }
      } catch (error) {
        setSyncState('IDLE');
        Alert.alert("Link Failed", "Could not verify hardware handshake.");
      } finally {
        setIsConnecting(false);
      }
    }
  };

  const toggleDevicePower = async (newValue) => {
    setIsSwitchLoading(true);
    const targetState = newValue ? "on" : "off";
    try {
      const response = await fetch(`http://${deviceIp}/device?state=${targetState}`);
      if (response.ok) {
        setIsDeviceOn(newValue);
      } else {
        Alert.alert("Control Error", "Hardware rejected instruction protocol keys.");
      }
    } catch (error) {
      Alert.alert("Transmission Failed", "Could not communicate with hardware pins.");
    } finally {
      setIsSwitchLoading(false);
    }
  };

  // 🔒 SECURE AUDITED LOGOUT SEQUENCE
  const handleSystemLogout = async () => {
    try {
      if (userId) {
        const cleanUserId = Number(userId);
        const logPromises = [];

        // 📝 1. Prepare audit log insertion
        if (userData) {
          logPromises.push(
            supabase.from('audit_logs').insert([
              {
                user_id: cleanUserId, 
                user_name: userData.name,
                user_email: userData.email,
                role: userData.role,
                action: 'logout', 
                ip_address: 'Mobile Device End'
              }
            ])
          );
        }

        // 📴 2. Prepare device connection status insertion (Forcing 'offline' explicitly)
        logPromises.push(
          supabase.from('device_connections').insert([
            {
              user_id: cleanUserId,
              status: 'offline',
              timestamp: new Date().toISOString()
            }
          ])
        );

        // ⏳ Await completion of all logs BEFORE executing structural session termination
        const results = await Promise.all(logPromises);
        
        // Check if there was any structural error in the db response array
        for (const res of results) {
          if (res.error) {
            console.error("Supabase Write Error during logout:", res.error.message);
            Alert.alert("Database Error", `Failed to save connection status: ${res.error.message}`);
          }
        }
        
        console.log("🟢 Connection logged successfully as OFFLINE upon logout.");
      }
    } catch (auditErr) {
      console.error("Audit trace or connection logging failure:", auditErr);
    } finally {
      // 🚪 3. Final authentication clear-out and UI screen steering redirection
      await supabase.auth.signOut();
      onNavigate('login');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardSection}>Account Configuration</Text>
        <TouchableOpacity style={styles.rowBtn} onPress={() => onNavigate('forgotPassword')}>
          <MaterialCommunityIcons name="lock-reset" size={22} color="#06b6d4" />
          <Text style={styles.rowText}>Reset Password</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rowBtn} onPress={handleSystemLogout}>
          <MaterialCommunityIcons name="logout" size={22} color="#ef4444" />
          <Text style={[styles.rowText, { color: '#ef4444' }]}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardSection}>Master Device Operation</Text>
        <View style={styles.switchRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <MaterialCommunityIcons 
              name={isDeviceOn ? "power-circle-on" : "power-circle-off"} 
              size={28} 
              color={isDeviceOn ? "#22c55e" : "#64748b"} 
            />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.switchLabel}>Hardware Active State</Text>
              <Text style={styles.switchSubLabel}>{isDeviceOn ? "Listening for frequencies" : "System idling in standby"}</Text>
            </View>
          </View>
          {isSwitchLoading ? (
            <ActivityIndicator size="small" color="#06b6d4" />
          ) : (
            <Switch
              trackColor={{ false: '#475569', true: '#059669' }}
              thumbColor={isDeviceOn ? '#34d399' : '#94a3b8'}
              onValueChange={toggleDevicePower}
              value={isDeviceOn}
              disabled={syncState !== 'SUCCESS' || !isWifiConnected}
            />
          )}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardSection}>Hardware Verification Setup</Text>
        <Text style={{ color: '#94a3b8', fontSize: 14, marginBottom: 10, fontWeight: '500' }}>Target Network Node IP: <Text style={{ color: '#06b6d4' }}>{deviceIp}</Text></Text>
        
        {isConnecting ? (
          <View style={styles.syncStatusBlock}>
            <ActivityIndicator size="small" color="#06b6d4" />
            <Text style={styles.syncStatusText}>Updating State Link...</Text>
          </View>
        ) : (
          <TouchableOpacity 
            style={[styles.syncBtn, syncState === 'SUCCESS' ? styles.disconnectBtn : styles.connectBtn]} 
            onPress={handleConnectionToggle}
          >
            <MaterialCommunityIcons 
              name={syncState === 'SUCCESS' ? "link-off" : "link-variant"} 
              size={20} 
              color="#0f172a" 
            />
            <Text style={styles.syncBtnText}>
              {syncState === 'SUCCESS' ? "Disconnect from Device" : "Connect to Device Hardware"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.backBtn} onPress={() => onNavigate('dashboard')}>
        <Text style={styles.backBtnText}>← Back to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24, paddingTop: 50 },
  title: { color: '#f8fafc', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: '#334155' },
  cardSection: { fontSize: 15, fontWeight: 'bold', color: '#f8fafc', marginBottom: 14, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 6 },
  rowBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowText: { fontSize: 16, color: '#e2e8f0', marginLeft: 12, fontWeight: '500' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  switchSubLabel: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  syncBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 8 },
  connectBtn: { backgroundColor: '#06b6d4' },
  disconnectBtn: { backgroundColor: '#ef4444' },
  syncBtnText: { color: '#0f172a', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  syncStatusBlock: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14 },
  syncStatusText: { color: '#06b6d4', fontWeight: '500', marginLeft: 10 },
  backBtn: { padding: 16, alignItems: 'center' },
  backBtnText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' }
});