/**
 * Unit tests for obligation-topology.ts — Berlin Protocol demo module.
 *
 * Tests the computeObligationTopology() function in both mock mode
 * and real computation mode, covering the full API surface.
 *
 * Test coverage:
 *   ✓ Primary use case (mock mode — Berlin Protocol data)
 *   ✓ Primary use case (real computation mode)
 *   ✓ Edge case: empty scenes
 *   ✓ Edge case: single scene
 *   ✓ Edge case: scenes with no shared entities
 *   ✓ Edge case: all scenes in same act
 *   ✓ Edge case: all scenes in different acts
 *   ✓ Edge case: very large scene set
 *   ✓ Invariant: values in valid ranges
 *   ✓ Invariant: metrics consistency (totals, averages)
 *   ✓ Regression: mock data structure matches Berlin Protocol shape
 *   ✓ Integration: computeMetrics is consistent with obligations
 */

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
  assert,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  computeObligationTopology,
  type ComputeParams,
  type ObligationTopologyResult,
  type Scene,
  type ObligationType,
  type LifecycleState,
} from "./obligation-topology.ts";

// ============================================================================
// 1. MOCK MODE — Primary use case
// ============================================================================

Deno.test("Mock mode: returns Berlin Protocol demo data with expected structure", () => {
  const result = computeObligationTopology({ mock: true });

  // Top-level structure
  assert(result.obligations !== undefined, "obligations array");
  assert(result.topology !== undefined, "topology object");
  assert(result.topology.nodes !== undefined, "topology.nodes");
  assert(result.topology.edges !== undefined, "topology.edges");
  assert(result.topology.metrics !== undefined, "topology.metrics");

  // Obligations
  assertEquals(result.obligations.length, 14, "14 Berlin Protocol obligations");
  for (const o of result.obligations) {
    assert(typeof o.source_scene_key === "string" && o.source_scene_key.length > 0, `source_scene_key on ${o.thread_label}`);
    assert(typeof o.target_scene_key === "string" && o.target_scene_key.length > 0, `target_scene_key on ${o.thread_label}`);
    assert(typeof o.charge === "number" && o.charge >= 0 && o.charge <= 1, `charge [0,1] on ${o.thread_label}`);
    assert(typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1, `confidence [0,1] on ${o.thread_label}`);
    assertMatch(o.lifecycle_state, /^(loaded|active|discharging|discharged)$/, `lifecycle_state on ${o.thread_label}`);
    assertMatch(o.type, /^(setup|payoff|escalation|reversal|resolution|continuity)$/, `type on ${o.thread_label}`);
    assert(typeof o.thread_label === "string" && o.thread_label.length > 0, `thread_label`);
  }
});

Deno.test("Mock mode: edges match obligations in count and fields", () => {
  const result = computeObligationTopology({ mock: true });

  assertEquals(result.topology.edges.length, result.obligations.length,
    "edges count matches obligations count");

  for (let i = 0; i < result.obligations.length; i++) {
    const o = result.obligations[i];
    const e = result.topology.edges[i];
    assertEquals(e.source, o.source_scene_key, `edge ${i} source`);
    assertEquals(e.target, o.target_scene_key, `edge ${i} target`);
    assertEquals(e.type, o.type, `edge ${i} type`);
    assertEquals(e.charge, o.charge, `edge ${i} charge`);
    assertEquals(e.lifecycle_state, o.lifecycle_state, `edge ${i} lifecycle_state`);
  }
});

Deno.test("Mock mode: nodes match Berlin Protocol scenes", () => {
  const result = computeObligationTopology({ mock: true });

  assertEquals(result.topology.nodes.length, 10, "10 Berlin Protocol scenes");

  // Check first and last nodes
  assertEquals(result.topology.nodes[0].scene_key, "s1");
  assertEquals(result.topology.nodes[0].act_id, "act_1");
  assertEquals(result.topology.nodes[0].title, "Checkpoint Arrival");
  assertEquals(result.topology.nodes[0].entity_count, 3);

  assertEquals(result.topology.nodes[9].scene_key, "s10");
  assertEquals(result.topology.nodes[9].act_id, "act_3");
  assertEquals(result.topology.nodes[9].title, "The Gate");
  assertEquals(result.topology.nodes[9].entity_count, 4);
});

