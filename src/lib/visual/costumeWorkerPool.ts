/**
 * costumeWorkerPool.ts — Governed bounded-concurrency worker pool for costume generation.
 *
 * Consumes jobs from a CostumeRunPlan and executes them with:
 * - Global / per-project / per-character / per-slot concurrency limits
 * - Slot-scoped write safety (only one admission per slot at a time)
 * - Pre-built prompts only (workers do NOT rebuild truth)
 * - Canonical admission/reconciliation via existing wireImageToSlot path
 *
 * Workers may NOT:
 * - Directly decide final canonical winner for a slot
 * - Mutate blocker truth directly
 * - Create alternative approval logic
 *
 * v1.0.0
 */

import { supabase } from '@/integrations/supabase/client';
import {
  validateCostumeLookCandidate,
  serializeCostumeLookDiagnostics,
} from './costumeOnActor';
import {
  scoreCandidate,
  estimateAxesFromRules,
  shouldReplaceBest,
  updateConvergenceState,
  freshRunScopedConvergenceState,
  serializeScoresForStorage,
  type ConvergenceScore,
  type SlotConvergenceState,
} from './costumeConvergenceScoring';
import {
  evaluateIdentityGate,
  evaluateContinuityGate,
  combinedGateDecision,
  serializeGateResult,
  type IdentityDimensionScores,
} from './costumeIdentityGate';
import { reconcileVisualSetSlot } from './slotStateResolver';
import type { CostumeJobPlan, CostumeRunPlan } from './costumeJobPlanner';
import type { CostumeParallelLimits, CostumeRetryPolicy, WorkerPoolConfig } from './costumeParallelConfig';
import { resolveWorkerPoolConfig } from './costumeParallelConfig';
import type { WorldValidationRules } from './worldValidationMode';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from './characterWardrobeExtractor';

// ── Types ──

export interface WorkerPoolCallbacks {
  /** Called when a job status changes */
  onJobUpdate?: (job: CostumeJobPlan) => void;
  /** Called when the overall plan progress changes */
  onProgress?: (plan: CostumeRunPlan) => void;
  /** Called to ensure a visual set exists (returns set ID) */
  ensureVisualSet: (params: {
    characterKey: string;
    characterName: string;
    actorId: string;
    stateKey: string;
    epoch: number;
  }) => Promise<string>;
  /** Called to fetch/ensure slots for a set */
  fetchSlotsForSet: (setId: string) => Promise<Array<{
    id: string;
    slot_key: string;
    state: string;
    is_required: boolean;
    best_candidate_id: string | null;
    best_score: number | null;
    attempt_count: number | null;
  }>>;
  /** Wire an image into a slot (existing canonical path) */
  wireImageToSlot: (params: {
    setId: string;
    imageId: string;
    shotType: string;
    selectForSlot: boolean;
  }) => Promise<void>;
  /** Resolve actor anchor paths */
  resolveActorAnchors: (actorVersionId: string) => Promise<{
    hasAnchors: boolean;
    headshot: string | null;
    fullBody: string | null;
    anchorsArePublicUrls?: boolean;
    referenceUrls: string[];
    anchorCount: number;
  } | null>;
  /** Check if run is paused */
  isRunPaused?: () => Promise<boolean>;
  /** Check if run is aborted */
  isAborted?: () => boolean;
  /** Get character profile (needed for validation) */
  getProfile: (characterKey: string) => CharacterWardrobeProfile | null;
  /** Get state definition */
  getState: (characterKey: string, stateKey: string) => WardrobeStateDefinition | null;
  /** Get world rules */
  getWorldRules: () => WorldValidationRules;
  /** Current epoch */
  getCurrentEpoch: () => number;
}

interface InFlightTracking {
  global: number;
  perProject: Map<string, number>;
  perCharacter: Map<string, number>;
  /** Set of slot_ids currently being processed — ensures slot-scoped write safety */
  activeSlots: Set<string>;
}

// ── Worker Pool ──

