# SESS-IMP-0042B — Visual Truth Consolidation Audit

## TASK 1 — Visual Truth Overlap Matrix

### Consumer CPIE Coverage

| Consumer | Calls CPIE? | Source(s) | Classification |
|----------|------------|-----------|---------------|
| Hero Frames | YES | CPIE endpoint (VL, all domains) + canonJson + character_visual_dna + Projection | CPIE-integrated (3 legacy bypasses remain) |
| Lookbook | NO | canonJson (resolveWorldBinding) + project_visual_style (VSAL) + character_visual_dna + locations DB | LEGACY UNSAFE |
| VPB | NO | canonJson (visual_canon_brief + production_design) + characters + locations DB | LEGACY UNSAFE |
| Visual DNA Gen | PARTIAL | CPIE enrichment (wardrobe + props) AFTER LLM extraction | CPIE-enriched (LLM-first) |
| Extract Visual DNA | NO | Pure LLM extraction from narrative text | LEGACY UNSAFE |
| Lookbook Preflight | NO | DB readiness checks only | N/A (no prompt output) |

### Legend
- **SAFE**: CPIE-only source
- **SUBORDINATED**: Legacy exists but CPIE has explicit precedence
- **UNSAFE**: Multiple competing truth sources
- **UNKNOWN**: Ownership unclear
- **ALTERNATIVE**: Different table/source covers same field domain

### Complete Field Matrix

