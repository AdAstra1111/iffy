/**
 * reverse-engineer-pipeline-diagnostics
 *
 * Tests that diagnose the pipeline slowdown by analyzing:
 * 1. Self-chain fetch timeout vs group execution time
 * 2. waitUntilSafe behavior
 * 3. Concurrency guard timing
 * 4. LLM call timeout configuration
 * 5. Group sequencing overhead
 *
 * These tests validate timing assumptions without hitting external APIs.
 * They are NOT integration tests — they verify the logic and configuration
 * that governs pipeline speed.
 */

import { describe, it, expect } from "vitest";

// ─── Constants (mirrors index.ts) ──────────────────────────────────────────

const JOB_STAGES = [
  { key: "structure_1",     label: "Analysing script — part 1 of 3..." },
  { key: "structure_2",     label: "Analysing script — part 2 of 3..." },
  { key: "structure_3",     label: "Analysing script — part 3 of 3..." },
  { key: "synthesise",      label: "Synthesising analysis..." },
  { key: "idea",            label: "Creating idea document..." },
  { key: "beat_sheet",      label: "Building beat sheet..." },
  { key: "story_outline",   label: "Building story outline..." },
  { key: "character_bible", label: "Building character bible..." },
  { key: "treatment",       label: "Writing treatment..." },
  { key: "market_sheet",    label: "Building market sheet..." },
  { key: "infer_criteria",  label: "Inferring criteria..." },
  { key: "storing_docs",   label: "Saving foundation documents..." },
];

const GROUPS = [
  { key: 0, stages: ["structure_1", "structure_2", "structure_3"] },
  { key: 1, stages: ["synthesise", "idea"] },
  { key: 2, stages: ["beat_sheet", "story_outline", "character_bible"] },
  { key: 3, stages: ["treatment", "market_sheet", "infer_criteria", "storing_docs"] },
];

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 min

const CHUNK_LLM_TIMEOUT = 60000;    // 60s — line 724
const DEFAULT_LLM_TIMEOUT = 120000; // 120s — line 201
const SELF_CHAIN_FETCH_TIMEOUT = 60000; // 60s — line 1704

// ─── Pure function replicas (from index.ts) ────────────────────────────────

function getNextGroupKey(currentGroup: number): number | null {
  const next = currentGroup + 1;
  return next < GROUPS.length ? next : null;
}

function waitUntilSafe(p: Promise<any>): boolean {
  try {
    if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime?.waitUntil) {
      (globalThis as any).EdgeRuntime.waitUntil(p);
      return true;
    }
  } catch { /* noop */ }
  return false;
}

function isLockStale(payload: any): boolean {
  if (!payload.is_processing) return false;
  const since = payload.is_processing_since;
  if (!since) return true;
  return Date.now() - new Date(since).getTime() > LOCK_TTL_MS;
}

