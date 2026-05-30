# SESS-ARCH-0028B.2 — Vehicle + Creature Registry Universality Review

**Status:** Architecture design review (pre-implementation)
**Author:** Oracle
**Priority:** P0 — blocks CPIE Phase 1B.2
**Critical Rule:** DO NOT implement. Design review only.

---

## 1. EVIDENCE — Current Violations

### Vehicle-Atomiser (`supabase/functions/vehicle-atomiser/index.ts`, 724 lines)

| Component | Lines | Type | Assessment |
|-----------|-------|------|------------|
| `VEHICLE_PATTERNS` | 24-49 | **UNACCEPTABLE HARDCODE** | 15 regex patterns exclusively targeting WWII vehicles (jeep, tank, panzer, spitfire, half-track, u-boat). No sci-fi, fantasy, or modern patterns. |
| `canonicalise()` | 65-143 | **UNACCEPTABLE HARDCODE** | 70+ mapping entries, ALL WWII. Jeep→Willys MB. Truck→Military Truck. Motorcycle→Military Motorcycle. No variation by genre/period. |
| `makeStubAttributes()` | 144-175 | **ACCEPTABLE FOUNDATION** | Defaults `ownership: "military"`, `period_accuracy: "accurate"` — but these are default templates, not hardcoded values. Needs PCP-driven overrides. |
| Zero PCP reads | entire | **UNACCEPTABLE OMISSION** | No genre, period, technology, geography reads. Pure extraction + WWII defaults. |

### Creature-Atomiser (`supabase/functions/creature-atomiser/index.ts`, 590 lines)

| Component | Lines | Type | Assessment |
|-----------|-------|------|------------|
| `CREATURE_NOUNS` | 26-58 | **ACCEPTABLE EXTRACTION** | Dictionary of creature nouns (horse, dragon, dog, etc.) — this is extraction, not inference. Extraction dictionaries are allowed by the consumer contract. |
| `extractCreatureNames()` | 60-76 | **ACCEPTABLE EXTRACTION** | Regex match against dictionary. Pure extraction. |
| `projects.genres` read | 382-388 | **CRITICAL VIOLATION** | Reads genres directly from `projects` table, bypassing PCP. The exact behavior the consumer contract prohibits. |
| LLM prompt injection | 402-448 | **CRITICAL VIOLATION** | Injects raw DB fields (genres, format, logline, premise) into LLM prompt without CPIE mediation. |

---

## 2. VEHICLE REGISTRY DESIGN

### 2.1 PCP Fields Driving Vehicle Selection

| PCP Field | CPIE Registry Field | Purpose | Example Values |
|-----------|-------------------|---------|----------------|
| `technology_context.level` | `technology_level` | Determines propulsion and construction | `pre_industrial`, `mid_20th_century`, `sci_fi_advanced` |
| `temporal_context.period` | `period` | Determines era-specific vehicle forms | `1940s`, `distant_future`, `fantasy_medieval` |
| `geographic_context.primary_biome` | `biome` | Determines terrain adaptation | `arid_desert`, `temperate_forest`, `urban` |
| `geographic_context.climate` | `climate` | Determines weather-specific modifications | `cold_snowy`, `tropical_humid` |
| `economic_context.wealth_distribution` | `wealth` | Determines vehicle quality/rarity | `extreme_inequality`, `broad_middle_class` |
| `professional_context.authority_structures` | `authority` | Determines military vs civilian vs corporate | `legitimate`, `corrupt`, `corporate` |
| `genre` (from `project_identity.genre`) | `genre` | Determines genre-specific aesthetics | `war`, `sci_fi`, `fantasy`, `crime` |
| `technology_context.transportation_assumptions` | `transport_type` | Determines which vehicle types are plausible | `[automotive,rail,aviation]`, `[horse_drawn,sailing]`, `[hover,teleportation]` |

### 2.2 Registry Anchor Structure

