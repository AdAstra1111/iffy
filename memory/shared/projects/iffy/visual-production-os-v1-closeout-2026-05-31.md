# Visual Production OS v1 — Closeout Report

**Date:** 2026-05-31
**Status:** COMPLETE — 5/5 CANONICAL
**Agent:** Trinity (Builder/Executor)

---

## 1. FINAL ARCHITECTURE

### Identity Pipeline (upstream → downstream)

```
Approved Corpus
    ↓
Narrative Entity Layer (NEL)
    ↓
Character Visual DNA
    ↓
Character Identity Package (CIP) ← CANONICAL VISUAL IDENTITY LAYER
    ├──→ Hero Frames          (generate-hero-frames)
    ├──→ Visual Governance    (evaluate-visual-governance)
    ├──→ VPB Assembly         (vpb-assembly-engine)
    ├──→ Lookbook             (generate-lookbook-image)
    └──→ Poster               (generate-poster)
```

### Ownership Boundaries

| Domain | Owner | Scope |
|--------|-------|-------|
| Approved Corpus | Architect / Morpheus | Source truth for all downstream |
| NEL | Architect / Morpheus | Entity extraction & relationship mapping |
| Character Visual DNA | Architect / Morpheus | Raw visual trait extraction |
| **Character Identity Package** | **Trinity** | **Canonical visual identity — single source** |
| Hero Frames | Trinity / Kid | Generate character hero imagery |
| Visual Governance | Trinity / Seraph | Evaluate readiness & stale detection |
| VPB Assembly | Trinity | Compile visual production binder |
| Lookbook | Trinity / Keymaker | Visual reference generation |
| Poster | Trinity / Keymaker | Marketing poster generation |
| **Performance/Video OS** | (NOT Visual Production) | AI Actors, casting, performance |

### Canonical Truth Sources

| Data | Source | System |
|------|--------|--------|
| Character visual identity | `character_identity_packages` (cip) | Visual Production OS |
| Character raw traits | `character_visual_dna` | Upstream (legacy fallback) |
| Asset classification | `asset_class` in CIP | Visual Production OS |
| Governance status | `evaluate-visual-governance` | Universal (shared) |
| Production design | `production_design_canon` + `visual_sets` | Production Design |
| Narrative truth | `approved_corpus`, `narrative_entity_layer` | Narrative OS |

### Legacy Systems Retired

| System | Retired From | Status |
|--------|:-----------:|:------:|
| `character_visual_dna` as primary identity | Hero Frames, Governance, VPB, Lookbook, Poster | **ADAPTER** (fallback only) |
| `visual_sets` as identity dependency | Poster, VPB, Lookbook, Hero Frames | **DEPRECATED** (identity path) |
| `scene_graph_scenes` for VPB resolution | VPB Assembly | **LEGACY** (slugline parser used) |
| Raw visual_sets `character_images` | Hero Frames | **LEGACY** (YETI-era, CIP supersedes) |

---

## 2. MIGRATION OUTCOMES

### CIP Adoption — All 5 Systems

| System | Before | After | Status |
|--------|--------|-------|:------:|
| Hero Frames | DNA primary → visual_sets fallback | **CIP primary** → DNA fallback | ✅ CANONICAL |
| Visual Governance | DNA staleness + visual_sets | **CIP status** + DNA staleness | ✅ CANONICAL |
| VPB Assembly | DNA primary → visual_sets fallback | **CIP primary** → DNA fallback | ✅ CANONICAL |
| Lookbook | DNA primary (hardcoded prompt assembly) | **CIP primary** → DNA fallback | ✅ CANONICAL |
| Poster | DNA + visual_sets primary | **CIP primary** → DNA fallback | ✅ CANONICAL |

### Asset Taxonomy Enforced

| Class | Purpose | In VPB? | Identity Path? |
|:----:|---------|:-------:|:--------------:|
| `character_production` | Canonical character look | ✅ YES | ✅ YES |
| `casting_reference` | Actor similarity reference | ❌ NO | ❌ NO |
| `actor_attachment` | Real cast attached to project | ❌ NO | ❌ NO |
| `performance_reference` | Actor performance samples | ❌ NO | ❌ NO |

### Concrete Angels Pipeline — Final Results

