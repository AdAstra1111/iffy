/**
 * sceneDemoCanon.test.ts — Deterministic tests for Scene Demo Canon Selection + Binding.
 */
import { describe, it, expect } from 'vitest';
import {
  gateCanonicalSelection,
  resolveCanonicalSlotAssets,
  buildCanonicalSceneDemoResult,
  summarizeSceneDemoCoverage,
  resolveSceneDemoSlotForDocument,
  resolveAllDocumentBindingSlots,
  type CanonicalRunRef,
  type SlotImage,
} from '../sceneDemoCanon';

// ── Fixtures ──

function makeRun(overrides?: Partial<CanonicalRunRef>): CanonicalRunRef {
  return {
    run_id: 'run-1',
    scene_id: 'scene-1',
    status: 'locked',
    is_canonical: true,
    plan_snapshot: {},
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSlotImages(overrides?: Partial<SlotImage>[]): SlotImage[] {
  const defaults: SlotImage[] = [
    { id: 'img-1', slot_key: 'establishing_wide', public_url: 'https://img/ew.jpg', storage_path: 'ew.jpg', approval_status: 'approved', status: 'done' },
    { id: 'img-2', slot_key: 'character_action', public_url: 'https://img/ca.jpg', storage_path: 'ca.jpg', approval_status: 'approved', status: 'done' },
    { id: 'img-3', slot_key: 'emotional_beat', public_url: 'https://img/eb.jpg', storage_path: 'eb.jpg', approval_status: 'approved', status: 'done' },
    { id: 'img-4', slot_key: 'environment_detail', public_url: 'https://img/ed.jpg', storage_path: 'ed.jpg', approval_status: 'approved', status: 'done' },
  ];
  if (overrides) {
    return defaults.map((d, i) => ({ ...d, ...(overrides[i] || {}) }));
  }
  return defaults;
}

// ── Selection Gate ──

describe('gateCanonicalSelection', () => {
  it('allows locked runs', () => {
    const result = gateCanonicalSelection({ status: 'locked', id: 'run-1' });
    expect(result.allowed).toBe(true);
    expect(result.blocking_reasons).toHaveLength(0);
  });

  it('blocks non-locked runs', () => {
    for (const status of ['queued', 'running', 'failed', 'approved', 'ready_for_review', 'stale']) {
      const result = gateCanonicalSelection({ status, id: 'run-x' });
      expect(result.allowed).toBe(false);
      expect(result.blocking_reasons.length).toBeGreaterThan(0);
    }
  });
});

// ── Asset Resolution ──

describe('resolveCanonicalSlotAssets', () => {
  it('resolves all approved slots', () => {
    const { assets, missing_required } = resolveCanonicalSlotAssets(makeSlotImages());
    expect(assets).toHaveLength(4);
    expect(missing_required).toHaveLength(0);
  });

  it('reports missing required slots', () => {
    const images = makeSlotImages().filter(i => i.slot_key !== 'establishing_wide');
    const { assets, missing_required } = resolveCanonicalSlotAssets(images);
    expect(assets).toHaveLength(3);
    expect(missing_required).toContain('establishing_wide');
  });

  it('skips unapproved images', () => {
    const images = makeSlotImages([{ approval_status: 'pending' }]);
    const { assets } = resolveCanonicalSlotAssets(images);
    expect(assets).toHaveLength(3);
    expect(assets.find(a => a.slot_key === 'establishing_wide')).toBeUndefined();
  });

  it('skips images without public_url', () => {
    const images = makeSlotImages([{ public_url: null }]);
    const { assets } = resolveCanonicalSlotAssets(images);
    expect(assets).toHaveLength(3);
  });
});

// ── Canonical Result Builder ──

describe('buildCanonicalSceneDemoResult', () => {
  it('returns found=true with full assets', () => {
    const result = buildCanonicalSceneDemoResult(makeRun(), makeSlotImages());
    expect(result.found).toBe(true);
    expect(result.assets).toHaveLength(4);
    expect(result.missing_required_slots).toHaveLength(0);
    expect(result.coverage_ratio).toBe(1);
  });

  it('fail-closed: returns found=false when run is null', () => {
    const result = buildCanonicalSceneDemoResult(null, []);
    expect(result.found).toBe(false);
    expect(result.run).toBeNull();
    expect(result.assets).toHaveLength(0);
    expect(result.missing_required_slots.length).toBeGreaterThan(0);
    expect(result.coverage_ratio).toBe(0);
  });

  it('reports partial coverage', () => {
    const images = makeSlotImages().slice(0, 2); // only 2 slots
    const result = buildCanonicalSceneDemoResult(makeRun(), images);
    expect(result.found).toBe(true);
    expect(result.assets).toHaveLength(2);
    expect(result.coverage_ratio).toBe(0.5);
  });
});

// ── Coverage Summary ──

describe('summarizeSceneDemoCoverage', () => {
  it('calculates full coverage', () => {
    const runs = [makeRun({ run_id: 'r1', scene_id: 's1' })];
    const images = { r1: makeSlotImages() };
    const result = summarizeSceneDemoCoverage(['s1'], runs, images);
    expect(result.total_scenes).toBe(1);
    expect(result.scenes_with_canonical).toBe(1);
    expect(result.scenes_without_canonical).toBe(0);
    expect(result.coverage_percent).toBe(100);
    expect(result.uncovered_scene_ids).toHaveLength(0);
  });

  it('tracks uncovered scenes', () => {
    const result = summarizeSceneDemoCoverage(['s1', 's2'], [], {});
    expect(result.scenes_without_canonical).toBe(2);
    expect(result.uncovered_scene_ids).toEqual(['s1', 's2']);
    expect(result.coverage_percent).toBe(0);
  });

  it('partial coverage across scenes', () => {
    const runs = [makeRun({ run_id: 'r1', scene_id: 's1' })];
    const images = { r1: makeSlotImages() };
    const result = summarizeSceneDemoCoverage(['s1', 's2'], runs, images);
    expect(result.scenes_with_canonical).toBe(1);
    expect(result.scenes_without_canonical).toBe(1);
    expect(result.coverage_percent).toBe(50); // 2/4 required covered
  });
});

// ── Document Binding ──

describe('resolveSceneDemoSlotForDocument', () => {
  it('resolves existing slot', () => {
    const { assets } = resolveCanonicalSlotAssets(makeSlotImages());
    const result = resolveSceneDemoSlotForDocument(assets, 'establishing_wide');
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://img/ew.jpg');
    expect(result!.image_id).toBe('img-1');
  });

  it('returns null for missing slot', () => {
    const result = resolveSceneDemoSlotForDocument([], 'establishing_wide');
    expect(result).toBeNull();
  });
});

describe('resolveAllDocumentBindingSlots', () => {
  it('resolves all slots', () => {
    const { assets } = resolveCanonicalSlotAssets(makeSlotImages());
    const bindings = resolveAllDocumentBindingSlots(assets);
    expect(bindings.establishing_wide).not.toBeNull();
    expect(bindings.character_action).not.toBeNull();
    expect(bindings.emotional_beat).not.toBeNull();
    expect(bindings.environment_detail).not.toBeNull();
  });

  it('returns null for missing slots', () => {
    const bindings = resolveAllDocumentBindingSlots([]);
    expect(bindings.establishing_wide).toBeNull();
    expect(bindings.character_action).toBeNull();
  });
});

// ── Canonical Uniqueness ──

describe('canonical uniqueness invariant', () => {
  it('only one canonical per scene in coverage summary', () => {
    // If two runs claim canonical for same scene, Map only keeps last
    const runs = [
      makeRun({ run_id: 'r1', scene_id: 's1' }),
      makeRun({ run_id: 'r2', scene_id: 's1' }),
    ];
    const images = {
      r1: makeSlotImages(),
      r2: makeSlotImages(),
    };
    const result = summarizeSceneDemoCoverage(['s1'], runs, images);
    expect(result.scenes_with_canonical).toBe(1);
  });
});
