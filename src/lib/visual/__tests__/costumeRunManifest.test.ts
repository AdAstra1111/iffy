/**
 * costumeRunManifest.test.ts — Regression tests for run manifest,
 * fail-closed enforcement, cast scope freeze, and required-only scoping.
 */
import { describe, it, expect } from 'vitest';
import {
  createRunManifest,
  isSlotAllowedInRun,
  computeCastScopeHash,
  hasCastScopeDrifted,
  generateRunId,
  isCandidateFromRun,
  type CostumeRunManifest,
} from '../costumeRunManifest';
import {
  COSTUME_REQUIRED_SLOT_KEYS,
  COSTUME_LOOK_SLOTS,
} from '../costumeOnActor';

// ── A. requiredOnly run stamps allowed_slot_keys = required keys only ──

describe('createRunManifest', () => {
  it('required_only run has only required slot keys in allowed_slot_keys', () => {
    const manifest = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_abc');
    expect(manifest.generation_mode).toBe('required_only');
    expect(manifest.allowed_slot_keys).toEqual(COSTUME_REQUIRED_SLOT_KEYS);
    expect(manifest.allowed_slot_keys).toContain('full_body_primary');
    expect(manifest.allowed_slot_keys).toContain('three_quarter');
    expect(manifest.allowed_slot_keys).not.toContain('accessory_detail');
    expect(manifest.allowed_slot_keys).not.toContain('fabric_detail');
  });

  it('full run includes all slot keys provided', () => {
    const allKeys = COSTUME_LOOK_SLOTS.map(s => s.key);
    const manifest = createRunManifest('hana', 'work', 'full', allKeys, 'scope_abc');
    expect(manifest.generation_mode).toBe('full');
    expect(manifest.allowed_slot_keys).toEqual(allKeys);
  });

  it('generates unique run_id per call', () => {
    const m1 = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_abc');
    const m2 = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_abc');
    expect(m1.run_id).not.toBe(m2.run_id);
  });

  it('stamps cast_scope_hash on manifest', () => {
    const manifest = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_xyz');
    expect(manifest.cast_scope_hash).toBe('scope_xyz');
  });
});

// ── B. Optional slot cannot be generated or wired during requiredOnly ──

describe('isSlotAllowedInRun — fail-closed enforcement', () => {
  it('allows required slots in required_only run', () => {
    const manifest = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_abc');
    expect(isSlotAllowedInRun(manifest, 'full_body_primary')).toBe(true);
    expect(isSlotAllowedInRun(manifest, 'three_quarter')).toBe(true);
  });

  it('BLOCKS optional slots in required_only run', () => {
    const manifest = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_abc');
    expect(isSlotAllowedInRun(manifest, 'accessory_detail')).toBe(false);
    expect(isSlotAllowedInRun(manifest, 'fabric_detail')).toBe(false);
    expect(isSlotAllowedInRun(manifest, 'front_silhouette')).toBe(false);
    expect(isSlotAllowedInRun(manifest, 'back_silhouette')).toBe(false);
    expect(isSlotAllowedInRun(manifest, 'closure_detail')).toBe(false);
    expect(isSlotAllowedInRun(manifest, 'hair_grooming')).toBe(false);
  });

  it('BLOCKS unknown/identity slots in any run', () => {
    const allKeys = COSTUME_LOOK_SLOTS.map(s => s.key);
    const manifest = createRunManifest('hana', 'work', 'full', allKeys, 'scope_abc');
    expect(isSlotAllowedInRun(manifest, 'identity_reference')).toBe(false);
    expect(isSlotAllowedInRun(manifest, 'casting_reference')).toBe(false);
    expect(isSlotAllowedInRun(manifest, '')).toBe(false);
  });

  it('allows all costume slots in full run', () => {
    const allKeys = COSTUME_LOOK_SLOTS.map(s => s.key);
    const manifest = createRunManifest('hana', 'work', 'full', allKeys, 'scope_abc');
    for (const slot of COSTUME_LOOK_SLOTS) {
      expect(isSlotAllowedInRun(manifest, slot.key)).toBe(true);
    }
  });
});

