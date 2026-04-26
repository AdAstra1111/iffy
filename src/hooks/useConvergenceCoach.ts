/**
 * useConvergenceCoach — calls convergence-coach-engine Edge Function
 * and renders axis breakdown + prescriptions + trajectory.
 *
 * The coach engine diagnoses WHY CI/GP diverge and prescribes specific fixes.
 * NO writes — read-only diagnostic.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AxisDiagnosis {
  axis: string;
  score: number;          // 0–100
  status: 'converged' | 'diverged' | 'unknown';
  diagnosis: string;      // short label
  finding?: string;       // detailed finding text
}

export interface RevisionPrescription {
  severity?: 'critical' | 'high' | 'medium' | 'low';
  axis: 'narrative_structure' | 'feasibility';
  priority: number;
  prescription: string;
  whyItMatters: string;
  upstreamChange: string | null;
  scene_prescription?: string;
  estimated_gp_impact?: number;
  propagation_risk?: 'none' | 'low' | 'medium' | 'high';
  estimated_effort?: 'minor' | 'moderate' | 'significant';
}

export interface ConvergenceTrajectory {
  trend: 'improving' | 'stable' | 'degrading' | 'unknown';
  trendReason: string;
  blockers: Array<{
    axis: string;
    description: string;
    upstreamSource: string;
    cannotFixWithout: string;
  }>;
  fixable: Array<{
    axis: string;
    description: string;
    fixBy: string;
    estimatedEffort: string;
  }>;
}

export interface ConvergenceCoachOutput {
  projectId: string;
  generatedAt: string;
  narrativeStructureAxis: {
    status: 'converged' | 'diverged' | 'unknown';
    score: number;
    findings: Array<{
      checkId: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      upstreamDoc: string;
      downstreamDoc: string;
      description: string;
      divergenceType: string;
      affectedElements: string[];
    }>;
  };
  feasibilityAxis: {
    status: 'converged' | 'diverged' | 'unknown';
    score: number;
    findings: Array<{
      checkId: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      entityOrSystem: string;
      description: string;
      expected: string;
      actual: string;
    }>;
  };
  convergenceTrajectory: ConvergenceTrajectory;
  revisionPrescriptions: RevisionPrescription[];
}

export function useConvergenceCoach() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ConvergenceCoachOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCoach = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke<ConvergenceCoachOutput>(
        'convergence-coach-engine',
        { body: { projectId } }
      );

      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);

      setData(result);
    } catch (err: any) {
      setError(err.message || 'Coach engine failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return { runCoach, loading, data, error };
}