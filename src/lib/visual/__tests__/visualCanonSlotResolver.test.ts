/**
 * visualCanonSlotResolver tests — canonical missing-slot resolution.
 *
 * IMPORTANT: Completion is measured from visual_sets (canonical substrate),
 * not from raw project_images presence. Wardrobe profile existence ≠ visual completion.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveVisualCanonSlots,
  getMissingSlotsByDependencyOrder,
  type SlotResolverInputs,
} from '../visualCanonSlotResolver';
import {
  resolveIdentityCompletionKeys,
  resolveWardrobeVisualCompletionKeys,
  resolveLocationPDCompletionIds,
  isCharacterIdentityComplete,
  isCharacterWardrobeComplete,
  isLocationPDComplete,
  type VisualSetCompletionRow,
} from '../canonCompletionProof';

function makeInputs(overrides: Partial<SlotResolverInputs> = {}): SlotResolverInputs {
  return {
    characters: [
      { key: 'alice', name: 'Alice' },
      { key: 'bob', name: 'Bob' },
    ],
    locations: [
      { id: 'loc-1', name: 'Warehouse' },
      { id: 'loc-2', name: 'Rooftop' },
    ],
    characterIdentityLinked: new Set<string>(),
    characterWardrobeVisualLinked: new Set<string>(),
    characterWardrobeTruthAvailable: new Set<string>(),
    locationPDLinked: new Set<string>(),
    castBound: new Set<string>(),
    wardrobeExtractionExists: false,
    ...overrides,
  };
}

describe('resolveVisualCanonSlots', () => {
  it('counts all slots as missing/blocked when nothing linked', () => {
    const result = resolveVisualCanonSlots(makeInputs());
    expect(result.totalSlots).toBe(6);
    expect(result.completeSlots).toBe(0);
    expect(result.missingSlots).toBe(2); // locations
    expect(result.blockedSlots).toBe(4); // 2 identity + 2 wardrobe
  });

  it('marks character identity complete when linked', () => {
    const result = resolveVisualCanonSlots(makeInputs({
      characterIdentityLinked: new Set(['alice']),
      castBound: new Set(['alice', 'bob']),
    }));
    const identitySlots = result.slots.filter(s => s.domain === 'character_identity');
    expect(identitySlots.find(s => s.entityKey === 'alice')?.status).toBe('complete');
    expect(identitySlots.find(s => s.entityKey === 'bob')?.status).toBe('missing');
  });

  it('blocks character identity when no cast binding', () => {
    const result = resolveVisualCanonSlots(makeInputs({
      castBound: new Set(['alice']),
    }));
    const bobIdentity = result.slots.find(s => s.domain === 'character_identity' && s.entityKey === 'bob');
    expect(bobIdentity?.status).toBe('blocked');
    expect(bobIdentity?.blocker).toMatch(/cast/i);
    expect(bobIdentity?.eligible).toBe(false);
  });

  it('marks location complete when PD linked', () => {
    const result = resolveVisualCanonSlots(makeInputs({
      locationPDLinked: new Set(['loc-1']),
    }));
    expect(result.byDomain.production_design_location.complete).toBe(1);
    expect(result.byDomain.production_design_location.missing).toBe(1);
  });

  // ── CRITICAL: wardrobe profile ≠ visual completion ──

  it('does NOT mark wardrobe complete just because profile exists', () => {
    const result = resolveVisualCanonSlots(makeInputs({
      wardrobeExtractionExists: true,
      characterWardrobeTruthAvailable: new Set(['alice']),
      characterIdentityLinked: new Set(['alice']),
      castBound: new Set(['alice']),
    }));
    const aliceWardrobe = result.slots.find(s => s.domain === 'character_wardrobe' && s.entityKey === 'alice');
    expect(aliceWardrobe?.status).toBe('missing');
    expect(aliceWardrobe?.eligible).toBe(true);
  });

  it('marks wardrobe complete only when visual is linked', () => {
    const result = resolveVisualCanonSlots(makeInputs({
      wardrobeExtractionExists: true,
      characterWardrobeTruthAvailable: new Set(['alice']),
      characterWardrobeVisualLinked: new Set(['alice']),
      characterIdentityLinked: new Set(['alice']),
      castBound: new Set(['alice']),
    }));
    const aliceWardrobe = result.slots.find(s => s.domain === 'character_wardrobe' && s.entityKey === 'alice');
    expect(aliceWardrobe?.status).toBe('complete');
  });

  it('blocks wardrobe when extraction not run', () => {
    const result = resolveVisualCanonSlots(makeInputs({
      wardrobeExtractionExists: false,
    }));
    const wardrobeSlots = result.slots.filter(s => s.domain === 'character_wardrobe');
    expect(wardrobeSlots.every(s => s.status === 'blocked')).toBe(true);
    expect(wardrobeSlots[0].blocker).toMatch(/extraction/i);
  });

  it('blocks wardrobe when truth missing for specific character', () => {
    const result = resolveVisualCanonSlots(makeInputs({
      wardrobeExtractionExists: true,
      characterWardrobeTruthAvailable: new Set(['alice']),
      characterIdentityLinked: new Set(['alice', 'bob']),
      castBound: new Set(['alice', 'bob']),
    }));
    const bobWardrobe = result.slots.find(s => s.domain === 'character_wardrobe' && s.entityKey === 'bob');
    expect(bobWardrobe?.status).toBe('blocked');
    expect(bobWardrobe?.blocker).toMatch(/wardrobe truth/i);
  });

  it('blocks wardrobe when identity visual missing', () => {
    const result = resolveVisualCanonSlots(makeInputs({
      wardrobeExtractionExists: true,
      characterWardrobeTruthAvailable: new Set(['alice']),
      castBound: new Set(['alice']),
    }));
    const aliceWardrobe = result.slots.find(s => s.domain === 'character_wardrobe' && s.entityKey === 'alice');
    expect(aliceWardrobe?.status).toBe('blocked');
    expect(aliceWardrobe?.blocker).toMatch(/identity/i);
  });

  it('complete slots are excluded from missing-slot list', () => {
    const result = resolveVisualCanonSlots(makeInputs({
      characterIdentityLinked: new Set(['alice', 'bob']),
      characterWardrobeVisualLinked: new Set(['alice', 'bob']),
      characterWardrobeTruthAvailable: new Set(['alice', 'bob']),
      locationPDLinked: new Set(['loc-1', 'loc-2']),
      castBound: new Set(['alice', 'bob']),
      wardrobeExtractionExists: true,
    }));
    expect(result.completeSlots).toBe(6);
    expect(result.missingSlots).toBe(0);
    expect(result.blockedSlots).toBe(0);
  });
});

describe('getMissingSlotsByDependencyOrder', () => {
  it('returns slots in dependency order: identity → wardrobe → location', () => {
    const coverage = resolveVisualCanonSlots(makeInputs({
      castBound: new Set(['alice', 'bob']),
      wardrobeExtractionExists: true,
      characterWardrobeTruthAvailable: new Set(['alice', 'bob']),
      characterIdentityLinked: new Set(['alice', 'bob']),
    }));
    const ordered = getMissingSlotsByDependencyOrder(coverage);
    expect(ordered.length).toBeGreaterThan(0);

    const domains = ordered.map(s => s.domain);
    const wardrobeIdx = domains.indexOf('character_wardrobe');
    const locationIdx = domains.indexOf('production_design_location');

    if (wardrobeIdx >= 0 && locationIdx >= 0) {
      expect(wardrobeIdx).toBeLessThan(locationIdx);
    }
  });

  it('excludes blocked slots from eligible list', () => {
    const coverage = resolveVisualCanonSlots(makeInputs());
    const ordered = getMissingSlotsByDependencyOrder(coverage);
    expect(ordered.every(s => s.domain === 'production_design_location')).toBe(true);
    expect(ordered.length).toBe(2);
  });

  it('never marks blocked slots as eligible', () => {
    const coverage = resolveVisualCanonSlots(makeInputs());
    const ordered = getMissingSlotsByDependencyOrder(coverage);
    expect(ordered.every(s => s.eligible)).toBe(true);
    expect(ordered.every(s => s.status === 'missing')).toBe(true);
  });

  it('wardrobe slots blocked when identity missing even if truth available', () => {
    const coverage = resolveVisualCanonSlots(makeInputs({
      castBound: new Set(['alice', 'bob']),
      wardrobeExtractionExists: true,
      characterWardrobeTruthAvailable: new Set(['alice', 'bob']),
    }));
    const ordered = getMissingSlotsByDependencyOrder(coverage);
    const wardrobeSlots = ordered.filter(s => s.domain === 'character_wardrobe');
    expect(wardrobeSlots.length).toBe(0);
  });
});

// ── Canonical completion proof helpers ──

describe('canonCompletionProof', () => {
  const makeSets = (...items: Partial<VisualSetCompletionRow>[]): VisualSetCompletionRow[] =>
    items.map((item, i) => ({
      id: `set-${i}`,
      domain: '',
      target_name: '',
      target_id: null,
      status: 'curating',
      ...item,
    }));

  describe('resolveIdentityCompletionKeys', () => {
    it('includes character_identity sets with active status', () => {
      const sets = makeSets(
        { domain: 'character_identity', target_name: 'Alice', status: 'locked' },
        { domain: 'character_identity', target_name: 'Bob', status: 'curating' },
      );
      const keys = resolveIdentityCompletionKeys(sets);
      expect(keys.has('alice')).toBe(true);
      expect(keys.has('bob')).toBe(true);
    });

    it('excludes archived and draft sets', () => {
      const sets = makeSets(
        { domain: 'character_identity', target_name: 'Alice', status: 'archived' },
        { domain: 'character_identity', target_name: 'Bob', status: 'draft' },
      );
      const keys = resolveIdentityCompletionKeys(sets);
      expect(keys.size).toBe(0);
    });

    it('ignores non-identity domains', () => {
      const sets = makeSets(
        { domain: 'character_costume_look', target_name: 'Alice', status: 'locked' },
      );
      const keys = resolveIdentityCompletionKeys(sets);
      expect(keys.size).toBe(0);
    });
  });

  describe('resolveWardrobeVisualCompletionKeys', () => {
    it('includes character_costume_look sets with active status', () => {
      const sets = makeSets(
        { domain: 'character_costume_look', target_name: 'Alice', status: 'ready_to_lock' },
      );
      const keys = resolveWardrobeVisualCompletionKeys(sets);
      expect(keys.has('alice')).toBe(true);
    });

    it('raw costume image without visual_set does NOT count', () => {
      // No visual_sets at all → empty
      const keys = resolveWardrobeVisualCompletionKeys([]);
      expect(keys.size).toBe(0);
    });

    it('excludes draft wardrobe sets', () => {
      const sets = makeSets(
        { domain: 'character_costume_look', target_name: 'Alice', status: 'draft' },
      );
      const keys = resolveWardrobeVisualCompletionKeys(sets);
      expect(keys.size).toBe(0);
    });
  });

  describe('resolveLocationPDCompletionIds', () => {
    it('prefers canonical target_id linkage', () => {
      const sets = makeSets(
        { domain: 'production_design_location', target_name: 'Warehouse', target_id: 'loc-1', status: 'locked' },
      );
      const ids = resolveLocationPDCompletionIds(sets);
      expect(ids.has('loc-1')).toBe(true);
    });

    it('falls back to target_name only when target_id is null', () => {
      const sets = makeSets(
        { domain: 'production_design_location', target_name: 'warehouse', target_id: null, status: 'curating' },
      );
      const nameToId = new Map([['warehouse', 'loc-1']]);
      const ids = resolveLocationPDCompletionIds(sets, nameToId);
      expect(ids.has('loc-1')).toBe(true);
    });

    it('degraded fallback does not outrank canonical linkage', () => {
      const sets = makeSets(
        { domain: 'production_design_location', target_name: 'warehouse', target_id: 'loc-1', status: 'locked' },
      );
      // Even if nameToId maps to a different id, target_id wins
      const nameToId = new Map([['warehouse', 'loc-wrong']]);
      const ids = resolveLocationPDCompletionIds(sets, nameToId);
      expect(ids.has('loc-1')).toBe(true);
      expect(ids.has('loc-wrong')).toBe(false);
    });
  });

  describe('individual completion helpers', () => {
    it('isCharacterIdentityComplete uses shared set', () => {
      const keys = new Set(['alice']);
      expect(isCharacterIdentityComplete('alice', keys)).toBe(true);
      expect(isCharacterIdentityComplete('Alice', keys)).toBe(true); // case-insensitive
      expect(isCharacterIdentityComplete('bob', keys)).toBe(false);
    });

    it('isCharacterWardrobeComplete uses shared set', () => {
      const keys = new Set(['alice']);
      expect(isCharacterWardrobeComplete('alice', keys)).toBe(true);
      expect(isCharacterWardrobeComplete('bob', keys)).toBe(false);
    });

    it('isLocationPDComplete uses shared set', () => {
      const ids = new Set(['loc-1']);
      expect(isLocationPDComplete('loc-1', ids)).toBe(true);
      expect(isLocationPDComplete('loc-2', ids)).toBe(false);
    });
  });

  describe('completion counts match canonical helpers', () => {
    it('resolver uses same keys as completion helpers', () => {
      const identityKeys = new Set(['alice']);
      const wardrobeKeys = new Set(['alice']);
      const pdIds = new Set(['loc-1']);

      const coverage = resolveVisualCanonSlots(makeInputs({
        characterIdentityLinked: identityKeys,
        characterWardrobeVisualLinked: wardrobeKeys,
        characterWardrobeTruthAvailable: new Set(['alice', 'bob']),
        locationPDLinked: pdIds,
        castBound: new Set(['alice', 'bob']),
        wardrobeExtractionExists: true,
      }));

      // Identity: alice complete, bob missing
      expect(coverage.byDomain.character_identity.complete).toBe(1);
      expect(isCharacterIdentityComplete('alice', identityKeys)).toBe(true);
      expect(isCharacterIdentityComplete('bob', identityKeys)).toBe(false);

      // Wardrobe: alice complete (has truth + identity + visual), bob blocked (no identity)
      expect(coverage.byDomain.character_wardrobe.complete).toBe(1);
      expect(isCharacterWardrobeComplete('alice', wardrobeKeys)).toBe(true);

      // Location: loc-1 complete, loc-2 missing
      expect(coverage.byDomain.production_design_location.complete).toBe(1);
      expect(isLocationPDComplete('loc-1', pdIds)).toBe(true);
    });
  });
});
