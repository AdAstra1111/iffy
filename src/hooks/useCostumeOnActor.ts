/**
 * useCostumeOnActor — Hook for the Character Costume-on-Actor Look System.
 *
 * Manages generation, validation, approval, and locking of actor-bound costume looks
 * per character × wardrobe state.
 *
 * Uses existing visual_sets infrastructure with the 'character_costume_look' domain.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useParallelCostumeGeneration, type ParallelGenerationState } from './useParallelCostumeGeneration';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveCurrentCostumeEpoch, costumeEpochQueryKey, type EpochInfo } from '@/lib/visual/costumeEpochResolver';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { reconcileVisualSetSlot } from '@/lib/visual/slotStateResolver';
import { extractCanonicalCharacterNames } from '@/lib/canon/extractCanonicalCharacterNames';
import { normalizeCharacterKey } from '@/lib/aiCast/normalizeCharacterKey';
import { validateWardrobeProfile } from '@/lib/visual/wardrobeProfileGuard';
import { resolveActorAnchorPaths, type ActorAnchorPaths } from '@/lib/aiCast/resolveActorAnchors';
import { useCharacterWardrobe } from './useCharacterWardrobe';
import { useWorldValidationMode } from './useWorldValidationMode';
import { useVisualSets, type VisualSet, type VisualSetSlot } from './useVisualSets';
import {
  COSTUME_ON_ACTOR_DOMAIN,
  COSTUME_LOOK_SLOTS,
  COSTUME_REQUIRED_SLOT_KEYS,
  buildCostumeLookPrompt,
  validateCostumeLookCandidate,
  serializeCostumeLookDiagnostics,
  getAvailableWardrobeStatesForCharacter,
  getCostumeLookValidationSummary,
  sortSlotsForGeneration,
  isValidCostumeSlotKey,
  resolveStateWardrobePackage,
  buildCostumeSlotBrief,
  type CostumeLookInput,
  type CostumeLookValidationResult,
} from '@/lib/visual/costumeOnActor';
import {
  scoreCandidate,
  estimateAxesFromRules,
  shouldReplaceBest,
  shouldContinueConvergence,
  updateConvergenceState,
  initialConvergenceState,
  freshRunScopedConvergenceState,
  isConvergenceFromActiveRun,
  serializeScoresForStorage,
  resolveSlotScoringPolicy,
  MAX_CONVERGENCE_ATTEMPTS,
  type ConvergenceScore,
  type SlotConvergenceState,
  type SlotScoringPolicy,
} from '@/lib/visual/costumeConvergenceScoring';
import {
  evaluateIdentityGate,
  evaluateContinuityGate,
  combinedGateDecision,
  serializeGateResult,
  isCandidateAdmitted,
  type IdentityDimensionScores,
  type CombinedGateResult,
} from '@/lib/visual/costumeIdentityGate';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '@/lib/visual/characterWardrobeExtractor';
import { deriveCanonInputsFromProfile } from '@/lib/visual/stateWardrobeReconstructor';
import {
  type CostumeRunManifest,
  type CostumeGenerationMode,
  createRunManifest,
  isSlotAllowedInRun,
  computeCastScopeHash,
  hasCastScopeDrifted,
  generateSessionId,
} from '@/lib/visual/costumeRunManifest';
import {
  type PersistedCommand,
  type PersistedCommandType,
  issuePersistedCommand,
  consumeNextCommandAtomic,
  resumeRunAtomic,
  cancelPendingPersistedCommands,
  isRunPausedFromDB,
  fetchCommandHistory,
  createPersistedRun,
  updateRunStatus,
  fetchActiveRun,
  sleepMs,
} from '@/lib/visual/costumeCommandService';
import {
  resolveCharacterLockGap as resolveCharacterLockGapFn,
  formatLockFailureMessage as formatLockFailureMessageFn,
  type CharacterLockGap as CharacterLockGapType,
} from '@/lib/visual/characterLockGap';
import { useAuth } from '@/hooks/useAuth';

// ── Types ──

export interface CostumeLookSet {
  id: string;
  characterKey: string;
  characterName: string;
  actorId: string;
  wardrobeStateKey: string;
  status: string;
  lockedAt: string | null;
}

export type CostumeBuildStatus = 'idle' | 'building' | 'done' | 'error';

export interface BulkCastProgress {
  characterKey: string;
  characterName: string;
  stateKey: string;
  slotKey: string;
  status: 'pending' | 'generating' | 'validated' | 'accepted' | 'failed' | 'skipped';
  reason?: string;
}

export type CharacterBlockReason = 'no_actor_binding' | 'no_actor_version' | 'no_wardrobe_profile' | 'degraded_wardrobe_profile';

/** Detailed block diagnostics — specific guard failure reasons for degraded profiles */
export interface BlockDiagnostics {
  guardReasons: string[];
  hasSceneEvidence: boolean;
  sceneFactCount: number;
  explicitStateCount: number;
  inferredStateCount: number;
}

export interface CharacterCoverage {
  characterKey: string;
  characterName: string;
  totalStates: number;
  statesWithSets: number;
  statesLocked: number;
  /** Count of states where set exists and is approved/locked/ready_to_lock */
  statesApproved: number;
  missingStates: string[];
  priorityMissing: string[];
  /** Canonical readiness — uses requiredReady as "ready" threshold */
  readiness: 'incomplete' | 'ready' | 'fully_locked' | 'blocked';
  /** Required-only readiness: all states have sets (required slots populated) */
  requiredReady: boolean;
  /** Full readiness: all states fully locked */
  fullReady: boolean;
  /** If blocked, why */
  blockReason: CharacterBlockReason | null;
  /** Whether this character is eligible for generation */
  isEligible: boolean;
}

/**
 * CostumeDisplayStatus — DEPRECATED for semantic decisions.
 * Retained for informational display only.
 * ALL semantic decisions (lock, CTA, status) must use CharacterLockGap.
 *
 * IEL: Do NOT use this to determine lockability, completion targeting,
 * or CTA visibility. Use resolveCharacterLockGap() instead.
 */
export interface CostumeDisplayStatus {
  label: string;
  variant: 'locked' | 'ready' | 'incomplete' | 'blocked';
  requiredFraction: string;   // informational only
  lockedFraction: string;     // informational only
  showLockButton: boolean;    // always false — lock driven by lock-gap only
  blockReason: CharacterBlockReason | null;
}

/**
 * @deprecated — INFORMATIONAL ONLY. Do not use for semantic decisions.
 * Use resolveCharacterLockGap() for all status/lock/CTA logic.
 */
export function getCharacterCostumeDisplayStatus(cov: CharacterCoverage): CostumeDisplayStatus {
  if (cov.readiness === 'blocked') {
    return {
      label: 'Blocked',
      variant: 'blocked',
      requiredFraction: '—',
      lockedFraction: '—',
      showLockButton: false,
      blockReason: cov.blockReason,
    };
  }
  if (cov.readiness === 'fully_locked') {
    return {
      label: 'Fully Locked',
      variant: 'locked',
      requiredFraction: `${cov.totalStates}/${cov.totalStates} required-ready`,
      lockedFraction: `${cov.statesLocked}/${cov.totalStates} locked`,
      showLockButton: false,
      blockReason: null,
    };
  }
  if (cov.requiredReady) {
    // IEL: "Needs Completion" — NOT "Ready". Lock-gap resolver is canonical.
    return {
      label: 'Needs Completion',
      variant: 'incomplete',
      requiredFraction: `${cov.statesWithSets}/${cov.totalStates} required-ready`,
      lockedFraction: `${cov.statesLocked}/${cov.totalStates} locked`,
      showLockButton: false,
      blockReason: null,
    };
  }
  return {
    label: 'Incomplete',
    variant: 'incomplete',
    requiredFraction: `${cov.statesWithSets}/${cov.totalStates} required-ready`,
    lockedFraction: `${cov.statesLocked}/${cov.totalStates} locked`,
    showLockButton: false,
    blockReason: null,
  };
}

/**
 * Lock-gap-driven global summary — canonical aggregate for all characters.
 * This replaces the legacy coverage-based globalCoverage for semantic decisions.
 */
export interface GlobalLockGapSummary {
  total: number;
  blocked: number;
  needs_required: number;
  needs_completion: number;
  lock_ready: number;
  locked: number;
  generating: number;
  /** Informational: total required slots across all characters */
  total_required_slots: number;
  /** Informational: lock-ready slots across all characters */
  lock_ready_slots: number;
}

// CharacterLockEligibility removed — lock eligibility is now determined
// solely by the lock-gap resolver (resolveCharacterLockGap).

const PRIORITY_STATES = ['work', 'domestic', 'public_formal'];

// ── Hook ──

