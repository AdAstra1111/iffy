# SESS-AUD-0040 — Full Runtime Governance Audit
**Oracle** | 2026-05-30 | Architecture-Strict Mode

---

## 8. Final Classification: **D — Architecture exists but runtime bypasses it**

**The certified CPIE canon architecture produces correct outputs. Zero production runtime paths consume them.**

---

## 1. Runtime Path Inventory

### Path 1: Hero Frames (generate-hero-frames)
- **Entry:** `supabase/functions/generate-hero-frames/index.ts`
- **Data source:** `project_visual_language.style_profile_json` (direct table read)
- **Data source:** `character_visual_dna` (direct table read)
- **Data source:** `canon_locations` + `location_visual_datasets` (direct table reads)
- **Data source:** `project_ai_cast` + `ai_actors` + `ai_actor_assets` (cast binding)
- **Prompt source:** Inline LLM-scored prompt built from raw DB data
- **CPIE consumption:** **ZERO**

### Path 2: Lookbook Images (generate-lookbook-image)
- **Entry:** `supabase/functions/generate-lookbook-image/index.ts`
- **Data source:** `canon_locations` (direct table read)
- **Data source:** `scene_graph_versions` (direct table read)
- **Data source:** `location_visual_datasets` (direct table read)
- **CPIE consumption:** **ZERO**

### Path 3: Visual Production Bible (VPB)
- **Entry:** `supabase/functions/_shared/visualProjectBibleEdge.ts`
- **Data source:** `project_canon.canon_json` (direct table read)
- **Data source:** Character tables (direct)
- **Data source:** Location tables (direct)
- **CPIE consumption:** **ZERO**

### Path 4: Visual DNA (generate-visual-dna-from-canon)
- **Entry:** `supabase/functions/generate-visual-dna-from-canon/index.ts`
- **Data source:** **LLM** via `callLLM()` + `extract-visual-dna` HTTP endpoint
- **Writes to:** `character_visual_dna` (which Path 1 reads)
- **CPIE consumption:** **ZERO** — writes directly to canon bypassing CPIE entirely

### Path 5: Atomisers (all 10+ atomisers)
- **Entry:** `supabase/functions/{domain}-atomiser/index.ts`
- **Primary data source:** **LLM** via OpenRouter MiniMax M2.7
- **Secondary data source (4 domains):** CPIE endpoint behind `CPIE_ENDPOINT_URL` env gate
- **Behavior when CPIE available:** LLM generates full output first, CPIE output is appended as context. LLM can override CPIE.
- **Behavior when CPIE unavailable (default):** LLM-only generation. No canon constraints.
- **Atomisers with NO CPIE code:** character, location, narrativebeat, dialogue, genre, soundtrack, structure, theme, tone

### Path 6: Frontend UI
- **Entry:** `src/pages/*.tsx`, `src/components/*.tsx`
- **Data source:** Direct Supabase queries via `supabase.from("...")`
- **Data source:** `character_visual_dna`, `project_visual_language`, `canon_locations`, `location_visual_datasets`
- **CPIE consumption:** **ZERO** — `src/lib/cpie/engine.ts` exists but never called from production UI

---

## 2. Canon Consumption Audit

| Consumer | Reads CPIE? | Reads PCP? | Reads Canon Tables? | Reads Scene Text? | Uses LLM Directly? |
|----------|------------|------------|-------------------|------------------|-------------------|
| generate-hero-frames | ❌ | ❌ | ✅ project_visual_language, character_visual_dna, canon_locations | ❌ | ✅ (prompt scoring) |
| generate-lookbook-image | ❌ | ❌ | ✅ canon_locations, scene_graph_versions | ✅ scene_graph_versions | ❌ |
| visualProjectBibleEdge (VPB) | ❌ | ❌ | ✅ project_canon, character DB, location DB | ❌ | ❌ |
| generate-visual-dna-from-canon | ❌ | ❌ | ✅ writes to character_visual_dna | ✅ | ✅ (callLLM + extract-visual-dna) |
| {domain}-atomiser (4 CPIE-aware) | ❌ (env-gated) | ❌ | ✅ reads narrative_entities, document_chunks | ✅ | ✅ (OpenRouter MiniMax M2.7) |
| {domain}-atomiser (10+ others) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Frontend UI components | ❌ | ❌ | ✅ all canon tables | ❌ | ❌ |
| cpie-inference endpoint | ✅ (self) | ❌ | ❌ | ❌ | ❌ |