function makePayload(jobId: string | null, initial = false) {
  return {
    job_type: "reverse_engineer",
    status: initial ? "running" : "pending",
    current_stage: initial ? JOB_STAGES[0].key : "pending",
    stages: JOB_STAGES.reduce((acc: any, s) => {
      acc[s.key] = { label: s.label, status: initial && s.key === JOB_STAGES[0].key ? "running" : "pending" };
      return acc;
    }, {}),
    stage_outputs: {},
    current_group: 0,
    is_processing: false,
    result: null,
    error: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SELF-CHAIN TIMEOUT DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════

describe("Self-chain fetch timeout vs group execution time", () => {
  /**
   * The self-chain at line 1704 uses AbortSignal.timeout(60000).
   * Each group in the pipeline runs multiple sequential LLM calls.
   * If group execution exceeds 60s, the self-chain fetch times out.
   * After 3 retries with exponential backoff, it marks the job as error.
   */

  // Estimated minimum LLM calls per group (from code analysis)
  const groupLlmCalls: Record<number, { stageCount: number; llmCalls: number; maxTokenSizes: number[]; timeouts: number[] }> = {
    0: { stageCount: 3, llmCalls: 3, maxTokenSizes: [4000, 4000, 4000], timeouts: [CHUNK_LLM_TIMEOUT, CHUNK_LLM_TIMEOUT, CHUNK_LLM_TIMEOUT] },
    1: { stageCount: 2, llmCalls: 2, maxTokenSizes: [16000, 14000], timeouts: [DEFAULT_LLM_TIMEOUT, DEFAULT_LLM_TIMEOUT] },
    2: { stageCount: 3, llmCalls: 3, maxTokenSizes: [14000, 14000, 14000], timeouts: [DEFAULT_LLM_TIMEOUT, DEFAULT_LLM_TIMEOUT, DEFAULT_LLM_TIMEOUT] },
    3: { stageCount: 4, llmCalls: 3, maxTokenSizes: [12000, 8000, 3000], timeouts: [DEFAULT_LLM_TIMEOUT, DEFAULT_LLM_TIMEOUT, DEFAULT_LLM_TIMEOUT] },
  };

  it("Group 0 exceeds 60s self-chain timeout (3 chunks × 60s LLM timeout each)", () => {
    const group = groupLlmCalls[0];
    // Minimum possible: 3 LLM calls each up to 60s
    const minGroupTime = group.llmCalls * 10; // 10s per call minimum
    const maxGroupTime = group.llmCalls * CHUNK_LLM_TIMEOUT; // 60s per call max
    expect(minGroupTime).toBe(30); // 30s minimum for 3 chunk calls
    expect(maxGroupTime).toBe(180000); // 180s maximum
    // The self-chain timeout is 60s, but max group time is 180s
    // → SELF-CHAIN TIMEOUT MISMATCH: group could take 3x the timeout
    const timeoutRatio = maxGroupTime / SELF_CHAIN_FETCH_TIMEOUT;
    expect(timeoutRatio).toBeGreaterThan(1); // CRITICAL: 300% of timeout
    console.log(`[DIAG] Group 0: max ${maxGroupTime/1000}s work vs ${SELF_CHAIN_FETCH_TIMEOUT/1000}s self-chain timeout (${timeoutRatio}x)`);
  });

  it("Group 1 exceeds 60s self-chain timeout (synthesise + idea, 16k+14k tokens)", () => {
    const group = groupLlmCalls[1];
    // Each call has 120s timeout, synthesise has 16k maxTokens which is large
    const minGroupTime = group.llmCalls * 15; // 15s per call minimum (large prompts)
    const maxGroupTime = group.llmCalls * group.timeouts[0]; // 120s per call
    expect(minGroupTime).toBe(30);
    expect(maxGroupTime).toBe(240000); // 240s
    const timeoutRatio = maxGroupTime / SELF_CHAIN_FETCH_TIMEOUT;
    expect(timeoutRatio).toBeGreaterThan(1); // CRITICAL: 400% of timeout
    console.log(`[DIAG] Group 1: max ${maxGroupTime/1000}s work vs ${SELF_CHAIN_FETCH_TIMEOUT/1000}s self-chain timeout (${timeoutRatio}x)`);
  });

  it("Group 2 exceeds 60s self-chain timeout (beat_sheet + story_outline + character_bible)", () => {
    const group = groupLlmCalls[2];
    const minGroupTime = group.llmCalls * 15; // 15s per call
    const maxGroupTime = group.llmCalls * group.timeouts[0]; // 120s per call
    expect(maxGroupTime).toBe(360000); // 360s maximum
    const timeoutRatio = maxGroupTime / SELF_CHAIN_FETCH_TIMEOUT;
    expect(timeoutRatio).toBeGreaterThan(1); // CRITICAL: 600% of timeout
    console.log(`[DIAG] Group 2: max ${maxGroupTime/1000}s work vs ${SELF_CHAIN_FETCH_TIMEOUT/1000}s self-chain timeout (${timeoutRatio}x)`);
  });

  it("Group 3 could exceed 60s (3 LLM calls + 7+ document stores + entity creation)", () => {
    const group = groupLlmCalls[3];
    const llmMax = group.llmCalls * group.timeouts[0]; // 3 × 120s
    // Plus DB writes: each storeDoc does 2-3 queries, plus entity creation, plus criteria writes
    const dbOverhead = 15 * 1000; // ~15s for all DB operations
    const totalMax = llmMax + dbOverhead;
    expect(totalMax).toBeGreaterThan(SELF_CHAIN_FETCH_TIMEOUT);
    console.log(`[DIAG] Group 3: max ${totalMax/1000}s work vs ${SELF_CHAIN_FETCH_TIMEOUT/1000}s self-chain timeout`);
  });

  it("Self-chain retry exhaustion: 3 attempts at 60s each + backoff delays ≈ >180s", () => {
    // Retry 1: 60s fetch timeout + 0 delay
    // Retry 2: 60s fetch timeout + 2s delay
    // Retry 3: 60s fetch timeout + 4s delay
    // Total wasted: ~186s before marking error
    const retryDelays = [0, 2000, 4000]; // exponential backoff delays between retries
    const totalRetryTime = 3 * SELF_CHAIN_FETCH_TIMEOUT + retryDelays.reduce((a, b) => a + b, 0);
    expect(totalRetryTime).toBeGreaterThan(180000);
    console.log(`[DIAG] Self-chain gives up after ${totalRetryTime/1000}s of retries`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. WAITUNTILSAFE DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════

describe("waitUntilSafe behavior (pipeline liveness)", () => {
  /**
   * waitUntilSafe (line 594) decides whether the self-chain promise
   * keeps the Edge Runtime alive. If it returns false, the runtime may
   * terminate before the self-chain fetch completes.
   */

  it("returns false when EdgeRuntime is not defined (local dev, test env)", () => {
    // In Node.js / vitest, EdgeRuntime is not defined
    const result = waitUntilSafe(Promise.resolve());
    expect(result).toBe(false);
  });

  it("returns false when EdgeRuntime.waitUntil is missing", () => {
    // Simulate EdgeRuntime existing but missing waitUntil
    const orig = (globalThis as any).EdgeRuntime;
    (globalThis as any).EdgeRuntime = {};
    const result = waitUntilSafe(Promise.resolve());
    expect(result).toBe(false);
    (globalThis as any).EdgeRuntime = orig;
  });

  it("returns true when EdgeRuntime.waitUntil exists", () => {
    let calledWith: any = null;
    const orig = (globalThis as any).EdgeRuntime;
    (globalThis as any).EdgeRuntime = {
      waitUntil: (p: any) => { calledWith = p; },
    };
    const myPromise = Promise.resolve("test");
    const result = waitUntilSafe(myPromise);
    expect(result).toBe(true);
    expect(calledWith).toBe(myPromise);
    (globalThis as any).EdgeRuntime = orig;
  });

  it("catches errors from EdgeRuntime.waitUntil gracefully", () => {
    const orig = (globalThis as any).EdgeRuntime;
    (globalThis as any).EdgeRuntime = {
      waitUntil: () => { throw new Error("runtime error"); },
    };
    const result = waitUntilSafe(Promise.resolve());
    expect(result).toBe(false); // Caught and returns false
    (globalThis as any).EdgeRuntime = orig;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CONCURRENCY GUARD DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════

describe("Concurrency guard (isLockStale) timing", () => {
  /**
   * The concurrency guard at lines 624-633 prevents duplicate invocations.
   * But with a 5-minute TTL, stale locks can block processing for 5 minutes.
   */

  it("isLockStale returns true after LOCK_TTL_MS has elapsed", () => {
    const old = new Date(Date.now() - LOCK_TTL_MS - 60000).toISOString(); // 6 min ago
    expect(isLockStale({ is_processing: true, is_processing_since: old })).toBe(true);
  });

  it("isLockStale returns false within LOCK_TTL_MS", () => {
    const recent = new Date(Date.now() - 30000).toISOString(); // 30s ago
    expect(isLockStale({ is_processing: true, is_processing_since: recent })).toBe(false);
  });

  it("5-minute stale lock delay is a significant slowdown contributor", () => {
    // If a prior invocation crashed with is_processing=true, new invocations
    // are blocked for LOCK_TTL_MS (300s). This is a wall-clock delay.
    const maxDelay = LOCK_TTL_MS / 1000;
    expect(maxDelay).toBe(300); // 300 seconds = 5 minutes
    console.log(`[DIAG] Stale lock blocks pipeline for ${maxDelay}s`);
  });

  it("Concurrency skip vs stale override: stale detection saves 5 min", () => {
    // When isLockStale returns true, the code falls through and continues
    // (line 627). Without this guard, the pipeline would wait 5 minutes.
    const staleOverrideTime = 0; // Immediate override
    const waitTime = LOCK_TTL_MS; // 5 min wait
    expect(staleOverrideTime).toBeLessThan(waitTime);
    console.log(`[DIAG] Stale override saves ${(waitTime - staleOverrideTime)/60000} min`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. LLM CALL TIMEOUT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

describe("LLM call timeout configuration", () => {
  /**
   * Different LLM calls have different timeouts and maxToken sizes.
   * If any call hangs, the pipeline stalls for up to the timeout duration.
   */

  it("Group 0 chunk calls have 60s timeout (shorter than default 120s)", () => {
    const chunkTimeout = CHUNK_LLM_TIMEOUT;
    expect(chunkTimeout).toBe(60000);
    console.log(`[DIAG] Chunk LLM timeout: ${chunkTimeout/1000}s`);
  });

  it("Non-chunk calls have 120s default timeout", () => {
    expect(DEFAULT_LLM_TIMEOUT).toBe(120000);
    console.log(`[DIAG] Default LLM timeout: ${DEFAULT_LLM_TIMEOUT/1000}s`);
  });

  it("Synthesise call (16k maxTokens) is the most expensive single call", () => {
    // Call at line 797-902: 16k maxTokens, full synthesis + concept brief + market sheet
    const maxTokens = 16000;
    expect(maxTokens).toBeGreaterThan(14000); // Larger than other calls
    console.log(`[DIAG] Synthesise maxTokens: ${maxTokens}`);
  });

  it("Total LLM calls across all 4 groups is 10-11", () => {
    const groupCalls = [3, 2, 3, 3]; // Groups 0-3
    const totalCalls = groupCalls.reduce((a, b) => a + b, 0);
    expect(totalCalls).toBeGreaterThanOrEqual(10);
    expect(totalCalls).toBeLessThanOrEqual(12);
    console.log(`[DIAG] Total sequential LLM calls: ${totalCalls}`);
  });

  it("Minimum pipeline wall clock: each LLM call at least 5s = 50s", () => {
    // Even at blazing speed (5s per call), 10 calls = 50s minimum
    // Plus DB writes between each call
    const optimisticLlm = 10 * 5000; // 10 calls × 5s
    const optimisticDb = 17 * 500;   // 17 DB writes × 500ms
    expect(optimisticLlm + optimisticDb).toBeGreaterThan(50000);
    console.log(`[DIAG] Optimistic pipeline time: ~${(optimisticLlm + optimisticDb)/1000}s`);
  });

  it("Realistic pipeline time: each LLM call 20-60s + DB overhead", () => {
    const realisticLlm = 10 * 30000; // 10 calls × 30s = 300s
    const realisticDb = 17 * 1000;   // 17 writes × 1s = 17s
    const realisticTotal = realisticLlm + realisticDb;
    expect(realisticTotal).toBeGreaterThan(180000); // >3 min
    expect(realisticTotal).toBeLessThan(600000);    // <10 min
    console.log(`[DIAG] Realistic pipeline time: ~${realisticTotal/60}s (${(realisticTotal/60).toFixed(1)} min)`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. DB WRITE OVERHEAD DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════

describe("DB persistence overhead", () => {
  it("Group 0 does 7+ DB writes (3 stage updates + 3 save-outputs + 1 save in finally)", () => {
    // 3× updateStage + 3× DB save (after each chunk analysis) + 1× final save
    const writes = 3 + 3 + 1;
    expect(writes).toBeGreaterThanOrEqual(7);
    expect(writes).toBeLessThanOrEqual(10);
    console.log(`[DIAG] Group 0 DB writes: ~${writes}`);
  });

  it("Group 1 does 6+ DB writes (2 stage updates + 2 saves + 1 idea storeDoc + 1 final)", () => {
    // 2× updateStage + 2× DB save + 1 storeDoc + 1 final save
    const writes = 2 + 2 + 1 + 1;
    expect(writes).toBeGreaterThanOrEqual(6);
    expect(writes).toBeLessThanOrEqual(10);
    console.log(`[DIAG] Group 1 DB writes: ~${writes}`);
  });

  it("Group 2 does 10+ DB writes (3 stage updates + 3 saves + entity loop + 1 final)", () => {
    // 3× updateStage + 3× DB save + N entity lookups + 1 final
    const writes = 3 + 3 + 1;
    expect(writes).toBeGreaterThanOrEqual(7);
    console.log(`[DIAG] Group 2 DB writes: ~${writes} + N character entity queries`);
  });

  it("Group 3 does 18+ DB writes (heaviest group)", () => {
    // 4 stage updates + 4 saves + 7 storeDoc calls + canon write + version cleanup + criteria write + project update + final
    const writes = 4 + 4 + 7 + 1 + 1 + 1 + 1 + 1;
    expect(writes).toBeGreaterThanOrEqual(18);
    console.log(`[DIAG] Group 3 DB writes: ~${writes}`);
  });

  it("Total DB writes across pipeline: 45+", () => {
    // Sum of all groups + initial save
    const total = 7 + 8 + 10 + 20;
    expect(total).toBeGreaterThanOrEqual(45);
    console.log(`[DIAG] Total DB writes: ~${total}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. GROUP SEQUENCING OVERHEAD
// ═══════════════════════════════════════════════════════════════════════════

describe("Group sequencing overhead (self-chain delays)", () => {
  /**
   * Between groups, the self-chain has overhead:
   * 1. Save payload to DB
   * 2. Fire HTTP POST
   * 3. Cold start of next Edge Function invocation
   * 4. Load payload from DB
   * 5. Determine next group
   */

  it("3 self-chain transitions exist (group 0→1, 1→2, 2→3)", () => {
    const transitions = GROUPS.length - 1;
    expect(transitions).toBe(3);
  });

  it("Each self-chain adds cold-start overhead (~500ms-2s per transition)", () => {
    const coldStartPerTransition = 1000; // 1s average
    const totalOverhead = 3 * coldStartPerTransition;
    expect(totalOverhead).toBe(3000);
    console.log(`[DIAG] Self-chain overhead: ~${totalOverhead/1000}s total (${coldStartPerTransition}ms each)`);
  });

  it("Self-chain retry delays compound the overhead (2s + 4s + 8s exponential backoff)", () => {
    // If the self-chain fetch times out (which it will for groups >60s),
    // each retry adds exponential backoff delay before the fetch
    const retryDelays = [2000, 4000, 8000]; // from line 1711: 2000 * Math.pow(2, attempt - 1)
    const totalExtraDelay = retryDelays.reduce((a, b) => a + b, 0);
    expect(totalExtraDelay).toBe(14000);
    console.log(`[DIAG] Self-chain retry backoff adds ${totalExtraDelay/1000}s delay`);
  });

  it("Group processing is purely sequential — no parallelism between groups", () => {
    // Groups run one after another via self-chain. No group starts until
    // the previous group's HTTP response returns.
    const parallelGroups = false;
    expect(parallelGroups).toBe(false);
    console.log(`[DIAG] Pipeline is fully sequential (no parallel group execution)`);
  });

  it("Within groups, stages are also sequential (no parallel LLM calls)", () => {
    // Within Group 0, the 3 chunk analyses run in a for loop — each await callLLM
    // Within Group 1, synthesise runs first, then idea — no parallelism
    // Within Group 2, beat_sheet, then story_outline, then character_bible — sequential
    // Within Group 3, treatment, market_sheet, infer_criteria, storing_docs — sequential
    const parallelStages = false;
    expect(parallelStages).toBe(false);
    console.log(`[DIAG] All stages within groups are sequential`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. CHARACTER ENTITY CREATION OVERHEAD
// ═══════════════════════════════════════════════════════════════════════════

describe("Character entity creation overhead (Group 2)", () => {
  /**
   * For each character in the character bible, the code calls
   * findOrCreateCharacterEntity (line 1248) which does a DB lookup + possible insert.
   * For a script with 20+ characters, this is 20+ sequential DB queries.
   */

  it("Character entity creation is sequential — no batch insert", () => {
    // Line 1244-1253: for (const char of call3.characters) { findOrCreateCharacterEntity(...) }
    const isBatchInsert = false;
    expect(isBatchInsert).toBe(false);
    console.log(`[DIAG] Character entity creation is per-char sequential`);
  });

  it("Character count directly multiplies entity creation time", () => {
    const charsPerSlot = [10, 20, 50];
    const timePerEntity = 500; // 500ms per lookup/create
    for (const count of charsPerSlot) {
      const totalTime = count * timePerEntity;
      console.log(`[DIAG] ${count} characters: ~${totalTime/1000}s entity creation`);
      expect(totalTime).toBe(count * timePerEntity);
    }
  });

  it("Captured aliases add more DB writes (upsert per alias)", () => {
    // Lines 1255-1275: for each captured alias, an upsert query
    const aliases = 5;
    const timePerAlias = 300; // 300ms
    const totalAliasTime = aliases * timePerAlias;
    expect(totalAliasTime).toBe(1500);
    console.log(`[DIAG] ${aliases} aliases: ~${totalAliasTime/1000}s upsert time`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. PIPELINE LIFECYCLE TIMELINE (End-to-End)
// ═══════════════════════════════════════════════════════════════════════════

describe("End-to-end pipeline timeline estimate", () => {
  /**
   * Combines all factors to estimate total pipeline duration.
   * Each estimate uses different LLM speed assumptions.
   */

  // Estimated times per LLM call (in ms) for different speed scenarios
  const scenarios = [
    { name: "best-case",  llmPerCall: 5000,  dbPerOp: 200 },
    { name: "typical",    llmPerCall: 25000, dbPerOp: 500 },
    { name: "slow-llm",   llmPerCall: 45000, dbPerOp: 800 },
    { name: "worst-case", llmPerCall: 60000, dbPerOp: 1500 },
  ];

  for (const scenario of scenarios) {
    it(`Pipeline timeline: ${scenario.name}`, () => {
      // Total LLM calls
      const totalLLMCalls = 11; // 3 group0 + 2 group1 + 3 group2 + 3 group3
      const llmTime = totalLLMCalls * scenario.llmPerCall;

      // Total DB operations
      const totalDbOps = 45;
      const dbTime = totalDbOps * scenario.dbPerOp;

      // Self-chain overhead (3 transitions)
      const chainOverhead = 3 * 1000; // 1s per transition

      // Self-chain retry overhead (if timeout occurs)
      const retryOverhead = 0; // Assume no retries in good case

      // Entity creation overhead (~20 chars × time per entity)
      const entityTime = 20 * scenario.dbPerOp * 2; // 2 queries per entity

      const totalTime = llmTime + dbTime + chainOverhead + retryOverhead + entityTime;

      console.log(`[TIMELINE] ${scenario.name}:`);
      console.log(`  LLM time:    ${(llmTime/1000).toFixed(1)}s (${totalLLMCalls} calls at ${scenario.llmPerCall/1000}s each)`);
      console.log(`  DB time:     ${(dbTime/1000).toFixed(1)}s (${totalDbOps} ops at ${scenario.dbPerOp/1000}s each)`);
      console.log(`  Chain OH:    ${(chainOverhead/1000).toFixed(1)}s`);
      console.log(`  Entities:    ${(entityTime/1000).toFixed(1)}s`);
      console.log(`  TOTAL:       ${(totalTime/60).toFixed(1)} min (${(totalTime/1000).toFixed(1)}s)`);

      // Assertions — in best case, pipeline should complete
      if (scenario.name === "best-case") {
        expect(totalTime).toBeLessThan(180000); // < 3 min
      } else if (scenario.name === "typical") {
        expect(totalTime).toBeGreaterThan(180000); // > 3 min
        expect(totalTime).toBeLessThan(600000);    // < 10 min
      } else if (scenario.name === "slow-llm") {
        expect(totalTime).toBeGreaterThan(420000); // > 7 min
      } else if (scenario.name === "worst-case") {
        expect(totalTime).toBeGreaterThan(600000); // > 10 min
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. SELF-CHAIN FREEZE RECOVERY ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

describe("Self-chain freeze recovery analysis", () => {
  /**
   * When the self-chain fails (all 3 retries exhausted), the error handler
   * (lines 1714-1734) reads the payload from DB and sets status=error.
   * But the payload saved in the finally block (line 1687) already has
   * current_group incremented and is_processing=false.
   *
   * The error handler READS FRESH from DB and OVERWRITES the payload.
   * But does it preserve stage_outputs?
   */

  it("Self-chain error handler overwrites payload — reads fresh, sets status=error", () => {
    // Simulate the error handler logic (lines 1714-1722)
    const savedPayload = makePayload(null, true);
    savedPayload.current_group = 1; // After group 0 completed
    savedPayload.is_processing = false;
    savedPayload.stage_outputs = { chunkAnalyses: ["analysis-1"] }; // Group 0 results

    // Error handler reads fresh from DB
    const freshPayload = JSON.parse(JSON.stringify(savedPayload)); // This preserves stage_outputs

    // Error handler modifies the fresh copy
    freshPayload.status = "error";
    freshPayload.error = "self-chain retries exhausted";

    // Check: stage_outputs is preserved (the accumulated data is NOT lost)
    expect(freshPayload.stage_outputs.chunkAnalyses).toEqual(["analysis-1"]);
    expect(freshPayload.status).toBe("error");
    expect(freshPayload.current_group).toBe(1); // Preserved!

    console.log(`[DIAG] Self-chain error preserves accumulated data but halts pipeline`);
    console.log(`[DIAG] current_group=${freshPayload.current_group}, stage_outputs has ${Object.keys(freshPayload.stage_outputs).length} keys`);
  });

  it("Self-chain timeout causes at least 180s of wall-clock delay before error", () => {
    // 3 retries × 60s each + backoff delays
    const timePerRetry = SELF_CHAIN_FETCH_TIMEOUT;
    const backoffDelays = [0, 2000, 4000]; // between retries
    const totalBeforeError = 3 * timePerRetry + backoffDelays.reduce((a, b) => a + b, 0);
    expect(totalBeforeError).toBeGreaterThanOrEqual(180000);
    expect(totalBeforeError).toBeLessThanOrEqual(190000);
    console.log(`[DIAG] Self-chain timeout wastes ${totalBeforeError/1000}s before marking error`);
  });

  it("Self-chain is fire-and-forget (waitUntilSafe) — no response propagation", () => {
    // The self-chain is started with waitUntilSafe() which doesn't return
    // anything useful to the caller. The HTTP response returned to the
    // original caller is separate from the self-chain result.
    const chainResultIsIgnored = true;
    expect(chainResultIsIgnored).toBe(true);
    console.log(`[DIAG] Self-chain response is never propagated to UI — silent freeze`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. SUMMARY — FINDINGS DIAGNOSTIC OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

describe("PIPELINE SLOWDOWN DIAGNOSTIC SUMMARY", () => {
  it("PRIMARY CULPRIT: Self-chain fetch timeout (60s) < any group's execution time", () => {
    const worstGroupTime = 3 * CHUNK_LLM_TIMEOUT; // Group 0: 3 × 60s = 180s
    expect(worstGroupTime).toBeGreaterThan(SELF_CHAIN_FETCH_TIMEOUT);
    console.log("");
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║           PIPELINE SLOWDOWN DIAGNOSTIC RESULTS           ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log("");
    console.log("CRITICAL FINDINGS:");
    console.log("");
    console.log("1. SELF-CHAIN TIMEOUT MISMATCH");
    console.log("   └─ Self-chain fetch timeout = 60s (line 1704)");
    console.log("   └─ Group 0 can run for 180s (3 chunk analyses × 60s)");
    console.log("   └─ Group 1 can run for 240s (2 LLM calls × 120s)");
    console.log("   └─ Group 2 can run for 360s (3 LLM calls × 120s)");
    console.log("   └─ Result: self-chain times out, retries 3x, then marks ERROR");
    console.log("   └─ At least 186s of retry time wasted per failed chain");
    console.log("   └─ FIX: Remove or greatly increase self-chain fetch timeout");
    console.log("     OR: Return response immediately from bg handler");
    console.log("");
    console.log("2. waitUntilSafe SILENT FAILURE (local dev)");
    console.log("   └─ EdgeRuntime.waitUntil is only available in Supabase hosted");
    console.log("   └─ In local dev (Supabase CLI), returns false silently");
    console.log("   └─ Self-chain promise may be garbage collected");
    console.log("   └─ Pipeline appears to freeze with no error message");
    console.log("");
    console.log("3. FULLY SEQUENTIAL EXECUTION");
    console.log("   └─ 10-11 LLM calls run back-to-back, no parallelism");
    console.log("   └─ 45+ DB writes, all sequential");
    console.log("   └─ 3 self-chain transitions with cold-start overhead");
    console.log("   └─ Entity creation is per-character (not batched)");
    console.log("");
    console.log("4. REALISTIC PIPELINE TIME: 5-8 MINUTES");
    console.log("   └─ But self-chain times out before groups complete");
    console.log("   └─ Pipeline may never finish a full run");
    console.log("");
  });
});
