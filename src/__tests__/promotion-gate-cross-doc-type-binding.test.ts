/**
 * Tests for: P0 — Promotion gate cross-doc-type version binding
 *
 * Commit 8c8b64c — 5 changes:
 *   1. PDE.tsx: Replace lastPromotionGateVersionRef from string|null to compound
 *      ref { versionId, docType } to scope gate state by doc_type
 *   2. PDE.tsx: Cross-doc-type transitions log cross_doc_gate_switch_expected
 *      instead of false stale_gate_state_invalidated / force_rebind
 *   3. PDE.tsx: Clear ref on doc_type change so same-doc-type transitions
 *      still trigger genuine staleness detection
 *   4. MomentRewritePanel.tsx: Fix table name document_versions ->
 *      project_document_versions (was causing 404)
 *   5. MomentRewritePanel.tsx: Switch .single() to .maybeSingle() for safety
 *
 * Test approach: static analysis of the source files
 */

import { describe, it, expect } from 'vitest';

const ENG_PATH = '/Users/laralane/code/iffy/src/pages/ProjectDevelopmentEngine.tsx';
const MOMENT_PATH = '/Users/laralane/code/iffy/src/components/devengine/MomentRewritePanel.tsx';

// ════════════════════════════════════════════════════════════════════════════════
// FIX 1: Compound ref { versionId, docType } replaces plain string|null
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 1 — Compound ref scopes gate state by doc_type', () => {

  it('lastPromotionGateVersionRef is a compound ref with versionId and docType', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // The useRef should be typed as { versionId: string | null; docType: string | null }
    const refLine = src.split('\n').find(l =>
      l.includes('lastPromotionGateVersionRef') && l.includes('useRef')
    );
    expect(refLine).toBeDefined();
    expect(refLine).toContain('versionId');
    expect(refLine).toContain('docType');
    // Verify it's NOT a plain string ref (the old bug pattern)
    expect(refLine).not.toMatch(/useRef<\s*string\s*>/);
    expect(refLine).not.toMatch(/useRef<\s*string\s*\|\s*null\s*>/);
  });

  it('lastPromotionGateVersionRef is updated with both versionId and docType on recompute', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // The ref update (line ~1110) should set both versionId and docType
    const updateLine = src.split('\n').find(l =>
      l.includes('lastPromotionGateVersionRef.current =') && l.includes('versionId') && l.includes('docType')
    );
    expect(updateLine).toBeDefined();
    expect(updateLine).toContain('versionId:');
    expect(updateLine).toContain('docType:');
  });

  it('lastPromotionGateVersionRef initial/default value has both versionId null and docType null', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    const refInitLine = src.split('\n').find(l =>
      l.includes('lastPromotionGateVersionRef') && l.includes('useRef') && l.includes('versionId: null')
    );
    expect(refInitLine).toBeDefined();
    expect(refInitLine).toContain('docType: null');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 2: Cross-doc-type switch logs cross_doc_gate_switch_expected
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 2 — Cross-doc-type switch detection', () => {

  it('cross-doc-type version mismatch logs cross_doc_gate_switch_expected (force_rebind_blocked)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // When convergenceVersionId !== promotionGateVersionId AND prevDocType !== currDocType,
    // the code should log cross_doc_gate_switch_expected with action force_rebind_blocked
    // This is the first branch inside the convergence version mismatch block
    const lines = src.split('\n');
    const crossDocBlockStart = lines.findIndex(l =>
      l.includes('convergenceVersionId && convergenceVersionId !== promotionGateVersionId')
    );
    expect(crossDocBlockStart).toBeGreaterThan(-1);

    // Within that block, look for the cross_doc check
    const crossDocCheck = lines.findIndex((l, i) =>
      i > crossDocBlockStart && i < crossDocBlockStart + 10 &&
      l.includes('prevDocType && prevDocType !== currDocType')
    );
    expect(crossDocCheck).toBeGreaterThan(-1);

    // The action should be force_rebind_blocked
    const rebindBlockedLine = lines.findIndex((l, i) =>
      i > crossDocBlockStart && i < crossDocBlockStart + 10 &&
      l.includes('cross_doc_gate_switch_expected') && l.includes('force_rebind_blocked')
    );
    expect(rebindBlockedLine).toBeGreaterThan(-1);
  });

  it('cross-doc-type stale gate fires stale_gate_suppressed not stale_gate_state_invalidated', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // When prevVersionId !== promotionGateVersionId AND prevDocType !== currDocType,
    // the code should log cross_doc_gate_switch_expected with action stale_gate_suppressed
    const lines = src.split('\n');
    const staleGateCheck = lines.findIndex(l =>
      l.includes('prevVersionId && prevVersionId !== promotionGateVersionId')
    );
    expect(staleGateCheck).toBeGreaterThan(-1);

    // Within 10 lines, there should be a cross_doc_type check with stale_gate_suppressed
    let foundSuppressed = false;
    for (let i = staleGateCheck; i < staleGateCheck + 10 && i < lines.length; i++) {
      if (lines[i].includes('cross_doc_gate_switch_expected') && lines[i].includes('stale_gate_suppressed')) {
        foundSuppressed = true;
        break;
      }
    }
    expect(foundSuppressed).toBe(true);
  });

  it('same-doc-type version change still fires stale_gate_state_invalidated', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // When prevVersionId !== promotionGateVersionId and NOT cross-doc-type,
    // it should fire stale_gate_state_invalidated
    const lines = src.split('\n');
    const staleGateLine = lines.find(l =>
      l.includes('stale_gate_state_invalidated')
    );
    expect(staleGateLine).toBeDefined();
    // Should be in the else branch of prevDocType !== currDocType check
    // Should not be gated by a cross_doc condition
    expect(staleGateLine).not.toContain('cross_doc');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 3: Ref cleared on cross-doc-type switch
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 3 — Ref cleared on doc_type change', () => {

  it('ref is reset to { versionId: null, docType: null } after cross-doc stale gate suppression', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    const lines = src.split('\n');

    // Find the stale_gate_suppressed block — it should reset the ref
    const suppressedIdx = lines.findIndex(l =>
      l.includes('cross_doc_gate_switch_expected') && l.includes('stale_gate_suppressed')
    );
    expect(suppressedIdx).toBeGreaterThan(-1);

    // Within 3 lines after the suppressed log, the ref should be cleared
    let foundClear = false;
    for (let i = suppressedIdx; i <= suppressedIdx + 3 && i < lines.length; i++) {
      if (lines[i].includes('lastPromotionGateVersionRef.current')
        && lines[i].includes('versionId: null')
        && lines[i].includes('docType: null')) {
        foundClear = true;
        break;
      }
    }
    expect(foundClear).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 4: MomentRewritePanel table name fix
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 4 — MomentRewritePanel table name', () => {

  it('uses project_document_versions table (not document_versions, avoiding 404)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(MOMENT_PATH, 'utf-8');

    // Verify the .from() call uses the correct table name
    const fromLine = src.split('\n').find(l =>
      l.includes('.from(') && l.includes('versions')
    );
    expect(fromLine).toBeDefined();
    expect(fromLine).toContain('project_document_versions');
    // Ensure NOT using the wrong table name
    expect(fromLine).not.toContain(".from('document_versions')");
    expect(fromLine).not.toContain('.from("document_versions")');
  });

  it('does NOT reference the wrong table name document_versions anywhere', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(MOMENT_PATH, 'utf-8');

    const wrongTableLines = src.split('\n').filter(l =>
      l.includes('document_versions') && !l.includes('project_document_versions')
    );
    // The only reference to document_versions should be within project_document_versions
    expect(wrongTableLines.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 5: MomentRewritePanel .maybeSingle() safety
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 5 — MomentRewritePanel .maybeSingle() safety', () => {

  it('uses .maybeSingle() instead of .single() for version query', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(MOMENT_PATH, 'utf-8');

    // Find the query chain and verify it ends with .maybeSingle()
    const lines = src.split('\n');
    let foundMaybeSingle = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('.eq(') && lines[i].includes('id', lines[i].indexOf('.eq('))) {
        // Check next non-empty line for .maybeSingle
        for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
          if (lines[j].includes('.maybeSingle()')) {
            foundMaybeSingle = true;
            break;
          }
        }
      }
    }
    expect(foundMaybeSingle).toBe(true);
  });

  it('handles missing version row gracefully (no .single() that would throw 406)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(MOMENT_PATH, 'utf-8');

    // There should be NO .single() call in the file (would throw PGRST106 on empty results)
    const singleLines = src.split('\n').filter(l =>
      l.includes('.single(') || l.includes('.single()')
    );
    // The only .single() calls must not be Supabase query chains
    const badSingleLines = singleLines.filter(l =>
      !l.includes('filter') && !l.includes('callback') && !l.includes('onComplete')
    );
    expect(badSingleLines.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Invariant: Overall logic flow
// ════════════════════════════════════════════════════════════════════════════════

describe('Invariant — overall logic flow', () => {

  it('cross_doc_gate_switch_expected appears for both convergence and stale gate branches', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // cross_doc_gate_switch_expected should appear at least twice:
    // 1. In the convergence version mismatch block (force_rebind_blocked)
    // 2. In the stale gate block (stale_gate_suppressed)
    const matches = src.match(/cross_doc_gate_switch_expected/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('logic reads prevDocType from ref and currDocType from selectedDeliverableType', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    const lines = src.split('\n');

    const prevDocLine = lines.find(l => l.includes('prevDocType =') && l.includes('lastPromotionGateVersionRef'));
    expect(prevDocLine).toBeDefined();
    expect(prevDocLine).toContain('.docType');

    const currDocLine = lines.find(l => l.includes('currDocType ='));
    expect(currDocLine).toBeDefined();
    expect(currDocLine).toContain('selectedDeliverableType');
  });
});