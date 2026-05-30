# SESS-ARCH-0028A — CPIE Consumer Contract
**Status:** Architecture design (pre-implementation)
**Author:** Oracle
**Priority:** P0 — blocks Phase 1 implementation

---

## 1. EVIDENCE — Current Violations

Before the contract can be drafted, the existing violations must be catalogued.

### Violation A: Creature-atomiser reads project context directly

```
Lines 383-388 in creature-atomiser/index.ts:
  .from("projects")
  .select("title, format, logline, genres, premise, budget_range")
```

The creature-atomiser reads `genres` from the `projects` table directly, making it an **independent context resolver**. This is the exact pattern the contract prohibits — each atomiser performing its own contextual reasoning.

**Impact:** If PCP resolves genre differently than the atomiser's raw DB read, they diverge. The atomiser becomes a second context authority.

### Violation B: Costume-atomiser has zero context

The costume-atomiser reads only scene text and existing atoms. It has no access to genre, period, climate, or profession. This means "A detective enters a pub" produces zero costume atoms because there's no `wears:` keyword — and even if there were, the atomiser wouldn't know it should produce a trench coat.

**Impact:** 0% inference. Pure extraction. Sparse narratives produce nothing.

### Violation C: Vehicle-atomiser has zero context + WWII hardcode

The vehicle-atomiser reads narrative_entities and scene text. No project metadata. No genre. No period. The VEHICLE_PATTERNS map (lines 24-49) contains exclusively WWII-era military vehicles: jeep, tank, panzer, spitfire, half-track, etc.

**Impact:** Every project gets WWII vehicles regardless of genre. Crime dramas get tanks. Fantasy gets tanks. Sci-fi gets tanks.

### Violation D: All four atomisers bypass CDG

None of the four atomisers register staleness, provenance, or dependencies. There is no CDG integration anywhere. Every output is an orphan — no system can explain why a value exists or when it should be regenerated.

---

## 2. OWNERSHIP MODEL

### Absolute Boundaries

| Layer | Owns | Does NOT Own |
|-------|------|-------------|
| **PCP** | genre, period, geography, climate, culture, technology_level, social_structure, economy, profession_map, visual_tone, production_language | Inference, canon formatting, persistence, CDG registration |
| **CPIE** | contextual inference, registry evaluation, confidence generation, reasoning generation, dependency registration | Canon persistence, domain-specific schema, DB writes, HTTP handling |
| **CDG** | staleness tracking, provenance chains, governance explanations, certification | Inference, context resolution, canon formatting |
| **Atomiser** | canon formatting, canon persistence, canon validation, domain-specific schema, LLM attribute generation | **Absolutely nothing related to context or inference** |

### Enforcement Rule

```
NO ATOMISER MAY:
  - Query the projects table for any field (genre, period, climate)
  - Query project_canon for contextual information
  - Query project_visual_style
  - Contain any conditional logic based on genre, period, climate, or culture
  - Maintain any mapping table (period→tech, genre→tone, biome→climate)
  - Read screenplay for the purpose of contextual inference
  - Form project-specific branches (if project_id === "XXX")
```

### Enforcement Mechanism

All atomisers receive their context EXCLUSIVELY through the CPIE output contract. Their input signature is:

```typescript
interface AtomiserInput {
  // NO raw context fields allowed
  project_id: string;
  cpie_inferences: Record<string, CPIEInference[]>;
  cdg_context: CDGNodeState[];
  // Extraction-only (already exists — not changing this)
  extracted_entities: ExtractedEntity[];
  scene_text: string;
  existing_atoms: ExistingAtom[];
  // User overrides
  user_overrides?: Record<string, unknown>;
}
```

---

## 3. INPUT CONTRACT

### What each atomiser receives

```typescript
interface AtomiserInput {
  project_id: string;

  // CPIE-processed inferences — THIS is their context
  cpie_inferences: {
    wardrobe?: CPIEInferenceResult<WardrobeInference>;
    props?: CPIEInferenceResult<PropInference>;
    vehicles?: CPIEInferenceResult<VehicleInference>;
    creatures?: CPIEInferenceResult<CreatureInference>;
  };

  // Extraction results (unchanged from current pipeline)
  extracted_entities: Array<{
    entity_type: string;
    canonical_name: string;
    occurrences: number;
    source: 'narrative_entity' | 'scene_content' | 'document';
  }>;

  // Raw text for extraction pass (unchanged)
  scene_text: string;

  // Existing canon for merge (unchanged)
  existing_atoms: Array<{
    id: string;
    canonical_name: string;
    source_type: string;
  }>;

  // CDG state snapshot
  cdg_context: {
    staleness: 'FRESH' | 'STALE' | 'STALE_WARNING';
    last_regenerated: string;
    existing_provenance?: ProvenanceChain;
  };

  // Manual overrides
  user_overrides?: Record<string, unknown>;
}
```