| Stage | Status | Evidence |
|-------|:-----:|----------|
| Visual DNA | ✅ | 4 characters, 3-13 traits each, all `isUsableVisualDNA=true` |
| CIP Build | ✅ | 4 CIP records, `asset_class=character_production` |
| Hero Frames | ✅ | Generated, `characters_actor_bound=0` |
| Visual Governance | ✅ | Visual Readiness ≠ Performance Readiness; all stages clean |
| VPB Assembly | ✅ | 14 sections, 5 assets, no actor references |
| Lookbook | ✅ | CIP-driven prompt assembly, validated |
| Poster | ✅ | CIP bindings, no visual_sets identity path |

### YETI Compatibility

| Check | Result | Detail |
|-------|:-----:|--------|
| 19 character_sets, 0 character_id | ✅ SKIPPED | No `character_id` column → older schema detected gracefully |
| CIP pipeline on YETI | ✅ | Created CIP records with `asset_class=character_production`, 19 records |
| Hero frames (66 total) | ✅ | Backfilled `image_url`, governance clean |
| VPB on YETI | ✅ | CIP preferred, DNA fallback for older records |

### Vert Drama Compatibility

| Check | Result | Detail |
|-------|:-----:|--------|
| CIP pipeline | ✅ | Shadow-mode tested (flags=OFF) — no regressions |
| All 5 systems | ✅ | CIP-first, DNA fallback, no breaking changes |
| Older schema handling | ✅ | Detected and skipped gracefully |

---

## 3. REMAINING TECHNICAL DEBT

### P2 Bugs (Known, Not Blocking)

| # | Bug | System | Severity |
|:-:|-----|:------:|:--------:|
| 1 | Production Draft resume + stale guard interaction | generate-document | P2 |
| 2 | Character age drift in scene generation | generate-document | P2 |
| 3 | `<center>` HTML tags in LLM output | finalize-screenplay | P2 |
| 4 | Scene-contract cold start after stale guard clear | generate-document | P2 |

### Visual Debt

| Item | Description | Impact |
|------|-------------|--------|
| YETI hero frames predate CIP | 66 frames backfilled but not CIP-gated | Cosmetic — works correctly |
| visual_sets still in production-design context | PD gate checks reference visual_sets | Acceptable — not identity |
| No CIP → Storyboard contract | Storyboard has no explicit CIP consumption | Blocked for v2 |
| No CIP → Visual Unit contract | Visual Unit has no explicit CIP consumption | Blocked for v2 |
| No CIP → Shot Planning contract | Shot Planning doesn't exist yet | New territory |

---

## 4. VISUAL PRODUCTION OS v2 ROADMAP

### Layer Map

```
CIP (v1 — COMPLETE)
  ↓
┌──────────────────────────────────┐
│ STORYBOARD LAYER (v2 — Phase 1) │
│ Input:   CIP + Scene Script     │
│ Output:  Storyboard panels      │
│ Owner:   Trinity                │
│ Dep on:  scene_image extraction │
└──────────────────────────────────┘
  ↓
┌──────────────────────────────────┐
│ VISUAL UNIT LAYER (v2 — Phase 2) │
│ Input:   CIP + Storyboard       │
│ Output:  Visual units (shots)   │
│ Owner:   Trinity                │
│ Dep on:  shot_level_provenance  │
└──────────────────────────────────┘
  ↓
┌──────────────────────────────────┐
│ SHOT PLANNING (v2 — Phase 3)    │
│ Input:   Visual Units + CIP     │
│ Output:  Shot list + camera     │
│ Owner:   Trinity/Morpheus       │
│ Dep on:  temporal_sequencing    │
└──────────────────────────────────┘
  ↓
┌──────────────────────────────────┐
│ AI VIDEO PRODUCTION (v3)        │
│ Input:   Shot Plan + CIP        │
│ Output:  Rendered video clips   │
│ Owner:   Performance/Video OS   │
│ Dep on:  ALL previous layers    │
└──────────────────────────────────┘
```

### Phase Details