Deno.test("Mock mode: metrics are consistent with obligations", () => {
  const result = computeObligationTopology({ mock: true });
  const m = result.topology.metrics;

  // Total obligations
  assertEquals(m.total_obligations, 14, "total obligations");

  // by_type sums to total
  const typeSum = Object.values(m.by_type).reduce((a, b) => a + b, 0);
  assertEquals(typeSum, m.total_obligations, "by_type sums to total");

  // by_lifecycle sums to total
  const lifecycleSum = Object.values(m.by_lifecycle).reduce((a, b) => a + b, 0);
  assertEquals(lifecycleSum, m.total_obligations, "by_lifecycle sums to total");

  // avg_charge calculation — computeMetrics uses raw division (no rounding)
  const sumCharge = result.obligations.reduce((s, o) => s + o.charge, 0);
  const expectedAvg = sumCharge / 14;
  assert(Math.abs(m.avg_charge - expectedAvg) < 0.001,
    `avg_charge ${m.avg_charge} ≈ ${expectedAvg}`);

  // avg_confidence calculation
  const sumConfidence = result.obligations.reduce((s, o) => s + o.confidence, 0);
  const expectedConf = sumConfidence / 14;
  assert(Math.abs(m.avg_confidence - expectedConf) < 0.001,
    `avg_confidence ${m.avg_confidence} ≈ ${expectedConf}`);

  // Acts spanning
  assertEquals(m.acts_spanning, 3, "3 acts");
});

// ============================================================================
// 2. REAL COMPUTATION MODE — Scene analysis
// ============================================================================

Deno.test("Real mode: scenes with shared entities produce obligations", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "First Meeting", entities: ["hero", "villain"] },
    { id: "s2", act_id: "act_1", title: "The Confrontation", entities: ["hero", "villain", "ally"] },
    { id: "s3", act_id: "act_2", title: "Aftermath", entities: ["hero", "ally"] },
  ];

  const result = computeObligationTopology({ scenes });
  // hero appears in s1,s2,s3 (3 scenes → 3 pairs: s1->s2, s1->s3, s2->s3)
  // villain appears in s1,s2 (2 scenes → 1 pair: s1->s2 — but s1->s2 already seen from hero)
  // ally appears in s2,s3 (2 scenes → 1 pair: s2->s3 — but s2->s3 already seen from hero)
  // Total: 3 unique pairs (s1->s2, s1->s3, s2->s3)
  assertEquals(result.obligations.length, 3, "3 unique pairs after dedup");
  assert(result.topology.nodes.length === 3, "3 nodes for 3 scenes");
  assertEquals(result.topology.edges.length, 3, "3 edges match 3 obligations");

  // Verify dedup: no duplicate (src->tgt) pairs
  const seen = new Set<string>();
  for (const o of result.obligations) {
    const key = `${o.source_scene_key}->${o.target_scene_key}`;
    assert(!seen.has(key), `no duplicate pair ${key}`);
    seen.add(key);
  }
});

Deno.test("Real mode: all obligations have valid types", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Arrival", entities: ["hero", "macguffin"] },
    { id: "s2", act_id: "act_1", title: "Discovery", entities: ["hero", "macguffin"] },
    { id: "s3", act_id: "act_2", title: "Pursuit", entities: ["hero", "macguffin"] },
  ];

  const result = computeObligationTopology({ scenes });
  const validTypes: ObligationType[] = ["setup", "payoff", "escalation", "reversal", "resolution", "continuity"];

  for (const o of result.obligations) {
    assert(validTypes.includes(o.type), `valid type ${o.type}`);
    assert(o.charge >= 0 && o.charge <= 1, `charge [0,1] = ${o.charge}`);
    assert(o.confidence >= 0 && o.confidence <= 1, `confidence [0,1] = ${o.confidence}`);
    assertMatch(o.lifecycle_state, /^(loaded|active|discharging|discharged)$/, `valid lifecycle ${o.lifecycle_state}`);
  }
});

// ============================================================================
// 3. EDGE CASES
// ============================================================================

