import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import type { UIMode } from '@/lib/mode';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface UIModeContextValue {
  mode: UIMode;
  setMode: (m: UIMode) => void;
  loading: boolean;
}

const UIModeContext = createContext<UIModeContextValue | null>(null);

const LOCAL_STORAGE_KEY = 'iffy_ui_mode';

function readLocalStorage(): UIMode {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored === 'advanced' || stored === 'simple') return stored;
  } catch { /* ignore */ }
  return 'simple';
}

function writeLocalStorage(mode: UIMode): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

export function UIModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Local state always wins — read from localStorage immediately for instant toggle
  const [localMode, setLocalMode] = useState<UIMode>(readLocalStorage);

  // Supabase profile query (secondary — only used when available)
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile-mode', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('mode_preference')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    // Don't refetch often — localStorage is source of truth
    staleTime: Infinity,
    retry: 1,
  });

  // Supabase write mutation — non-blocking, best-effort
  const mutation = useMutation({
    mutationFn: async (mode: UIMode) => {
      if (!user) return;
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, mode_preference: mode } as any, {
          onConflict: 'user_id',
        });
      if (error) console.warn('[useUIMode] failed to persist mode to Supabase:', error.message);
    },
  });

  // Derive effective mode: prefer Supabase profile if loaded, else localStorage
  const mode = useMemo<UIMode>(() => {
    if (!isLoading && profile && (profile as any)?.mode_preference) {
      return (profile as any).mode_preference === 'advanced' ? 'advanced' : 'simple';
    }
    return localMode;
  }, [profile, isLoading, localMode]);

  // Sync localStorage when profile loads (migration path — first load after fix)
  useEffect(() => {
    if (!isLoading && profile && (profile as any)?.mode_preference) {
      writeLocalStorage((profile as any).mode_preference);
    }
  }, [profile, isLoading]);

  const setMode = useCallback(
    (m: UIMode) => {
      // Always update local state immediately (optimistic, no waiting)
      setLocalMode(m);
      writeLocalStorage(m);
      // Also persist to Supabase in background (non-blocking)
      mutation.mutate(m);
    },
    [mutation],
  );

  const value = useMemo(
    () => ({ mode, setMode, loading: isLoading }),
    [mode, setMode, isLoading],
  );

  return <UIModeContext.Provider value={value}>{children}</UIModeContext.Provider>;
}

export function useUIMode(): UIModeContextValue {
  const ctx = useContext(UIModeContext);
  if (!ctx) throw new Error('useUIMode must be used within UIModeProvider');
  return ctx;
}
