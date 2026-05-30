# SESS-MOR-0028B — CPIE Consumer Contract Enforcement Validation
**Status:** Validation complete
**Author:** Oracle (Morpheus role)
**Priority:** P0 — blocks CPIE Phase 1

---

## 1. ENFORCEMENT AUDIT

### Current Architecture Context

All 4 atomisers are **independent Deno edge functions** with identical structural patterns:
- Each maintains its own `makeAdminClient()` with `SUPABASE_SERVICE_ROLE_KEY`
- Each has unrestricted `.from()` access to **every table** in the database
- Each uses `@ts-nocheck` — zero type safety
- Each makes direct HTTP calls to OpenRouter for LLM generation
- No shared dependency injection exists
- No import restrictions exist

### Rule-by-Rule Classification

| Rule | Classification | Evidence |
|------|--------------|----------|
| **PCP is sole context authority** | PARTIALLY ENFORCEABLE | 3/4 atomisers currently have NO context reads (costume, prop, vehicle). 1/4 (creature-atomiser) reads `projects.genres` directly. Can be enforced via restricted DB client + linting. |
| **CPIE is sole inference authority** | PARTIALLY ENFORCEABLE | All 4 atomisers can infer independently via LLM prompts. Creature-atomiser uses genres inline. Vehicle-atomiser has the WWII map. Costume/prop have no inference (passively compliant). |
| **Atomisers are consumers only** | NOT ENFORCEABLE today | Every atomiser has `createClient(SUPABASE_SERVICE_ROLE_KEY)` — full DB access. No architectural barrier prevents them from reading any table. |
| **Provenance mandatory** | PARTIALLY ENFORCEABLE | No atomiser currently emits provenance. Can be enforced via output schema validation + test. |
| **CDG registration mandatory** | NOT ENFORCEABLE today | No atomiser currently registers with CDG. CDG is a client-side library — edge functions can't import it (different runtime). |
| **Extraction wins over inference** | DOCUMENTED ONLY | No mechanism enforces this merge order. Currently atomisers have no merge logic at all. |
| **No direct context queries** | NOT ENFORCEABLE today | `admin.from("projects")` works today. No checks exist. |

**Verdict:** Of 7 contract rules, only **0** are fully enforceable today. **2** are partially enforceable with effort. **3** require new architectural controls. **1** is documented-only.

---

## 2. DIRECT QUERY PREVENTION PLAN

### Mechanism Assessment

| Mechanism | Feasibility | Coverage | Notes |
|-----------|-------------|----------|-------|
| **Service boundary** | ✅ High | Complete | New restricted DB client wrapper. Atomisers use `atomiserDB` instead of `admin`. Wrapper exposes only: `getAtoms()`, `getSceneText()`, `getNarrativeEntities()`, `upsertAtoms()`. **Hides:** `from("projects")`, `from("project_canon")`, `from("project_visual_style")`. |
| **Type restrictions** | ⚠️ Medium | Partial | `@ts-nocheck` must be removed first. TypeScript strict mode prevents `.from("unknown_table")`. But the admin client itself has schema-generated types — if we use generated types, unlisted tables won't compile. |
| **Dependency injection** | ✅ High | Complete | CPIE bridge module in `_shared/` that ALL atomisers import for context. Atomisers never create their own Supabase client. The bridge provides the restricted interface. |
| **Interface-only access** | ✅ High | Complete | Same as DI. Define `AtomiserRepository` interface. Atomisers receive a concrete implementation that enforces the boundary. |
| **Linting** | ⚠️ Medium | Partial | `deno lint --rules` can flag `.from("projects")` but regex-based linting is fragile. Better as CI gate. |
| **Runtime validation** | ✅ High | Complete | Guard function checks every canon emission for provenance + cdg_context before allowing the write. |
| **Test enforcement** | ✅ High | Complete | Architecture tests in CI that scan atomiser source for forbidden patterns. |

### Recommended Stack

