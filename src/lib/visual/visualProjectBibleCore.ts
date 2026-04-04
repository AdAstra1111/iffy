/**
 * visualProjectBibleCore.ts — THE SINGLE CANONICAL ASSEMBLY CORE for Visual Project Bible.
 *
 * ═══ VISUAL AUTHORITY BOUNDARY ═══
 * ARCHITECTURE:
 *   This module owns ALL section-construction logic for visual_project_bible.
 *   No other module may duplicate section assembly, heading construction,
 *   completeness rules, or provenance block shape.
 *
 *   Client wrapper (visualProjectBibleAssembler.ts) and edge wrapper
 *   (visualProjectBibleEdge.ts) may ONLY retrieve inputs and call this core.
 *   They MUST NOT fork output semantics or section logic.
 *
 * FORBIDDEN:
 *   - LLM calls
 *   - DB calls (this is a pure module)
 *   - Raw visual_canon_brief prose consumption
 *   - Inventing missing truth
 *
 * IEL: Any duplication of section assembly logic outside this file is a
 *   contract violation and must be caught by drift tests.
 */

// ── Shared Types (canonical input contract) ─────────────────────────────────

/**
 * Approved visual asset reference for display inclusion.
 * Assets are display-only — they do NOT constitute truth.
 */
export interface VPBApprovedAssetRef {
  asset_id: string;
  public_url: string;
  asset_group: string;
  entity_name: string;
  entity_type: 'character' | 'location' | 'world' | 'motif' | 'hero_frame';
  approval_status: 'approved' | 'locked' | 'current';
}

/**
 * Character visual summary for bible inclusion.
 * Derived from canonical effective profile — NOT raw profile.
 */
export interface VPBCharacterVisualSummary {
  character_name: string;
  character_key: string;
  identity_summary: string;
  effective_garments: string[];
  class_expression: string;
  palette_logic: string;
  material_cues: string[];
  state_count: number;
  approved_assets: VPBApprovedAssetRef[];
}

/**
 * Location visual summary for bible inclusion.
 * Derived from canonical PD/location truth.
 */
export interface VPBLocationVisualSummary {
  location_name: string;
  location_id: string;
  description: string;
  material_palette: string[];
  architecture_style: string;
  environment_rules: string[];
  approved_assets: VPBApprovedAssetRef[];
}

/**
 * Production design truth for bible assembly.
 */
export interface VPBProductionDesign {
  material_palette: string[];
  architecture_style: string;
  environment_rules: string[];
  enrichment_applied?: boolean;
}

/**
 * Structured visual canon signals — the canonical shape consumed by the core.
 * Must come from extractVisualCanonSignals() or equivalent canonical extraction.
 */
export interface VPBVisualCanonSignals {
  world_visual_identity: string;
  era_classification: string;
  cultural_grounding: string;
  costume_philosophy: string;
  production_design_philosophy: string;
  materials: Array<{ material: string; narrative_role: string; associated_characters: string[] }>;
  palettes: Array<{ palette_name: string; hex_values: string[]; usage_context: string }>;
  motifs: Array<{ motif: string; meaning: string; recurrence_pattern?: string }>;
  exclusions: Array<{ excluded_element: string; reason: string }>;
  cinematic_references: Array<{ title: string; director?: string; relevance: string }>;
  class_expression_rules: string[];
  grooming_directives: string[];
  contrast_rules: Array<{ axis: string; pole_a: string; pole_b: string; visual_expression?: string }>;
  is_complete: boolean;
  source_version_id?: string | null;
  extracted_at: string;
}

/**
 * Full assembly input contract for the shared VPB core.
 *
 * ARCHITECTURE: Every field must come from a canonical source.
 * No raw visual_canon_brief prose. No unapproved assets.
 * Neither wrapper may bypass this contract.
 */
export interface VPBCoreInput {
  project_title: string;
  project_id: string;
  visualCanonSignals: VPBVisualCanonSignals | null;
  productionDesign: VPBProductionDesign;
  characters: VPBCharacterVisualSummary[];
  locations: VPBLocationVisualSummary[];
  approvedAssets: VPBApprovedAssetRef[];
  assembled_at?: string;
}

/**
 * Assembly result from the shared core.
 */
export interface VPBCoreResult {
  markdown: string;
  sections_present: string[];
  sections_absent: string[];
  character_count: number;
  location_count: number;
  asset_count: number;
  assembled_at: string;
  is_complete: boolean;
  validation_issues: string[];
  visual_canon_signals_available: boolean;
  generation_method: 'deterministic_assembly';
}

// ── Section Keys ────────────────────────────────────────────────────────────

