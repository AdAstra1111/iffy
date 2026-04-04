/**
 * useHeroFrameAutoCuration — Deterministic auto-selection for Hero Frames.
 *
 * DELEGATES SCORING to the canonical sectionScoringEngine.
 * ENFORCES IDENTITY via heroFrameIdentityFilter — drift images are excluded
 * from scoring, approval, and convergence.
 *
 * This hook adds:
 *   - Identity cluster enforcement (drift exclusion)
 *   - Coverage-aware final set selection (cinematic variety)
 *   - Best-set target logic with shortfall diagnostics
 *   - DB mutation persistence (approve/demote/set primary)
 *
 * Architecture:
 *   identityFilter → scoreSection('hero_frames') → coverage-aware selection → DB mutations
 *   No duplicate scoring logic lives here.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { scoreSection, type ImageInput, type ScoredImage } from '@/lib/images/sectionScoringEngine';
import { filterHeroFramesByIdentity, type IdentityFilterResult } from '@/lib/images/heroFrameIdentityFilter';
import { filterEligibleImages } from '@/lib/images/characterImageEligibility';
import { filterPremiumActiveImages, isPrimaryEligibleImage } from '@/lib/images/premiumQualityGate';

// ── Constants ──────────────────────────────────────────────────────
const FINAL_SET_SIZE = 13;
const MAX_CAP = 15;

// Coverage categories for cinematic hero frames — now includes narrative functions
type CoverageCategory =
  | 'close_up'
  | 'medium'
  | 'wide_establishing'
  | 'group_interaction'
  | 'emotional_beat'
  | 'tension_action'
  | 'world_setup'
  | 'protagonist_intro'
  | 'inciting_disruption'
  | 'key_relationship'
  | 'reversal_midpoint'
  | 'collapse_loss'
  | 'confrontation'
  | 'climax_transformation'
  | 'aftermath_iconic'
  | 'uncategorized';

const COVERAGE_LABELS: Record<CoverageCategory, string> = {
  close_up: 'Close-Up',
  medium: 'Medium Shot',
  wide_establishing: 'Wide / Establishing',
  group_interaction: 'Group Interaction',
  emotional_beat: 'Emotional Beat',
  tension_action: 'Tension / Action',
  world_setup: 'World Setup',
  protagonist_intro: 'Protagonist Intro',
  inciting_disruption: 'Inciting Disruption',
  key_relationship: 'Key Relationship',
  reversal_midpoint: 'Reversal / Midpoint',
  collapse_loss: 'Collapse / Loss',
  confrontation: 'Confrontation',
  climax_transformation: 'Climax / Transformation',
  aftermath_iconic: 'Aftermath / Iconic',
  uncategorized: 'Cinematic Still',
};

// Narrative functions that count as coverage diversity
const NARRATIVE_FUNCTION_CATEGORIES = new Set<string>([
  'world_setup', 'protagonist_intro', 'inciting_disruption', 'key_relationship',
  'escalation_pressure', 'reversal_midpoint', 'collapse_loss', 'confrontation',
  'climax_transformation', 'aftermath_iconic',
]);

/** Create an empty coverage summary with all categories initialized to 0 */
function emptyCoverageSummary(): Record<CoverageCategory, number> {
  return {
    close_up: 0, medium: 0, wide_establishing: 0, group_interaction: 0,
    emotional_beat: 0, tension_action: 0,
    world_setup: 0, protagonist_intro: 0, inciting_disruption: 0, key_relationship: 0,
    reversal_midpoint: 0, collapse_loss: 0, confrontation: 0,
    climax_transformation: 0, aftermath_iconic: 0,
    uncategorized: 0,
  };
}

// ── Coverage Classification ────────────────────────────────────────

