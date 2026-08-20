import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient';
import bcrypt from 'react-native-bcrypt';

export default function ForgotPasswordScreen({ navigation, onNavigate }) {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [verifiedUserId, setVerifiedUserId] = useState(null);

  const hasMinLength = newPassword.length >= 10;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-]/.test(newPassword);

  const navigateToBack = () => {
    if (onNavigate) {
      onNavigate('login');
    } else if (navigation && navigation.goBack) {
      navigation.goBack();
    }
  };

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
        setVerifiedUserId(data[0].id);
        setStep(2);
      }
    } catch (e) {
      Alert.alert('Database Error', 'Could not communicate with the database.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasSpecialChar) {
      Alert.alert('Weak Password', 'Your new password does not meet the security requirements.');
      return;
    }

    setLoading(true);

    try {
      const salt = bcrypt.genSaltSync(10);
      const hashedNewPassword = bcrypt.hashSync(newPassword.trim(), salt);

      const { data, error } = await supabase
        .from('users')
        .update({ password: hashedNewPassword })
        .eq('id', verifiedUserId)
        .select();

      if (error) {
        Alert.alert('Update Failed', error.message);
        return;
      }

      Alert.alert('Success', 'Password updated successfully!', [
        { text: 'Go to Login', onPress: () => navigateToBack() }
      ]);
    } catch (e) {
      Alert.alert('Exception Error', 'Failed updating records.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="lock-reset" size={32} color="#06b6d4" />
        </View>
        <Text style={styles.title}>Account Recovery</Text>
        <Text style={styles.subtitle}>
          {step === 1 ? "Verify your email address to reset password" : "Create a strong new password for your account"}
        </Text>
      </View>

      <View style={styles.card}>
        {step === 1 ? (
          <View>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <MaterialCommunityIcons name="email-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="Enter your registered email" 
                placeholderTextColor="#64748b"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <TouchableOpacity style={[styles.btn, loading && styles.disabledBtn]} onPress={handleVerifyEmail} disabled={loading}>
              {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.btnText}>Verify Identity</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.label}>New Secure Password</Text>
            <View style={styles.inputWrapper}>
              <MaterialCommunityIcons name="lock-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="Enter new password" 
                placeholderTextColor="#64748b" 
                secureTextEntry={secureTextEntry} 
                value={newPassword} 
                onChangeText={setNewPassword} 
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setSecureTextEntry(!secureTextEntry)} style={styles.eyeIcon}>
                <MaterialCommunityIcons name={secureTextEntry ? "eye-off-outline" : "eye-outline"} size={20} color="#06b6d4" />
              </TouchableOpacity>
            </View>

            {newPassword.length > 0 && (
              <View style={styles.complexityContainer}>
                <RequirementItem isMet={hasMinLength} label="At least 10 characters long" />
                <RequirementItem isMet={hasUppercase} label="At least 1 uppercase letter" />
                <RequirementItem isMet={hasLowercase} label="At least 1 lowercase letter" />
                <RequirementItem isMet={hasSpecialChar} label="At least 1 special character" />
              </View>
            )}

            <TouchableOpacity style={[styles.btn, loading && styles.disabledBtn]} onPress={handleUpdatePassword} disabled={loading}>
              {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.btnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity onPress={navigateToBack} style={styles.backWrapper}>
        <Text style={styles.linkText}>← Back to Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const RequirementItem = ({ isMet, label }) => (
  <View style={styles.requirementRow}>
    <MaterialCommunityIcons 
      name={isMet ? "check-circle" : "close-circle"} 
      size={14} 
      color={isMet ? "#22c55e" : "#ef4444"} 
    />
    <Text style={[styles.requirementText, isMet && styles.requirementMet]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0f172a', padding: 20, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  title: { color: '#06b6d4', fontSize: 26, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 14, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },

  card: { backgroundColor: '#1e293b', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#334155' },
  label: { color: '#cbd5e1', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', borderRadius: 12, paddingHorizontal: 12 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#f8fafc', paddingVertical: 12, fontSize: 14 },
  eyeIcon: { padding: 8 },

  complexityContainer: { backgroundColor: '#0f172a', padding: 12, borderRadius: 10, marginTop: 12, borderWidth: 1, borderColor: '#1e293b' },
  requirementRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  requirementText: { color: '#ef4444', fontSize: 12, marginLeft: 6, fontWeight: '500' },
  requirementMet: { color: '#22c55e' },

  btn: { backgroundColor: '#06b6d4', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  disabledBtn: { opacity: 0.6 },
  btnText: { color: '#0f172a', fontSize: 16, fontWeight: '700' },

  backWrapper: { marginTop: 24, alignItems: 'center' },
  linkText: { color: '#06b6d4', fontSize: 14, fontWeight: '600' }
});