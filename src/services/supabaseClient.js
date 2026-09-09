import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://qdmwobrwokpczqwezjzs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbXdvYnJ3b2twY3pxd2V6anpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjg1MDgsImV4cCI6MjA5Nzg0NDUwOH0.dDn4oJE78IcgDHX5U2FbhxHaHFWFbwqP0AbjT5AajY8';

// 1. Initialize and export the Supabase client directly
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// 2. Export system logging function using the initialized client
export const logSystemActivity = async (
  userId,
  action,
  details = '',
  extraData = {},
  userName = null,
  userEmail = null
) => {
  try {
    const finalUserName = userName && userName.trim() ? userName.trim() : 'System User';
    const finalUserEmail = userEmail && userEmail.trim() ? userEmail.trim() : 'N/A';
    
    const parsedUserId = userId && !isNaN(Number(userId)) ? Number(userId) : null;
    const userRole = extraData?.role || 'user';
    const ipAddress = extraData?.ipAddress || 'Mobile App';

    const auditPayload = {
      user_id: parsedUserId,
      action: String(action || 'login').toLowerCase().trim(),
      details: String(details || ''),
      role: String(userRole).toLowerCase().trim(),
      ip_address: ipAddress,
      user_name: finalUserName,
      user_email: finalUserEmail,
      created_at: new Date().toISOString(),
    };

    console.log('Sending to Supabase audit_logs:', auditPayload);

    const { data, error } = await supabase
      .from('audit_logs')
      .insert([auditPayload])
      .select();

    if (error) {
      console.error('Supabase Audit Log Error:', error.message);
    } else {
      console.log('Audit Log Saved Successfully:', data);
    }
  } catch (err) {
    console.error('Failed to log system activity:', err.message);
  }
};