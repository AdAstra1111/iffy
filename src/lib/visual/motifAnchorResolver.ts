/**
 * motifAnchorResolver.ts — Canonical cross-session motif primary anchor resolution.
 *
 * Resolves the motif_primary family fingerprint from persisted data (project_images),
 * not in-memory refs. Works across sessions, reloads, reruns, and partial regenerations.
 *
 * Resolution order:
 * 1. In-memory anchor (if provided — hot path during active build)
 * 2. Persisted fingerprint from generation_config.motif_validation of the selected motif_primary
 * 3. Derived from persisted prompt_used of the selected motif_primary
 * 4. Missing — fail closed
 */

import { supabase } from '@/integrations/supabase/client';
import {
  deriveMotifFingerprint,
  type MotifFamilyFingerprint,
} from './motifValidation';

export type AnchorSource =
  | 'memory'
  | 'persisted_fingerprint'
  | 'derived_from_persisted_metadata'
  | 'missing';

/**
 * Anchor confidence determines how much trust downstream selection should place
 * in this anchor for family-dependent approval.
 *
 * - validated: persisted fingerprint with passing validation — full trust
 * - unvalidated: persisted fingerprint exists but validation status unknown or failed — reference only
 * - derived: fingerprint was heuristically derived from prompt text — reference only, not approval-grade
 * - none: no anchor available
 */
export type AnchorConfidence = 'validated' | 'unvalidated' | 'derived' | 'none';

export interface MotifAnchorResolution {
  fingerprint: MotifFamilyFingerprint | null;
  valid: boolean;
  /** Whether this anchor is trustworthy enough for family-dependent approval */
  approvalGrade: boolean;
  confidence: AnchorConfidence;
  source: AnchorSource;
  primaryImageId: string | null;
  /** The persisted anchor object noun phrase (e.g. "ceramic bowl") */
  anchorObjectNoun: string | null;
}

/**
 * Resolve the motif primary anchor for a visual set from persisted data.
 *
 * @param setId - The visual_set_id for the motif family
 * @param memoryAnchor - Optional in-memory anchor from active build (takes priority)
 * @param memoryValid - Whether the in-memory anchor is considered valid
 */
export async function resolveMotifPrimaryAnchor(
  setId: string,
  memoryAnchor?: MotifFamilyFingerprint | null,
  memoryValid?: boolean,
  memoryObjectNoun?: string | null,
): Promise<MotifAnchorResolution> {
  // 1. In-memory hot path
  if (memoryAnchor) {
    return {
      fingerprint: memoryAnchor,
      valid: memoryValid ?? true,
      approvalGrade: memoryValid ?? true,
      confidence: (memoryValid ?? true) ? 'validated' : 'unvalidated',
      source: 'memory',
      primaryImageId: null,
      anchorObjectNoun: memoryObjectNoun ?? null,
    };
  }

  // 2. Query persisted primary slot
  try {
    const { data: primarySlot } = await (supabase as any)
      .from('visual_set_slots')
      .select('selected_image_id, state')
      .eq('visual_set_id', setId)
      .eq('slot_key', 'motif_primary')
      .maybeSingle();

    if (!primarySlot?.selected_image_id) {
      return { fingerprint: null, valid: false, approvalGrade: false, confidence: 'none', source: 'missing', primaryImageId: null, anchorObjectNoun: null };
    }

    // 3. Load image and check for persisted fingerprint
    const { data: img } = await (supabase as any)
      .from('project_images')
      .select('id, generation_config, prompt_used')
      .eq('id', primarySlot.selected_image_id)
      .maybeSingle();

    if (!img) {
      return { fingerprint: null, valid: false, approvalGrade: false, confidence: 'none', source: 'missing', primaryImageId: primarySlot.selected_image_id, anchorObjectNoun: null };
    }

    // Try persisted fingerprint first
    const mv = img.generation_config?.motif_validation;
    if (mv?.fingerprint && typeof mv.fingerprint === 'object') {
      const fp = mv.fingerprint as MotifFamilyFingerprint;
      const isValid = mv.passed !== false && mv.selection_status !== 'rejected_hard_fail';
      // Approval-grade only if validation explicitly passed AND selected
      const isApprovalGrade = mv.passed === true && mv.selection_status === 'selected_valid';
      return {
        fingerprint: fp,
        valid: isValid,
        approvalGrade: isApprovalGrade,
        confidence: isApprovalGrade ? 'validated' : 'unvalidated',
        source: 'persisted_fingerprint',
        primaryImageId: img.id,
        anchorObjectNoun: mv.anchor_object_noun || null,
      };
    }

    // Derive from prompt — NOT approval-grade
    if (img.prompt_used) {
      const fp = deriveMotifFingerprint(img.prompt_used);
      return {
        fingerprint: fp,
        valid: false, // derived anchors are reference-only, not approval truth
        approvalGrade: false,
        confidence: 'derived',
        source: 'derived_from_persisted_metadata',
        primaryImageId: img.id,
        anchorObjectNoun: null,
      };
    }

    return { fingerprint: null, valid: false, approvalGrade: false, confidence: 'none', source: 'missing', primaryImageId: img.id, anchorObjectNoun: null };
  } catch (err) {
    console.error('[motif-anchor-resolver] Failed to resolve:', err);
    return { fingerprint: null, valid: false, approvalGrade: false, confidence: 'none', source: 'missing', primaryImageId: null, anchorObjectNoun: null };
  }
}

