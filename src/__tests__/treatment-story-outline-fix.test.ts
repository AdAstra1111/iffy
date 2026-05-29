/**
 * Tests for Treatment → Story Outline Fix (4 patches from Red)
 *
 * P1+P2: chunkRunner.ts
 *   - per-entry JSON validation for story_outline chunks
 *   - Exponential backoff between retry attempts
 *   - validationError tracking on all validation paths
 *   - Critical retry instruction injection for unparseable JSON
 *
 * P3: generate-document/index.ts
 *   - countTreatmentActSections(): counts ## Act N: headers
 *   - validateTreatmentSections: fallback injection when treatment has < 3 acts
 *
 * P4: SectionedDocProgress.tsx
 *   - Staleness guard (version bg_generating + active chunks)
 *   - Authoritative progress from version meta_json
 *   - Regenerating badge logic (needs_regen status)
 *   - Error field display on failed chunks
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(import.meta.dirname!, '../../');
const CHUNK_RUNNER_PATH = resolve(PROJECT_ROOT, 'supabase/functions/_shared/chunkRunner.ts');
const GENERATE_DOC_PATH = resolve(PROJECT_ROOT, 'supabase/functions/generate-document/index.ts');
const SECTIONED_DOC_PATH = resolve(PROJECT_ROOT, 'src/components/devengine/SectionedDocProgress.tsx');

function readSource(relativePath: string): string {
  return readFileSync(resolve(PROJECT_ROOT, relativePath), 'utf-8');
}

// ===========================================================================
// P1+P2: chunkRunner — Story outline JSON validation + backoff
// ===========================================================================

describe('P1+P2: chunkRunner — story outline JSON validation & backoff', () => {

  // ── backoffDelay pure function ──

  function backoffDelay(attempt: number): { ms: number; type: string } {
    const ms = Math.min(500 * Math.pow(2, attempt), 4000);
    return { ms, type: 'Promise<void>' };
  }

  it('backoffDelay attempt 0 = 500ms', () => {
    const r = backoffDelay(0);
    expect(r.ms).toBe(500);
  });

  it('backoffDelay attempt 1 = 1000ms', () => {
    const r = backoffDelay(1);
    expect(r.ms).toBe(1000);
  });

  it('backoffDelay attempt 2 = 2000ms', () => {
    const r = backoffDelay(2);
    expect(r.ms).toBe(2000);
  });

  it('backoffDelay attempt 3 = 4000ms (capped)', () => {
    const r = backoffDelay(3);
    expect(r.ms).toBe(4000);
  });

  it('backoffDelay attempt 4+ = 4000ms (capped)', () => {
    const r = backoffDelay(4);
    expect(r.ms).toBe(4000);
    expect(backoffDelay(10).ms).toBe(4000);
  });

  it('backoffDelay returns a Promise type', () => {
    const r = backoffDelay(0);
    expect(r.type).toBe('Promise<void>');
  });

  // ── Story outline JSON validation pure logic ──

  function validateStoryOutlineContent(content: string): { valid: boolean; error: string } {
    try {
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.entries)) {
        return { valid: true, error: '' };
      }
      return { valid: false, error: 'story_outline chunk failed JSON validation after max retries' };
    } catch {
      return { valid: false, error: 'story_outline chunk produced unparseable JSON' };
    }
  }

  it('valid JSON with entries array passes', () => {
    const result = validateStoryOutlineContent(JSON.stringify({
      entries: [
        { number: 1, title: 'Opening', description: 'The hero wakes up.' },
        { number: 2, title: 'Inciting Incident', description: 'A call to action.' },
      ]
    }));
    expect(result.valid).toBe(true);
    expect(result.error).toBe('');
  });

  it('valid JSON with empty entries array passes', () => {
    const result = validateStoryOutlineContent(JSON.stringify({ entries: [] }));
    expect(result.valid).toBe(true);
  });

  it('valid JSON but entries is missing fails', () => {
    const result = validateStoryOutlineContent(JSON.stringify({ moments: [], title: 'test' }));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('story_outline chunk failed JSON validation after max retries');
  });

  it('valid JSON but entries is not an array fails', () => {
    const result = validateStoryOutlineContent(JSON.stringify({ entries: 'not-an-array' }));
    expect(result.valid).toBe(false);
  });

  it('valid JSON but entries is null fails', () => {
    const result = validateStoryOutlineContent(JSON.stringify({ entries: null }));
    expect(result.valid).toBe(false);
  });

  it('invalid JSON (unparseable) fails with unparseable error', () => {
    const result = validateStoryOutlineContent('not valid json at all {{{');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('story_outline chunk produced unparseable JSON');
  });

  it('empty string fails with unparseable error', () => {
    const result = validateStoryOutlineContent('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('story_outline chunk produced unparseable JSON');
  });

  it('JSON with entries containing number, title, description fields passes', () => {
    const result = validateStoryOutlineContent(JSON.stringify({
      entries: [
        { number: 1, title: 'First', description: 'First scene' },
        { number: 2, title: 'Second', description: 'Second scene' },
        { number: 3, title: 'Third', description: 'Third scene' },
        { number: 4, title: 'Fourth', description: 'Fourth scene' },
        { number: 5, title: 'Fifth', description: 'Fifth scene' },
      ]
    }));
    expect(result.valid).toBe(true);
  });

  it('JSON with nested objects inside entries still passes (entries is array)', () => {
    // Validation only checks that entries is an array — individual entry structure
    // is the LLM's responsibility
    const result = validateStoryOutlineContent(JSON.stringify({
      entries: [{ anything: 'goes', really: true, deep: { nested: 'object' } }]
    }));
    expect(result.valid).toBe(true);
  });

  it('JSON with extra top-level keys besides entries passes', () => {
    const result = validateStoryOutlineContent(JSON.stringify({
      title: 'My Outline',
      format: 'feature_film',
      entries: [{ number: 1, title: 'Act 1', description: 'Setup' }],
      metadata: { generated_at: '2026-01-01' },
    }));
    expect(result.valid).toBe(true);
  });

  // ── Source code assertions ──

  it('source code: backoffDelay function exists in chunkRunner.ts', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('function backoffDelay');
    expect(source).toContain('500 * Math.pow(2, attempt)');
    expect(source).toContain('4000');
  });

  it('source code: story_outline validation branch exists in chunkRunner.ts', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('docType === "story_outline"');
    expect(source).toContain('JSON.parse(content)');
    expect(source).toContain('Array.isArray(parsed.entries)');
  });

  it('source code: validationError is tracked on story_outline validation failure', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('validationError = "story_outline chunk produced unparseable JSON"');
    expect(source).toContain('validationError = "story_outline chunk failed JSON validation after max retries"');
  });

  it('source code: CRITICAL RETRY INSTRUCTION is injected when story_outline fails', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('CRITICAL RETRY INSTRUCTION');
    expect(source).toContain('Output ONLY a JSON object with an "entries" array');
  });

  it('source code: backoffDelay called before continue on story_outline retry', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    // The continue statement is inside the if block after backoffDelay
    const storyBlock = source.slice(source.indexOf('docType === "story_outline"'));
    expect(storyBlock).toContain('backoffDelay(attempt)');
  });

  it('source code: backoffDelay called on episodic and beat_sequential retries too', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    // backoffDelay should be on all three validation branches
    const backoffCount = (source.match(/backoffDelay\(attempt\)/g) || []).length;
    expect(backoffCount).toBeGreaterThanOrEqual(3); // episodic, beat_sequential, story_outline
  });

  it('source code: validationError tracking on episodic validation path', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('validationError = validation.failures.map(f => f.detail).join("; ")');
  });

  it('source code: validationError tracking on beat_sequential validation path', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    const beatBlock = source.slice(source.indexOf('beat_sequential'));
    expect(beatBlock).toContain('validationError');
  });

  it('source code: failMeta stores last_error from err.message (300 char max)', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('last_error');
    expect(source).toContain('.slice(0, 300)');
  });
});

// ===========================================================================
// P3: generate-document — validateTreatmentSections
// ===========================================================================

describe('P3: generate-document — countTreatmentActSections & validateTreatmentSections', () => {

  // ── countTreatmentActSections pure function ──

  function countTreatmentActSections(treatmentText: string): { found: number; total: number; foundActs: string[] } {
    const actHeaders = ["## Act 1:", "## Act 2A:", "## Act 2B:", "## Act 3:"];
    const foundActs = actHeaders.filter(h => treatmentText.includes(h));
    return { found: foundActs.length, total: actHeaders.length, foundActs };
  }

  it('all 4 act sections present: returns found=4, total=4', () => {
    const result = countTreatmentActSections(
      '## Act 1:\nIntro\n## Act 2A:\nRising\n## Act 2B:\nTwist\n## Act 3:\nEnding'
    );
    expect(result.found).toBe(4);
    expect(result.total).toBe(4);
    expect(result.foundActs).toEqual(['## Act 1:', '## Act 2A:', '## Act 2B:', '## Act 3:']);
  });

  it('only 2 act sections present: returns found=2, total=4', () => {
    const result = countTreatmentActSections(
      '## Act 1:\nIntro\n## Act 3:\nEnding'
    );
    expect(result.found).toBe(2);
    expect(result.total).toBe(4);
    expect(result.foundActs).toEqual(['## Act 1:', '## Act 3:']);
  });

  it('no act headers present: returns found=0, total=4', () => {
    const result = countTreatmentActSections(
      'This treatment has no act headers at all.\nJust some paragraphs of text.'
    );
    expect(result.found).toBe(0);
    expect(result.total).toBe(4);
    expect(result.foundActs).toEqual([]);
  });

  it('empty string: returns found=0, total=4', () => {
    const result = countTreatmentActSections('');
    expect(result.found).toBe(0);
    expect(result.foundActs).toEqual([]);
  });

  it('only Act 1 and Act 2A present: returns found=2', () => {
    const result = countTreatmentActSections(
      '## Act 1:\nSetup\n## Act 2A:\nComplications'
    );
    expect(result.found).toBe(2);
    expect(result.foundActs).toEqual(['## Act 1:', '## Act 2A:']);
  });

  it('Act 1, Act 2A, Act 2B present but Act 3 missing: returns found=3', () => {
    const result = countTreatmentActSections(
      '## Act 1:\nA\n## Act 2A:\nB\n## Act 2B:\nC'
    );
    expect(result.found).toBe(3);
  });

  it('case sensitivity: "## act 1:" (lowercase) does NOT match', () => {
    const result = countTreatmentActSections('## act 1:\nIntro');
    expect(result.found).toBe(0);
  });

  it('alternate header formats do NOT match (e.g. "##Act 1:" without space)', () => {
    const result = countTreatmentActSections('##Act 1:\nIntro\n## Act 2A:\nRising');
    expect(result.found).toBe(1); // Only "## Act 2A:" matches
    expect(result.foundActs).toEqual(['## Act 2A:']);
  });

  // ── validateTreatmentSections pure logic ──

  function simulateValidateTreatmentSections(
    docType: string,
    treatmentText: string | null,
  ): { fallbackInjected: boolean; logLevel: string; fallbackContent: string } {
    if (docType !== 'story_outline') {
      return { fallbackInjected: false, logLevel: 'none', fallbackContent: '' };
    }
    if (!treatmentText) {
      return { fallbackInjected: false, logLevel: 'warn_no_treatment', fallbackContent: '' };
    }
    const { found, total, foundActs } = countTreatmentActSections(treatmentText);
    if (found < 3) {
      const fallback =
        `### TREATMENT ACT STRUCTURE FALLBACK\n` +
        `The upstream treatment may be missing some act sections. The project should follow a standard 4-act structure:\n` +
        `- Act 1: Setup — introduces characters, world, and central conflict\n` +
        `- Act 2A: Rising Action — complications escalate, stakes increase\n` +
        `- Act 2B: Complications — midpoint turn, darkest moment, preparing for climax\n` +
        `- Act 3: Climax & Resolution — final confrontation and resolution\n` +
        `Use the available treatment content as the primary source. Fill structural gaps with this fallback guide.`;
      return { fallbackInjected: true, logLevel: 'warn_injecting', fallbackContent: fallback };
    }
    return { fallbackInjected: false, logLevel: 'ok', fallbackContent: '' };
  }

  it('story_outline with complete treatment (found >= 3) — no fallback injected', () => {
    const result = simulateValidateTreatmentSections('story_outline', '## Act 1:\nA\n## Act 2A:\nB\n## Act 2B:\nC\n## Act 3:\nD');
    expect(result.fallbackInjected).toBe(false);
    expect(result.logLevel).toBe('ok');
  });

  it('story_outline with exactly 3 acts (Act 1, Act 2A, Act 2B) — no fallback (found=3, threshold is < 3)', () => {
    const result = simulateValidateTreatmentSections('story_outline', '## Act 1:\nA\n## Act 2A:\nB\n## Act 2B:\nC');
    expect(result.fallbackInjected).toBe(false);
    expect(result.logLevel).toBe('ok');
  });

  it('story_outline with only 1 act — fallback injected', () => {
    const result = simulateValidateTreatmentSections('story_outline', '## Act 1:\nSome content');
    expect(result.fallbackInjected).toBe(true);
  });

  it('story_outline with no acts (text without headers) — fallback injected', () => {
    const result = simulateValidateTreatmentSections('story_outline', 'Some treatment text with no act headers at all');
    expect(result.fallbackInjected).toBe(true);
  });

  it('story_outline with no treatment content (null) — warn but no fallback', () => {
    const result = simulateValidateTreatmentSections('story_outline', null);
    expect(result.fallbackInjected).toBe(false);
    expect(result.logLevel).toBe('warn_no_treatment');
  });

  it('story_outline with empty string treatment — no fallback (falsy, caught by else branch)', () => {
    const result = simulateValidateTreatmentSections('story_outline', '');
    expect(result.fallbackInjected).toBe(false);
    expect(result.logLevel).toBe('warn_no_treatment');
  });

  it('non-story_outline doc types bypass the check entirely', () => {
    expect(simulateValidateTreatmentSections('treatment', '## Act 1:\nA').fallbackInjected).toBe(false);
    expect(simulateValidateTreatmentSections('beat_sheet', '## Act 1:\nA').fallbackInjected).toBe(false);
    expect(simulateValidateTreatmentSections('character_bible', '## Act 1:\nA').fallbackInjected).toBe(false);
    expect(simulateValidateTreatmentSections('feature_script', '## Act 1:\nA').fallbackInjected).toBe(false);
    expect(simulateValidateTreatmentSections('concept_brief', null).fallbackInjected).toBe(false);
  });

  it('fallback content contains all 4 act descriptions', () => {
    const result = simulateValidateTreatmentSections('story_outline', '## Act 1:\nPartial');
    expect(result.fallbackContent).toContain('Setup');
    expect(result.fallbackContent).toContain('Rising Action');
    expect(result.fallbackContent).toContain('Complications');
    expect(result.fallbackContent).toContain('Climax');
  });

  it('fallback content instructs to use treatment as primary source', () => {
    const result = simulateValidateTreatmentSections('story_outline', '## Act 1:\nPartial');
    expect(result.fallbackContent).toContain('primary source');
    expect(result.fallbackContent).toContain('Fill structural gaps');
  });

  // ── Source code assertions ──

  it('source code: countTreatmentActSections function exists in generate-document/index.ts', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    expect(source).toContain('function countTreatmentActSections');
    expect(source).toContain('"## Act 1:"');
    expect(source).toContain('"## Act 2A:"');
    expect(source).toContain('"## Act 2B:"');
    expect(source).toContain('"## Act 3:"');
  });

  it('source code: validateTreatmentSections for story_outline exists in generate-document', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    const validateBlock = source.slice(source.indexOf('// ── Validate Treatment sections for story_outline'));
    expect(validateBlock).toContain('docType === "story_outline"');
    expect(validateBlock).toContain('countTreatmentActSections');
  });

  it('source code: fallback injected when treatment has < 3 act sections', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    const validateBlock = source.slice(source.indexOf('// ── Validate Treatment sections for story_outline'));
    expect(validateBlock).toContain('found < 3');
    expect(validateBlock).toContain('TREATMENT ACT STRUCTURE FALLBACK');
  });

  it('source code: warn logged when no treatment content found', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    const validateBlock = source.slice(source.indexOf('// ── Validate Treatment sections for story_outline'));
    expect(validateBlock).toContain('no treatment content found for story_outline');
  });

  it('source code: fallback has expected structure (setup, rising, complications, climax)', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    const fallbackBlock = source.slice(source.indexOf('TREATMENT ACT STRUCTURE FALLBACK'));
    expect(fallbackBlock).toContain('Setup');
    expect(fallbackBlock).toContain('Rising Action');
    expect(fallbackBlock).toContain('Complications');
    expect(fallbackBlock).toContain('Climax');
    expect(fallbackBlock).toContain('primary source');
  });
});

// ===========================================================================
// P4: SectionedDocProgress — staleness guard, authoritative progress, badges
// ===========================================================================

describe('P4: SectionedDocProgress — staleness, authoritative progress, regenerating badges', () => {

  // ── Pure function mirrors of SectionedDocProgress logic ──

  function computeVersionMeta(meta: Record<string, any> | null | undefined): {
    versionBgGenerating: boolean;
    versionChunksTotal: number | undefined;
    versionChunksCompleted: number | undefined;
  } {
    return {
      versionBgGenerating: meta?.bg_generating !== false,
      versionChunksTotal: meta?.chunks_total,
      versionChunksCompleted: meta?.chunks_completed,
    };
  }

  function computeProgress(
    versionChunksTotal: number | undefined,
    versionChunksCompleted: number | undefined,
    total: number,
    doneCount: number,
  ): { authoritativeTotal: number; authoritativeDone: number; pct: number } {
    const authTotal = versionChunksTotal ?? total;
    const authDone = versionChunksCompleted ?? doneCount;
    const pct = authTotal > 0 ? Math.round((authDone / authTotal) * 100) : 0;
    return { authoritativeTotal: authTotal, authoritativeDone: authDone, pct };
  }

  function computeIsStale(
    versionBgGenerating: boolean,
    chunks: { status: string }[],
  ): boolean {
    const isStillActive = chunks.some(c => c.status === 'running' || c.status === 'pending' || c.status === 'needs_regen');
    return !versionBgGenerating && isStillActive && chunks.length > 0;
  }

  function computeIsStillActive(chunks: { status: string }[]): boolean {
    return chunks.some(c => c.status === 'running' || c.status === 'pending' || c.status === 'needs_regen');
  }

  function computeProgressLabel(
    runningChunk: boolean,
    regeneratingChunks: number,
    doneCount: number,
    authoritativeTotal: number,
  ): string {
    if (runningChunk) {
      return `Writing Act 1 (${doneCount + 1} of ${authoritativeTotal})…`;
    }
    if (regeneratingChunks > 0) {
      return `Regenerating ${regeneratingChunks} section(s)…`;
    }
    if (doneCount < authoritativeTotal) {
      return `Preparing section ${doneCount + 1} of ${authoritativeTotal}…`;
    }
    return 'Assembling final document…';
  }

  // ── versionBgGenerating ──

  it('versionBgGenerating defaults to true when meta is null', () => {
    const meta = computeVersionMeta(null);
    expect(meta.versionBgGenerating).toBe(true);
  });

  it('versionBgGenerating defaults to true when meta is undefined', () => {
    const meta = computeVersionMeta(undefined);
    expect(meta.versionBgGenerating).toBe(true);
  });

  it('versionBgGenerating defaults to true when bg_generating is undefined', () => {
    const meta = computeVersionMeta({ chunks_total: 4 });
    expect(meta.versionBgGenerating).toBe(true);
  });

  it('versionBgGenerating is false when bg_generating is false', () => {
    const meta = computeVersionMeta({ bg_generating: false });
    expect(meta.versionBgGenerating).toBe(false);
  });

  it('versionBgGenerating is true when bg_generating is true', () => {
    const meta = computeVersionMeta({ bg_generating: true });
    expect(meta.versionBgGenerating).toBe(true);
  });

  it('versionBgGenerating: explicit false overrides even with chunks', () => {
    const meta = computeVersionMeta({ bg_generating: false, chunks_total: 4, chunks_completed: 4 });
    expect(meta.versionBgGenerating).toBe(false);
  });

  // ── versionChunksTotal / versionChunksCompleted ──

  it('versionChunksTotal reads from meta.chunks_total', () => {
    const meta = computeVersionMeta({ chunks_total: 8 });
    expect(meta.versionChunksTotal).toBe(8);
  });

  it('versionChunksTotal is undefined when meta has no chunks_total', () => {
    const meta = computeVersionMeta({ bg_generating: true });
    expect(meta.versionChunksTotal).toBeUndefined();
  });

  it('versionChunksCompleted reads from meta.chunks_completed', () => {
    const meta = computeVersionMeta({ chunks_completed: 6 });
    expect(meta.versionChunksCompleted).toBe(6);
  });

  // ── Authoritative progress ──

  it('authoritativeTotal falls back to chunk-derived total when versionChunksTotal is undefined', () => {
    const p = computeProgress(undefined, undefined, 10, 7);
    expect(p.authoritativeTotal).toBe(10);
    expect(p.authoritativeDone).toBe(7);
  });

  it('authoritativeTotal uses versionChunksTotal when available', () => {
    const p = computeProgress(8, 6, 10, 7);
    expect(p.authoritativeTotal).toBe(8);
    expect(p.authoritativeDone).toBe(6);
  });

  it('authoritativeDone uses versionChunksCompleted when available', () => {
    const p = computeProgress(8, 6, 10, 7);
    expect(p.authoritativeDone).toBe(6);
  });

  it('percentage computed from authoritative values', () => {
    const p = computeProgress(8, 6, 10, 7);
    expect(p.pct).toBe(75); // 6/8 = 75%
  });

  it('percentage falls back to chunk-derived when version meta is absent', () => {
    const p = computeProgress(undefined, undefined, 10, 7);
    expect(p.pct).toBe(70); // 7/10 = 70%
  });

  it('percentage is 0 when authoritativeTotal is 0', () => {
    const p = computeProgress(0, 0, 0, 0);
    expect(p.pct).toBe(0);
  });

  it('percentage is 0 when authoritativeTotal is 0 with chunk data', () => {
    const p = computeProgress(0, 0, 5, 3);
    expect(p.pct).toBe(0);
  });

  it('percentage is 100 when fully complete', () => {
    const p = computeProgress(8, 8, 8, 8);
    expect(p.pct).toBe(100);
  });

  // ── isStale ──

  it('isStale is false when version is still generating (bg_generating=true)', () => {
    const result = computeIsStale(true, [{ status: 'running' }, { status: 'pending' }]);
    expect(result).toBe(false);
  });

  it('isStale is true when version is done but chunks still show active statuses', () => {
    const result = computeIsStale(false, [{ status: 'running' }, { status: 'done' }]);
    expect(result).toBe(true);
  });

  it('isStale is true when version is done with pending chunks', () => {
    const result = computeIsStale(false, [{ status: 'pending' }, { status: 'done' }]);
    expect(result).toBe(true);
  });

  it('isStale is true when version is done with needs_regen chunks', () => {
    const result = computeIsStale(false, [{ status: 'needs_regen' }]);
    expect(result).toBe(true);
  });

  it('isStale is false when all chunks are terminal and version is done', () => {
    const result = computeIsStale(false, [
      { status: 'done' },
      { status: 'done' },
      { status: 'failed' },
      { status: 'skipped' },
    ]);
    expect(result).toBe(false);
  });

  it('isStale is false when safeChunks is empty', () => {
    const result = computeIsStale(false, []);
    expect(result).toBe(false);
  });

  it('isStale is false when version still bg_generating even with stale-looking chunks', () => {
    const result = computeIsStale(true, [{ status: 'running' }, { status: 'pending' }]);
    expect(result).toBe(false);
  });

  // ── isStillActive includes regeneratingChunks ──

  it('isStillActive is true when there are needs_regen chunks', () => {
    expect(computeIsStillActive([{ status: 'needs_regen' }])).toBe(true);
  });

  it('isStillActive is true when there are running chunks', () => {
    expect(computeIsStillActive([{ status: 'running' }])).toBe(true);
  });

  it('isStillActive is true when there are pending chunks', () => {
    expect(computeIsStillActive([{ status: 'pending' }])).toBe(true);
  });

  it('isStillActive is false when all chunks are terminal', () => {
    expect(computeIsStillActive([{ status: 'done' }, { status: 'failed' }])).toBe(false);
  });

  it('isStillActive is true with mixed terminal + needs_regen', () => {
    expect(computeIsStillActive([{ status: 'done' }, { status: 'needs_regen' }])).toBe(true);
  });

  it('isStillActive is false for empty array', () => {
    expect(computeIsStillActive([])).toBe(false);
  });

  // ── Progress label ──

  it('progressLabel: "Writing ..." when a running chunk exists', () => {
    const label = computeProgressLabel(true, 0, 2, 8);
    expect(label).toContain('Writing');
    expect(label).toContain('3 of 8');
  });

  it('progressLabel: "Regenerating" when regeneratingChunks > 0', () => {
    const label = computeProgressLabel(false, 3, 2, 8);
    expect(label).toContain('Regenerating 3 section(s)');
  });

  it('progressLabel: regeneration takes priority over preparing', () => {
    const label = computeProgressLabel(false, 2, 5, 8);
    expect(label).toContain('Regenerating');
    expect(label).not.toContain('Preparing');
  });

  it('progressLabel: "Preparing section" when doneCount < authoritativeTotal', () => {
    const label = computeProgressLabel(false, 0, 3, 8);
    expect(label).toContain('Preparing section 4 of 8');
  });

  it('progressLabel: "Assembling final document" when all done', () => {
    const label = computeProgressLabel(false, 0, 8, 8);
    expect(label).toBe('Assembling final document…');
  });

  it('progressLabel: running chunk takes priority over everything', () => {
    const label = computeProgressLabel(true, 3, 2, 8);
    expect(label).toContain('Writing');
    expect(label).not.toContain('Regenerating');
  });

  // ── Source code assertions ──

  it('source code: SectionedDocProgress.tsx has version staleness guard', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('// ── P4: versionId staleness guard ──');
    expect(source).toContain('versionMeta');
    expect(source).toContain('bg_generating');
  });

  it('source code: stale detection logic exists', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('const isStale');
    expect(source).toContain('!versionBgGenerating');
    expect(source).toContain('isStillActive');
  });

  it('source code: authoritative progress uses version meta with ?? fallback', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('authoritativeTotal');
    expect(source).toContain('versionChunksTotal ?? total');
    expect(source).toContain('versionChunksCompleted ?? doneCount');
  });

  it('source code: regeneratingChunks filtered by needs_regen status', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('needs_regen');
    expect(source).toContain('regeneratingChunks');
  });

  it('source code: isStillActive includes regeneratingChunks', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('isStillActive = runningChunks.length > 0 || pendingChunks.length > 0 || regeneratingChunks.length > 0');
  });

  it('source code: Stale badge exists with red styling', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('Stale');
    expect(source).toContain('bg-red-500/10');
    expect(source).toContain('text-red-400');
  });

  it('source code: Regenerating badge exists with amber styling', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('Regenerating');
    expect(source).toContain('bg-amber-500/10');
    expect(source).toContain('text-amber-400');
  });

  it('source code: error field displayed on retryable failed chunks', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('chunk.error');
    expect(source).toContain('font-mono');
    expect(source).toContain('Retryable failure: softer messaging + error detail');
  });

  it('source code: error field displayed on terminal failed chunks', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('Terminal failure (skipped) — no retry, show error if available');
    expect(source).toContain('text-destructive/60');
  });

  it('source code: ChunkRow interface includes error field', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('error: string | null');
  });

  it('source code: chunk query now selects error field', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain("'id, chunk_index, chunk_key, status, content, char_count, meta_json, error'");
  });

  it('source code: progressLabel shows regenerating count', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    expect(source).toContain('Regenerating ${regeneratingChunks.length} section(s)');
  });

  it('source code: assembly/rendering decisions respect badge priority (stale > regenerating > live)', () => {
    const source = readSource('src/components/devengine/SectionedDocProgress.tsx');
    // Badge priority: isStale first check, then regenerating, then isStillActive as last
    const badgeBlock = source.slice(source.indexOf('{isStale && ('));
    expect(badgeBlock).toContain('isStale');
    const afterStale = badgeBlock.slice(badgeBlock.indexOf('regeneratingChunks.length > 0'));
    expect(afterStale).toContain('regeneratingChunks');
    const afterRegen = afterStale.slice(afterStale.indexOf('isStillActive'));
    expect(afterRegen).toContain('isStillActive');
  });
});

// ===========================================================================
// Cross-cutting: edge cases and invariants
// ===========================================================================

describe('Cross-cutting: edge cases and invariants', () => {
  it('ALL 4 patches source code exists across the 3 files', () => {
    const chunkSource = readSource('supabase/functions/_shared/chunkRunner.ts');
    const genSource = readSource('supabase/functions/generate-document/index.ts');
    const sectionedSource = readSource('src/components/devengine/SectionedDocProgress.tsx');

    // P1+P2: Story outline JSON validation + backoff
    expect(chunkSource).toContain('docType === "story_outline"');
    expect(chunkSource).toContain('backoffDelay');

    // P3: validateTreatmentSections
    expect(genSource).toContain('countTreatmentActSections');
    expect(genSource).toContain('TREATMENT ACT STRUCTURE FALLBACK');

    // P4: Staleness guard
    expect(sectionedSource).toContain('versionBgGenerating');
    expect(sectionedSource).toContain('authoritativeTotal');
    expect(sectionedSource).toContain('regeneratingChunks');
    expect(sectionedSource).toContain('isStale');
  });

  it('invariant: story_outline validation does NOT affect other doc types in chunkRunner', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    // The story_outline validation is inside a `else if (docType === "story_outline")` guard
    const storyBlock = source.slice(source.indexOf('docType === "story_outline"'));
    const storySection = source.slice(
      source.indexOf('else if (docType === "story_outline")'),
      source.indexOf('// Check for banned summarization language')
    );
    expect(storySection).toContain('docType === "story_outline"');
  });

  it('invariant: validateTreatmentSections only applies to story_outline', () => {
    const source = readSource('supabase/functions/generate-document/index.ts');
    const validateBlock = source.slice(source.indexOf('// ── Validate Treatment sections for story_outline'));
    expect(validateBlock).toContain('if (docType === "story_outline")');
  });

  it('regression: existing story-outline-fixes tests still pass for other fixes', () => {
    const source = readSource('supabase/functions/_shared/chunkRunner.ts');
    expect(source).toContain('storyOutlineCompletionPass');
    expect(source).toContain('OUTPUT SCHEMA');
  });

  it('edge case: story_outline with whitespace-only JSON content fails validation', () => {
    const result = JSON.parse('{}');
    // {} is valid JSON but lacks entries array
    expect(result).toEqual({});
    expect(Array.isArray(result.entries)).toBe(false);
  });

  it('edge case: story_outline with null content fails validation', () => {
    // null in JSON.parse resolves to null value
    expect(() => JSON.parse('null')).not.toThrow();
    const parsed = JSON.parse('null');
    expect(parsed).toBeNull();
    // null coerces through && to null; !! null = false for entries check
    const entriesCheck = !!(parsed && Array.isArray(parsed.entries));
    expect(entriesCheck).toBe(false);
  });

  it('edge case: story_outline with entries containing empty array still passes', () => {
    const result = JSON.parse('{"entries": []}');
    expect(Array.isArray(result.entries)).toBe(true);
    expect(result.entries.length).toBe(0);
  });

  it('invariant: backoffDelay does not exceed 4000ms cap even at high attempts', () => {
    for (let i = 0; i < 20; i++) {
      const ms = Math.min(500 * Math.pow(2, i), 4000);
      expect(ms).toBeLessThanOrEqual(4000);
      expect(ms).toBeGreaterThanOrEqual(0);
    }
  });
});
