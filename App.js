import React, { useState, useEffect } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo'; 
import { supabase, logSystemActivity } from './src/services/supabaseClient';

// Authentication Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';

// Core Application Screens
import DashboardScreen from './src/screens/DashboardScreen'; 
import SettingsScreen from './src/screens/SettingsScreen';
import DeviceControlScreen from './src/screens/DeviceControlScreen'; 
import DevicePairingScreen from './src/screens/DevicePairingScreen';
import NotificationScreen from './src/screens/NotificationScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import FamilyGroupScreen from './src/screens/FamilyGroupScreen';
import FullscreenMapScreen from './src/screens/FullScreenMapScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import GroupManagementScreen from './src/screens/GroupManagementScreen';
import SoundManualScreen from './src/screens/SoundManualScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [userId, setUserId] = useState(null); 

  const [forgotPasswordSource, setForgotPasswordSource] = useState('login');

  // Global Hardware & Network States
  const [isDeviceOn, setIsDeviceOn] = useState(false);
  const [syncState, setSyncState] = useState('IDLE'); 
  const [isPhoneConnected, setIsPhoneConnected] = useState(true); 
  const [esp32IP, setEsp32IP] = useState("192.168.43.1");
  
  const [notifications, setNotifications] = useState([]);

  // Universal Helper Navigation Adaptor
  const navigationAdapter = {
    navigate: (screenName) => {
      const screenMapping = {
        'Notifications': 'notifications',
        'Notification': 'notifications',
        'Alerts': 'alerts',
        'AlertLogs': 'alerts',
        'FamilyGroup': 'familyGroup',
        'GroupManagement': 'groupManagement',
        'SoundManual': 'soundManual',
        'FullscreenMap': 'fullscreenMap',
        'FullScreenMap': 'fullscreenMap',
        'Map': 'fullscreenMap',
        'Settings': 'settings',
        'DeviceControl': 'deviceControl', 
        'DeviceSettings': 'deviceControl', 
        'DevicePairing': 'devicePairing',
        'Dashboard': 'dashboard',
        'Login': 'login',
        'Profile': 'profile',
        'profile': 'profile'
      };

      const targetScreen = screenMapping[screenName] || screenName;
      setCurrentScreen(targetScreen);
    },
    goBack: () => {
      if (currentScreen === 'fullscreenMap') {
        setCurrentScreen('familyGroup');
      } else if (currentScreen === 'familyGroup') {
        setCurrentScreen('groupManagement');
      } else if (currentScreen === 'login' || currentScreen === 'register') {
        setCurrentScreen('login');
      } else {
        setCurrentScreen('dashboard');
      }
    }
  };

  // Helper function to convert session user into integer ID from custom 'users' table
  const fetchNumericUserId = async (authUser) => {
    if (!authUser) {
      setUserId(null);
      return;
    }

    try {
      // Check custom users table by email
      const { data: customUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', authUser.email)
        .maybeSingle();

      if (customUser?.id) {
        setUserId(Number(customUser.id));
      } else {
        const parsed = Number(authUser.id);
        setUserId(!isNaN(parsed) ? parsed : null);
      }
    } catch (err) {
      console.error('Failed to resolve custom integer user ID:', err);
    }
  };

  // Centralized login event logger
  const handleUserLoginEvent = async (uid) => {
    let numericId = null;

    try {
      // Query custom users table for integer ID
      const { data: userData } = await supabase
        .from('users')
        .select('id, name, email, role')
        .or(`id.eq.${isNaN(Number(uid)) ? -1 : Number(uid)},email.eq.${uid}`)
        .maybeSingle();

      if (userData?.id) {
        numericId = Number(userData.id);
      } else if (!isNaN(Number(uid))) {
        numericId = Number(uid);
      }

      setUserId(numericId);
      logSystemEvent("User session validated.", "info");

      if (numericId) {
        await logSystemActivity(numericId, 'Login', 'User logged in to application', {
          userName: userData?.name || userData?.email || 'User',
          userEmail: userData?.email || '',
          role: userData?.role || 'user',
          ipAddress: Platform.OS === 'ios' ? 'iOS Device' : 'Android Device'
        });
      }
    } catch (err) {
      console.log('Login event logging skipped:', err.message);
    }

    setCurrentScreen('dashboard');
  };

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchNumericUserId(session?.user);
    }).catch(() => {});

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchNumericUserId(session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      if (supabase?.auth) {
        await supabase.auth.signOut().catch(() => {});
      }
    } catch (err) {
      console.log('Logout error:', err);
    } finally {
      setUserId(null);
      setIsDeviceOn(false);
      setSyncState('IDLE');
      setCurrentScreen('login');
    }
  };

  const logSystemEvent = (msg, type = "info") => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newEntry = { id: Date.now(), text: msg, time: timestamp, type: type };
    setNotifications(prev => [newEntry, ...prev]);
  };

  // Real-time Network Listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsPhoneConnected(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // Screen Switch Router
  const renderScreen = () => {
    switch (currentScreen) {
      case 'login':
        return (
          <LoginScreen 
            navigation={navigationAdapter}
            onNavigate={(screen) => {
              if (screen === 'forgotPassword') {
                setForgotPasswordSource('login');
                setCurrentScreen('forgotPassword');
              } else {
                setCurrentScreen(screen);
              }
            }} 
            onLoginSuccess={handleUserLoginEvent}
          />
        );

      case 'register':
        return (
          <RegisterScreen 
            navigation={navigationAdapter} 
            onNavigate={setCurrentScreen} 
          />
        );

      case 'forgotPassword':
        return (
          <ForgotPasswordScreen 
            navigation={navigationAdapter}
            onNavigate={() => setCurrentScreen(forgotPasswordSource)} 
          />
        );

      case 'dashboard':
        return (
          <DashboardScreen 
            navigation={navigationAdapter}
            onNavigate={setCurrentScreen} 
            isPhoneConnected={isPhoneConnected}            
            isDeviceConnected={syncState === 'SUCCESS'}    
            isDeviceOn={isDeviceOn}                        
            userId={userId} 
            currentScreen={currentScreen}
          />
        );

      case 'profile':
        return (
          <ProfileScreen 
            userId={userId} 
            onNavigate={(screen) => navigationAdapter.navigate(screen)}
            onLogout={handleLogout} 
          />
        );

      case 'settings':
        return (
          <SettingsScreen 
            navigation={navigationAdapter}
            onNavigate={(screen) => {
              if (screen === 'forgotPassword') {
                setForgotPasswordSource('settings');
                setCurrentScreen('forgotPassword');
              } else if (screen === 'login') {
                handleLogout();
              } else {
                setCurrentScreen(screen);
              }
            }}
            userId={userId}
            onLogout={handleLogout}
          />
        );

      case 'deviceControl':
      case 'deviceSettings':
        return (
          <DeviceControlScreen 
            navigation={navigationAdapter}
            onNavigate={setCurrentScreen}
            isDeviceOn={isDeviceOn}
            setIsDeviceOn={setIsDeviceOn}
            syncState={syncState}
            setSyncState={setSyncState}
            isWifiConnected={isPhoneConnected}
            userId={userId}
            deviceIp={esp32IP}
          />
        );

      case 'devicePairing':
        return (
          <DevicePairingScreen 
            navigation={navigationAdapter}
            onNavigate={setCurrentScreen}
            syncState={syncState}
            setSyncState={setSyncState}
            deviceIp={esp32IP}
            setDeviceIp={setEsp32IP}
            userId={userId}
            onSelectDevice={(device) => {
              setIsDeviceOn(false);
              setSyncState('SUCCESS');
              if (device?.ip_address) setEsp32IP(device.ip_address);
            }}
            onDisconnectDevice={() => {
              setIsDeviceOn(false);
              setSyncState('IDLE');
            }}
          />
        );

      case 'notifications':
        return (
          <NotificationScreen 
            navigation={navigationAdapter} 
            onNavigate={setCurrentScreen} 
            userId={userId} 
          />
        );

      case 'alerts':
      case 'alertLogs':
        return (
          <AlertsScreen 
            navigation={navigationAdapter} 
            onNavigate={setCurrentScreen} 
            isWifiConnected={isPhoneConnected} 
            syncState={syncState} 
            userId={userId} 
          />
        );

      case 'familyGroup':
        return (
          <FamilyGroupScreen 
            navigation={navigationAdapter} 
            onNavigate={setCurrentScreen} 
            userId={userId} 
          />
        );

      case 'groupManagement':
        return (
          <GroupManagementScreen 
            navigation={navigationAdapter} 
            onNavigate={setCurrentScreen} 
            userId={userId} 
          />
        );

      case 'soundManual':
        return (
          <SoundManualScreen 
            navigation={navigationAdapter} 
            onNavigate={setCurrentScreen} 
            userId={userId} 
          />
        );

      case 'fullscreenMap':
        return (
          <FullscreenMapScreen 
            navigation={navigationAdapter} 
            onNavigate={setCurrentScreen} 
          />
        );

      default:
        return userId ? (
          <DashboardScreen 
            navigation={navigationAdapter}
            onNavigate={setCurrentScreen} 
            isPhoneConnected={isPhoneConnected}            
            isDeviceConnected={syncState === 'SUCCESS'}    
            isDeviceOn={isDeviceOn}                        
            userId={userId} 
          />
        ) : (
          <LoginScreen 
            navigation={navigationAdapter} 
            onNavigate={setCurrentScreen} 
            onLoginSuccess={handleUserLoginEvent}
          />
        );
    }
  };

  return (
    <SafeAreaProvider style={styles.rootProvider}>
      {renderScreen()}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootProvider: { 
    flex: 1, 
    backgroundColor: '#0F172A' 
  },
});