### Schema

```typescript
interface CPIEInferenceResult<T> {
  domain: string;
  entity_key: string;
  inferences: T[];
  provenance_summary: {
    extracted: number;
    inferred: number;
    user_supplied: number;
  };
  inference_coverage_score: number;  // 0.0–1.0
  generated_at: string;
}
```

### What is REMOVED from current atomiser inputs

| Current Input | Source | Status |
|--------------|--------|--------|
| `projects.genres` (read directly) | projects table | ❌ **PROHIBITED** |
| `projects.format` | projects table | ❌ **PROHIBITED** |
| `projects.title` | projects table | ✅ Allowed (titles are not context) |
| `project_canon.canon_json` | project_canon table | ❌ **PROHIBITED** |
| `project_visual_style` table | project_visual_style | ❌ **PROHIBITED** |
| Scene text | scene_graph_versions | ✅ Allowed (extraction input) |
| Narrative entities | narrative_entities | ✅ Allowed (extraction input) |
| Existing atoms | atoms table | ✅ Allowed (merge input) |

---

## 4. OUTPUT CONTRACT — CPIE → Atomiser

Every CPIE inference must include:

```typescript
interface CPIEInference {
  field: string;               // e.g. "primaryOutfit", "vehicle_type"
  value: string | string[];
  
  // Mandatory provenance
  source_type: 'extracted' | 'inferred' | 'user_supplied';
  confidence_score: number;    // 0.0–1.0
  reasoning: string[];         // ["profession=detective", "genre=noir", "climate=rainy"]
  pcp_dependencies: string[];  // ["profession_map", "genre", "climate"]
  
  // Registry tracking
  registry_rule_hit?: string;  // e.g. "wardrobe_detective_noir_coat"
  llm_expanded?: boolean;
  
  // Temporal
  generated_at: string;        // ISO 8601
  generated_by: string;        // "cpie_registry" | "cpie_llm" | "cpie_both"
}
```

### Concrete Example

```typescript
// CPIE → Costume-atomiser
{
  domain: "wardrobe",
  entity_key: "harry_detective",
  inferences: [
    {
      field: "primaryOutfit",
      value: "trench_coat",
      source_type: "inferred",
      confidence_score: 0.91,
      reasoning: [
        "registry_rule: wardrobe_detective_noir_coat",
        "profession=detective",
        "genre=noir",
        "climate=rainy",
        "pcp_dependency: profession_map.harry",
        "pcp_dependency: genre",
        "pcp_dependency: geographic_context.climate"
      ],
      pcp_dependencies: ["profession_map", "genre", "geographic_context.climate"],
      registry_rule_hit: "wardrobe_detective_noir_coat",
      generated_at: "2026-06-01T14:30:00Z",
      generated_by: "cpie_registry"
    }
  ],
  provenance_summary: { extracted: 0, inferred: 1, user_supplied: 0 },
  inference_coverage_score: 0.80,
  generated_at: "2026-06-01T14:30:00Z"
}
```

---

## 5. CANON EMISSION CONTRACT — Atomiser → Canon tables

Every atom to be written to canon tables must include:

```typescript
interface CanonEmission {
  // The canon object (domain-specific)
  canon_object: Record<string, unknown>;
  
  // Provenance — mirrors the CPIE inference that produced it
  provenance: {
    source_type: 'extracted' | 'inferred' | 'user_supplied';
    confidence_score: number;
    reasoning: string[];
    pcp_dependencies: string[];
    cpie_event_id?: string;
  };
  
  // CDG registration metadata
  cdg_context: {
    node_id: string;           // e.g. "D1" for atoms_wardrobe
    staleness: 'FRESH' | 'STALE';
    upstream_node: string;     // e.g. "C1" for cpie_wardrobe
    regeneration_count: number;
  };
  
  // ICS reporting fields
  ics_metadata: {
    field_name: string;
    filled_by: 'extracted' | 'inferred' | 'user_supplied' | 'empty';
    confidence_at_creation: number;
  };
}
```

### Merge Rules

When both CPIE inference AND extraction exist for the same field:

```typescript
enum MergeStrategy {
  // Extraction always wins — explicit script references override inference
  EXTRACTION_WINS = 'extraction_wins',
  // Inference fills gaps extraction cannot reach
  INFERENCE_FILLS = 'inference_fills',
  // User manual overrides both
  USER_OVERRIDE = 'user_override',
}
```

**Rule:** Extraction wins on same-field conflict. Inference fills unfilled fields only.

---

## 6. CDG REGISTRATION CONTRACT

Every CPIE-driven output MUST register:

```typescript
interface CDGRegistration {
  // Which CDG node this output feeds
  node_id: string;
  
  // Upstream dependencies (PCP fields used)
  upstream_dependencies: string[];
  
  // Downstream consumers (which atomisers use this)
  downstream_consumers: string[];
  
  // Staleness ownership
  staleness_owned_by: 'cpie' | 'atomiser' | 'user';
  
  // Certification ownership
  certification_owned_by: 'user' | 'automated_gate';
}
```

### Node Mapping

| CPIE Domain | CPIE Node | Canon Node | Atomiser |
|------------|-----------|------------|----------|
| wardrobe | C1 | D1 (atoms_wardrobe) | costume-atomiser |
| prop | C2 | D2 (atoms_prop) | prop-atomiser |
| vehicle | C3 | D3 (atoms_vehicle) | vehicle-atomiser |
| creature | C4 | D4 (atoms_creature) | creature-atomiser |
| location (future) | C5 | D5 (atoms_location) | location-atomiser |
| pd (future) | C6 | D6 (atoms_pd) | TBD |
| vl (future) | C7 | D7 (project_visual_style) | deriveStyleFromCanon |

### Registration Flow

```
CPIE Inference Generated
  → CDG updates node C{X} status to FRESH
  → CDG propagates staleness to D{X}
  → Atomiser reads FRESH C{X} value
  → Atomiser writes D{X}
  → CDG marks D{X} FRESH
  → CDG propagates staleness to S{X} (consumers)
```

**No orphan outputs:** Every CPIE inference must have a registered CDG dependency path.

---

## 7. GOVERNANCE CONTRACT

Governance must answer three questions for every canon value:

### Q1: Why was this inferred?

Query: `explainInference(entity, field)`

```
Trench coat (Harry's primaryOutfit)
  Source: inferred (confidence: 0.91)
  Reason: profession=detective + genre=noir + climate=rainy
  Registry: wardrobe_detective_noir_coat (matched 3/3 triggers)
  PCP used: profession_map, genre, geographic_context.climate
```

### Q2: Why is this stale?

Query: `cdg.explainStaleness(nodeId)`

```
D1 (atoms_wardrobe)
  Status: STALE
  Trigger: C1 (cpie_wardrobe) regenerated
  Root cause: P2.period changed 1944 → 2087
  Cascade: P2 → P5 → C1 → D1
  Regeneration plan: C1(2) → D1(4)
```

### Q3: What PCP fields created it?

Query: `tracePCPDependency(canonValue)`

```
Trench coat
  ← cpie_wardrobe (registry rule hit)
    ← P7.profession_map.harry = detective
    ← P1.genre = [noir, crime]
    ← P3.climate = temperate_rainy
    ← N6.project_canon (original extraction source)
```

### Dashboard Integration

The CDG governance dashboard (`src/lib/cdg/governance.ts`) already provides:

- `explainStaleness(nodeId)` — root cause, cascade, regen plan
- `getGovernanceDashboard()` — aggregate counts
- `getAllStaleNodes()` — sorted by staleness duration
- `getAlerts()` — severity-categorized

Atomisers MUST hook into these when writing canon values.

---

## 8. ICS CONTRACT

### Standardized Definitions

| Component | Definition | Formula |
|-----------|------------|---------|
| **Extracted** | Values explicitly found in screenplay text or narrative entities | `count(fields where source_type='extracted')` |
| **Inferred** | Values generated by CPIE deterministic rules or bounded LLM expansion | `count(fields where source_type='inferred')` |
| **User Supplied** | Values manually overridden by user via UI | `count(fields where source_type='user_supplied')` |
| **Total Plausible** | Total fields in the domain schema that COULD be filled | Sum of all definable fields per entity |
| **ICS** | Inference Coverage Score — fraction of total plausible fields that are filled | `(extracted + inferred + user_supplied) / total_plausible` |

### Per-Domain Schema Definition

