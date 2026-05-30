# SESS-ARCH-0034 — Visual Language Ownership Audit
**Oracle** | 2026-05-30 | Architecture-Strict Mode

## Verdict: **B — Approved with Revisions** ✅

### Critical Rule Enforced
- ❌ No implementation
- ❌ No anchors created
- ❌ No PCP modifications
- ❌ No CDG modifications
- ❌ No Hero Frame / Lookbook / VPB modifications

**This is an ownership and architecture audit only.**

---

## Q1 — Ownership Matrix

### Layer Definitions

| Layer | Role | Examples |
|-------|------|---------|
| **PCP** | Context provider — what the world IS | visual_tone, style_influences, production_language |
| **VL Canon** | How the world is PHOTOGRAPHED | contrast, lighting philosophy, lens choices |
| **LC (Location Canon)** | Permanent built environment | architecture, installed fixtures, available light |
| **PD Canon** | Temporary set construction | dressing, furniture layout, surface treatments |
| **HF (Hero Frame)** | Still image generation | entity hero shots |
| **LB (Lookbook)** | Pitch deck slides | layout, visual identity, color system |
| **VPB** | Production bible document | narrative sections |

### Full Field Ownership

| # | Field | Owner | Source | Inferred? | Downstream | Notes |
|---|-------|-------|--------|-----------|------------|-------|
| 1 | **visual_tone** | **PCP** | extraction | May be overridden | → VL, HF, LB, VPB | Already in PCP. Correct. |
| 2 | **style_influences** | **PCP** | extraction | May be overridden | → VL, HF, LB | Already in PCP. Correct. |
| 3 | **production_language** | **PCP** | extraction | May be overridden | → VL, VPB | Already in PCP. Correct. |
| 4 | **realism_level** | **VL Canon** | CPIE inference | Yes (from genre + visual_tone + prod_language) | → HF, LB, VPB | NOT in PCP. Inferred from context. |
| 5 | **contrast_model** | **VL Canon** | CPIE inference | Yes (from genre + lighting_philosophy) | → HF, VPB | Cinematographic. Pure VL. |
| 6 | **colour_philosophy** | **VL Canon** | CPIE inference | Yes (from genre + visual_tone + palette_bias) | → HF, LB, VPB | Drives Lookbook color system. |
| 7 | **saturation_profile** | **VL Canon** | CPIE inference | Yes (from genre + visual_tone) | → HF, LB, VPB | Modulates colour_philosophy. |
| 8 | **palette_bias** | **VL Canon** | CPIE inference | Yes (from genre + climate) | → VL colour_philosophy | Warm/cool/neutral. |
| 9 | **lighting_philosophy** | **VL Canon** | CPIE inference | Yes (from genre + period + visual_tone) | → HF, VPB | **CRITICAL BOUNDARY** — see Q4. |
| 10 | **shadow_philosophy** | **VL Canon** | CPIE inference | Yes (from genre + lighting_philosophy) | → HF, VPB | Cinematographic. Pure VL. |
| 11 | **camera_philosophy** | **VL Canon** | CPIE inference / LLM expansion | Partially (structural = deterministic; creative = LLM) | → VPB | Camera movement style. |
| 12 | **lens_philosophy** | **VL Canon** | CPIE inference | Yes (from genre + period + format) | → HF, VPB | Anamorphic/spherical/etc. |
| 13 | **framing_philosophy** | **VL Canon** | LLM expansion (creative) | Yes — **LLM layer** | → VPB | Too creative for deterministic registry. |
| 14 | **movement_philosophy** | **VL Canon** | LLM expansion (creative) | Yes — **LLM layer** | → VPB | Too creative for deterministic registry. |
| 15 | **composition_philosophy** | **VL Canon** | LLM expansion (creative) | Yes — **LLM layer** | → VPB | Too creative for deterministic registry. |
| 16 | **texture_philosophy** | **VL Canon** | CPIE inference / LLM expansion | Hybrid | → VPB | Film grain / digital clean — deterministic. Grain texture — creative. |
| 17 | **atmosphere_philosophy** | **VL Canon** | CPIE inference | Yes (from genre + geography + period) | → HF, VPB | Fog, haze, smoke — partly joins PD (physical vs photographic). |
| 18 | **depth_philosophy** | **VL Canon** | CPIE inference | Yes (from genre + format + lens) | → HF, VPB | Deep/shallow/rack. Deterministic. |
| 19 | **focus_philosophy** | **VL Canon** | CPIE inference | Yes (from genre + depth_philosophy) | → HF, VPB | Rack focus / deep stop / soft. |
| 20 | **scale_philosophy** | **VL Canon** | CPIE inference / LLM expansion | Hybrid (genre drives baseline, creative expands) | → VPB | Intimate / epic / claustrophobic — partly VL, partly story. |

