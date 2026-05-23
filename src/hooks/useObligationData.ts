/**
 * useObligationData.ts — React Query hook for fetching obligation topology data.
 *
 * Calls the Vercel proxy endpoint which routes to the Supabase edge function.
 * Supports mock mode for demo/preview and real mode with scene data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Scene {
  id: string;
  act_id: string;
  title: string;
  entities: string[];
}

export type ObligationType =
  | 'setup'
  | 'payoff'
  | 'escalation'
  | 'reversal'
  | 'resolution'
  | 'continuity';

export type LifecycleState =
  | 'loaded'
  | 'active'
  | 'discharging'
  | 'discharged';

export interface Obligation {
  source_scene_key: string;
  target_scene_key: string;
  type: ObligationType;
  charge: number;
  confidence: number;
  lifecycle_state: LifecycleState;
  thread_label: string;
}

export interface ObligationTopologyNode {
  scene_key: string;
  act_id: string;
  title: string;
  entity_count: number;
}

export interface ObligationTopologyEdge {
  source: string;
  target: string;
  type: ObligationType;
  charge: number;
  lifecycle_state: LifecycleState;
}

export interface ObligationTopologyMetrics {
  total_obligations: number;
  by_type: Record<ObligationType, number>;
  by_lifecycle: Record<LifecycleState, number>;
  avg_charge: number;
  avg_confidence: number;
  acts_spanning: number;
  discharged_count: number;
  active_count: number;
}

export interface ObligationTopologyResult {
  obligations: Obligation[];
  topology: {
    nodes: ObligationTopologyNode[];
    edges: ObligationTopologyEdge[];
    metrics: ObligationTopologyMetrics;
  };
}

export interface UseObligationDataOptions {
  mock?: boolean;
  scenes?: Scene[];
}

async function fetchObligationData(
  options: UseObligationDataOptions,
): Promise<ObligationTopologyResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const authToken = sessionData?.session?.access_token || '';

  const body: Record<string, unknown> = {};
  if (options.mock) {
    body.mock = true;
  } else if (options.scenes) {
    body.scenes = options.scenes;
  }

  const response = await fetch(
    '/api/supabase-proxy/functions/v1/demo-obligation-data',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'x-supabase-key': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Obligation data request failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export function useObligationData(options: UseObligationDataOptions = {}) {
  const hasInput = options.mock || (options.scenes && options.scenes.length > 0);

  const query = useQuery({
    queryKey: ['obligation-data', options],
    queryFn: () => fetchObligationData(options),
    enabled: hasInput,
    staleTime: 30_000,
  });

  return {
    obligations: query.data?.obligations ?? [],
    topology: query.data?.topology ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}