export class CostumeWorkerPool {
  private plan: CostumeRunPlan;
  private config: WorkerPoolConfig;
  private callbacks: WorkerPoolCallbacks;
  private inflight: InFlightTracking;
  private running = false;
  private resolveCompletion: (() => void) | null = null;
  private schedulerTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cache of resolved set IDs (pending_set_* → actual DB ID) */
  private resolvedSetIds = new Map<string, string>();
  /** Cache of resolved slot IDs (pending_slot_* → actual DB ID) */
  private resolvedSlotIds = new Map<string, string>();
  /** Cache of actor anchors per actor version */
  private actorAnchorsCache = new Map<string, Awaited<ReturnType<WorkerPoolCallbacks['resolveActorAnchors']>>>();

  constructor(
    plan: CostumeRunPlan,
    callbacks: WorkerPoolCallbacks,
    configOverrides?: Partial<WorkerPoolConfig>,
  ) {
    this.plan = plan;
    this.callbacks = callbacks;
    this.config = resolveWorkerPoolConfig(configOverrides);
    this.inflight = {
      global: 0,
      perProject: new Map(),
      perCharacter: new Map(),
      activeSlots: new Set(),
    };
  }

  /** Start the worker pool. Returns a promise that resolves when all jobs are done. */
  async execute(): Promise<CostumeRunPlan> {
    if (this.running) throw new Error('Worker pool already running');
    this.running = true;

    console.log(`[WorkerPool] Starting execution: ${this.plan.total_jobs} jobs, limits: global=${this.config.limits.globalMax} project=${this.config.limits.perProjectMax} char=${this.config.limits.perCharacterMax} slot=${this.config.limits.perSlotMax}`);

    return new Promise<CostumeRunPlan>((resolve) => {
      this.resolveCompletion = () => resolve(this.plan);
      this.scheduleNext();
    });
  }

  /** Stop the pool gracefully */
  abort() {
    this.running = false;
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    // Mark remaining queued jobs as skipped
    for (const job of this.plan.jobs) {
      if (job.status === 'queued') {
        job.status = 'skipped';
        job.error = 'Run aborted';
      }
    }
    this.callbacks.onProgress?.(this.plan);
    if (this.resolveCompletion) {
      this.resolveCompletion();
      this.resolveCompletion = null;
    }
  }

  // ── Scheduler ──

  private scheduleNext() {
    if (!this.running) return;

    // Check completion
    const pendingJobs = this.plan.jobs.filter(j => j.status === 'queued' || j.status === 'running');
    if (pendingJobs.length === 0) {
      this.running = false;
      console.log(`[WorkerPool] All jobs complete`);
      this.callbacks.onProgress?.(this.plan);
      if (this.resolveCompletion) {
        this.resolveCompletion();
        this.resolveCompletion = null;
      }
      return;
    }

    // Check abort
    if (this.callbacks.isAborted?.()) {
      this.abort();
      return;
    }

    // Find claimable jobs
    const limits = this.config.limits;
    const queuedJobs = this.plan.jobs.filter(j => j.status === 'queued');

    for (const job of queuedJobs) {
      if (!this.canClaim(job, limits)) continue;

      // Claim and execute
      this.claimJob(job);
      this.executeJob(job).catch(err => {
        console.error(`[WorkerPool] Unhandled error in job ${job.job_id}:`, err);
        this.finishJob(job, 'failed', null, err?.message || 'Unknown error');
      });
    }

    // Schedule next tick
    this.schedulerTimer = setTimeout(() => this.scheduleNext(), this.config.schedulerTickMs);
  }

  private canClaim(job: CostumeJobPlan, limits: CostumeParallelLimits): boolean {
    // Global limit
    if (this.inflight.global >= limits.globalMax) return false;

    // Per-project limit
    const projCount = this.inflight.perProject.get(job.project_id) || 0;
    if (projCount >= limits.perProjectMax) return false;

    // Per-character limit
    const charCount = this.inflight.perCharacter.get(job.character_key) || 0;
    if (charCount >= limits.perCharacterMax) return false;

    // Per-slot limit: only one in-flight per slot (slot-scoped write safety)
    const slotIdKey = `${job.character_key}|${job.state_key}|${job.slot_key}`;
    if (this.inflight.activeSlots.has(slotIdKey)) return false;

    return true;
  }

