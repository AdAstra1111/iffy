import { describe, it, expect } from 'vitest';
import {
  mapWardrobeEnrichment,
  mapPDEnrichment,
  resolveWardrobeEnrichmentOrNull,
  resolvePDEnrichmentOrNull,
  assertNoRawVisualCanonMarkdown,
} from '../visualCanonEnrichment';
import { extractVisualCanonSignals } from '../visualCanonBrief';
import { resolveProductionDesignFromCanon } from '@/lib/lookbook/productionDesign';

// ── Fixtures ────────────────────────────────────────────────────────────────

const FULL_BRIEF = `
# Visual World Overview
A rural feudal world of wood and stone. Villages along rivers, surrounded by paddies.

# Temporal and Cultural Grounding
- Sengoku-era Japan (1467–1615)
- Agrarian economy, class rigidity

# Costume Philosophy
Clothing reveals caste and labor. Nobles wear layered silk; commoners wear rough hemp and cotton. No modern fabrics. Every seam tells a story of station.

# Production Design Philosophy
Organic materials dominate. Architecture is timber-framed with thatched roofs. Interiors are spare. Wealth shows in lacquer and ceramics, not in quantity.

# Material and Texture System
- Hemp — commoner standard, rough
- Silk — noble exclusivity, layered
- Lacquer — wealth signifier
- Iron — tools and weaponry
- Thatch — roofing, rural identity

# Palette Logic
- Earth tones: #8B7355, #6B5B45 — rural, laboring classes
- Indigo accents: #2C3E7B — artisan craft identity

# Class and Labor Expression
- Commoners: rough-hewn, mended garments, bare feet or straw sandals
- Nobles: layered robes, immaculate presentation, spatial dominance in rooms

# Grooming and Physicality
- Weathered skin and calloused hands for laborers
- Precise topknots and grooming for samurai

# Motifs and Symbolism
- Water — life, change, purification
- Iron tools — industry, self-making
- Lacquer boxes — hidden wealth, concealed beauty

# Contrast Rules
- Rough vs refined — commoner hemp vs noble silk
- Interior restraint vs exterior wildness

# Visual Exclusions
- Plastic — anachronistic material
- Bright neon colors — not period-appropriate
- Modern eyewear — forbidden

# Cinematic References
- Seven Samurai (Kurosawa) — spatial composition and class contrast
- Ugetsu (Mizoguchi) — atmosphere and materiality
`;

function getSignals() {
  return extractVisualCanonSignals(FULL_BRIEF);
}

// ── Wardrobe Enrichment ─────────────────────────────────────────────────────

describe('Wardrobe Enrichment', () => {
  it('maps material hints from signals', () => {
    const bundle = mapWardrobeEnrichment(getSignals());
    expect(bundle.material_hints.length).toBeGreaterThanOrEqual(3);
    expect(bundle.material_hints).toContain('Hemp');
  });

  it('maps exclusion hints', () => {
    const bundle = mapWardrobeEnrichment(getSignals());
    expect(bundle.exclusion_hints.length).toBeGreaterThanOrEqual(2);
    expect(bundle.exclusion_hints).toContain('Plastic');
  });

  it('maps costume philosophy summary', () => {
    const bundle = mapWardrobeEnrichment(getSignals());
    expect(bundle.costume_philosophy_summary.length).toBeGreaterThan(50);
  });

  it('maps motif hints', () => {
    const bundle = mapWardrobeEnrichment(getSignals());
    expect(bundle.motif_hints.length).toBeGreaterThanOrEqual(1);
  });

  it('maps class expression hints', () => {
    const bundle = mapWardrobeEnrichment(getSignals());
    expect(bundle.class_expression_hints.length).toBeGreaterThanOrEqual(1);
  });

  it('includes provenance', () => {
    const bundle = mapWardrobeEnrichment(getSignals());
    expect(bundle.extracted_at).toBeTruthy();
  });
});

// ── PD Enrichment ───────────────────────────────────────────────────────────

describe('PD Enrichment', () => {
  it('maps material signals', () => {
    const bundle = mapPDEnrichment(getSignals());
    expect(bundle.material_signals.length).toBeGreaterThanOrEqual(3);
  });

  it('maps exclusion signals', () => {
    const bundle = mapPDEnrichment(getSignals());
    expect(bundle.exclusion_signals.length).toBeGreaterThanOrEqual(2);
  });

  it('maps PD philosophy summary', () => {
    const bundle = mapPDEnrichment(getSignals());
    expect(bundle.pd_philosophy_summary.length).toBeGreaterThan(50);
  });

  it('maps era classification', () => {
    const bundle = mapPDEnrichment(getSignals());
    expect(bundle.era_classification.length).toBeGreaterThan(0);
  });

  it('maps motif signals', () => {
    const bundle = mapPDEnrichment(getSignals());
    expect(bundle.motif_signals.length).toBeGreaterThanOrEqual(1);
  });
});

// ── PD Resolver Integration ────────────────────────────────────────────────

