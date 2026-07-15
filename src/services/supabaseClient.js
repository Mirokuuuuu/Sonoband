// src/services/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// ⚠️ Replace these strings with your actual project keys from your Supabase Dashboard Settings
const SUPABASE_URL = 'https://qdmwobrwokpczqwezjzs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbXdvYnJ3b2twY3pxd2V6anpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjg1MDgsImV4cCI6MjA5Nzg0NDUwOH0.dDn4oJE78IcgDHX5U2FbhxHaHFWFbwqP0AbjT5AajY8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);