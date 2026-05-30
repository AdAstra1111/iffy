# SESS-ARCH-0037 — Production Design Ownership Audit
**Oracle** | 2026-05-30 | Architecture-Strict Mode

## Verdict: **B — Approved with Revisions** ✅

**Live CPIE Domains (6/7):**
Wardrobe ✅ | Props ✅ | Vehicles ✅ | Creatures ✅ | Locations ✅ | VL ✅

**Pending:** Production Design ⬜

---

## Q1 — Ownership Matrix

### Layer Hierarchy

| Layer | Role | Example | Source |
|-------|------|---------|--------|
| **PCP** | Context — what the world IS | genre, period, culture, class | extraction |
| **LC** | Permanent built environment | architecture, installed lighting | CPIE (certified) |
| **VL Canon** | How the world is PHOTOGRAPHED | contrast, colour, lighting, lens | CPIE (certified) |
| **Prop Canon** | Discrete interactable objects | notebook, weapon, glass, phone | CPIE (certified) |
| **Wardrobe Canon** | Character-worn design | trench coat, armor, uniform | CPIE (certified) |
| **PD Canon** | World-worn design, environmental dressing | furniture, walls, clutter, objects at rest | **NEW — this audit** |
| **Projection** | Downstream presentation | image prompts, deck slides, bibles | RENDERS from canon |

### Candidate Field Ownership Matrix

| # | Field | Owner | Source | Rationale |
|---|-------|-------|--------|-----------|
| 1 | **set_dressing** | **PD Canon** | Inference | Environmental objects at rest — not discrete props |
| 2 | **furniture_language** | **PD Canon** | Inference | Physical furniture — not character, not permanent |
| 3 | **object_arrangement** | **PD Canon** | Inference | How objects are placed — PD staging |
| 4 | **environmental_storytelling** | **PD Canon** | Inference | What the set says about inhabitants |
| 5 | **surface_treatment** | **PD Canon** | Inference | Wall/floor/ceiling finish — temporary modification |
| 6 | **wall_treatment** | **PD Canon** | Inference | Paint, wallpaper, panels — temporary set modification |
| 7 | **floor_treatment** | **PD Canon** | Inference | Floor coverings, wear patterns |
| 8 | **signage** | **PD Canon** | Inference | In-world signs, labels, notices |
| 9 | **graphic_design** | **PD Canon** | Inference | In-world graphics, logos, posters, labels |
| 10 | **institutional_details** | **PD Canon** | Inference | Police badges, hospital charts, office org — not character-worn |
| 11 | **cultural_artifacts** | **PD Canon** | Inference | Objects representing culture (religious icons, art, flags) |
| 12 | **clutter_density** | **PD Canon** | Inference | How full/empty the environment is |
| 13 | **wear_patterns** | **PD Canon** | Inference | Physical wear on surfaces — foot traffic, age, use |
| 14 | **practical_set_modifications** | **PD Canon** | Inference | Scene-specific changes (broken door, moved furniture) |
| 15 | **scene_specific_dressing** | **PD Canon** | Inference | Dressing that changes per scene (party decor, disaster aftermath) |
| 16 | **hero_objects** | **PD Canon** | Inference | IN-WORLD objects of narrative significance (NOT props) |
| 17 | **background_objects** | **PD Canon** | Inference | Filler objects for environmental density |
| 18 | **symbolic_objects** | **PD Canon** | Inference | Objects carrying thematic meaning (cross, rose, crown) |
| 19 | **color_accents** | **PD Canon** | Inference | Physical object color accents in the set — NOT VL color grade |
| 20 | **texture_accents** | **PD Canon** | Inference | Physical surface texture accents — NOT VL grain |

### Summary