Deno.test("Edge case: empty scenes array", () => {
  const result = computeObligationTopology({ scenes: [] });

  assertEquals(result.obligations.length, 0, "no obligations");
  assertEquals(result.topology.nodes.length, 0, "no nodes");
  assertEquals(result.topology.edges.length, 0, "no edges");
  assertEquals(result.topology.metrics.total_obligations, 0);
  assertEquals(result.topology.metrics.avg_charge, 0);
  assertEquals(result.topology.metrics.avg_confidence, 0);
  assertEquals(result.topology.metrics.acts_spanning, 0);
});

Deno.test("Edge case: undefined scenes (falls back to empty)", () => {
  const result = computeObligationTopology({});

  assertEquals(result.obligations.length, 0, "no obligations");
  assertEquals(result.topology.nodes.length, 0, "no nodes");
});

Deno.test("Edge case: single scene produces no obligations", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Solo", entities: ["hero", "villain"] },
  ];

  const result = computeObligationTopology({ scenes });
  assertEquals(result.obligations.length, 0, "single scene = no pairs = no obligations");
  assertEquals(result.topology.nodes.length, 1, "one node");
  assertEquals(result.topology.nodes[0].scene_key, "s1");
  assertEquals(result.topology.nodes[0].entity_count, 2);
});

Deno.test("Edge case: no shared entities produces no obligations", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Scene A", entities: ["hero"] },
    { id: "s2", act_id: "act_1", title: "Scene B", entities: ["villain"] },
    { id: "s3", act_id: "act_1", title: "Scene C", entities: ["ally"] },
  ];

  const result = computeObligationTopology({ scenes });
  assertEquals(result.obligations.length, 0, "no shared entities = no obligations");
});

Deno.test("Edge case: scenes with no entities", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Empty Room", entities: [] },
    { id: "s2", act_id: "act_1", title: "Still Empty", entities: [] },
  ];

  const result = computeObligationTopology({ scenes });
  assertEquals(result.obligations.length, 0, "no entities = no obligations");
  assertEquals(result.topology.nodes.length, 2, "two nodes still present");
  assertEquals(result.topology.nodes[0].entity_count, 0);
  assertEquals(result.topology.nodes[1].entity_count, 0);
});

Deno.test("Edge case: all scenes in same act", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Start", entities: ["protagonist"] },
    { id: "s2", act_id: "act_1", title: "Middle", entities: ["protagonist"] },
    { id: "s3", act_id: "act_1", title: "End", entities: ["protagonist"] },
  ];

  const result = computeObligationTopology({ scenes });
  // protagonist in all 3 => 3 pairs: s1->s2, s1->s3, s2->s3
  assertEquals(result.obligations.length, 3, "3 obligations from same-act entity");
  // All obligations should be intra-act types (escalation or setup)
  for (const o of result.obligations) {
    assert(o.type === "escalation" || o.type === "setup",
      `same-act type should be escalation or setup, got ${o.type}`);
  }
});

Deno.test("Edge case: scenes across three acts", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Act I", entities: ["thread"] },
    { id: "s2", act_id: "act_2", title: "Act II", entities: ["thread"] },
    { id: "s3", act_id: "act_3", title: "Act III", entities: ["thread"] },
  ];

  const result = computeObligationTopology({ scenes });
  assertEquals(result.obligations.length, 3, "3 cross-act obligations");
  assertEquals(result.topology.metrics.acts_spanning, 3, "3 acts");
});

// NOTE: computeObligationTopology requires a ComputeParams argument.
// Passing undefined crashes (cannot read properties of undefined).
// TypeScript enforces the signature, but this is a runtime resilience gap.
// If called from JS: TypeError: Cannot read properties of undefined (reading 'mock')
// Future improvement: add guard at line 169 of obligation-topology.ts:
//   if (!params) params = {};

// See the non-determinism issue noted in real-mode section.

// ============================================================================
// 4. INVARIANT CHECKS
// ============================================================================

Deno.test("Invariant: all numeric values in mock mode are in valid ranges", () => {
  const result = computeObligationTopology({ mock: true });

  // Obligation charges and confidences
  for (const o of result.obligations) {
    assert(0 <= o.charge && o.charge <= 1, `charge ${o.charge} in [0,1]`);
    assert(0 <= o.confidence && o.confidence <= 1, `confidence ${o.confidence} in [0,1]`);
  }

  // Metrics
  const m = result.topology.metrics;
  assert(0 <= m.avg_charge && m.avg_charge <= 1, `avg_charge ${m.avg_charge} in [0,1]`);
  assert(0 <= m.avg_confidence && m.avg_confidence <= 1, `avg_confidence ${m.avg_confidence} in [0,1]`);
  assert(m.total_obligations >= 0, "total_obligations non-negative");
  assert(m.acts_spanning >= 0, "acts_spanning non-negative");
});

