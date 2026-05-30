# SESS-ARCH-0035 — Visual Language Architecture Design
**Oracle** | 2026-05-30 | Architecture-Strict Mode

## Verdict: **B — Approved with Revisions** ✅

**Platform Status:** Location ✅ → Visual Language 🔴 → Production Design ⬜

---

## R1 — Anchor Architecture

### Final Anchor Count: **72**

| Field Group | Anchors | Strategy |
|-------------|---------|----------|
| Contrast/Lighting | 28 | 4-5 per 6 genres × production_language |
| Color/Saturation | 16 | 3-4 per 5 genres × visual_tone |
| Lens/Depth | 12 | 2-3 per 4 genres × period |
| Atmosphere/Texture | 10 | 2-3 per 4 genres × climate |
| Realism | 6 | 1-2 per 3 production_language values |
| **Total** | **72** | Composable inheritance — not full matrix |

### Compression Strategy

**Genre-first, period-second, visual-tone-third.**

Same proven approach as Location (which compressed 520 possible rows to 120 anchors).

```
Genre (noir) = 10 anchors
  |- period (contemporary) = 3 modifiers
  |- period (1940s) = 3 modifiers
  |- period (2087) = 3 modifiers

Genre (fantasy) = 8 anchors
  |- period (medieval) = 3 modifiers
  |- visual_tone (dark) = 2 modifiers
  |- visual_tone (bright) = 2 modifiers
```

### Inheritance Strategy

**Three-tier inheritance:**

| Tier | Abbreviation | Example | Source |
|------|-------------|---------|--------|
| Primary | GENRE | noir to high_contrast | genre |
| Secondary | PERIOD | noir + 1940s to venetian_blind_shadows | period |
| Tertiary | TONE | noir + dark to crushed_black_shadows | visual_tone |

### Fallback Strategy

| Tier | Condition | Action | Confidence |
|------|-----------|--------|------------|
| 1 | genre + period + visual_tone all match | Exact match — use value | 0.88-0.95 |
| 2 | genre + visual_tone match, period differs | Use genre baseline + closest period proxy | 0.72-0.85 |
| 3 | genre + production_language match | Use genre baseline with realism override | 0.65-0.78 |
| 4 | genre only match | Use genre baseline | 0.55-0.65 |
| 5 | No genre match, style_influences has ref | Look up referenced style in cross-ref table | 0.45-0.55 |
| 6 | Nothing matches | Use generic fallback per field | 0.30-0.40 |

### Avoided Full Matrix

Full genre x period x visual_tone x production_language = 6 x 8 x 5 x 4 = 960 anchors.

**Compressed to 72 using inheritance.** Same ratio as Location (520 to 120, ~23%).

---

## R2 — Deterministic vs LLM Ownership Table

### Complete Field Classification

| # | Field | Class | Rationale | Anchors |
|---|-------|-------|-----------|---------|
| 1 | contrast_model | **A — Deterministic** | Genre directly drives contrast ratio (noir=high, fantasy=soft). | 6 |
| 2 | colour_philosophy | **A — Deterministic** | Genre + palette_bias drives dominant hues. Well-bounded vocabulary. | 6 |
| 3 | saturation_profile | **A — Deterministic** | Genre + visual_tone drives saturation curve. 3-4 discrete values. | 6 |
| 4 | palette_bias | **A — Deterministic** | Genre + climate drives warm/cool/neutral. 3-value space. | 4 |
| 5 | lighting_philosophy | **A — Deterministic** | Genre + period drives practical/naturalistic/high/low. Finite vocabulary. | 8 |
| 6 | shadow_philosophy | **A — Deterministic** | Genre + lighting_philosophy drives shadow treatment. 5 discrete patterns. | 6 |
| 7 | lens_philosophy | **A — Deterministic** | Genre + period + format drives lens type. Finite vocabulary. | 6 |
| 8 | depth_philosophy | **A — Deterministic** | Genre + lens + format drives DoF. Deep/shallow/moderate. | 4 |
| 9 | focus_philosophy | **A — Deterministic** | Genre + depth drives focus patterns. Rack/deep/soft. | 4 |
| 10 | realism_level | **A — Deterministic** | Production_language + genre drives realism tier. 4-tier scale. | 6 |
| 11 | atmosphere_philosophy | **B — Hybrid** | Genre+period+climate = deterministic base. Specifics = creative. | 4 |
| 12 | texture_philosophy | **B — Hybrid** | Genre+period = deterministic grain level. Texture character = creative. | 6 |
| 13 | camera_philosophy | **C — LLM Layer** | Camera movement style is directorial choice. | 0 |
| 14 | framing_philosophy | **C — LLM Layer** | Framing preferences are artistic. | 0 |
| 15 | movement_philosophy | **C — LLM Layer** | Camera movement is scene-contextual. | 0 |
| 16 | composition_philosophy | **C — LLM Layer** | Composition rules are filmmaker's choice. | 0 |
| 17 | scale_philosophy | **B — Hybrid** | Split into two fields. See R4. | 0 (moved) |

