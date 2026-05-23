/**
 * Tests for: Fix treatment rewrite UI fails to render
 *
 * Commit a112ae4 — Adds `flushSync(() => setTreatmentRewritePending(true))` 
 * to force synchronous render so <TreatmentActsProgress> mounts immediately
 * during React 18 automatic async batching.
 *
 * Change line 1436:
 *   - setTreatmentRewritePending(true);
 *   + flushSync(() => setTreatmentRewritePending(true));
 *
 * AND line 2:
 *   + import { flushSync } from 'react-dom';
 */
import { describe, it, expect } from 'vitest';

const ENG_PATH = '/Users/laralane/code/iffy/src/pages/ProjectDevelopmentEngine.tsx';

// ════════════════════════════════════════════════════════════════════════════════
// FIX: flushSync wrapper for synchronous TreatmentActsProgress render
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix — flushSync wrapper for synchronous TreatmentActsProgress render', () => {

  // Helper: load source and get all lines
  async function getLines(): Promise<string[]> {
    const fs = await import('fs');
    return fs.readFileSync(ENG_PATH, 'utf-8').split('\n');
  }

  // ── Primary use case ──────────────────────────────────────────────────────

  it('imports flushSync from react-dom', async () => {
    const lines = await getLines();
    const importLine = lines.find(l => l.includes('flushSync') && l.includes('import'));
    expect(importLine).toBeDefined();
    expect(importLine).toContain("import { flushSync } from 'react-dom'");
  });

  it('setTreatmentRewritePending(true) is wrapped with flushSync', async () => {
    const lines = await getLines();
    const trueCallLine = lines.find(l =>
      l.includes('setTreatmentRewritePending(true)')
    );
    expect(trueCallLine).toBeDefined();
    // Must be inside flushSync
    expect(trueCallLine).toContain('flushSync(() => setTreatmentRewritePending(true))');
  });

  it('setTreatmentRewritePending(true) only appears wrapped in flushSync once', async () => {
    const lines = await getLines();
    const allTrueCalls = lines.filter(l => l.includes('setTreatmentRewritePending(true)'));
    expect(allTrueCalls.length).toBe(1);
    // The single occurrence must be flushSync-wrapped
    expect(allTrueCalls[0]).toContain('flushSync(');
  });

  // ── Edge case: set(false) does NOT need flushSync ────────────────────────

  it('setTreatmentRewritePending(false) does NOT use flushSync (cleanup is not render-triggering)', async () => {
    const lines = await getLines();
    const falseLines = lines.filter(l =>
      l.includes('setTreatmentRewritePending(false)')
    );
    // At least one false reset exists
    expect(falseLines.length).toBeGreaterThanOrEqual(1);
    // None of them should use flushSync (resetting state doesn't need sync render)
    falseLines.forEach(line => {
      expect(line).not.toContain('flushSync');
    });
  });

  // ── Invariant: flushSync is not overused ─────────────────────────────────

  it('flushSync is only used in one place — the treatment rewrite pending setter', async () => {
    const lines = await getLines();
    const flushSyncCalls = lines.filter(l =>
      l.includes('flushSync') && !l.includes('import')
    );
    // Should be exactly 1 call site
    expect(flushSyncCalls.length).toBe(1);
    expect(flushSyncCalls[0]).toContain('setTreatmentRewritePending(true)');
  });

  // ── Regression: useState declaration unchanged ───────────────────────────

  it('treatmentRewritePending useState declaration is unchanged', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    expect(src).toContain('const [treatmentRewritePending, setTreatmentRewritePending] = useState(false)');
  });

  // ── Structural integrity: flushSync is called in the treatment doc branch ─

  it('flushSync wrapper is inside the treatment/long_treatment doc_type block', async () => {
    const lines = await getLines();
    const flushCallIdx = lines.findIndex(l =>
      l.includes('flushSync') && !l.includes('import')
    );
    expect(flushCallIdx).toBeGreaterThanOrEqual(0);

    // Search backward for the condition that guards this block
    const precedingBlock = lines.slice(Math.max(0, flushCallIdx - 8), flushCallIdx).join('\n');
    // The flushSync call should be within the if block checking treatment/long_treatment
    expect(precedingBlock).toMatch(/selectedDoc\?\.doc_type\s*===\s*'treatment'/);
    expect(precedingBlock).toMatch(/selectedDoc\?\.doc_type\s*===\s*'long_treatment'/);
  });

  // ── Edge case: cleanup resets state without flushSync ────────────────────

  it('error handler sets treatmentRewritePending to false without flushSync', async () => {
    const lines = await getLines();
    const flushCallIdx = lines.findIndex(l =>
      l.includes('flushSync') && !l.includes('import')
    );
    expect(flushCallIdx).toBeGreaterThanOrEqual(0);

    // After the flushSync line, there should be a try/catch that sets false
    const afterFlush = lines.slice(flushCallIdx, flushCallIdx + 50).join('\n');
    expect(afterFlush).toMatch(/setTreatmentRewritePending\(false\)/);
    // The false setter should NOT be in another flushSync
    const falseInAfter = lines.slice(flushCallIdx + 1, flushCallIdx + 50).filter(l =>
      l.includes('setTreatmentRewritePending(false)')
    );
    falseInAfter.forEach(line => {
      expect(line).not.toContain('flushSync');
    });
  });
});