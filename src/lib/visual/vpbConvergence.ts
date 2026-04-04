/**
 * vpbConvergence.ts — Governed convergence evaluation for Visual Project Bible.
 *
 * ARCHITECTURE:
 *   Convergence evaluates visual direction quality deterministically.
 *   It does NOT generate content — it assesses assembled VPB truth.
 *   User shepherding decisions influence convergence inputs, never override evaluation.
 *
 * IEL: No silent fallbacks. Blocked VPB cannot show approved status.
 */

// ── VPB Status Model ────────────────────────────────────────────────────────

export type VPBStatus =
  | 'missing'
  | 'assembling'
  | 'assembled_unreviewed'
  | 'converging'
  | 'converged'
  | 'blocked'
  | 'approved_for_visual_pipeline';

export interface VPBStatusReport {
  status: VPBStatus;
  exists: boolean;
  last_assembled_at: string | null;
  sections_present: number;
  sections_total: number;
  blockers: VPBBlocker[];
  convergence_score: number | null;
  source_truth_ready: boolean;
  character_count: number;
  location_count: number;
  asset_count: number;
}

// ── Blocker Model ───────────────────────────────────────────────────────────

export type VPBBlockerClass =
  | 'tone_mismatch'
  | 'style_incoherence'
  | 'motif_inconsistency'
  | 'wardrobe_world_mismatch'
  | 'visual_reference_conflict'
  | 'prestige_downgrade_risk'
  | 'missing_source_truth'
  | 'incomplete_assembly'
  | 'character_visual_gap'
  | 'location_visual_gap';

export interface VPBBlocker {
  blocker_class: VPBBlockerClass;
  severity: 'hard' | 'soft';
  detail: string;
  recommendation: string;
}

// ── Convergence Result ──────────────────────────────────────────────────────

export type ConvergenceVerdict = 'pass' | 'provisional' | 'blocked';

export interface VPBConvergenceResult {
  verdict: ConvergenceVerdict;
  score: number; // 0-100
  blockers: VPBBlocker[];
  dimensions: {
    tonal_coherence: number;
    character_consistency: number;
    wardrobe_consistency: number;
    location_consistency: number;
    motif_recurrence: number;
    style_integrity: number;
  };
  evaluated_at: string;
}

// ── Shepherding Decision Model ──────────────────────────────────────────────

export type ShepherdingDomain =
  | 'world_visual_direction'
  | 'character_visual_direction'
  | 'wardrobe_direction'
  | 'motif_direction'
  | 'reference_direction'
  | 'realism_balance'
  | 'aesthetic_tier';

export interface ShepherdingDecision {
  id: string;
  domain: ShepherdingDomain;
  decision_text: string;
  decided_at: string;
  decided_by: string | null;
  is_active: boolean;
}

export const SHEPHERDING_DOMAIN_LABELS: Record<ShepherdingDomain, string> = {
  world_visual_direction: 'World Visual Direction',
  character_visual_direction: 'Character Visual Direction',
  wardrobe_direction: 'Wardrobe Direction',
  motif_direction: 'Motif Direction',
  reference_direction: 'Reference Direction',
  realism_balance: 'Realism vs. Stylization',
  aesthetic_tier: 'Aesthetic Tier',
};

// ── Convergence Evaluator ───────────────────────────────────────────────────

/**
 * Evaluate VPB convergence from assembled result metadata.
 * This is deterministic — no LLM, no network calls.
 */
