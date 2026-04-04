/**
 * useLookbookSectionContent — Maps canonical lookbook section keys
 * to image retrieval logic and upstream blocker resolution.
 * Replaces legacy IMAGE_SECTIONS as the authoritative section→image binding.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ProjectImage, CurationState } from '@/lib/images/types';
import type { CanonicalSectionKey } from '@/hooks/useLookbookSections';
import { buildCanonicalSectionFilter } from '@/lib/lookbook/pipeline/lookbookSlotRegistry';
import { filterForDisplay } from '@/lib/images/premiumDisplayFilter';

const IMAGE_STALE_TIME = 20 * 60 * 1000;

export interface SectionBlocker {
  message: string;
  severity: 'hard' | 'soft';
}

export function useLookbookSectionContent(
  projectId: string | undefined,
  sectionKey: CanonicalSectionKey,
  options: { curationFilter?: CurationState | 'all' | 'working'; pageSize?: number } = {},
) {
  const qc = useQueryClient();
  const pageSize = options.pageSize || 12;
  const { strategyKeys, assetGroups, fallbackRoles, shotTypes, allowedGenerationPurposes } = buildCanonicalSectionFilter(sectionKey);

  const curationStates: CurationState[] =
    !options.curationFilter || options.curationFilter === 'all'
      ? ['active', 'candidate', 'archived']
      : options.curationFilter === 'working'
        ? ['active', 'candidate']
        : [options.curationFilter];

  const { data, isLoading } = useQuery({
    queryKey: ['lookbook-section-content', projectId, sectionKey, curationStates, pageSize],
    queryFn: async () => {
      if (!projectId) return { images: [] as ProjectImage[], total: 0 };

      let q = (supabase as any)
        .from('project_images')
        .select('*')
        .eq('project_id', projectId);

      // Filter by strategy_keys OR asset_groups OR fallback_roles
      // For sections with multiple asset_groups (e.g. atmosphere_lighting: world + visual_language),
      // we use OR logic to capture all relevant assets.
      if (strategyKeys.length > 0 && assetGroups.length > 0) {
        // Both present — strategy_key narrows, then asset_group filters within.
        // Use OR for multi-group sections.
        q = q.or(
          `strategy_key.in.(${strategyKeys.join(',')}),asset_group.in.(${assetGroups.join(',')})`
        );
      } else if (strategyKeys.length > 0) {
        q = q.in('strategy_key', strategyKeys);
      } else if (assetGroups.length > 0) {
        if (fallbackRoles?.length) {
          q = q.or(
            `asset_group.in.(${assetGroups.join(',')}),role.in.(${fallbackRoles.join(',')})`
          );
        } else {
          q = q.in('asset_group', assetGroups);
        }
      } else if (fallbackRoles?.length) {
        q = q.in('role', fallbackRoles);
      }

      if (curationStates.length < 4) {
        q = q.in('curation_state', curationStates);
      }

      // Shot type disambiguation for sections sharing an asset_group
      if (shotTypes?.length) {
        q = q.in('shot_type', shotTypes);
      }

      // ── LOOKBOOK CANONICAL VISIBILITY BOUNDARY ──
      // Only surface images from the current canonical pipeline lineage.
      // DO NOT BROADEN TO HISTORICAL PROJECT_IMAGES WITHOUT LINEAGE.
      if (allowedGenerationPurposes?.length) {
        q = q.in('generation_purpose', allowedGenerationPurposes);
      }

      q = q
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(pageSize);

      const { data: rows, error } = await q;
      if (error) throw error;

      console.log('[SECTION DISPLAY]', {
        sectionKey, strategyKeys, assetGroups, shotTypes,
        allowedGenerationPurposes,
        resultCount: rows?.length ?? 0,
      });

      const rawImages = (rows || []) as ProjectImage[];

      // ── GOVERNANCE DISPLAY FILTER ──
      // Apply identity + premium quality gates client-side.
      // DB queries can't inspect JSONB generation_config, so this is the
      // canonical post-fetch governance boundary for display paths.
      const { governed: governedImages, summary: filterSummary } = filterForDisplay(rawImages as any, sectionKey);
      let images = governedImages as unknown as ProjectImage[];

      if (filterSummary.identityExcluded > 0 || filterSummary.premiumExcluded > 0) {
        console.log('[SECTION DISPLAY GOVERNANCE]', {
          sectionKey,
          rawCount: rawImages.length,
          governedCount: images.length,
          identityExcluded: filterSummary.identityExcluded,
          premiumExcluded: filterSummary.premiumExcluded,
        });
      }

      // Hydrate signed URLs
      const bucketGroups = new Map<string, ProjectImage[]>();
      for (const img of images) {
        const bucket = img.storage_bucket || 'project-posters';
        if (!bucketGroups.has(bucket)) bucketGroups.set(bucket, []);
        bucketGroups.get(bucket)!.push(img);
      }
      await Promise.all(
        Array.from(bucketGroups.entries()).map(async ([bucket, imgs]) => {
          await Promise.all(
            imgs.map(async (img) => {
              try {
                const { data: signed } = await supabase.storage
                  .from(bucket)
                  .createSignedUrl(img.storage_path, 3600);
                img.signedUrl = signed?.signedUrl || undefined;
              } catch {
                img.signedUrl = undefined;
              }
            }),
          );
        }),
      );

      // ── Hero Anchor Contract: extract section-level metadata from resolver-tagged images ──
      // The resolver already tagged the anchor image with isHeroAnchor: true and placed it at position 0.
      // We extract that truth once here so it travels as explicit section metadata through the cache.
      const anchorImage = images.find((img: any) => (img as any).isHeroAnchor === true);

      return {
        images,
        total: images.length,
        hasHeroAnchor: !!anchorImage,
        heroAnchorId: anchorImage?.id ?? null,
        heroAnchorInjected: !!anchorImage,
      };
    },
    enabled: !!projectId,
    staleTime: IMAGE_STALE_TIME,
  });

  // Resolve upstream blockers
  const blockers = useMemo((): SectionBlocker[] => {
    if (!data) return [];
    const b: SectionBlocker[] = [];

    if (sectionKey === 'character_identity' && data.images.length === 0) {
      b.push({ message: 'No approved character identity images found. Generate or approve cast photos first.', severity: 'soft' });
    }
    if (sectionKey === 'world_locations' && data.images.length === 0) {
      b.push({ message: 'No canon-bound location references found. Approve Production Design environments or build world references.', severity: 'soft' });
    }
    if (sectionKey === 'atmosphere_lighting' && data.images.length === 0) {
      b.push({ message: 'No atmospheric or lighting references available. Approve Production Design atmosphere outputs or generate visual language images.', severity: 'soft' });
    }
    if (sectionKey === 'texture_detail' && data.images.length === 0) {
      b.push({ message: 'No texture or detail references available. Approve Production Design surface/material outputs first.', severity: 'soft' });
    }
    if (sectionKey === 'symbolic_motifs' && data.images.length === 0) {
      b.push({ message: 'No symbolic motif references found. Approve Production Design motifs or curate symbolic imagery from key moments.', severity: 'soft' });
    }
    if (sectionKey === 'key_moments' && data.images.length === 0) {
      b.push({ message: 'No key moment shots found. Generate tableau, medium, close-up, and wide shots.', severity: 'soft' });
    }
    if (sectionKey === 'hero_frames' && data.images.length === 0) {
      b.push({ message: 'No hero frames available. Generate cinematic anchor stills to establish visual truth.', severity: 'soft' });
    }
    if (sectionKey === 'poster_directions' && data.images.length === 0) {
      b.push({ message: 'No governed upstream imagery available for poster directions. Approve hero frames, world references, or key moments first.', severity: 'soft' });
    }

    return b;
  }, [data, sectionKey]);

  const invalidateSection = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['lookbook-section-content', projectId, sectionKey] });
  }, [qc, projectId, sectionKey]);

  return {
    images: data?.images || [],
    total: data?.total || 0,
    isLoading,
    blockers,
    invalidateSection,
    /** Hero Anchor Contract metadata — explicit passthrough from queryFn, never recomputed */
    hasHeroAnchor: data?.hasHeroAnchor ?? false,
    heroAnchorId: data?.heroAnchorId ?? null,
    heroAnchorInjected: data?.heroAnchorInjected ?? false,
  };
}