  private claimJob(job: CostumeJobPlan) {
    job.status = 'running';
    job.started_at = new Date().toISOString();
    this.inflight.global++;

    const projCount = this.inflight.perProject.get(job.project_id) || 0;
    this.inflight.perProject.set(job.project_id, projCount + 1);

    const charCount = this.inflight.perCharacter.get(job.character_key) || 0;
    this.inflight.perCharacter.set(job.character_key, charCount + 1);

    const slotIdKey = `${job.character_key}|${job.state_key}|${job.slot_key}`;
    this.inflight.activeSlots.add(slotIdKey);

    this.callbacks.onJobUpdate?.(job);
    this.callbacks.onProgress?.(this.plan);
  }

  private releaseJob(job: CostumeJobPlan) {
    this.inflight.global = Math.max(0, this.inflight.global - 1);

    const projCount = this.inflight.perProject.get(job.project_id) || 0;
    this.inflight.perProject.set(job.project_id, Math.max(0, projCount - 1));

    const charCount = this.inflight.perCharacter.get(job.character_key) || 0;
    this.inflight.perCharacter.set(job.character_key, Math.max(0, charCount - 1));

    const slotIdKey = `${job.character_key}|${job.state_key}|${job.slot_key}`;
    this.inflight.activeSlots.delete(slotIdKey);
  }

  private finishJob(job: CostumeJobPlan, status: 'succeeded' | 'failed' | 'skipped', imageId?: string | null, error?: string) {
    job.status = status;
    job.finished_at = new Date().toISOString();
    job.result_image_id = imageId || null;
    job.error = error || null;
    this.releaseJob(job);
    this.callbacks.onJobUpdate?.(job);
    this.callbacks.onProgress?.(this.plan);
  }

  // ── Job Execution (Worker) ──