### Classification Summary

| Class | Count | Fields |
|-------|-------|--------|
| **A — Deterministic Registry** | 10 | contrast, colour, saturation, palette_bias, lighting, shadow, lens, depth, focus, realism |
| **B — Hybrid** | 3 | atmosphere, texture, scale (split) |
| **C — LLM Expansion** | 4 | camera, framing, movement, composition |

### Proof: Why 4 LLM Fields Cannot Be Deterministic

**camera_philosophy:** Same movie uses steadicam, handheld AND locked-off (Reservoir Dogs: locked-off table, steadicam warehouse, handheld torture). No single genre-camera rule holds.

**framing_philosophy:** Same scene mixes close-ups, mediums, wides. 180-degree rule and shot/reverse-shot are editorial, not genre-inferable. Noir works both tight (The Third Man) and wide (Chinatown).

**movement_philosophy:** Movement is scene-dependent: chase = rapid/cutting. Dialogue = subtle/push-in. No deterministic rule maps "fantasy, dark" to "camera sways left at 0.5m/s."

**composition_philosophy:** Rules like "golden ratio," "rule of thirds" or "center-frame Wes Anderson" are directorial signatures. Genre only weakly predicts composition.

**Registry entry for these 4 fields:** A single catch-all anchor each with tier-5 fallback confidence.

---

## R3 — Atmosphere & Texture Contract

### atmosphere_philosophy — Split Model

**Deterministic portion (60%):**
- Presence: Is atmosphere present? (haze/smoke/fog/clear)
- Density tier: One of {none, light, moderate, heavy}
- Base type: One of {fog, smoke, dust, steam, clear}

**Inferred from:** genre + climate + period

noir + urban + contemporary = smoke_present_light
horror + temperate + any = fog_present_heavy
fantasy + any + medieval = mist_present_moderate
sci_fi + any + future = clear_none

**Creative portion (40%):**
- Color tint of atmosphere (amber/grey/blue/white)
- Movement quality (stagnant/rolling/swirling)
- Interaction with light (backlit/rimlit/frontlit)

**LLM receives:** base_type + density as constraint. Generates color and movement as creative license.

### texture_philosophy — Split Model

**Deterministic portion (70%):**
- Grain level: One of {none, light, moderate, heavy}
- Sharpness: One of {crisp, natural, soft, dreamy}
- Base texture: One of {clean_digital, film_stock, organic_grain, stylized, pristine}

**Inferred from:** genre + period + production_language

gritty_realism + crime + contemporary = organic_grain_moderate
heightened_reality + fantasy + medieval = film_stock_soft
minimalist + drama + contemporary = clean_digital_crisp

**Creative portion (30%):**
- Film stock reference (Kodak 5219 vs Fuji Eterna vs custom)
- Grain pattern character (fine vs coarse vs variable)
- Texture interaction with lighting (grain in shadows only)

### Ownership Contract

atmosphere_philosophy:
  deterministic: { base_type, density, present }
  creative: { color_tint, movement_quality, light_interaction }
  constraint: LLM must honor base_type and density; creative on color/movement

texture_philosophy:
  deterministic: { grain_level, sharpness, base_texture }
  creative: { film_stock_ref, grain_pattern, texture_lighting_interaction }
  constraint: LLM must honor grain_level and sharpness; creative on film_stock_ref

---

## R4 — Scale Philosophy Resolution

### Problem Statement

From Audit 0034 R4: scale_philosophy was ambiguous: VL (shot scale) or story (narrative scope)?

### Resolution: **Split into two fields**

### New Field: visual_scale (Owned by VL Canon)

visual_scale = string (inferred from genre, period)
Values: "intimate" | "moderate" | "epic" | "claustrophobic"

Definition: The photographic framing posture toward the subject. How far the camera typically stands.
- intimate: close framing, faces fill frame, shallow dof
- moderate: medium-to-full body framing, some environment visible
- epic: wide framing, environment dominant, subjects small in frame
- claustrophobic: tight framing, no breathing room, crowded frame