| # | Field | Hero Frames | Lookbook | VPB | Visual DNA | VSAL (shared) | CPIE Domain | Current Winner | Class. |
|---|-------|------------|----------|-----|-----------|---------------|-------------|---------------|--------|
| 1 | era / period | A3: World Foundation (canonJson) | World Bind: ERA/PERIOD (canonJson) | VPB: era_classification (canonJson) | — | period (project_visual_style) | Location Canon: construction_era | MULTIPLE | UNSAFE |
| 2 | geography | A3: World Foundation (canonJson) | World Bind: GEOGRAPHY (canonJson) | — | — | — | Location Canon: (indirect, no explicit geography field) | canonJson | UNSAFE |
| 3 | architecture | A3: World Foundation (canonJson) | World Bind: ARCHITECTURE (canonJson) | VPB: architecture_style (canonJson) | — | — | Location Canon: architecture_style | MULTIPLE | UNSAFE |
| 4 | costume / costume_language | A3: World Foundation (canonJson) + D: Wardrobe + C: identity | World Bind: COSTUME/MATERIAL (canonJson) | VPB: costume_philosophy (canonJson) | clothing (LLM) + CPIE wardrobe enrichment | — | Wardrobe Canon: era_alignment, silhouette, primary_outfit, fabric_palette | MULTIPLE | UNSAFE |
| 5 | technology_level | A3: World Foundation (canonJson) | World Bind: TECHNOLOGY (canonJson) | — | — | — | Location Canon: (no explicit technology field) | canonJson | SUBORDINATED (conflict precedence) |
| 6 | culture / cultural_markers | A3: World Foundation (canonJson) | World Bind: CULTURAL MARKERS (canonJson) | VPB: cultural_context (canonJson) | — | cultural_context (project_visual_style) | PCP (no CPIE culture field) | canonJson | ALTERNATIVE (no CPIE field exists) |
| 7 | social_structure | — | World Bind: SOCIAL STRUCTURE (canonJson) | VPB: (indirect in visual_canon_brief) | social_class (LLM) | — | PCP (class_structure exists) | MULTIPLE | UNSAFE |
| 8 | tone_style | A4: Tone & Style (canonJson) | — | — | — | — | VL Canon: (no tone_style field) | canonJson | SUBORDINATED (conflict precedence) |
| 9 | lighting_philosophy | E1: VSAL (CPIE VL primary) | — | — | — | lighting (project_visual_style) | VL Canon: lighting_philosophy | CPIE (HF) / VSAL (lookbook) | SPLIT |
| 10 | camera_philosophy | H: Hero Frame Mandate (static) | — | — | — | camera (project_visual_style) | VL Canon: no camera field | STATIC + VSAL | ALTERNATIVE |
| 11 | composition_philosophy | H: Hero Frame Mandate (static) | — | — | — | composition (project_visual_style) | VL Canon: no composition field | STATIC + VSAL | ALTERNATIVE |
| 12 | texture / texture_materiality | E: Visual Canon Primitives (material_systems) | — | VPB: materials (canonJson) | — | texture (project_visual_style) | VL Canon: texture_philosophy + PD Canon: surface_condition | MULTIPLE | UNSAFE |
| 13 | color / color_response | — | World Bind: PALETTE (canonJson) | VPB: palette (canonJson) | — | color (project_visual_style) | VL Canon: colour_philosophy, palette_bias, saturation_profile | MULTIPLE | UNSAFE |
| 14 | atmosphere_philosophy | E3: CPIE VL Canon | — | — | — | — | VL Canon: atmosphere_philosophy | CPIE | SAFE |
| 15 | material_palette | E: Visual Canon Primitives (material_systems) | — | VPB: material_palette (canonJson) | — | — | PD Canon: (no material_palette field) | MULTIPLE | UNSAFE |
| 16 | architecture_style | E3: CPIE Location Canon | — | VPB: architecture_style (canonJson) | — | — | Location Canon: architecture_style | SPLIT | UNSAFE |
| 17 | dressing_style | E3: CPIE PD Canon | — | — | — | — | PD Canon: dressing_style | CPIE (HF only) | INCOMPLETE (only Hero Frames get it) |
| 18 | surface_condition | E3: CPIE PD Canon | — | VPB: (material system) | — | — | PD Canon: surface_condition | SPLIT | UNSAFE |
| 19 | hero_objects / symbolic_objects | E: Visual Canon Primitives (recurrent_symbolic_objects) + E3: CPIE PD Canon | — | VPB: (motifs) | — | — | PD Canon: hero_objects | SPLIT | UNSAFE |
| 20 | environment_rules | — | World Bind: WORLD RULES (canonJson) | VPB: environment_rules (canonJson) | — | — | — | canonJson | ALTERNATIVE (no CPIE field) |
| 21 | world_description | — | — | VPB: world overview (canonJson brief) | — | — | — | canonJson | ALTERNATIVE |
| 22 | biological_sex | C: character_visual_dna (LLM) | Character bind (LLM) | — | age/gender (LLM) | — | — | LLM extraction | NO CPIE FIELD |
| 23 | age_range | C: character_visual_dna (LLM) | Character bind (LLM) | — | age (LLM) | — | — | LLM extraction | NO CPIE FIELD |
| 24 | ethnicity | C: character_visual_dna (LLM) | Character bind (LLM) | — | ethnicity (LLM) | — | — | LLM extraction | NO CPIE FIELD |
| 25 | body_type | C: character_visual_dna (LLM) | Character bind (LLM) | — | build (LLM) | — | — | LLM extraction | NO CPIE FIELD |
| 26 | height_class | C: character_visual_dna (LLM) | — | — | height (LLM) | — | — | LLM extraction | NO CPIE FIELD |
| 27 | facial_archetype | C: character_visual_dna (LLM) | Character bind (LLM) | — | face (LLM) | — | — | LLM extraction | NO CPIE FIELD |
| 28 | primary_outfit | C: identity (LLM partial) + D: wardrobe blocks | Character bind (LLM via traits) | VPB: (indirect) | clothing (LLM + CPIE enrichment) | — | Wardrobe Canon: primary_outfit | CPIE enriched | B- (enrichment, not gate) |
| 29 | footwear | D: wardrobe blocks | — | — | clothing (LLM + CPIE enrichment) | — | Wardrobe Canon: footwear | CPIE enriched | B- |
| 30 | headwear | D: wardrobe blocks | — | — | clothing (LLM + CPIE enrichment) | — | Wardrobe Canon: headwear | CPIE enriched | B- |
| 31 | fabric_palette | — | — | — | — | — | Wardrobe Canon: fabric_palette | CPIE only | SAFE (but only in canon, not projected) |
| 32 | silhouette | D: wardrobe blocks | — | — | clothing (LLM) | — | Wardrobe Canon: silhouette | CPIE enriched | B- |
| 33 | colour_philosophy | E3: CPIE VL Canon | — | VPB: palette (canonJson) | — | color (project_visual_style) | VL Canon: colour_philosophy | SPLIT | UNSAFE |
| 34 | saturation_profile | E3: CPIE VL Canon | — | — | — | — | VL Canon: saturation_profile | CPIE | SAFE (HF only) |
| 35 | contrast_model | E3: CPIE VL Canon | — | — | — | — | VL Canon: contrast_model | CPIE | SAFE (HF only) |
| 36 | shadow_philosophy | E3: CPIE VL Canon | — | — | — | — | VL Canon: shadow_philosophy | CPIE | SAFE (HF only) |
| 37 | lens_philosophy | E3: CPIE VL Canon | — | — | — | — | VL Canon: lens_philosophy | CPIE | SAFE (HF only) |
| 38 | depth_philosophy | E3: CPIE VL Canon | — | — | — | — | VL Canon: depth_philosophy | CPIE | SAFE (HF only) |
| 39 | focus_philosophy | E3: CPIE VL Canon | — | — | — | — | VL Canon: focus_philosophy | CPIE | SAFE (HF only) |
| 40 | realism_level | E3: CPIE VL Canon | — | — | — | realism (project_visual_style) | VL Canon: realism_level | SPLIT | UNSAFE |
| 41 | visual_scale | E3: CPIE VL Canon | — | — | — | — | VL Canon: visual_scale | CPIE | SAFE (HF only) |
| 42 | palette_bias | E3: CPIE VL Canon | — | VPB: palette (canonJson) | — | — | VL Canon: palette_bias | SPLIT | UNSAFE |
| 43 | primary_prop / primary_weapon | E3: CPIE Props Canon | — | — | props (LLM + CPIE enrichment) | — | Props Canon: primary_weapon, primary_prop | CPIE enriched | B- |
| 44 | condition (location) | E3: CPIE Location Canon | — | — | — | — | Location Canon: condition | CPIE | SAFE (HF only) |
| 45 | visual_density | E3: CPIE Location Canon | — | — | — | — | Location Canon: visual_density | CPIE | SAFE (HF only) |
| 46 | lighting_character | E3: CPIE Location Canon | — | — | — | lighting (project_visual_style) | Location Canon: lighting_character | SPLIT | UNSAFE |

