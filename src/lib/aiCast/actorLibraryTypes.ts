/**
 * Actor Library Types — strict, explicit types for the roster library view.
 * Uses approved_version_id as canonical source. No fallbacks.
 */

export interface ConvergenceProvenance {
  source_run_id: string;
  source_candidate_id: string;
  source_round_id: string;
  source_mode: string;
  source_score: number | null;
  source_score_band: string | null;
  source_confidence: string | null;
  promoted_at: string;
}

export interface LibraryActorAsset {
  id: string;
  actor_version_id: string;
  asset_type: string;
  public_url: string;
  storage_path: string;
  meta_json: Record<string, unknown>;
  created_at: string;
}

export interface LibraryActorVersion {
  id: string;
  actor_id: string;
  version_number: number;
  recipe_json: {
    invariants?: string[];
    allowed_variations?: string[];
    camera_rules?: string[];
    lighting_rules?: string[];
    convergence_provenance?: ConvergenceProvenance;
    [key: string]: unknown;
  };
  is_approved: boolean;
  created_at: string;
  created_by: string | null;
  ai_actor_assets?: LibraryActorAsset[];
}

export interface LibraryActor {
  id: string;
  name: string;
  description: string;
  negative_prompt: string;
  tags: string[];
  status: string;
  roster_ready: boolean;
  approved_version_id: string | null;
  promotion_status: string | null;
  created_at: string;
  updated_at: string;
  /** Joined approved version (null if no approved_version_id) */
  approvedVersion: LibraryActorVersion | null;
}

/**
 * Resolve primary display image from approved version assets.
 * Preference: reference_headshot > any asset with public_url.
 */
export function resolveActorPrimaryImage(version: LibraryActorVersion | null): string | null {
  if (!version?.ai_actor_assets?.length) return null;
  const assets = version.ai_actor_assets;
  const headshot = assets.find(a => a.asset_type === 'reference_headshot' && a.public_url);
  if (headshot) return headshot.public_url;
  const anyWithUrl = assets.find(a => a.public_url);
  return anyWithUrl?.public_url ?? null;
}

/**
 * Extract convergence provenance from version recipe_json.
 * Returns null if not present — no fabrication.
 */
export function extractConvergenceProvenance(version: LibraryActorVersion | null): ConvergenceProvenance | null {
  if (!version?.recipe_json?.convergence_provenance) return null;
  const p = version.recipe_json.convergence_provenance;
  if (!p.source_run_id || !p.source_candidate_id) return null;
  return p;
}

/**
 * Parse roster number from actor name (e.g., "[0042] — Name" → 42).
 * Returns null if no roster prefix found.
 */
export function parseRosterNumber(name: string): number | null {
  const match = name.match(/^\[(\d{4})\]/);
  return match ? parseInt(match[1], 10) : null;
}
