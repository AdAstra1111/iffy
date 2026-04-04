/**
 * canonCompletionProof.ts — Shared deterministic helpers for visual canon completion.
 *
 * Each domain has ONE canonical completion definition based on visual_sets,
 * the same substrate used by Character Visuals, Costume-on-Actor, and Production Design.
 *
 * IEL: No duplicate completion logic. All consumers (resolver, hook, UI) use these helpers.
 *
 * Completion definitions:
 *   character_identity  — visual_sets row with domain='character_identity', status ∉ {archived, draft}
 *   character_wardrobe  — visual_sets row with domain='character_costume_look', status ∉ {archived, draft}
 *   production_design_location — visual_sets row with domain='production_design_location',
 *                                target_id = canon_location_id, status ∉ {archived, draft}
 */

// Statuses that indicate a visual set has progressed beyond draft into real visual work
const ACTIVE_SET_STATUSES = ['curating', 'ready_to_lock', 'locked', 'stale'] as const;

// Statuses that are NOT completion: 'archived', 'draft'
// A set in 'curating' means slots have been generated and are being reviewed — that counts.
// A set in 'locked' is the strongest signal.

export interface VisualSetCompletionRow {
  id: string;
  domain: string;
  target_name: string;
  target_id: string | null;
  status: string;
}

/**
 * From a list of visual_sets rows, determine which character keys have
 * canonical identity visual completion.
 */
export function resolveIdentityCompletionKeys(
  sets: VisualSetCompletionRow[],
): Set<string> {
  const keys = new Set<string>();
  for (const s of sets) {
    if (s.domain !== 'character_identity') continue;
    if (!isActiveSetStatus(s.status)) continue;
    const key = s.target_name?.toLowerCase?.().trim();
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * From a list of visual_sets rows, determine which character keys have
 * canonical wardrobe visual completion (costume-on-actor visual sets).
 */
export function resolveWardrobeVisualCompletionKeys(
  sets: VisualSetCompletionRow[],
): Set<string> {
  const keys = new Set<string>();
  for (const s of sets) {
    if (s.domain !== 'character_costume_look') continue;
    if (!isActiveSetStatus(s.status)) continue;
    const key = s.target_name?.toLowerCase?.().trim();
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * From a list of visual_sets rows, determine which canon location IDs have
 * canonical production design visual completion.
 *
 * Uses target_id (canonical location linkage) as primary key.
 * Falls back to target_name matching ONLY when target_id is null (degraded compatibility).
 */
export function resolveLocationPDCompletionIds(
  sets: VisualSetCompletionRow[],
  /** Map of canonical location normalized_name → id for degraded fallback */
  locationNameToId?: Map<string, string>,
): Set<string> {
  const ids = new Set<string>();
  for (const s of sets) {
    if (s.domain !== 'production_design_location') continue;
    if (!isActiveSetStatus(s.status)) continue;
    // Primary: canonical target_id linkage
    if (s.target_id) {
      ids.add(s.target_id);
      continue;
    }
    // Degraded compatibility: match target_name to location name → id
    // This path is explicitly labeled as compatibility-only.
    if (locationNameToId && s.target_name) {
      const fallbackId = locationNameToId.get(s.target_name.toLowerCase().trim());
      if (fallbackId) ids.add(fallbackId);
    }
  }
  return ids;
}

/**
 * Check if a visual set status counts as "active" for completion purposes.
 */
export function isActiveSetStatus(status: string): boolean {
  return ACTIVE_SET_STATUSES.includes(status as any);
}

/**
 * Domain-specific completion proof helpers.
 * These encapsulate the real canonical completion definition per domain.
 */
export function isCharacterIdentityComplete(
  characterKey: string,
  identityCompletionKeys: Set<string>,
): boolean {
  return identityCompletionKeys.has(characterKey.toLowerCase().trim());
}

export function isCharacterWardrobeComplete(
  characterKey: string,
  wardrobeCompletionKeys: Set<string>,
): boolean {
  return wardrobeCompletionKeys.has(characterKey.toLowerCase().trim());
}

export function isLocationPDComplete(
  locationId: string,
  pdCompletionIds: Set<string>,
): boolean {
  return pdCompletionIds.has(locationId);
}
