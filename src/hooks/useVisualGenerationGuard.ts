/**
 * useVisualGenerationGuard — Central hook for frontend governance UX closure.
 *
 * Wraps checkVisualGovernance with caching, loading state, and human-readable
 * blocker messages. Every frontend call site that invokes generate-lookbook-image,
 * generate-poster, or generate-hero-frames MUST check this guard first.
 *
 * Backend gates remain the final authority — this is a UX layer.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { checkVisualGovernance, type GovernanceCheckResult } from '@/lib/visual/checkVisualGovernance';

export interface GenerationGuardResult {
  /** True when governance blocks generation for this stage */
  blocked: boolean;
  /** Raw blocker codes from evaluate-visual-governance */
  blockerCodes: string[];
  /** The stage's computed_status from governance, or null */
  computedStatus: string | null;
  /** True while governance evaluation is in flight */
  isChecking: boolean;
  /** Shortcut: !blocked && !isChecking */
  canGenerate: boolean;
  /** Human-readable message for UI display */
  message: string;
  /** Where the result came from */
  source: 'governance' | 'missing_snapshot' | 'not_ready' | 'error';
}

function buildMessage(
  blocked: boolean,
  blockerCodes: string[],
  computedStatus: string | null,
  hasData: boolean,
): string {
  if (blocked) {
    if (blockerCodes.length > 0) {
      return `Generation blocked: ${blockerCodes.join(', ')}`;
    }
    return `This stage is blocked by visual governance (${computedStatus ?? 'blocked'}). Resolve blockers before generating.`;
  }
  if (!hasData) {
    return 'Governance state not yet evaluated. Refresh governance to check prerequisites.';
  }
  return '';
}

/**
 * Check visual governance for a specific stage, with caching and loading state.
 *
 * @param projectId — project UUID (undefined = not ready)
 * @param stageId — stage identifier (hero_frames, lookbook, poster)
 */
export function useVisualGenerationGuard(
  projectId: string | undefined,
  stageId: string,
): GenerationGuardResult {
  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery<GovernanceCheckResult>({
    queryKey: ['visual-governance-guard', projectId, stageId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      return checkVisualGovernance(projectId, stageId);
    },
    enabled: !!projectId,
    staleTime: 30_000, // 30s cache — fast enough for UX, avoids flickering
    retry: 1,
  });

  return useMemo(() => {
    // Loading state
    if (isLoading || !projectId) {
      return {
        blocked: false,
        blockerCodes: [],
        computedStatus: null,
        isChecking: true,
        canGenerate: false,
        message: 'Checking governance…',
        source: 'not_ready',
      };
    }

    // Error / infrastructure failure
    if (isError || !data) {
      return {
        blocked: false,
        blockerCodes: [],
        computedStatus: null,
        isChecking: false,
        canGenerate: false,
        message: error
          ? `Unable to verify governance: ${error.message}. Refresh governance and try again.`
          : 'Unable to verify governance status. Refresh governance and try again.',
        source: 'error',
      };
    }

    // Blocked by governance
    if (data.blocked) {
      return {
        blocked: true,
        blockerCodes: data.blockers ?? [],
        computedStatus: data.computed_status,
        isChecking: false,
        canGenerate: false,
        message: buildMessage(true, data.blockers ?? [], data.computed_status, true),
        source: 'governance',
      };
    }

    // Missing snapshot — governance not yet evaluated
    if (data.computed_status === null) {
      return {
        blocked: false,
        blockerCodes: [],
        computedStatus: null,
        isChecking: false,
        canGenerate: false,
        message: 'Governance snapshot not yet evaluated. Refresh governance to check if generation is permitted.',
        source: 'missing_snapshot',
      };
    }

    // All clear — governance allows generation
    return {
      blocked: false,
      blockerCodes: [],
      computedStatus: data.computed_status,
      isChecking: false,
      canGenerate: true,
      message: '',
      source: 'governance',
    };
  }, [data, isLoading, isError, error, projectId]);
}

/**
 * Standalone governance check for non-React contexts (lib/, pipeline/).
 * Returns the same result shape without React Query.
 */
export async function checkGenerationGuard(
  projectId: string,
  stageId: string,
): Promise<GenerationGuardResult> {
  try {
    const result = await checkVisualGovernance(projectId, stageId);

    if (result.blocked) {
      return {
        blocked: true,
        blockerCodes: result.blockers ?? [],
        computedStatus: result.computed_status,
        isChecking: false,
        canGenerate: false,
        message: buildMessage(true, result.blockers ?? [], result.computed_status, true),
        source: 'governance',
      };
    }

    if (result.computed_status === null) {
      return {
        blocked: false,
        blockerCodes: [],
        computedStatus: null,
        isChecking: false,
        canGenerate: false,
        message: 'Governance snapshot not yet evaluated. Refresh governance to check if generation is permitted.',
        source: 'missing_snapshot',
      };
    }

    return {
      blocked: false,
      blockerCodes: [],
      computedStatus: result.computed_status,
      isChecking: false,
      canGenerate: true,
      message: '',
      source: 'governance',
    };
  } catch (err: any) {
    return {
      blocked: false,
      blockerCodes: [],
      computedStatus: null,
      isChecking: false,
      canGenerate: false,
      message: `Unable to verify governance: ${err?.message ?? 'unknown error'}. Refresh governance and try again.`,
      source: 'error',
    };
  }
}