Inferred from genre:
- drama = intimate or moderate
- epic fantasy = epic
- horror = claustrophobic (or intimate for tension)
- comedy = moderate (sitcom) or epic (broad)
- noir = moderate (environment matters) or intimate (character focus)

### Existing Field: setting_scope (Owned by PCP — no change)

setting_scope = PCPField<string> — values: "single_location" | "city_wide" | "cross_country" | "global"

Definition: NARRATIVE scope — how big is the story's world. Already in PCP. Correctly placed.

### Overlap Prevention

Claustrophobic single-room drama: setting_scope=single_location, visual_scale=claustrophobic — **No overlap** (narrative vs photographic)
Epic cross-country fantasy: setting_scope=cross_country, visual_scale=epic — **No overlap** (same word, different meaning)
Intimate global spy thriller: setting_scope=global, visual_scale=intimate — **No overlap** (world is big, camera is close)

### Final Scale Model

scale_philosophy:
  - narrative_scale = setting_scope (PCP — existing, unchanged)
  - visual_scale = new field (VL Canon — part of 8 VL ICS fields)

**ICS field count for VL remains 8.** visual_scale replaces the generic scale_philosophy.

---

## R5 — VL toPD Consistency Contract

### Title: VL to PD Consistency Guide v1

**Status:** NOT a dependency. PD CAN generate without VL. Quality constraint only.

### Required Alignment Fields

| VL Field | PD Field(s) | Alignment Rule |
|----------|-------------|----------------|
| colour_philosophy | set_dressing colors, wall_treatment colors | PD palette must be in same color family (+-1 analogous jump) |
| lighting_philosophy | practical_lamp_count, brightness_tier, diffusion_type | PD practicals must support VL's lighting approach |
| saturation_profile | fabric/textile saturation, dye saturation | PD saturation cannot exceed VL saturation by more than 20% |
| contrast_model | practical_placement, shadow_caster_count | PD must include physical objects that create lighting contrast |
| atmosphere_philosophy | smoke_machine, haze_generator, fan_placement | PD atmosphere hardware must match VL atmosphere density |
| palette_bias | surface_treatment_colors, large_furniture_colors | PD dominant colors must be within VL palette_bias |

### Allowed Divergence

- Texture: VL says "rough organic grain" but PD has smooth concrete walls (physical constraint)
- Detail: VL says "muted palette" but PD has a single red chair as accent (one piece does not break palette)
- Lighting: VL says "low key" but PD includes windows for daylight (LC not PD)
- Scale: VL says "intimate" but PD has a large room (PD serves scene, VL serves shot)

### Forbidden Divergence

PD MUST NOT:
1. Saturated neon furniture when VL says "desaturated palette"
2. Bright white set walls when VL says "crushed shadows, shadow_dominant"
3. Scattershot color dressing when VL says "monochromatic_palette"
4. Glossy mirrored surfaces when VL says "diffuse rough texture"
5. Bright diffused practicals when VL says "practical_motivated_chiaroscuro"

### Enforcement

Design-time: PD prompt includes VL constraints as canon_lock (CPIE VL domain processor)
Runtime: PD generation must check VL canon state (PD edge function)
Post-hoc: Consistency audit on combined PD+VL output (Governance system)

---

## R6 — C7 CPIE Domain Definition

### Domain Registration

domain: 'vl'
node_id: C7 (CPIE), D7 (Canon)
ics_count: 8

### Inputs (from PCP)

| Input | Type | Required |
|-------|------|----------|
| genre | string[] | Yes — primary driver |
| period | string | Yes — secondary driver |
| visual_tone | string (PCP VisualContext) | Yes — tertiary driver |
| production_language | string (PCP VisualContext) | Yes — realism override |
| style_influences | string[] (PCP VisualContext) | Recommended — cross-reference |
| climate | string | For atmosphere inference |
| geography | string | For atmosphere inference |

### Outputs (15 inferred fields)

