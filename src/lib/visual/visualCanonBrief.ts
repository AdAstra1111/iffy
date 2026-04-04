/**
 * visualCanonBrief.ts — Canonical Visual Canon Brief types, extraction layer, and IEL guards.
 *
 * ARCHITECTURE:
 *   visual_canon_brief is a canonical upstream visual intent document.
 *   It MUST NOT be consumed directly by UI, prompt builders, or visual outputs.
 *   ALL downstream consumption MUST go through extractVisualCanonSignals().
 *
 * IEL: IMPOSSIBLE-TO-EDIT-LOCKED — fail closed on misuse.
 */

// ── Section Keys (12 required) ──────────────────────────────────────────────

export const VISUAL_CANON_BRIEF_SECTION_KEYS = [
  'visual_world_overview',
  'temporal_and_cultural_grounding',
  'costume_philosophy',
  'production_design_philosophy',
  'material_and_texture_system',
  'palette_logic',
  'class_and_labor_expression',
  'grooming_and_physicality',
  'motifs_and_symbolism',
  'contrast_rules',
  'visual_exclusions',
  'cinematic_references',
] as const;

export type VisualCanonBriefSectionKey = typeof VISUAL_CANON_BRIEF_SECTION_KEYS[number];

export const VISUAL_CANON_BRIEF_REQUIRED_COUNT = 12;

// ── VisualCanonSignals — strict typed extraction result ─────────────────────

export interface PaletteSignal {
  palette_name: string;
  hex_values: string[];
  usage_context: string;
}

export interface MaterialSignal {
  material: string;
  narrative_role: string;
  associated_characters: string[];
}

export interface MotifSignal {
  motif: string;
  meaning: string;
  recurrence_pattern: string;
}

export interface ContrastRule {
  axis: string;
  pole_a: string;
  pole_b: string;
  visual_expression: string;
}

export interface CinematicReference {
  title: string;
  director: string;
  relevance: string;
}

export interface VisualExclusion {
  excluded_element: string;
  reason: string;
}

export interface VisualCanonSignals {
  /** Era/period classification */
  era_classification: string;
  /** Cultural grounding context */
  cultural_grounding: string;
  /** World visual identity summary */
  world_visual_identity: string;
  /** Costume philosophy statement */
  costume_philosophy: string;
  /** Production design philosophy statement */
  production_design_philosophy: string;
  /** Extracted palette signals */
  palettes: PaletteSignal[];
  /** Material + texture signals */
  materials: MaterialSignal[];
  /** Class/labor visual expression rules */
  class_expression_rules: string[];
  /** Grooming/physicality directives */
  grooming_directives: string[];
  /** Motif signals */
  motifs: MotifSignal[];
  /** Contrast rules */
  contrast_rules: ContrastRule[];
  /** Visual exclusions (anti-patterns) */
  exclusions: VisualExclusion[];
  /** Cinematic references */
  cinematic_references: CinematicReference[];
  /** Extraction metadata */
  extracted_at: string;
  /** Source document version ID */
  source_version_id: string | null;
  /** Whether extraction is complete (all 12 sections present) */
  is_complete: boolean;
}

// ── Extraction ──────────────────────────────────────────────────────────────

/**
 * Parse a heading-delimited markdown document into section map.
 * Returns lowercase-normalized section keys mapped to prose content.
 */
function parseSectionsFromMarkdown(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = markdown.split('\n');
  let currentKey = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      if (currentKey) {
        sections.set(currentKey, currentContent.join('\n').trim());
      }
      currentKey = headingMatch[1]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentKey) {
    sections.set(currentKey, currentContent.join('\n').trim());
  }
  return sections;
}

/**
 * Extract bullet items from a markdown section.
 */
function extractBullets(text: string): string[] {
  return text
    .split('\n')
    .filter(l => /^\s*[-*]\s+/.test(l))
    .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
}

/**
 * Extract structured palette signals from palette_logic section.
 */
