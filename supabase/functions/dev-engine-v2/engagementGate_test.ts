/**
 * Unit tests for TRIBE Neural Feedback engagement gate in dev-engine-v2/index.ts
 *
 * Tests the engagement score fetch, threshold evaluation, and convergence
 * gate integration at lines 7062-7115 and 7429-7447.
 *
 * The engagement gate:
 * 1. Fetches scene_engagement_scores for the current versionId
 * 2. Computes averages across all scenes
 * 3. Determines prediction source priority: tribe_realtime > tribe_simulated > surrogate
 * 4. Applies threshold from ENGAGEMENT_DEFAULTS.threshold (50)
 * 5. Sets parsed.engagement and parsed.engagement_threshold_passed
 * 6. Convergence gate (line 7429-7447): if blockers=0 AND CI>=60 AND GP>=60
 *    AND (no engagement data OR engagement_threshold_passed==true),
 *    sets convergence.status="converged"
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Constants (mirrors ENGAGEMENT_DEFAULTS from _shared/engagementMetric.ts) ──

const ENGAGEMENT_THRESHOLD = 50;

// ── Types ──

interface EngagementRow {
  total_score: number;
  emotional_journey_score: number | null;
  character_connection_score: number | null;
  narrative_absorption_score: number | null;
  visceral_impact_score: number | null;
  cognitive_load_score: number | null;
  confidence: number | null;
  prediction_source: string;
  scene_key: string;
}

// ── Mock Supabase helpers ──

type EngagementMockOpts = {
  engagementRows?: EngagementRow[] | null;
  dbError?: boolean;
};

function makeSupabase(opts: EngagementMockOpts) {
  const { engagementRows, dbError } = opts;

  // Engagement query chain: .from("scene_engagement_scores")
  //   -> .select(...) -> .eq("document_version_id", versionId)
  function engagementChain() {
    return {
      eq: (_field: string, _val: any) => {
        if (dbError) {
          return Promise.resolve({ data: null, error: new Error("DB query failed") });
        }
        return Promise.resolve({ data: engagementRows ?? null, error: null });
      },
    };
  }

  const from = (_table: string) => ({
    select: (_cols: string) => engagementChain(),
  });

  return { from };
}

// ── Function under test: fetchEngagementScores ──
// Replicates the exact logic from dev-engine-v2/index.ts lines 7062-7115

async function fetchEngagementScores(
  supabase: any,
  versionId: string | null,
  parsed: any,
): Promise<void> {
  if (versionId) {
    try {
      const { data: engagementRows } = await supabase
        .from("scene_engagement_scores")
        .select("total_score, emotional_journey_score, character_connection_score, narrative_absorption_score, visceral_impact_score, cognitive_load_score, confidence, prediction_source, scene_key")
        .eq("document_version_id", versionId);

      if (engagementRows && engagementRows.length > 0) {
        const sceneCount = engagementRows.length;
        const avgTotal = Math.round(engagementRows.reduce((s: number, r: any) => s + r.total_score, 0) / sceneCount);
        const avgEmotional = Math.round(engagementRows.reduce((s: number, r: any) => s + (r.emotional_journey_score || 0), 0) / sceneCount);
        const avgConnection = Math.round(engagementRows.reduce((s: number, r: any) => s + (r.character_connection_score || 0), 0) / sceneCount);
        const avgAbsorption = Math.round(engagementRows.reduce((s: number, r: any) => s + (r.narrative_absorption_score || 0), 0) / sceneCount);
        const avgVisceral = Math.round(engagementRows.reduce((s: number, r: any) => s + (r.visceral_impact_score || 0), 0) / sceneCount);
        const avgCognitive = Math.round(engagementRows.reduce((s: number, r: any) => s + (r.cognitive_load_score || 0), 0) / sceneCount);
        const avgConfidence = parseFloat((engagementRows.reduce((s: number, r: any) => s + (r.confidence || 0), 0) / sceneCount).toFixed(2));

        const sources = new Set(engagementRows.map((r: any) => r.prediction_source));
        const predictionSource = sources.has('tribe_realtime') ? 'tribe_realtime'
          : sources.has('tribe_simulated') ? 'tribe_simulated' : 'surrogate';

        const engagementThreshold = ENGAGEMENT_THRESHOLD;
        const thresholdPassed = avgTotal >= engagementThreshold;

        parsed.engagement = {
          total_score: avgTotal,
          scene_count: sceneCount,
          avg_emotional_journey: avgEmotional,
          avg_character_connection: avgConnection,
          avg_narrative_absorption: avgAbsorption,
          avg_visceral_impact: avgVisceral,
          avg_cognitive_load: avgCognitive,
          avg_confidence: avgConfidence,
          prediction_source: predictionSource,
          threshold_passed: thresholdPassed,
          threshold: engagementThreshold,
        };
        parsed.engagement_threshold_passed = thresholdPassed;
      } else {
        // No engagement data — skip gracefully (legacy docs, no neural validation run yet)
        parsed.engagement = null;
        parsed.engagement_threshold_passed = null;
      }
    } catch (engErr: any) {
      parsed.engagement = null;
      parsed.engagement_threshold_passed = null;
    }
  }
}

// ── Function under test: applyEngagementGateToConvergence ──
// Replicates the convergence gate logic at lines 7429-7447

function applyEngagementGateToConvergence(parsed: any): void {
  const ciOk = (parsed.ci_score || 0) >= 60;
  const gpOk = (parsed.gp_score || 0) >= 60;
  // Engagement gate: only enforce when engagement data exists
  const engagementDataExists = parsed.engagement !== null && parsed.engagement !== undefined;
  const engagementOk = !engagementDataExists || parsed.engagement_threshold_passed === true;

  if (ciOk && gpOk && engagementOk) {
    parsed.convergence.status = "converged";
    if (!parsed.convergence.reasons) parsed.convergence.reasons = [];
    parsed.convergence.reasons = ["All blockers resolved"];
  } else if (!engagementOk) {
    // Explicitly prevent convergence when engagement is below threshold
    parsed.convergence.reasons = [
      ...(parsed.convergence.reasons || []),
      "Engagement below threshold",
    ];
  }
}

// ═══════════════════════════════════════════════════
// fetchEngagementScores — Tests
// ═══════════════════════════════════════════════════

Deno.test("fetchEngagementScores: happy path — above threshold, convergence passes", async () => {
  const rows: EngagementRow[] = [
    {
      total_score: 72,
      emotional_journey_score: 75,
      character_connection_score: 68,
      narrative_absorption_score: 70,
      visceral_impact_score: 65,
      cognitive_load_score: 60,
      confidence: 0.85,
      prediction_source: "tribe_realtime",
      scene_key: "scene-1",
    },
    {
      total_score: 65,
      emotional_journey_score: 60,
      character_connection_score: 62,
      narrative_absorption_score: 58,
      visceral_impact_score: 55,
      cognitive_load_score: 50,
      confidence: 0.78,
      prediction_source: "tribe_realtime",
      scene_key: "scene-2",
    },
  ];
  const supabase = makeSupabase({ engagementRows: rows });
  const parsed: any = {
    ci_score: 75,
    gp_score: 70,
    convergence: { status: "in_progress", reasons: [] },
  };

  await fetchEngagementScores(supabase, "version-123", parsed);

  assert(parsed.engagement !== null, "engagement object set");
  assertEquals(parsed.engagement.total_score, 69, "avg(72, 65) = 68.5 -> round 69");
  assertEquals(parsed.engagement.scene_count, 2);
  assertEquals(parsed.engagement.threshold_passed, true, "69 >= 50");
  assertEquals(parsed.engagement.prediction_source, "tribe_realtime");
  assertEquals(parsed.engagement_threshold_passed, true);

  // Apply convergence gate
  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "converged", "All gates pass -> converged");
});

Deno.test("fetchEngagementScores: below threshold blocks convergence", async () => {
  const rows: EngagementRow[] = [
    {
      total_score: 35,
      emotional_journey_score: 30,
      character_connection_score: 40,
      narrative_absorption_score: 25,
      visceral_impact_score: 20,
      cognitive_load_score: 15,
      confidence: 0.6,
      prediction_source: "tribe_simulated",
      scene_key: "scene-1",
    },
  ];
  const supabase = makeSupabase({ engagementRows: rows });
  const parsed: any = {
    ci_score: 85,
    gp_score: 80,
    convergence: { status: "in_progress", reasons: ["Some blockers resolved"] },
  };

  await fetchEngagementScores(supabase, "version-456", parsed);

  assertEquals(parsed.engagement.total_score, 35);
  assertEquals(parsed.engagement_threshold_passed, false, "35 < 50");

  // Apply convergence gate — should NOT converge due to engagement
  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "in_progress", "Not converged — engagement below threshold");
  assert(
    parsed.convergence.reasons.some((r: string) => r.includes("Engagement below threshold")),
    "Reason mentions engagement issue",
  );
});

Deno.test("fetchEngagementScores: no engagement data — skips gracefully", async () => {
  const supabase = makeSupabase({ engagementRows: null });
  const parsed: any = {
    ci_score: 90,
    gp_score: 85,
    convergence: { status: "in_progress", reasons: [] },
  };

  await fetchEngagementScores(supabase, "version-789", parsed);

  assertEquals(parsed.engagement, null, "No engagement data -> null");
  assertEquals(parsed.engagement_threshold_passed, null);

  // Apply convergence gate — should converge without engagement data (legacy doc)
  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "converged", "Legacy doc without engagement -> converged");
});

Deno.test("fetchEngagementScores: empty engagement rows — skips gracefully", async () => {
  const supabase = makeSupabase({ engagementRows: [] });
  const parsed: any = {
    ci_score: 75,
    gp_score: 72,
    convergence: { status: "in_progress", reasons: [] },
  };

  await fetchEngagementScores(supabase, "version-empty", parsed);

  assertEquals(parsed.engagement, null, "Empty rows -> null");
  assertEquals(parsed.engagement_threshold_passed, null);

  // Should converge without engagement data
  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "converged");
});

Deno.test("fetchEngagementScores: DB failure is caught gracefully", async () => {
  const supabase = makeSupabase({ dbError: true });
  const parsed: any = {};

  // Should not throw, should set engagement to null
  await fetchEngagementScores(supabase, "version-error", parsed);

  assertEquals(parsed.engagement, null, "DB error -> null");
  assertEquals(parsed.engagement_threshold_passed, null);
});

Deno.test("fetchEngagementScores: no versionId — skips entirely", async () => {
  const supabase = makeSupabase({ engagementRows: [{ total_score: 80, emotional_journey_score: 80, character_connection_score: 80, narrative_absorption_score: 80, visceral_impact_score: 80, cognitive_load_score: 80, confidence: 0.9, prediction_source: "tribe_realtime", scene_key: "scene-1" }] });
  const parsed: any = {};

  await fetchEngagementScores(supabase, null, parsed);

  // Should not have touched parsed at all
  assertEquals(parsed.engagement, undefined, "No versionId -> no engagement fetch");
  assertEquals(parsed.engagement_threshold_passed, undefined);
});

Deno.test("fetchEngagementScores: single scene edge case", async () => {
  const rows: EngagementRow[] = [
    {
      total_score: 55,
      emotional_journey_score: 50,
      character_connection_score: 60,
      narrative_absorption_score: 45,
      visceral_impact_score: 40,
      cognitive_load_score: 30,
      confidence: 0.7,
      prediction_source: "surrogate",
      scene_key: "only-scene",
    },
  ];
  const supabase = makeSupabase({ engagementRows: rows });
  const parsed: any = {};

  await fetchEngagementScores(supabase, "version-single", parsed);

  assertEquals(parsed.engagement.scene_count, 1, "Single scene");
  assertEquals(parsed.engagement.total_score, 55, "Single value equals itself");
  assertEquals(parsed.engagement.prediction_source, "surrogate");
  assertEquals(parsed.engagement_threshold_passed, true, "55 >= 50");
});

Deno.test("fetchEngagementScores: null sub-scores handled with fallback to 0", async () => {
  const rows: EngagementRow[] = [
    {
      total_score: 60,
      emotional_journey_score: null,
      character_connection_score: null,
      narrative_absorption_score: null,
      visceral_impact_score: null,
      cognitive_load_score: null,
      confidence: null,
      prediction_source: "tribe_simulated",
      scene_key: "null-fields",
    },
  ];
  const supabase = makeSupabase({ engagementRows: rows });
  const parsed: any = {};

  await fetchEngagementScores(supabase, "version-null", parsed);

  assertEquals(parsed.engagement.avg_emotional_journey, 0, "null -> 0");
  assertEquals(parsed.engagement.avg_character_connection, 0);
  assertEquals(parsed.engagement.avg_narrative_absorption, 0);
  assertEquals(parsed.engagement.avg_visceral_impact, 0);
  assertEquals(parsed.engagement.avg_cognitive_load, 0);
  assertEquals(parsed.engagement.avg_confidence, 0, "null confidence -> 0");
  assertEquals(parsed.engagement.prediction_source, "tribe_simulated");
  assertEquals(parsed.engagement_threshold_passed, true, "60 >= 50");
});

Deno.test("fetchEngagementScores: prediction source priority — tribe_realtime wins", async () => {
  const rows: EngagementRow[] = [
    { total_score: 70, emotional_journey_score: 70, character_connection_score: 70, narrative_absorption_score: 70, visceral_impact_score: 70, cognitive_load_score: 70, confidence: 0.8, prediction_source: "surrogate", scene_key: "s1" },
    { total_score: 65, emotional_journey_score: 65, character_connection_score: 65, narrative_absorption_score: 65, visceral_impact_score: 65, cognitive_load_score: 65, confidence: 0.85, prediction_source: "tribe_realtime", scene_key: "s2" },
  ];
  const supabase = makeSupabase({ engagementRows: rows });
  const parsed: any = {};

  await fetchEngagementScores(supabase, "version-priority", parsed);

  assertEquals(parsed.engagement.prediction_source, "tribe_realtime", "tribe_realtime takes priority");
});

Deno.test("fetchEngagementScores: prediction source priority — surrogate fallback", async () => {
  const rows: EngagementRow[] = [
    { total_score: 50, emotional_journey_score: 50, character_connection_score: 50, narrative_absorption_score: 50, visceral_impact_score: 50, cognitive_load_score: 50, confidence: 0.5, prediction_source: "surrogate", scene_key: "s1" },
  ];
  const supabase = makeSupabase({ engagementRows: rows });
  const parsed: any = {};

  await fetchEngagementScores(supabase, "version-surrogate", parsed);

  assertEquals(parsed.engagement.prediction_source, "surrogate");
});

Deno.test("fetchEngagementScores: exactly at threshold (50) passes", async () => {
  const rows: EngagementRow[] = [
    {
      total_score: 50,
      emotional_journey_score: 50,
      character_connection_score: 50,
      narrative_absorption_score: 50,
      visceral_impact_score: 50,
      cognitive_load_score: 50,
      confidence: 0.75,
      prediction_source: "tribe_simulated",
      scene_key: "exact-threshold",
    },
  ];
  const supabase = makeSupabase({ engagementRows: rows });
  const parsed: any = {
    ci_score: 60,
    gp_score: 60,
    convergence: { status: "in_progress", reasons: [] },
  };

  await fetchEngagementScores(supabase, "version-at-threshold", parsed);

  assertEquals(parsed.engagement_threshold_passed, true, "50 >= 50");
  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "converged", "At threshold -> converged");
});

Deno.test("fetchEngagementScores: one below threshold (49) fails", async () => {
  const rows: EngagementRow[] = [
    {
      total_score: 49,
      emotional_journey_score: 45,
      character_connection_score: 50,
      narrative_absorption_score: 40,
      visceral_impact_score: 35,
      cognitive_load_score: 30,
      confidence: 0.6,
      prediction_source: "tribe_simulated",
      scene_key: "just-below",
    },
  ];
  const supabase = makeSupabase({ engagementRows: rows });
  const parsed: any = {
    ci_score: 70,
    gp_score: 65,
    convergence: { status: "in_progress", reasons: [] },
  };

  await fetchEngagementScores(supabase, "version-below", parsed);

  assertEquals(parsed.engagement_threshold_passed, false, "49 < 50");
  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "in_progress", "Below threshold -> not converged");
});

Deno.test("fetchEngagementScores: mixed null and valid prediction_sources", async () => {
  const rows: any[] = [
    { total_score: 60, emotional_journey_score: 60, character_connection_score: 60, narrative_absorption_score: 60, visceral_impact_score: 60, cognitive_load_score: 60, confidence: 0.8, prediction_source: null, scene_key: "s1" },
    { total_score: 65, emotional_journey_score: 65, character_connection_score: 65, narrative_absorption_score: 65, visceral_impact_score: 65, cognitive_load_score: 65, confidence: 0.9, prediction_source: "surrogate", scene_key: "s2" },
  ];
  const supabase = makeSupabase({ engagementRows: rows });
  const parsed: any = {};

  // Should handle null prediction_source by falling through to surrogate
  await fetchEngagementScores(supabase, "version-mixed-sources", parsed);

  assertEquals(parsed.engagement.prediction_source, "surrogate", "Only surrogate in non-null sources");
  assertEquals(parsed.engagement.scene_count, 2);
});

// ═══════════════════════════════════════════════════
// Convergence gate integration — Tests
// ═══════════════════════════════════════════════════

Deno.test("convergence gate: CI below 60 blocks convergence even with engagement pass", () => {
  const parsed: any = {
    ci_score: 55,
    gp_score: 70,
    engagement: { total_score: 80, threshold_passed: true },
    engagement_threshold_passed: true,
    convergence: { status: "in_progress", reasons: [] },
  };

  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "in_progress", "CI < 60 blocks");
});

Deno.test("convergence gate: GP below 60 blocks convergence even with engagement pass", () => {
  const parsed: any = {
    ci_score: 70,
    gp_score: 55,
    engagement: { total_score: 80, threshold_passed: true },
    engagement_threshold_passed: true,
    convergence: { status: "in_progress", reasons: [] },
  };

  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "in_progress", "GP < 60 blocks");
});

Deno.test("convergence gate: engagement pass but CI+GP both below threshold", () => {
  const parsed: any = {
    ci_score: 50,
    gp_score: 45,
    engagement: { total_score: 80, threshold_passed: true },
    engagement_threshold_passed: true,
    convergence: { status: "in_progress", reasons: [] },
  };

  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "in_progress", "CI and GP both below");
});

Deno.test("convergence gate: no engagement data, CI+GP pass = converged", () => {
  const parsed: any = {
    ci_score: 80,
    gp_score: 75,
    engagement: null,
    engagement_threshold_passed: null,
    convergence: { status: "in_progress", reasons: ["All blockers resolved"] },
  };

  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "converged", "Legacy doc without engagement");
});

Deno.test("convergence gate: engagement object empty (not null) treated as data exists", () => {
  const parsed: any = {
    ci_score: 80,
    gp_score: 75,
    engagement: {},
    engagement_threshold_passed: false,
    convergence: { status: "in_progress", reasons: [] },
  };

  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "in_progress", "Engagement data exists but threshold not passed");
  assert(
    parsed.convergence.reasons.some((r: string) => r.includes("Engagement below threshold")),
    "Engagement reason added",
  );
});

Deno.test("convergence gate: CI score zero defaults to 0, blocks convergence", () => {
  const parsed: any = {
    ci_score: 0,
    gp_score: 70,
    engagement: { total_score: 80, threshold_passed: true },
    engagement_threshold_passed: true,
    convergence: { status: "in_progress", reasons: [] },
  };

  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "in_progress", "CI=0 means < 60, blocks");
});

Deno.test("convergence gate: undefined scores default to 0, block convergence", () => {
  const parsed: any = {
    convergence: { status: "in_progress", reasons: [] },
  };

  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "in_progress", "No scores at all -> block");
});

Deno.test("convergence gate: convergence object missing reasons array", () => {
  const parsed: any = {
    ci_score: 72,
    gp_score: 68,
    engagement: null as any,
    engagement_threshold_passed: null as any,
    convergence: { status: "in_progress" },
  };

  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.status, "converged");
  assertEquals(parsed.convergence.reasons, ["All blockers resolved"]);
});

Deno.test("convergence gate: engagement below threshold reason added without overwriting existing reasons", () => {
  const parsed: any = {
    ci_score: 80,
    gp_score: 75,
    engagement: { total_score: 30, threshold_passed: false },
    engagement_threshold_passed: false,
    convergence: { status: "in_progress", reasons: ["Blocking issues remain"] },
  };

  applyEngagementGateToConvergence(parsed);
  assertEquals(parsed.convergence.reasons.length, 2, "Existing reason preserved, new one added");
  assert(
    parsed.convergence.reasons.includes("Blocking issues remain"),
    "Original reason preserved",
  );
  assert(
    parsed.convergence.reasons.includes("Engagement below threshold"),
    "Engagement reason added",
  );
});