export function evaluateVPBConvergence(input: {
  sections_present: number;
  sections_total: number;
  character_count: number;
  location_count: number;
  asset_count: number;
  enrichment_applied: boolean;
  visual_canon_available: boolean;
  shepherding_decisions: ShepherdingDecision[];
}): VPBConvergenceResult {
  const blockers: VPBBlocker[] = [];
  const dims = {
    tonal_coherence: 0,
    character_consistency: 0,
    wardrobe_consistency: 0,
    location_consistency: 0,
    motif_recurrence: 0,
    style_integrity: 0,
  };

  // ── Source truth checks ──
  if (!input.visual_canon_available) {
    blockers.push({
      blocker_class: 'missing_source_truth',
      severity: 'hard',
      detail: 'Visual canon brief not available — tonal and stylistic coherence cannot be evaluated.',
      recommendation: 'Generate visual canon brief before converging VPB.',
    });
  }

  if (input.sections_present < input.sections_total) {
    const missing = input.sections_total - input.sections_present;
    blockers.push({
      blocker_class: 'incomplete_assembly',
      severity: missing > 3 ? 'hard' : 'soft',
      detail: `${missing} of ${input.sections_total} sections missing from assembly.`,
      recommendation: 'Ensure all upstream sources (characters, locations, assets) are available.',
    });
  }

  if (input.character_count === 0) {
    blockers.push({
      blocker_class: 'character_visual_gap',
      severity: 'hard',
      detail: 'No character visual summaries in VPB.',
      recommendation: 'Create character profiles with wardrobe data before assembling.',
    });
  }

  if (input.location_count === 0) {
    blockers.push({
      blocker_class: 'location_visual_gap',
      severity: 'soft',
      detail: 'No location visual summaries in VPB.',
      recommendation: 'Add canon locations to enrich the visual bible.',
    });
  }

  // ── Dimension scoring ──
  const completionRatio = input.sections_total > 0
    ? input.sections_present / input.sections_total
    : 0;

  dims.tonal_coherence = input.visual_canon_available ? 70 : 20;
  dims.character_consistency = input.character_count > 0
    ? Math.min(100, 50 + input.character_count * 10)
    : 0;
  dims.wardrobe_consistency = input.enrichment_applied ? 75 : 30;
  dims.location_consistency = input.location_count > 0
    ? Math.min(100, 40 + input.location_count * 15)
    : 0;
  dims.motif_recurrence = input.visual_canon_available && input.enrichment_applied ? 65 : 25;
  dims.style_integrity = completionRatio * 80;

  // Shepherding decisions boost relevant dimensions
  for (const decision of input.shepherding_decisions.filter(d => d.is_active)) {
    switch (decision.domain) {
      case 'world_visual_direction':
        dims.tonal_coherence = Math.min(100, dims.tonal_coherence + 10);
        break;
      case 'character_visual_direction':
        dims.character_consistency = Math.min(100, dims.character_consistency + 10);
        break;
      case 'wardrobe_direction':
        dims.wardrobe_consistency = Math.min(100, dims.wardrobe_consistency + 10);
        break;
      case 'motif_direction':
        dims.motif_recurrence = Math.min(100, dims.motif_recurrence + 10);
        break;
      case 'aesthetic_tier':
      case 'realism_balance':
        dims.style_integrity = Math.min(100, dims.style_integrity + 10);
        break;
    }
  }

  const score = Math.round(
    (dims.tonal_coherence * 0.2 +
      dims.character_consistency * 0.2 +
      dims.wardrobe_consistency * 0.15 +
      dims.location_consistency * 0.15 +
      dims.motif_recurrence * 0.15 +
      dims.style_integrity * 0.15)
  );

  const hardBlockers = blockers.filter(b => b.severity === 'hard');
  let verdict: ConvergenceVerdict;
  if (hardBlockers.length > 0) {
    verdict = 'blocked';
  } else if (score >= 65 && blockers.length === 0) {
    verdict = 'pass';
  } else {
    verdict = 'provisional';
  }

  return {
    verdict,
    score,
    blockers,
    dimensions: dims,
    evaluated_at: new Date().toISOString(),
  };
}

// ── Status Resolver ─────────────────────────────────────────────────────────

/**
 * Derive VPB status deterministically from persisted data.
 * IEL: blocked VPB cannot return approved status.
 */
export function resolveVPBStatus(input: {
  document_exists: boolean;
  sections_present: number;
  sections_total: number;
  character_count: number;
  location_count: number;
  asset_count: number;
  last_assembled_at: string | null;
  convergence_result: VPBConvergenceResult | null;
  visual_canon_available: boolean;
  enrichment_applied: boolean;
}): VPBStatusReport {
  if (!input.document_exists) {
    return {
      status: 'missing',
      exists: false,
      last_assembled_at: null,
      sections_present: 0,
      sections_total: input.sections_total,
      blockers: [],
      convergence_score: null,
      source_truth_ready: false,
      character_count: 0,
      location_count: 0,
      asset_count: 0,
    };
  }

  const blockers: VPBBlocker[] = input.convergence_result?.blockers ?? [];
  const hardBlockers = blockers.filter(b => b.severity === 'hard');

  let status: VPBStatus;
  if (hardBlockers.length > 0) {
    status = 'blocked';
  } else if (input.convergence_result?.verdict === 'pass') {
    status = 'approved_for_visual_pipeline';
  } else if (input.convergence_result) {
    status = 'converged';
  } else {
    status = 'assembled_unreviewed';
  }

  return {
    status,
    exists: true,
    last_assembled_at: input.last_assembled_at,
    sections_present: input.sections_present,
    sections_total: input.sections_total,
    blockers,
    convergence_score: input.convergence_result?.score ?? null,
    source_truth_ready: input.visual_canon_available,
    character_count: input.character_count,
    location_count: input.location_count,
    asset_count: input.asset_count,
  };
}
