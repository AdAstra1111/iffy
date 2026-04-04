import { describe, it, expect } from 'vitest';
import {
  assembleVisualProjectBible,
  validateAssemblyResult,
  VISUAL_PROJECT_BIBLE_SECTION_KEYS,
  VISUAL_PROJECT_BIBLE_REQUIRED_SECTION_COUNT,
  type VisualProjectBibleInput,
  type CharacterVisualSummary,
  type LocationVisualSummary,
  type ApprovedAssetRef,
} from '../visualProjectBibleAssembler';
import { extractVisualCanonSignals } from '../visualCanonBrief';
import { resolveProductionDesignFromCanon } from '@/lib/lookbook/productionDesign';

// ── Fixtures ────────────────────────────────────────────────────────────────

const FULL_BRIEF = `
# Visual World Overview
A rural feudal world of wood and stone.

# Temporal and Cultural Grounding
- Sengoku-era Japan (1467–1615)

# Costume Philosophy
Clothing reveals caste and labor. Nobles wear layered silk; commoners wear rough hemp. Every seam tells a story.

# Production Design Philosophy
Organic materials dominate. Timber-framed architecture with thatched roofs. Wealth shows in lacquer.

# Material and Texture System
- Hemp — commoner standard
- Silk — noble exclusivity
- Lacquer — wealth signifier
- Iron — tools and weaponry

# Palette Logic
- Earth tones: #8B7355, #6B5B45 — rural classes
- Indigo: #2C3E7B — artisan identity

# Class and Labor Expression
- Commoners: rough-hewn, mended garments
- Nobles: layered robes, spatial dominance

# Grooming and Physicality
- Weathered skin for laborers
- Precise topknots for samurai

# Motifs and Symbolism
- Water — purification
- Iron tools — self-making

# Contrast Rules
- Rough vs refined — commoner hemp vs noble silk

# Visual Exclusions
- Plastic — anachronistic
- Neon colors — not period-appropriate

# Cinematic References
- Seven Samurai (Kurosawa) — spatial composition
`;

function getSignals() {
  return extractVisualCanonSignals(FULL_BRIEF);
}

function makeCharacter(name: string): CharacterVisualSummary {
  return {
    character_name: name,
    character_key: name.toLowerCase().replace(/\s+/g, '_'),
    identity_summary: `${name} is a feudal-era character`,
    effective_garments: ['hemp tunic', 'straw sandals'],
    class_expression: 'commoner laborer',
    palette_logic: 'earth tones',
    material_cues: ['hemp', 'straw'],
    state_count: 2,
    approved_assets: [],
  };
}

function makeLocation(name: string): LocationVisualSummary {
  return {
    location_name: name,
    location_id: 'loc-1',
    description: `${name} — a key narrative space`,
    material_palette: ['timber', 'thatch'],
    architecture_style: 'traditional Japanese',
    environment_rules: ['Period-appropriate only'],
    approved_assets: [],
  };
}

function makeAsset(entityName: string, entityType: 'character' | 'location'): ApprovedAssetRef {
  return {
    asset_id: `asset-${entityName}`,
    public_url: `https://example.com/${entityName}.jpg`,
    asset_group: 'hero_frame',
    entity_name: entityName,
    entity_type: entityType,
    approval_status: 'approved',
  };
}

function buildInput(overrides?: Partial<VisualProjectBibleInput>): VisualProjectBibleInput {
  return {
    project_title: 'Test Project',
    project_id: 'proj-1',
    visualCanonSignals: getSignals(),
    productionDesign: resolveProductionDesignFromCanon({ setting: 'feudal Japan' }),
    characters: [makeCharacter('Takeshi'), makeCharacter('Yuki')],
    locations: [makeLocation('Village'), makeLocation('Castle')],
    approvedAssets: [makeAsset('Takeshi', 'character'), makeAsset('Village', 'location')],
    ...overrides,
  };
}

// ── Registration Tests ──────────────────────────────────────────────────────

describe('Visual Project Bible — Registration', () => {
  it('has exactly 7 required sections', () => {
    expect(VISUAL_PROJECT_BIBLE_SECTION_KEYS).toHaveLength(7);
    expect(VISUAL_PROJECT_BIBLE_REQUIRED_SECTION_COUNT).toBe(7);
  });

  it('section keys are in canonical order', () => {
    expect(VISUAL_PROJECT_BIBLE_SECTION_KEYS[0]).toBe('visual_thesis');
    expect(VISUAL_PROJECT_BIBLE_SECTION_KEYS[6]).toBe('asset_appendix');
  });
});

