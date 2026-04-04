/**
 * characterDatasetCanonHash — Deterministic hash computation for Character Visual Dataset
 * source inputs. Used to detect when a dataset is stale relative to its canonical inputs.
 *
 * Single canonical hashing function. Do NOT duplicate elsewhere.
 */

export interface CharacterDatasetHashInputs {
  character: {
    canonical_name: string;
    role: string;
    traits: string;
    age: string;
    gender: string;
  };
  canon: {
    world_description: string;
    setting: string;
    tone_style: string;
  };
  dna: {
    visual_prompt_block: string;
    identity_signature: string;
  };
  /** Actor description + negative prompt sorted */
  actorInputs: string[];
}

/**
 * Build hash inputs from raw sources, normalizing all fields.
 */
export function buildCharacterHashInputs(
  character: { name?: string; role?: string; traits?: string; age?: string; gender?: string } | null,
  canonJson: Record<string, unknown> | null,
  dnaRow: { visual_prompt_block?: string; identity_signature?: unknown } | null,
  actorInputs: string[],
): CharacterDatasetHashInputs {
  const s = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim().toLowerCase();
    if (Array.isArray(v)) return v.map(i => String(i)).join(',').toLowerCase();
    return JSON.stringify(v).toLowerCase();
  };

  return {
    character: {
      canonical_name: s(character?.name),
      role: s(character?.role),
      traits: s(character?.traits),
      age: s(character?.age),
      gender: s(character?.gender),
    },
    canon: {
      world_description: s(canonJson?.world_description),
      setting: s(canonJson?.setting),
      tone_style: s(canonJson?.tone_style),
    },
    dna: {
      visual_prompt_block: s(dnaRow?.visual_prompt_block),
      identity_signature: s(dnaRow?.identity_signature),
    },
    actorInputs: [...actorInputs].sort().map(a => a.toLowerCase().trim()),
  };
}

/**
 * Compute a deterministic hash string from character dataset hash inputs.
 * Normalizes actorInputs internally (sort + lowercase + trim).
 */
export function computeCharacterCanonHash(inputs: CharacterDatasetHashInputs): string {
  const normalized: CharacterDatasetHashInputs = {
    ...inputs,
    actorInputs: [...inputs.actorInputs].sort().map(a => a.toLowerCase().trim()),
  };
  const serialized = JSON.stringify(normalized);
  let hash = 5381;
  for (let i = 0; i < serialized.length; i++) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(i)) | 0;
  }
  return `cvd_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Convenience: compute hash directly from raw sources.
 */
export function computeCharacterCanonHashFromSources(
  character: { name?: string; role?: string; traits?: string; age?: string; gender?: string } | null,
  canonJson: Record<string, unknown> | null,
  dnaRow: { visual_prompt_block?: string; identity_signature?: unknown } | null,
  actorInputs: string[],
): string {
  return computeCharacterCanonHash(buildCharacterHashInputs(character, canonJson, dnaRow, actorInputs));
}

/**
 * Check freshness: compare stored hash against current computed hash.
 */
export function evaluateCharacterFreshness(
  storedHash: string | null,
  currentHash: string,
): { status: 'fresh' | 'stale' | 'unknown'; reason: string | null } {
  if (!storedHash) {
    return { status: 'unknown', reason: 'No source hash recorded' };
  }
  if (storedHash === currentHash) {
    return { status: 'fresh', reason: null };
  }
  return { status: 'stale', reason: 'Source canon/DNA/actor inputs have changed since dataset was built' };
}
