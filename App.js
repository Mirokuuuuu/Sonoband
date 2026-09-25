import 'react-native-get-random-values';
import * as Crypto from 'expo-crypto';
import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ActivityIndicator } from 'react-native';
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

const ROUTE_MAPPINGS = {
  Notifications: 'notifications',
  Notification: 'notifications',
  CaregiverNotifications: 'caregiverNotifications',
  AssignedPatients: 'assignedPatients',
  CaregiverDashboard: 'caregiverDashboard',
  Alerts: 'alerts',
  AlertsScreen: 'alerts',
  AlertLogs: 'alerts',
  FamilyGroup: 'familyGroup',
  GroupManagement: 'groupManagement',
  SoundManual: 'soundManual',
  FullscreenMap: 'fullscreenMap',
  FullScreenMap: 'fullscreenMap',
  Map: 'fullscreenMap',
  Settings: 'settings',
  DeviceControl: 'deviceControl', 
  DeviceSettings: 'deviceControl', 
  DevicePairing: 'devicePairing',
  Dashboard: 'dashboard',
  Login: 'login',
  Profile: 'profile'
};

export default function App() {
  const [navHistory, setNavHistory] = useState(['login']);
  const [screenParams, setScreenParams] = useState({});
  const [userId, setUserId] = useState(null); 
  const [userRole, setUserRole] = useState(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const [forgotPasswordSource, setForgotPasswordSource] = useState('login');

  // Global Hardware & Network States (Defaults Strictly to FALSE)
  const [isDeviceOn, setIsDeviceOn] = useState(false);
  const [syncState, setSyncState] = useState('IDLE'); 
  const [isPhoneConnected, setIsPhoneConnected] = useState(true); 
  const [esp32IP, setEsp32IP] = useState(null);

  const currentScreen = navHistory[navHistory.length - 1] || 'login';

  // Navigation Handlers
  const handleNavigate = useCallback((screenName, params = {}, resetStack = false) => {
    const targetScreen = ROUTE_MAPPINGS[screenName] || screenName;
    setScreenParams(params || {});
    
    setNavHistory(prev => (resetStack ? [targetScreen] : [...prev, targetScreen]));
  }, []);

  const navigationAdapter = {
    navigate: (screenName, params = {}) => handleNavigate(screenName, params),
    goBack: () => {
      setScreenParams({});
      setNavHistory(prev => {
        if (prev.length <= 1) return prev;
        return prev.slice(0, -1);
      });
    }
  };

  // Resolves integer ID and user role strictly from UUID
  const fetchNumericUserId = async (authUser) => {
    if (!authUser) {
      setUserId(null);
      setUserRole(null);
      return null;
    }

    try {
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, role')
        .eq('uuid', authUser.id)
        .maybeSingle();

      if (error) throw error;

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
    } catch (err) {
      console.log('Login event setup skipped:', err.message);
    }

    const initialScreen = resolvedRole === 'caregiver' ? 'caregiverDashboard' : 'dashboard';
    handleNavigate(initialScreen, {}, true);
  };

  // Session Listener & Sync
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          const userDetails = await fetchNumericUserId(session.user);
          if (userDetails) {
            const initialScreen = userDetails.role === 'caregiver' ? 'caregiverDashboard' : 'dashboard';
            setNavHistory([initialScreen]);
          }
        }
      } finally {
        if (mounted) setIsLoadingSession(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUserId(null);
        setUserRole(null);
        setIsDeviceOn(false);
        setSyncState('IDLE');
        setNavHistory(['login']);
      } else if (session?.user && mounted) {
        await fetchNumericUserId(session.user);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      if (supabase?.auth) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.log('Logout error:', err);
    } finally {
      setUserId(null);
      setUserRole(null);
      setIsDeviceOn(false);
      setSyncState('IDLE');
      setScreenParams({});
      setNavHistory(['login']);
    }
  };

  // Real-time Network Listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsPhoneConnected(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  if (isLoadingSession) {
    return (
      <SafeAreaProvider style={[styles.rootProvider, styles.centered]}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </SafeAreaProvider>
    );
  }

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
            setIsDeviceOn={setIsDeviceOn}                     
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
              setIsDeviceOn={setIsDeviceOn}                      
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  }
});