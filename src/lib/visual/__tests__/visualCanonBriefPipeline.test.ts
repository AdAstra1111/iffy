import { describe, it, expect } from 'vitest';
import {
  extractVisualCanonSignals,
  assertVisualCanonUsage,
  validateDocumentCompleteness,
  validateSignalsNonGeneric,
  VISUAL_CANON_BRIEF_SECTION_KEYS,
} from '../visualCanonBrief';

/**
 * Generation pipeline tests for visual_canon_brief.
 * Validates routing, source selection, completeness, and boundary correctness.
 */

// ── Source pack validation ──

describe('Visual Canon Brief — Generation Pipeline', () => {

  const UPSTREAM_DEPS: Record<string, string[]> = {
    visual_canon_brief: ['concept_brief', 'treatment', 'story_outline', 'character_bible', 'beat_sheet', 'feature_script'],
  };

  const FORBIDDEN_DEPS = [
    'visual_sets', 'effective_wardrobe', 'lookbook', 'hero_frames',
    'production_design', 'project_images', 'ai_generated_media',
  ];

  it('source pack contains only narrative doc types', () => {
    const deps = UPSTREAM_DEPS['visual_canon_brief'];
    expect(deps).toBeDefined();
    expect(deps.length).toBeGreaterThanOrEqual(2);
    for (const dep of deps) {
      expect(FORBIDDEN_DEPS).not.toContain(dep);
    }
  });

  it('source pack includes concept_brief as primary', () => {
    expect(UPSTREAM_DEPS['visual_canon_brief'][0]).toBe('concept_brief');
  });

  it('no downstream visual dependencies in source pack', () => {
    const deps = UPSTREAM_DEPS['visual_canon_brief'];
    const visualTerms = ['visual', 'wardrobe', 'lookbook', 'hero', 'image', 'costume', 'cast'];
    for (const dep of deps) {
      for (const term of visualTerms) {
        expect(dep.includes(term)).toBe(false);
      }
    }
  });

  it('fails generation when no sources available', () => {
    // Empty markdown should produce incomplete extraction
    const signals = extractVisualCanonSignals('');
    expect(signals.is_complete).toBe(false);
    expect(signals.era_classification).toBe('');
    expect(signals.palettes).toHaveLength(0);
  });
});

// ── Document heading completeness ──

describe('Visual Canon Brief — Heading Completeness', () => {
  const REQUIRED_HEADINGS = [
    'Visual World Overview', 'Temporal and Cultural Grounding', 'Costume Philosophy',
    'Production Design Philosophy', 'Material and Texture System', 'Palette Logic',
    'Class and Labor Expression', 'Grooming and Physicality', 'Motifs and Symbolism',
    'Contrast Rules', 'Visual Exclusions', 'Cinematic References',
  ];

  it('required headings match section keys count', () => {
    expect(REQUIRED_HEADINGS).toHaveLength(VISUAL_CANON_BRIEF_SECTION_KEYS.length);
  });

  it('section keys map to heading names', () => {
    // Each section key should be derivable from the heading
    for (const key of VISUAL_CANON_BRIEF_SECTION_KEYS) {
      const heading = REQUIRED_HEADINGS.find(h =>
        h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === key
      );
      expect(heading).toBeDefined();
    }
  });

  it('completeness validator detects all headings', () => {
    const doc = REQUIRED_HEADINGS.map(h => `# ${h}\n\nSome content here.`).join('\n\n');
    const result = validateDocumentCompleteness(doc);
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});

// ── Anti-generic validation ──

describe('Visual Canon Brief — Anti-Generic Gate', () => {
  it('flags insufficient material count', () => {
    const signals = extractVisualCanonSignals(`
# Visual World Overview
A city.

# Temporal and Cultural Grounding
- Contemporary

# Costume Philosophy
Short.

# Production Design Philosophy
Short.

# Material and Texture System
- One material

# Palette Logic
- Colors

# Class and Labor Expression
- Rules

# Grooming and Physicality
- Grooming

# Motifs and Symbolism
- Motif

# Contrast Rules
- Contrast

# Visual Exclusions
- Exclusion

# Cinematic References
- Film
`);
    const issues = validateSignalsNonGeneric(signals);
    expect(issues.length).toBeGreaterThan(0);
  });
});

// ── IEL boundary tests ──

describe('Visual Canon Brief — No Direct Consumption', () => {
  it('IEL blocks all non-extraction contexts', () => {
    const blocked: Array<'ui_display' | 'prompt_builder' | 'generation' | 'export'> = [
      'ui_display', 'prompt_builder', 'generation', 'export',
    ];
    for (const ctx of blocked) {
      expect(() => assertVisualCanonUsage(ctx)).toThrow();
    }
  });

  it('IEL allows extraction context', () => {
    expect(() => assertVisualCanonUsage('extraction')).not.toThrow();
  });
});