  private async executeJob(job: CostumeJobPlan): Promise<void> {
    const profile = this.callbacks.getProfile(job.character_key);
    const state = this.callbacks.getState(job.character_key, job.state_key);
    const worldRules = this.callbacks.getWorldRules();

    if (!profile || !state) {
      this.finishJob(job, 'failed', null, 'Missing profile or state');
      return;
    }

    // Resolve set ID if pending
    let setId = job.set_id;
    if (setId.startsWith('pending_set_')) {
      const cachedSetId = this.resolvedSetIds.get(setId);
      if (cachedSetId) {
        setId = cachedSetId;
      } else {
        try {
          const resolvedId = await this.callbacks.ensureVisualSet({
            characterKey: job.character_key,
            characterName: job.character_name,
            actorId: job.actor_id,
            stateKey: job.state_key,
            epoch: this.callbacks.getCurrentEpoch(),
          });
          this.resolvedSetIds.set(job.set_id, resolvedId);
          setId = resolvedId;
        } catch (err: any) {
          this.finishJob(job, 'failed', null, `Failed to ensure visual set: ${err?.message}`);
          return;
        }
      }
      job.set_id = setId;
    }

    // Resolve slot ID if pending
    let slotId = job.slot_id;
    if (slotId.startsWith('pending_slot_')) {
      const cachedSlotId = this.resolvedSlotIds.get(slotId);
      if (cachedSlotId) {
        slotId = cachedSlotId;
      } else {
        try {
          const slots = await this.callbacks.fetchSlotsForSet(setId);
          const matchedSlot = slots.find(s => s.slot_key === job.slot_key);
          if (!matchedSlot) {
            this.finishJob(job, 'failed', null, `Slot ${job.slot_key} not found in set ${setId}`);
            return;
          }
          this.resolvedSlotIds.set(job.slot_id, matchedSlot.id);
          slotId = matchedSlot.id;

          // Check if slot is already locked/approved
          if (matchedSlot.state === 'locked' || matchedSlot.state === 'approved') {
            this.finishJob(job, 'skipped', null, `Slot already ${matchedSlot.state}`);
            return;
          }
        } catch (err: any) {
          this.finishJob(job, 'failed', null, `Failed to fetch slots: ${err?.message}`);
          return;
        }
      }
      job.slot_id = slotId;
    }

    // Resolve actor anchors (cached)
    let anchors = this.actorAnchorsCache.get(job.actor_version_id);
    if (anchors === undefined) {
      try {
        anchors = await this.callbacks.resolveActorAnchors(job.actor_version_id);
        this.actorAnchorsCache.set(job.actor_version_id, anchors);
      } catch {
        anchors = null;
        this.actorAnchorsCache.set(job.actor_version_id, null);
      }
    }

    if (!anchors?.hasAnchors) {
      this.finishJob(job, 'failed', null, 'No actor identity anchors');
      return;
    }

    // ── GENERATION: Call edge function with pre-built prompt ──
    let retries = 0;
    let success: { image_id: string } | null = null;

    while (retries <= this.config.retryPolicy.maxGenerationRetries) {
      try {
        const { data: genResult, error: genError } = await (supabase as any).functions.invoke(
          'generate-lookbook-image',
          {
            body: {
              project_id: job.project_id,
              custom_prompt: job.custom_prompt,
              negative_prompt: job.negative_prompt,
              section: 'character',
              subject: job.character_name,
              character_name: job.character_name,
              asset_group: 'character',
              generation_purpose: `costume_${job.character_key}_${job.state_key}`,
              forced_shot_type: job.shot_type,
              identity_mode: true,
              actor_id: job.actor_id,
              actor_version_id: job.actor_version_id,
              identity_anchor_paths: {
                headshot: anchors!.headshot || undefined,
                fullBody: anchors!.fullBody || undefined,
                arePublicUrls: anchors!.anchorsArePublicUrls,
              },
              state_key: job.state_key,
              state_label: job.state_label,
            },
          },
        );

        if (genError) {
          console.error(`[WorkerPool] Gen error job=${job.job_id} slot=${job.slot_key}:`, genError);
          retries++;
          if (retries <= this.config.retryPolicy.maxGenerationRetries) {
            await new Promise(r => setTimeout(r, this.config.retryPolicy.retryBackoffMs * retries));
          }
          continue;
        }

        const result = genResult?.image_id ? genResult : genResult?.results?.[0];
        if (result?.image_id) {
          success = result;
          break;
        }

        retries++;
      } catch (err) {
        console.error(`[WorkerPool] Gen exception job=${job.job_id}:`, err);
        retries++;
        if (retries <= this.config.retryPolicy.maxGenerationRetries) {
          await new Promise(r => setTimeout(r, this.config.retryPolicy.retryBackoffMs * retries));
        }
      }
    }

    if (!success) {
      this.finishJob(job, 'failed', null, `Generation failed after ${retries} attempt(s)`);
      return;
    }

    // ── ADMISSION: Score, gate, wire (uses existing canonical paths) ──
    try {
      const admissionResult = await this.admitCandidate(job, success.image_id, profile, state, worldRules, setId, slotId);
      job.admission_result = admissionResult.admitted ? 'admitted' : (admissionResult.hardFail ? 'hard_fail' : 'rejected');
      job.final_score = admissionResult.score;
      this.finishJob(job, 'succeeded', success.image_id);
    } catch (err: any) {
      console.error(`[WorkerPool] Admission error job=${job.job_id}:`, err);
      this.finishJob(job, 'succeeded', success.image_id);
      job.admission_result = 'rejected';
      job.error = `Admission error: ${err?.message}`;
    }

    // ── RECONCILIATION: Slot truth reconciliation (existing canonical path) ──
    try {
      await reconcileVisualSetSlot(slotId);
    } catch (reconcileErr) {
      console.error(`[WorkerPool] Slot reconciliation error job=${job.job_id}:`, reconcileErr);
    }
  }

