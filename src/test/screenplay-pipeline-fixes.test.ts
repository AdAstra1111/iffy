/**
 * Screenplay Pipeline Fix — Regression Tests
 *
 * Covers the 6 root-cause fixes from commit df3b216:
 *   1. Scene graph bootstrap BEFORE version promotion
 *   2. Default scene count 50 for production_draft (not sectioned fallback)
 *   3. force:true on scene graph bootstrap
 *   4. Meta-commentary bans in beat_sequential and scene_indexed prompts
 *   5. SCENE N marker instruction in scene_indexed prompt
 *   6. Banned phrases (SUBTEXT SCENE, MEANING SHIFT, DRAMATIC FUNCTION) in chunkValidator
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = process.cwd();

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Scene graph bootstrap BEFORE version promotion
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX 1 — Scene graph bootstrap precedes version promotion", () => {
  let genDocSource: string;

  beforeAll(() => {
    genDocSource = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/generate-document/index.ts"),
      "utf-8"
    );
  });

  it("has the PRE-PROMOTION SCENE GRAPH BOOTSTRAP comment block", () => {
    expect(genDocSource).toContain("PRE-PROMOTION SCENE GRAPH BOOTSTRAP");
  });

  it("bootstraps scene graph BEFORE version is promoted (is_current:true after bootstrap)", () => {
    // The scene graph bootstrap (scene_graph_extract) must appear before
    // the is_current:true promotion. Find the PRE-PROMOTION comment,
    // then verify the scene_graph_extract action and subsequent is_current:true.
    const bootStrapIdx = genDocSource.indexOf("PRE-PROMOTION SCENE GRAPH BOOTSTRAP");
    const sceneGraphExtractIdx = genDocSource.indexOf("action: \"scene_graph_extract\"", bootStrapIdx);

    // Find is_current: true after the bootstrap block (the post-bootstrap promotion)
    const postBootstrapSection = genDocSource.slice(sceneGraphExtractIdx);
    const promoteIdx = postBootstrapSection.indexOf("is_current: true");

    expect(bootStrapIdx).toBeGreaterThan(0);
    expect(sceneGraphExtractIdx).toBeGreaterThan(bootStrapIdx);
    expect(promoteIdx).toBeGreaterThan(0);
  });

  it("bootstraps only for screenplay-class doc types when resolvedSceneCount is falsy", () => {
    // The guard: SCREENPLAY_BOOTSTRAP_TYPES.has(docType) && !resolvedSceneCount
    // For feature_script (no resolvedSceneCount), bootstrap runs.
    // For production_draft (has resolvedSceneCount=50), bootstrap is skipped.
    expect(genDocSource).toContain("SCREENPLAY_BOOTSTRAP_TYPES.has(docType) && !resolvedSceneCount");
  });

  it("defines SCREENPLAY_BOOTSTRAP_TYPES with feature_script and production_draft", () => {
    expect(genDocSource).toContain('SCREENPLAY_BOOTSTRAP_TYPES = new Set(["feature_script", "production_draft"])');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2: Default scene count 50 for production_draft
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX 2 — Default scene count 50 for production_draft", () => {
  let genDocSource: string;

  beforeAll(() => {
    genDocSource = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/generate-document/index.ts"),
      "utf-8"
    );
  });

  it("uses default of 50 when no active scenes found", () => {
    expect(genDocSource).toContain("using default 50 for scene_indexed strategy");
  });

  it("uses default of 50 when scene count query fails", () => {
    expect(genDocSource).toContain("using default 50");
  });

  it("does NOT fall back to sectioned strategy for production_draft with no scenes", () => {
    // The old behavior was: "no active scenes found — will fall back to sectioned strategy"
    // The fix changes this to use default 50. Assert the old string is gone.
    expect(genDocSource).not.toContain("will fall back to sectioned strategy");
    expect(genDocSource).not.toContain("falling back to sectioned");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 3: force:true on scene graph bootstrap
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX 3 — force:true on scene graph bootstrap", () => {
  let genDocSource: string;

  beforeAll(() => {
    genDocSource = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/generate-document/index.ts"),
      "utf-8"
    );
  });

  it("uses force: true in scene graph extract call", () => {
    // The body sent to scene_graph_extract must include force: true
    expect(genDocSource).toContain("force: true");
    // Verify it's in the scene graph bootstrap context (not elsewhere)
    const bootStrapIdx = genDocSource.indexOf("PRE-PROMOTION SCENE GRAPH BOOTSTRAP");
    const bootstrapSection = genDocSource.slice(bootStrapIdx, bootStrapIdx + 5000);
    expect(bootstrapSection).toContain("force: true");
  });

  it("does NOT use force: false in the scene graph bootstrap", () => {
    const bootStrapIdx = genDocSource.indexOf("PRE-PROMOTION SCENE GRAPH BOOTSTRAP");
    const bootstrapSection = genDocSource.slice(bootStrapIdx, bootStrapIdx + 5000);
    expect(bootstrapSection).not.toContain("force: false");
  });

  it("scene graph extract is called with action scene_graph_extract and mode from_text", () => {
    const bootStrapIdx = genDocSource.indexOf("PRE-PROMOTION SCENE GRAPH BOOTSTRAP");
    const bootstrapSection = genDocSource.slice(bootStrapIdx, bootStrapIdx + 5000);
    expect(bootstrapSection).toContain('action: "scene_graph_extract"');
    expect(bootstrapSection).toContain('mode: "from_text"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4: Meta-commentary bans in beat_sequential and scene_indexed prompts
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX 4 — Meta-commentary bans in chunkRunner prompts", () => {
  let chunkRunnerSource: string;

  beforeAll(() => {
    chunkRunnerSource = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/_shared/chunkRunner.ts"),
      "utf-8"
    );
  });

  it("beat_sequential prompt bans meta-commentary, subtext tables, meaning shifts", () => {
    expect(chunkRunnerSource).toContain(
      "Do NOT include meta-commentary, subtext tables, meaning shift sections, analytical/deconstructive text, or any material describing dramatic function"
    );
  });

  it("scene_indexed prompt bans meta-commentary, subtext tables, meaning shifts", () => {
    // Both strategies should have the same meta-commentary ban
    const matchCount = chunkRunnerSource.match(
      /Do NOT include meta-commentary, subtext tables, meaning shift sections/g
    );
    expect(matchCount?.length).toBeGreaterThanOrEqual(2);
  });

  it("ban instruction is in the CRITICAL RULES section of both prompt blocks", () => {
    // Verify the ban appears near CRITICAL RULES for both strategies
    // beat_sequential block: CRITICAL RULES at line 384, ban at line 393
    const beatSeqCR = chunkRunnerSource.indexOf('plan.strategy === "beat_sequential"');
    // Get a section starting from beat_sequential block
    const beatSection = chunkRunnerSource.slice(beatSeqCR, beatSeqCR + 3000);
    expect(beatSection).toContain("CRITICAL RULES");
    expect(beatSection).toContain("meta-commentary");

    // scene_indexed block: CRITICAL RULES at line 427, ban at line 437
    // The scene_indexed strategy branch starts with `plan.strategy === "scene_indexed"`
    const sceneCRStart = chunkRunnerSource.indexOf('plan.strategy === "scene_indexed"');
    expect(sceneCRStart).toBeGreaterThan(0);
    const sceneSection = chunkRunnerSource.slice(sceneCRStart, sceneCRStart + 3000);
    expect(sceneSection).toContain("CRITICAL RULES");
    expect(sceneSection).toContain("meta-commentary");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 5: SCENE N marker instruction in scene_indexed prompt
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX 5 — SCENE N marker instruction in scene_indexed prompt", () => {
  let chunkRunnerSource: string;

  beforeAll(() => {
    chunkRunnerSource = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/_shared/chunkRunner.ts"),
      "utf-8"
    );
  });

  it("scene_indexed prompt includes SCENE N markers instruction", () => {
    expect(chunkRunnerSource).toContain("Output SCENE N markers (SCENE 1, SCENE 2...)");
  });

  it("SCENE N marker instruction is in the CRITICAL RULES of scene_indexed block", () => {
    const sceneIdxIdx = chunkRunnerSource.indexOf("scene_indexed");
    const sceneSection = chunkRunnerSource.slice(sceneIdxIdx, sceneIdxIdx + 2000);
    expect(sceneSection).toContain("CRITICAL RULES");
    expect(sceneSection).toContain("SCENE 1, SCENE 2");
  });

  it("SCENE N marker does NOT appear in the beat_sequential block", () => {
    // The SCENE N marker is only for scene_indexed (production_draft),
    // not for beat_sequential (feature_script)
    const beatSeqIdx = chunkRunnerSource.indexOf("## BEAT");
    const sceneIdxIdx = chunkRunnerSource.indexOf("scene_indexed");
    const beatSection = chunkRunnerSource.slice(beatSeqIdx, sceneIdxIdx > beatSeqIdx ? sceneIdxIdx : beatSeqIdx + 2000);
    expect(beatSection).not.toContain("SCENE 1, SCENE 2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 6: Banned phrases in chunkValidator
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX 6 — Banned phrases in chunkValidator", () => {
  let chunkValidatorSource: string;

  beforeAll(() => {
    chunkValidatorSource = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/_shared/chunkValidator.ts"),
      "utf-8"
    );
  });

  it("bans SUBTEXT SCENE phrase", () => {
    expect(chunkValidatorSource).toContain('"SUBTEXT SCENE"');
  });

  it("bans MEANING SHIFT phrase", () => {
    expect(chunkValidatorSource).toContain('"MEANING SHIFT"');
  });

  it("bans DRAMATIC FUNCTION phrase", () => {
    expect(chunkValidatorSource).toContain('"DRAMATIC FUNCTION"');
  });

  it("all three banned phrases are in the BANNED_PHRASES array", () => {
    // Verify they appear after the BANNED_PHRASES declaration
    const bannedIdx = chunkValidatorSource.indexOf("const BANNED_PHRASES");
    expect(bannedIdx).toBeGreaterThan(0);

    const bannedSection = chunkValidatorSource.slice(bannedIdx, bannedIdx + 3000);
    expect(bannedSection).toContain('"SUBTEXT SCENE"');
    expect(bannedSection).toContain('"MEANING SHIFT"');
    expect(bannedSection).toContain('"DRAMATIC FUNCTION"');
  });

  it("banned phrases are additions to existing set (not replacing it)", () => {
    // Verify existing phrases are still present
    expect(chunkValidatorSource).toContain('"# TOPLINE NARRATIVE"');
    expect(chunkValidatorSource).toContain('"condensed version"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge case: deploy.sh updated for new functions
// ─────────────────────────────────────────────────────────────────────────────
describe("Edge case — deploy.sh references updated edge functions", () => {
  let deploySource: string;

  beforeAll(() => {
    deploySource = readFileSync(
      resolve(PROJECT_ROOT, "deploy.sh"),
      "utf-8"
    );
  });

  it("contains generate-document in the deploy list", () => {
    expect(deploySource).toContain("generate-document");
  });

  it("contains the core pipeline functions", () => {
    expect(deploySource).toContain("generate-document");
    expect(deploySource).toContain("dev-engine-v2");
    expect(deploySource).toContain("auto-run");
  });
});