function extractPalettes(text: string): PaletteSignal[] {
  const palettes: PaletteSignal[] = [];
  const bullets = extractBullets(text);
  for (const b of bullets) {
    // Attempt to parse "Name: #hex1, #hex2 — context"
    const match = b.match(/^([^:]+):\s*([^—–-]+)\s*[—–-]\s*(.+)$/);
    if (match) {
      const hexes = match[2].match(/#[0-9a-fA-F]{3,8}/g) || [];
      palettes.push({
        palette_name: match[1].trim(),
        hex_values: hexes,
        usage_context: match[3].trim(),
      });
    } else {
      palettes.push({
        palette_name: b.slice(0, 40),
        hex_values: [],
        usage_context: b,
      });
    }
  }
  return palettes;
}

/**
 * Extract material signals from material_and_texture_system section.
 */
function extractMaterials(text: string): MaterialSignal[] {
  const bullets = extractBullets(text);
  return bullets.map(b => {
    const parts = b.split(/[—–-]/);
    return {
      material: (parts[0] || b).trim(),
      narrative_role: (parts[1] || '').trim(),
      associated_characters: [],
    };
  });
}

/**
 * Extract motif signals from motifs_and_symbolism section.
 */
function extractMotifs(text: string): MotifSignal[] {
  const bullets = extractBullets(text);
  return bullets.map(b => {
    const parts = b.split(/[—–-]/);
    return {
      motif: (parts[0] || b).trim(),
      meaning: (parts[1] || '').trim(),
      recurrence_pattern: (parts[2] || '').trim(),
    };
  });
}

/**
 * Extract contrast rules from contrast_rules section.
 */
function extractContrastRules(text: string): ContrastRule[] {
  const bullets = extractBullets(text);
  return bullets.map(b => {
    const parts = b.split(/[—–-]|vs\.?/i);
    return {
      axis: (parts[0] || b).trim(),
      pole_a: (parts[1] || '').trim(),
      pole_b: (parts[2] || '').trim(),
      visual_expression: (parts[3] || '').trim(),
    };
  });
}

/**
 * Extract visual exclusions from visual_exclusions section.
 */
function extractExclusions(text: string): VisualExclusion[] {
  const bullets = extractBullets(text);
  return bullets.map(b => {
    const parts = b.split(/[—–:]/);
    return {
      excluded_element: (parts[0] || b).trim(),
      reason: (parts.slice(1).join('—') || '').trim(),
    };
  });
}

/**
 * Extract cinematic references from cinematic_references section.
 */
function extractCinematicReferences(text: string): CinematicReference[] {
  const bullets = extractBullets(text);
  return bullets.map(b => {
    // Try "Title (Director) — relevance"
    const match = b.match(/^(.+?)\s*\(([^)]+)\)\s*[—–-]\s*(.+)$/);
    if (match) {
      return { title: match[1].trim(), director: match[2].trim(), relevance: match[3].trim() };
    }
    return { title: b.slice(0, 60), director: '', relevance: b };
  });
}

/**
 * Find a section by trying multiple key variations.
 */
function findSection(sections: Map<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const val = sections.get(c);
    if (val) return val;
  }
  return '';
}

/**
 * extractVisualCanonSignals — THE ONLY legal extraction path from visual_canon_brief.
 *
 * Interprets prose sections into structured, typed, deduplicated signals.
 * All downstream systems MUST use this function, not the raw document.
 *
 * IEL: This is the canonical extraction entrypoint.
 */
export function extractVisualCanonSignals(
  markdown: string,
  sourceVersionId?: string | null,
): VisualCanonSignals {
  const sections = parseSectionsFromMarkdown(markdown);

  // Check completeness — all 12 required sections must be present
  const presentKeys = new Set<string>();
  for (const required of VISUAL_CANON_BRIEF_SECTION_KEYS) {
    if (findSection(sections, required)) {
      presentKeys.add(required);
    }
  }
  const isComplete = presentKeys.size >= VISUAL_CANON_BRIEF_REQUIRED_COUNT;

  const worldText = findSection(sections, 'visual_world_overview', 'world_overview', 'visual_world');
  const temporalText = findSection(sections, 'temporal_and_cultural_grounding', 'temporal_cultural_grounding', 'temporal_grounding');
  const costumeText = findSection(sections, 'costume_philosophy');
  const pdText = findSection(sections, 'production_design_philosophy', 'pd_philosophy');
  const materialText = findSection(sections, 'material_and_texture_system', 'materials_and_textures', 'material_texture_system');
  const paletteText = findSection(sections, 'palette_logic', 'color_palette', 'palette');
  const classText = findSection(sections, 'class_and_labor_expression', 'class_labor_expression', 'class_expression');
  const groomingText = findSection(sections, 'grooming_and_physicality', 'grooming_physicality', 'grooming');
  const motifText = findSection(sections, 'motifs_and_symbolism', 'motifs_symbolism', 'motifs');
  const contrastText = findSection(sections, 'contrast_rules', 'contrasts');
  const exclusionText = findSection(sections, 'visual_exclusions', 'exclusions');
  const refText = findSection(sections, 'cinematic_references', 'references');

  // Extract era from temporal section — first non-empty line or summary
  const eraLines = temporalText.split('\n').filter(l => l.trim());
  const eraClassification = eraLines[0]?.replace(/^[-*]\s*/, '').trim() || '';

  return {
    era_classification: eraClassification,
    cultural_grounding: temporalText.split('\n').slice(1).join(' ').trim().slice(0, 500),
    world_visual_identity: worldText.slice(0, 800),
    costume_philosophy: costumeText.slice(0, 800),
    production_design_philosophy: pdText.slice(0, 800),
    palettes: extractPalettes(paletteText),
    materials: extractMaterials(materialText),
    class_expression_rules: extractBullets(classText),
    grooming_directives: extractBullets(groomingText),
    motifs: extractMotifs(motifText),
    contrast_rules: extractContrastRules(contrastText),
    exclusions: extractExclusions(exclusionText),
    cinematic_references: extractCinematicReferences(refText),
    extracted_at: new Date().toISOString(),
    source_version_id: sourceVersionId ?? null,
    is_complete: isComplete,
  };
}

