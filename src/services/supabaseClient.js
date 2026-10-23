import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase Setup] Missing Expo Public Environment Variables.');
}

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
  param4 = null,
  param5 = null,
  param6 = null
) => {
  try {
    let userName = null;
    let userEmail = null;
    let userRole = 'user';
    let extraData = {};

    if (typeof param4 === 'string') {
      userName = param4;
      userEmail = param5;
      userRole = param6 || 'user';
    } else if (typeof param4 === 'object' && param4 !== null) {
      extraData = param4;
      userName = param5 || extraData.userName || null;
      userEmail = param6 || extraData.userEmail || null;
      userRole = extraData.role || 'user';
    }

    let parsedUserId = null;
    if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
      const numVal = Number(userId);
      if (!isNaN(numVal)) {
        parsedUserId = numVal;
      }
    }

    if (userName === 'You' || userName === 'System User' || userName === 'User') {
      userName = null;
    }

    if ((!userName || !userEmail) && userId) {
      try {
        const query = parsedUserId
          ? supabase.from('users').select('id, name, email, role').eq('id', parsedUserId)
          : supabase.from('users').select('id, name, email, role').eq('uuid', String(userId));

        const { data: userData } = await query.maybeSingle();

        if (userData) {
          if (!parsedUserId && userData.id) parsedUserId = Number(userData.id);
          userName = userName || userData.name || userData.email;
          userEmail = userEmail || userData.email;
          if (userData.role) userRole = userData.role;
        }
      } catch (lookupErr) {
        console.warn('[Audit Log] Profile lookup warning:', lookupErr.message);
      }
    }

    const finalUserName = userName && userName.trim() ? userName.trim() : 'System User';
    const finalUserEmail = userEmail && userEmail.trim() ? userEmail.trim() : 'N/A';

    const auditPayload = {
      user_id: parsedUserId,
      action: String(action || 'system_event').toLowerCase().trim(),
      details: typeof details === 'object' ? JSON.stringify(details) : String(details || ''),
      role: String(userRole).toLowerCase().trim(),
      ip_address: extraData.ipAddress || 'Mobile App',
      user_name: finalUserName,
      user_email: finalUserEmail,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('audit_logs')
      .insert([auditPayload])
      .select();

    if (error) {
      console.error('[Audit Log] Supabase Error:', error.message);
    }
  } catch (err) {
    console.error('[Audit Log] Unexpected Error:', err.message);
  }
};