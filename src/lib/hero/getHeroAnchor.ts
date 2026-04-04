/**
 * getHeroAnchor — Canonical Hero Anchor Contract.
 *
 * Single source of truth for "the hero anchor image."
 * Returns the explicit primary hero_frame or null (fail-closed).
 * No recency fallback. No sort-based inference.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ProjectImage } from '@/lib/images/types';

// ── Hero Anchor Contract ────────────────────────────────────────────────────

export interface HeroAnchorContract {
  id: string;
  model: string | null;
  provider: string | null;
  quality: string | null;
  identityMode: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  provenance: Record<string, unknown>;
}

/**
 * Fetch the canonical hero anchor image from DB.
 * FAIL-CLOSED: returns null if no primary exists. Never falls back to recency.
 */
export async function getHeroAnchor(projectId: string): Promise<ProjectImage | null> {
  const { data, error } = await (supabase as any)
    .from('project_images')
    .select('*')
    .eq('project_id', projectId)
    .eq('asset_group', 'hero_frame')
    .eq('is_primary', true)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) {
    console.log('[HERO_ANCHOR_CONTRACT] no anchor found', { projectId, error: error?.message });
    return null;
  }

  return data as ProjectImage;
}

/**
 * Build a derived contract object from a hero anchor image.
 * Pure function — no DB access.
 */
export function buildHeroAnchorContract(image: ProjectImage | null): HeroAnchorContract | null {
  if (!image) return null;

  const gc = (image.generation_config || {}) as Record<string, unknown>;

  return {
    id: image.id,
    model: image.model || (gc.model as string) || null,
    provider: image.provider || (gc.provider as string) || null,
    quality: (gc.quality_target as string) || (gc.qualityTarget as string) || null,
    identityMode: (gc.identity_mode as string) || (gc.identityMode as string) || null,
    width: image.width,
    height: image.height,
    aspectRatio: image.width && image.height ? image.width / image.height : null,
    provenance: gc,
  };
}

/**
 * Tag an image as the hero anchor in downstream arrays.
 * Returns a new object with `isHeroAnchor: true`.
 */
export function tagAsHeroAnchor<T extends ProjectImage>(image: T): T & { isHeroAnchor: true } {
  return { ...image, isHeroAnchor: true as const };
}

/**
 * Inject the hero anchor at position 0 of an image array, removing any
 * duplicate of the same image. This replaces sort-based primary resolution
 * with explicit positional injection.
 */
export function injectHeroAnchor(
  anchor: ProjectImage,
  images: ProjectImage[],
): (ProjectImage & { isHeroAnchor?: boolean })[] {
  const filtered = images.filter(img => img.id !== anchor.id);
  const tagged = tagAsHeroAnchor(anchor);

  console.log('[HERO_ANCHOR_CONTRACT] injected', {
    anchorId: anchor.id,
    poolSize: filtered.length + 1,
  });

  return [tagged, ...filtered];
}
