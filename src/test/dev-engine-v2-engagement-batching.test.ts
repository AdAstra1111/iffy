/**
 * Tests for engagementOnlyScenes batching fix in dev-engine-v2/index.ts
 *
 * This fix wires engagementOnlyScenes (TRIBE neural feedback) into the
 * targetScenes batch execution sequence. Previously, engagementOnlyScenes
 * was created but never inserted into targetScenes — dead code.
 *
 * The fix adds sequencedEngagementScenes between direct and propagated:
 *   Direct → Engagement → Propagated → Entity
 *
 * The batching logic is private (non-exported) at ~line 25900 of index.ts.
 * These tests implement the same logic to verify correctness.
 */
import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────────────────
// Test harness — mirrors the dev-engine-v2 batching logic exactly
// ──────────────────────────────────────────────────────────────────

interface Scene {
  scene_id: string;
  scene_key: string;
  slugline?: string;
  axis_key?: string;
  risk_reason?: string;
  risk_source?: string;
}

interface EngagementScene {
  scene_id: string;
  scene_key: string;
  slugline?: string | null;
}

interface EntityScene {
  scene_id: string;
  scene_key: string;
  slugline?: string | null;
  source_axes?: string[];
  grounding_rationale?: string;
}

interface Plan {
  impacted_scenes: Scene[];
  entity_impacted_scenes?: EntityScene[];
  source_units?: { axis: string; unit_key: string; sequence_rank: number }[];
  direct_axes?: string[];
  recommended_scope?: string;
}

interface BatchConfig {
  batchLimit: number;
  entityCap: number;
  SAFE_ENTITY_EXEC_SCOPES: Set<string>;
  axisRankMap: Map<string, number>;
}

interface BatchResult {
  targetScenes: any[];
  sequencedDirectScenes: any[];
  sequencedEngagementScenes: any[];
  sequencedPropagatedScenes: any[];
  entityFillScenes: any[];
}

/**
 * Mirrors the batch sequencing logic from dev-engine-v2/index.ts lines 25893-25970.
 */