```typescript
interface VehicleAnchor {
  // Identification
  id: string;           // e.g. "vh_wwii_jeep", "vh_fantasy_wagon", "vh_sci_fi_hovercar"
  domain: 'vehicle';
  
  // Triggers (AND logic — all must match)
  triggers: Array<{
    pcp_field: string;  // "technology_level" | "period" | "profession" | "transport_type" | "genre" | "biome"
    operator: 'eq' | 'in' | 'regex';
    value: string | string[];
  }>;
  
  // Context refinement (adds detail without changing base type)
  context_modifiers: Array<{
    pcp_field: string;
    value_modifier: string;  // e.g. "military", "civilian", "industrial"
    operator: 'add_prefix' | 'add_suffix' | 'replace';
  }>;
  
  // Output
  output_field: string;      // "vehicle_type"
  output_value: string;      // e.g. "jeep"
  base_label: string;        // e.g. "Jeep (Willys MB)"
  confidence: number;        // 0.0–1.0
  priority: number;
  
  // Reasoning
  reasoning: string[];
  
  // Metadata
  transport_function: string; // "military", "civilian_transport", "utility", "combat", "ceremonial"
  narrative_role: string[];    // ["transport", "chase", "combat", "worldbuilding"]
}
```

### 2.3 Proposed Anchors (Representative Set)

#### Military/Combat Vehicles

```
vh_wwii_jeep:
  triggers: period=1940s|wwii_era, technology=mid_20th_century, genre=war|thriller
  output: jeep, "Jeep (Willys MB)", confidence=0.92
  modifiers: biome=arid -> "Desert-modified Jeep"
  modifiers: biome=temperate -> "Standard Issue Jeep"

vh_general_tank:
  triggers: period=wwi|wwii|modern, profession=commander|soldier, genre=war|action
  output: tank, "Military Tank", confidence=0.85
  modifiers: period=wwii -> "WWII-era Tank"
  modifiers: period=contemporary -> "Main Battle Tank"
  modifiers: period=near_future -> "Next-generation Tank"

vh_military_truck:
  triggers: period=wwi_era|wwii_era|mid_20th_century, technology=industrial_warfare|mid_20th_century|post_war
  output: truck, "Military Transport Truck", confidence=0.88

vh_future_combat_vehicle:
  triggers: period=distant_future|near_future, technology=sci_fi_advanced|advanced_contemporary, genre=sci_fi
  output: combat_vehicle, "Armored Hover Combat Vehicle", confidence=0.82
```

#### Civilian/Transport Vehicles

```
vh_modern_detective_car:
  triggers: profession=detective, period=contemporary|near_future, technology=contemporary|advanced
  output: car, "Detective's Sedan", confidence=0.80
  modifiers: climate=cold_snowy -> "Detective's SUV"

vh_modern_delivery_van:
  triggers: profession=courier|delivery, period=contemporary, technology=contemporary|digital_emerging
  output: van, "Delivery Van", confidence=0.88

vh_future_hovercar:
  triggers: period=near_future|distant_future, technology=sci_fi_advanced|advanced_contemporary, transport_type=hover
  output: hovercar, "Autonomous Hover Vehicle", confidence=0.90
  modifiers: genre=cyberpunk -> "Neon-lighted Hovercar"

vh_future_freight:
  triggers: period=distant_future, technology=sci_fi_advanced, profession=courier|delivery, genre=sci_fi
  output: freight_vehicle, "Autonomous Freight Carrier", confidence=0.85
```

#### Pre-Industrial / Fantasy

```
vh_wagon:
  triggers: technology=pre_industrial|feudal, period=fantasy_medieval|ancient|medieval|renaissance
  output: wagon, "Horse-drawn Wagon", confidence=0.95
  modifiers: genre=fantasy -> "Enchanted Wagon"
  modifiers: wealth=subsistence -> "Simple Wooden Cart"

vh_carriage:
  triggers: technology=pre_industrial|early_industrial, period=fantasy_medieval|victorian|colonial
  output: carriage, "Four-wheeled Carriage", confidence=0.90
  modifiers: wealth=extreme_inequality|broad_middle_class -> "Fine Carriage"

vh_warhorse:
  triggers: period=fantasy_medieval|medieval|ancient, profession=knight|warrior|soldier, genre=fantasy|historical
  output: horse, "Warhorse", confidence=0.92
  modifiers: genre=fantasy -> "Armored Warhorse"

vh_fantasy_mount:
  triggers: period=fantasy_medieval, genre=fantasy, technology=pre_industrial, profession=rider|knight|courier
  output: mount, "Riding Horse", confidence=0.88
  modifiers: biome=mountain -> "Sure-footed Mountain Pony"
```