| Owner | Count | Fields |
|-------|-------|--------|
| **PD Canon** | **20** | All candidate fields |
| LC | 0 | Permanent features only — see Q2 |
| VL Canon | 0 | Cinematographic only — see Q3 |
| Prop Canon | 0 | Discrete objects only — see Q4 |
| Wardrobe Canon | 0 | Character-worn only — see Q5 |
| PCP | 0 | Context signals only |
| Projection | 0 | Renders PD outputs — never infers |

---

## Q2 — PD vs Location Boundary

### Formal Boundary Rule

> **Location Canon owns permanent/inherent spatial truth. Production Design owns every modifiable, placed, dressed, arranged, or scene-specific truth.**

**LC** = What was BUILT. The room itself. The building's hardware.
**PD** = What was PLACED. The dressing, modifications, and temporary changes.

### Classification Matrix

| Element | Owner | Rationale |
|---------|-------|-----------|
| **Stone wall** | **LC** | Permanent architecture. Part of the building. |
| **Torch sconce** | **LC** (if installed) / **PD** (if brought in) | LC = built-in fixture. PD = temporary addition. |
| **Furniture placement** | **PD** | Physical objects arranged by PD. Not permanent. |
| **Tapestries** | **PD** | Wall dressing. Hanging — not architecture. |
| **Broken window** | **Shared** — LC = window frame and glazing. PD = broken state, shards, boarding. |
| **Blood smear** | **PD** | Scene-specific surface treatment. Not permanent. |
| **Cigarette ashtray** | **Prop Canon** (if interactable) / **PD** (if only environmental) | See Q4 boundary. If characters use it = prop. If it's just set dressing = PD. |
| **Desk layout** | **PD** | Physical arrangement of furniture. Not permanent. |
| **Wall posters** | **PD** | Graphic design posted on walls. Not permanent. |

### Boundary Decision Tree

```
Is the element part of the building's original construction?
  YES → Location Canon
  NO  → Is it a permanent installed fixture (hardwired, structural)?
         YES → Location Canon
         NO → Production Design Canon
```

### Enumeration of LC-owned elements that PD never touches

- Wall structure (studs, framing)
- Window/door openings
- Floor structure
- Ceiling height and shape
- Installed light fixtures (hardwired)
- Power outlets, switches
- Permanent pipes, radiators
- Structural columns, beams
- Staircase structure (not handrails/decorative)
- Building exterior envelope

---

## Q3 — PD vs Visual Language Boundary

### Formal Boundary Rule

> **Visual Language owns how the world is PHOTOGRAPHED. Production Design owns what is PHYSICALLY ARRANGED in the world.**

**VL** = Cinematographic choices. Light, color, lens, movement.
**PD** = Physical choices. What objects exist, how they appear, where they sit.

### Classification Matrix

| Element | Owner | Rationale |
|---------|-------|-----------|
| **Low-key contrast** | **VL** | Cinematographic lighting technique. How the DP shoots. |
| **Desaturated palette** | **VL** | Photographic color philosophy. How the image is graded. |
| **Red accent object** | **PD** | Physical object with red color. WHAT is on set. |
| **Smoke machine haze** | **PD** (physical) / **VL** (how it reads in frame) | **Shared** — PD decides if smoke machines are used as physical atmosphere. VL decides how smoke interacts with light. |
| **Dust in light beam** | **PD** (physical dust particles stirred) / **VL** (backlighting that reveals dust) | **Shared** — PD = physical dust/practical. VL = light angle revealing it. |
| **Neon sign** | **PD** | Physical sign on set. WHAT it says, where it hangs. |
| **Reflective surface** | **PD** | Physical surface property. PD chooses the material. |
| **Symmetrical arrangement** | **PD** | Physical arrangement of objects on set. |

### The Color Line

**VL `colour_philosophy` = photographic intent.** E.g., "warm_amber_with_teal_shadows" — this is the color grade look.

**PD `color_accents` = physical object colors.** E.g., "red bar stool, green glass bottles" — these are physical objects.

**Rule:** PD color accents must be COMPATIBLE with VL colour_philosophy, but PD owns the physical color choice. VL colour_philosophy gives the RANGE; PD picks specific objects within that range.

