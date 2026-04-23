/**
 * Convergence Engine — Client-side orchestration for identity convergence runs.
 * 
 * Manages the lifecycle of convergence runs: start, step, poll, abort.
 * All mutations go through the ai-cast edge function.
 * All state is persisted in Supabase convergence_* tables.
 */
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { aiCastApi } from './aiCastApi';

// ── Types ──────────────────────────────────────────────────────────────────

export type ConvergenceMode = 'exploratory' | 'reference_locked';
export type ConvergenceStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';
export type RoundStage = 'pending' | 'generating' | 'validating' | 'scoring' | 'selecting' | 'refining' | 'complete' | 'failed';
export type CandidateStatus = 'queued' | 'generating' | 'generated' | 'validating' | 'scoring' | 'scored' | 'keeper' | 'rejected' | 'promoted' | 'failed';

export interface ConvergencePolicy {
  maxRounds: number;
  candidatesPerRound: number;
  keepTopN: number;
  requiredScoreBand?: string;
  requiredConfidence?: string;
  minImprovementDelta?: number;
  failFastOnHardFail?: boolean;
  diversityEmphasis?: 'low' | 'medium' | 'high';
  strictness?: 'lenient' | 'standard' | 'strict';
}

export interface ConvergenceRun {
  id: string;
  actor_id: string;
  actor_version_id: string;
  user_id: string;
  mode: ConvergenceMode;
  status: ConvergenceStatus;
  policy_json: ConvergencePolicy;
  current_round: number;
  max_rounds: number;
  best_candidate_id: string | null;
  shortlisted_candidate_ids: string[];
  stop_reason: string | null;
  final_recommendation: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefinementPlan {
  round: number;
  preserve: string[];
  suppress: string[];
  focus: string[];
}

export interface ConvergenceRound {
  id: string;
  run_id: string;
  round_number: number;
  stage: RoundStage;
  strategy: string;
  refinement_plan: RefinementPlan | Record<string, never>;
  generation_count: number;
  keeper_count: number;
  rejected_count: number;
  best_score: number | null;
  avg_score: number | null;
  improvement_delta: number | null;
  stop_eligible: boolean;
  evaluation_reference_policy: string | null;
  evaluation_mode: string | null;
  reference_ids: string[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AxisScores {
  cohesion_note?: string;
  self_reference?: boolean;
  pairwise_scores?: number[];
  median_raw?: number;
  per_reference_scores?: number[];
  reference_count?: number;
  [key: string]: unknown;
}

export interface EvaluationEvidence {
  ref_id: string;
  score: number;
  reason: string;
}

export interface GenerationConfig {
  pose_index?: number;
  strategy?: string;
  [key: string]: unknown;
}

export interface ConvergenceCandidate {
  id: string;
  round_id: string;
  run_id: string;
  asset_id: string | null;
  candidate_index: number;
  status: CandidateStatus;
  score: number | null;
  score_band: string | null;
  axis_scores: AxisScores;
  hard_fail_codes: string[];
  advisory_codes: string[];
  rank_position: number | null;
  selection_status: string;
  selection_rationale: string | null;
  refinement_fitness: Record<string, unknown>;
  generation_config: GenerationConfig;
  evaluation_mode: string | null;
  evaluated_against: string[];
  scoring_model: string | null;
  scoring_prompt_version: string | null;
  raw_evaluation_json: EvaluationEvidence[];
  confidence: string | null;
  created_at: string;
  updated_at: string;
  // joined
  asset?: { public_url: string; asset_type: string; meta_json: Record<string, unknown> } | null;
}

export interface ConvergenceEvent {
  id: string;
  run_id: string;
  round_id: string | null;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
}

// ── Default Policies ───────────────────────────────────────────────────────

export const DEFAULT_EXPLORATORY_POLICY: ConvergencePolicy = {
  maxRounds: 4,
  candidatesPerRound: 4,
  keepTopN: 2,
  requiredScoreBand: 'promising',
  minImprovementDelta: 3,
  failFastOnHardFail: false,
  diversityEmphasis: 'high',
  strictness: 'lenient',
};

export const DEFAULT_LOCKED_POLICY: ConvergencePolicy = {
  maxRounds: 5,
  candidatesPerRound: 3,
  keepTopN: 1,
  requiredScoreBand: 'stable',
  requiredConfidence: 'medium',
  minImprovementDelta: 2,
  failFastOnHardFail: true,
  diversityEmphasis: 'low',
  strictness: 'strict',
};

// ── Round Strategy Resolution ──────────────────────────────────────────────

export function resolveRoundStrategy(mode: ConvergenceMode, roundNumber: number, prevBestScore: number | null): string {
  if (roundNumber === 1) {
    return mode === 'exploratory' ? 'exploratory_wide' : 'locked_tight';
  }
  if (prevBestScore !== null && prevBestScore >= 85) {
    return 'final_confirmation';
  }
  if (roundNumber >= 4) {
    return 'recovery_repair';
  }
  return mode === 'exploratory' ? 'exploratory_wide' : 'locked_tight';
}

// ── Refinement Plan Builder ────────────────────────────────────────────────

export function buildRefinementPlan(
  keepers: ConvergenceCandidate[],
  rejected: ConvergenceCandidate[],
  roundNumber: number,
): RefinementPlan {
  const plan: RefinementPlan = {
    round: roundNumber + 1,
    preserve: [] as string[],
    suppress: [] as string[],
    focus: [] as string[],
  };

  // Analyze keepers for common traits to preserve
  for (const k of keepers) {
    if (k.axis_scores) {
      const axes = k.axis_scores as Record<string, number>;
      for (const [axis, score] of Object.entries(axes)) {
        if (typeof score === 'number' && score >= 80) {
          plan.preserve.push(`Strong ${axis}`);
        }
      }
    }
  }

  // Analyze rejections for traits to suppress
  for (const r of rejected) {
    if (r.hard_fail_codes?.length) {
      for (const code of r.hard_fail_codes) {
        plan.suppress.push(`Fix: ${code}`);
      }
    }
    if (r.advisory_codes?.length) {
      for (const code of r.advisory_codes) {
        plan.focus.push(`Improve: ${code}`);
      }
    }
  }

  // Deduplicate
  plan.preserve = [...new Set(plan.preserve)];
  plan.suppress = [...new Set(plan.suppress)];
  plan.focus = [...new Set(plan.focus)];

  return plan;
}

// ── Convergence Stop Check ─────────────────────────────────────────────────

export interface StopDecision {
  shouldStop: boolean;
  reason: string;
}

export function checkConvergenceStop(
  policy: ConvergencePolicy,
  roundNumber: number,
  bestScore: number | null,
  improvementDelta: number | null,
  hardFailCount: number,
): StopDecision {
  // Max rounds
  if (roundNumber >= policy.maxRounds) {
    return { shouldStop: true, reason: `Max rounds reached (${policy.maxRounds})` };
  }

  // Score threshold met
  if (bestScore !== null) {
    const requiredBand = policy.requiredScoreBand || 'promising';
    const thresholds: Record<string, number> = { weak: 0, promising: 60, stable: 75, elite: 90 };
    const required = thresholds[requiredBand] || 60;
    if (bestScore >= required) {
      return { shouldStop: true, reason: `Score threshold met: ${bestScore} >= ${required} (${requiredBand})` };
    }
  }

  // Plateau detection
  if (roundNumber >= 2 && improvementDelta !== null && policy.minImprovementDelta !== undefined) {
    if (improvementDelta < policy.minImprovementDelta) {
      return { shouldStop: true, reason: `Plateau: improvement ${improvementDelta.toFixed(1)} < min delta ${policy.minImprovementDelta}` };
    }
  }

  // Fail fast
  if (policy.failFastOnHardFail && hardFailCount > 0 && roundNumber >= 2) {
    return { shouldStop: true, reason: `Hard failures persist after ${roundNumber} rounds` };
  }

  return { shouldStop: false, reason: 'continue' };
}

// ── Score Band Helper ──────────────────────────────────────────────────────

export function scoreBandFromValue(score: number): string {
  if (score >= 90) return 'elite';
  if (score >= 75) return 'stable';
  if (score >= 60) return 'promising';
  return 'weak';
}

// ── Candidate Ranking ──────────────────────────────────────────────────────

export function rankCandidates(candidates: ConvergenceCandidate[]): ConvergenceCandidate[] {
  return [...candidates]
    .filter(c => c.status !== 'failed' && c.score !== null)
    .sort((a, b) => {
      // Hard fails go last
      const aFails = a.hard_fail_codes?.length || 0;
      const bFails = b.hard_fail_codes?.length || 0;
      if (aFails !== bFails) return aFails - bFails;
      // Higher score first
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      // Deterministic tie-breaker: lower candidate_index first
      return (a.candidate_index || 0) - (b.candidate_index || 0);
    })
    .map((c, i) => ({ ...c, rank_position: i + 1 }));
}

// ── Select Keepers ─────────────────────────────────────────────────────────

export function selectKeepers(
  rankedCandidates: ConvergenceCandidate[],
  keepTopN: number,
): { keepers: ConvergenceCandidate[]; rejected: ConvergenceCandidate[] } {
  const keepers = rankedCandidates.slice(0, keepTopN).map(c => ({
    ...c,
    selection_status: 'keeper' as const,
    selection_rationale: `Ranked #${c.rank_position} — score ${c.score?.toFixed(1) || 'N/A'}`,
  }));
  const rejected = rankedCandidates.slice(keepTopN).map(c => ({
    ...c,
    selection_status: 'rejected' as const,
    selection_rationale: `Below keep threshold (rank #${c.rank_position})`,
  }));
  return { keepers, rejected };
}

// ── API Wrappers ───────────────────────────────────────────────────────────

async function callConvergence(action: string, payload: Record<string, any>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const resp = await fetch(`/api/supabase-proxy/functions/v1/ai-cast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    let msg = 'Convergence error';
    try { msg = JSON.parse(text).error || msg; } catch {}
    throw new Error(msg);
  }
  return resp.json();
}

export const convergenceApi = {
  startRun: (actorId: string, versionId: string, mode: ConvergenceMode, policy?: Partial<ConvergencePolicy>) =>
    callConvergence('start_convergence', { actorId, versionId, mode, policy }),

  stepRun: (runId: string) =>
    callConvergence('step_convergence', { runId }),

  abortRun: (runId: string) =>
    callConvergence('abort_convergence', { runId }),

  getRunStatus: (runId: string) =>
    callConvergence('get_convergence_status', { runId }),

  promoteCandidate: (candidateId: string, runId?: string) =>
    callConvergence('promote_convergence_candidate', { candidateId, runId }),
};

// ── Promotion Eligibility (client-side preview only — server enforces canonically) ──

export interface PromotionEligibilityResult {
  eligible: boolean;
  reason: string;
}

export function checkCandidatePromotionEligibility(
  candidate: ConvergenceCandidate,
  run: ConvergenceRun | null,
): PromotionEligibilityResult {
  if (!candidate) return { eligible: false, reason: 'No candidate' };
  if (candidate.selection_status === 'promoted') return { eligible: false, reason: 'Already promoted' };
  if (candidate.status === 'failed') return { eligible: false, reason: 'Candidate failed' };
  if ((candidate.hard_fail_codes?.length || 0) > 0) return { eligible: false, reason: 'Has hard failures' };
  if (!candidate.asset_id) return { eligible: false, reason: 'No generated asset' };
  if (candidate.score === null) return { eligible: false, reason: 'Not yet scored' };

  // Prefer keepers / best candidate
  const isKeeper = candidate.selection_status === 'keeper';
  const isBest = run?.best_candidate_id === candidate.id;

  if (!isKeeper && !isBest && candidate.selection_status === 'rejected') {
    return { eligible: false, reason: 'Candidate was rejected' };
  }

  return { eligible: true, reason: isKeeper ? 'Keeper candidate' : isBest ? 'Best candidate' : 'Eligible candidate' };
}

// ── React Hooks ────────────────────────────────────────────────────────────

export function useConvergenceRuns(actorId: string | undefined) {
  return useQuery({
    queryKey: ['convergence-runs', actorId],
    queryFn: async () => {
      if (!actorId) return [];
      const { data, error } = await supabase
        .from('convergence_runs')
        .select('*')
        .eq('actor_id', actorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ConvergenceRun[];
    },
    enabled: !!actorId,
  });
}

export function useConvergenceRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['convergence-run', runId],
    queryFn: async () => {
      if (!runId) return null;
      const { data, error } = await supabase
        .from('convergence_runs')
        .select('*')
        .eq('id', runId)
        .single();
      if (error) throw error;
      return data as unknown as ConvergenceRun;
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const run = query.state.data as ConvergenceRun | null;
      if (run && (run.status === 'running' || run.status === 'pending')) return 3000;
      return false;
    },
  });
}

export function useConvergenceRounds(runId: string | undefined) {
  return useQuery({
    queryKey: ['convergence-rounds', runId],
    queryFn: async () => {
      if (!runId) return [];
      const { data, error } = await supabase
        .from('convergence_rounds')
        .select('*')
        .eq('run_id', runId)
        .order('round_number', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ConvergenceRound[];
    },
    enabled: !!runId,
  });
}

export function useConvergenceCandidates(runId: string | undefined) {
  return useQuery({
    queryKey: ['convergence-candidates', runId],
    queryFn: async () => {
      if (!runId) return [];
      const { data, error } = await supabase
        .from('convergence_candidates')
        .select('*, ai_actor_assets(public_url, asset_type, meta_json)')
        .eq('run_id', runId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        asset: c.ai_actor_assets || null,
      })) as unknown as ConvergenceCandidate[];
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const candidates = query.state.data as ConvergenceCandidate[] | undefined;
      if (candidates?.some(c => ['queued', 'generating', 'validating', 'scoring'].includes(c.status))) return 3000;
      return false;
    },
  });
}

export function useStartConvergence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { actorId: string; versionId: string; mode: ConvergenceMode; policy?: Partial<ConvergencePolicy> }) => {
      return convergenceApi.startRun(params.actorId, params.versionId, params.mode, params.policy);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['convergence-runs', vars.actorId] });
      toast.success('Convergence run started');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to start convergence');
    },
  });
}

export function useStepConvergence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      return convergenceApi.stepRun(runId);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['convergence-run'] });
      qc.invalidateQueries({ queryKey: ['convergence-rounds'] });
      qc.invalidateQueries({ queryKey: ['convergence-candidates'] });
    },
  });
}

export function useAbortConvergence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { runId: string; actorId: string }) => {
      return convergenceApi.abortRun(params.runId);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['convergence-runs', vars.actorId] });
      toast.info('Convergence run aborted');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to abort convergence');
    },
  });
}

export function usePromoteCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { candidateId: string; runId?: string }) => {
      return convergenceApi.promoteCandidate(params.candidateId, params.runId);
    },
    onSuccess: (data: any) => {
      toast.success(`Actor "${data.actor?.name}" created from convergence result`);
      qc.invalidateQueries({ queryKey: ['convergence-runs'] });
      qc.invalidateQueries({ queryKey: ['convergence-candidates'] });
      qc.invalidateQueries({ queryKey: ['ai-actors'] });
      qc.invalidateQueries({ queryKey: ['ai-actor'] });
    },
    onError: (err: any) => {
      if (err.message?.includes('already promoted')) {
        toast.info('This candidate has already been promoted');
      } else {
        toast.error(err.message || 'Failed to promote candidate');
      }
    },
  });
}
