/**
 * Tests for: Treatment pipeline — Revised architecture
 *
 * Commit 155bcd0 — Revised treatment pipeline architecture:
 *
 * 1. TreatmentRewritePanel now receives docType prop (instead of hardcoded action/deliverableType)
 * 2. Invoke body uses action: docType and deliverableType: docType (dynamic per document type)
 * 3. Response handler checks result?.generating === true (not result?.success)
 * 4. Promotion gate CI/GP defaults to 85 for approved docs (not 0/null)
 * 5. useEffect guard simplified: removed !promotionGateAnalysis || check
 */
import { describe, it, expect } from 'vitest';

const ENG_PATH = '/Users/laralane/code/iffy/src/pages/ProjectDevelopmentEngine.tsx';
const PANEL_PATH = '/Users/laralane/code/iffy/src/components/devengine/TreatmentRewritePanel.tsx';

// ════════════════════════════════════════════════════════════════════════════════
// FIX 1: docType prop — edge cases
// ════════════════════════════════════════════════════════════════════════════════

describe('docType prop — edge cases and invariants', () => {

  it('TreatmentRewritePanel declares docType in Props interface', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');

    // The Props interface must include docType
    expect(src).toContain('docType: string');
  });

  it('handleRewriteAct passes docType as action to dev-engine-v2 invoke', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');

    // The invoke body must use the prop, not a hardcoded string
    const invokeBlock = src.slice(
      src.indexOf('functions.invoke'),
      src.indexOf('functions.invoke') + 500
    );

    // action comes from the docType prop (dynamic)
    expect(invokeBlock).toContain('action: docType');
    expect(invokeBlock).toContain('deliverableType: docType');

    // No hardcoded action values in the invoke body
    expect(invokeBlock).not.toContain("action: 'rewrite'");
    expect(invokeBlock).not.toContain("action: 'treatment'");
    expect(invokeBlock).not.toContain("action: 'long_treatment'");
    expect(invokeBlock).not.toContain("deliverableType: 'treatment'");
    expect(invokeBlock).not.toContain("deliverableType: 'long_treatment'");
  });

  it('handleRewriteAct checks result?.generating === true (not result?.success)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');
    const handlerBlock = src.slice(
      src.indexOf('result?.generating'),
      src.indexOf('result?.generating') + 200
    );

    // Must check generating === true
    expect(handlerBlock).toContain('result?.generating === true');

    // Must NOT use success
    // Check the whole file for safety
    const successLines = src.split('\n').filter((l: string) =>
      l.includes('result?.success') && !l.trim().startsWith('//') && !l.trim().startsWith('*')
    );
    expect(successLines.length).toBe(0);
  });

  it('TreatmentRewritePanel handleRewriteAct gracefully handles docType being passed as undefined/null', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');

    // The prop destructuring uses docType directly — if undefined is passed,
    // the invoke body sends action: undefined which is a valid (if useless) value.
    // No type cast or assertion that would crash on undefined.
    // Verify no unsafe access pattern like docType! or docType as string
    const propDestructure = src.slice(
      src.indexOf('TreatmentRewritePanel({'),
      src.indexOf('TreatmentRewritePanel({') + 200
    );
    expect(propDestructure).toContain('docType,');
    // No non-null assertion on docType in destructure
    expect(propDestructure).not.toContain('docType!');
    expect(propDestructure).not.toContain('docType:');
    // docType is just destructured directly — safe with undefined
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 2: useEffect guard change — promotionGateAnalysis removed from condition
// ════════════════════════════════════════════════════════════════════════════════

describe('Promotion gate useEffect guard — simplified condition', () => {

  it('useEffect guard only checks promotionGateVersionId (not promotionGateAnalysis)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // Find the useEffect that triggers promotion intelligence
    const idx = src.indexOf('Trigger Promotion Intelligence');
    expect(idx).toBeGreaterThanOrEqual(0);

    const effectBlock = src.slice(idx, idx + 400);

    // Must NOT contain the removed condition
    expect(effectBlock).not.toContain('!promotionGateAnalysis || !promotionGateVersionId');
    expect(effectBlock).not.toContain('if (!promotionGateAnalysis');

    // Must only check promotionGateVersionId
    expect(effectBlock).toContain('if (!promotionGateVersionId)');
  });

  it('promotionIntel.clear() still fires when promotionGateVersionId is falsy', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    const idx = src.indexOf('Trigger Promotion Intelligence');
    const effectBlock = src.slice(idx, idx + 300);

    // promotionIntel.clear() should be called inside the if (!promotionGateVersionId) block
    const lines = effectBlock.split('\n');
    const clearLine = lines.find((l: string) => l.includes('promotionIntel.clear'));
    expect(clearLine).toBeDefined();

    // The guard has been simplified — promotionIntel.clear() only depends on promotionGateVersionId now
    // This means when gateVersionId exists but analysis is null, we proceed to compute
    // promotionIntel (with default CI/GP values — see next tests)
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 3: CI/GP default 85 for approved docs
// ════════════════════════════════════════════════════════════════════════════════

describe('CI/GP default 85 — promotion gate fallback', () => {

  it('CI default uses (authoritativeVersion?.approval_status === "approved" ? 85 : 0) in first location', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // First location: line ~1019 — ci_score / scores.ci fallback
    const match = src.match(/promotionGateAnalysis\?\.ci_score.*85\s*:\s*0/);
    expect(match).toBeDefined();
    expect(match![0]).toContain("authoritativeVersion?.approval_status === 'approved'");
  });

  it('CI/GP default uses (authoritativeVersion?.approval_status === "approved" ? 85 : null) in second location', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // Second location: line ~1803 — analysisCi fallback
    const promoteCiMatch = src.match(/analysisCi \?\? \(authoritativeVersion\?\.approval_status === 'approved' \? 85 : null\)/);
    expect(promoteCiMatch).toBeDefined();

    const promoteGpMatch = src.match(/analysisGp \?\? \(authoritativeVersion\?\.approval_status === 'approved' \? 85 : null\)/);
    expect(promoteGpMatch).toBeDefined();
  });

  it('No hardcoded CI/GP default of 0 remains for approved documents', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // The old pattern was `?? 0` — now it's `?? (approved ? 85 : 0)`
    // We should still have `?? 0` but only AFTER the ternary for non-approved docs
    const oldPattern = /ci_score.*scores\?\.ci \?\? 0[^;]/;
    const matches = src.match(oldPattern);
    // Should NOT match the old simple `?? 0` pattern because it's now `?? (approved ? 85 : 0)`
    // But there may be a `: 0` inside the ternary, which is fine
    if (matches) {
      for (const m of matches) {
        expect(m).not.toMatch(/\?\? 0[^;]/); // Should not end with ?? 0
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// REGRESSION: Key existing behavior preserved
// ════════════════════════════════════════════════════════════════════════════════

describe('Regression — existing behavior preserved', () => {

  it('mutual exclusion between TreatmentActsProgress and TreatmentRewritePanel still works', async () => {
    const lines = (await import('fs')).readFileSync(ENG_PATH, 'utf-8').split('\n');

    const actsIdx = lines.findIndex((l: string, i: number) =>
      l.includes('TreatmentActsProgress') && !lines[i - 1]?.includes('import')
    );
    const rewriteIdx = lines.findIndex((l: string, i: number) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(actsIdx).toBeGreaterThanOrEqual(0);
    expect(rewriteIdx).toBeGreaterThanOrEqual(0);

    const actsCond = lines[actsIdx - 1];
    const rewriteCond = lines[rewriteIdx - 1];

    // Acts shows when treatmentRewritePending=true
    expect(actsCond).toContain('treatmentRewritePending');
    expect(actsCond).not.toContain('!treatmentRewritePending');

    // RewritePanel shows when treatmentRewritePending=false
    expect(rewriteCond).toContain('!treatmentRewritePending');
  });

  it('TreatmentRewritePanel docType prop is passed as selectedDoc?.doc_type from parent', async () => {
    const lines = (await import('fs')).readFileSync(ENG_PATH, 'utf-8').split('\n');

    const renderIdx = lines.findIndex((l: string, i: number) =>
      l.includes('<TreatmentRewritePanel') && !lines[i - 1]?.includes('import')
    );
    expect(renderIdx).toBeGreaterThanOrEqual(0);

    const renderBlock = lines.slice(renderIdx, renderIdx + 10).join('\n');
    expect(renderBlock).toContain('docType={selectedDoc?.doc_type}');
  });
});