### Classification Summary

| Category | Count | Owner | Interpretation |
|----------|-------|-------|---------------|
| **PCP (existing)** | 3 | PCP | visual_tone, style_influences, production_language |
| **VL Canon — Deterministic** | 12 | VL Canon | realism_level, contrast_model, colour_philosophy, saturation_profile, palette_bias, lighting_philosophy, shadow_philosophy, lens_philosophy, atmosphere_philosophy, depth_philosophy, focus_philosophy, texture_philosophy |
| **VL Canon — LLM Layer** | 4 | VL Canon | camera_philosophy, framing_philosophy, movement_philosophy, composition_philosophy |
| **VL Canon — Hybrid** | 1 | VL Canon + PD | scale_philosophy (partly story tone) |

---

## Q2 — PCP Boundary Assessment

### Current PCP Visual Context (3 fields)

```typescript
interface VisualContext {
  visual_tone: PCPField<string>;            // "dark" | "bright" | "moody" | "vibrant" | "monochromatic"
  style_influences: PCPField<string[]>;     // ["film_noir", "german_expressionism", "neon_noir"]
  production_language: PCPField<string>;    // "gritty_realism" | "heightened_reality" | "magical_realism" | "minimalist"
}
```

### Assessment: **PASS — PCP is sufficient**

| Question | Answer |
|----------|--------|
| Is PCP already sufficient? | ✅ **Yes.** PCP provides high-level context signals. VL Canon derives specifics from them. |
| Are any additional fields required? | ❌ **No.** Adding `realism_level` or `colour_philosophy` to PCP would create duplicate truth — PCP would compete with VL Canon. |
| Are any existing fields incorrectly placed? | ❌ **No.** All 3 belong in PCP. They are context signals, not production decisions. |

### PCP Boundary Rule

**PCP's visual_context says WHAT the project is aiming for (dark, noir, gritty).**
**VL Canon says HOW that manifests photographically (chiaroscuro, crushed blacks, venetian blinds).**

PCP must NEVER expand beyond 3 visual fields. Adding more would blur the boundary and create a second inference authority competing with CPIE's VL domain.

---

## Q3 — Visual Language vs Production Design Boundary

### Formal Boundary Rule

> **VL Canon owns how things are PHOTOGRAPHED. PD Canon owns what things ARE on set.**

**VL Canon** = Cinematographic choices. The camera's aesthetic relationship to reality.
**PD Canon** = Physical production choices. The set's physical construction and dressing.

### Boundary Matrix

| Element | Owner | Rationale |
|---------|-------|-----------|
| Castle wall texture | **PD** | Physical surface treatment choice |
| Torch placement | **PD** (if temporary) / **LC** (if permanent fixture) | Physical prop or installed feature |
| Furniture layout | **PD** | Blocking and set dressing |
| Colour palette | **VL** | Photographic color philosophy |
| Camera angle | **VL** | Purely cinematographic |
| Contrast ratio | **VL** | Cinematic lighting technique |
| Smoke density | **Shared (PD × VL)** | PD = physical smoke machine on set. VL = how smoke reads in frame (haze depth, light interaction). |
| Atmospheric haze | **Shared (PD × VL)** | Same as smoke — physical vs photographic. |
| Lens choice | **VL** | Cinematographic equipment decision |
| Set wall paint | **PD** | Physical surface treatment |
| Practical lamp type | **LC** (installed) / **PD** (brought in) | Physical lighting fixture |
| Window size/shape | **LC** | Permanent architecture |
| Window treatment (curtains) | **PD** | Temporary set dressing |
| Floor texture | **PD** | Physical surface |
| Color of a chair | **PD** | Physical prop color choice |
| Color grade of final image | **VL** | Post-production photographic choice |