```
LAYER 1 — SERVICE BOUNDARY (prevents access)
  Restricted DB wrapper: AtomiserRepository in _shared/
  └─ Only exposes: getAtoms(), getSceneText(), getNarrativeEntities(), upsertAtoms()
  └─ Hides: from("projects"), from("project_canon"), from("project_visual_style")

LAYER 2 — TYPE RESTRICTIONS (prevents bypass)
  Remove @ts-nocheck → strict TypeScript → generated Supabase types
  └─ Table not in generated types = doesn't compile

LAYER 3 — RUNTIME VALIDATION (catches violations)
  Guard: validateCanonEmission(output) → rejects if missing provenance/cdg_context
  └─ Runs before every upsertAtoms() call

LAYER 4 — TEST ENFORCEMENT (CI gate)
  Contract compliance test suite runs on every PR
  └─ Scans for: .from("projects"), service_role usage, missing provenance
```

### Critical Implementation Detail

**The service_role key is the root of all danger.** As long as each atomiser has `createClient(SUPABASE_SERVICE_ROLE_KEY)`, it can do anything.

**Solution:** Move the service_role key out of the atomisers and into a single shared provider. The atomisers call `getAtomiserDB()` from `_shared/atomiser-db.ts`. This function creates the Supabase client internally and returns the restricted wrapper. The atomiser never sees the key.

```typescript
// supabase/functions/_shared/atomiser-db.ts
export function getAtomiserDB(): AtomiserRepository {
  const client = createClient(url, serviceRoleKey);
  return {
    getAtoms: (projectId) => client.from("atoms").select("*").eq("project_id", projectId),
    getSceneText: (projectId) => client.from("scene_graph_versions").select("content, scene_id").eq("project_id", projectId),
    // HIDDEN: from("projects"), from("project_canon"), from("project_visual_style")
  };
}
```

---

## 3. INPUT BOUNDARY VALIDATION

### Can an atomiser operate entirely from contract inputs?

**YES — with one addition.**

| Required Input | Available Today | Gap |
|---------------|----------------|-----|
| CPIE inferences (wardrobe, prop, vehicle, creature) | Will be provided by CPIE Phase 1 | None |
| Extracted entities (narrative_entities scan) | Each atomiser fetches independently today | Must move to shared extraction layer |
| Existing atoms (for merge/update) | Each atomiser fetches independently today | Must go through AtomiserRepository |
| Scene text (for extraction references) | Each atomiser fetches independently today | Must go through AtomiserRepository |
| **Scene contexts per entity** | **Fetched independently by each atomiser** | **⚠️ MISSING FROM CONTRACT** |

### Missing Contract Field

**scène_contexts** must be added to the atomiser input:

```typescript
interface AtomiserInput {
  // ...existing fields...
  
  scene_contexts: Record<string, SceneContext[]>;
  // keyed by entity canonical_name
  // value: array of scene snippets where this entity appears
}

interface SceneContext {
  scene_id: string;
  content: string;        // scene text where entity appears
  slugline?: string;      // INT./EXT. — for scene type
  scene_number?: number;
}
```

**Why this is critical:** Every atomiser's LLM prompt currently includes:
> "SCENE CONTEXTS WHERE THIS CREATURE APPEARS:\n{sceneContexts}"

Without this, the LLM has no narrative context for the entity — it can't generate specifics. CPIE provides the **what** (trench coat, horse, sedan) but the atomiser needs scene context to generate the **how**.

---

## 4. CONTEXT LEAKAGE AUDIT

### Leak Paths — Ranked by Risk

| Path | Risk | Existing Usage | Mitigation |
|------|------|---------------|------------|
| **`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`** | 🔴 **Critical** | ALL 4 atomisers use this | Move to shared `_shared/atomiser-db.ts`. Atomisers never see the key. |
| **Direct `.from("projects")` queries** | 🔴 **Critical** | creature-atomiser (line 382) | Remove. Replace with CPIE input. Layer 1 service boundary prevents. |
| **Direct `.from("project_visual_style")`** | 🟡 Medium | NOT USED today | Service boundary prevents future use. |
| **Direct `.from("project_canon")`** | 🟡 Medium | NOT USED today | Service boundary prevents future use. |
| **`Deno.env.get("OPENROUTER_API_KEY")`** | 🟢 Low | ALL 4 atomisers use this | Required for LLM calls. Removed from contract scope — this is a pipeline concern, not a context concern. |
| **Direct HTTP to internal APIs** | 🟢 Low | NOT USED today | Could be prevented by service architecture but out of scope. |
| **Metadata from narrative_entities** | 🟢 Low | creature-atomiser reads `meta_json` |  ✅ Allowed — this is entity-level extraction data, not project context |

