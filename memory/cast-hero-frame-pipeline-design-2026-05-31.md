# DESIGN — Canonical Cast Binding + Hero Frame Pipeline

**Date:** 2026-05-31  
**Previous work:** NEL stabilization (SAT-1) → Visual DNA/Wardrobe auto-pipeline now operational  
**Architecture-strict:** Design before implementation. No blind patches.

---

## PHASE 1 — CURRENT CAST SYSTEM AUDIT

### Table Inventory

| Table | Type | Purpose | Writers | Readers |
|-------|------|---------|---------|---------|
| `ai_actors` | Entity | AI actor profiles (name, status, anchors) | Cast UI, ai-production-layer | generate-hero-frames, evaluate-visual-governance, vpb-assembly-engine |
| `ai_actor_versions` | Version | Actor recipe snapshots | ai-production-layer | generate-hero-frames |
| `ai_actor_assets` | Storage | Actor anchor images (reference_image, headshot, body) | ai-production-layer | generate-hero-frames |
| `project_ai_cast` | Binding | Character↔Actor binding | Cast UI, ai-cast, suggest-cast | generate-hero-frames, vpb-assembly-engine, evaluate-visual-governance |
| `character_visual_dna` | Entity | Visual identity for each character | generate-visual-dna-from-canon | generate-hero-frames, vpb-assembly-engine, evaluate-visual-governance |
| `character_wardrobe_profiles` | Entity | Wardrobe canon per character | generate-visual-dna-from-canon | vpb-assembly-engine |
| `project_images` | Storage | Hero frames + identity images | generate-hero-frames | vpb-assembly-engine, evaluate-visual-governance |

### Current Writer Map

| Data | Writer | When |
|------|--------|------|
| `character_visual_dna` | `generate-visual-dna-from-canon` | NEL stage "dna" — now uses `generate_from_atoms` mode |
| `character_wardrobe_profiles` | `generate-visual-dna-from-canon` | Side-effect of DNA generation |
| `project_ai_cast` | NO AUTO WRITER | ONLY manual via CastWorkspace UI |
| `ai_actors` | NO AUTO WRITER | ONLY manual via AICastLibrary UI |
| `ai_actor_versions` | NO AUTO WRITER | ONLY manual |
| `ai_actor_assets` | NO AUTO WRITER | ONLY manual |
| `project_images` (hero) | `generate-hero-frames` | Manual trigger from VisualizeWorkspace |

### Current Reader Map (for VPB)

| VPB Section | Source Table | Status |
|-------------|-------------|--------|
| Characters | `narrative_entities` + `character_visual_dna` | ✅ Working |
| Cast | `project_ai_cast` + `ai_actors` | ❌ Always 0 — no auto writer |
| Wardrobe | `character_wardrobe_profiles` | ✅ Now working |
| Hero Frames | `project_images` (role=hero*) | ❌ Always 0 — never auto-generated |

### Current Blockers

1. **No auto cast suggestion/binding:** `project_ai_cast` has zero auto-writers. Every project shows 0 actor bindings.
2. **No auto actor creation:** `ai_actors` table requires manual entry.
3. **No auto hero frame generation:** `generate-hero-frames` is never triggered by any pipeline stage.
4. **Governance gates are contradictory:** `castComplete` in governance currently does NOT require actor bindings — but hero frames section in VPB reads from `project_ai_cast` which is always empty.

---

## PHASE 2 — CANONICAL CAST CONTRACT

### Architecture

Cast binding is a SEPARATE concern from visual DNA/warrobe/VPB. It requires:
- An actor database (ai_actors) — pre-existing actors
- A matching algorithm (suggest-cast function exists)
- User intent validation (which actor for which character)

### The Contract

```
Visual DNA → Cast Candidate → Actor Binding → Anchors Locked
   (exists)      (suggest)      (confirm)       (assets present)
```

### Table Ownership

