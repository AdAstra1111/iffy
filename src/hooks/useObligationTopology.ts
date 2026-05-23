import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  SceneObligationMetrics,
  ObligationTopologyResult,
} from '@/lib/obligation-topology-types';
import { deriveSceneMetrics } from '@/lib/obligation-topology-types';

interface UseObligationTopologyOptions {
  versionId?: string;
  forceRecompute?: boolean;
}

interface UseObligationTopologyReturn {
  /** Per-scene derived metrics from the graph model */
  states: Record<string, SceneObligationMetrics>;
  /** Raw topology result (nodes, edges, metrics, obligations) */
  topology: ObligationTopologyResult | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useObligationTopology(
  projectId: string | undefined,
  sceneIds: string[],
  options?: UseObligationTopologyOptions,
): UseObligationTopologyReturn {
  const [states, setStates] = useState<Record<string, SceneObligationMetrics>>({});
  const [topology, setTopology] = useState<ObligationTopologyResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchTopology = useCallback(async () => {
    if (!projectId || sceneIds.length === 0) return;

    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('compute-obligation-topology', {
        body: {
          project_id: projectId,
          scene_ids: sceneIds,
          version_id: options?.versionId,
          force_recompute: options?.forceRecompute ?? false,
        },
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      // New response shape: data.topology is ObligationTopologyResult
      const result = data?.topology as ObligationTopologyResult | undefined;
      if (result?.topology?.nodes && result?.topology?.edges) {
        setTopology(result);
        setStates(deriveSceneMetrics(result.topology.nodes, result.topology.edges));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Obligation topology fetch error:', err);
      setError(err.message || 'Failed to load obligation topology');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, sceneIds.join(','), options?.versionId, options?.forceRecompute]);

  useEffect(() => {
    fetchTopology();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchTopology]);

  return {
    states,
    topology,
    isLoading,
    error,
    refetch: fetchTopology,
  };
}
