import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from './src/services/supabaseClient';

// 📱 Authentication Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';

// 🚀 Core Application Screens
import DashboardScreen from './src/screens/DashboardScreen'; 
import SettingsScreen from './src/screens/SettingsScreen';
import NotificationScreen from './src/screens/NotificationScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ActivityLogsScreen from './src/screens/ActivityLogsScreen'; 

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [userId, setUserId] = useState(null); // Tracks user integer ID dynamically

  // 📡 Global Hardware & Network States
  const [isDeviceOn, setIsDeviceOn] = useState(false);
  const [syncState, setSyncState] = useState('IDLE'); 
  const [isWifiConnected, setIsWifiConnected] = useState(true);
  const [esp32IP, setEsp32IP] = useState("10.60.193.27"); 
  
  const [notifications, setNotifications] = useState([]);

  const logSystemEvent = (msg, type = "info") => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newEntry = { id: Date.now(), text: msg, time: timestamp, type: type };
    setNotifications(prev => [newEntry, ...prev]);
  };

  // Monitor the hardware config table to grab the adaptive dynamic IP address automatically
  useEffect(() => {
    if (!userId) return;

    const fetchCurrentIP = async () => {
      const { data } = await supabase.from('devices').select('device_ip, is_active').eq('user_id', userId).maybeSingle();
      if (data) {
        setEsp32IP(data.device_ip);
        setIsDeviceOn(data.is_active);
        setSyncState(data.device_ip !== '10.60.193.27' ? 'SUCCESS' : 'IDLE');
      }
    };
    fetchCurrentIP();
  }, [userId]);

  // 💓 Network Heartbeat Monitor + Error Alert Database Pipeline
  useEffect(() => {
    if (syncState !== 'SUCCESS' || esp32IP === "10.60.193.27" || !userId) return;

    const networkInterval = setInterval(async () => {
      try {
        await fetch(`http://${esp32IP}/status`);
        if (!isWifiConnected) {
          setIsWifiConnected(true);
          logSystemEvent("Local adaptive network connectivity link restored successfully.", "success");
        }
      } catch (err) {
        if (isWifiConnected) {
          setIsWifiConnected(false);
          setIsDeviceOn(false); 
          logSystemEvent("CRITICAL: Mobile hotspot connection to ESP32 hardware was lost!", "danger");
          
          // 💾 Log a clear connection error directly into the central notifications table
          await supabase.from('notifications').insert([
            { 
              user_id: userId, 
              notification_type: 'error_event',
              title: 'Connection Lost',
              message: 'Your phone disconnected from the device. Please check your Wi-Fi settings.',
              metadata: 'wifi_error'
            }
          ]);
        }
      }
    }, 4000);

    return () => clearInterval(networkInterval);
  }, [isWifiConnected, syncState, esp32IP, userId]);

  // 🎤 Real-time Sound Stream Data Polling Loop
  useEffect(() => {
    if (!isDeviceOn || syncState !== 'SUCCESS' || esp32IP === "10.60.193.27" || !userId) return;

    const soundThreshold = 120; 

    const soundInterval = setInterval(async () => {
      try {
        const response = await fetch(`http://${esp32IP}/sound`);
        if (response.ok) {
          const rawText = await response.text(); 
          
          const volMatch = rawText.match(/Vol:\s*(\d+)/);
          const leftSwMatch = rawText.match(/LeftSw:\s*(\d+)/);
          
          if (volMatch && leftSwMatch) {
            const currentVolume = parseInt(volMatch[1], 10);
            const isLeftSwitched = parseInt(leftSwMatch[1], 10) === 1;

            if (currentVolume > soundThreshold) {
              const directionTag = isLeftSwitched ? 'left' : 'right';
              const directionLabel = isLeftSwitched ? 'Left' : 'Right';

              // Push sound metadata alerts directly to your new clean notifications database table
              await supabase.from('notifications').insert([
                { 
                  user_id: userId, 
                  notification_type: 'sound_event', 
                  title: `Sound from the ${directionLabel}`,
                  message: `A clear sound event was detected coming from the ${directionTag} side microphone.`,
                  metadata: directionTag
                }
              ]);

              logSystemEvent(`Sound verified on ${directionLabel} side. Saved to notifications.`, "success");
            }
          }
        }
      } catch (err) {
        console.log("Sound tracking loop skipped sample context frame due to network fluctuation.");
      }
    }, 1000); 

    return () => clearInterval(soundInterval);
  }, [isDeviceOn, syncState, esp32IP, userId]);

  // View Route Mapping Router Stack
  switch (currentScreen) {
    case 'login':
      return (
        <LoginScreen 
          onNavigate={setCurrentScreen} 
          onLoginSuccess={(uid) => {
            setUserId(uid); 
            logSystemEvent("User secure session validated via database sync.", "info");
            setCurrentScreen('dashboard');
          }}
        />
      );

    case 'register':
      return <RegisterScreen onNavigate={setCurrentScreen} />;

    case 'forgotPassword':
      return <ForgotPasswordScreen onNavigate={setCurrentScreen} />;

    case 'dashboard':
      return (
        <DashboardScreen 
          onNavigate={setCurrentScreen} 
          isWifiConnected={isWifiConnected}
          userId={userId} 
        />
      );

    case 'settings':
      return (
        <SettingsScreen 
          onNavigate={setCurrentScreen}
          isDeviceOn={isDeviceOn}
          setIsDeviceOn={async (value) => {
            setIsDeviceOn(value);
            logSystemEvent(`Device operation shifted manually to ${value ? 'ON' : 'OFF'}.`, value ? "success" : "info");
            await supabase.from('devices').update({ is_active: value }).eq('user_id', userId);
          }}
          syncState={syncState}
          setSyncState={(stateValue) => {
            setSyncState(stateValue);
            if (stateValue === 'SUCCESS') {
              logSystemEvent("✅ Sonoband Hardware Handshake Linked Successfully!", "success");
            }
          }}
          isWifiConnected={isWifiConnected}
          userId={userId}
          deviceIp={esp32IP}       // ⚡ ADDED: Shared state value pointer sent down
          setDeviceIp={setEsp32IP} // ⚡ ADDED: Shared global hook state updater sent down
        />
      );

    case 'notifications':
      return (
        <NotificationScreen 
          onNavigate={setCurrentScreen} 
          userId={userId}
        />
      );

    case 'alerts':
      return <AlertsScreen onNavigate={setCurrentScreen} isWifiConnected={isWifiConnected} syncState={syncState} userId={userId} />;

    case 'activityLogs': 
      return <ActivityLogsScreen onNavigate={setCurrentScreen} userId={userId} />;

    default:
      return <LoginScreen onNavigate={setCurrentScreen} />;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
});