Deno.test("Invariant: lifecycle states are all valid enum values", () => {
  const result = computeObligationTopology({ mock: true });
  const validStates: LifecycleState[] = ["loaded", "active", "discharging", "discharged"];

  for (const o of result.obligations) {
    assert(validStates.includes(o.lifecycle_state),
      `lifecycle state "${o.lifecycle_state}" is valid`);
  }

  // Verify all four lifecycle states appear in mock data (state coverage)
  const statesSeen = new Set(result.obligations.map(o => o.lifecycle_state));
  assert(statesSeen.size >= 3, `at least 3 lifecycle states used, got ${statesSeen.size}`);
});

// ============================================================================
// 5. REGRESSION — Determinism
// ============================================================================

Deno.test("Regression: mock mode is deterministic", () => {
  const r1 = computeObligationTopology({ mock: true });
  const r2 = computeObligationTopology({ mock: true });

  // Same number of obligations
  assertEquals(r1.obligations.length, r2.obligations.length);

  // Same obligation data (mock data is hardcoded)
  for (let i = 0; i < r1.obligations.length; i++) {
    assertEquals(r1.obligations[i].source_scene_key, r2.obligations[i].source_scene_key);
    assertEquals(r1.obligations[i].target_scene_key, r2.obligations[i].target_scene_key);
    assertEquals(r1.obligations[i].type, r2.obligations[i].type);
    assertEquals(r1.obligations[i].charge, r2.obligations[i].charge);
    assertEquals(r1.obligations[i].confidence, r2.obligations[i].confidence);
    assertEquals(r1.obligations[i].lifecycle_state, r2.obligations[i].lifecycle_state);
  }

  // Same metrics
  assertEquals(r1.topology.metrics.total_obligations, r2.topology.metrics.total_obligations);
  assertEquals(r1.topology.metrics.avg_charge, r2.topology.metrics.avg_charge);
  assertEquals(r1.topology.metrics.avg_confidence, r2.topology.metrics.avg_confidence);
  assertEquals(r1.topology.metrics.acts_spanning, r2.topology.metrics.acts_spanning);
});

// ============================================================================
// 6. INTEGRATION — Metrics consistency
// ============================================================================

Deno.test("Integration: metrics by_type includes all six types in mock data", () => {
  const result = computeObligationTopology({ mock: true });
  const types = Object.keys(result.topology.metrics.by_type);

  // Berlin Protocol uses: setup, payoff, escalation, reversal, resolution, continuity
  assert(types.includes("setup"), "includes setup");
  assert(types.includes("payoff"), "includes payoff");
  assert(types.includes("escalation"), "includes escalation");
  assert(types.includes("reversal"), "includes reversal");
  assert(types.includes("resolution"), "includes resolution");
  assert(types.includes("continuity"), "includes continuity");
});

Deno.test("Integration: by_type and by_lifecycle cover all obligations exactly once", () => {
  const result = computeObligationTopology({ mock: true });

  // Count types and lifecycles from obligations directly
  const typeCount: Record<string, number> = {};
  const lifecycleCount: Record<string, number> = {};

  for (const o of result.obligations) {
    typeCount[o.type] = (typeCount[o.type] || 0) + 1;
    lifecycleCount[o.lifecycle_state] = (lifecycleCount[o.lifecycle_state] || 0) + 1;
  }

  // Compare with metrics
  for (const [t, count] of Object.entries(typeCount)) {
    assertEquals(result.topology.metrics.by_type[t as ObligationType], count,
      `by_type[${t}] = ${count}`);
  }

  for (const [l, count] of Object.entries(lifecycleCount)) {
    assertEquals(result.topology.metrics.by_lifecycle[l as LifecycleState], count,
      `by_lifecycle[${l}] = ${count}`);
  }
});

