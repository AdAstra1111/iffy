/**
 * useSectionConvergence — Bulk curation actions for lookbook section candidate pools.
 * Operates on canonical project_images fields: curation_state, is_active, is_primary.
 * No hard deletes. Archive/reject only.
 *
 * IEL: All bulk mutations pre-query target IDs and operate on explicit ID sets only.
 * Uses buildCanonicalSectionFilter from the single canonical registry.
 * Auto-prune uses the canonical sectionScoringEngine for deterministic ranking.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CanonicalSectionKey } from '@/hooks/useLookbookSections';
import { buildCanonicalSectionFilter } from '@/lib/lookbook/pipeline/lookbookSlotRegistry';
import { scoreSection, type ImageInput, type SectionScoringResult } from '@/lib/images/sectionScoringEngine';
import { filterEligibleImages } from '@/lib/images/characterImageEligibility';
import { filterPremiumActiveImages } from '@/lib/images/premiumQualityGate';

/**
 * Applies canonical section filters to a Supabase query builder.
 * Mirrors exactly the filter logic in useLookbookSectionContent.
 */
function applySectionFilters(q: any, filter: ReturnType<typeof buildCanonicalSectionFilter>) {
  if (filter.strategyKeys.length > 0) {
    q = q.in('strategy_key', filter.strategyKeys);
  }
  if (filter.assetGroups.length > 0) {
    if (filter.strategyKeys.length > 0) {
      q = q.in('asset_group', filter.assetGroups);
    } else if (filter.fallbackRoles?.length) {
      q = q.or(
        `asset_group.in.(${filter.assetGroups.join(',')}),role.in.(${filter.fallbackRoles.join(',')})`
      );
    } else {
      q = q.in('asset_group', filter.assetGroups);
    }
  } else if (filter.fallbackRoles?.length) {
    q = q.in('role', filter.fallbackRoles);
  }
  if (filter.shotTypes?.length) {
    q = q.in('shot_type', filter.shotTypes);
  }
  // ── LOOKBOOK CANONICAL VISIBILITY BOUNDARY ──
  if (filter.allowedGenerationPurposes?.length) {
    q = q.in('generation_purpose', filter.allowedGenerationPurposes);
  }
  return q;
}

/**
 * IEL Guard: Pre-query IDs that match section + additional constraints.
 * Returns the array of IDs that will be affected.
 */
async function prefetchTargetIds(
  projectId: string,
  filter: ReturnType<typeof buildCanonicalSectionFilter>,
  extraFilters: (q: any) => any,
): Promise<string[]> {
  let q = (supabase as any)
    .from('project_images')
    .select('id')
    .eq('project_id', projectId);

  q = applySectionFilters(q, filter);
  q = extraFilters(q);

  const { data, error } = await q;
  if (error) throw error;
  const ids = (data || []).map((r: any) => r.id);

  console.log('[SECTION PREFETCH]', {
    projectId,
    strategyKeys: filter.strategyKeys,
    assetGroups: filter.assetGroups,
    shotTypes: filter.shotTypes,
    allowedGenerationPurposes: filter.allowedGenerationPurposes,
    idCount: ids.length,
  });

  // IEL large-set guard
  if (ids.length > 500) {
    console.warn('[IEL WARNING] Large mutation set — review scope', { idCount: ids.length });
  }

  return ids;
}

/**
 * Fetch full scoring data for a section's active/candidate images.
 */
async function fetchSectionImages(
  projectId: string,
  filter: ReturnType<typeof buildCanonicalSectionFilter>,
): Promise<ImageInput[]> {
  let q = (supabase as any)
    .from('project_images')
    .select('id, width, height, is_primary, curation_state, created_at, shot_type, generation_purpose, strategy_key, asset_group, subject, subject_type, lane_compliance_score, generation_config, prompt_used, prestige_style')
    .eq('project_id', projectId)
    .in('curation_state', ['active', 'candidate']);

  q = applySectionFilters(q, filter);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ImageInput[];
}

