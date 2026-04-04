/**
 * visualConsumerConformance.test.ts — Regression tests proving downstream consumers
 * conform to the canonical authority map roles.
 *
 * Each consumer must:
 * - Own exactly the responsibilities declared in UI_SURFACE_BOUNDARIES
 * - NOT semantically duplicate adjacent systems
 * - Degrade explicitly when upstream structured truth is absent
 * - NOT reparse raw visual canon prose
 */

import { describe, it, expect } from 'vitest';
import { UI_SURFACE_BOUNDARIES, VISUAL_AUTHORITIES } from '../visualAuthorityMap';
import { getVisualCanonBriefContent, VISUAL_CANON_BRIEF_CANON_KEY } from '../visualCanonBriefAccessor';
import { extractVisualCanonSignals } from '../visualCanonBrief';
import {
  mapWardrobeEnrichment,
  mapPDEnrichment,
  assertNoRawVisualCanonMarkdown,
  resolvePDEnrichmentOrNull,
  resolveWardrobeEnrichmentOrNull,
} from '../visualCanonEnrichment';

// ── Source Truth Role Conformance ────────────────────────────────────────────

describe('Consumer Conformance — Source Truth', () => {
  it('owns upstream canonical truth only', () => {
    const st = UI_SURFACE_BOUNDARIES.SOURCE_TRUTH;
    expect(st.role).toBe('upstream_canonical_truth');
    expect(st.owns).toContain('temporal_truth');
    expect(st.owns).toContain('wardrobe_profiles');
    expect(st.owns).toContain('location_truth');
  });

  it('does not own visual completion', () => {
    expect(UI_SURFACE_BOUNDARIES.SOURCE_TRUTH.does_not_own).toContain('visual_completion');
  });

  it('does not own scoring', () => {
    expect(UI_SURFACE_BOUNDARIES.SOURCE_TRUTH.does_not_own).toContain('scoring');
  });

  it('does not own artistic synthesis', () => {
    expect(UI_SURFACE_BOUNDARIES.SOURCE_TRUTH.does_not_own).toContain('artistic_synthesis');
  });

  it('does not own visual canon signals', () => {
    expect(UI_SURFACE_BOUNDARIES.SOURCE_TRUTH.does_not_own).toContain('visual_canon_signals');
  });
});

// ── Creative Design Primitives Role Conformance ─────────────────────────────

describe('Consumer Conformance — Creative Design Primitives', () => {
  it('role is derived artistic synthesis', () => {
    expect(UI_SURFACE_BOUNDARIES.CREATIVE_DESIGN_PRIMITIVES.role).toBe('derived_artistic_synthesis');
  });

  it('does not claim truth extraction authority', () => {
    expect(UI_SURFACE_BOUNDARIES.CREATIVE_DESIGN_PRIMITIVES.does_not_own).toContain('truth_extraction');
  });

  it('does not claim visual completion authority', () => {
    expect(UI_SURFACE_BOUNDARIES.CREATIVE_DESIGN_PRIMITIVES.does_not_own).toContain('visual_completion');
  });

  it('does not claim visual canon signals authority', () => {
    expect(UI_SURFACE_BOUNDARIES.CREATIVE_DESIGN_PRIMITIVES.does_not_own).toContain('visual_canon_signals');
  });

  it('authority points to visualCanonExtractor, not visualCanonBrief', () => {
    expect(VISUAL_AUTHORITIES.CREATIVE_DESIGN_PRIMITIVES).toContain('visualCanonExtractor');
    expect(VISUAL_AUTHORITIES.CREATIVE_DESIGN_PRIMITIVES).not.toContain('visualCanonBrief');
  });
});

// ── VCS Role Conformance ────────────────────────────────────────────────────

describe('Consumer Conformance — VCS (Visual Coherence Scoring)', () => {
  it('role is evaluative score only', () => {
    expect(UI_SURFACE_BOUNDARIES.VCS_PANEL.role).toBe('evaluative_score');
  });

  it('is explicitly not a progression gate', () => {
    expect(UI_SURFACE_BOUNDARIES.VCS_PANEL.does_not_own).toContain('stage_progression');
  });

  it('does not own truth extraction', () => {
    expect(UI_SURFACE_BOUNDARIES.VCS_PANEL.does_not_own).toContain('truth_extraction');
  });

  it('does not own visual completion', () => {
    expect(UI_SURFACE_BOUNDARIES.VCS_PANEL.does_not_own).toContain('visual_completion');
  });

  it('VCS_ROLE constant is EVALUATIVE_ONLY', () => {
    expect(VISUAL_AUTHORITIES.VCS_ROLE).toBe('EVALUATIVE_ONLY');
  });
});

// ── Visual Canon Completion Role Conformance ────────────────────────────────