  private async admitCandidate(
    job: CostumeJobPlan,
    imageId: string,
    profile: CharacterWardrobeProfile,
    state: WardrobeStateDefinition,
    worldRules: WorldValidationRules,
    setId: string,
    slotId: string,
  ): Promise<{ admitted: boolean; score: number; hardFail: boolean }> {
    // Validate
    const validation = validateCostumeLookCandidate(
      job.custom_prompt, job.slot_key, profile, state, worldRules,
    );

    // Score
    const axes = estimateAxesFromRules({
      hasIdentityAnchors: true,
      garmentNounMatch: validation.garment_match,
      fabricLanguageMatch: job.custom_prompt.includes(profile.fabric_language || '__none__'),
      shotTypeCorrect: true,
      eraAppropriate: validation.world_mode_respected,
      promptValidationPassed: validation.passed,
      wardrobeTraitCount: ((profile as any).effective_signature_garments ?? profile.signature_garments).length,
    });

    const convergenceScore = scoreCandidate({
      axes,
      hardFailInput: {
        identityMatch: validation.identity_preserved,
        hasEraViolation: !validation.world_mode_respected,
        slotFramingCorrect: true,
        hasNarrativeLeakage: !validation.no_editorial_drift,
      },
      policy: job.scoring_policy,
    });

    // Identity gate
    const identityDims: IdentityDimensionScores = {
      face: validation.identity_preserved ? Math.round(axes.identity_consistency * 100) : 30,
      hair: Math.round(axes.identity_consistency * 90),
      age: Math.round(axes.style_realism * 85),
      body: validation.identity_preserved ? Math.round(axes.identity_consistency * 95) : 35,
      overall: Math.round(convergenceScore.final_score * 100),
    };

    const faceAssessable = !['fabric_detail', 'closure_detail', 'accessory_detail', 'back_silhouette'].includes(job.slot_key);
    const identityGateResult = evaluateIdentityGate({
      dimensions: identityDims,
      face_assessable: faceAssessable,
      policy_key: job.scoring_policy.key,
    });

    const continuityGateResult = evaluateContinuityGate({
      candidateScores: identityDims,
      existingBestScores: null,
      policyKey: job.scoring_policy.key,
    });

    const gateDecision = combinedGateDecision(identityGateResult, continuityGateResult);

    // Persist diagnostics
    try {
      const diag = serializeCostumeLookDiagnostics(
        job.character_key, job.actor_id, job.state_key, job.slot_key,
        validation, validation.passed ? 'candidate' : 'failed',
      );
      const scoreData = serializeScoresForStorage(convergenceScore);
      const gatePayload = serializeGateResult(gateDecision);
      await (supabase as any).from('project_images').update({
        generation_config: {
          ...diag,
          prompt_used: job.custom_prompt,
          ...scoreData,
          scoring_policy: job.scoring_policy.key,
          costume_run_id: job.run_id,
          costume_generation_mode: job.generation_mode,
          parallel_job_id: job.job_id,
          planner_version: job.planner_version,
          ...gatePayload,
        },
      }).eq('id', imageId);
    } catch { /* non-critical */ }

    // Wire candidate to slot (existing canonical path)
    const admitted = gateDecision.admitted && !convergenceScore.hard_fail;
    await this.callbacks.wireImageToSlot({
      setId,
      imageId,
      shotType: job.slot_key,
      selectForSlot: admitted,
    });

    // Persist candidate-level scores
    try {
      await (supabase as any).from('visual_set_candidates').update({
        convergence_scores: convergenceScore.axes,
        final_score: convergenceScore.final_score,
        hard_fail: convergenceScore.hard_fail,
        fail_reason: convergenceScore.fail_reason,
        prompt_used: job.custom_prompt,
        costume_run_id: job.run_id,
        costume_generation_mode: job.generation_mode,
      }).eq('image_id', imageId).eq('visual_set_slot_id', slotId);
    } catch { /* non-critical */ }

    // Persist slot convergence state
    try {
      await (supabase as any).from('visual_set_slots').update({
        convergence_state: {
          costume_run_id: job.run_id,
          generation_mode: job.generation_mode,
          parallel_job_id: job.job_id,
          scoring_policy: job.scoring_policy.key,
          gate_admitted: gateDecision.admitted,
          actor_identity_gate_status: gateDecision.identity_gate.status,
          actor_identity_score: identityGateResult.actor_identity_score,
          gate_rejection_reason: gateDecision.rejection_reason,
        },
      }).eq('id', slotId);
    } catch { /* non-critical */ }

    console.log(`[WorkerPool] Admission: job=${job.job_id} slot=${job.slot_key} admitted=${admitted} score=${convergenceScore.final_score.toFixed(2)} gate=${gateDecision.admitted ? 'PASS' : 'FAIL'}`);

    return {
      admitted,
      score: convergenceScore.final_score,
      hardFail: convergenceScore.hard_fail,
    };
  }
}
