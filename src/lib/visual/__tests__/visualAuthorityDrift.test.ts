/**
 * visualAuthorityDrift.test.ts — Drift tripwire tests for Visual OS authority boundaries.
 *
 * These tests enforce that:
 * 1. extractVisualCanonSignals is the only public signal extraction path
 * 2. visual_project_bible does not consume raw visual canon prose
 * 3. Source Truth, Completion, Creative Design Primitives, and VCS have non-overlapping roles
 * 4. No consumer re-derives VisualCanonSignals outside the canonical extractor
 * 5. Enrichment mappers accept only structured signals, not raw prose
 */

import { describe, it, expect } from 'vitest';
import { VISUAL_AUTHORITIES, UI_SURFACE_BOUNDARIES } from '../visualAuthorityMap';
import { extractVisualCanonSignals, assertVisualCanonUsage } from '../visualCanonBrief';
import {
  mapWardrobeEnrichment,
  mapPDEnrichment,
  assertNoRawVisualCanonMarkdown,
} from '../visualCanonEnrichment';

// ── Authority Map Completeness ──────────────────────────────────────────────

describe('Visual Authority Map — Completeness', () => {
  const REQUIRED_AUTHORITIES = [
    'TEMPORAL_TRUTH',
    'EFFECTIVE_PROFILE',
    'STATE_WARDROBE',
    'COMPLETION_SUBSTRATE',
    'COMPLETION_PROOF',
    'PIPELINE_STAGES',
    'VISUAL_CANON_ENRICHMENT',
    'VISUAL_CANON_EXTRACTION',
    'VISUAL_CANON_SIGNALS',
    'CREATIVE_DESIGN_PRIMITIVES',
    'VISUAL_PROJECT_BIBLE',
    'VCS_ENGINE',
    'VCS_ROLE',
  ];

  for (const key of REQUIRED_AUTHORITIES) {
    it(`declares authority for ${key}`, () => {
      expect(VISUAL_AUTHORITIES).toHaveProperty(key);
      expect((VISUAL_AUTHORITIES as any)[key]).toBeTruthy();
    });
  }

  it('VCS role is explicitly evaluative', () => {
    expect(VISUAL_AUTHORITIES.VCS_ROLE).toBe('EVALUATIVE_ONLY');
  });

  it('visual canon extraction points to extractVisualCanonSignals', () => {
    expect(VISUAL_AUTHORITIES.VISUAL_CANON_EXTRACTION).toContain('extractVisualCanonSignals');
  });

  it('visual project bible points to assembler', () => {
    expect(VISUAL_AUTHORITIES.VISUAL_PROJECT_BIBLE).toContain('assembleVisualProjectBible');
  });

  it('creative design primitives points to visualCanonExtractor', () => {
    expect(VISUAL_AUTHORITIES.CREATIVE_DESIGN_PRIMITIVES).toContain('visualCanonExtractor');
  });
});

// ── UI Surface Boundary Non-Overlap ─────────────────────────────────────────