describe('PD Resolver with Enrichment', () => {
  it('works without enrichment (backward compatible)', () => {
    const pd = resolveProductionDesignFromCanon({ setting: 'feudal Japan' });
    expect(pd.material_palette.length).toBeGreaterThan(0);
    expect(pd.enrichment_applied).toBeFalsy();
  });

  it('enriches materials when PD enrichment provided', () => {
    const enrichment = mapPDEnrichment(getSignals());
    const pd = resolveProductionDesignFromCanon({ setting: 'feudal Japan' }, enrichment);
    expect(pd.enrichment_applied).toBe(true);
    // Should have more materials than without enrichment
    const pdNoEnrich = resolveProductionDesignFromCanon({ setting: 'feudal Japan' });
    expect(pd.material_palette.length).toBeGreaterThanOrEqual(pdNoEnrich.material_palette.length);
  });

  it('adds exclusion rules from enrichment', () => {
    const enrichment = mapPDEnrichment(getSignals());
    const pd = resolveProductionDesignFromCanon({}, enrichment);
    const hasExcludeRule = pd.environment_rules.some(r => r.startsWith('EXCLUDE:'));
    expect(hasExcludeRule).toBe(true);
  });

  it('adds motif recurrence hints from enrichment', () => {
    const enrichment = mapPDEnrichment(getSignals());
    const pd = resolveProductionDesignFromCanon({}, enrichment);
    const hasMotif = pd.environment_rules.some(r => r.startsWith('Motif recurrence:'));
    expect(hasMotif).toBe(true);
  });
});

// ── Absence Handling ────────────────────────────────────────────────────────

describe('Absence Handling', () => {
  it('returns null wardrobe enrichment when no signals', () => {
    expect(resolveWardrobeEnrichmentOrNull(null)).toBeNull();
    expect(resolveWardrobeEnrichmentOrNull(undefined)).toBeNull();
  });

  it('returns null PD enrichment when no signals', () => {
    expect(resolvePDEnrichmentOrNull(null)).toBeNull();
    expect(resolvePDEnrichmentOrNull(undefined)).toBeNull();
  });

  it('returns null for incomplete signals', () => {
    const incomplete = extractVisualCanonSignals('# Visual World Overview\nSome text only');
    expect(incomplete.is_complete).toBe(false);
    expect(resolveWardrobeEnrichmentOrNull(incomplete)).toBeNull();
    expect(resolvePDEnrichmentOrNull(incomplete)).toBeNull();
  });

  it('PD resolver works with null enrichment', () => {
    const pd = resolveProductionDesignFromCanon({ setting: 'modern city' }, null);
    expect(pd.material_palette.length).toBeGreaterThan(0);
    expect(pd.enrichment_applied).toBeFalsy();
  });
});

// ── IEL Guard Tests ─────────────────────────────────────────────────────────

describe('IEL Guards — No Raw Prose', () => {
  it('assertNoRawVisualCanonMarkdown blocks markdown input', () => {
    expect(() => assertNoRawVisualCanonMarkdown(FULL_BRIEF, 'test')).toThrow(/RAW_VISUAL_CANON_MARKDOWN_BLOCKED/);
  });

  it('assertNoRawVisualCanonMarkdown allows non-markdown strings', () => {
    expect(() => assertNoRawVisualCanonMarkdown('short text', 'test')).not.toThrow();
  });

  it('assertNoRawVisualCanonMarkdown allows structured objects', () => {
    const bundle = mapWardrobeEnrichment(getSignals());
    expect(() => assertNoRawVisualCanonMarkdown(bundle, 'test')).not.toThrow();
  });

  it('mapWardrobeEnrichment rejects raw string input', () => {
    expect(() => mapWardrobeEnrichment(FULL_BRIEF as any)).toThrow(/IEL/);
  });

  it('mapPDEnrichment rejects raw string input', () => {
    expect(() => mapPDEnrichment(FULL_BRIEF as any)).toThrow(/IEL/);
  });
});

// ── Boundary Tests ──────────────────────────────────────────────────────────

describe('Boundary — No Direct Consumption', () => {
  it('enrichment bundles contain no raw markdown', () => {
    const wb = mapWardrobeEnrichment(getSignals());
    const pd = mapPDEnrichment(getSignals());
    // No field should contain markdown headings
    const allStrings = [
      wb.costume_philosophy_summary,
      ...wb.material_hints,
      ...wb.class_expression_hints,
      ...wb.motif_hints,
      ...wb.exclusion_hints,
      pd.pd_philosophy_summary,
      pd.era_classification,
    ];
    for (const s of allStrings) {
      expect(s).not.toMatch(/^#{1,4}\s+/m);
    }
  });

  it('enrichment is non-authoritative — does not contain full prose sections', () => {
    const wb = mapWardrobeEnrichment(getSignals());
    // Costume philosophy is truncated
    expect(wb.costume_philosophy_summary.length).toBeLessThanOrEqual(400);
  });

  it('PD resolver truth owner remains authoritative with enrichment', () => {
    // Architecture style is still from canon resolver, not overridden
    const enrichment = mapPDEnrichment(getSignals());
    const pd = resolveProductionDesignFromCanon({ setting: 'feudal castle' }, enrichment);
    expect(pd.architecture_style).toBe('feudal/medieval');
  });
});
