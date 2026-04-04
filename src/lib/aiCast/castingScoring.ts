/**
 * castingScoring — Canonical scoring influence from CharacterCastingProfile.
 *
 * Provides weighted scoring adjustments based on character canon,
 * ensuring that profile data affects candidate ranking beyond just prompts.
 *
 * Used by: edge function post-generation validation + client-side ranking.
 */

import type { CharacterCastingProfile } from './castingProfile';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CastingScoringResult {
  /** Total score adjustment from profile matching (-20 to +20) */
  adjustment: number;
  /** Per-axis breakdown */
  axes: {
    physical_match: number;
    emotional_vibe: number;
    narrative_fit: number;
  };
  /** Human-readable reason */
  reason: string;
}

export interface CandidateGenerationMeta {
  hard_constraints?: {
    gender?: string | null;
    age_range?: string | null;
    ethnicity?: string | null;
  };
  variation?: string;
  casting_note?: string;
  mood?: string;
  character_dna_used?: boolean;
  exploration_mode?: boolean;
}

// ── Hard Constraint Admission ────────────────────────────────────────────────

export interface HardConstraintAdmissionResult {
  admitted: boolean;
  rejectionReasons: string[];
}

/**
 * Post-generation hard constraint admission gate.
 * Validates generation metadata against character profile constraints.
 * Returns admitted=false if the candidate violates hard constraints.
 */
export function validateHardConstraintAdmission(
  profile: CharacterCastingProfile | null,
  generationMeta: CandidateGenerationMeta,
): HardConstraintAdmissionResult {
  const reasons: string[] = [];

  if (!profile) {
    // No profile = no constraints to enforce beyond what's in generation_config
    return { admitted: true, rejectionReasons: [] };
  }

  const constraints = generationMeta.hard_constraints;
  if (!constraints) {
    return { admitted: true, rejectionReasons: [] };
  }

  // Gender mismatch: if profile says male but generation didn't enforce it
  if (profile.physical.gender && constraints.gender) {
    const profileGender = profile.physical.gender.toLowerCase().trim();
    const constraintGender = constraints.gender.toLowerCase().trim();
    // Check for contradictory constraint application
    if (profileGender !== constraintGender) {
      reasons.push(`Gender mismatch: profile=${profileGender}, applied=${constraintGender}`);
    }
  }

  // If profile has gender but no constraint was applied at all — that's a gap
  if (profile.physical.gender && !constraints.gender) {
    reasons.push(`Gender constraint missing: profile specifies ${profile.physical.gender} but no constraint was enforced`);
  }

  return {
    admitted: reasons.length === 0,
    rejectionReasons: reasons,
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score a candidate's generation metadata against the character casting profile.
 * Higher adjustment = better match to the character's canonical profile.
 */
export function scoreCandidateAgainstProfile(
  profile: CharacterCastingProfile | null,
  generationMeta: CandidateGenerationMeta,
): CastingScoringResult {
  if (!profile) {
    return { adjustment: 0, axes: { physical_match: 0, emotional_vibe: 0, narrative_fit: 0 }, reason: 'no profile' };
  }

  let physical_match = 0;
  let emotional_vibe = 0;
  let narrative_fit = 0;

  // Physical: DNA usage + constraint alignment
  if (generationMeta.character_dna_used) physical_match += 3;
  if (generationMeta.hard_constraints?.gender && profile.physical.gender) physical_match += 2;
  if (generationMeta.hard_constraints?.age_range && profile.physical.age_range) physical_match += 2;
  if (generationMeta.hard_constraints?.ethnicity && profile.physical.ethnicity) physical_match += 1;

  // Emotional: variation/mood alignment with profile traits
  const mood = (generationMeta.mood || '').toLowerCase();
  const castingNote = (generationMeta.casting_note || '').toLowerCase();

  if (profile.narrative.energy_level === 'dominant') {
    if (mood.includes('intense') || mood.includes('powerful') || castingNote.includes('authority')) {
      emotional_vibe += 3;
    }
    if (mood.includes('soft') || mood.includes('gentle')) {
      emotional_vibe -= 2;
    }
  } else if (profile.narrative.energy_level === 'passive') {
    if (mood.includes('quiet') || mood.includes('soft') || castingNote.includes('understated')) {
      emotional_vibe += 3;
    }
    if (mood.includes('intense') || mood.includes('powerful')) {
      emotional_vibe -= 1;
    }
  }

  // Narrative: archetype alignment
  const archetype = (profile.narrative.archetype || '').toLowerCase();
  if (archetype) {
    if (archetype.includes('action') || archetype.includes('warrior')) {
      if (castingNote.includes('physical') || castingNote.includes('authority')) narrative_fit += 3;
    }
    if (archetype.includes('intellectual') || archetype.includes('mentor')) {
      if (castingNote.includes('contemplative') || castingNote.includes('classical')) narrative_fit += 3;
    }
    if (archetype.includes('trickster') || archetype.includes('comic')) {
      if (castingNote.includes('unexpected') || castingNote.includes('energy')) narrative_fit += 3;
    }
  }

  // Role type weighting
  if (profile.narrative.role_type === 'protagonist') {
    if (castingNote.includes('screen presence') || castingNote.includes('magnetic')) narrative_fit += 2;
  } else if (profile.narrative.role_type === 'antagonist') {
    if (castingNote.includes('authority') || castingNote.includes('intensity')) narrative_fit += 2;
  }

  const adjustment = physical_match + emotional_vibe + narrative_fit;

  const parts: string[] = [];
  if (physical_match > 0) parts.push(`physical +${physical_match}`);
  if (emotional_vibe !== 0) parts.push(`vibe ${emotional_vibe > 0 ? '+' : ''}${emotional_vibe}`);
  if (narrative_fit > 0) parts.push(`narrative +${narrative_fit}`);

  return {
    adjustment,
    axes: { physical_match, emotional_vibe, narrative_fit },
    reason: parts.length > 0 ? parts.join(', ') : 'neutral match',
  };
}

// ── Duplicate Suppression ────────────────────────────────────────────────────

/**
 * Check if a candidate is a near-duplicate of existing candidates.
 * Uses variation style + batch_id to detect redundancy.
 */
export function isDuplicateCandidate(
  newVariation: string,
  existingVariations: string[],
): boolean {
  if (!newVariation) return false;
  const normalized = newVariation.toLowerCase().trim();
  return existingVariations.some(v => v.toLowerCase().trim() === normalized);
}
