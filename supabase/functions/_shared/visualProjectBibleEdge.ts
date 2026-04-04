/**
 * visualProjectBibleEdge.ts — Edge-side THIN WRAPPER for visual_project_bible.
 *
 * ═══ VISUAL AUTHORITY BOUNDARY ═══
 * ARCHITECTURE:
 *   This is a THIN WRAPPER. It does NOT own section-construction logic.
 *   All section assembly is delegated to the shared VPB assembly core
 *   (inlined from visualProjectBibleCore.ts — same canonical logic).
 *
 *   This wrapper is responsible ONLY for:
 *   - Retrieving inputs from DB (canon_json, characters, locations, assets)
 *   - Extracting structured signals via canonical extraction
 *   - Building VPBCoreInput from DB data
 *   - Calling the shared assembly core
 *   - Adding blocker diagnostics for missing DB inputs
 *
 * FORBIDDEN:
 *   - Owning section-construction logic (owned by shared core)
 *   - Forking output semantics or heading construction
 *   - LLM calls
 *   - Inventing missing truth
 *
 * SIGNAL EXTRACTION:
 *   The edge uses extractSignalsFromBrief() which is a lightweight structured
 *   parser identical in contract to the client extractVisualCanonSignals().
 *   This is the ONLY acceptable extraction path on the edge.
 *   The parser is sealed here because edge functions cannot import client modules.
 *   Parity is enforced by drift tests in visualVPBParity.test.ts.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ══════════════════════════════════════════════════════════════════════════════
// SHARED CORE TYPES — Canonical contract from visualProjectBibleCore.ts
// These MUST remain identical to the source-of-truth types.
// Drift is enforced by parity tests.
// ══════════════════════════════════════════════════════════════════════════════

interface VPBApprovedAssetRef {
  asset_id: string;
  public_url: string;
  asset_group: string;
  entity_name: string;
  entity_type: 'character' | 'location' | 'world' | 'motif' | 'hero_frame';
  approval_status: 'approved' | 'locked' | 'current';
}

interface VPBCharacterVisualSummary {
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

interface VPBLocationVisualSummary {
  location_name: string;
  location_id: string;
  description: string;
  material_palette: string[];
  architecture_style: string;
  environment_rules: string[];
  approved_assets: VPBApprovedAssetRef[];
}

interface VPBProductionDesign {
  material_palette: string[];
  architecture_style: string;
  environment_rules: string[];
  enrichment_applied?: boolean;
}

interface VPBVisualCanonSignals {
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
  contrast_rules: Array<{ axis: string; pole_a: string; pole_b: string; visual_expression?: string }>;
  source_version_id?: string | null;
  extracted_at: string;
}

interface VPBCoreInput {
  project_title: string;
  project_id: string;
  visualCanonSignals: VPBVisualCanonSignals | null;
  productionDesign: VPBProductionDesign;
  characters: VPBCharacterVisualSummary[];
  locations: VPBLocationVisualSummary[];
  approvedAssets: VPBApprovedAssetRef[];
  assembled_at?: string;
}

interface VPBCoreResult {
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

// ══════════════════════════════════════════════════════════════════════════════
// SHARED ASSEMBLY CORE — Inlined from visualProjectBibleCore.ts
// This is NOT a fork. It is the same canonical logic, inlined because
// edge functions cannot import from src/. Parity is enforced by tests.
//
// ═══ DO NOT MODIFY SECTION LOGIC HERE WITHOUT UPDATING THE SOURCE ═══
// Source of truth: src/lib/visual/visualProjectBibleCore.ts
// ══════════════════════════════════════════════════════════════════════════════

const VPB_REQUIRED_SECTION_COUNT = 7;

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

function assembleVisualThesis(signals: VPBVisualCanonSignals | null, pd: VPBProductionDesign): string {
  const lines = ['# Visual Thesis', ''];
  if (signals) {
    if (signals.world_visual_identity) lines.push('## World Visual Identity', '', signals.world_visual_identity, '');
    if (signals.era_classification) lines.push(`**Temporal Grounding:** ${signals.era_classification}`, '');
    if (signals.cultural_grounding) lines.push(`**Cultural Context:** ${signals.cultural_grounding}`, '');
    if (signals.motifs.length > 0) {
      lines.push('## Key Motifs', '');
      for (const m of signals.motifs.slice(0, 6)) {
        lines.push(`- **${m.motif}** — ${m.meaning}${m.recurrence_pattern ? ` (${m.recurrence_pattern})` : ''}`);
      }
      lines.push('');
    }
    if (signals.exclusions.length > 0) {
      lines.push('## Visual Exclusions', '');
      for (const e of signals.exclusions) lines.push(`- ~~${e.excluded_element}~~ — ${e.reason}`);
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
  if (signals?.production_design_philosophy) lines.push('## Production Design Philosophy', '', signals.production_design_philosophy, '');
  lines.push('## Material & Texture System', '');
  if (signals && signals.materials.length > 0) {
    for (const m of signals.materials) {
      const charNote = m.associated_characters.length > 0 ? ` (${m.associated_characters.join(', ')})` : '';
      lines.push(`- **${m.material}** — ${m.narrative_role}${charNote}`);
    }
  } else {
    for (const mat of pd.material_palette) lines.push(`- ${mat}`);
  }
  lines.push('');
  if (signals && signals.class_expression_rules.length > 0) {
    lines.push('## Class & Labor Expression', '');
    for (const r of signals.class_expression_rules) lines.push(`- ${r}`);
    lines.push('');
  }
  if (signals && signals.contrast_rules.length > 0) {
    lines.push('## Contrast Rules', '');
    for (const c of signals.contrast_rules) lines.push(`- **${c.axis}:** ${c.pole_a} vs ${c.pole_b}${c.visual_expression ? ` — ${c.visual_expression}` : ''}`);
    lines.push('');
  }
  lines.push('## Environment Rules', '');
  for (const r of pd.environment_rules) lines.push(`- ${r}`);
  lines.push('', `**Architecture Style:** ${pd.architecture_style}`, '');
  return lines.join('\n');
}

function assembleCharacterVisualSystem(characters: VPBCharacterVisualSummary[]): string {
  const lines = ['# Character Visual System', ''];
  if (characters.length === 0) { lines.push('*No character visual profiles available yet.*', ''); return lines.join('\n'); }
  for (const char of characters) {
    lines.push(`## ${char.character_name}`, '');
    if (char.identity_summary) lines.push(`**Identity:** ${char.identity_summary}`, '');
    if (char.effective_garments.length > 0) lines.push(`**Wardrobe:** ${char.effective_garments.join(', ')}`, '');
    if (char.class_expression) lines.push(`**Class Expression:** ${char.class_expression}`, '');
    if (char.palette_logic) lines.push(`**Palette:** ${char.palette_logic}`, '');
    if (char.material_cues.length > 0) lines.push(`**Materials:** ${char.material_cues.join(', ')}`, '');
    if (char.state_count > 0) lines.push(`**Wardrobe States:** ${char.state_count}`, '');
    if (char.approved_assets.length > 0) lines.push(`**Approved Assets:** ${char.approved_assets.length} image(s)`, '');
    else lines.push('*No approved character assets yet.*', '');
    lines.push('---', '');
  }
  return lines.join('\n');
}

function assembleLocationPD(locations: VPBLocationVisualSummary[]): string {
  const lines = ['# Location & Production Design', ''];
  if (locations.length === 0) { lines.push('*No canonical locations available yet.*', ''); return lines.join('\n'); }
  for (const loc of locations) {
    lines.push(`## ${loc.location_name}`, '');
    if (loc.description) lines.push(loc.description, '');
    if (loc.material_palette.length > 0) lines.push(`**Materials:** ${loc.material_palette.join(', ')}`, '');
    lines.push(`**Architecture:** ${loc.architecture_style}`, '');
    if (loc.environment_rules.length > 0) {
      lines.push('**Environment Rules:**', '');
      for (const r of loc.environment_rules) lines.push(`- ${r}`);
      lines.push('');
    }
    if (loc.approved_assets.length > 0) lines.push(`**Approved Assets:** ${loc.approved_assets.length} image(s)`, '');
    else lines.push('*No approved location assets yet.*', '');
    lines.push('---', '');
  }
  return lines.join('\n');
}

function assembleVisualCohesion(signals: VPBVisualCanonSignals | null, characters: VPBCharacterVisualSummary[], pd: VPBProductionDesign): string {
  const lines = ['# Visual Cohesion & Recurrence', ''];
  if (signals && signals.motifs.length > 0) {
    lines.push('## Recurring Motifs', '');
    for (const m of signals.motifs) lines.push(`- **${m.motif}** — ${m.meaning}`);
    lines.push('');
  }
  const allCharMaterials = new Set(characters.flatMap(c => c.material_cues.map(m => m.toLowerCase())));
  const pdMaterials = new Set(pd.material_palette.map(m => m.toLowerCase()));
  const shared = [...allCharMaterials].filter(m => pdMaterials.has(m));
  if (shared.length > 0) {
    lines.push('## Shared Materials (Character ∩ World)', '');
    for (const m of shared) lines.push(`- ${m}`);
    lines.push('');
  }
  if (signals && signals.contrast_rules.length > 0) {
    lines.push('## Contrast Structure', '');
    for (const c of signals.contrast_rules) lines.push(`- ${c.axis}: ${c.pole_a} vs ${c.pole_b}`);
    lines.push('');
  }
  if (lines.length <= 2) lines.push('*Cohesion analysis requires visual canon signals and character profiles.*', '');
  return lines.join('\n');
}

function assembleReferences(signals: VPBVisualCanonSignals | null): string {
  const lines = ['# References & Direction', ''];
  if (!signals || signals.cinematic_references.length === 0) { lines.push('*No cinematic references available yet.*', ''); return lines.join('\n'); }
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
  for (const a of assets) { const group = byType.get(a.entity_type) || []; group.push(a); byType.set(a.entity_type, group); }
  for (const [type, typeAssets] of byType) {
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)} Assets`, '');
    lines.push(`${typeAssets.length} approved asset(s)`, '');
    for (const a of typeAssets.slice(0, 20)) lines.push(`- ${a.entity_name} (${a.approval_status}) — ${a.asset_group}`);
    if (typeAssets.length > 20) lines.push(`- ... and ${typeAssets.length - 20} more`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * assembleVPBCoreEdge — Shared assembly core (edge-inlined copy).
 *
 * ═══ DO NOT MODIFY WITHOUT UPDATING src/lib/visual/visualProjectBibleCore.ts ═══
 * Parity enforced by visualVPBParity.test.ts
 */