// ── Assembly Tests ──────────────────────────────────────────────────────────

describe('Visual Project Bible — Assembly', () => {
  it('produces complete document from full inputs', () => {
    const result = assembleVisualProjectBible(buildInput());
    expect(result.is_complete).toBe(true);
    expect(result.sections_present).toHaveLength(7);
    expect(result.sections_absent).toHaveLength(0);
    expect(result.markdown.length).toBeGreaterThan(500);
  });

  it('includes project title in header', () => {
    const result = assembleVisualProjectBible(buildInput());
    expect(result.markdown).toContain('Test Project');
  });

  it('includes all 7 section headings', () => {
    const result = assembleVisualProjectBible(buildInput());
    expect(result.markdown).toContain('# Visual Thesis');
    expect(result.markdown).toContain('# World & Design Language');
    expect(result.markdown).toContain('# Character Visual System');
    expect(result.markdown).toContain('# Location & Production Design');
    expect(result.markdown).toContain('# Visual Cohesion & Recurrence');
    expect(result.markdown).toContain('# References & Direction');
    expect(result.markdown).toContain('# Asset Appendix');
  });

  it('includes character details', () => {
    const result = assembleVisualProjectBible(buildInput());
    expect(result.markdown).toContain('Takeshi');
    expect(result.markdown).toContain('Yuki');
    expect(result.markdown).toContain('hemp tunic');
    expect(result.character_count).toBe(2);
  });

  it('includes location details', () => {
    const result = assembleVisualProjectBible(buildInput());
    expect(result.markdown).toContain('Village');
    expect(result.markdown).toContain('Castle');
    expect(result.location_count).toBe(2);
  });

  it('includes asset count in provenance', () => {
    const result = assembleVisualProjectBible(buildInput());
    expect(result.asset_count).toBe(2);
  });

  it('includes visual canon signals content', () => {
    const result = assembleVisualProjectBible(buildInput());
    expect(result.markdown).toContain('Sengoku');
    expect(result.markdown).toContain('Water');
    expect(result.markdown).toContain('Plastic');
    expect(result.markdown).toContain('Seven Samurai');
  });
});

// ── Absence Handling ────────────────────────────────────────────────────────

describe('Visual Project Bible — Absence Handling', () => {
  it('assembles without visual canon signals', () => {
    const result = assembleVisualProjectBible(buildInput({ visualCanonSignals: null }));
    expect(result.is_complete).toBe(true);
    expect(result.markdown).toContain('Visual canon brief not yet available');
    expect(result.visual_canon_version_id).toBeNull();
  });

  it('assembles without characters', () => {
    const result = assembleVisualProjectBible(buildInput({ characters: [] }));
    expect(result.is_complete).toBe(true);
    expect(result.markdown).toContain('No character visual profiles available');
    expect(result.character_count).toBe(0);
  });

  it('assembles without locations', () => {
    const result = assembleVisualProjectBible(buildInput({ locations: [] }));
    expect(result.is_complete).toBe(true);
    expect(result.markdown).toContain('No canonical locations available');
    expect(result.location_count).toBe(0);
  });

  it('assembles without approved assets', () => {
    const result = assembleVisualProjectBible(buildInput({ approvedAssets: [] }));
    expect(result.is_complete).toBe(true);
    expect(result.markdown).toContain('No approved visual assets available');
    expect(result.asset_count).toBe(0);
  });

  it('assembles with completely empty optional inputs', () => {
    const result = assembleVisualProjectBible(buildInput({
      visualCanonSignals: null,
      characters: [],
      locations: [],
      approvedAssets: [],
    }));
    expect(result.is_complete).toBe(true);
    expect(result.markdown.length).toBeGreaterThan(200);
    expect(result.validation_issues).toHaveLength(0);
  });
});

// ── Canonical Source Tests ───────────────────────────────────────────────────

