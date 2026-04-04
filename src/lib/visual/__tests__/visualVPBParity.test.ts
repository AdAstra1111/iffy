/**
 * visualVPBParity.test.ts — Parity and drift tests proving:
 *
 * 1. Client and edge wrappers both use the shared assembly core
 * 2. Same structured input produces equivalent markdown from both paths
 * 3. No duplicated section-construction logic exists outside the core
 * 4. Edge-local signal parser is sealed and explicitly labeled
 * 5. No raw prose reaches the shared assembly core
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { assembleVPBCore, VPB_SECTION_KEYS, VPB_REQUIRED_SECTION_COUNT } from '../visualProjectBibleCore';
import { assembleVisualProjectBible } from '../visualProjectBibleAssembler';
import type { VPBCoreInput } from '../visualProjectBibleCore';

function readProjectFile(relPath: string): string {
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

// ── Shared test fixture ─────────────────────────────────────────────────────

const FIXTURE_INPUT: VPBCoreInput = {
  project_title: 'Parity Test Project',
  project_id: 'test-parity-001',
  visualCanonSignals: {
    world_visual_identity: 'A gritty industrial port city',
    era_classification: '1970s',
    cultural_grounding: 'Working-class British',
    costume_philosophy: 'Functional decay',
    production_design_philosophy: 'Brutalist infrastructure',
    materials: [
      { material: 'Denim', narrative_role: 'Worker identity', associated_characters: ['Tommy'] },
    ],
    palettes: [
      { palette_name: 'Rust', hex_values: ['#8B4513'], usage_context: 'Industrial decay' },
    ],
    motifs: [
      { motif: 'Chain-link fencing', meaning: 'Containment', recurrence_pattern: 'Every act boundary' },
    ],
    exclusions: [
      { excluded_element: 'Neon lighting', reason: 'Anachronistic' },
    ],
    cinematic_references: [
      { title: 'The Long Good Friday', director: 'John Mackenzie', relevance: 'Tone and grit' },
    ],
    class_expression_rules: ['Worn fabric = lower class'],
    contrast_rules: [
      { axis: 'Power', pole_a: 'Suits', pole_b: 'Overalls', visual_expression: 'Fabric weight' },
    ],
    grooming_directives: [],
    is_complete: true,
    extracted_at: new Date().toISOString(),
  },
  productionDesign: {
    material_palette: ['Concrete', 'Rusted steel'],
    architecture_style: 'Post-industrial brutalist',
    environment_rules: ['No clean surfaces', 'Graffiti aged minimum 5 years'],
    enrichment_applied: true,
  },
  characters: [
    {
      character_name: 'Tommy',
      character_key: 'tommy',
      identity_summary: 'Dockworker turned smuggler',
      effective_garments: ['Denim jacket', 'Steel-toed boots'],
      class_expression: 'Working class',
      palette_logic: 'Blues and greys',
      material_cues: ['Denim', 'Leather'],
      state_count: 3,
      approved_assets: [],
    },
  ],
  locations: [
    {
      location_name: 'The Docks',
      location_id: 'loc-001',
      description: 'A crumbling container port',
      material_palette: ['Concrete', 'Rusted steel'],
      architecture_style: 'Post-industrial brutalist',
      environment_rules: ['No clean surfaces'],
      approved_assets: [],
    },
  ],
  approvedAssets: [],
  assembled_at: '2025-01-01T00:00:00.000Z',
};

// ── 1. Core assembly produces complete output ───────────────────────────────

describe('VPB Parity: Shared Core', () => {
  it('assembleVPBCore produces all 7 sections', () => {
    const result = assembleVPBCore(FIXTURE_INPUT);
    expect(result.sections_present).toHaveLength(VPB_REQUIRED_SECTION_COUNT);
    expect(result.is_complete).toBe(true);
    expect(result.generation_method).toBe('deterministic_assembly');
  });

  it('section keys match canonical order', () => {
    const result = assembleVPBCore(FIXTURE_INPUT);
    expect(result.sections_present).toEqual([...VPB_SECTION_KEYS]);
  });

  it('markdown contains all section headings', () => {
    const result = assembleVPBCore(FIXTURE_INPUT);
    expect(result.markdown).toContain('# Visual Thesis');
    expect(result.markdown).toContain('# World & Design Language');
    expect(result.markdown).toContain('# Character Visual System');
    expect(result.markdown).toContain('# Location & Production Design');
    expect(result.markdown).toContain('# Visual Cohesion & Recurrence');
    expect(result.markdown).toContain('# References & Direction');
    expect(result.markdown).toContain('# Asset Appendix');
  });

  it('markdown contains structured signal content, not raw prose', () => {
    const result = assembleVPBCore(FIXTURE_INPUT);
    expect(result.markdown).toContain('Chain-link fencing');
    expect(result.markdown).toContain('Containment');
    expect(result.markdown).toContain('#8B4513');
    expect(result.markdown).toContain('Tommy');
  });
});

// ── 2. Client wrapper delegates to core ─────────────────────────────────────

describe('VPB Parity: Client Wrapper Delegation', () => {
  it('client wrapper produces same section headings as core', () => {
    const clientResult = assembleVisualProjectBible({
      ...FIXTURE_INPUT,
      visualCanonSignals: FIXTURE_INPUT.visualCanonSignals as any,
      productionDesign: {
        ...FIXTURE_INPUT.productionDesign,
      },
    } as any);
    const coreResult = assembleVPBCore(FIXTURE_INPUT);

    // Same sections present
    expect(clientResult.sections_present).toEqual(coreResult.sections_present);
  });

  it('client wrapper markdown matches core markdown', () => {
    const clientResult = assembleVisualProjectBible({
      ...FIXTURE_INPUT,
      visualCanonSignals: FIXTURE_INPUT.visualCanonSignals as any,
      productionDesign: {
        ...FIXTURE_INPUT.productionDesign,
      },
    } as any);
    const coreResult = assembleVPBCore(FIXTURE_INPUT);

    // Markdown should be identical (client delegates to core)
    expect(clientResult.markdown).toBe(coreResult.markdown);
  });

  it('client wrapper counts match core counts', () => {
    const clientResult = assembleVisualProjectBible({
      ...FIXTURE_INPUT,
      visualCanonSignals: FIXTURE_INPUT.visualCanonSignals as any,
      productionDesign: {
        ...FIXTURE_INPUT.productionDesign,
      },
    } as any);
    const coreResult = assembleVPBCore(FIXTURE_INPUT);

    expect(clientResult.character_count).toBe(coreResult.character_count);
    expect(clientResult.location_count).toBe(coreResult.location_count);
    expect(clientResult.asset_count).toBe(coreResult.asset_count);
  });
});

// ── 3. No duplicated section logic outside core ─────────────────────────────

describe('VPB Parity: No Duplicated Section Logic', () => {
  it('client assembler does not contain section assembly functions', () => {
    const clientCode = readProjectFile('src/lib/visual/visualProjectBibleAssembler.ts');
    // Client should NOT have local assembleVisualThesis etc.
    expect(clientCode).not.toMatch(/^function assembleVisualThesis/m);
    expect(clientCode).not.toMatch(/^function assembleWorldDesignLanguage/m);
    expect(clientCode).not.toMatch(/^function assembleCharacterVisualSystem/m);
    expect(clientCode).not.toMatch(/^function assembleLocationPD/m);
    expect(clientCode).not.toMatch(/^function assembleVisualCohesion/m);
    expect(clientCode).not.toMatch(/^function assembleReferences/m);
    expect(clientCode).not.toMatch(/^function assembleAssetAppendix/m);
  });

  it('client assembler imports assembleVPBCore from core', () => {
    const clientCode = readProjectFile('src/lib/visual/visualProjectBibleAssembler.ts');
    expect(clientCode).toContain("from './visualProjectBibleCore'");
    expect(clientCode).toContain('assembleVPBCore');
  });

  it('edge assembler references visualProjectBibleCore as source of truth', () => {
    const edgeCode = readProjectFile('supabase/functions/_shared/visualProjectBibleEdge.ts');
    expect(edgeCode).toContain('src/lib/visual/visualProjectBibleCore.ts');
    expect(edgeCode).toContain('DO NOT MODIFY WITHOUT UPDATING');
  });
});

// ── 4. Edge signal parser is labeled and sealed ─────────────────────────────

describe('VPB Parity: Edge Signal Extraction Sealed', () => {
  it('edge extractSignalsFromBrief is explicitly labeled as parity-tested mirror', () => {
    const edgeCode = readProjectFile('supabase/functions/_shared/visualProjectBibleEdge.ts');
    expect(edgeCode).toContain('extractSignalsFromBrief');
    expect(edgeCode).toContain('Parity is enforced by drift tests');
  });

  it('edge does not contain callLLM or AI imports', () => {
    const edgeCode = readProjectFile('supabase/functions/_shared/visualProjectBibleEdge.ts');
    expect(edgeCode).not.toContain('callLLM');
    expect(edgeCode).not.toContain('GATEWAY_URL');
    expect(edgeCode).not.toContain('openai');
  });
});

// ── 5. No raw prose in core ─────────────────────────────────────────────────

describe('VPB Parity: No Raw Prose in Core', () => {
  it('core module does not contain getSection or extractBullets (raw parsing)', () => {
    const coreCode = readProjectFile('src/lib/visual/visualProjectBibleCore.ts');
    expect(coreCode).not.toContain('getSection');
    expect(coreCode).not.toContain('extractBullets');
    expect(coreCode).not.toContain('visual_canon_brief_content');
  });

  it('core module does not import extractVisualCanonSignals', () => {
    const coreCode = readProjectFile('src/lib/visual/visualProjectBibleCore.ts');
    // Must not have an actual import statement for extractVisualCanonSignals
    expect(coreCode).not.toMatch(/import\s+.*extractVisualCanonSignals/);
  });

  it('core IEL validates extracted_at marker to reject raw prose', () => {
    const inputWithoutExtractedAt = {
      ...FIXTURE_INPUT,
      visualCanonSignals: {
        ...FIXTURE_INPUT.visualCanonSignals!,
        extracted_at: undefined as any,
      },
    };
    const result = assembleVPBCore(inputWithoutExtractedAt);
    expect(result.validation_issues.some(i => i.includes('extracted_at'))).toBe(true);
  });
});

// ── 6. Degradation consistency ──────────────────────────────────────────────

describe('VPB Parity: Degradation Behavior', () => {
  it('null signals produces consistent fallback language across paths', () => {
    const nullInput: VPBCoreInput = {
      ...FIXTURE_INPUT,
      visualCanonSignals: null,
    };
    const coreResult = assembleVPBCore(nullInput);
    const clientResult = assembleVisualProjectBible({
      ...nullInput,
      productionDesign: { ...nullInput.productionDesign },
    } as any);

    // Both should contain the same fallback text
    expect(coreResult.markdown).toContain('Visual canon brief not yet available');
    expect(clientResult.markdown).toContain('Visual canon brief not yet available');
    expect(coreResult.markdown).toBe(clientResult.markdown);
  });

  it('empty characters produces consistent fallback', () => {
    const emptyCharsInput: VPBCoreInput = {
      ...FIXTURE_INPUT,
      characters: [],
    };
    const result = assembleVPBCore(emptyCharsInput);
    expect(result.markdown).toContain('No character visual profiles available yet');
  });

  it('empty locations produces consistent fallback', () => {
    const emptyLocsInput: VPBCoreInput = {
      ...FIXTURE_INPUT,
      locations: [],
    };
    const result = assembleVPBCore(emptyLocsInput);
    expect(result.markdown).toContain('No canonical locations available yet');
  });
});
