/**
 * useSectionReset — Per-section deterministic reset and clean regeneration.
 * 
 * Reset Section: archives all current images in a canonical section,
 * clears primary/active flags, and stamps a reset batch ID.
 * 
 * Regenerate Clean: reset + generate fresh images for the section.
 * 
 * Uses buildCanonicalSectionFilter from lookbookSlotRegistry —
 * the SINGLE canonical filter path. No duplicate section maps.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CanonicalSectionKey } from '@/hooks/useLookbookSections';
import { buildCanonicalSectionFilter } from '@/lib/lookbook/pipeline/lookbookSlotRegistry';

export interface SectionResetResult {
  archivedCount: number;
  resetBatchId: string;
}

export function useSectionReset(projectId: string) {
  const qc = useQueryClient();
  const [resettingSection, setResettingSection] = useState<string | null>(null);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);

  /**
   * Build the query filter for a section's images.
   * Uses the SHARED canonical filter builder — single source of truth.
   * Enforces lineage (allowed_generation_purposes) at query level.
   */
  const buildSectionQuery = useCallback((sectionKey: CanonicalSectionKey) => {
    const filter = buildCanonicalSectionFilter(sectionKey);

    let q = (supabase as any)
      .from('project_images')
      .select('id')
      .eq('project_id', projectId);

    // Strategy key or fallback role filter
    if (filter.strategyKeys.length > 0) {
      q = q.in('strategy_key', filter.strategyKeys);
    } else if (filter.fallbackRoles?.length) {
      q = q.in('role', filter.fallbackRoles);
    }

    // Asset group filter
    if (filter.assetGroups.length > 0) {
      q = q.in('asset_group', filter.assetGroups);
    }

    // Shot type disambiguation
    if (filter.shotTypes?.length) {
      q = q.in('shot_type', filter.shotTypes);
    }

    // ── CANONICAL LINEAGE BOUNDARY ──
    // Reset must operate on the SAME lineage-scoped set as display.
    // Without this, reset would archive images from OTHER lineages
    // that share the same asset_group/strategy_key.
    if (filter.allowedGenerationPurposes?.length) {
      q = q.in('generation_purpose', filter.allowedGenerationPurposes);
    }

    return q;
  }, [projectId]);

  /**
   * Reset Section — archives all images in a canonical section.
   * 
   * Steps:
   * 1. Generate a reset batch ID for audit trail
   * 2. Find all images matching section filters (any curation_state)
   * 3. Archive them: curation_state='archived', is_primary=false, is_active=false
   * 4. Stamp canon_reset_batch_id for traceability
   * 5. Invalidate all caches
   */
  const resetSection = useCallback(async (sectionKey: CanonicalSectionKey): Promise<SectionResetResult | null> => {
    if (resettingSection) return null;
    setResettingSection(sectionKey);

    try {
      // canon_reset_batch_id is UUID — generate a proper one
      const resetBatchId = crypto.randomUUID();

      // Find all section images (regardless of current curation state)
      const findQuery = buildSectionQuery(sectionKey);
      const { data: sectionImages, error: findError } = await findQuery;

      if (findError) {
        throw new Error(`Failed to find section images: ${findError.message}`);
      }

      const imageIds = (sectionImages || []).map((r: any) => r.id);

      if (imageIds.length === 0) {
        toast.info(`${sectionKey.replace(/_/g, ' ')} — no images to reset`);
        return { archivedCount: 0, resetBatchId };
      }

      // Archive all section images in one update
      const { error: updateError } = await (supabase as any)
        .from('project_images')
        .update({
          curation_state: 'archived',
          is_primary: false,
          is_active: false,
          canon_reset_batch_id: resetBatchId,
          archived_from_active_at: new Date().toISOString(),
          stale_reason: `section_reset:${sectionKey}`,
        })
        .in('id', imageIds);

      if (updateError) {
        throw new Error(`Failed to archive section images: ${updateError.message}`);
      }

      // Invalidate all relevant caches
      invalidateAll(sectionKey);

      console.log(`[SectionReset] ${sectionKey}: archived ${imageIds.length} images, batch=${resetBatchId}`);
      toast.success(`Reset ${sectionKey.replace(/_/g, ' ')} — ${imageIds.length} images archived`);

      return { archivedCount: imageIds.length, resetBatchId };
    } catch (e: any) {
      toast.error(e.message || `Failed to reset ${sectionKey}`);
      return null;
    } finally {
      setResettingSection(null);
    }
  }, [projectId, resettingSection, buildSectionQuery]);

  /**
   * Regenerate Clean — reset section then generate fresh images.
   * 
   * Steps:
   * 1. Reset section (archive all existing)
   * 2. Call generate-lookbook-image for the section
   * 3. New images arrive as candidates (user promotes to active)
   * 4. Invalidate all caches
   */
  const regenerateClean = useCallback(async (
    sectionKey: CanonicalSectionKey,
    options?: { count?: number },
  ) => {
    if (regeneratingSection) return;
    setRegeneratingSection(sectionKey);

    try {
      // Step 1: Reset section
      const resetResult = await resetSection(sectionKey);
      if (resetResult === null && resettingSection) {
        // Reset was blocked (already resetting)
        return;
      }

      // Step 2: Generate fresh images
      const filter = buildCanonicalSectionFilter(sectionKey);
      const sectionParam = sectionKey === 'character_identity' ? 'character'
        : sectionKey === 'world_locations' ? 'world'
        : sectionKey === 'atmosphere_lighting' ? 'visual_language'
        : sectionKey === 'texture_detail' ? 'visual_language'
        : sectionKey === 'symbolic_motifs' ? 'key_moment'
        : sectionKey === 'key_moments' ? 'key_moment'
        : 'world';

      const assetGroup = filter.assetGroups[0] || sectionParam;

      const { data, error } = await supabase.functions.invoke('generate-lookbook-image', {
        body: {
          project_id: projectId,
          section: sectionParam,
          count: options?.count || 4,
          asset_group: assetGroup,
          pack_mode: true,
        },
      });

      if (error) throw new Error(error.message);

      const results = data?.results || [];
      const successCount = results.filter((r: any) => r.status === 'ready').length;

      // Step 3: Invalidate and report
      invalidateAll(sectionKey);

      if (successCount > 0) {
        toast.success(`Regenerated ${successCount} fresh images for ${sectionKey.replace(/_/g, ' ')}`);
      } else {
        toast.warning('Reset complete but no new images generated — check upstream prerequisites');
      }
    } catch (e: any) {
      toast.error(e.message || `Failed to regenerate ${sectionKey}`);
    } finally {
      setRegeneratingSection(null);
    }
  }, [projectId, regeneratingSection, resetSection]);

  const invalidateAll = useCallback((sectionKey?: string) => {
    qc.invalidateQueries({ queryKey: ['lookbook-section-content', projectId] });
    qc.invalidateQueries({ queryKey: ['project-images', projectId] });
    qc.invalidateQueries({ queryKey: ['project-images-paginated', projectId] });
    qc.invalidateQueries({ queryKey: ['lookbook-sections', projectId] });
  }, [projectId, qc]);

  return {
    resetSection,
    regenerateClean,
    resettingSection,
    regeneratingSection,
    isResetting: !!resettingSection,
    isRegenerating: !!regeneratingSection,
  };
}