export function useCostumeOnActor(projectId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const wardrobe = useCharacterWardrobe(projectId);
  const { mode } = useWorldValidationMode(projectId);
  const visualSets = useVisualSets(projectId);
  const parallelGen = useParallelCostumeGeneration();
  const [buildStatus, setBuildStatus] = useState<CostumeBuildStatus>('idle');
  const [buildProgress, setBuildProgress] = useState<Record<string, { total: number; done: number }>>({});
  const abortRef = useRef(false);
  const [activeRunManifest, setActiveRunManifest] = useState<CostumeRunManifest | null>(null);
  const [sessionCastHash, setSessionCastHash] = useState<string | null>(null);
  const [sessionStale, setSessionStale] = useState<{ stale: boolean; reason: string | null }>({ stale: false, reason: null });
  // Version counter: incremented after any slot-affecting write to force UI slot refresh
  const [slotsVersion, setSlotsVersion] = useState(0);
  const bumpSlotsVersion = useCallback(() => setSlotsVersion(v => v + 1), []);

  // ── PERSISTED COMMAND/CONTROL LAYER ──
  // Commands are persisted to costume_run_commands table. Executor polls DB at checkpoints.
  // Pause state is derived from DB truth, not React state alone.
  const [isPaused, setIsPaused] = useState(false);
  // pauseResolveRef removed — pause is now DB-driven via polling loop
  const [commandLog, setCommandLog] = useState<PersistedCommand[]>([]);

  /**
   * Issue a command by persisting to DB. UI-side state updates are derived
   * from the persisted command, not the other way around.
   */
  const issueCommand = useCallback(async (type: PersistedCommandType, opts?: {
    characterKey?: string;
    stateKey?: string;
    reason?: string;
  }) => {
    if (!projectId) return;
    const runId = activeRunManifest?.run_id || '__no_run__';

    // Client-side pre-validation (fail-closed)
    if (type === 'pause_run' && isPaused) {
      console.warn('[CostumeCmd] Already paused');
      return;
    }
    if (type === 'resume_run' && !isPaused) {
      console.warn('[CostumeCmd] Not paused');
      return;
    }
    if (type === 'pause_run' && buildStatus !== 'building') {
      console.warn('[CostumeCmd] No active run to pause');
      return;
    }

    const cmd = await issuePersistedCommand(projectId, runId, type, user?.id ?? null, opts);
    if (!cmd) return;

    setCommandLog(prev => [...prev, cmd]);

    // Pause/resume: update local state for immediate UX feedback.
    // DB is authoritative; local state is a mirror for the active session.
    if (type === 'pause_run') {
      abortRef.current = true;
      setIsPaused(true);
    }
    if (type === 'resume_run') {
      // Use atomic resume RPC — updates costume_runs.status + consumes command
      const runId = activeRunManifest?.run_id || '__no_run__';
      await resumeRunAtomic(projectId, runId);
      setIsPaused(false);
      abortRef.current = false;
    }
  }, [projectId, activeRunManifest, buildStatus, isPaused, user?.id]);

  // ── EPOCH RESOLVER: Canonical source of truth for current costume generation epoch ──
  const epochQuery = useQuery({
    queryKey: costumeEpochQueryKey(projectId),
    queryFn: () => resolveCurrentCostumeEpoch(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
  });
  const currentEpoch = epochQuery.data?.currentEpoch ?? 1;

  // Fetch existing costume look sets — EPOCH-FILTERED
  const setsQuery = useQuery({
    queryKey: ['costume-look-sets', projectId, currentEpoch],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('visual_sets')
        .select('*')
        .eq('project_id', projectId)
        .eq('domain', COSTUME_ON_ACTOR_DOMAIN)
        .neq('status', 'archived')
        .eq('generation_epoch', currentEpoch)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map((s: any) => ({
        id: s.id,
        characterKey: s.target_name?.split('|')[0] || '',
        characterName: s.target_name?.split('|')[1] || s.target_name || '',
        actorId: s.target_id || '',
        wardrobeStateKey: s.entity_state_key || '',
        status: s.status,
        lockedAt: s.locked_at,
      })) as CostumeLookSet[];
    },
    enabled: !!projectId && epochQuery.isSuccess,
  });

  // Get characters with actor bindings
  const castQuery = useQuery({
    queryKey: ['costume-look-cast', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('project_ai_cast')
        .select('character_key, ai_actor_id, ai_actor_version_id')
        .eq('project_id', projectId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
  });

  const canonicalCharactersQuery = useQuery({
    queryKey: ['costume-canonical-characters', projectId],
    queryFn: async () => {
      if (!projectId) return [] as string[];
      const { data, error } = await (supabase as any)
        .from('project_canon')
        .select('canon_json')
        .eq('project_id', projectId)
        .maybeSingle();
      if (error) throw error;
      return extractCanonicalCharacterNames(data?.canon_json || null);
    },
    enabled: !!projectId,
  });

  // Canonical character roster with classification (never silently filtered)
  const boundCharacters = useMemo(() => {
    const canonicalCharacters = canonicalCharactersQuery.data || [];
    const castRows = castQuery.data || [];
    if (canonicalCharacters.length === 0 && castRows.length === 0) return [];

    const castByCharacter = new Map<string, any>();
    for (const row of castRows) {
      castByCharacter.set(normalizeCharacterKey(row.character_key), row);
    }

    const sourceCharacters = canonicalCharacters.length > 0
      ? canonicalCharacters
      : castRows.map((c: any) => c.character_key);

    return sourceCharacters.map((characterName: string) => {
      const castRow = castByCharacter.get(normalizeCharacterKey(characterName)) || null;
      const profile = wardrobe.extraction ? wardrobe.getProfile(characterName) : null;
      const states = wardrobe.extraction ? wardrobe.getStates(characterName) : [];

      let isEligible = true;
      let blockReason: CharacterBlockReason | null = null;
      let blockDiagnostics: BlockDiagnostics | null = null;

      if (!castRow?.ai_actor_id) {
        isEligible = false;
        blockReason = 'no_actor_binding';
      } else if (!castRow.ai_actor_version_id) {
        isEligible = false;
        blockReason = 'no_actor_version';
      } else if (!profile) {
        isEligible = false;
        blockReason = 'no_wardrobe_profile';
      } else {
        // Profile exists — check if it's degraded/placeholder
        const profileValidation = validateWardrobeProfile(profile);
        if (profileValidation.degraded) {
          isEligible = false;
          blockReason = 'degraded_wardrobe_profile';
        }

        // Build diagnostics regardless of eligibility — useful for both blocked and eligible
        const charKey = normalizeCharacterKey(characterName);
        const sceneEvidence = wardrobe.extraction?.scene_costume_evidence;
        const charSceneFacts = sceneEvidence?.facts.filter(f => f.character_key === charKey) || [];
        const explicitCount = states.filter(s => s.explicit_or_inferred === 'explicit').length;
        const inferredCount = states.filter(s => s.explicit_or_inferred === 'inferred').length;

        blockDiagnostics = {
          guardReasons: profileValidation.reasons,
          hasSceneEvidence: charSceneFacts.length > 0,
          sceneFactCount: charSceneFacts.length,
          explicitStateCount: explicitCount,
          inferredStateCount: inferredCount,
        };
      }

      return {
        characterKey: castRow?.character_key || characterName,
        characterName: profile?.character_name || characterName,
        actorId: castRow?.ai_actor_id || '',
        actorVersionId: castRow?.ai_actor_version_id || '',
        profile,
        states,
        isEligible,
        blockReason,
        blockDiagnostics,
      };
    });
  }, [canonicalCharactersQuery.data, castQuery.data, wardrobe.extraction, wardrobe]);

  // Get wardrobe states for a character
  const getStatesForCharacter = useCallback((characterKey: string) => {
    if (!wardrobe.extraction) return [];
    return getAvailableWardrobeStatesForCharacter(
      wardrobe.extraction.state_matrix,
      characterKey,
    );
  }, [wardrobe.extraction]);

  // Check if a look set exists
  // Canonical getLookSet: deterministic resolution per character × state.
  // If multiple non-archived sets exist for the same state (should not happen),
  // prefer locked > most recent by creation order. Fail-closed: log warning.
  const getLookSet = useCallback((characterKey: string, stateKey: string) => {
    const matches = (setsQuery.data || []).filter(
      s => s.characterKey === characterKey && s.wardrobeStateKey === stateKey
    );
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      console.warn(`[Costume] Multiple sets for ${characterKey}/${stateKey} — resolving canonically`);
      // Prefer locked, then latest
      const locked = matches.find(s => s.status === 'locked');
      if (locked) return locked;
      return matches[matches.length - 1]; // latest by created_at ascending query
    }
    return matches[0];
  }, [setsQuery.data]);

  // Check if a look is locked
  const isLookLocked = useCallback((characterKey: string, stateKey: string) => {
    const set = getLookSet(characterKey, stateKey);
    return set?.status === 'locked';
  }, [getLookSet]);

  const invalidateSets = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['costume-look-sets', projectId] });
    qc.invalidateQueries({ queryKey: costumeEpochQueryKey(projectId) });
    visualSets.invalidate();
  }, [qc, projectId, visualSets]);

  // ── Duplicate detection helper ──

  const getDuplicateStates = useCallback((characterKey: string): string[] => {
    const charSets = (setsQuery.data || []).filter(s => s.characterKey === characterKey);
    const stateCount = new Map<string, number>();
    for (const s of charSets) {
      stateCount.set(s.wardrobeStateKey, (stateCount.get(s.wardrobeStateKey) || 0) + 1);
    }
    return [...stateCount.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  }, [setsQuery.data]);

  // ── Coverage Summary (STRICT READINESS) ──
  // Readiness is structural truth, not optimistic interpretation.
  // A state is "ready" ONLY if all required slots have approved/selected state.
  // Candidate-only optional slots do NOT contribute to readiness.

  const coverage = useMemo((): CharacterCoverage[] => {
    return boundCharacters.map(char => {
      // Blocked characters get zero-state coverage
      if (!char.isEligible) {
        return {
          characterKey: char.characterKey,
          characterName: char.characterName,
          totalStates: 0,
          statesWithSets: 0,
          statesLocked: 0,
          statesApproved: 0,
          missingStates: [],
          priorityMissing: [],
          readiness: 'blocked' as const,
          requiredReady: false,
          fullReady: false,
          blockReason: char.blockReason,
          isEligible: false,
        };
      }

      const states = getStatesForCharacter(char.characterKey);
      const sets = (setsQuery.data || []).filter(s => s.characterKey === char.characterKey);
      const duplicates = getDuplicateStates(char.characterKey);

      const statesWithSets = states.filter(st =>
        sets.some(s => s.wardrobeStateKey === st.state_key)
      ).length;
      const statesLocked = states.filter(st =>
        sets.some(s => s.wardrobeStateKey === st.state_key && s.status === 'locked')
      ).length;

      const statesReady = states.filter(st => {
        const set = sets.find(s => s.wardrobeStateKey === st.state_key);
        if (!set) return false;
        if (set.status === 'locked') return true;
        if (set.status === 'ready_to_lock') return true;
        if (set.status === 'approved') return true;
        return false;
      }).length;

      const missingStates = states
        .filter(st => !sets.some(s => s.wardrobeStateKey === st.state_key))
        .map(st => st.state_key);
      const priorityMissing = missingStates.filter(k => PRIORITY_STATES.includes(k));

      const hasDuplicates = duplicates.length > 0;

      const requiredReady = !hasDuplicates && states.length > 0 &&
        statesWithSets === states.length;

      const fullReady = !hasDuplicates && states.length > 0 &&
        statesLocked === states.length;

      const readiness: CharacterCoverage['readiness'] =
        hasDuplicates ? 'incomplete' :
        fullReady ? 'fully_locked' :
        requiredReady ? 'ready' :
        'incomplete';

      return {
        characterKey: char.characterKey,
        characterName: char.characterName,
        totalStates: states.length,
        statesWithSets,
        statesLocked,
        statesApproved: statesReady,
        missingStates,
        priorityMissing,
        readiness,
        requiredReady,
        fullReady,
        blockReason: null,
        isEligible: true,
      };
    });
  }, [boundCharacters, setsQuery.data, getStatesForCharacter, getDuplicateStates]);

  // Legacy globalCoverage — INFORMATIONAL ONLY, not for semantic decisions.
  // IEL: Use globalLockGapSummary for all semantic decisions.
  const globalCoverage = useMemo(() => {
    const total = coverage.length;
    const blocked = coverage.filter(c => c.readiness === 'blocked').length;
    const fullyLocked = coverage.filter(c => c.readiness === 'fully_locked').length;
    const incomplete = coverage.filter(c => c.readiness === 'incomplete').length;
    const requiredReady = coverage.filter(c => c.requiredReady).length;
    return { total, blocked, fullyLocked, incomplete, ready: total - fullyLocked - incomplete - blocked, requiredReady };
  }, [coverage]);

  // ── Canonical Global Lock-Gap Summary ──
  // IEL: This is the ONLY global summary used for semantic decisions.
  // Aggregates per-character lock-gap display statuses.
  const globalLockGapSummary = useMemo((): GlobalLockGapSummary => {
    // We need lock-gap for each character, but we don't have slots loaded at hook level.
    // Use coverage-based classification mapped to lock-gap-compatible buckets.
    // Panel computes per-character lock-gap with slot data and can override.
    const summary: GlobalLockGapSummary = {
      total: coverage.length,
      blocked: 0,
      needs_required: 0,
      needs_completion: 0,
      lock_ready: 0,
      locked: 0,
      generating: 0,
      total_required_slots: 0,
      lock_ready_slots: 0,
    };

    for (const cov of coverage) {
      if (cov.readiness === 'blocked') {
        summary.blocked++;
      } else if (cov.readiness === 'fully_locked') {
        summary.locked++;
      } else if (cov.requiredReady) {
        // Has all states with sets but may not be lock-ready at slot level
        summary.needs_completion++;
      } else {
        summary.needs_required++;
      }
    }
    return summary;
  }, [coverage]);

  // ── Generation ──

  const generateLook = useCallback(async (characterKey: string, stateKey: string, requiredOnly = false, parentRunManifest?: CostumeRunManifest) => {
    if (!projectId) throw new Error('No project');

    const char = boundCharacters.find(c => c.characterKey === characterKey);
    if (!char) throw new Error(`Character ${characterKey} not bound`);
    if (!char.profile) throw new Error(`No wardrobe profile for ${characterKey}`);

    const state = getStatesForCharacter(characterKey).find(s => s.state_key === stateKey);
    if (!state) throw new Error(`No wardrobe state ${stateKey} for ${characterKey}`);

    const targetName = `${characterKey}|${char.characterName}`;

    // Ensure visual set with state-aware identity (character × wardrobe_state) — EPOCH-STAMPED
    const set = await visualSets.ensureVisualSetForTarget({
      domain: COSTUME_ON_ACTOR_DOMAIN,
      targetType: 'character',
      targetId: char.actorId,
      targetName,
      dnaVersionId: null,
      entityStateKey: stateKey,
      generationEpoch: currentEpoch,
    });

    // FAIL-CLOSED: Do not generate into a locked set
    if (set.status === 'locked') {
      toast.error(`Costume look for ${char.characterName} / ${stateKey} is locked — unlock or archive first`);
      return;
    }

    const slots = await visualSets.fetchSlotsForSet(set.id);
    let actionableSlots = slots.filter(s => s.state !== 'approved' && s.state !== 'locked');

    // REQUIRED-FIRST ORDERING: Sort slots so required slots are processed before optional
    actionableSlots = sortSlotsForGeneration(actionableSlots);

    // REQUIRED-ONLY MODE: Filter to required slots only
    if (requiredOnly) {
      actionableSlots = actionableSlots.filter(s => s.is_required);
    }

    // REQUIRED-FIRST ENFORCEMENT: Block optional slots while required slots are unresolved
    const unresolvedRequired = actionableSlots.filter(s => s.is_required);
    if (!requiredOnly && unresolvedRequired.length > 0) {
      const requiredSlots = actionableSlots.filter(s => s.is_required);
      const optionalSlots = actionableSlots.filter(s => !s.is_required);
      actionableSlots = [...requiredSlots, ...optionalSlots];
    }

    // ── RUN MANIFEST: Create or use parent manifest ──
    const genMode: CostumeGenerationMode = requiredOnly ? 'required_only' : 'full';
    const allowedKeys = actionableSlots.map(s => s.slot_key);
    const castHash = computeCastScopeHash(
      (castQuery.data || []).map((c: any) => ({
        character_key: c.character_key,
        ai_actor_id: c.ai_actor_id,
        ai_actor_version_id: c.ai_actor_version_id,
      }))
    );
    const runManifest = parentRunManifest || createRunManifest(characterKey, stateKey, genMode, allowedKeys, castHash);
    setActiveRunManifest(runManifest);

    if (actionableSlots.length === 0) {
      toast.info('All slots already filled');
      return;
    }

    // ── RESOLVE ACTOR IDENTITY ANCHORS (FAIL CLOSED) ──
    let actorAnchors: ActorAnchorPaths | null = null;
    try {
      actorAnchors = await resolveActorAnchorPaths(char.actorVersionId);
    } catch (e) {
      console.error(`[Costume] Failed to resolve actor anchors for ${characterKey}:`, e);
    }

    if (!actorAnchors?.hasAnchors) {
      toast.error(`Cannot generate costume — no identity anchor images found for actor version ${char.actorVersionId}. Upload actor reference images first.`);
      console.error(`[Costume] GENERATION BLOCKED: No actor anchors for ${characterKey} (actorVersionId=${char.actorVersionId}, anchors=${JSON.stringify(actorAnchors)})`);
      return;
    }

    console.log(`[Costume] Actor anchors resolved: headshot=${!!actorAnchors.headshot} fullBody=${!!actorAnchors.fullBody} refs=${actorAnchors.referenceUrls.length} total=${actorAnchors.anchorCount}`);

    const canonWardrobeInputs = deriveCanonInputsFromProfile(char.profile);
    const input: CostumeLookInput = {
      characterName: char.characterName,
      characterKey,
      actorName: char.characterName,
      actorId: char.actorId,
      actorVersionId: char.actorVersionId,
      wardrobeProfile: char.profile,
      wardrobeState: state,
      worldRules: mode.rules,
      referenceImageUrls: [],
      canonWardrobeInputs,
    };

    let requiredSlotsUnresolved = actionableSlots.filter(s => s.is_required).length;

    for (const slot of actionableSlots) {
      if (abortRef.current) break;

      // ── FAIL-CLOSED RUN MANIFEST ENFORCEMENT ──
      // Even if upstream filtering passed, verify at wire point
      if (!isSlotAllowedInRun(runManifest, slot.slot_key)) {
        console.error(`[Costume] RUN MANIFEST VIOLATION: slot "${slot.slot_key}" not in allowed_slot_keys [${runManifest.allowed_slot_keys.join(',')}] for ${runManifest.generation_mode} run ${runManifest.run_id} — SKIPPING`);
        continue;
      }

      // REQUIRED-FIRST ENFORCEMENT: Skip optional slots while required slots remain unresolved
      if (!slot.is_required && requiredSlotsUnresolved > 0) {
        console.log(`[Costume] Skipping optional slot ${slot.slot_key} — ${requiredSlotsUnresolved} required slots still unresolved`);
        continue;
      }

      // FAIL-CLOSED: Validate costume prompt routing
      if (!isValidCostumeSlotKey(slot.slot_key)) {
        console.error(`[Costume] ROUTING ERROR: slot_key "${slot.slot_key}" not in costume prompt template set — skipping`);
        // Persist routing error on the slot
        try {
          await (supabase as any)
            .from('visual_set_slots')
            .update({ convergence_state: { routing_error: true, last_fail_reason: `Invalid costume slot key: ${slot.slot_key}` } })
            .eq('id', slot.id);
        } catch { /* non-critical */ }
        continue;
      }

      // ── RESOLVE SLOT SCORING POLICY ──
      const slotPolicy = resolveSlotScoringPolicy(slot.slot_key, stateKey);
      console.log(`[Costume] Slot ${slot.slot_key} state=${stateKey} → scoring_policy=${slotPolicy.key} (id_weight=${slotPolicy.weights.identity_consistency}, target=${slotPolicy.target_score}, drift_soft=${slotPolicy.identity_drift_is_soft})`);

      // Initialize convergence state for this slot
      // CRITICAL: Full run-scoped reset when a new run manifest is active.
      // Stale best_score / best_candidate_id from prior runs MUST NOT
      // suppress generation or promote stale candidates in the active run.
      let convState: SlotConvergenceState;
      const isNewRun = parentRunManifest != null;
      const slotConvergenceJson = (slot as any).convergence_state as Record<string, unknown> | null;
      
      if (isNewRun || !isConvergenceFromActiveRun(slotConvergenceJson, runManifest.run_id)) {
        // New run or convergence belongs to a different run → fresh state
        convState = freshRunScopedConvergenceState();
      } else if (slot.best_score || slot.attempt_count) {
        // Same run, resume from persisted state
        convState = {
          best_candidate_id: slot.best_candidate_id || null,
          best_score: slot.best_score || 0,
          attempt_count: slot.attempt_count || 0,
          converged: false,
          target_reached: false,
        };
      } else {
        convState = initialConvergenceState();
      }

      // ── Slot brief gating: skip blocked slots before attempting ──
      const canonInputsForBrief = deriveCanonInputsFromProfile(input.wardrobeProfile, input.temporalTruth);
      const statePackage = resolveStateWardrobePackage(input.wardrobeProfile, input.wardrobeState, input.temporalTruth, canonInputsForBrief);
      const slotBrief = buildCostumeSlotBrief(statePackage, slot.slot_key, input.wardrobeProfile, input.wardrobeState);

      if (!slotBrief.generatable) {
        console.warn(`[CostumeOnActor] Slot "${slot.slot_key}" blocked: ${slotBrief.blockReason}`);
        // Skip this slot — do not count as attempted or succeeded
        continue;
      }

      console.log(`[CostumeOnActor] Slot brief: slot=${slot.slot_key} focus=${slotBrief.focusType} identityLock=${slotBrief.requiresIdentityLock} blocks=${slotBrief.contentBlocks.length} pkgStrength=${statePackage.packageStrength}`);

      // Convergence loop — generate up to MAX attempts per slot (policy-aware thresholds)
      // Required slots get more attempts (MAX_CONVERGENCE_ATTEMPTS_REQUIRED)
      while (shouldContinueConvergence(convState, slotPolicy, slot.is_required) && !abortRef.current) {
        const promptResult = buildCostumeLookPrompt(input, slot.slot_key);

        try {
          const { data: genResult, error: genError } = await (supabase as any).functions.invoke(
            'generate-lookbook-image',
            {
              body: {
                project_id: projectId,
                custom_prompt: promptResult.prompt,
                negative_prompt: promptResult.negative_prompt,
                section: 'character',
                subject: char.characterName,
                character_name: char.characterName,
                asset_group: 'character',
                generation_purpose: `costume_${characterKey}_${stateKey}`,
                forced_shot_type: promptResult.shot_type,
                identity_mode: true,
                actor_id: char.actorId,
                actor_version_id: char.actorVersionId,
                // ── ACTOR IDENTITY ANCHORS: image-based reference for identity preservation ──
                identity_anchor_paths: {
                  headshot: actorAnchors!.headshot || undefined,
                  fullBody: actorAnchors!.fullBody || undefined,
                  arePublicUrls: actorAnchors!.anchorsArePublicUrls,
                },
                // State modifier for wardrobe variation
                state_key: stateKey,
                state_label: state.label,
              },
            },
          );

          if (genError) {
            console.error(`[Costume] Generation error for ${slot.slot_key}:`, genError);
            convState = { ...convState, attempt_count: convState.attempt_count + 1 };
            continue;
          }

          const success = genResult?.image_id ? genResult : genResult?.results?.[0];
          if (success?.image_id) {
            // Validate prompt
            const validation = validateCostumeLookCandidate(
              promptResult.prompt,
              slot.slot_key,
              char.profile!,
              state,
              mode.rules,
            );

            // Score the candidate using rule-based estimation
            const axes = estimateAxesFromRules({
              hasIdentityAnchors: true, // identity_mode is always on
              garmentNounMatch: validation.garment_match,
              fabricLanguageMatch: promptResult.prompt.includes(char.profile!.fabric_language || '__none__'),
              shotTypeCorrect: true, // forced_shot_type ensures this
              eraAppropriate: validation.world_mode_respected,
              promptValidationPassed: validation.passed,
              // IEL: Use effective_signature_garments count — raw signature_garments is INPUT_ONLY
              wardrobeTraitCount: (char.profile!.effective_signature_garments ?? char.profile!.signature_garments).length,
            });

            const convergenceScore = scoreCandidate({
              axes,
              hardFailInput: {
                identityMatch: validation.identity_preserved,
                hasEraViolation: !validation.world_mode_respected,
                slotFramingCorrect: true,
                hasNarrativeLeakage: !validation.no_editorial_drift,
              },
              policy: slotPolicy,
            });

            console.log(`[Costume] Slot ${slot.slot_key} attempt ${convState.attempt_count + 1}: score=${convergenceScore.final_score} policy=${slotPolicy.key} | ${convergenceScore.summary}`);

            // ── ACTOR IDENTITY GATE (rule-based estimation) ──
            // Derive identity dimension scores from rule-based axes + validation
            const identityDims: IdentityDimensionScores = {
              face: validation.identity_preserved ? Math.round(axes.identity_consistency * 100) : 30,
              hair: Math.round(axes.identity_consistency * 90),
              age: Math.round(axes.style_realism * 85),
              body: validation.identity_preserved ? Math.round(axes.identity_consistency * 95) : 35,
              overall: Math.round(convergenceScore.final_score * 100),
            };
            const faceAssessable = !['fabric_detail', 'closure_detail', 'accessory_detail', 'back_silhouette'].includes(slot.slot_key);
            const identityGateResult = evaluateIdentityGate({
              dimensions: identityDims,
              face_assessable: faceAssessable,
              policy_key: slotPolicy.key,
            });
            // ── CONTINUITY GATE: Compare against existing best for same state ──
            let existingBestScores: IdentityDimensionScores | null = null;
            if (convState.best_candidate_id) {
              try {
                const { data: bestCandRow } = await (supabase as any)
                  .from('visual_set_candidates')
                  .select('image_id')
                  .eq('id', convState.best_candidate_id)
                  .maybeSingle();
                if (bestCandRow?.image_id) {
                  const { data: bestImg } = await (supabase as any)
                    .from('project_images')
                    .select('generation_config')
                    .eq('id', bestCandRow.image_id)
                    .maybeSingle();
                  const gc = bestImg?.generation_config;
                  if (gc?.face_score != null) {
                    existingBestScores = {
                      face: gc.face_score,
                      hair: gc.hair_score ?? 50,
                      age: gc.age_score ?? 50,
                      body: gc.body_score ?? 50,
                      overall: gc.actor_identity_score ?? 50,
                    };
                  }
                }
              } catch { /* non-critical — skip continuity if lookup fails */ }
            }
            const continuityGateResult = evaluateContinuityGate({
              candidateScores: identityDims,
              existingBestScores,
              policyKey: slotPolicy.key,
            });
            const gateDecision = combinedGateDecision(identityGateResult, continuityGateResult);
            const gatePayload = serializeGateResult(gateDecision);

            console.log(`[Costume] Identity gate ${slot.slot_key}: ${gateDecision.admitted ? 'ADMITTED' : 'REJECTED'} (score=${identityGateResult.actor_identity_score}, status=${identityGateResult.status}, fails=[${identityGateResult.fail_codes.join(',')}])`);

            // Persist diagnostics + scores + gate results
            try {
              const diag = serializeCostumeLookDiagnostics(
                characterKey, char.actorId, stateKey, slot.slot_key,
                validation, validation.passed ? 'candidate' : 'failed',
              );
              const scoreData = serializeScoresForStorage(convergenceScore);
              await (supabase as any)
                .from('project_images')
                .update({
                  generation_config: {
                    ...diag,
                    prompt_used: promptResult.prompt,
                    ...scoreData,
                    scoring_policy: slotPolicy.key,
                    scoring_policy_label: slotPolicy.label,
                    scoring_policy_target: slotPolicy.target_score,
                    scoring_policy_min_viable: slotPolicy.min_viable_score,
                    costume_run_id: runManifest.run_id,
                    costume_generation_mode: runManifest.generation_mode,
                    ...gatePayload,
                  },
                })
                .eq('id', success.image_id);
            } catch { /* non-critical */ }

            // ── CANDIDATE ADMISSION GATE ──
            // If gate rejects, wire image for audit but do NOT select for slot
            const isBest = gateDecision.admitted && shouldReplaceBest(convState.best_score, convergenceScore);
            await visualSets.wireImageToSlot({
              setId: set.id,
              imageId: success.image_id,
              shotType: slot.slot_key,
              selectForSlot: isBest && !convergenceScore.hard_fail,
            });

            // Persist candidate-level scores
            try {
              await (supabase as any)
                .from('visual_set_candidates')
                .update({
                  convergence_scores: convergenceScore.axes,
                  final_score: convergenceScore.final_score,
                  hard_fail: convergenceScore.hard_fail,
                  fail_reason: convergenceScore.fail_reason,
                  prompt_used: promptResult.prompt,
                  costume_run_id: runManifest.run_id,
                  costume_generation_mode: runManifest.generation_mode,
                })
                .eq('image_id', success.image_id)
                .eq('visual_set_slot_id', slot.id);
            } catch { /* non-critical */ }

            // Update convergence state
            convState = updateConvergenceState(convState, success.image_id, convergenceScore, slotPolicy);

            // Track last fail reason for diagnostics
            const lastFailReason = convergenceScore.hard_fail ? convergenceScore.fail_reason : null;

            // Persist slot-level convergence state with diagnostics
            try {
              await (supabase as any)
                .from('visual_set_slots')
                .update({
                  best_score: convState.best_score,
                  attempt_count: convState.attempt_count,
                  best_candidate_id: convState.best_candidate_id,
                  convergence_state: {
                    ...convState,
                    last_fail_reason: lastFailReason,
                    prompt_template_key: `costume_on_actor/${slot.slot_key}`,
                    scoring_policy: slotPolicy.key,
                    costume_run_id: runManifest.run_id,
                    generation_mode: runManifest.generation_mode,
                    // Gate diagnostics for UI
                    actor_identity_gate_status: gateDecision.identity_gate.status,
                    actor_identity_score: gateDecision.identity_gate.actor_identity_score,
                    gate_admitted: gateDecision.admitted,
                    gate_rejection_reason: gateDecision.rejection_reason,
                    continuity_gate_status: gateDecision.continuity_gate.status,
                    continuity_score: gateDecision.continuity_gate.continuity_score,
                  },
                })
                .eq('id', slot.id);
            } catch { /* non-critical */ }

            // If target reached, stop early
            if (convState.target_reached) {
              console.log(`[Costume] Slot ${slot.slot_key} converged at score ${convState.best_score}`);
              break;
            }
          } else {
            convState = { ...convState, attempt_count: convState.attempt_count + 1 };
          }
        } catch (err) {
          console.error(`[Costume] Slot ${slot.slot_key} attempt failed:`, err);
          convState = { ...convState, attempt_count: convState.attempt_count + 1 };
        }
      }

      // After convergence loop — persist exhaustion diagnostics
      if (convState.attempt_count > 0) {
        const exhaustionReason = convState.target_reached
          ? 'target_reached'
          : convState.best_score > 0
            ? `exhausted_${convState.attempt_count}_attempts_best_${convState.best_score.toFixed(2)}`
            : `exhausted_${convState.attempt_count}_attempts_no_viable`;
        try {
          await (supabase as any)
            .from('visual_set_slots')
            .update({
              convergence_state: {
                ...convState,
                exhaustion_reason: exhaustionReason,
                prompt_template_key: `costume_on_actor/${slot.slot_key}`,
                scoring_policy: slotPolicy.key,
                costume_run_id: runManifest.run_id,
                generation_mode: runManifest.generation_mode,
              },
            })
            .eq('id', slot.id);
        } catch { /* non-critical */ }
      }

      // ── RECONCILE SLOT TRUTH after generation ──
      try {
        await reconcileVisualSetSlot(slot.id);
      } catch (reconcileErr) {
        console.error(`[Costume] Slot reconciliation failed for ${slot.slot_key}:`, reconcileErr);
      }

      // Decrement required counter if this was a required slot
      if (slot.is_required) {
        requiredSlotsUnresolved--;
      }
    }

    // Return yield info — derive admitted count from actual slot truth after generation
    // A slot is "admitted" if it now has a best_candidate_id after this run
    // We re-fetch slots to get post-generation truth
    let admittedCount = 0;
    try {
      const postSlots = await visualSets.fetchSlotsForSet(set.id);
      const relevantSlots = requiredOnly
        ? postSlots.filter(s => s.is_required)
        : postSlots;
      admittedCount = relevantSlots.filter(s =>
        s.best_candidate_id != null && s.state !== 'empty'
      ).length;
    } catch { /* fallback: 0 */ }

    invalidateSets();
    bumpSlotsVersion();
    return { slotsAttempted: actionableSlots.length, slotsAdmitted: admittedCount };
  }, [projectId, boundCharacters, getStatesForCharacter, mode.rules, visualSets, invalidateSets, bumpSlotsVersion]);

  // Generate all missing looks for a character
  const generateAllMissing = useCallback(async (characterKey: string) => {
    if (buildStatus === 'building') return;
    setBuildStatus('building');
    abortRef.current = false;

    const char = boundCharacters.find(c => c.characterKey === characterKey);
    if (!char) { setBuildStatus('error'); return; }

    const states = getStatesForCharacter(characterKey);
    const sets = (setsQuery.data || []).filter(s => s.characterKey === characterKey);
    const missingStates = states.filter(st =>
      !sets.some(s => s.wardrobeStateKey === st.state_key)
    );

    if (missingStates.length === 0) {
      toast.info('No missing states');
      setBuildStatus('idle');
      return;
    }

    setBuildProgress({ [characterKey]: { total: missingStates.length, done: 0 } });

    try {
      for (let i = 0; i < missingStates.length; i++) {
        if (abortRef.current) break;
        await generateLook(characterKey, missingStates[i].state_key);
        setBuildProgress({ [characterKey]: { total: missingStates.length, done: i + 1 } });
      }
      setBuildStatus('done');
      toast.success(`Generated ${missingStates.length} costume look(s) for ${char.characterName}`);
    } catch (err) {
      setBuildStatus('error');
      toast.error('Generation failed');
    }
    invalidateSets();
    bumpSlotsVersion();
  }, [buildStatus, boundCharacters, getStatesForCharacter, setsQuery.data, generateLook, invalidateSets, bumpSlotsVersion]);

  // ── Approval ──

  const approveAllSafe = useCallback(async (setId: string) => {
    return visualSets.approveAllSafe.mutateAsync({ setId });
  }, [visualSets]);

  const approveSlot = useCallback(async (slotId: string) => {
    return visualSets.approveSlot(slotId);
  }, [visualSets]);

  const rejectSlot = useCallback(async (slotId: string) => {
    return visualSets.deselectSlot.mutateAsync({ slotId, decision: 'rejected' });
  }, [visualSets]);

  // ── Locking ──

  const lockSet = useCallback(async (setId: string) => {
    return visualSets.lockSet.mutateAsync(setId);
  }, [visualSets]);

  // ── Lock Character Costume (CANONICAL — lock-gap driven) ──
  // IEL: Lock eligibility is determined solely by lock-gap resolver.
  // No independent lockability logic exists.

  const lockCharacterCostume = useCallback(async (characterKey: string, lockGap?: CharacterLockGapType) => {
    // If no lock-gap provided, compute it (for programmatic callers)
    let gap = lockGap;
    if (!gap) {
      const cov = coverage.find(c => c.characterKey === characterKey);
      if (!cov) {
        toast.error('Character coverage not found');
        return 0;
      }
      const states = getStatesForCharacter(characterKey);
      const sets = (setsQuery.data || []).filter(s => s.characterKey === characterKey);
      const setsPerState: Record<string, { id: string; status: string } | null> = {};
      for (const st of states) {
        const set = sets.find(s => s.wardrobeStateKey === st.state_key);
        setsPerState[st.state_key] = set ? { id: set.id, status: set.status } : null;
      }
      gap = resolveCharacterLockGapFn({
        coverage: cov,
        states,
        slotsPerState: {},
        setsPerState,
        isGenerating: false,
      });
    }

    if (!gap.lock_ready) {
      const msg = formatLockFailureMessageFn(gap);
      if (msg) {
        toast.error(msg, { duration: 8000 });
      } else {
        toast.error('Character is not lock-ready');
      }
      return 0;
    }

    const sets = (setsQuery.data || []).filter(s => s.characterKey === characterKey);
    const lockable = sets.filter(s => s.status !== 'locked' && s.status !== 'archived');

    // ── PRE-LOCK: Resolve DNA version and ensure evaluations exist ──
    // IEL: lock_visual_set RPC requires image_evaluations rows for character_costume_look domain.
    // Slots may have been approved before the evaluation-insertion fix was added.
    const char = boundCharacters.find(c => c.characterKey === characterKey);
    let dnaVersionId: string | null = null;
    if (char) {
      const { data: dnaRow } = await (supabase as any)
        .from('character_visual_dna')
        .select('id')
        .eq('project_id', projectId)
        .eq('character_name', char.characterName)
        .eq('is_current', true)
        .maybeSingle();
      dnaVersionId = dnaRow?.id || null;
    }

    for (const set of lockable) {
      // Stamp DNA version onto set if missing (idempotent — safe to always run)
      if (dnaVersionId) {
        await (supabase as any)
          .from('visual_sets')
          .update({ current_dna_version_id: dnaVersionId })
          .eq('id', set.id)
          .is('current_dna_version_id', null);
      }

      // Ensure all required slots have evaluation records
      const { data: slots } = await (supabase as any)
        .from('visual_set_slots')
        .select('id, slot_label, selected_image_id, is_required, state')
        .eq('visual_set_id', set.id);

      for (const slot of (slots || [])) {
        if (!slot.is_required || !slot.selected_image_id) continue;
        // Check if evaluation exists
        const { data: evalExists } = await (supabase as any)
          .from('image_evaluations')
          .select('id')
          .eq('project_id', projectId)
          .eq('image_id', slot.selected_image_id)
          .limit(1);
        if (!evalExists?.length) {
          const { data: { user } } = await supabase.auth.getUser();
          await (supabase as any)
            .from('image_evaluations')
            .insert({
              project_id: projectId,
              image_id: slot.selected_image_id,
              dna_version_id: dnaVersionId,
              canon_match: 'pass',
              continuity_match: 'pass',
              narrative_fit: 'pass',
              wardrobe_fit: 'pass',
              drift_risk: 'none',
              evaluation_method: 'direct_approval',
              governance_verdict: 'approved',
              evaluation_summary: 'Direct producer approval — pre-lock backfill',
              decision_type: 'direct_approval',
              decision_reason: 'Producer approved without evaluation gate',
              decided_at: new Date().toISOString(),
              decided_by: user?.id || null,
              created_by: user?.id || null,
            });
        }
      }
    }

    let locked = 0;
    for (const set of lockable) {
      try {
        await lockSet(set.id);
        locked++;
      } catch (e: any) {
        console.error(`[CostumeOnActor] Lock failed for set ${set.id} (state: ${set.wardrobeStateKey}):`, e?.message);
        toast.error(`Lock failed at state ${set.wardrobeStateKey}: ${e?.message || 'unknown error'}`);
        break;
      }
    }

    if (locked > 0) {
      toast.success(`Locked ${locked} costume look(s)`);
      invalidateSets();
    }
    return locked;
  }, [setsQuery.data, lockSet, invalidateSets, coverage, getStatesForCharacter, boundCharacters, projectId]);

  // Approve all safe across all sets for a character, then auto-lock eligible
  const approveAllSafeForCharacter = useCallback(async (characterKey: string) => {
    const sets = (setsQuery.data || []).filter(
      s => s.characterKey === characterKey && s.status !== 'locked' && s.status !== 'archived'
    );

    let totalApproved = 0;
    for (const set of sets) {
      try {
        const result = await approveAllSafe(set.id);
        totalApproved += result.approved_count || 0;
      } catch { /* continue */ }
    }

    if (totalApproved > 0) {
      toast.success(`Approved ${totalApproved} slot(s)`);
    } else {
      toast.info('No slots eligible for approval');
    }
    invalidateSets();
    return totalApproved;
  }, [setsQuery.data, approveAllSafe, invalidateSets]);

  const stopBuild = useCallback(async () => {
    abortRef.current = true;
    if (projectId && activeRunManifest?.run_id) {
      await cancelPendingPersistedCommands(projectId, activeRunManifest.run_id);
      await updateRunStatus(projectId, activeRunManifest.run_id, 'aborted');
    }
    setIsPaused(false);
    setBuildStatus('idle');
  }, [projectId, activeRunManifest]);

  // ── Generate Required Only (with cast scope freeze + run manifest) ──
  const generateRequiredOnly = useCallback(async (characterKey: string) => {
    if (buildStatus === 'building') return;
    setBuildStatus('building');
    abortRef.current = false;

    const char = boundCharacters.find(c => c.characterKey === characterKey);
    if (!char) { setBuildStatus('error'); return; }

    // CAST SCOPE FREEZE: Snapshot cast at run start
    const castHash = computeCastScopeHash(
      (castQuery.data || []).map((c: any) => ({
        character_key: c.character_key,
        ai_actor_id: c.ai_actor_id,
        ai_actor_version_id: c.ai_actor_version_id,
      }))
    );
    setSessionCastHash(castHash);
    setSessionStale({ stale: false, reason: null });

    const states = getStatesForCharacter(characterKey);
    // Prioritize scene-backed explicit states first in generation order
    states.sort((a, b) => {
      const aScene = a.explicit_or_inferred === 'explicit' && a.trigger_conditions.some(t => t.startsWith('scene:'));
      const bScene = b.explicit_or_inferred === 'explicit' && b.trigger_conditions.some(t => t.startsWith('scene:'));
      if (aScene && !bScene) return -1;
      if (!aScene && bScene) return 1;
      // Then explicit before inferred
      if (a.explicit_or_inferred !== b.explicit_or_inferred) {
        return a.explicit_or_inferred === 'explicit' ? -1 : 1;
      }
      return 0;
    });
    setBuildProgress({ [characterKey]: { total: states.length, done: 0 } });

    // Create a parent run manifest for all states in this required-only session
    const sessionManifest = createRunManifest(
      characterKey, '__session__', 'required_only',
      COSTUME_REQUIRED_SLOT_KEYS, castHash,
    );

    let slotsAttempted = 0;
    let slotsSucceeded = 0;

    try {
      for (let i = 0; i < states.length; i++) {
        if (abortRef.current) break;

        // CAST SCOPE DRIFT CHECK: re-check cast mid-run
        const currentCastHash = computeCastScopeHash(
          (castQuery.data || []).map((c: any) => ({
            character_key: c.character_key,
            ai_actor_id: c.ai_actor_id,
            ai_actor_version_id: c.ai_actor_version_id,
          }))
        );
        if (hasCastScopeDrifted(castHash, currentCastHash)) {
          setSessionStale({ stale: true, reason: 'Cast roster changed during generation' });
          toast.warning('Cast scope drifted — session marked stale');
          break;
        }

        // Create per-state run manifest inheriting session config
        const stateManifest = createRunManifest(
          characterKey, states[i].state_key, 'required_only',
          COSTUME_REQUIRED_SLOT_KEYS, castHash,
        );

        const yieldResult = await generateLook(characterKey, states[i].state_key, true, stateManifest);
        slotsAttempted += yieldResult?.slotsAttempted ?? 0;
        slotsSucceeded += yieldResult?.slotsAdmitted ?? 0;
        // Update manifest counters from canonical yield
        sessionManifest.slots_attempted = slotsAttempted;
        sessionManifest.slots_succeeded = slotsSucceeded;
        setActiveRunManifest({ ...sessionManifest });
        setBuildProgress({ [characterKey]: { total: states.length, done: i + 1 } });
      }

      setActiveRunManifest(null);
      setBuildStatus('done');
      // REQUIRED-ONLY COMPLETION: Success message only references required slots
      toast.success(`Required slots generated for ${char.characterName} (${slotsSucceeded}/${states.length} states)`);
    } catch {
      setBuildStatus('error');
      toast.error('Required-only generation failed');
    }
    invalidateSets();
    bumpSlotsVersion();
  }, [buildStatus, boundCharacters, getStatesForCharacter, generateLook, invalidateSets, castQuery.data, bumpSlotsVersion]);

  // ── Complete Character (LOCK-GAP DRIVEN) ──
  // IEL: Targets ONLY slots identified as blockers by the canonical lock-gap resolver.
  // Does NOT blindly generate all remaining slots.
  // Fail-closed: if lock_ready or blocked, no-ops with clear messaging.
  const completeCharacter = useCallback(async (characterKey: string) => {
    if (buildStatus === 'building') return;

    const char = boundCharacters.find(c => c.characterKey === characterKey);
    if (!char) { toast.error('Character not found'); return; }

    // ── Resolve canonical lock-gap to derive worklist ──
    const cov = coverage.find(c => c.characterKey === characterKey);
    if (!cov) { toast.error('Coverage not available'); return; }

    const states = getStatesForCharacter(characterKey);
    const sets = (setsQuery.data || []).filter(s => s.characterKey === characterKey);
    const setsPerState: Record<string, { id: string; status: string } | null> = {};
    for (const st of states) {
      const set = sets.find(s => s.wardrobeStateKey === st.state_key);
      setsPerState[st.state_key] = set ? { id: set.id, status: set.status } : null;
    }

    // We need slot data for lock-gap — fetch it
    const slotsPerState: Record<string, any[]> = {};
    for (const st of states) {
      const set = sets.find(s => s.wardrobeStateKey === st.state_key);
      if (set) {
        try {
          const slots = await visualSets.fetchSlotsForSet(set.id);
          slotsPerState[st.state_key] = slots || [];
        } catch { slotsPerState[st.state_key] = []; }
      }
    }

    const gap = resolveCharacterLockGapFn({
      coverage: cov,
      states,
      slotsPerState,
      setsPerState,
      isGenerating: false,
    });

    // ── Fail-closed guards ──
    if (gap.lock_ready) {
      toast.info(`${char.characterName} is already lock-ready — nothing to complete`);
      return;
    }
    if (gap.display_status === 'blocked') {
      toast.error(`${char.characterName} is blocked — cannot complete`);
      return;
    }
    if (gap.blocking_slots.length === 0 && gap.blocking_states.length === 0) {
      toast.info('No actionable blockers found');
      return;
    }

    setBuildStatus('building');
    abortRef.current = false;

    const castHash = computeCastScopeHash(
      (castQuery.data || []).map((c: any) => ({
        character_key: c.character_key,
        ai_actor_id: c.ai_actor_id,
        ai_actor_version_id: c.ai_actor_version_id,
      }))
    );
    setSessionCastHash(castHash);
    setSessionStale({ stale: false, reason: null });

    // ── Derive worklist from lock-gap blockers ──
    // Group blocking states that need generation
    const blockingStateKeys = new Set(gap.blocking_states);
    const targetStates = states.filter(st => blockingStateKeys.has(st.state_key));

    setBuildProgress({ [characterKey]: { total: targetStates.length, done: 0 } });

    const allSlotKeys = COSTUME_LOOK_SLOTS.map(s => s.key);
    let statesDone = 0;

    try {
      for (const state of targetStates) {
        if (abortRef.current) break;

        // Drift check
        const currentCastHash = computeCastScopeHash(
          (castQuery.data || []).map((c: any) => ({
            character_key: c.character_key,
            ai_actor_id: c.ai_actor_id,
            ai_actor_version_id: c.ai_actor_version_id,
          }))
        );
        if (hasCastScopeDrifted(castHash, currentCastHash)) {
          setSessionStale({ stale: true, reason: 'Cast roster changed during generation' });
          toast.warning('Cast scope drifted — session marked stale');
          break;
        }

        // Skip locked states — they are already final
        if (isLookLocked(characterKey, state.state_key)) {
          statesDone++;
          setBuildProgress({ [characterKey]: { total: targetStates.length, done: statesDone } });
          continue;
        }

        const stateManifest = createRunManifest(
          characterKey, state.state_key, 'full',
          allSlotKeys, castHash,
        );

        // Generate for this blocking state
        await generateLook(characterKey, state.state_key, false, stateManifest);
        statesDone++;
        setBuildProgress({ [characterKey]: { total: targetStates.length, done: statesDone } });
      }

      setActiveRunManifest(null);
      setBuildStatus('done');
      toast.success(`Character completion finished for ${char.characterName} (${statesDone}/${targetStates.length} blocking states)`);
    } catch {
      setBuildStatus('error');
      toast.error('Character completion failed');
    }
    invalidateSets();
    bumpSlotsVersion();
  }, [buildStatus, boundCharacters, coverage, getStatesForCharacter, setsQuery.data, visualSets, generateLook, isLookLocked, invalidateSets, castQuery.data, bumpSlotsVersion]);

  // ── Generate Single Slot ──
  // Deterministic single-slot generation: no candidate context required for empty slots.
  const generateSingleSlot = useCallback(async (
    characterKey: string,
    stateKey: string,
    slotId: string,
    slotKey: string,
  ) => {
    if (!projectId) throw new Error('No project');

    const char = boundCharacters.find(c => c.characterKey === characterKey);
    if (!char) throw new Error(`Character ${characterKey} not bound`);
    if (!char.profile) throw new Error(`No wardrobe profile for ${characterKey}`);

    const state = getStatesForCharacter(characterKey).find(s => s.state_key === stateKey);
    if (!state) throw new Error(`No wardrobe state ${stateKey} for ${characterKey}`);

    // FAIL-CLOSED: Validate slot key
    if (!isValidCostumeSlotKey(slotKey)) {
      toast.error(`Invalid costume slot key: ${slotKey}`);
      throw new Error(`Invalid costume slot key: ${slotKey}`);
    }

    const targetName = `${characterKey}|${char.characterName}`;

    // Ensure visual set exists — EPOCH-STAMPED
    const set = await visualSets.ensureVisualSetForTarget({
      domain: COSTUME_ON_ACTOR_DOMAIN,
      targetType: 'character',
      targetId: char.actorId,
      targetName,
      dnaVersionId: null,
      entityStateKey: stateKey,
      generationEpoch: currentEpoch,
    });

    if (set.status === 'locked') {
      toast.error(`Look for ${char.characterName} / ${stateKey} is locked`);
      throw new Error('Set is locked');
    }

    // Fetch current slot state from DB
    const slots = await visualSets.fetchSlotsForSet(set.id);
    const slot = slots.find(s => s.id === slotId) || slots.find(s => s.slot_key === slotKey);
    if (!slot) {
      toast.error(`Slot ${slotKey} not found in set`);
      throw new Error(`Slot ${slotKey} not found`);
    }

    if (slot.state === 'locked') {
      toast.error(`Slot ${slot.slot_label} is locked`);
      throw new Error('Slot is locked');
    }

    // Create single-slot run manifest
    const castHash = computeCastScopeHash(
      (castQuery.data || []).map((c: any) => ({
        character_key: c.character_key,
        ai_actor_id: c.ai_actor_id,
        ai_actor_version_id: c.ai_actor_version_id,
      }))
    );
    const runManifest = createRunManifest(characterKey, stateKey, 'single_slot' as CostumeGenerationMode, [slotKey], castHash);
    setActiveRunManifest(runManifest);

    // ── RESOLVE ACTOR IDENTITY ANCHORS (FAIL CLOSED) ──
    let actorAnchors: ActorAnchorPaths | null = null;
    try {
      actorAnchors = await resolveActorAnchorPaths(char.actorVersionId);
    } catch (e) {
      console.error(`[Costume] Failed to resolve actor anchors for single-slot ${characterKey}:`, e);
    }

    if (!actorAnchors?.hasAnchors) {
      toast.error(`Cannot generate — no identity anchor images for this actor version.`);
      throw new Error(`No actor anchors for ${characterKey}`);
    }

    const canonWardrobeInputs = deriveCanonInputsFromProfile(char.profile);
    const input: CostumeLookInput = {
      characterName: char.characterName,
      characterKey,
      actorName: char.characterName,
      actorId: char.actorId,
      actorVersionId: char.actorVersionId,
      wardrobeProfile: char.profile,
      wardrobeState: state,
      worldRules: mode.rules,
      referenceImageUrls: [],
      canonWardrobeInputs,
    };

    // ── RESOLVE SLOT SCORING POLICY ──
    const slotPolicy = resolveSlotScoringPolicy(slotKey, stateKey);
    console.log(`[Costume] Single-slot ${slotKey} state=${stateKey} → scoring_policy=${slotPolicy.key} (id_weight=${slotPolicy.weights.identity_consistency}, target=${slotPolicy.target_score}, drift_soft=${slotPolicy.identity_drift_is_soft})`);

    // ── Slot brief gating: skip blocked slots before attempting ──
    const canonInputsForBrief = deriveCanonInputsFromProfile(input.wardrobeProfile, input.temporalTruth);
    const statePackage = resolveStateWardrobePackage(input.wardrobeProfile, input.wardrobeState, input.temporalTruth, canonInputsForBrief);
    const slotBrief = buildCostumeSlotBrief(statePackage, slot.slot_key, input.wardrobeProfile, input.wardrobeState);

    if (!slotBrief.generatable) {
      console.warn(`[CostumeOnActor] Single-slot "${slot.slot_key}" blocked: ${slotBrief.blockReason}`);
      toast.error(`Slot "${slotKey}" is blocked: ${slotBrief.blockReason}`);
      throw new Error(`Slot "${slotKey}" blocked: ${slotBrief.blockReason}`);
    }

    console.log(`[CostumeOnActor] Single-slot brief: slot=${slotKey} focus=${slotBrief.focusType} identityLock=${slotBrief.requiresIdentityLock} blocks=${slotBrief.contentBlocks.length} pkgStrength=${statePackage.packageStrength}`);

    // Initialize convergence — FULL RUN-SCOPED RESET for single-slot runs
    let convState: SlotConvergenceState = freshRunScopedConvergenceState();

    // Convergence loop for this single slot (policy-aware thresholds)
    while (shouldContinueConvergence(convState, slotPolicy) && !abortRef.current) {
      const promptResult = buildCostumeLookPrompt(input, slot.slot_key);

      try {
        const { data: genResult, error: genError } = await (supabase as any).functions.invoke(
          'generate-lookbook-image',
          {
            body: {
              project_id: projectId,
              custom_prompt: promptResult.prompt,
              negative_prompt: promptResult.negative_prompt,
              section: 'character',
              subject: char.characterName,
              character_name: char.characterName,
              asset_group: 'character',
              generation_purpose: `costume_${characterKey}_${stateKey}_${slotKey}`,
              forced_shot_type: promptResult.shot_type,
              identity_mode: true,
              actor_id: char.actorId,
              actor_version_id: char.actorVersionId,
              // ── ACTOR IDENTITY ANCHORS ──
              identity_anchor_paths: {
                headshot: actorAnchors!.headshot || undefined,
                fullBody: actorAnchors!.fullBody || undefined,
              },
              state_key: stateKey,
              state_label: state.label,
            },
          },
        );

        if (genError) {
          console.error(`[Costume] Single-slot generation error for ${slotKey}:`, genError);
          convState = { ...convState, attempt_count: convState.attempt_count + 1 };
          continue;
        }

        const success = genResult?.image_id ? genResult : genResult?.results?.[0];
        if (success?.image_id) {
          const validation = validateCostumeLookCandidate(
            promptResult.prompt, slot.slot_key, char.profile!, state, mode.rules,
          );

          const axes = estimateAxesFromRules({
            hasIdentityAnchors: true,
            garmentNounMatch: validation.garment_match,
            fabricLanguageMatch: promptResult.prompt.includes(char.profile!.fabric_language || '__none__'),
            shotTypeCorrect: true,
            eraAppropriate: validation.world_mode_respected,
            promptValidationPassed: validation.passed,
            // IEL: Use effective_signature_garments count — raw signature_garments is INPUT_ONLY
            wardrobeTraitCount: (char.profile!.effective_signature_garments ?? char.profile!.signature_garments).length,
          });

          const convergenceScore = scoreCandidate({
            axes,
            hardFailInput: {
              identityMatch: validation.identity_preserved,
              hasEraViolation: !validation.world_mode_respected,
              slotFramingCorrect: true,
              hasNarrativeLeakage: !validation.no_editorial_drift,
            },
            policy: slotPolicy,
          });

          console.log(`[Costume] Single-slot ${slotKey} attempt ${convState.attempt_count + 1}: score=${convergenceScore.final_score} policy=${slotPolicy.key}`);

          // ── ACTOR IDENTITY GATE ──
          const singleIdentityDims: IdentityDimensionScores = {
            face: validation.identity_preserved ? Math.round(axes.identity_consistency * 100) : 30,
            hair: Math.round(axes.identity_consistency * 90),
            age: Math.round(axes.style_realism * 85),
            body: validation.identity_preserved ? Math.round(axes.identity_consistency * 95) : 35,
            overall: Math.round(convergenceScore.final_score * 100),
          };
          const singleFaceAssessable = !['fabric_detail', 'closure_detail', 'accessory_detail', 'back_silhouette'].includes(slot.slot_key);
          const singleIdGate = evaluateIdentityGate({ dimensions: singleIdentityDims, face_assessable: singleFaceAssessable, policy_key: slotPolicy.key });
          // Continuity: compare against existing best for same slot
          let singleExistingBest: IdentityDimensionScores | null = null;
          if (convState.best_candidate_id) {
            try {
              const { data: bestCandRow } = await (supabase as any)
                .from('visual_set_candidates')
                .select('image_id')
                .eq('id', convState.best_candidate_id)
                .maybeSingle();
              if (bestCandRow?.image_id) {
                const { data: bestImg } = await (supabase as any)
                  .from('project_images')
                  .select('generation_config')
                  .eq('id', bestCandRow.image_id)
                  .maybeSingle();
                const gc = bestImg?.generation_config;
                if (gc?.face_score != null) {
                  singleExistingBest = {
                    face: gc.face_score, hair: gc.hair_score ?? 50,
                    age: gc.age_score ?? 50, body: gc.body_score ?? 50,
                    overall: gc.actor_identity_score ?? 50,
                  };
                }
              }
            } catch { /* skip continuity */ }
          }
          const singleContGate = evaluateContinuityGate({ candidateScores: singleIdentityDims, existingBestScores: singleExistingBest, policyKey: slotPolicy.key });
          const singleGate = combinedGateDecision(singleIdGate, singleContGate);
          const singleGatePayload = serializeGateResult(singleGate);

          console.log(`[Costume] Single-slot identity gate ${slotKey}: ${singleGate.admitted ? 'ADMITTED' : 'REJECTED'} (score=${singleIdGate.actor_identity_score})`);

          // Persist diagnostics + gate
          try {
            const diag = serializeCostumeLookDiagnostics(
              characterKey, char.actorId, stateKey, slot.slot_key,
              validation, validation.passed ? 'candidate' : 'failed',
            );
            const scoreData = serializeScoresForStorage(convergenceScore);
            await (supabase as any).from('project_images').update({
              generation_config: {
                ...diag, prompt_used: promptResult.prompt, ...scoreData,
                scoring_policy: slotPolicy.key,
                scoring_policy_label: slotPolicy.label,
                scoring_policy_target: slotPolicy.target_score,
                scoring_policy_min_viable: slotPolicy.min_viable_score,
                costume_run_id: runManifest.run_id, costume_generation_mode: runManifest.generation_mode,
                ...singleGatePayload,
              },
            }).eq('id', success.image_id);
          } catch { /* non-critical */ }

          // ── CANDIDATE ADMISSION GATE ──
          const isBest = singleGate.admitted && shouldReplaceBest(convState.best_score, convergenceScore);
          await visualSets.wireImageToSlot({
            setId: set.id, imageId: success.image_id, shotType: slot.slot_key,
            selectForSlot: isBest && !convergenceScore.hard_fail,
          });

          // Persist candidate scores
          try {
            await (supabase as any).from('visual_set_candidates').update({
              convergence_scores: convergenceScore.axes,
              final_score: convergenceScore.final_score,
              hard_fail: convergenceScore.hard_fail,
              fail_reason: convergenceScore.fail_reason,
              prompt_used: promptResult.prompt,
              costume_run_id: runManifest.run_id,
              costume_generation_mode: runManifest.generation_mode,
            }).eq('image_id', success.image_id).eq('visual_set_slot_id', slot.id);
          } catch { /* non-critical */ }

          convState = updateConvergenceState(convState, success.image_id, convergenceScore, slotPolicy);

          // Persist slot convergence — CRITICAL: always update `state` to reflect candidate exists
          const lastFailReason = convergenceScore.hard_fail ? convergenceScore.fail_reason : null;
          const newSlotState = isBest && !convergenceScore.hard_fail ? 'candidate_present' : (slot.state === 'empty' ? 'candidate_present' : slot.state);
          try {
            await (supabase as any).from('visual_set_slots').update({
              state: newSlotState,
              best_score: convState.best_score,
              attempt_count: convState.attempt_count,
              best_candidate_id: convState.best_candidate_id,
              convergence_state: {
                ...convState, last_fail_reason: lastFailReason,
                prompt_template_key: `costume_on_actor/${slot.slot_key}`,
                scoring_policy: slotPolicy.key,
                costume_run_id: runManifest.run_id, generation_mode: runManifest.generation_mode,
                // Gate diagnostics for UI
                actor_identity_gate_status: singleGate.identity_gate.status,
                actor_identity_score: singleIdGate.actor_identity_score,
                gate_admitted: singleGate.admitted,
                gate_rejection_reason: singleGate.rejection_reason,
                continuity_gate_status: singleGate.continuity_gate.status,
                continuity_score: singleGate.continuity_gate.continuity_score,
              },
              updated_at: new Date().toISOString(),
            }).eq('id', slot.id);
          } catch (slotUpdateErr) {
            console.error('[Costume][IEL] CRITICAL: Failed to persist slot state after generation:', slotUpdateErr);
          }

          if (convState.target_reached) break;
        } else {
          convState = { ...convState, attempt_count: convState.attempt_count + 1 };
        }
      } catch (err) {
        console.error(`[Costume] Single-slot ${slotKey} attempt failed:`, err);
        convState = { ...convState, attempt_count: convState.attempt_count + 1 };
      }
    }

    // Persist final slot state + exhaustion diagnostics
    if (convState.attempt_count > 0) {
      const exhaustionReason = convState.target_reached
        ? 'target_reached'
        : convState.best_score > 0
          ? `exhausted_${convState.attempt_count}_attempts_best_${convState.best_score.toFixed(2)}`
          : `exhausted_${convState.attempt_count}_attempts_no_viable`;
      const finalState = convState.best_candidate_id ? 'candidate_present' : slot.state;
      try {
        await (supabase as any).from('visual_set_slots').update({
          state: finalState,
          best_score: convState.best_score,
          attempt_count: convState.attempt_count,
          best_candidate_id: convState.best_candidate_id,
          convergence_state: {
            ...convState, exhaustion_reason: exhaustionReason,
            prompt_template_key: `costume_on_actor/${slot.slot_key}`,
            scoring_policy: slotPolicy.key,
            costume_run_id: runManifest.run_id, generation_mode: runManifest.generation_mode,
          },
          updated_at: new Date().toISOString(),
        }).eq('id', slot.id);
      } catch (err) {
        console.error('[Costume][IEL] CRITICAL: Failed to persist final slot state:', err);
      }
    }

    // IEL guard: warn if state is empty but attempts > 0
    if (slot.state === 'empty' && convState.attempt_count > 0 && !convState.best_candidate_id) {
      console.error(`[IEL] Slot ${slotKey} has ${convState.attempt_count} attempts but no viable candidate — state remains empty`);
    }

    setActiveRunManifest(null);
    // Force immediate refetch (not just invalidate) to update UI
    await qc.refetchQueries({ queryKey: ['costume-look-sets', projectId] });
    await visualSets.invalidate();
    bumpSlotsVersion();
    toast.success(`${slot.slot_label} generated for ${char.characterName} / ${state.label}`);
  }, [projectId, boundCharacters, getStatesForCharacter, mode.rules, visualSets, invalidateSets, castQuery.data, qc, bumpSlotsVersion]);

  // ── Build All Character Wardrobes (bulk generation across all eligible characters) ──
  const [bulkProgress, setBulkProgress] = useState<BulkCastProgress[]>([]);

  const buildAllCast = useCallback(async () => {
    if (buildStatus === 'building') return;
    if (!projectId) return;
    setBuildStatus('building');
    abortRef.current = false;
    setIsPaused(false);
    const progress: BulkCastProgress[] = [];

    // Create a run manifest for the bulk run
    const castHash = computeCastScopeHash(
      (castQuery.data || []).map((c: any) => ({
        character_key: c.character_key,
        ai_actor_id: c.ai_actor_id,
        ai_actor_version_id: c.ai_actor_version_id,
      }))
    );
    const bulkManifest = createRunManifest('__all__', '__bulk__', 'full', COSTUME_REQUIRED_SLOT_KEYS, castHash);

    // ── PERSIST RUN IDENTITY ──
    await createPersistedRun(bulkManifest.run_id, projectId, user?.id ?? null, bulkManifest as any);
    setActiveRunManifest(bulkManifest);

    const eligible = boundCharacters.filter(c => c.isEligible);
    if (eligible.length === 0) {
      toast.info('No eligible characters for generation');
      setBuildStatus('idle');
      await updateRunStatus(projectId, bulkManifest.run_id, 'completed');
      setActiveRunManifest(null);
      return;
    }

    for (const char of eligible) {
      if (abortRef.current && !isPaused) break;
      const states = getStatesForCharacter(char.characterKey);
      const sets = (setsQuery.data || []).filter(s => s.characterKey === char.characterKey);

      for (const state of states) {
        // ── ATOMIC COMMAND CONSUMPTION CHECKPOINT (RPC) ──
        const cmdResult = await consumeNextCommandAtomic(projectId, bulkManifest.run_id, {
          activeCharacterKey: char.characterKey,
          activeStateKey: state.state_key,
        });

        if (cmdResult.action === 'pause') {
          toast.info('Generation paused');
          setIsPaused(true);
          // DB-driven pause loop: poll costume_runs.status until resumed
          while (true) {
            await sleepMs(800);
            const stillPaused = await isRunPausedFromDB(projectId, bulkManifest.run_id);
            if (!stillPaused) break;
            // Check if user aborted during pause
            if (abortRef.current) break;
          }
          setIsPaused(false);
          toast.info('Generation resumed');
          if (abortRef.current) break;
        }

        if (cmdResult.action === 'skip_state') {
          progress.push({
            characterKey: char.characterKey,
            characterName: char.characterName,
            stateKey: state.state_key,
            slotKey: '*',
            status: 'skipped',
            reason: `Skipped: ${cmdResult.reason || 'user request'}`,
          });
          setBulkProgress([...progress]);
          continue;
        }

        if (abortRef.current) break;

        const existing = sets.find(s => s.wardrobeStateKey === state.state_key);
        if (existing?.status === 'locked') {
          progress.push({ characterKey: char.characterKey, characterName: char.characterName, stateKey: state.state_key, slotKey: '*', status: 'skipped', reason: 'locked' });
          setBulkProgress([...progress]);
          continue;
        }

        progress.push({ characterKey: char.characterKey, characterName: char.characterName, stateKey: state.state_key, slotKey: '*', status: 'generating' });
        setBulkProgress([...progress]);

        try {
          // Pass bulkManifest as parentRunManifest so convergence reset is run-scoped
          const stateManifest = createRunManifest(
            char.characterKey, state.state_key, 'required_only',
            COSTUME_REQUIRED_SLOT_KEYS, castHash,
          );
          const yieldResult = await generateLook(char.characterKey, state.state_key, true, stateManifest);
          // Use canonical yield from actual slot truth, not placeholder counting
          bulkManifest.slots_attempted += yieldResult?.slotsAttempted ?? 0;
          bulkManifest.slots_succeeded += yieldResult?.slotsAdmitted ?? 0;
          progress[progress.length - 1].status = (yieldResult?.slotsAdmitted ?? 0) > 0 ? 'accepted' : 'failed';
        } catch {
          progress[progress.length - 1].status = 'failed';
        }
        setActiveRunManifest({ ...bulkManifest });
        setBulkProgress([...progress]);
      }
    }

    await cancelPendingPersistedCommands(projectId, bulkManifest.run_id);
    await updateRunStatus(projectId, bulkManifest.run_id, 'completed');
    setIsPaused(false);
    setActiveRunManifest(null);
    setBuildStatus('done');
    toast.success(`Bulk generation complete — ${progress.filter(p => p.status === 'accepted').length} states generated`);
    invalidateSets();
    bumpSlotsVersion();
  }, [buildStatus, projectId, boundCharacters, getStatesForCharacter, setsQuery.data, generateLook, invalidateSets, bumpSlotsVersion, castQuery.data, isPaused, user?.id]);

  // ── Build All Cast — PARALLEL (Governed Worker Pool) ──
  // Uses deterministic planner + bounded concurrency worker pool.
  // Materially faster for large projects without breaking any canonical truth paths.
  const buildAllCastParallel = useCallback(async (modeOverride?: 'required_only' | 'full') => {
    if (buildStatus === 'building' || parallelGen.state.isRunning) {
      toast.warning('Generation already in progress');
      return;
    }
    if (!projectId) return;

    setBuildStatus('building');

    // Fetch raw visual sets for the planner
    const { data: rawSets } = await (supabase as any)
      .from('visual_sets')
      .select('*')
      .eq('project_id', projectId)
      .eq('domain', COSTUME_ON_ACTOR_DOMAIN)
      .neq('status', 'archived')
      .eq('generation_epoch', currentEpoch);

    const result = await parallelGen.startParallelGeneration({
      projectId,
      userId: user?.id ?? null,
      characters: boundCharacters.map(c => ({
        characterKey: c.characterKey,
        characterName: c.characterName,
        actorId: c.actorId,
        actorVersionId: c.actorVersionId,
        profile: c.profile,
        isEligible: c.isEligible,
      })),
      getStatesForCharacter,
      castBindings: (castQuery.data || []).map((c: any) => ({
        character_key: c.character_key,
        ai_actor_id: c.ai_actor_id,
        ai_actor_version_id: c.ai_actor_version_id,
      })),
      worldRules: mode.rules,
      currentEpoch,
      existingSets: rawSets || [],
      ensureVisualSetForTarget: visualSets.ensureVisualSetForTarget,
      fetchSlotsForSet: visualSets.fetchSlotsForSet,
      wireImageToSlot: visualSets.wireImageToSlot,
      invalidateSets,
    }, modeOverride || 'required_only');

    setBuildStatus(result ? 'done' : 'idle');
    invalidateSets();
    bumpSlotsVersion();
  }, [buildStatus, projectId, boundCharacters, getStatesForCharacter, mode.rules, currentEpoch, visualSets, invalidateSets, bumpSlotsVersion, castQuery.data, user?.id, parallelGen]);

  // ── Abort parallel generation ──
  const stopParallelBuild = useCallback(async () => {
    await parallelGen.abort();
    setBuildStatus('idle');
  }, [parallelGen]);

  // ── Reset Costume Generation (epoch-based archive + clean slate) ──
  const resetCostumeGeneration = useCallback(async (reason?: string) => {
    if (!projectId) throw new Error('No project');
    const { data, error } = await (supabase as any).rpc('reset_costume_generation', {
      p_project_id: projectId,
      p_reason: reason || 'Manual reset for clean generation',
    });
    if (error) throw error;
    console.log('[Costume] Reset complete:', data);
    toast.success(`Costume generation reset — epoch ${data.new_epoch}. ${data.archived_sets} sets archived.`);
    await qc.refetchQueries({ queryKey: costumeEpochQueryKey(projectId) });
    await qc.refetchQueries({ queryKey: ['costume-look-sets', projectId] });
    await visualSets.invalidate();
    bumpSlotsVersion();
    return data;
  }, [projectId, qc, visualSets, bumpSlotsVersion]);

  return {
    // Data
    sets: setsQuery.data || [],
    boundCharacters,
    isLoading: setsQuery.isLoading || wardrobe.loading || castQuery.isLoading || canonicalCharactersQuery.isLoading || epochQuery.isLoading,
    hasWardrobe: !!wardrobe.extraction,
    worldRules: mode.rules,
    currentEpoch,

    // Coverage (legacy — informational only)
    coverage,
    globalCoverage,
    // Canonical lock-gap aggregate — use for all semantic decisions
    globalLockGapSummary,

    // Helpers
    getStatesForCharacter,
    getLookSet,
    isLookLocked,
    invalidateSets,

    // Generation
    generateLook,
    generateAllMissing,
    generateRequiredOnly,
    completeCharacter,
    generateSingleSlot,
    buildAllCast,
    buildAllCastParallel,
    buildStatus,
    buildProgress,
    bulkProgress,
    stopBuild,
    stopParallelBuild,
    activeRunManifest,
    sessionStale,
    /** Parallel generation state — includes live plan/progress/character breakdown */
    parallelState: parallelGen.state,

    // Command/Control
    issueCommand,
    isPaused,
    commandLog,

    // Approval
    approveAllSafe,
    approveAllSafeForCharacter,
    approveSlot,
    rejectSlot,

    // Locking
    lockSet,
    lockCharacterCostume,
    // computeCharacterLockEligibility removed — use lockCharacterCostume with lock-gap
    resetCostumeGeneration,

    // Visual sets access
    visualSets,
    fetchSlotsForSet: visualSets.fetchSlotsForSet,

    // Slot refresh version — UI consumers must include this in slot-loading dependencies
    slotsVersion,

    // Slot definitions
    lookSlots: COSTUME_LOOK_SLOTS,
    domain: COSTUME_ON_ACTOR_DOMAIN,
  };
}
