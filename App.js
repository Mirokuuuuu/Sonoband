import React, { useState, useEffect } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo'; 
import { supabase } from './src/services/supabaseClient';

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

// Caregiver Screens
import CaregiverDashboard from './src/screens/CaregiverDashboard';
import CaregiverNotificationsScreen from './src/screens/CaregiverNotificationsScreen';
import AssignedPatientsScreen from './src/screens/AssignedPatientsScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [screenParams, setScreenParams] = useState({});
  const [userId, setUserId] = useState(null); 
  const [userRole, setUserRole] = useState(null);

  const [forgotPasswordSource, setForgotPasswordSource] = useState('login');

  // Global Hardware & Network States
  const [isDeviceOn, setIsDeviceOn] = useState(false);
  const [syncState, setSyncState] = useState('IDLE'); 
  const [isPhoneConnected, setIsPhoneConnected] = useState(true); 
  const [esp32IP, setEsp32IP] = useState("192.168.43.1");
  
  const [notifications, setNotifications] = useState([]);

  // Navigation Handler with Route Parameter Support
  const handleNavigate = (screenName, params = {}) => {
    const screenMapping = {
      'Notifications': 'notifications',
      'Notification': 'notifications',
      'CaregiverNotifications': 'caregiverNotifications',
      'caregiverNotifications': 'caregiverNotifications',
      'AssignedPatients': 'assignedPatients',
      'assignedPatients': 'assignedPatients',
      'CaregiverDashboard': 'caregiverDashboard',
      'caregiverDashboard': 'caregiverDashboard',
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
    setScreenParams(params || {});
    setCurrentScreen(targetScreen);
  };

  // Universal Helper Navigation Adaptor
  const navigationAdapter = {
    navigate: (screenName, params = {}) => {
      handleNavigate(screenName, params);
    },
    goBack: () => {
      setScreenParams({});
      if (currentScreen === 'fullscreenMap') {
        setCurrentScreen('familyGroup');
      } else if (currentScreen === 'familyGroup') {
        setCurrentScreen('groupManagement');
      } else if (currentScreen === 'login' || currentScreen === 'register') {
        setCurrentScreen('login');
      } else if (
        currentScreen === 'caregiverNotifications' || 
        currentScreen === 'assignedPatients' ||
        (currentScreen === 'profile' && userRole === 'caregiver') // <-- FIX: Direct Caregiver Profile Back-Navigation
      ) {
        setCurrentScreen('caregiverDashboard');
      } else {
        setCurrentScreen(userRole === 'caregiver' ? 'caregiverDashboard' : 'dashboard');
      }
    }
  };

  // Helper function: Resolves custom integer ID and user role from public.users
  const fetchNumericUserId = async (authUser) => {
    if (!authUser) {
      setUserId(null);
      setUserRole(null);
      return null;
    }

    try {
      // 1. Try resolving using the 'uuid' bridge column first
      let { data: userData } = await supabase
        .from('users')
        .select('id, role')
        .eq('uuid', authUser.id)
        .maybeSingle();

      // 2. Fallback: Query by email if 'uuid' isn't populated yet
      if (!userData && authUser.email) {
        const { data: userByEmail } = await supabase
          .from('users')
          .select('id, role')
          .eq('email', authUser.email)
          .maybeSingle();
        userData = userByEmail;
      }

      if (userData?.id) {
        const resolvedId = Number(userData.id);
        const resolvedRole = String(userData.role || '').toLowerCase().trim();

        setUserId(resolvedId);
        setUserRole(resolvedRole);

        return { id: resolvedId, role: resolvedRole };
      }

      setUserId(null);
      setUserRole(null);
      return null;
    } catch (err) {
      console.error('Failed to resolve custom integer user ID:', err);
      setUserId(null);
      setUserRole(null);
      return null;
    }
  };

  // Centralized login event logger & navigator
  const handleUserLoginEvent = async (resolvedIdInput, resolvedRoleInput) => {
    let numericId = typeof resolvedIdInput === 'number' ? resolvedIdInput : Number(resolvedIdInput);
    let resolvedRole = resolvedRoleInput ? String(resolvedRoleInput).toLowerCase().trim() : userRole;

    try {
      if (isNaN(numericId) || !numericId || !resolvedRole) {
        const { data: { session } } = await supabase.auth.getSession();
        const userDetails = await fetchNumericUserId(session?.user);
        if (userDetails) {
          numericId = userDetails.id;
          resolvedRole = userDetails.role;
        }
      } else {
        setUserId(numericId);
        setUserRole(resolvedRole);
      }

      logSystemEvent("User session validated.", "info");
    } catch (err) {
      console.log('Login event setup skipped:', err.message);
    }

    if (resolvedRole === 'caregiver') {
      handleNavigate('caregiverDashboard');
    } else {
      handleNavigate('dashboard');
    }
  };

  // Auth Listener
  useEffect(() => {
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const userDetails = await fetchNumericUserId(session.user);
        if (userDetails?.role === 'caregiver') {
          handleNavigate('caregiverDashboard');
        } else if (userDetails) {
          handleNavigate('dashboard');
        }
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchNumericUserId(session.user);
      }
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
      setUserRole(null);
      setIsDeviceOn(false);
      setSyncState('IDLE');
      setScreenParams({});
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
            onNavigate={(screen, params) => {
              if (screen === 'forgotPassword') {
                setForgotPasswordSource('login');
                handleNavigate('forgotPassword', params);
              } else {
                handleNavigate(screen, params);
              }
            }} 
            onLoginSuccess={handleUserLoginEvent}
          />
        );

      case 'register':
        return (
          <RegisterScreen 
            navigation={navigationAdapter} 
            onNavigate={handleNavigate} 
          />
        );

      case 'forgotPassword':
        return (
          <ForgotPasswordScreen 
            navigation={navigationAdapter}
            onNavigate={() => handleNavigate(forgotPasswordSource)} 
          />
        );

      case 'dashboard':
        return (
          <DashboardScreen 
            navigation={navigationAdapter}
            onNavigate={handleNavigate} 
            isPhoneConnected={isPhoneConnected}            
            isDeviceConnected={syncState === 'SUCCESS'}    
            isDeviceOn={isDeviceOn}                        
            userId={userId} 
            currentScreen={currentScreen}
            route={{ params: screenParams }}
          />
        );

      case 'caregiverDashboard':
        return (
          <CaregiverDashboard
            navigation={navigationAdapter}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
            userId={userId}
            route={{ params: screenParams }}
          />
        );

      case 'caregiverNotifications':
        return (
          <CaregiverNotificationsScreen
            navigation={navigationAdapter}
            onNavigate={handleNavigate}
            userId={userId}
            route={{ params: screenParams }}
          />
        );

      case 'assignedPatients':
        return (
          <AssignedPatientsScreen
            navigation={navigationAdapter}
            onNavigate={handleNavigate}
            userId={userId}
            route={{ params: screenParams }}
          />
        );

      case 'profile':
        return (
          <ProfileScreen 
            userId={userId} 
            onNavigate={(screen, params) => navigationAdapter.navigate(screen, params)}
            onLogout={handleLogout} 
            route={{ params: screenParams }}
          />
        );

      case 'settings':
        return (
          <SettingsScreen 
            navigation={navigationAdapter}
            onNavigate={(screen, params) => {
              if (screen === 'forgotPassword') {
                setForgotPasswordSource('settings');
                handleNavigate('forgotPassword', params);
              } else if (screen === 'login') {
                handleLogout();
              } else {
                handleNavigate(screen, params);
              }
            }}
            userId={userId}
            onLogout={handleLogout}
            route={{ params: screenParams }}
          />
        );

      case 'deviceControl':
      case 'deviceSettings':
        return (
          <DeviceControlScreen 
            navigation={navigationAdapter}
            onNavigate={handleNavigate}
            isDeviceOn={isDeviceOn}
            setIsDeviceOn={setIsDeviceOn}
            syncState={syncState}
            setSyncState={setSyncState}
            isWifiConnected={isPhoneConnected}
            userId={userId}
            deviceIp={esp32IP}
            route={{ params: screenParams }}
          />
        );

      case 'devicePairing':
        return (
          <DevicePairingScreen 
            navigation={navigationAdapter}
            onNavigate={handleNavigate}
            syncState={syncState}
            setSyncState={setSyncState}
            deviceIp={esp32IP}
            setDeviceIp={setEsp32IP}
            userId={userId}
            route={{ params: screenParams }}
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
            onNavigate={handleNavigate} 
            userId={userId} 
            route={{ params: screenParams }}
          />
        );

      case 'alerts':
      case 'alertLogs':
        return (
          <AlertsScreen 
            navigation={navigationAdapter} 
            onNavigate={handleNavigate} 
            isWifiConnected={isPhoneConnected} 
            syncState={syncState} 
            userId={userId} 
            route={{ params: screenParams }}
          />
        );

      case 'familyGroup':
        return (
          <FamilyGroupScreen 
            navigation={navigationAdapter} 
            onNavigate={handleNavigate} 
            userId={userId} 
            route={{ params: screenParams }}
          />
        );

      case 'groupManagement':
        return (
          <GroupManagementScreen 
            navigation={navigationAdapter} 
            onNavigate={handleNavigate} 
            userId={userId} 
            userRole={userRole}
            route={{ params: screenParams }}
          />
        );

      case 'soundManual':
        return (
          <SoundManualScreen 
            navigation={navigationAdapter} 
            onNavigate={handleNavigate} 
            userId={userId} 
            route={{ params: screenParams }}
          />
        );

      case 'fullscreenMap':
        return (
          <FullscreenMapScreen 
            navigation={navigationAdapter} 
            onNavigate={handleNavigate} 
            route={{ params: screenParams }}
          />
        );

      default:
        if (userId) {
          return userRole === 'caregiver' ? (
            <CaregiverDashboard
              navigation={navigationAdapter}
              onNavigate={handleNavigate}
              onLogout={handleLogout}
              userId={userId}
              route={{ params: screenParams }}
            />
          ) : (
            <DashboardScreen 
              navigation={navigationAdapter}
              onNavigate={handleNavigate} 
              isPhoneConnected={isPhoneConnected}            
              isDeviceConnected={syncState === 'SUCCESS'}    
              isDeviceOn={isDeviceOn}                        
              userId={userId} 
              route={{ params: screenParams }}
            />
          );
        }
        return (
          <LoginScreen 
            navigation={navigationAdapter} 
            onNavigate={handleNavigate} 
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