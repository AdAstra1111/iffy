# SESS-IMP-0042 — Hero Frame Canon Contract

## Mandate

Hero Frames may **consume** certified canon. Hero Frames may **not infer** canon.

## Required Sources

| Prompt Section | Current Source | Required Source | Status |
|---------------|---------------|----------------|--------|
| **World Foundation** | `project_canon.canon_json` (era, geography, architecture, costume, technology, culture) | CPIE domains: Location Canon, Wardrobe Canon, Production Design Canon | **REWIRE** |
| **Visual Style** | `project_visual_language.style_profile_json` | CPIE **Visual Language Canon** (13 inferred fields) | **REWIRE** |
| **Location** | `canon_locations` + `location_visual_datasets` | CPIE **Location Canon** + Projection Dataset | **PARTIAL** (keep dataset, add CPIE ground truth) |
| **Character Identity** | `character_visual_dna` (from raw AI extraction) | CPIE **Wardrobe Canon** + certified identity canon | **REWIRE** |
| **Wardrobe** | `scene_wardrobe_assignments` + `project_canon.character_wardrobe_profiles` | CPIE **Wardrobe Canon** (per entity) | **REWIRE** |
| **Visual Canon Primitives** | `project_canon.canon_json.visual_canon_primitives` | CPIE **Visual Language Canon** | **REWIRE** |
| **Production Design** | `pd_location_design` + `pd_design_templates` | CPIE **PD Canon** + Projection Dataset | **PARTIAL** |
| **Scene Grounding** | `scene_index` (scene content, summary, etc.) | Direct Document (NOT canon — scene-specific) | **KEEP** |

## Forbidden Sources

- ❌ **project_visual_language** direct read → must read from CPIE VL Canon
- ❌ **character_visual_dna** as identity source → must read from Wardrobe Canon + CPIE entity canon
- ❌ **project_canon.canon_json** as primary world source → must decompose into specific CPIE domain calls
- ❌ Independent style inference via LLM
- ❌ Independent location inference via LLM
- ❌ Raw scene text worldbuilding (beyond scene grounding)

## Contracted Canon Fields

### Visual Language Canon (from CPIE endpoint)
- colour_philosophy
- saturation_profile
- contrast_model
- lighting_philosophy
- shadow_philosophy
- lens_philosophy
- depth_philosophy
- focus_philosophy
- realism_level
- visual_scale
- atmosphere_philosophy
- texture_philosophy
- palette_bias

### Location Canon (from CPIE endpoint)
- architecture_style
- construction_era
- material_palette
- lighting_character
- visual_density
- condition

### Production Design Canon (from CPIE endpoint)
- dressing_style
- surface_condition
- institutional_culture
- environmental_storytelling
- scene_dressing_level
- hero_objects
- color_accents
- atmosphere_method

### Wardrobe Canon (per entity, from CPIE endpoint)
- era_alignment
- silhouette
- primary_outfit
- footwear
- headwear
- fabric_palette
- condition
- distinctive_elements
- color_philosophy
- production_complexity

### Identity Canon (per entity, from CPIE endpoint — certified identity traits only)
- biological_sex (certified)
- age_range (certified)
- ethnicity (certified)
- body_type (certified)
- height_class (certified)
- facial_archetype (certified)