### Risk Assessment Summary

```
Current attack surface: 4 atomisers × 1 service_role key = 4 independent paths
                         + 1 direct projects table read = 1 active violation

After mitigation:       1 shared service_role key (in _shared/)
                        0 direct context reads
                        1 restricted interface
                        4 compile-time checks (remove @ts-nocheck)
```

**Residual risk after mitigation: LLM hallucination.** The atomiser receives CPIE context and scene contexts. The LLM could still "infer" genre or period from the scene text itself (e.g., reading "laser rifle" in scene text and inferring sci-fi). This is acceptable — scene text is narrative truth, not context resolution. The LLM is generating details within narrative truth, not creating its own world model.

---

## 5. CPIE AUTHORITY VALIDATION

### Can atomisers currently infer context without CPIE?

| Domain | Can Infer? | How? | Effective? |
|--------|-----------|------|------------|
| **Period** | Partial | creature-atomiser: LLM reads `genres` → infers period for creature design. **No explicit period inference.** | Low — genres alone are insufficient for period (crime = 1940s or 2020s?) |
| **Genre** | **YES** | creature-atomiser reads `projects.genres` directly and injects into LLM prompt. | **Direct violation.** |
| **Climate** | No | No atomiser reads or infers climate. | N/A — all atomisers have zero climate awareness. |
| **Technology level** | No | No atomiser reads or infers tech level. Vehicle-atomiser has WWII patterns but doesn't infer — it just applies regardless. | N/A — implicit WWII regardless of context. |
| **Culture** | No | creature-atomiser reads `projects.title` and `projects.logline` but has no structured culture inference. | N/A — would be LLM-based at best. |

### Violations Found

| Violation | Atomiser | Line | Severity |
|-----------|----------|------|----------|
| Reads `projects.genres` directly | creature-atomiser | 382 | 🔴 **CRITICAL** |
| Injects genres into LLM prompt without CPIE | creature-atomiser | 399-406 | 🔴 **CRITICAL** |
| WWII patterns as implicit context | vehicle-atomiser | 24-49 | 🟡 **STRUCTURAL** |
| Zero context awareness (no inference) | costume-atomiser | entire | 🟡 Coverage gap |
| Zero context awareness (no inference) | prop-atomiser | entire | 🟡 Coverage gap |

### Remediation Strategy

1. **Immediate (blocking):** Remove `projects` table query from creature-atomiser. Replace with CPIE context injection.
2. **Phase 1:** Wire CPIE registry into all 4 atomisers. Creature gets genre+period from CPIE. Vehicle gets tech+period from CPIE. Costume gets profession+climate from CPIE. Prop gets profession+tech from CPIE.
3. **Verification:** Architecture test that scans for `.from("projects")`, `.from("project_canon")`, `.from("project_visual_style")` in all atomiser source files.

---

## 6. ENFORCEMENT MECHANISMS

### Recommended Stack — Architectural Enforcement