### Every production runtime path bypasses CPIE.

---

## 3. Projection Layer Audit

### S1 — Hero Frames
| Canonical Field | Consumed? | Source | Notes |
|----------------|-----------|--------|-------|
| VL colour_philosophy | ❌ | Read from `project_visual_language.style_profile_json` (not CPIE) | Bypasses certified VL Canon |
| VL lighting_philosophy | ❌ | Same as above | Bypassed |
| Location Canon (all fields) | ❌ | Read from `canon_locations` (not CPIE) | Bypasses certified LC Canon |
| Wardrobe Canon (all fields) | ❌ | Read from `character_visual_dna` (not CPIE Wardrobe) | Bypasses certified Wardrobe Canon |
| PD Canon (all fields) | ❌ | Partially from `location_visual_datasets` (not CPIE PD) | Bypasses certified PD Canon |
| Prop Canon | ❌ | Not used at all | Ignored |
| Vehicle Canon | ❌ | Not used at all | Ignored |
| Creature Canon | ❌ | Not used at all | Ignored |

### S2 — Lookbook
| Canonical Field | Consumed? | Source | Notes |
|----------------|-----------|--------|-------|
| Location Canon | ❌ | Read from `canon_locations` | Bypassed |
| Scene context | ❌ | Read from `scene_graph_versions` | Not CPIE |
| Prop/Vehicle/Creature | ❌ | Not used at all | Ignored |

### S3 — VPB
| Canonical Field | Consumed? | Source | Notes |
|----------------|-----------|--------|-------|
| All 7 domains | ❌ | Read from `project_canon.canon_json` | Bypasses CPIE provenance entirely |

---

## 4. Provenance Audit

### Question: "Why did this image appear?"

**Current actual flow:**
```
Image
  → prompt built by generate-hero-frames
  → reads project_visual_language (no provenance)
  → reads character_visual_dna (no provenance)
  → reads location_visual_datasets (no provenance)
  → LLM scored
  → Image
```

**Cannot answer:**
- "Which CPIE inference produced this contrast value?" — ❌
- "Which registry anchor triggered this wardrobe?" — ❌
- "What PCP field drove this location dressing?" — ❌

**The certified flow never runs:**
```
Image
  → prompt from projection layer
  → reads CPIE Canon (provenance: anchor_id, reasoning, pcp_dependencies)
  → reads registry anchor
  → reads PCP field value
  → Image
```

### Every break in the chain:

| Break Point | What's Missing | Impact |
|------------|----------------|--------|
| generate-hero-frames reads `project_visual_language` directly | CPIE VL Canon mapping | No provenance for visual language choices |
| generate-hero-frames reads `character_visual_dna` directly | CPIE Wardrobe/Prop Canon mapping | No provenance for wardrobe choices |
| VPB reads `project_canon.canon_json` directly | CPIE domain registration | No provenance for any VPB section |
| All atomisers generate via LLM | CPIE deterministic anchor traces | No link from inference to PCP |

---

## 5. Runtime CDG Audit

### Expected behavior (architecture):
```
Narrative change → PCP stale → CPIE stale → Canon stale → Projection stale
```

### Actual behavior (runtime):
```
Narrative change → [no PCP re-resolution triggered]
  → [no CDG invalidation fired]
  → canon tables (project_canon, character_visual_dna) are LLM-generated
  → stale detection exists in hero-frame-preflight (canon_hash comparison)
  → but no invalidation chain actually runs
```

### What stale detection exists:
- `hero-frame-preflight` checks `project_canon` hash (line 313-356)
- `lookbook-preflight` checks `project_canon` hash (line 78-84)
- These are hash comparisons, not CDG graph traversals

