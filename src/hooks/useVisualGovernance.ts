import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { resolvePipelineStages, type PipelineInputs } from '@/lib/visual/pipelineStatusResolver';
import { 
  type GovernanceSnapshotRow,
  type GovernanceSnapshotResponse,
  type GovernanceAwareStage,
  mergeGovernanceSnapshot,
} from '@/lib/visual/visualGovernanceTypes';

interface UseVisualGovernanceOptions {
  projectId: string | undefined;
  inputs: PipelineInputs | null;
  enabled?: boolean;
}

interface UseVisualGovernanceResult {
  /** Merged stages — prefers persisted snapshot, falls back to live compute. */
  stages: GovernanceAwareStage[];
  /** Data source indicator. */
  dataSource: 'live_computed' | 'persisted_snapshot' | 'loading';
  /** When the snapshot was last evaluated. */
  lastEvaluatedAt: string | null;
  /** Trigger a fresh evaluation. */
  evaluate: () => Promise<void>;
  /** Whether a re-evaluation is in flight. */
  isEvaluating: boolean;
  /** Error state, if any. */
  error: string | null;
}

/**
 * useVisualGovernance — React hook for visual governance read model.
 * 
 * 1. Prefers persisted snapshots from the evaluate-visual-governance edge function
 * 2. Falls back to live-computed resolvePipelineStages if no snapshot exists
 * 3. Exposes evaluate() for on-demand re-evaluation
 * 
 * This is a READ-ONLY hook. It does NOT mutate visual stages or trigger generation.
 * Visual auto-run is NOT added here.
 */
export function useVisualGovernance({
  projectId,
  inputs,
  enabled = true,
}: UseVisualGovernanceOptions): UseVisualGovernanceResult {
  const [snapshot, setSnapshot] = useState<GovernanceSnapshotRow[] | null>(null);
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const evaluate = useCallback(async () => {
    if (!projectId || !enabled) return;
    
    setIsEvaluating(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'evaluate-visual-governance',
        { body: { projectId } },
      );

      if (fnError) {
        // If edge function isn't deployed yet, silently fall back to live compute
        if (fnError.message?.includes('not found') || fnError.message?.includes('Failed to fetch')) {
          setSnapshot(null);
          setLastEvaluatedAt(null);
          return;
        }
        throw fnError;
      }

      if (data?.snapshot && Array.isArray(data.snapshot) && data.snapshot.length > 0) {
        setSnapshot(data.snapshot);
        setLastEvaluatedAt(data.evaluated_at || new Date().toISOString());
      } else {
        // Edge function ran but no snapshot — data hasn't been computed yet
        setSnapshot(null);
      }
    } catch (err: any) {
      console.warn('useVisualGovernance: evaluation failed, falling back to live compute', err.message);
      setError(err.message);
      setSnapshot(null);
    } finally {
      if (mountedRef.current) {
        setIsEvaluating(false);
      }
    }
  }, [projectId, enabled]);

  // Evaluate on mount / projectId change
  useEffect(() => {
    mountedRef.current = true;
    if (projectId && enabled) {
      evaluate();
    }
    return () => { mountedRef.current = false; };
  }, [projectId, enabled, evaluate]);

  // Compute merged stages
  let mergedStages: GovernanceAwareStage[];
  let dataSource: 'live_computed' | 'persisted_snapshot' | 'loading';

  if (!inputs) {
    mergedStages = [];
    dataSource = 'loading';
  } else {
    const liveStages: GovernanceAwareStage[] = resolvePipelineStages(inputs).map(s => ({
      ...s,
      governance_source: 'live_computed' as const,
    }));

    if (isEvaluating && snapshot === null) {
      // First evaluation in flight — show live compute
      mergedStages = liveStages;
      dataSource = 'live_computed';
    } else if (snapshot && snapshot.length > 0) {
      mergedStages = mergeGovernanceSnapshot(liveStages, snapshot, lastEvaluatedAt ?? undefined);
      // Check if ALL stages have snapshot coverage
      const map = new Map(snapshot.map(r => [r.stage_id, r]));
      dataSource = liveStages.every(s => map.has(s.stage)) ? 'persisted_snapshot' : 'live_computed';
    } else {
      mergedStages = liveStages;
      dataSource = 'live_computed';
    }
  }

  return {
    stages: mergedStages,
    dataSource,
    lastEvaluatedAt,
    evaluate,
    isEvaluating,
    error,
  };
}
