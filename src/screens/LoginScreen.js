import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient'; // Import cloud instance
import bcrypt from 'react-native-bcrypt';

export default function LoginScreen({ onNavigate, onLoginSuccess }) {
  const [email, setEmail] = useState(''); 
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please fill in both email and password.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .single();

      if (error || !data) {
        Alert.alert('Access Denied', 'No record found matching that email address.');
        setLoading(false);
        return;
      }

      const isPasswordMatch = bcrypt.compareSync(password.trim(), data.password);

      if (isPasswordMatch) {
        // 🔢 FORCE INT CASTING explicitly to comply with public.audit_logs schemas
        const cleanUserId = Number(data.id);

        // 📥 1. Attempt insert to audit_logs
        const { error: insertError } = await supabase
          .from('audit_logs')
          .insert([
            { 
              user_id: cleanUserId, // 🟢 Guaranteed pure integer format
              user_name: data.name,
              user_email: data.email,
              role: data.role,
              action: 'login', // Matches CHECK constraint parameters
              ip_address: 'Mobile Device client' 
            }
          ]);

        if (insertError) {
          // 📢 If something is broken with database rules, this alert catches it clearly!
          Alert.alert(
            'Database Logging Blocked', 
            `Your credentials matched, but Supabase rejected saving the log: ${insertError.message}`
          );
          setLoading(false);
          return; 
        }

        // 🛜 2. NEW: Single device connection tracking insert upon success login
        const { error: connectionError } = await supabase
          .from('device_connections')
          .insert([
            {
              user_id: cleanUserId,
              status: 'online',
              timestamp: new Date().toISOString()
            }
          ]);

        if (connectionError) {
          console.error("⚠️ device_connections record rejected:", connectionError.message);
          Alert.alert(
            'Connection Logging Failed',
            `Audit log saved, but failed to register online status: ${connectionError.message}`
          );
          setLoading(false);
          return;
        }

        console.log("🟢 Connection logged successfully ONCE upon login.");

        // Proceed to dashboard only if all necessary logs were successfully written
        onLoginSuccess(data.id); 
      } else {
        Alert.alert('Access Denied', 'The password you entered is incorrect.');
      }
    } catch (error) {
      Alert.alert('System Error', 'Failed to authenticate entry variables against the database.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image source={require('../../assets/logo.jpg')} style={styles.logo} />
      </View>

      <Text style={styles.title}>Sonoband</Text>
      <Text style={styles.subtitle}>Cloud Log In</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Email Address</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Enter your email" 
          placeholderTextColor="#64748b"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        
        <Text style={styles.inputLabel}>Password</Text>
        <View style={styles.passwordWrapper}>
          <TextInput 
            style={styles.passwordInput} 
            placeholder="Enter your password" 
            placeholderTextColor="#64748b"
            secureTextEntry={secureTextEntry}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity 
            style={styles.eyeIcon} 
            onPress={() => setSecureTextEntry(!secureTextEntry)}
          >
            <MaterialCommunityIcons 
              name={secureTextEntry ? "eye-off" : "eye"} 
              size={22} 
              color="#06b6d4" 
            />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.loginButton, loading && { opacity: 0.6 }]} 
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.loginButtonText}>{loading ? "Connecting..." : "Login"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.registerButton} onPress={() => onNavigate('register')}>
        <Text style={styles.registerButtonText}>Register</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => onNavigate('forgotPassword')}>
        <Text style={styles.linkText}>Forgot Password?</Text>
      </TouchableOpacity>

      <Text style={styles.footerText}>© 2026 Sonoband</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 12 },
  logo: { width: 140, height: 140, resizeMode: 'contain', borderRadius: 70 },
  title: { color: '#06b6d4', fontSize: 32, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: '#94a3b8', fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 24 },
  inputContainer: { marginBottom: 24 },
  inputLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#1e293b', color: '#f8fafc', borderWidth: 2, borderColor: '#334155', padding: 14, borderRadius: 12, fontSize: 16 },
  passwordWrapper: { flexDirection: 'row', backgroundColor: '#1e293b', borderWidth: 2, borderColor: '#334155', borderRadius: 12, alignItems: 'center' },
  passwordInput: { flex: 1, color: '#f8fafc', padding: 14, fontSize: 16 },
  eyeIcon: { paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  loginButton: { backgroundColor: '#06b6d4', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  loginButtonText: { color: '#0f172a', fontSize: 16, fontWeight: 'bold' },
  registerButton: { backgroundColor: '#0f172a', borderWidth: 2, borderColor: '#06b6d4', padding: 16, borderRadius: 8, alignItems: 'center' },
  registerButtonText: { color: '#06b6d4', fontSize: 16, fontWeight: 'bold' },
  linkText: { color: '#06b6d4', textAlign: 'center', marginTop: 24, fontSize: 14, fontWeight: '500' },
  footerText: { color: '#64748b', textAlign: 'center', marginTop: 40, fontSize: 12 }
});