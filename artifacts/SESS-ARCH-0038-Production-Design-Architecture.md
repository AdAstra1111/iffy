# SESS-ARCH-0038 — Production Design Architecture Design
**Oracle** | 2026-05-30 | Architecture-Strict Mode

## Verdict: **B — Approved with Revisions** ✅

**Live CPIE Domains (6/7):**
Wardrobe ✅ | Props ✅ | Vehicles ✅ | Creatures ✅ | Location ✅ | VL ✅

**Pending:** Production Design ⬜

---

## R1 — Final PD Canon Schema

### Final PD Fields (8 ICS groups)

Reduced from 20 audited fields to 8 final consolidated fields.

| ICS # | Final Field | Grouped From | Type |
|-------|-------------|-------------|------|
| PD-1 | dressing_style | set_dressing, furniture_language, object_arrangement | Deterministic |
| PD-2 | surface_treatment | surface_treatment, wall_treatment, floor_treatment | Deterministic |
| PD-3 | institutional_culture | signage, graphic_design, institutional_details, cultural_artifacts | Deterministic |
| PD-4 | environmental_story | environmental_storytelling, clutter_density, wear_patterns | Deterministic |
| PD-5 | scene_specific_dressing | practical_set_modifications, scene_specific_dressing | Hybrid |
| PD-6 | hero_background_objects | hero_objects, symbolic_objects, background_objects | Hybrid |
| PD-7 | color_accents | color_accents, texture_accents | Hybrid (VL-constrained) |
| PD-8 | atmosphere_physics | clutter_density (physical), smoke, dust, temperature_feel | Hybrid |

### Field Detail

#### PD-1: dressing_style
Overall dressing philosophy. What fills the room, furniture arrangement, feel.
- Owner: PD Canon. Type: Deterministic. Confidence: 0.72-0.88.
- Downstream: VPB (Set Design), Hero Frames (background), Video Gen (object placement).
- Triggers: spatial_function + period + genre.
- Examples: cluttered_noir_ambient, cozy_hospitality_warmth, military_austere.

#### PD-2: surface_treatment
Wall, floor, surface finishes. What surfaces look like physically.
- Owner: PD Canon. Type: Deterministic. Confidence: 0.68-0.85.
- Downstream: VPB (Set Design), Hero Frames (material context), Video Gen (surface rendering).
- Triggers: spatial_function + period + material_palette (from LC).
- Examples: dark_wainscoting_worn_wood, white_tiled_clinical, exposed_brick.

#### PD-3: institutional_culture
Signage, graphics, institutional details, cultural artifacts.
- Owner: PD Canon. Type: Deterministic. Confidence: 0.68-0.82.
- Downstream: VPB (Cultural Details), Lookbook (worldbuilding).
- Triggers: spatial_function + culture + period.
- Examples: police_evidence_walls_booking_desk, hospital_reception_charts.

#### PD-4: environmental_story
What the space says about inhabitants. Lived-in feel, clutter, wear.
- Owner: PD Canon. Type: Deterministic. Confidence: 0.65-0.80.
- Downstream: VPB (Environmental Storytelling), Lookbook (world mood).
- Triggers: spatial_function + class_structure + economy + genre.
- Examples: working_class_lived_in, wealthy_pristine, abandoned_decaying.

#### PD-5: scene_specific_dressing
Modifications unique to a scene (party decor, fight aftermath, moved furniture).
- Owner: PD Canon. Type: Hybrid. Base: 60% deterministic. Enhancement: 40% LLM.
- Confidence: 0.50-0.72 (base), 0.35-0.55 (enhanced).
- Downstream: VPB (Scene-Specific), Video Gen (per-scene variation).
- Base values: baseline_unmodified, pre_event_arrangement, post_crisis.