### Duplicate Truth Rule

**No field may appear in both VL Canon and PD Canon.** If both layers need a value (e.g., colour_philosophy → VL decides "blue_toned", PD picks "navy chairs" as set dressing), the VL layer's colour_philosophy is the PHOTOGRAPHIC intent, and PD's "navy chairs" are a PHYSICAL choice that is *consistent with* VL but *owned by* PD.

**Consistency ≠ Ownership.** PD should consult VL canon during generation, but PD owns its own fields.

---

## Q4 — Visual Language vs Location Boundary

### Formal Boundary Rule

> **Location Canon owns the PERMANENT built environment. VL Canon owns how light/exposure is HANDLED photographically.**

**LC** = What's physically installed. The building's hardware.
**VL** = How the camera and lighting team USE that hardware.

### Permanent Ownership Matrix

| Concept | Owner | Rationale |
|---------|-------|-----------|
| Practical lighting (installed fixtures) | **LC** | Physical light fixtures built into the location. e.g., "ceiling chandelier", "wall sconces", "street lamps outside window". |
| Available light sources | **LC** | Physical light sources inherent to location. e.g., "south-facing window", "single overhead bulb". |
| Colour temperature of fixtures | **LC** | Physical property of installed bulbs/fixtures. e.g., "warm 2700K overheads". |
| Motivated light (creative use) | **VL** | How the DP uses practicals. e.g., "single practical key on the detective's face, motivated by overhead bulb." |
| Shadow treatment | **VL** | Cinematographic choice. e.g., "deep hard shadows across face," "soft wrap-around fill." |
| Exposure philosophy | **VL** | Cinematographic choice. e.g., "underexposed by 2 stops" or "zebra-lit, blown highlights." |
| Contrast philosophy | **VL** | Cinematographic choice. e.g., "T/stop 2.0, high contrast ratio 8:1." |
| Light gelling | **VL** | Cinematographic choice applied to LC's fixtures. |
| Dimmer placement | **VL** | How practicals are controlled for shot. |
| Window bars / security grilles | **LC** | Permanent architectural feature. |
| Window light (through glass) | **LC** (available) / **VL** (how it's exposed) | Available = LC. Exposure choice = VL. |
| Streetlight color exterior | **LC** | Permanent fixture of location environment. |

### Critical Line

**Location Canon field `lighting_character`** describes the inherent light feel of a place:
- "dim_ominous" (a basement)
- "bright_clinical" (a hospital ward)
- "warm_ambient" (a cozy pub)

**VL Canon field `lighting_philosophy`** describes how the DP shoots the place:
- "low_key_with_practical_motivation" (using that basement's single bulb as key)
- "high_key_even_saturation" (flattening the hospital ward)
- "chiaroscuro_dramatic" (sculpting the pub with shadows)

**They coexist but never overlap.** LC says what EXISTS. VL says what's DONE WITH IT.

---

## Q5 — Hero Frame Dependency Contract v1

### Context

Hero Frames are standalone still images of entities (characters, locations, props, vehicles). They are generated via image prompts. The VL Canon provides the LIGHTING and COLOUR context that frames must respect.

### Hero Frame VL Inputs

| Input | Classification | Why |
|-------|---------------|-----|
| `visual_tone` (PCP) | **Required** | "dark" → frame should be dark. "vibrant" → frame should be saturated. |
| `production_language` (PCP) | **Required** | "gritty_realism" → frame should feel grounded. "heightened_reality" → frame can be dramatic. |
| `colour_philosophy` (VL) | **Required** | "blue_teal_shadows" → frames must use cool shadows. "warm_amber" → frames use warm highlights. |
| `lighting_philosophy` (VL) | **Required** | "chiaroscuro" → frames must have dramatic light/shadow. "naturalistic" → frames use soft diffuse. |
| `shadow_philosophy` (VL) | **Strongly Recommended** | "deep_crushing" → shadows block up in frame. |
| `atmosphere_philosophy` (VL) | **Strongly Recommended** | "hazy_smoke" → frames include atmospheric scattering. |
| `lens_philosophy` (VL) | **Strongly Recommended** | "anamorphic" → frames use anamorphic flare/compression. |
| `saturation_profile` (VL) | **Recommended** | "desaturated" → frames use muted colors. |
| `depth_philosophy` (VL) | **Optional** | "shallow_dof" → hero frames focus on subject. |
| `realism_level` (VL) | **Recommended** | "stylized" → frames can use more dramatic composition. |
| `contrast_model` (VL) | **Recommended** | "high_contrast_noir" → frames use 8:1+ ratios. |

### Non-Inputs (Hero Frames DO NOT consume)

- `camera_philosophy` — irrelevant (still images)
- `movement_philosophy` — irrelevant (still images)
- `framing_philosophy` — Hero Frames have their own framing (entity-focused)
- `composition_philosophy` — Hero Frames have their own composition (entity canonical pose)
- `scale_philosophy` — Hero Frames have their own scale (full_body/medium/close_up)

---

## Q6 — Lookbook Dependency Contract v1

### Context

Lookbook is a visual pitch deck with slides. It has a visual identity (color system, typography, image treatment) and content slides. VL inputs drive both.

### Lookbook VL Inputs

| Input | Classification | Which Slide | Why |
|-------|---------------|-------------|-----|
| `visual_tone` (PCP) | **Required** | ALL slides, Visual Identity | Drives imageStyle: "cinematic-warm" vs "high-contrast" |
| `colour_philosophy` (VL) | **Required** | ALL slides, Visual Identity | Drives LookBookColorSystem (bg, text, accent, gradient) |
| `production_language` (PCP) | **Required** | "visual_language" slide | Content for the VL section of the deck |
| `style_influences` (PCP) | **Required** | "visual_language" slide | Reference imagery for VL slide |
| `saturation_profile` (VL) | **Required** | ALL slides, Visual Identity | Modulates color treatment globally |
| `atmosphere_philosophy` (VL) | **Strongly Recommended** | ALL slides, background plates | Background image treatment |
| `lighting_philosophy` (VL) | **Strongly Recommended** | "visual_language" slide | Content for the VL section |
| `realism_level` (VL) | **Recommended** | ALL slides, image selection | Which images feel consistent |
| `contrast_model` (VL) | **Recommended** | Visual Identity | Image treatment nuance |
| `shadow_philosophy` (VL) | **Recommended** | "visual_language" slide | Content for the VL section |
| `lens_philosophy` (VL) | **Recommended** | "visual_language" slide | Content for the VL section |

### Non-Inputs (Lookbook DOES NOT consume)

- `camera_philosophy` — irrelevant for still image selection
- `movement_philosophy` — irrelevant for deck composition
- `framing_philosophy` — slides have their own layouts
- `depth_philosophy` — too granular for deck-level treatment
- `focus_philosophy` — too granular for deck-level treatment
- `scale_philosophy` — too abstract for deck decisions

---

## Q7 — VPB Dependency Contract v1

### Context

VPB (Visual Production Bible) is a narrative document with sections. Section content is generated FROM the VL Canon, not from PCP.

### VPB VL-Dependent Sections

| VPB Section | Sources | VL Inputs Used |
|-------------|---------|----------------|
| **Visual Language Overview** | VL Canon (ALL fields) | ALL 20 Q1 fields are rendered as prose |
| **Lighting Design Notes** | VL Canon (lighting + shadow + contrast) | lighting_philosophy, shadow_philosophy, contrast_model, atmosphere_philosophy |
| **Color Design Notes** | VL Canon (color fields) | colour_philosophy, saturation_profile, palette_bias |
| **Camera/Lens Package** | VL Canon (camera fields) | lens_philosophy, camera_philosophy |
| **Framing & Composition** | VL Canon (creative fields) | framing_philosophy, composition_philosophy, movement_philosophy |
| **Visual Realism & Texture** | VL Canon (realism + texture + depth) | realism_level, texture_philosophy, depth_philosophy, focus_philosophy |

### VPB Contract Rules

1. VPB sections are **rendered from** the VL Canon, not inferred separately
2. If VL Canon is empty (not yet inferred), VPB sections read from PCP as fallback
3. VPB NEVER infers its own VL fields — that would create a second inference authority
4. The VL section in VPB is the CANONICAL OUTPUT that architects/directors read

### VPB Non-VL Sections

| VPB Section | Domain Owner | Sources |
|-------------|-------------|---------|
| Project Overview | PCP | Project Identity |
| World / Locations | Location Canon | Location inference outputs |
| Characters | Wardrobe Canon | Wardrobe inference outputs |
| Props & Vehicles | Props + Vehicle Canons | Prop + Vehicle inference outputs |
| Creatures | Creature Canon | Creature inference outputs |
| Production Design | PD Canon | Production Design inference outputs |

---

## Q8 — Registry Feasibility Assessment

### Can Visual Language be Represented Deterministically?

**Verdict: PARTIAL — 12 deterministic + 4 LLM + 1 hybrid**

### Deterministic Dimensions (Primary Drivers)

| Input Dimension | Impact | Example |
|----------------|--------|---------|
| **genre** | **Primary** — drives baseline look | noir → high contrast, deep shadows, anamorphic |
| **period** | **Secondary** — modifies genre for era | noir + 2087 → high contrast + neon, not shadows |
| **visual_tone** | **Tertiary** — overrides extremes | dark noir → crush shadows. bright noir → graphite/grey instead. |
| **production_language** | **Quarternary** — realism vs spectacle | gritty_noir → hand held. epic_noir → crane shots. |

### Anchor Count Estimate

| Field Group | Anchors | Strategy |
|-------------|---------|----------|
| Contrast/Lighting | 4-5 × 6 genres = ~30 | genre × production_language |
| Color/Saturation | 3-4 × 5 genres = ~18 | genre × visual_tone |
| Lens/Depth | 2-3 × 4 genres = ~10 | genre × period |
| Atmosphere/Texture | 2-3 × 4 genres = ~10 | genre × climate × period |
| **Total** | **~60-75** | Composable, not full matrix |

### Compression Strategy

**Genre-first inheritance** (proven approach — same as Location):

```
Genre (noir)
  ├── Period (contemporary) → contrast: high, shadows: deep
  ├── Period (1940s)        → contrast: very_high, shadows: venetian_blind
  ├── Period (2087)         → contrast: extreme, shadows: neon_scatter
  
Genre (fantasy)
  ├── Period (medieval)     → contrast: soft, shadows: candle_flicker
  ├── visual_tone (dark)    → contrast: elevated, shadows: deep_forest
  ├── visual_tone (bright)  → contrast: low, shadows: soft_diffuse
```

### Fallback Strategy

1. **Exact match**: genre + period + visual_tone → VL philosophy
2. **Partial match**: genre + visual_tone (drop period) → use period's "neutral" variant
3. **Genre-only**: use genre baseline with 0.6 confidence
4. **Cross-domain**: style_influences → look up referenced style's VL profile
5. **Creative**: LLM expansion for camera_philosophy, framing, composition, movement

### Input Validation

| Candidate Input | Use for VL Anchors? | Rationale |
|----------------|-------------------|-----------|
| `genre` | ✅ **Yes — Primary driver** | Single strongest predictor of VL |
| `period` | ✅ **Yes — Secondary modifier** | Technology level affects lens/lighting |
| `visual_tone` | ✅ **Yes — Tertiary modifier** | Dark/moody/bright override |
| `style_influences` | ✅ **Yes — Cross-reference** | Look up referenced style's VL profile |
| `production_language` | ✅ **Yes — Quaternary modifier** | Realism vs spectacle override |
| `target_audience` | ❌ **Reject — No causal link** | Does NOT deterministically drive VL choices |

---

## Q9 — Sparse Narrative Demonstration

### Input: "A detective enters a pub."

### Location Canon (exists — owned by LC)

```
architecture_style:      contemporary_commercial
spatial_function:        hospitality
lighting_character:      warm_candlelit_moderate
material_palette:        wood_brick_leather
visual_density:          moderate
condition:               functional_worn (noir influence)
```

### Visual Language Canon (proposed — owned by VL Canon / CPIE)

```
colour_philosophy:       warm_amber_with_teal_shadows    (noir + pub warmth)
lighting_philosophy:     low_key_practical_motivated     (pub practicals as keys)
contrast_model:          high_contrast_noir               (noir genre)
shadow_philosophy:       deep_crushing_blocked_shadows    (noir genre)
saturation_profile:      muted_warm                      (noir + warm practicals)
palette_bias:            warm_amber_leaning               (pub atmosphere)
realism_level:           grounded_stylized                (noir crime)
atmosphere_philosophy:   hazy_warm                       (pub + cigarette smoke)
lens_philosophy:         spherical_mid_wide               (pub interior, stay wide)
depth_philosophy:        moderate_deep                    (see environment, not just face)
camera_philosophy:       subtle_handheld_tense            (detective's unease)
texture_philosophy:     organic_grain_with_dirt          (noir texture)
```

### Production Design Canon (future — owned by PD Canon)

```
furniture_layout:        scattered_tables_bar
wall_treatment:          dark_wainscoting
floor_treatment:         worn_wood_planks
window_treatment:        frosted_glass_partial_curtains   (for shadow play)
set_dressing:            liquor_bottles_glasses_ashtrays
smoke_element:           present_atmospheric
practical_lamp_type:     hanging_fixtures_amber_bulbs
```

### Three-Layer Overlap Proof

| Concept | LC | VL | PD | Verdict |
|---------|----|----|----|---------|
| Warm lighting | `lighting_character: warm` | `palette_bias: warm_amber` | Uses warm-bulb practicals | LC = factual. VL = creative. PD = consistent. ✅ |
| Shadows | — | `shadow_philosophy: deep_crushing` | PD sets curtains for shadow play | VL = how. PD = what. ✅ |
| Haze | — | `atmosphere: hazy_warm` | PD installs smoke machine | VL = how it reads. PD = physical. ✅ |
| Architecture | `architecture_style: contemporary` | — | — | LC only. ✅ |
| Colour palette | — | `colour_philosophy: warm_amber_teal` | — | VL only. ✅ |
| Furniture | — | — | `furniture_layout: scattered` | PD only. ✅ |
| Lens choice | — | `lens: spherical_mid_wide` | — | VL only. ✅ |
| Floor | — | — | `floor: worn_wood` | PD only. ✅ |

**Zero duplicate truth. Every concept has exactly one owner.**

---

## Q10 — Phase Sequencing Re-Evaluation

### Current State

| Domain | Status |
|--------|--------|
| Wardrobe | ✅ Live |
| Props | ✅ Live |
| Vehicles | ✅ Live |
| Creatures | ✅ Live |
| Location | ✅ Live (certified) |
| **Visual Language** | **⬜ Next — this audit clears the gate** |
| Production Design | ⬜ After VL |

### Recommended Order: **Confirmed — Location → VL → PD**

### Dependencies

| Domain | Depends On | Nature of Dependence |
|--------|-----------|---------------------|
| **VL** | PCP (genre, visual_tone, production_language, style_influences) | Deterministic anchor inputs |
| **VL** | LC (lighting_character, architecture_style) | VL reads LC's installed fixtures to determine how to shoot them |
| **PD** | LC (architecture, materials) | PD operates within physical constraints |
| **PD** | VL (colour_philosophy, lighting_philosophy) | PD set dressing should be consistent with VL — but NOT dependent |

### Why VL before PD

1. **PD reads color from VL**. A "blue_teal" VL philosophy means PD should use blue-compatible set dressing colors. Building PD before VL means PD has no color context.
2. **PD reads lighting from VL**. A "chiaroscuro" VL means PD should install practicals that support dramatic shadows. Building PD without VL context creates guesswork.
3. **VL is simpler than PD**. VL has fewer fields (12 deterministic + 4 creative ≈ manageable). PD has infinite dressing possibilities.
4. **VL has proven registry patterns** (genre × period × visual_tone works for Location — same shape works for VL).

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Camera/framing/movement fields are too creative | Medium | Use LLM expansion layer for these 4 fields. Deterministic registry for the other 12. |
| Scope creep (VL absorbs PD) | Medium | **Boundary rule enforced**: VL = how photographed. PD = what on set. No overlap. |
| VL depends on too many PCP dimensions | Low | Only 4 inputs needed: genre, period, visual_tone, production_language. Same as Location. |
| Lookbook depends on VL before VL exists | Low | Lookbook already has fallback color system generation from PCP alone. Adding VL is an upgrade. |

---

## Required Revisions (5 Items — from original Location audit pattern)

### R1 — Anchor Count Confirmation
Before implementation, produce a definitive anchor count: **60-75 anchors** across 12 deterministic fields, compressed via genre-first × period × visual_tone inheritance. Confirm during architecture design phase.

### R2 — LLM Boundary Formalization
Formalize which 4 fields are LLM-only (camera_philosophy, framing_philosophy, movement_philosophy, composition_philosophy). The registry must still EXIST for these fields (tier-4 fallback: "creative_license"), but they should primarily route to the LLM expansion layer.

### R3 — Atmosphere/Texture Hybrid Rule
Define the deterministic vs creative boundary for atmosphere_philosophy (genre+period = deterministic base; specifics like "smoke density 30%" = LLM choice). Same for texture_philosophy.

### R4 — Scale Philosophy Ownership
Confirm in architecture design whether `scale_philosophy` belongs in VL or is a story-level choice routed through PCP. **Recommendation**: Split — `visual_scale` (epic/intimate/claustrophobic) in VL for photographic framing; `narrative_scale` (world-saving/personal/intimate) stays in PCP's `setting_scope`.

### R5 — VL→PD Consistency Contract (not dependency)
Add a formal "VL→PD Consistency Guide" that PD's architecture design phase will use. Not a dependency (PD doesn't require VL to generate), but a constraint (PD must be consistent with VL). Currently this is an informal pattern; make it formal.

---

## Revision Tracker

```
R1: Anchor Count Confirmation — PENDING
R2: LLM Boundary Formalization — PENDING
R3: Atmosphere/Texture Hybrid Rule — PENDING
R4: Scale Philosophy Split — PENDING (recommended)
R5: VL→PD Consistency Guide — PENDING
```

---

## Final Verdict

### **B — Approved with Revisions**

The ownership boundaries are **structurally sound and theoretically proven**:

- ✅ 20-field ownership matrix is complete and conflict-free
- ✅ PCP boundary is correct (3 fields, no expansion needed)
- ✅ VL vs PD boundary is formally defined (photographed vs built)
- ✅ VL vs LC boundary is formally defined (how light is used vs what light exists)
- ✅ Hero Frame / Lookbook / VPB contracts are defined
- ✅ Registry feasibility is validated (60-75 anchors, genre-first compression)
- ✅ Sparse narrative demonstrates zero duplicate truth
- ✅ Phase sequence is confirmed (Location → VL → PD)

**5 revisions required** (R1-R5) before implementation begins. These are formalization tasks, not structural changes. The architecture is sound.