describe('Consumer Conformance — Visual Canon Completion', () => {
  it('role is downstream visual coverage', () => {
    expect(UI_SURFACE_BOUNDARIES.VISUAL_CANON_COMPLETION.role).toBe('downstream_visual_coverage');
  });

  it('does not claim truth extraction authority', () => {
    expect(UI_SURFACE_BOUNDARIES.VISUAL_CANON_COMPLETION.does_not_own).toContain('truth_extraction');
  });

  it('does not claim scoring authority', () => {
    expect(UI_SURFACE_BOUNDARIES.VISUAL_CANON_COMPLETION.does_not_own).toContain('scoring');
  });
});

// ── Visual Canon Signals Role Conformance ───────────────────────────────────

describe('Consumer Conformance — Visual Canon Signals', () => {
  it('is a structured upstream signal, not a UI surface', () => {
    expect(UI_SURFACE_BOUNDARIES.VISUAL_CANON_SIGNALS.role).toBe('structured_upstream_signal');
  });

  it('does not own truth extraction', () => {
    expect(UI_SURFACE_BOUNDARIES.VISUAL_CANON_SIGNALS.does_not_own).toContain('truth_extraction');
  });

  it('does not own visual completion', () => {
    expect(UI_SURFACE_BOUNDARIES.VISUAL_CANON_SIGNALS.does_not_own).toContain('visual_completion');
  });
});

// ── Visual Project Bible Role Conformance ───────────────────────────────────

describe('Consumer Conformance — Visual Project Bible', () => {
  it('authority points to assembler (output-only)', () => {
    expect(VISUAL_AUTHORITIES.VISUAL_PROJECT_BIBLE).toContain('assembleVisualProjectBible');
  });
});

// ── Production Design Enrichment Degradation ────────────────────────────────

describe('Consumer Conformance — PD Enrichment Degradation', () => {
  it('explicit missing diagnostic when canon absent', () => {
    const result = getVisualCanonBriefContent(null);
    expect(result.status).toBe('missing');
    expect(result.diagnostic).toBeTruthy();
  });

  it('explicit missing diagnostic when key absent', () => {
    const result = getVisualCanonBriefContent({ other: 'stuff' });
    expect(result.status).toBe('missing');
    expect(result.diagnostic).toContain(VISUAL_CANON_BRIEF_CANON_KEY);
  });

  it('PD enrichment returns null when signals incomplete', () => {
    const signals = extractVisualCanonSignals('');
    expect(signals.is_complete).toBe(false);
    const enrichment = resolvePDEnrichmentOrNull(signals);
    expect(enrichment).toBeNull();
  });

  it('wardrobe enrichment returns null when signals incomplete', () => {
    const signals = extractVisualCanonSignals('');
    const enrichment = resolveWardrobeEnrichmentOrNull(signals);
    expect(enrichment).toBeNull();
  });

  it('enrichment returns null explicitly, not undefined', () => {
    expect(resolvePDEnrichmentOrNull(null)).toBeNull();
    expect(resolveWardrobeEnrichmentOrNull(null)).toBeNull();
    expect(resolvePDEnrichmentOrNull(undefined)).toBeNull();
    expect(resolveWardrobeEnrichmentOrNull(undefined)).toBeNull();
  });
});

// ── No Raw Prose Reparsing ──────────────────────────────────────────────────

describe('Consumer Conformance — No Raw Prose Downstream', () => {
  const RAW_BRIEF = `# Visual World Overview
A gritty industrial cityscape with concrete and neon. The world shows economic stratification through architecture, material decay, and layered urban density.

# Temporal and Cultural Grounding
- 2020s post-industrial decline

# Costume Philosophy
Functional workwear.
`;

  it('enrichment mappers reject raw markdown strings', () => {
    expect(() => mapWardrobeEnrichment(RAW_BRIEF as any)).toThrow(/IEL/);
    expect(() => mapPDEnrichment(RAW_BRIEF as any)).toThrow(/IEL/);
  });

  it('assertNoRawVisualCanonMarkdown blocks long prose with headings', () => {
    expect(() => assertNoRawVisualCanonMarkdown(RAW_BRIEF, 'conformance_test')).toThrow(/RAW_VISUAL_CANON_MARKDOWN_BLOCKED/);
  });

  it('assertNoRawVisualCanonMarkdown allows structured signal objects', () => {
    const signals = extractVisualCanonSignals(RAW_BRIEF);
    expect(() => assertNoRawVisualCanonMarkdown(signals, 'conformance_test')).not.toThrow();
  });

  it('assertNoRawVisualCanonMarkdown allows null/undefined', () => {
    expect(() => assertNoRawVisualCanonMarkdown(null, 'test')).not.toThrow();
    expect(() => assertNoRawVisualCanonMarkdown(undefined, 'test')).not.toThrow();
  });
});
