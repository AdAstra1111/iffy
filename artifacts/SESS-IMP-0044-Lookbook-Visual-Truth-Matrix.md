# SESS-IMP-0044 TASK 2 — Lookbook Visual Truth Matrix

## Runtime Path Trace

Input → resolveCanonicalBindings → resolveWorldBinding(read canonJson) → buildWorldBindingBlock(format to prompt)
     → resolveVisualStyleProfile(read project_visual_style via VSAL) → vsalPromptBlock(inject to prompt)
     → resolveLookbookPDCanon(read pd_location_design + pd_design_templates) → pdBlock(inject to prompt)
     → resolveLookbookWardrobeCanon(read character_wardrobe_profiles + wardrobe_state_taxonomy) → wardrobeBlock(inject to prompt)
     → resolveLocationBindings(read locations DB) → locationBlock
     → resolveCharacterBindings(read character_visual_dna) → characterBlock
     → assemblePrestigePrompt(read project format/config) → prestigeBlock

## Field-by-Field Matrix

| Visual Field | Lookbook Source | CPIE Canon Domain | CPIE Field Exists? | Authority Conflict? |
|-------------|----------------|-------------------|-------------------|-------------------|
| era / period | canonJson.era / canonJson.period | Location Canon | construction_era | YES — CPIE covers this |
| geography | canonJson.geography | Location Canon | (no explicit geography field) | NO — CPIE doesn't have geography |
| architecture | canonJson.architecture | Location Canon | architecture_style | YES |
| costume_language | canonJson.costume_language / canonJson.wardrobe | Wardrobe Canon | era_alignment, silhouette, primary_outfit, fabric_palette | YES |
| environmental_palette | canonJson.color_palette / canonJson.palette | VL Canon | colour_philosophy, palette_bias, saturation_profile | YES |
| technology_level | canonJson.technology_level | PCP (not CPIE) | (no CPIE tech field) | NO |
| cultural_markers | canonJson.cultural_markers / canonJson.culture | PCP (not CPIE) | (no CPIE culture field) | NO |
| social_structure | canonJson.social_structure / canonJson.class_structure | PCP (not CPIE) | class_structure exists in PCP | NO (same source: PCP) |
| world_rules | canonJson.world_rules | None | (no CPIE field) | NO |
| lighting_philosophy | project_visual_style table (VSAL) | VL Canon | lighting_philosophy | YES — different table, same semantics |
| camera_philosophy | project_visual_style table (VSAL) | VL Canon | (no CPIE camera field — LLM-only) | NO |
| composition_philosophy | project_visual_style table (VSAL) | VL Canon | (no CPIE composition field — LLM-only) | NO |
| texture_materiality | project_visual_style table (VSAL) | VL Canon | texture_philosophy | YES — different table, same semantics |
| color_response | project_visual_style table (VSAL) | VL Canon | colour_philosophy | YES — different table, same semantics |
| environment_realism | project_visual_style table (VSAL) | VL Canon | realism_level | YES — different table, same semantics |
| forbidden_traits | project_visual_style table (VSAL) | None | (no CPIE field) | NO |
| PD dressing_style | pd_location_design + pd_design_templates | PD Canon | dressing_style, surface_condition | YES — different table, same semantics |
| PD materials | pd_location_design | PD Canon | (no explicit material field) | PARTIAL |
| PD architecture | pd_location_design | Location Canon | architecture_style | YES |
| PD environment_rules | pd_location_design | PD Canon | environmental_storytelling | PARTIAL |
| Wardrobe state | character_wardrobe_profiles + wardrobe_state_taxonomy | Wardrobe Canon | primary_outfit, footwear, headwear, etc. | YES — different table, same semantics |
| Character identity | character_visual_dna table | (no CPIE Identity Canon) | (no CPIE identity domain) | NO — no CPIE source exists |
| Location description | locations DB | Location Canon | condition, visual_density, lighting_character | PARTIAL |

## Authority Classification Summary

| Classification | Count | Fields |
|---------------|-------|--------|
| CPIE source exists, Lookbook reads legacy table | 10 | era, architecture, costume_language, palette, lighting, texture, color, realism, PD dressing, wardrobe state |
| CPIE source exists, Lookbook reads different DB | 5 | PD materials, PD architecture, PD environment, location condition, location lighting |
| No CPIE source exists (PCP/LLM) | 6 | geography, technology, culture, social_structure, identity, forbidden_traits |
| No CPIE source exists (none) | 2 | world_rules, camera_philosophy, composition_philosophy |

## Key Finding

10 out of 22 visual fields in the Lookbook have an existing CPIE Canon source that the Lookbook could consume RIGHT NOW. An additional 5 fields have partial CPIE coverage. Only 7 fields have no CPIE source (geography, technology, culture, world_rules, identity, camera, composition — the latter 3 are LLM-only by design and not CPIE-governed anywhere).

The Lookbook's world binding label says 'CANONICAL WORLD BINDING' — but the source is canonJson, not CPIE Canon. This is a labeling error.
