/**
 * Visual Truth Staleness Propagation — Trigger Layer
 * 
 * Wires canonical truth changes (cast, canon, style, locations)
 * into the existing visual freshness system.
 * 
 * Uses: markDependentAssetsStale from visual-truth-dependencies.ts
 * Uses: visual_dependency_links table
 * Uses: freshness_status / stale_reason on project_images + project_posters
 * 
 * NO new tables. NO parallel freshness model.
 */

import { supabase } from '@/integrations/supabase/client';
import { markDependentAssetsStale, type DependencyType } from './visual-truth-dependencies';

// ── Cast Change Propagation ──────────────────────────────────────────────────

/**
 * Call after a cast binding changes (bind, rebind, unbind).
 * Marks all visual assets that depend on the affected character stale.
 */
export async function propagateCastChange(
  projectId: string,
  characterKey: string,
  actorId: string | null,
  reason?: string,
): Promise<{ posters_marked: number; images_marked: number }> {
  const staleReason = reason || `Cast changed for ${characterKey}`;

  // Strategy: mark stale via cast_binding dependency if links exist,
  // AND via narrative_entity for broader character-dependent assets.

  let totalPosters = 0;
  let totalImages = 0;

  // 1. Via cast_binding dependency links (precise — exact cast binding)
  // Find the cast binding row to get its ID
  const { data: castRow } = await (supabase as any)
    .from('project_ai_cast')
    .select('id')
    .eq('project_id', projectId)
    .eq('character_key', characterKey)
    .maybeSingle();

  if (castRow?.id) {
    const r1 = await markDependentAssetsStale(projectId, 'cast_binding', castRow.id, staleReason);
    totalPosters += r1.posters_marked;
    totalImages += r1.images_marked;
  }

  // 2. Via narrative_entity dependency links (broader — character entity)
  // Find the narrative entity matching this character
  const { data: entityRow } = await (supabase as any)
    .from('narrative_entities')
    .select('id')
    .eq('project_id', projectId)
    .eq('entity_type', 'character')
    .ilike('canonical_name', characterKey.replace(/_/g, ' '))
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (entityRow?.id) {
    const r2 = await markDependentAssetsStale(projectId, 'narrative_entity', entityRow.id, staleReason);
    totalPosters += r2.posters_marked;
    totalImages += r2.images_marked;
  }

  // 3. Broad fallback: mark character-tagged images stale directly
  // This catches images that were never linked via visual_dependency_links
  if (actorId) {
    const { count } = await (supabase as any)
      .from('project_images')
      .update({ freshness_status: 'stale', stale_reason: staleReason })
      .eq('project_id', projectId)
      .eq('freshness_status', 'current')
      .or(`subject.ilike.%${characterKey.replace(/_/g, ' ')}%,subject_ref.ilike.%${characterKey.replace(/_/g, ' ')}%`);
    totalImages += count || 0;
  }

  console.log(`[StalePropagation] Cast change for "${characterKey}": ${totalPosters} posters, ${totalImages} images marked stale`);
  return { posters_marked: totalPosters, images_marked: totalImages };
}

// ── Canon Change Propagation ─────────────────────────────────────────────────

/**
 * Call after project_canon / canon_json changes.
 * Marks ALL visual assets for the project as potentially stale.
 * Canon is a broad dependency — most visual outputs depend on it.
 */
export async function propagateCanonChange(
  projectId: string,
  reason?: string,
): Promise<{ posters_marked: number; images_marked: number }> {
  const staleReason = reason || 'Canon truth changed';

  // Mark all current project_images stale
  const { count: imgCount } = await (supabase as any)
    .from('project_images')
    .update({ freshness_status: 'stale', stale_reason: staleReason })
    .eq('project_id', projectId)
    .eq('freshness_status', 'current');

  // Mark all current project_posters stale
  const { count: posterCount } = await (supabase as any)
    .from('project_posters')
    .update({ freshness_status: 'stale', stale_reason: staleReason })
    .eq('project_id', projectId)
    .eq('freshness_status', 'current');

  const posters_marked = posterCount || 0;
  const images_marked = imgCount || 0;

  console.log(`[StalePropagation] Canon change: ${posters_marked} posters, ${images_marked} images marked stale`);
  return { posters_marked, images_marked };
}

// ── Visual Style Change Propagation ──────────────────────────────────────────

/**
 * Call after project_visual_style changes.
 * Marks visual assets stale (style affects all generation).
 */
export async function propagateVisualStyleChange(
  projectId: string,
  reason?: string,
): Promise<{ posters_marked: number; images_marked: number }> {
  const staleReason = reason || 'Visual style changed';

  const { count: imgCount } = await (supabase as any)
    .from('project_images')
    .update({ freshness_status: 'stale', stale_reason: staleReason })
    .eq('project_id', projectId)
    .eq('freshness_status', 'current');

  const { count: posterCount } = await (supabase as any)
    .from('project_posters')
    .update({ freshness_status: 'stale', stale_reason: staleReason })
    .eq('project_id', projectId)
    .eq('freshness_status', 'current');

  const posters_marked = posterCount || 0;
  const images_marked = imgCount || 0;

  console.log(`[StalePropagation] Visual style change: ${posters_marked} posters, ${images_marked} images marked stale`);
  return { posters_marked, images_marked };
}

// ── Location Change Propagation ──────────────────────────────────────────────

/**
 * Call after a canon_location is modified.
 * Marks only location-dependent visual assets stale (narrow).
 */
export async function propagateLocationChange(
  projectId: string,
  canonLocationId: string,
  locationName?: string,
  reason?: string,
): Promise<{ posters_marked: number; images_marked: number }> {
  const staleReason = reason || `Location changed: ${locationName || canonLocationId}`;

  let totalPosters = 0;
  let totalImages = 0;

  // 1. Via canon_location dependency links
  const r1 = await markDependentAssetsStale(projectId, 'canon_location', canonLocationId, staleReason);
  totalPosters += r1.posters_marked;
  totalImages += r1.images_marked;

  // 2. Direct: images bound to this canon_location_id
  const { count } = await (supabase as any)
    .from('project_images')
    .update({ freshness_status: 'stale', stale_reason: staleReason })
    .eq('project_id', projectId)
    .eq('canon_location_id', canonLocationId)
    .eq('freshness_status', 'current');
  totalImages += count || 0;

  console.log(`[StalePropagation] Location change "${locationName}": ${totalPosters} posters, ${totalImages} images marked stale`);
  return { posters_marked: totalPosters, images_marked: totalImages };
}
