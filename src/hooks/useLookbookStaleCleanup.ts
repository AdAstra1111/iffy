/**
 * useLookbookStaleCleanup — One-time cleanup utility to archive stale/legacy images
 * that are visible in Lookbook sections but lack canonical pipeline lineage.
 *
 * Archives (does NOT delete) images that match section filters but fail lineage checks.
 * Uses the same canonical section filter builder as display + convergence.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  buildCanonicalSectionFilter,
  SECTION_QUERY_MAP,
  type CanonicalSectionKey,
} from '@/lib/lookbook/pipeline/lookbookSlotRegistry';

interface CleanupResult {
  sectionKey: CanonicalSectionKey;
  archivedCount: number;
  archivedIds: string[];
  reason: string;
}

/**
 * LOOKBOOK CANONICAL VISIBILITY BOUNDARY — CLEANUP UTILITY
 * DO NOT BROADEN TO HISTORICAL PROJECT_IMAGES WITHOUT LINEAGE.
 *
 * For each section that has allowed_generation_purposes defined,
 * finds images that match section asset_group/strategy_key filters
 * but do NOT have a matching generation_purpose.
 * Archives them (curation_state='archived', is_active=false).
 */
export function useLookbookStaleCleanup(projectId: string | undefined) {
  const qc = useQueryClient();
  const [cleaning, setCleaning] = useState(false);
  const [results, setResults] = useState<CleanupResult[]>([]);

  const cleanupSection = useCallback(async (sectionKey: CanonicalSectionKey): Promise<CleanupResult> => {
    if (!projectId) return { sectionKey, archivedCount: 0, archivedIds: [], reason: 'no project' };

    const filter = buildCanonicalSectionFilter(sectionKey);
    if (!filter.allowedGenerationPurposes?.length) {
      return { sectionKey, archivedCount: 0, archivedIds: [], reason: 'no lineage restriction' };
    }

    // Find images that match section filters but FAIL lineage check
    let q = (supabase as any)
      .from('project_images')
      .select('id, generation_purpose, asset_group, strategy_key, created_at')
      .eq('project_id', projectId)
      .in('curation_state', ['active', 'candidate'])
      .eq('is_active', true);

    // Apply section's asset_group / strategy_key filters
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

    const { data: candidates, error: fetchErr } = await q;
    if (fetchErr) throw fetchErr;

    // Get image IDs protected by locked visual_set_slots — never archive these
    const { data: lockedSlotImages } = await (supabase as any)
      .from('visual_set_slots')
      .select('selected_image_id, visual_sets!inner(project_id, status)')
      .eq('visual_sets.project_id', projectId)
      .eq('visual_sets.status', 'locked')
      .eq('state', 'locked')
      .not('selected_image_id', 'is', null);
    const protectedIds = new Set(
      (lockedSlotImages || []).map((r: any) => r.selected_image_id)
    );

    // Filter to those that FAIL lineage check AND are not protected by locked slots
    const staleIds = (candidates || [])
      .filter((img: any) =>
        !filter.allowedGenerationPurposes!.includes(img.generation_purpose) &&
        !protectedIds.has(img.id)
      )
      .map((img: any) => img.id);

    if (staleIds.length === 0) {
      return { sectionKey, archivedCount: 0, archivedIds: [], reason: 'all images have valid lineage' };
    }

    console.log('[STALE_CLEANUP]', {
      sectionKey,
      staleCount: staleIds.length,
      allowedPurposes: filter.allowedGenerationPurposes,
      staleIds,
    });

    // IEL guard
    if (staleIds.length > 500) {
      console.warn('[IEL WARNING] Large stale cleanup set', { sectionKey, count: staleIds.length });
    }

    // Archive stale images — no hard delete
    const { error: updateErr } = await (supabase as any)
      .from('project_images')
      .update({
        curation_state: 'archived',
        is_active: false,
      })
      .in('id', staleIds);

    if (updateErr) throw updateErr;

    return {
      sectionKey,
      archivedCount: staleIds.length,
      archivedIds: staleIds,
      reason: 'generation_purpose does not match canonical lineage',
    };
  }, [projectId]);

  const cleanupAllSections = useCallback(async () => {
    if (!projectId || cleaning) return;
    setCleaning(true);
    try {
      const sectionKeys = Object.keys(SECTION_QUERY_MAP) as CanonicalSectionKey[];
      const allResults: CleanupResult[] = [];

      for (const key of sectionKeys) {
        const result = await cleanupSection(key);
        allResults.push(result);
      }

      setResults(allResults);

      const totalArchived = allResults.reduce((sum, r) => sum + r.archivedCount, 0);
      if (totalArchived > 0) {
        toast.success(`Archived ${totalArchived} stale images across Lookbook sections`);
        qc.invalidateQueries({ queryKey: ['lookbook-section-content', projectId] });
        qc.invalidateQueries({ queryKey: ['section-images', projectId] });
        qc.invalidateQueries({ queryKey: ['project-images', projectId] });
      } else {
        toast.info('No stale images found — all sections are canonically clean');
      }

      console.log('[STALE_CLEANUP_SUMMARY]', {
        totalArchived,
        sections: allResults.map(r => ({
          section: r.sectionKey,
          archived: r.archivedCount,
          reason: r.reason,
        })),
      });

      return allResults;
    } catch (e: any) {
      toast.error(e.message || 'Stale cleanup failed');
      throw e;
    } finally {
      setCleaning(false);
    }
  }, [projectId, cleaning, cleanupSection, qc]);

  return {
    cleaning,
    results,
    cleanupSection,
    cleanupAllSections,
  };
}