describe('Visual Project Bible — Canonical Sources Only', () => {
  it('visual canon signals consumed via extraction only', () => {
    // Signals come from extractVisualCanonSignals — type shape enforced
    const signals = getSignals();
    expect(signals.extracted_at).toBeTruthy();
    expect(typeof signals.era_classification).toBe('string');

    const result = assembleVisualProjectBible(buildInput({ visualCanonSignals: signals }));
    expect(result.validation_issues).toHaveLength(0);
  });

  it('no raw visual canon markdown in output', () => {
    const result = assembleVisualProjectBible(buildInput());
    // The raw brief section headings (H1-level) should NOT appear as top-level sections
    // Sub-headings (##) used within bible sections are fine — they are assembled structure
    const rawTopHeadings = ['# Costume Philosophy', '# Grooming and Physicality', '# Motifs and Symbolism'];
    for (const h of rawTopHeadings) {
      expect(result.markdown).not.toContain(h);
    }
  });

  it('rejects unapproved assets in validation', () => {
    const badAsset: ApprovedAssetRef = {
      asset_id: 'bad-1',
      public_url: 'https://example.com/bad.jpg',
      asset_group: 'hero_frame',
      entity_name: 'Bad',
      entity_type: 'character',
      approval_status: 'draft' as any, // Invalid
    };
    const result = assembleVisualProjectBible(buildInput({ approvedAssets: [badAsset] }));
    expect(result.validation_issues.length).toBeGreaterThan(0);
    expect(result.validation_issues[0]).toContain('non-approved status');
  });
});

// ── Quality Gate Tests ──────────────────────────────────────────────────────

describe('Visual Project Bible — Quality Gates', () => {
  it('full input passes all gates', () => {
    const result = assembleVisualProjectBible(buildInput());
    const validation = validateAssemblyResult(result);
    expect(validation.passed).toBe(true);
    expect(validation.gate_results.every(g => g.passed)).toBe(true);
  });

  it('completeness gate reports section count', () => {
    const result = assembleVisualProjectBible(buildInput());
    const validation = validateAssemblyResult(result);
    const completenessGate = validation.gate_results.find(g => g.gate === 'completeness');
    expect(completenessGate?.passed).toBe(true);
    expect(completenessGate?.detail).toContain('7/7');
  });

  it('canonical inputs gate passes with clean inputs', () => {
    const result = assembleVisualProjectBible(buildInput());
    const validation = validateAssemblyResult(result);
    const inputGate = validation.gate_results.find(g => g.gate === 'canonical_inputs');
    expect(inputGate?.passed).toBe(true);
  });

  it('no truth mutation gate always passes', () => {
    const result = assembleVisualProjectBible(buildInput());
    const validation = validateAssemblyResult(result);
    const mutationGate = validation.gate_results.find(g => g.gate === 'no_truth_mutation');
    expect(mutationGate?.passed).toBe(true);
  });
});

// ── Provenance Tests ────────────────────────────────────────────────────────

describe('Visual Project Bible — Provenance', () => {
  it('preserves visual canon version id', () => {
    const signals = extractVisualCanonSignals(FULL_BRIEF, 'ver-123');
    const result = assembleVisualProjectBible(buildInput({ visualCanonSignals: signals }));
    expect(result.visual_canon_version_id).toBe('ver-123');
  });

  it('records enrichment status', () => {
    const pd = resolveProductionDesignFromCanon({ setting: 'feudal Japan' });
    const result = assembleVisualProjectBible(buildInput({ productionDesign: pd }));
    expect(typeof result.enrichment_applied).toBe('boolean');
  });

  it('records assembly timestamp', () => {
    const result = assembleVisualProjectBible(buildInput());
    expect(result.assembled_at).toBeTruthy();
    expect(new Date(result.assembled_at).getTime()).toBeGreaterThan(0);
  });
});

// ── Boundary Tests ──────────────────────────────────────────────────────────

describe('Visual Project Bible — Boundary Enforcement', () => {
  it('assembler does not modify input signals', () => {
    const signals = getSignals();
    const materialsBefore = [...signals.materials];
    assembleVisualProjectBible(buildInput({ visualCanonSignals: signals }));
    expect(signals.materials).toEqual(materialsBefore);
  });

  it('assembler does not modify input PD', () => {
    const pd = resolveProductionDesignFromCanon({ setting: 'feudal Japan' });
    const materialsBefore = [...pd.material_palette];
    assembleVisualProjectBible(buildInput({ productionDesign: pd }));
    expect(pd.material_palette).toEqual(materialsBefore);
  });

  it('character summaries use effective garments not raw', () => {
    // Verify the input contract requires effective_garments
    const char = makeCharacter('Test');
    expect(char.effective_garments).toBeDefined();
    // No 'signature_garments' field exists on the summary type
    expect((char as any).signature_garments).toBeUndefined();
  });
});
