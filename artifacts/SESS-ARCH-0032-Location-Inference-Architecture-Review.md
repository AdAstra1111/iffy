# SESS-ARCH-0032 — Location Inference Architecture Review

**Status:** B — Approved with Revisions
**Date:** 2026-05-30
**Auditor:** Oracle — Architecture-Strict Mode

---

## 0. Executive Summary

Location (C5/D5) is **the first Phase 2 inference domain** and the **highest-leverage remaining domain** — it directly impacts hero frames (S1), lookbook (S2), and VPB (S3). A well-designed location registry would eliminate LLM hallucination for the most variance-prone production category.

**Current state:** Pure LLM. Zero context. No provenance. The location-atomiser prompt contains no genre, period, climate, or technology information — it guesses everything from location name + scene snippets.

**Target state:** Registry-driven inference. PCP context determines architecture, materials, condition, and socioeconomic indicators. LLM adds atmosphere, texture, and notes only.

---

## 1. Location Domain Analysis

### Current System (Extraction Only)

```
Script → scene scanning → noun extraction → location list
                                                 ↓
                                          LLM prompt
                                          (NO context)
                                                 ↓
                                          Location atom
```

### Critical Waste

The current location-atomiser prompt uses **NO PCP context**. It receives:
- Location name (e.g., "pub", "castle", "warehouse")
- Scene snippets
- Character names

**It must guess** era, period, architecture, materials — from the location name alone. This means:

| Input | LLM Guess (example) | Should Be (from PCP) |
|-------|---------------------|----------------------|
| "pub" | Generic English pub | 1940s wartime pub with blackout curtains, rationing notices |
| "castle" | Generic medieval castle | Fantasy medieval capital with heraldic banners, horse infrastructure |
| "warehouse" | Industrial loft | Neo-noir crime scene with interrogation lighting, evidence markings |

### Why Location Is the Right Next Domain

| Criterion | Location | PD | VL |
|-----------|----------|----|-----|
| Determinism | **High** — biome+period+function tightly constrain style | **Medium** — more creative variance | **Low** — highly subjective |
| PCP readiness | **High** — biome, climate, period, culture, tech_level all exist | **Medium** — needs more PCP fields | **Low** — VisualContext exists but is thin |
| Production impact | **High** — every hero frame has a location | **Medium** — PD affects set design | **Medium** — style lock matters at packaging |
| Anchor difficulty | **Low-Medium** — mapping tables (period→style, region→material) | **Medium-High** — harder constraints | **High** — least deterministic |

---

## 2. PCP Dependency Matrix

### Required PCP Fields

Every location attribute must trace to at least one PCP field. No orphan outputs.

| Output Category | PCP Source Fields |
|----------------|-------------------|
| Architecture Style | period, genre, infrastructure, wealth_distribution |
| Construction Era | period, technology_level, industrialization_level |
| Material Palette | biome, infrastructure, technology_level, period |
| Environmental Condition | wealth_distribution, class_structure, economic_baseline |
| Socioeconomic Level | wealth_distribution, class_structure, urban_density |
| Cultural Ornamentation | dominant_cultures, belief_systems, social_norms |
| Lighting Character | technology_level, energy_source, visual_tone |
| Technological Integration | technology_level, infrastructure, communication_level |
| Spatial Function | Entity-extracted (see below) |
| Visual Density | urban_density, setting_scope, visual_tone |

### PCP Invalidation Matrix (Current, Already Correct)

From `PCP_INVALIDATION_MATRIX` in CDG:

```typescript
P2: (temporal)  → C5 (location)
P3: (geographic) → C5
P4: (cultural)  → C5
P5: (tech)      → C5
P6: (economic)  → C5
```

**Verification:** All 5 PCP categories that drive location inference already invalidate C5. **No changes needed.**

### What's Missing

**Spatial function** is NOT in PCP. It's extracted from narrative entities (entity_type="location", subtype="pub"|"castle"|"warehouse"). This is correct — spatial function comes from extraction, not PCP. The registry must accept entity-extracted location categories as a trigger dimension.