| Table | Owner | Create | Update | Delete |
|-------|-------|--------|--------|--------|
| `ai_actors` | AICastLibrary UI | Manual + (future: import) | Manual | Manual |
| `project_ai_cast` | CastWorkspace UI | Manual + suggest-cast | Manual | Manual |
| `ai_actor_versions` | ai-production-layer | On actor promote | On version | Manual |
| `ai_actor_assets` | ai-production-layer | On anchor generate | On regenerate | Manual |

### Status Values

**project_ai_cast.binding_status:**
- `suggested` — AI-generated candidate, not confirmed
- `bound` — User confirmed this actor for this character
- `locked` — Actor has approved version + anchor images

**ai_actors.anchor_coverage_status:**
- `insufficient` — Fewer than 2 anchor images
- `partial` — At least 2 of 3 required types present
- `complete` — All 3 required types: headshot, full_body, reference_image

**ai_actors.anchor_coherence_status:**
- `unknown` — Not evaluated
- `conflicting` — Anchors show inconsistent facial/body features
- `coherent` — All anchors consistent

### Provenance

```typescript
project_ai_cast.meta_json: {
  suggested_by: "suggest-cast" | "manual",
  confirmed_by: string | null,  // user_id
  confirmed_at: string | null,  // ISO timestamp
  nel_run_at: string | null,    // when visual DNA triggered this
  source_dna_version: number,   // character_visual_dna version
}
```

### Idempotency

- `suggest-cast` is idempotent: same character_key + visual DNA hash → same suggestion
- `project_ai_cast` upsert on `(project_id, character_key)`
- An actor can be re-bound to a different character for a different project

---

## PHASE 3 — HERO FRAME DEPENDENCY CONTRACT

### What generate-hero-frames Actually Reads

| Dependency | Table | Why | Classification |
|-----------|-------|-----|---------------|
| Character visual DNA | `character_visual_dna` | Identity lock (face, body, etc.) | **BLOCKING** — no DNA = no frame |
| Actor binding | `project_ai_cast` | Anchor images for identity | ENRICHMENT — fallback exists using project_images identity anchors |
| Actor anchor images | `ai_actor_assets` | Reference headshot/body | ENRICHMENT — function resolves separately |
| PD canon locations | `pd_location_design` | Background/environment context | ENRICHMENT — used if available |
| Wardrobe profile | `character_wardrobe_profiles` | Clothing canon | ENRICHMENT — used if available |
| Visual style/language | `project_visual_style` | Lighting, tone, atmosphere | **BLOCKING** — style must exist |
| Scene context | `scene_index` | Character-location mapping | ENRICHMENT — used if available |
| Governance status | `project_visual_stage_governance` | Prerequisite chain | NON-BLOCKING (function can run independently) |

### Actual BLOCKING Requirements

For generate-hero-frames to produce valid output:

1. **Visual DNA** — One or more characters with `character_visual_dna` records ✅ (NEL provides)
2. **Visual style** — Either `project_visual_style` or `project_visual_language` with basic profile ✅ (NEL provides)
3. **Actor binding OR identity image** — For character consistency:
   - Path A: `project_ai_cast` with `ai_actor_version_id` → use anchor images
   - Path B: `project_images` with `generation_purpose=character_identity` → use identity images

### What Hero Frames Write

| Table | Data | Status |
|-------|------|--------|
| `project_images` | hero_frame records with storage URLs | Current |
| `project_images.image_url` | Public signed URL | Needs backfill (like YETI fix) |
| `project_images.asset_group` = `hero_frame` | Set by function | Current |
| `project_images.generation_purpose` = `hero_frame` | Set by function | Current |

### Current Gap: No Pipeline Trigger

The NEL orchestrator runs 11 stages but NONE of them calls `generate-hero-frames`. Even when governance clears hero_frames as eligible, nobody triggers the generation.

---

## PHASE 4 — IMPLEMENTATION PLAN

### Principle: Minimal safe additions to existing pipeline

Do NOT build a cast suggestion system. Do NOT build AI actor creation. These are separate workflows.