```typescript
const DOMAIN_FIELD_COUNTS: Record<string, number> = {
  wardrobe: 12,  // primaryOutfit, eraAlignment, silhouette, dominantColors,
                 // fabricAndTexture, keyPieces, characterSignal, condition,
                 // distinctiveElements, fitAndMovement, alternateOutfits, productionComplexity
  prop: 10,      // propType, physicalDescription, primaryColor, materialComposition,
                 // condition, sizeCategory, distinctiveFeatures, narrativeFunction,
                 // usageContexts, frequencyInScript
  vehicle: 8,    // vehicleType, era, primaryColor, modificationLevel,
                 // drivingContext, usageCount, condition, distinctiveFeatures
  creature: 10,  // creatureType, species, role, behavior, size,
                 // habitat, diet, intelligenceLevel, magicalProperties, narrativeFunction
};
```

### ICS Reporting Schema

```typescript
interface ICSReport {
  project_id: string;
  snapshot_at: string;
  domains: Record<string, DomainICS>;
  overall_ics: number;
}

interface DomainICS {
  domain: string;
  total_entities: number;
  total_plausible_fields: number;
  extracted_count: number;
  inferred_count: number;
  user_supplied_count: number;
  filled_count: number;     // extracted + inferred + user_supplied
  ics: number;              // filled_count / total_plausible_fields
  breakdown: {
    extracted_pct: number;   // extracted / total_plausible_fields
    inferred_pct: number;    // inferred / total_plausible_fields
    user_supplied_pct: number; // user_supplied / total_plausible_fields
    empty_pct: number;       // (total_plausible - filled) / total_plausible
  };
}
```

---

## 9. DOMAIN COMPLIANCE MATRIX

### Wardrobe (costume-atomiser)

| Dimension | Contract | Current | Gap |
|-----------|----------|---------|-----|
| Inputs | CPIE wardrobe inference + extraction + existing atoms | Scene text only | ❌ No CPIE input |
| Outputs | Canon emission with full provenance | Atom object + no provenance | ❌ Missing provenance |
| Dependencies | C1 → D1 → S1+S2 | No CDG registration | ❌ Orphan outputs |
| Governance | explainStaleness(D1) | No governance hooks | ❌ No explainability |
| ICS | 12 fields × entities | ~15% estimated | ❌ Poor coverage |
| Context reads | PCP via CPIE only | None | ❌ Reads nothing |
| Forbidden behavior | No genre/period/climate reads | None (reads nothing) | ✅ Clean (but empty) |

**Verdict:** Needs full CPIE integration. Current state is a blank slate — no violations, no inference.

### Props (prop-atomiser)

| Dimension | Contract | Current | Gap |
|-----------|----------|---------|-----|
| Inputs | CPIE prop inference + extraction | Scene text scan only | ❌ No CPIE input |
| Outputs | Canon emission with provenance | Atom object only | ❌ Missing provenance |
| Dependencies | C2 → D2 → S2 | No CDG registration | ❌ Orphan outputs |
| Governance | explainStaleness(D2) | None | ❌ |
| ICS | 10 fields × entities | ~40% estimated | ⚠️ Low |
| Context reads | PCP via CPIE only | None | ✅ Clean |
| Forbidden behavior | No genre/period reads | None | ✅ Clean |

**Verdict:** Needs full CPIE + CDG integration. No active violations.

### Vehicles (vehicle-atomiser)

| Dimension | Contract | Current | Gap |
|-----------|----------|---------|-----|
| Inputs | CPIE vehicle inference + extraction | Extraction + WWII map | ❌ WWII hardcode |
| Outputs | Canon emission with provenance | Atom object only | ❌ Missing provenance |
| Dependencies | C3 → D3 → S2+S3 | No CDG registration | ❌ Orphan outputs |
| Governance | explainStaleness(D3) | None | ❌ |
| ICS | 8 fields × entities | ~30% estimated | ⚠️ Low |
| Context reads | PCP via CPIE only | **VEHICLE_PATTERNS** (WWII map) | ❌ **HARDCODE VIOLATION** |
| Forbidden behavior | Project-specific branches | None seen | ✅ Clean |

**Verdict:** **CRITICAL VIOLATION.** WWII hardcoded patterns must be replaced with CPIE registry. No inline regex-based context.

### Creatures (creature-atomiser)