export function useSectionConvergence(projectId: string | undefined) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['lookbook-section-content', projectId] });
    qc.invalidateQueries({ queryKey: ['project-images', projectId] });
    qc.invalidateQueries({ queryKey: ['section-images', projectId] });
  }, [qc, projectId]);

  /**
   * Keep Primary Only — archive all non-primary active/candidate images in a section.
   */
  const keepPrimaryOnly = useCallback(async (sectionKey: CanonicalSectionKey) => {
    if (!projectId || busy) return 0;
    setBusy(true);
    try {
      const filter = buildCanonicalSectionFilter(sectionKey);

      const ids = await prefetchTargetIds(projectId, filter, (q) =>
        q.eq('is_primary', false).in('curation_state', ['active', 'candidate'])
      );

      console.log('[CONVERGENCE]', {
        sectionKey, action: 'keepPrimaryOnly', affectedCount: ids.length,
        strategyKeys: filter.strategyKeys, assetGroups: filter.assetGroups, shotTypes: filter.shotTypes,
      });

      if (ids.length === 0) {
        toast.info('No non-primary candidates to archive');
        return 0;
      }

      const { error } = await (supabase as any)
        .from('project_images')
        .update({ curation_state: 'archived', is_active: false })
        .in('id', ids);

      if (error) throw error;
      toast.success(`Archived ${ids.length} non-primary candidate${ids.length !== 1 ? 's' : ''}`);
      invalidate();
      return ids.length;
    } catch (e: any) {
      toast.error(e.message || 'Convergence action failed');
      return 0;
    } finally {
      setBusy(false);
    }
  }, [projectId, busy, invalidate]);

  /**
   * Reject All Candidates — reject all non-primary active/candidate images.
   */
  const rejectAllCandidates = useCallback(async (sectionKey: CanonicalSectionKey) => {
    if (!projectId || busy) return 0;
    setBusy(true);
    try {
      const filter = buildCanonicalSectionFilter(sectionKey);

      const ids = await prefetchTargetIds(projectId, filter, (q) =>
        q.eq('is_primary', false).in('curation_state', ['active', 'candidate'])
      );

      console.log('[CONVERGENCE]', {
        sectionKey, action: 'rejectAllCandidates', affectedCount: ids.length,
        strategyKeys: filter.strategyKeys, assetGroups: filter.assetGroups, shotTypes: filter.shotTypes,
      });

      if (ids.length === 0) {
        toast.info('No candidates to reject');
        return 0;
      }

      const { error } = await (supabase as any)
        .from('project_images')
        .update({ curation_state: 'rejected', is_active: false })
        .in('id', ids);

      if (error) throw error;
      toast.success('Rejected all non-primary candidates');
      invalidate();
      return ids.length;
    } catch (e: any) {
      toast.error(e.message || 'Reject action failed');
      return 0;
    } finally {
      setBusy(false);
    }
  }, [projectId, busy, invalidate]);

  /**
   * Archive Older Generations — archive candidates older than the newest generation batch.
   */
  const archiveOlderGenerations = useCallback(async (sectionKey: CanonicalSectionKey) => {
    if (!projectId || busy) return 0;
    setBusy(true);
    try {
      const filter = buildCanonicalSectionFilter(sectionKey);

      // Find the newest image timestamp in this section
      let newestQ = (supabase as any)
        .from('project_images')
        .select('created_at')
        .eq('project_id', projectId)
        .in('curation_state', ['active', 'candidate']);

      newestQ = applySectionFilters(newestQ, filter);
      newestQ = newestQ.order('created_at', { ascending: false }).limit(1);
      const { data: newest } = await newestQ;

      if (!newest?.length) {
        toast.info('No candidates to archive');
        setBusy(false);
        return 0;
      }

      const newestDate = new Date(newest[0].created_at);
      const cutoff = new Date(newestDate.getTime() - 30 * 60 * 1000).toISOString();

      const ids = await prefetchTargetIds(projectId, filter, (q) =>
        q.eq('is_primary', false).in('curation_state', ['active', 'candidate']).lt('created_at', cutoff)
      );

      console.log('[CONVERGENCE]', {
        sectionKey, action: 'archiveOlderGenerations', affectedCount: ids.length,
        cutoff, strategyKeys: filter.strategyKeys, assetGroups: filter.assetGroups, shotTypes: filter.shotTypes,
      });

      if (ids.length === 0) {
        toast.info('No older candidates to archive');
        setBusy(false);
        return 0;
      }

      const { error } = await (supabase as any)
        .from('project_images')
        .update({ curation_state: 'archived', is_active: false })
        .in('id', ids);

      if (error) throw error;
      toast.success(`Archived ${ids.length} older candidate${ids.length !== 1 ? 's' : ''}`);
      invalidate();
      return ids.length;
    } catch (e: any) {
      toast.error(e.message || 'Archive action failed');
      return 0;
    } finally {
      setBusy(false);
    }
  }, [projectId, busy, invalidate]);

  /**
   * Auto-Prune Section — deterministic convergence using canonical scoring engine.
   * Scores all candidates with section-specific profiles, keeps primary + top alternates,
   * archives the rest. All ranking is deterministic and auditable.
   */
  const autoPruneSection = useCallback(async (
    sectionKey: CanonicalSectionKey,
    options: { keepAlternates?: number } = {},
  ): Promise<{ kept: number; archived: number; scoring: SectionScoringResult | null }> => {
    if (!projectId || busy) return { kept: 0, archived: 0, scoring: null };
    setBusy(true);
    try {
      const filter = buildCanonicalSectionFilter(sectionKey);
      const images = await fetchSectionImages(projectId, filter);

      if (images.length === 0) {
        toast.info('No candidates to prune');
        return { kept: 0, archived: 0, scoring: null };
      }

      // ── CANONICAL IDENTITY GATE (fail-closed) ──
      const { eligible: eligibleImages, summary: driftSummary } = filterEligibleImages(images, sectionKey);
      if (driftSummary.driftCount > 0 || driftSummary.blockedCount > 0) {
        console.warn('[IDENTITY_GATE_PRUNE]', { sectionKey, driftCount: driftSummary.driftCount, blockedCount: driftSummary.blockedCount, reasons: driftSummary.driftReasons });
      }

      // ── PREMIUM ACTIVE QUALITY GATE ──
      const { admitted: premiumEligible, excluded: premiumExcluded } = filterPremiumActiveImages(eligibleImages, sectionKey);
      if (premiumExcluded.length > 0) {
        console.warn('[PREMIUM_GATE_PRUNE]', { sectionKey, excludedCount: premiumExcluded.length });
      }

      // Use canonical scoring engine on premium-eligible images ONLY
      const scoring = scoreSection(premiumEligible, sectionKey, {
        maxAlternates: options.keepAlternates,
      });

      const archiveIds = scoring.archiveCandidates.map(s => s.id);
      const rejectIds = scoring.rejectCandidates.map(s => s.id);
      const allRemoveIds = [...archiveIds, ...rejectIds];

      console.log('[AUTO_PRUNE_CANONICAL]', {
        sectionKey,
        candidateCount: scoring.diagnostics.candidateCount,
        survivorCount: scoring.diagnostics.survivorCount,
        archiveCount: archiveIds.length,
        rejectCount: rejectIds.length,
        recommendedPrimaryId: scoring.diagnostics.recommendedPrimaryId,
        warnings: scoring.diagnostics.warnings,
        coverageSummary: scoring.diagnostics.coverageSummary,
        topScores: scoring.scored.slice(0, 5).map(s => ({
          id: s.id.slice(0, 8),
          score: s.totalScore,
          action: s.recommendedAction,
          reasons: s.reasons,
        })),
      });

      if (allRemoveIds.length === 0) {
        toast.info('Section already converged — nothing to prune');
        return { kept: scoring.survivors.length, archived: 0, scoring };
      }

      // IEL: archive by explicit ID set
      if (archiveIds.length > 0) {
        const { error } = await (supabase as any)
          .from('project_images')
          .update({ curation_state: 'archived', is_active: false })
          .in('id', archiveIds);
        if (error) throw error;
      }

      // IEL: reject by explicit ID set
      if (rejectIds.length > 0) {
        const { error } = await (supabase as any)
          .from('project_images')
          .update({ curation_state: 'rejected', is_active: false })
          .in('id', rejectIds);
        if (error) throw error;
      }

      const totalRemoved = allRemoveIds.length;
      toast.success(`Pruned: kept ${scoring.survivors.length}, removed ${totalRemoved}${scoring.diagnostics.warnings.length > 0 ? ` (${scoring.diagnostics.warnings.length} warning${scoring.diagnostics.warnings.length !== 1 ? 's' : ''})` : ''}`);
      invalidate();
      return { kept: scoring.survivors.length, archived: totalRemoved, scoring };
    } catch (e: any) {
      toast.error(e.message || 'Auto-prune failed');
      return { kept: 0, archived: 0, scoring: null };
    } finally {
      setBusy(false);
    }
  }, [projectId, busy, invalidate]);

  /**
   * Score section — dry run, no mutations. Returns scoring diagnostics for UI.
   */
  const scoreSectionPreview = useCallback(async (
    sectionKey: CanonicalSectionKey,
  ): Promise<SectionScoringResult | null> => {
    if (!projectId) return null;
    try {
      const filter = buildCanonicalSectionFilter(sectionKey);
      const images = await fetchSectionImages(projectId, filter);
      if (images.length === 0) return null;
      // ── CANONICAL IDENTITY GATE (fail-closed) ──
      const { eligible } = filterEligibleImages(images, sectionKey);
      // ── PREMIUM ACTIVE QUALITY GATE ──
      const { admitted: premiumEligible } = filterPremiumActiveImages(eligible, sectionKey);
      return scoreSection(premiumEligible, sectionKey);
    } catch {
      return null;
    }
  }, [projectId]);

  return {
    keepPrimaryOnly,
    rejectAllCandidates,
    archiveOlderGenerations,
    autoPruneSection,
    scoreSectionPreview,
    busy,
  };
}
