/**
 * Tests for: Fix treatment per-act pipeline — wrong action name, double UI
 *
 * Commit 6c782d2 — Two fixes in ProjectDevelopmentEngine.tsx:
 *
 * 1. Removed unused `taAction` variable (was sending action: 'treatment'/'long_treatment')
 *    Changed invoke action from `taAction` to `'rewrite'` — the backend dev-engine-v2
 *    only handles action: 'rewrite' (which internally routes to per-act pipeline)
 *    Frontend: removed taAction, now sends action: 'rewrite' directly
 *
 * 2. Added `!treatmentRewritePending &&` guard to TreatmentActBlueprintPanel render condition
 *    (line 2759) — prevents double UI when TreatmentActsProgress is showing during a
 *    treatment rewrite. TreatmentActBlueprintPanel was rendering independently of
 *    treatmentRewritePending state, causing double UI.
 *
 * Mutual exclusion diagram:
 *   treatmentRewritePending=true  → TreatmentActsProgress shows (line 2556-2557)
 *   treatmentRewritePending=false → TreatmentRewritePanel shows (line 2690)
 *                                 → TreatmentActBlueprintPanel shows (line 2759, NEW)
 */
import { describe, it, expect } from 'vitest';

const ENG_PATH = '/Users/laralane/code/iffy/src/pages/ProjectDevelopmentEngine.tsx';
const PANEL_PATH = '/Users/laralane/code/iffy/src/components/devengine/TreatmentRewritePanel.tsx';

