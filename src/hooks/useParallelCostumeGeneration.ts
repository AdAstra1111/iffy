/**
 * useParallelCostumeGeneration.ts — Hook that wraps the planner + worker pool
 * for governed parallel costume generation.
 *
 * Provides a drop-in replacement for the sequential buildAllCast/generateRequiredOnly
 * flows with bounded concurrency.
 *
 * v1.0.0
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { planCostumeRun, getPlanProgress, getCharacterProgress, type CostumeRunPlan, type PlannerCharacterInput, type PlannerInput } from '@/lib/visual/costumeJobPlanner';
import { CostumeWorkerPool, type WorkerPoolCallbacks } from '@/lib/visual/costumeWorkerPool';
import { resolveWorkerPoolConfig, type WorkerPoolConfig } from '@/lib/visual/costumeParallelConfig';
import { COSTUME_ON_ACTOR_DOMAIN, COSTUME_LOOK_SLOTS, COSTUME_REQUIRED_SLOT_KEYS } from '@/lib/visual/costumeOnActor';
import { createPersistedRun, updateRunStatus, cancelPendingPersistedCommands } from '@/lib/visual/costumeCommandService';
import { resolveActorAnchorPaths } from '@/lib/aiCast/resolveActorAnchors';
import type { VisualSet, VisualSetSlot } from '@/hooks/useVisualSets';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '@/lib/visual/characterWardrobeExtractor';
import type { WorldValidationRules } from '@/lib/visual/worldValidationMode';
import type { CostumeGenerationMode } from '@/lib/visual/costumeRunManifest';

// ── Types ──

export interface ParallelGenerationState {
  /** Is generation currently running? */
  isRunning: boolean;
  /** Current plan (null if not running) */
  plan: CostumeRunPlan | null;
  /** Progress summary */
  progress: ReturnType<typeof getPlanProgress> | null;
  /** Per-character progress */
  characterProgress: ReturnType<typeof getCharacterProgress>;
  /** Errors encountered */
  errors: string[];
}

export interface ParallelGenerationDeps {
  projectId: string;
  userId: string | null;
  /** Bound characters with profiles and state info */
  characters: Array<{
    characterKey: string;
    characterName: string;
    actorId: string;
    actorVersionId: string;
    profile: CharacterWardrobeProfile | null;
    isEligible: boolean;
  }>;
  /** Get wardrobe states for a character */
  getStatesForCharacter: (characterKey: string) => WardrobeStateDefinition[];
  /** Cast bindings */
  castBindings: Array<{ character_key: string; ai_actor_id: string; ai_actor_version_id: string }>;
  /** World rules */
  worldRules: WorldValidationRules;
  /** Current epoch */
  currentEpoch: number;
  /** Existing visual sets */
  existingSets: VisualSet[];
  /** Visual sets operations */
  ensureVisualSetForTarget: (params: any) => Promise<any>;
  fetchSlotsForSet: (setId: string) => Promise<VisualSetSlot[]>;
  wireImageToSlot: (params: any) => Promise<void>;
  /** Invalidation callbacks */
  invalidateSets: () => void;
  /** Config overrides */
  configOverrides?: Partial<WorkerPoolConfig>;
}

// ── Hook ──

