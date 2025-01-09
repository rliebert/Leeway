import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { useToast } from './use-toast';

type Profile = Database['public']['Tables']['users']['Row'];

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session check:', !!session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('Auth state changed:', _event, !!session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      console.log('Fetching profile for user:', userId);
      const { data, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (dbError) {
        // If user doesn't exist in our database yet, create profile
        if (dbError.code === 'PGRST116') {
          console.log('Creating new profile for user:', userId);
          const { data: newProfile, error: createError } = await supabase
            .from('users')
            .insert({
              id: userId,
              username: user?.email?.split('@')[0] || `user_${userId.slice(0, 8)}`,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (createError) throw createError;
          setProfile(newProfile);
        } else {
          throw dbError;
        }
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching/creating profile:', error);
      setError(error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async ({ email, password }: { email: string; password: string }) => {
    try {
      console.log('Attempting sign in for:', email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (data.user) {
        toast({
          description: "Successfully logged in!",
        });
      }
      return { ok: true };
    } catch (error) {
      console.error('Sign in error:', error);
      toast({
        variant: "destructive",
        description: (error as Error).message,
      });
      return { ok: false, message: (error as Error).message };
    }
  };

  const signUp = async ({ email, password, username }: { email: string; password: string; username: string }) => {
    try {
      console.log('Attempting sign up for:', email);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) throw signUpError;

      if (data.user) {
        const { error: profileError } = await supabase.from('users').insert({
          id: data.user.id,
          username,
          created_at: new Date().toISOString(),
        });

        if (profileError) throw profileError;
        toast({
          description: "Successfully registered! Please check your email for verification.",
        });
      }

      return { ok: true };
    } catch (error) {
      console.error('Sign up error:', error);
      toast({
        variant: "destructive",
        description: (error as Error).message,
      });
      return { ok: false, message: (error as Error).message };
    }
  };

  const signOut = async () => {
    try {
      console.log('Attempting sign out');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast({
        description: "Successfully logged out!",
      });
      return { ok: true };
    } catch (error) {
      console.error('Sign out error:', error);
      toast({
        variant: "destructive",
        description: (error as Error).message,
      });
      return { ok: false, message: (error as Error).message };
    }
  };

  return {
    user: profile,
    isLoading,
    error,
    signIn,
    signOut,
    signUp,
  };
}