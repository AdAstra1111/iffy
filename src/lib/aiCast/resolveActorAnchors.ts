/**
 * resolveActorAnchors — Canonical resolver for approved actor identity anchor paths.
 *
 * Returns storage_path values for headshot and full_body from the approved actor version.
 * These are the ONLY valid identity sources for Costume-on-Actor generation.
 *
 * FAIL CLOSED: If no approved version or no assets, returns null anchors explicitly.
 * No fallback to non-approved versions or project_images.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ActorAnchorPaths {
  headshot: string | null;
  fullBody: string | null;
  referenceUrls: string[];
  anchorCount: number;
  actorVersionId: string;
  /** Whether we have at least one usable anchor */
  hasAnchors: boolean;
  /** Whether anchors are full public URLs (not storage paths needing signing) */
  anchorsArePublicUrls: boolean;
}

/**
 * Resolve identity anchor storage paths for a specific actor version.
 * Uses ai_actor_assets with deterministic asset_type classification.
 */
export async function resolveActorAnchorPaths(
  actorVersionId: string,
): Promise<ActorAnchorPaths | null> {
  if (!actorVersionId) return null;

  const { data: assets, error } = await (supabase as any)
    .from('ai_actor_assets')
    .select('asset_type, storage_path, public_url, meta_json')
    .eq('actor_version_id', actorVersionId);

  if (error || !assets || assets.length === 0) {
    return {
      headshot: null,
      fullBody: null,
      referenceUrls: [],
      anchorCount: 0,
      actorVersionId,
      hasAnchors: false,
      anchorsArePublicUrls: false,
    };
  }

  let headshot: string | null = null;
  let fullBody: string | null = null;
  const referenceUrls: string[] = [];
  let usedPublicUrl = false;

  for (const asset of assets) {
    // Prefer storage_path for signing; fall back to public_url (already a full URL)
    let path = asset.storage_path && asset.storage_path.length > 0
      ? asset.storage_path
      : asset.public_url;
    if (!path) continue;

    // Track whether we're using public URLs (no signing needed)
    if (!asset.storage_path || asset.storage_path.length === 0) {
      usedPublicUrl = true;
    }

    const assetType = (asset.asset_type || '').toLowerCase();
    const metaShotType = ((asset.meta_json as any)?.shot_type || '').toLowerCase();

    if (
      assetType === 'reference_headshot' ||
      metaShotType === 'identity_headshot' ||
      metaShotType === 'headshot'
    ) {
      if (!headshot) headshot = path;
      else referenceUrls.push(path);
    } else if (
      assetType === 'reference_full_body' ||
      metaShotType === 'identity_full_body' ||
      metaShotType === 'full_body'
    ) {
      if (!fullBody) fullBody = path;
      else referenceUrls.push(path);
    } else if (
      assetType === 'reference_image' ||
      assetType === 'screen_test_still'
    ) {
      if (!headshot && metaShotType !== 'full_body') {
        headshot = path;
      } else {
        referenceUrls.push(path);
      }
    }
  }

  const anchorCount = (headshot ? 1 : 0) + (fullBody ? 1 : 0) + referenceUrls.length;

  return {
    headshot,
    fullBody,
    referenceUrls,
    anchorCount,
    actorVersionId,
    hasAnchors: !!(headshot || fullBody),
    anchorsArePublicUrls: usedPublicUrl,
  };
}
