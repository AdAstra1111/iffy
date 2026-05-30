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
  if (field === "profession" || field === "role_archetype") return null;
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

function matchTrigger(ctx: CPIEPCPContext, trigger: RegistryTrigger): boolean {
  const ctxValue = resolveContextField(ctx, trigger.pcp_field);
  if (ctxValue === null || ctxValue === undefined) return false;
  switch (trigger.operator) {
    case "eq": return String(ctxValue).toLowerCase() === String(trigger.value).toLowerCase();
    case "not_eq": return String(ctxValue).toLowerCase() !== String(trigger.value).toLowerCase();
    case "in": {
      const vals = Array.isArray(trigger.value) ? trigger.value : String(trigger.value).split(",").map(v => v.trim());
      const ctxStr = String(ctxValue).toLowerCase();
      return vals.some(v => ctxStr.includes(v.toLowerCase()));
    }
    case "any": return true;
    case "regex": { const re = new RegExp(String(trigger.value), "i"); return re.test(String(ctxValue)); }
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
      if (trigger.pcp_field === "profession" || trigger.pcp_field === "role_archetype") {
        const entityVal = trigger.pcp_field === "profession" ? entity.profession : entity.role_archetype;
        if (entityVal) {
          switch (trigger.operator) {
            case "eq": matched = entityVal.toLowerCase() === String(trigger.value).toLowerCase(); break;
            case "in": {
              const vals = Array.isArray(trigger.value) ? trigger.value : String(trigger.value).split(",").map((v: string) => v.trim());
              matched = vals.some((v: string) => entityVal!.toLowerCase().includes(v.toLowerCase()));
              break;
            }
            case "not_eq": matched = entityVal.toLowerCase() !== String(trigger.value).toLowerCase(); break;
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

const DOMAIN_FIELD_COUNTS: Record<string, number> = {
  wardrobe: 10, prop: 8, vehicle: 8, creature: 10,
};

// ── Domain Dispatch ──────────────────────────────────────────────────

function getDomainAnchorsAndDeps(domain: string): { anchors: RegistryAnchor[]; deps: string[] } | null {
  if (domain === "wardrobe") return { anchors: WARDROBE_ANCHORS, deps: ["profession_map", "genre", "climate", "period"] };
  if (domain === "props" || domain === "prop") return { anchors: PROP_ANCHORS, deps: ["profession_map", "period", "technology_level"] };
  if (domain === "vehicle") return { anchors: VEHICLE_ANCHORS, deps: ["profession_map", "period", "technology_level", "infrastructure", "geography", "economy", "class_structure", "transport_function", "genre"] };
  if (domain === "creature") return { anchors: CREATURE_ANCHORS, deps: ["genre", "period", "mythology", "ecology", "biome", "threat_role", "intelligence", "symbolism", "narrative_function"] };
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
