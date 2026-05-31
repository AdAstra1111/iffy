# SESS-IMP-0042-A — Prompt Provenance Matrix

## Hero Frame Prompt: Source Classification Audit

| Section | Label | Source | Classification | Can Affect Image | CPIE Conflict | Risk |
|---------|-------|--------|---------------|-------------------|---------------|------|
| A1 | Header + Story | canonJson.logline | DOCUMENT CONTEXT | Contextual only | None | safe |
| A2 | Premise | canonJson.premise | LEGACY UNSAFE | Yes | CPIE VL, Location, PD | MEDIUM |
| A3 | World Foundation | resolveWorldBlock: canonJson.era, geography, architecture, costume_language, technology_level, cultural_markers | LEGACY UNSAFE | HIGH | CPIE Location, CPIE Wardrobe | HIGH |
| A4 | Tone and Style | canonJson.tone_style trunc 300 | LEGACY UNSAFE | Moderate | CPIE VL | LOW |
| B | Location | moment.locationDataset.promptBlock Projection | DOCUMENT CONTEXT | HIGH | Minor | Low |
| C | Character Identity | character_visual_dna table: identity_signature, biological_sex, age_range, ethnicity, body_type | LEGACY UNSAFE | HIGH | CPIE Wardrobe wardrobe_signals | HIGH |
| D | Wardrobe | moment.wardrobeBlocks from canonJson.character_wardrobe_profiles | LEGACY SUBORDINATE | HIGH | CPIE Wardrobe era_alignment, silhouette, outfit | HIGH |
| E | Visual Canon Primitives | canonJson.visual_canon_primitives: material, ritual, communication, power, surface, symbolic | LEGACY UNSAFE | HIGH | CPIE VL, CPIE PD | HIGH |
| E1 | Visual Style Authority | CPIE VL Canon PRIMARY / project_visual_language fallback | CERTIFIED CPIE CANON | HIGH | N/A | Governed |
| E2 | Production Design | moment.pdCanon.promptBlock Projection | DOCUMENT CONTEXT | HIGH | Minor | Low |
| E3 | CPIE All Domains | CPIE endpoint: wardrobe, props, vehicle, creature, vl, location, pd | CERTIFIED CPIE CANON | HIGH | SHOULD override all | NO PRECEDENCE RULE |
| F | Scene Grounding | Scene-specific data | DOCUMENT CONTEXT | Moderate | None | Safe |
| G | Narrative Function | NARRATIVE_FUNCTION_GUIDANCE | DOCUMENT CONTEXT | Low | None | Safe |
| H | Hero Frame Mandate | Static directives | DOCUMENT CONTEXT | Moderate | None | Safe |

## Key Finding: No Conflict Precedence Rule

E3 (CPIE) appears AFTER sections A through E2. There is NO instruction telling the model that CPIE canon overrides conflicting legacy content. Models will average, merge, or weight equally. Fix required.