## TASK 2 — Hero Frame Visual Authority Review

### Section A1: Header + Story
- Influence: NONE (contextual only)
- Overlaps: None
- CPIE coverage: N/A
- **Recommendation: KEEP** — narrative context only

### Section A2: Premise
- Influence: LOW (can indirectly imply visual elements)
- Overlaps: Location, VL (mood from premise)
- CPIE coverage: Not covered by CPIE
- **Recommendation: REDUCE** — truncate to 200 chars, add note "CONTEXT ONLY — not authoritative for visual fields"

### Section A3: World Foundation (resolveWorldBlock)
- Influence: HIGH
- Overlaps: Location (era, geography, architecture), Wardrobe (costume), VL (technology, culture)
- CPIE coverage: Location Canon covers era, architecture; Wardrobe Canon covers costume
- Fields: era, geography, architecture, costume, technology, culture
- **Recommendation: REMOVE VISUAL FIELDS, KEEP CONTEXT ONLY**
  - KEEP: technology_level, culture (not in CPIE)
  - REMOVE: era, geography, architecture, costume_language (all covered by CPIE)
  - CONVERT: geography → context-only narrative framing

### Section A4: Tone & Style
- Influence: MEDIUM (indirect mood influence)
- Overlaps: VL (colour, atmosphere)
- CPIE coverage: CPIE VL Canon covers colour_philosophy, atmosphere_philosophy
- **Recommendation: REDUCE** — truncate to 150 chars, prefix with "[CONTEXT — NOT AUTHORITATIVE FOR VISUAL]"

### Section B: Location (moment data)
- Influence: HIGH (scene-specific dressing)
- Overlaps: Location Canon (contextual only)
- CPIE coverage: CPIE Location Canon covers architecture, era, condition — but this is scene-specific
- **Recommendation: KEEP** — scene-specific data, not canonical truth

### Section C: Character Identity
- Influence: HIGH
- Overlaps: Wardrobe Canon (wardrobe_signals, outfit fields)
- CPIE coverage: CPIE Wardrobe covers outfit fields; identity traits (sex, age, ethnicity, body, face) have NO CPIE domain
- **Recommendation: RESTRUCTURE**
  - Wardrobe fields: SUBORDINATE to CPIE Wardrobe (already done via conflict precedence + visual DNA enrichment)
  - Identity fields: KEEP as best available data (no CPIE source exists)
  - Add explicit note: "FACE/BODY identity traits are LLM-extracted — wardrobe fields below are CPIE-certified"

### Section D: Wardrobe Blocks
- Influence: HIGH
- Overlaps: CPIE Wardrobe Canon (primary_outfit, footwear, headwear, silhouette, fabric_palette)
- CPIE coverage: CPIE Wardrobe covers ALL these fields
- **Recommendation: SUBORDINATE** — already handled by E3 conflict precedence rule. Wardrobe blocks provide scene-specific context, CPIE provides canonical truth. Keep both with precedence.