/**
 * Extract motif diagnostics from a project_images.generation_config payload.
 * Returns null if no motif_validation present.
 */
export function extractMotifDiagnostics(generationConfig: Record<string, any> | null | undefined): MotifDiagnosticsPayload | null {
  if (!generationConfig?.motif_validation) return null;
  const mv = generationConfig.motif_validation;
  return {
    slot_key: mv.slot_key || null,
    fingerprint: mv.fingerprint || null,
    fingerprint_key: mv.fingerprint_key || null,
    scores: mv.scores || null,
    hard_fail_codes: mv.hard_fail_codes || [],
    advisory_codes: mv.advisory_codes || [],
    slot_expectation_met: mv.slot_expectation_met ?? true,
    slot_expectation_failures: mv.slot_expectation_failures || [],
    overall_score: mv.overall_score ?? null,
    passed: mv.passed ?? null,
    lineage_status: mv.lineage_status || null,
    selection_status: mv.selection_status || null,
    family_anchor_ref: mv.family_anchor_ref || null,
    scoring_model: mv.scoring_model || null,
    validation_version: mv.validation_version || null,
    anchor_object_noun: mv.anchor_object_noun || null,
  };
}

export interface MotifDiagnosticsPayload {
  slot_key: string | null;
  fingerprint: MotifFamilyFingerprint | null;
  fingerprint_key: string | null;
  scores: {
    physical_plausibility: number;
    material_legibility: number;
    use_trace: number;
    world_embeddedness: number;
    motif_lineage: number;
  } | null;
  hard_fail_codes: string[];
  advisory_codes: string[];
  slot_expectation_met: boolean;
  slot_expectation_failures: string[];
  overall_score: number | null;
  passed: boolean | null;
  lineage_status: string | null;
  selection_status: string | null;
  family_anchor_ref: string | null;
  scoring_model: string | null;
  validation_version: string | null;
  anchor_object_noun: string | null;
}

/**
 * Human-readable motif selection status label.
 */
export function motifSelectionLabel(status: string | null): string {
  const labels: Record<string, string> = {
    selected_valid: 'Selected — valid',
    passed_not_selected: 'Stored — not selected',
    rejected_hard_fail: 'Stored — rejected (hard fail)',
    rejected_low_physical_plausibility: 'Stored — rejected (low plausibility)',
    rejected_slot_expectation: 'Stored — rejected (slot expectation)',
    rejected_lineage_mismatch: 'Stored — rejected (lineage mismatch)',
    blocked_missing_primary_anchor: 'Blocked — missing primary anchor',
    blocked_invalid_primary_anchor: 'Blocked — invalid primary anchor',
  };
  return labels[status || ''] || status || 'Unknown';
}

/**
 * Human-readable motif lineage status label.
 */
export function motifLineageLabel(status: string | null): string {
  const labels: Record<string, string> = {
    anchor: 'Primary Anchor',
    match: 'Lineage Match',
    mismatch: 'Lineage Mismatch',
    blocked_missing_primary: 'Blocked — missing primary',
    blocked_invalid_primary: 'Blocked — invalid primary',
    not_applicable: 'N/A',
  };
  return labels[status || ''] || status || 'Unknown';
}