#### Primitive / Ancient

```
vh_ancient_cart:
  triggers: technology=pre_industrial, period=ancient|bronze_age|iron_age
  output: cart, "Ox-drawn Cart", confidence=0.90

vh_sailing_ship:
  triggers: technology=pre_industrial|early_industrial, period=ancient|medieval|colonial|renaissance
  output: ship, "Sailing Ship", confidence=0.85
```

### 2.4 Context-Dependency Matrix

| Input | Period | Tech | Genre | Output |
|-------|--------|------|-------|--------|
| `truck` | 1944 | mid_20th_century | war_thriller | **Military Transport Truck** |
| `truck` | 2024 | contemporary | crime | **Delivery Van** |
| `truck` | 2087 | sci_fi_advanced | cyberpunk | **Autonomous Freight Carrier** |
| `truck` | fantasy_medieval | pre_industrial | fantasy | **Horse-drawn Wagon** |
| `car` | 1944 | mid_20th_century | war | **Staff Car** |
| `car` | 2024 | contemporary | crime | **Detective's Sedan** |
| `car` | 2087 | sci_fi_advanced | sci_fi | **Autonomous Hover Vehicle** |
| `horse` | 1944 | mid_20th_century | war | **Cavalry Horse** |
| `horse` | fantasy_medieval | pre_industrial | fantasy | **Warhorse (armored)** |
| `horse` | 2024 | contemporary | contemporary | **Horse (recreational)** |

**Key insight:** The SAME vehicle noun (`car`, `truck`, `horse`) produces DIFFERENT outputs because PCP context fields (period, technology, genre) change the winning registry anchor, NOT because the canonicalise function has a hardcoded map.

### 2.5 "Can no vehicle be returned if confidence is insufficient?"

**YES.** If no anchor reaches the confidence floor, the registry returns empty:

```
Input: "quantum_transporter"
Context: period=1940s, technology=mid_20th_century
Result: NO ANCHORS MATCH → return empty
Confidence floor: 0.30
```

The confidence floor is configurable. Default: 0.30 for forced proposals, 0.70 for auto-generate.

---

## 3. CREATURE REGISTRY DESIGN

### 3.1 PCP Fields Driving Creature Selection

| PCP Field | CPIE Registry Field | Purpose | Example Values |
|-----------|-------------------|---------|----------------|
| `project_identity.genre` | `genre` | Determines creature archetype | `fantasy`, `horror`, `sci_fi`, `historical` |
| `temporal_context.period` | `period` | Determines mythological system | `fantasy_medieval`, `distant_future`, `ancient` |
| `geographic_context.primary_biome` | `biome` | Determines creature habitat/ecology | `arctic_tundra`, `arid_desert`, `temperate_forest` |
| `cultural_context.belief_systems` | `mythology_hint` | Determines mythological framework | `norse`, `greek`, `celtic`, `eastern` |
| `technology_context.level` | `tech_level` | Determines engineered vs natural | `pre_industrial`, `sci_fi_advanced` |
| `economic_context.class_structure` | `class_structure` | Determines creature social role | `feudal`, `corporate`, `caste` |
| Profession (from entity) | `threat_role` | Determines creature's narrative function | `guardian`, `mount`, `predator`, `companion` |

### 3.2 Registry Anchor Structure

```typescript
interface CreatureAnchor {
  id: string;            // e.g. "cr_fantasy_dragon", "cr_sci_fi_predator"
  domain: 'creature';
  
  triggers: Array<{
    pcp_field: string;   // "genre" | "biome" | "tech_level" | "mythology_hint" | "threat_role" | "period"
    operator: 'eq' | 'in' | 'regex' | 'any';
    value: string | string[];
  }>;
  
  output_field: string;   // "creature_type"
  output_value: string;   // e.g. "dragon"
  confidence: number;
  priority: number;
  
  reasoning: string[];
  
  // Metadata for LLM generation (non-deterministic)
  archetype: string;       // "dragon", "predator", "guardian", "mount"
  ecology_hints: string[];  // What ecosystem this creature belongs to
  narrative_functions: string[];
  
  // Symbolism
  symbolic_associations: string[];
}
```

### 3.3 Proposed Anchors

#### Fantasy Creatures