### What's missing:
- **No PCP staleness triggers any CPIE re-inference**
- **No CDG graph is traversed at runtime**
- **No staleness propagates from PCP → CPIE → Canon → Projection**
- **The certifed CDG library (`src/lib/cdg/`) is never called from production edge functions**

---

## 6. Certification Workflow Audit

| Action | Available? | Where? | Notes |
|--------|-----------|--------|-------|
| Approve canon value | ✅ | Frontend (character_visual_dna, canons) | But CPIE is not the source |
| Reject canon value | ✅ | Frontend | But CPIE is not the source |
| Lock canon value | ✅ | Frontend (character_visual_dna, location datasets) | But CPIE is not the source |
| Override canon value | ✅ | Frontend | User can override LLM output, but CPIE is never the baseline |
| View CPIE provenance | ❌ | **Nowhere** | No UI component exists for `explainInference()` |
| View inference chain | ❌ | **Nowhere** | No "why was this inferred?" breadcrumb exists |

---

## 7. Legacy Path Audit — Ranked

### CRITICAL (immediate architecture integrity risk)

| # | Bypass | Location | Impact | Evidence |
|---|--------|----------|--------|----------|
| C1 | **generate-hero-frames bypasses all CPIE** | supabase/functions/generate-hero-frames/index.ts | Hero frames have zero CPIE provenance | Zero CPIE references in entire file. Reads project_visual_language, character_visual_dna, canon_locations directly. |
| C2 | **generate-visual-dna-from-canon uses LLM, not CPIE** | supabase/functions/generate-visual-dna-from-canon/index.ts | Writes to character_visual_dna via LLM, bypassing CPIE Wardrobe/Prop/VL canon | Uses callLLM() and extract-visual-dna HTTP. Zero CPIE references. |
| C3 | **All atomisers default to LLM-only** | supabase/functions/{domain}-atomiser/index.ts | CPIE is try-catch append-only. System runs LLM-first. | CPIE_ENDPOINT_URL gated. When unset: pure LLM. 10+ atomisers have zero CPIE code. |

### HIGH (critical downstream dependence)

| # | Bypass | Location | Impact | Evidence |
|---|--------|----------|--------|----------|
| H1 | **VPB reads project_canon.canon_json directly** | supabase/functions/_shared/visualProjectBibleEdge.ts | No CPIE provenance in production bibles | Direct table read. No CPIE domain filter. |
| H2 | **generate-lookbook-image reads canon_locations directly** | supabase/functions/generate-lookbook-image/index.ts | No CPIE location provenance | Direct table read. Zero CPIE refs. |
| H3 | **No CPIE endpoint called from frontend** | src/pages/, src/components/ | Users never see CPIE outputs | grep shows zero production calls to cpie-inference or runCPIEInference |
| H4 | **No explainInference() UI exists** | src/components/ | Cannot answer "why was this inferred?" | No component renders inference provenance |

### MEDIUM (architectural gap, no immediate production impact)

| # | Bypass | Location | Impact | Evidence |
|---|--------|----------|--------|----------|
| M1 | **CDG graph never traversed at runtime** | supabase/functions/ | Stale detection is hash-based, not graph-based | No edge function imports or calls src/lib/cdg/ |
| M2 | **PCP re-resolution never triggered** | supabase/functions/ | No narrative change → PCP → CPIE propagation | PCP is resolved once; never automatically re-resolved |
| M3 | **CPIE domain outputs not persisted** | supabase/functions/cpie-inference/index.ts | CPIE runs fresh each call; no cached canon available | cpie-inference persists to cpie_inferences table but only when CPIE_ENDPOINT_URL is configured |

### LOW (cosmetic, no production impact)

| # | Bypass | Location | Impact | Evidence |
|---|--------|----------|--------|----------|
| L1 | **Image gen resolver has no CPIE hook** | supabase/functions/_shared/imageGenerationResolver.ts | Could inject CPIE provenance into prompt | Missing imageGenResolver → CPIE bridge |
| L2 | **Hardcoded photoreal directives in hero frames** | supabase/functions/generate-hero-frames/index.ts:30-35 | VL texture_philosophy not used | PHOTOREAL_DIRECTIVES string hardcoded |