### The Texture Line

**VL `texture_philosophy` = photographic grain treatment.** E.g., "organic_grain_moderate".

**PD `texture_accents` = physical surface textures.** E.g., "rough brick, polished brass, worn leather".

**Rule:** VL grain is a photographic overlay. PD texture is a physical property. They coexist — VL grain sits on top of PD texture.

---

## Q4 — PD vs Props Boundary

### Formal Boundary Rule

> **Prop Canon owns discrete objects usable or interacted with by characters. PD Canon owns environmental dressing, background objects, and object ecosystems.**

**Prop** = Objects in USE. Character-adjacent. Functional or narrative.
**PD** = Objects at REST. Environment-adjacent. Atmospheric or ambient.

### Classification Matrix

| Element | Owner | Rationale |
|---------|-------|-----------|
| **Detective notebook** | **Prop Canon** | Character uses it. Interactable. Takes it places. |
| **Beer glass on bar** | **Prop Canon** | Character will drink from it. Interactive context. |
| **Newspapers on table** | **Prop Canon** (if readable) / **PD** (if purely decorative stack) | **Boundary depends on narrative context.** |
| **Wall-mounted clock** | **PD** | Environmental dressing. Not taken or used by characters in most scenes. |
| **Weapon on desk** | **Prop Canon** | Character will interact with it. |
| **Stacked crates** | **PD** | Environmental object ecosystem. Filler for density. |
| **Market stall goods** | **PD** | Environmental array of objects. Not all interactable. |
| **Family photos on shelf** | **PD** | Environmental dressing. Storytelling through objects. |
| **Potted plant** | **PD** | Background environmental object. |
| **Ashtray full of butts** | **Prop** (if used) / **PD** (if purely environmental) | Context-dependent. |

### Decision Tree

```
Is the object primarily used/interacted with by a named character?
  YES → Prop Canon
  NO → Does the object advance narrative through its existence
        (environmental storytelling)?
         YES → PD Canon (as scene_specific_dressing or hero_objects)
         NO → PD Canon (as background_objects or clutter_density)
```

### The Core Insight

PD owns the SPACE and its ATMOSPHERE. Props own the THINGS. The distinction is about **interactivity** — if the audience would notice a character pick it up, it's a prop. If it just exists in the background creating texture, it's PD.

---

## Q5 — PD vs Wardrobe Boundary

### Formal Boundary Rule

> **Wardrobe Canon owns character-worn design. PD Canon owns world-worn design.**

**Wardrobe** = What characters WEAR.
**PD** = What the ENVIRONMENT wears.

### Classification Matrix

| Element | Owner | Rationale |
|---------|-------|-----------|
| **Uniform** | **Wardrobe Canon** | Worn by character. Direct wardrobe. |
| **Coat on hook** | **PD** | Environmental clothing. Not being worn. Creates atmosphere. |
| **Laundry pile** | **PD** | Environmental clutter. Not character-worn. |
| **Tailor shop racks** | **PD** | Environmental dressing. Array of clothing as set design. |
| **Costume mannequins** | **PD** | Environmental props showing clothing as atmosphere. |
| **Armor display** | **PD** | Displayed armor. Not worn. Set dressing. |
| **Wardrobe itself (furniture)** | **PD** | Furniture piece containing clothing. The FURNITURE is PD. |

### Two Key Tests

**The hole test:** Does removing the element leave a "hole"? If it's a uniform on a character, there's a hole — wardrobe. If it's a coat on a hook, the hook stays — PD.

**The ownership test:** If the element moves with the character scene to scene, it's wardrobe. If it stays in the room, it's PD.

---

## Q6 — PD vs VPB Boundary

### Formal Boundary Rule

> **VPB RENDERS Production Design Canon. VPB never infers PD fields independently.**

