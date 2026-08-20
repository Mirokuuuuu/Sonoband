import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Supabase Credentials
const SUPABASE_URL = 'https://qdmwobrwokpczqwezjzs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbXdvYnJ3b2twY3pxd2V6anpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjg1MDgsImV4cCI6MjA5Nzg0NDUwOH0.dDn4oJE78IcgDHX5U2FbhxHaHFWFbwqP0AbjT5AajY8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Function to save audit logs to the cloud database
export const logSystemActivity = async (userId, eventType, description) => {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .insert([
        { 
          user_id: userId, 
          event_type: eventType, 
          description: description, 
          created_at: new Date().toISOString() 
        }
      ]);

    if (error) console.error('Error logging activity:', error.message);
    return data;
  } catch (err) {
    console.error('Database Connection Error:', err);
  }
};