**Required extraction interface:**
```
ExtractedLocation {
  name: string;
  function: 'residential' | 'commercial' | 'civic' | 'military' | 
            'religious' | 'industrial' | 'transportation' | 'public_house' |
            'outdoor_wilderness' | 'outdoor_urban' | 'other';
}
```

---

## 3. Output Schema Proposal

### Canonical Location Fields

| # | Field | Type | Registry-Driven | LLM-Enhanced | Example (Fantasy Capital) |
|---|-------|------|----------------|--------------|---------------------------|
| 1 | `architecture_style` | string | ✅ | No | "Gothic_medieval_fortification" |
| 2 | `construction_era` | string | ✅ | No | "medieval" |
| 3 | `material_palette` | string[] | ✅ | Yes | ["stone", "oak", "iron", "thatch"] |
| 4 | `environmental_condition` | string | ✅ | No | "weathered_maintained" |
| 5 | `socioeconomic_level` | string | ✅ | No | "feudal_upper" |
| 6 | `cultural_ornamentation` | string[] | ✅ | Yes | ["heraldic_banners", "religious_iconography", "royal_insignia"] |
| 7 | `lighting_character` | string | ✅ | Yes | "torch_candle_warm" |
| 8 | `technological_integration` | string | ✅ | No | "pre_industrial" |
| 9 | `visual_density` | string | ✅ | No | "moderate" |
| 10 | `atmospheric_mood` | string[] | No | ✅ | ["grand", "imposing", "ancient"] |
| 11 | `narrative_function` | string | No | ✅ | "capital_approaching_authority" |
| 12 | `acoustic_character` | string | No | ✅ | "echoing_stone_reverberation" |

### Registry-Driven vs LLM-Enhanced

| Boundary | Registry Decides | LLM Enhances |
|----------|-----------------|--------------|
| Architecture | ✅ Style, era, construction method | 🚫 Not permitted |
| Materials | ✅ Primary palette (stone/wood/steel) | ✅ Texture notes, weathering specifics |
| Condition | ✅ Pristine/weathered/ruined | ✅ Specific damage descriptions |
| Lighting | ✅ Natural/artificial/torch/florescent | ✅ Color temperature, fixture details |
| Socioeconomic | ✅ Affluent/working/feudal | 🚫 Not permitted |
| Cultural | ✅ Present/absent (flag) | ✅ Specific symbols, motifs |
| Tech | ✅ Level (pre-industrial/advanced) | 🚫 Not permitted |
| Atmosphere | 🚫 Not permitted | ✅ Mood, sound, sensory detail |

**LLM may enrich categories marked "Yes" in the LLM-Enhanced column. LLM may NOT decide any category marked "No".**

---

## 4. Registry Axis Design

### Anchor Format (Same as Certified CPIE Pattern)

```typescript
anchor('lc_style_medieval_gothic_fortress', 'location',
  [['period', 'in', 'medieval,fantasy_medieval,ancient'],
   ['function', 'eq', 'military'],
   ['region', 'in', 'western_europe,central_europe']],
  'architecture_style', 'gothic_fortification',
  0.92, 100,
  'registry_rule: lc_style_medieval_gothic_fortress',
  'medieval_military_architecture_uses_gothic_fortifications')
```

### Minimum Registry Axes

**5 axes** for adequate inference:

| Axis | PCP/Extraction Source | Values |
|------|----------------------|--------|
| **period** | PCP temporal_context.period | ancient, medieval, victorian, 1940s, modern, future, etc. |
| **function** | Entity extraction (location type) | residential, commercial, civic, military, religious, industrial, transportation, public_house, wilderness |
| **socioeconomic** | PCP economic_context.wealth_distribution | affluent, middle_class, working_class, subsistence, feudal |
| **region** | PCP geographic_context.primary_region | western_europe, north_africa, east_asia, middle_east, mediterranean, north_america, scandinavian |
| **climate** | PCP geographic_context.climate | temperate_rainy, hot_arid, cold_snowy, tropical_humid, temperate |

### Estimated Anchor Counts

