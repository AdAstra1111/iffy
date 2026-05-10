/**
 * sectionRegistry.ts — shared section definitions for concept_brief and other all-in-one documents.
 *
 * Lives in _shared so it can be imported by:
 * - dev-engine-v2 (Edge Function / Deno)
 * - Frontend TypeScript (via relative import from src/)
 *
 * Canonical source: supabase/functions/_shared/sectionRegistry.ts
 * Frontend mirror:    src/config/sectionRegistry.ts
 * (Keep them in sync — prefer editing _shared first, then copying to src/)
 */

export const CONCEPT_BRIEF_SECTIONS = [
  // ── Canonical sections (15) — used by parseSections + section-level rewrite ──
  { key: "logline",             label: "Logline",              dependencies: [] },
  { key: "genre",               label: "Genre",                dependencies: ["logline"] },
  { key: "subgenre",            label: "Subgenre",             dependencies: ["genre"] },
  { key: "premise",             label: "Premise",              dependencies: ["logline"] },
  { key: "protagonist",         label: "Protagonist",          dependencies: ["premise"] },
  { key: "opposition",          label: "Opposition",           dependencies: ["protagonist"] },
  { key: "key_relationships",   label: "Key Relationships",    dependencies: ["protagonist"] },
  { key: "world_building_notes",label: "World Building",       dependencies: ["premise"] },
  { key: "central_conflict",    label: "Central Conflict",     dependencies: ["opposition", "protagonist"] },
  { key: "stakes",              label: "Stakes",               dependencies: ["central_conflict"] },
  { key: "tone_and_style",      label: "Tone & Atmosphere",    dependencies: ["central_conflict"] },
  { key: "themes",              label: "Themes",               dependencies: ["tone_and_style"] },
  { key: "audience",            label: "Audience & Market",    dependencies: ["tone_and_style"] },
  { key: "unique_hook",         label: "Unique Hook",          dependencies: ["audience"] },
  { key: "visual_palette",      label: "Visual & Sensory Palette", dependencies: ["world_building_notes"] },
] as const;

export type ConceptBriefSectionKey = typeof CONCEPT_BRIEF_SECTIONS[number]["key"];

// Topologically sorted (all 15 sections)
export const SECTION_DEPENDENCY_ORDER: ConceptBriefSectionKey[] =
  CONCEPT_BRIEF_SECTIONS.map(s => s.key);

/**
 * NOTE_SECTION_MAP — maps note categories → concept_brief section keys.
 *
 * If a note's category is NOT in this map and targets concept_brief,
 * this is a CONFIGURATION ERROR. Flag it explicitly — do NOT silently route.
 *
 * Unmapped categories should surface as a warning/error in the UI:
 *   "Note category 'X' has no registered section mapping. Add it to NOTE_SECTION_MAP."
 */
export const NOTE_SECTION_MAP: Record<string, ConceptBriefSectionKey | null> = {
  // logline
  logline_quality:     "logline",
  logline_clarity:     "logline",
  logline_impact:      "logline",
  logline_concision:   "logline",
  // genre & subgenre
  genre_positioning:   "genre",
  subgenre_positioning: "subgenre",
  // premise
  premise_strength:           "premise",
  premise_narrative_density: "premise",
  premise_clarity:           "premise",
  // protagonist
  protagonist_depth:     "protagonist",
  protagonist_motivation: "protagonist",
  protagonist_arc:       "protagonist",
  // opposition
  opposition_strength:     "opposition",
  opposition_mirror:       "opposition",
  opposition_motivation:   "opposition",
  // key_relationships
  relationship_depth:    "key_relationships",
  relationship_dynamics: "key_relationships",
  relationship_web:      "key_relationships",
  // central_conflict
  central_conflict_clarity:  "central_conflict",
  central_conflict_strength:  "central_conflict",
  // stakes
  stakes_personal:      "stakes",
  stakes_interpersonal: "stakes",
  stakes_global:        "stakes",
  // tone_and_style
  tone_register:       "tone_and_style",
  tone_consistency:    "tone_and_style",
  // themes
  theme_clarity:       "themes",
  theme_integration:   "themes",
  theme_coherence:     "themes",
  // world_building
  world_building_depth: "world_building_notes",
  setting_clarity:      "world_building_notes",
  // audience
  audience_clarity:         "audience",
  audience_demographic:    "audience",
  audience_gender_balance:  "audience",
  packaging_clarity:       "audience",
  commercial_positioning:   "audience",
  distribution_logic:        "audience",
  // comparable_titles — map to audience (market-facing, content within Audience & Market section)
  comp_clarity:        "audience",
  comp_relevance:      "audience",
  // unique_hook
  hook_strength:    "unique_hook",
  hook_originality: "unique_hook",
  // visual_palette
  visual_palette_motifs:   "visual_palette",
  visual_palette_color:    "visual_palette",
  visual_palette_sensory:  "visual_palette",
  // null = unmapped (configuration error — flag in UI)
};

/**
 * Get the target section key for a given note category targeting concept_brief.
 * Returns null if the category is unmapped — caller must handle as a configuration error.
 */
export function getSectionForNoteCategory(
  category: string,
): ConceptBriefSectionKey | null {
  return NOTE_SECTION_MAP[category] ?? null;
}

/**
 * Validate that all dependencies for a section are satisfied.
 * Returns null if valid; returns error message if blocked.
 */
export function validateSectionDependencies(
  sectionKey: ConceptBriefSectionKey,
  completedSections: Set<ConceptBriefSectionKey>,
): string | null {
  const section = CONCEPT_BRIEF_SECTIONS.find(s => s.key === sectionKey);
  if (!section) return `Unknown section key: ${sectionKey}`;
  for (const dep of section.dependencies) {
    if (!completedSections.has(dep as ConceptBriefSectionKey)) {
      return `Section '${sectionKey}' is blocked by unmet dependency: '${dep}'. Complete '${dep}' first.`;
    }
  }
  return null;
}
