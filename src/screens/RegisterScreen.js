import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, ScrollView, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient';

// 🆕 Import the bcrypt module
import bcrypt from 'react-native-bcrypt';

export default function RegisterScreen({ onNavigate }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [loading, setLoading] = useState(false);

  // 🆕 Password Complexity Validation Helpers
  const hasMinLength = password.length >= 10;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-]/.test(password);

  const handleRegistration = async () => {
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      Alert.alert('Registration Error', 'Please fill in all required fields.');
      return;
    }

    // 🆕 Validate Complexity rules before allowing form submission
    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasSpecialChar) {
      Alert.alert(
        'Weak Password', 
        'Your password does not meet the mandatory security complexity configurations.'
      );
      return;
    }

    setLoading(true);
    try {
      // 🆕 Generate a security "salt" and hash the plain text password
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password.trim(), salt);

      // Save the details to your custom public users table
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            name: fullName.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword, // Sending the safe encrypted string instead!
            role: 'user'
          }
        ]);

      if (error) {
        Alert.alert('Registration Failure', error.message);
        return;
      }

      Alert.alert('Success', 'Account created and password securely hashed!', [
        { text: 'Proceed to Login', onPress: () => onNavigate('login') }
      ]);
    } catch (error) {
      Alert.alert('Network Error', 'Failed to communicate with remote database.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.logoContainer}>
        <Image source={require('../../assets/logo.jpg')} style={styles.logo} />
      </View>

      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Register Profile Details</Text>

      <Text style={styles.label}>Account Email Address *</Text>
      <TextInput 
        style={styles.input} 
        placeholder="user@gmail.com" 
        placeholderTextColor="#64748b" 
        autoCapitalize="none" 
        keyboardType="email-address"
        value={email} 
        onChangeText={setEmail} 
      />

      <Text style={styles.label}>Account Password *</Text>
      <View style={styles.passwordWrapper}>
        <TextInput 
          style={styles.passwordInput} 
          placeholder="Choose a password" 
          placeholderTextColor="#64748b" 
          secureTextEntry={secureTextEntry} 
          value={password} 
          onChangeText={setPassword} 
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.eyeIcon} onPress={() => setSecureTextEntry(!secureTextEntry)}>
          <MaterialCommunityIcons name={secureTextEntry ? "eye-off" : "eye"} size={20} color="#06b6d4" />
        </TouchableOpacity>
      </View>

      {/* 🆕 DYNAMIC LIVE RECOMPOSITION HINT CONTROLS */}
      {password.length > 0 && (
        <View style={styles.complexityContainer}>
          <View style={styles.requirementRow}>
            <MaterialCommunityIcons 
              name={hasMinLength ? "check-circle" : "close-circle"} 
              size={14} 
              color={hasMinLength ? "#22c55e" : "#ef4444"} 
            />
            <Text style={[styles.requirementText, hasMinLength && styles.requirementMet]}>At least 10 characters long</Text>
          </View>

          <View style={styles.requirementRow}>
            <MaterialCommunityIcons 
              name={hasUppercase ? "check-circle" : "close-circle"} 
              size={14} 
              color={hasUppercase ? "#22c55e" : "#ef4444"} 
            />
            <Text style={[styles.requirementText, hasUppercase && styles.requirementMet]}>At least 1 uppercase letter</Text>
          </View>

          <View style={styles.requirementRow}>
            <MaterialCommunityIcons 
              name={hasLowercase ? "check-circle" : "close-circle"} 
              size={14} 
              color={hasLowercase ? "#22c55e" : "#ef4444"} 
            />
            <Text style={[styles.requirementText, hasLowercase && styles.requirementMet]}>At least 1 lowercase letter</Text>
          </View>

          <View style={styles.requirementRow}>
            <MaterialCommunityIcons 
              name={hasSpecialChar ? "check-circle" : "close-circle"} 
              size={14} 
              color={hasSpecialChar ? "#22c55e" : "#ef4444"} 
            />
            <Text style={[styles.requirementText, hasSpecialChar && styles.requirementMet]}>At least 1 special character (!@#$...)</Text>
          </View>
        </View>
      )}

      <Text style={styles.label}>Full Name *</Text>
      <TextInput style={styles.input} placeholder="John Doe" placeholderTextColor="#64748b" value={fullName} onChangeText={setFullName} />

      <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={handleRegistration} disabled={loading}>
        <Text style={styles.btnText}>{loading ? "Saving Records..." : "Submit Registration"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => onNavigate('login')}>
        <Text style={styles.link}>Return to Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0f172a', padding: 24, paddingTop: 50 },
  logoContainer: { alignItems: 'center', marginBottom: 10 },
  logo: { width: 90, height: 90, borderRadius: 45 },
  title: { color: '#06b6d4', fontSize: 26, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  label: { color: '#94a3b8', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  input: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', padding: 12, borderRadius: 8, marginBottom: 14, color: '#f8fafc' },
  passwordWrapper: { flexDirection: 'row', backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  passwordInput: { flex: 1, padding: 12, color: '#f8fafc', fontSize: 14 },
  eyeIcon: { paddingHorizontal: 12, justifyContent: 'center' },
  
  // 🆕 Styles for Complexity Indicator Component Panels
  complexityContainer: { backgroundColor: '#0f172a', paddingHorizontal: 6, paddingBottom: 14 },
  requirementRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  requirementText: { color: '#ef4444', fontSize: 12, marginLeft: 6, fontWeight: '500' },
  requirementMet: { color: '#22c55e' },

  btn: { backgroundColor: '#06b6d4', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#0f172a', fontSize: 16, fontWeight: 'bold' },
  link: { color: '#06b6d4', textAlign: 'center', marginTop: 20, fontWeight: '500' }
});