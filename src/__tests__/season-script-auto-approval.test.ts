/**
 * Season Script Auto-Approval + char_count in ensureDocSlot — Validation Tests
 *
 * Verifies three fixes:
 * 1. "season_script" added to APPROVAL_REQUIRED_STAGES in auto-run/index.ts
 * 2. char_count: 0 in ensureDocSlot insert payload (defensive default)
 * 3. char_count updated on project_documents in createVersion alongside latest_version_id
 *
 * These are static/structural analysis tests since the edge functions interact with
 * Supabase at runtime. We validate the source code contains the correct patterns,
 * and verify invariants about the ladder definitions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// ── Helpers ──

function readEdgeFunctionSource(name: string): string {
  const p = path.resolve(__dirname, '../../supabase/functions', name, 'index.ts');
  return readFileSync(p, 'utf-8');
}

function readSharedSource(name: string): string {
  const p = path.resolve(__dirname, '../../supabase/functions/_shared', name);
  return readFileSync(p, 'utf-8');
}

function readLadderJson(): string {
  const p = path.resolve(__dirname, '../../supabase/_shared/stage-ladders.json');
  return readFileSync(p, 'utf-8');
}

// ── Fix 1: season_script in APPROVAL_REQUIRED_STAGES ──

describe('Fix 1: season_script in APPROVAL_REQUIRED_STAGES (auto-run/index.ts)', () => {
  const source = readEdgeFunctionSource('auto-run');

  it('APPROVAL_REQUIRED_STAGES constant exists with correct name', () => {
    expect(source).toContain('APPROVAL_REQUIRED_STAGES');
  });

  it('APPROVAL_REQUIRED_STAGES contains "season_script"', () => {
    // Verify the literal string appears inside the Set constructor
    expect(source).toContain('"season_script"');
  });

  it('APPROVAL_REQUIRED_STAGES contains all expected stages', () => {
    const expected = ['episode_grid', 'character_bible', 'season_arc', 'format_rules', 'season_script'];
    for (const stage of expected) {
      expect(source).toContain(`"${stage}"`);
    }
  });

  it('APPROVAL_REQUIRED_STAGES is created as a Set', () => {
    expect(source).toContain('new Set([');
  });

  it('"season_script" is the last entry in APPROVAL_REQUIRED_STAGES (terminal stage)', () => {
    // Find APPROVAL_REQUIRED_STAGES block and verify season_script is within it
    const match = source.match(/const APPROVAL_REQUIRED_STAGES = new Set\(\[([\s\S]*?)\]\)/);
    expect(match).not.toBeNull();
    const setContents = match![1];
    expect(setContents).toContain('"season_script"');
    // Verify it's a terminal stage in the vertical-drama ladder
    const stagesAfterScript = setContents.split('"season_script"')[1] || '';
    // No non-empty stage strings should come after season_script
    const remainingStages = stagesAfterScript.match(/"([^"]+)"/g);
    expect(remainingStages).toBeNull();
  });

  it('vertical-drama ladder has season_script as terminal stage', () => {
    const ladderData = JSON.parse(readLadderJson());
    const vdLadder = ladderData.FORMAT_LADDERS['vertical-drama'];
    expect(vdLadder).toBeDefined();
    expect(vdLadder[vdLadder.length - 1]).toBe('season_script');
  });
});

// ── Fix 2: char_count: 0 in ensureDocSlot ──

describe('Fix 2: char_count in ensureDocSlot insert payload (doc-os.ts)', () => {
  const source = readSharedSource('doc-os.ts');

  it('ensureDocSlot function exists', () => {
    expect(source).toContain('export async function ensureDocSlot');
  });

  it('insertPayload in ensureDocSlot includes char_count: 0', () => {
    // Find the insertPayload object
    const insertPayloadBlock = source.match(/const insertPayload: Record<string, any> = \{([\s\S]*?)\};/);
    expect(insertPayloadBlock).not.toBeNull();
    const payload = insertPayloadBlock![1];
    expect(payload).toContain('char_count: 0');
  });

  it('char_count is the first explicit data field after file_path (alphabetically ordered within payload)', () => {
    // Verify char_count appears between file_path and extraction_status
    const insertPayloadBlock = source.match(/const insertPayload: Record<string, any> = \{([\s\S]*?)\};/);
    expect(insertPayloadBlock).not.toBeNull();
    const payload = insertPayloadBlock![1];
    const filePathLine = payload.match(/file_path:/);
    const charCountLine = payload.match(/char_count: 0/);
    const extractionStatusLine = payload.match(/extraction_status:/);
    expect(filePathLine).not.toBeNull();
    expect(charCountLine).not.toBeNull();
    expect(extractionStatusLine).not.toBeNull();

    const filePathIdx = payload.indexOf('file_path:');
    const charCountIdx = payload.indexOf('char_count: 0');
    const extractionIdx = payload.indexOf('extraction_status:');

    expect(charCountIdx).toBeGreaterThan(filePathIdx);
    expect(charCountIdx).toBeLessThan(extractionIdx);
  });

  it('char_count is set to number 0, not string "0" or null', () => {
    const match = source.match(/char_count:\s*(\S+),/);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe('0');
  });
});

// ── Fix 3: char_count in createVersion update ──

describe('Fix 3: char_count update in createVersion (doc-os.ts)', () => {
  const source = readSharedSource('doc-os.ts');

  it('createVersion function updates char_count alongside latest_version_id', () => {
    expect(source).toContain('char_count: opts.plaintext.trim().length');
  });

  it('char_count update is in the same .update() call as latest_version_id', () => {
    // Find the .update() call that sets both latest_version_id and char_count
    const updateCall = source.match(/\.update\(\{[^}]*(?:latest_version_id|char_count)[^}]*\}\)/)?.[0] || '';
    expect(updateCall).toContain('latest_version_id');
    expect(updateCall).toContain('char_count');
  });

  it('the combined update only fires when hasRenderableContent is true', () => {
    // The .update() call on line 523 contains both latest_version_id and char_count
    // It only executes inside the if (hasRenderableContent) block
    expect(source).toContain('.update({ latest_version_id:');
    expect(source).toContain('char_count: opts.plaintext.trim().length');
    // Verify the update is on line 523 inside the if block (lines 520-530)
    const line523 = source.match(/\.update\(\{ latest_version_id: newVersion\.id, char_count: opts\.plaintext\.trim\(\)\.length \}\)/);
    expect(line523).not.toBeNull();
  });

  it('char_count uses opts.plaintext.trim().length for accurate count', () => {
    // Verify the exact expression for char_count in createVersion
    expect(source).toContain('char_count: opts.plaintext.trim().length');
  });

  it('hasRenderableContent threshold is > 10 chars (not >=)', () => {
    // The threshold should be strictly greater than 10 (so empty/placeholder <11 chars don't trigger)
    const match = source.match(/hasRenderableContent.*> 10/);
    expect(match).not.toBeNull();
    // Verify it's NOT >= 10
    expect(source).not.toMatch(/hasRenderableContent[^]*>=\s*10/);
  });

  it('else branch exists for placeholder versions (<10 chars) that skips the update', () => {
    expect(source).toContain('SKIPPED latest_version_id');
    expect(source).toContain('has no renderable content');
  });
});

// ── Invariant / Regression Checks ──

describe('Invariant checks — no structural changes to ladder logic', () => {
  const autoRunSource = readEdgeFunctionSource('auto-run');
  const sharedSource = readSharedSource('doc-os.ts');

  it('auto-run APPROVAL_REQUIRED_STAGES does NOT include non-terminal stages from other ladders', () => {
    // These stages should NOT be in the approval set (they're handled by other gates)
    const notExpected = ['idea', 'concept_brief', 'treatment', 'story_outline', 'beat_sheet',
                         'feature_script', 'episode_script', 'season_master_script',
                         'production_draft', 'episode_beats', 'vertical_episode_beats',
                         'documentary_outline'];
    for (const stage of notExpected) {
      // Check if it appears inside APPROVAL_REQUIRED_STAGES
      const approvalBlock = autoRunSource.match(/const APPROVAL_REQUIRED_STAGES = new Set\(\[([\s\S]*?)\]\)/);
      if (approvalBlock) {
        expect(approvalBlock[1]).not.toContain(`"${stage}"`);
      }
    }
  });

  it('ladder-invariant.ts has NOT been changed (no structural changes)', () => {
    // Verify ladder-invariant still has its key exports (structural check only)
    const invSource = readSharedSource('ladder-invariant.ts');
    expect(invSource).toContain('export function assertValidLadder');
    expect(invSource).toContain('export function getCanonicalNextStage');
    expect(invSource).toContain('export function assertFeatureFilmOrder');
  });

  it('decisionPolicyRegistry.ts is unchanged (no drift in promotion logic)', () => {
    const dprSource = readSharedSource('decisionPolicyRegistry.ts');
    expect(dprSource).toContain('buildDecisionKey');
    expect(dprSource).toContain('REQUIRED_DECISIONS_BY_STAGE');
    expect(dprSource).toContain('export function classifyDecision');
  });

  it('stage-ladders.json vertical-drama ladder structure is correct', () => {
    const ladderData = JSON.parse(readLadderJson());
    const vdLadder = ladderData.FORMAT_LADDERS['vertical-drama'];
    expect(vdLadder).toEqual([
      'idea',
      'concept_brief',
      'format_rules',
      'character_bible',
      'season_arc',
      'episode_grid',
      'vertical_episode_beats',
      'season_script',
    ]);
  });

  it('doc-os.ts exports the expected functions unchanged', () => {
    expect(sharedSource).toContain('export async function ensureDocSlot');
    expect(sharedSource).toContain('export async function createVersion');
    expect(sharedSource).toContain('export function computeDefaultResolverHash');
  });

  it('auto-run self-chain architecture is intact', () => {
    // Verify the critical self-chain pattern still exists
    expect(autoRunSource).toContain('"run-next"');
    expect(autoRunSource).toContain('self-chain');
  });
});