#### PD-6: hero_background_objects
Narrative-significant background objects NOT interactable as props.
- Owner: PD Canon. Type: Hybrid. Base: 55% deterministic. Enhancement: 45% LLM.
- Confidence: 0.55-0.72 (base), 0.30-0.50 (enhanced).
- Downstream: VPB (Environmental), Hero Frames (background), Video Gen (objects).
- Base values: bar_cigarette_machine_dartboard, office_water_cooler_plant.

#### PD-7: color_accents
Physical object colors. NOT photographic grade. Must be VL-compatible.
- Owner: PD Canon (VL-constrained). Type: Hybrid. Base: 60% deterministic. Enhancement: 40% LLM.
- Confidence: 0.60-0.78 (base), 0.40-0.60 (specific).
- Downstream: VPB (Color and Texture), Lookbook (accent palette), Video Gen (object colors).
- Constraint: MUST be within VL colour_philosophy range.
- Base values: warm_amber_accents, cool_blue_accent, neutral_with_gold.

#### PD-8: atmosphere_physics
Physical atmosphere: smoke, dust, steam, temperature indicators.
- Owner: PD Canon (shared boundary with LC + VL). Type: Hybrid.
- LC boundary: LC owns installed ventilation/HVAC. PD owns temporary haze/dust.
- VL boundary: VL owns atmospheric light interaction. PD owns physical hardware+density.
- Confidence: 0.60-0.78 (base), 0.35-0.55 (enhanced).
- Examples: smoke_haze_moderate, dust_visible_dry, steam_humid, none.

### CDG Mapping

All 8 PD fields map to Canon Node D6. CPIE Node: C6 to D6.
Upstream: LC (C5), VL (C7), Props (C2), Wardrobe (C1), PCP via LC/VL.

---

## R2 — ICS Model

### 8 Scoring Groups

| ICS Slot | Field | Required | Weight |
|----------|-------|----------|--------|
| ICS-1 | dressing_style | Required | 1.0 |
| ICS-2 | surface_treatment | Required | 1.0 |
| ICS-3 | institutional_culture | Required | 1.0 |
| ICS-4 | environmental_story | Required | 1.0 |
| ICS-5 | scene_specific_dressing | Optional | 1.0 |
| ICS-6 | hero_background_objects | Optional | 1.0 |
| ICS-7 | color_accents | Required | 1.0 |
| ICS-8 | atmosphere_physics | Optional | 1.0 |

### Scoring Methodology

ICS = (required_inferred + optional_inferred / 2) / 8

required_inferred = count of ICS-1 through ICS-4 and ICS-7 (5 required)
optional_inferred = count of ICS-5, ICS-6, ICS-8 (3 optional, halved)

### Minimum Viable Coverage

- Full: 1.0-0.88 (all 5 required + all optionals)
- Good: 0.75-0.88 (all 5 required + 50% optionals)
- Adequate: 0.50-0.75 (4/5 required)
- Minimal: 0.25-0.50 (3/5 required)

Target: 0.75+ for all venue-based locations.

---

## R3 — Entity Model

### Three-Scale Resolution

| Scale | Owner | Description | Phase |
|-------|-------|-------------|-------|
| Venue-level | PD Canon | Baseline dressing per location type | Phase 1 (primary) |
| Room-level | PD Canon | Per-room variations within venue | Phase 2 (optional) |
| Scene-level | PD Canon | Scene-specific modifications | Phase 3 (optional) |

### Ownership by Scale

| Field | Venue | Room | Scene |
|-------|-------|------|-------|
| dressing_style | Primary | Inherited | Inherited |
| surface_treatment | Primary | May override | Inherited |
| institutional_culture | Primary | Inherited | Inherited |
| environmental_story | Primary | Adjusted | Adjusted |
| scene_specific_dressing | Baseline default | Baseline default | Primary |
| hero_background_objects | Generic per function | Room-specific | Scene-specific |
| color_accents | Primary palette | Adjusted | Inherited |
| atmosphere_physics | Baseline | Adjusted | Per scene |

### Duplicate Truth Rule

