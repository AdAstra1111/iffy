/**
 * visualEnforcementDrift.test.ts — Banned-usage drift tests and authority-consumer parity.
 *
 * These tests enforce that canonical authority paths are not bypassed
 * in active consumer code. They use search/import-based verification.
 *
 * If any of these tests fail, a forbidden access pattern has been reintroduced.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ─────────────────────────────────────────────────────────────────

function readFile(relPath: string): string {
  // Resolve from project root (CWD in vitest)
  const candidates = [
    path.resolve(process.cwd(), relPath),
    path.resolve(__dirname, '..', '..', '..', relPath),
    path.resolve(__dirname, '..', '..', '..', '..', relPath),
  ];
  for (const full of candidates) {
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf-8');
  }
  return '';
}

/** Search a file for a pattern, ignoring lines that are comments or test fixtures */
function findActiveUsages(content: string, pattern: RegExp): string[] {
  return content.split('\n').filter(line => {
    const trimmed = line.trim();
    // Skip pure comments, imports of the accessor/extractor, and type annotations
    if (trimmed.startsWith('//')) return false;
    if (trimmed.startsWith('*')) return false;
    if (trimmed.startsWith('/*')) return false;
    return pattern.test(line);
  });
}

// ── Banned Pattern: Direct visual_canon_brief_content reads ─────────────────

describe('Banned: Direct visual_canon_brief_content reads in consumers', () => {
  const CONSUMER_FILES = [
    'src/hooks/useProductionDesignOrchestrator.ts',
    'src/components/visual/VisualCanonExtractionPanel.tsx',
    'src/components/visual/VisualCoherencePanel.tsx',
    'src/lib/visual/visualProjectBibleAssembler.ts',
  ];

  for (const file of CONSUMER_FILES) {
    it(`${file} does not read visual_canon_brief_content directly`, () => {
      const content = readFile(file);
      if (!content) return; // File may not exist in test env
      // Find lines that access the key directly (not via the accessor constant)
      const directReads = findActiveUsages(
        content,
        /['"]visual_canon_brief_content['"]/,
      );
      expect(directReads).toEqual([]);
    });
  }
});

// ── Banned Pattern: Raw signature_garments in UI rendering ──────────────────

describe('Banned: Raw signature_garments rendering in active UI', () => {
  const UI_FILES = [
    'src/components/visual/CostumeOnActorPanel.tsx',
  ];

  for (const file of UI_FILES) {
    it(`${file} does not render raw signature_garments for display chips`, () => {
      const content = readFile(file);
      if (!content) return;
      // In CostumeOnActorPanel, signature_garments should only appear in
      // diagnostics or via effective/resolved paths, never as direct chip source
      const rawRenders = findActiveUsages(
        content,
        /\.signature_garments\s*\.\s*map\s*\(/,
      );
      expect(rawRenders).toEqual([]);
    });
  }
});

// ── Authority-Consumer Parity ───────────────────────────────────────────────

describe('Authority-Consumer Parity: PD Orchestrator', () => {
  it('uses getVisualCanonBriefContent for brief retrieval', () => {
    const content = readFile('src/hooks/useProductionDesignOrchestrator.ts');
    if (!content) return;
    expect(content).toContain('getVisualCanonBriefContent');
  });

  it('uses extractVisualCanonSignals for signal extraction', () => {
    const content = readFile('src/hooks/useProductionDesignOrchestrator.ts');
    if (!content) return;
    expect(content).toContain('extractVisualCanonSignals');
  });
});

describe('Authority-Consumer Parity: Visual Project Bible', () => {
  it('does not import raw visual canon brief accessor for prose consumption', () => {
    const content = readFile('src/lib/visual/visualProjectBibleAssembler.ts');
    if (!content) return;
    // Bible should consume VisualCanonSignals, not raw brief content
    expect(content).not.toContain('getVisualCanonBriefContent');
  });

  it('accepts VisualCanonSignals as typed input', () => {
    const content = readFile('src/lib/visual/visualProjectBibleAssembler.ts');
    if (!content) return;
    expect(content).toContain('VisualCanonSignals');
  });
});

describe('Authority-Consumer Parity: CostumeOnActorPanel', () => {
  it('uses resolveStateWardrobe for state display', () => {
    const content = readFile('src/components/visual/CostumeOnActorPanel.tsx');
    if (!content) return;
    expect(content).toContain('resolveStateWardrobe');
  });

  it('uses resolveEffectiveProfileOrNull for profile resolution', () => {
    const content = readFile('src/components/visual/CostumeOnActorPanel.tsx');
    if (!content) return;
    expect(content).toContain('resolveEffectiveProfileOrNull');
  });
});

describe('Authority-Consumer Parity: CharacterWardrobePanel', () => {
  it('prefers effective_signature_garments over raw signature_garments', () => {
    const content = readFile('src/components/visual/CharacterWardrobePanel.tsx');
    if (!content) return;
    expect(content).toContain('effective_signature_garments');
  });
});

// ── Banned Pattern: VCS claiming progression authority ───────────────────────

describe('Banned: VCS progression authority language', () => {
  it('VisualCoherencePanel does not use stage/progression gate language', () => {
    const content = readFile('src/components/visual/VisualCoherencePanel.tsx');
    if (!content) return;
    const gateLanguage = findActiveUsages(
      content,
      /\b(progression gate|stage gate|blocks? progression|advancement blocked)\b/i,
    );
    expect(gateLanguage).toEqual([]);
  });
});

// ── Public Entrypoints Declaration Exists ───────────────────────────────────

describe('Visual Public Entrypoints', () => {
  it('visualPublicEntrypoints.ts exists and exports canonical APIs', () => {
    const content = readFile('src/lib/visual/visualPublicEntrypoints.ts');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('getVisualCanonBriefContent');
    expect(content).toContain('extractVisualCanonSignals');
    expect(content).toContain('resolveEffectiveProfile');
    expect(content).toContain('resolveStateWardrobe');
    expect(content).toContain('assembleVisualProjectBible');
    expect(content).toContain('VISUAL_AUTHORITIES');
  });

  it('does not re-export internal normalizer primitives', () => {
    const content = readFile('src/lib/visual/visualPublicEntrypoints.ts');
    // normalizeWardrobe is internal-only
    const exports = content.split('\n').filter(l =>
      l.trim().startsWith('export') && l.includes('normalizeWardrobe')
    );
    expect(exports).toEqual([]);
  });
});

// ── Raw Garment Read Classification ─────────────────────────────────────────

describe('Raw garment field classification', () => {
  it('effectiveProfileResolver reads signature_garments as canonical input contract', () => {
    const content = readFile('src/lib/visual/effectiveProfileResolver.ts');
    expect(content).toContain('profile.signature_garments');
    // This is the canonical input contract — resolver reads raw to produce effective
  });

  it('wardrobeProfileGuard reads wardrobe_identity_summary as diagnostic input', () => {
    const content = readFile('src/lib/visual/wardrobeProfileGuard.ts');
    expect(content).toContain('profile.wardrobe_identity_summary');
    // This is a validation guard — reads raw to detect degraded profiles
  });

  it('characterWardrobeExtractor produces signature_garments as extractor output', () => {
    const content = readFile('src/lib/visual/characterWardrobeExtractor.ts');
    expect(content).toContain('signature_garments');
    // This is the extractor — it produces the raw fields
  });
});