### Section E: Visual Canon Primitives (resolveVisualCanonBlock)
- Influence: HIGH
- Overlaps: CPIE PD Canon (material_systems → dressing_style, surface_condition_systems → surface_condition, recurrent_symbolic_objects → hero_objects), CPIE VL (material, ritual, communication systems)
- CPIE coverage: PD Canon covers most; VL Canon covers some
- **Recommendation: REMOVE** — every primitive is covered by CPIE PD or VL domains:
  - material_systems → PD Canon: dressing_style, surface_condition
  - ritual_systems → PD Canon: environmental_storytelling
  - communication_systems → PD Canon: cultural_context
  - power_systems → PD Canon: institutional_culture
  - surface_condition_systems → PD Canon: surface_condition
  - recurrent_symbolic_objects → PD Canon: hero_objects

### Section E1: Visual Style Authority (resolveVisualStyleProfile)
- Influence: HIGH
- Overlaps: CPIE VL Canon (identity, is the source)
- CPIE coverage: This IS the CPIE source (primary: CPIE VL, fallback: project_visual_language)
- **Recommendation: KEEP** — this is CPIE-governed

### Section E2: Production Design Canon
- Influence: HIGH
- Overlaps: CPIE PD Canon (source: Projection dataset, not CPIE endpoint)
- CPIE coverage: CPIE PD Canon covers same fields but Projection dataset is richer (scene-specific)
- **Recommendation: KEEP** — scene-specific enrichment, CPIE precedence already set

### Section E3: CPIE All Domains
- Influence: HIGH
- Overlaps: ALL CPIE domains — this is the authority
- CPIE coverage: Complete
- **Recommendation: KEEP** — conflict precedence already added

### Section F: Scene Grounding
- Influence: MEDIUM
- Overlaps: None
- CPIE coverage: N/A
- **Recommendation: KEEP**

### Section G: Narrative Function
- Influence: LOW
- Overlaps: None
- CPIE coverage: N/A
- **Recommendation: KEEP**

### Section H: Hero Frame Mandate
- Influence: LOW (style directives)
- Overlaps: VSAL (camera, composition, photorealism)
- CPIE coverage: Camera/composition not in CPIE
- **Recommendation: KEEP**

## TASK 3 — Legacy World Foundation Decomposition

### resolveWorldBlock() Fields

| Field | Type | CPIE Coverage | Recommendation | Rationale |
|-------|------|-------------|---------------|-----------|
| era | VISUAL | Location Canon: construction_era | REMOVE | CPIE Location Canon covers |
| geography | VISUAL + NARRATIVE | No explicit CPIE geography field | CONVERT to context-only | Keep as narrative framing, not visual instruction |
| architecture | VISUAL | Location Canon: architecture_style | REMOVE | CPIE Location Canon covers |
| costume_language | VISUAL | Wardrobe Canon: era_alignment, silhouette, fabric_palette | REMOVE | CPIE Wardrobe Canon covers |
| technology_level | NARRATIVE | No CPIE field | KEEP as context | Not visual-authoritative, useful as narrative context |
| cultural_markers | NARRATIVE + VISUAL | No CPIE culture field | CONVERT to context-only | Keep as framing, remove visual authority weight |

### Safe To Keep (NON-VISUAL CONTEXT)
- technology_level (not in CPIE, narrative useful)
- world_rules (narrative constraints, not visual)

### Remove (covered by CPIE)
- era → Location Canon: construction_era
- architecture → Location Canon: architecture_style
- costume_language → Wardrobe Canon: era_alignment, silhouette, primary_outfit

### Convert To Context Only (keep as framing, subordinate to CPIE)
- geography → use as narrative description, not visual instruction
- cultural_markers → keep as context, no CPIE replacement exists

## TASK 4 — Visual Canon Primitives Audit

### resolveVisualCanonBlock() Fields

| Primitive | CPIE Domain | CPIE Field | Recommendation | Risk of Keeping |
|-----------|-------------|-----------|---------------|----------------|
| material_systems | PD Canon | dressing_style, surface_condition | REMOVE | HIGH — creates duplicate authority on material/surface decisions |
| ritual_systems | PD Canon | environmental_storytelling | REMOVE | MEDIUM — narrative context that could influence PD |
| communication_systems | PD Canon | institutional_culture | REMOVE | LOW — CPIE PD covers similar ground |
| power_systems | PD Canon | institutional_culture | REMOVE | LOW — CPIE PD covers |
| surface_condition_systems | PD Canon | surface_condition | REMOVE | HIGH — direct duplicate with CPIE PD |
| recurrent_symbolic_objects | PD Canon | hero_objects | REMOVE | HIGH — direct duplicate with CPIE PD |

