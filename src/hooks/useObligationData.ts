import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SceneObligationData {
  sceneId: string;
  sceneNumber: number;
  title: string;
  tensionField: {
    value: number;
    trend: 'rising' | 'falling' | 'steady';
    angle?: string;
    pairTensions?: { pair: string; value: number }[];
    threads?: string[];
    gradient?: number;
  };
  obligationCharge: {
    outstandingObligations: number;
    introducedObligations: number;
    fulfilledObligations: number;
    velocity: number;
    overdueCount: number;
    activeObligations: { type: string; description: string; tier: number }[];
  };
  deferredIntimacy: {
    value: number;
    trend: 'rising' | 'falling' | 'steady';
    pairStates?: { pair: string; deferred: number }[];
    deferredMoments: number;
    resolvedMoments: number;
    avoidantCharacters: string[];
  };
  narrativeDensity: {
    value: number;
    band: 'low' | 'moderate' | 'high' | 'critical';
    subScores: Record<string, number>;
    metrics?: { wordCount: number; beatCount: number; characterCount: number; plotThreads: number };
  };
  narrativePressure: number;
  dominantMode: 'tension_driven' | 'obligation_driven' | 'intimacy_driven' | 'balanced';
  signals: {
    overpressure: boolean;
    intimacyCritical: boolean;
    obligationOverload: boolean;
    densityAnomaly: boolean;
    narrativeBrief: string;
  };
  actNumber: number;
  actName: string;
}

export interface ObligationSummary {
  totalScenes: number;
  avgNarrativePressure: number;
  dominantModeAcrossScenes: string;
  actBreakdown: {
    actNumber: number;
    actName: string;
    avgPressure: number;
    sceneCount: number;
    modes: Record<string, number>;
  }[];
}

interface UseObligationDataResult {
  scenes: SceneObligationData[];
  summary: ObligationSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useObligationData(projectId?: string): UseObligationDataResult {
  const [scenes, setScenes] = useState<SceneObligationData[]>([]);
  const [summary, setSummary] = useState<ObligationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, any> = { mock: true };
      if (projectId) body.projectId = projectId;

      const { data, error: fetchError } = await supabase.functions.invoke(
        'demo-obligation-data',
        { body }
      );

      if (fetchError) throw fetchError;
      if (!data?.scenes) throw new Error('No scene data returned');

      setScenes(data.scenes);
      setSummary(data.summary || null);
    } catch (err: any) {
      console.error('[useObligationData] Failed to load:', err);
      setError(err.message || 'Failed to load obligation data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { scenes, summary, loading, error, refresh };
}