// ── C. Historical optional candidates do not appear as current-run output ──

describe('isCandidateFromRun', () => {
  it('returns true for matching run_id', () => {
    expect(isCandidateFromRun('crun_123', 'crun_123')).toBe(true);
  });

  it('returns false for different run_id', () => {
    expect(isCandidateFromRun('crun_456', 'crun_123')).toBe(false);
  });

  it('returns false for null/undefined run_id (historical)', () => {
    expect(isCandidateFromRun(null, 'crun_123')).toBe(false);
    expect(isCandidateFromRun(undefined, 'crun_123')).toBe(false);
  });
});

// ── D. Required-only success toast only fires for required slots ──
// (This is behavioral — tested via manifest scoping above.
//  The toast in useCostumeOnActor only fires after processing required slots.)

describe('required-only completion semantics', () => {
  it('required_only manifest allowed_slot_keys has exactly COSTUME_REQUIRED_SLOT_KEYS', () => {
    const manifest = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_abc');
    expect(manifest.allowed_slot_keys.length).toBe(COSTUME_REQUIRED_SLOT_KEYS.length);
    for (const key of COSTUME_REQUIRED_SLOT_KEYS) {
      expect(manifest.allowed_slot_keys).toContain(key);
    }
  });
});

// ── E. Cast scope drift marks session stale ──

describe('computeCastScopeHash + hasCastScopeDrifted', () => {
  const cast1 = [
    { character_key: 'hana', ai_actor_id: 'a1', ai_actor_version_id: 'v1' },
    { character_key: 'kenji', ai_actor_id: 'a2', ai_actor_version_id: 'v2' },
  ];

  const cast1Shuffled = [
    { character_key: 'kenji', ai_actor_id: 'a2', ai_actor_version_id: 'v2' },
    { character_key: 'hana', ai_actor_id: 'a1', ai_actor_version_id: 'v1' },
  ];

  const cast2 = [
    { character_key: 'hana', ai_actor_id: 'a1', ai_actor_version_id: 'v1' },
    { character_key: 'kenji', ai_actor_id: 'a2', ai_actor_version_id: 'v2' },
    { character_key: 'yuki', ai_actor_id: 'a3', ai_actor_version_id: 'v3' },
  ];

  it('same cast produces same hash regardless of order', () => {
    const h1 = computeCastScopeHash(cast1);
    const h2 = computeCastScopeHash(cast1Shuffled);
    expect(h1).toBe(h2);
  });

  it('different cast produces different hash', () => {
    const h1 = computeCastScopeHash(cast1);
    const h2 = computeCastScopeHash(cast2);
    expect(h1).not.toBe(h2);
  });

  it('hasCastScopeDrifted returns false for same hash', () => {
    const h = computeCastScopeHash(cast1);
    expect(hasCastScopeDrifted(h, h)).toBe(false);
  });

  it('hasCastScopeDrifted returns true for different hash', () => {
    const h1 = computeCastScopeHash(cast1);
    const h2 = computeCastScopeHash(cast2);
    expect(hasCastScopeDrifted(h1, h2)).toBe(true);
  });
});

// ── F. Top-level completeness and row-level completeness use same canonical scope ──

describe('canonical scope consistency', () => {
  it('COSTUME_REQUIRED_SLOT_KEYS matches COSTUME_LOOK_SLOTS required entries', () => {
    const fromSlots = COSTUME_LOOK_SLOTS.filter(s => s.required).map(s => s.key);
    expect(COSTUME_REQUIRED_SLOT_KEYS).toEqual(fromSlots);
  });
});

// ── G. generateRunId produces unique values ──

describe('generateRunId', () => {
  it('produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRunId()));
    expect(ids.size).toBe(100);
  });

  it('IDs start with crun_ prefix', () => {
    const id = generateRunId();
    expect(id.startsWith('crun_')).toBe(true);
  });
});