VPB has a "Production Design" section. This section reads from:
1. PD Canon (primary — deterministic inference outputs)
2. LC Canon (for permanent architectural descriptions)
3. VL Canon (for photographic treatment context)
4. Prop/Vehicle/Creature Canons (for object descriptions)

### VPB PD Section Structure

| Subsection | Sources | PD Fields Consumed |
|------------|---------|--------------------|
| **Set Design Overview** | PD Canon | set_dressing, furniture_language, surface_treatment |
| **Color & Texture Strategy** | PD Canon + VL Canon | color_accents, texture_accents (+ VL colour_philosophy for consistency) |
| **Environmental Storytelling** | PD Canon | environmental_storytelling, hero_objects, symbolic_objects |
| **Clutter & Density** | PD Canon | clutter_density, wear_patterns, background_objects |
| **Scene-Specific Dressing** | PD Canon | scene_specific_dressing, practical_set_modifications |
| **Cultural & Institutional Details** | PD Canon | signage, graphic_design, institutional_details, cultural_artifacts |

### Reading Order for VPB PD Section

1. Read PD Canon (from CPIE inference) for all 20 PD fields
2. Read LC Canon for permanent architecture context
3. Read VL Canon for color/lighting context (constraints)
4. Merge: PD outputs + LC constraints + VL constraints → VPB prose
5. **PD outputs are NEVER inferred during VPB generation**

---

## Q7 — Registry Feasibility

### Anchor Count Estimate

| PD Field Group | Anchors | Strategy |
|----------------|---------|----------|
| Set dressing core | 4-5 | genre × spatial_function |
| Furniture language | 6-8 | spatial_function × period × class |
| Surface/wall/floor treatment | 6-8 | spatial_function × period × culture |
| Signage & graphic design | 3-4 | institution × period |
| Cultural artifacts | 3-4 | culture × period |
| Clutter & wear | 4-5 | spatial_function × economy × class |
| Scene-specific dressing | 3-4 | narrative_function × genre |
| Hero & symbolic objects | 3-4 | narrative_function × genre × culture |
| Color/texture accents | 4-5 | VL canon × genre × period |
| **Total** | **~40-50** | **Composable** |

### Axes (Driver Dimensions)

| Axis | Type | Strength | Example |
|------|------|----------|---------|
| **spatial_function** | Primary | Very strong | Pub → bar tables, stools, beer taps |
| **period** | Primary | Very strong | 1940s → wood desks, typewriters, rotary phones |
| **genre** | Secondary | Strong | Noir → shadows, clutter, amber lighting |
| **culture** | Secondary | Strong | Japanese → screens, tatami, minimalism |
| **class_structure** | Tertiary | Moderate | Wealthy → ornate furniture, expensive art |
| **economy** | Tertiary | Moderate | Boom → new, clean. Depression → worn, sparse |
| **institution** | Tertiary | Moderate | Police → filing cabinets, bulletin boards, lockers |
| **VL canon** | Constraint | Weak | VL colour_philosophy → PD color accents compatible |

### Compression Strategy

**Spatial_function-first inheritance:**
```
Pub (spatial_function: hospitality)
  ├── period: contemporary → modern bar, stools, tap handles
  ├── period: medieval → wood benches, tankards, hearth
  ├── period: future → synth-bar, holographic menus, chrome
  
Office (spatial_function: commercial)
  ├── period: 1940s → wooden desks, filing cabinets, hat rack
  ├── period: contemporary → cubicles, computers, whiteboards
  ├── period: future → standing desks, holographic displays, bioluminescent
```

**Genre overlay:** Noir modifies pub → more shadow, clutter, amber color accents.
**Culture overlay:** Specific culture modifies signage language, cultural artifacts.

### Fallback Strategy

| Tier | Condition | Confidence |
|------|-----------|------------|
| 1 | spatial_function + period + genre match | 0.80-0.92 |
| 2 | spatial_function + period match | 0.65-0.80 |
| 3 | spatial_function + genre match (drop period) | 0.55-0.70 |
| 4 | spatial_function only | 0.45-0.60 |
| 5 | genre + period broad match | 0.35-0.50 |
| 6 | Catch-all with priority 0 | 0.25-0.35 |