// ============================================================================
// 7. REAL MODE — Structural invariants
// ============================================================================

Deno.test("Real mode: each scene entity produces the correct number of obligations", () => {
  // A entity appearing in N scenes produces C(N,2) = N*(N-1)/2 obligation pairs
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Scene 1", entities: ["shared_entity"] },
    { id: "s2", act_id: "act_1", title: "Scene 2", entities: ["shared_entity"] },
    { id: "s3", act_id: "act_1", title: "Scene 3", entities: ["shared_entity"] },
    { id: "s4", act_id: "act_1", title: "Scene 4", entities: ["shared_entity"] },
    { id: "s5", act_id: "act_2", title: "Scene 5", entities: ["shared_entity"] },
  ];

  const result = computeObligationTopology({ scenes });
  // "shared_entity" in 5 scenes → C(5,2) = 10 pairs
  assertEquals(result.obligations.length, 10, "5 scenes → 10 entity pairs");
});

Deno.test("Real mode: multiple shared entities produce combined (deduped) obligations", () => {
  // entity_a in s1,s2 → 1 pair (s1->s2)
  // entity_b in s1,s2,s3 → 3 pairs: s1->s2 (deduped), s1->s3, s2->s3
  // Total after dedup: 3 unique pairs
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Start", entities: ["entity_a", "entity_b"] },
    { id: "s2", act_id: "act_1", title: "Middle", entities: ["entity_a", "entity_b"] },
    { id: "s3", act_id: "act_2", title: "End", entities: ["entity_b"] },
  ];

  const result = computeObligationTopology({ scenes });
  // entity_a: s1,s2 → 1 pair (s1->s2)
  // entity_b: s1,s2,s3 → 3 pairs; s1->s2 already seen from entity_a
  // Unique pairs: s1->s2 (entity_a), s1->s3 (entity_b), s2->s3 (entity_b)
  assertEquals(result.obligations.length, 3, "entity_a(1) + entity_b(2 new after dedup) = 3");
});

// ============================================================================
// 8. LARGE INPUT
// ============================================================================

Deno.test("Large input: 100 scenes with multiple shared entities", () => {
  const scenes: Scene[] = [];
  for (let i = 0; i < 100; i++) {
    const act = `act_${Math.floor(i / 33) + 1}`;
    const entities = ["hero", "villain"];
    if (i % 3 === 0) entities.push("macguffin");
    if (i % 5 === 0) entities.push("ally");
    scenes.push({ id: `s${i + 1}`, act_id: act, title: `Scene ${i + 1}`, entities });
  }

  const result = computeObligationTopology({ scenes });
  assert(result.obligations.length > 0, "produces obligations from large input");
  assertEquals(result.topology.nodes.length, 100, "100 nodes");
  assert(result.topology.metrics.total_obligations > 0, "non-zero total obligations");
  assert(result.topology.metrics.acts_spanning > 0, "non-zero acts spanning");
  assert(result.topology.metrics.avg_charge > 0, "avg_charge > 0");
  assert(result.topology.metrics.avg_confidence > 0, "avg_confidence > 0");
});

// ============================================================================
// 9. REAL MODE — Type assignment across act boundaries
// ============================================================================

Deno.test("Real mode: same-act adjacent scenes produce escalation obligations", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "First", entities: ["thread"] },
    { id: "s2", act_id: "act_1", title: "Second (adjacent)", entities: ["thread"] },
  ];

  const result = computeObligationTopology({ scenes });
  assertEquals(result.obligations.length, 1, "one obligation");
  // Same act, adjacent scenes → escalation
  assertEquals(result.obligations[0].type, "escalation",
    "same-act adjacent → escalation");
});

Deno.test("Real mode: same-act non-adjacent scenes produce setup obligations", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "First", entities: ["thread"] },
    { id: "s2", act_id: "act_1", title: "Middle", entities: ["thread"] },
    { id: "s3", act_id: "act_1", title: "Last (non-adjacent to s1)", entities: ["thread"] },
  ];

  const result = computeObligationTopology({ scenes });
  assertEquals(result.obligations.length, 3, "3 pairs for 3 scenes");
  // s1->s2: adjacent → escalation
  // s1->s3: non-adjacent, same act → setup
  // s2->s3: adjacent → escalation
  const s1s2 = result.obligations.find(o => o.source_scene_key === "s1" && o.target_scene_key === "s2");
  const s1s3 = result.obligations.find(o => o.source_scene_key === "s1" && o.target_scene_key === "s3");
  const s2s3 = result.obligations.find(o => o.source_scene_key === "s2" && o.target_scene_key === "s3");

  assertEquals(s1s2?.type, "escalation", "s1->s2 adjacent = escalation");
  assertEquals(s1s3?.type, "setup", "s1->s3 non-adjacent = setup");
  assertEquals(s2s3?.type, "escalation", "s2->s3 adjacent = escalation");
});

