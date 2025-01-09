import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Initializing Supabase client with URL:', supabaseUrl);
console.log('Supabase anon key available:', !!supabaseKey);

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable');
}

if (!supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY environment variable');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    debug: true,
  }
});

// Set up auth state change listener with detailed logging
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Supabase auth event:', event);
  console.log('Session details:', {
    hasSession: !!session,
    user: session?.user ? {
      id: session.user.id,
      email: session.user.email,
    } : null,
  });
});

// Initialize auth state
supabase.auth.getSession().then(({ data: { session } }) => {
  console.log('Initial auth state:', {
    hasSession: !!session,
    user: session?.user ? {
      id: session.user.id,
      email: session.user.email,
    } : null,
  });
});