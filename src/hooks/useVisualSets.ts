/**
 * useVisualSets — Deterministic Visual Set Curation Loop.
 * Manages slot-based visual sets with evaluation-aware governance.
 * 
 * Governance rules:
 * - Latest evaluation is resolved deterministically (created_at DESC, id DESC)
 * - Lock is transactional via server-side RPC (lock_visual_set)
 * - Archive is target-scoped, not domain-wide
 * - Readiness is computed via server-side RPC (resolve_visual_set_readiness)
 * - Stale propagation blocks lock and surfaces reasons
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCallback } from 'react';
import { reconcileVisualSetSlot } from '@/lib/visual/slotStateResolver';
import { isCandidateAdmitted, getCandidateRejectionReason } from '@/lib/visual/costumeIdentityGate';

/**
 * Insert a synthetic image_evaluations row for direct-approval flows.
 * Required so the backend lock_visual_set RPC finds an evaluation record.
 */
async function ensureDirectApprovalEvaluation(
  projectId: string,
  imageId: string,
  dnaVersionId: string | null,
): Promise<void> {
  // Check if evaluation already exists
  const { data: existing } = await (supabase as any)
    .from('image_evaluations')
    .select('id')
    .eq('project_id', projectId)
    .eq('image_id', imageId)
    .limit(1);
  if (existing?.length) return; // Already has evaluation

  const { data: { user } } = await supabase.auth.getUser();
  await (supabase as any)
    .from('image_evaluations')
    .insert({
      project_id: projectId,
      image_id: imageId,
      dna_version_id: dnaVersionId,
      canon_match: 'pass',
      continuity_match: 'pass',
      narrative_fit: 'pass',
      wardrobe_fit: 'pass',
      drift_risk: 'none',
      evaluation_method: 'direct_approval',
      governance_verdict: 'approved',
      evaluation_summary: 'Direct producer approval — no AI evaluation required',
      decision_type: 'direct_approval',
      decision_reason: 'Producer approved without evaluation gate',
      decided_at: new Date().toISOString(),
      decided_by: user?.id || null,
      created_by: user?.id || null,
    });
}

// ── Types ──

export type VisualSetStatus = 'draft' | 'autopopulated' | 'curating' | 'ready_to_lock' | 'locked' | 'stale' | 'archived';
export type SlotState = 'empty' | 'candidate_present' | 'approved' | 'needs_replacement' | 'locked';
export type ProducerDecision = 'undecided' | 'approved' | 'rejected' | 'reuse_pool';
export type EvaluationStatus = 'approved' | 'review_required' | 'flagged' | 'rejected' | 'pending' | null;