function assembleVPBCoreEdge(input: VPBCoreInput): VPBCoreResult {
  const assembledAt = input.assembled_at || new Date().toISOString();
  const validationIssues: string[] = [];
  const inputIssues = validateCoreInputs(input);
  validationIssues.push(...inputIssues);

  const sections: Array<{ key: string; content: string }> = [
    { key: 'visual_thesis', content: assembleVisualThesis(input.visualCanonSignals, input.productionDesign) },
    { key: 'world_and_design_language', content: assembleWorldDesignLanguage(input.visualCanonSignals, input.productionDesign) },
    { key: 'character_visual_system', content: assembleCharacterVisualSystem(input.characters) },
    { key: 'location_production_design', content: assembleLocationPD(input.locations) },
    { key: 'visual_cohesion_and_recurrence', content: assembleVisualCohesion(input.visualCanonSignals, input.characters, input.productionDesign) },
    { key: 'references_and_direction', content: assembleReferences(input.visualCanonSignals) },
    { key: 'asset_appendix', content: assembleAssetAppendix(input.approvedAssets) },
  ];

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
  const sectionsPresent = sections.map(s => s.key);

  return {
    markdown,
    sections_present: sectionsPresent,
    sections_absent: [],
    character_count: input.characters.length,
    location_count: input.locations.length,
    asset_count: input.approvedAssets.length,
    assembled_at: assembledAt,
    is_complete: sectionsPresent.length >= VPB_REQUIRED_SECTION_COUNT,
    validation_issues: validationIssues,
    visual_canon_signals_available: !!input.visualCanonSignals,
    generation_method: 'deterministic_assembly',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// EDGE-LOCAL SIGNAL EXTRACTION
// This is the ONLY signal extraction path on the edge.
// It mirrors extractVisualCanonSignals from the client.
// Parity is enforced by drift tests.
// ══════════════════════════════════════════════════════════════════════════════

const VISUAL_CANON_BRIEF_CANON_KEY = 'visual_canon_brief_content';

function extractSignalsFromBrief(markdown: string): VPBVisualCanonSignals | null {
  if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) return null;

  const getSection = (heading: string): string => {
    const pattern = new RegExp(`^#\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
    const match = markdown.match(pattern);
    if (!match || match.index === undefined) return '';
    const start = markdown.indexOf('\n', match.index);
    if (start === -1) return '';
    const nextHeading = markdown.slice(start + 1).search(/^#\s/m);
    const end = nextHeading >= 0 ? start + 1 + nextHeading : markdown.length;
    return markdown.slice(start + 1, end).trim();
  };

  const extractBullets = (text: string): string[] =>
    text.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean);

  const worldVis = getSection('Visual World Overview');
  const eraSec = getSection('Era & Temporal Classification');
  const costumeSec = getSection('Costume Philosophy');
  const pdSec = getSection('Production Design Philosophy');
  const materialSec = getSection('Material System');
  const paletteSec = getSection('Palette Logic');
  const motifSec = getSection('Motifs & Visual Recurrence');
  const exclusionSec = getSection('Visual Exclusions');
  const refSec = getSection('Cinematic & Visual References');

  const materials = extractBullets(materialSec).map(m => ({
    material: m.split('—')[0]?.replace(/\*\*/g, '').trim() || m,
    narrative_role: m.split('—')[1]?.trim() || '',
    associated_characters: [] as string[],
  }));

  const palettes = extractBullets(paletteSec).map(p => ({
    palette_name: p.split('—')[0]?.replace(/\*\*/g, '').trim() || p,
    hex_values: (p.match(/#[0-9a-fA-F]{6}/g) || []),
    usage_context: p.split('—')[1]?.trim() || '',
  }));

  const motifs = extractBullets(motifSec).map(m => ({
    motif: m.split('—')[0]?.replace(/\*\*/g, '').trim() || m,
    meaning: m.split('—')[1]?.trim() || '',
  }));

  const exclusions = extractBullets(exclusionSec).map(e => ({
    excluded_element: e.split('—')[0]?.replace(/~~/g, '').replace(/\*\*/g, '').trim() || e,
    reason: e.split('—')[1]?.trim() || '',
  }));

  const refs = extractBullets(refSec).map(r => ({
    title: r.split('—')[0]?.replace(/\*\*/g, '').trim() || r,
    relevance: r.split('—')[1]?.trim() || '',
  }));

  return {
    world_visual_identity: worldVis,
    era_classification: eraSec.split('\n')[0]?.trim() || '',
    cultural_grounding: '',
    costume_philosophy: costumeSec,
    production_design_philosophy: pdSec,
    materials,
    palettes,
    motifs,
    exclusions,
    cinematic_references: refs,
    class_expression_rules: [],
    contrast_rules: [],
    extracted_at: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// EDGE WRAPPER — DB INPUT RETRIEVAL + SHARED CORE DELEGATION
// ══════════════════════════════════════════════════════════════════════════════

export interface VPBBlocker {
  blocker: string;
  detail: string;
  severity: 'hard' | 'soft';
}

export interface VPBAssemblyResult {
  markdown: string;
  blockers: VPBBlocker[];
  sections_present: string[];
  character_count: number;
  location_count: number;
  asset_count: number;
  assembled_at: string;
  generation_method: 'deterministic_assembly';
  visual_canon_signals_available: boolean;
  is_complete: boolean;
}

/**
 * assembleVisualProjectBibleFromDB — Edge wrapper.
 *
 * ═══ VISUAL AUTHORITY BOUNDARY ═══
 * This wrapper:
 *   1. Retrieves inputs from DB
 *   2. Extracts structured signals via canonical extraction
 *   3. Builds VPBCoreInput
 *   4. Delegates ALL section assembly to assembleVPBCoreEdge()
 *   5. Adds blocker diagnostics for missing inputs
 *
 * It MUST NOT duplicate section logic or fork output semantics.
 */
export async function assembleVisualProjectBibleFromDB(
  supabase: SupabaseClient,
  projectId: string,
  projectTitle: string,
): Promise<VPBAssemblyResult> {
  const blockers: VPBBlocker[] = [];
  const assembledAt = new Date().toISOString();

  // ── 1. Retrieve canon JSON ──
  const { data: canonRow, error: canonErr } = await supabase
    .from('project_canon')
    .select('canon_json')
    .eq('project_id', projectId)
    .maybeSingle();

  const canonJson = canonRow?.canon_json as Record<string, unknown> | null;
  if (canonErr || !canonJson) {
    blockers.push({
      blocker: 'no_project_canon',
      detail: 'No project canon available — visual project bible cannot be assembled',
      severity: 'hard',
    });
  }

  // ── 2. Extract visual canon signals (canonical path) ──
  let signals: VPBVisualCanonSignals | null = null;
  if (canonJson) {
    const raw = canonJson[VISUAL_CANON_BRIEF_CANON_KEY];
    if (!raw || typeof raw !== 'string' || (raw as string).trim().length === 0) {
      blockers.push({
        blocker: 'no_visual_canon_brief',
        detail: `Canon JSON does not contain '${VISUAL_CANON_BRIEF_CANON_KEY}' or it is empty — structured visual signals unavailable`,
        severity: 'soft',
      });
    } else {
      signals = extractSignalsFromBrief(raw as string);
      if (!signals) {
        blockers.push({
          blocker: 'signal_extraction_failed',
          detail: 'Visual canon brief content could not be parsed into structured signals',
          severity: 'soft',
        });
      }
    }
  }

  // ── 3. Resolve production design from canon ──
  const pd: VPBProductionDesign = {
    material_palette: [],
    architecture_style: 'Not specified',
    environment_rules: [],
    enrichment_applied: false,
  };

  if (canonJson) {
    const pdData = canonJson.production_design as Record<string, unknown> | undefined;
    if (pdData) {
      pd.material_palette = Array.isArray(pdData.material_palette) ? pdData.material_palette as string[] : [];
      pd.architecture_style = typeof pdData.architecture_style === 'string' ? pdData.architecture_style : 'Not specified';
      pd.environment_rules = Array.isArray(pdData.environment_rules) ? pdData.environment_rules as string[] : [];
      pd.enrichment_applied = !!pdData.enrichment_applied;
    } else {
      blockers.push({
        blocker: 'no_production_design',
        detail: 'No production design truth in canon JSON — PD sections will use defaults',
        severity: 'soft',
      });
    }
  }

  // ── 4. Resolve character visual summaries ──
  const characters: VPBCharacterVisualSummary[] = [];
  if (canonJson) {
    const profiles = canonJson.character_wardrobe_profiles as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(profiles) && profiles.length > 0) {
      for (const p of profiles) {
        characters.push({
          character_name: String(p.character_name || 'Unknown'),
          character_key: String(p.character_id_or_key || ''),
          identity_summary: String(p.wardrobe_identity_summary || p.effective_identity_summary || ''),
          effective_garments: Array.isArray(p.effective_signature_garments)
            ? p.effective_signature_garments as string[]
            : (Array.isArray(p.signature_garments) ? p.signature_garments as string[] : []),
          class_expression: String(p.class_expression || ''),
          palette_logic: String(p.palette_logic || ''),
          material_cues: Array.isArray(p.material_cues) ? p.material_cues as string[] : [],
          state_count: typeof p.state_count === 'number' ? p.state_count : 0,
          approved_assets: [],
        });
      }
    } else {
      blockers.push({
        blocker: 'no_character_profiles',
        detail: 'No character wardrobe profiles in canon — character section will be empty',
        severity: 'soft',
      });
    }
  }

  // ── 5. Retrieve canon locations ──
  const locations: VPBLocationVisualSummary[] = [];
  const { data: locRows } = await supabase
    .from('canon_locations')
    .select('id, canonical_name, description, location_type')
    .eq('project_id', projectId)
    .eq('active', true)
    .order('story_importance', { ascending: false })
    .limit(20);

  if (locRows && locRows.length > 0) {
    for (const loc of locRows) {
      locations.push({
        location_name: loc.canonical_name,
        location_id: loc.id,
        description: loc.description || '',
        material_palette: pd.material_palette,
        architecture_style: pd.architecture_style,
        environment_rules: pd.environment_rules,
        approved_assets: [],
      });
    }
  } else {
    blockers.push({
      blocker: 'no_canon_locations',
      detail: 'No active canon locations found — location section will be empty',
      severity: 'soft',
    });
  }

  // ── 6. Retrieve approved assets ──
  const approvedAssets: VPBApprovedAssetRef[] = [];
  const { data: assetRows } = await supabase
    .from('visual_set_slots')
    .select('id, slot_key, state, selected_image_id, visual_set_id')
    .eq('state', 'approved')
    .limit(100);

  if (assetRows && assetRows.length > 0) {
    for (const a of assetRows) {
      approvedAssets.push({
        asset_id: a.id,
        public_url: '',
        asset_group: a.slot_key || 'unknown',
        entity_name: a.slot_key || 'unknown',
        entity_type: 'world',
        approval_status: 'approved',
      });
    }
  }

  // ── 7. Check hard blockers ──
  const hasHardBlocker = blockers.some(b => b.severity === 'hard');
  if (hasHardBlocker) {
    const blockerSummary = blockers.filter(b => b.severity === 'hard').map(b => b.detail).join('; ');
    return {
      markdown: `# Visual Project Bible — ${projectTitle}\n\n**Assembly blocked:** ${blockerSummary}\n\nResolve the above blockers and retry generation.`,
      blockers,
      sections_present: [],
      character_count: 0,
      location_count: 0,
      asset_count: 0,
      assembled_at: assembledAt,
      generation_method: 'deterministic_assembly',
      visual_canon_signals_available: false,
      is_complete: false,
    };
  }

  // ── 8. Delegate to shared assembly core ──
  const coreInput: VPBCoreInput = {
    project_title: projectTitle,
    project_id: projectId,
    visualCanonSignals: signals,
    productionDesign: pd,
    characters,
    locations,
    approvedAssets,
    assembled_at: assembledAt,
  };

  const coreResult = assembleVPBCoreEdge(coreInput);

  // ── 9. Log soft blockers ──
  for (const b of blockers) {
    console.warn(`[visual_project_bible] ${b.severity}: ${b.blocker} — ${b.detail}`);
  }

  return {
    markdown: coreResult.markdown,
    blockers,
    sections_present: coreResult.sections_present,
    character_count: coreResult.character_count,
    location_count: coreResult.location_count,
    asset_count: coreResult.asset_count,
    assembled_at: coreResult.assembled_at,
    generation_method: 'deterministic_assembly',
    visual_canon_signals_available: coreResult.visual_canon_signals_available,
    is_complete: coreResult.is_complete,
  };
}