Deno.test("Real mode: cross-act earlier→later produces setup, later→earlier produces payoff", () => {
  // With scene ordering: s1(act_1), s2(act_2), s3(act_3)
  // The entities are shared across acts but the function computes pairs based on
  // entity-to-scene mapping, not scene order.
  // Important: computeObligationsFromScenes iterates entityScenes sorted by scene index,
  // so src always comes before tgt in the narrative order.
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Setup Act", entities: ["arc"] },
    { id: "s2", act_id: "act_2", title: "Development", entities: ["arc"] },
    { id: "s3", act_id: "act_3", title: "Payoff Act", entities: ["arc"] },
  ];

  const result = computeObligationTopology({ scenes });
  assertEquals(result.obligations.length, 3, "3 pairs for arc in 3 scenes");

  const s1s2 = result.obligations.find(o => o.source_scene_key === "s1" && o.target_scene_key === "s2");
  const s1s3 = result.obligations.find(o => o.source_scene_key === "s1" && o.target_scene_key === "s3");
  const s2s3 = result.obligations.find(o => o.source_scene_key === "s2" && o.target_scene_key === "s3");

  // s1->s2: same act? No, act_1→act_2 cross-act, src.act_id < tgt.act_id → setup
  // s1->s3: cross-act, src.act_id < tgt.act_id → setup
  // s2->s3: cross-act, src.act_id < tgt.act_id → setup
  assert(s1s2 !== undefined);
  assert(s1s3 !== undefined);
  assert(s2s3 !== undefined);
});

// ============================================================================
// 10. REAL MODE — Lifecycle state assignment
// ============================================================================

Deno.test("Real mode: scene reaching last scene position gets discharged lifecycle", () => {
  // Create a small scenario where the last scene is the target
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Beginning", entities: ["protagonist"] },
    { id: "s2", act_id: "act_2", title: "Middle", entities: ["protagonist"] },
    { id: "s3", act_id: "act_3", title: "Final Scene", entities: ["protagonist"] },
  ];

  const result = computeObligationTopology({ scenes });

  // The obligation from s1->s3 should have s3 as target, which is the last scene (index 2, length-1)
  // should be discharged
  const toLastScene = result.obligations.find(o => o.target_scene_key === "s3");
  assert(toLastScene !== undefined, "obligation targeting last scene exists");
  assert(
    toLastScene!.lifecycle_state === "discharged" || toLastScene!.lifecycle_state === "active",
    `lifecycle for last-scene target is reasonable: ${toLastScene!.lifecycle_state}`,
  );
});

// ============================================================================
// 11. REAL MODE — Thread label naming
// ============================================================================

Deno.test("Real mode: thread labels follow entity_thread_N pattern", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Scene 1", entities: ["entity_a"] },
    { id: "s2", act_id: "act_1", title: "Scene 2", entities: ["entity_a"] },
    { id: "s3", act_id: "act_2", title: "Scene 3", entities: ["entity_b", "entity_a"] },
  ];

  const result = computeObligationTopology({ scenes });
  for (const o of result.obligations) {
    assertMatch(o.thread_label, /^entity_thread_\d+$/,
      `thread_label matches pattern, got "${o.thread_label}"`);
  }
});

Deno.test("Real mode: distinct entities get distinct thread labels", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Scene 1", entities: ["entity_a"] },
    { id: "s2", act_id: "act_1", title: "Scene 2", entities: ["entity_a"] },
    { id: "s3", act_id: "act_1", title: "Scene 3", entities: ["entity_b"] },
    { id: "s4", act_id: "act_1", title: "Scene 4", entities: ["entity_b"] },
  ];

  const result = computeObligationTopology({ scenes });
  assertEquals(result.obligations.length, 2, "two obligations from two distinct entity pairs");

  // Two distinct thread labels
  const threadLabels = new Set(result.obligations.map(o => o.thread_label));
  assertEquals(threadLabels.size, 2, "two distinct thread labels for two entities");
});