export interface VisualSet {
  id: string;
  project_id: string;
  domain: string;
  target_type: string;
  target_id: string | null;
  target_name: string;
  source_run_id: string | null;
  status: VisualSetStatus;
  required_slot_count: number;
  current_dna_version_id: string | null;
  entity_state_id: string | null;
  entity_state_key: string | null;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisualSetSlot {
  id: string;
  visual_set_id: string;
  slot_key: string;
  slot_label: string;
  slot_type: string;
  is_required: boolean;
  state: SlotState;
  selected_image_id: string | null;
  evaluation_status: EvaluationStatus;
  replacement_count: number;
  created_at: string;
  /** Convergence scoring fields */
  best_score: number | null;
  attempt_count: number | null;
  best_candidate_id: string | null;
  convergence_state: Record<string, unknown> | null;
}

export interface VisualSetCandidate {
  id: string;
  visual_set_slot_id: string;
  image_id: string;
  evaluation_id: string | null;
  selected_for_slot: boolean;
  producer_decision: ProducerDecision;
  rejection_reason: string | null;
  created_at: string;
}

export interface VisualSetReadiness {
  ready_to_lock: boolean;
  required_slot_total: number;
  required_slot_selected_count: number;
  required_slot_approved_count: number;
  unresolved_slot_count: number;
  stale: boolean;
  dna_ok: boolean;
  blocking_reasons: string[];
}

// ── Slot Definitions per Domain ──

const DOMAIN_SLOTS: Record<string, { key: string; label: string; required: boolean }[]> = {
  character_identity: [
    { key: 'headshot_primary', label: 'Identity Headshot', required: true },
    { key: 'profile_angle', label: 'Identity Profile', required: false },
    { key: 'full_body_primary', label: 'Identity Full Body', required: true },
    { key: 'close_up', label: 'Close-Up', required: false },
    { key: 'medium_shot', label: 'Medium Shot', required: false },
    { key: 'emotional_variant', label: 'Emotional Variant', required: false },
  ],
  world_refs: [
    { key: 'establishing_wide', label: 'Establishing Wide', required: true },
    { key: 'atmospheric', label: 'Atmospheric', required: true },
    { key: 'detail', label: 'Detail', required: false },
    { key: 'time_variant', label: 'Time Variant', required: false },
  ],
  production_design_location: [
    { key: 'establishing_wide', label: 'Establishing Wide', required: true },
    { key: 'atmospheric', label: 'Atmospheric Mood', required: true },
    { key: 'detail', label: 'Architectural Detail', required: false },
    { key: 'time_variant', label: 'Time / Light Variant', required: false },
  ],
  production_design_atmosphere: [
    { key: 'atmosphere_primary', label: 'Primary Atmosphere', required: true },
    { key: 'atmosphere_variant', label: 'Atmosphere Variant', required: true },
    { key: 'lighting_study', label: 'Lighting Study', required: false },
  ],
  production_design_texture: [
    { key: 'texture_primary', label: 'Material Palette', required: true },
    { key: 'texture_detail', label: 'Surface Detail', required: true },
    { key: 'texture_variant', label: 'Material Variant', required: false },
  ],
  production_design_motif: [
    { key: 'motif_primary', label: 'Material Motif', required: true },
    { key: 'motif_variant', label: 'Condition Variant', required: false },
    { key: 'motif_damage', label: 'Damage Motif', required: false },
    { key: 'motif_repair', label: 'Repair Motif', required: false },
  ],
  // World-level costume families removed — costume is now character-driven via costume-on-actor.
  // Legacy slot defs retained for archived set rendering only:
  character_costume_look: [
    { key: 'full_body_primary', label: 'Full Body Primary', required: true },
    { key: 'three_quarter', label: 'Three-Quarter View', required: true },
    { key: 'front_silhouette', label: 'Front Silhouette', required: false },
    { key: 'back_silhouette', label: 'Back Silhouette', required: false },
    { key: 'fabric_detail', label: 'Fabric Detail', required: false },
    { key: 'closure_detail', label: 'Closure Detail', required: false },
    { key: 'accessory_detail', label: 'Accessory Detail', required: false },
    { key: 'hair_grooming', label: 'Hair & Grooming', required: false },
  ],
  costume_refs: [
    { key: 'wardrobe_baseline', label: 'Wardrobe Baseline', required: true },
    { key: 'wardrobe_variant_1', label: 'Wardrobe Variant 1', required: false },
    { key: 'wardrobe_variant_2', label: 'Wardrobe Variant 2', required: false },
  ],
  poster_set: [
    { key: 'poster_primary', label: 'Primary Poster', required: true },
    { key: 'poster_variant_1', label: 'Variant 1', required: false },
    { key: 'poster_variant_2', label: 'Variant 2', required: false },
  ],
};

/** Mapping from autopopulate shot types to visual set slot keys */
const SHOT_TYPE_TO_SLOT_KEY: Record<string, string> = {
  identity_headshot: 'headshot_primary',
  identity_profile: 'profile_angle',
  identity_full_body: 'full_body_primary',
  close_up: 'close_up',
  medium: 'medium_shot',
  emotional_variant: 'emotional_variant',
  wide: 'establishing_wide',
  atmospheric: 'atmospheric',
  detail: 'detail',
  time_variant: 'time_variant',
};

export function getSlotsForDomain(domain: string) {
  return DOMAIN_SLOTS[domain] || DOMAIN_SLOTS.character_identity;
}

// ── Deterministic latest-evaluation resolver ──
// Returns Map<imageId, latestEvaluation> using created_at DESC, id DESC ordering

async function resolveLatestEvaluations(
  projectId: string,
  imageIds: string[],
): Promise<Map<string, any>> {
  if (!imageIds.length) return new Map();

  const { data: allEvals } = await (supabase as any)
    .from('image_evaluations')
    .select('*')
    .eq('project_id', projectId)
    .in('image_id', imageIds)
    .order('created_at', { ascending: false });

  const map = new Map<string, any>();
  for (const e of (allEvals || [])) {
    // First row per image_id is authoritative (ordered by created_at DESC already)
    if (!map.has(e.image_id)) {
      map.set(e.image_id, e);
    }
  }
  return map;
}

// ── Hook ──

export function useVisualSets(projectId: string | undefined) {
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['visual-sets', projectId] });
    qc.invalidateQueries({ queryKey: ['visual-set-readiness'] });
  }, [qc, projectId]);

  // ── Query: All sets for project ──
  const setsQuery = useQuery({
    queryKey: ['visual-sets', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data } = await (supabase as any)
        .from('visual_sets')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      return (data || []) as VisualSet[];
    },
    enabled: !!projectId,
  });

  // ── Fetch slots for a set ──
  const fetchSlotsForSet = useCallback(async (setId: string): Promise<VisualSetSlot[]> => {
    const { data } = await (supabase as any)
      .from('visual_set_slots')
      .select('*')
      .eq('visual_set_id', setId)
      .order('created_at', { ascending: true });
    return (data || []) as VisualSetSlot[];
  }, []);

  // ── Fetch candidates for a set ──
  const fetchCandidatesForSet = useCallback(async (setId: string): Promise<VisualSetCandidate[]> => {
    const { data: slots } = await (supabase as any)
      .from('visual_set_slots')
      .select('id')
      .eq('visual_set_id', setId);
    if (!slots?.length) return [];
    const slotIds = slots.map((s: any) => s.id);
    const { data } = await (supabase as any)
      .from('visual_set_candidates')
      .select('*')
      .in('visual_set_slot_id', slotIds)
      .order('created_at', { ascending: true });
    return (data || []) as VisualSetCandidate[];
  }, []);

  // ── Readiness resolver (calls server-side RPC) ──
  const resolveReadiness = useCallback(async (setId: string): Promise<VisualSetReadiness> => {
    const { data, error } = await (supabase as any).rpc('resolve_visual_set_readiness', {
      p_set_id: setId,
    });
    if (error) throw error;
    return data as VisualSetReadiness;
  }, []);

  // ── Mutation: Create set with slots ──
  const createSetMutation = useMutation({
    mutationFn: async (params: {
      domain: string;
      targetType: string;
      targetId?: string | null;
      targetName: string;
      sourceRunId?: string;
      dnaVersionId?: string | null;
      entityStateId?: string | null;
      entityStateKey?: string | null;
    }) => {
      if (!projectId) throw new Error('No project');
      const slots = getSlotsForDomain(params.domain);
      const requiredCount = slots.filter(s => s.required).length;

      const { data: set, error: setError } = await (supabase as any)
        .from('visual_sets')
        .insert({
          project_id: projectId,
          domain: params.domain,
          target_type: params.targetType,
          target_id: params.targetId || null,
          target_name: params.targetName,
          source_run_id: params.sourceRunId || null,
          status: 'draft',
          required_slot_count: requiredCount,
          current_dna_version_id: params.dnaVersionId || null,
          entity_state_id: params.entityStateId || null,
          entity_state_key: params.entityStateKey || null,
        })
        .select()
        .single();
      if (setError) throw setError;

      const slotRows = slots.map(s => ({
        visual_set_id: set.id,
        slot_key: s.key,
        slot_label: s.label,
        slot_type: 'image',
        is_required: s.required,
        state: 'empty',
      }));
      const { error: slotError } = await (supabase as any)
        .from('visual_set_slots')
        .insert(slotRows);
      if (slotError) throw slotError;

      return set as VisualSet;
    },
    onSuccess: () => { invalidate(); toast.success('Visual set created'); },
    onError: (e: Error) => toast.error(`Failed to create set: ${e.message}`),
  });

  // ── Mutation: Attach candidate to slot ──
  const attachCandidateMutation = useMutation({
    mutationFn: async (params: {
      slotId: string;
      imageId: string;
      evaluationId?: string | null;
      selectForSlot?: boolean;
    }) => {
      const { error } = await (supabase as any)
        .from('visual_set_candidates')
        .insert({
          visual_set_slot_id: params.slotId,
          image_id: params.imageId,
          evaluation_id: params.evaluationId || null,
          selected_for_slot: params.selectForSlot ?? false,
          producer_decision: 'undecided',
        });
      if (error) throw error;

      if (params.selectForSlot) {
        await (supabase as any)
          .from('visual_set_slots')
          .update({ selected_image_id: params.imageId, state: 'candidate_present' })
          .eq('id', params.slotId);
      } else {
        await (supabase as any)
          .from('visual_set_slots')
          .update({ state: 'candidate_present' })
          .eq('id', params.slotId)
          .eq('state', 'empty');
      }
      // Reconcile slot truth
      await reconcileVisualSetSlot(params.slotId);
    },
    onSuccess: () => invalidate(),
  });

  // ── Mutation: Select candidate for slot ──
  const selectCandidateMutation = useMutation({
    mutationFn: async (params: { slotId: string; candidateId: string; imageId: string }) => {
      // Get previously selected image to demote
      const { data: prevSlot } = await (supabase as any)
        .from('visual_set_slots')
        .select('selected_image_id')
        .eq('id', params.slotId)
        .single();

      await (supabase as any)
        .from('visual_set_candidates')
        .update({ selected_for_slot: false })
        .eq('visual_set_slot_id', params.slotId);

      await (supabase as any)
        .from('visual_set_candidates')
        .update({ selected_for_slot: true })
        .eq('id', params.candidateId);

      await (supabase as any)
        .from('visual_set_slots')
        .update({ selected_image_id: params.imageId, state: 'candidate_present' })
        .eq('id', params.slotId);

      // Demote previously selected image back to candidate in project_images
      if (prevSlot?.selected_image_id && prevSlot.selected_image_id !== params.imageId) {
        await (supabase as any)
          .from('project_images')
          .update({ curation_state: 'candidate', is_active: false, is_primary: false })
          .eq('id', prevSlot.selected_image_id);
      }
    },
    onSuccess: () => invalidate(),
  });

  // ── Mutation: Approve All Safe ──
  // Uses deterministic latest-evaluation resolution
  const approveAllSafeMutation = useMutation({
    mutationFn: async (params: { setId: string; includeReviewRequired?: boolean }) => {
      if (!projectId) throw new Error('No project');

      const { data: slots } = await (supabase as any)
        .from('visual_set_slots')
        .select('*')
        .eq('visual_set_id', params.setId)
        .not('selected_image_id', 'is', null);

      if (!slots?.length) return { approved_count: 0, skipped_count: 0, skipped_reasons: ['No selected candidates'] };

      // Get set for DNA version check
      const { data: set } = await (supabase as any)
        .from('visual_sets')
        .select('current_dna_version_id, status')
        .eq('id', params.setId)
        .single();

      // Block if stale
      if (set?.status === 'stale') {
        return { approved_count: 0, skipped_count: slots.length, skipped_reasons: ['Set is stale — resolve DNA first'] };
      }

      // Resolve latest evaluations deterministically
      const imageIds = slots.map((s: any) => s.selected_image_id);
      const evalMap = await resolveLatestEvaluations(projectId, imageIds);

      let approvedCount = 0;
      const skippedReasons: string[] = [];

      for (const slot of slots) {
        if (slot.state === 'approved' || slot.state === 'locked') {
          continue; // Already approved/locked, don't re-process
        }

        // ── IDENTITY GATE CHECK: Skip non-admitted candidates ──
        if (slot.selected_image_id) {
          const { data: imgRow } = await (supabase as any)
            .from('project_images')
            .select('generation_config')
            .eq('id', slot.selected_image_id)
            .maybeSingle();
          if (!isCandidateAdmitted(imgRow?.generation_config)) {
            const reason = getCandidateRejectionReason(imgRow?.generation_config) || 'identity gate failed';
            console.log(`[VisualSets] Skipping slot "${slot.slot_label}" — identity gate: ${reason}`);
            skippedReasons.push(`${slot.slot_label}: ${reason}`);
            continue;
          }
        }

        const eval_: any = evalMap.get(slot.selected_image_id);

        // If no evaluation exists, approve directly (costume/non-evaluated domains)
        if (!eval_) {
          // Allow evaluation-free approval for slots that have a selected image
          // Insert synthetic evaluation so backend lock_visual_set RPC succeeds
          console.log(`[VisualSets] Approving slot "${slot.slot_label}" without evaluation (direct approval)`);
          await ensureDirectApprovalEvaluation(projectId, slot.selected_image_id, set?.current_dna_version_id || null);

          await (supabase as any)
            .from('visual_set_slots')
            .update({ state: 'approved' })
            .eq('id', slot.id);

          await (supabase as any)
            .from('visual_set_candidates')
            .update({ producer_decision: 'approved' })
            .eq('visual_set_slot_id', slot.id)
            .eq('selected_for_slot', true);

          await (supabase as any)
            .from('project_images')
            .update({ curation_state: 'active', is_active: true })
            .eq('id', slot.selected_image_id);

          approvedCount++;
          continue;
        }
        if (eval_.governance_verdict === 'rejected') {
          skippedReasons.push(`${slot.slot_label}: rejected by evaluation`);
          continue;
        }
        if (eval_.governance_verdict === 'flagged') {
          skippedReasons.push(`${slot.slot_label}: flagged — requires manual review`);
          continue;
        }
        if (!eval_.governance_verdict || eval_.governance_verdict === 'pending') {
          skippedReasons.push(`${slot.slot_label}: evaluation pending`);
          continue;
        }
        if (eval_.governance_verdict === 'review_required' && !params.includeReviewRequired) {
          skippedReasons.push(`${slot.slot_label}: review_required — enable flag to include`);
          continue;
        }
        // DNA version mismatch
        if (set?.current_dna_version_id) {
          if (!eval_.dna_version_id) {
            skippedReasons.push(`${slot.slot_label}: evaluation missing DNA version`);
            continue;
          }
          if (eval_.dna_version_id !== set.current_dna_version_id) {
            skippedReasons.push(`${slot.slot_label}: DNA version mismatch (eval from prior DNA)`);
            continue;
          }
        }

        // APPROVE — update visual_set_slots
        await (supabase as any)
          .from('visual_set_slots')
          .update({ state: 'approved', evaluation_status: eval_.governance_verdict })
          .eq('id', slot.id);

        await (supabase as any)
          .from('visual_set_candidates')
          .update({ producer_decision: 'approved' })
          .eq('visual_set_slot_id', slot.id)
          .eq('selected_for_slot', true);

        // CANONICAL WRITE-BACK — promote approved image into project_images
        await (supabase as any)
          .from('project_images')
          .update({ curation_state: 'active', is_active: true })
          .eq('id', slot.selected_image_id);

        // Reconcile slot truth after approval
        await reconcileVisualSetSlot(slot.id);

        approvedCount++;
      }

      // After approval, check readiness and auto-lock if eligible
      try {
        const readiness = await resolveReadiness(params.setId);
        if (readiness.ready_to_lock && approvedCount > 0) {
          // Auto-lock: all required slots are approved
          const { data: lockResult, error: lockErr } = await (supabase as any).rpc('lock_visual_set', {
            p_set_id: params.setId,
          });
          if (!lockErr && lockResult?.success) {
            return {
              approved_count: approvedCount,
              skipped_count: skippedReasons.length,
              skipped_reasons: skippedReasons,
              auto_locked: true,
              locked_slot_count: lockResult.locked_slot_count || 0,
            };
          }
          // Lock failed — fall back to ready_to_lock status
          await (supabase as any)
            .from('visual_sets')
            .update({ status: 'ready_to_lock' as VisualSetStatus })
            .eq('id', params.setId)
            .neq('status', 'locked');
        } else {
          const newStatus: VisualSetStatus = readiness.ready_to_lock ? 'ready_to_lock' : 'curating';
          await (supabase as any)
            .from('visual_sets')
            .update({ status: newStatus })
            .eq('id', params.setId)
            .neq('status', 'locked');
        }
      } catch {
        // Fallback: simple check
        await (supabase as any)
          .from('visual_sets')
          .update({ status: 'curating' })
          .eq('id', params.setId)
          .neq('status', 'locked');
      }

      return {
        approved_count: approvedCount,
        skipped_count: skippedReasons.length,
        skipped_reasons: skippedReasons,
        auto_locked: false,
      };
    },
    onSuccess: (result) => {
      invalidate();
      if (result.auto_locked) {
        toast.success(`Approved ${result.approved_count} slot(s) — family locked`);
      } else if (result.approved_count > 0) {
        toast.success(`Approved ${result.approved_count} slot(s)`);
      }
      if (result.skipped_count > 0) {
        toast.info(`Skipped ${result.skipped_count}: ${result.skipped_reasons[0]}${result.skipped_count > 1 ? ` (+${result.skipped_count - 1} more)` : ''}`);
      }
    },
    onError: (e: Error) => toast.error(`Approve failed: ${e.message}`),
  });

  // ── Mutation: Deselect slot ──
  const deselectSlotMutation = useMutation({
    mutationFn: async (params: { slotId: string; decision?: 'rejected' | 'reuse_pool' }) => {
      const { data: slot } = await (supabase as any)
        .from('visual_set_slots')
        .select('selected_image_id, replacement_count, visual_set_id')
        .eq('id', params.slotId)
        .single();

      if (slot?.selected_image_id) {
        const decision = params.decision || 'rejected';
        await (supabase as any)
          .from('visual_set_candidates')
          .update({ selected_for_slot: false, producer_decision: decision })
          .eq('visual_set_slot_id', params.slotId)
          .eq('selected_for_slot', true);
      }

      await (supabase as any)
        .from('visual_set_slots')
        .update({
          selected_image_id: null,
          state: 'needs_replacement',
          evaluation_status: null,
          replacement_count: (slot?.replacement_count || 0) + 1,
        })
        .eq('id', params.slotId);
      // Reconcile after deselection
      await reconcileVisualSetSlot(params.slotId);

      // Revert set status if needed
      if (slot?.visual_set_id) {
        await (supabase as any)
          .from('visual_sets')
          .update({ status: 'curating' })
          .eq('id', slot.visual_set_id)
          .in('status', ['ready_to_lock']);
      }
    },
    onSuccess: () => { invalidate(); toast.success('Slot deselected'); },
    onError: (e: Error) => toast.error(`Deselect failed: ${e.message}`),
  });

  // ── Mutation: Lock set (transactional via RPC) ──
  const lockSetMutation = useMutation({
    mutationFn: async (setId: string) => {
      const { data, error } = await (supabase as any).rpc('lock_visual_set', {
        p_set_id: setId,
      });
      if (error) throw error;

      const result = data as {
        success: boolean;
        set_id?: string;
        locked_slot_count?: number;
        archived_set_ids?: string[];
        blocking_reasons?: string[];
      };

      if (!result.success) {
        const reasons = result.blocking_reasons || ['Unknown validation failure'];
        throw new Error(reasons[0] + (reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ''));
      }

      return result;
    },
    onSuccess: (result) => {
      invalidate();
      toast.success(`Visual set locked — ${result.locked_slot_count || 0} slot(s) committed`);
      if (result.archived_set_ids?.length) {
        toast.info(`Archived ${result.archived_set_ids.length} prior set(s)`);
      }
    },
    onError: (e: Error) => toast.error(`Lock failed: ${e.message}`),
  });

  // ── Mutation: Replace unresolved slots ──
  // Returns payload for each unresolved slot to be used by generation
  const replaceUnresolvedSlotsMutation = useMutation({
    mutationFn: async (params: {
      setId: string;
      generateFn?: (payload: UnresolvedSlotPayload) => Promise<{ imageId: string } | null>;
    }) => {
      if (!projectId) throw new Error('No project');

      const { data: set } = await (supabase as any)
        .from('visual_sets')
        .select('*')
        .eq('id', params.setId)
        .single();
      if (!set) throw new Error('Set not found');

      const { data: slots } = await (supabase as any)
        .from('visual_set_slots')
        .select('*')
        .eq('visual_set_id', params.setId)
        .in('state', ['empty', 'needs_replacement']);

      if (!slots?.length) return { replaced: 0, payloads: [] };

      // Get rejected candidate image_ids per slot to avoid repetition
      const slotIds = slots.map((s: any) => s.id);
      const { data: rejectedCandidates } = await (supabase as any)
        .from('visual_set_candidates')
        .select('visual_set_slot_id, image_id')
        .in('visual_set_slot_id', slotIds)
        .eq('producer_decision', 'rejected');

      const rejectedBySlot = new Map<string, string[]>();
      for (const rc of (rejectedCandidates || [])) {
        const arr = rejectedBySlot.get(rc.visual_set_slot_id) || [];
        arr.push(rc.image_id);
        rejectedBySlot.set(rc.visual_set_slot_id, arr);
      }

      const payloads: UnresolvedSlotPayload[] = slots.map((slot: any) => ({
        visual_set_id: params.setId,
        slot_id: slot.id,
        slot_key: slot.slot_key,
        slot_label: slot.slot_label,
        domain: set.domain,
        target_type: set.target_type,
        target_id: set.target_id,
        target_name: set.target_name,
        current_dna_version_id: set.current_dna_version_id,
        rejected_image_ids: rejectedBySlot.get(slot.id) || [],
      }));

      // If a generation function is provided, call it for each slot
      let replaced = 0;
      if (params.generateFn) {
        for (const payload of payloads) {
          try {
            const result = await params.generateFn(payload);
            if (result?.imageId) {
              // Attach as candidate and select
              await (supabase as any)
                .from('visual_set_candidates')
                .insert({
                  visual_set_slot_id: payload.slot_id,
                  image_id: result.imageId,
                  selected_for_slot: true,
                  producer_decision: 'undecided',
                });

              // Deselect previous candidates
              await (supabase as any)
                .from('visual_set_candidates')
                .update({ selected_for_slot: false })
                .eq('visual_set_slot_id', payload.slot_id)
                .neq('image_id', result.imageId);

              await (supabase as any)
                .from('visual_set_slots')
                .update({ selected_image_id: result.imageId, state: 'candidate_present' })
                .eq('id', payload.slot_id);
              // Reconcile after replacement
              await reconcileVisualSetSlot(payload.slot_id);

              replaced++;
            }
          } catch (err) {
            console.error(`[replaceUnresolved] Slot ${payload.slot_key} failed:`, err);
          }
        }
      }

      return { replaced, payloads };
    },
    onSuccess: (result) => {
      invalidate();
      if (result.replaced > 0) {
        toast.success(`Regenerated ${result.replaced} slot(s)`);
      } else if (result.payloads.length > 0 && result.replaced === 0) {
        toast.info(`${result.payloads.length} slot(s) need regeneration`);
      }
    },
    onError: (e: Error) => toast.error(`Regeneration failed: ${e.message}`),
  });

  // ── Mutation: Mark set status ──
  const updateSetStatusMutation = useMutation({
    mutationFn: async (params: { setId: string; status: VisualSetStatus }) => {
      await (supabase as any)
        .from('visual_sets')
        .update({ status: params.status })
        .eq('id', params.setId);
    },
    onSuccess: () => invalidate(),
  });

  // ── Stale detection + propagation ──
  const checkAndPropagateStale = useCallback(async (setId: string): Promise<boolean> => {
    const { data: set } = await (supabase as any)
      .from('visual_sets')
      .select('current_dna_version_id, domain, project_id, status')
      .eq('id', setId)
      .single();

    if (!set?.current_dna_version_id) return false;
    if (set.status === 'locked' || set.status === 'archived') return false;

    const { data: dna } = await (supabase as any)
      .from('character_visual_dna')
      .select('id')
      .eq('id', set.current_dna_version_id)
      .eq('is_current', true)
      .maybeSingle();

    if (!dna) {
      await (supabase as any)
        .from('visual_sets')
        .update({ status: 'stale' })
        .eq('id', setId)
        .neq('status', 'locked');
      return true;
    }
    return false;
  }, []);

  // ── Autopopulate → Visual Set wiring ──
  // Finds or creates the governed visual set for a target, then wires images into slots
  const ensureVisualSetForTarget = useCallback(async (params: {
    domain: string;
    targetType: string;
    targetId?: string | null;
    targetName: string;
    dnaVersionId?: string | null;
    entityStateKey?: string | null;
    /** Costume generation epoch — sets created will be stamped with this epoch */
    generationEpoch?: number;
  }): Promise<VisualSet> => {
    if (!projectId) throw new Error('No project');

    // Build state-aware lookup query — include ALL non-archived sets (including locked)
    // to prevent duplicate set creation for the same identity
    let query = (supabase as any)
      .from('visual_sets')
      .select('*')
      .eq('project_id', projectId)
      .eq('domain', params.domain)
      .eq('target_name', params.targetName)
      .neq('status', 'archived');

    // Epoch-aware: filter by epoch when provided
    if (params.generationEpoch != null) {
      query = query.eq('generation_epoch', params.generationEpoch);
    }

    // State-aware identity: include entity_state_key in lookup when provided
    if (params.entityStateKey) {
      query = query.eq('entity_state_key', params.entityStateKey);
    } else {
      query = query.is('entity_state_key', null);
    }

    const { data: existing } = await query
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing?.[0]) {
      // Update DNA version if provided and changed (only for non-locked sets)
      if (params.dnaVersionId && existing[0].status !== 'locked' &&
          existing[0].current_dna_version_id !== params.dnaVersionId) {
        await (supabase as any)
          .from('visual_sets')
          .update({ current_dna_version_id: params.dnaVersionId })
          .eq('id', existing[0].id);
      }
      return existing[0] as VisualSet;
    }

    // Create new set with state identity baked in
    const slots = getSlotsForDomain(params.domain);
    const requiredCount = slots.filter(s => s.required).length;

    const { data: set, error } = await (supabase as any)
      .from('visual_sets')
      .insert({
        project_id: projectId,
        domain: params.domain,
        target_type: params.targetType,
        target_id: params.targetId || null,
        target_name: params.targetName,
        status: 'draft',
        required_slot_count: requiredCount,
        current_dna_version_id: params.dnaVersionId || null,
        entity_state_key: params.entityStateKey || null,
        ...(params.generationEpoch != null ? { generation_epoch: params.generationEpoch } : {}),
      })
      .select()
      .single();
    if (error) throw error;

    const slotRows = slots.map(s => ({
      visual_set_id: set.id,
      slot_key: s.key,
      slot_label: s.label,
      slot_type: 'image',
      is_required: s.required,
      state: 'empty',
    }));
    await (supabase as any).from('visual_set_slots').insert(slotRows);

    return set as VisualSet;
  }, [projectId]);

  // Wire a generated image into the correct slot of a visual set
  const wireImageToSlot = useCallback(async (params: {
    setId: string;
    imageId: string;
    shotType: string;
    selectForSlot?: boolean;
  }) => {
    const slotKey = SHOT_TYPE_TO_SLOT_KEY[params.shotType] || params.shotType;

    const { data: slot } = await (supabase as any)
      .from('visual_set_slots')
      .select('id, state, selected_image_id')
      .eq('visual_set_id', params.setId)
      .eq('slot_key', slotKey)
      .maybeSingle();

    if (!slot) return; // No matching slot for this shot type

    const shouldSelect = params.selectForSlot ?? (slot.state === 'empty');

    // ATOMIC ORDER: Deselect previous candidates BEFORE inserting the new one
    // This prevents a race where two candidates both have selected_for_slot = true
    if (shouldSelect) {
      await (supabase as any)
        .from('visual_set_candidates')
        .update({ selected_for_slot: false })
        .eq('visual_set_slot_id', slot.id);
    }

    // Insert candidate (after deselection to prevent split-brain)
    await (supabase as any)
      .from('visual_set_candidates')
      .insert({
        visual_set_slot_id: slot.id,
        image_id: params.imageId,
        selected_for_slot: shouldSelect,
        producer_decision: 'undecided',
      });

    // Update slot state and selected image — always transition out of empty/needs_replacement
    if (slot.state === 'empty' || slot.state === 'needs_replacement') {
      await (supabase as any)
        .from('visual_set_slots')
        .update({
          state: 'candidate_present',
          ...(shouldSelect ? { selected_image_id: params.imageId } : {}),
        })
        .eq('id', slot.id);
    } else if (shouldSelect) {
      // Slot already has candidates — upgrade selected image to the better candidate
      await (supabase as any)
        .from('visual_set_slots')
        .update({ selected_image_id: params.imageId })
        .eq('id', slot.id);
    }
    // Reconcile slot truth after wiring
    await reconcileVisualSetSlot(slot.id);

    // Update set status to autopopulated/curating
    await (supabase as any)
      .from('visual_sets')
      .update({ status: 'curating' })
      .eq('id', params.setId)
      .in('status', ['draft', 'autopopulated']);
  }, []);

  /**
   * syncImagesToVisualSets — Bridge function.
   * Takes existing project_images candidates and wires them into governed visual sets.
   * Reuses ensureVisualSetForTarget + wireImageToSlot — no duplicate logic.
   * Returns { synced, skipped } counts.
   */
  const syncImagesToVisualSets = useCallback(async (images: Array<{
    id: string;
    asset_group: string | null;
    subject: string | null;
    shot_type: string | null;
  }>): Promise<{ synced: number; skipped: number }> => {
    if (!projectId) return { synced: 0, skipped: 0 };

    let synced = 0;
    let skipped = 0;

    // Group images by target (domain + subject)
    const targetGroups = new Map<string, typeof images>();
    for (const img of images) {
      if (!img.asset_group || !img.shot_type) {
        skipped++;
        continue;
      }
      const domain = img.asset_group === 'character' ? 'character_identity'
        : img.asset_group === 'world' ? 'world_refs'
        : null;
      if (!domain) {
        skipped++;
        continue;
      }
      // Must have a matching slot key
      const slotKey = SHOT_TYPE_TO_SLOT_KEY[img.shot_type];
      if (!slotKey) {
        skipped++;
        continue;
      }
      const targetName = img.subject || 'Project';
      const key = `${domain}:${targetName}`;
      if (!targetGroups.has(key)) targetGroups.set(key, []);
      targetGroups.get(key)!.push(img);
    }

    // Process each target group
    for (const [key, groupImages] of targetGroups.entries()) {
      const [domain, targetName] = key.split(':');
      try {
        const visualSet = await ensureVisualSetForTarget({
          domain,
          targetType: domain === 'character_identity' ? 'character' : 'location',
          targetName,
        });

        for (const img of groupImages) {
          try {
            await wireImageToSlot({
              setId: visualSet.id,
              imageId: img.id,
              shotType: img.shot_type!,
              selectForSlot: true,
            });
            synced++;
          } catch {
            skipped++;
          }
        }
      } catch {
        skipped += groupImages.length;
      }
    }

    invalidate();
    return { synced, skipped };
  }, [projectId, ensureVisualSetForTarget, wireImageToSlot, invalidate]);

  const refetchSets = useCallback(async () => {
    await setsQuery.refetch();
  }, [setsQuery]);

  // ── Approve Single Slot ──
  // Promotes candidate to approved without evaluation gate (for costume/direct approval flows)
  const approveSlot = useCallback(async (slotId: string) => {
    if (!projectId) throw new Error('No project');

    const { data: slot } = await (supabase as any)
      .from('visual_set_slots')
      .select('id, state, selected_image_id, visual_set_id')
      .eq('id', slotId)
      .maybeSingle();

    if (!slot) throw new Error('Slot not found');
    if (slot.state === 'approved' || slot.state === 'locked') return;

    // If no selected_image_id, resolve from latest candidate
    let imageId = slot.selected_image_id;
    if (!imageId) {
      const { data: cands } = await (supabase as any)
        .from('visual_set_candidates')
        .select('image_id')
        .eq('visual_set_slot_id', slotId)
        .order('created_at', { ascending: false })
        .limit(1);
      imageId = cands?.[0]?.image_id || null;
    }

    if (!imageId) throw new Error('No candidate image to approve');

    // ── IDENTITY GATE CHECK: Block approval of non-admitted candidates ──
    const { data: imgRow } = await (supabase as any)
      .from('project_images')
      .select('generation_config')
      .eq('id', imageId)
      .maybeSingle();
    if (!isCandidateAdmitted(imgRow?.generation_config)) {
      const reason = getCandidateRejectionReason(imgRow?.generation_config) || 'identity gate failed';
      console.warn(`[VisualSets] approveSlot BLOCKED — identity gate: ${reason}`);
      throw new Error(`Cannot approve: ${reason}`);
    }

    // Ensure evaluation record exists for lock RPC compatibility
    const { data: parentSet } = await (supabase as any)
      .from('visual_sets')
      .select('current_dna_version_id')
      .eq('id', slot.visual_set_id)
      .maybeSingle();
    await ensureDirectApprovalEvaluation(projectId, imageId, parentSet?.current_dna_version_id || null);

    // Set selected_image_id + state = approved
    await (supabase as any)
      .from('visual_set_slots')
      .update({ state: 'approved', selected_image_id: imageId })
      .eq('id', slotId);
    // Reconcile after approval
    await reconcileVisualSetSlot(slotId);

    // Mark candidate as approved
    await (supabase as any)
      .from('visual_set_candidates')
      .update({ selected_for_slot: true, producer_decision: 'approved' })
      .eq('visual_set_slot_id', slotId)
      .eq('image_id', imageId);

    // Write-back to project_images
    await (supabase as any)
      .from('project_images')
      .update({ curation_state: 'active', is_active: true })
      .eq('id', imageId);

    // Check set readiness after approval
    try {
      const readiness = await resolveReadiness(slot.visual_set_id);
      const newStatus: VisualSetStatus = readiness.ready_to_lock ? 'ready_to_lock' : 'curating';
      await (supabase as any)
        .from('visual_sets')
        .update({ status: newStatus })
        .eq('id', slot.visual_set_id)
        .neq('status', 'locked');
    } catch { /* non-critical */ }

    invalidate();
  }, [projectId, resolveReadiness, invalidate]);

  return {
    sets: setsQuery.data || [],
    isLoading: setsQuery.isLoading,
    fetchSlotsForSet,
    fetchCandidatesForSet,
    resolveReadiness,
    resolveLatestEvaluations: (imageIds: string[]) =>
      projectId ? resolveLatestEvaluations(projectId, imageIds) : Promise.resolve(new Map()),
    createSet: createSetMutation,
    attachCandidate: attachCandidateMutation,
    selectCandidate: selectCandidateMutation,
    approveAllSafe: approveAllSafeMutation,
    approveSlot,
    deselectSlot: deselectSlotMutation,
    lockSet: lockSetMutation,
    replaceUnresolved: replaceUnresolvedSlotsMutation,
    updateSetStatus: updateSetStatusMutation,
    checkAndPropagateStale,
    ensureVisualSetForTarget,
    wireImageToSlot,
    syncImagesToVisualSets,
    invalidate,
    refetchSets,
  };
}

// ── Exported types for regeneration payload ──
export interface UnresolvedSlotPayload {
  visual_set_id: string;
  slot_id: string;
  slot_key: string;
  slot_label: string;
  domain: string;
  target_type: string;
  target_id: string | null;
  target_name: string;
  current_dna_version_id: string | null;
  rejected_image_ids: string[];
}
