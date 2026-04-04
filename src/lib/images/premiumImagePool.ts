/**
 * premiumImagePool — CANONICAL SELECTOR for premium-eligible imagery.
 *
 * SINGLE SOURCE OF TRUTH for all downstream premium consumers:
 *   - Poster engine
 *   - Executive Concept Brief engine
 *   - Any future investor-facing output
 *
 * Queries project_images with enforced gate columns:
 *   premium_eligible = true AND quality_status = 'pass'
 *
 * FAIL-CLOSED: returns empty array if no qualifying images exist.
 * Downstream consumers MUST NOT bypass this selector.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ProjectImage } from './types';

// ── Types ──────────────────────────────────────────────────────────

export interface PremiumPoolOptions {
  /** Filter by asset_group (e.g., 'hero_frame', 'character', 'world') */
  assetGroup?: string | null;
  /** Filter by generation_purpose */
  generationPurpose?: string | null;
  /** Maximum number of images to return (default: 100) */
  limit?: number;
  /** Minimum quality_score threshold (default: 0) */
  minScore?: number;
}

export interface PremiumPoolResult {
  images: ProjectImage[];
  total: number;
  /** Whether the result set is empty — downstream MUST handle this */
  isEmpty: boolean;
}

// ── Core Selector ─────────────────────────────────────────────────

/**
 * Get premium-eligible images for a project.
 *
 * This is the ONLY valid input source for:
 *   - Poster engine
 *   - Concept Brief engine
 *   - Any investor-facing visual output
 *
 * NO EXCEPTIONS.
 *
 * @param projectId - Project to query
 * @param options - Optional filters
 * @returns Premium pool result (fail-closed: empty array if none qualify)
 */
export async function getPremiumImages(
  projectId: string,
  options: PremiumPoolOptions = {},
): Promise<PremiumPoolResult> {
  const {
    assetGroup = null,
    generationPurpose = null,
    limit = 100,
    minScore = 0,
  } = options;

  let query = (supabase as any)
    .from('project_images')
    .select('*')
    .eq('project_id', projectId)
    .eq('premium_eligible', true)
    .eq('quality_status', 'pass')
    .eq('is_active', true)
    .order('quality_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (assetGroup) {
    query = query.eq('asset_group', assetGroup);
  }
  if (generationPurpose) {
    query = query.eq('generation_purpose', generationPurpose);
  }
  if (minScore > 0) {
    query = query.gte('quality_score', minScore);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[PREMIUM_IMAGE_POOL] Query failed:', error.message);
    return { images: [], total: 0, isEmpty: true };
  }

  const images = (data ?? []) as ProjectImage[];

  if (images.length === 0) {
    console.warn('[PREMIUM_IMAGE_POOL] No premium-eligible images found', {
      projectId,
      assetGroup,
      generationPurpose,
      minScore,
    });
  }

  return {
    images,
    total: images.length,
    isEmpty: images.length === 0,
  };
}

// ── Convenience Selectors ─────────────────────────────────────────

/**
 * Get premium hero frame images only.
 */
export async function getPremiumHeroFrames(projectId: string, limit = 20): Promise<PremiumPoolResult> {
  return getPremiumImages(projectId, {
    assetGroup: 'hero_frame',
    generationPurpose: 'hero_frame',
    limit,
  });
}

/**
 * Get all premium images suitable for poster selection.
 * Includes hero frames and any other premium-qualifying imagery.
 */
export async function getPremiumPosterPool(projectId: string, limit = 50): Promise<PremiumPoolResult> {
  return getPremiumImages(projectId, { limit });
}

/**
 * Get premium images for concept brief curation.
 */
export async function getPremiumBriefPool(projectId: string, limit = 50): Promise<PremiumPoolResult> {
  return getPremiumImages(projectId, { limit });
}

// ── IEL Assertion ─────────────────────────────────────────────────

/**
 * Assert that a premium pool is non-empty.
 * FAIL-CLOSED: throws if no premium images exist.
 * Use before any downstream assembly that requires premium imagery.
 */
export function assertPremiumPoolNotEmpty(
  pool: PremiumPoolResult,
  context: string,
): void {
  if (pool.isEmpty) {
    const msg = `[PREMIUM_POOL_EMPTY] Cannot proceed with ${context}: no premium-eligible images available`;
    console.error(msg);
    throw new Error(msg);
  }
}