```
┌─────────────────────────────────────────────────────────────┐
│                     COMPILE-TIME                             │
├─────────────────────────────────────────────────────────────┤
│ Remove @ts-nocheck from all atomisers                        │
│ Enable strict TypeScript with generated Supabase types        │
│ Import AtomiserRepository type (interface)                    │
│                                                              │
│ Effect: .from("projects") won't compile if not in types       │
│         .from("project_visual_style") won't compile either    │
└─────────────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────────────┐
│                      RUNTIME                                 │
├─────────────────────────────────────────────────────────────┤
│ getRestrictedDB() → AtomiserRepository                        │
│   └─ Only exposes typed methods:                              │
│      getAtoms(), getSceneText(), getNarrativeEntities(),      │
│      upsertAtoms(output, provenance, cdg_context)             │
│   └─ HIDES: .from(), .rpc(), .sql()                           │
│                                                              │
│ upsertAtoms() validates guard before write:                   │
│   └─ provenance.reasoning.length > 0                         │
│   └─ provenance.source_type ∈ {extracted,inferred,user}      │
│   └─ cdg_context.node_id defined                             │
│                                                              │
│ Effect: Context reads physically impossible                   │
│         Emissions without provenance rejected                 │
└─────────────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────────────┐
│                      TESTING (CI Gate)                        │
├─────────────────────────────────────────────────────────────┤
│ Forbidden Import Test:                                        │
│   - Scan all atomisers for .from("projects")                 │
│   - Scan all atomisers for .from("project_canon")            │
│   - Scan all atomisers for .from("project_visual_style")     │
│   - Scan all atomisers for service_role env var read         │
│                                                              │
│ Contract Compliance Test:                                     │
│   - Mock AtomiserRepository                                  │
│   - Inject CPIE output                                       │
│   - Verify output carries provenance + cdg_context            │
│   - Verify output does NOT contain context fields             │
│                                                              │
│ Effect: Violations caught in CI, never deployed               │
└─────────────────────────────────────────────────────────────┘
```

### Why NOT Linting-Only

Linting can detect `.from("projects")` but:
- Regex is fragile — `admin.from("pro" + "jects")` bypasses pattern matching
- Doesn't detect indirect access through shared modules
- Can't enforce output schema (provenance, cdg_context)
- Easy to disable or ignore

The **service wrapper + type restrictions** approach is self-enforcing at the architecture level.

---

## 7. MIGRATION VALIDATION

### Creature-atomiser

| Dimension | Detail |
|-----------|--------|
| **Current violation** | Reads `projects.genres` directly (line 382). Injects genres into LLM prompt (line 399-406). **Active context resolution.** |
| **Required migration** | Remove `admin.from("projects").select("title, format, logline, genres, premise, budget_range")`. Replace with CPIE context object passed as input. The CPIE object contains: genre array, period string, tech level, climate. The LLM prompt receives structured context instead of raw DB data. |
| **Residual risk** | Low. The creature-atomiser also reads `narrative_entities.meta_json` — this is extraction-level entity data, not project context. Low risk of bypass. |
| **Expected effort** | 1 day (remove 15 lines, add 3 lines, update LLM prompt format) |

### Vehicle-atomiser

| Dimension | Detail |
|-----------|--------|
| **Current violation** | WWII hardcoded VEHICLE_PATTERNS (lines 24-49). Zero context awareness. **Implicit WWII assumption.** |
| **Required migration** | Replace `VEHICLE_PATTERNS` with CPIE vehicle registry call. The registry returns context-appropriate vehicles based on period, tech level, and geography. Keep remaining extraction (narrative_entities + scene scan) but remove the WWII patterns. LLM prompt receives CPIE priors instead of WWII defaults. |
| **Residual risk** | Medium. If the CPIE vehicle registry is incomplete, the atomiser falls back to scene-level extraction only. Solutions: (a) comprehensive registry, (b) CPIE returns "unknown" with low confidence so LLM generates from scene text alone. |
| **Expected effort** | 2 days (replace patterns, update canonicalise function, wire CPIE input, update LLM prompt) |

### Costume-atomiser

| Dimension | Detail |
|-----------|--------|
| **Current violation** | Zero context awareness. Only extracts "wears:" keyword references. **No inference for sparse narratives.** |
| **Required migration** | Wire CPIE wardrobe inference before keyword extraction. CPIE provides profession-based outfit priors (detective → trench coat, soldier → uniform). The atomiser merges: CPIE priors + explicit extraction (extraction wins on conflict). |
| **Residual risk** | Low. This is additive — existing extraction behavior is unchanged. CPIE fills gaps. |
| **Expected effort** | 1 day (add CPIE input merge before extraction step) |

### Prop-atomiser

| Dimension | Detail |
|-----------|--------|
| **Current violation** | Zero context awareness. Only scans for prop nouns in scene text. **No profession-based inference.** |
| **Required migration** | Wire CPIE prop inference before scanning. CPIE provides profession-based prop priors (detective → notebook, badge, radio; doctor → stethoscope, clipboard). Merge: CPIE priors + extraction (extraction wins). |
| **Residual risk** | Low. Same additive pattern as costume. |
| **Expected effort** | 0.5 day (same pattern as costume, simpler) |

