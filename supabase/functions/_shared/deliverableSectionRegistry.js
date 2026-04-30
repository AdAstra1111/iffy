/**
 * Deliverable Section Registry — Phase 2D
 *
 * Deterministic section-addressing for supported document types.
 * Defines stable section keys, matching rules, and repair modes
 * per doc type so the system can target partial rewrites instead
 * of full-document regeneration.
 *
 * Architecture:
 *  - Each doc type has zero or more registered sections.
 *  - Each section has a deterministic match mode (heading_exact, heading_regex, slot_path).
 *  - Section repair can be: replace_section, regenerate_section, append_missing_section.
 *  - If a section cannot be resolved, fail closed to full_doc_fallback.
 *  - Doc types without a registry entry always use full_doc_fallback.
 */
// ── Registry Data ──
const CONCEPT_BRIEF_SECTIONS = [
    { section_key: "logline", label: "Logline", match_mode: "heading_regex", match_pattern: "^#+\\s*logline", allows_partial_rewrite: true, repair_mode: "replace_section", order: 0 },
    { section_key: "premise", label: "Premise", match_mode: "heading_regex", match_pattern: "^#+\\s*premise", allows_partial_rewrite: true, repair_mode: "replace_section", order: 1 },
    { section_key: "protagonist", label: "Protagonist", match_mode: "heading_regex", match_pattern: "^#+\\s*protagonist", allows_partial_rewrite: true, repair_mode: "replace_section", order: 2 },
    { section_key: "central_conflict", label: "Central Conflict", match_mode: "heading_regex", match_pattern: "^#+\\s*central\\s*conflict", allows_partial_rewrite: true, repair_mode: "replace_section", order: 3 },
    { section_key: "tone_and_style", label: "Tone & Style", match_mode: "heading_regex", match_pattern: "^#+\\s*tone", allows_partial_rewrite: true, repair_mode: "replace_section", order: 4 },
    { section_key: "audience", label: "Audience", match_mode: "heading_regex", match_pattern: "^#+\\s*audience|^#+\\s*target\\s*audience", allows_partial_rewrite: true, repair_mode: "replace_section", order: 5 },
    { section_key: "unique_hook", label: "Unique Hook", match_mode: "heading_regex", match_pattern: "^#+\\s*unique\\s*hook|^#+\\s*hook|^#+\\s*usp", allows_partial_rewrite: true, repair_mode: "replace_section", order: 6 },
    { section_key: "genre", label: "Genre", match_mode: "heading_regex", match_pattern: "^#+\\s*genre", allows_partial_rewrite: true, repair_mode: "replace_section", order: 7 },
    { section_key: "subgenre", label: "Subgenre", match_mode: "heading_regex", match_pattern: "^#+\\s*subgenre", allows_partial_rewrite: true, repair_mode: "replace_section", order: 8 },
    { section_key: "themes", label: "Themes", match_mode: "heading_regex", match_pattern: "^#+\\s*themes?", allows_partial_rewrite: true, repair_mode: "replace_section", order: 9 },
    { section_key: "festival_strategy", label: "Festival Strategy", match_mode: "heading_regex", match_pattern: "^#+\\s*festival\\s*strategy", allows_partial_rewrite: true, repair_mode: "replace_section", order: 10 },
    { section_key: "budget_contextualization", label: "Budget Contextualization", match_mode: "heading_regex", match_pattern: "^#+\\s*budget\\s*contextualization", allows_partial_rewrite: true, repair_mode: "replace_section", order: 11 },
];
const FORMAT_RULES_SECTIONS = [
    { section_key: "format_overview", label: "Format Overview", match_mode: "heading_regex", match_pattern: "^#+\\s*format\\s*(overview|summary)", allows_partial_rewrite: true, repair_mode: "replace_section", order: 0 },
    { section_key: "episode_structure", label: "Episode Structure", match_mode: "heading_regex", match_pattern: "^#+\\s*episode\\s*structure", allows_partial_rewrite: true, repair_mode: "replace_section", order: 1 },
    { section_key: "runtime", label: "Runtime", match_mode: "heading_regex", match_pattern: "^#+\\s*runtime|^#+\\s*duration", allows_partial_rewrite: true, repair_mode: "replace_section", order: 2 },
    { section_key: "tone_rules", label: "Tone Rules", match_mode: "heading_regex", match_pattern: "^#+\\s*tone\\s*rules|^#+\\s*tone\\s*&\\s*style\\s*rules", allows_partial_rewrite: true, repair_mode: "replace_section", order: 3 },
    { section_key: "structural_constraints", label: "Structural Constraints", match_mode: "heading_regex", match_pattern: "^#+\\s*structural\\s*constraints|^#+\\s*constraints", allows_partial_rewrite: true, repair_mode: "replace_section", order: 4 },
];
const CHARACTER_BIBLE_SECTIONS = [
    // NIT v2.2: added `^#+\s*character\s*group[:\s]+protagonists?` to match generated
    //   format "# CHARACTER GROUP: Protagonists" alongside bare "## Protagonists".
    { section_key: "protagonists", label: "Protagonists", match_mode: "heading_regex", match_pattern: "^#+\\s*protagonists?|^#+\\s*character\\s*group[:\\s]+protagonists?", allows_partial_rewrite: true, repair_mode: "replace_section", order: 0 },
    // NIT v2.2: added `^#+\s*character\s*group[:\s]+antagonists?` to match generated
    //   format "# CHARACTER GROUP: Antagonists".
    { section_key: "antagonists", label: "Antagonists", match_mode: "heading_regex", match_pattern: "^#+\\s*antagonists?|^#+\\s*character\\s*group[:\\s]+antagonists?", allows_partial_rewrite: true, repair_mode: "replace_section", order: 1 },
    // NIT v2.2: added `^#+\s*character\s*group[:\s]+supporting` to match generated
    //   format "# CHARACTER GROUP: Supporting Characters" (not "Supporting Cast").
    { section_key: "supporting_cast", label: "Supporting Cast", match_mode: "heading_regex", match_pattern: "^#+\\s*supporting\\s*cast|^#+\\s*supporting\\s*characters|^#+\\s*character\\s*group[:\\s]+supporting", allows_partial_rewrite: true, repair_mode: "replace_section", order: 2 },
    { section_key: "relationships", label: "Relationships & Dynamics", match_mode: "heading_regex", match_pattern: "^#+\\s*relationships|^#+\\s*dynamics|^#+\\s*relationships\\s*(&|and)\\s*dynamics", allows_partial_rewrite: true, repair_mode: "replace_section", order: 3 },
    { section_key: "character_arcs", label: "Character Arcs", match_mode: "heading_regex", match_pattern: "^#+\\s*character\\s*arcs?|^#+\\s*arcs?", allows_partial_rewrite: true, repair_mode: "replace_section", order: 4 },
];
const SEASON_ARC_SECTIONS = [
    { section_key: "season_premise", label: "Season Premise", match_mode: "heading_regex", match_pattern: "^#+\\s*season\\s*premise|^#+\\s*premise", allows_partial_rewrite: true, repair_mode: "replace_section", order: 0 },
    { section_key: "arc_overview", label: "Arc Overview", match_mode: "heading_regex", match_pattern: "^#+\\s*arc\\s*overview|^#+\\s*season\\s*arc|^#+\\s*overall\\s*arc", allows_partial_rewrite: true, repair_mode: "replace_section", order: 1 },
    { section_key: "turning_points", label: "Turning Points", match_mode: "heading_regex", match_pattern: "^#+\\s*turning\\s*points?|^#+\\s*key\\s*turning\\s*points?|^#+\\s*milestones", allows_partial_rewrite: true, repair_mode: "replace_section", order: 2 },
    { section_key: "character_season_arcs", label: "Character Season Arcs", match_mode: "heading_regex", match_pattern: "^#+\\s*character\\s*(season\\s*)?arcs?", allows_partial_rewrite: true, repair_mode: "replace_section", order: 3 },
    { section_key: "thematic_throughline", label: "Thematic Throughline", match_mode: "heading_regex", match_pattern: "^#+\\s*thematic|^#+\\s*themes?", allows_partial_rewrite: true, repair_mode: "replace_section", order: 4 },
    { section_key: "season_finale", label: "Season Finale", match_mode: "heading_regex", match_pattern: "^#+\\s*(season\\s*)?finale|^#+\\s*climax|^#+\\s*resolution", allows_partial_rewrite: true, repair_mode: "replace_section", order: 5 },
];
const TREATMENT_SECTIONS = [
    // ── Act-structure headings (original) ──
    // Used when the treatment is written as a narrative with explicit act breaks.
    { section_key: "act_1_setup", label: "Act 1 – Setup", match_mode: "heading_regex", match_pattern: "^#+\\s*act\\s*(1|one|i)\\b|^#+\\s*setup", allows_partial_rewrite: true, repair_mode: "replace_section", order: 0 },
    { section_key: "act_2a_rising_action", label: "Act 2A – Rising Action", match_mode: "heading_regex", match_pattern: "^#+\\s*act\\s*(2a|two\\s*a|ii\\s*a)\\b|^#+\\s*rising\\s*action", allows_partial_rewrite: true, repair_mode: "replace_section", order: 1 },
    { section_key: "act_2b_complications", label: "Act 2B – Complications", match_mode: "heading_regex", match_pattern: "^#+\\s*act\\s*(2b|two\\s*b|ii\\s*b)\\b|^#+\\s*complications?|^#+\\s*midpoint", allows_partial_rewrite: true, repair_mode: "replace_section", order: 2 },
    { section_key: "act_3_climax_resolution", label: "Act 3 – Climax & Resolution", match_mode: "heading_regex", match_pattern: "^#+\\s*act\\s*(3|three|iii)\\b|^#+\\s*climax|^#+\\s*resolution", allows_partial_rewrite: true, repair_mode: "replace_section", order: 3 },
    // ── NIT v2.3: Concept-style headings (additive) ──
    // Used when the treatment is written as a concept document with pitch-style headings.
    // Example: ## Logline / ## Premise / ## World & Setting / ## Story Engine / ## Characters / ## Themes
    // These do not remove or override the act-structure patterns above.
    // parseSections matches whichever set is present; if neither matches, returns [].
    { section_key: "logline", label: "Logline", match_mode: "heading_regex", match_pattern: "^#+\\s*logline", allows_partial_rewrite: true, repair_mode: "replace_section", order: 10 },
    { section_key: "premise", label: "Premise", match_mode: "heading_regex", match_pattern: "^#+\\s*premise", allows_partial_rewrite: true, repair_mode: "replace_section", order: 11 },
    { section_key: "world_setting", label: "World & Setting", match_mode: "heading_regex", match_pattern: "^#+\\s*world\\s*(?:&|and)?\\s*setting", allows_partial_rewrite: true, repair_mode: "replace_section", order: 12 },
    { section_key: "tone_style", label: "Tone & Style", match_mode: "heading_regex", match_pattern: "^#+\\s*tone\\b(?:\\s*(?:&|and)\\s*style)?", allows_partial_rewrite: true, repair_mode: "replace_section", order: 13 },
    { section_key: "story_engine", label: "Story Engine", match_mode: "heading_regex", match_pattern: "^#+\\s*story\\s*engine", allows_partial_rewrite: true, repair_mode: "replace_section", order: 14 },
    // End-anchored ($) to prevent matching "## Character Arcs" or "## Character Development"
    { section_key: "characters_overview", label: "Characters Overview", match_mode: "heading_regex", match_pattern: "^#+\\s*characters?$", allows_partial_rewrite: true, repair_mode: "replace_section", order: 15 },
    { section_key: "themes", label: "Themes", match_mode: "heading_regex", match_pattern: "^#+\\s*themes?", allows_partial_rewrite: true, repair_mode: "replace_section", order: 16 },
];
const STORY_OUTLINE_SECTIONS = [
    { section_key: "setup", label: "Setup / Opening", match_mode: "heading_regex", match_pattern: "^#+\\s*setup|^#+\\s*opening|^#+\\s*act\\s*(1|one|i)\\b", allows_partial_rewrite: true, repair_mode: "replace_section", order: 0 },
    { section_key: "inciting_incident", label: "Inciting Incident", match_mode: "heading_regex", match_pattern: "^#+\\s*inciting\\s*incident|^#+\\s*catalyst", allows_partial_rewrite: true, repair_mode: "replace_section", order: 1 },
    { section_key: "rising_action", label: "Rising Action", match_mode: "heading_regex", match_pattern: "^#+\\s*rising\\s*action|^#+\\s*act\\s*(2|two|ii)\\b", allows_partial_rewrite: true, repair_mode: "replace_section", order: 2 },
    { section_key: "midpoint", label: "Midpoint", match_mode: "heading_regex", match_pattern: "^#+\\s*midpoint|^#+\\s*mid-?point", allows_partial_rewrite: true, repair_mode: "replace_section", order: 3 },
    { section_key: "climax", label: "Climax", match_mode: "heading_regex", match_pattern: "^#+\\s*climax", allows_partial_rewrite: true, repair_mode: "replace_section", order: 4 },
    { section_key: "resolution", label: "Resolution / Denouement", match_mode: "heading_regex", match_pattern: "^#+\\s*resolution|^#+\\s*denouement|^#+\\s*act\\s*(3|three|iii)\\b", allows_partial_rewrite: true, repair_mode: "replace_section", order: 5 },
];
const BEAT_SHEET_SECTIONS = [
    { section_key: "act_1_beats", label: "Act 1 Beats", match_mode: "heading_regex", match_pattern: "^#+\\s*act\\s*(1|one|i)\\b", allows_partial_rewrite: true, repair_mode: "replace_section", order: 0 },
    // NIT v2.4: added plain Act II fallback (^#+\s*act\s*(2|two|ii)\b) so that headings like
    // "## Act II: The Spiral of Two Realities" are captured when no 'a'/'b' suffix is present.
    // Original 2a/2b patterns preserved — more-specific patterns take priority via first-match order.
    { section_key: "act_2a_beats", label: "Act 2A Beats", match_mode: "heading_regex", match_pattern: "^#+\\s*act\\s*(2a|two\\s*a|ii\\s*a)\\b|^#+\\s*act\\s*(2|two|ii)\\b", allows_partial_rewrite: true, repair_mode: "replace_section", order: 1 },
    { section_key: "act_2b_beats", label: "Act 2B Beats", match_mode: "heading_regex", match_pattern: "^#+\\s*act\\s*(2b|two\\s*b|ii\\s*b)\\b", allows_partial_rewrite: true, repair_mode: "replace_section", order: 2 },
    { section_key: "act_3_beats", label: "Act 3 Beats", match_mode: "heading_regex", match_pattern: "^#+\\s*act\\s*(3|three|iii)\\b", allows_partial_rewrite: true, repair_mode: "replace_section", order: 3 },
];
const VISUAL_CANON_BRIEF_SECTIONS = [
    { section_key: "visual_world_overview", label: "Visual World Overview", match_mode: "heading_regex", match_pattern: "^#+\\s*visual\\s*world\\s*overview", allows_partial_rewrite: true, repair_mode: "replace_section", order: 0 },
    { section_key: "temporal_and_cultural_grounding", label: "Temporal & Cultural Grounding", match_mode: "heading_regex", match_pattern: "^#+\\s*temporal\\s*(and|&)\\s*cultural\\s*grounding", allows_partial_rewrite: true, repair_mode: "replace_section", order: 1 },
    { section_key: "costume_philosophy", label: "Costume Philosophy", match_mode: "heading_regex", match_pattern: "^#+\\s*costume\\s*philosophy", allows_partial_rewrite: true, repair_mode: "replace_section", order: 2 },
    { section_key: "production_design_philosophy", label: "Production Design Philosophy", match_mode: "heading_regex", match_pattern: "^#+\\s*production\\s*design\\s*philosophy", allows_partial_rewrite: true, repair_mode: "replace_section", order: 3 },
    { section_key: "material_and_texture_system", label: "Material & Texture System", match_mode: "heading_regex", match_pattern: "^#+\\s*material\\s*(and|&)\\s*texture\\s*system", allows_partial_rewrite: true, repair_mode: "replace_section", order: 4 },
    { section_key: "palette_logic", label: "Palette Logic", match_mode: "heading_regex", match_pattern: "^#+\\s*palette\\s*logic|^#+\\s*color\\s*palette", allows_partial_rewrite: true, repair_mode: "replace_section", order: 5 },
    { section_key: "class_and_labor_expression", label: "Class & Labor Expression", match_mode: "heading_regex", match_pattern: "^#+\\s*class\\s*(and|&)\\s*labor\\s*expression", allows_partial_rewrite: true, repair_mode: "replace_section", order: 6 },
    { section_key: "grooming_and_physicality", label: "Grooming & Physicality", match_mode: "heading_regex", match_pattern: "^#+\\s*grooming\\s*(and|&)\\s*physicality", allows_partial_rewrite: true, repair_mode: "replace_section", order: 7 },
    { section_key: "motifs_and_symbolism", label: "Motifs & Symbolism", match_mode: "heading_regex", match_pattern: "^#+\\s*motifs\\s*(and|&)\\s*symbolism", allows_partial_rewrite: true, repair_mode: "replace_section", order: 8 },
    { section_key: "contrast_rules", label: "Contrast Rules", match_mode: "heading_regex", match_pattern: "^#+\\s*contrast\\s*rules", allows_partial_rewrite: true, repair_mode: "replace_section", order: 9 },
    { section_key: "visual_exclusions", label: "Visual Exclusions", match_mode: "heading_regex", match_pattern: "^#+\\s*visual\\s*exclusions", allows_partial_rewrite: true, repair_mode: "replace_section", order: 10 },
    { section_key: "cinematic_references", label: "Cinematic References", match_mode: "heading_regex", match_pattern: "^#+\\s*cinematic\\s*references", allows_partial_rewrite: true, repair_mode: "replace_section", order: 11 },
];
const VISUAL_PROJECT_BIBLE_SECTIONS = [
    { section_key: "visual_thesis", label: "Visual Thesis", match_mode: "heading_regex", match_pattern: "^#+\\s*visual\\s*thesis", allows_partial_rewrite: false, repair_mode: "regenerate_section", order: 0 },
    { section_key: "world_and_design_language", label: "World & Design Language", match_mode: "heading_regex", match_pattern: "^#+\\s*world\\s*(and|&)\\s*design\\s*language", allows_partial_rewrite: false, repair_mode: "regenerate_section", order: 1 },
    { section_key: "character_visual_system", label: "Character Visual System", match_mode: "heading_regex", match_pattern: "^#+\\s*character\\s*visual\\s*system", allows_partial_rewrite: false, repair_mode: "regenerate_section", order: 2 },
    { section_key: "location_production_design", label: "Location & Production Design", match_mode: "heading_regex", match_pattern: "^#+\\s*location.*production\\s*design", allows_partial_rewrite: false, repair_mode: "regenerate_section", order: 3 },
    { section_key: "visual_cohesion_and_recurrence", label: "Visual Cohesion & Recurrence", match_mode: "heading_regex", match_pattern: "^#+\\s*visual\\s*cohesion", allows_partial_rewrite: false, repair_mode: "regenerate_section", order: 4 },
    { section_key: "references_and_direction", label: "References & Direction", match_mode: "heading_regex", match_pattern: "^#+\\s*references\\s*(and|&)\\s*direction", allows_partial_rewrite: false, repair_mode: "regenerate_section", order: 5 },
    { section_key: "asset_appendix", label: "Asset Appendix", match_mode: "heading_regex", match_pattern: "^#+\\s*asset\\s*appendix", allows_partial_rewrite: false, repair_mode: "regenerate_section", order: 6 },
];
// ── Registry Map ──
const SECTION_REGISTRY = {
    concept_brief: {
        doc_type: "concept_brief",
        section_repair_supported: true,
        sections: CONCEPT_BRIEF_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 2,
    },
    format_rules: {
        doc_type: "format_rules",
        // NIT v2.4: format_rules documents are stored as raw JSON (not markdown).
        // parseSections() returns [] for all real versions. Set false to reflect actual capability.
        section_repair_supported: false,
        sections: FORMAT_RULES_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 2,
    },
    character_bible: {
        doc_type: "character_bible",
        section_repair_supported: true,
        sections: CHARACTER_BIBLE_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 2,
    },
    season_arc: {
        doc_type: "season_arc",
        // NIT v2.4: season_arc documents are stored as raw JSON ({"SEASON_ARC": {...}}).
        // parseSections() returns [] for all 9 real versions. Set false to reflect actual capability.
        section_repair_supported: false,
        sections: SEASON_ARC_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 2,
    },
    treatment: {
        doc_type: "treatment",
        section_repair_supported: true,
        sections: TREATMENT_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 2,
    },
    long_treatment: {
        doc_type: "long_treatment",
        section_repair_supported: true,
        sections: TREATMENT_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 2,
    },
    story_outline: {
        doc_type: "story_outline",
        section_repair_supported: true,
        sections: STORY_OUTLINE_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 2,
    },
    beat_sheet: {
        doc_type: "beat_sheet",
        section_repair_supported: true,
        sections: BEAT_SHEET_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 2,
    },
    visual_canon_brief: {
        doc_type: "visual_canon_brief",
        section_repair_supported: true,
        sections: VISUAL_CANON_BRIEF_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 12,
    },
    visual_project_bible: {
        doc_type: "visual_project_bible",
        section_repair_supported: false,
        sections: VISUAL_PROJECT_BIBLE_SECTIONS,
        fallback_mode: "full_doc_rewrite",
        min_sections_required: 7,
    },
};
// ── Public API ──
/**
 * Get section config for a doc type. Returns null if not supported.
 */
export function getSectionConfig(docType) {
    return SECTION_REGISTRY[docType] || null;
}
/**
 * Check whether a doc type supports section-level repair.
 */
export function isSectionRepairSupported(docType) {
    return SECTION_REGISTRY[docType]?.section_repair_supported === true;
}
/**
 * Get all section keys for a doc type.
 */
export function getSectionKeys(docType) {
    const config = SECTION_REGISTRY[docType];
    if (!config)
        return [];
    return config.sections.map(s => s.section_key);
}
/**
 * Find section definition by key within a doc type.
 */
export function findSectionDef(docType, sectionKey) {
    const config = SECTION_REGISTRY[docType];
    if (!config)
        return null;
    return config.sections.find(s => s.section_key === sectionKey) || null;
}
/**
 * List all doc types that support section-level repair.
 */
export function listSectionRepairDocTypes() {
    return Object.keys(SECTION_REGISTRY).filter(k => SECTION_REGISTRY[k].section_repair_supported);
}
