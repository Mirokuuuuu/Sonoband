import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient';

// 🆕 Import bcrypt to match registration encryption
import bcrypt from 'react-native-bcrypt';

export default function ForgotPasswordScreen({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [step, setStep] = useState(1); // Step 1: Verify Email, Step 2: New Password
  const [loading, setLoading] = useState(false);
  
  // 🆕 Store the verified user ID to bypass downstream filter mismatches
  const [verifiedUserId, setVerifiedUserId] = useState(null);

  // Password Complexity Checks
  const hasMinLength = newPassword.length >= 10;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-]/.test(newPassword);

  // 🚪 STEP 1: Verify user exists
  const handleVerifyEmail = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Missing Input', 'Please enter your registered email address.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email')
        .ilike('email', cleanEmail);

      if (error || !data || data.length === 0) {
        Alert.alert('Account Not Found', 'This email is not registered in our system.');
      } else {
        // 🆕 Save the specific internal row database ID to target directly in Step 2
        setVerifiedUserId(data[0].id);
        setStep(2);
      }
    } catch (e) {
      Alert.alert('Database Error', 'Could not communicate with the database.');
    } finally {
      setLoading(false);
    }
  };

  // 🔑 STEP 2: Hash new password and enforce update
  const handleUpdatePassword = async () => {
    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasSpecialChar) {
      Alert.alert('Weak Password', 'Your new password does not meet the mandatory security complexity configurations.');
      return;
    }

    setLoading(true);

    try {
      // Generate salt and hash the new password using bcrypt
      const salt = bcrypt.genSaltSync(10);
      const hashedNewPassword = bcrypt.hashSync(newPassword.trim(), salt);

      // 🛠️ FIX: Update strictly by target primary key ID to eliminate string collation conflicts
      const { data, error } = await supabase
        .from('users')
        .update({ password: hashedNewPassword })
        .eq('id', verifiedUserId)
        .select();

      if (error) {
        Alert.alert('Update Failed', error.message);
        return;
      }

      // If RLS is blocking public updates or row is missing, handle gracefully
      if (!data || data.length === 0) {
        Alert.alert(
          'Security Policy Restriction', 
          'Database row matched but update was rejected. Ensure Row-Level Security (RLS) policies on your Supabase users table permit updates.'
        );
        return;
      }

      Alert.alert('Success', 'Your security profile has been updated successfully!', [
        { text: 'Go to Login', onPress: () => onNavigate('login') }
      ]);
    } catch (e) {
      Alert.alert('Exception Error', 'Failed updating records.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Account Recovery</Text>
      
      {step === 1 ? (
        <View style={{ width: '100%' }}>
          <Text style={styles.subtitle}>Enter your registered email below to verify your identity.</Text>
          
          <TextInput 
            style={styles.input} 
            placeholder="Enter your Email Address" 
            placeholderTextColor="#64748b"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={handleVerifyEmail} disabled={loading}>
            <Text style={styles.btnText}>{loading ? "Verifying..." : "Verify Identity"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ width: '100%' }}>
          <Text style={styles.subtitle}>Email verified! Choose a strong new password below.</Text>
          
          <Text style={styles.label}>New Secure Password *</Text>
          <View style={styles.passwordWrapper}>
            <TextInput 
              style={styles.passwordInput} 
              placeholder="Enter new password" 
              placeholderTextColor="#64748b" 
              secureTextEntry={secureTextEntry} 
              value={newPassword} 
              onChangeText={setNewPassword} 
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeIcon} onPress={() => setSecureTextEntry(!secureTextEntry)}>
              <MaterialCommunityIcons name={secureTextEntry ? "eye-off" : "eye"} size={20} color="#06b6d4" />
            </TouchableOpacity>
          </View>

          {/* DYNAMIC LIVE COMPLEXITY TRACKER HINTS */}
          {newPassword.length > 0 && (
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
                <Text style={[styles.requirementText, hasSpecialChar && styles.requirementMet]}>At least 1 special character</Text>
              </View>
            </View>
          )}

          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={handleUpdatePassword} disabled={loading}>
            <Text style={styles.btnText}>{loading ? "Updating..." : "Update Password"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity onPress={() => onNavigate('login')}>
        <Text style={styles.link}>Back to Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0f172a', justifyContent: 'center', padding: 24 },
  title: { color: '#06b6d4', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  subtitle: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 24, paddingHorizontal: 10, lineHeight: 20 },
  label: { color: '#94a3b8', fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', padding: 14, borderRadius: 8, color: '#f8fafc', marginBottom: 16, fontSize: 14 },
  passwordWrapper: { flexDirection: 'row', backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  passwordInput: { flex: 1, padding: 14, color: '#f8fafc', fontSize: 14 },
  eyeIcon: { paddingHorizontal: 14, justifyContent: 'center' },
  complexityContainer: { backgroundColor: '#0f172a', paddingHorizontal: 4, marginBottom: 16 },
  requirementRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  requirementText: { color: '#ef4444', fontSize: 12, marginLeft: 6, fontWeight: '500' },
  requirementMet: { color: '#22c55e' },
  btn: { backgroundColor: '#06b6d4', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#0f172a', fontSize: 16, fontWeight: 'bold' },
  link: { color: '#06b6d4', textAlign: 'center', marginTop: 24, fontWeight: '500' }
});