A field cannot be set at both venue-level and room-level. Room-level overrides are documented as modifications (not replacements).

---

## R4 — Registry Architecture

### Anchor Count: 42

| Field Group | Anchors | Strategy |
|-------------|---------|----------|
| dressing_style | 8 | spatial_function x genre |
| surface_treatment | 6 | spatial_function x period |
| institutional_culture | 6 | spatial_function x culture x period |
| environmental_story | 6 | spatial_function x class x economy |
| scene_specific_dressing | 4 | scene_cue_baseline |
| hero_background_objects | 4 | spatial_function x genre |
| color_accents | 4 | VL_canon x genre x spatial_function |
| atmosphere_physics | 4 | genre x spatial_function |
| Catch-all fallbacks | 4 | priority 0, generic values |
| **Total** | **~42** | |

### Primary Axes

| Axis | Strength | Impact |
|------|----------|--------|
| spatial_function | Very strong (primary) | Single strongest PD predictor |
| period | Strong (secondary) | Changes every aspect |
| genre | Strong (secondary) | Modifies baseline |
| class_structure | Moderate (tertiary) | Wealth vs poverty |
| economy | Moderate (tertiary) | Boom vs depression |
| culture | Moderate (tertiary) | Western vs Japanese vs African |
| institution | Mild (tertiary) | Police vs hospital vs church |
| condition | Mild (tertiary) | New vs worn vs ruined |

### Compression Strategy

Spatial_function-first, period-second, genre-third.

Pub (8 base anchors)
  period contemporary to modern bar
  period medieval to wood benches hearth
  period 1940s to art deco bar
  period future to synth-bar chrome
  genre noir to shadows clutter amber
  genre fantasy to magical artifacts crests
  genre scifi to sleek surfaces glass

### Compression Ratio

Uncompressed: 11 spatial x 8 period x 6 genre = ~528
Compressed: 42
Ratio: ~8%
PD has highest compression ratio because most variance is captured by spatial_function alone.

---

## R5 — Deterministic vs Hybrid Split

| Class | Count | Fields |
|-------|-------|--------|
| A — Deterministic | 4 | dressing_style, surface_treatment, institutional_culture, environmental_story |
| B — Hybrid | 4 | scene_specific_dressing, hero_background_objects, color_accents, atmosphere_physics |
| C — LLM-only | 0 | None |

### Why PD Has 4 Hybrid Fields

1. scene_specific_dressing: Registry provides baseline; narrative context provides scene modifications (bar fight, party).
2. hero_background_objects: Registry provides generic objects per function; narrative provides specific meaningful objects.
3. color_accents: Registry provides color family (VL-constrained); LLM picks specific accent object colors.
4. atmosphere_physics: Registry provides presence and density; LLM chooses specific implementation.

All hybrid fields have 55%+ deterministic base. Enhancement is optional.

---

## R6 — LC to VL to PD Dependency Model

### Formal Chain

PCP to LC to PD  (plus PCP to VL to PD)

PD ONLY reads from LC and VL. Never reads PCP directly.

### What PD Consumes from LC

| LC Field | PD Use |
|----------|--------|
| spatial_function | Primary anchor driver |
| architecture_style | Constrains surface_treatment |
| material_palette | Constrains dressing and surface colors |
| lighting_character | Constrains color_accents warm/cool |
| condition | Constrains environmental_story |

### What PD Consumes from VL

| VL Field | PD Use |
|----------|--------|
| colour_philosophy | Primary constraint on color_accents |
| saturation_profile | Constrains color_accents saturation range |
| realism_level | Constrains environmental_story (stylized vs grounded) |
| atmosphere_philosophy | Informs atmosphere_physics presence and density |

### Dependency Matrix (Simplified)

