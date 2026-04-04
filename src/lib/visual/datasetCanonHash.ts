/**
 * datasetCanonHash — Deterministic hash computation for Location Visual Dataset
 * source inputs. Used to detect when a dataset is stale relative to its
 * canonical inputs.
 *
 * Single canonical hashing function. Do NOT duplicate elsewhere.
 */

import type { CanonLocation } from '@/hooks/useCanonLocations';

export interface DatasetHashInputs {
  /** Location-specific fields */
  location: {
    canonical_name: string;
    description: string | null;
    geography: string | null;
    era_relevance: string | null;
    interior_or_exterior: string | null;
    location_type: string;
  };
  /** World-level canon fields */
  canon: {
    world_description: string;
    setting: string;
    tone_style: string;
  };
  /** Style profile fields */
  style: {
    period: string;
    lighting_philosophy: string;
    texture_materiality: string;
    color_response: string;
  };
  /** Material palette sorted */
  materialPalette: string[];
}

/**
 * Build hash inputs from raw sources, normalizing all fields.
 */
export function buildHashInputs(
  location: CanonLocation,
  canonJson: Record<string, unknown> | null,
  styleProfile: { period?: string; lighting_philosophy?: string; texture_materiality?: string; color_response?: string } | null,
  materialPalette: string[],
): DatasetHashInputs {
  const s = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim().toLowerCase();
    if (Array.isArray(v)) return v.map(i => String(i)).join(',').toLowerCase();
    return JSON.stringify(v).toLowerCase();
  };

  return {
    location: {
      canonical_name: s(location.canonical_name),
      description: s(location.description),
      geography: s(location.geography),
      era_relevance: s(location.era_relevance),
      interior_or_exterior: s(location.interior_or_exterior),
      location_type: s(location.location_type),
    },
    canon: {
      world_description: s(canonJson?.world_description),
      setting: s(canonJson?.setting),
      tone_style: s(canonJson?.tone_style),
    },
    style: {
      period: s(styleProfile?.period),
      lighting_philosophy: s(styleProfile?.lighting_philosophy),
      texture_materiality: s(styleProfile?.texture_materiality),
      color_response: s(styleProfile?.color_response),
    },
    materialPalette: [...materialPalette].sort().map(m => m.toLowerCase().trim()),
  };
}

/**
 * Compute a deterministic hash string from dataset hash inputs.
 * Uses a simple djb2-like string hash for speed and determinism.
 * No crypto dependency required.
 *
 * IMPORTANT: Normalizes materialPalette internally (sort + lowercase + trim)
 * so callers never need to pre-sort. This is the single canonical hash function.
 */
export function computeCanonHash(inputs: DatasetHashInputs): string {
  // Normalize materialPalette internally to guarantee order-independence
  const normalized: DatasetHashInputs = {
    ...inputs,
    materialPalette: [...inputs.materialPalette].sort().map(m => m.toLowerCase().trim()),
  };
  const serialized = JSON.stringify(normalized);
  let hash = 5381;
  for (let i = 0; i < serialized.length; i++) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(i)) | 0;
  }
  // Return as hex string with prefix for readability
  return `lvd_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Convenience: compute hash directly from raw sources.
 */
export function computeCanonHashFromSources(
  location: CanonLocation,
  canonJson: Record<string, unknown> | null,
  styleProfile: { period?: string; lighting_philosophy?: string; texture_materiality?: string; color_response?: string } | null,
  materialPalette: string[],
): string {
  return computeCanonHash(buildHashInputs(location, canonJson, styleProfile, materialPalette));
}

/**
 * Check freshness: compare stored hash against current computed hash.
 */
export function evaluateFreshness(
  storedHash: string | null,
  currentHash: string,
): { status: 'fresh' | 'stale' | 'unknown'; reason: string | null } {
  if (!storedHash) {
    return { status: 'unknown', reason: 'No source hash recorded' };
  }
  if (storedHash === currentHash) {
    return { status: 'fresh', reason: null };
  }
  return { status: 'stale', reason: 'Source canon/style inputs have changed since dataset was built' };
}