### Step 1: Add hero frame generation trigger to NEL orchestrator (P2 scope)

After governance stage, IF hero_frames are eligible AND no hero frames exist yet:

```typescript
// In nel-orchestrator, stage 11 (governance):
if (govResult?.heroFramesEligible && currentHeroFrameCount === 0) {
  // Call generate-hero-frames
  const hfResp = await fetch(`${functionBase}/generate-hero-frames`, {
    method: "POST",
    headers: { Authorization: bearerToken, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, mode: "bulk_all_characters" }),
  });
}
```

**Feasibility check:** `generate-hero-frames` already has `resolveCharacterTruth` which handles unbound characters via identity image fallback. This means the function can run WITHOUT actor bindings.

**Risk:** If no identity images exist AND no actor bindings exist, the function produces lower-quality images (no anchor reference). This is acceptable — the output still has visual DNA consistency.

### Step 2: Add identity image fallback to generate-hero-frames

The existing `resolveCharacterTruth` function (lines 206-230) already has this fallback. The NEL pipeline should ensure identity images exist OR the fallback is robust enough.

**No change needed** — the fallback already works.

### Step 3: VPB enrichment after hero frames

The VPB assembly engine already reads `project_images` where `role IN ('hero_primary', 'hero_variant')`. Once hero frames are generated, they will automatically appear in the next VPB.

**No change needed** — VPB picks up hero frames automatically.

### Step 4: Cast suggestion (future — not in this sprint)

`suggest-cast` edge function exists but is not integrated into NEL. Integration would:
1. Read `character_visual_dna` for character traits
2. Match against `ai_actors` profiles
3. Write candidates to `project_ai_cast` with `status: "suggested"`
4. User confirms in CastWorkspace

**Not implementing in this sprint** — requires UI workflow.

---

## PHASE 5 — VALIDATION PLAN

### Test Projects

| Project | Visual DNA | Actor Bindings | Identity Images | Expected Outcome |
|---------|-----------|----------------|-----------------|------------------|
| Concrete Angels | ✅ 4 chars | ❌ 0 | ❌ 0 | Hero frames generated (lower quality — no anchor) |
| YETI (newest) | ❌ 0 | ❌ 0 | ❌ 0 | No hero frames — no visual DNA |
| [TEST] Vert Drama | ✅ 4 chars | ❌ 0 | ❌ 0 | Hero frames generated |

### Pass Criteria

1. ✅ NEL triggers hero frame generation when governance is eligible
2. ✅ Hero frames appear in `project_images` with `asset_group = 'hero_frame'`
3. ✅ Next VPB assembly picks up hero frames (section populated)
4. ✅ No errors when actor bindings are missing (fallback works)
5. ✅ No duplicate hero frames on re-run (idempotent)
6. ✅ Governance reflects hero frame count after generation

### Fail Criteria

- ❌ Hero frames generated but image quality unusable (prompt error)
- ❌ Hero frames created but not referenced in VPB (wrong role)
- ❌ NEL times out due to hero frame generation (expensive)
- ❌ Actor binding becomes blocking when the fallback should handle it

### Rollback Plan

If hero frame generation causes NEL pipeline failures:
1. Remove hero frame trigger from nel-orchestrator stage 11
2. Governance lock remains — user must manually trigger from VisualizeWorkspace
3. VPB still works without hero frames (section just shows empty)

---

## DEFINITION OF DONE

The cast binding and hero frame pipeline is operational when:

1. A project with complete visual DNA can generate hero frames automatically through the NEL pipeline
2. Hero frames are visible in the VPB after assembly
3. The system does NOT require actor bindings or cast suggestions to generate hero frames
4. Actor bindings remain an ENRICHMENT layer (not blocking)
5. Governance correctly reflects hero frame state
6. Re-running NEL does not duplicate hero frames

**Not in scope for this sprint:**
- Auto cast suggestion from visual DNA
- AI actor creation
- Actor anchor image generation
- CastWorkspace UI changes