function sequenceTargetScenes(
  directOnlyScenes: Scene[],
  engagementScenes: Scene[],
  propagatedOnlyScenes: Scene[],
  entityImpactedScenes: EntityScene[] | undefined,
  config: BatchConfig
): BatchResult {
  const { batchLimit, entityCap, SAFE_ENTITY_EXEC_SCOPES, axisRankMap } = config;
  const engagementOnlyScenes = engagementScenes;

  // Step 1: Sequence direct scenes (axis rank ASC, then scene_key ASC)
  const sequencedDirectScenes = directOnlyScenes.map((s) => ({
    scene_id: s.scene_id,
    scene_key: s.scene_key,
    slugline: s.slugline,
    axis_key: s.axis_key,
    risk_reason: s.risk_reason,
    execution_source: 'direct' as const,
    _axis_rank: axisRankMap.get(s.axis_key ?? '') ?? 99,
  }))
    .sort((a, b) => {
      if (a._axis_rank !== b._axis_rank) return a._axis_rank - b._axis_rank;
      return a.scene_key.localeCompare(b.scene_key);
    })
    .map((s) => {
      const { _axis_rank: _, ...rest } = s;
      return rest;
    });

  const afterDirect = batchLimit - sequencedDirectScenes.length;

  // Step 2: Sequence engagement scenes (scene_key ASC, after direct, before propagated)
  const sequencedEngagementScenes =
    afterDirect > 0
      ? engagementOnlyScenes
          .map((s) => ({
            scene_id: s.scene_id,
            scene_key: s.scene_key,
            slugline: s.slugline,
            axis_key: s.axis_key,
            risk_reason: s.risk_reason,
            execution_source: 'engagement' as const,
          }))
          .sort((a, b) => a.scene_key.localeCompare(b.scene_key))
          .slice(0, afterDirect)
      : [];

  const afterEngagement =
    batchLimit - sequencedDirectScenes.length - sequencedEngagementScenes.length;

  // Step 3: Sequence propagated scenes (axis rank ASC, then scene_key ASC, after engagement)
  const sequencedPropagatedScenes =
    afterEngagement > 0
      ? propagatedOnlyScenes
          .map((s) => ({
            scene_id: s.scene_id,
            scene_key: s.scene_key,
            slugline: s.slugline,
            axis_key: s.axis_key,
            risk_reason: s.risk_reason,
            execution_source: 'propagated' as const,
            _axis_rank: axisRankMap.get(s.axis_key ?? '') ?? 99,
          }))
          .sort((a, b) => {
            if (a._axis_rank !== b._axis_rank) return a._axis_rank - b._axis_rank;
            return a.scene_key.localeCompare(b.scene_key);
          })
          .map((s) => {
            const { _axis_rank: _, ...rest } = s;
            return rest;
          })
          .slice(0, afterEngagement)
      : [];

  // Step 4: Entity fill (gated, capped at entityCap)
  const afterPropagated =
    batchLimit -
    sequencedDirectScenes.length -
    sequencedEngagementScenes.length -
    sequencedPropagatedScenes.length;

  const entityFillScenes: any[] = [];
  if (
    afterPropagated > 0 &&
    entityCap > 0 &&
    sequencedDirectScenes.length > 0 &&
    SAFE_ENTITY_EXEC_SCOPES.has('targeted_scenes')
  ) {
    const entitySlots = Math.min(afterPropagated, entityCap);
    const sorted = (entityImpactedScenes || []).sort((a, b) =>
      a.scene_key.localeCompare(b.scene_key)
    );
    for (const s of sorted.slice(0, entitySlots)) {
      entityFillScenes.push({
        scene_id: s.scene_id,
        scene_key: s.scene_key,
        slugline: s.slugline ?? null,
        axis_key: s.source_axes?.[0] ?? 'entity_link',
        risk_reason: s.grounding_rationale ?? 'entity-linked scene',
        execution_source: 'entity_link' as const,
      });
    }
  }

  // Step 5: Combine in order: Direct → Engagement → Propagated → Entity
  const targetScenes = [
    ...sequencedDirectScenes,
    ...sequencedEngagementScenes,
    ...sequencedPropagatedScenes,
    ...entityFillScenes,
  ].map((s, i) => ({
    ...s,
    order: i + 1,
  }));

  return {
    targetScenes,
    sequencedDirectScenes,
    sequencedEngagementScenes,
    sequencedPropagatedScenes,
    entityFillScenes,
  };
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function makeScene(overrides: Partial<Scene> & { scene_key: string }): Scene {
  return {
    scene_id: `scene-${overrides.scene_key}`,
    slugline: `Slugline for ${overrides.scene_key}`,
    axis_key: 'axis-default',
    risk_reason: `Reason for ${overrides.scene_key}`,
    risk_source: 'direct',
    ...overrides,
  };
}

function defaultConfig(batchLimit = 10, entityCap = 0): BatchConfig {
  return {
    batchLimit,
    entityCap,
    SAFE_ENTITY_EXEC_SCOPES: new Set(['targeted_scenes', 'broad_impact']),
    axisRankMap: new Map([
      ['axis-a', 1],
      ['axis-b', 2],
      ['axis-c', 3],
    ]),
  };
}

// ══════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════

describe('Engagement-only scenes batching fix', () => {
  // ─────────────────────────────────────────────────────────────
  // Primary use case: engagement scenes appear between direct and propagated
  // ─────────────────────────────────────────────────────────────
  it('places engagement scenes between direct and propagated', () => {
    const directs = [
      makeScene({ scene_key: 'd1', risk_source: 'direct', axis_key: 'axis-a' }),
    ];
    const engagements = [
      makeScene({ scene_key: 'e1', risk_source: 'engagement', axis_key: 'axis-b' }),
      makeScene({ scene_key: 'e2', risk_source: 'engagement', axis_key: 'axis-c' }),
    ];
    const propagateds = [
      makeScene({ scene_key: 'p1', risk_source: 'propagated', axis_key: 'axis-b' }),
    ];

    const result = sequenceTargetScenes(directs, engagements, propagateds, undefined, defaultConfig(10));

    // All scenes present
    expect(result.targetScenes.length).toBe(4);

    // Execution order: direct → engagement → engagement → propagated
    expect(result.targetScenes[0].execution_source).toBe('direct');
    expect(result.targetScenes[1].execution_source).toBe('engagement');
    expect(result.targetScenes[2].execution_source).toBe('engagement');
    expect(result.targetScenes[3].execution_source).toBe('propagated');

    // Order field is correct (1-indexed)
    expect(result.targetScenes[0].order).toBe(1);
    expect(result.targetScenes[1].order).toBe(2);
    expect(result.targetScenes[2].order).toBe(3);
    expect(result.targetScenes[3].order).toBe(4);
  });

  // ─────────────────────────────────────────────────────────────
  // Edge case: no engagement scenes (empty array — should still work as before)
  // ─────────────────────────────────────────────────────────────
  it('works correctly with empty engagement scenes (backward compatible)', () => {
    const directs = [
      makeScene({ scene_key: 'd1', risk_source: 'direct', axis_key: 'axis-a' }),
    ];
    const engagements: Scene[] = [];
    const propagateds = [
      makeScene({ scene_key: 'p1', risk_source: 'propagated', axis_key: 'axis-b' }),
    ];

    const result = sequenceTargetScenes(directs, engagements, propagateds, undefined, defaultConfig(10));

    expect(result.targetScenes.length).toBe(2);
    expect(result.sequencedEngagementScenes.length).toBe(0);
    expect(result.targetScenes[0].execution_source).toBe('direct');
    expect(result.targetScenes[1].execution_source).toBe('propagated');
  });

  // ─────────────────────────────────────────────────────────────
  // Edge case: engagement scenes fill capacity, propagated gets nothing
  // ─────────────────────────────────────────────────────────────
  it('engagement scenes consume remaining capacity when batch is tight', () => {
    const directLimit = 2;
    const batchLimit = 4;

    // 2 direct scenes take slots 1-2
    const directs = Array.from({ length: 2 }, (_, i) =>
      makeScene({ scene_key: `d${i + 1}`, risk_source: 'direct', axis_key: 'axis-a' })
    );

    // 3 engagement scenes — only 2 fit (slots 3-4), 1 is excluded
    const engagements = Array.from({ length: 3 }, (_, i) =>
      makeScene({ scene_key: `e${i + 1}`, risk_source: 'engagement', axis_key: 'axis-b' })
    );

    // 2 propagated scenes — none fit
    const propagateds = Array.from({ length: 2 }, (_, i) =>
      makeScene({ scene_key: `p${i + 1}`, risk_source: 'propagated', axis_key: 'axis-c' })
    );

    const result = sequenceTargetScenes(directs, engagements, propagateds, undefined, defaultConfig(batchLimit));

    // 2 direct + 2 engagement = 4 total, no propagated
    expect(result.targetScenes.length).toBe(4);
    expect(result.sequencedDirectScenes.length).toBe(2);
    expect(result.sequencedEngagementScenes.length).toBe(2);
    expect(result.sequencedPropagatedScenes.length).toBe(0);

    // Execution order correct
    expect(result.targetScenes[0].execution_source).toBe('direct');
    expect(result.targetScenes[1].execution_source).toBe('direct');
    expect(result.targetScenes[2].execution_source).toBe('engagement');
    expect(result.targetScenes[3].execution_source).toBe('engagement');
  });

  // ─────────────────────────────────────────────────────────────
  // Edge case: engagement scenes sorted alphabetically by scene_key
  // ─────────────────────────────────────────────────────────────
  it('sorts engagement scenes by scene_key alphabetically', () => {
    const directs = [
      makeScene({ scene_key: 'd1', risk_source: 'direct', axis_key: 'axis-a' }),
    ];
    // Input out of order — should be sorted
    const engagements = [
      makeScene({ scene_key: 'zc', risk_source: 'engagement', axis_key: 'axis-b' }),
      makeScene({ scene_key: 'ab', risk_source: 'engagement', axis_key: 'axis-b' }),
      makeScene({ scene_key: 'mn', risk_source: 'engagement', axis_key: 'axis-b' }),
    ];
    const propagateds: Scene[] = [];

    const result = sequenceTargetScenes(directs, engagements, propagateds, undefined, defaultConfig(10));

    expect(result.sequencedEngagementScenes.length).toBe(3);
    expect(result.sequencedEngagementScenes[0].scene_key).toBe('ab');
    expect(result.sequencedEngagementScenes[1].scene_key).toBe('mn');
    expect(result.sequencedEngagementScenes[2].scene_key).toBe('zc');
  });

  // ─────────────────────────────────────────────────────────────
  // Invariant: batchLimit is respected — total never exceeds limit
  // ─────────────────────────────────────────────────────────────
  it('never exceeds batchLimit', () => {
    const batchLimit = 5;
    const directs = Array.from({ length: 3 }, (_, i) =>
      makeScene({ scene_key: `d${i + 1}`, risk_source: 'direct', axis_key: 'axis-a' })
    );
    const engagements = Array.from({ length: 5 }, (_, i) =>
      makeScene({ scene_key: `e${i + 1}`, risk_source: 'engagement', axis_key: 'axis-b' })
    );
    const propagateds = Array.from({ length: 5 }, (_, i) =>
      makeScene({ scene_key: `p${i + 1}`, risk_source: 'propagated', axis_key: 'axis-c' })
    );

    const result = sequenceTargetScenes(directs, engagements, propagateds, undefined, defaultConfig(batchLimit));

    expect(result.targetScenes.length).toBeLessThanOrEqual(batchLimit);
    expect(result.targetScenes.length).toBe(5); // 3 direct + 2 engagement (after direct = 2)
    expect(result.sequencedEngagementScenes.length).toBe(2); // capped at afterDirect
    expect(result.sequencedPropagatedScenes.length).toBe(0); // no room
  });

  // ─────────────────────────────────────────────────────────────
  // Invariant: execution_source is correctly set for each scene type
  // ─────────────────────────────────────────────────────────────
  it('sets correct execution_source for all scene types', () => {
    const directs = [
      makeScene({ scene_key: 'd1', risk_source: 'direct', axis_key: 'axis-a' }),
    ];
    const engagements = [
      makeScene({ scene_key: 'e1', risk_source: 'engagement', axis_key: 'axis-b' }),
    ];
    const propagateds = [
      makeScene({ scene_key: 'p1', risk_source: 'propagated', axis_key: 'axis-c' }),
    ];

    const result = sequenceTargetScenes(directs, engagements, propagateds, undefined, defaultConfig(10));

    expect(result.sequencedDirectScenes.every((s: any) => s.execution_source === 'direct')).toBe(true);
    expect(result.sequencedEngagementScenes.every((s: any) => s.execution_source === 'engagement')).toBe(true);
    expect(result.sequencedPropagatedScenes.every((s: any) => s.execution_source === 'propagated')).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // Invariant: afterPropagated correctly includes engagement in its deduction
  // ─────────────────────────────────────────────────────────────
  it('afterPropagated accounts for engagement scenes', () => {
    const batchLimit = 10;
    const directs = Array.from({ length: 3 }, (_, i) =>
      makeScene({ scene_key: `d${i + 1}`, risk_source: 'direct', axis_key: 'axis-a' })
    );
    const engagements = Array.from({ length: 3 }, (_, i) =>
      makeScene({ scene_key: `e${i + 1}`, risk_source: 'engagement', axis_key: 'axis-b' })
    );
    const propagateds = Array.from({ length: 3 }, (_, i) =>
      makeScene({ scene_key: `p${i + 1}`, risk_source: 'propagated', axis_key: 'axis-c' })
    );

    const result = sequenceTargetScenes(directs, engagements, propagateds, undefined, defaultConfig(batchLimit));

    // 3 direct + 3 engagement + 3 propagated = 9 total (all fit in 10)
    expect(result.sequencedDirectScenes.length).toBe(3);
    expect(result.sequencedEngagementScenes.length).toBe(3);
    expect(result.sequencedPropagatedScenes.length).toBe(3);
    expect(result.targetScenes.length).toBe(9);
  });

  // ─────────────────────────────────────────────────────────────
  // Edge case: entity fill still works after engagement insertion
  // ─────────────────────────────────────────────────────────────
  it('entity fill works after engagement insertion', () => {
    const batchLimit = 10;
    const entityCap = 3;
    const directs = [
      makeScene({ scene_key: 'd1', risk_source: 'direct', axis_key: 'axis-a' }),
    ];
    const engagements = [
      makeScene({ scene_key: 'e1', risk_source: 'engagement', axis_key: 'axis-b' }),
      makeScene({ scene_key: 'e2', risk_source: 'engagement', axis_key: 'axis-b' }),
    ];
    const propagateds = [
      makeScene({ scene_key: 'p1', risk_source: 'propagated', axis_key: 'axis-c' }),
    ];
    const entityScenes: EntityScene[] = [
      { scene_id: 'ent1', scene_key: 'ent1', source_axes: ['entity_link'], grounding_rationale: 'entity-linked' },
      { scene_id: 'ent2', scene_key: 'ent2', source_axes: ['entity_link'], grounding_rationale: 'entity-linked' },
    ];

    const result = sequenceTargetScenes(directs, engagements, propagateds, entityScenes, {
      ...defaultConfig(batchLimit),
      entityCap,
    });

    // Order: direct (1) → engagement (2) → engagement (3) → propagated (4) → entity (5, 6)
    expect(result.targetScenes[0].execution_source).toBe('direct');
    expect(result.targetScenes[1].execution_source).toBe('engagement');
    expect(result.targetScenes[2].execution_source).toBe('engagement');
    expect(result.targetScenes[3].execution_source).toBe('propagated');
    expect(result.targetScenes[4].execution_source).toBe('entity_link');
    expect(result.targetScenes[5].execution_source).toBe('entity_link');
    expect(result.targetScenes.length).toBe(6);
  });

  // ─────────────────────────────────────────────────────────────
  // Regression: pure direct-only batch works (no engagement, no propagated)
  // ─────────────────────────────────────────────────────────────
  it('pure direct-only batch works unchanged', () => {
    const directs = Array.from({ length: 3 }, (_, i) =>
      makeScene({ scene_key: `d${i + 1}`, risk_source: 'direct', axis_key: 'axis-a' })
    );

    const result = sequenceTargetScenes(directs, [], [], undefined, defaultConfig(5));

    expect(result.targetScenes.length).toBe(3);
    expect(result.targetScenes.every((s: any) => s.execution_source === 'direct')).toBe(true);
    expect(result.sequencedEngagementScenes.length).toBe(0);
    expect(result.sequencedPropagatedScenes.length).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Edge case: only engagement scenes (no direct, no propagated)
  // ─────────────────────────────────────────────────────────────
  it('handles engagement-only batch with no direct scenes', () => {
    const engagements = [
      makeScene({ scene_key: 'e1', risk_source: 'engagement', axis_key: 'axis-b' }),
      makeScene({ scene_key: 'e2', risk_source: 'engagement', axis_key: 'axis-b' }),
    ];

    const result = sequenceTargetScenes([], engagements, [], undefined, defaultConfig(5));

    // afterDirect = 5, all engagement scenes fit
    expect(result.sequencedEngagementScenes.length).toBe(2);
    expect(result.targetScenes.every((s: any) => s.execution_source === 'engagement')).toBe(true);
    expect(result.targetScenes.length).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────
// Integration: capacity chain accounting invariants
// ──────────────────────────────────────────────────────────────────
describe('Capacity chain accounting invariants', () => {
  it('direct + engagement + propagated + entity never exceeds batchLimit', () => {
    const batchLimit = 7;
    const directs = Array.from({ length: 2 }, (_, i) =>
      makeScene({ scene_key: `d${i + 1}`, risk_source: 'direct', axis_key: 'axis-a' })
    );
    const engagements = Array.from({ length: 3 }, (_, i) =>
      makeScene({ scene_key: `e${i + 1}`, risk_source: 'engagement', axis_key: 'axis-b' })
    );
    const propagateds = Array.from({ length: 5 }, (_, i) =>
      makeScene({ scene_key: `p${i + 1}`, risk_source: 'propagated', axis_key: 'axis-c' })
    );
    const entityScenes: EntityScene[] = Array.from({ length: 3 }, (_, i) => ({
      scene_id: `ent${i + 1}`,
      scene_key: `ent${i + 1}`,
      source_axes: ['entity_link'],
      grounding_rationale: 'entity-linked',
    }));

    const result = sequenceTargetScenes(directs, engagements, propagateds, entityScenes, {
      ...defaultConfig(batchLimit),
      entityCap: 3,
    });

    // 2 direct + 2 engagement (afterDirect=5, but only 3 engagement, capped to 2) ... wait
    // afterDirect = 7-2 = 5. engagement = 3 but sorted/scene_keys asc, slice(0,5) = all 3
    // Wait, no. engagement=3, afterDirect=5, so all 3 engagement fit.
    // Actually: afterDirect = batchLimit - direct = 7 - 2 = 5. engagement = 3 < 5, so all 3 fit.
    // afterEngagement = 7 - 2 - 3 = 2. propagated sliced to 2.
    // afterPropagated = 7 - 2 - 3 - 2 = 0. entity = 0.
    // Total: 2 + 3 + 2 + 0 = 7

    const total =
      result.sequencedDirectScenes.length +
      result.sequencedEngagementScenes.length +
      result.sequencedPropagatedScenes.length +
      result.entityFillScenes.length;

    expect(total).toBeLessThanOrEqual(batchLimit);
    expect(result.targetScenes.length).toBe(total);
    expect(total).toBe(7); // 2 + 3 + 2 + 0
  });

  it('entity fill correctly uses afterPropagated accounting', () => {
    const batchLimit = 10;
    const entityCap = 10;
    const directs = [
      makeScene({ scene_key: 'd1', risk_source: 'direct', axis_key: 'axis-a' }),
    ];
    const engagements = [
      makeScene({ scene_key: 'e1', risk_source: 'engagement', axis_key: 'axis-b' }),
      makeScene({ scene_key: 'e2', risk_source: 'engagement', axis_key: 'axis-b' }),
    ];
    const propagateds = [
      makeScene({ scene_key: 'p1', risk_source: 'propagated', axis_key: 'axis-c' }),
      makeScene({ scene_key: 'p2', risk_source: 'propagated', axis_key: 'axis-c' }),
    ];
    const entityScenes: EntityScene[] = Array.from({ length: 5 }, (_, i) => ({
      scene_id: `ent${i + 1}`,
      scene_key: `ent${i + 1}`,
      source_axes: ['entity_link'],
      grounding_rationale: 'entity-linked',
    }));

    const result = sequenceTargetScenes(directs, engagements, propagateds, entityScenes, {
      ...defaultConfig(batchLimit),
      entityCap,
    });

    // afterPropagated = 10 - 1 - 2 - 2 = 5. entityCap = 10.
    // entitySlots = min(5, 10) = 5. All 5 entity scenes fit.
    expect(result.entityFillScenes.length).toBe(5);
    expect(result.targetScenes.length).toBe(10); // 1 + 2 + 2 + 5
  });
});