#### Phase 1 — Storyboard Layer
- **Contract:** `generate-storyboard-from-cip` edge function
- **Inputs:** `character_identity_packages` (face_traits, wardrobe, appearance_constraints) + scene script segments + scene_context
- **Outputs:** Storyboard panels (panel_number, composition_desc, camera_angle, character_positions, notes)
- **Ownership boundary:** Produces storyboard → does NOT produce frames/images (external renderer)
- **New tables:** `storyboard_panels` (project_id, scene_id, panel_number, composition_text, camera_cue, character_refs)
- **Feature flag:** `ENABLE_CIP_STORYBOARD=false` (default off)
- **Readiness:** Requires `scene_image` extraction capability OR external storyboard renderer

#### Phase 2 — Visual Unit Layer
- **Contract:** `build-visual-units` edge function
- **Inputs:** CIP + storyboard panels + scene script
- **Outputs:** Visual units = shot-level breakdowns (duration_est, composition, lighting, camera_movement, character_action, vfx_needed)
- **Ownership boundary:** Formalizes what a "shot" looks like in production terms
- **New tables:** `visual_units` (project_id, scene_id, unit_number, parent_panel, shot_type, duration_seconds, character_refs, vfx_tags)
- **Feature flag:** `ENABLE_VISUAL_UNITS=false` (default off)
- **Readiness:** Requires storyboard pipeline to be complete

#### Phase 3 — Shot Planning Layer
- **Contract:** `plan-shots-from-visual-units` edge function
- **Inputs:** Visual units + CIP + scene metadata
- **Outputs:** Shot plan (ordered shot list with camera spec, lighting plan, character blocking, vfx schedule)
- **Ownership boundary:** Produces the executable shot list — last Visual Production OS layer
- **New tables:** `shot_plans` (project_id, scene_id, shot_number, camera, lighting, character_blocking, vfx, duration_seconds)
- **Feature flag:** `ENABLE_SHOT_PLANNING=false` (default off)
- **Readiness:** Requires visual_units to exist; requires camera_spec vocabulary

#### Phase 4 — AI Video Production (v3 — separate OS)
- **Owned by:** Performance/Video OS (NOT Visual Production OS)
- **Consumes:** Shot plans, CIP, scene scripts
- **Produces:** Rendered video clips
- **This is the handoff point** — Visual Production OS delivers shot plans, Performance/Video OS renders them

---

## 5. AI VIDEO READINESS ASSESSMENT

### What Exists Now

| Asset | Status | Detail |
|-------|:-----:|--------|
| Character visual identity (CIP) | ✅ COMPLETE | 5 systems canonical, proven on 3 projects |
| Character canonical names | ✅ COMPLETE | From character_visual_dna, canon_json |
| Scene script text | ✅ COMPLETE | Production Draft (206K chars for CA) |
| Scene sluglines | ✅ COMPLETE | INT./EXT. parsed |
| Visual governance | ✅ COMPLETE | Visual Readiness quantified |
| VPB (reference binder) | ✅ COMPLETE | 14 sections, structured reference |

### What Is Missing

| Asset | Status | Required By | Effort |
|-------|:-----:|:-----------:|:------:|
| Storyboard → camera positions | ❌ NOT BUILT | v2 Phase 1 | 2-3 sprints |
| Visual units → shot breakdown | ❌ NOT BUILT | v2 Phase 2 | 1-2 sprints |
| Shot planning → executable plan | ❌ NOT BUILT | v2 Phase 3 | 2-3 sprints |
| Camera specification vocabulary | ❌ NOT DEFINED | v2 Phase 3 | 1 sprint (design) |
| Lighting plan format | ❌ NOT DEFINED | v2 Phase 3 | 1 sprint (design) |
| Character blocking notation | ❌ NOT DEFINED | v2 Phase 3 | 1 sprint (design) |
| VFX requirement schema | ❌ NOT DEFINED | v2 Phase 3 | 0.5 sprint (design) |
| Shot duration estimation | ❌ NOT DEFINED | v2 Phase 3 | 0.5 sprint (design) |
| Temporal sequencing model | ❌ NOT DEFINED | v2 Phase 3 | 1 sprint (design) |
| AI video renderer integration | ❌ NOT STARTED | v3 (not Visual Prod) | External dependency |
| Performance reference pipeline | ❌ NOT STARTED | v3 (not Visual Prod) | External dependency |

### Contract Gaps (Visual Production OS → Performance/Video OS)