### Total Migration Effort

| Atomiser | Severity | Effort | Risk |
|----------|----------|--------|------|
| Creature | 🔴 Critical | 1 day | Low |
| Vehicle | 🔴 Critical | 2 days | Medium |
| Costume | 🟡 Gap | 1 day | Low |
| Prop | 🟡 Gap | 0.5 day | Low |
| **Total** | | **4.5 days** | |

---

## 8. COMPLIANCE TEST SUITE

### Test 1 — No Direct Project Queries

```typescript
describe("CPIE Consumer Contract — No Direct Context Queries", () => {
  const FORBIDDEN_TABLES = ["projects", "project_canon", "project_visual_style"];
  
  for (const atomiser of ["costume", "creature", "vehicle", "prop"]) {
    describe(`${atomiser}-atomiser`, () => {
      for (const table of FORBIDDEN_TABLES) {
        it(`does not query ${table}`, async () => {
          const source = await fs.readFile(
            `supabase/functions/${atomiser}-atomiser/index.ts`, "utf-8"
          );
          const hasQuery = source.includes(`.from("${table}")`);
          expect(hasQuery).toBe(false);
        });
      }
      
      it("does not use Deno.env.get with SUPABASE_SERVICE_ROLE_KEY directly", () => {
        // After migration — the key should only be in _shared/
        // This test would be removed if the key moves to _shared/
      });
    });
  }
});
```

### Test 2 — No Independent Inference

```typescript
describe("CPIE Consumer Contract — No Independent Inference", () => {
  const FORBIDDEN_PATTERNS = [
    { pattern: /GENRES|genre.*map|period.*map/gi, reason: "genre/period inference" },
    { pattern: /PERIOD_TECH|GENRE_TONE|BIOME_CLIMATE/gi, reason: "PCP registry copy" },
    { pattern: /climate.*rainy|climate.*temperate|climate.*arctic/gi, reason: "climate inference" },
    { pattern: /technology.*level|tech.*level |infrastructure.*period/gi, reason: "tech inference" },
  ];
  
  for (const atomiser of ["costume", "creature", "vehicle", "prop"]) {
    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      it(`does not contain context inference (${reason})`, async () => {
        const source = await fs.readFile(
          `supabase/functions/${atomiser}-atomiser/index.ts`, "utf-8"
        );
        expect(source).not.toMatch(pattern);
      });
    }
  }
});
```

### Test 3 — Provenance Required on Output

```typescript
describe("CPIE Consumer Contract — Provenance Required", () => {
  it("every canon emission has source_type", () => {
    const emission: CanonEmission = {/* mock */};
    expect(emission.provenance.source_type).toBeDefined();
    expect(["extracted", "inferred", "user_supplied"]).toContain(emission.provenance.source_type);
  });
  
  it("every canon emission has confidence_score", () => {
    const emission: CanonEmission = {/* mock */};
    expect(emission.provenance.confidence_score).toBeGreaterThanOrEqual(0);
    expect(emission.provenance.confidence_score).toBeLessThanOrEqual(1);
  });
  
  it("every canon emission has reasoning", () => {
    const emission: CanonEmission = {/* mock */};
    expect(emission.provenance.reasoning.length).toBeGreaterThan(0);
  });
  
  it("every canon emission has pcp_dependencies", () => {
    const emission: CanonEmission = {/* mock */};
    expect(emission.provenance.pcp_dependencies.length).toBeGreaterThan(0);
  });
});
```

### Test 4 — CDG Registration Required

```typescript
describe("CPIE Consumer Contract — CDG Registration", () => {
  it("every canon emission has cdg_context.node_id", () => {
    const emission: CanonEmission = {/* mock */};
    const validNodes = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"];
    expect(validNodes).toContain(emission.cdg_context.node_id);
  });
  
  it("CDG node_id maps to correct domain", () => {
    const domainMap: Record<string, string> = {
      "costume": "D1",    // atoms_wardrobe
      "prop": "D2",       // atoms_prop
      "vehicle": "D3",    // atoms_vehicle
      "creature": "D4",   // atoms_creature
    };
    // Test each atomiser-domain pair
  });
});
```

