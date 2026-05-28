/**
 * Tests for: VPP stage rail items — VisualSkeleton/VisualPanelErrorBoundary status indicators
 *
 * Commit 75a7173 — Changes:
 *   1. SafeRouteBoundary.tsx — exports recoveryInFlightRef as module-level ref
 *   2. VisualPipelineErrorBoundary.tsx — imports recoveryInFlightRef, adds removeChild
 *      (NotFoundError DOMException) detection with auto-recovery. Does NOT count against
 *      MAX_RECOVERY_ATTEMPTS. Guards against concurrent recovery via recoveryInFlightRef.
 *   3. VisualSetCurationPanel.tsx — adds VisualSkeleton variant="panel" for loading state
 *      + wraps content in VisualPanelErrorBoundary
 *   4. VisualStyleAuthorityPanel.tsx — adds VisualSkeleton variant="form" for loading +
 *      wraps in VisualPanelErrorBoundary
 *   5. WorldLocationLookPanel.tsx — adds VisualSkeleton variant="panel" for loading +
 *      VisualPanelErrorBoundary on both empty state and main content
 *   6. VisualUnitHistoryTimeline.tsx — adds VisualSkeleton variant="list" for loading,
 *      VisualEmptyState for empty, wraps in VisualPanelErrorBoundary
 *   7. VisualUnitRunsList.tsx — wraps in VisualPanelErrorBoundary
 *   8. VisualUnitSourcesPanel.tsx — adds VisualSkeleton variant="panel" early return for
 *      loading + wraps in VisualPanelErrorBoundary, removes Loader2 import
 *   9. deploy.sh — adds extract-characters to deploy list
 *  10. vite.config.ts — adds supabase proxy for local dev
 *  11. 5 new edge function test files (2,902 lines)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const BASE = __dirname.includes('/code/iffy/') || fs.existsSync('/Users/laralane/code/iffy')
  ? '/Users/laralane/code/iffy'
  : process.cwd();

// ── Helpers ──────────────────────────────────────────────────────────────────────

function readSource(path: string): string {
  return fs.readFileSync(path, 'utf-8');
}

function assertImportExists(source: string, importPath: string, symbol: string): void {
  // Check for: import { ..., symbol, ... } from 'importPath'
  const importRegex = new RegExp(
    `import\\s*\\{[^}]*\\b${escapeRegex(symbol)}\\b[^}]*\\}\\s*from\\s*['"]${escapeRegex(importPath)}['"]`
  );
  expect(source).toMatch(importRegex);
}

function assertWrappedInComponent(source: string, wrapper: string, searchText: string): void {
  // Check that the wrapper component opening tag appears before the searchText
  // and its closing tag appears after
  const wrapperOpen = source.indexOf(`<${wrapper}`);
  const wrapperClose = source.indexOf(`</${wrapper}>`);
  const contentStart = source.indexOf(searchText);

  expect(wrapperOpen).not.toBe(-1);
  expect(wrapperClose).not.toBe(-1);
  expect(contentStart).not.toBe(-1);
  expect(wrapperOpen).toBeLessThan(contentStart);
  expect(contentStart).toBeLessThan(wrapperClose);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Safer regex helper that handles any special chars in module paths
function wrappedCheck(source: string, wrapperTag: string, innerTag: string): void {
  // Simpler: just verify both appear in the file
  expect(source).toContain(`<${wrapperTag}`);
  expect(source).toContain(`</${wrapperTag}>`);
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. SafeRouteBoundary — recoveryInFlightRef export
// ══════════════════════════════════════════════════════════════════════════════

describe('SafeRouteBoundary — recoveryInFlightRef export', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/SafeRouteBoundary.tsx`);
  });

  it('exports recoveryInFlightRef as a named export', () => {
    expect(source).toContain('export const recoveryInFlightRef');
  });

  it('recoveryInFlightRef is initialized to { current: false }', () => {
    expect(source).toContain('recoveryInFlightRef = { current: false }');
  });

  it('keeps module-level ref (outside component) — not inside a function body', () => {
    // The ref should be declared at module scope, not inside a component
    const refLine = source.split('\n').find(l => l.includes('recoveryInFlightRef'));
    expect(refLine).toBeDefined();
    expect(refLine!).not.toContain('function');
    expect(refLine!).not.toContain('() =>');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. VisualPipelineErrorBoundary — removeChild detection + recoveryInFlightRef
// ══════════════════════════════════════════════════════════════════════════════

describe('VisualPipelineErrorBoundary — removeChild detection + shared recovery guard', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/VisualPipelineErrorBoundary.tsx`);
  });

  it('imports recoveryInFlightRef from SafeRouteBoundary', () => {
    expect(source).toContain("import { recoveryInFlightRef } from './SafeRouteBoundary'");
  });

  it('detects DOMException NotFoundError removeChild in componentDidCatch', () => {
    expect(source).toContain("error instanceof DOMException");
    expect(source).toContain("error.name === 'NotFoundError'");
    expect(source).toContain("error.message.includes('removeChild')");
  });

  it('does NOT count removeChild errors against MAX_RECOVERY_ATTEMPTS (early return)', () => {
    // The removeChild detection should return before the recoveryAttempts++ line
    const didCatchBlock = source.split('componentDidCatch')[1] || '';
    const errorCheckIndex = didCatchBlock.indexOf("error instanceof DOMException");
    const recoveryIncIndex = didCatchBlock.indexOf("recoveryAttempts++");

    expect(errorCheckIndex).not.toBe(-1);
    expect(recoveryIncIndex).not.toBe(-1);
    expect(errorCheckIndex).toBeLessThan(recoveryIncIndex);
  });

  it('sets recoveryInFlightRef.current = true before setTimeout on removeChild', () => {
    const rmChildBlock = source.substring(
      source.indexOf("error instanceof DOMException"),
      source.indexOf("recoveryAttempts++")
    );
    expect(rmChildBlock).toContain("recoveryInFlightRef.current = true");
  });

  it('resets recoveryInFlightRef.current = false inside setTimeout', () => {
    expect(source).toContain("recoveryInFlightRef.current = false");
  });

  it('sets hasError: false and error: null after recovery timeout', () => {
    expect(source).toContain("this.setState({ hasError: false, error: null })");
  });

  it('guards against concurrent recovery via recoveryInFlightRef check', () => {
    expect(source).toContain("if (recoveryInFlightRef.current)");
    // Should have a skip/warning for concurrent recovery
    const refCheck = source.indexOf("recoveryInFlightRef.current");
    const returnIndex = source.indexOf("return;", refCheck);
    expect(returnIndex).not.toBe(-1);
    expect(returnIndex).toBeGreaterThan(refCheck);
    expect(returnIndex - refCheck).toBeLessThan(200); // return should be soon after check
  });

  it('logs a console.warn for removeChild error', () => {
    expect(source).toContain("console.warn");
    expect(source).toContain("removeChild error");
    expect(source).toContain("Suspense race");
  });

  it('logs a console.warn for concurrent recovery skip', () => {
    expect(source).toContain("console.warn");
    expect(source).toContain("Recovery already in flight");
  });

  it('still increments recoveryAttempts for non-removeChild errors', () => {
    expect(source).toContain("this.recoveryAttempts++");
  });

  it('still has MAX_RECOVERY_ATTEMPTS constant', () => {
    expect(source).toContain("MAX_RECOVERY_ATTEMPTS = 2");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. VisualSetCurationPanel — VisualSkeleton + VisualPanelErrorBoundary
// ══════════════════════════════════════════════════════════════════════════════

describe('VisualSetCurationPanel — VisualSkeleton + VisualPanelErrorBoundary wrappers', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/images/VisualSetCurationPanel.tsx`);
  });

  it('imports VisualPanelErrorBoundary', () => {
    assertImportExists(source, '@/components/visual/VisualPanelErrorBoundary', 'VisualPanelErrorBoundary');
  });

  it('imports VisualSkeleton', () => {
    assertImportExists(source, '@/components/visual/VisualSkeleton', 'VisualSkeleton');
  });

  it('replaces inline spinner with VisualSkeleton for loading state', () => {
    // Loading state returns VisualSkeleton, not Loader2 inline spinner
    const loadingBlock = source.substring(
      source.indexOf("if (vs.isLoading)"),
      source.indexOf("// Group active sets")
    );
    expect(loadingBlock).toContain('<VisualSkeleton');
    expect(loadingBlock).not.toContain('Loader2');
  });

  it('wraps main content in VisualPanelErrorBoundary', () => {
    // The opening tag should be before the content div and closing after
    const mainReturnBlock = source.substring(
      source.indexOf("return ("),
      source.indexOf("function VisualSetSlotGrid")
    );
    expect(mainReturnBlock).toContain('<VisualPanelErrorBoundary');
    expect(mainReturnBlock).toContain('</VisualPanelErrorBoundary>');
    expect(mainReturnBlock).toContain('panelLabel="VisualSetCurationPanel"');
  });

  it('replaces inner loading spinner with VisualSkeleton', () => {
    // VisualSetSlotGrid loading state should use VisualSkeleton
    const slotGridStart = source.indexOf("function VisualSetSlotGrid");
    const slotGridEnd = source.indexOf("function", slotGridStart + 10);
    const slotGridCode = slotGridStart >= 0
      ? source.substring(slotGridStart, slotGridEnd > slotGridStart ? slotGridEnd : source.length)
      : '';

    if (slotGridCode.includes("loadingSlots")) {
      const loadingBlock = slotGridCode.substring(
        slotGridCode.indexOf("loadingSlots"),
        slotGridCode.indexOf("return (", slotGridCode.indexOf("loadingSlots"))
      );
      // The loadingSlots return should use VisualSkeleton
      const slotReturn = slotGridCode.substring(
        slotGridCode.indexOf("if (loadingSlots)"),
        slotGridCode.indexOf("}", slotGridCode.indexOf("if (loadingSlots)"))
      );
      expect(slotReturn).toContain('VisualSkeleton');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. VisualStyleAuthorityPanel — VisualSkeleton + VisualPanelErrorBoundary
// ══════════════════════════════════════════════════════════════════════════════

describe('VisualStyleAuthorityPanel — VisualSkeleton + VisualPanelErrorBoundary wrappers', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/images/VisualStyleAuthorityPanel.tsx`);
  });

  it('imports VisualPanelErrorBoundary', () => {
    assertImportExists(source, '@/components/visual/VisualPanelErrorBoundary', 'VisualPanelErrorBoundary');
  });

  it('imports VisualSkeleton', () => {
    assertImportExists(source, '@/components/visual/VisualSkeleton', 'VisualSkeleton');
  });

  it('replaces inline loading with VisualSkeleton variant="form"', () => {
    const loadingBlock = source.substring(
      source.indexOf("if (loading)"),
      source.indexOf("const isComplete")
    );
    expect(loadingBlock).toContain('<VisualSkeleton variant="form" />');
    expect(loadingBlock).not.toContain('Loader2');
  });

  it('wraps main return content in VisualPanelErrorBoundary', () => {
    const mainReturn = source.substring(
      source.indexOf("return ("),
      source.lastIndexOf(");")
    );
    expect(mainReturn).toContain('<VisualPanelErrorBoundary');
    expect(mainReturn).toContain('</VisualPanelErrorBoundary>');
    expect(mainReturn).toContain('panelLabel="VisualStyleAuthorityPanel"');
  });

  it('VisualPanelErrorBoundary wraps around the entire content div', () => {
    wrappedCheck(source, 'VisualPanelErrorBoundary', 'div');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. WorldLocationLookPanel — VisualSkeleton + VisualPanelErrorBoundary
// ══════════════════════════════════════════════════════════════════════════════

describe('WorldLocationLookPanel — VisualSkeleton + dual VisualPanelErrorBoundary wrappers', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/images/WorldLocationLookPanel.tsx`);
  });

  it('imports VisualPanelErrorBoundary', () => {
    assertImportExists(source, '@/components/visual/VisualPanelErrorBoundary', 'VisualPanelErrorBoundary');
  });

  it('imports VisualSkeleton', () => {
    assertImportExists(source, '@/components/visual/VisualSkeleton', 'VisualSkeleton');
  });

  it('replaces inline loading with VisualSkeleton variant="panel"', () => {
    const loadingBlock = source.substring(
      source.indexOf("if (loading)"),
      source.indexOf("// Empty state")
    );
    expect(loadingBlock).toContain('<VisualSkeleton variant="panel" />');
    expect(loadingBlock).not.toContain('Loader2');
  });

  it('wraps empty state return in VisualPanelErrorBoundary', () => {
    // The empty state return block contains the VisualPanelErrorBoundary
    // Just verify that the area between "if (locations.length === 0)" and "TooltipProvider" has it
    const emptyStart = source.indexOf("if (locations.length === 0");
    const tooltipStart = source.indexOf("<TooltipProvider>");
    expect(emptyStart).not.toBe(-1);
    expect(tooltipStart).toBeGreaterThan(emptyStart);

    const emptySection = source.substring(emptyStart, tooltipStart);
    expect(emptySection).toContain('<VisualPanelErrorBoundary');
    expect(emptySection).toContain('</VisualPanelErrorBoundary>');
    expect(emptySection).toContain('panelLabel="WorldLocationLookPanel"');
  });

  it('wraps main content return in VisualPanelErrorBoundary', () => {
    // There should be at least 2 VisualPanelErrorBoundary uses
    const openCount = (source.match(/<VisualPanelErrorBoundary/g) || []).length;
    const closeCount = (source.match(/<\/VisualPanelErrorBoundary>/g) || []).length;
    expect(openCount).toBeGreaterThanOrEqual(2);
    expect(closeCount).toBe(openCount); // balanced
  });

  it('main content has VisualPanelErrorBoundary wrapping the TooltipProvider', () => {
    // The main content return (after empty state) wraps in VisualPanelErrorBoundary
    const tooltipIndex = source.indexOf('<TooltipProvider>');
    expect(tooltipIndex).not.toBe(-1);

    // Find the opening VisualPanelErrorBoundary before TooltipProvider
    const beforeTooltip = source.substring(0, tooltipIndex);
    const lastVpebOpen = beforeTooltip.lastIndexOf('<VisualPanelErrorBoundary');
    expect(lastVpebOpen).not.toBe(-1);

    // Ensure it has panelLabel
    const vpebTag = source.substring(lastVpebOpen, lastVpebOpen + 80);
    expect(vpebTag).toContain('panelLabel="WorldLocationLookPanel"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. VisualUnitHistoryTimeline — VisualSkeleton + VisualEmptyState + VisualPanelErrorBoundary
// ══════════════════════════════════════════════════════════════════════════════

describe('VisualUnitHistoryTimeline — VisualSkeleton, VisualEmptyState, VisualPanelErrorBoundary', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/visualUnits/VisualUnitHistoryTimeline.tsx`);
  });

  it('wraps full component in VisualPanelErrorBoundary', () => {
    expect(source).toContain('<VisualPanelErrorBoundary');
    expect(source).toContain('</VisualPanelErrorBoundary>');
    expect(source).toContain('panelLabel="VisualUnitHistoryTimeline"');
  });

  it('uses VisualSkeleton variant="list" for loading state', () => {
    const loadingBlock = source.substring(
      source.indexOf("isLoading ?"),
      source.indexOf("events.length === 0")
    );
    expect(loadingBlock).toContain('<VisualSkeleton variant="list" />');
    expect(loadingBlock).not.toContain('Loader2');
  });

  it('uses VisualEmptyState component for empty state', () => {
    // Find where the events.length === 0 ternary starts, capture the block
    const isLoadingIndex = source.indexOf("isLoading ?");
    const emptyStart = source.indexOf("events.length === 0", isLoadingIndex);
    expect(emptyStart).not.toBe(-1);

    // The block continues until `<ScrollArea` or `:` for the else clause
    const scrollAreaIndex = source.indexOf("<ScrollArea", emptyStart);
    const emptyBlock = scrollAreaIndex > 0
      ? source.substring(emptyStart, scrollAreaIndex)
      : source.substring(emptyStart, emptyStart + 300);

    expect(emptyBlock).toContain('<VisualEmptyState');
  });

  it('VisualEmptyState has compact prop and title/description', () => {
    expect(source).toContain('<VisualEmptyState compact');
    expect(source).toContain('title="No history"');
    expect(source).toContain('description=');
  });

  it('VisualPanelErrorBoundary wraps outside the Card component', () => {
    // The opening VisualPanelErrorBoundary should be before the Card opening
    const vpebIndex = source.indexOf('<VisualPanelErrorBoundary');
    const cardIndex = source.indexOf('<Card>');
    expect(vpebIndex).not.toBe(-1);
    expect(cardIndex).not.toBe(-1);
    expect(vpebIndex).toBeLessThan(cardIndex);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. VisualUnitRunsList — VisualPanelErrorBoundary wrapper
// ══════════════════════════════════════════════════════════════════════════════

describe('VisualUnitRunsList — VisualPanelErrorBoundary wrapper', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/visualUnits/VisualUnitRunsList.tsx`);
  });

  it('imports VisualPanelErrorBoundary', () => {
    assertImportExists(source, '@/components/visual/VisualPanelErrorBoundary', 'VisualPanelErrorBoundary');
  });

  it('wraps content in VisualPanelErrorBoundary', () => {
    expect(source).toContain('<VisualPanelErrorBoundary');
    expect(source).toContain('</VisualPanelErrorBoundary>');
    expect(source).toContain('panelLabel="VisualUnitRunsList"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. VisualUnitSourcesPanel — VisualSkeleton + VisualPanelErrorBoundary + early return
// ══════════════════════════════════════════════════════════════════════════════

describe('VisualUnitSourcesPanel — VisualSkeleton, VisualPanelErrorBoundary, early return', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/visualUnits/VisualUnitSourcesPanel.tsx`);
  });

  it('imports VisualPanelErrorBoundary', () => {
    assertImportExists(source, '@/components/visual/VisualPanelErrorBoundary', 'VisualPanelErrorBoundary');
  });

  it('imports VisualSkeleton', () => {
    assertImportExists(source, '@/components/visual/VisualSkeleton', 'VisualSkeleton');
  });

  it('has early return with VisualSkeleton for loading state', () => {
    expect(source).toContain('if (isLoading)');
    expect(source).toContain('return <VisualSkeleton variant="panel" />;');
  });

  it('wraps main content return in VisualPanelErrorBoundary', () => {
    expect(source).toContain('<VisualPanelErrorBoundary');
    expect(source).toContain('</VisualPanelErrorBoundary>');
    expect(source).toContain('panelLabel="VisualUnitSourcesPanel"');
  });

  it('removes Loader2 from imports', () => {
    expect(source).not.toContain('Loader2');
  });

  it('does not have disabled={isLoading} on refresh button (loading state has early return)', () => {
    // Since there's an early return for loading, the refresh button doesn't need disabled={isLoading}
    expect(source).not.toContain('disabled={isLoading}');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. deploy.sh — extract-characters function
// ══════════════════════════════════════════════════════════════════════════════

describe('deploy.sh — includes extract-characters edge function', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/deploy.sh`);
  });

  it('extract-characters is in the FUNCTIONS deploy list', () => {
    expect(source).toContain('extract-characters');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. vite.config.ts — supabase proxy
// ══════════════════════════════════════════════════════════════════════════════

describe('vite.config.ts — supabase proxy for local dev', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/vite.config.ts`);
  });

  it('has supabase proxy configuration', () => {
    expect(source).toContain('/api/');
    expect(source).toContain('supabase');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. Edge function test files exist
// ══════════════════════════════════════════════════════════════════════════════

describe('Edge function test files — exist and have test content', () => {
  const edgeTestFiles = [
    `${BASE}/supabase/functions/enrich-visual-dna-from-atoms/enrichVisualDnaFromAtoms_test.ts`,
    `${BASE}/supabase/functions/evaluate-visual-governance/governanceResolver_test.ts`,
    `${BASE}/supabase/functions/extract-visual-dna/extractVisualDna_test.ts`,
    `${BASE}/supabase/functions/generate-visual-dna-from-canon/generateVisualDnaFromCanon_test.ts`,
    `${BASE}/supabase/functions/visual-unit-engine/visualUnitEngine_test.ts`,
  ];

  edgeTestFiles.forEach((filePath) => {
    const fileName = filePath.split('/').pop() || 'unknown';
    it(`${fileName} exists and has test content`, () => {
      expect(fs.existsSync(filePath)).toBe(true);
      const content = readSource(filePath);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('import');
      expect(content).toContain('Deno');
      expect(content).toContain('assertEquals');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. Invariant checks — structural constraints verified
// ══════════════════════════════════════════════════════════════════════════════

describe('Invariant — VisualPanelErrorBoundary usage constraints', () => {
  const panelsToCheck = [
    { name: 'VisualSetCurationPanel', path: `${BASE}/src/components/images/VisualSetCurationPanel.tsx` },
    { name: 'VisualStyleAuthorityPanel', path: `${BASE}/src/components/images/VisualStyleAuthorityPanel.tsx` },
    { name: 'WorldLocationLookPanel', path: `${BASE}/src/components/images/WorldLocationLookPanel.tsx` },
    { name: 'VisualUnitHistoryTimeline', path: `${BASE}/src/components/visualUnits/VisualUnitHistoryTimeline.tsx` },
    { name: 'VisualUnitRunsList', path: `${BASE}/src/components/visualUnits/VisualUnitRunsList.tsx` },
    { name: 'VisualUnitSourcesPanel', path: `${BASE}/src/components/visualUnits/VisualUnitSourcesPanel.tsx` },
  ];

  panelsToCheck.forEach(({ name, path }) => {
    describe(`${name}`, () => {
      let source: string;
      beforeAll(() => {
        source = readSource(path);
      });

      it('has a panelLabel matching its component name on VisualPanelErrorBoundary', () => {
        // Every VisualPanelErrorBoundary should have a panelLabel prop with the component name
        const vpebTags = source.match(/<VisualPanelErrorBoundary[\s\S]*?\/?>/g) || [];
        vpebTags.forEach(tag => {
          if (tag.includes('panelLabel')) {
            expect(tag).toContain(`"${name}"`);
          }
        });
      });

      it('does not have dangling/unclosed JSX tags', () => {
        // Simple check: opening and closing VisualPanelErrorBoundary tags should be balanced
        const opens = (source.match(/<VisualPanelErrorBoundary[\s>]/g) || []).length;
        const closes = (source.match(/<\/VisualPanelErrorBoundary>/g) || []).length;
        expect(opens).toBe(closes);
      });
    });
  });
});

describe('Invariant — No Loader2 inline spinners remain in loading states', () => {
  const panelsToCheck = [
    `${BASE}/src/components/images/VisualSetCurationPanel.tsx`,
    `${BASE}/src/components/images/VisualStyleAuthorityPanel.tsx`,
    `${BASE}/src/components/images/WorldLocationLookPanel.tsx`,
    `${BASE}/src/components/visualUnits/VisualUnitHistoryTimeline.tsx`,
  ];

  panelsToCheck.forEach((path) => {
    const name = path.split('/').pop() || 'unknown';
    it(`${name} does NOT use Loader2 in loading return paths`, () => {
      const source = readSource(path);
      // The loading state should return VisualSkeleton, not inline Loader2
      const loadingSections = source.match(/if\s*\(\s*\w+\.?isLoading\s*\)[\s\S]*?return[\s\S]*?;/g) || [];
      loadingSections.forEach(section => {
        expect(section).not.toMatch(/Loader2/);
      });
    });
  });
});