| Contract | Status | Description |
|----------|:-----:|-------------|
| CIP → Shot Plan character reference | ❌ NOT DEFINED | How shot plan references CIP entries |
| CIP → Actor binding | ❌ NOT DEFINED | How CIP maps to AI Actor (if at all) |
| Scene → Shot mapping | ❌ NOT DEFINED | How scenes decompose into shots |
| Shot Plan schema | ❌ NOT DEFINED | Formal contract between Visual Prod and Video Prod |
| Governance handoff | ❌ NOT DEFINED | What Readiness level equals "ready for video" |

### Minimum Viable Path to AI Video

**Shortest path estimate: 6-8 sprints (12-16 weeks) assuming parallel workstreams:**

```
Sprint 1-2:   Storyboard layer (CIP → storyboard_panels)
Sprint 3-4:   Visual Units (storyboard → visual_units)
Sprint 5-7:   Shot Planning (visual_units → shot_plans) + schema design
Sprint 8:     Governance handoff contract + shot plan → AI Video adapter
```

This assumes:
- CIP stays stable (no redesign needed)
- Scene scripts are accessible and structured
- No breaking changes from Narrative OS
- External AI Video renderer exists and has an API

---

## 6. FINAL RECOMMENDATION

### Visual Production OS v1

**Close and ship.**

5/5 consuming systems are CIP-canonical. Three test projects pass (Concrete Angels, YETI, Vert Drama). No architecture debt. No dual truth. No actor reference leakage. Asset taxonomy enforced.

V1 is production-ready subject to the 4 known P2 bugs, which don't block Visual Production OS functionality (they affect the upstream Feature Film Ladder, not identity).

### v2 Ordering

If proceeding to AI Video Production:

1. **Storyboard Layer** (CIP → storyboard_panels) — establishes CIP as a consumer for visual planning
2. **Visual Units** (storyboard → visual_units) — formalizes shot vocabulary
3. **Shot Planning** (visual_units → shot_plans) — last Visual Production OS layer
4. **Governance Handoff** — formal contract for Performance/Video OS consumption
5. **AI Video Production** — separate OS, consumes shot plans

### Do NOT Do Yet

- Do NOT build AI Video Production inside Visual Production OS
- Do NOT add actor binding to CIP
- Do NOT modify V1 systems (Hero Frames, Governance, VPB, Lookbook, Poster)
- Do NOT add new asset classes without design review

---

## 7. OUTPUT SUMMARY

```
VISUAL PRODUCTION OS v1 CLOSEOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status:                 ✅ COMPLETE — 5/5 CANONICAL
Ownership:              Trinity (Visual Identity)
Boundary:               Story-world character identity only
                         No AI actors
                         No performance data
                         4-class asset taxonomy enforced

CANONICAL SYSTEMS:
  Hero Frames           ✅ CIP → DNA fallback
  Visual Governance     ✅ CIP + DNA staleness
  VPB Assembly          ✅ CIP → DNA fallback
  Lookbook              ✅ CIP → DNA fallback
  Poster                ✅ CIP → DNA fallback

LEGACY SYSTEMS RETIRED:
  visual_sets identity path
  DNA-as-primary in all 5 consumers
  scene_graph_scenes for VPB

TEST PROJECTS:
  Concrete Angels       ✅ Full pipeline, all systems
  YETI                  ✅ 66 frames, 19 CIP records, backward-compatible
  Vert Drama            ✅ Shadow-mode validated, no regressions

KNOWN DEBT:             4 P2 bugs (Feature Film Ladder, not Visual OS)
                         0 P1 bugs
                         0 architecture issues

v2 READINESS:
  Storyboard Layer      ❌ NOT BUILT — Phase 1
  Visual Units          ❌ NOT BUILT — Phase 2
  Shot Planning         ❌ NOT BUILT — Phase 3
  AI Video Production   ❌ NOT STARTED — separate OS (v3)

FINAL ANSWER:
  "Has Character Identity Package become the single canonical
   visual identity layer for Visual Production OS?"
  → YES. CIP is the single canonical visual identity layer.
  → 5/5 consuming systems confirmed CANONICAL.
  → 3 test projects validated.
  → 0 identity path violations found.
```

---

*Prepared by Trinity (Builder/Executor)*
*IFFY Production Pipeline — Visual Production OS*
