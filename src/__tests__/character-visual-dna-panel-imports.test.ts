/**
 * CharacterVisualDNAPanel Import Fix Tests
 *
 * Verifies fix(visual): add missing VisualSkeleton/VisualPanelErrorBoundary
 * imports to CharacterVisualDNAPanel (commit ee18935).
 *
 * The two imports were missing, causing runtime errors when the component
 * tried to render its loading skeleton or error boundary states.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Import verification — the two missing imports exist
// ═══════════════════════════════════════════════════════════════════════

describe('CharacterVisualDNAPanel — import fix for VisualSkeleton + VisualPanelErrorBoundary', () => {
  const source = readSource('src/components/images/CharacterVisualDNAPanel.tsx');

  it('imports VisualSkeleton from @/components/visual/VisualSkeleton', () => {
    expect(source).toContain(
      "import { VisualSkeleton } from '@/components/visual/VisualSkeleton';"
    );
  });

  it('imports VisualPanelErrorBoundary from @/components/visual/VisualPanelErrorBoundary', () => {
    expect(source).toContain(
      "import { VisualPanelErrorBoundary } from '@/components/visual/VisualPanelErrorBoundary';"
    );
  });

  it('the two new imports are placed after sonner import (consistency with import order)', () => {
    const sonnerIdx = source.indexOf("import { toast } from 'sonner';");
    const vsIdx = source.indexOf('VisualSkeleton');
    const vpebIdx = source.indexOf('VisualPanelErrorBoundary');
    expect(sonnerIdx).toBeGreaterThan(0);
    expect(vsIdx).toBeGreaterThan(sonnerIdx);
    expect(vpebIdx).toBeGreaterThan(sonnerIdx);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Usage verification — the imports are actually used in the component
// ═══════════════════════════════════════════════════════════════════════

describe('CharacterVisualDNAPanel — correct usage of VisualSkeleton and VisualPanelErrorBoundary', () => {
  const source = readSource('src/components/images/CharacterVisualDNAPanel.tsx');

  it('uses VisualSkeleton for the loading/no-DNA state (when !dna)', () => {
    // The loading state renders: <VisualSkeleton variant="panel" lines={3} />
    expect(source).toContain(
      '<VisualSkeleton variant="panel" lines={3} />'
    );
  });

  it('wraps the panel content in VisualPanelErrorBoundary', () => {
    // The error boundary wraps the entire Card
    expect(source).toContain(
      '<VisualPanelErrorBoundary panelLabel="CharacterVisualDNAPanel">'
    );
  });

  it('VisualPanelErrorBoundary has a closing tag at the end of the return', () => {
    // </VisualPanelErrorBoundary> closes after </Card>
    expect(source).toContain('</VisualPanelErrorBoundary>');
  });

  it('VisualSkeleton is rendered inside the early return (!dna guard clause)', () => {
    // Find the guard clause block: if (!dna) { return ( <VisualSkeleton... /> ); }
    const nullGuardStart = source.indexOf('if (!dna) {');
    const nullGuardEnd = source.indexOf('};', nullGuardStart); // closing }; before next section
    const guardBlock = source.slice(nullGuardStart, nullGuardEnd !== -1 ? nullGuardEnd + 2 : undefined);
    expect(guardBlock).toContain('<VisualSkeleton variant="panel" lines={3}');
    expect(guardBlock).toContain('return');
  });

  it('VisualPanelErrorBoundary wraps the main Card content, not the loading state', () => {
    // The main Card should be INSIDE the error boundary
    const vpebOpenIdx = source.indexOf('<VisualPanelErrorBoundary');
    const cardStartIdx = source.indexOf('<Card');
    expect(vpebOpenIdx).toBeGreaterThan(0);
    expect(cardStartIdx).toBeGreaterThan(vpebOpenIdx);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Dependent component existence — ensure the imported components exist
// ═══════════════════════════════════════════════════════════════════════

describe('Dependent components exist', () => {
  it('VisualSkeleton.tsx exists with expected exports', () => {
    const source = readSource('src/components/visual/VisualSkeleton.tsx');
    // The default export is the component itself (used as default export)
    // We verify it accepts variant="panel" and lines={3}
    expect(source).toContain("'panel'");
    expect(source).toContain("lines?: number");
  });

  it('VisualPanelErrorBoundary.tsx exists with expected exports', () => {
    const source = readSource('src/components/visual/VisualPanelErrorBoundary.tsx');
    expect(source).toContain('panelLabel?: string');
    expect(source).toContain('VisualPanelErrorBoundary');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Edge case — loading state renders correctly (structure tests)
// ═══════════════════════════════════════════════════════════════════════

describe('CharacterVisualDNAPanel — edge cases for loading state', () => {
  const source = readSource('src/components/images/CharacterVisualDNAPanel.tsx');

  it('has a guard clause checking for !dna before rendering', () => {
    expect(source).toContain('if (!dna)');
  });

  it('loading state returns VisualSkeleton without excess content', () => {
    // The loading block should be: if (!dna) { return ( <VisualSkeleton ... /> ); }
    // Extract the loading block to verify it's self-contained
    const nullGuardStart = source.indexOf('if (!dna) {');
    const nullGuardEnd = source.indexOf('}', nullGuardStart);
    const loadingBlock = source.slice(nullGuardStart, nullGuardEnd + 1);

    // Should contain VisualSkeleton
    expect(loadingBlock).toContain('VisualSkeleton');
    // Should NOT contain the main Card content
    expect(loadingBlock).not.toContain('<Card');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Invariant — no orphaned references, no unused imports
// ═══════════════════════════════════════════════════════════════════════

describe('Invariant checks for import fix', () => {
  const source = readSource('src/components/images/CharacterVisualDNAPanel.tsx');

  it('VisualSkeleton import is used at least once outside the import statement', () => {
    // Count occurrences of "VisualSkeleton": should be exactly 2 (one import, one use)
    const matches = source.match(/VisualSkeleton/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('VisualPanelErrorBoundary import is used at least once outside the import statement', () => {
    // Count occurrences: at least 2 (one import, one opening tag, one closing tag...)
    // Actually it could be 3+ (import, opening, closing)
    const matches = source.match(/VisualPanelErrorBoundary/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('no leftover orphaned VisualSkeleton component import from wrong path', () => {
    // Ensure there's no attempt to import from a relative path that doesn't exist
    expect(source).not.toContain("from './VisualSkeleton'");
    expect(source).not.toContain("from '../visual/VisualSkeleton'");
  });

  it('no leftover orphaned VisualPanelErrorBoundary import from wrong path', () => {
    expect(source).not.toContain("from './VisualPanelErrorBoundary'");
    expect(source).not.toContain("from '../visual/VisualPanelErrorBoundary'");
  });

  it('no duplicate imports of VisualSkeleton or VisualPanelErrorBoundary', () => {
    const vsImports = source.match(/import.*VisualSkeleton/g);
    expect(vsImports).not.toBeNull();
    expect(vsImports!.length).toBe(1);

    const vpebImports = source.match(/import.*VisualPanelErrorBoundary/g);
    expect(vpebImports).not.toBeNull();
    expect(vpebImports!.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Regression — existing imports and exports are intact
// ═══════════════════════════════════════════════════════════════════════

describe('CharacterVisualDNAPanel — no regression on existing code', () => {
  const source = readSource('src/components/images/CharacterVisualDNAPanel.tsx');

  // Core imports should still be present
  it('still imports from react', () => {
    expect(source).toContain("import { useState, useEffect } from 'react';");
  });

  it('still imports lucide-react icons', () => {
    expect(source).toContain("import {");
    expect(source).toContain("} from 'lucide-react';");
  });

  it('still imports cn from @/lib/utils', () => {
    expect(source).toContain("import { cn } from '@/lib/utils';");
  });

  it('still imports useVisualDNA hook', () => {
    expect(source).toContain("import { useVisualDNA } from '@/hooks/useVisualDNA';");
  });

  it('still imports supabase client', () => {
    expect(source).toContain("import { supabase } from '@/integrations/supabase/client';");
  });

  it('still imports toast from sonner', () => {
    expect(source).toContain("import { toast } from 'sonner';");
  });

  it('still imports visualDNA types and functions', () => {
    expect(source).toContain("resolveCharacterVisualDNA");
    expect(source).toContain("deserializeBindingMarkers");
    expect(source).toContain("type CharacterVisualDNA");
  });

  it('still imports dnaAutoFlow functions', () => {
    expect(source).toContain("executeDnaAutoFlow");
    expect(source).toContain("DNA_AUTO_FLOW_MODE_DEFAULT");
  });

  it('still imports identityResolver', () => {
    expect(source).toContain("import { resolveCharacterIdentity }");
  });

  it('still imports characterTraits types', () => {
    expect(source).toContain("import type { TraitCategory, TraitSource, BindingMarker, MarkerStatus }");
  });

  it('still exports CharacterVisualDNAPanel as a named export', () => {
    expect(source).toContain("export function CharacterVisualDNAPanel");
  });

  it('Props interface is unchanged', () => {
    expect(source).toContain("projectId: string;");
    expect(source).toContain("characterName: string;");
    expect(source).toContain("canonCharacter: Record<string, unknown> | null;");
    expect(source).toContain("canonJson: Record<string, unknown> | null;");
    expect(source).toContain("userNotes: string;");
  });
});
