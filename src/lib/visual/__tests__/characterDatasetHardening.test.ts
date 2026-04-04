/**
 * Character Visual Dataset Hardening Tests
 */
import { describe, it, expect } from 'vitest';
import {
  computeCharacterCanonHash,
  computeCharacterCanonHashFromSources,
  evaluateCharacterFreshness,
  buildCharacterHashInputs,
} from '../characterDatasetCanonHash';
import { mapCastSlotToDatasetSlot, getAllMappedCastSlots } from '../characterDatasetSlotMapping';
import { buildCharacterVisualDataset } from '../characterDatasetBuilder';
import { resolveCharacterDatasetForSlot } from '../characterDatasetRetrievalResolver';

describe('characterDatasetCanonHash', () => {
  const baseCharacter = { name: 'Hana', role: 'potter', traits: 'gentle, determined', age: 'young woman', gender: 'female' };
  const baseCanon = { world_description: 'Feudal Japan', setting: 'rural village', tone_style: 'atmospheric drama' };
  const baseDna = { visual_prompt_block: 'young woman with calloused hands', identity_signature: '{}' };

  it('produces deterministic hash', () => {
    const h1 = computeCharacterCanonHashFromSources(baseCharacter, baseCanon, baseDna, ['tag1', 'tag2']);
    const h2 = computeCharacterCanonHashFromSources(baseCharacter, baseCanon, baseDna, ['tag1', 'tag2']);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^cvd_[0-9a-f]{8}$/);
  });

  it('normalizes actorInputs order internally', () => {
    const h1 = computeCharacterCanonHashFromSources(baseCharacter, baseCanon, baseDna, ['beta', 'alpha']);
    const h2 = computeCharacterCanonHashFromSources(baseCharacter, baseCanon, baseDna, ['alpha', 'beta']);
    expect(h1).toBe(h2);
  });

  it('changes hash when character traits change', () => {
    const h1 = computeCharacterCanonHashFromSources(baseCharacter, baseCanon, baseDna, []);
    const modified = { ...baseCharacter, traits: 'fierce, noble' };
    const h2 = computeCharacterCanonHashFromSources(modified, baseCanon, baseDna, []);
    expect(h1).not.toBe(h2);
  });

  it('evaluates freshness correctly', () => {
    const hash = computeCharacterCanonHashFromSources(baseCharacter, baseCanon, baseDna, []);
    expect(evaluateCharacterFreshness(hash, hash)).toEqual({ status: 'fresh', reason: null });
    expect(evaluateCharacterFreshness(hash, 'cvd_different')).toEqual({
      status: 'stale',
      reason: 'Source canon/DNA/actor inputs have changed since dataset was built',
    });
    expect(evaluateCharacterFreshness(null, hash)).toEqual({
      status: 'unknown',
      reason: 'No source hash recorded',
    });
  });
});

describe('characterDatasetSlotMapping', () => {
  it('maps identity_headshot to portrait', () => {
    const result = mapCastSlotToDatasetSlot('identity_headshot');
    expect(result).toEqual({ status: 'mapped', datasetSlotKey: 'portrait' });
  });

  it('maps full_body correctly', () => {
    const result = mapCastSlotToDatasetSlot('identity_full_body');
    expect(result).toEqual({ status: 'mapped', datasetSlotKey: 'full_body' });
  });

  it('returns unmapped for unknown slots', () => {
    const result = mapCastSlotToDatasetSlot('unknown_slot');
    expect(result).toEqual({ status: 'unmapped', castSlotKey: 'unknown_slot' });
  });

  it('getAllMappedCastSlots returns non-empty', () => {
    const slots = getAllMappedCastSlots();
    expect(slots.length).toBeGreaterThan(5);
    expect(slots).toContain('identity_headshot');
    expect(slots).toContain('full_body');
  });
});

