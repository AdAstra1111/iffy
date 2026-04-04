import { describe, it, expect } from 'vitest';
import {
  extractVisualCanonSignals,
  assertVisualCanonUsage,
  validateDocumentCompleteness,
  validateSignalsNonGeneric,
  VISUAL_CANON_BRIEF_SECTION_KEYS,
  VISUAL_CANON_BRIEF_REQUIRED_COUNT,
  type VisualCanonSignals,
} from '../visualCanonBrief';

// ── Test Fixture: Complete Visual Canon Brief ────────────────────────────────

const COMPLETE_BRIEF = `
# Visual World Overview

A gritty, rain-soaked industrial cityscape dominated by concrete, steel, and neon. The world reflects economic stratification through architecture.

# Temporal and Cultural Grounding

- Contemporary urban setting, 2020s post-industrial decline
- Cultural grounding in working-class European port cities
- Visual language borrows from late-stage capitalism aesthetics

# Costume Philosophy

Costumes are extensions of economic reality. Protagonists wear layered, functional clothing that shows wear and repair. Antagonists wear pristine, minimal luxury fabrics. No character wears anything they couldn't afford within the story.

# Production Design Philosophy

Every space tells the story of who was there before. Production design prioritizes lived-in authenticity over aesthetic cleanliness. Sets should feel like they existed before the camera arrived and will continue after it leaves.

# Material and Texture System

- Concrete — structural permanence, institutional power
- Worn leather — resilience, working-class identity
- Glass — corporate transparency as illusion
- Rust — decay of the industrial promise

# Palette Logic

- Industrial Core: #3a3a3a, #5c5c5c, #8a8a8a — default world palette
- Neon Accent: #ff3366, #00ccff — nightlife and escape
- Organic Warmth: #8b6914, #a0522d — domestic safety

# Class and Labor Expression

- Working class: heavy fabrics, visible stitching, boots
- Management class: structured silhouettes, hidden seams
- Ownership class: minimal fabric, maximum quality

# Grooming and Physicality

- Protagonists show physical labor markers: calloused hands, sun damage
- Antagonists are meticulously groomed, almost artificially pristine
- Hair reflects economic status: practical vs. styled

# Motifs and Symbolism

- Water — cleansing and drowning, dual meaning
- Bridges — connection and division simultaneously
- Clocks — industrial time vs. human time

# Contrast Rules

- Light vs. Dark — wealth vs. poverty — bright corporate spaces against dim worker housing
- Clean vs. Worn — power vs. authenticity — pristine surfaces vs. textured reality
- Vertical vs. Horizontal — aspiration vs. stagnation — skyscrapers vs. ground-level sprawl

# Visual Exclusions

- No glamorized poverty — poverty must feel real, not aesthetic
- No clean dystopia — avoid sterile sci-fi tropes
- No color-grading shortcuts — warmth and coldness must come from production design, not post

# Cinematic References

- Capernaum (Nadine Labaki) — unflinching poverty realism
- Gomorrah (Matteo Garrone) — structural violence made visible
- The Florida Project (Sean Baker) — beauty within economic marginality
`;

// ── Phase 6: Document Completeness Tests ────────────────────────────────────

describe('Visual Canon Brief — Document Completeness', () => {
  it('has exactly 12 required section keys', () => {
    expect(VISUAL_CANON_BRIEF_SECTION_KEYS).toHaveLength(VISUAL_CANON_BRIEF_REQUIRED_COUNT);
    expect(VISUAL_CANON_BRIEF_REQUIRED_COUNT).toBe(12);
  });

  it('validates complete document as complete', () => {
    const result = validateDocumentCompleteness(COMPLETE_BRIEF);
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.present).toHaveLength(12);
  });

  it('detects missing sections', () => {
    const partial = COMPLETE_BRIEF.replace(/# Visual Exclusions[\s\S]*?(?=# Cinematic)/, '');
    const result = validateDocumentCompleteness(partial);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain('visual_exclusions');
  });
});

// ── Phase 6: Extraction Completeness Tests ──────────────────────────────────