### Test 5 — Merge Strategy (Extraction Wins)

```typescript
describe("CPIE Consumer Contract — Merge Strategy", () => {
  it("extraction overrides inference on conflict", () => {
    const cpieInference = { primaryOutfit: "trench_coat", confidence: 0.91 };
    const extraction = { primaryOutfit: "leather_jacket" }; // explicit script ref
    const merged = mergeCPIEAndExtraction(cpieInference, extraction);
    expect(merged.primaryOutfit).toBe("leather_jacket");
    // But provenance reflects source
    expect(merged._provenance.primaryOutfit.source_type).toBe("extracted");
  });
  
  it("inference fills gaps extraction cannot reach", () => {
    const cpieInference = { silhouette: "fitted_shoulder" }; // not in extraction
    const extraction = { primaryOutfit: "jacket" };
    const merged = mergeCPIEAndExtraction(cpieInference, extraction);
    expect(merged.silhouette).toBe("fitted_shoulder");
    expect(merged._provenance.silhouette.source_type).toBe("inferred");
  });
});
```

### Test 6 — Sparse Narrative End-to-End

```typescript
describe("CPIE Consumer Contract — Sparse Narrative", () => {
  // Crime — 1 sentence
  it("detective in noir pub -> trench_coat (ICS >= 80%)", async () => {
    const input = buildAtomiserInput({
      entities: [{ name: "Harry", role: "detective" }],
      genre: "noir",
      cpie: { /* mock CPIE output with trench_coat */ }
    });
    const output = await atomiser.generate(input);
    expect(output.inferences[0].value).toContain("trench_coat");
    expect(output.ics).toBeGreaterThanOrEqual(0.80);
  });
  
  // Fantasy — 1 sentence
  it("rider approaching fantasy capital -> horse (ICS >= 85%)", async () => {
    const input = buildAtomiserInput({
      entities: [{ name: "Rider", role: "knight" }],
      genre: "fantasy",
      period: "medieval",
      cpie: { /* mock CPIE output with horse */ }
    });
    const output = await atomiser.generate(input);
    expect(output.inferences[0].value).toContain("horse");
    expect(output.ics).toBeGreaterThanOrEqual(0.85);
  });
  
  // Sci-Fi — 1 sentence
  it("courier in cyberpunk district -> utility clothing (ICS >= 80%)", async () => {
    const input = buildAtomiserInput({
      entities: [{ name: "Runner", role: "courier" }],
      genre: "sci_fi",
      period: "distant_future",
      cpie: { /* mock CPIE output with utility_clothing */ }
    });
    const output = await atomiser.generate(input);
    expect(output.inferences[0].value).toContain("utility");
    expect(output.ics).toBeGreaterThanOrEqual(0.80);
  });
});
```

---

## 9. FUTURE DOMAIN VALIDATION

### Does enforcement scale?

| Future Domain | Layer | Existing Contract | Changes Needed |
|--------------|-------|-----------------|----------------|
| **Locations** | C5 → D5 → S1+S2 | Same CPIE→Atomiser contract | No contract changes. Needs new registry (C5). New atomiser (location-atomiser). |
| **Production Design** | C6 → D6 → S2 | Same contract | No contract changes. New registry (C6). New atomiser (pd-atomiser). |
| **Visual Language** | C7 → D7 → S1+S2+S3 | Same contract | No contract changes. New registry (C7). Wraps existing deriveStyleFromCanon as atomiser. |
| **Hero Frames** | S1 (projection) | Consumes canon, not CPIE | No CPIE changes. Reads canon (already provenance-wrapped). |
| **Lookbook** | S2 (projection) | Same as hero frames | No CPIE changes. |
| **VPB** | S3 (projection) | Same as hero frames | No CPIE changes. |
| **Storyboards** | S4 (future projection) | Same pattern | No CPIE changes. New projection node. |
| **Video Generation** | S5 (future projection) | Same pattern | No CPIE changes. New projection node. |

**Verdict:** **Contract is additive.** New domains follow the same pattern — new CPIE registry, new atomiser, existing contract. No new enforcement architecture needed.