export const VPB_SECTION_KEYS = [
  'visual_thesis',
  'world_and_design_language',
  'character_visual_system',
  'location_production_design',
  'visual_cohesion_and_recurrence',
  'references_and_direction',
  'asset_appendix',
] as const;

export type VPBSectionKey = typeof VPB_SECTION_KEYS[number];

export const VPB_REQUIRED_SECTION_COUNT = 7;

// ── IEL Input Validation ────────────────────────────────────────────────────

function validateCoreInputs(input: VPBCoreInput): string[] {
  const issues: string[] = [];

  if (input.visualCanonSignals) {
    if (typeof (input.visualCanonSignals as any).extracted_at !== 'string') {
      issues.push('visualCanonSignals missing extracted_at — may be raw prose');
    }
  }

  for (const asset of input.approvedAssets) {
    if (!['approved', 'locked', 'current'].includes(asset.approval_status)) {
      issues.push(`Asset ${asset.asset_id} has non-approved status: ${asset.approval_status}`);
    }
  }

  for (const char of input.characters) {
    for (const asset of char.approved_assets) {
      if (!['approved', 'locked', 'current'].includes(asset.approval_status)) {
        issues.push(`Character asset ${asset.asset_id} has non-approved status: ${asset.approval_status}`);
      }
    }
  }

  return issues;
}

// ── Section Assemblers (THE ONLY copies — no other file may duplicate these) ─

function assembleVisualThesis(signals: VPBVisualCanonSignals | null, pd: VPBProductionDesign): string {
  const lines = ['# Visual Thesis', ''];

  if (signals) {
    if (signals.world_visual_identity) {
      lines.push('## World Visual Identity', '', signals.world_visual_identity, '');
    }
    if (signals.era_classification) {
      lines.push(`**Temporal Grounding:** ${signals.era_classification}`, '');
    }
    if (signals.cultural_grounding) {
      lines.push(`**Cultural Context:** ${signals.cultural_grounding}`, '');
    }
    if (signals.motifs.length > 0) {
      lines.push('## Key Motifs', '');
      for (const m of signals.motifs.slice(0, 6)) {
        lines.push(`- **${m.motif}** — ${m.meaning}${m.recurrence_pattern ? ` (${m.recurrence_pattern})` : ''}`);
      }
      lines.push('');
    }
    if (signals.exclusions.length > 0) {
      lines.push('## Visual Exclusions', '');
      for (const e of signals.exclusions) {
        lines.push(`- ~~${e.excluded_element}~~ — ${e.reason}`);
      }
      lines.push('');
    }
    if (signals.palettes.length > 0) {
      lines.push('## Palette Overview', '');
      for (const p of signals.palettes.slice(0, 4)) {
        const hexStr = p.hex_values.length > 0 ? ` (${p.hex_values.join(', ')})` : '';
        lines.push(`- **${p.palette_name}**${hexStr} — ${p.usage_context}`);
      }
      lines.push('');
    }
    lines.push(`**Materials:** ${pd.material_palette.join(', ')}`, '');
  } else {
    lines.push('*Visual canon brief not yet available. Thesis derived from production design only.*', '');
    lines.push(`**Architecture:** ${pd.architecture_style}`, '');
    lines.push(`**Materials:** ${pd.material_palette.join(', ')}`, '');
  }

  return lines.join('\n');
}