| Dimension | Contract | Current | Gap |
|-----------|----------|---------|-----|
| Inputs | CPIE creature inference + extraction | Extraction + **projects.genres read** | ❌ Context violation |
| Outputs | Canon emission with provenance | Atom object only | ❌ Missing provenance |
| Dependencies | C4 → D4 → S2+S3 | No CDG registration | ❌ Orphan outputs |
| Governance | explainStaleness(D4) | None | ❌ |
| ICS | 10 fields × entities | ~20% estimated | ❌ Low |
| Context reads | PCP via CPIE only | **Reads `projects.genres` directly** | ❌ **VIOLATION** |
| Forbidden behavior | Independent context resolution | Reads genres + format + logline | ❌ **VIOLATION** |

**Verdict:** **CRITICAL VIOLATION.** Must remove all direct `projects` table reads. Context must come exclusively via CPIE contract.

---

## 10. FUTURE DOMAIN COMPATIBILITY

The contract must support future domains without modification.

### Compatibility Verification

| Future Domain | Layer | Contract Reuse |
|--------------|-------|---------------|
| Locations | C5 → D5 → S1+S2 | Same CPIE→Atomiser contract. CPIE infers location dressing; atomiser persists and formats. |
| Production Design | C6 → D6 → S2 | Same contract. CPIE infers PD elements; atomiser canonizes. |
| Visual Language | C7 → D7 → S1+S2+S3 | Same contract. CPIE infers VL; `deriveStyleFromCanon` becomes the atomiser. |
| Hero Frames | S1 (no new CPIE) | Already a projection consumer. Reads canon + CPIE-context hints. |
| Lookbook | S2 (no new CPIE) | Same as above. |
| VPB | S3 (no new CPIE) | Same as above. |
| Storyboards | S4 (future) | New projection node. Reads canon. No CPIE changes. |
| Video Generation | S5 (future) | Same as above. |

**Policy:** Adding a new domain requires:
1. New CPIE registry section + domain processor
2. New CDG node definitions (C{X}, D{X})
3. New atomiser following the same contract
4. **Zero changes** to the input/output contract schema

---

## VALIDATION QUESTIONS

| Question | Answer | Evidence |
|----------|--------|----------|
| Can any atomiser infer context independently? | **NO** | All context reads replaced with PCP→CPIE channel. Current violations (creature-atomiser reads genres) must be removed. |
| Can any atomiser bypass PCP? | **NO** | Input contract provides context ONLY through `cpie_inferences`. No direct DB queries for genre, period, climate, culture, technology. |
| Can any atomiser bypass CDG? | **NO** | Every canon emission must carry `cdg_context` for staleness registration. Without it, the write is rejected. |
| Can governance explain every output? | **YES** | Every inference carries reasoning[], pcp_dependencies[]. CDG provides `explainStaleness()`. chain of custody is fully traceable. |
| Can future domains reuse the same contract? | **YES** | New domain = new registry + new processor + new atomiser. Input/output contract schema unchanged. |

---

## RECOMMENDATION

1. **Immediate: Remove creature-atomiser `projects` table reads** — This is the only active violation. Replace with CPIE context injection.

2. **Immediate: Freeze vehicle-atomiser VEHICLE_PATTERNS** — Don't modify yet (Phase 1 will replace via CPIE registry). Mark as `@deprecated WWII_PATTERNS — will be replaced by CPIE` to prevent new entries.

3. **Phase 1: Implement CPIE + wire contract** — Build CPIE registry, inject into all 4 atomisers, enforce the input contract, add CDG registration.

4. **Phase 1.5: Add governance hooks** — Wire `explainStaleness()` calls for every atomiser write.

5. **Phase 2: Enforce with runtime validation** — Add input contract validation in the CPIE bridge. Reject atomiser writes that lack proper cdg_context or provenance.

---

## DEFINITION OF DONE

> *"PCP remains the single context authority. CPIE remains the single inference authority. Atomisers become pure consumers. Provenance is mandatory."*

- [ ] Creature-atomiser `projects.genres` read removed
- [ ] Vehicle-atomiser WWII patterns frozen (tagged @deprecated)
- [ ] Input contract enforced: atomisers receive context ONLY through CPIE
- [ ] Every CPIE inference carries source_type, confidence_score, reasoning[], pcp_dependencies[]
- [ ] Every canon emission carries cdg_context, provenance, ics_metadata
- [ ] CDG registration: every output has dependency path (C{X} → D{X} → S{X})
- [ ] ICS reporting standardized across all domains
- [ ] Future domains: contract is additive — new domain needs no contract changes
- [ ] Governance: explainStaleness() works for every canon value

---

*CPIE Consumer Contract complete. SESS-ARCH-0028A ready for review.*