function classifyCoverage(img: ImageInput): CoverageCategory {
  // 0. Check narrative_function from generation_config (highest priority — from narrative coverage engine)
  const gc = img.generation_config || {};
  const narrativeFn = ((gc as any).narrative_function || '').toString().toLowerCase();
  if (narrativeFn && NARRATIVE_FUNCTION_CATEGORIES.has(narrativeFn)) {
    // Map escalation_pressure → tension_action for coverage dedup
    if (narrativeFn === 'escalation_pressure') return 'tension_action';
    return narrativeFn as CoverageCategory;
  }

  // 1. Explicit shot_type
  const st = (img.shot_type || '').toLowerCase();
  if (st.includes('close')) return 'close_up';
  if (st.includes('medium')) return 'medium';
  if (st.includes('wide') || st.includes('establishing') || st.includes('tableau')) return 'wide_establishing';

  // 2. generation_config shot type
  const configShotType = ((gc as any).shot_type || (gc as any).shotType || '').toString().toLowerCase();
  if (configShotType.includes('close')) return 'close_up';
  if (configShotType.includes('medium')) return 'medium';
  if (configShotType.includes('wide') || configShotType.includes('establishing')) return 'wide_establishing';
  if (configShotType.includes('group') || configShotType.includes('interaction')) return 'group_interaction';
  if (configShotType.includes('emotion') || configShotType.includes('intimate')) return 'emotional_beat';
  if (configShotType.includes('tension') || configShotType.includes('action') || configShotType.includes('conflict')) return 'tension_action';

  // 3. Prompt heuristics (weak signal)
  const prompt = (img.prompt_used || ((gc as any).prompt) || '').toString().toLowerCase();
  if (prompt.includes('close-up') || prompt.includes('closeup') || prompt.includes('face') || prompt.includes('portrait')) return 'close_up';
  if (prompt.includes('medium shot') || prompt.includes('waist')) return 'medium';
  if (prompt.includes('wide shot') || prompt.includes('establishing') || prompt.includes('landscape') || prompt.includes('aerial') || prompt.includes('panoramic')) return 'wide_establishing';
  if (prompt.includes('group') || prompt.includes('together') || prompt.includes('interaction') || prompt.includes('crowd')) return 'group_interaction';
  if (prompt.includes('emotion') || prompt.includes('intimate') || prompt.includes('tender') || prompt.includes('tears') || prompt.includes('joy')) return 'emotional_beat';
  if (prompt.includes('tension') || prompt.includes('action') || prompt.includes('chase') || prompt.includes('conflict') || prompt.includes('fight') || prompt.includes('confrontation')) return 'tension_action';

  return 'uncategorized';
}

// ── Coverage-Aware Final Set Selection ─────────────────────────────

interface ScoredWithCoverage {
  scored: ScoredImage;
  img: ImageInput;
  coverageCategory: CoverageCategory;
}

/**
 * Select final set with coverage-aware ranking.
 * Uses canonical scores from sectionScoringEngine, adds coverage diversity.
 */
function selectFinalSet(
  scored: ScoredImage[],
  images: ImageInput[],
  targetSize: number,
): { selected: ScoredWithCoverage[]; overflow: ScoredWithCoverage[] } {
  const imgMap = new Map(images.map(i => [i.id, i]));
  const all: ScoredWithCoverage[] = scored.map(s => ({
    scored: s,
    img: imgMap.get(s.id)!,
    coverageCategory: classifyCoverage(imgMap.get(s.id)!),
  }));

  if (all.length <= targetSize) {
    return { selected: all, overflow: [] };
  }

  const selected: ScoredWithCoverage[] = [];
  const usedIds = new Set<string>();

  // Phase 1: Pick best from each coverage category (now includes narrative functions)
  const categories: CoverageCategory[] = [
    'close_up', 'medium', 'wide_establishing', 'group_interaction', 'emotional_beat', 'tension_action',
    'world_setup', 'protagonist_intro', 'inciting_disruption', 'key_relationship',
    'reversal_midpoint', 'collapse_loss', 'confrontation', 'climax_transformation', 'aftermath_iconic',
  ];
  for (const cat of categories) {
    const best = all.find(c => c.coverageCategory === cat && !usedIds.has(c.scored.id));
    if (best) {
      selected.push(best);
      usedIds.add(best.scored.id);
    }
  }

  // Phase 2: Fill remaining slots by canonical score
  const slotsLeft = targetSize - selected.length;
  const remaining = all.filter(c => !usedIds.has(c.scored.id));
  for (let i = 0; i < Math.min(slotsLeft, remaining.length); i++) {
    selected.push(remaining[i]);
    usedIds.add(remaining[i].scored.id);
  }

  const overflow = all.filter(c => !usedIds.has(c.scored.id));
  return { selected, overflow };
}