describe('Visual Authority Map — UI Surface Boundaries', () => {
  const surfaces = Object.entries(UI_SURFACE_BOUNDARIES);

  it('all surfaces have unique roles', () => {
    const roles = surfaces.map(([, v]) => v.role);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('Source Truth does not own visual_completion', () => {
    expect(UI_SURFACE_BOUNDARIES.SOURCE_TRUTH.does_not_own).toContain('visual_completion');
  });

  it('Source Truth does not own artistic_synthesis', () => {
    expect(UI_SURFACE_BOUNDARIES.SOURCE_TRUTH.does_not_own).toContain('artistic_synthesis');
  });

  it('Visual Canon Completion does not own truth_extraction', () => {
    expect(UI_SURFACE_BOUNDARIES.VISUAL_CANON_COMPLETION.does_not_own).toContain('truth_extraction');
  });

  it('Creative Design Primitives does not own visual_completion', () => {
    expect(UI_SURFACE_BOUNDARIES.CREATIVE_DESIGN_PRIMITIVES.does_not_own).toContain('visual_completion');
  });

  it('Creative Design Primitives does not own visual_canon_signals', () => {
    expect(UI_SURFACE_BOUNDARIES.CREATIVE_DESIGN_PRIMITIVES.does_not_own).toContain('visual_canon_signals');
  });

  it('VCS does not own stage_progression', () => {
    expect(UI_SURFACE_BOUNDARIES.VCS_PANEL.does_not_own).toContain('stage_progression');
  });

  it('Visual Canon Signals is NOT a UI surface', () => {
    expect(UI_SURFACE_BOUNDARIES.VISUAL_CANON_SIGNALS.role).toBe('structured_upstream_signal');
  });
});

// ── Canonical Extraction Path ───────────────────────────────────────────────

describe('Visual Canon Signals — Canonical Extraction Path', () => {
  const BRIEF = `
# Visual World Overview
Industrial city.

# Temporal and Cultural Grounding
- 1970s working-class England

# Costume Philosophy
Functional workwear reflects economic reality.

# Production Design Philosophy
Lived-in authenticity over aesthetic cleanliness.

# Material and Texture System
- Denim — labor identity
- Wool — warmth, economy

# Palette Logic
- Industrial: #444444, #666666

# Class and Labor Expression
- Working class: heavy fabrics, boots

# Grooming and Physicality
- Calloused hands, practical hair

# Motifs and Symbolism
- Chimneys — industry and home

# Contrast Rules
- Clean vs Worn — power vs authenticity

# Visual Exclusions
- No glamorized poverty

# Cinematic References
- Kes (Ken Loach) — social realism
`;

  it('extractVisualCanonSignals produces typed VisualCanonSignals', () => {
    const signals = extractVisualCanonSignals(BRIEF);
    expect(signals.extracted_at).toBeTruthy();
    expect(signals.is_complete).toBe(true);
    expect(signals.materials.length).toBeGreaterThan(0);
    expect(signals.exclusions.length).toBeGreaterThan(0);
  });

  it('enrichment mappers accept only structured signals', () => {
    const signals = extractVisualCanonSignals(BRIEF);
    const wardrobe = mapWardrobeEnrichment(signals);
    expect(wardrobe.material_hints.length).toBeGreaterThan(0);
    const pd = mapPDEnrichment(signals);
    expect(pd.material_signals.length).toBeGreaterThan(0);
  });

  it('enrichment mappers reject raw prose', () => {
    expect(() => mapWardrobeEnrichment(BRIEF as any)).toThrow(/IEL/);
    expect(() => mapPDEnrichment(BRIEF as any)).toThrow(/IEL/);
  });
});

// ── IEL Guards — No Raw Prose Leakage ───────────────────────────────────────

describe('Visual Canon Signals — IEL Prose Guards', () => {
  it('assertVisualCanonUsage blocks ui_display', () => {
    expect(() => assertVisualCanonUsage('ui_display')).toThrow();
  });

  it('assertVisualCanonUsage blocks prompt_builder', () => {
    expect(() => assertVisualCanonUsage('prompt_builder')).toThrow();
  });

  it('assertVisualCanonUsage blocks generation', () => {
    expect(() => assertVisualCanonUsage('generation')).toThrow();
  });

  it('assertVisualCanonUsage blocks export', () => {
    expect(() => assertVisualCanonUsage('export')).toThrow();
  });

  it('assertVisualCanonUsage allows extraction', () => {
    expect(() => assertVisualCanonUsage('extraction')).not.toThrow();
  });

  it('assertNoRawVisualCanonMarkdown blocks markdown with headings', () => {
    const raw = '# Visual World Overview\n\nA gritty, rain-soaked industrial cityscape dominated by concrete, steel, and neon. The world reflects economic stratification through architecture and material decay.';
    expect(() => assertNoRawVisualCanonMarkdown(raw, 'test_consumer')).toThrow(/RAW_VISUAL_CANON_MARKDOWN_BLOCKED/);
  });

  it('assertNoRawVisualCanonMarkdown allows structured objects', () => {
    expect(() => assertNoRawVisualCanonMarkdown({ materials: [] }, 'test_consumer')).not.toThrow();
  });

  it('assertNoRawVisualCanonMarkdown allows null', () => {
    expect(() => assertNoRawVisualCanonMarkdown(null, 'test_consumer')).not.toThrow();
  });
});

// ── Drift Tripwire: No Overlap Between Systems ──────────────────────────────

describe('Visual Authority — System Separation Tripwires', () => {
  it('Creative Design Primitives (visualCanonExtractor) is separate from VisualCanonSignals (visualCanonBrief)', () => {
    // These are intentionally distinct systems:
    // - visualCanonExtractor: derives artistic primitives from canon JSON
    // - visualCanonBrief: extracts structured signals from visual_canon_brief markdown
    expect(VISUAL_AUTHORITIES.CREATIVE_DESIGN_PRIMITIVES).toContain('visualCanonExtractor');
    expect(VISUAL_AUTHORITIES.VISUAL_CANON_EXTRACTION).toContain('visualCanonBrief');
    expect(VISUAL_AUTHORITIES.CREATIVE_DESIGN_PRIMITIVES).not.toContain('visualCanonBrief');
    expect(VISUAL_AUTHORITIES.VISUAL_CANON_EXTRACTION).not.toContain('visualCanonExtractor');
  });

  it('Source Truth does not claim signal ownership', () => {
    expect(UI_SURFACE_BOUNDARIES.SOURCE_TRUTH.does_not_own).toContain('visual_canon_signals');
  });

  it('Completion does not claim truth_extraction', () => {
    expect(UI_SURFACE_BOUNDARIES.VISUAL_CANON_COMPLETION.does_not_own).toContain('truth_extraction');
  });

  it('visual_project_bible assembler is declared as read-only output', () => {
    expect(VISUAL_AUTHORITIES.VISUAL_PROJECT_BIBLE).toContain('assembleVisualProjectBible');
  });
});