---

## 8. Final Classification

### D — Architecture Exists But Runtime Bypasses It

**Evidence:**

1. **All 7 CPIE domains are certified and tested** — they produce correct deterministic outputs with full provenance
2. **Every production runtime path bypasses CPIE** — zero production code consumes CPIE outputs
3. **CPIE endpoint exists but is env-gated** — `CPIE_ENDPOINT_URL` must be set; default is off
4. **LLM is the actual inference engine** — all 10+ atomisers use OpenRouter MiniMax; visual DNA uses callLLM
5. **Canon tables are written by LLM** — `character_visual_dna`, `project_canon`, `project_visual_language` are all LLM-populated
6. **CDG exists in tests only** — never called from production

### The gap explained:

```
Documentation says:         Reality IS:
Narrative                   Narrative
  → PCP                       → LLM extraction
  → CPIE (deterministic)      → LLM inference (atomisers)
  → Canon (7 domains)         → LLM-generated canon tables
  → Projection                → Projection
```

CPIE replaces the middle two steps. But CPIE's outputs are never routed to the runtime. The LLM path is hardcoded into every production entry point.

### The shortest path to C → B → A:

```
C — Hybrid Runtime
  ✅ Deploy cpie-inference endpoint with CPIE_ENDPOINT_URL configured
  ✅ Wire costume-atomiser, prop-atomiser, vehicle-atomiser, creature-atomiser
     to always call CPIE first, use LLM only for hybrid fields
  Cost: ~1-2 hours (env config + minor atomiser code fixes)

B — Canon Mostly Governs Runtime
  ✅ Add CPIE consumption to hero-frame-preflight
  ✅ Replace project_visual_language reads with CPIE VL queries
  ✅ Add CPIE to generate-visual-dna-from-canon as primary source
  Cost: ~4-8 hours (modify 3 edge functions)

A — Canon Architecture Governs Runtime
  ✅ Deploy CDG staleness graph as edge function
  ✅ Route all canon reads through CPIE endpoint
  ✅ Persist CPIE outputs as the single canon source
  ✅ Add explainInference() to frontend UI
  Cost: ~2-3 days (CDG deployment, CPIE persistence, UI)

A+ — Full Runtime Governance
  ✅ Hard gate: no atomiser runs LLM before CPIE
  ✅ CDG-driven stale propagation in production
  ✅ Every image answers "why did this appear?"
  ✅ User can approve/reject/lock/override CPIE values
  Cost: ~1 week (full runtime rewrite + testing)
```

---

## Summary: Every Remaining Runtime Bypass

| # | Path | Bypass | Priority | Fix |
|---|------|--------|----------|-----|
| 1 | Hero Frames | CPIE VL, Wardrobe, Location, PD | **CRITICAL** | Route through cpie-inference endpoint |
| 2 | Visual DNA | CPIE Wardrobe, Prop, VL | **CRITICAL** | Replace LLM extraction with CPIE output |
| 3 | Atomisers (all 10+) | CPIE (all domains) | **CRITICAL** | Make CPIE the primary source; LLM for enhancement only |
| 4 | VPB | CPIE (all domains) | **HIGH** | Replace project_canon reads with CPIE domain queries |
| 5 | Lookbook | CPIE Location, Scene, VL | **HIGH** | Add CPIE middleware |
| 6 | Frontend UI | CPIE (all domains) | **HIGH** | Show CPIE provenance in UI |
| 7 | CDG Runtime | Staleness propagation | **MEDIUM** | Deploy CDG as edge function |
| 8 | PCP Re-resolution | Narrative → PCP trigger | **MEDIUM** | Add narrative change trigger |
| 9 | Image Gen Resolver | CPIE prompt injection | **LOW** | Add CPIE → prompt bridge |
| 10 | Hardcoded Prompts | VL texture_philosophy ignored | **LOW** | Replace with CPIE VL output |

**10 remaining bypasses. 3 critical. 3 high. 2 medium. 2 low.**