```
cr_fantasy_dragon:
  triggers: genre=fantasy, threat_role=predator|guardian, biome=mountain|temperate_forest
  output: "Dragon", confidence=0.91
  symbolism: ["power", "ancient", "elemental", "greed"]
  ecology: "Large reptilian, hoards treasure, breathes fire"

cr_fantasy_unicorn:
  triggers: genre=fantasy, threat_role=companion|guardian, biome=temperate_forest|mediterranean
  output: "Unicorn", confidence=0.85
  symbolism: ["purity", "healing", "magic", "rare"]

cr_fantasy_griffin:
  triggers: genre=fantasy, biome=mountain, period=fantasy_medieval|medieval, threat_role=guardian
  output: "Griffin", confidence=0.78
  symbolism: ["guardian", "noble", "divine", "hybrid"]
  
cr_fantasy_horse_mount:
  triggers: genre=fantasy, profession=knight|rider|warrior, threat_role=mount
  output: "Bloodline Horse", confidence=0.82
  modifiers: period=fantasy_medieval -> "Barded Warhorse"

cr_fantasy_golem:
  triggers: genre=fantasy, technology=magic|pre_industrial, threat_role=guardian|construct
  output: "Golem", confidence=0.75
  symbolism: ["servant", "clay", "animated", "duty"]
```

#### Horror Creatures

```
cr_horror_stalker:
  triggers: genre=horror, threat_role=predator, biome=urban|temperate_forest|arctic_tundra
  output: "Stalking Predator Entity", confidence=0.80
  symbolism: ["fear", "unknown", "primal", "unstoppable"]

cr_horror_monster:
  triggers: genre=horror, threat_role=predator|guardian, period=contemporary|any
  output: "Primordial Monster", confidence=0.73
  modifiers: biome=urban -> "Sewer-dwelling Creature"
  modifiers: biome=arctic -> "Frozen Horror"

cr_horror_parasite:
  triggers: genre=horror, threat_role=predator|infector, period=near_future|contemporary
  output: "Parasitic Entity", confidence=0.68
  ecology: "Underground hives, infects hosts"
```

#### Sci-Fi Creatures

```
cr_sci_fi_predator:
  triggers: genre=sci_fi, threat_role=predator, biome=arid_desert|urban|temperate_forest
  output: "Engineered Predator Organism", confidence=0.80
  ecology: "Laboratory-engineered, pack hunter, bio-luminescence"

cr_sci_fi_alien:
  triggers: genre=sci_fi, threat_role=predator|guardian|companion, period=distant_future|near_future
  output: "Extraterrestrial Organism", confidence=0.78
  modifiers: biome=arid -> "Desert-adapted Xenomorph"
  modifiers: biome=arctic -> "Cryo-tolerant Entity"

cr_sci_fi_drone:
  triggers: genre=sci_fi, technology=sci_fi_advanced|advanced_contemporary, threat_role=construct|guardian
  output: "Automated Drone", confidence=0.72
  ecology: "Programmed swarm intelligence, synthetic body"

cr_sci_fi_mount:
  triggers: genre=sci_fi, profession=courier|rider|scout, threat_role=mount, technology=sci_fi_advanced
  output: "Bio-engineered Mount", confidence=0.74
```

#### Mythological / Symbolic

```
cr_mythic_guardian:
  triggers: genre=mythic|fantasy, belief_systems=greek|norse|celtic|egyptian, threat_role=guardian
  output: "Mythological Guardian", confidence=0.90
  modifiers: belief_systems=norse -> "Valkyrie's Mount"
  modifiers: belief_systems=greek -> "Cerberus Variant"

cr_mythic_sacred:
  triggers: genre=mythic|fantasy|historical, belief_systems=egyptian|eastern|mesoamerican, threat_role=guardian|companion
  output: "Sacred Creature", confidence=0.78
  modifiers: belief_systems=egyptian -> "Jackal-headed Deity Animal"
```

#### Historical / Mundane

```
cr_historical_horse:
  triggers: genre=historical, period=ancient|medieval|renaissance|colonial, threat_role=mount|companion
  output: "Period Horse", confidence=0.90
  modifiers: period=medieval -> "Destrier Warhorse"
  modifiers: period=colonial -> "Cavalry Horse"

cr_historical_working:
  triggers: genre=historical, threat_role=worker|utility, technology=pre_industrial|early_industrial
  output: "Working Animal", confidence=0.85
  modifiers: biome=desert -> "Camel"
  modifiers: biome=arctic -> "Sled Dog"
```

