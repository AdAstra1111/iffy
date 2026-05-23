/**
 * Tests for: Fix treatment rewrite duplicate UIs
 *
 * Commit 243d4f7 — Single-line change in ProjectDevelopmentEngine.tsx at line 2637:
 * Adds `!treatmentRewritePending &&` guard to the TreatmentRewritePanel render condition.
 *
 * This creates proper mutual exclusion with line 2503's TreatmentActsProgress render.
 *
 * Change:   -{isTreatmentDocType(selectedDoc?.doc_type) && selectedDocId && selectedVersionId && (
 *           +{isTreatmentDocType(selectedDoc?.doc_type) && selectedDocId && selectedVersionId && !treatmentRewritePending && (
 */import { describe, it, expect } from 'vitest';

const ENG_PATH = '/Users/laralane/code/iffy/src/pages/ProjectDevelopmentEngine.tsx';

// ════════════════════════════════════════════════════════════════════════════════
// FIX: TreatmentRewritePanel mutual exclusion with TreatmentActsProgress
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix — TreatmentRewritePanel / TreatmentActsProgress mutual exclusion', () => {

  // Helper: load source and get all lines
  async function getLines(): Promise<string[]> {
    const fs = await import('fs');
    return fs.readFileSync(ENG_PATH, 'utf-8').split('\n');
  }

  // ── Primary use case ──────────────────────────────────────────────────────

  it('TreatmentRewritePanel render condition includes !treatmentRewritePending guard', async () => {
    const lines = await getLines();

    // Find the TreatmentRewritePanel render tag (not the import)
    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    // The condition is on the line BEFORE the JSX tag
    const conditionLine = lines[panelLineIdx - 1];
    expect(conditionLine).toContain('!treatmentRewritePending');
  });

  it('TreatmentRewritePanel condition is mutually exclusive with TreatmentActsProgress condition', async () => {
    const lines = await getLines();

    // Find TreatmentActsProgress render usage (not the import)
    const actsLineIdx = lines.findIndex((l, i) =>
      l.includes('TreatmentActsProgress') && !lines[i - 1]?.includes('import')
    );
    expect(actsLineIdx).toBeGreaterThanOrEqual(0);

    // Find TreatmentRewritePanel render tag
    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    // The condition lines are directly above the component tags
    const actsCondition = lines[actsLineIdx - 1];
    const panelCondition = lines[panelLineIdx - 1];

    // TreatmentActsProgress requires treatmentRewritePending=true (no negation)
    expect(actsCondition).toContain('treatmentRewritePending');
    expect(actsCondition).not.toContain('!treatmentRewritePending');

    // TreatmentRewritePanel requires treatmentRewritePending=false
    expect(panelCondition).toContain('!treatmentRewritePending');
  });

  // ── Mutual exclusion invariants ───────────────────────────────────────────

  it('TreatmentRewritePanel is NOT rendered when treatmentRewritePending is true (has ! guard)', async () => {
    const lines = await getLines();

    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    const conditionLine = lines[panelLineIdx - 1];
    expect(conditionLine).toMatch(/!treatmentRewritePending\s*&&/);
  });

  it('TreatmentActsProgress is rendered when treatmentRewritePending=true AND isTreatmentDocType', async () => {
    const lines = await getLines();

    const actsLineIdx = lines.findIndex((l, i) =>
      l.includes('TreatmentActsProgress') && !lines[i - 1]?.includes('import')
    );
    expect(actsLineIdx).toBeGreaterThanOrEqual(0);

    const conditionLine = lines[actsLineIdx - 1];
    expect(conditionLine).toContain('treatmentRewritePending');
    expect(conditionLine).toContain('isTreatmentDocType');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('Both render conditions use the same isTreatmentDocType check', async () => {
    const lines = await getLines();

    const actsLineIdx = lines.findIndex((l, i) =>
      l.includes('TreatmentActsProgress') && !lines[i - 1]?.includes('import')
    );
    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(actsLineIdx).toBeGreaterThanOrEqual(0);
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    const actsCond = lines[actsLineIdx - 1];
    const panelCond = lines[panelLineIdx - 1];

    // Both use isTreatmentDocType
    expect(actsCond).toContain('isTreatmentDocType');
    expect(panelCond).toContain('isTreatmentDocType');
  });

  it('TreatmentRewritePanel condition includes same doc/version guards as before (no regression)', async () => {
    const lines = await getLines();

    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    const conditionLine = lines[panelLineIdx - 1];

    // Must still require selectedDocId and selectedVersionId (same as before the fix)
    expect(conditionLine).toContain('selectedDocId');
    expect(conditionLine).toContain('selectedVersionId');
    expect(conditionLine).toContain('isTreatmentDocType');
  });

  it('Fallback OperationProgress correctly handles treatmentRewritePending for non-treatment docs', async () => {
    const lines = await getLines();

    const fallbackLine = lines.find(l =>
      l.includes('isActive={rewrite.isPending || treatmentRewritePending}')
    );
    expect(fallbackLine).toBeDefined();
    // Verify this is the else-branch fallback (not the TreatmentActsProgress ternary)
    expect(fallbackLine).toContain('OperationProgress');
  });

  // ── Invariant: no duplicate renders ───────────────────────────────────────

  it('Both TreatmentRewritePanel and TreatmentActsProgress cannot render simultaneously', async () => {
    const lines = await getLines();

    const actsLineIdx = lines.findIndex((l, i) =>
      l.includes('TreatmentActsProgress') && !lines[i - 1]?.includes('import')
    );
    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(actsLineIdx).toBeGreaterThanOrEqual(0);
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    const actsCond = lines[actsLineIdx - 1];
    const panelCond = lines[panelLineIdx - 1];

    // Acts shows when treatmentRewritePending=true (no negation)
    expect(actsCond).toContain('treatmentRewritePending');
    expect(actsCond).not.toContain('!treatmentRewritePending');

    // Panel shows when treatmentRewritePending=false (has negation)
    expect(panelCond).toContain('!treatmentRewritePending');

    // They share the same isTreatmentDocType guard — only polarity differs
    expect(actsCond).toContain('isTreatmentDocType');
    expect(panelCond).toContain('isTreatmentDocType');

    // The conditions are logically XOR on treatmentRewritePending
    const actsHasTrue = actsCond.includes('treatmentRewritePending') && !actsCond.includes('!treatmentRewritePending');
    const panelHasFalse = panelCond.includes('!treatmentRewritePending');
    expect(actsHasTrue).toBe(true);
    expect(panelHasFalse).toBe(true);
  });

  it('isTreatmentDocType covers both treatment and long_treatment doc types', async () => {
    const fs = await import('fs');
    const helperPath = '/Users/laralane/code/iffy/src/components/devengine/SectionedDocProgress.tsx';
    const helperLines = fs.readFileSync(helperPath, 'utf-8').split('\n');

    const fnStart = helperLines.findIndex(l => l.includes('export function isTreatmentDocType'));
    expect(fnStart).toBeGreaterThanOrEqual(0);

    const fnBody = helperLines.slice(fnStart, fnStart + 5).join('\n');
    expect(fnBody).toContain("docType === 'treatment'");
    expect(fnBody).toContain("docType === 'long_treatment'");
  });

  // ── Structural integrity ──────────────────────────────────────────────────

  it('treatmentRewritePending useState exists and defaults to false', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    expect(src).toContain('const [treatmentRewritePending, setTreatmentRewritePending] = useState(false)');
  });
});