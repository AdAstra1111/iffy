/**
 * useHeroFramePreflight — Evaluate hero-frame generation readiness.
 *
 * Calls the hero-frame-preflight edge function (read-only) and returns
 * the preflight evaluation result with per-requirement pass/fail status.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { HeroFramePreflightResult } from '@/lib/visual/visualGovernanceTypes';

interface PreflightResponse {
  error?: string;
  [key: string]: unknown;
}

async function fetchPreflight(projectId: string): Promise<HeroFramePreflightResult> {
  const { data, error } = await supabase.functions.invoke<PreflightResponse>(
    'hero-frame-preflight',
    {
      body: { projectId },
    },
  );

  if (error) {
    throw new Error(`Preflight fetch error: ${error.message}`);
  }

  if (data?.error) {
    throw new Error(`Preflight error: ${data.error}`);
  }

  // Validate response shape
  if (!data || typeof data.all_requirements_pass !== 'boolean') {
    throw new Error('Invalid preflight response shape');
  }

  return data as unknown as HeroFramePreflightResult;
}

export function useHeroFramePreflight(
  projectId: string | undefined,
  enabled?: boolean,
) {
  return useQuery<HeroFramePreflightResult, Error>({
    queryKey: ['hero-frame-preflight', projectId],
    queryFn: () => fetchPreflight(projectId!),
    enabled: !!projectId && (enabled ?? true),
    staleTime: 30_000, // 30 seconds — preflight inputs don't change rapidly
    retry: 1,
    refetchOnWindowFocus: false,
  });
}