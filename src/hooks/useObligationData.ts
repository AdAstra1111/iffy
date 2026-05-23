/**
 * useObligationData — Fetches demo obligation topology data via TanStack Query.
 * Uses the Vercel proxy to call the supabase edge function.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const FUNC_URL = '/api/supabase-proxy/functions/v1/demo-obligation-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneData {
  sceneNumber: number;
  sceneHeading: string;
  tensionScore: number;
  obligationCharge: number;
  deferredIntimacy: number;
  narrativeDensity: number;
  narrativePressure: number;
  actNumber: number;
  dominantMode: 'tension_driven' | 'obligation_driven' | 'intimacy_driven' | 'balanced';
}

export interface ObligationSummary {
  dominantModeAcrossScenes: string;
  avgTension: number;
  avgObligation: number;
}

interface ObligationDataResponse {
  scenes: SceneData[];
  summary: ObligationSummary;
}

interface UseObligationDataResult {
  scenes: SceneData[];
  summary: ObligationSummary | null;
  loading: boolean;
  error: string | null;
}

async function fetchObligationData(): Promise<ObligationDataResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(FUNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      projectId: 'demo',
      mock: true,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data?.scenes) throw new Error('No scene data returned');

  return data;
}

export function useObligationData(): UseObligationDataResult {
  const { data, isLoading, error } = useQuery<ObligationDataResponse>({
    queryKey: ['demo-obligation-data'],
    queryFn: fetchObligationData,
    staleTime: 5 * 60 * 1000, // 5 min — demo data doesn't change often
    retry: 2,
  });

  return {
    scenes: data?.scenes ?? [],
    summary: data?.summary ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load obligation data') : null,
  };
}