/**
 * Tests for Location Visual Dataset canonical hardening:
 * - datasetCanonHash determinism and staleness detection
 * - datasetSlotMapping completeness and explicit unmapped handling
 * - datasetRetrievalResolver: fresh/stale/missing/fallback modes, inheritance
 */
import { describe, it, expect } from 'vitest';
import { computeCanonHash, buildHashInputs, evaluateFreshness, type DatasetHashInputs } from '@/lib/visual/datasetCanonHash';
import { mapPDSlotToDatasetSlot, getAllMappedPDSlots } from '@/lib/visual/datasetSlotMapping';
import { resolveDatasetForSlot, type DatasetResolutionResult } from '@/lib/visual/datasetRetrievalResolver';
import type { LocationVisualDataset } from '@/hooks/useLocationVisualDatasets';

// ── Hash tests ───────────────────────────────────────────────────────────────

describe('datasetCanonHash', () => {
  const makeInputs = (overrides: Partial<DatasetHashInputs> = {}): DatasetHashInputs => ({
    location: {
      canonical_name: 'test village',
      description: 'a small village',
      geography: 'coastal',
      era_relevance: 'medieval',
      interior_or_exterior: 'exterior',
      location_type: 'location',
    },
    canon: {
      world_description: 'dark fantasy world',
      setting: 'coastal region',
      tone_style: 'gritty',
    },
    style: {
      period: 'medieval',
      lighting_philosophy: 'natural',
      texture_materiality: 'stone, wood',
      color_response: 'muted',
    },
    materialPalette: ['stone', 'wood'],
    ...overrides,
  });

  it('produces identical hash for identical inputs', () => {
    const a = computeCanonHash(makeInputs());
    const b = computeCanonHash(makeInputs());
    expect(a).toBe(b);
    expect(a).toMatch(/^lvd_[0-9a-f]{8}$/);
  });

  it('produces different hash when location description changes', () => {
    const a = computeCanonHash(makeInputs());
    const b = computeCanonHash(makeInputs({
      location: { ...makeInputs().location, description: 'a large fortified village' },
    }));
    expect(a).not.toBe(b);
  });

  it('produces different hash when canon tone changes', () => {
    const a = computeCanonHash(makeInputs());
    const b = computeCanonHash(makeInputs({
      canon: { ...makeInputs().canon, tone_style: 'elegant' },
    }));
    expect(a).not.toBe(b);
  });

  it('produces different hash when materials change', () => {
    const a = computeCanonHash(makeInputs());
    const b = computeCanonHash(makeInputs({ materialPalette: ['marble', 'gold'] }));
    expect(a).not.toBe(b);
  });

  it('material order does not affect hash (sorted)', () => {
    const base = makeInputs();
    const a = computeCanonHash({ ...base, materialPalette: ['stone', 'wood'] });
    const b = computeCanonHash({ ...base, materialPalette: ['wood', 'stone'] });
    expect(a).toBe(b);
  });
});

describe('evaluateFreshness', () => {
  it('returns fresh when hashes match', () => {
    expect(evaluateFreshness('lvd_abc12345', 'lvd_abc12345')).toEqual({ status: 'fresh', reason: null });
  });

  it('returns stale when hashes differ', () => {
    const r = evaluateFreshness('lvd_abc12345', 'lvd_def67890');
    expect(r.status).toBe('stale');
    expect(r.reason).toBeTruthy();
  });

  it('returns unknown when stored hash is null', () => {
    expect(evaluateFreshness(null, 'lvd_abc12345').status).toBe('unknown');
  });
});

// ── Slot mapping tests ───────────────────────────────────────────────────────