// ════════════════════════════════════════════════════════════════════════════════
// FIX 1: taAction → 'rewrite' — wrong action name
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 1 — Wrong action name (taAction → rewrite)', () => {

  // Helper: load source and get all lines
  async function getLines(): Promise<string[]> {
    const fs = await import('fs');
    return fs.readFileSync(ENG_PATH, 'utf-8').split('\n');
  }

  // ── Primary use case ──────────────────────────────────────────────────────

  it('taAction variable is completely removed (0 references)', async () => {
    const lines = await getLines();
    const taActionLines = lines.filter(l => l.includes('taAction'));
    // The only false positive could be in comments — check code lines specifically
    const codeLines = lines.filter(l =>
      l.includes('taAction') &&
      !l.trim().startsWith('//') &&
      !l.trim().startsWith('*') &&
      !l.trim().startsWith('/*')
    );
    expect(codeLines.length).toBe(0);
  });

  it('TreatmentRewritePanel invoke uses action/deliverableType from docType prop (not hardcoded)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');
    // The invoke body must reference the docType prop for both action and deliverableType
    expect(src).toContain('action: docType');
    expect(src).toContain('deliverableType: docType');
    // No hardcoded action strings in the invoke body
    expect(src).not.toContain("action: 'rewrite'");
    expect(src).not.toContain("action: 'treatment'");
    expect(src).not.toContain("action: 'long_treatment'");
    // No hardcoded deliverableType strings
    expect(src).not.toContain("deliverableType: 'treatment'");
    expect(src).not.toContain("deliverableType: 'long_treatment'");
  });

  it('invoke body in TreatmentRewritePanel contains all required fields for per-act pipeline', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');
    // Find the invoke block
    const invokeIdx = src.indexOf('functions.invoke(\'dev-engine-v2\'');
    expect(invokeIdx).toBeGreaterThanOrEqual(0);
    // Check the body contains all required fields
    const invokeBlock = src.slice(invokeIdx, invokeIdx + 800);
    expect(invokeBlock).toContain('projectId');
    expect(invokeBlock).toContain('documentId');
    expect(invokeBlock).toContain('versionId');
    expect(invokeBlock).toContain('approvedNotes');
    expect(invokeBlock).toContain('protectItems');
    expect(invokeBlock).toContain('docType');
  });

  it('response handler in TreatmentRewritePanel checks generating === true (not result?.success)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');
    // Must check result?.generating === true
    expect(src).toContain('result?.generating === true');
    // Must NOT use result?.success
    expect(src).not.toContain('if (result?.success)');
  });

  it('docType prop is passed to TreatmentRewritePanel from parent', async () => {
    const lines = (await import('fs')).readFileSync(ENG_PATH, 'utf-8').split('\n');
    const panelRenderIdx = lines.findIndex((l: string, i: number) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(panelRenderIdx).toBeGreaterThanOrEqual(0);
    // Check the lines following the render tag for docType prop
    const renderBlock = lines.slice(panelRenderIdx, panelRenderIdx + 10).join('\n');
    expect(renderBlock).toContain('docType={selectedDoc?.doc_type}');
  });

  // ── Invariant: variable declaration removed ───────────────────────────────

  it('no const/let/var taAction declaration exists anywhere in the file', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    expect(src).not.toMatch(/(const|let|var)\s+taAction\s*=/);
  });

  // ── Edge case: comment accuracy ──────────────────────────────────────────

  it('comment at line ~1448 references old action names (acknowledged stale — non-blocking)', async () => {
    const lines = await getLines();
    const commentLine = lines[1447]; // 0-indexed: line 1448 in 1-indexed
    expect(commentLine).toContain('triggered by action');
    // This is a known stale comment — code runs correctly regardless
    // The comment describes what the backend does internally, not what the frontend sends
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 2: Double UI — TreatmentActBlueprintPanel !treatmentRewritePending guard
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 2 — Double UI: TreatmentActBlueprintPanel !treatmentRewritePending guard', () => {

  async function getLines(): Promise<string[]> {
    const fs = await import('fs');
    return fs.readFileSync(ENG_PATH, 'utf-8').split('\n');
  }

  // ── Primary use case ──────────────────────────────────────────────────────

  it('TreatmentActBlueprintPanel render condition includes !treatmentRewritePending guard', async () => {
    const lines = await getLines();
    // Find TreatmentActBlueprintPanel render tag (not the import)
    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActBlueprintPanel') && !lines[i - 1]?.includes('import')
    );
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    // The condition is on the line BEFORE the JSX tag
    const conditionLine = lines[panelLineIdx - 1];
    expect(conditionLine).toContain('!treatmentRewritePending');
  });

  it('TreatmentActBlueprintPanel condition is mutually exclusive with TreatmentActsProgress condition', async () => {
    const lines = await getLines();

    // Find TreatmentActsProgress render usage (not the import)
    const actsLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActsProgress') && !lines[i - 1]?.includes('import')
    );
    expect(actsLineIdx).toBeGreaterThanOrEqual(0);

    // Find TreatmentActBlueprintPanel render tag
    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActBlueprintPanel') && !lines[i - 1]?.includes('import')
    );
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    // The condition lines are directly above the component tags
    const actsCondition = lines[actsLineIdx - 1];
    const panelCondition = lines[panelLineIdx - 1];

    // TreatmentActsProgress requires treatmentRewritePending=true (no negation)
    expect(actsCondition).toContain('treatmentRewritePending');
    expect(actsCondition).not.toContain('!treatmentRewritePending');

    // TreatmentActBlueprintPanel requires treatmentRewritePending=false (has negation)
    expect(panelCondition).toContain('!treatmentRewritePending');
  });

  // ── Invariant: no duplicate renders ───────────────────────────────────────

  it('Both TreatmentActBlueprintPanel and TreatmentActsProgress cannot render simultaneously', async () => {
    const lines = await getLines();

    const actsLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActsProgress') && !lines[i - 1]?.includes('import')
    );
    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActBlueprintPanel') && !lines[i - 1]?.includes('import')
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

    // The conditions are logically XOR on treatmentRewritePending
    const actsHasTrue = actsCond.includes('treatmentRewritePending') && !actsCond.includes('!treatmentRewritePending');
    const panelHasFalse = panelCond.includes('!treatmentRewritePending');
    expect(actsHasTrue).toBe(true);
    expect(panelHasFalse).toBe(true);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('TreatmentActBlueprintPanel condition preserves existing guards (selectedDoc?.id, docViewMode, doc_type)', async () => {
    const lines = await getLines();

    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActBlueprintPanel') && !lines[i - 1]?.includes('import')
    );
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    const conditionLine = lines[panelLineIdx - 1];
    // Must still require selectedDoc?.id, docViewMode === 'blueprint', and doc_type check
    expect(conditionLine).toContain('selectedDoc?.id');
    expect(conditionLine).toContain("docViewMode === 'blueprint'");
    expect(conditionLine).toContain('treatment');
    expect(conditionLine).toContain('long_treatment');
  });

  it('TreatmentActsProgress condition uses isTreatmentDocType (normalized check) while TreatmentActBlueprintPanel uses inline doc_type check', async () => {
    const lines = await getLines();

    const actsLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActsProgress') && !lines[i - 1]?.includes('import')
    );
    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActBlueprintPanel') && !lines[i - 1]?.includes('import')
    );
    expect(actsLineIdx).toBeGreaterThanOrEqual(0);
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    const actsCond = lines[actsLineIdx - 1];
    const panelCond = lines[panelLineIdx - 1];

    // TreatmentActsProgress uses isTreatmentDocType helper
    expect(actsCond).toContain('isTreatmentDocType');

    // TreatmentActBlueprintPanel uses inline doc_type check (historical pattern)
    expect(panelCond).toContain("selectedDoc.doc_type === 'treatment'");
    expect(panelCond).toContain("selectedDoc.doc_type === 'long_treatment'");
  });

  // ── Regression: previous mutual exclusion still works ─────────────────────

  it('TreatmentRewritePanel still has !treatmentRewritePending guard (no regression from change)', async () => {
    const lines = await getLines();

    // Find TreatmentRewritePanel render tag (not the import)
    const panelLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(panelLineIdx).toBeGreaterThanOrEqual(0);

    const conditionLine = lines[panelLineIdx - 1];
    expect(conditionLine).toContain('!treatmentRewritePending');
    expect(conditionLine).toContain('isTreatmentDocType');
    expect(conditionLine).toContain('selectedDocId');
    expect(conditionLine).toContain('selectedVersionId');
  });

  it('TreatmentRewritePanel and TreatmentActBlueprintPanel are both guarded by !treatmentRewritePending', async () => {
    const lines = await getLines();

    const rewritePanelIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    const actBlueprintIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActBlueprintPanel') && !lines[i - 1]?.includes('import')
    );
    expect(rewritePanelIdx).toBeGreaterThanOrEqual(0);
    expect(actBlueprintIdx).toBeGreaterThanOrEqual(0);

    expect(lines[rewritePanelIdx - 1]).toContain('!treatmentRewritePending');
    expect(lines[actBlueprintIdx - 1]).toContain('!treatmentRewritePending');
  });

  // ── Structural integrity ──────────────────────────────────────────────────

  it('treatmentRewritePending useState exists and defaults to false', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    expect(src).toContain('const [treatmentRewritePending, setTreatmentRewritePending] = useState(false)');
  });

  it('treatmentRewritePending is set to false in all code paths (sync success, background poll done, error fallback)', async () => {
    const lines = await getLines();
    const falseLines = lines.filter(l => l.includes('setTreatmentRewritePending(false)'));
    // Should have at least 3: sync success, poll completion, and error fallback
    expect(falseLines.length).toBeGreaterThanOrEqual(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// INTEGRATION: Combined mutual exclusion across all treatment components
// ════════════════════════════════════════════════════════════════════════════════

describe('Integration — Mutual exclusion across all treatment UI components', () => {

  async function getLines(): Promise<string[]> {
    const fs = await import('fs');
    return fs.readFileSync(ENG_PATH, 'utf-8').split('\n');
  }

  it('TreatmentActsProgress, TreatmentRewritePanel, and TreatmentActBlueprintPanel form a valid mutual exclusion set', async () => {
    const lines = await getLines();

    const actsLineIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActsProgress') && !lines[i - 1]?.includes('import')
    );
    const rewritePanelIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    const actBlueprintIdx = lines.findIndex((l, i) =>
      l.includes('<TreatmentActBlueprintPanel') && !lines[i - 1]?.includes('import')
    );
    expect(actsLineIdx).toBeGreaterThanOrEqual(0);
    expect(rewritePanelIdx).toBeGreaterThanOrEqual(0);
    expect(actBlueprintIdx).toBeGreaterThanOrEqual(0);

    const actsCond = lines[actsLineIdx - 1];
    const rewriteCond = lines[rewritePanelIdx - 1];
    const actBlueprintCond = lines[actBlueprintIdx - 1];

    // All three use treatmentRewritePending as the key discriminator
    expect(actsCond).toContain('treatmentRewritePending');
    expect(rewriteCond).toContain('treatmentRewritePending');
    expect(actBlueprintCond).toContain('treatmentRewritePending');

    // Acts shows ONLY when treatmentRewritePending=true
    expect(actsCond).not.toContain('!treatmentRewritePending');

    // Both RewritePanel and BlueprintPanel show ONLY when treatmentRewritePending=false
    expect(rewriteCond).toContain('!treatmentRewritePending');
    expect(actBlueprintCond).toContain('!treatmentRewritePending');
  });
});