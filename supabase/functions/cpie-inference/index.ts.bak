/**
 * cpie-inference — CPIE Runtime Endpoint (Phase 1, Full Domains)
 *
 * Accepts resolved PCP context + requested domains.
 * Returns deterministic inference results with full provenance.
 *
 * Supports: wardrobe, props, vehicle, creature (all 4 CPIE domains)
 *
 * Architecture path: Narrative → PCP → CPIE → Atomiser
 *
 * Input:  { pcp: CPIEPCPContext, domains: string[] }
 * Output: { status, inferences: { domain: CPIEInferenceResult[] } }
 *
 * Uses certified CPIE registry data embedded below.
 * No LLM calls. No new inference paths.
 * Existing CPIE architecture is READ-ONLY.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ──────────────────────────────────────────────────────────────

export interface RegistryTrigger {
  pcp_field: string;
  operator: string;
  value: string | string[];
}

export interface RegistryAnchor {
  id: string;
  domain: string;
  triggers: RegistryTrigger[];
  output_field: string;
  output_value: string;
  confidence: number;
  priority: number;
  reasoning: string[];
}

export interface CPIEInference {
  field: string;
  value: string;
  source_type: "inferred" | "inferred_low_confidence";
  confidence_score: number;
  reasoning: string[];
  registry_anchor_id: string;
  pcp_dependencies: string[];
  generated_at: string;
  generated_by: "cpie_registry";
}

export interface CPIEPCPContext {
  project_id: string;
  genre: string[];
  period: string;
  climate: string;
  technology_level: string;
  culture: string[];
  profession_map: Record<string, {
    character_name: string;
    profession: string;
    role_archetype: string;
    authority_level: string;
    institutional_affiliation: string | null;
    confidence: number;
    source: string;
  }>;
  pcp_resolution_timestamp: string;
  transport_function?: string;
  infrastructure?: string;
  geography?: string;
  economy?: string;
  class_structure?: string;
  biome?: string;
  mythology?: string;
  ecology?: string;
  threat_role?: string;
  intelligence?: string;
  symbolism?: string;
  narrative_function?: string;
}

// ── Engine Logic ───────────────────────────────────────────────────────

function resolveContextField(ctx: CPIEPCPContext, field: string): string | string[] | null {
  if (field === "profession" || field === "role_archetype")   return null;
  if (field === "transport_function") return (ctx as any).transport_function?.toLowerCase() ?? null;
  switch (field) {
    case "genre": return ctx.genre.join(" ").toLowerCase();
    case "climate": return ctx.climate?.toLowerCase() ?? null;
    case "period": return ctx.period?.toLowerCase() ?? null;
    case "technology_level": return ctx.technology_level?.toLowerCase() ?? null;
    case "culture": return Array.isArray(ctx.culture) ? ctx.culture.join(" ").toLowerCase() : (ctx.culture?.toLowerCase() ?? null);
    case "infrastructure": return ctx.infrastructure?.toLowerCase() ?? null;
    case "geography": return ctx.geography?.toLowerCase() ?? null;
    case "economy": return ctx.economy?.toLowerCase() ?? null;
    case "class_structure": return ctx.class_structure?.toLowerCase() ?? null;
    case "biome": return ctx.biome?.toLowerCase() ?? null;
    case "mythology": return ctx.mythology?.toLowerCase() ?? null;
    case "ecology": return ctx.ecology?.toLowerCase() ?? null;
    case "threat_role": return ctx.threat_role?.toLowerCase() ?? null;
    case "intelligence": return ctx.intelligence?.toLowerCase() ?? null;
    case "symbolism": return ctx.symbolism?.toLowerCase() ?? null;
    case "narrative_function": return ctx.narrative_function?.toLowerCase() ?? null;
    default: return (ctx as any)[field]?.toLowerCase() ?? null;
  }
}

// ── Trigger Adapter: supports both array [f,op,v] and object {pcp_field,operator,value} ──
function readTrigger(trigger: any): { pcp_field: string; operator: string; value: any } {
  // Array format: [field, operator, value]
  if (Array.isArray(trigger)) {
    return { pcp_field: trigger[0], operator: trigger[1], value: trigger[2] };
  }
  // Object format: { pcp_field, operator, value }
  return { pcp_field: trigger.pcp_field, operator: trigger.operator, value: trigger.value };
}

function matchTrigger(ctx: CPIEPCPContext, trigger: RegistryTrigger): boolean {
  const t = readTrigger(trigger);
  const ctxValue = resolveContextField(ctx, t.pcp_field);
  if (ctxValue === null || ctxValue === undefined) return false;
  switch (t.operator) {
    case "eq": return String(ctxValue).toLowerCase() === String(t.value).toLowerCase();
    case "not_eq": return String(ctxValue).toLowerCase() !== String(t.value).toLowerCase();
    case "in": {
      const vals = Array.isArray(t.value) ? t.value : String(t.value).split(",").map((v: string) => v.trim());
      const ctxStr = String(ctxValue).toLowerCase();
      return vals.some((v: string) => ctxStr.includes(v.toLowerCase()));
    }
    case "any": return true;
    case "regex": { const re = new RegExp(String(t.value), "i"); return re.test(String(ctxValue)); }
    default: return false;
  }
}

function matchRules(
  rules: RegistryAnchor[],
  ctx: CPIEPCPContext,
  entity: { entity_key: string; profession?: string; role_archetype?: string },
): Map<string, RegistryAnchor> {
  const results = new Map<string, RegistryAnchor>();
  const scored: Array<{ anchor: RegistryAnchor; matchCount: number; totalTriggers: number; matchRatio: number }> = [];

  for (const rule of rules) {
    let matchCount = 0;
    for (const trigger of rule.triggers) {
      let matched = false;
      const t = readTrigger(trigger);
      if (t.pcp_field === "profession" || t.pcp_field === "role_archetype") {
        const entityVal = t.pcp_field === "profession" ? entity.profession : entity.role_archetype;
        if (entityVal) {
          switch (t.operator) {
            case "eq": matched = entityVal.toLowerCase() === String(t.value).toLowerCase(); break;
            case "in": {
              const vals = Array.isArray(t.value) ? t.value : String(t.value).split(",").map((v: string) => v.trim());
              matched = vals.some((v: string) => entityVal!.toLowerCase().includes(v.toLowerCase()));
              break;
            }
            case "not_eq": matched = entityVal.toLowerCase() !== String(t.value).toLowerCase(); break;
            case "any": matched = true; break;
            default: matched = false;
          }
        }
      } else {
        matched = matchTrigger(ctx, trigger);
      }
      if (matched) matchCount++;
    }
    const matchRatio = rule.triggers.length > 0 ? matchCount / rule.triggers.length : 0;
    scored.push({ anchor: rule, matchCount, totalTriggers: rule.triggers.length, matchRatio });
  }

  scored.sort((a, b) => {
    const ratioDiff = b.matchRatio - a.matchRatio;
    if (ratioDiff !== 0) return ratioDiff;
    const priorityDiff = b.anchor.priority - a.anchor.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return b.anchor.confidence - a.anchor.confidence;
  });

  const fieldsWithPrior = new Set<string>();
  for (const match of scored) {
    const field = match.anchor.output_field;
    if (match.anchor.priority === 0 && fieldsWithPrior.has(field)) continue;
    if (!results.has(field) && match.matchRatio > 0) {
      results.set(field, match.anchor);
      fieldsWithPrior.add(field);
    }
  }
  return results;
}

function anchorToInference(
  anchor: RegistryAnchor, entityKey: string,
  pcpDeps: string[], now: string,
): CPIEInference {
  return {
    field: anchor.output_field, value: anchor.output_value,
    source_type: anchor.priority === 0 ? "inferred_low_confidence" : "inferred",
    confidence_score: anchor.confidence,
    reasoning: anchor.reasoning,
    registry_anchor_id: anchor.id,
    pcp_dependencies: pcpDeps,
    generated_at: now, generated_by: "cpie_registry",
  };
}

// ── Registry Data (Certified from src/lib/cpie/registry.ts) ────────────
// Source: CPIE Registry v1.0.0 — READ-ONLY

const WARDROBE_ANCHORS: RegistryAnchor = [
  {
    "id": "wd_detective_noir_coat",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "genre",
        "in",
        "noir,crime,mystery"
      ],
      [
        "climate",
        "any",
        "temperate_rainy"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "trench_coat",
    "confidence": 0.91,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_detective_noir_coat",
      "profession=detective",
      "genre=noir/crime",
      "climate=temperate_rainy",
      "detectives_in_noir_settings_wear_trench_coats",
      "wd_detective_blazer",
      "wardrobe",
      "profession",
      "eq",
      "detective"
    ]
  },
  {
    "id": "wd_detective_blazer",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "genre",
        "in",
        "crime,noir,mystery"
      ],
      [
        "climate",
        "not_eq",
        "temperate_rainy"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "blazer",
    "confidence": 0.72,
    "priority": 90,
    "reasoning": [
      "registry_rule: wd_detective_blazer",
      "profession=detective",
      "climate=not_rainy",
      "detectives_often_wear_blazers_or_sport_coats",
      "wd_detective_formal",
      "wardrobe",
      "profession",
      "eq",
      "detective",
      "genre"
    ]
  },
  {
    "id": "wd_detective_formal",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "genre",
        "in",
        "period,historical"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "period_suit",
    "confidence": 0.85,
    "priority": 85,
    "reasoning": [
      "registry_rule: wd_detective_formal",
      "profession=detective",
      "genre=period/historical",
      "historical_detectives_wear_period_clothing",
      "wd_detective_fantasy",
      "wardrobe",
      "profession",
      "eq",
      "detective",
      "genre"
    ]
  },
  {
    "id": "wd_detective_fantasy",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "genre",
        "in",
        "fantasy"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "traveling_cloak",
    "confidence": 0.65,
    "priority": 80,
    "reasoning": [
      "registry_rule: wd_detective_fantasy",
      "profession=detective",
      "genre=fantasy",
      "fantasy_detectives_wear_traveling_cloaks",
      "wd_detective_future",
      "wardrobe",
      "profession",
      "eq",
      "detective",
      "period"
    ]
  },
  {
    "id": "wd_detective_future",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "tech_enhanced_coat",
    "confidence": 0.78,
    "priority": 85,
    "reasoning": [
      "registry_rule: wd_detective_future",
      "profession=detective",
      "period=future",
      "future_detectives_wear_tech_enhanced_coats",
      "wd_police_uniform",
      "wardrobe",
      "profession",
      "eq",
      "police",
      "genre"
    ]
  },
  {
    "id": "wd_police_uniform",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "eq",
        "police"
      ],
      [
        "genre",
        "not_eq",
        "fantasy"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "police_uniform",
    "confidence": 0.95,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_police_uniform",
      "profession=police",
      "police_wear_uniforms",
      "wd_police_fantasy",
      "wardrobe",
      "profession",
      "eq",
      "police",
      "genre",
      "in"
    ]
  },
  {
    "id": "wd_police_fantasy",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "eq",
        "police"
      ],
      [
        "genre",
        "in",
        "fantasy"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "city_guard_uniform",
    "confidence": 0.88,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_police_fantasy",
      "profession=police",
      "genre=fantasy",
      "fantasy_police_are_city_guards",
      "wd_soldier_modern",
      "wardrobe",
      "profession",
      "in",
      "soldier,military,marine",
      "period"
    ]
  },
  {
    "id": "wd_soldier_modern",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "soldier,military,marine"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2020|2000|near_future"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "combat_uniform",
    "confidence": 0.93,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_soldier_modern",
      "profession=soldier",
      "period=modern",
      "modern_soldiers_wear_combat_uniforms",
      "wd_soldier_historical",
      "wardrobe",
      "profession",
      "in",
      "soldier,military,general,commander",
      "genre"
    ]
  },
  {
    "id": "wd_soldier_historical",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "soldier,military,general,commander"
      ],
      [
        "genre",
        "in",
        "historical,period"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "period_military_uniform",
    "confidence": 0.9,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_soldier_historical",
      "profession=soldier",
      "genre=historical/period",
      "historical_soldiers_wear_period_military_uniforms",
      "wd_soldier_fantasy",
      "wardrobe",
      "profession",
      "in",
      "soldier,knight,warrior",
      "genre"
    ]
  },
  {
    "id": "wd_soldier_fantasy",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "soldier,knight,warrior"
      ],
      [
        "genre",
        "in",
        "fantasy"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "chainmail_and_surcoat",
    "confidence": 0.88,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_soldier_fantasy",
      "profession=soldier/knight",
      "genre=fantasy",
      "fantasy_soldiers_wear_chainmail_and_surcoats",
      "wd_soldier_future",
      "wardrobe",
      "profession",
      "in",
      "soldier,marine",
      "period"
    ]
  },
  {
    "id": "wd_soldier_future",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "soldier,marine"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "armored_exosuit",
    "confidence": 0.85,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_soldier_future",
      "profession=soldier",
      "period=future",
      "future_soldiers_wear_armored_exosuits",
      "wd_knight_armor",
      "wardrobe",
      "profession",
      "in",
      "knight,warrior,paladin",
      "genre"
    ]
  },
  {
    "id": "wd_knight_armor",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "knight,warrior,paladin"
      ],
      [
        "genre",
        "in",
        "fantasy"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "plate_armor",
    "confidence": 0.92,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_knight_armor",
      "profession=knight",
      "genre=fantasy",
      "fantasy_knights_wear_plate_armor",
      "wd_knight_crime",
      "wardrobe",
      "profession",
      "in",
      "knight,warrior",
      "genre"
    ]
  },
  {
    "id": "wd_knight_crime",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "knight,warrior"
      ],
      [
        "genre",
        "in",
        "crime,thriller"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "tactical_gear",
    "confidence": 0.6,
    "priority": 70,
    "reasoning": [
      "registry_rule: wd_knight_crime",
      "profession=knight/warrior",
      "genre=crime/thriller",
      "modern_combatants_wear_tactical_gear",
      "wd_knight_period",
      "wardrobe",
      "profession",
      "in",
      "knight,warrior",
      "genre"
    ]
  },
  {
    "id": "wd_knight_period",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "knight,warrior"
      ],
      [
        "genre",
        "in",
        "historical,period"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "period_knight_armor",
    "confidence": 0.95,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_knight_period",
      "profession=knight",
      "genre=historical",
      "historical_knights_wear_authentic_period_armor",
      "wd_courier_general",
      "wardrobe",
      "profession",
      "in",
      "courier,messenger,runner,delivery",
      "utility_clothing"
    ]
  },
  {
    "id": "wd_courier_general",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "courier,messenger,runner,delivery"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "utility_clothing",
    "confidence": 0.8,
    "priority": 80,
    "reasoning": [
      "registry_rule: wd_courier_general",
      "profession=courier",
      "couriers_wear_practical_utility_clothing",
      "wd_courier_future",
      "wardrobe",
      "profession",
      "in",
      "courier,messenger,runner,delivery",
      "period",
      "regex"
    ]
  },
  {
    "id": "wd_courier_future",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "courier,messenger,runner,delivery"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "tech_utility_gear",
    "confidence": 0.85,
    "priority": 90,
    "reasoning": [
      "registry_rule: wd_courier_future",
      "profession=courier",
      "period=future",
      "future_couriers_wear_tech_utility_gear",
      "wd_courier_historical",
      "wardrobe",
      "profession",
      "in",
      "courier,messenger,runner",
      "genre"
    ]
  },
  {
    "id": "wd_courier_historical",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "courier,messenger,runner"
      ],
      [
        "genre",
        "in",
        "historical,period"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "traveling_attire",
    "confidence": 0.78,
    "priority": 85,
    "reasoning": [
      "registry_rule: wd_courier_historical",
      "profession=courier",
      "genre=historical",
      "historical_couriers_wear_traveling_attire",
      "wd_courier_fantasy",
      "wardrobe",
      "profession",
      "in",
      "courier,messenger,rider",
      "genre"
    ]
  },
  {
    "id": "wd_courier_fantasy",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "courier,messenger,rider"
      ],
      [
        "genre",
        "in",
        "fantasy"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "riding_outfit",
    "confidence": 0.82,
    "priority": 85,
    "reasoning": [
      "registry_rule: wd_courier_fantasy",
      "profession=courier/rider",
      "genre=fantasy",
      "fantasy_couriers_wear_riding_outfits",
      "wd_doctor_modern",
      "wardrobe",
      "profession",
      "in",
      "doctor,physician,surgeon,medic",
      "period"
    ]
  },
  {
    "id": "wd_doctor_modern",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "doctor,physician,surgeon,medic"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "white_coat",
    "confidence": 0.93,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_doctor_modern",
      "profession=doctor",
      "period=modern",
      "modern_doctors_wear_white_coats",
      "wd_doctor_historical",
      "wardrobe",
      "profession",
      "in",
      "doctor,physician,medic",
      "genre"
    ]
  },
  {
    "id": "wd_doctor_historical",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "doctor,physician,medic"
      ],
      [
        "genre",
        "in",
        "historical,period"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "period_medical_attire",
    "confidence": 0.85,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_doctor_historical",
      "profession=doctor",
      "genre=historical",
      "historical_doctors_wear_period_medical_attire",
      "wd_doctor_future",
      "wardrobe",
      "profession",
      "in",
      "doctor,physician,medic",
      "period"
    ]
  },
  {
    "id": "wd_doctor_future",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "doctor,physician,medic"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "sterile_future_scrubs",
    "confidence": 0.82,
    "priority": 100,
    "reasoning": [
      "registry_rule: wd_doctor_future",
      "profession=doctor",
      "period=future",
      "future_doctors_wear_sterile_scrubs",
      "wd_civilian_modern",
      "wardrobe",
      "profession",
      "any",
      "], [",
      ", "
    ]
  },
  {
    "id": "wd_civilian_modern",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "any",
        ""
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "casual_modern_clothing",
    "confidence": 0.6,
    "priority": 10,
    "reasoning": [
      "registry_rule: wd_civilian_modern",
      "default: modern civilian",
      "wd_civilian_historical",
      "wardrobe",
      "profession",
      "any",
      "], [",
      ", ",
      ", ",
      "]],    "
    ]
  },
  {
    "id": "wd_civilian_historical",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "any",
        ""
      ],
      [
        "genre",
        "in",
        "historical,period"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "period_civilian_clothing",
    "confidence": 0.75,
    "priority": 20,
    "reasoning": [
      "registry_rule: wd_civilian_historical",
      "default: historical civilian",
      "wd_civilian_fantasy",
      "wardrobe",
      "profession",
      "any",
      "], [",
      ", ",
      ", ",
      "]],    "
    ]
  },
  {
    "id": "wd_civilian_fantasy",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "any",
        ""
      ],
      [
        "genre",
        "in",
        "fantasy"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "fantasy_civilian_clothing",
    "confidence": 0.7,
    "priority": 20,
    "reasoning": [
      "registry_rule: wd_civilian_fantasy",
      "default: fantasy civilian",
      "wd_civilian_future",
      "wardrobe",
      "profession",
      "any",
      "], [",
      ", ",
      ", ",
      "]],    "
    ]
  },
  {
    "id": "wd_civilian_future",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "any",
        ""
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_outfit",
    "output_value": "future_civilian_clothing",
    "confidence": 0.65,
    "priority": 20,
    "reasoning": [
      "registry_rule: wd_civilian_future",
      "default: future civilian",
      "wd_detective_footwear",
      "wardrobe",
      "profession",
      "eq",
      "detective",
      "footwear",
      "practical_shoes",
      "registry_rule: wd_detective_footwear"
    ]
  },
  {
    "id": "wd_detective_footwear",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ]
    ],
    "output_field": "footwear",
    "output_value": "practical_shoes",
    "confidence": 0.78,
    "priority": 80,
    "reasoning": [
      "registry_rule: wd_detective_footwear",
      "profession=detective",
      "detectives_wear_practical_shoes",
      "wd_detective_headwear",
      "wardrobe",
      "profession",
      "eq",
      "detective",
      "genre",
      "in"
    ]
  },
  {
    "id": "wd_detective_headwear",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "genre",
        "in",
        "noir,crime"
      ]
    ],
    "output_field": "headwear",
    "output_value": "fedora",
    "confidence": 0.85,
    "priority": 90,
    "reasoning": [
      "registry_rule: wd_detective_headwear",
      "profession=detective",
      "genre=noir/crime",
      "noir_detectives_wear_fedoras",
      "wd_knight_footwear",
      "wardrobe",
      "profession",
      "in",
      "knight,warrior,paladin",
      "footwear"
    ]
  },
  {
    "id": "wd_knight_footwear",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "knight,warrior,paladin"
      ]
    ],
    "output_field": "footwear",
    "output_value": "combat_boots",
    "confidence": 0.88,
    "priority": 90,
    "reasoning": [
      "registry_rule: wd_knight_footwear",
      "profession=knight/warrior",
      "knights_wear_combat_boots",
      "wd_courier_headwear",
      "wardrobe",
      "profession",
      "in",
      "courier,messenger,runner,delivery",
      "headwear",
      "weather_hat"
    ]
  },
  {
    "id": "wd_courier_headwear",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "courier,messenger,runner,delivery"
      ]
    ],
    "output_field": "headwear",
    "output_value": "weather_hat",
    "confidence": 0.65,
    "priority": 60,
    "reasoning": [
      "registry_rule: wd_courier_headwear",
      "profession=courier",
      "couriers_wear_weather_hats",
      "wd_doctor_footwear",
      "wardrobe",
      "profession",
      "in",
      "doctor,physician,surgeon,medic",
      "footwear",
      "comfortable_shoes"
    ]
  },
  {
    "id": "wd_doctor_footwear",
    "domain": "wardrobe",
    "triggers": [
      [
        "profession",
        "in",
        "doctor,physician,surgeon,medic"
      ]
    ],
    "output_field": "footwear",
    "output_value": "comfortable_shoes",
    "confidence": 0.7,
    "priority": 70,
    "reasoning": [
      "registry_rule: wd_doctor_footwear",
      "profession=doctor",
      "doctors_wear_comfortable_shoes",
      "wd_cold_weather",
      "wardrobe",
      "climate",
      "in",
      "cold_snowy,arctic,sub_arctic",
      "outerwear",
      "heavy_coat"
    ]
  },
  {
    "id": "wd_cold_weather",
    "domain": "wardrobe",
    "triggers": [
      [
        "climate",
        "in",
        "cold_snowy,arctic,sub_arctic"
      ]
    ],
    "output_field": "outerwear",
    "output_value": "heavy_coat",
    "confidence": 0.88,
    "priority": 95,
    "reasoning": [
      "registry_rule: wd_cold_weather",
      "climate=cold/snowy",
      "cold_climate_requires_heavy_coat",
      "wd_hot_weather",
      "wardrobe",
      "climate",
      "in",
      "hot_arid,arid,tropical_humid",
      "light_jacket",
      "registry_rule: wd_hot_weather"
    ]
  },
  {
    "id": "wd_hot_weather",
    "domain": "wardrobe",
    "triggers": [
      [
        "climate",
        "in",
        "hot_arid,arid,tropical_humid"
      ]
    ],
    "output_field": "outerwear",
    "output_value": "light_jacket",
    "confidence": 0.75,
    "priority": 85,
    "reasoning": [
      "registry_rule: wd_hot_weather",
      "climate=hot/arid",
      "hot_climate_requires_light_clothing",
      "wd_rain_weather",
      "wardrobe",
      "climate",
      "in",
      "temperate_rainy,rainy,wet",
      "rain_proof_jacket",
      "registry_rule: wd_rain_weather"
    ]
  },
  {
    "id": "wd_rain_weather",
    "domain": "wardrobe",
    "triggers": [
      [
        "climate",
        "in",
        "temperate_rainy,rainy,wet"
      ]
    ],
    "output_field": "outerwear",
    "output_value": "rain_proof_jacket",
    "confidence": 0.82,
    "priority": 90,
    "reasoning": [
      "registry_rule: wd_rain_weather",
      "climate=rainy",
      "rainy_climate_requires_rain_proof_jacket",
      "pr_detective_notebook",
      "prop",
      "profession",
      "eq",
      "detective",
      "primary_prop",
      "notebook"
    ]
  }
];

const PROP_ANCHORS: RegistryAnchor = [
  {
    "id": "pr_detective_pen",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ]
    ],
    "output_field": "writing_tool",
    "output_value": "pen",
    "confidence": 0.88,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_detective_pen",
      "profession=detective",
      "detectives_carry_pens",
      "pr_detective_radio",
      "prop",
      "profession",
      "eq",
      "detective",
      "period",
      "regex"
    ]
  },
  {
    "id": "pr_detective_radio",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020|near_future"
      ]
    ],
    "output_field": "communication",
    "output_value": "police_radio",
    "confidence": 0.8,
    "priority": 90,
    "reasoning": [
      "registry_rule: pr_detective_radio",
      "profession=detective",
      "period=modern",
      "modern_detectives_have_police_radios",
      "pr_detective_future_comms",
      "prop",
      "profession",
      "eq",
      "detective",
      "period"
    ]
  },
  {
    "id": "pr_detective_future_comms",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "communication",
    "output_value": "neural_link",
    "confidence": 0.75,
    "priority": 90,
    "reasoning": [
      "registry_rule: pr_detective_future_comms",
      "profession=detective",
      "period=future",
      "future_detectives_use_neural_links",
      "pr_detective_period_comms",
      "prop",
      "profession",
      "eq",
      "detective",
      "period"
    ]
  },
  {
    "id": "pr_detective_period_comms",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "period",
        "regex",
        "1940s|interwar|wwii"
      ]
    ],
    "output_field": "communication",
    "output_value": "desk_telephone",
    "confidence": 0.85,
    "priority": 90,
    "reasoning": [
      "registry_rule: pr_detective_period_comms",
      "profession=detective",
      "period=1940s",
      "period_detectives_use_desk_telephones",
      "pr_detective_flashlight",
      "prop",
      "profession",
      "eq",
      "detective",
      "utility"
    ]
  },
  {
    "id": "pr_detective_flashlight",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ]
    ],
    "output_field": "utility",
    "output_value": "flashlight",
    "confidence": 0.7,
    "priority": 70,
    "reasoning": [
      "registry_rule: pr_detective_flashlight",
      "profession=detective",
      "detectives_carry_flashlights",
      "pr_detective_fantasy",
      "prop",
      "profession",
      "eq",
      "detective",
      "genre",
      "in"
    ]
  },
  {
    "id": "pr_detective_fantasy",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "eq",
        "detective"
      ],
      [
        "genre",
        "in",
        "fantasy"
      ]
    ],
    "output_field": "primary_prop",
    "output_value": "scroll_of_records",
    "confidence": 0.6,
    "priority": 80,
    "reasoning": [
      "registry_rule: pr_detective_fantasy",
      "profession=detective",
      "genre=fantasy",
      "fantasy_detectives_carry_records",
      "pr_knight_weapon_melee",
      "prop",
      "profession",
      "in",
      "knight,warrior,paladin",
      "primary_weapon"
    ]
  },
  {
    "id": "pr_knight_weapon_melee",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "knight,warrior,paladin"
      ]
    ],
    "output_field": "primary_weapon",
    "output_value": "sword",
    "confidence": 0.93,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_knight_weapon_melee",
      "profession=knight",
      "knights_carry_swords",
      "pr_knight_shield",
      "prop",
      "profession",
      "in",
      "knight,warrior",
      "shield",
      "kite_shield"
    ]
  },
  {
    "id": "pr_knight_shield",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "knight,warrior"
      ]
    ],
    "output_field": "shield",
    "output_value": "kite_shield",
    "confidence": 0.85,
    "priority": 90,
    "reasoning": [
      "registry_rule: pr_knight_shield",
      "profession=knight",
      "knights_carry_shields",
      "pr_knight_period_weapon",
      "prop",
      "profession",
      "in",
      "knight,warrior",
      "genre",
      "in"
    ]
  },
  {
    "id": "pr_knight_period_weapon",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "knight,warrior"
      ],
      [
        "genre",
        "in",
        "historical,period"
      ]
    ],
    "output_field": "primary_weapon",
    "output_value": "period_sword",
    "confidence": 0.95,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_knight_period_weapon",
      "profession=knight",
      "genre=historical",
      "historical_knights_use_period_weapons",
      "pr_knight_horse",
      "prop",
      "profession",
      "in",
      "knight,rider,warrior",
      "genre"
    ]
  },
  {
    "id": "pr_knight_horse",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "knight,rider,warrior"
      ],
      [
        "genre",
        "in",
        "fantasy,historical"
      ]
    ],
    "output_field": "mount",
    "output_value": "horse",
    "confidence": 0.92,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_knight_horse",
      "profession=knight/rider",
      "genre=fantasy/historical",
      "knights_and_riders_have_horses",
      "pr_knight_banner",
      "prop",
      "profession",
      "in",
      "knight,rider,warrior",
      "genre"
    ]
  },
  {
    "id": "pr_knight_banner",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "knight,rider,warrior"
      ],
      [
        "genre",
        "in",
        "fantasy,historical"
      ]
    ],
    "output_field": "heraldry",
    "output_value": "heraldic_banner",
    "confidence": 0.78,
    "priority": 80,
    "reasoning": [
      "registry_rule: pr_knight_banner",
      "profession=knight",
      "genre=fantasy/historical",
      "knights_carry_heraldic_banners",
      "pr_courier_package",
      "prop",
      "profession",
      "in",
      "courier,messenger,runner,delivery",
      "primary_prop"
    ]
  },
  {
    "id": "pr_courier_package",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "courier,messenger,runner,delivery"
      ]
    ],
    "output_field": "primary_prop",
    "output_value": "package",
    "confidence": 0.92,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_courier_package",
      "profession=courier",
      "couriers_carry_packages",
      "pr_courier_bag",
      "prop",
      "profession",
      "in",
      "courier,messenger,runner,delivery",
      "carrier",
      "delivery_bag"
    ]
  },
  {
    "id": "pr_courier_bag",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "courier,messenger,runner,delivery"
      ]
    ],
    "output_field": "carrier",
    "output_value": "delivery_bag",
    "confidence": 0.88,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_courier_bag",
      "profession=courier",
      "couriers_carry_delivery_bags",
      "pr_courier_scanner",
      "prop",
      "profession",
      "in",
      "courier,messenger,delivery",
      "period",
      "regex"
    ]
  },
  {
    "id": "pr_courier_scanner",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "courier,messenger,delivery"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020|near_future"
      ]
    ],
    "output_field": "scanner",
    "output_value": "package_scanner",
    "confidence": 0.75,
    "priority": 80,
    "reasoning": [
      "registry_rule: pr_courier_scanner",
      "profession=courier",
      "period=modern",
      "modern_couriers_use_package_scanners",
      "pr_courier_future_scanner",
      "prop",
      "profession",
      "in",
      "courier,messenger,delivery",
      "period"
    ]
  },
  {
    "id": "pr_courier_future_scanner",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "courier,messenger,delivery"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "scanner",
    "output_value": "holographic_reader",
    "confidence": 0.78,
    "priority": 80,
    "reasoning": [
      "registry_rule: pr_courier_future_scanner",
      "profession=courier",
      "period=future",
      "future_couriers_use_holographic_readers",
      "pr_doctor_stethoscope",
      "prop",
      "profession",
      "in",
      "doctor,physician,medic",
      "primary_prop"
    ]
  },
  {
    "id": "pr_doctor_stethoscope",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "doctor,physician,medic"
      ]
    ],
    "output_field": "primary_prop",
    "output_value": "stethoscope",
    "confidence": 0.92,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_doctor_stethoscope",
      "profession=doctor",
      "doctors_carry_stethoscopes",
      "pr_doctor_clipboard",
      "prop",
      "profession",
      "in",
      "doctor,physician",
      "record_prop",
      "clipboard"
    ]
  },
  {
    "id": "pr_doctor_clipboard",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "doctor,physician"
      ]
    ],
    "output_field": "record_prop",
    "output_value": "clipboard",
    "confidence": 0.78,
    "priority": 80,
    "reasoning": [
      "registry_rule: pr_doctor_clipboard",
      "profession=doctor",
      "doctors_carry_clipboards",
      "pr_doctor_medkit",
      "prop",
      "profession",
      "in",
      "doctor,medic",
      "medical_kit",
      "medkit"
    ]
  },
  {
    "id": "pr_doctor_medkit",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "doctor,medic"
      ]
    ],
    "output_field": "medical_kit",
    "output_value": "medkit",
    "confidence": 0.85,
    "priority": 90,
    "reasoning": [
      "registry_rule: pr_doctor_medkit",
      "profession=doctor/medic",
      "medical_personnel_carry_medkits",
      "pr_professor_book",
      "prop",
      "profession",
      "in",
      "professor,teacher,academic",
      "primary_prop",
      "book"
    ]
  },
  {
    "id": "pr_professor_book",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "professor,teacher,academic"
      ]
    ],
    "output_field": "primary_prop",
    "output_value": "book",
    "confidence": 0.9,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_professor_book",
      "profession=professor",
      "academics_carry_books",
      "pr_chef_knife",
      "prop",
      "profession",
      "in",
      "chef,cook,culinary",
      "chef_knife",
      "registry_rule: pr_chef_knife"
    ]
  },
  {
    "id": "pr_chef_knife",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "chef,cook,culinary"
      ]
    ],
    "output_field": "primary_prop",
    "output_value": "chef_knife",
    "confidence": 0.9,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_chef_knife",
      "profession=chef",
      "chefs_carry_chef_knives",
      "pr_worker_tools",
      "prop",
      "profession",
      "in",
      "worker,construction,mechanic,engineer",
      "toolbox",
      "registry_rule: pr_worker_tools"
    ]
  },
  {
    "id": "pr_worker_tools",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "worker,construction,mechanic,engineer"
      ]
    ],
    "output_field": "primary_prop",
    "output_value": "toolbox",
    "confidence": 0.85,
    "priority": 90,
    "reasoning": [
      "registry_rule: pr_worker_tools",
      "profession=worker",
      "workers_carry_toolboxes",
      "pr_bartender_glass",
      "prop",
      "profession",
      "in",
      "bartender,barman,barmaid",
      "glass_towel",
      "registry_rule: pr_bartender_glass"
    ]
  },
  {
    "id": "pr_bartender_glass",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "bartender,barman,barmaid"
      ]
    ],
    "output_field": "primary_prop",
    "output_value": "glass_towel",
    "confidence": 0.8,
    "priority": 90,
    "reasoning": [
      "registry_rule: pr_bartender_glass",
      "profession=bartender",
      "bartenders_carry_glasses_and_towels",
      "pr_priest_book",
      "prop",
      "profession",
      "in",
      "priest,clergy,minister",
      "religious_book",
      "registry_rule: pr_priest_book"
    ]
  },
  {
    "id": "pr_priest_book",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "in",
        "priest,clergy,minister"
      ]
    ],
    "output_field": "primary_prop",
    "output_value": "religious_book",
    "confidence": 0.88,
    "priority": 100,
    "reasoning": [
      "registry_rule: pr_priest_book",
      "profession=priest",
      "clergy_carry_religious_texts",
      "pr_modern_phone",
      "prop",
      "profession",
      "any",
      "], [",
      ", ",
      ", "
    ]
  },
  {
    "id": "pr_modern_phone",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "any",
        ""
      ],
      [
        "technology_level",
        "in",
        "contemporary,digital,advanced_contemporary,advanced,modern"
      ]
    ],
    "output_field": "tech_carry",
    "output_value": "smartphone",
    "confidence": 0.75,
    "priority": 10,
    "reasoning": [
      "registry_rule: pr_modern_phone",
      "technology_level=modern",
      "modern_characters_carry_smartphones",
      "pr_future_terminal",
      "prop",
      "profession",
      "any",
      "], [",
      ", ",
      ", "
    ]
  },
  {
    "id": "pr_future_terminal",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "any",
        ""
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "tech_carry",
    "output_value": "portable_terminal",
    "confidence": 0.72,
    "priority": 20,
    "reasoning": [
      "registry_rule: pr_future_terminal",
      "period=future",
      "future_characters_carry_portable_terminals",
      "pr_historical_none",
      "prop",
      "profession",
      "any",
      "], [",
      ", ",
      ", "
    ]
  },
  {
    "id": "pr_historical_none",
    "domain": "prop",
    "triggers": [
      [
        "profession",
        "any",
        ""
      ],
      [
        "genre",
        "in",
        "historical,period"
      ]
    ],
    "output_field": "tech_carry",
    "output_value": "none",
    "confidence": 0.85,
    "priority": 30,
    "reasoning": [
      "registry_rule: pr_historical_none",
      "genre=historical",
      "historical_characters_dont_carry_technology",
      "vh_military_wwii",
      "vehicle",
      "transport_function",
      "eq",
      "military",
      "period",
      "regex"
    ]
  }
];

const VEHICLE_ANCHORS: RegistryAnchor = [
  {
    "id": "vh_military_wwii",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "military"
      ],
      [
        "period",
        "regex",
        "1940s|wwii|interwar"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "military_truck",
    "confidence": 0.88,
    "priority": 100,
    "reasoning": [
      "registry_rule: vh_military_wwii",
      "transport_function=military",
      "period=1940s/wwii",
      "military_personnel_in_wwii_use_military_trucks",
      "vh_military_wwii_heavy",
      "vehicle",
      "transport_function",
      "eq",
      "military",
      "period"
    ]
  },
  {
    "id": "vh_military_wwii_heavy",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "military"
      ],
      [
        "period",
        "regex",
        "1940s|wwii"
      ]
    ],
    "output_field": "heavy_vehicle",
    "output_value": "artillery_transport",
    "confidence": 0.82,
    "priority": 90,
    "reasoning": [
      "registry_rule: vh_military_wwii_heavy",
      "transport_function=military",
      "period=wwii",
      "wwii_military_operations_require_artillery_transport",
      "vh_military_modern",
      "vehicle",
      "transport_function",
      "eq",
      "military",
      "period"
    ]
  },
  {
    "id": "vh_military_modern",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "military"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020|near_future"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "armored_personnel_carrier",
    "confidence": 0.85,
    "priority": 95,
    "reasoning": [
      "registry_rule: vh_military_modern",
      "transport_function=military",
      "period=modern",
      "modern_military_personnel_use_armored_vehicles",
      "vh_military_modern_jeep",
      "vehicle",
      "transport_function",
      "eq",
      "military",
      "period"
    ]
  },
  {
    "id": "vh_military_modern_jeep",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "military"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ]
    ],
    "output_field": "light_vehicle",
    "output_value": "military_jeep",
    "confidence": 0.8,
    "priority": 90,
    "reasoning": [
      "registry_rule: vh_military_modern_jeep",
      "transport_function=military",
      "period=modern",
      "modern_reconnaissance_forces_use_military_jeeps",
      "vh_military_fantasy",
      "vehicle",
      "transport_function",
      "eq",
      "military",
      "period"
    ]
  },
  {
    "id": "vh_military_fantasy",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "military"
      ],
      [
        "period",
        "in",
        "fantasy_medieval,medieval"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "warhorse",
    "confidence": 0.9,
    "priority": 100,
    "reasoning": [
      "registry_rule: vh_military_fantasy",
      "transport_function=military",
      "period=fantasy_medieval",
      "fantasy_military_forces_ride_warhorses",
      "vh_military_fantasy_chariot",
      "vehicle",
      "transport_function",
      "eq",
      "military",
      "period"
    ]
  },
  {
    "id": "vh_military_fantasy_chariot",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "military"
      ],
      [
        "period",
        "in",
        "fantasy_medieval,ancient,medieval"
      ],
      [
        "technology_level",
        "in",
        "pre_industrial,ancient"
      ]
    ],
    "output_field": "heavy_vehicle",
    "output_value": "war_chariot",
    "confidence": 0.75,
    "priority": 85,
    "reasoning": [
      "registry_rule: vh_military_fantasy_chariot",
      "transport_function=military",
      "period=ancient/fantasy_medieval",
      "technology_level=pre_industrial",
      "ancient_military_forces_use_war_chariots",
      "vh_military_future",
      "vehicle",
      "transport_function",
      "eq",
      "military"
    ]
  },
  {
    "id": "vh_military_future",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "military"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "hover_tank",
    "confidence": 0.82,
    "priority": 95,
    "reasoning": [
      "registry_rule: vh_military_future",
      "transport_function=military",
      "period=future",
      "future_military_forces_use_hover_tanks",
      "vh_military_future_apc",
      "vehicle",
      "transport_function",
      "eq",
      "military",
      "period"
    ]
  },
  {
    "id": "vh_military_future_apc",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "military"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "light_vehicle",
    "output_value": "armored_hovercraft",
    "confidence": 0.78,
    "priority": 85,
    "reasoning": [
      "registry_rule: vh_military_future_apc",
      "transport_function=military",
      "period=future",
      "future_reconnaissance_forces_use_armored_hovercrafts",
      "vh_emergency_police_modern",
      "vehicle",
      "transport_function",
      "eq",
      "emergency_services",
      "period"
    ]
  },
  {
    "id": "vh_emergency_police_modern",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "emergency_services"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020|near_future"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "police_cruiser",
    "confidence": 0.88,
    "priority": 100,
    "reasoning": [
      "registry_rule: vh_emergency_police_modern",
      "transport_function=emergency_services",
      "period=modern",
      "modern_police_use_police_cruisers",
      "vh_emergency_police_wwii",
      "vehicle",
      "transport_function",
      "eq",
      "emergency_services",
      "period"
    ]
  },
  {
    "id": "vh_emergency_police_wwii",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "emergency_services"
      ],
      [
        "period",
        "regex",
        "1940s|wwii|interwar"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "vintage_police_car",
    "confidence": 0.8,
    "priority": 90,
    "reasoning": [
      "registry_rule: vh_emergency_police_wwii",
      "transport_function=emergency_services",
      "period=1940s",
      "wwii_police_use_vintage_police_cars",
      "vh_emergency_police_future",
      "vehicle",
      "transport_function",
      "eq",
      "emergency_services",
      "period"
    ]
  },
  {
    "id": "vh_emergency_police_future",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "emergency_services"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "police_hovercraft",
    "confidence": 0.82,
    "priority": 90,
    "reasoning": [
      "registry_rule: vh_emergency_police_future",
      "transport_function=emergency_services",
      "period=future",
      "future_police_use_hovercrafts",
      "vh_emergency_medic_modern",
      "vehicle",
      "transport_function",
      "eq",
      "emergency_services",
      "period"
    ]
  },
  {
    "id": "vh_emergency_medic_modern",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "emergency_services"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ]
    ],
    "output_field": "medical_vehicle",
    "output_value": "ambulance",
    "confidence": 0.85,
    "priority": 95,
    "reasoning": [
      "registry_rule: vh_emergency_medic_modern",
      "transport_function=emergency_services",
      "period=modern",
      "modern_paramedics_use_ambulances",
      "vh_emergency_fire_modern",
      "vehicle",
      "transport_function",
      "eq",
      "emergency_services",
      "profession"
    ]
  },
  {
    "id": "vh_emergency_fire_modern",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "emergency_services"
      ],
      [
        "profession",
        "eq",
        "firefighter"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "fire_truck",
    "confidence": 0.9,
    "priority": 100,
    "reasoning": [
      "registry_rule: vh_emergency_fire_modern",
      "transport_function=emergency_services",
      "profession=firefighter",
      "firefighters_use_fire_trucks",
      "vh_commercial_modern",
      "vehicle",
      "transport_function",
      "eq",
      "commercial",
      "period"
    ]
  },
  {
    "id": "vh_commercial_modern",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "commercial"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "delivery_van",
    "confidence": 0.85,
    "priority": 90,
    "reasoning": [
      "registry_rule: vh_commercial_modern",
      "transport_function=commercial",
      "period=modern",
      "modern_couriers_and_delivery_personnel_use_delivery_vans",
      "vh_commercial_modern_truck",
      "vehicle",
      "transport_function",
      "eq",
      "commercial",
      "period"
    ]
  },
  {
    "id": "vh_commercial_modern_truck",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "commercial"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ],
      [
        "profession",
        "in",
        "trucker,delivery"
      ]
    ],
    "output_field": "heavy_vehicle",
    "output_value": "delivery_truck",
    "confidence": 0.88,
    "priority": 95,
    "reasoning": [
      "registry_rule: vh_commercial_modern_truck",
      "transport_function=commercial",
      "period=modern",
      "profession=trucker/delivery",
      "truckers_and_delivery_drivers_use_delivery_trucks",
      "vh_commercial_taxi_modern",
      "vehicle",
      "transport_function",
      "eq",
      "commercial"
    ]
  },
  {
    "id": "vh_commercial_taxi_modern",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "commercial"
      ],
      [
        "profession",
        "in",
        "taxi,driver"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "taxi_cab",
    "confidence": 0.87,
    "priority": 95,
    "reasoning": [
      "registry_rule: vh_commercial_taxi_modern",
      "transport_function=commercial",
      "profession=taxi/driver",
      "taxi_drivers_use_taxi_cabs",
      "vh_commercial_wwii",
      "vehicle",
      "transport_function",
      "eq",
      "commercial",
      "period"
    ]
  },
  {
    "id": "vh_commercial_wwii",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "commercial"
      ],
      [
        "period",
        "regex",
        "1940s|wwii|interwar"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "vintage_delivery_truck",
    "confidence": 0.78,
    "priority": 85,
    "reasoning": [
      "registry_rule: vh_commercial_wwii",
      "transport_function=commercial",
      "period=1940s",
      "wwii_commercial_vehicles_are_vintage_delivery_trucks",
      "vh_commercial_future",
      "vehicle",
      "transport_function",
      "eq",
      "commercial",
      "period"
    ]
  },
  {
    "id": "vh_commercial_future",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "commercial"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "autonomous_freight_carrier",
    "confidence": 0.8,
    "priority": 90,
    "reasoning": [
      "registry_rule: vh_commercial_future",
      "transport_function=commercial",
      "period=future",
      "future_commercial_transport_uses_autonomous_freight_carriers",
      "vh_commercial_fantasy",
      "vehicle",
      "transport_function",
      "eq",
      "commercial",
      "period"
    ]
  },
  {
    "id": "vh_commercial_fantasy",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "commercial"
      ],
      [
        "period",
        "in",
        "fantasy_medieval,medieval,ancient"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "beast_drawn_cart",
    "confidence": 0.82,
    "priority": 85,
    "reasoning": [
      "registry_rule: vh_commercial_fantasy",
      "transport_function=commercial",
      "period=fantasy_medieval/ancient",
      "fantasy_commercial_transport_uses_beast_drawn_carts",
      "vh_civilian_modern",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_transport",
      "period"
    ]
  },
  {
    "id": "vh_civilian_modern",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_transport"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "sedan",
    "confidence": 0.72,
    "priority": 80,
    "reasoning": [
      "registry_rule: vh_civilian_modern",
      "transport_function=civilian_transport",
      "period=modern",
      "modern_civilians_use_sedans_for_personal_transport",
      "vh_civilian_modern_economy",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_transport",
      "period"
    ]
  },
  {
    "id": "vh_civilian_modern_economy",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_transport"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ],
      [
        "economy",
        "in",
        "industrial,post_industrial,developed"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "compact_car",
    "confidence": 0.65,
    "priority": 70,
    "reasoning": [
      "registry_rule: vh_civilian_modern_economy",
      "transport_function=civilian_transport",
      "period=modern",
      "economy=developed",
      "modern_civilians_in_developed_economies_use_compact_cars",
      "vh_civilian_modern_luxury",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_transport"
    ]
  },
  {
    "id": "vh_civilian_modern_luxury",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_transport"
      ],
      [
        "class_structure",
        "in",
        "stratified,corporate"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "luxury_sedan",
    "confidence": 0.6,
    "priority": 65,
    "reasoning": [
      "registry_rule: vh_civilian_modern_luxury",
      "transport_function=civilian_transport",
      "class_structure=stratified/corporate",
      "stratified_societies_use_luxury_vehicles_for_elite_transport",
      "vh_civilian_wwii",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_transport",
      "period"
    ]
  },
  {
    "id": "vh_civilian_wwii",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_transport"
      ],
      [
        "period",
        "regex",
        "1940s|wwii|interwar"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "vintage_car",
    "confidence": 0.78,
    "priority": 85,
    "reasoning": [
      "registry_rule: vh_civilian_wwii",
      "transport_function=civilian_transport",
      "period=1940s",
      "wwii_civilians_use_vintage_cars",
      "vh_civilian_future",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_transport",
      "period"
    ]
  },
  {
    "id": "vh_civilian_future",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_transport"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "hover_car",
    "confidence": 0.75,
    "priority": 85,
    "reasoning": [
      "registry_rule: vh_civilian_future",
      "transport_function=civilian_transport",
      "period=future",
      "future_civilians_use_hover_cars",
      "vh_civilian_fantasy",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_transport",
      "period"
    ]
  },
  {
    "id": "vh_civilian_fantasy",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_transport"
      ],
      [
        "period",
        "in",
        "fantasy_medieval,medieval,ancient"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "riding_horse",
    "confidence": 0.78,
    "priority": 80,
    "reasoning": [
      "registry_rule: vh_civilian_fantasy",
      "transport_function=civilian_transport",
      "period=fantasy_medieval",
      "fantasy_civilians_ride_horses_for_transport",
      "vh_civilian_fantasy_wagon",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_transport",
      "period"
    ]
  },
  {
    "id": "vh_civilian_fantasy_wagon",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_transport"
      ],
      [
        "period",
        "in",
        "fantasy_medieval,medieval,ancient"
      ],
      [
        "economy",
        "in",
        "agrarian,feudal"
      ]
    ],
    "output_field": "heavy_vehicle",
    "output_value": "wagon",
    "confidence": 0.75,
    "priority": 75,
    "reasoning": [
      "registry_rule: vh_civilian_fantasy_wagon",
      "transport_function=civilian_transport",
      "period=fantasy_medieval",
      "economy=agrarian/feudal",
      "feudal_civilians_use_wagons_for_heavy_transport",
      "vh_civilian_prehistoric",
      "vehicle",
      "period",
      "regex",
      "prehistoric|primitive|stone_age"
    ]
  },
  {
    "id": "vh_civilian_prehistoric",
    "domain": "vehicle",
    "triggers": [
      [
        "period",
        "regex",
        "prehistoric|primitive|stone_age"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "primitive_travois",
    "confidence": 0.7,
    "priority": 75,
    "reasoning": [
      "registry_rule: vh_civilian_prehistoric",
      "period=prehistoric",
      "prehistoric_humans_use_primitive_travois_for_transport",
      "vh_utility_modern",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_utility",
      "period",
      "regex"
    ]
  },
  {
    "id": "vh_utility_modern",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_utility"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "utility_pickup",
    "confidence": 0.82,
    "priority": 85,
    "reasoning": [
      "registry_rule: vh_utility_modern",
      "transport_function=civilian_utility",
      "period=modern",
      "modern_workers_and_farmers_use_utility_pickups",
      "vh_utility_modern_van",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_utility",
      "period"
    ]
  },
  {
    "id": "vh_utility_modern_van",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_utility"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ],
      [
        "profession",
        "in",
        "construction,worker,mechanic"
      ]
    ],
    "output_field": "heavy_vehicle",
    "output_value": "work_van",
    "confidence": 0.78,
    "priority": 80,
    "reasoning": [
      "registry_rule: vh_utility_modern_van",
      "transport_function=civilian_utility",
      "period=modern",
      "profession=construction/worker",
      "construction_workers_use_work_vans",
      "vh_utility_modern_agri",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_utility"
    ]
  },
  {
    "id": "vh_utility_modern_agri",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_utility"
      ],
      [
        "profession",
        "in",
        "farmer,rancher"
      ]
    ],
    "output_field": "heavy_vehicle",
    "output_value": "farm_tractor",
    "confidence": 0.8,
    "priority": 85,
    "reasoning": [
      "registry_rule: vh_utility_modern_agri",
      "transport_function=civilian_utility",
      "profession=farmer/rancher",
      "farmers_use_tractors",
      "vh_utility_wwii",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_utility",
      "period"
    ]
  },
  {
    "id": "vh_utility_wwii",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_utility"
      ],
      [
        "period",
        "regex",
        "1940s|wwii|interwar"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "vintage_pickup_truck",
    "confidence": 0.75,
    "priority": 80,
    "reasoning": [
      "registry_rule: vh_utility_wwii",
      "transport_function=civilian_utility",
      "period=1940s",
      "wwii_workers_use_vintage_pickup_trucks",
      "vh_utility_future",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_utility",
      "period"
    ]
  },
  {
    "id": "vh_utility_future",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_utility"
      ],
      [
        "period",
        "regex",
        "future|2087|distant"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "utility_hovercraft",
    "confidence": 0.75,
    "priority": 80,
    "reasoning": [
      "registry_rule: vh_utility_future",
      "transport_function=civilian_utility",
      "period=future",
      "future_workers_use_utility_hovercrafts",
      "vh_utility_fantasy",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_utility",
      "period"
    ]
  },
  {
    "id": "vh_utility_fantasy",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_utility"
      ],
      [
        "period",
        "in",
        "fantasy_medieval,medieval,ancient"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "pack_mule",
    "confidence": 0.72,
    "priority": 75,
    "reasoning": [
      "registry_rule: vh_utility_fantasy",
      "transport_function=civilian_utility",
      "period=fantasy_medieval/ancient",
      "fantasy_workers_use_pack_mules",
      "vh_arctic_vehicle",
      "vehicle",
      "geography",
      "in",
      "arctic,tundra,snow",
      "period"
    ]
  },
  {
    "id": "vh_arctic_vehicle",
    "domain": "vehicle",
    "triggers": [
      [
        "geography",
        "in",
        "arctic,tundra,snow"
      ],
      [
        "period",
        "regex",
        "contemporary|modern|2000|2020"
      ]
    ],
    "output_field": "specialized_vehicle",
    "output_value": "snow_mobile",
    "confidence": 0.78,
    "priority": 80,
    "reasoning": [
      "registry_rule: vh_arctic_vehicle",
      "geography=arctic/tundra",
      "period=modern",
      "arctic_regions_require_snow_mobiles",
      "vh_mountain_vehicle",
      "vehicle",
      "geography",
      "in",
      "mountainous,alpine",
      "technology_level"
    ]
  },
  {
    "id": "vh_mountain_vehicle",
    "domain": "vehicle",
    "triggers": [
      [
        "geography",
        "in",
        "mountainous,alpine"
      ],
      [
        "technology_level",
        "in",
        "contemporary,modern,advanced"
      ]
    ],
    "output_field": "specialized_vehicle",
    "output_value": "all_terrain_vehicle",
    "confidence": 0.8,
    "priority": 80,
    "reasoning": [
      "registry_rule: vh_mountain_vehicle",
      "geography=mountainous",
      "technology_level=modern",
      "mountainous_terrain_requires_ATVs",
      "vh_coastal_vehicle",
      "vehicle",
      "geography",
      "in",
      "coastal,island,maritime",
      "fishing_boat"
    ]
  },
  {
    "id": "vh_coastal_vehicle",
    "domain": "vehicle",
    "triggers": [
      [
        "geography",
        "in",
        "coastal,island,maritime"
      ]
    ],
    "output_field": "specialized_vehicle",
    "output_value": "fishing_boat",
    "confidence": 0.7,
    "priority": 70,
    "reasoning": [
      "registry_rule: vh_coastal_vehicle",
      "geography=coastal/maritime",
      "coastal_regions_use_boats_for_transport",
      "vh_catchall_civilian",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_transport",
      "primary_vehicle",
      "civilian_vehicle"
    ]
  },
  {
    "id": "vh_catchall_civilian",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_transport"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "civilian_vehicle",
    "confidence": 0.3,
    "priority": 0,
    "reasoning": [
      "registry_rule: vh_catchall_civilian",
      "low_confidence_placeholder",
      "insufficient_context_for_specific_vehicle_inference",
      "vh_catchall_military",
      "vehicle",
      "transport_function",
      "eq",
      "military",
      "military_vehicle",
      "registry_rule: vh_catchall_military"
    ]
  },
  {
    "id": "vh_catchall_military",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "military"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "military_vehicle",
    "confidence": 0.3,
    "priority": 0,
    "reasoning": [
      "registry_rule: vh_catchall_military",
      "low_confidence_placeholder",
      "insufficient_context_for_specific_military_vehicle_inference",
      "vh_catchall_commercial",
      "vehicle",
      "transport_function",
      "eq",
      "commercial",
      "commercial_vehicle",
      "registry_rule: vh_catchall_commercial"
    ]
  },
  {
    "id": "vh_catchall_commercial",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "commercial"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "commercial_vehicle",
    "confidence": 0.3,
    "priority": 0,
    "reasoning": [
      "registry_rule: vh_catchall_commercial",
      "low_confidence_placeholder",
      "insufficient_context_for_specific_commercial_vehicle_inference",
      "vh_catchall_emergency",
      "vehicle",
      "transport_function",
      "eq",
      "emergency_services",
      "emergency_vehicle",
      "registry_rule: vh_catchall_emergency"
    ]
  },
  {
    "id": "vh_catchall_emergency",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "emergency_services"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "emergency_vehicle",
    "confidence": 0.3,
    "priority": 0,
    "reasoning": [
      "registry_rule: vh_catchall_emergency",
      "low_confidence_placeholder",
      "insufficient_context_for_specific_emergency_vehicle_inference",
      "vh_catchall_utility",
      "vehicle",
      "transport_function",
      "eq",
      "civilian_utility",
      "utility_vehicle",
      "registry_rule: vh_catchall_utility"
    ]
  },
  {
    "id": "vh_catchall_utility",
    "domain": "vehicle",
    "triggers": [
      [
        "transport_function",
        "eq",
        "civilian_utility"
      ]
    ],
    "output_field": "primary_vehicle",
    "output_value": "utility_vehicle",
    "confidence": 0.3,
    "priority": 0,
    "reasoning": [
      "registry_rule: vh_catchall_utility",
      "low_confidence_placeholder",
      "insufficient_context_for_specific_utility_vehicle_inference",
      "cr_fantasy_dragon",
      "creature",
      "genre",
      "in",
      "fantasy,epic,mythic",
      "threat_role",
      "in"
    ]
  }
];

const CREATURE_ANCHORS: RegistryAnchor = [
  {
    "id": "cr_fantasy_dragon",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "fantasy,epic,mythic"
      ],
      [
        "threat_role",
        "in",
        "predator,guardian,antagonist"
      ],
      [
        "period",
        "in",
        "fantasy_medieval,medieval,ancient"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "dragon",
    "confidence": 0.88,
    "priority": 100,
    "reasoning": [
      "registry_rule: cr_fantasy_dragon",
      "genre=fantasy/epic",
      "threat_role=predator/guardian",
      "period=fantasy_medieval",
      "fantasy_settings_with_dangerous_creatures_feature_dragons",
      "cr_fantasy_griffin",
      "creature",
      "genre",
      "in",
      "fantasy,epic"
    ]
  },
  {
    "id": "cr_fantasy_griffin",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "fantasy,epic"
      ],
      [
        "period",
        "in",
        "fantasy_medieval,ancient"
      ],
      [
        "biome",
        "in",
        "mountain,forest"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "griffin",
    "confidence": 0.75,
    "priority": 85,
    "reasoning": [
      "registry_rule: cr_fantasy_griffin",
      "genre=fantasy/epic",
      "period=fantasy_medieval",
      "biome=mountain/forest",
      "fantasy_settings_in_mountainous_areas_feature_griffins",
      "cr_fantasy_beast",
      "creature",
      "genre",
      "in",
      "fantasy,epic,mythic"
    ]
  },
  {
    "id": "cr_fantasy_beast",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "fantasy,epic,mythic"
      ],
      [
        "threat_role",
        "in",
        "predator,guardian"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "beast_archetype",
    "confidence": 0.7,
    "priority": 80,
    "reasoning": [
      "registry_rule: cr_fantasy_beast",
      "genre=fantasy",
      "threat_role=predator",
      "fantasy_settings_feature_mythical_beasts",
      "cr_fantasy_guardian",
      "creature",
      "genre",
      "in",
      "fantasy,epic",
      "narrative_function"
    ]
  },
  {
    "id": "cr_fantasy_guardian",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "fantasy,epic"
      ],
      [
        "narrative_function",
        "in",
        "guardian,ally,companion"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "sacred_guardian",
    "confidence": 0.78,
    "priority": 85,
    "reasoning": [
      "registry_rule: cr_fantasy_guardian",
      "genre=fantasy",
      "narrative_function=guardian",
      "fantasy_settings_with_guardian_roles_feature_sacred_beasts",
      "cr_fantasy_horse",
      "creature",
      "genre",
      "in",
      "fantasy,historical",
      "narrative_function"
    ]
  },
  {
    "id": "cr_fantasy_horse",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "fantasy,historical"
      ],
      [
        "narrative_function",
        "in",
        "transport,companion"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "warhorse",
    "confidence": 0.85,
    "priority": 90,
    "reasoning": [
      "registry_rule: cr_fantasy_horse",
      "genre=fantasy/historical",
      "narrative_function=transport",
      "fantasy_transport_animals_are_warhorses",
      "cr_fantasy_ambient",
      "creature",
      "genre",
      "in",
      "fantasy,epic",
      "narrative_function"
    ]
  },
  {
    "id": "cr_fantasy_ambient",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "fantasy,epic"
      ],
      [
        "narrative_function",
        "eq",
        "ambient"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "ambient_wildlife",
    "confidence": 0.65,
    "priority": 60,
    "reasoning": [
      "registry_rule: cr_fantasy_ambient",
      "genre=fantasy",
      "narrative_function=ambient",
      "fantasy_ambient_wildlife",
      "cr_fantasy_small",
      "creature",
      "genre",
      "in",
      "fantasy,epic",
      "intelligence"
    ]
  },
  {
    "id": "cr_fantasy_small",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "fantasy,epic"
      ],
      [
        "intelligence",
        "in",
        "instinctual,animal"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "small_fantasy_creature",
    "confidence": 0.55,
    "priority": 50,
    "reasoning": [
      "registry_rule: cr_fantasy_small",
      "genre=fantasy",
      "intelligence=instinctual",
      "fantasy_settings_have_small_mythical_creatures",
      "cr_horror_stalker",
      "creature",
      "genre",
      "in",
      "horror,thriller,suspense",
      "threat_role"
    ]
  },
  {
    "id": "cr_horror_stalker",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "horror,thriller,suspense"
      ],
      [
        "threat_role",
        "in",
        "predator,antagonist"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "stalking_predator",
    "confidence": 0.82,
    "priority": 100,
    "reasoning": [
      "registry_rule: cr_horror_stalker",
      "genre=horror",
      "threat_role=predator",
      "horror_settings_feature_stalking_predators",
      "cr_horror_parasite",
      "creature",
      "genre",
      "in",
      "horror,body_horror",
      "ecology"
    ]
  },
  {
    "id": "cr_horror_parasite",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "horror,body_horror"
      ],
      [
        "ecology",
        "in",
        "engineered,parasitic,supernatural"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "parasitic_presence",
    "confidence": 0.75,
    "priority": 90,
    "reasoning": [
      "registry_rule: cr_horror_parasite",
      "genre=body_horror",
      "ecology=parasitic",
      "body_horror_settings_feature_parasitic_presences",
      "cr_horror_unknown",
      "creature",
      "genre",
      "in",
      "horror,thriller,suspense",
      "unknown_threat"
    ]
  },
  {
    "id": "cr_horror_unknown",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "horror,thriller,suspense"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "unknown_threat",
    "confidence": 0.65,
    "priority": 60,
    "reasoning": [
      "registry_rule: cr_horror_unknown",
      "genre=horror",
      "horror_settings_feature_unknown_threats",
      "cr_scifi_alien",
      "creature",
      "genre",
      "in",
      "sci_fi,cyberpunk,space_opera",
      "ecology",
      "in"
    ]
  },
  {
    "id": "cr_scifi_alien",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "sci_fi,cyberpunk,space_opera"
      ],
      [
        "ecology",
        "in",
        "alien,engineered"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "alien_organism",
    "confidence": 0.85,
    "priority": 100,
    "reasoning": [
      "registry_rule: cr_scifi_alien",
      "genre=sci_fi/cyberpunk",
      "ecology=alien",
      "sci_fi_settings_feature_alien_organisms",
      "cr_scifi_engineered",
      "creature",
      "genre",
      "in",
      "sci_fi,cyberpunk,biopunk",
      "threat_role"
    ]
  },
  {
    "id": "cr_scifi_engineered",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "sci_fi,cyberpunk,biopunk"
      ],
      [
        "threat_role",
        "in",
        "bioweapon,experiment"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "engineered_organism",
    "confidence": 0.8,
    "priority": 95,
    "reasoning": [
      "registry_rule: cr_scifi_engineered",
      "genre=sci_fi/biopunk",
      "threat_role=bioweapon",
      "sci_fi_with_bioweapon_threats_feature_engineered_organisms",
      "cr_scifi_robot",
      "creature",
      "genre",
      "in",
      "sci_fi,cyberpunk",
      "technology_level"
    ]
  },
  {
    "id": "cr_scifi_robot",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "sci_fi,cyberpunk"
      ],
      [
        "technology_level",
        "in",
        "sci_fi_advanced,post_human"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "autonomous_drone",
    "confidence": 0.72,
    "priority": 85,
    "reasoning": [
      "registry_rule: cr_scifi_robot",
      "genre=sci_fi",
      "technology_level=sci_fi_advanced",
      "advanced_sci_fi_settings_feature_autonomous_drones",
      "cr_scifi_ambient",
      "creature",
      "genre",
      "in",
      "sci_fi,space_opera",
      "narrative_function"
    ]
  },
  {
    "id": "cr_scifi_ambient",
    "domain": "creature",
    "triggers": [
      [
        "genre",
        "in",
        "sci_fi,space_opera"
      ],
      [
        "narrative_function",
        "eq",
        "ambient"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "alien_ecology",
    "confidence": 0.6,
    "priority": 60,
    "reasoning": [
      "registry_rule: cr_scifi_ambient",
      "genre=sci_fi",
      "narrative_function=ambient",
      "sci_fi_ambient_wildlife",
      "cr_myth_sacred",
      "creature",
      "mythology",
      "not_eq",
      "none",
      "symbolism"
    ]
  },
  {
    "id": "cr_myth_sacred",
    "domain": "creature",
    "triggers": [
      [
        "mythology",
        "not_eq",
        "none"
      ],
      [
        "symbolism",
        "in",
        "power,wisdom,guardianship"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "symbolic_guardian",
    "confidence": 0.82,
    "priority": 95,
    "reasoning": [
      "registry_rule: cr_myth_sacred",
      "mythology=present",
      "symbolism=power/wisdom",
      "mythological_settings_feature_symbolic_guardians",
      "cr_myth_serpent",
      "creature",
      "mythology",
      "in",
      "norse,greek,mesoamerican",
      "symbolism"
    ]
  },
  {
    "id": "cr_myth_serpent",
    "domain": "creature",
    "triggers": [
      [
        "mythology",
        "in",
        "norse,greek,mesoamerican"
      ],
      [
        "symbolism",
        "in",
        "chaos,destruction,rebirth"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "mythic_serpent",
    "confidence": 0.78,
    "priority": 90,
    "reasoning": [
      "registry_rule: cr_myth_serpent",
      "mythology=norse/greek",
      "symbolism=chaos/destruction",
      "norse_and_greek_mythology_feature_mythic_serpents",
      "cr_wwii_war_animal",
      "creature",
      "period",
      "regex",
      "1940s|wwii",
      "narrative_function"
    ]
  },
  {
    "id": "cr_wwii_war_animal",
    "domain": "creature",
    "triggers": [
      [
        "period",
        "regex",
        "1940s|wwii"
      ],
      [
        "narrative_function",
        "in",
        "transport,companion,ambient"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "war_animal",
    "confidence": 0.7,
    "priority": 80,
    "reasoning": [
      "registry_rule: cr_wwii_war_animal",
      "period=wwii",
      "narrative_function=transport",
      "wwii_settings_feature_war_animals_mules_horses_dogs",
      "cr_wwii_military_dog",
      "creature",
      "period",
      "regex",
      "1940s|wwii",
      "threat_role"
    ]
  },
  {
    "id": "cr_wwii_military_dog",
    "domain": "creature",
    "triggers": [
      [
        "period",
        "regex",
        "1940s|wwii"
      ],
      [
        "threat_role",
        "in",
        "guardian,combat"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "military_dog",
    "confidence": 0.72,
    "priority": 85,
    "reasoning": [
      "registry_rule: cr_wwii_military_dog",
      "period=wwii",
      "threat_role=guardian",
      "wwii_combat_zones_use_military_dogs",
      "cr_prehistoric_mega",
      "creature",
      "period",
      "regex",
      "prehistoric|primitive|stone_age",
      "threat_role"
    ]
  },
  {
    "id": "cr_prehistoric_mega",
    "domain": "creature",
    "triggers": [
      [
        "period",
        "regex",
        "prehistoric|primitive|stone_age"
      ],
      [
        "threat_role",
        "in",
        "predator,antagonist"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "prehistoric_predator",
    "confidence": 0.78,
    "priority": 90,
    "reasoning": [
      "registry_rule: cr_prehistoric_mega",
      "period=prehistoric",
      "threat_role=predator",
      "prehistoric_settings_feature_large_predators",
      "cr_prehistoric_prey",
      "creature",
      "period",
      "regex",
      "prehistoric|primitive|stone_age",
      "prehistoric_herbivore"
    ]
  },
  {
    "id": "cr_prehistoric_prey",
    "domain": "creature",
    "triggers": [
      [
        "period",
        "regex",
        "prehistoric|primitive|stone_age"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "prehistoric_herbivore",
    "confidence": 0.65,
    "priority": 60,
    "reasoning": [
      "registry_rule: cr_prehistoric_prey",
      "period=prehistoric",
      "prehistoric_settings_have_herbivores",
      "cr_biome_desert",
      "creature",
      "biome",
      "in",
      "desert,arid",
      "intelligence",
      "in"
    ]
  },
  {
    "id": "cr_biome_desert",
    "domain": "creature",
    "triggers": [
      [
        "biome",
        "in",
        "desert,arid"
      ],
      [
        "intelligence",
        "in",
        "instinctual,animal"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "desert_creature",
    "confidence": 0.6,
    "priority": 60,
    "reasoning": [
      "registry_rule: cr_biome_desert",
      "biome=desert",
      "desert_biomes_have_specialized_creatures",
      "cr_biome_forest",
      "creature",
      "biome",
      "in",
      "forest,jungle,woods",
      "forest_creature",
      "registry_rule: cr_biome_forest"
    ]
  },
  {
    "id": "cr_biome_forest",
    "domain": "creature",
    "triggers": [
      [
        "biome",
        "in",
        "forest,jungle,woods"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "forest_creature",
    "confidence": 0.55,
    "priority": 50,
    "reasoning": [
      "registry_rule: cr_biome_forest",
      "biome=forest",
      "forest_biomes_have_diverse_wildlife",
      "cr_biome_ocean",
      "creature",
      "biome",
      "in",
      "ocean,sea,deep_sea,coastal",
      "marine_creature",
      "registry_rule: cr_biome_ocean"
    ]
  },
  {
    "id": "cr_biome_ocean",
    "domain": "creature",
    "triggers": [
      [
        "biome",
        "in",
        "ocean,sea,deep_sea,coastal"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "marine_creature",
    "confidence": 0.65,
    "priority": 60,
    "reasoning": [
      "registry_rule: cr_biome_ocean",
      "biome=ocean",
      "oceanic_biomes_have_marine_life",
      "cr_biome_urban",
      "creature",
      "biome",
      "in",
      "urban,city,metropolitan",
      "intelligence",
      "in"
    ]
  },
  {
    "id": "cr_biome_urban",
    "domain": "creature",
    "triggers": [
      [
        "biome",
        "in",
        "urban,city,metropolitan"
      ],
      [
        "intelligence",
        "in",
        "instinctual,animal"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "urban_animal",
    "confidence": 0.55,
    "priority": 50,
    "reasoning": [
      "registry_rule: cr_biome_urban",
      "biome=urban",
      "urban_environments_have_city_adapted_animals",
      "cr_biome_underground",
      "creature",
      "biome",
      "in",
      "underground,subterranean,cave",
      "subterranean_creature",
      "registry_rule: cr_biome_underground"
    ]
  },
  {
    "id": "cr_biome_underground",
    "domain": "creature",
    "triggers": [
      [
        "biome",
        "in",
        "underground,subterranean,cave"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "subterranean_creature",
    "confidence": 0.62,
    "priority": 60,
    "reasoning": [
      "registry_rule: cr_biome_underground",
      "biome=underground",
      "subterranean_environments_have_dark_adapted_creatures",
      "cr_role_predator",
      "creature",
      "threat_role",
      "in",
      "predator,bioweapon",
      "predator_archetype",
      "registry_rule: cr_role_predator"
    ]
  },
  {
    "id": "cr_role_predator",
    "domain": "creature",
    "triggers": [
      [
        "threat_role",
        "in",
        "predator,bioweapon"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "predator_archetype",
    "confidence": 0.5,
    "priority": 40,
    "reasoning": [
      "registry_rule: cr_role_predator",
      "threat_role=predator",
      "predators_appear_across_settings",
      "cr_role_transport",
      "creature",
      "narrative_function",
      "eq",
      "transport",
      "transport_animal",
      "registry_rule: cr_role_transport"
    ]
  },
  {
    "id": "cr_role_transport",
    "domain": "creature",
    "triggers": [
      [
        "narrative_function",
        "eq",
        "transport"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "transport_animal",
    "confidence": 0.6,
    "priority": 50,
    "reasoning": [
      "registry_rule: cr_role_transport",
      "narrative_function=transport",
      "transport_animals_appear_across_settings",
      "cr_role_companion",
      "creature",
      "narrative_function",
      "eq",
      "companion",
      "companion_animal",
      "registry_rule: cr_role_companion"
    ]
  },
  {
    "id": "cr_role_companion",
    "domain": "creature",
    "triggers": [
      [
        "narrative_function",
        "eq",
        "companion"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "companion_animal",
    "confidence": 0.65,
    "priority": 55,
    "reasoning": [
      "registry_rule: cr_role_companion",
      "narrative_function=companion",
      "companion_animals_appear_across_settings",
      "cr_role_ambient",
      "creature",
      "narrative_function",
      "eq",
      "ambient",
      "background_wildlife",
      "registry_rule: cr_role_ambient"
    ]
  },
  {
    "id": "cr_role_ambient",
    "domain": "creature",
    "triggers": [
      [
        "narrative_function",
        "eq",
        "ambient"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "background_wildlife",
    "confidence": 0.45,
    "priority": 30,
    "reasoning": [
      "registry_rule: cr_role_ambient",
      "narrative_function=ambient",
      "ambient_background_wildlife",
      "cr_catchall_working",
      "creature",
      "narrative_function",
      "in",
      "transport,companion",
      "working_animal",
      "registry_rule: cr_catchall_working"
    ]
  },
  {
    "id": "cr_catchall_working",
    "domain": "creature",
    "triggers": [
      [
        "narrative_function",
        "in",
        "transport,companion"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "working_animal",
    "confidence": 0.3,
    "priority": 0,
    "reasoning": [
      "registry_rule: cr_catchall_working",
      "low_confidence_placeholder",
      "insufficient_context_for_specific_working_animal_inference",
      "cr_catchall_small",
      "creature",
      "intelligence",
      "in",
      "animal,instinctual",
      "small_animal",
      "registry_rule: cr_catchall_small"
    ]
  },
  {
    "id": "cr_catchall_small",
    "domain": "creature",
    "triggers": [
      [
        "intelligence",
        "in",
        "animal,instinctual"
      ]
    ],
    "output_field": "creature_type",
    "output_value": "small_animal",
    "confidence": 0.3,
    "priority": 0,
    "reasoning": [
      "registry_rule: cr_catchall_small",
      "low_confidence_placeholder",
      "insufficient_context_for_specific_small_animal_inference",
      "cr_catchall_unknown",
      "creature",
      "threat_role",
      "any",
      "]],    ",
      ", ",
      ", 0.30, 0,    "
    ]
  },
  {
    "id": "cr_catchall_unknown",
    "domain": "creature",
    "triggers": [
      [
        "threat_role",
        "any",
        ""
      ]
    ],
    "output_field": "creature_type",
    "output_value": "unknown_creature_presence",
    "confidence": 0.3,
    "priority": 0,
    "reasoning": [
      "registry_rule: cr_catchall_unknown",
      "low_confidence_placeholder",
      "insufficient_context_for_creature_type_inference",
      "wardrobe",
      "profession_map",
      "genre",
      "climate",
      "period"
    ]
  }
];

// ── ICS Field Counts ────────────────────────────────────────────────


// ── VL Anchors (Visual Language domain) ──────────────────────────────

const VL_ANCHORS: RegistryAnchor = [
  // Contrast
  {"id":"vl_noir_contrast","domain":"vl","triggers":[["genre","in","noir,crime,mystery"]],"output_field":"contrast_model","output_value":"high_contrast_noir","confidence":0.88,"priority":100,"reasoning":["registry_rule: vl_noir_contrast"]},
  {"id":"vl_fantasy_contrast","domain":"vl","triggers":[["genre","in","fantasy,epic,mythic"]],"output_field":"contrast_model","output_value":"soft_contrast_fantasy","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_fantasy_contrast"]},
  {"id":"vl_scifi_contrast","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk,space_opera"]],"output_field":"contrast_model","output_value":"clean_crisp_contrast","confidence":0.85,"priority":100,"reasoning":["registry_rule: vl_scifi_contrast"]},
  {"id":"vl_horror_contrast","domain":"vl","triggers":[["genre","in","horror,thriller,suspense"]],"output_field":"contrast_model","output_value":"harsh_deep_contrast","confidence":0.86,"priority":100,"reasoning":["registry_rule: vl_horror_contrast"]},
  {"id":"vl_drama_contrast","domain":"vl","triggers":[["genre","in","drama,romance,contemporary"]],"output_field":"contrast_model","output_value":"naturalistic_contrast","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_drama_contrast"]},
  {"id":"vl_comedy_contrast","domain":"vl","triggers":[["genre","in","comedy,light"]],"output_field":"contrast_model","output_value":"flat_even_contrast","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_comedy_contrast"]},
  // Colour
  {"id":"vl_noir_colour","domain":"vl","triggers":[["genre","in","noir,crime"]],"output_field":"colour_philosophy","output_value":"warm_amber_with_teal_shadows","confidence":0.88,"priority":100,"reasoning":["registry_rule: vl_noir_colour"]},
  {"id":"vl_fantasy_colour","domain":"vl","triggers":[["genre","in","fantasy,epic,mythic"]],"output_field":"colour_philosophy","output_value":"rich_saturated_nature_tones","confidence":0.84,"priority":100,"reasoning":["registry_rule: vl_fantasy_colour"]},
  {"id":"vl_scifi_colour","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk,space_opera"]],"output_field":"colour_philosophy","output_value":"cool_blue_teal_neon_accent","confidence":0.86,"priority":100,"reasoning":["registry_rule: vl_scifi_colour"]},
  {"id":"vl_horror_colour","domain":"vl","triggers":[["genre","in","horror,thriller,suspense"]],"output_field":"colour_philosophy","output_value":"desaturated_muddy_with_blood_accents","confidence":0.85,"priority":100,"reasoning":["registry_rule: vl_horror_colour"]},
  {"id":"vl_drama_colour","domain":"vl","triggers":[["genre","in","drama,romance,contemporary"]],"output_field":"colour_philosophy","output_value":"natural_muted_earthy","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_drama_colour"]},
  {"id":"vl_comedy_colour","domain":"vl","triggers":[["genre","in","comedy,light"]],"output_field":"colour_philosophy","output_value":"bright_warm_primary","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_comedy_colour"]},
  // Saturation
  {"id":"vl_noir_sat","domain":"vl","triggers":[["genre","in","noir,crime"]],"output_field":"saturation_profile","output_value":"muted_warm","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_noir_sat"]},
  {"id":"vl_fantasy_sat","domain":"vl","triggers":[["genre","in","fantasy,epic,mythic"]],"output_field":"saturation_profile","output_value":"vibrant_enriched","confidence":0.84,"priority":100,"reasoning":["registry_rule: vl_fantasy_sat"]},
  {"id":"vl_scifi_sat","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk"]],"output_field":"saturation_profile","output_value":"cool_desaturated_base","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_scifi_sat"]},
  {"id":"vl_horror_sat","domain":"vl","triggers":[["genre","in","horror"]],"output_field":"saturation_profile","output_value":"desaturated_pale","confidence":0.83,"priority":100,"reasoning":["registry_rule: vl_horror_sat"]},
  {"id":"vl_drama_sat","domain":"vl","triggers":[["genre","in","drama,romance"]],"output_field":"saturation_profile","output_value":"natural_muted","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_drama_sat"]},
  {"id":"vl_comedy_sat","domain":"vl","triggers":[["genre","in","comedy,light"]],"output_field":"saturation_profile","output_value":"vibrant_saturated","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_comedy_sat"]},
  // Palette bias
  {"id":"vl_palette_warm","domain":"vl","triggers":[["genre","in","noir,drama,romance,comedy"]],"output_field":"palette_bias","output_value":"warm_leaning","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_palette_warm"]},
  {"id":"vl_palette_cool","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk,horror"]],"output_field":"palette_bias","output_value":"cool_leaning","confidence":0.84,"priority":100,"reasoning":["registry_rule: vl_palette_cool"]},
  {"id":"vl_palette_neutral","domain":"vl","triggers":[["genre","in","crime,thriller,contemporary"]],"output_field":"palette_bias","output_value":"neutral_leaning","confidence":0.72,"priority":100,"reasoning":["registry_rule: vl_palette_neutral"]},
  {"id":"vl_palette_nature","domain":"vl","triggers":[["genre","in","fantasy,epic,historical"]],"output_field":"palette_bias","output_value":"earth_nature_leaning","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_palette_nature"]},
  // Lighting
  {"id":"vl_noir_light_contemp","domain":"vl","triggers":[["genre","in","noir,crime"],["period","regex","contemporary|modern|2020"]],"output_field":"lighting_philosophy","output_value":"low_key_practical_motivated","confidence":0.88,"priority":100,"reasoning":["registry_rule: vl_noir_light_contemp"]},
  {"id":"vl_noir_light_1940s","domain":"vl","triggers":[["genre","in","noir,crime"],["period","regex","1940s|1950s|interwar"]],"output_field":"lighting_philosophy","output_value":"chiaroscuro_venetian_blind","confidence":0.90,"priority":100,"reasoning":["registry_rule: vl_noir_light_1940s"]},
  {"id":"vl_fantasy_light","domain":"vl","triggers":[["genre","in","fantasy,epic"]],"output_field":"lighting_philosophy","output_value":"candle_firelight_ambient","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_fantasy_light"]},
  {"id":"vl_scifi_light","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk,space_opera"]],"output_field":"lighting_philosophy","output_value":"neon_and_ambient_glow","confidence":0.85,"priority":100,"reasoning":["registry_rule: vl_scifi_light"]},
  {"id":"vl_horror_light","domain":"vl","triggers":[["genre","in","horror"]],"output_field":"lighting_philosophy","output_value":"single_source_ominous","confidence":0.86,"priority":100,"reasoning":["registry_rule: vl_horror_light"]},
  {"id":"vl_drama_light","domain":"vl","triggers":[["genre","in","drama,romance,contemporary"]],"output_field":"lighting_philosophy","output_value":"soft_naturalistic","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_drama_light"]},
  {"id":"vl_historical_light","domain":"vl","triggers":[["genre","in","historical,period"]],"output_field":"lighting_philosophy","output_value":"period_accurate_lighting","confidence":0.84,"priority":100,"reasoning":["registry_rule: vl_historical_light"]},
  {"id":"vl_comedy_light","domain":"vl","triggers":[["genre","in","comedy,light,animation"]],"output_field":"lighting_philosophy","output_value":"high_key_even_lighting","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_comedy_light"]},
  // Shadow
  {"id":"vl_noir_shadow","domain":"vl","triggers":[["genre","in","noir,crime,mystery"]],"output_field":"shadow_philosophy","output_value":"deep_crushing_blocked_shadows","confidence":0.86,"priority":100,"reasoning":["registry_rule: vl_noir_shadow"]},
  {"id":"vl_fantasy_shadow","domain":"vl","triggers":[["genre","in","fantasy,epic,mythic"]],"output_field":"shadow_philosophy","output_value":"soft_magical_ambient_shadow","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_fantasy_shadow"]},
  {"id":"vl_scifi_shadow","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk,space_opera"]],"output_field":"shadow_philosophy","output_value":"hard_defined_neon_shadow","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_scifi_shadow"]},
  {"id":"vl_horror_shadow","domain":"vl","triggers":[["genre","in","horror,thriller"]],"output_field":"shadow_philosophy","output_value":"impenetrable_black_shadow","confidence":0.85,"priority":100,"reasoning":["registry_rule: vl_horror_shadow"]},
  {"id":"vl_drama_shadow","domain":"vl","triggers":[["genre","in","drama,romance,contemporary"]],"output_field":"shadow_philosophy","output_value":"soft_natural_shadow","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_drama_shadow"]},
  {"id":"vl_comedy_shadow","domain":"vl","triggers":[["genre","in","comedy,light"]],"output_field":"shadow_philosophy","output_value":"minimal_even_shadow","confidence":0.72,"priority":100,"reasoning":["registry_rule: vl_comedy_shadow"]},
  // Lens
  {"id":"vl_noir_lens","domain":"vl","triggers":[["genre","in","noir,crime"]],"output_field":"lens_philosophy","output_value":"spherical_mid_wide_anamorphic","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_noir_lens"]},
  {"id":"vl_fantasy_lens","domain":"vl","triggers":[["genre","in","fantasy,epic"]],"output_field":"lens_philosophy","output_value":"spherical_wide_epic","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_fantasy_lens"]},
  {"id":"vl_scifi_lens","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk,space_opera"]],"output_field":"lens_philosophy","output_value":"anamorphic_wide","confidence":0.84,"priority":100,"reasoning":["registry_rule: vl_scifi_lens"]},
  {"id":"vl_horror_lens","domain":"vl","triggers":[["genre","in","horror"]],"output_field":"lens_philosophy","output_value":"spherical_wide_handheld","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_horror_lens"]},
  {"id":"vl_drama_lens","domain":"vl","triggers":[["genre","in","drama,romance,contemporary"]],"output_field":"lens_philosophy","output_value":"spherical_standard_prime","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_drama_lens"]},
  {"id":"vl_period_lens","domain":"vl","triggers":[["genre","in","historical,period"]],"output_field":"lens_philosophy","output_value":"period_vintage_lens","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_period_lens"]},
  // Depth
  {"id":"vl_noir_depth","domain":"vl","triggers":[["genre","in","noir,crime"]],"output_field":"depth_philosophy","output_value":"moderate_deep_focus","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_noir_depth"]},
  {"id":"vl_fantasy_depth","domain":"vl","triggers":[["genre","in","fantasy,epic"]],"output_field":"depth_philosophy","output_value":"deep_focus_epic","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_fantasy_depth"]},
  {"id":"vl_scifi_depth","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk"]],"output_field":"depth_philosophy","output_value":"deep_focus_crisp","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_scifi_depth"]},
  {"id":"vl_drama_depth","domain":"vl","triggers":[["genre","in","drama,romance,horror"]],"output_field":"depth_philosophy","output_value":"shallow_depth_portrait","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_drama_depth"]},
  // Focus
  {"id":"vl_rack_focus","domain":"vl","triggers":[["genre","in","noir,crime,thriller"]],"output_field":"focus_philosophy","output_value":"rack_focus_dominant","confidence":0.72,"priority":100,"reasoning":["registry_rule: vl_rack_focus"]},
  {"id":"vl_deep_focus","domain":"vl","triggers":[["genre","in","fantasy,epic,historical"]],"output_field":"focus_philosophy","output_value":"deep_stop_focus","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_deep_focus"]},
  {"id":"vl_shallow_focus","domain":"vl","triggers":[["genre","in","drama,romance,horror"]],"output_field":"focus_philosophy","output_value":"shallow_soft_focus","confidence":0.74,"priority":100,"reasoning":["registry_rule: vl_shallow_focus"]},
  {"id":"vl_clean_focus","domain":"vl","triggers":[["genre","in","sci_fi,comedy,contemporary"]],"output_field":"focus_philosophy","output_value":"clean_sharp_focus","confidence":0.72,"priority":100,"reasoning":["registry_rule: vl_clean_focus"]},
  // Realism
  {"id":"vl_gritty_realism","domain":"vl","triggers":[["production_language","eq","gritty_realism"]],"output_field":"realism_level","output_value":"highly_realistic_grounded","confidence":0.90,"priority":100,"reasoning":["registry_rule: vl_gritty_realism"]},
  {"id":"vl_heightened_realism","domain":"vl","triggers":[["production_language","eq","heightened_reality"]],"output_field":"realism_level","output_value":"stylized_grounded","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_heightened_realism"]},
  {"id":"vl_magical_realism","domain":"vl","triggers":[["production_language","in","magical_realism"]],"output_field":"realism_level","output_value":"dreamlike_soft_realism","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_magical_realism"]},
  {"id":"vl_minimalist_realism","domain":"vl","triggers":[["production_language","eq","minimalist"]],"output_field":"realism_level","output_value":"clean_abstract_realism","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_minimalist_realism"]},
  {"id":"vl_noir_realism","domain":"vl","triggers":[["genre","in","noir,crime"],["visual_tone","eq","dark"]],"output_field":"realism_level","output_value":"grounded_dark_realism","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_noir_realism"]},
  {"id":"vl_fantasy_realism","domain":"vl","triggers":[["genre","in","fantasy,epic,mythic"]],"output_field":"realism_level","output_value":"heightened_fantasy_realism","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_fantasy_realism"]},
  // Visual scale
  {"id":"vl_scale_epic","domain":"vl","triggers":[["genre","in","fantasy,epic,space_opera,historical"]],"output_field":"visual_scale","output_value":"epic_wide_scale","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_scale_epic"]},
  {"id":"vl_scale_intimate","domain":"vl","triggers":[["genre","in","drama,romance,horror"]],"output_field":"visual_scale","output_value":"intimate_close_scale","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_scale_intimate"]},
  {"id":"vl_scale_moderate","domain":"vl","triggers":[["genre","in","noir,crime,contemporary"]],"output_field":"visual_scale","output_value":"moderate_balanced_scale","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_scale_moderate"]},
  {"id":"vl_scale_claustro","domain":"vl","triggers":[["genre","in","horror,suspense,thriller"]],"output_field":"visual_scale","output_value":"claustrophobic_tight_scale","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_scale_claustro"]},
  // Atmosphere
  {"id":"vl_noir_atm","domain":"vl","triggers":[["genre","in","noir,crime"]],"output_field":"atmosphere_philosophy","output_value":"haze_smoke_present_light","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_noir_atm"]},
  {"id":"vl_fantasy_atm","domain":"vl","triggers":[["genre","in","fantasy,epic,mythic"]],"output_field":"atmosphere_philosophy","output_value":"mist_fog_present_moderate","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_fantasy_atm"]},
  {"id":"vl_horror_atm","domain":"vl","triggers":[["genre","in","horror"]],"output_field":"atmosphere_philosophy","output_value":"fog_heavy_oppressive","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_horror_atm"]},
  {"id":"vl_scifi_atm","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk"]],"output_field":"atmosphere_philosophy","output_value":"clean_crisp_or_steam","confidence":0.74,"priority":100,"reasoning":["registry_rule: vl_scifi_atm"]},
  // Texture
  {"id":"vl_noir_tex","domain":"vl","triggers":[["genre","in","noir,crime"]],"output_field":"texture_philosophy","output_value":"organic_grain_moderate","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_noir_tex"]},
  {"id":"vl_fantasy_tex","domain":"vl","triggers":[["genre","in","fantasy,epic"]],"output_field":"texture_philosophy","output_value":"film_stock_soft","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_fantasy_tex"]},
  {"id":"vl_scifi_tex","domain":"vl","triggers":[["genre","in","sci_fi,cyberpunk"]],"output_field":"texture_philosophy","output_value":"clean_digital_crisp","confidence":0.82,"priority":100,"reasoning":["registry_rule: vl_scifi_tex"]},
  {"id":"vl_horror_tex","domain":"vl","triggers":[["genre","in","horror"]],"output_field":"texture_philosophy","output_value":"rough_organic_grain_heavy","confidence":0.78,"priority":100,"reasoning":["registry_rule: vl_horror_tex"]},
  {"id":"vl_drama_tex","domain":"vl","triggers":[["genre","in","drama,romance,contemporary"]],"output_field":"texture_philosophy","output_value":"clean_digital_natural","confidence":0.76,"priority":100,"reasoning":["registry_rule: vl_drama_tex"]},
  {"id":"vl_historical_tex","domain":"vl","triggers":[["genre","in","historical,period"]],"output_field":"texture_philosophy","output_value":"film_stock_vintage_grain","confidence":0.80,"priority":100,"reasoning":["registry_rule: vl_historical_tex"]},
  // Tone overrides (priority 50 — lower than genre's 100)
  {"id":"vl_tone_dark_override","domain":"vl","triggers":[["visual_tone","eq","dark"]],"output_field":"shadow_philosophy","output_value":"deep_ambiguous_shadows","confidence":0.72,"priority":50,"reasoning":["registry_rule: vl_tone_dark_override"]},
  {"id":"vl_tone_bright_override","domain":"vl","triggers":[["visual_tone","eq","bright"]],"output_field":"saturation_profile","output_value":"bright_vibrant_saturated","confidence":0.68,"priority":50,"reasoning":["registry_rule: vl_tone_bright_override"]},
  {"id":"vl_tone_vibrant_override","domain":"vl","triggers":[["visual_tone","eq","vibrant"]],"output_field":"saturation_profile","output_value":"fully_saturated_rich","confidence":0.70,"priority":50,"reasoning":["registry_rule: vl_tone_vibrant_override"]},
  // Style cross-refs (priority 50)
  {"id":"vl_style_anime_ref","domain":"vl","triggers":[["style_influences","in","anime,manga,cel_shaded"]],"output_field":"colour_philosophy","output_value":"vibrant_cel_shaded_palette","confidence":0.72,"priority":50,"reasoning":["registry_rule: vl_style_anime_ref"]},
  {"id":"vl_style_neon_ref","domain":"vl","triggers":[["style_influences","in","neon_noir,cyberpunk_noir"]],"output_field":"lighting_philosophy","output_value":"neon_and_practical_motivated_hybrid","confidence":0.76,"priority":50,"reasoning":["registry_rule: vl_style_neon_ref"]},
  // Catch-alls (priority 0)
  {"id":"vl_catchall_contrast","domain":"vl","triggers":[["genre","any",""]],"output_field":"contrast_model","output_value":"moderate_balanced_contrast","confidence":0.30,"priority":0,"reasoning":["registry_rule: vl_catchall_contrast","low_confidence"]},
  {"id":"vl_catchall_colour","domain":"vl","triggers":[["genre","any",""]],"output_field":"colour_philosophy","output_value":"neutral_balanced_palette","confidence":0.30,"priority":0,"reasoning":["registry_rule: vl_catchall_colour","low_confidence"]},
  {"id":"vl_catchall_lighting","domain":"vl","triggers":[["genre","any",""]],"output_field":"lighting_philosophy","output_value":"standard_three_point","confidence":0.25,"priority":0,"reasoning":["registry_rule: vl_catchall_lighting","low_confidence"]},
];

const LOCATION_ANCHORS: RegistryAnchor = [
  {"id": "lc_pre_industrial_residential_arch", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "residential"]], "output_field": "architecture_style", "output_value": "pre_industrial_residential", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_residential_arch"]},
  {"id": "lc_pre_industrial_residential_era", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "residential"]], "output_field": "construction_era", "output_value": "pre_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_residential_era"]},
  {"id": "lc_pre_industrial_residential_mat", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "residential"]], "output_field": "material_palette", "output_value": "wood_stone_thatch", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_residential_mat"]},
  {"id": "lc_pre_industrial_residential_lgt", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "residential"]], "output_field": "lighting_character", "output_value": "residential_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_residential_lgt"]},
  {"id": "lc_pre_industrial_residential_den", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "residential"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_residential_den"]},
  {"id": "lc_pre_industrial_commercial_arch", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "commercial"]], "output_field": "architecture_style", "output_value": "pre_industrial_commercial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_commercial_arch"]},
  {"id": "lc_pre_industrial_commercial_era", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "commercial"]], "output_field": "construction_era", "output_value": "pre_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_commercial_era"]},
  {"id": "lc_pre_industrial_commercial_mat", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "commercial"]], "output_field": "material_palette", "output_value": "wood_stone_thatch", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_commercial_mat"]},
  {"id": "lc_pre_industrial_commercial_lgt", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "commercial"]], "output_field": "lighting_character", "output_value": "commercial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_commercial_lgt"]},
  {"id": "lc_pre_industrial_commercial_den", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "commercial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_commercial_den"]},
  {"id": "lc_pre_industrial_civic_arch", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "civic"]], "output_field": "architecture_style", "output_value": "pre_industrial_civic", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_civic_arch"]},
  {"id": "lc_pre_industrial_civic_era", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "civic"]], "output_field": "construction_era", "output_value": "pre_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_civic_era"]},
  {"id": "lc_pre_industrial_civic_mat", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "civic"]], "output_field": "material_palette", "output_value": "wood_stone_thatch", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_civic_mat"]},
  {"id": "lc_pre_industrial_civic_lgt", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "civic"]], "output_field": "lighting_character", "output_value": "civic_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_civic_lgt"]},
  {"id": "lc_pre_industrial_civic_den", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "civic"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_civic_den"]},
  {"id": "lc_pre_industrial_military_arch", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "military"]], "output_field": "architecture_style", "output_value": "pre_industrial_military", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_military_arch"]},
  {"id": "lc_pre_industrial_military_era", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "military"]], "output_field": "construction_era", "output_value": "pre_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_military_era"]},
  {"id": "lc_pre_industrial_military_mat", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "military"]], "output_field": "material_palette", "output_value": "wood_stone_thatch", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_military_mat"]},
  {"id": "lc_pre_industrial_military_lgt", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "military"]], "output_field": "lighting_character", "output_value": "military_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_military_lgt"]},
  {"id": "lc_pre_industrial_military_den", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "military"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_military_den"]},
  {"id": "lc_pre_industrial_religious_arch", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "religious"]], "output_field": "architecture_style", "output_value": "pre_industrial_religious", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_religious_arch"]},
  {"id": "lc_pre_industrial_religious_era", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "religious"]], "output_field": "construction_era", "output_value": "pre_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_religious_era"]},
  {"id": "lc_pre_industrial_religious_mat", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "religious"]], "output_field": "material_palette", "output_value": "wood_stone_thatch", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_religious_mat"]},
  {"id": "lc_pre_industrial_religious_lgt", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "religious"]], "output_field": "lighting_character", "output_value": "religious_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_religious_lgt"]},
  {"id": "lc_pre_industrial_religious_den", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "religious"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_religious_den"]},
  {"id": "lc_pre_industrial_industrial_arch", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "industrial"]], "output_field": "architecture_style", "output_value": "pre_industrial_industrial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_industrial_arch"]},
  {"id": "lc_pre_industrial_industrial_era", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "industrial"]], "output_field": "construction_era", "output_value": "pre_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_industrial_era"]},
  {"id": "lc_pre_industrial_industrial_mat", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "industrial"]], "output_field": "material_palette", "output_value": "wood_stone_thatch", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_industrial_mat"]},
  {"id": "lc_pre_industrial_industrial_lgt", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "industrial"]], "output_field": "lighting_character", "output_value": "industrial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_industrial_lgt"]},
  {"id": "lc_pre_industrial_industrial_den", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "industrial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_industrial_den"]},
  {"id": "lc_pre_industrial_transportation_arch", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "transportation"]], "output_field": "architecture_style", "output_value": "pre_industrial_transportation", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_transportation_arch"]},
  {"id": "lc_pre_industrial_transportation_era", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "transportation"]], "output_field": "construction_era", "output_value": "pre_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_transportation_era"]},
  {"id": "lc_pre_industrial_transportation_mat", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "transportation"]], "output_field": "material_palette", "output_value": "wood_stone_thatch", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_transportation_mat"]},
  {"id": "lc_pre_industrial_transportation_lgt", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "transportation"]], "output_field": "lighting_character", "output_value": "transportation_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_transportation_lgt"]},
  {"id": "lc_pre_industrial_transportation_den", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "transportation"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_transportation_den"]},
  {"id": "lc_pre_industrial_hospitality_arch", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "hospitality"]], "output_field": "architecture_style", "output_value": "pre_industrial_hospitality", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_hospitality_arch"]},
  {"id": "lc_pre_industrial_hospitality_era", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "hospitality"]], "output_field": "construction_era", "output_value": "pre_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_hospitality_era"]},
  {"id": "lc_pre_industrial_hospitality_mat", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "hospitality"]], "output_field": "material_palette", "output_value": "wood_stone_thatch", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_hospitality_mat"]},
  {"id": "lc_pre_industrial_hospitality_lgt", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "hospitality"]], "output_field": "lighting_character", "output_value": "hospitality_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_hospitality_lgt"]},
  {"id": "lc_pre_industrial_hospitality_den", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"], ["spatial_function", "eq", "hospitality"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_pre_industrial_hospitality_den"]},
  {"id": "lc_early_industrial_residential_arch", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "residential"]], "output_field": "architecture_style", "output_value": "early_industrial_residential", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_residential_arch"]},
  {"id": "lc_early_industrial_residential_era", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "residential"]], "output_field": "construction_era", "output_value": "early_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_residential_era"]},
  {"id": "lc_early_industrial_residential_mat", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "residential"]], "output_field": "material_palette", "output_value": "brick_stone_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_residential_mat"]},
  {"id": "lc_early_industrial_residential_lgt", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "residential"]], "output_field": "lighting_character", "output_value": "residential_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_residential_lgt"]},
  {"id": "lc_early_industrial_residential_den", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "residential"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_residential_den"]},
  {"id": "lc_early_industrial_commercial_arch", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "commercial"]], "output_field": "architecture_style", "output_value": "early_industrial_commercial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_commercial_arch"]},
  {"id": "lc_early_industrial_commercial_era", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "commercial"]], "output_field": "construction_era", "output_value": "early_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_commercial_era"]},
  {"id": "lc_early_industrial_commercial_mat", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "commercial"]], "output_field": "material_palette", "output_value": "brick_stone_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_commercial_mat"]},
  {"id": "lc_early_industrial_commercial_lgt", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "commercial"]], "output_field": "lighting_character", "output_value": "commercial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_commercial_lgt"]},
  {"id": "lc_early_industrial_commercial_den", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "commercial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_commercial_den"]},
  {"id": "lc_early_industrial_civic_arch", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "civic"]], "output_field": "architecture_style", "output_value": "early_industrial_civic", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_civic_arch"]},
  {"id": "lc_early_industrial_civic_era", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "civic"]], "output_field": "construction_era", "output_value": "early_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_civic_era"]},
  {"id": "lc_early_industrial_civic_mat", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "civic"]], "output_field": "material_palette", "output_value": "brick_stone_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_civic_mat"]},
  {"id": "lc_early_industrial_civic_lgt", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "civic"]], "output_field": "lighting_character", "output_value": "civic_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_civic_lgt"]},
  {"id": "lc_early_industrial_civic_den", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "civic"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_civic_den"]},
  {"id": "lc_early_industrial_military_arch", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "military"]], "output_field": "architecture_style", "output_value": "early_industrial_military", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_military_arch"]},
  {"id": "lc_early_industrial_military_era", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "military"]], "output_field": "construction_era", "output_value": "early_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_military_era"]},
  {"id": "lc_early_industrial_military_mat", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "military"]], "output_field": "material_palette", "output_value": "brick_stone_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_military_mat"]},
  {"id": "lc_early_industrial_military_lgt", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "military"]], "output_field": "lighting_character", "output_value": "military_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_military_lgt"]},
  {"id": "lc_early_industrial_military_den", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "military"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_military_den"]},
  {"id": "lc_early_industrial_religious_arch", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "religious"]], "output_field": "architecture_style", "output_value": "early_industrial_religious", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_religious_arch"]},
  {"id": "lc_early_industrial_religious_era", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "religious"]], "output_field": "construction_era", "output_value": "early_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_religious_era"]},
  {"id": "lc_early_industrial_religious_mat", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "religious"]], "output_field": "material_palette", "output_value": "brick_stone_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_religious_mat"]},
  {"id": "lc_early_industrial_religious_lgt", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "religious"]], "output_field": "lighting_character", "output_value": "religious_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_religious_lgt"]},
  {"id": "lc_early_industrial_religious_den", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "religious"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_religious_den"]},
  {"id": "lc_early_industrial_industrial_arch", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "industrial"]], "output_field": "architecture_style", "output_value": "early_industrial_industrial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_industrial_arch"]},
  {"id": "lc_early_industrial_industrial_era", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "industrial"]], "output_field": "construction_era", "output_value": "early_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_industrial_era"]},
  {"id": "lc_early_industrial_industrial_mat", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "industrial"]], "output_field": "material_palette", "output_value": "brick_stone_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_industrial_mat"]},
  {"id": "lc_early_industrial_industrial_lgt", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "industrial"]], "output_field": "lighting_character", "output_value": "industrial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_industrial_lgt"]},
  {"id": "lc_early_industrial_industrial_den", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "industrial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_industrial_den"]},
  {"id": "lc_early_industrial_transportation_arch", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "transportation"]], "output_field": "architecture_style", "output_value": "early_industrial_transportation", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_transportation_arch"]},
  {"id": "lc_early_industrial_transportation_era", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "transportation"]], "output_field": "construction_era", "output_value": "early_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_transportation_era"]},
  {"id": "lc_early_industrial_transportation_mat", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "transportation"]], "output_field": "material_palette", "output_value": "brick_stone_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_transportation_mat"]},
  {"id": "lc_early_industrial_transportation_lgt", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "transportation"]], "output_field": "lighting_character", "output_value": "transportation_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_transportation_lgt"]},
  {"id": "lc_early_industrial_transportation_den", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "transportation"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_transportation_den"]},
  {"id": "lc_early_industrial_hospitality_arch", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "hospitality"]], "output_field": "architecture_style", "output_value": "early_industrial_hospitality", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_hospitality_arch"]},
  {"id": "lc_early_industrial_hospitality_era", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "hospitality"]], "output_field": "construction_era", "output_value": "early_industrial", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_hospitality_era"]},
  {"id": "lc_early_industrial_hospitality_mat", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "hospitality"]], "output_field": "material_palette", "output_value": "brick_stone_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_hospitality_mat"]},
  {"id": "lc_early_industrial_hospitality_lgt", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "hospitality"]], "output_field": "lighting_character", "output_value": "hospitality_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_hospitality_lgt"]},
  {"id": "lc_early_industrial_hospitality_den", "domain": "location", "triggers": [["period", "regex", "renaissance|colonial|victorian|18th|19th|1700|1800"], ["spatial_function", "eq", "hospitality"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_early_industrial_hospitality_den"]},
  {"id": "lc_modern_war_residential_arch", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "residential"]], "output_field": "architecture_style", "output_value": "modern_war_residential", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_residential_arch"]},
  {"id": "lc_modern_war_residential_era", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "residential"]], "output_field": "construction_era", "output_value": "modern_war", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_residential_era"]},
  {"id": "lc_modern_war_residential_mat", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "residential"]], "output_field": "material_palette", "output_value": "concrete_brick_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_residential_mat"]},
  {"id": "lc_modern_war_residential_lgt", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "residential"]], "output_field": "lighting_character", "output_value": "residential_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_residential_lgt"]},
  {"id": "lc_modern_war_residential_den", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "residential"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_residential_den"]},
  {"id": "lc_modern_war_commercial_arch", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "commercial"]], "output_field": "architecture_style", "output_value": "modern_war_commercial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_commercial_arch"]},
  {"id": "lc_modern_war_commercial_era", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "commercial"]], "output_field": "construction_era", "output_value": "modern_war", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_commercial_era"]},
  {"id": "lc_modern_war_commercial_mat", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "commercial"]], "output_field": "material_palette", "output_value": "concrete_brick_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_commercial_mat"]},
  {"id": "lc_modern_war_commercial_lgt", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "commercial"]], "output_field": "lighting_character", "output_value": "commercial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_commercial_lgt"]},
  {"id": "lc_modern_war_commercial_den", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "commercial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_commercial_den"]},
  {"id": "lc_modern_war_civic_arch", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "civic"]], "output_field": "architecture_style", "output_value": "modern_war_civic", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_civic_arch"]},
  {"id": "lc_modern_war_civic_era", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "civic"]], "output_field": "construction_era", "output_value": "modern_war", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_civic_era"]},
  {"id": "lc_modern_war_civic_mat", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "civic"]], "output_field": "material_palette", "output_value": "concrete_brick_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_civic_mat"]},
  {"id": "lc_modern_war_civic_lgt", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "civic"]], "output_field": "lighting_character", "output_value": "civic_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_civic_lgt"]},
  {"id": "lc_modern_war_civic_den", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "civic"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_civic_den"]},
  {"id": "lc_modern_war_military_arch", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "military"]], "output_field": "architecture_style", "output_value": "modern_war_military", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_military_arch"]},
  {"id": "lc_modern_war_military_era", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "military"]], "output_field": "construction_era", "output_value": "modern_war", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_military_era"]},
  {"id": "lc_modern_war_military_mat", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "military"]], "output_field": "material_palette", "output_value": "concrete_brick_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_military_mat"]},
  {"id": "lc_modern_war_military_lgt", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "military"]], "output_field": "lighting_character", "output_value": "military_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_military_lgt"]},
  {"id": "lc_modern_war_military_den", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "military"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_military_den"]},
  {"id": "lc_modern_war_religious_arch", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "religious"]], "output_field": "architecture_style", "output_value": "modern_war_religious", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_religious_arch"]},
  {"id": "lc_modern_war_religious_era", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "religious"]], "output_field": "construction_era", "output_value": "modern_war", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_religious_era"]},
  {"id": "lc_modern_war_religious_mat", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "religious"]], "output_field": "material_palette", "output_value": "concrete_brick_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_religious_mat"]},
  {"id": "lc_modern_war_religious_lgt", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "religious"]], "output_field": "lighting_character", "output_value": "religious_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_religious_lgt"]},
  {"id": "lc_modern_war_religious_den", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "religious"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_religious_den"]},
  {"id": "lc_modern_war_industrial_arch", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "industrial"]], "output_field": "architecture_style", "output_value": "modern_war_industrial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_industrial_arch"]},
  {"id": "lc_modern_war_industrial_era", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "industrial"]], "output_field": "construction_era", "output_value": "modern_war", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_industrial_era"]},
  {"id": "lc_modern_war_industrial_mat", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "industrial"]], "output_field": "material_palette", "output_value": "concrete_brick_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_industrial_mat"]},
  {"id": "lc_modern_war_industrial_lgt", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "industrial"]], "output_field": "lighting_character", "output_value": "industrial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_industrial_lgt"]},
  {"id": "lc_modern_war_industrial_den", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "industrial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_industrial_den"]},
  {"id": "lc_modern_war_transportation_arch", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "transportation"]], "output_field": "architecture_style", "output_value": "modern_war_transportation", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_transportation_arch"]},
  {"id": "lc_modern_war_transportation_era", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "transportation"]], "output_field": "construction_era", "output_value": "modern_war", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_transportation_era"]},
  {"id": "lc_modern_war_transportation_mat", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "transportation"]], "output_field": "material_palette", "output_value": "concrete_brick_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_transportation_mat"]},
  {"id": "lc_modern_war_transportation_lgt", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "transportation"]], "output_field": "lighting_character", "output_value": "transportation_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_transportation_lgt"]},
  {"id": "lc_modern_war_transportation_den", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "transportation"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_transportation_den"]},
  {"id": "lc_modern_war_hospitality_arch", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "hospitality"]], "output_field": "architecture_style", "output_value": "modern_war_hospitality", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_hospitality_arch"]},
  {"id": "lc_modern_war_hospitality_era", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "hospitality"]], "output_field": "construction_era", "output_value": "modern_war", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_hospitality_era"]},
  {"id": "lc_modern_war_hospitality_mat", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "hospitality"]], "output_field": "material_palette", "output_value": "concrete_brick_iron", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_hospitality_mat"]},
  {"id": "lc_modern_war_hospitality_lgt", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "hospitality"]], "output_field": "lighting_character", "output_value": "hospitality_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_hospitality_lgt"]},
  {"id": "lc_modern_war_hospitality_den", "domain": "location", "triggers": [["period", "regex", "wwi|interwar|1940s|wwii|1930s|1910|1920"], ["spatial_function", "eq", "hospitality"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_modern_war_hospitality_den"]},
  {"id": "lc_contemporary_residential_arch", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "residential"]], "output_field": "architecture_style", "output_value": "contemporary_residential", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_residential_arch"]},
  {"id": "lc_contemporary_residential_era", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "residential"]], "output_field": "construction_era", "output_value": "contemporary", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_residential_era"]},
  {"id": "lc_contemporary_residential_mat", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "residential"]], "output_field": "material_palette", "output_value": "concrete_steel_glass", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_residential_mat"]},
  {"id": "lc_contemporary_residential_lgt", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "residential"]], "output_field": "lighting_character", "output_value": "residential_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_residential_lgt"]},
  {"id": "lc_contemporary_residential_den", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "residential"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_residential_den"]},
  {"id": "lc_contemporary_commercial_arch", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "commercial"]], "output_field": "architecture_style", "output_value": "contemporary_commercial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_commercial_arch"]},
  {"id": "lc_contemporary_commercial_era", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "commercial"]], "output_field": "construction_era", "output_value": "contemporary", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_commercial_era"]},
  {"id": "lc_contemporary_commercial_mat", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "commercial"]], "output_field": "material_palette", "output_value": "concrete_steel_glass", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_commercial_mat"]},
  {"id": "lc_contemporary_commercial_lgt", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "commercial"]], "output_field": "lighting_character", "output_value": "commercial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_commercial_lgt"]},
  {"id": "lc_contemporary_commercial_den", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "commercial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_commercial_den"]},
  {"id": "lc_contemporary_civic_arch", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "civic"]], "output_field": "architecture_style", "output_value": "contemporary_civic", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_civic_arch"]},
  {"id": "lc_contemporary_civic_era", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "civic"]], "output_field": "construction_era", "output_value": "contemporary", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_civic_era"]},
  {"id": "lc_contemporary_civic_mat", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "civic"]], "output_field": "material_palette", "output_value": "concrete_steel_glass", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_civic_mat"]},
  {"id": "lc_contemporary_civic_lgt", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "civic"]], "output_field": "lighting_character", "output_value": "civic_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_civic_lgt"]},
  {"id": "lc_contemporary_civic_den", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "civic"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_civic_den"]},
  {"id": "lc_contemporary_military_arch", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "military"]], "output_field": "architecture_style", "output_value": "contemporary_military", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_military_arch"]},
  {"id": "lc_contemporary_military_era", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "military"]], "output_field": "construction_era", "output_value": "contemporary", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_military_era"]},
  {"id": "lc_contemporary_military_mat", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "military"]], "output_field": "material_palette", "output_value": "concrete_steel_glass", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_military_mat"]},
  {"id": "lc_contemporary_military_lgt", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "military"]], "output_field": "lighting_character", "output_value": "military_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_military_lgt"]},
  {"id": "lc_contemporary_military_den", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "military"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_military_den"]},
  {"id": "lc_contemporary_religious_arch", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "religious"]], "output_field": "architecture_style", "output_value": "contemporary_religious", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_religious_arch"]},
  {"id": "lc_contemporary_religious_era", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "religious"]], "output_field": "construction_era", "output_value": "contemporary", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_religious_era"]},
  {"id": "lc_contemporary_religious_mat", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "religious"]], "output_field": "material_palette", "output_value": "concrete_steel_glass", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_religious_mat"]},
  {"id": "lc_contemporary_religious_lgt", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "religious"]], "output_field": "lighting_character", "output_value": "religious_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_religious_lgt"]},
  {"id": "lc_contemporary_religious_den", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "religious"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_religious_den"]},
  {"id": "lc_contemporary_industrial_arch", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "industrial"]], "output_field": "architecture_style", "output_value": "contemporary_industrial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_industrial_arch"]},
  {"id": "lc_contemporary_industrial_era", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "industrial"]], "output_field": "construction_era", "output_value": "contemporary", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_industrial_era"]},
  {"id": "lc_contemporary_industrial_mat", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "industrial"]], "output_field": "material_palette", "output_value": "concrete_steel_glass", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_industrial_mat"]},
  {"id": "lc_contemporary_industrial_lgt", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "industrial"]], "output_field": "lighting_character", "output_value": "industrial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_industrial_lgt"]},
  {"id": "lc_contemporary_industrial_den", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "industrial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_industrial_den"]},
  {"id": "lc_contemporary_transportation_arch", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "transportation"]], "output_field": "architecture_style", "output_value": "contemporary_transportation", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_transportation_arch"]},
  {"id": "lc_contemporary_transportation_era", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "transportation"]], "output_field": "construction_era", "output_value": "contemporary", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_transportation_era"]},
  {"id": "lc_contemporary_transportation_mat", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "transportation"]], "output_field": "material_palette", "output_value": "concrete_steel_glass", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_transportation_mat"]},
  {"id": "lc_contemporary_transportation_lgt", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "transportation"]], "output_field": "lighting_character", "output_value": "transportation_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_transportation_lgt"]},
  {"id": "lc_contemporary_transportation_den", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "transportation"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_transportation_den"]},
  {"id": "lc_contemporary_hospitality_arch", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "hospitality"]], "output_field": "architecture_style", "output_value": "contemporary_hospitality", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_hospitality_arch"]},
  {"id": "lc_contemporary_hospitality_era", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "hospitality"]], "output_field": "construction_era", "output_value": "contemporary", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_hospitality_era"]},
  {"id": "lc_contemporary_hospitality_mat", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "hospitality"]], "output_field": "material_palette", "output_value": "concrete_steel_glass", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_hospitality_mat"]},
  {"id": "lc_contemporary_hospitality_lgt", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "hospitality"]], "output_field": "lighting_character", "output_value": "hospitality_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_hospitality_lgt"]},
  {"id": "lc_contemporary_hospitality_den", "domain": "location", "triggers": [["period", "regex", "1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern"], ["spatial_function", "eq", "hospitality"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_contemporary_hospitality_den"]},
  {"id": "lc_future_residential_arch", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "residential"]], "output_field": "architecture_style", "output_value": "future_residential", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_future_residential_arch"]},
  {"id": "lc_future_residential_era", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "residential"]], "output_field": "construction_era", "output_value": "future", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_future_residential_era"]},
  {"id": "lc_future_residential_mat", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "residential"]], "output_field": "material_palette", "output_value": "composite_glass_alloy", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_future_residential_mat"]},
  {"id": "lc_future_residential_lgt", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "residential"]], "output_field": "lighting_character", "output_value": "residential_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_future_residential_lgt"]},
  {"id": "lc_future_residential_den", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "residential"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_future_residential_den"]},
  {"id": "lc_future_commercial_arch", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "commercial"]], "output_field": "architecture_style", "output_value": "future_commercial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_future_commercial_arch"]},
  {"id": "lc_future_commercial_era", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "commercial"]], "output_field": "construction_era", "output_value": "future", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_future_commercial_era"]},
  {"id": "lc_future_commercial_mat", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "commercial"]], "output_field": "material_palette", "output_value": "composite_glass_alloy", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_future_commercial_mat"]},
  {"id": "lc_future_commercial_lgt", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "commercial"]], "output_field": "lighting_character", "output_value": "commercial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_future_commercial_lgt"]},
  {"id": "lc_future_commercial_den", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "commercial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_future_commercial_den"]},
  {"id": "lc_future_civic_arch", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "civic"]], "output_field": "architecture_style", "output_value": "future_civic", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_future_civic_arch"]},
  {"id": "lc_future_civic_era", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "civic"]], "output_field": "construction_era", "output_value": "future", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_future_civic_era"]},
  {"id": "lc_future_civic_mat", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "civic"]], "output_field": "material_palette", "output_value": "composite_glass_alloy", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_future_civic_mat"]},
  {"id": "lc_future_civic_lgt", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "civic"]], "output_field": "lighting_character", "output_value": "civic_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_future_civic_lgt"]},
  {"id": "lc_future_civic_den", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "civic"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_future_civic_den"]},
  {"id": "lc_future_military_arch", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "military"]], "output_field": "architecture_style", "output_value": "future_military", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_future_military_arch"]},
  {"id": "lc_future_military_era", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "military"]], "output_field": "construction_era", "output_value": "future", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_future_military_era"]},
  {"id": "lc_future_military_mat", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "military"]], "output_field": "material_palette", "output_value": "composite_glass_alloy", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_future_military_mat"]},
  {"id": "lc_future_military_lgt", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "military"]], "output_field": "lighting_character", "output_value": "military_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_future_military_lgt"]},
  {"id": "lc_future_military_den", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "military"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_future_military_den"]},
  {"id": "lc_future_religious_arch", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "religious"]], "output_field": "architecture_style", "output_value": "future_religious", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_future_religious_arch"]},
  {"id": "lc_future_religious_era", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "religious"]], "output_field": "construction_era", "output_value": "future", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_future_religious_era"]},
  {"id": "lc_future_religious_mat", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "religious"]], "output_field": "material_palette", "output_value": "composite_glass_alloy", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_future_religious_mat"]},
  {"id": "lc_future_religious_lgt", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "religious"]], "output_field": "lighting_character", "output_value": "religious_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_future_religious_lgt"]},
  {"id": "lc_future_religious_den", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "religious"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_future_religious_den"]},
  {"id": "lc_future_industrial_arch", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "industrial"]], "output_field": "architecture_style", "output_value": "future_industrial", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_future_industrial_arch"]},
  {"id": "lc_future_industrial_era", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "industrial"]], "output_field": "construction_era", "output_value": "future", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_future_industrial_era"]},
  {"id": "lc_future_industrial_mat", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "industrial"]], "output_field": "material_palette", "output_value": "composite_glass_alloy", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_future_industrial_mat"]},
  {"id": "lc_future_industrial_lgt", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "industrial"]], "output_field": "lighting_character", "output_value": "industrial_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_future_industrial_lgt"]},
  {"id": "lc_future_industrial_den", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "industrial"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_future_industrial_den"]},
  {"id": "lc_future_transportation_arch", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "transportation"]], "output_field": "architecture_style", "output_value": "future_transportation", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_future_transportation_arch"]},
  {"id": "lc_future_transportation_era", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "transportation"]], "output_field": "construction_era", "output_value": "future", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_future_transportation_era"]},
  {"id": "lc_future_transportation_mat", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "transportation"]], "output_field": "material_palette", "output_value": "composite_glass_alloy", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_future_transportation_mat"]},
  {"id": "lc_future_transportation_lgt", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "transportation"]], "output_field": "lighting_character", "output_value": "transportation_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_future_transportation_lgt"]},
  {"id": "lc_future_transportation_den", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "transportation"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_future_transportation_den"]},
  {"id": "lc_future_hospitality_arch", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "hospitality"]], "output_field": "architecture_style", "output_value": "future_hospitality", "confidence": 0.88, "priority": 100, "reasoning": ["registry_rule: lc_future_hospitality_arch"]},
  {"id": "lc_future_hospitality_era", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "hospitality"]], "output_field": "construction_era", "output_value": "future", "confidence": 0.87, "priority": 100, "reasoning": ["registry_rule: lc_future_hospitality_era"]},
  {"id": "lc_future_hospitality_mat", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "hospitality"]], "output_field": "material_palette", "output_value": "composite_glass_alloy", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_future_hospitality_mat"]},
  {"id": "lc_future_hospitality_lgt", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "hospitality"]], "output_field": "lighting_character", "output_value": "hospitality_standard", "confidence": 0.8, "priority": 100, "reasoning": ["registry_rule: lc_future_hospitality_lgt"]},
  {"id": "lc_future_hospitality_den", "domain": "location", "triggers": [["period", "regex", "distant_future|near_future|2087|post_apocalyptic|2050"], ["spatial_function", "eq", "hospitality"]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.78, "priority": 100, "reasoning": ["registry_rule: lc_future_hospitality_den"]},
  {"id": "lc_arid_mat", "domain": "location", "triggers": [["climate", "in", "hot_arid,arid,desert"]], "output_field": "material_palette", "output_value": "stone_mudbrick_adobe", "confidence": 0.82, "priority": 105, "reasoning": ["registry_rule: lc_arid_mat"]},
  {"id": "lc_rainy_mat", "domain": "location", "triggers": [["climate", "in", "temperate_rainy,rainy,wet,tropical_humid"]], "output_field": "material_palette", "output_value": "waterproofed_wood_stone_tile", "confidence": 0.8, "priority": 105, "reasoning": ["registry_rule: lc_rainy_mat"]},
  {"id": "lc_snowy_mat", "domain": "location", "triggers": [["climate", "in", "cold_snowy,arctic,sub_arctic"]], "output_field": "material_palette", "output_value": "insulated_timber_stone_felt", "confidence": 0.82, "priority": 105, "reasoning": ["registry_rule: lc_snowy_mat"]},
  {"id": "lc_wild_cave", "domain": "location", "triggers": [["spatial_function", "eq", "wilderness"], ["biome", "in", "cave,subterranean"]], "output_field": "architecture_style", "output_value": "natural_cavern", "confidence": 0.9, "priority": 100, "reasoning": ["registry_rule: lc_wild_cave"]},
  {"id": "lc_wild_forest", "domain": "location", "triggers": [["spatial_function", "eq", "wilderness"], ["biome", "in", "forest,jungle,woods"]], "output_field": "architecture_style", "output_value": "forest_clearing", "confidence": 0.85, "priority": 100, "reasoning": ["registry_rule: lc_wild_forest"]},
  {"id": "lc_wild_desert", "domain": "location", "triggers": [["spatial_function", "eq", "wilderness"], ["climate", "in", "hot_arid,arid"]], "output_field": "architecture_style", "output_value": "open_desert_plain", "confidence": 0.85, "priority": 100, "reasoning": ["registry_rule: lc_wild_desert"]},
  {"id": "lc_light_noir", "domain": "location", "triggers": [["genre", "in", "noir,crime,thriller"]], "output_field": "lighting_character", "output_value": "shadow_high_contrast", "confidence": 0.85, "priority": 110, "reasoning": ["registry_rule: lc_light_noir"]},
  {"id": "lc_light_horror", "domain": "location", "triggers": [["genre", "in", "horror,suspense"]], "output_field": "lighting_character", "output_value": "dim_ominous_unstable", "confidence": 0.85, "priority": 110, "reasoning": ["registry_rule: lc_light_horror"]},
  {"id": "lc_tech_future", "domain": "location", "triggers": [["period", "regex", "future|distant_future|2087"]], "output_field": "tech_integration", "output_value": "full_digital_automated", "confidence": 0.88, "priority": 105, "reasoning": ["registry_rule: lc_tech_future"]},
  {"id": "lc_tech_modern", "domain": "location", "triggers": [["period", "regex", "contemporary|modern|2000|2020"]], "output_field": "tech_integration", "output_value": "digital_networked", "confidence": 0.82, "priority": 100, "reasoning": ["registry_rule: lc_tech_modern"]},
  {"id": "lc_tech_pre", "domain": "location", "triggers": [["period", "regex", "ancient|medieval|fantasy_medieval|bronze_age"]], "output_field": "tech_integration", "output_value": "pre_industrial_none", "confidence": 0.9, "priority": 100, "reasoning": ["registry_rule: lc_tech_pre"]},
  {"id": "lc_cond_affl", "domain": "location", "triggers": [["economy", "in", "post_scarcity,industrial,developed"]], "output_field": "condition", "output_value": "pristine_maintained", "confidence": 0.8, "priority": 95, "reasoning": ["registry_rule: lc_cond_affl"]},
  {"id": "lc_cond_work", "domain": "location", "triggers": [["economy", "in", "industrial,agrarian"]], "output_field": "condition", "output_value": "functional_worn", "confidence": 0.78, "priority": 95, "reasoning": ["registry_rule: lc_cond_work"]},
  {"id": "lc_cond_feud", "domain": "location", "triggers": [["economy", "in", "feudal,subsistence"]], "output_field": "condition", "output_value": "weathered_utilitarian", "confidence": 0.8, "priority": 95, "reasoning": ["registry_rule: lc_cond_feud"]},
  {"id": "lc_catch_res_arch", "domain": "location", "triggers": [["spatial_function", "eq", "residential"]], "output_field": "architecture_style", "output_value": "domestic_interior", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_res_arch"]},
  {"id": "lc_catch_com_arch", "domain": "location", "triggers": [["spatial_function", "eq", "commercial"]], "output_field": "architecture_style", "output_value": "retail_interior", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_com_arch"]},
  {"id": "lc_catch_civ_arch", "domain": "location", "triggers": [["spatial_function", "eq", "civic"]], "output_field": "architecture_style", "output_value": "public_institutional", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_civ_arch"]},
  {"id": "lc_catch_mil_arch", "domain": "location", "triggers": [["spatial_function", "eq", "military"]], "output_field": "architecture_style", "output_value": "military_installation", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_mil_arch"]},
  {"id": "lc_catch_ind_arch", "domain": "location", "triggers": [["spatial_function", "eq", "industrial"]], "output_field": "architecture_style", "output_value": "industrial_space", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_ind_arch"]},
  {"id": "lc_catch_rel_arch", "domain": "location", "triggers": [["spatial_function", "eq", "religious"]], "output_field": "architecture_style", "output_value": "religious_structure", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_rel_arch"]},
  {"id": "lc_catch_tra_arch", "domain": "location", "triggers": [["spatial_function", "eq", "transportation"]], "output_field": "architecture_style", "output_value": "transportation_infrastructure", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_tra_arch"]},
  {"id": "lc_catch_hos_arch", "domain": "location", "triggers": [["spatial_function", "eq", "hospitality"]], "output_field": "architecture_style", "output_value": "social_venue", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_hos_arch"]},
  {"id": "lc_catch_agr_arch", "domain": "location", "triggers": [["spatial_function", "eq", "agricultural"]], "output_field": "architecture_style", "output_value": "agricultural_facility", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_agr_arch"]},
  {"id": "lc_catch_wil_arch", "domain": "location", "triggers": [["spatial_function", "eq", "wilderness"]], "output_field": "architecture_style", "output_value": "natural_terrain", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_wil_arch"]},
  {"id": "lc_catch_pub_arch", "domain": "location", "triggers": [["spatial_function", "eq", "public_realm"]], "output_field": "architecture_style", "output_value": "public_thoroughfare", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_pub_arch"]},
  {"id": "lc_catch_gen_arch", "domain": "location", "triggers": [["spatial_function", "any", ""]], "output_field": "architecture_style", "output_value": "generic_interior_exterior", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catch_gen_arch"]},
  {"id": "lc_catchall_arch", "domain": "location", "triggers": [["spatial_function", "any", ""]], "output_field": "architecture_style", "output_value": "standard_architecture", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catchall_arch", "low_confidence"]},
  {"id": "lc_catchall_era", "domain": "location", "triggers": [["spatial_function", "any", ""]], "output_field": "construction_era", "output_value": "contemporary", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catchall_era", "low_confidence"]},
  {"id": "lc_catchall_mat", "domain": "location", "triggers": [["spatial_function", "any", ""]], "output_field": "material_palette", "output_value": "mixed_modern", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catchall_mat", "low_confidence"]},
  {"id": "lc_catchall_lgt", "domain": "location", "triggers": [["spatial_function", "any", ""]], "output_field": "lighting_character", "output_value": "standard_ambient", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catchall_lgt", "low_confidence"]},
  {"id": "lc_catchall_den", "domain": "location", "triggers": [["spatial_function", "any", ""]], "output_field": "visual_density", "output_value": "moderate", "confidence": 0.3, "priority": 0, "reasoning": ["registry_rule: lc_catchall_den", "low_confidence"]}
];

const DOMAIN_FIELD_COUNTS: Record<string, number> = {
  wardrobe: 10, prop: 8, vehicle: 8, creature: 10, vl: 8, location: 10,
};

// ── Domain Dispatch ──────────────────────────────────────────────────

function getDomainAnchorsAndDeps(domain: string): { anchors: RegistryAnchor[]; deps: string[] } | null {
  if (domain === "wardrobe") return { anchors: WARDROBE_ANCHORS, deps: ["profession_map", "genre", "climate", "period"] };
  if (domain === "props" || domain === "prop") return { anchors: PROP_ANCHORS, deps: ["profession_map", "period", "technology_level"] };
  if (domain === "vehicle") return { anchors: VEHICLE_ANCHORS, deps: ["profession_map", "period", "technology_level", "infrastructure", "geography", "economy", "class_structure", "transport_function", "genre"] };
  if (domain === "creature") return { anchors: CREATURE_ANCHORS, deps: ["genre", "period", "mythology", "ecology", "biome", "threat_role", "intelligence", "symbolism", "narrative_function"] };
  if (domain === "vl") return { anchors: VL_ANCHORS, deps: ["genre", "period", "visual_tone", "style_influences", "production_language"] };
  if (domain === "location" || domain === "loc") return { anchors: LOCATION_ANCHORS, deps: ["period", "spatial_function", "infrastructure", "geography", "economy", "class_structure", "biome", "culture"] };
    return null;
}

// ── Transport Function Layer ──────────────────────────────────────────

const TRANSPORT_FUNCTION_MAP: Record<string, string> = {
  soldier: "military", marine: "military", general: "military",
  commander: "military", officer: "military", spy: "military",
  pilot: "military", police: "emergency_services",
  paramedic: "emergency_services", firefighter: "emergency_services",
  detective: "civilian_transport", fbi: "emergency_services",
  courier: "commercial", messenger: "commercial", delivery: "commercial",
  trucker: "commercial", taxi: "commercial", driver: "commercial",
  farmer: "civilian_utility", rancher: "civilian_utility",
  construction: "civilian_utility", mechanic: "civilian_utility",
  engineer: "civilian_utility", worker: "civilian_utility",
  doctor: "civilian_transport", nurse: "civilian_transport",
  professor: "civilian_transport", teacher: "civilian_transport",
  knight: "military", king: "civilian_transport",
  queen: "civilian_transport", prince: "civilian_transport",
  noble: "civilian_transport", lord: "civilian_transport",
  lady: "civilian_transport",
};

function resolveTransportFunction(profession: string): string {
  const key = profession.toLowerCase().trim();
  return TRANSPORT_FUNCTION_MAP[key] ?? "civilian_transport";
}

function calculateICS(inferences: CPIEInference[], domain: string): number {
  const total = DOMAIN_FIELD_COUNTS[domain] ?? 10;
  if (total <= 0) return 0;
  const filled = inferences.filter(i => i.source_type === "inferred" || i.source_type === "inferred_low_confidence").length;
  return Math.min(filled / total, 1.0);
}

// ── Main Handler ──────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const pcp: CPIEPCPContext = body.pcp;
    const domains: string[] = body.domains || ["wardrobe", "props"];

    if (!pcp || !pcp.project_id) {
      return new Response(JSON.stringify({ error: "Missing pcp.project_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date().toISOString();
    const results: Record<string, Array<{ entity_key: string; inferences: CPIEInference[]; inference_count: number; ics: number }>> = {};

    for (const domain of domains) {
      const config = getDomainAnchorsAndDeps(domain);
      if (!config) continue;

      const domainResults: Array<{ entity_key: string; inferences: CPIEInference[]; inference_count: number; ics: number }> = [];

      if (pcp.profession_map) {
        for (const [entityKey, entry] of Object.entries(pcp.profession_map)) {
          // Vehicle domain: inject transport_function into context
          let effectivePcp = { ...pcp };
          if (domain === "vehicle") {
            effectivePcp.transport_function = resolveTransportFunction(entry.profession);
            effectivePcp.infrastructure = pcp.infrastructure ?? "";
            effectivePcp.geography = pcp.geography ?? "";
            effectivePcp.economy = pcp.economy ?? "";
            effectivePcp.class_structure = pcp.class_structure ?? "";
          }

          const entity = { entity_key: entityKey, profession: entry.profession, role_archetype: entry.role_archetype };
          const matched = matchRules(config.anchors, effectivePcp, entity);
          const inferences = Array.from(matched.values()).map(a => anchorToInference(a, entityKey, config.deps, now));

          if (inferences.length > 0) {
            domainResults.push({
              entity_key: entityKey,
              inferences,
              inference_count: inferences.length,
              ics: calculateICS(inferences, domain),
            });
          }
        }
      }

      results[domain] = domainResults;
    }

    const response = {
      status: "ok",
      project_id: pcp.project_id,
      generated_at: now,
      generated_by: "cpie_endpoint",
      registry_version: "1.0.0",
      domains: results,
      ics_summary: Object.fromEntries(
        Object.entries(results).map(([d, rs]) => [
          d, rs.length > 0 ? rs.reduce((s, r) => s + r.ics, 0) / rs.length : 0,
        ])
      ),
      total_inferences: Object.values(results).reduce((s, rs) => s + rs.reduce((s2, r) => s2 + r.inferences.length, 0), 0),
      total_entities: Object.values(results).reduce((s, rs) => s + rs.length, 0),
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && supabaseKey) {
      try {
        const client = createClient(supabaseUrl, supabaseKey);
        for (const [domain, domainResults] of Object.entries(results)) {
          for (const result of domainResults) {
            await client.from("cpie_inferences").upsert({
              project_id: pcp.project_id,
              entity_key: result.entity_key,
              domain,
              inferences: result.inferences,
              inference_count: result.inference_count,
              ics: result.ics,
              generated_at: now,
            }, { onConflict: "project_id,entity_key,domain" });
          }
        }
      } catch (dbErr) {
        console.error("DB persist warning:", dbErr instanceof Error ? dbErr.message : String(dbErr));
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
