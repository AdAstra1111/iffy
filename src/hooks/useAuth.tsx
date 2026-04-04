import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const previousUserIdRef = useRef<string | null>(null);
  const resolvedInitialSessionRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    const syncAuthScopedQueries = (
      nextUserId: string | null,
      hasSession: boolean,
      options?: { clearScopedQueries?: boolean }
    ) => {
      const previousUserId = previousUserIdRef.current;

      if (options?.clearScopedQueries && previousUserId !== nextUserId) {
        queryClient.removeQueries({ queryKey: ['projects'] });
        queryClient.removeQueries({ queryKey: ['project'] });
      }

      if (nextUserId && hasSession) {
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['project'] });
      }

      previousUserIdRef.current = nextUserId;
    };

    const applySession = (
      nextSession: Session | null,
      event: AuthChangeEvent | 'SESSION_RESTORED' | 'SESSION_RESTORE_FAILED'
    ) => {
      if (!isActive) return;

      const nextUserId = nextSession?.user?.id ?? null;
      const hasSession = Boolean(nextSession?.access_token);
      const previousUserId = previousUserIdRef.current;
      const isExplicitSignOut = event === 'SIGNED_OUT';
      const isFirstResolution = !resolvedInitialSessionRef.current;
      const isInitialNullBootstrapEvent = event === 'INITIAL_SESSION' && !nextSession && isFirstResolution && !previousUserId;
      const isTransientNullSession = !nextSession && !isExplicitSignOut && !isFirstResolution && Boolean(previousUserId);

      if (isInitialNullBootstrapEvent) {
        return;
      }

      if (isTransientNullSession) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      syncAuthScopedQueries(nextUserId, hasSession, {
        clearScopedQueries: isExplicitSignOut || (Boolean(previousUserId) && Boolean(nextUserId) && previousUserId !== nextUserId),
      });
      resolvedInitialSessionRef.current = true;
      setLoading(false);
    };

    const restoreSession = async (attempt = 0) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        applySession(session, 'SESSION_RESTORED');
      } catch (error) {
        const isAbortError = error instanceof Error && error.name === 'AbortError';

        if (isAbortError && attempt < 2) {
          window.setTimeout(() => {
            if (isActive) {
              void restoreSession(attempt + 1);
            }
          }, attempt === 0 ? 150 : 500);
          return;
        }

        console.warn('Auth session restore failed:', error);
        if (isActive) {
          resolvedInitialSessionRef.current = true;
          setLoading(false);
        }
      }
    };

    const authInitFallback = window.setTimeout(() => {
      if (isActive && !resolvedInitialSessionRef.current) {
        void restoreSession(2);
      }
    }, 4000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        applySession(session, event);
      }
    );

    void restoreSession();

    return () => {
      isActive = false;
      window.clearTimeout(authInitFallback);
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