### Verdict: REMOVE ALL
Every single primitive in `resolveVisualCanonBlock()` has a CPIE PD or VL field that covers the same semantic space. Keeping this block creates 6 simultaneous duplicate truths in the Hero Frame prompt. The conflict precedence rule already makes CPIE win, but the legacy block still consumes token space and creates model confusion.

## TASK 5 — Visual DNA Governance Audit

### generate-visual-dna-from-canon Field Analysis

| Field Category | Source(s) | CPIE Coverage | Blocks A-Grade? | Recommendation |
|---------------|-----------|-------------|----------------|---------------|
| Age | LLM (extract-visual-dna) | None | YES — no CPIE identity domain | KEEP as LLM; future Identity Canon domain needed |
| Gender/Sex | LLM (extract-visual-dna) | None | YES | KEEP as LLM |
| Ethnicity | LLM (extract-visual-dna) | None | YES | KEEP as LLM |
| Build/Body Type | LLM (extract-visual-dna) | None | YES | KEEP as LLM |
| Face | LLM (extract-visual-dna) | None | YES | KEEP as LLM |
| Hair | LLM (extract-visual-dna) | None | YES | KEEP as LLM |
| Skin | LLM (extract-visual-dna) | None | YES | KEEP as LLM |
| Voice | LLM (extract-visual-dna) | None | NO — not visual | KEEP as LLM |
| Clothing/Wardrobe | LLM + CPIE enrichment | Wardrobe Canon: yes | NO — already enriched | Add CPIE hard gate (block if CPIE fails) |
| Props | LLM + CPIE enrichment | Props Canon: yes | NO — already enriched | Add CPIE hard gate |
| Height | LLM (extract-visual-dna) | None | YES | KEEP as LLM |
| Social Class | LLM (extract-visual-dna) | None (PCP has class_structure) | NO — PCP has this | Consider CPIE PCP field |
| Role | LLM (extract-visual-dna) | None | NO | KEEP as LLM |

### Key Findings

1. **Identity traits (age, sex, ethnicity, build, face, hair, skin, height)** are pure LLM extraction with NO CPIE source. They cannot be CPIE-governed without adding an Identity Canon domain. These are NOT blocking A-grade governance of VISUAL fields — they are identity, not visual style.

2. **Wardrobe+Props fields** ARE CPIE-enriched but not CPIE-gated. The extraction is LLM-first, enrichment second. If CPIE fails, LLM-only data is persisted.

3. **The `extract-visual-dna` function** has zero CPIE awareness. All its categories come from LLM reading narrative text.

4. **The `character_visual_dna` table** is written from LLM-first data even when CPIE enrichment fires — the CPIE values REPLACE LLM values for overlapping fields, but the table structure is LLM-schema (traits array), not CPIE-schema.

### Bypass That Blocks A-Grade

The single change needed: **Add a CPIE hard gate to Visual DNA clothing/wardrobe+props extraction.** If CPIE is available, these fields MUST come from CPIE. If CPIE fails for wardrobe+props, the function should either:
a) Not write those fields (leave them null/empty)
b) Mark them as "low_confidence" with clear LLM source tag

The identity traits (age, sex, etc.) are a separate concern — they require a future Identity Canon domain.

## TASK 6 — A- Patch Plan

### Patch 1: Remove Visual Canon Primitives from Hero Frames

**Evidence:** Every primitive in resolveVisualCanonBlock() duplicates CPIE PD or VL fields.
**Risk:** LOW — CPIE PD covers all 6 primitives. Removal only removes duplicate truth.
**Governance Gain:** Eliminates 6 duplicate visual authorities. Moves from UNSAFE → REMOVED.

### Patch 2: Remove Visual Fields from World Foundation Block

**Evidence:** era, architecture, costume_language all covered by CPIE Location + Wardrobe.
**Risk:** LOW — CPIE covers these fields. Geography can be kept as narrative context.
**Governance Gain:** Eliminates 3 conflicting visual authorities. Moves from UNSAFE → REMOVED.

### Patch 3: Add CPIE Hard Gate to Visual DNA Wardrobe+Props

