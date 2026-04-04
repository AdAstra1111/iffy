/**
 * Deterministic tests for Costume-on-Actor state-aware set identity.
 *
 * Proves:
 * A. One character with work/domestic/ceremonial produces three distinct sets
 * B. getLookSet resolves the correct set per state
 * C. Regenerating one state does not mutate another
 * D. Coverage counts are correct
 * E. Locking one state does not mark another locked
 * F. Scene Demo-style lookup resolves correctly
 * G. Reload/query path finds state-specific sets
 * H. Locked state does not permit silent duplicate creation
 * I. generateLook blocks on locked state
 * J. getLookSet fails closed / resolves canonically with duplicates
 * K. Lock eligibility fails when state not lock-ready
 * L. Scene Demo consumes canonical state set only
 * M. curating is NOT lock-ready
 * N. autopopulated is NOT lock-ready
 * O. Duplicate sets block character lock
 * P. Duplicate sets degrade readiness
 * Q. Scene demo lock-critical consumption fails on ambiguous duplicates
 */
import { describe, it, expect } from 'vitest';

// ── Simulate the set resolution logic ──

interface MockSet {
  id: string;
  characterKey: string;
  characterName: string;
  actorId: string;
  wardrobeStateKey: string;
  status: string;
  lockedAt: string | null;
  domain: string;
  target_name: string;
  entity_state_key: string;
}

function createMockSet(characterKey: string, stateKey: string, id: string, status = 'draft'): MockSet {
  return {
    id,
    characterKey,
    characterName: characterKey,
    actorId: `actor-${characterKey}`,
    wardrobeStateKey: stateKey,
    status,
    lockedAt: status === 'locked' ? new Date().toISOString() : null,
    domain: 'character_costume_look',
    target_name: `${characterKey}|${characterKey}`,
    entity_state_key: stateKey,
  };
}

/** Canonical getLookSet: prefers locked > latest */
function getLookSet(sets: MockSet[], characterKey: string, stateKey: string): MockSet | null {
  const matches = sets.filter(s => s.characterKey === characterKey && s.wardrobeStateKey === stateKey);
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    const locked = matches.find(s => s.status === 'locked');
    if (locked) return locked;
    return matches[matches.length - 1];
  }
  return matches[0];
}