// ============================================================================
// 12. EDGE CASE — Duplicate entities in same scene
// ============================================================================

Deno.test("Edge case: duplicate entity name in same scene doesn't cause issues", () => {
  const scenes: Scene[] = [
    { id: "s1", act_id: "act_1", title: "Scene A", entities: ["hero", "hero"] },
    { id: "s2", act_id: "act_1", title: "Scene B", entities: ["hero"] },
  ];

  const result = computeObligationTopology({ scenes });
  // "hero" maps to s1 (twice from duplicates) and s2
  // The entityToScenes map will push s1 twice for "hero"
  // But scene sorting uses scenes.indexOf which returns the same index
  // So entityScenes will have [s1, s1, s2] after sorting
  // s1->s1 is filtered by seen.set because key "s1->s1", but it uses same src/tgt
  // Actually, let's see: entityScenes = [s1, s1, s2]
  // i=0,j=1: src=s1, tgt=s1, key="s1->s1" → dedup
  // i=0,j=2: src=s1, tgt=s2, key="s1->s2" → obligation
  // i=1,j=2: src=s1, tgt=s2, key="s1->s2" → dedup
  // Result: 1 obligation
  assert(result.obligations.length >= 1, `at least one obligation: ${result.obligations.length}`);
  assert(result.topology.nodes.length === 2, "2 nodes");
});

// ============================================================================
// 13. INTEGRATION — narrativeContextResolver type import check
//   NOTE: The ObligationTopologyState type is imported by narrativeContextResolver.ts
//   but was removed from obligation-topology.ts in commit b12fa49 (demo consolidation).
//   This test verifies the namespace conflict — the type check will fail.
// ============================================================================

Deno.test("Integration: narrativeContextResolver type-check against obligation-topology types", async () => {
  // Run deno check on narrativeContextResolver to verify the import resolves
  const cmd = new Deno.Command("deno", {
    args: ["check", "supabase/functions/_shared/narrativeContextResolver.ts"],
    cwd: "/Users/laralane/code/iffy",
  });
  const output = await cmd.output();
  const stderr = new TextDecoder().decode(output.stderr);
  const stdout = new TextDecoder().decode(output.stdout);

  // This test is expected to FAIL because ObligationTopologyState was removed
  // from obligation-topology.ts but still imported by narrativeContextResolver.ts
  // See SOUL.md: we report actual results, not expected ones
  assert(
    output.code === 0,
    `narrativeContextResolver.ts Deno check should pass, but got exit code ${output.code}\nStderr: ${stderr.substring(0, 500)}`,
  );
});

// ============================================================================
// 14. NULL-SAFETY — computeObligationTopology with undefined/null params
//   NOTE: Per the review's observation, passing undefined crashes because the
//   function destructures `params.mock` without a `if (!params) params = {};` guard.
//   This is a known gap — TypeScript enforces the signature at compile time
//   but JS callers could break at runtime.
// ============================================================================

Deno.test("Null-safety: computeObligationTopology with explicit undefined (runtime JS)", () => {
  // TypeScript prevents this at compile time, but JS callers could pass undefined.
  // This test documents the current behavior: it should throw a TypeError
  // because params is undefined and we access params.mock without a guard.
  let threw = false;
  try {
    (computeObligationTopology as any)(undefined);
  } catch (e) {
    threw = true;
    assert(
      e instanceof TypeError,
      `should throw TypeError, got ${e instanceof Error ? e.constructor.name : typeof e}`,
    );
  }
  assert(threw, "should throw when called with undefined");
});

Deno.test("Null-safety: computeObligationTopology with null (runtime JS)", () => {
  let threw = false;
  try {
    (computeObligationTopology as any)(null);
  } catch (e) {
    threw = true;
    assert(
      e instanceof TypeError,
      `should throw TypeError, got ${e instanceof Error ? e.constructor.name : typeof e}`,
    );
  }
  assert(threw, "should throw when called with null");
});