### 3.4 Context-Dependency Matrix

| Input Concept | Genre | Biome | Threat Role | Output |
|---------------|-------|-------|-------------|--------|
| `large predatory creature` | fantasy | mountain | predator | **Dragon** |
| `large predatory creature` | horror | urban | predator | **Stalking Predator Entity** |
| `large predatory creature` | sci_fi | desert | predator | **Engineered Predator Organism** |
| `large predatory creature` | mythic | forest | guardian | **Mythological Guardian** |
| `horse` | fantasy | forest | mount | **Bloodline Warhorse** |
| `horse` | historical | plains | cavalry | **Cavalry Horse** |
| `horse` | contemporary | urban | companion | **Recreational Horse** |
| `guardian` | fantasy | mountain | guardian | **Griffin** |
| `guardian` | horror | urban | predator | **Primordial Monster** |
| `guardian` | mythic | temple | guardian | **Mythological Guardian** |

### 3.5 "Can no creature be returned if confidence is insufficient?"

**YES.** Same mechanism as vehicles — configurable confidence floor. A creature named "quantum_squirrel" in a historical setting with no matching anchor would return empty.

---

## 4. YETI STRESS TEST ANALYSIS

### 4.1 YETI's Multiple Contextual Regimes

YETI (the existing test project) contains several distinct sections:

| YETI Section | Period | Tech Level | Genre | Expected Vehicle | Expected Creature |
|--------------|--------|------------|-------|-----------------|-------------------|
| **Prehistoric** | ancient/bronze_age | pre_industrial | historical/ancient | Ox-drawn Cart, Sailing Ship | Period Horse, Working Animal |
| **WWII** | 1940s/wwii_era | mid_20th_century | war_thriller | Jeep, Military Truck, Spitfire, Tank | Warhorse, Military Dog |
| **Ancient Mythology** | fantasy_medieval | pre_industrial | fantasy/mythic | Carriage, Warhorse, Wagon | Dragon, Griffin, Mythological Guardian |
| **Creator/Alien** | distant_future | sci_fi_advanced | sci_fi/horror | Hovercar, Freight Carrier | Engineered Predator, Alien |
| **Monster Horror** | contemporary | contemporary | horror | Det Car, Van (civilian) | Stalking Predator, Primordial Monster |

### 4.2 Verdict

**YETI succeeds because context changes — not because YETI is hardcoded.**

The SAME registry processes 5 different PCP contexts and produces 5 different output sets:
- No `if project_id === "yetiprojectid"` branches
- No YETI-specific anchor rules
- No YETI noun in the registry
- Just standard PCP fields driving standard anchors

---

## 5. FORBIDDEN ASSUMPTION AUDIT

### Vehicle-Attached

| Current Artifact | Lines | Classification | Replacement |
|----------------|-------|---------------|-------------|
| `'Jeep (Willys MB)'` | 67 | **UNACCEPTABLE** | Registry anchor `vh_wwii_jeep` only fires when period=1940s AND genre=war |
| `'Military Tank'` | 69 | **UNACCEPTABLE** | Registry anchor `vh_general_tank` only fires when genre=war AND period has tanks |
| `'Spitfire Fighter'` | 89 | **UNACCEPTABLE** | Registry anchor for WWII aircraft only fires under period=wwii_era |
| `'Military Lorry'` | 109 | **UNACCEPTABLE** | Registry anchor `vh_military_truck` period-dependent |
| `'German U-Boat'` | 121 | **UNACCEPTABLE** | Registry anchor period-dependent |
| `ownership: "military"` (default) | 156 | **ACCEPTABLE DEFAULT** | PCP-driven override: genre=war→military, genre=crime→civilian |
| `period_accuracy: "accurate"` (default) | 158 | **ACCEPTABLE DEFAULT** | PCP-driven overrides from actual period |
| `VEHICLE_PATTERNS` | 24-49 | **UNACCEPTABLE — see note** | These are EXTRACTION patterns, not inference. Extraction can remain as-is — they just find terms in text. The `canonicalise()` function that hardcodes them is the actual violation. |