| # | Field | Confidence | Method |
|---|-------|-----------|--------|
| 1 | contrast_model | 0.75-0.92 | Registry |
| 2 | colour_philosophy | 0.72-0.90 | Registry |
| 3 | saturation_profile | 0.68-0.85 | Registry |
| 4 | palette_bias | 0.70-0.88 | Registry |
| 5 | lighting_philosophy | 0.72-0.90 | Registry |
| 6 | shadow_philosophy | 0.70-0.88 | Registry |
| 7 | lens_philosophy | 0.65-0.85 | Registry |
| 8 | depth_philosophy | 0.65-0.82 | Registry |
| 9 | focus_philosophy | 0.60-0.80 | Registry |
| 10 | realism_level | 0.72-0.90 | Registry |
| 11 | visual_scale | 0.60-0.80 | Registry |
| 12 | atmosphere_philosophy (base) | 0.65-0.82 | Registry + Enhancement |
| 13 | atmosphere_philosophy (creative) | 0.45-0.65 | LLM Enhancement |
| 14 | texture_philosophy (base) | 0.65-0.85 | Registry + Enhancement |
| 15 | texture_philosophy (creative) | 0.40-0.60 | LLM Enhancement |

### Provenance Requirements

Every inference must include:
- source_type: 'inferred' or 'inferred_low_confidence'
- confidence_score: 0.40-0.92
- reasoning: human-readable chain
- registry_anchor_id: pattern "vl_*"
- pcp_dependencies: ["genre", "period", "visual_tone", "production_language"]
- generated_at: ISO timestamp
- generated_by: 'cpie_registry'

### ICS Model

Stage 1 (ICS): 8 deterministic fields = 8/8 = 1.0 ICS when all filled
Stage 2 (Enhancement): +5 hybrid fields = up to 13/13 total
Stage 3 (LLM): +4 creative fields = up to 17/17 creative coverage

---

## R7 — Governance Contract

### explainInference() for Visual Language

Input Context:
genre: ["noir", "crime"]
period: "contemporary"
visual_tone: "moody"
production_language: "gritty_realism"

### Expected Provenance Structure

The inference object for contrast_model:

field: 'contrast_model'
value: 'low_key_practical_motivated'
source_type: 'inferred'
confidence_score: 0.88
reasoning: [
  'noir genre to contrast_driven_lighting',
  'contemporary period to practical_sources_available',
  'moody visual_tone to under_exposure_preferred',
]
registry_anchor_id: 'vl_noir_contemporary_contrast_lowkey'
pcp_dependencies: ['genre', 'period', 'visual_tone']

### Expected Explanation Output

