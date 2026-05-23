import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ObligationTopologyState {
  meta: {
    computedAt: string;
    projectId: string;
    sceneId: string;
    versionId: string | null;
    inputHash: string;
  };
  tensionField: {
    aggregateScore: number;
    aggregateDirection: string;
    pairTensions: any[];
    gradient: number | null;
    activeThreadCount: number;
    newThreads: any[];
    resolvedThreads: any[];
  };
  obligationCharge: {
    chargeScore: number;
    outstanding: any[];
    introduced: any[];
    fulfilled: any[];
    velocity: number;
    overdueCount: number;
  };
  deferredIntimacy: {
    aggregateIndex: number;
    pairStates: any[];
    deferredMoments: any[];
    resolvedMoments: any[];
    avoidantCharacters: string[];
    velocity: number;
  };
  narrativeDensity: {
    score: number;
    subScores: { dimension: string; score: number; weight: number; explanation: string }[];
    band: 'dense' | 'balanced' | 'sparse';
    metrics: {
      wordCount: number;
      beatDensity: number;
      characterBeatDensity: number;
      dialogueRatio: number;
      thematicCoverage: number;
      plotThreadDensity: number;
      turnaroundDensity: number;
    };
    expectedDensity: number;
    anomalous: boolean;
  };
  narrativePressure: number;
  dominantMode: string;
  signals: {
    overpressure: boolean;
    intimacyCritical: boolean;
    obligationOverload: boolean;
    densityAnomaly: boolean;
    narrativeBrief: string;
  };
  actRollup?: {
    tension: any;
    obligation: any;
  };
}

interface UseObligationTopologyOptions {
  versionId?: string;
  forceRecompute?: boolean;
}

interface UseObligationTopologyReturn {
  states: Record<string, ObligationTopologyState>;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useObligationTopology(
  projectId: string | undefined,
  sceneIds: string[],
  options?: UseObligationTopologyOptions,
): UseObligationTopologyReturn {
  const [states, setStates] = useState<Record<string, ObligationTopologyState>>({});
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

      if (data?.states) {
        // Filter out error states
        const validStates: Record<string, ObligationTopologyState> = {};
        for (const [id, state] of Object.entries(data.states)) {
          if (state && typeof state === 'object' && !('error' in (state as any))) {
            validStates[id] = state as ObligationTopologyState;
          }
        }
        setStates(validStates);
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
    isLoading,
    error,
    refetch: fetchTopology,
  };
}