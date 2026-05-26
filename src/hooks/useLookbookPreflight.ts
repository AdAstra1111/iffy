/**
 * useLookbookPreflight — Evaluate lookbook generation readiness.
 *
 * Calls the lookbook-preflight edge function (read-only) and returns
 * the preflight evaluation result with per-requirement pass/fail status.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LookbookPreflightResult } from '@/lib/visual/visualGovernanceTypes';

interface PreflightResponse {
  error?: string;
  [key: string]: unknown;
}

async function fetchPreflight(projectId: string): Promise<LookbookPreflightResult> {
  const { data, error } = await supabase.functions.invoke<PreflightResponse>(
    'lookbook-preflight',
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

  if (!data || typeof data.all_requirements_pass !== 'boolean') {
    throw new Error('Invalid preflight response shape');
  }

  return data as unknown as LookbookPreflightResult;
}

export function useLookbookPreflight(
  projectId: string | undefined,
  enabled?: boolean,
) {
  return useQuery<LookbookPreflightResult, Error>({
    queryKey: ['lookbook-preflight', projectId],
    queryFn: () => fetchPreflight(projectId!),
    enabled: !!projectId && (enabled ?? true),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}