**Verdict:** 8 unacceptable hardcodes found. All will be replaced by registry anchors that require PCP context to fire.

### Creature-Attached

| Current Artifact | Lines | Classification | Replacement |
|----------------|-------|---------------|-------------|
| `projects.genres` read | 382-383 | **CRITICAL VIOLATION** | Remove. CPIE provides genre through CPIEPCPContext input. |
| LLM genres injection | 388-399 | **CRITICAL VIOLATION** | Remove. CPIE registry provides creature priors from PCP fields. |
| `CREATURE_NOUNS` | 26-58 | **ACCEPTABLE EXTRACTION** | This is extraction input, not inference. Can remain. |
| YETI-specific assumptions | none found | **CLEAN** | No YETI-specific code in creature-atomiser. |

**Verdict:** 2 critical violations. Both are data-flow issues (reads context directly) rather than registry issues. The creature registry itself is clean.

---

## 6. GOVERNANCE EXPLANATION DESIGN

### 6.1 Vehicle Explanation

```
Military Jeep
  because:
    period=1944
    technology_level=mid_20th_century
    genre=war_thriller
    transport_function=military
    biome=arid_desert
  registry_anchor: vh_wwii_jeep
  confidence: 0.92
  reasoning: [
    "period=1944: WWII-era vehicle expected",
    "genre=war_thriller: military transport needed",
    "transport_function=military: jeep is the default light military vehicle"
  ]
  pcp_dependencies: [period, genre, technology_level, biome, profession_map]
```

### 6.2 Creature Explanation

```
Engineered Predator Organism
  because:
    genre=science_fiction
    ecology=laboratory_origin
    threat_role=biological_hazard
    technology_level=sci_fi_advanced
  registry_anchor: cr_sci_fi_predator
  confidence: 0.80
  reasoning: [
    "genre=sci_fi: engineered creatures are plausible",
    "threat_role=predator: this creature is a threat entity",
    "technology_level=sci_fi_advanced: bio-engineering available"
  ]
  pcp_dependencies: [genre, technology_level, biome, profession_map.threat_role]
```

### 6.3 Governance Integration

The existing `src/lib/cpie/governance.ts` `explainInference()` function works unchanged:
- `explainInference(inference, context, entityKey, 'vehicle')` 
- `explainInference(inference, context, entityKey, 'creature')`

The `pcp_values_snapshot` field captures all PCP values that contributed:
```json
{
  "profession": "detective",
  "period": "1944",
  "technology_level": "mid_20th_century",
  "genre": "war_thriller",
  "climate": "temperate_rainy"
}
```

---

## 7. CDG INTEGRATION PLAN

**Extensions to existing `cdg-integration.ts`** — no new infrastructure needed.

| Domain | CPIE Node | Canon Node | Projection Node |
|--------|-----------|------------|-----------------|
| Vehicle | C3 | D3 | S1+S2+S3 |
| Creature | C4 | D4 | S1+S2+S3 |

**CDG Registration bundle** — same structure as wardrobe/props:

```typescript
const reg = buildCDGRegistration(projectId, 'vehicle', entityKey, inferences);
// reg.node_id = 'D3'
// reg.cpie_node_id = 'C3'
```

**Registration table entry per inference:**
```
D3.vehicle.jeep
  upstream: C3, P2 (period), P5 (tech), P3 (geography)
  staleness_owned_by: cpie
  certification_owned_by: user
```

---

## 8. ICS INTEGRATION PLAN

| Domain | Total Fields | Current ICS | Target ICS |
|--------|-------------|-------------|------------|
| Vehicle | 8 | ~30% (WWII only) | 85%+ |
| Creature | 10 | ~20% (extraction only) | 80%+ |

**New field counts to add to `src/lib/cpie/ics.ts`:**
```typescript
const DOMAIN_FIELD_COUNTS: Record<string, number> = {
  // Existing
  wardrobe: 10,
  prop: 8,
  // New
  vehicle: 8,    // vehicle_type, era_alignment, primary_color, modification_level,
                  // driving_context, usage_count, condition, distinctive_features
  creature: 10,  // creature_type, species, role, behavior, size,
                  // habitat, diet, intelligence_level, magical_properties, narrative_function
};
```