export function useParallelCostumeGeneration() {
  const [state, setState] = useState<ParallelGenerationState>({
    isRunning: false,
    plan: null,
    progress: null,
    characterProgress: [],
    errors: [],
  });

  const poolRef = useRef<CostumeWorkerPool | null>(null);
  const abortRef = useRef(false);

  const startParallelGeneration = useCallback(async (deps: ParallelGenerationDeps, mode: CostumeGenerationMode = 'required_only') => {
    if (state.isRunning) {
      toast.warning('Generation already in progress');
      return null;
    }

    abortRef.current = false;

    // ── PHASE 1: PLANNING ──
    console.log(`[ParallelGen] Starting planning phase for ${deps.characters.length} characters`);
    const startTime = Date.now();

    // Build planner input from deps
    const eligible = deps.characters.filter(c => c.isEligible && c.profile);

    if (eligible.length === 0) {
      toast.info('No eligible characters for generation');
      return null;
    }

    const plannerCharacters: PlannerCharacterInput[] = eligible.map(char => {
      const states = deps.getStatesForCharacter(char.characterKey);
      const charSets = deps.existingSets.filter(s =>
        s.target_name?.startsWith(`${char.characterKey}|`)
      );

      const existingSets: Record<string, { id: string; status: string } | null> = {};
      for (const st of states) {
        const set = charSets.find(s => s.entity_state_key === st.state_key);
        existingSets[st.state_key] = set ? { id: set.id, status: set.status } : null;
      }

      return {
        characterKey: char.characterKey,
        characterName: char.characterName,
        actorId: char.actorId,
        actorVersionId: char.actorVersionId,
        profile: char.profile!,
        states,
        existingSets,
        existingSlots: {}, // Will be resolved by workers during execution
      };
    });

    const plannerInput: PlannerInput = {
      projectId: deps.projectId,
      characters: plannerCharacters,
      worldRules: deps.worldRules,
      castBindings: deps.castBindings,
      mode,
    };

    const plan = planCostumeRun(plannerInput);
    const planTime = Date.now() - startTime;
    console.log(`[ParallelGen] Planning complete: ${plan.total_jobs} jobs planned in ${planTime}ms (${plan.total_characters} characters, ${plan.total_states} states, ${plan.total_required_jobs} required, ${plan.total_optional_jobs} optional)`);

    if (plan.total_jobs === 0) {
      toast.info('No generation jobs needed — all slots are filled or skipped');
      return null;
    }

    // Persist run identity
    await createPersistedRun(plan.run_id, deps.projectId, deps.userId, plan.manifest as any);

    const initialProgress = getPlanProgress(plan);
    setState({
      isRunning: true,
      plan,
      progress: initialProgress,
      characterProgress: getCharacterProgress(plan),
      errors: [],
    });

    toast.info(`Planning complete: ${plan.total_jobs} generation jobs queued across ${plan.total_characters} characters`);

    // ── PHASE 2: PARALLEL EXECUTION ──
    console.log(`[ParallelGen] Starting execution phase with bounded concurrency`);

    const callbacks: WorkerPoolCallbacks = {
      onJobUpdate: (job) => {
        setState(prev => ({
          ...prev,
          progress: prev.plan ? getPlanProgress(prev.plan) : null,
          characterProgress: prev.plan ? getCharacterProgress(prev.plan) : [],
        }));
      },
      onProgress: (updatedPlan) => {
        setState(prev => ({
          ...prev,
          plan: updatedPlan,
          progress: getPlanProgress(updatedPlan),
          characterProgress: getCharacterProgress(updatedPlan),
        }));
      },
      ensureVisualSet: async (params) => {
        const set = await deps.ensureVisualSetForTarget({
          domain: COSTUME_ON_ACTOR_DOMAIN,
          targetType: 'character',
          targetId: params.actorId,
          targetName: `${params.characterKey}|${params.characterName}`,
          dnaVersionId: null,
          entityStateKey: params.stateKey,
          generationEpoch: params.epoch,
        });
        return set.id;
      },
      fetchSlotsForSet: async (setId) => {
        const slots = await deps.fetchSlotsForSet(setId);
        return slots.map(s => ({
          id: s.id,
          slot_key: s.slot_key,
          state: s.state,
          is_required: s.is_required,
          best_candidate_id: s.best_candidate_id,
          best_score: s.best_score,
          attempt_count: s.attempt_count,
        }));
      },
      wireImageToSlot: deps.wireImageToSlot,
      resolveActorAnchors: resolveActorAnchorPaths,
      isAborted: () => abortRef.current,
      getProfile: (characterKey) => {
        const char = deps.characters.find(c => c.characterKey === characterKey);
        return char?.profile || null;
      },
      getState: (characterKey, stateKey) => {
        const states = deps.getStatesForCharacter(characterKey);
        return states.find(s => s.state_key === stateKey) || null;
      },
      getWorldRules: () => deps.worldRules,
      getCurrentEpoch: () => deps.currentEpoch,
    };

    const pool = new CostumeWorkerPool(plan, callbacks, deps.configOverrides);
    poolRef.current = pool;

    try {
      const result = await pool.execute();
      const finalProgress = getPlanProgress(result);

      console.log(`[ParallelGen] Execution complete: ${finalProgress.succeeded} succeeded, ${finalProgress.failed} failed, ${finalProgress.admitted} admitted, ${finalProgress.skipped} skipped`);

      // Update run status
      await cancelPendingPersistedCommands(deps.projectId, plan.run_id);
      await updateRunStatus(deps.projectId, plan.run_id, 'completed');

      setState({
        isRunning: false,
        plan: result,
        progress: finalProgress,
        characterProgress: getCharacterProgress(result),
        errors: result.jobs.filter(j => j.error).map(j => `${j.character_name}/${j.state_label}/${j.slot_label}: ${j.error}`),
      });

      const totalTime = Date.now() - startTime;
      toast.success(
        `Generation complete: ${finalProgress.admitted} slots admitted, ${finalProgress.failed} failed — ${Math.round(totalTime / 1000)}s total`
      );

      deps.invalidateSets();
      return result;
    } catch (err: any) {
      console.error(`[ParallelGen] Execution error:`, err);
      await updateRunStatus(deps.projectId, plan.run_id, 'aborted');

      setState(prev => ({
        ...prev,
        isRunning: false,
        errors: [...prev.errors, err?.message || 'Unknown execution error'],
      }));

      toast.error('Generation failed');
      deps.invalidateSets();
      return null;
    } finally {
      poolRef.current = null;
    }
  }, [state.isRunning]);

  const abort = useCallback(async () => {
    abortRef.current = true;
    poolRef.current?.abort();
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  return {
    state,
    startParallelGeneration,
    abort,
    /** Whether parallel generation is supported */
    isSupported: true,
  };
}
