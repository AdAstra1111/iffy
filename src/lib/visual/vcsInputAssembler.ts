/**
 * vcsInputAssembler.ts — Pure helper for assembling VCS inputs from real data.
 *
 * Separated from the hook for testability. No React dependencies.
 * Consumes canonical upstream truth and returns deterministic VCSInputs.
 */

import type { VCSInputs } from '@/lib/visual/visualCoherenceEngine';
import type { TemporalTruth } from '@/lib/visual/temporalTruthResolver';
import type { CharacterWardrobeProfile } from '@/lib/visual/characterWardrobeExtractor';
import { resolveEffectiveProfile, type EffectiveWardrobeProfile } from '@/lib/visual/effectiveProfileResolver';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VCSCharacterInput {
  name: string;
  effectiveProfile: EffectiveWardrobeProfile | null;
  hasLockedActor: boolean;
  hasHeroFrame: boolean;
}

export interface VCSDiagnostics {
  worldSystemFound: boolean;
  temporalSource: 'persisted' | 'live' | 'fallback';
  charactersWithEffectiveProfiles: number;
  charactersWithoutProfiles: number;
  totalCharacters: number;
  temporalEra: string;
  temporalConfidence: string;
}

export interface VCSAssemblyResult {
  inputs: VCSInputs;
  diagnostics: VCSDiagnostics;
}

// ── Assembly ─────────────────────────────────────────────────────────────────

/**
 * Resolve effective wardrobe profiles for VCS scoring.
 * Uses the canonical effective profile resolver — no duplicate logic.
 */
export function resolveCharacterVCSInputs(
  characters: Array<{
    name: string;
    rawProfile: CharacterWardrobeProfile | null;
    hasLockedActor: boolean;
    hasHeroFrame: boolean;
  }>,
  temporalTruth: TemporalTruth | null,
): { characters: VCSCharacterInput[]; withProfiles: number; withoutProfiles: number } {
  let withProfiles = 0;
  let withoutProfiles = 0;

  const resolved = characters.map(c => {
    let effectiveProfile: EffectiveWardrobeProfile | null = null;
    if (c.rawProfile && temporalTruth) {
      effectiveProfile = resolveEffectiveProfile(c.rawProfile, temporalTruth);
      withProfiles++;
    } else if (c.rawProfile) {
      // IEL: Use canonical resolver even with null temporal truth — it handles null
      // correctly (no filtering applied, was_temporally_normalized = false).
      // DO NOT manually construct EffectiveWardrobeProfile from raw fields.
      effectiveProfile = resolveEffectiveProfile(c.rawProfile, null);
      withProfiles++;
    } else {
      withoutProfiles++;
    }

    return {
      name: c.name,
      effectiveProfile,
      hasLockedActor: c.hasLockedActor,
      hasHeroFrame: c.hasHeroFrame,
    };
  });

  return { characters: resolved, withProfiles, withoutProfiles };
}

/**
 * Assemble fully grounded VCS inputs from real upstream data.
 */
export function assembleVCSInputs(params: {
  format: string;
  genre: string;
  tone: string;
  temporalTruth: TemporalTruth | null;
  temporalSource: 'persisted' | 'live' | 'fallback';
  characters: VCSCharacterInput[];
  charactersWithProfiles: number;
  charactersWithoutProfiles: number;
  pdFamiliesTotal: number;
  pdFamiliesLocked: number;
  pdDomainsCovered: string[];
  heroFrameCount: number;
  heroFrameApproved: number;
  heroFramePrimaryApproved: boolean;
  hasWorldSystem: boolean;
  hasVisualStyle: boolean;
  hasCanon: boolean;
  prestigeStyleKey?: string;
}): VCSAssemblyResult {
  const inputs: VCSInputs = {
    format: params.format,
    genre: params.genre,
    tone: params.tone,
    temporalTruth: params.temporalTruth,
    characters: params.characters,
    pdFamiliesTotal: params.pdFamiliesTotal,
    pdFamiliesLocked: params.pdFamiliesLocked,
    pdDomainsCovered: params.pdDomainsCovered,
    heroFrameCount: params.heroFrameCount,
    heroFrameApproved: params.heroFrameApproved,
    heroFramePrimaryApproved: params.heroFramePrimaryApproved,
    hasWorldSystem: params.hasWorldSystem,
    hasVisualStyle: params.hasVisualStyle,
    hasCanon: params.hasCanon,
    prestigeStyleKey: params.prestigeStyleKey,
  };

  const diagnostics: VCSDiagnostics = {
    worldSystemFound: params.hasWorldSystem,
    temporalSource: params.temporalSource,
    charactersWithEffectiveProfiles: params.charactersWithProfiles,
    charactersWithoutProfiles: params.charactersWithoutProfiles,
    totalCharacters: params.characters.length,
    temporalEra: params.temporalTruth?.era || 'unknown',
    temporalConfidence: params.temporalTruth?.confidence || 'unknown',
  };

  return { inputs, diagnostics };
}