### Compared to Previous Domains

| Domain | Anchors | Compression Ratio |
|--------|---------|-------------------|
| Location | 120 | 520 → 120 (23%) |
| Visual Language | 72 | 960 → 72 (7.5%) |
| **Production Design** | **~45** | **~500 → 45 (9%)** |

PD is smaller because it relies heavily on LC and VL outputs. PD is the most downstream deterministic domain.

---

## Q8 — Sparse Narrative Demonstration

### Input: "A detective enters a pub."

### Layer 1: Location Canon (verified — no PD/VL leakage)

```
architecture_style:      contemporary_commercial
spatial_function:        hospitality
lighting_character:      warm_candlelit_moderate
material_palette:        wood_brick_leather
visual_density:          moderate
condition:               functional_worn (noir influence)
```

### Layer 2: Visual Language Canon (verified — no LC/PD/prop leakage)

```
colour_philosophy:       warm_amber_with_teal_shadows
lighting_philosophy:     low_key_practical_motivated
contrast_model:          high_contrast_noir
shadow_philosophy:       deep_crushing_blocked_shadows
saturation_profile:      muted_warm
palette_bias:            warm_amber
realism_level:           grounded_stylized
lens_philosophy:         spherical_mid_wide
depth_philosophy:        moderate_deep
atmosphere_philosophy:   haze_smoke_present_light
texture_philosophy:      organic_grain_moderate
visual_scale:            moderate
```

### Layer 3: Prop Canon (verified — no PD dressing leakage)

```
primary_prop:            detective_notebook     [character uses it]
utility:                 fountain_pen           [character uses it]
communication:           flip_phone             [character uses it]
```

### Layer 4: Production Design Canon (PROPOSED — all 20 fields)

```
set_dressing:            liquor_bottles_bar_glasses_coasters_ashtrays
furniture_language:      scattered_wood_tables_cane_seats_bar_stools_leather_booths
object_arrangement:      uncluttered_functional_with_layered_vertical
environmental_storytelling: working_class_neighborhood_regulars_bar
surface_treatment:       dark_warm_wood_tones_brass_accents
wall_treatment:          dark_wainscoting_deep_red_velvet_paper_upper
floor_treatment:         worn_wood_planks_with_sawdust_areas
signage:                 neon_pub_name_exterior_oak_bar_menu_boards_interior
graphic_design:          vintage_beer_labels_sports_posters_local_notices
institutional_details:   liquor_license_framed_owner_portrait_darts_league_chart
cultural_artifacts:      irish_flag_st_club_saints_day_photo_old_parish_print
clutter_density:         moderate_to_low_cleared_workspaces
wear_patterns:           heavy_mid_floor_wear_under_bar_stools_light_wear_corners
practical_set_modifications: hooks_for_coats_near_door_shelf_for_regulars_glasses
scene_specific_dressing: [empty — scene-neutral baseline]
hero_objects:            antique_bartender_whiskey_bottle_central_display_cigarette_machine
background_objects:      empty_bar_stools_bottles_on_high_shelves_ceiling_fans
symbolic_objects:        crucifix_over_door_closed_curtains_over_windows
color_accents:           amber_bottle_glass_red_bar_stool_cushion_green_shade_lamps
texture_accents:         rough_brick_bar_front_smooth_polished_brass_worn_velvet_booths
```

### Zero Duplicate Truth Proof