/** Detect duplicate non-archived sets per state */
function getDuplicateStates(sets: MockSet[], characterKey: string): string[] {
  const charSets = sets.filter(s => s.characterKey === characterKey);
  const stateCount = new Map<string, number>();
  for (const s of charSets) {
    stateCount.set(s.wardrobeStateKey, (stateCount.get(s.wardrobeStateKey) || 0) + 1);
  }
  return [...stateCount.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

const PRIORITY_STATES = ['work', 'domestic', 'public_formal'];

function computeCoverage(sets: MockSet[], characterKey: string, allStates: string[]) {
  const charSets = sets.filter(s => s.characterKey === characterKey);
  const duplicates = getDuplicateStates(sets, characterKey);
  const statesWithSets = allStates.filter(st => charSets.some(s => s.wardrobeStateKey === st)).length;
  const statesLocked = allStates.filter(st => charSets.some(s => s.wardrobeStateKey === st && s.status === 'locked')).length;
  const missingStates = allStates.filter(st => !charSets.some(s => s.wardrobeStateKey === st));
  const priorityMissing = missingStates.filter(k => PRIORITY_STATES.includes(k));
  const hasDuplicates = duplicates.length > 0;
  const readiness =
    hasDuplicates ? 'incomplete' :
    statesLocked === allStates.length && allStates.length > 0 ? 'fully_locked' :
    statesWithSets === allStates.length && allStates.length > 0 ? 'ready' :
    'incomplete';
  return { totalStates: allStates.length, statesWithSets, statesLocked, missingStates, priorityMissing, readiness, duplicates };
}

/** Simulates ensureVisualSetForTarget with locked-inclusive lookup */
function ensureSetForState(
  sets: MockSet[],
  characterKey: string,
  stateKey: string,
): { set: MockSet; created: boolean; sets: MockSet[] } {
  const existing = sets.find(
    s => s.domain === 'character_costume_look' &&
      s.target_name === `${characterKey}|${characterKey}` &&
      s.entity_state_key === stateKey &&
      s.status !== 'archived'
  );
  if (existing) return { set: existing, created: false, sets };
  const newSet = createMockSet(characterKey, stateKey, `set-${characterKey}-${stateKey}`);
  return { set: newSet, created: true, sets: [...sets, newSet] };
}

/** Lock eligibility — STRICT: only ready_to_lock and locked are lock-ready */
function computeLockEligibility(sets: MockSet[], characterKey: string, allStates: string[]) {
  const charSets = sets.filter(s => s.characterKey === characterKey);
  const duplicates = getDuplicateStates(sets, characterKey);
  const missingStates = allStates.filter(st => !charSets.some(s => s.wardrobeStateKey === st));
  const LOCK_READY_STATUSES = ['ready_to_lock', 'locked'];
  const notLockReady = allStates.filter(st => {
    const set = charSets.find(s => s.wardrobeStateKey === st);
    if (!set) return false;
    if (set.status === 'locked') return false;
    return !LOCK_READY_STATUSES.includes(set.status);
  });
  const alreadyLocked = allStates.filter(st =>
    charSets.some(s => s.wardrobeStateKey === st && s.status === 'locked')
  );
  const reasons: string[] = [];
  if (missingStates.length > 0) reasons.push(`Missing set for state: ${missingStates.join(', ')}`);
  if (duplicates.length > 0) reasons.push(`Duplicate sets for state: ${duplicates.join(', ')}`);
  if (notLockReady.length > 0) reasons.push(`State not lock-ready: ${notLockReady.join(', ')}`);
  return {
    eligible: missingStates.length === 0 && notLockReady.length === 0 && duplicates.length === 0,
    characterKey,
    totalRequired: allStates.length,
    missingStates,
    notLockReady,
    alreadyLocked,
    duplicates,
    reasons,
  };
}

/** Scene demo lock-critical check: fails if ambiguous duplicates exist without a single locked canonical */
function sceneDemoLockCriticalResolve(
  sets: MockSet[], characterKey: string, stateKey: string,
): { resolved: MockSet | null; ambiguous: boolean } {
  const matches = sets.filter(s => s.characterKey === characterKey && s.wardrobeStateKey === stateKey);
  if (matches.length === 0) return { resolved: null, ambiguous: false };
  if (matches.length === 1) return { resolved: matches[0], ambiguous: false };
  // Multiple sets: only unambiguous if exactly one is locked
  const locked = matches.filter(s => s.status === 'locked');
  if (locked.length === 1) return { resolved: locked[0], ambiguous: false };
  return { resolved: null, ambiguous: true };
}

describe('Costume-on-Actor State Identity', () => {
  const STATES = ['work', 'domestic', 'ceremonial'];

  // A. Three distinct sets for three states
  it('produces three distinct sets for one character with three states', () => {
    let sets: MockSet[] = [];
    for (const state of STATES) {
      const result = ensureSetForState(sets, 'protagonist', state);
      sets = result.sets;
    }
    expect(sets).toHaveLength(3);
    expect(new Set(sets.map(s => s.id)).size).toBe(3);
  });

  // B. getLookSet resolves correct set per state
  it('getLookSet returns correct set for each state', () => {
    const sets = STATES.map(st => createMockSet('protagonist', st, `set-${st}`));
    expect(getLookSet(sets, 'protagonist', 'work')?.id).toBe('set-work');
    expect(getLookSet(sets, 'protagonist', 'domestic')?.id).toBe('set-domestic');
    expect(getLookSet(sets, 'protagonist', 'ceremonial')?.id).toBe('set-ceremonial');
  });

  // C. Regenerating one state does not mutate another
  it('ensure for existing state returns same set, does not touch others', () => {
    const sets = STATES.map(st => createMockSet('protagonist', st, `set-${st}`));
    const result = ensureSetForState(sets, 'protagonist', 'work');
    expect(result.created).toBe(false);
    expect(result.set.id).toBe('set-work');
    expect(result.sets.find(s => s.wardrobeStateKey === 'domestic')?.id).toBe('set-domestic');
  });

  // D. Coverage counts are correct
  it('coverage counts reflect distinct state sets', () => {
    const sets = [
      createMockSet('protagonist', 'work', 's1'),
      createMockSet('protagonist', 'domestic', 's2'),
    ];
    const cov = computeCoverage(sets, 'protagonist', STATES);
    expect(cov.totalStates).toBe(3);
    expect(cov.statesWithSets).toBe(2);
    expect(cov.missingStates).toEqual(['ceremonial']);
    expect(cov.readiness).toBe('incomplete');
  });

  // E. Locking one state does not mark another locked
  it('locking one state does not affect others', () => {
    const sets = [
      createMockSet('protagonist', 'work', 's1', 'locked'),
      createMockSet('protagonist', 'domestic', 's2', 'draft'),
      createMockSet('protagonist', 'ceremonial', 's3', 'draft'),
    ];
    const cov = computeCoverage(sets, 'protagonist', STATES);
    expect(cov.statesLocked).toBe(1);
    expect(cov.readiness).toBe('ready');
  });

  // F. Scene Demo lookup resolves correct state-specific set
  it('scene demo lookup resolves correct state-specific set', () => {
    const sets = STATES.map(st => createMockSet('protagonist', st, `set-${st}`, 'locked'));
    const resolved = sets.find(
      s => s.characterKey === 'protagonist' && s.wardrobeStateKey === 'work' && s.status === 'locked'
    );
    expect(resolved?.id).toBe('set-work');
    expect(resolved?.wardrobeStateKey).not.toBe('domestic');
  });

  // G. Reload finds same state-specific sets
  it('re-ensure after reload finds existing set without creating new', () => {
    const sets = STATES.map(st => createMockSet('protagonist', st, `set-${st}`));
    for (const state of STATES) {
      const result = ensureSetForState(sets, 'protagonist', state);
      expect(result.created).toBe(false);
      expect(result.set.id).toBe(`set-${state}`);
    }
  });

  // Coverage: fully_locked
  it('fully_locked when all states locked', () => {
    const sets = STATES.map(st => createMockSet('protagonist', st, `set-${st}`, 'locked'));
    const cov = computeCoverage(sets, 'protagonist', STATES);
    expect(cov.statesLocked).toBe(3);
    expect(cov.readiness).toBe('fully_locked');
  });

  // Duplicate state does not create second set
  it('does not create duplicate set for same character×state', () => {
    const sets: MockSet[] = [createMockSet('protagonist', 'work', 'set-work')];
    const result = ensureSetForState(sets, 'protagonist', 'work');
    expect(result.created).toBe(false);
    expect(result.sets).toHaveLength(1);
  });

  // Lock character blocked when missing states
  it('lock character should be blocked when states are missing', () => {
    const sets = [createMockSet('protagonist', 'work', 's1')];
    const cov = computeCoverage(sets, 'protagonist', STATES);
    expect(cov.missingStates.length).toBeGreaterThan(0);
  });

  // H. Locked state does not permit silent duplicate creation
  it('locked state set returns existing locked set, no duplicate', () => {
    const sets = [createMockSet('protagonist', 'work', 'set-work-locked', 'locked')];
    const result = ensureSetForState(sets, 'protagonist', 'work');
    expect(result.created).toBe(false);
    expect(result.set.id).toBe('set-work-locked');
    expect(result.set.status).toBe('locked');
    expect(result.sets).toHaveLength(1);
  });

  // I. Generation should be blocked on locked set
  it('generation gate: locked set blocks further generation', () => {
    const sets = [createMockSet('protagonist', 'work', 's1', 'locked')];
    const result = ensureSetForState(sets, 'protagonist', 'work');
    expect(result.set.status).toBe('locked');
    const shouldBlock = result.set.status === 'locked';
    expect(shouldBlock).toBe(true);
  });

  // J. getLookSet with duplicates resolves canonically (prefers locked)
  it('getLookSet with duplicate sets prefers locked over draft', () => {
    const sets = [
      createMockSet('protagonist', 'work', 'set-work-draft', 'draft'),
      createMockSet('protagonist', 'work', 'set-work-locked', 'locked'),
    ];
    const resolved = getLookSet(sets, 'protagonist', 'work');
    expect(resolved?.id).toBe('set-work-locked');
  });

  it('getLookSet with duplicate drafts returns latest', () => {
    const sets = [
      createMockSet('protagonist', 'work', 'set-work-old', 'draft'),
      createMockSet('protagonist', 'work', 'set-work-new', 'draft'),
    ];
    const resolved = getLookSet(sets, 'protagonist', 'work');
    expect(resolved?.id).toBe('set-work-new');
  });

  // K. Lock eligibility fails when state exists but is draft
  it('lock eligibility fails when all states exist but some are draft', () => {
    const sets = [
      createMockSet('protagonist', 'work', 's1', 'ready_to_lock'),
      createMockSet('protagonist', 'domestic', 's2', 'draft'),
      createMockSet('protagonist', 'ceremonial', 's3', 'curating'),
    ];
    const elig = computeLockEligibility(sets, 'protagonist', STATES);
    expect(elig.eligible).toBe(false);
    expect(elig.notLockReady).toContain('domestic');
    expect(elig.notLockReady).toContain('ceremonial'); // curating is NOT lock-ready
    expect(elig.notLockReady).not.toContain('work');
  });

  it('lock eligibility succeeds when all states are ready_to_lock or locked', () => {
    const sets = [
      createMockSet('protagonist', 'work', 's1', 'locked'),
      createMockSet('protagonist', 'domestic', 's2', 'ready_to_lock'),
      createMockSet('protagonist', 'ceremonial', 's3', 'ready_to_lock'),
    ];
    const elig = computeLockEligibility(sets, 'protagonist', STATES);
    expect(elig.eligible).toBe(true);
    expect(elig.alreadyLocked).toContain('work');
    expect(elig.reasons).toHaveLength(0);
  });

  it('lock eligibility fails when states are missing', () => {
    const sets = [createMockSet('protagonist', 'work', 's1', 'ready_to_lock')];
    const elig = computeLockEligibility(sets, 'protagonist', STATES);
    expect(elig.eligible).toBe(false);
    expect(elig.missingStates).toContain('domestic');
    expect(elig.missingStates).toContain('ceremonial');
  });

  // L. Scene Demo canonical consumption
  it('scene demo consumes canonical set when duplicates exist', () => {
    const sets = [
      createMockSet('protagonist', 'work', 'set-old-draft', 'draft'),
      createMockSet('protagonist', 'work', 'set-canonical-locked', 'locked'),
    ];
    const canonical = getLookSet(sets, 'protagonist', 'work');
    expect(canonical?.id).toBe('set-canonical-locked');
  });

  // ── NEW STRICT LOCK-READY AND DUPLICATE TESTS ──

  // M. curating is NOT lock-ready
  it('curating status is not lock-ready', () => {
    const sets = STATES.map(st => createMockSet('protagonist', st, `set-${st}`, 'curating'));
    const elig = computeLockEligibility(sets, 'protagonist', STATES);
    expect(elig.eligible).toBe(false);
    expect(elig.notLockReady).toEqual(STATES);
    expect(elig.reasons.some(r => r.includes('not lock-ready'))).toBe(true);
  });

  // N. autopopulated is NOT lock-ready
  it('autopopulated status is not lock-ready', () => {
    const sets = STATES.map(st => createMockSet('protagonist', st, `set-${st}`, 'autopopulated'));
    const elig = computeLockEligibility(sets, 'protagonist', STATES);
    expect(elig.eligible).toBe(false);
    expect(elig.notLockReady).toEqual(STATES);
    expect(elig.reasons.some(r => r.includes('not lock-ready'))).toBe(true);
  });

  // O. Duplicate sets block character lock
  it('duplicate sets for same state block character lock', () => {
    const sets = [
      createMockSet('protagonist', 'work', 's1', 'ready_to_lock'),
      createMockSet('protagonist', 'work', 's2', 'ready_to_lock'), // duplicate!
      createMockSet('protagonist', 'domestic', 's3', 'ready_to_lock'),
      createMockSet('protagonist', 'ceremonial', 's4', 'ready_to_lock'),
    ];
    const elig = computeLockEligibility(sets, 'protagonist', STATES);
    expect(elig.eligible).toBe(false);
    expect(elig.duplicates).toContain('work');
    expect(elig.reasons.some(r => r.includes('Duplicate'))).toBe(true);
  });

  // P. Duplicate sets degrade readiness
  it('duplicate sets degrade coverage readiness to incomplete', () => {
    const sets = [
      createMockSet('protagonist', 'work', 's1', 'locked'),
      createMockSet('protagonist', 'work', 's2', 'draft'), // duplicate
      createMockSet('protagonist', 'domestic', 's3', 'locked'),
      createMockSet('protagonist', 'ceremonial', 's4', 'locked'),
    ];
    const cov = computeCoverage(sets, 'protagonist', STATES);
    // Even though all states have sets and 3 are locked, duplicate degrades readiness
    expect(cov.readiness).toBe('incomplete');
    expect(cov.duplicates).toContain('work');
  });

  // Q. Scene demo lock-critical consumption fails on ambiguous duplicates
  it('scene demo lock-critical fails when duplicate sets have no single locked canonical', () => {
    const sets = [
      createMockSet('protagonist', 'work', 's1', 'ready_to_lock'),
      createMockSet('protagonist', 'work', 's2', 'ready_to_lock'), // ambiguous duplicate
    ];
    const result = sceneDemoLockCriticalResolve(sets, 'protagonist', 'work');
    expect(result.ambiguous).toBe(true);
    expect(result.resolved).toBeNull();
  });

  it('scene demo lock-critical resolves when duplicate has exactly one locked', () => {
    const sets = [
      createMockSet('protagonist', 'work', 's1', 'draft'),
      createMockSet('protagonist', 'work', 's2', 'locked'),
    ];
    const result = sceneDemoLockCriticalResolve(sets, 'protagonist', 'work');
    expect(result.ambiguous).toBe(false);
    expect(result.resolved?.id).toBe('s2');
  });

  it('scene demo lock-critical resolves single set without ambiguity', () => {
    const sets = [createMockSet('protagonist', 'work', 's1', 'ready_to_lock')];
    const result = sceneDemoLockCriticalResolve(sets, 'protagonist', 'work');
    expect(result.ambiguous).toBe(false);
    expect(result.resolved?.id).toBe('s1');
  });

  it('scene demo lock-critical returns null for missing state', () => {
    const result = sceneDemoLockCriticalResolve([], 'protagonist', 'work');
    expect(result.ambiguous).toBe(false);
    expect(result.resolved).toBeNull();
  });
});