| Axis Combination | Architecture | Materials | Condition | Lighting | Tech | Ornamentation | Total |
|-----------------|:---:|:--------:|:---------:|:--------:|:----:|:------------:|:-----:|
| Period × Function (10 × 8) | 80 | 60 | 40 | 40 | 50 | 40 | 310 |
| Region variants (5 × 6) | 30 | 30 | — | 20 | — | 20 | 100 |
| Climate modifiers (4 × 3) | — | 12 | 24 | 8 | — | — | 44 |
| Socioeconomic overlays (4 × 5) | — | 8 | 20 | — | — | 20 | 48 |
| Catch-all fallbacks | 5 | 3 | 3 | 3 | 3 | 3 | 20 |
| **Estimated ~520 anchors** | | | | | | | |

**Reality check:** This is 4× the existing CPIE anchor count (132). Location is inherently more combinatorial because it has more output fields (9 vs 2-3 per existing domain) and more axis dimensions (5 vs 2-3).

### Optimization Strategy

Not all combinations need explicit anchors. Use:
1. **Hierarchical defaults**: If no specific anchor for (medieval, commercial, arabian) — fall back to (medieval, commercial, general) → then (medieval, general)
2. **Climate as modifier**: Apply climate adjustments on top of the base match (rainy → add "waterproofed_roof" to materials)
3. **Socioeconomic as weight modifier**: Lower confidence for mismatched socioeconomic rather than creating separate anchors

---

## 5. Confidence Model

| Scenario | Confidence | Example |
|----------|-----------|---------|
| Direct anchor hit (3+ triggers) | 0.85-0.95 | period=medieval + function=religious + region=western_europe → "Gothic cathedral" |
| Partial match (2 triggers) | 0.70-0.84 | period=medieval + function=religious → "Stone religious building" (generic) |
| Single trigger (1 match) | 0.50-0.69 | function=religious → "Civil/religious building" (no specific period) |
| Catch-all fallback | 0.30 | "Generic interior" |
| Missing PCP context | 0.20-0.40 | No period, no region, no tech registerd → highly generic |

---

## 6. Governance Model

### Explanation Interface (Domains Already Work)

```typescript
explainInference(inference, context, entityKey, 'location')
// Returns:
// {
//   domain: 'location',
//   entity_key: 'main_pub',
//   field: 'architecture_style',
//   value: 'victorian_public_house',
//   confidence_score: 0.87,
//   reasoning: [
//     'period=contemporary',
//     'wealth_distribution=middle_class',
//     'function=public_house',
//     'region=western_europe',
//     'contemporary_middle_class_british_pub_uses_victorian_architecture'
//   ],
//   registry_anchor_id: 'lc_style_pub_contemporary_british',
//   pcp_dependencies: ['period', 'wealth_distribution', 'region']
// }
```

**No governance changes needed.** The existing `explainInference()` and `formatExplanation()` work for any CPIEDomain. Adding location is purely adding the domain identifier to the CPIEDomain type union.

---

## 7. CDG Integration Proposal

### Existing Structure (READ-ONLY)

```typescript
// Already defined in CDG types:
C5: 'cpie_location'
D5: 'atoms_location'

// Already in invalidation matrix:
P2: ['C5', ...]  // temporal → location
P3: ['C5', ...]  // geographic → location  
P4: ['C5', ...]  // cultural → location
P5: ['C5', ...]  // tech → location
P6: ['C5', ...]  // economic → location
```

### Verification

**CDG already has C5 and D5 defined. Invalidation matrix already covers all PCP categories that drive location inference. No CDG changes are needed.**

Registration bundles via `buildCDGRegistration('location', ...)` and `persistCDGBundle()` will work unchanged.

---

## 8. ICS Proposal

### Location ICS Definition

```typescript
LOCATION_FIELD_COUNTS = {
  location: 12,  // 9 registry-driven + 3 LLM-enhanced
}

ICS breakdown:
  - Registry-driven: 9 fields (architecture, construction_era, materials,
    condition, socioeconomic_level, ornamentation, lighting, tech, density)
  - LLM-enhanced: 3 fields (atmospheric_mood, narrative_function, acoustic)
  - Extraction: 1 (location name + function from narrative entities)
  - User override: via certification UI (future)
```