low_key_practical_motivated (The Project's contrast_model)
  Source: inferred (confidence: 0.88)
  Because: noir genre to contrast_driven_lighting, contemporary period to practical_sources_available, moody visual_tone to under_exposure_preferred
  Registry rule: vl_noir_contemporary_contrast_lowkey
  Dependencies: genre, period, visual_tone
  PCP values:
    genre: noir, crime
    period: contemporary
    visual_tone: moody

### Why NOT high_key_contrast?

high_key_contrast would require genre=comedy or romance, visual_tone=bright or vibrant, production_language=heightened_reality or magical_realism.

The project has genre=noir (not comedy), visual_tone=moody (not bright), and production_language=gritty_realism (not heightened_reality).

Therefore high_key_contrast is excluded at tier-1 trigger match.

---

## R8 — Sparse Narrative Demonstration

### Input: "A detective enters a pub."

### Location Canon (PROVEN — owned by LC)

architecture_style:      contemporary_commercial
spatial_function:        hospitality
lighting_character:      warm_candlelit_moderate
material_palette:        wood_brick_leather
visual_density:          moderate
condition:               functional_worn

### Visual Language Canon (PROPOSED — owned by VL)

**Deterministic (registry):**
colour_philosophy:       warm_amber_with_teal_shadows
lighting_philosophy:     low_key_practical_motivated
contrast_model:          high_contrast_noir
shadow_philosophy:       deep_crushing_blocked
saturation_profile:      muted_warm
palette_bias:            warm_amber
realism_level:           grounded_stylized
lens_philosophy:         spherical_mid_wide
depth_philosophy:        moderate_deep
visual_scale:            moderate

**Hybrid (registry + enhancement):**
atmosphere_philosophy:
  base: { present: true, density: light, type: smoke }
  creative: { color_tint: amber, movement: swirling, light_interaction: backlit }
texture_philosophy:
  base: { grain_level: moderate, sharpness: natural, base_texture: organic_grain }
  creative: { film_stock_ref: Kodak_5219, grain_pattern: variable, texture_lighting: shadows_only }

### Production Design Canon (FUTURE — owned by PD)

furniture_layout:        scattered_tables_bar_booths
wall_treatment:          dark_wainscoting_with_red_paper
floor_treatment:         worn_wood_planks
window_treatment:        frosted_glass_partial_curtains
set_dressing:            liquor_bottles_glasses_ashtrays
smoke_element:           present_atmospheric
practical_lamp_type:     amber_bulbed_overhead_fixtures
color_accent:            one_red_phone_booth (ALLOWED divergence)

### Zero Duplicate Truth Proof

| Concept | Owner | Conflict? |
|---------|-------|-----------|
| Warm lighting EXISTS | LC | Facts about building |
| Warm lighting is USED | VL | How it's shot (different) |
| Warm lighting props | PD | Physical set (consistent) |
| Dark shadows | Only in VL | None — LC doesn't do shadows |
| Wood floor | Only in PD | None — VL doesn't do floors |
| Pub function | Only in LC | None — VL doesn't do functions |
| Camera choice | Only in VL | None — PD doesn't choose lenses |
| Red accent wall | Only in PD | None — VL doesn't paint walls |

Every concept lives in exactly one owner. Zero duplicate truth.

---

## R9 — Downstream Impact Review

### Hero Frame Dependency Delta

lens_philosophy: Recommended to **Required** (+1 upgrade)
depth_philosophy: Optional to **Recommended** (+1 upgrade)
visual_scale: N/A to **Optional** (+1 new)

Previous: 4 Required, 2 Strongly Rec, 2 Rec, 2 Optional
New:      5 Required, 2 Strongly Rec, 2 Rec, 2 Optional, 1 New Optional

### Lookbook Dependency Delta

lighting_philosophy: Strongly Rec to **Required** (+1 upgrade)
atmosphere_philosophy: Strongly Rec to **Recommended** (-1 downgrade)
lens_philosophy: Recommended to **Optional** (-1 downgrade)
visual_scale: N/A to **Optional** (+1 new)

Previous: 4 Required, 3 Strongly Rec, 1 Rec
New:      5 Required, 1 Strongly Rec, 2 Rec, 2 Optional, 1 New Optional

### VPB Dependency Delta

**Entire VL section is NEW** — previously undefined.

5 new subsections added to VPB:
1. Visual Language Overview (17 fields)
2. Lighting Design Notes (4 fields: lighting, shadow, contrast, atmosphere)
3. Color Design Notes (3 fields: colour, saturation, palette_bias)
4. Camera/Lens Package (5 fields: lens, camera, depth, focus)
5. Framing & Composition (3 fields: framing, composition, movement)
6. Visual Realism & Texture (4 fields: realism, texture, focus)

### Aggregate Summary

Hero Frames: +1 Required, +1 Optional (low effort to adopt)
Lookbook: +1 Required, -2 others, +1 Optional (net neutral effort)
VPB: **Entire VL section now defined** — major capacity addition

---

## R10 — Implementation Readiness Review

### Prerequisites Satisfied

| Prerequisite | Status |
|-------------|--------|
| Ownership boundaries resolved | PASS |
| PCP boundary confirmed | PASS |
| VL vs LC boundary formalized | PASS |
| VL vs PD boundary formalized | PASS |
| Anchor count validated (72) | PASS |
| ICS model defined (8 fields) | PASS |
| CDG node allocated (C7 to D7) | PASS |
| CPIE domain registered (vl) | PASS |
| Hero Frame contract defined | PASS |
| Lookbook contract defined | PASS |
| VPB contract defined | PASS |
| Governance model defined | PASS |
| LLM boundary formalized (4 fields) | PASS |
| Atmosphere/Texture split defined | PASS |
| Scale resolved (split) | PASS |
| VL to PD consistency guide defined | PASS |
| Sparse narrative zero-dup proven | PASS |

### Remaining Blockers: **NONE**

All prerequisites satisfied. Implementation can begin immediately.

### Estimated Effort: ~750-1000 lines, 5-7 files

Same scale as Location Phase (SESS-IMP-0033).

### Risk Assessment

LLM creative override of deterministic base: Low probability (R3 contract enforces base constraints)
Camera/framing/movement generic output: Low impact (creative_interpretation fallback acceptable)
Lookbook before VL: Low probability (fallback color system exists)
Hero Frame lens dependency: Minor (+1 Required field)

---

## Final Verdict

### **B — Approved with Revisions** ✅

**Ready for Implementation: YES**

All 10 requirements satisfied. No remaining blockers. The VL architecture is structurally sound, all boundaries are proven, and every downstream contract is specified.

Next: Wait for Sebastian's trigger toward SESS-IMP-0036 — Visual Language Implementation.