describe('Visual Canon Brief — Extraction', () => {
  let signals: VisualCanonSignals;

  beforeAll(() => {
    signals = extractVisualCanonSignals(COMPLETE_BRIEF, 'test-version-id');
  });

  it('extracts era classification', () => {
    expect(signals.era_classification).toBeTruthy();
    expect(signals.era_classification.length).toBeGreaterThan(5);
  });

  it('extracts world visual identity', () => {
    expect(signals.world_visual_identity).toBeTruthy();
    expect(signals.world_visual_identity.length).toBeGreaterThan(20);
  });

  it('extracts costume philosophy', () => {
    expect(signals.costume_philosophy).toBeTruthy();
    expect(signals.costume_philosophy.length).toBeGreaterThan(50);
  });

  it('extracts production design philosophy', () => {
    expect(signals.production_design_philosophy).toBeTruthy();
    expect(signals.production_design_philosophy.length).toBeGreaterThan(50);
  });

  it('extracts palette signals with hex values', () => {
    expect(signals.palettes.length).toBeGreaterThanOrEqual(1);
    const withHex = signals.palettes.filter(p => p.hex_values.length > 0);
    expect(withHex.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts material signals', () => {
    expect(signals.materials.length).toBeGreaterThanOrEqual(2);
    expect(signals.materials[0].material).toBeTruthy();
  });

  it('extracts class expression rules', () => {
    expect(signals.class_expression_rules.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts grooming directives', () => {
    expect(signals.grooming_directives.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts motif signals', () => {
    expect(signals.motifs.length).toBeGreaterThanOrEqual(1);
    expect(signals.motifs[0].motif).toBeTruthy();
  });

  it('extracts contrast rules', () => {
    expect(signals.contrast_rules.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts visual exclusions', () => {
    expect(signals.exclusions.length).toBeGreaterThanOrEqual(1);
    expect(signals.exclusions[0].excluded_element).toBeTruthy();
  });

  it('extracts cinematic references', () => {
    expect(signals.cinematic_references.length).toBeGreaterThanOrEqual(1);
  });

  it('marks complete extraction as is_complete=true', () => {
    expect(signals.is_complete).toBe(true);
  });

  it('persists source_version_id', () => {
    expect(signals.source_version_id).toBe('test-version-id');
  });

  it('includes extracted_at timestamp', () => {
    expect(signals.extracted_at).toBeTruthy();
    expect(() => new Date(signals.extracted_at)).not.toThrow();
  });
});

// ── Phase 6: Anti-Generic Validation ────────────────────────────────────────

describe('Visual Canon Brief — Anti-Generic Validation', () => {
  it('passes validation for a well-specified brief', () => {
    const signals = extractVisualCanonSignals(COMPLETE_BRIEF);
    const issues = validateSignalsNonGeneric(signals);
    expect(issues).toHaveLength(0);
  });

  it('flags empty exclusions as generic', () => {
    const stripped = COMPLETE_BRIEF.replace(/# Visual Exclusions[\s\S]*?(?=# Cinematic)/, '# Visual Exclusions\n\n');
    const signals = extractVisualCanonSignals(stripped);
    const issues = validateSignalsNonGeneric(signals);
    expect(issues.some(i => i.includes('exclusion'))).toBe(true);
  });

  it('flags missing era as generic', () => {
    const stripped = COMPLETE_BRIEF.replace(/# Temporal and Cultural Grounding[\s\S]*?(?=# Costume)/, '# Temporal and Cultural Grounding\n\n');
    const signals = extractVisualCanonSignals(stripped);
    const issues = validateSignalsNonGeneric(signals);
    expect(issues.some(i => i.includes('Era'))).toBe(true);
  });
});

// ── Phase 5: IEL Guard Tests ────────────────────────────────────────────────

describe('Visual Canon Brief — IEL Guards', () => {
  it('allows extraction context', () => {
    expect(() => assertVisualCanonUsage('extraction')).not.toThrow();
  });

  it('allows diagnostic context', () => {
    expect(() => assertVisualCanonUsage('diagnostic')).not.toThrow();
  });

  it('blocks ui_display context', () => {
    expect(() => assertVisualCanonUsage('ui_display')).toThrow(/VISUAL_CANON_BRIEF_DIRECT_CONSUMPTION_BLOCKED/);
  });

  it('blocks prompt_builder context', () => {
    expect(() => assertVisualCanonUsage('prompt_builder')).toThrow(/VISUAL_CANON_BRIEF_DIRECT_CONSUMPTION_BLOCKED/);
  });

  it('blocks generation context', () => {
    expect(() => assertVisualCanonUsage('generation')).toThrow(/VISUAL_CANON_BRIEF_DIRECT_CONSUMPTION_BLOCKED/);
  });

  it('blocks export context', () => {
    expect(() => assertVisualCanonUsage('export')).toThrow(/VISUAL_CANON_BRIEF_DIRECT_CONSUMPTION_BLOCKED/);
  });
});

// ── Phase 6: No Direct Consumption Violations ───────────────────────────────

describe('Visual Canon Brief — Architecture Invariants', () => {
  it('extraction returns all required signal fields', () => {
    const signals = extractVisualCanonSignals(COMPLETE_BRIEF);
    const requiredFields: (keyof VisualCanonSignals)[] = [
      'era_classification', 'cultural_grounding', 'world_visual_identity',
      'costume_philosophy', 'production_design_philosophy', 'palettes',
      'materials', 'class_expression_rules', 'grooming_directives',
      'motifs', 'contrast_rules', 'exclusions', 'cinematic_references',
      'extracted_at', 'source_version_id', 'is_complete',
    ];
    for (const field of requiredFields) {
      expect(signals).toHaveProperty(field);
      // Non-null for all except source_version_id
      if (field !== 'source_version_id') {
        expect(signals[field]).not.toBeNull();
        expect(signals[field]).not.toBeUndefined();
      }
    }
  });

  it('empty document produces is_complete=false', () => {
    const signals = extractVisualCanonSignals('');
    expect(signals.is_complete).toBe(false);
  });
});
