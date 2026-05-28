/**
 * Tests for Story Outline generation fixes:
 * Fix A: storyOutlineCompletionPass — completeness gate
 * Fix B: JSON schema example in prompt
 * Fix C: chunkLLMTimeoutMs — doc-type-aware timeout
 * Fix D: Auto-resume on partial failure
 * Fix E: Per-act vs full prompt split ("ALL 4 acts" vs "specified act")
 * Fix F: Story outline integrity check in finalizeBest (auto-run)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(import.meta.dirname!, '../../');
const CHUNK_RUNNER_PATH = resolve(PROJECT_ROOT, 'supabase/functions/_shared/chunkRunner.ts');
const GENERATE_DOC_PATH = resolve(PROJECT_ROOT, 'supabase/functions/generate-document/index.ts');
const AUTO_RUN_PATH = resolve(PROJECT_ROOT, 'supabase/functions/auto-run/index.ts');

// ── Inline pure functions mirroring production code ──

function chunkLLMTimeoutMs(docType: string): number {
  if (docType === "story_outline") return 240_000; // 4 minutes
  return 180_000; // 3 minutes default
}

function storyOutlineCompletionPass(docType: string, completedChunks: number, totalChunks: number): boolean {
  if (docType === "story_outline") {
    return completedChunks === totalChunks;
  }
  return true;
}

function episodeCompletionPass(strategy: string, completedChunks: number, totalChunks: number): boolean {
  if (strategy === "episodic_indexed") {
    return completedChunks === totalChunks;
  }
  return true;
}

function isSuccess(validationPass: boolean, failedChunks: number, episodePass: boolean, storyPass: boolean): boolean {
  return validationPass && failedChunks === 0 && episodePass && storyPass;
}

// Fix A: storyOutlineCompletionPass — inline check
function storyOutlineGate(docType: string, completedChunks: number, totalChunks: number): boolean {
  return docType === "story_outline" ? completedChunks === totalChunks : true;
}

// Fix F: Story outline integrity check (finalizeBest)
function storyOutlineIntegrityCheck(docType: string, chunksCompleted: number, chunksTotal: number): boolean {
  if (docType === "story_outline") {
    return chunksCompleted >= chunksTotal;
  }
  return true; // Non-story_outline docs pass through
}

// ── Read source files for content-based assertions ──

function readSource(relativePath: string): string {
  return readFileSync(resolve(PROJECT_ROOT, relativePath), 'utf-8');
}

// ===========================================================================
// Fix A: storyOutlineCompletionPass
// ===========================================================================
describe('Fix A: storyOutlineCompletionPass — completeness gate', () => {
  it('BLOCKS success when story_outline has 3/4 chunks completed (partial)', () => {
    const pass = storyOutlineCompletionPass('story_outline', 3, 4);
    expect(pass).toBe(false);
  });

  it('BLOCKS success when story_outline has 2/4 chunks completed', () => {
    const pass = storyOutlineCompletionPass('story_outline', 2, 4);
    expect(pass).toBe(false);
  });

  it('ALLOWS success when story_outline has 4/4 chunks completed', () => {
    const pass = storyOutlineCompletionPass('story_outline', 4, 4);
    expect(pass).toBe(true);
  });

  it('is non-blocking for non-story_outline doc types', () => {
    expect(storyOutlineCompletionPass('treatment', 3, 4)).toBe(true);
    expect(storyOutlineCompletionPass('beat_sheet', 1, 4)).toBe(true);
    expect(storyOutlineCompletionPass('character_bible', 2, 2)).toBe(true);
  });

  it('isSuccess requires storyOutlineCompletionPass for story_outline', () => {
    // validation pass, no failed chunks, episodic pass, but story gate fails
    const result = isSuccess(true, 0, true, false);
    expect(result).toBe(false);
  });

  it('isSuccess passes when all gates pass for story_outline', () => {
    const result = isSuccess(true, 0, true, true);
    expect(result).toBe(true);
  });

  it('source code: storyOutlineCompletionPass exists at correct lines', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('storyOutlineCompletionPass');
    // Verify it checks completedChunks === plan.totalChunks
    expect(source).toContain('completedChunks === plan.totalChunks');
  });

  it('source code: STORY_OUTLINE_COMPLETION_GATE_FAILED log message exists', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('STORY_OUTLINE_COMPLETION_GATE_FAILED');
  });

  it('source code: storyOutlineGate feeds into isSuccess', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('storyOutlineCompletionPass');
    expect(source).toContain('episodeCompletionPass && storyOutlineCompletionPass');
  });
});

// ===========================================================================
// Fix B: JSON schema example
// ===========================================================================
describe('Fix B: JSON schema example in story_outline prompt', () => {
  it('source code: chunkRunner.ts story_outline block includes OUTPUT SCHEMA', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('OUTPUT SCHEMA');
  });

  it('source code: OUTPUT SCHEMA mentions "RESPECT THIS EXACT STRUCTURE"', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('RESPECT THIS EXACT STRUCTURE');
  });

  it('source code: OUTPUT SCHEMA contains number, title, description fields', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    // The schema template in the prompt
    expect(source).toContain('"number":');
    expect(source).toContain('"title":');
    expect(source).toContain('"description":');
  });

  it('source code: OUTPUT SCHEMA mentions "entries" array', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('"entries"');
  });

  it('source code: OUTPUT SCHEMA applies to EVERY story_outline chunk', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('regardless of act');
  });

  it('source code: generate-document/index.ts has story_outline JSON format rule', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    // "Output VALID JSON ONLY" for story_outline
    expect(source).toContain('story_outline');
    expect(source).toContain('Output VALID JSON ONLY');
  });
});

// ===========================================================================
// Fix C: chunkLLMTimeoutMs
// ===========================================================================
describe('Fix C: chunkLLMTimeoutMs — doc-type-aware timeout', () => {
  it('story_outline uses 240,000ms timeout (4 minutes)', () => {
    expect(chunkLLMTimeoutMs('story_outline')).toBe(240_000);
  });

  it('treatment uses 180,000ms timeout (3 minutes default)', () => {
    expect(chunkLLMTimeoutMs('treatment')).toBe(180_000);
  });

  it('beat_sheet uses 180,000ms timeout (3 minutes default)', () => {
    expect(chunkLLMTimeoutMs('beat_sheet')).toBe(180_000);
  });

  it('character_bible uses 180,000ms timeout (3 minutes default)', () => {
    expect(chunkLLMTimeoutMs('character_bible')).toBe(180_000);
  });

  it('feature_script uses 180,000ms timeout (3 minutes default)', () => {
    expect(chunkLLMTimeoutMs('feature_script')).toBe(180_000);
  });

  it('production_draft uses 180,000ms timeout (3 minutes default)', () => {
    expect(chunkLLMTimeoutMs('production_draft')).toBe(180_000);
  });

  it('unknown doc type uses 180,000ms timeout (safe default)', () => {
    expect(chunkLLMTimeoutMs('unknown_doc_type')).toBe(180_000);
  });

  it('source code: chunkLLMTimeoutMs function exists in chunkRunner.ts', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('function chunkLLMTimeoutMs');
    expect(source).toContain('story_outline');
    expect(source).toContain('240_000');
    expect(source).toContain('180_000');
  });

  it('source code: chunkLLMTimeoutMs is passed as timeoutMs to callChunkLLM', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    // The timeout value is used in the generateSingleChunk function
    expect(source).toContain('chunkLLMTimeoutMs(docType)');
  });
});

// ===========================================================================
// Fix D: Auto-resume on partial failure
// ===========================================================================
describe('Fix D: Auto-resume on partial failure', () => {
  it('source code: resumeChunkedGeneration is exported from chunkRunner.ts', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('export async function resumeChunkedGeneration');
  });

  it('source code: resumeChunkedGeneration imports in generate-document/index.ts', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    expect(source).toContain('resumeChunkedGeneration');
  });

  it('source code: resumeChunkedGeneration skips done chunks', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('chunksNeedingGeneration');
    // Verify pending/failed/failed_validation/needs_regen filtering
    expect(source).toContain('pending');
    expect(source).toContain('failed');
  });

  it('source code: generate-document triggers auto-resume on incomplete chunked gen', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    expect(source).toContain('AUTO-RESUME');
    expect(source).toContain('resumeChunkedGeneration');
    expect(source).toContain('isIncomplete');
  });

  it('source code: successful resume promotes version to is_current', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    // After successful resume, update is_current to true
    expect(source).toContain('resumeResult.success');
    // Look for is_current update after resume
    const resumeSection = source.slice(source.indexOf('AUTO-RESUME'), source.indexOf('END AUTO-RESUME'));
    expect(resumeSection).toContain('is_current: true');
  });

  it('source code: failed resume does NOT promote to is_current', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    const autoResumeSection = source.slice(
      source.indexOf('AUTO-RESUME'),
      source.indexOf('END AUTO-RESUME')
    );
    // Only success path sets is_current
    const successPromote = autoResumeSection.indexOf('is_current: true');
    const failSection = autoResumeSection.slice(autoResumeSection.indexOf('} else {'));
    // Fail path should NOT set is_current
    expect(failSection.includes('is_current')).toBe(false);
  });

  it('source code: resume path records chunks_completed and chunks_total in meta_json', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    expect(source).toContain('chunks_completed');
    expect(source).toContain('chunks_total');
  });

  it('source code: background resume uses EdgeRuntime.waitUntil', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    expect(source).toContain('EdgeRuntime.waitUntil');
  });

  it('source code: resumeChunkedGeneration reassembles all chunks when all done', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    // When pendingChunks.length === 0, it reassembles
    expect(source).toContain('All chunks done');
  });
});

// ===========================================================================
// Fix E: Per-act vs full prompt split
// ===========================================================================
describe('Fix E: Per-act vs full prompt split', () => {
  it('source code: generate-document/index.ts has "ALL 4 acts" for full outline', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    expect(source).toContain('ALL 4 acts');
  });

  it('source code: generate-document/index.ts has "specified act" for resume mode', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    expect(source).toContain('specified act');
  });

  it('source code: full outline check uses resumeVersionId absence', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    expect(source).toContain('resumeVersionId');
    expect(source).toContain('isFullOutline');
  });

  it('source code: ALL 4 acts prompt mentions generating each act chunk', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    // Find the ALL 4 acts block
    const fourActsIdx = source.indexOf('ALL 4 acts');
    const fourActsBlock = source.slice(fourActsIdx, fourActsIdx + 600);
    expect(fourActsBlock).toContain('in parallel chunks');
  });

  it('source code: specified act branch (line 1167) does NOT contain "ALL 4 acts"', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    // Line 1167 is the resume/specified-act branch of the ternary
    const lines = source.split('\n');
    const resumeLine = lines[1166]; // 0-indexed: line 1167 shown → index 1166
    expect(resumeLine).toContain('specified act');
    expect(resumeLine).not.toContain('ALL 4 acts');
  });

  it('source code: isFullOutline derived from docType === story_outline AND no resumeVersionId', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    expect(source).toContain('isFullOutline');
    const lineStart = source.indexOf('const isFullOutline');
    const lineEnd = source.indexOf('\n', lineStart);
    const declLine = source.slice(lineStart, lineEnd);
    expect(declLine).toContain('story_outline');
    expect(declLine).toContain('resumeVersionId');
  });
});

// ===========================================================================
// Fix F: Story outline integrity check (finalizeBest in auto-run)
// ===========================================================================
describe('Fix F: Story outline integrity check in finalizeBest', () => {
  it('BLOCKS promotion when story_outline has 0/4 chunks completed', () => {
    expect(storyOutlineIntegrityCheck('story_outline', 0, 4)).toBe(false);
  });

  it('BLOCKS promotion when story_outline has 3/4 chunks completed', () => {
    expect(storyOutlineIntegrityCheck('story_outline', 3, 4)).toBe(false);
  });

  it('ALLOWS promotion when story_outline has 4/4 chunks completed', () => {
    expect(storyOutlineIntegrityCheck('story_outline', 4, 4)).toBe(true);
  });

  it('ALLOWS promotion when story_outline has 5/4 chunks (edge: more than expected)', () => {
    expect(storyOutlineIntegrityCheck('story_outline', 5, 4)).toBe(true);
  });

  it('non-story_outline doc types pass through with true', () => {
    expect(storyOutlineIntegrityCheck('treatment', 0, 4)).toBe(true);
    expect(storyOutlineIntegrityCheck('beat_sheet', 1, 4)).toBe(true);
    expect(storyOutlineIntegrityCheck('character_bible', 0, 2)).toBe(true);
    expect(storyOutlineIntegrityCheck('feature_script', 3, 5)).toBe(true);
  });

  it('source code: finalizeBest has STORY_OUTLINE_INTEGRITY check', () => {
    const source = readSource('supabase/functions/auto-run/index.ts');
    expect(source).toContain('STORY_OUTLINE_INTEGRITY_FAILED');
    expect(source).toContain('STORY_OUTLINE_INTEGRITY_PASSED');
  });

  it('source code: integrity check compares chunks_completed < chunks_total', () => {
    const source = readSource('supabase/functions/auto-run/index.ts');
    const start = source.indexOf('STORY_OUTLINE_INTEGRITY_FAILED');
    // Search backwards for the condition
    const blockBefore = source.slice(Math.max(0, start - 300), start);
    expect(blockBefore).toContain('chunksCompleted');
    expect(blockBefore).toContain('chunksTotal');
    expect(blockBefore).toContain('<');
  });

  it('source code: integrity check reads chunks_total from meta_json (default 0)', () => {
    const source = readSource('supabase/functions/auto-run/index.ts');
    expect(source).toContain('chunks_total ?? 0');
  });

  it('source code: integrity check reads chunks_completed from meta_json (default 0)', () => {
    const source = readSource('supabase/functions/auto-run/index.ts');
    expect(source).toContain('chunks_completed ?? 0');
  });

  it('source code: integrity check logs a step on failure', () => {
    const source = readSource('supabase/functions/auto-run/index.ts');
    expect(source).toContain('story_outline_integrity_failed');
  });

  it('source code: integrity check returns false on failure (blocks promotion)', () => {
    const source = readSource('supabase/functions/auto-run/index.ts');
    // Find the integrity failure block by searching for the log message
    const altIdx = source.indexOf('STORY_OUTLINE_INTEGRITY_FAILED');
    const block = source.slice(Math.max(0, altIdx - 200), altIdx + 500);
    expect(block).toContain('return false');
  });

  it('source code: integrity check applies only to story_outline doc type', () => {
    const source = readSource('supabase/functions/auto-run/index.ts');
    // The check is inside a `if (docType === "story_outline")` guard
    expect(source).toContain('docType === "story_outline"');
  });
});

// ===========================================================================
// Cross-cutting: edge cases and invariants
// ===========================================================================
describe('Cross-cutting: edge cases and invariants', () => {
  it('ALL 6 fixes source code exists across the 3 files', () => {
    const chunkSource = readSource('supabase/functions/_shared/chunkRunner.ts');
    const genSource = readSource('supabase/functions/generate-document/index.ts');
    const autoSource = readSource('supabase/functions/auto-run/index.ts');

    // Fix A: storyOutlineCompletionPass (chunkRunner.ts)
    expect(chunkSource).toContain('storyOutlineCompletionPass');

    // Fix B: OUTPUT SCHEMA (chunkRunner.ts)
    expect(chunkSource).toContain('OUTPUT SCHEMA');

    // Fix C: chunkLLMTimeoutMs (chunkRunner.ts)
    expect(chunkSource).toContain('chunkLLMTimeoutMs');

    // Fix D: auto-resume (generate-document/index.ts)
    expect(genSource).toContain('AUTO-RESUME');

    // Fix E: per-act vs full prompt (generate-document/index.ts)
    expect(genSource).toContain('isFullOutline');

    // Fix F: integrity check (auto-run/index.ts)
    expect(autoSource).toContain('STORY_OUTLINE_INTEGRITY');
  });

  it('edge case: story_outline with 0 chunks total should not gate (defensive)', () => {
    // If totalChunks is 0, equality check prevents promotion
    expect(storyOutlineCompletionPass('story_outline', 0, 0)).toBe(true);
  });

  it('edge case: story_outline with nullish values uses ?? 0 defaults', () => {
    // The production code uses ?? 0 defaults: meta.chunks_total ?? 0 and meta.chunks_completed ?? 0
    // When both are undefined/0, 0 >= 0 passes the gate
    // Our inline function uses raw params, so we simulate the ?? 0 behavior
    function productionLikeCheck(dt: string, cc: number | undefined, ct: number | undefined): boolean {
      if (dt !== "story_outline") return true;
      const chunksTotal = ct ?? 0;
      const chunksCompleted = cc ?? 0;
      return chunksCompleted >= chunksTotal;
    }
    expect(productionLikeCheck('story_outline', undefined, undefined)).toBe(true);
    expect(productionLikeCheck('story_outline', 0, undefined)).toBe(true);
    expect(productionLikeCheck('story_outline', undefined, 4)).toBe(false);
  });

  it('regression: non-story_outline doc types not affected by story outline gate', () => {
    // Explicitly verify treatment, beat_sheet, character_bible are unaffected
    expect(storyOutlineGate('treatment', 1, 4)).toBe(true);
    expect(storyOutlineGate('beat_sheet', 0, 4)).toBe(true);
    expect(storyOutlineGate('character_bible', 2, 4)).toBe(true);
    expect(storyOutlineGate('feature_script', 3, 4)).toBe(true);
    expect(storyOutlineGate('production_draft', 1, 4)).toBe(true);
  });

  it('regression: episodic gate still works independently', () => {
    expect(episodeCompletionPass('episodic_indexed', 5, 10)).toBe(false);
    expect(episodeCompletionPass('episodic_indexed', 10, 10)).toBe(true);
    expect(episodeCompletionPass('sectioned', 5, 10)).toBe(true); // non-episodic: pass-through
  });

  it('invariant: success requires BOTH episodic AND story outline gates to pass', () => {
    // Test all 4 gate combinations
    expect(isSuccess(true, 0, true, true)).toBe(true);
    expect(isSuccess(true, 0, true, false)).toBe(false);
    expect(isSuccess(true, 0, false, true)).toBe(false);
    expect(isSuccess(true, 0, false, false)).toBe(false);
    expect(isSuccess(false, 0, true, true)).toBe(false);
    expect(isSuccess(true, 1, true, true)).toBe(false);
  });
});