// ── IEL Guard ───────────────────────────────────────────────────────────────

export type VisualCanonUsageContext =
  | 'extraction'        // ALLOWED: extractVisualCanonSignals
  | 'diagnostic'        // ALLOWED: dev/test inspection
  | 'ui_display'        // FORBIDDEN: direct prose display
  | 'prompt_builder'    // FORBIDDEN: direct prose in prompts
  | 'generation'        // FORBIDDEN: direct prose in generation
  | 'export';           // FORBIDDEN: direct prose in exports

const ALLOWED_CONTEXTS: ReadonlySet<VisualCanonUsageContext> = new Set([
  'extraction',
  'diagnostic',
]);

/**
 * assertVisualCanonUsage — IEL guard preventing direct consumption of
 * visual_canon_brief prose by downstream systems.
 *
 * ALLOWED: extraction, diagnostic
 * FORBIDDEN: ui_display, prompt_builder, generation, export
 *
 * Throws in all environments. Fail closed.
 */
export function assertVisualCanonUsage(context: VisualCanonUsageContext): void {
  if (!ALLOWED_CONTEXTS.has(context)) {
    const msg = `[IEL] VISUAL_CANON_BRIEF_DIRECT_CONSUMPTION_BLOCKED: context="${context}" — ` +
      `visual_canon_brief prose must be consumed ONLY through extractVisualCanonSignals(). ` +
      `Direct reads are forbidden for: ui_display, prompt_builder, generation, export.`;
    console.error(msg);
    throw new Error(msg);
  }
}

// ── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Validate that extracted signals are non-generic (anti-generic check).
 * Returns list of issues found.
 */
export function validateSignalsNonGeneric(signals: VisualCanonSignals): string[] {
  const issues: string[] = [];

  // Must have at least 1 exclusion
  if (signals.exclusions.length === 0) {
    issues.push('No visual exclusions defined — signals may be generic');
  }

  // Must have at least 1 contrast rule
  if (signals.contrast_rules.length === 0) {
    issues.push('No contrast rules defined — visual language may lack specificity');
  }

  // Must have at least 2 materials
  if (signals.materials.length < 2) {
    issues.push('Fewer than 2 material signals — texture system underspecified');
  }

  // Era classification must be non-empty
  if (!signals.era_classification) {
    issues.push('Era classification is empty');
  }

  // Costume philosophy must be substantive (>50 chars)
  if (signals.costume_philosophy.length < 50) {
    issues.push('Costume philosophy is too short to be meaningful');
  }

  // PD philosophy must be substantive
  if (signals.production_design_philosophy.length < 50) {
    issues.push('Production design philosophy is too short to be meaningful');
  }

  return issues;
}

/**
 * Validate document completeness — all 12 sections present and non-empty.
 */
export function validateDocumentCompleteness(markdown: string): {
  complete: boolean;
  present: string[];
  missing: string[];
} {
  const sections = parseSectionsFromMarkdown(markdown);
  const present: string[] = [];
  const missing: string[] = [];

  for (const key of VISUAL_CANON_BRIEF_SECTION_KEYS) {
    if (findSection(sections, key)) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  return { complete: missing.length === 0, present, missing };
}