### Scoring Model

```
ICS = (inferred_count + extracted_count + user_count - low_confidence_discount) / 12

Low confidence discount: each catch-all (priority=0) anchor-matched field
  reduces the ICS by 50% for that field (i.e., catch-all fills the slot
  but signals degraded quality)
```

### Registration With Atomiser Outputs

```
Atom emitted by location-atomiser after CPIE + LLM:
{
  architecture_style: 'victorian_pub',        // inferred, confidence 0.87
  construction_era: 'contemporary',            // inferred, confidence 0.92
  material_palette: ['brick', 'wood', 'glass'], // inferred, confidence 0.82
  ...
  cpie_inferences_used: 7,
  cpie_provenance: [...],                     // one entry per inferred field
  generated_from_cpie: true,
}
```

---

## 9. Sparse Narrative Expectations

### CASE A — Crime: "A detective enters a pub on a rainy night."

| PCP | Value |
|-----|-------|
| period | contemporary |
| genre | crime, noir |
| climate | temperate_rainy |
| wealth | middle_class |
| function | public_house |
| region | western_europe (default) |

**Expected location inference:**
- architecture_style: "victorian_public_house" | "neighbourhood_pub"
- materials: ["brick", "aged_wood", "stained_glass", "brass"]
- condition: "worn_but_maintained"
- socioeconomic: "working_class_comfortable"
- lighting: "dim_warm_interior"
- density: "moderate_cluttered"

**Contamination check:** No 1940s wartime markers (blackout curtains, rationing, military presence) — only crime/mystery context, not war.

**Contamination check:** No pub scene defaults that assume British Victorian regardless of region.

### CASE B — Fantasy: "A rider approaches the capital."

| PCP | Value |
|-----|-------|
| period | fantasy_medieval |
| genre | fantasy, epic |
| economy | feudal |
| function | civic (capital gates) |

**Expected:**
- architecture_style: "gothic_fortification" | "stone_keep"
- materials: ["stone", "oak", "iron"]
- condition: "weathered_imposing"
- socioeconomic: "feudal_nobility"
- ornamentation: ["heraldic_banners", "royal_insignia", "guard_uniforms"]
- density: "sparse_open"

**Contamination check:** No modern infrastructure (streetlights, paving, signs). No specific period.

### CASE C — Sci-Fi: "A courier runs through the district."

| PCP | Value |
|-----|-------|
| period | distant_future |
| genre | sci_fi, cyberpunk |
| tech_level | sci_fi_advanced |
| infrastructure | advanced |
| economy | post_scarcity |

**Expected:**
- architecture_style: "vertical_megastructure" | "dense_urban"
- materials: ["composite", "glass", "steel", "holographic"]
- condition: "pristine_corporate"
- lighting: "neon_artificial_blue"
- tech_integration: "full_digital"
- ornamentation: ["holographic_signage", "corporate_logos", "digital_advertising"]
- density: "high_overstimulating"

**Contamination check:** No medieval/cobblestone. No WWII. No cyberpunk dystopia defaults (can also be clean corporate sci-fi based on wealth_distribution).

### CASE D — Horror: "A child hears something moving inside the walls."

| PCP | Value |
|-----|-------|
| period | contemporary |
| genre | horror, suspense |
| climate | temperate |
| wealth | middle_class |
| function | residential |

**Expected:**
- architecture_style: "suburban_detached" | "period_terraced"
- materials: ["drywall", "wood", "carpet", "plaster"]
- condition: "aging_decaying"
- lighting: "dim_hallway" | "shadowy"
- density: "moderate_cluttered_domestic"
- ornamentation: "faded_domestic"

**Contamination check:** No overt haunted house markers unless supported by PCP (belief_systems, supernatural ecology markers). Should be a normal house with unsettling atmosphere.

---

## 10. YETI Validation Strategy

### Multi-Regime Test

