import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase, logSystemActivity } from '../services/supabaseClient';
import bcrypt from 'react-native-bcrypt';

bcrypt.setRandomFallback((len) => {
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
});

export default function RegisterScreen({ navigation, onNavigate }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('user');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [loading, setLoading] = useState(false);

  const hasMinLength = password.length >= 10;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-]/.test(password);

  const navigateTo = (screen) => {
    if (onNavigate) {
      onNavigate(screen);
    } else if (navigation?.navigate) {
      navigation.navigate(screen);
    }
  };

  const rolesList = [
    { label: 'Patient / User', value: 'user', icon: 'account' },
    { label: 'Caregiver', value: 'caregiver', icon: 'heart-pulse' },
  ];

  const handleRegistration = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword || !trimmedName) {
      Alert.alert('Registration Error', 'Please fill in all required fields.');
      return;
    }

    if (!trimmedEmail.endsWith('@gmail.com') || trimmedEmail === '@gmail.com') {
      Alert.alert('Invalid Email Domain', 'Please register using a valid @gmail.com account.');
      return;
    }

    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasSpecialChar) {
      Alert.alert('Weak Password', 'Your password does not meet security requirements.');
      return;
    }

    setLoading(true);
    try {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(trimmedPassword, salt);

      // Insert record into custom users table
      const { data: dbData, error: dbError } = await supabase
        .from('users')
        .insert([
          {
            name: trimmedName,
            email: trimmedEmail,
            password: hashedPassword,
            role: selectedRole,
          },
        ])
        .select();

      if (dbError) {
        Alert.alert('Registration Failure', dbError.message);
        setLoading(false);
        return;
      }

      const createdUserId = dbData?.[0]?.id || null;

      // Register Auth user metadata
      await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          data: { 
            full_name: trimmedName,
            role: selectedRole 
          },
        },
      }).catch((err) => console.log('Auth signup rate limit ignored:', err.message));

      // Added Audit Log Activity
      try {
        await logSystemActivity(
          createdUserId,
          'registration',
          `New ${selectedRole} account registered`,
          { role: selectedRole, ipAddress: 'Mobile App' },
          trimmedName,
          trimmedEmail
        );
      } catch (auditErr) {
        console.log('Registration audit log skipped:', auditErr.message);
      }

      Alert.alert('Success', `Account created successfully as ${selectedRole === 'caregiver' ? 'Caregiver' : 'Patient'}!`, [
        { text: 'Proceed to Login', onPress: () => navigateTo('login') },
      ]);
    } catch (error) {
      Alert.alert('Network Error', 'Failed to communicate with remote database.');
      console.error('Registration Catch Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join Sonoband to monitor your health devices</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Full Name</Text>
        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="account-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
          <TextInput 
            style={styles.input} 
            placeholder="John Doe" 
            placeholderTextColor="#64748b" 
            value={fullName} 
            onChangeText={setFullName} 
          />
        </View>

        <Text style={styles.label}>Gmail Address</Text>
        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="email-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
          <TextInput 
            style={styles.input} 
            placeholder="user@gmail.com" 
            placeholderTextColor="#64748b" 
            autoCapitalize="none" 
            keyboardType="email-address"
            value={email} 
            onChangeText={setEmail} 
          />
        </View>

        <Text style={styles.label}>Account Role</Text>
        <View style={styles.roleContainer}>
          {rolesList.map((item) => {
            const isSelected = selectedRole === item.value;
            return (
              <TouchableOpacity
                key={item.value}
                activeOpacity={0.8}
                style={[styles.roleChip, isSelected && styles.activeRoleChip]}
                onPress={() => setSelectedRole(item.value)}
              >
                <MaterialCommunityIcons 
                  name={item.icon} 
                  size={18} 
                  color={isSelected ? '#0f172a' : '#94a3b8'} 
                  style={{ marginRight: 6 }} 
                />
                <Text style={[styles.roleChipText, isSelected && styles.activeRoleChipText]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="lock-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
          <TextInput 
            style={styles.input} 
            placeholder="Choose a password" 
            placeholderTextColor="#64748b" 
            secureTextEntry={secureTextEntry} 
            value={password} 
            onChangeText={setPassword} 
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setSecureTextEntry(!secureTextEntry)} style={styles.eyeIcon}>
            <MaterialCommunityIcons name={secureTextEntry ? "eye-off-outline" : "eye-outline"} size={20} color="#06b6d4" />
          </TouchableOpacity>
        </View>

        {password.length > 0 && (
          <View style={styles.complexityContainer}>
            <RequirementItem isMet={hasMinLength} label="At least 10 characters long" />
            <RequirementItem isMet={hasUppercase} label="At least 1 uppercase letter" />
            <RequirementItem isMet={hasLowercase} label="At least 1 lowercase letter" />
            <RequirementItem isMet={hasSpecialChar} label="At least 1 special character (!@#...)" />
          </View>
        )}

        <TouchableOpacity 
          style={[styles.btn, loading && styles.disabledBtn]} 
          onPress={handleRegistration} 
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.btnText}>Register Now</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => navigateTo('login')} style={styles.backWrapper}>
        <Text style={styles.linkText}>Already have an account? <Text style={{ fontWeight: '700' }}>Log In</Text></Text>
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
  container: { flexGrow: 1, backgroundColor: '#0f172a', padding: 20, paddingTop: 40, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { color: '#06b6d4', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 14, marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: '#1e293b', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#334155' },
  label: { color: '#cbd5e1', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', borderRadius: 12, paddingHorizontal: 12 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#f8fafc', paddingVertical: 12, fontSize: 14 },
  eyeIcon: { padding: 8 },
  roleContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  roleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  activeRoleChip: { backgroundColor: '#06b6d4', borderColor: '#06b6d4' },
  roleChipText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  activeRoleChipText: { color: '#0f172a', fontWeight: '800' },
  complexityContainer: { backgroundColor: '#0f172a', padding: 12, borderRadius: 10, marginTop: 12, borderWidth: 1, borderColor: '#1e293b' },
  requirementRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  requirementText: { color: '#ef4444', fontSize: 12, marginLeft: 6, fontWeight: '500' },
  requirementMet: { color: '#22c55e' },
  btn: { backgroundColor: '#06b6d4', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  disabledBtn: { opacity: 0.6 },
  btnText: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  backWrapper: { marginTop: 24, alignItems: 'center' },
  linkText: { color: '#06b6d4', fontSize: 14 }
});