describe('characterDatasetBuilder', () => {
  it('builds a complete dataset draft', () => {
    const draft = buildCharacterVisualDataset(
      'Lord Kageyama',
      { name: 'Lord Kageyama', role: 'antagonist daimyo', traits: 'commanding, tall, imposing, scarred' },
      { world_description: 'Feudal Japan', setting: 'mountain castle', tone_style: 'dark drama' },
      { visual_prompt_block: 'tall imposing man with battle scar across face', traits_json: JSON.stringify([{ label: 'tall' }, { label: 'scarred face' }]) },
      { id: 'actor-1', description: 'Powerful warlord', negative_prompt: 'feminine, young, soft', tags: ['warrior', 'antagonist'] },
    );

    expect(draft.canonical_name).toBe('Lord Kageyama');
    expect(draft.identity_type).toBe('character');
    expect(draft.sex_gender_presentation).toBe('masculine');
    expect(draft.identity_core.primary.length).toBeGreaterThan(0);
    expect(draft.slot_portrait.primary_truths.length).toBeGreaterThan(0);
    expect(draft.slot_full_body.primary_truths.length).toBeGreaterThan(0);
    expect(draft.forbidden_drift.forbidden).toContain('feminine');
    expect(draft.completeness_score).toBeGreaterThan(0);
    expect(draft.casting_labels).toContain('warrior');
  });

  it('handles missing inputs gracefully', () => {
    const draft = buildCharacterVisualDataset('Unknown', null, null, null, null);
    expect(draft.canonical_name).toBe('Unknown');
    expect(draft.age_band).toBe('adult');
    expect(draft.completeness_score).toBeGreaterThanOrEqual(0);
    expect(draft.slot_portrait.primary_truths.length).toBeGreaterThan(0);
  });
});

describe('characterDatasetRetrievalResolver', () => {
  const mockDataset: any = {
    id: 'ds-1',
    project_id: 'proj-1',
    canonical_name: 'Hana',
    is_current: true,
    freshness_status: 'fresh',
    source_canon_hash: 'cvd_12345678',
    identity_invariants: { invariants: ['calloused hands', 'warm eyes'] },
    slot_portrait: {
      primary_truths: ['close-up face', 'identity-establishing'],
      secondary_truths: ['warm brown eyes'],
      contextual: ['gentle expression'],
      forbidden_drift: ['age drift'],
      hard_negatives: ['blurry'],
      notes: '',
    },
    slot_full_body: {
      primary_truths: ['full body visible'],
      secondary_truths: [],
      contextual: [],
      forbidden_drift: [],
      hard_negatives: [],
      notes: '',
    },
  };

  it('resolves fresh dataset for mapped slot', () => {
    const result = resolveCharacterDatasetForSlot({
      castSlotKey: 'identity_headshot',
      characterName: 'Hana',
      datasets: [mockDataset],
      currentCanonHash: 'cvd_12345678',
    });

    expect(result.mode).toBe('fresh_dataset');
    expect(result.datasetSlotKey).toBe('portrait');
    expect(result.promptBlocks?.primaryBlock).toContain('close-up face');
    expect(result.promptBlocks?.invariantsBlock).toContain('calloused hands');
    expect(result.negatives).toContain('blurry');
  });

  it('returns stale_dataset when hash differs', () => {
    const result = resolveCharacterDatasetForSlot({
      castSlotKey: 'identity_headshot',
      characterName: 'Hana',
      datasets: [mockDataset],
      currentCanonHash: 'cvd_different',
    });
    expect(result.mode).toBe('stale_dataset');
  });

  it('returns missing_dataset for unknown character', () => {
    const result = resolveCharacterDatasetForSlot({
      castSlotKey: 'identity_headshot',
      characterName: 'Nobody',
      datasets: [mockDataset],
      currentCanonHash: null,
    });
    expect(result.mode).toBe('missing_dataset');
  });

  it('returns unmapped_slot for unknown slots', () => {
    const result = resolveCharacterDatasetForSlot({
      castSlotKey: 'unknown_slot',
      characterName: 'Hana',
      datasets: [mockDataset],
      currentCanonHash: null,
    });
    expect(result.mode).toBe('unmapped_slot');
  });
});