| Concept | Who Owns It | Evidence |
|---------|-------------|----------|
| Pub architecture | LC | `architecture_style: contemporary_commercial` |
| Warm lighting exists | LC | `lighting_character: warm_candlelit` |
| How lighting is photographed | VL | `lighting_philosophy: low_key_practical` |
| Furniture in the pub | PD | `furniture_language: scattered_wood_tables...` |
| Wall finish | PD | `wall_treatment: dark_wainscoting...` |
| Floor | PD | `floor_treatment: worn_wood_planks...` |
| Signage | PD | `signage: neon_pub_name...` |
| Color grade of image | VL | `colour_philosophy: warm_amber_teal` |
| Physical color accents | PD | `color_accents: amber_bottle_glass...` |
| Notebook (character uses) | Prop | `primary_prop: detective_notebook` |
| Beer bottle (character drinks) | Prop | `utility: beer_bottle` (in prop context) |
| Cigarette machine (background) | PD | `hero_objects: cigarette_machine` |
| Coat on hook (atmosphere) | PD | `practical_set_modifications: hooks_for_coats` |
| Trench coat (worn by character) | Wardrobe | (from wardrobe domain — fictional inference) |

**Every concept has exactly one owner. Zero duplicate truth.**

---

## Q9 — Downstream Contracts

### PD → Hero Frames Contract

| PD Field | HF Impact | Classification |
|----------|-----------|----------------|
| furniture_language | Hero frame background environment | **Strongly Recommended** — provides environmental context |
| surface_treatment | Material context for rendering | **Recommended** — adds fidelity |
| wall_treatment | Background color/texture context | **Recommended** |
| scene_specific_dressing | Has the scene been modified for this moment? | **Optional** — relevant only if scene-specific |
| color_accents | Background accent colors | **Recommended** |
| hero_objects | Prominent background objects | **Optional** — may be needed in frame |

### PD → Lookbook Contract

| PD Field | Lookbook Impact | Slide |
|----------|-----------------|-------|
| furniture_language | Sets the tone of "world" slides | world slides |
| surface_treatment | Visual texture for "mood" slides | visual_language, themes |
| environmental_storytelling | Content for "world" slides | world, overview |
| cultural_artifacts | Specificity for worldbuilding | world, themes |
| color_accents | Accent color palette for deck | visual_language, overview |

### PD → VPB Contract

| VPB Subsection | PD Fields Used | Always/Optional |
|----------------|---------------|-----------------|
| Set Design Overview | set_dressing, furniture_language, surface_treatment | **Always** |
| Color & Texture Strategy | color_accents, texture_accents | **Always** |
| Environmental Storytelling | environmental_storytelling, hero_objects, symbolic_objects | **Always** |
| Clutter & Density | clutter_density, wear_patterns, background_objects | **Always** |
| Scene-Specific Dressing | scene_specific_dressing, practical_set_modifications | **When applicable** |
| Cultural Details | signage, graphic_design, institutional_details, cultural_artifacts | **Always** |

### PD → Future Video Generation

PD is the MOST important canon for video generation. While VL says how it looks and LC says where it is, PD says what's IN the scene.

| PD Field | Video Gen Impact |
|----------|-----------------|
| furniture_language | Objects the camera moves past |
| set_dressing | Every visible object must be PD-consistent |
| clutter_density | Determines how full/empty scenes feel |
| color_accents | Ensures object color consistency across shots |
| environmental_storytelling | Narrative context per location |
| scene_specific_dressing | Per-scene environmental differences |

PD must be entity-level (per-location) to support per-scene video generation.

---

## Q10 — Implementation Readiness

### Architecture Prerequisites

| Prerequisite | Status | Evidence |
|-------------|--------|----------|
| CPIE domain `'pd'` registered | ✅ | `CPIEDomain` type includes `'pd'` |
| ICS count allocated (8) | ✅ | `pd: 8` in ics.ts |
| LC boundary resolved (Q2) | ✅ | Permanent vs temporary — formally defined |
| VL boundary resolved (Q3) | ✅ | Photographed vs built — formally defined |
| Props boundary resolved (Q4) | ✅ | Interactive vs environmental — formally defined |
| Wardrobe boundary resolved (Q5) | ✅ | Worn vs displayed — formally defined |
| VPB boundary resolved (Q6) | ✅ | Renders vs infers — formally defined |
| Registry feasibility validated (Q7) | ✅ | ~45 anchors, spatial_function-first |
| Sparse narrative proven (Q8) | ✅ | Zero duplicate truth demonstrated |
| Downstream contracts defined (Q9) | ✅ | HF, Lookbook, VPB, video gen |