| LC/VL Input | PD-1 | PD-2 | PD-3 | PD-4 | PD-5 | PD-6 | PD-7 | PD-8 |
|-------------|------|------|------|------|------|------|------|------|
| sp_function | STRONG | STRONG | STRONG | MOD | MOD | MOD | MILD | MILD |
| architecture | MILD | STRONG | - | - | - | - | - | - |
| material | MILD | STRONG | - | - | - | - | MOD | - |
| lighting_char | - | - | - | - | - | - | STRONG | - |
| condition | - | MILD | - | STRONG | - | - | - | MILD |
| colour_phil | - | - | - | - | - | - | STRONG | - |
| saturation | - | - | - | - | - | - | MOD | - |
| realism | - | - | - | MOD | - | - | - | - |
| atmosphere | - | - | - | MILD | - | - | - | STRONG |

### What PD Does NOT Consume

- Props (interactive objects)
- Wardrobe (character-worn clothing)
- Vehicles (not environmental)
- Creatures (not environmental)

---

## R7 — Governance Model

### Example: "Why was this pub dressed as working class?"

Input: pub, genre:crime, economy:depression, class:stratified

working_class_daily_lived-in (pub's environmental_story)
  Source: inferred (confidence: 0.82)
  Because: LC.spatial_function=hospitality to pub_baseline_working,
           PCP.economy=depression to worn_practical_furnishings,
           PCP.class_structure=stratified to visible_class_divide,
           genre=crime to signs_of_desperation
  Registry rule: pd_pub_depression_env_story
  Dependencies: spatial_function, economy, class_structure, genre

### Example: "Why was clutter density high?"

Input: pub, genre:noir, class:stratified, economy:industrial

high_clutter_noir_detritus (pub's environmental_story)
  Source: inferred (confidence: 0.78)
  Because: genre=noir to high_clutter_ambient_presence,
           LC.spatial_function=hospitality to baseline_clutter,
           PCP.economy=industrial to utilitarian_display
  Registry rule: pd_noir_clutter_env_genre
  Dependencies: spatial_function, genre, economy

### Example: "Why was environmental_story military?"

Input: barracks, genre:war, period:1940s, class:military_hierarchy

military_austere_functional (barracks' environmental_story)
  Source: inferred (confidence: 0.85)
  Because: LC.spatial_function=military to barracks_environment,
           PCP.period=1940s to WWII_military_austerity,
           PCP.class_structure=military_hierarchy to rank_visible,
           genre=war to combat_ready_functional
  Registry rule: pd_military_1940s_env_story
  Dependencies: spatial_function, period, class_structure, genre

---

## R8 — Sparse Narrative Demonstration

### Input: "A detective enters a pub."

### Location Canon (CERTIFIED)

architecture_style:      contemporary_commercial
spatial_function:        hospitality
material_palette:        wood_brick_leather
lighting_character:      warm_candlelit_moderate
condition:               functional_worn

### Visual Language Canon (CERTIFIED)

colour_philosophy:       warm_amber_with_teal_shadows
lighting_philosophy:     low_key_practical_motivated
contrast_model:          high_contrast_noir
saturation_profile:      muted_warm
atmosphere_philosophy:   haze_smoke_present_light
realism_level:           grounded_stylized

### Production Design Canon (PROPOSED)

dressing_style:          cluttered_noir_ambient_wood_brass_glass  (pd_pub_noir_dressing)
surface_treatment:       dark_wainscoting_worn_wood_planks         (pd_pub_contemporary_surface)
institutional_culture:   pub_regulars_bar_memorabilia_license      (pd_pub_culture_western)
environmental_story:     working_class_neighborhood_lived_in        (pd_pub_noir_env_story)
scene_specific_dressing: baseline_unmodified                       (pd_pub_baseline_scene)
hero_background_objects: cigarette_machine_dartboard_jukebox       (pd_pub_noir_hero_objects)
color_accents:           warm_amber_brown_with_red_stool_accent     (pd_pub_vl_warm_color)
atmosphere_physics:      smoke_haze_present_light                  (pd_noir_atmosphere)

### Zero Duplicate Truth

| Concept | Owner | Evidence |
|---------|-------|----------|
| Building | LC | architecture_style: contemporary |
| Light exists | LC | lighting_character: warm_candlelit |
| How shot | VL | lighting_philosophy: low_key |
| Photographic color | VL | colour_philosophy: warm_amber |
| Furniture | PD | dressing_style: cluttered_noir |
| Wall finish | PD | surface_treatment: dark_wainscoting |
| Signage | PD | institutional_culture: pub_license |
| Interactive notebook | Props | primary_prop: detective_notebook |
| Character coat | Wardrobe | primary_outfit: trench_coat |
| Camera choice | VL | lens_philosophy: spherical_mid_wide |

Every concept has exactly one owner. Zero duplicate truth across all 6 domains.

---

## R9 — Downstream Contracts

### PD to Hero Frames

| Field | Classification | Reason |
|-------|---------------|--------|
| dressing_style | Required | Background object context |
| surface_treatment | Required | Material and lighting surface context |
| color_accents | Strongly Recommended | Background accent colors |
| environmental_story | Recommended | Background mood |
| hero_background_objects | Optional | Notable background objects |
| institutional_culture | Optional | Institutional context |

### PD to Lookbook

| Field | Classification | Slide |
|-------|---------------|-------|
| dressing_style | Required | World slides |
| surface_treatment | Required | World slides |
| institutional_culture | Strongly Recommended | World/cultural slides |
| environmental_story | Strongly Recommended | Themes slides |
| color_accents | Required | Visual Identity slide |

### PD to VPB

| VPB Section | PD Fields | Always |
|-------------|-----------|--------|
| Set Design Overview | dressing_style, surface_treatment | Always |
| Color and Texture Strategy | color_accents | Always |
| Environmental Storytelling | environmental_story, institutional_culture | Always |
| Scene-Specific Dressing | scene_specific_dressing | When applicable |
| Hero and Background Objects | hero_background_objects | Always |
| Atmosphere and Physical Effects | atmosphere_physics | When applicable |

VPB renders PD canon. Never infers PD independently.

### PD to Future Video Gen

| Field | Classification | Usage |
|-------|---------------|-------|
| dressing_style | Required | Scene background object placement |
| surface_treatment | Required | Surface material rendering |
| color_accents | Required | Object color specification |
| environmental_story | Strongly Recommended | Scene atmosphere |
| hero_background_objects | Strongly Recommended | Background objects in frame |
| atmosphere_physics | Required | Atmospheric particles (smoke, dust) |

PD is the MOST CRITICAL canon for video generation. Every visible object must be PD-consistent.

---

## R10 — Implementation Readiness

### All Prerequisites Satisfied

| Check | Status |
|-------|--------|
| CPIE domain pd registered | PASS |
| ICS count 8 allocated | PASS |
| CDG mapping C6 to D6 | PASS |
| All 4 ownership boundaries | PASS (LC, VL, Props, Wardrobe) |
| Entity model | PASS (venue-level primary) |
| Registry architecture | PASS (42 anchors) |
| ICS model | PASS (5 required + 3 optional) |
| Deterministic/hybrid split | PASS (4 det, 4 hybrid) |
| Governance model | PASS |
| Sparse narrative zero-dup | PASS |
| Downstream contracts | PASS |

### Remaining Blockers: NONE

### Implementation Estimate

| Component | Files | Lines |
|-----------|-------|-------|
| Registry anchors (42) | 1 | 250-300 |
| Domain processor (pd.ts) | 1 | 60-80 |
| Engine integration | 1 | +15 |
| CDG integration | 1 | +2 |
| Tests (4 files) | 4 | 250-350 |
| **Total** | **5-7 files** | **~600-800** |

### Smallest CPIE Domain

PD (42 anchors) < VL (72 anchors) < Location (120 anchors).

PD is smallest because upstream domains absorb 60% of inferential complexity.

### Final Verdict: B — Approved with Revisions

**Ready for implementation when triggered.**