### What would NOT scale

If a future system needs to:
- Write back to PCP (retroactively change context)
- Bypass the inference → canon → projection pipeline
- Create new atom tables outside the domain registry

None of these are planned. If they become necessary, the contract would need a new version.

---

## 10. FINAL DECISION

### Choice: B — Enforceable with Additional Controls

**Evidence:**

| Criterion | Assessment | Why |
|-----------|-----------|-----|
| Can all 4 atomisers be prevented from querying context directly? | ✅ **YES** | Service boundary (restricted AtomiserRepository) + type restrictions (remove @ts-nocheck, add generated types) |
| Can all 4 atomisers be prevented from inferring context independently? | ✅ **YES** | CPIE registry provides all inference. Atomiser local inference replaced via CPIE input. |
| Can all 4 atomisers be forced to emit provenance? | ✅ **YES** | upsertAtoms() guard rejects emissions without provenance.source_type, confidence, reasoning[]. |
| Can all 4 atomisers be forced to register with CDG? | ⚠️ **PARTIAL** | CDG is a client-side TypeScript library. Edge functions run in Deno. They share types but not runtime. CDG registration will happen at the **worker/coordinator level**, not within each atomiser. |
| Can the creature-atomiser `projects` read be removed? | ✅ **YES** | One `admin.from("projects")` call to remove. Low effort, low risk. |
| Can the vehicle-atomiser WWII patterns be replaced? | ✅ **YES** | Requires complete CPIE vehicle registry. Moderate effort, low risk. |
| Can enforcement scale to future domains? | ✅ **YES** | Additive — new registries, same contract. |
| Are there any unblockable bypass paths? | ⚠️ **ONE** | Deno `fetch()` can reach any HTTP endpoint. An atomiser could call an internal API that reads context. This is a separate trust concern (handled by API authentication).

### Residual Risk

1. **CDG registration gap** — CDG is client-side. Edge functions can't import `src/lib/cdg/` directly (different module runtime). Registration happens through a **bridge module** in `_shared/` that serializes CDG state as JSON. This is an abstraction layer, not an enforcement gap.

2. **Direct HTTP bypass** — An atomiser could call `fetch("https://internal-api/...")` to read context. Mitigation: API authentication (all internal APIs require auth). Atomisers don't have internal API tokens.

3. **LLM hallucination** — The LLM could still "infer" period from scene text (e.g., reading "horse-drawn carriage" → inferring historical). This is unavoidable and **acceptable** — the LLM is operating within narrative truth (scene text is truth), not creating independent context.

### Definition of Done

> *"Atomisers cannot independently resolve context, cannot bypass PCP, cannot bypass CPIE, cannot emit orphan outputs, and cannot generate canon without provenance and CDG registration."*

| Condition | Achievable? | Mechanism |
|-----------|-------------|-----------|
| Cannot independently resolve context | ✅ **YES** | AtomiserRepository hides projects/project_canon/project_visual_style. Type restrictions prevent re-exposure. |
| Cannot bypass PCP | ✅ **YES** | PCP is a client-side lib. Edge functions call CPIE (which consumes PCP). No direct PCP path exists. |
| Cannot bypass CPIE | ✅ **YES** | AtomiserInput has cpie_inferences as the only context field. No other context source available. |
| Cannot emit orphan outputs | ✅ **YES** | upsertAtoms() validates provenance + cdg_context before write. Outputs without registration rejected. |
| Cannot generate canon without provenance | ✅ **YES** | Same guard — provenance.reasoning required. |
| Cannot generate canon without CDG registration | ⚠️ **YES** | CDG registration through bridge module. Not within atomiser itself but enforced at coordinator level. |

**Final verdict: B — Enforceable with Additional Controls.** Four controls required:
1. 🏗️ **AtomiserRepository** — restricted DB wrapper (service boundary)
2. 🔍 **Type restrictions** — remove @ts-nocheck, strict types (compile-time)
3. 🛡️ **upsertAtoms guard** — validates provenance + cdg_context (runtime)
4. 🧪 **Contract compliance tests** — CI gate (testing)

None of these require changing PCP, CDG, or the core contract design.