| Regime | Period | Region | Wealth | Architecture Expectation |
|--------|--------|--------|--------|--------------------------|
| Prehistoric | prehistoric | — | subsistence | Natural shelter, cave/dwelling, animal materials |
| WWII | 1940s | western_europe | wartime_economy | utilitarian concrete, military adaptation, sandbags |
| Ancient Mythology | ancient | greek | feudal | Columnar structures, marble, religious temples |
| Creator / Alien | distant_future | alien | post_scarcity | Inorganic curving architecture, bioluminescent, non-human scale |
| Monster Horror | contemporary | rural | working_class | Farmhouse decay, structural damage, dark interiors |

### Cross-Regime Invariant

Same registry, different PCP → different location outputs. The test verifies:
1. Prehistoric does NOT produce columnar structures
2. WWII does NOT produce magical bioluminescence
3. Ancient mythology does NOT produce suburban dryness
4. Creator/alien does NOT produce gothic cathedrals
5. Monster horror does NOT produce pristine corporate spaces

**No YETI-specific branches. No project_id checks. No genre shortcuts.**

---

## 11. Ownership Audit

### Current Violations (location-atomiser)

| Violation | Severity | Line | Description |
|-----------|----------|------|-------------|
| `no PCP context in prompt` | **Critical** | 411 | LLM prompt has zero genre/period/climate context — it guesses everything |
| `no provenance` | **Critical** | — | No anchor IDs, no reasoning chains, no confidence scores |
| `genre defaulting` | High | — | LLM guesses genre from location name alone |
| `period defaulting` | High | — | LLM guesses period from architecture name alone |
| `region defaulting` | Medium | — | No regional markers — defaults to generic Western |
| `no CPIE endpoint call` | High | — | No CPIE runtime integration (same as all atomisers pre-refit) |

### Post-Refit Ownership

```
PCP           → owns context (READ-ONLY, consumed by CPIE)
CPIE Registry → owns inference (architecture, materials, condition, lighting, tech, socioeconomic)
LLM           → owns enhancement (atmosphere, sound, texture details, notes)
Atomiser      → owns formatting, persistence, CDG registration
Governance    → owns explanation (why was this inferred?)
CDG           → owns staleness tracking (D5 stale → invalidation downstream)
User          → owns certification (verify/override inferred values)
```

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Location too combinatorial (520 anchors) | High | Medium | Use hierarchical defaults + climate modifiers instead of full matrix |
| Spatial function extraction unreliable | Medium | Medium | Registry must accept fuzzy function ("tavern" = public_house, "bar" = public_house, "saloon" = public_house) |
| Region data sparse in PCP | High | Medium | Default to regional hardcodes only when PCP provides them; use "general" fallback |
| Climate modifier misapplied | Low | Medium | Climate adjustment is additive, not replacing. Test all 4 climate types explicitly. |
| Location atomiser has existing UI integration | Medium | Medium | Atom format preservation critical — existing atoms must be backward-compatible |
| Performance: 520 anchors × N entities = heavy | Medium | Low | Hierarchical matching (tiered fallback) reduces actual comparisons |

### Title Map (Function Extraction)

The registry needs a title map to normalize location names to functions:

```typescript
LOCATION_FUNCTION_MAP: Record<string, string> = {
  'pub': 'public_house', 'bar': 'public_house', 'tavern': 'public_house',
  'saloon': 'public_house', 'inn': 'public_house',
  'church': 'religious', 'cathedral': 'religious', 'temple': 'religious',
  'mosque': 'religious', 'shrine': 'religious',
  'castle': 'military', 'fort': 'military', 'garrison': 'military',
  'palace': 'civic', 'government': 'civic', 'town_hall': 'civic',
  'warehouse': 'industrial', 'factory': 'industrial', 'mill': 'industrial',
  'hospital': 'civic', 'school': 'civic', 'library': 'civic',
  'house': 'residential', 'apartment': 'residential', 'manor': 'residential',
  'shop': 'commercial', 'store': 'commercial', 'market': 'commercial',
  'office': 'commercial', 'bank': 'commercial',
  'station': 'transportation', 'airport': 'transportation',
  'dock': 'transportation', 'harbor': 'transportation',
  'forest': 'outdoor_wilderness', 'mountain': 'outdoor_wilderness',
  'desert': 'outdoor_wilderness', 'field': 'outdoor_wilderness',
  'street': 'outdoor_urban', 'alley': 'outdoor_urban', 'plaza': 'outdoor_urban',
}
```