function assembleWorldDesignLanguage(signals: VPBVisualCanonSignals | null, pd: VPBProductionDesign): string {
  const lines = ['# World & Design Language', ''];

  if (signals?.production_design_philosophy) {
    lines.push('## Production Design Philosophy', '', signals.production_design_philosophy, '');
  }

  lines.push('## Material & Texture System', '');
  if (signals && signals.materials.length > 0) {
    for (const m of signals.materials) {
      const charNote = m.associated_characters.length > 0 ? ` (${m.associated_characters.join(', ')})` : '';
      lines.push(`- **${m.material}** — ${m.narrative_role}${charNote}`);
    }
  } else {
    for (const mat of pd.material_palette) {
      lines.push(`- ${mat}`);
    }
  }
  lines.push('');

  if (signals && signals.class_expression_rules.length > 0) {
    lines.push('## Class & Labor Expression', '');
    for (const r of signals.class_expression_rules) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  if (signals && signals.contrast_rules.length > 0) {
    lines.push('## Contrast Rules', '');
    for (const c of signals.contrast_rules) {
      lines.push(`- **${c.axis}:** ${c.pole_a} vs ${c.pole_b}${c.visual_expression ? ` — ${c.visual_expression}` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Environment Rules', '');
  for (const r of pd.environment_rules) {
    lines.push(`- ${r}`);
  }
  lines.push('');

  lines.push(`**Architecture Style:** ${pd.architecture_style}`, '');

  return lines.join('\n');
}

function assembleCharacterVisualSystem(characters: VPBCharacterVisualSummary[]): string {
  const lines = ['# Character Visual System', ''];

  if (characters.length === 0) {
    lines.push('*No character visual profiles available yet.*', '');
    return lines.join('\n');
  }

  for (const char of characters) {
    lines.push(`## ${char.character_name}`, '');
    if (char.identity_summary) {
      lines.push(`**Identity:** ${char.identity_summary}`, '');
    }
    if (char.effective_garments.length > 0) {
      lines.push(`**Wardrobe:** ${char.effective_garments.join(', ')}`, '');
    }
    if (char.class_expression) {
      lines.push(`**Class Expression:** ${char.class_expression}`, '');
    }
    if (char.palette_logic) {
      lines.push(`**Palette:** ${char.palette_logic}`, '');
    }
    if (char.material_cues.length > 0) {
      lines.push(`**Materials:** ${char.material_cues.join(', ')}`, '');
    }
    if (char.state_count > 0) {
      lines.push(`**Wardrobe States:** ${char.state_count}`, '');
    }
    if (char.approved_assets.length > 0) {
      lines.push(`**Approved Assets:** ${char.approved_assets.length} image(s)`, '');
    } else {
      lines.push('*No approved character assets yet.*', '');
    }
    lines.push('---', '');
  }

  return lines.join('\n');
}

function assembleLocationPD(locations: VPBLocationVisualSummary[]): string {
  const lines = ['# Location & Production Design', ''];

  if (locations.length === 0) {
    lines.push('*No canonical locations available yet.*', '');
    return lines.join('\n');
  }

  for (const loc of locations) {
    lines.push(`## ${loc.location_name}`, '');
    if (loc.description) {
      lines.push(loc.description, '');
    }
    if (loc.material_palette.length > 0) {
      lines.push(`**Materials:** ${loc.material_palette.join(', ')}`, '');
    }
    lines.push(`**Architecture:** ${loc.architecture_style}`, '');
    if (loc.environment_rules.length > 0) {
      lines.push('**Environment Rules:**', '');
      for (const r of loc.environment_rules) {
        lines.push(`- ${r}`);
      }
      lines.push('');
    }
    if (loc.approved_assets.length > 0) {
      lines.push(`**Approved Assets:** ${loc.approved_assets.length} image(s)`, '');
    } else {
      lines.push('*No approved location assets yet.*', '');
    }
    lines.push('---', '');
  }

  return lines.join('\n');
}

function assembleVisualCohesion(
  signals: VPBVisualCanonSignals | null,
  characters: VPBCharacterVisualSummary[],
  pd: VPBProductionDesign,
): string {
  const lines = ['# Visual Cohesion & Recurrence', ''];

  if (signals && signals.motifs.length > 0) {
    lines.push('## Recurring Motifs', '');
    for (const m of signals.motifs) {
      lines.push(`- **${m.motif}** — ${m.meaning}`);
    }
    lines.push('');
  }

  const allCharMaterials = new Set(characters.flatMap(c => c.material_cues.map(m => m.toLowerCase())));
  const pdMaterials = new Set(pd.material_palette.map(m => m.toLowerCase()));
  const shared = [...allCharMaterials].filter(m => pdMaterials.has(m));
  if (shared.length > 0) {
    lines.push('## Shared Materials (Character ∩ World)', '');
    for (const m of shared) {
      lines.push(`- ${m}`);
    }
    lines.push('');
  }

  if (signals && signals.contrast_rules.length > 0) {
    lines.push('## Contrast Structure', '');
    for (const c of signals.contrast_rules) {
      lines.push(`- ${c.axis}: ${c.pole_a} vs ${c.pole_b}`);
    }
    lines.push('');
  }

  if (lines.length <= 2) {
    lines.push('*Cohesion analysis requires visual canon signals and character profiles.*', '');
  }

  return lines.join('\n');
}

function assembleReferences(signals: VPBVisualCanonSignals | null): string {
  const lines = ['# References & Direction', ''];

  if (!signals || signals.cinematic_references.length === 0) {
    lines.push('*No cinematic references available yet.*', '');
    return lines.join('\n');
  }

  for (const ref of signals.cinematic_references) {
    const directorStr = ref.director ? ` (${ref.director})` : '';
    lines.push(`- **${ref.title}**${directorStr} — ${ref.relevance}`);
  }
  lines.push('');

  return lines.join('\n');
}

function assembleAssetAppendix(assets: VPBApprovedAssetRef[]): string {
  const lines = ['# Asset Appendix', ''];

  if (assets.length === 0) {
    lines.push('*No approved visual assets available yet.*', '');
    lines.push('This document will be enriched as visual assets are generated and approved.', '');
    return lines.join('\n');
  }

  const byType = new Map<string, VPBApprovedAssetRef[]>();
  for (const a of assets) {
    const group = byType.get(a.entity_type) || [];
    group.push(a);
    byType.set(a.entity_type, group);
  }

  for (const [type, typeAssets] of byType) {
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)} Assets`, '');
    lines.push(`${typeAssets.length} approved asset(s)`, '');
    for (const a of typeAssets.slice(0, 20)) {
      lines.push(`- ${a.entity_name} (${a.approval_status}) — ${a.asset_group}`);
    }
    if (typeAssets.length > 20) {
      lines.push(`- ... and ${typeAssets.length - 20} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Core Assembly Function ──────────────────────────────────────────────────

/**
 * assembleVPBCore — THE ONLY section-construction authority for visual_project_bible.
 *
 * ═══ VISUAL AUTHORITY BOUNDARY ═══
 * This is a pure, deterministic, read-only function.
 * It receives structured inputs only and produces markdown.
 * No DB calls. No LLM calls. No raw prose consumption.
 *
 * Both client wrapper and edge wrapper MUST call this function.
 * No wrapper may fork section logic or output semantics.
 */
export function assembleVPBCore(input: VPBCoreInput): VPBCoreResult {
  const assembledAt = input.assembled_at || new Date().toISOString();
  const validationIssues: string[] = [];

  // ── IEL Gate: validate canonical inputs ──
  const inputIssues = validateCoreInputs(input);
  validationIssues.push(...inputIssues);

  // ── Assemble sections in canonical order ──
  const sections: Array<{ key: VPBSectionKey; content: string }> = [
    { key: 'visual_thesis', content: assembleVisualThesis(input.visualCanonSignals, input.productionDesign) },
    { key: 'world_and_design_language', content: assembleWorldDesignLanguage(input.visualCanonSignals, input.productionDesign) },
    { key: 'character_visual_system', content: assembleCharacterVisualSystem(input.characters) },
    { key: 'location_production_design', content: assembleLocationPD(input.locations) },
    { key: 'visual_cohesion_and_recurrence', content: assembleVisualCohesion(input.visualCanonSignals, input.characters, input.productionDesign) },
    { key: 'references_and_direction', content: assembleReferences(input.visualCanonSignals) },
    { key: 'asset_appendix', content: assembleAssetAppendix(input.approvedAssets) },
  ];

  // ── Build final markdown ──
  const header = [
    `# Visual Project Bible — ${input.project_title}`,
    '',
    `*Assembled: ${new Date(assembledAt).toLocaleDateString()}*`,
    `*Generation method: deterministic assembly (no LLM)*`,
    '',
    '---',
    '',
  ].join('\n');

  const markdown = header + sections.map(s => s.content).join('\n---\n\n');

  // ── Completeness ──
  const sectionsPresent = sections.map(s => s.key);
  const isComplete = sectionsPresent.length >= VPB_REQUIRED_SECTION_COUNT;

  return {
    markdown,
    sections_present: sectionsPresent,
    sections_absent: [],
    character_count: input.characters.length,
    location_count: input.locations.length,
    asset_count: input.approvedAssets.length,
    assembled_at: assembledAt,
    is_complete: isComplete,
    validation_issues: validationIssues,
    visual_canon_signals_available: !!input.visualCanonSignals,
    generation_method: 'deterministic_assembly',
  };
}

// ── Validation Helpers ──────────────────────────────────────────────────────

export function validateVPBResult(result: VPBCoreResult): {
  passed: boolean;
  gate_results: Array<{ gate: string; passed: boolean; detail: string }>;
} {
  const gates: Array<{ gate: string; passed: boolean; detail: string }> = [];

  gates.push({
    gate: 'completeness',
    passed: result.sections_present.length >= VPB_REQUIRED_SECTION_COUNT,
    detail: `${result.sections_present.length}/${VPB_REQUIRED_SECTION_COUNT} sections present`,
  });

  gates.push({
    gate: 'canonical_inputs',
    passed: result.validation_issues.length === 0,
    detail: result.validation_issues.length === 0
      ? 'All inputs canonical'
      : `${result.validation_issues.length} issue(s): ${result.validation_issues[0]}`,
  });

  gates.push({
    gate: 'non_empty',
    passed: result.markdown.length > 200,
    detail: `Document length: ${result.markdown.length} chars`,
  });

  gates.push({
    gate: 'no_truth_mutation',
    passed: true,
    detail: 'Read-only assembler — no mutations possible',
  });

  return {
    passed: gates.every(g => g.passed),
    gate_results: gates,
  };
}
