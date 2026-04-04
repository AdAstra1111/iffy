/**
 * castingProfile — Character Casting Profile built from canonical process evidence.
 * 
 * DETERMINISTIC. READ-ONLY. No LLM.
 * Delegates to processEvidenceResolver for multi-source aggregation.
 */

import { resolveCharacterEvidence, type CharacterEvidenceProfile, type EvidenceSource, type EvidenceStrength } from './processEvidenceResolver';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PhysicalProfile {
  gender: string | null;
  age_range: string | null;
  ethnicity: string | null;
  body_type: string | null;
  height: string | null;
  key_visual_traits: string[];
}

export interface EmotionalProfile {
  core_traits: string[];
  emotional_baseline: string | null;
  emotional_range: string | null;
}

export interface NarrativeProfile {
  role_type: string | null;
  archetype: string | null;
  energy_level: string | null;
  scene_count: number;
  scene_evidence: string[];
}

export interface CharacterCastingProfile {
  character_key: string;
  display_name: string;
  physical: PhysicalProfile;
  emotional: EmotionalProfile;
  narrative: NarrativeProfile;
  completeness: number;
  /** Evidence provenance */
  evidence_strength: EvidenceStrength;
  sources: EvidenceSource[];
  missing_sources: string[];
}

// ── Core Resolution ──────────────────────────────────────────────────────────

export async function buildCharacterCastingProfile(
  projectId: string,
  characterKey: string,
): Promise<CharacterCastingProfile | null> {
  const evidence = await resolveCharacterEvidence(projectId, characterKey);

  return {
    character_key: evidence.character_key,
    display_name: evidence.display_name,
    physical: {
      gender: evidence.gender,
      age_range: evidence.age_range,
      ethnicity: evidence.ethnicity,
      body_type: evidence.body_type,
      height: evidence.height,
      key_visual_traits: evidence.key_visual_traits,
    },
    emotional: {
      core_traits: evidence.core_traits,
      emotional_baseline: evidence.emotional_baseline,
      emotional_range: evidence.emotional_range,
    },
    narrative: {
      role_type: evidence.role_type,
      archetype: evidence.archetype,
      energy_level: evidence.energy_level,
      scene_count: evidence.scene_count,
      scene_evidence: evidence.scene_evidence,
    },
    completeness: evidence.completeness,
    evidence_strength: evidence.evidence_strength,
    sources: evidence.sources,
    missing_sources: evidence.missing_sources,
  };
}