---

## 13. Recommendation

# B — Approved with Revisions

### Revision Requirements (Pre-Implementation Checklist)

| # | Revision | Owner | Why |
|---|----------|-------|-----|
| 1 | **Reduce anchor matrix to ~200-250 with hierarchical defaults** | Architect | 520 anchors is 4× existing workload. Period × Function (80 anchors) + regional variants (60) + climate modifiers (40) + catch-alls (20) = 200 baseline. Add cultural/socioeconomic at 50. |
| 2 | **Define `LOCATION_FUNCTION_MAP` in extraction layer** | Extraction | Without reliable function extraction, the registry can't match. Must be tested before anchors are written. |
| 3 | **Add region defaulting to PCP resolver** | PCP | Currently PCP may leave region empty. Default: "western_europe" for Europe-coded periods, "general" otherwise. |
| 4 | **Write 10 test cases before any anchor** | TDD | 4 sparse narratives + 5 YETI regimes + 1 cross-regime differentiation test. Tests drive anchor coverage. |
| 5 | **Add climate→materials mapping** | Registry | Climate directly affects material availability (stone in mountains, wood in forests, adobe in desert). This is the highest-leverage non-obvious axis. |

### Implementation Order

```
1.   LOCATION_FUNCTION_MAP + extraction tests       [Day 1]
2.   PCP region defaulting patch                     [Day 1]
3.   Test harness (10 tests)                         [Day 1-2]
4.   Period × Function anchors (80 base)             [Day 2-3]
5.   Regional variant anchors (60)                   [Day 3-4]
6.   Climate modifier anchors (40)                   [Day 4]
7.   Hierarchical fallback logic                     [Day 4-5]
8.   CPIE endpoint extension (C5 domain)             [Day 5]
9.   Location atomiser refit + provenance            [Day 5-6]
10.  Full validation chain                           [Day 6-7]
```

---

## 14. Definition of Done

The review is complete when we can state:

> **"Location production truth can be deterministically inferred from PCP context, expressed through CPIE registry rules, governed by provenance and CDG, and consumed by location atomisers without independent world modeling."**

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Architecture style comes from registry, not LLM | 🟡 Designed — 5-axis matrix defined |
| 2 | Material palette comes from biome + period | 🟡 Designed — climate modifier model |
| 3 | Environmental condition comes from economy + period | 🟡 Designed — wealth + construction era |
| 4 | Socioeconomic level comes from PCP economic_context | 🟡 Designed — wealth_distribution axis |
| 5 | Lighting comes from tech level + visual_tone | 🟡 Designed — energy_source + genre |
| 6 | Cultural ornamentation comes from cultural_context | 🟡 Designed — belief_systems + norms |
| 7 | Spatial function comes from extraction, not inference | ✅ Clear boundary |
| 8 | CDG node C5/D5 already defined | ✅ Verified — exists, invalidation matrix correct |
| 9 | Governance explains all inferences | ✅ Verified — domain-agnostic |
| 10 | ICS covers location specifically | 🟡 Designed — 12-field model |
| 11 | PCP fields drive without modification | ✅ Verified — all needed fields exist |
| 12 | No project-specific logic in anchor design | ✅ Built-in — registry is context-drive |

### Final Statement

Location is ready for implementation with 5 revisions (see §13). The architecture is sound, the PCP dependency matrix is complete, the CDG integration already exists, and the governance model is domain-agnostic. The primary risk is combinatorial complexity (520 estimated anchors) — mitigated by hierarchical defaults and the reduction plan in Revision 1.

**Ready for Architect.** Not before revisions 1-5 are addressed.