describe('datasetSlotMapping', () => {
  it('maps establishing_wide to establishing', () => {
    const r = mapPDSlotToDatasetSlot('establishing_wide');
    expect(r.status).toBe('mapped');
    if (r.status === 'mapped') expect(r.datasetSlotKey).toBe('establishing');
  });

  it('maps atmospheric to atmosphere', () => {
    const r = mapPDSlotToDatasetSlot('atmospheric');
    expect(r.status).toBe('mapped');
    if (r.status === 'mapped') expect(r.datasetSlotKey).toBe('atmosphere');
  });

  it('maps texture_primary to surface_language', () => {
    const r = mapPDSlotToDatasetSlot('texture_primary');
    expect(r.status).toBe('mapped');
    if (r.status === 'mapped') expect(r.datasetSlotKey).toBe('surface_language');
  });

  it('returns unmapped for unknown slot', () => {
    const r = mapPDSlotToDatasetSlot('some_unknown_slot');
    expect(r.status).toBe('unmapped');
  });

  it('has at least 10 mapped slots', () => {
    expect(getAllMappedPDSlots().length).toBeGreaterThanOrEqual(10);
  });
});

// ── Retrieval resolver tests ─────────────────────────────────────────────────

describe('datasetRetrievalResolver', () => {
  const makeDataset = (overrides: Partial<LocationVisualDataset> = {}): LocationVisualDataset => ({
    id: 'ds-1',
    project_id: 'proj-1',
    canon_location_id: 'loc-1',
    location_name: 'Test Village',
    dataset_version: 1,
    source_mode: 'reverse_engineered',
    provenance: {},
    completeness_score: 0.8,
    is_current: true,
    parent_location_id: null,
    location_class: 'primary_space',
    inherits_from_parent: false,
    non_inheritable_traits: [],
    structural_substrate: { primary: ['stone'], secondary: [], notes: '' },
    surface_condition: { primary: ['weathered'], secondary: [], notes: '' },
    atmosphere_behavior: { primary: ['misty'], secondary: [], notes: '' },
    spatial_character: { primary: ['vast'], secondary: [], notes: '' },
    status_signal: { primary: [], secondary: [], notes: '' },
    contextual_dressing: { primary: [], secondary: [], notes: '' },
    occupation_trace: { primary: [], secondary: [], forbidden_as_dominant: true, notes: '' },
    symbolic_motif: { primary: [], secondary: [], notes: '' },
    slot_establishing: {
      primary_truths: ['Full architecture of Test Village', 'stone construction'],
      secondary_truths: ['misty'],
      contextual: [],
      forbidden_dominance: ['craft activity'],
      hard_negatives: ['pottery', 'people'],
      notes: 'Exterior establishing.',
    },
    slot_atmosphere: { primary_truths: ['misty'], secondary_truths: [], contextual: [], forbidden_dominance: [], hard_negatives: ['people'], notes: '' },
    slot_architectural_detail: { primary_truths: ['stone surface detail'], secondary_truths: [], contextual: [], forbidden_dominance: [], hard_negatives: ['people'], notes: '' },
    slot_time_variant: { primary_truths: [], secondary_truths: [], contextual: [], forbidden_dominance: [], hard_negatives: [], notes: '' },
    slot_surface_language: { primary_truths: ['stone as architectural surface'], secondary_truths: [], contextual: [], forbidden_dominance: [], hard_negatives: [], notes: '' },
    slot_motif: { primary_truths: [], secondary_truths: [], contextual: [], forbidden_dominance: [], hard_negatives: [], notes: '' },
    status_expression_mode: 'spatial',
    status_expression_notes: null,
    status_tier: 'working',
    material_privilege: { allowed: [], restricted: [], signature: [] },
    craft_level: 'functional',
    density_profile: { clutter: 'medium', object_density: 'balanced', negative_space: 'moderate' },
    spatial_intent: { purpose: 'lived_in', symmetry: 'none', flow: 'organic' },
    material_hierarchy: { primary: ['stone'], secondary: [], forbidden: [] },
    freshness_status: 'fresh',
    stale_reason: null,
    source_canon_hash: 'lvd_abc12345',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  });

  it('returns fresh_dataset when dataset exists and hash matches', () => {
    const result = resolveDatasetForSlot({
      pdSlotKey: 'establishing_wide',
      canonLocationId: 'loc-1',
      datasets: [makeDataset()],
      currentCanonHash: 'lvd_abc12345',
    });
    expect(result.mode).toBe('fresh_dataset');
    expect(result.promptBlocks?.primaryBlock).toContain('Full architecture');
    expect(result.negatives).toContain('pottery');
    expect(result.fallbackReason).toBeNull();
  });

  it('returns stale_dataset when hash differs', () => {
    const result = resolveDatasetForSlot({
      pdSlotKey: 'establishing_wide',
      canonLocationId: 'loc-1',
      datasets: [makeDataset()],
      currentCanonHash: 'lvd_different',
    });
    expect(result.mode).toBe('stale_dataset');
    expect(result.freshnessStatus).toBe('stale');
    expect(result.promptBlocks).not.toBeNull();
  });

  it('returns missing_dataset when no dataset for location', () => {
    const result = resolveDatasetForSlot({
      pdSlotKey: 'establishing_wide',
      canonLocationId: 'loc-99',
      datasets: [makeDataset()],
      currentCanonHash: 'lvd_abc12345',
    });
    expect(result.mode).toBe('missing_dataset');
    expect(result.promptBlocks).toBeNull();
    expect(result.fallbackReason).toContain('No current dataset found');
  });

  it('returns missing_dataset when no canonLocationId', () => {
    const result = resolveDatasetForSlot({
      pdSlotKey: 'establishing_wide',
      canonLocationId: null,
      datasets: [makeDataset()],
      currentCanonHash: 'lvd_abc12345',
    });
    expect(result.mode).toBe('missing_dataset');
  });

  it('returns unmapped_slot for unknown PD slot', () => {
    const result = resolveDatasetForSlot({
      pdSlotKey: 'unknown_slot_xyz',
      canonLocationId: 'loc-1',
      datasets: [makeDataset()],
      currentCanonHash: 'lvd_abc12345',
    });
    expect(result.mode).toBe('unmapped_slot');
  });

  it('applies parent inheritance and blocks non-inheritable traits', () => {
    const parent = makeDataset({
      id: 'ds-parent',
      canon_location_id: 'loc-parent',
      location_name: 'Parent Estate',
      slot_establishing: {
        primary_truths: ['Estate architecture'],
        secondary_truths: ['formal gardens'],
        contextual: [],
        forbidden_dominance: [],
        hard_negatives: ['workshop tools'],
        notes: '',
      },
    });
    const child = makeDataset({
      id: 'ds-child',
      canon_location_id: 'loc-child',
      location_name: 'Workshop',
      location_class: 'workshop',
      inherits_from_parent: true,
      parent_location_id: 'ds-parent',
      non_inheritable_traits: ['occupation_trace', 'contextual_dressing'],
    });

    const result = resolveDatasetForSlot({
      pdSlotKey: 'establishing_wide',
      canonLocationId: 'loc-child',
      datasets: [parent, child],
      currentCanonHash: 'lvd_abc12345',
      parentDataset: parent,
    });

    expect(result.mode).toBe('fresh_dataset');
    expect(result.inheritanceApplied).toBe(true);
    // Parent's negatives should be merged
    expect(result.negatives).toContain('workshop tools');
  });

  it('workshop child blocks occupation trace inheritance to parent scope', () => {
    const parent = makeDataset({
      id: 'ds-parent',
      canon_location_id: 'loc-parent',
    });
    const child = makeDataset({
      id: 'ds-workshop',
      canon_location_id: 'loc-workshop',
      location_class: 'workshop',
      inherits_from_parent: true,
      parent_location_id: 'ds-parent',
      non_inheritable_traits: ['occupation_trace'],
    });

    const result = resolveDatasetForSlot({
      pdSlotKey: 'establishing_wide',
      canonLocationId: 'loc-workshop',
      datasets: [parent, child],
      currentCanonHash: 'lvd_abc12345',
      parentDataset: parent,
    });

    expect(result.inheritanceApplied).toBe(true);
    expect(result.inheritanceNotes).toContain('non_inheritable');
    expect(result.inheritanceNotes).toContain('occupation_trace');
  });
});
