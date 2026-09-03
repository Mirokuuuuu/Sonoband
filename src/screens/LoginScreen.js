import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient';
import bcrypt from 'react-native-bcrypt';

bcrypt.setRandomFallback((len) => {
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
});

export default function LoginScreen({ navigation, onNavigate, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [loading, setLoading] = useState(false);

  const navigateTo = (screen, params = {}) => {
    if (onNavigate) {
      onNavigate(screen, params);
    } else if (navigation?.navigate) {
      navigation.navigate(screen, params);
    }
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Required Fields', 'Please fill in both gmail and password.');
      return;
    }

    setLoading(true);

    try {
      // 1. Establish an active Supabase Auth session
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      // 2. Query custom user table record
      const { data: userData, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('email', trimmedEmail)
        .maybeSingle();

      let resolvedUserId = null;
      let isPasswordMatch = false;

      if (userData) {
        resolvedUserId = userData.id !== undefined ? userData.id : userData.user_id;
        // Verify via local bcrypt fallback if auth record was registered via DB script directly
        isPasswordMatch = bcrypt.compareSync(trimmedPassword, userData.password);
      }

      // Deny access if both Supabase Auth and manual database record fail
      if (authError && !isPasswordMatch) {
        Alert.alert('Access Denied', authError?.message || 'Invalid gmail or password.');
        setLoading(false);
        return;
      }

      if (resolvedUserId === undefined || resolvedUserId === null) {
        // Fallback: Use numeric hash/string if custom user ID is missing
        resolvedUserId = authData?.user?.id || '1';
      }

      // 3. Save active User ID to local storage
      await AsyncStorage.setItem('user_id', String(resolvedUserId));

      // 4. Record active login audit event
      try {
        await supabase
          .from('audit_logs')
          .insert([
            {
              user_id: Number(resolvedUserId) || null,
              action: 'login',
              details: 'User signed in successfully',
            },
          ]);
      } catch (auditErr) {
        console.log('Audit log skipped:', auditErr.message);
      }

      // 5. Track connection status
      try {
        await supabase
          .from('device_connections')
          .insert([
            {
              user_id: resolvedUserId,
              status: 'online',
              timestamp: new Date().toISOString(),
            },
          ]);
      } catch (connErr) {
        console.log('Device connection log skipped:', connErr.message);
      }

      setLoading(false);

      if (onLoginSuccess) {
        onLoginSuccess(resolvedUserId);
      }

      navigateTo('Dashboard', { userId: resolvedUserId });
    } catch (error) {
      console.error('Login system error:', error);
      Alert.alert('System Error', 'Failed to authenticate user.');
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Image source={require('../../assets/logo.jpg')} style={styles.logo} />
          </View>
          <Text style={styles.title}>Sonoband</Text>
          <Text style={styles.subtitle}>Welcome back! Log in to your account</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.inputLabel}>Gmail Address</Text>
          <View style={styles.inputWrapper}>
            <MaterialCommunityIcons name="email-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="name@gmail.com"
              placeholderTextColor="#64748b"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputWrapper}>
            <MaterialCommunityIcons name="lock-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="••••••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry={secureTextEntry}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setSecureTextEntry(!secureTextEntry)} style={styles.eyeIcon}>
              <MaterialCommunityIcons name={secureTextEntry ? "eye-off-outline" : "eye-outline"} size={20} color="#06b6d4" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => navigateTo('forgotPassword')} style={styles.forgotPassWrapper}>
            <Text style={styles.linkText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.primaryButtonText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerPrompt}>Don't have an account?</Text>
          <TouchableOpacity onPress={() => navigateTo('register')}>
            <Text style={styles.registerLink}> Create Account</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.copyrightText}>© 2026 Sonoband. All rights reserved.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0f172a', justifyContent: 'center', padding: 20 },
  header: { alignItems: 'center', marginBottom: 24 },
  logoBadge: {
    padding: 4,
    borderRadius: 60,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    marginBottom: 12,
  },
  logo: { width: 90, height: 90, borderRadius: 45 },
  title: { color: '#06b6d4', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 14, marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: '#1e293b', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#334155' },
  inputLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#f8fafc', paddingVertical: 12, fontSize: 15 },
  eyeIcon: { padding: 8 },
  forgotPassWrapper: { alignItems: 'flex-end', marginTop: 10, marginBottom: 20 },
  linkText: { color: '#06b6d4', fontSize: 13, fontWeight: '600' },
  primaryButton: { backgroundColor: '#06b6d4', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerPrompt: { color: '#94a3b8', fontSize: 14 },
  registerLink: { color: '#06b6d4', fontSize: 14, fontWeight: '700' },
  copyrightText: { color: '#475569', textAlign: 'center', marginTop: 32, fontSize: 12 },
});