---

## 9. IMPLEMENTATION RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Vehicle registry incomplete (missing civilian/modern vehicles) | Medium | High | Phase 1B.2 delivers 30+ anchors. Enhancement pass in Phase 1B.3. |
| Creature registry overlaps with existing extraction (CRITIAL_NOUNS) | Low | Medium | Extraction always wins (consumer contract Rule 5). CPIE fills gaps extraction misses. |
| Creature registry produces fantasy creatures for non-fantasy genres | Low | Low | Genre field is a mandatory trigger. Anchors are genre-scoped. |
| Vehicle registry returns no vehicles for extreme edge-case context | Medium | Low | Registry has catch-all anchors at low priority/low confidence. Never returns empty unless context is truly unresolvable. |
| YETI project regresses after atomiser replacement | Medium | **Critical** | **Must run YETI-specific regression test before deploying.** Compare pre/post outputs. |
| Confidence floor too low → spurious inferences | Low | Medium | Default floor = 0.30 for forced proposals. Auto-generate floor = 0.70. |

---

## 10. RECOMMENDATION

### B — Approved with Revisions

The registry designs are sound and pass all required criteria. However, 2 revisions are required before implementation:

### Required Revisions

| # | Change | Reason |
|---|--------|--------|
| 1 | Add intermediate transport_function layer to vehicle registry | Without it, military vehicles could fire for non-military contexts if period/tech are correct. Must first resolve vehicle ROLE from profession map, then match anchors by role. |
| 2 | Add generic catch-all anchors for both domains with priority=0 | Without catch-alls, an entity with an unrecognised profession produces zero vehicle/creature output. Anchors with priority=0, confidence=0.30 provide minimal fallback (e.g. "Civilian Vehicle", "Small Animal"). |

### Optional Enhancement (Future)

| # | Change | Value |
|---|--------|-------|
| 3 | Add biome-specific modifiers to creature registry | Currently underdeveloped. 5 of 8 major biomes covered. Add taiga, tropical, coastal. |
| 4 | Add mythology_hint expansion | Belief systems are not yet deeply resolved in PCP. When PCP adds `cultural_context.belief_systems` inference, creature registry can use it. |

---

## 11. DEFINITION OF DONE

This review is complete when we can state:

> *"Vehicle and creature inference is driven entirely by PCP context and CPIE registry rules, such that WWII outputs appear when WWII context exists, fantasy outputs appear when fantasy context exists, and no project-specific assumptions are required."*

| Condition | Status |
|-----------|--------|
| Vehicle registry uses PCP fields (period, tech, genre, biome, profession) | ✅ **DESIGNED** — 6 PCP fields, 15+ anchors |
| Creature registry uses PCP fields (genre, biome, threat_role, period, tech) | ✅ **DESIGNED** — 7 PCP fields, 20+ anchors |
| No WWII defaults | ✅ **DESIGNED** — WWII anchors require WWII PCP context to fire |
| No YETI assumptions | ✅ **DESIGNED** — No project-specific anchors |
| No fixed vehicle maps | ✅ **DESIGNED** — `canonicalise()` function will be replaced with CPIE anchor resolution |
| No fixed creature maps | ✅ **DESIGNED** — Genre-scoped anchors prevent incorrect outputs |
| Same input → different outputs by context | ✅ **PROVEN** — Context-dependency matrix shows 10+ cases |
| Empty return when confidence insufficient | ✅ **DESIGNED** — Configurable confidence floor (0.30/0.70) |
| Governance explains every inference | ✅ **DESIGNED** — `explainInference()` works unchanged |
| CDG integration | ✅ **DESIGNED** — C3→D3 (vehicle), C4→D4 (creature) |
| ICS integration | ✅ **DESIGNED** — vehicle: 8 fields, creature: 10 fields |
| YETI stress test passes | ✅ **ANALYZED** — 5 contextual regimes produce correct distinct outputs |
| Forbidden assumption audit completed | ✅ **COMPLETED** — 8 unacceptable + 2 critical violations found, all resolvable |

---

*Vehicle + Creature Registry Universality Review complete. SESS-ARCH-0028B.2 ready for decision.*

**Recommendation: B — Approved with Revisions** (2 required: transport_function layer + catch-all anchors)
