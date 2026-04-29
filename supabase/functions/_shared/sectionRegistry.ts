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
  // ── Canonical sections (7) — used by parseSections + section-level rewrite ──
  { key: "logline",            label: "Logline",              dependencies: [] },
  { key: "premise",            label: "Premise",              dependencies: ["logline"] },
  { key: "protagonist",        label: "Protagonist",          dependencies: ["premise"] },
  { key: "central_conflict",   label: "Central Conflict",     dependencies: ["protagonist"] },
  { key: "tone_and_style",     label: "Tone & Style",         dependencies: ["central_conflict"] },
  { key: "audience",           label: "Audience",             dependencies: ["tone_and_style"] },
  { key: "unique_hook",        label: "Unique Hook",           dependencies: ["audience"] },
  // ── Additional real sections present in v31 but not yet in parseSections ──
  // These are parsed by heading but NOT yet routed to section-level rewrite.
  // TODO (Phase 2+): add to deliverableSectionRegistry.ts CONCEPT_BRIEF_SECTIONS
  // so parseSections can extract them, then add to rewrite targets.
  { key: "genre",              label: "Genre",                 dependencies: ["logline"] },
  { key: "subgenre",           label: "Subgenre",              dependencies: ["genre"] },
  { key: "themes",             label: "Themes",               dependencies: ["tone_and_style"] },
  { key: "world_building_notes",label: "World Building Notes", dependencies: ["premise"] },
  { key: "festival_strategy",   label: "Festival Strategy",    dependencies: ["unique_hook"] },
  { key: "budget_contextualization", label: "Budget Contextualization", dependencies: ["festival_strategy"] },
] as const;

export type ConceptBriefSectionKey = typeof CONCEPT_BRIEF_SECTIONS[number]["key"];

// Topologically sorted (all 11 sections including the additional ones)
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
  // premise
  premise_strength:           "premise",
  premise_narrative_density: "premise",
  premise_clarity:           "premise",
  // protagonist
  protagonist_depth:     "protagonist",
  protagonist_motivation: "protagonist",
  protagonist_arc:       "protagonist",
  // central_conflict
  central_conflict_clarity:  "central_conflict",
  central_conflict_strength:  "central_conflict",
  // tone_and_style / genre / theme
  tone_register:       "tone_and_style",
  tone_consistency:    "tone_and_style",
  genre_positioning:   "genre",
  subgenre_positioning: "subgenre",
  theme_clarity:       "themes",
  theme_integration:   "themes",
  theme_coherence:     "themes",
  // audience
  audience_clarity:         "audience",
  audience_demographic:    "audience",
  audience_gender_balance:  "audience",
  // unique_hook
  hook_strength:    "unique_hook",
  hook_originality: "unique_hook",
  // world_building
  world_building_depth: "world_building_notes",
  setting_clarity:      "world_building_notes",
  // festival + budget
  festival_positioning:  "festival_strategy",
  budget_context:       "budget_contextualization",
  budget_alignment:     "budget_contextualization",
  // PACKAGING / COMMERCIAL notes — map to audience (market-facing section)
  packaging_clarity:       "audience",
  commercial_positioning:   "audience",
  comp_clarity:             "audience",
  distribution_logic:        "audience",
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