// ── Types ──────────────────────────────────────────────────────────

export interface AutoCurationResult {
  selectedIds: string[];
  overflowIds: string[];
  primaryId: string;
  selectedCount: number;
  overflowCount: number;
  coverageSummary: Record<CoverageCategory, number>;
  /** Canonical scored output from sectionScoringEngine */
  scored: ScoredImage[];
}

export interface BestSetResult {
  approvedTarget: number;
  approvedCurrent: number;
  recommendedApprovedIds: string[];
  recommendedPrimaryId: string | null;
  recommendedDemoteIds: string[];
  recommendedArchiveIds: string[];
  recommendedRejectIds: string[];
  shortfallCount: number;
  coverageSummary: Record<CoverageCategory, number>;
  diagnosticWarnings: string[];
  /** Full canonical scored output */
  scored: ScoredImage[];
  /** Identity filter results — drift images excluded from scoring */
  identityFilter: IdentityFilterResult | null;
  /** Whether a locked canonical primary exists (may be outside governed pool) */
  hasLockedPrimary: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────

export function useHeroFrameAutoCuration(projectId: string | undefined) {
  const qc = useQueryClient();
  const [curating, setCurating] = useState(false);
  const [lastResult, setLastResult] = useState<AutoCurationResult | null>(null);
  const [enforcingPrimary, setEnforcingPrimary] = useState(false);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['hero-frame-images', projectId] });
    qc.invalidateQueries({ queryKey: ['pipeline-hero-frames-state', projectId] });
    qc.invalidateQueries({ queryKey: ['hero-frame-best-set', projectId] });
  }, [qc, projectId]);

  /** Fetch hero frame images as ImageInput for the canonical engine */
  const fetchHeroCandidates = useCallback(async (): Promise<ImageInput[]> => {
    if (!projectId) return [];
    const { data, error } = await (supabase as any)
      .from('project_images')
      .select('id, width, height, is_primary, curation_state, created_at, generation_config, prompt_used, shot_type, generation_purpose, strategy_key, asset_group, subject, subject_type, lane_compliance_score, prestige_style, storage_path')
      .eq('project_id', projectId)
      .eq('asset_group', 'hero_frame')
      .eq('generation_purpose', 'hero_frame')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as ImageInput[];
  }, [projectId]);

  /**
   * Compute best-set recommendation (dry run — no DB mutations).
   * Returns recommended approved pool, primary, demotions, and shortfall diagnostics.
   */
  const computeBestSet = useCallback(async (): Promise<BestSetResult | null> => {
    if (!projectId) return null;
    const allImages = await fetchHeroCandidates();
    if (allImages.length === 0) return null;

    // ── CANONICAL IDENTITY GATE (fail-closed) ──
    const { eligible: gatePassImages, drift: gateDriftImages, blocked: gateBlockedImages } = filterEligibleImages(allImages, 'hero_frames');
    // Then apply hero-frame-specific identity filter on gate-pass images only
    const identityResult = filterHeroFramesByIdentity(gatePassImages);
    // Only score valid + unverified images (drift is excluded)
    const postIdentity = [...identityResult.valid, ...identityResult.unverified];
    // ── PREMIUM ACTIVE QUALITY GATE ──
    const { admitted: images, excluded: premiumExcluded } = filterPremiumActiveImages(postIdentity, 'hero_frames');
    // Merge drift from both layers for diagnostics
    const totalDriftCount = gateDriftImages.length + gateBlockedImages.length + identityResult.drift.length;

    // Check if an existing primary exists in the raw pool (before gates)
    const existingPrimary = allImages.find(i => i.is_primary && (i as any).role === 'hero_primary');

    if (images.length === 0) {
      const warningCopy = existingPrimary
        ? `All ${allImages.length} images (excluding locked primary) blocked by identity/quality gates — no additional candidates available for curation`
        : `All ${allImages.length} images flagged as identity drift or below premium quality — no valid candidates`;
      return {
        approvedTarget: FINAL_SET_SIZE,
        approvedCurrent: 0,
        recommendedApprovedIds: [],
        recommendedPrimaryId: null,
        recommendedDemoteIds: [],
        recommendedArchiveIds: [],
        recommendedRejectIds: [],
        shortfallCount: FINAL_SET_SIZE,
        coverageSummary: emptyCoverageSummary(),
        diagnosticWarnings: [warningCopy],
        scored: [],
        identityFilter: identityResult,
        hasLockedPrimary: !!existingPrimary,
      };
    }

    // Delegate scoring to canonical engine (drift-free set only)
    const result = scoreSection(images, 'hero_frames', { maxAlternates: FINAL_SET_SIZE - 1 });
    const { selected, overflow } = selectFinalSet(result.scored, images, FINAL_SET_SIZE);

    const approvedCurrent = images.filter(i => i.curation_state === 'active').length;
    const recommendedApprovedIds = selected.map(s => s.scored.id);

    // Demotions: currently approved but not in recommended set
    const recommendedDemoteIds = images
      .filter(i => i.curation_state === 'active' && !recommendedApprovedIds.includes(i.id) && !i.is_primary)
      .map(i => i.id);

    // Archive/reject from canonical engine
    const recommendedArchiveIds = result.archiveCandidates.map(s => s.id);
    const recommendedRejectIds = result.rejectCandidates.map(s => s.id);

    // Primary recommendation
    const recommendedPrimaryId = selected.length > 0
      ? selected.sort((a, b) => b.scored.totalScore - a.scored.totalScore)[0].scored.id
      : null;

    // Coverage summary
    const coverageSummary: Record<CoverageCategory, number> = emptyCoverageSummary();
    for (const s of selected) coverageSummary[s.coverageCategory]++;

    // Shortfall: how many more strong images needed to hit target
    const qualityThreshold = 30;
    const strongCount = selected.filter(s => s.scored.totalScore >= qualityThreshold).length;
    const shortfallCount = Math.max(0, FINAL_SET_SIZE - strongCount);

    const diagnosticWarnings: string[] = [...result.diagnostics.warnings];
    if (shortfallCount > 0) {
      diagnosticWarnings.push(`${shortfallCount} more high-quality hero frames needed to reach target of ${FINAL_SET_SIZE}`);
    }
    if (recommendedDemoteIds.length > 0) {
      diagnosticWarnings.push(`${recommendedDemoteIds.length} currently approved images are weaker than available challengers`);
    }
    if (totalDriftCount > 0) {
      diagnosticWarnings.push(`${totalDriftCount} image${totalDriftCount > 1 ? 's' : ''} excluded as identity drift`);
    }
    if (premiumExcluded.length > 0) {
      diagnosticWarnings.push(`${premiumExcluded.length} image${premiumExcluded.length > 1 ? 's' : ''} excluded — below premium quality floor`);
    }

    return {
      approvedTarget: FINAL_SET_SIZE,
      approvedCurrent,
      recommendedApprovedIds,
      recommendedPrimaryId,
      recommendedDemoteIds,
      recommendedArchiveIds,
      recommendedRejectIds,
      shortfallCount,
      coverageSummary,
      diagnosticWarnings,
      scored: result.scored,
      identityFilter: identityResult,
      hasLockedPrimary: !!existingPrimary,
    };
  }, [projectId, fetchHeroCandidates]);

  /**
   * Run auto-curation: score via canonical engine, select, persist.
   * Deterministic and repeatable.
   */
  const runAutoCuration = useCallback(async () => {
    if (!projectId || curating) return null;
    setCurating(true);

    try {
      const allImages = await fetchHeroCandidates();
      if (allImages.length === 0) {
        toast.info('No hero frame candidates to curate');
        return null;
      }

      // ── CANONICAL IDENTITY GATE (fail-closed) ──
      const { eligible: gatePassImages, drift: gateDriftImages, blocked: gateBlockedImages } = filterEligibleImages(allImages, 'hero_frames');
      const identityResult = filterHeroFramesByIdentity(gatePassImages);
      const postIdentity = [...identityResult.valid, ...identityResult.unverified];
      // ── PREMIUM ACTIVE QUALITY GATE ──
      const { admitted: images, excluded: premiumExcludedRun } = filterPremiumActiveImages(postIdentity, 'hero_frames');

      if (images.length === 0) {
        const hasExistingPrimary = allImages.some(i => i.is_primary && (i as any).role === 'hero_primary');
        if (hasExistingPrimary) {
          toast.warning(`Canonical primary exists but no additional images pass identity/quality gates — generate more frames to expand the set`);
        } else {
          toast.error(`All ${allImages.length} images blocked by identity/quality gates — cannot curate`);
        }
        return null;
      }

      const totalDrift = gateDriftImages.length + gateBlockedImages.length + identityResult.drift.length;
      const totalExcluded = totalDrift + premiumExcludedRun.length;
      if (totalExcluded > 0) {
        toast.info(`${totalExcluded} image${totalExcluded > 1 ? 's' : ''} excluded (${totalDrift} drift, ${premiumExcludedRun.length} quality)`);
      }

      // 1. Score via canonical engine (drift-free set)
      const result = scoreSection(images, 'hero_frames', { maxAlternates: FINAL_SET_SIZE - 1 });

      // 2. Select final set with coverage awareness
      const { selected, overflow } = selectFinalSet(result.scored, images, FINAL_SET_SIZE);

      // 3. Determine primary (highest canonical score in selected, must pass primary gate)
      const sortedSelected = [...selected].sort((a, b) => b.scored.totalScore - a.scored.totalScore);
      const imgMap = new Map(images.map(i => [i.id, i]));
      const primaryCandidate = sortedSelected.find(s => {
        const img = imgMap.get(s.scored.id);
        return img && isPrimaryEligibleImage(img as any, 'hero_frames');
      });

      // FAIL-CLOSED: if no image passes the primary gate, do NOT set any primary.
      // Surface shortfall honestly instead of silently promoting an ineligible image.
      if (!primaryCandidate) {
        console.warn('[PRIMARY_GATE_SHORTFALL] No image in selected set passes primary eligibility — skipping primary assignment');
        toast.warning('No image meets primary quality standards — primary not set');
      }

      // 4. Persist — IEL: mutations by explicit ID set only
      const selectedIds = selected.map(s => s.scored.id);
      const overflowIds = overflow.map(o => o.scored.id);

      // 4a. Set selected as active
      if (selectedIds.length > 0) {
        await (supabase as any)
          .from('project_images')
          .update({ curation_state: 'active' })
          .in('id', selectedIds);
      }

      // 4b. Demote overflow to candidate
      if (overflowIds.length > 0) {
        await (supabase as any)
          .from('project_images')
          .update({ curation_state: 'candidate', is_primary: false, role: 'hero_variant' })
          .in('id', overflowIds);
      }

      // 4c. Set primary — clear old, set new (only if a primary-eligible candidate exists)
      if (primaryCandidate) {
        await (supabase as any)
          .from('project_images')
          .update({ is_primary: false, role: 'hero_variant' })
          .eq('project_id', projectId)
          .eq('asset_group', 'hero_frame')
          .eq('is_primary', true);

        await (supabase as any)
          .from('project_images')
          .update({ is_primary: true, role: 'hero_primary', curation_state: 'active' })
          .eq('id', primaryCandidate.scored.id);
      }

      // 5. Build coverage summary
      const coverageSummary: Record<CoverageCategory, number> = emptyCoverageSummary();
      for (const s of selected) coverageSummary[s.coverageCategory]++;

      // 6. Log
      const resolvedPrimaryId = primaryCandidate?.scored.id || null;
      console.log('[HERO_AUTO_CURATION]', {
        projectId,
        engine: 'sectionScoringEngine',
        totalCandidates: images.length,
        selectedCount: selectedIds.length,
        overflowCount: overflowIds.length,
        primaryId: resolvedPrimaryId,
        primaryScore: primaryCandidate?.scored.totalScore ?? null,
        coverageSummary,
      });

      const curationResult: AutoCurationResult = {
        selectedIds,
        overflowIds,
        primaryId: resolvedPrimaryId || '',
        selectedCount: selectedIds.length,
        overflowCount: overflowIds.length,
        coverageSummary,
        scored: result.scored,
      };

      setLastResult(curationResult);
      invalidate();

      toast.success(`Final set: ${selectedIds.length} locked, ${overflowIds.length} overflow`);
      return curationResult;
    } catch (e: any) {
      toast.error(e.message || 'Auto-curation failed');
      console.error('[HERO_AUTO_CURATION_ERROR]', e);
      return null;
    } finally {
      setCurating(false);
    }
  }, [projectId, curating, invalidate, fetchHeroCandidates]);

  /**
   * enforceRequiredPrimary — Deterministic auto-backfill for missing hero primary.
   *
   * Called when best-set computation detects:
   *   - zero primary in hero_frame pool
   *   - at least one governed active row exists
   *   - a recommended primary ID is available from canonical scoring
   *
   * This prevents the de facto anchor bug where the first visible row
   * masquerades as the canonical primary.
   *
   * IEL: Only primary-eligible, governed images can be assigned.
   * Fail-closed: If no image passes primary gate, no primary is set.
   */
  const enforceRequiredPrimary = useCallback(async (bestSetResult: BestSetResult): Promise<{ enforced: boolean; primaryId: string | null }> => {
    if (!projectId || enforcingPrimary) return { enforced: false, primaryId: null };
    if (!bestSetResult.recommendedPrimaryId) {
      console.warn('[PRIMARY_ENFORCEMENT] No recommended primary — cannot enforce');
      return { enforced: false, primaryId: null };
    }

    // Check if a primary already exists in the DB
    const { data: existingPrimary } = await (supabase as any)
      .from('project_images')
      .select('id')
      .eq('project_id', projectId)
      .eq('asset_group', 'hero_frame')
      .eq('is_primary', true)
      .eq('is_active', true)
      .limit(1);

    if (existingPrimary && existingPrimary.length > 0) {
      // Primary already exists — no enforcement needed
      return { enforced: false, primaryId: existingPrimary[0].id };
    }

    // No primary exists + governed active pool has a recommended candidate → enforce
    setEnforcingPrimary(true);
    try {
      const targetId = bestSetResult.recommendedPrimaryId;

      // Clear any stale primary flags (defensive)
      await (supabase as any)
        .from('project_images')
        .update({ is_primary: false, role: 'hero_variant' })
        .eq('project_id', projectId)
        .eq('asset_group', 'hero_frame')
        .eq('is_primary', true);

      // Set the canonical primary
      await (supabase as any)
        .from('project_images')
        .update({ is_primary: true, role: 'hero_primary', curation_state: 'active' })
        .eq('id', targetId);

      console.log('[PRIMARY_ENFORCEMENT] Auto-backfilled hero primary', {
        projectId,
        primaryId: targetId,
        score: bestSetResult.scored.find(s => s.id === targetId)?.totalScore ?? null,
        reason: 'zero_primary_with_governed_active_pool',
      });

      invalidate();
      toast.success('Hero primary auto-assigned from best-set analysis');
      return { enforced: true, primaryId: targetId };
    } catch (e: any) {
      console.error('[PRIMARY_ENFORCEMENT_ERROR]', e);
      toast.error('Failed to auto-assign hero primary');
      return { enforced: false, primaryId: null };
    } finally {
      setEnforcingPrimary(false);
    }
  }, [projectId, enforcingPrimary, invalidate]);

  /**
   * enforceHeroPrimaryAtGenerationCompletion — Canonical post-generation enforcement.
   *
   * Call this after hero-frame generation completes successfully.
   * Chains: computeBestSet → enforceRequiredPrimary in a single deterministic pass.
   *
   * This is the CANONICAL enforcement point. The panel-level useEffect is a fallback only.
   * No UI dependency required — can be called from any generation completion handler.
   *
   * IEL: Reuses existing canonical scoring, identity, and premium gates.
   * No duplicate ranking logic.
   */
  const enforceHeroPrimaryAtGenerationCompletion = useCallback(async (): Promise<{
    enforced: boolean;
    primaryId: string | null;
    reason: string;
    activeCount: number;
    candidateCount: number;
    recommendedPrimaryId: string | null;
  }> => {
    if (!projectId) {
      return { enforced: false, primaryId: null, reason: 'no_project_id', activeCount: 0, candidateCount: 0, recommendedPrimaryId: null };
    }

    // 1. Check if primary already exists (idempotent)
    const { data: existingPrimary } = await (supabase as any)
      .from('project_images')
      .select('id')
      .eq('project_id', projectId)
      .eq('asset_group', 'hero_frame')
      .eq('is_primary', true)
      .eq('is_active', true)
      .limit(1);

    if (existingPrimary && existingPrimary.length > 0) {
      const result = {
        enforced: false,
        primaryId: existingPrimary[0].id,
        reason: 'primary_already_exists',
        activeCount: 0,
        candidateCount: 0,
        recommendedPrimaryId: null,
      };
      console.log('[PRIMARY_ENFORCEMENT_GENERATION]', { projectId, ...result });
      return result;
    }

    // 2. Compute best-set using canonical scoring engine
    const bestSet = await computeBestSet();

    if (!bestSet) {
      const result = {
        enforced: false,
        primaryId: null,
        reason: 'no_governed_active_pool',
        activeCount: 0,
        candidateCount: 0,
        recommendedPrimaryId: null,
      };
      console.log('[PRIMARY_ENFORCEMENT_GENERATION]', { projectId, ...result });
      return result;
    }

    const activeCount = bestSet.approvedCurrent;
    const candidateCount = bestSet.scored.length;
    const recommendedPrimaryId = bestSet.recommendedPrimaryId;

    if (!recommendedPrimaryId) {
      const result = {
        enforced: false,
        primaryId: null,
        reason: activeCount > 0 ? 'no_primary_eligible_candidate' : 'no_governed_active_pool',
        activeCount,
        candidateCount,
        recommendedPrimaryId: null,
      };
      console.warn('[PRIMARY_ENFORCEMENT_GENERATION] Fail-closed — no primary-eligible candidate', { projectId, ...result });
      return result;
    }

    // 3. Enforce via canonical enforceRequiredPrimary
    const enforcement = await enforceRequiredPrimary(bestSet);

    const result = {
      enforced: enforcement.enforced,
      primaryId: enforcement.primaryId,
      reason: enforcement.enforced ? 'generation_completion_auto_backfill' : 'no_recommended_primary',
      activeCount,
      candidateCount,
      recommendedPrimaryId,
    };

    console.log('[PRIMARY_ENFORCEMENT_GENERATION]', { projectId, ...result });
    return result;
  }, [projectId, computeBestSet, enforceRequiredPrimary]);

  return {
    runAutoCuration,
    computeBestSet,
    enforceRequiredPrimary,
    enforceHeroPrimaryAtGenerationCompletion,
    curating,
    enforcingPrimary,
    lastResult,
    FINAL_SET_SIZE,
    MAX_CAP,
    COVERAGE_LABELS,
  };
}

export type { CoverageCategory };