### Remaining Blocker

| Blocker | Severity | Path |
|---------|----------|------|
| **PD depends on VL canon** for color_accents and texture_accents alignment | **Low** | VL is live. PD can read VL outputs directly. No implementation needed before PD. |
| **PD depends on LC** for architecture context | **Low** | LC is live. PD reads spatial_function from LC. |

### Implementation Path

PD is an **entity-level domain** (per-location), like Location but adding environmental dressing.

**Pattern:**
1. PD domain processor (`pd.ts`) — reads from LC's spatial_function + period + genre → produces PD fields
2. PD anchors in registry (`PD_ANCHORS`) — ~45 anchors
3. Engine integration — per-location entity loop (PD is per-venue, not per-character)
4. CDG — C6→D6 mapping
5. ICS — 8 fields aligned with Q1 ownership matrix
6. Tests — 20-25 tests across 4 test files

**Estimated effort:** ~500-700 lines prod code, ~45 anchors. Smaller than Location (120 anchors) and VL (72 anchors).

### Recommendation

### **B — Approved with Revisions**

| Criterion | Status |
|-----------|--------|
| Ownership matrix | ✅ 20 fields, single owner (PD Canon) |
| LC boundary (Q2) | ✅ Formalized — permanent vs temporary |
| VL boundary (Q3) | ✅ Formalized — photographed vs built |
| Props boundary (Q4) | ✅ Formalized — interactive vs environmental |
| Wardrobe boundary (Q5) | ✅ Formalized — worn vs displayed |
| VPB boundary (Q6) | ✅ Formalized — renders vs infers |
| Registry feasibility (Q7) | ✅ ~45 anchors, spatial_function-first |
| Sparse narrative (Q8) | ✅ Zero duplicate truth proven |
| Downstream contracts (Q9) | ✅ All four consumers specified |
| Implementation readiness (Q10) | ✅ All prerequisites met — no blockers |

### 3 Required Revisions (R1-R3)

1. **R1 — Confirm ICS field list** — Reduce to exactly 8 fields from the 20 proposed. The 20 fields are too many for 8 ICS slots. Recommend grouping: `set_dressing` (grouped: furniture + dressing + arrangement), `surface_treatment` (grouped: wall + floor + surface), `signage_graphics` (grouped: signage + graphic_design + institutional), `cultural_artifacts`, `clutter_density_wear` (grouped: clutter + wear), `scene_modifications` (grouped: practical + scene_specific), `hero_symbolic_objects` (grouped: hero + symbolic + background), `color_texture_accents` (grouped: color + texture).

2. **R2 — Confirm entity model** — PD is entity-level (per-location). Confirm whether PD inference covers ALL entities or only venues. Recommendation: venues only (the bar, the office, the forest). Character-specific PD (their homes) is inferred per character_location.

3. **R3 — Confirm PD-to-VPB rendering details** — Formalize the VPB "Production Design" section template. Currently loosely coupled. Needs explicit rendering rules for each of the 6 VPB subsections.

---

## Final Verdict

### **B — Approved with Revisions**

**All ownership boundaries proven clean.** Production Design is the most downstream deterministic domain — it has the most built-in constraints from LC, VL, Props, Wardrobe, and PCP. This also makes it the most bounded domain with the fewest anchors (~45).

PD is entity-level (per-location), returning 20 fields grouped into 8 ICS slots, consuming `spatial_function`, `period`, `genre`, `culture`, `class_structure`, `economy`, and `vl_canon` as inputs.

**Ready for architecture design phase when triggered.**