**Evidence:** CPIE enrichment exists but is non-blocking. LLM-first extraction persists even when CPIE is available.
**Risk:** LOW — CPIE endpoint is deployed and working. Only affects wardrobe+props fields.
**Governance Gain:** Visual DNA wardrobe+props fields become CPIE-gated. Moves from B- (enrichment) to A- (gated).

### Patch 4: Rewire Lookbook VSAL to CPIE VL Canon

**Evidence:** Lookbook reads from `project_visual_style` table (separate schema from CPIE VL Canon). Lighting, color, texture, realism are split sources.
**Risk:** MEDIUM — requires modifying shared visualStyleAuthority.ts to add CPIE primary path.
**Governance Gain:** Lookbook color/lighting/texture/realism fields become CPIE-governed. Moves from SPLIT/UNSAFE → SUBORDINATED.

### Patch 5: Rewire VPB to CPIE endpoint

**Evidence:** VPB reads entirely from canonJson (visual_canon_brief + production_design). Zero CPIE.
**Risk:** MEDIUM — VPB has complex markdown-to-signal parsing. CPIE fields don't map 1:1.
**Governance Gain:** VPB era, architecture, material, palette fields become CPIE-governed.

### Minimal Patch Priority (for B+ → A-)

The goal is A- with minimal changes. The patches that deliver most governance gain per risk:

**PATCH 1 (Required, Low Risk):** Remove visual canon primitives from Hero Frames
**PATCH 2 (Required, Low Risk):** Remove visual fields from World Foundation block
**PATCH 3 (Required, Low Risk):** Add CPIE hard gate to Visual DNA wardrobe+props
**PATCH 4 (Optional, Medium Risk):** Rewire Lookbook VSAL to CPIE
**PATCH 5 (Optional, Higher Risk):** Rewire VPB to CPIE

### A- Success Definition

A- (Projection mostly governed, legacy subordinate) requires:

1. Hero Frames: LEGACY UNSAFE sections either removed or formally subordinated ✓ (Patches 1+2 + existing precedence rule)
2. Hero Frames: Visual authority comes from CPIE or has explicit subordination ✓ (Patches 1+2)
3. Visual DNA: Wardrobe+props fields CPIE-gated ✓ (Patch 3)
4. Identity fields: NOT required for A- (no CPIE identity domain exists)
5. Lookbook/VPB: NOT required for A- (separate projection consumers not part of this patch scope)

## TASK 7 — Reclassification

### Current Grade: B+

Evidence:
- Hero Frames: CPIE blocks (E1+E3) injected with conflict precedence ✓
- 3 LEGACY UNSAFE sections remain (A3 world foundation, E visual canon primitives, C character identity)
- Lookbook: No CPIE integration
- VPB: No CPIE integration
- Visual DNA: CPIE enrichment but no hard gate
- CDG traversal: Not wired
- Identity fields: No CPIE source

### Projected Grade After Patch (Patches 1-3): A-

Gain evidence:
- Patch 1 removes 6 UNSAFE fields from Hero Frame prompt
- Patch 2 removes 3 UNSAFE fields from World Foundation block
- Patch 3 hard-gates Visual DNA wardrobe+props on CPIE

Remaining downgrades:
- Lookbook still legacy-only: - (separate consumer, not blocking Hero Frame grade)
- VPB still legacy-only: - (same)
- Identity traits still LLM-only: - (no Identity Canon domain exists)
- CDG traversal not wired: - (separate concern)

### Final Classification: A- (Projection mostly governed, legacy subordinate)

This is correct because:
- Hero Frames are the PRIMARY visual projection (highest visibility, most complex)
- All UNSAFE legacy blocks in Hero Frames are REMOVED or SUBORDINATED
- Visual DNA wardrobe+props are CPIE-gated
- The remaining gaps (Lookbook, VPB, Identity Canon) are separate consumers requiring their own future audit, not blocking Hero Frame A- governance
- Identity fields are identity, not visual — they require a future domain

### Validation Requirements

After patches:
1. Hero Frame tests pass (both existing CPIE tests + new conflict tests)
2. Visual DNA tests pass (wardrobe+props CPIE gating)
3. tsc --noEmit clean
4. vite build clean
5. All projection consumers still produce valid output

### Definition of Done

- [ ] Patch 1: Visual Canon Primitives removed from Hero Frame prompt generation
- [ ] Patch 2: Visual fields removed from World Foundation block in Hero Frames (and Lookbook)
- [ ] Patch 3: CPIE hard gate added to Visual DNA wardrobe+props fields
- [ ] All existing functionality preserved
- [ ] Full regression clean
- [ ] Classification: A-
