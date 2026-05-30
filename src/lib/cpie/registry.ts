/**
 * CPIE Registry v1 — Deterministic Inference Authority
 *
 * This is the SINGLE source of inference rules for the entire platform.
 * No atomiser, edge function, prompt, or helper module may contain
 * inference logic. If it's not in this registry, it doesn't exist.
 *
 * Invariants:
 * - Deterministic: same PCP input -> same inference output
 * - Auditable: every anchor has id, triggers, reasoning, version
 * - Versioned: registry_version bumps on any semantic change
 * - No hidden LLM reasoning: every output is rule-driven
 * - No duplication: each (domain, field) combination has one winner
 */

import type {
  RegistryAnchor, CPIEDomain, CPIERegistryMetadata,
  RegistryTrigger, CPIEInference, CPIEPCPContext,
} from './types';

// ── Registry Metadata ────────────────────────────────────────────────

export const CPIE_REGISTRY_VERSION = '1.0.0';
export const CPIE_REGISTRY_CREATED_AT = '2026-05-30T20:37:00Z';

// ── Helper: Build an anchor ─────────────────────────────────────────

function anchor(
  id: string,
  domain: CPIEDomain,
  triggers: [string, RegistryOperator, string | string[]][],
  output_field: string,
  output_value: string,
  confidence: number,
  priority: number,
  ...reasoning: string[]
): RegistryAnchor {
  return {
    id,
    domain,
    triggers: triggers.map(([pcp_field, operator, value]) => ({
      pcp_field, operator, value,
    })),
    output_field,
    output_value,
    confidence,
    priority,
    reasoning,
  };
}

// ── Core Rule Resolution ─────────────────────────────────────────────

function matchTrigger(
  context: CPIEPCPContext,
  trigger: RegistryTrigger,
): boolean {
  const ctxValue = resolveContextField(context, trigger.pcp_field);
  if (ctxValue === null || ctxValue === undefined) return false;

  switch (trigger.operator) {
    case 'eq':
      return String(ctxValue).toLowerCase() === String(trigger.value).toLowerCase();
    case 'not_eq':
      return String(ctxValue).toLowerCase() !== String(trigger.value).toLowerCase();
    case 'in': {
      let vals = Array.isArray(trigger.value) ? trigger.value : String(trigger.value).split(',').map(v => v.trim());
      const ctxStr = String(ctxValue).toLowerCase();
      return vals.some(v => ctxStr.includes(v.toLowerCase()));
    }
    case 'any':
      return true;
    case 'regex': {
      const re = new RegExp(String(trigger.value), 'i');
      return re.test(String(ctxValue));
    }
    default:
      return false;
  }
}

function resolveContextField(ctx: CPIEPCPContext, field: string): string | string[] | null {
  // For fields that come from the entity (like profession)
  if (field === 'profession') return null; // handled separately via entity param
  if (field === 'role_archetype') return null; // handled separately via entity param
  // For PCP-level fields
  switch (field) {
    case 'genre': return ctx.genre.join(' ').toLowerCase();
    case 'climate': return ctx.climate?.toLowerCase() ?? null;
    case 'period': return ctx.period?.toLowerCase() ?? null;
    case 'technology_level': return ctx.technology_level?.toLowerCase() ?? null;
    case 'culture': return Array.isArray(ctx.culture) ? ctx.culture.join(' ').toLowerCase() : (ctx.culture?.toLowerCase() ?? null);
    case 'infrastructure': return ctx.infrastructure?.toLowerCase() ?? null;
    case 'geography': return ctx.geography?.toLowerCase() ?? null;
    case 'economy': return ctx.economy?.toLowerCase() ?? null;
    case 'class_structure': return ctx.class_structure?.toLowerCase() ?? null;
    case 'transport_function': return (ctx as any).transport_function?.toLowerCase() ?? null;
    case 'spatial_function': return (ctx as any).spatial_function?.toLowerCase() ?? null;
    case 'biome': return ctx.biome?.toLowerCase() ?? null;
    case 'mythology': return ctx.mythology?.toLowerCase() ?? null;
    case 'ecology': return ctx.ecology?.toLowerCase() ?? null;
    case 'threat_role': return ctx.threat_role?.toLowerCase() ?? null;
    case 'intelligence': return ctx.intelligence?.toLowerCase() ?? null;
    case 'symbolism': return ctx.symbolism?.toLowerCase() ?? null;
    case 'narrative_function': return ctx.narrative_function?.toLowerCase() ?? null;
    default: return null;
  }
}

interface EntityWithContext {
  entity_key: string;
  canonical_name: string;
  profession?: string;
  role_archetype?: string;
  authority_level?: string;
  institutional_affiliation?: string | null;
}

/**
 * Match rules against context + entity.
 * Returns highest-priority non-contradictory anchors per output_field.
 */
function matchRules(
  rules: RegistryAnchor[],
  domain: CPIEDomain,
  context: CPIEPCPContext,
  entity: EntityWithContext,
): Map<string, RegistryAnchor> {
  const results = new Map<string, RegistryAnchor>();
  const domainRules = rules.filter(r => r.domain === domain);

  // Score each rule
  const scored: Array<{ anchor: RegistryAnchor; matchCount: number; totalTriggers: number; matchRatio: number }> = [];

  for (const rule of domainRules) {
    let matchCount = 0;
    const totalTriggers = rule.triggers.length;

    for (const trigger of rule.triggers) {
      let matched = false;

      if (trigger.pcp_field === 'profession' || trigger.pcp_field === 'role_archetype') {
        // Entity-level field
        const entityVal = trigger.pcp_field === 'profession' ? entity.profession : entity.role_archetype;
        if (entityVal) {
          switch (trigger.operator) {
            case 'eq': matched = entityVal.toLowerCase() === String(trigger.value).toLowerCase(); break;
            case 'in': {
              const vals = Array.isArray(trigger.value) ? trigger.value : String(trigger.value).split(',').map((v: string) => v.trim());
              matched = vals.some((v: string) => entityVal!.toLowerCase().includes(v.toLowerCase()));
              break;
            }
            case 'not_eq': matched = entityVal.toLowerCase() !== String(trigger.value).toLowerCase(); break;
            case 'any': matched = true; break;
            default: matched = false;
          }
        }
      } else {
        matched = matchTrigger(context, trigger);
      }

      if (matched) matchCount++;
    }

    const matchRatio = totalTriggers > 0 ? matchCount / totalTriggers : 0;
    scored.push({ anchor: rule, matchCount, totalTriggers, matchRatio });
  }

  // Sort by: matchRatio desc, then priority desc, then confidence desc
  scored.sort((a, b) => {
    const ratioDiff = b.matchRatio - a.matchRatio;
    if (ratioDiff !== 0) return ratioDiff;
    const priorityDiff = b.anchor.priority - a.anchor.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return b.anchor.confidence - a.anchor.confidence;
  });

  // Select: per output_field, take the first non-contradictory anchor
  for (const match of scored) {
    const field = match.anchor.output_field;
    if (!results.has(field) && match.matchRatio > 0) {
      results.set(field, match.anchor);
    }
  }

  return results;
}

// ── Convert anchor to CPIEInference ───────────────────────────────────

export function anchorToInference(
  anchor: RegistryAnchor,
  entityKey: string,
  pcpDependencies: string[],
  now: string,
): CPIEInference {
  return {
    field: anchor.output_field,
    value: anchor.output_value,
    source_type: 'inferred',
    confidence_score: anchor.confidence,
    reasoning: anchor.reasoning.length > 0 ? anchor.reasoning : ['inferred_from_trigger_matches'],
    registry_anchor_id: anchor.id,
    pcp_dependencies: pcpDependencies,
    generated_at: now,
    generated_by: 'cpie_registry',
  };
}

// ══════════════════════════════════════════════════════════════════════
//  WARDROBE RULES — Master Registry
// ══════════════════════════════════════════════════════════════════════

const WARDROBE_ANCHORS: RegistryAnchor[] = [

  // ── Detective / Investigator ──
  anchor('wd_detective_noir_coat', 'wardrobe',
    [['profession', 'eq', 'detective'], ['genre', 'in', 'noir,crime,mystery'], ['climate', 'any', 'temperate_rainy']],
    'primary_outfit', 'trench_coat', 0.91, 100,
    'registry_rule: wd_detective_noir_coat',
    'profession=detective',
    'genre=noir/crime',
    'climate=temperate_rainy',
    'detectives_in_noir_settings_wear_trench_coats'),

  anchor('wd_detective_blazer', 'wardrobe',
    [['profession', 'eq', 'detective'], ['genre', 'in', 'crime,noir,mystery'], ['climate', 'not_eq', 'temperate_rainy']],
    'primary_outfit', 'blazer', 0.72, 90,
    'registry_rule: wd_detective_blazer',
    'profession=detective',
    'climate=not_rainy',
    'detectives_often_wear_blazers_or_sport_coats'),

  anchor('wd_detective_formal', 'wardrobe',
    [['profession', 'eq', 'detective'], ['genre', 'in', 'period,historical']],
    'primary_outfit', 'period_suit', 0.85, 85,
    'registry_rule: wd_detective_formal',
    'profession=detective',
    'genre=period/historical',
    'historical_detectives_wear_period_clothing'),

  anchor('wd_detective_fantasy', 'wardrobe',
    [['profession', 'eq', 'detective'], ['genre', 'in', 'fantasy']],
    'primary_outfit', 'traveling_cloak', 0.65, 80,
    'registry_rule: wd_detective_fantasy',
    'profession=detective',
    'genre=fantasy',
    'fantasy_detectives_wear_traveling_cloaks'),

  anchor('wd_detective_future', 'wardrobe',
    [['profession', 'eq', 'detective'], ['period', 'regex', 'future|2087|distant']],
    'primary_outfit', 'tech_enhanced_coat', 0.78, 85,
    'registry_rule: wd_detective_future',
    'profession=detective',
    'period=future',
    'future_detectives_wear_tech_enhanced_coats'),

  // ── Police / Law Enforcement ──
  anchor('wd_police_uniform', 'wardrobe',
    [['profession', 'eq', 'police'], ['genre', 'not_eq', 'fantasy']],
    'primary_outfit', 'police_uniform', 0.95, 100,
    'registry_rule: wd_police_uniform',
    'profession=police',
    'police_wear_uniforms'),

  anchor('wd_police_fantasy', 'wardrobe',
    [['profession', 'eq', 'police'], ['genre', 'in', 'fantasy']],
    'primary_outfit', 'city_guard_uniform', 0.88, 100,
    'registry_rule: wd_police_fantasy',
    'profession=police',
    'genre=fantasy',
    'fantasy_police_are_city_guards'),

  // ── Military / Soldier ──
  anchor('wd_soldier_modern', 'wardrobe',
    [['profession', 'in', 'soldier,military,marine'], ['period', 'regex', 'contemporary|modern|2020|2000|near_future']],
    'primary_outfit', 'combat_uniform', 0.93, 100,
    'registry_rule: wd_soldier_modern',
    'profession=soldier',
    'period=modern',
    'modern_soldiers_wear_combat_uniforms'),

  anchor('wd_soldier_historical', 'wardrobe',
    [['profession', 'in', 'soldier,military,general,commander'], ['genre', 'in', 'historical,period']],
    'primary_outfit', 'period_military_uniform', 0.90, 100,
    'registry_rule: wd_soldier_historical',
    'profession=soldier',
    'genre=historical/period',
    'historical_soldiers_wear_period_military_uniforms'),

  anchor('wd_soldier_fantasy', 'wardrobe',
    [['profession', 'in', 'soldier,knight,warrior'], ['genre', 'in', 'fantasy']],
    'primary_outfit', 'chainmail_and_surcoat', 0.88, 100,
    'registry_rule: wd_soldier_fantasy',
    'profession=soldier/knight',
    'genre=fantasy',
    'fantasy_soldiers_wear_chainmail_and_surcoats'),

  anchor('wd_soldier_future', 'wardrobe',
    [['profession', 'in', 'soldier,marine'], ['period', 'regex', 'future|2087|distant']],
    'primary_outfit', 'armored_exosuit', 0.85, 100,
    'registry_rule: wd_soldier_future',
    'profession=soldier',
    'period=future',
    'future_soldiers_wear_armored_exosuits'),

  // ── Knight / Warrior ──
  anchor('wd_knight_armor', 'wardrobe',
    [['profession', 'in', 'knight,warrior,paladin'], ['genre', 'in', 'fantasy']],
    'primary_outfit', 'plate_armor', 0.92, 100,
    'registry_rule: wd_knight_armor',
    'profession=knight',
    'genre=fantasy',
    'fantasy_knights_wear_plate_armor'),

  anchor('wd_knight_crime', 'wardrobe',
    [['profession', 'in', 'knight,warrior'], ['genre', 'in', 'crime,thriller']],
    'primary_outfit', 'tactical_gear', 0.60, 70,
    'registry_rule: wd_knight_crime',
    'profession=knight/warrior',
    'genre=crime/thriller',
    'modern_combatants_wear_tactical_gear'),

  anchor('wd_knight_period', 'wardrobe',
    [['profession', 'in', 'knight,warrior'], ['genre', 'in', 'historical,period']],
    'primary_outfit', 'period_knight_armor', 0.95, 100,
    'registry_rule: wd_knight_period',
    'profession=knight',
    'genre=historical',
    'historical_knights_wear_authentic_period_armor'),

  // ── Courier / Messenger ──
  anchor('wd_courier_general', 'wardrobe',
    [['profession', 'in', 'courier,messenger,runner,delivery']],
    'primary_outfit', 'utility_clothing', 0.80, 80,
    'registry_rule: wd_courier_general',
    'profession=courier',
    'couriers_wear_practical_utility_clothing'),

  anchor('wd_courier_future', 'wardrobe',
    [['profession', 'in', 'courier,messenger,runner,delivery'], ['period', 'regex', 'future|2087|distant']],
    'primary_outfit', 'tech_utility_gear', 0.85, 90,
    'registry_rule: wd_courier_future',
    'profession=courier',
    'period=future',
    'future_couriers_wear_tech_utility_gear'),

  anchor('wd_courier_historical', 'wardrobe',
    [['profession', 'in', 'courier,messenger,runner'], ['genre', 'in', 'historical,period']],
    'primary_outfit', 'traveling_attire', 0.78, 85,
    'registry_rule: wd_courier_historical',
    'profession=courier',
    'genre=historical',
    'historical_couriers_wear_traveling_attire'),

  anchor('wd_courier_fantasy', 'wardrobe',
    [['profession', 'in', 'courier,messenger,rider'], ['genre', 'in', 'fantasy']],
    'primary_outfit', 'riding_outfit', 0.82, 85,
    'registry_rule: wd_courier_fantasy',
    'profession=courier/rider',
    'genre=fantasy',
    'fantasy_couriers_wear_riding_outfits'),

  // ── Doctor / Medical ──
  anchor('wd_doctor_modern', 'wardrobe',
    [['profession', 'in', 'doctor,physician,surgeon,medic'], ['period', 'regex', 'contemporary|modern|2000|2020']],
    'primary_outfit', 'white_coat', 0.93, 100,
    'registry_rule: wd_doctor_modern',
    'profession=doctor',
    'period=modern',
    'modern_doctors_wear_white_coats'),

  anchor('wd_doctor_historical', 'wardrobe',
    [['profession', 'in', 'doctor,physician,medic'], ['genre', 'in', 'historical,period']],
    'primary_outfit', 'period_medical_attire', 0.85, 100,
    'registry_rule: wd_doctor_historical',
    'profession=doctor',
    'genre=historical',
    'historical_doctors_wear_period_medical_attire'),

  anchor('wd_doctor_future', 'wardrobe',
    [['profession', 'in', 'doctor,physician,medic'], ['period', 'regex', 'future|2087|distant']],
    'primary_outfit', 'sterile_future_scrubs', 0.82, 100,
    'registry_rule: wd_doctor_future',
    'profession=doctor',
    'period=future',
    'future_doctors_wear_sterile_scrubs'),

  // ── Civilian / Default ──
  anchor('wd_civilian_modern', 'wardrobe',
    [['profession', 'any', ''], ['period', 'regex', 'contemporary|modern|2000|2020']],
    'primary_outfit', 'casual_modern_clothing', 0.60, 10,
    'registry_rule: wd_civilian_modern',
    'default: modern civilian'),
  
  anchor('wd_civilian_historical', 'wardrobe',
    [['profession', 'any', ''], ['genre', 'in', 'historical,period']],
    'primary_outfit', 'period_civilian_clothing', 0.75, 20,
    'registry_rule: wd_civilian_historical',
    'default: historical civilian'),
  
  anchor('wd_civilian_fantasy', 'wardrobe',
    [['profession', 'any', ''], ['genre', 'in', 'fantasy']],
    'primary_outfit', 'fantasy_civilian_clothing', 0.70, 20,
    'registry_rule: wd_civilian_fantasy',
    'default: fantasy civilian'),

  anchor('wd_civilian_future', 'wardrobe',
    [['profession', 'any', ''], ['period', 'regex', 'future|2087|distant']],
    'primary_outfit', 'future_civilian_clothing', 0.65, 20,
    'registry_rule: wd_civilian_future',
    'default: future civilian'),

  // ── Secondary wardrobe fields ──
  anchor('wd_detective_footwear', 'wardrobe',
    [['profession', 'eq', 'detective']],
    'footwear', 'practical_shoes', 0.78, 80,
    'registry_rule: wd_detective_footwear',
    'profession=detective',
    'detectives_wear_practical_shoes'),

  anchor('wd_detective_headwear', 'wardrobe',
    [['profession', 'eq', 'detective'], ['genre', 'in', 'noir,crime']],
    'headwear', 'fedora', 0.85, 90,
    'registry_rule: wd_detective_headwear',
    'profession=detective',
    'genre=noir/crime',
    'noir_detectives_wear_fedoras'),

  anchor('wd_knight_footwear', 'wardrobe',
    [['profession', 'in', 'knight,warrior,paladin']],
    'footwear', 'combat_boots', 0.88, 90,
    'registry_rule: wd_knight_footwear',
    'profession=knight/warrior',
    'knights_wear_combat_boots'),

  anchor('wd_courier_headwear', 'wardrobe',
    [['profession', 'in', 'courier,messenger,runner,delivery']],
    'headwear', 'weather_hat', 0.65, 60,
    'registry_rule: wd_courier_headwear',
    'profession=courier',
    'couriers_wear_weather_hats'),

  anchor('wd_doctor_footwear', 'wardrobe',
    [['profession', 'in', 'doctor,physician,surgeon,medic']],
    'footwear', 'comfortable_shoes', 0.70, 70,
    'registry_rule: wd_doctor_footwear',
    'profession=doctor',
    'doctors_wear_comfortable_shoes'),

  // ── Climate-Focused Adjustments ──
  anchor('wd_cold_weather', 'wardrobe',
    [['climate', 'in', 'cold_snowy,arctic,sub_arctic']],
    'outerwear', 'heavy_coat', 0.88, 95,
    'registry_rule: wd_cold_weather',
    'climate=cold/snowy',
    'cold_climate_requires_heavy_coat'),

  anchor('wd_hot_weather', 'wardrobe',
    [['climate', 'in', 'hot_arid,arid,tropical_humid']],
    'outerwear', 'light_jacket', 0.75, 85,
    'registry_rule: wd_hot_weather',
    'climate=hot/arid',
    'hot_climate_requires_light_clothing'),

  anchor('wd_rain_weather', 'wardrobe',
    [['climate', 'in', 'temperate_rainy,rainy,wet']],
    'outerwear', 'rain_proof_jacket', 0.82, 90,
    'registry_rule: wd_rain_weather',
    'climate=rainy',
    'rainy_climate_requires_rain_proof_jacket'),
];

// ══════════════════════════════════════════════════════════════════════
//  PROP RULES — Master Registry
// ══════════════════════════════════════════════════════════════════════

const PROP_ANCHORS: RegistryAnchor[] = [

  // ── Detective / Investigator ──
  anchor('pr_detective_notebook', 'prop',
    [['profession', 'eq', 'detective']],
    'primary_prop', 'notebook', 0.90, 100,
    'registry_rule: pr_detective_notebook',
    'profession=detective',
    'detectives_carry_notebooks'),

  anchor('pr_detective_pen', 'prop',
    [['profession', 'eq', 'detective']],
    'writing_tool', 'pen', 0.88, 100,
    'registry_rule: pr_detective_pen',
    'profession=detective',
    'detectives_carry_pens'),

  anchor('pr_detective_radio', 'prop',
    [['profession', 'eq', 'detective'], ['period', 'regex', 'contemporary|modern|2000|2020|near_future']],
    'communication', 'police_radio', 0.80, 90,
    'registry_rule: pr_detective_radio',
    'profession=detective',
    'period=modern',
    'modern_detectives_have_police_radios'),

  anchor('pr_detective_future_comms', 'prop',
    [['profession', 'eq', 'detective'], ['period', 'regex', 'future|2087|distant']],
    'communication', 'neural_link', 0.75, 90,
    'registry_rule: pr_detective_future_comms',
    'profession=detective',
    'period=future',
    'future_detectives_use_neural_links'),

  anchor('pr_detective_period_comms', 'prop',
    [['profession', 'eq', 'detective'], ['period', 'regex', '1940s|interwar|wwii']],
    'communication', 'desk_telephone', 0.85, 90,
    'registry_rule: pr_detective_period_comms',
    'profession=detective',
    'period=1940s',
    'period_detectives_use_desk_telephones'),

  anchor('pr_detective_flashlight', 'prop',
    [['profession', 'eq', 'detective']],
    'utility', 'flashlight', 0.70, 70,
    'registry_rule: pr_detective_flashlight',
    'profession=detective',
    'detectives_carry_flashlights'),

  anchor('pr_detective_fantasy', 'prop',
    [['profession', 'eq', 'detective'], ['genre', 'in', 'fantasy']],
    'primary_prop', 'scroll_of_records', 0.60, 80,
    'registry_rule: pr_detective_fantasy',
    'profession=detective',
    'genre=fantasy',
    'fantasy_detectives_carry_records'),

  // ── Knight / Warrior ──
  anchor('pr_knight_weapon_melee', 'prop',
    [['profession', 'in', 'knight,warrior,paladin']],
    'primary_weapon', 'sword', 0.93, 100,
    'registry_rule: pr_knight_weapon_melee',
    'profession=knight',
    'knights_carry_swords'),

  anchor('pr_knight_shield', 'prop',
    [['profession', 'in', 'knight,warrior']],
    'shield', 'kite_shield', 0.85, 90,
    'registry_rule: pr_knight_shield',
    'profession=knight',
    'knights_carry_shields'),

  anchor('pr_knight_period_weapon', 'prop',
    [['profession', 'in', 'knight,warrior'], ['genre', 'in', 'historical,period']],
    'primary_weapon', 'period_sword', 0.95, 100,
    'registry_rule: pr_knight_period_weapon',
    'profession=knight',
    'genre=historical',
    'historical_knights_use_period_weapons'),

  anchor('pr_knight_horse', 'prop',
    [['profession', 'in', 'knight,rider,warrior'], ['genre', 'in', 'fantasy,historical']],
    'mount', 'horse', 0.92, 100,
    'registry_rule: pr_knight_horse',
    'profession=knight/rider',
    'genre=fantasy/historical',
    'knights_and_riders_have_horses'),

  anchor('pr_knight_banner', 'prop',
    [['profession', 'in', 'knight,rider,warrior'], ['genre', 'in', 'fantasy,historical']],
    'heraldry', 'heraldic_banner', 0.78, 80,
    'registry_rule: pr_knight_banner',
    'profession=knight',
    'genre=fantasy/historical',
    'knights_carry_heraldic_banners'),

  // ── Courier / Messenger ──
  anchor('pr_courier_package', 'prop',
    [['profession', 'in', 'courier,messenger,runner,delivery']],
    'primary_prop', 'package', 0.92, 100,
    'registry_rule: pr_courier_package',
    'profession=courier',
    'couriers_carry_packages'),

  anchor('pr_courier_bag', 'prop',
    [['profession', 'in', 'courier,messenger,runner,delivery']],
    'carrier', 'delivery_bag', 0.88, 100,
    'registry_rule: pr_courier_bag',
    'profession=courier',
    'couriers_carry_delivery_bags'),

  anchor('pr_courier_scanner', 'prop',
    [['profession', 'in', 'courier,messenger,delivery'], ['period', 'regex', 'contemporary|modern|2000|2020|near_future']],
    'scanner', 'package_scanner', 0.75, 80,
    'registry_rule: pr_courier_scanner',
    'profession=courier',
    'period=modern',
    'modern_couriers_use_package_scanners'),

  anchor('pr_courier_future_scanner', 'prop',
    [['profession', 'in', 'courier,messenger,delivery'], ['period', 'regex', 'future|2087|distant']],
    'scanner', 'holographic_reader', 0.78, 80,
    'registry_rule: pr_courier_future_scanner',
    'profession=courier',
    'period=future',
    'future_couriers_use_holographic_readers'),

  // ── Doctor / Medical ──
  anchor('pr_doctor_stethoscope', 'prop',
    [['profession', 'in', 'doctor,physician,medic']],
    'primary_prop', 'stethoscope', 0.92, 100,
    'registry_rule: pr_doctor_stethoscope',
    'profession=doctor',
    'doctors_carry_stethoscopes'),

  anchor('pr_doctor_clipboard', 'prop',
    [['profession', 'in', 'doctor,physician']],
    'record_prop', 'clipboard', 0.78, 80,
    'registry_rule: pr_doctor_clipboard',
    'profession=doctor',
    'doctors_carry_clipboards'),

  anchor('pr_doctor_medkit', 'prop',
    [['profession', 'in', 'doctor,medic']],
    'medical_kit', 'medkit', 0.85, 90,
    'registry_rule: pr_doctor_medkit',
    'profession=doctor/medic',
    'medical_personnel_carry_medkits'),

  // ── General Profession Props ──
  anchor('pr_professor_book', 'prop',
    [['profession', 'in', 'professor,teacher,academic']],
    'primary_prop', 'book', 0.90, 100,
    'registry_rule: pr_professor_book',
    'profession=professor',
    'academics_carry_books'),

  anchor('pr_chef_knife', 'prop',
    [['profession', 'in', 'chef,cook,culinary']],
    'primary_prop', 'chef_knife', 0.90, 100,
    'registry_rule: pr_chef_knife',
    'profession=chef',
    'chefs_carry_chef_knives'),

  anchor('pr_worker_tools', 'prop',
    [['profession', 'in', 'worker,construction,mechanic,engineer']],
    'primary_prop', 'toolbox', 0.85, 90,
    'registry_rule: pr_worker_tools',
    'profession=worker',
    'workers_carry_toolboxes'),

  anchor('pr_bartender_glass', 'prop',
    [['profession', 'in', 'bartender,barman,barmaid']],
    'primary_prop', 'glass_towel', 0.80, 90,
    'registry_rule: pr_bartender_glass',
    'profession=bartender',
    'bartenders_carry_glasses_and_towels'),

  anchor('pr_priest_book', 'prop',
    [['profession', 'in', 'priest,clergy,minister']],
    'primary_prop', 'religious_book', 0.88, 100,
    'registry_rule: pr_priest_book',
    'profession=priest',
    'clergy_carry_religious_texts'),

  // ── Technology-Based Props ──
  anchor('pr_modern_phone', 'prop',
    [['profession', 'any', ''], ['technology_level', 'in', 'contemporary,digital,advanced_contemporary,advanced,modern']],
    'tech_carry', 'smartphone', 0.75, 10,
    'registry_rule: pr_modern_phone',
    'technology_level=modern',
    'modern_characters_carry_smartphones'),

  anchor('pr_future_terminal', 'prop',
    [['profession', 'any', ''], ['period', 'regex', 'future|2087|distant']],
    'tech_carry', 'portable_terminal', 0.72, 20,
    'registry_rule: pr_future_terminal',
    'period=future',
    'future_characters_carry_portable_terminals'),

  anchor('pr_historical_none', 'prop',
    [['profession', 'any', ''], ['genre', 'in', 'historical,period']],
    'tech_carry', 'none', 0.85, 30,
    'registry_rule: pr_historical_none',
    'genre=historical',
    'historical_characters_dont_carry_technology'),
];

// ══════════════════════════════════════════════════════════════════════
//  VEHICLE RULES — Context-Driven Inference
// ══════════════════════════════════════════════════════════════════════
// Driven by: period, technology_level, infrastructure, geography,
// economy, class_structure, transport_function, genre
//
// Transport function layer maps profession -> military/civilian/etc.

const VEHICLE_ANCHORS: RegistryAnchor[] = [

  // ── Military Vehicles (transport_function=military) ──

  anchor('vh_military_wwii', 'vehicle',
    [['transport_function', 'eq', 'military'], ['period', 'regex', '1940s|wwii|interwar']],
    'primary_vehicle', 'military_truck', 0.88, 100,
    'registry_rule: vh_military_wwii',
    'transport_function=military',
    'period=1940s/wwii',
    'military_personnel_in_wwii_use_military_trucks'),

  anchor('vh_military_wwii_heavy', 'vehicle',
    [['transport_function', 'eq', 'military'], ['period', 'regex', '1940s|wwii']],
    'heavy_vehicle', 'artillery_transport', 0.82, 90,
    'registry_rule: vh_military_wwii_heavy',
    'transport_function=military',
    'period=wwii',
    'wwii_military_operations_require_artillery_transport'),

  anchor('vh_military_modern', 'vehicle',
    [['transport_function', 'eq', 'military'], ['period', 'regex', 'contemporary|modern|2000|2020|near_future']],
    'primary_vehicle', 'armored_personnel_carrier', 0.85, 95,
    'registry_rule: vh_military_modern',
    'transport_function=military',
    'period=modern',
    'modern_military_personnel_use_armored_vehicles'),

  anchor('vh_military_modern_jeep', 'vehicle',
    [['transport_function', 'eq', 'military'], ['period', 'regex', 'contemporary|modern|2000|2020']],
    'light_vehicle', 'military_jeep', 0.80, 90,
    'registry_rule: vh_military_modern_jeep',
    'transport_function=military',
    'period=modern',
    'modern_reconnaissance_forces_use_military_jeeps'),

  anchor('vh_military_fantasy', 'vehicle',
    [['transport_function', 'eq', 'military'], ['period', 'in', 'fantasy_medieval,medieval']],
    'primary_vehicle', 'warhorse', 0.90, 100,
    'registry_rule: vh_military_fantasy',
    'transport_function=military',
    'period=fantasy_medieval',
    'fantasy_military_forces_ride_warhorses'),

  anchor('vh_military_fantasy_chariot', 'vehicle',
    [['transport_function', 'eq', 'military'], ['period', 'in', 'fantasy_medieval,ancient,medieval'], ['technology_level', 'in', 'pre_industrial,ancient']],
    'heavy_vehicle', 'war_chariot', 0.75, 85,
    'registry_rule: vh_military_fantasy_chariot',
    'transport_function=military',
    'period=ancient/fantasy_medieval',
    'technology_level=pre_industrial',
    'ancient_military_forces_use_war_chariots'),

  anchor('vh_military_future', 'vehicle',
    [['transport_function', 'eq', 'military'], ['period', 'regex', 'future|2087|distant']],
    'primary_vehicle', 'hover_tank', 0.82, 95,
    'registry_rule: vh_military_future',
    'transport_function=military',
    'period=future',
    'future_military_forces_use_hover_tanks'),

  anchor('vh_military_future_apc', 'vehicle',
    [['transport_function', 'eq', 'military'], ['period', 'regex', 'future|2087|distant']],
    'light_vehicle', 'armored_hovercraft', 0.78, 85,
    'registry_rule: vh_military_future_apc',
    'transport_function=military',
    'period=future',
    'future_reconnaissance_forces_use_armored_hovercrafts'),

  // ── Emergency Services Vehicles ──

  anchor('vh_emergency_police_modern', 'vehicle',
    [['transport_function', 'eq', 'emergency_services'], ['period', 'regex', 'contemporary|modern|2000|2020|near_future']],
    'primary_vehicle', 'police_cruiser', 0.88, 100,
    'registry_rule: vh_emergency_police_modern',
    'transport_function=emergency_services',
    'period=modern',
    'modern_police_use_police_cruisers'),

  anchor('vh_emergency_police_wwii', 'vehicle',
    [['transport_function', 'eq', 'emergency_services'], ['period', 'regex', '1940s|wwii|interwar']],
    'primary_vehicle', 'vintage_police_car', 0.80, 90,
    'registry_rule: vh_emergency_police_wwii',
    'transport_function=emergency_services',
    'period=1940s',
    'wwii_police_use_vintage_police_cars'),

  anchor('vh_emergency_police_future', 'vehicle',
    [['transport_function', 'eq', 'emergency_services'], ['period', 'regex', 'future|2087|distant']],
    'primary_vehicle', 'police_hovercraft', 0.82, 90,
    'registry_rule: vh_emergency_police_future',
    'transport_function=emergency_services',
    'period=future',
    'future_police_use_hovercrafts'),

  anchor('vh_emergency_medic_modern', 'vehicle',
    [['transport_function', 'eq', 'emergency_services'], ['period', 'regex', 'contemporary|modern|2000|2020']],
    'medical_vehicle', 'ambulance', 0.85, 95,
    'registry_rule: vh_emergency_medic_modern',
    'transport_function=emergency_services',
    'period=modern',
    'modern_paramedics_use_ambulances'),

  anchor('vh_emergency_fire_modern', 'vehicle',
    [['transport_function', 'eq', 'emergency_services'], ['profession', 'eq', 'firefighter']],
    'primary_vehicle', 'fire_truck', 0.90, 100,
    'registry_rule: vh_emergency_fire_modern',
    'transport_function=emergency_services',
    'profession=firefighter',
    'firefighters_use_fire_trucks'),

  // ── Commercial Vehicles ──

  anchor('vh_commercial_modern', 'vehicle',
    [['transport_function', 'eq', 'commercial'], ['period', 'regex', 'contemporary|modern|2000|2020']],
    'primary_vehicle', 'delivery_van', 0.85, 90,
    'registry_rule: vh_commercial_modern',
    'transport_function=commercial',
    'period=modern',
    'modern_couriers_and_delivery_personnel_use_delivery_vans'),

  anchor('vh_commercial_modern_truck', 'vehicle',
    [['transport_function', 'eq', 'commercial'], ['period', 'regex', 'contemporary|modern|2000|2020'], ['profession', 'in', 'trucker,delivery']],
    'heavy_vehicle', 'delivery_truck', 0.88, 95,
    'registry_rule: vh_commercial_modern_truck',
    'transport_function=commercial',
    'period=modern',
    'profession=trucker/delivery',
    'truckers_and_delivery_drivers_use_delivery_trucks'),

  anchor('vh_commercial_taxi_modern', 'vehicle',
    [['transport_function', 'eq', 'commercial'], ['profession', 'in', 'taxi,driver']],
    'primary_vehicle', 'taxi_cab', 0.87, 95,
    'registry_rule: vh_commercial_taxi_modern',
    'transport_function=commercial',
    'profession=taxi/driver',
    'taxi_drivers_use_taxi_cabs'),

  anchor('vh_commercial_wwii', 'vehicle',
    [['transport_function', 'eq', 'commercial'], ['period', 'regex', '1940s|wwii|interwar']],
    'primary_vehicle', 'vintage_delivery_truck', 0.78, 85,
    'registry_rule: vh_commercial_wwii',
    'transport_function=commercial',
    'period=1940s',
    'wwii_commercial_vehicles_are_vintage_delivery_trucks'),

  anchor('vh_commercial_future', 'vehicle',
    [['transport_function', 'eq', 'commercial'], ['period', 'regex', 'future|2087|distant']],
    'primary_vehicle', 'autonomous_freight_carrier', 0.80, 90,
    'registry_rule: vh_commercial_future',
    'transport_function=commercial',
    'period=future',
    'future_commercial_transport_uses_autonomous_freight_carriers'),

  anchor('vh_commercial_fantasy', 'vehicle',
    [['transport_function', 'eq', 'commercial'], ['period', 'in', 'fantasy_medieval,medieval,ancient']],
    'primary_vehicle', 'beast_drawn_cart', 0.82, 85,
    'registry_rule: vh_commercial_fantasy',
    'transport_function=commercial',
    'period=fantasy_medieval/ancient',
    'fantasy_commercial_transport_uses_beast_drawn_carts'),

  // ── Civilian Transport Vehicles ──

  anchor('vh_civilian_modern', 'vehicle',
    [['transport_function', 'eq', 'civilian_transport'], ['period', 'regex', 'contemporary|modern|2000|2020']],
    'primary_vehicle', 'sedan', 0.72, 80,
    'registry_rule: vh_civilian_modern',
    'transport_function=civilian_transport',
    'period=modern',
    'modern_civilians_use_sedans_for_personal_transport'),

  anchor('vh_civilian_modern_economy', 'vehicle',
    [['transport_function', 'eq', 'civilian_transport'], ['period', 'regex', 'contemporary|modern|2000|2020'], ['economy', 'in', 'industrial,post_industrial,developed']],
    'primary_vehicle', 'compact_car', 0.65, 70,
    'registry_rule: vh_civilian_modern_economy',
    'transport_function=civilian_transport',
    'period=modern',
    'economy=developed',
    'modern_civilians_in_developed_economies_use_compact_cars'),

  anchor('vh_civilian_modern_luxury', 'vehicle',
    [['transport_function', 'eq', 'civilian_transport'], ['class_structure', 'in', 'stratified,corporate']],
    'primary_vehicle', 'luxury_sedan', 0.60, 65,
    'registry_rule: vh_civilian_modern_luxury',
    'transport_function=civilian_transport',
    'class_structure=stratified/corporate',
    'stratified_societies_use_luxury_vehicles_for_elite_transport'),

  anchor('vh_civilian_wwii', 'vehicle',
    [['transport_function', 'eq', 'civilian_transport'], ['period', 'regex', '1940s|wwii|interwar']],
    'primary_vehicle', 'vintage_car', 0.78, 85,
    'registry_rule: vh_civilian_wwii',
    'transport_function=civilian_transport',
    'period=1940s',
    'wwii_civilians_use_vintage_cars'),

  anchor('vh_civilian_future', 'vehicle',
    [['transport_function', 'eq', 'civilian_transport'], ['period', 'regex', 'future|2087|distant']],
    'primary_vehicle', 'hover_car', 0.75, 85,
    'registry_rule: vh_civilian_future',
    'transport_function=civilian_transport',
    'period=future',
    'future_civilians_use_hover_cars'),

  anchor('vh_civilian_fantasy', 'vehicle',
    [['transport_function', 'eq', 'civilian_transport'], ['period', 'in', 'fantasy_medieval,medieval,ancient']],
    'primary_vehicle', 'riding_horse', 0.78, 80,
    'registry_rule: vh_civilian_fantasy',
    'transport_function=civilian_transport',
    'period=fantasy_medieval',
    'fantasy_civilians_ride_horses_for_transport'),

  anchor('vh_civilian_fantasy_wagon', 'vehicle',
    [['transport_function', 'eq', 'civilian_transport'], ['period', 'in', 'fantasy_medieval,medieval,ancient'], ['economy', 'in', 'agrarian,feudal']],
    'heavy_vehicle', 'wagon', 0.75, 75,
    'registry_rule: vh_civilian_fantasy_wagon',
    'transport_function=civilian_transport',
    'period=fantasy_medieval',
    'economy=agrarian/feudal',
    'feudal_civilians_use_wagons_for_heavy_transport'),

  anchor('vh_civilian_prehistoric', 'vehicle',
    [['period', 'regex', 'prehistoric|primitive|stone_age']],
    'primary_vehicle', 'primitive_travois', 0.70, 75,
    'registry_rule: vh_civilian_prehistoric',
    'period=prehistoric',
    'prehistoric_humans_use_primitive_travois_for_transport'),

  // ── Civilian Utility Vehicles ──

  anchor('vh_utility_modern', 'vehicle',
    [['transport_function', 'eq', 'civilian_utility'], ['period', 'regex', 'contemporary|modern|2000|2020']],
    'primary_vehicle', 'utility_pickup', 0.82, 85,
    'registry_rule: vh_utility_modern',
    'transport_function=civilian_utility',
    'period=modern',
    'modern_workers_and_farmers_use_utility_pickups'),

  anchor('vh_utility_modern_van', 'vehicle',
    [['transport_function', 'eq', 'civilian_utility'], ['period', 'regex', 'contemporary|modern|2000|2020'], ['profession', 'in', 'construction,worker,mechanic']],
    'heavy_vehicle', 'work_van', 0.78, 80,
    'registry_rule: vh_utility_modern_van',
    'transport_function=civilian_utility',
    'period=modern',
    'profession=construction/worker',
    'construction_workers_use_work_vans'),

  anchor('vh_utility_modern_agri', 'vehicle',
    [['transport_function', 'eq', 'civilian_utility'], ['profession', 'in', 'farmer,rancher']],
    'heavy_vehicle', 'farm_tractor', 0.80, 85,
    'registry_rule: vh_utility_modern_agri',
    'transport_function=civilian_utility',
    'profession=farmer/rancher',
    'farmers_use_tractors'),

  anchor('vh_utility_wwii', 'vehicle',
    [['transport_function', 'eq', 'civilian_utility'], ['period', 'regex', '1940s|wwii|interwar']],
    'primary_vehicle', 'vintage_pickup_truck', 0.75, 80,
    'registry_rule: vh_utility_wwii',
    'transport_function=civilian_utility',
    'period=1940s',
    'wwii_workers_use_vintage_pickup_trucks'),

  anchor('vh_utility_future', 'vehicle',
    [['transport_function', 'eq', 'civilian_utility'], ['period', 'regex', 'future|2087|distant']],
    'primary_vehicle', 'utility_hovercraft', 0.75, 80,
    'registry_rule: vh_utility_future',
    'transport_function=civilian_utility',
    'period=future',
    'future_workers_use_utility_hovercrafts'),

  anchor('vh_utility_fantasy', 'vehicle',
    [['transport_function', 'eq', 'civilian_utility'], ['period', 'in', 'fantasy_medieval,medieval,ancient']],
    'primary_vehicle', 'pack_mule', 0.72, 75,
    'registry_rule: vh_utility_fantasy',
    'transport_function=civilian_utility',
    'period=fantasy_medieval/ancient',
    'fantasy_workers_use_pack_mules'),

  // ── Geography-Enhanced Variants ──

  anchor('vh_arctic_vehicle', 'vehicle',
    [['geography', 'in', 'arctic,tundra,snow'], ['period', 'regex', 'contemporary|modern|2000|2020']],
    'specialized_vehicle', 'snow_mobile', 0.78, 80,
    'registry_rule: vh_arctic_vehicle',
    'geography=arctic/tundra',
    'period=modern',
    'arctic_regions_require_snow_mobiles'),

  anchor('vh_mountain_vehicle', 'vehicle',
    [['geography', 'in', 'mountainous,alpine'], ['technology_level', 'in', 'contemporary,modern,advanced']],
    'specialized_vehicle', 'all_terrain_vehicle', 0.80, 80,
    'registry_rule: vh_mountain_vehicle',
    'geography=mountainous',
    'technology_level=modern',
    'mountainous_terrain_requires_ATVs'),

  anchor('vh_coastal_vehicle', 'vehicle',
    [['geography', 'in', 'coastal,island,maritime']],
    'specialized_vehicle', 'fishing_boat', 0.70, 70,
    'registry_rule: vh_coastal_vehicle',
    'geography=coastal/maritime',
    'coastal_regions_use_boats_for_transport'),

  // ── Catch-All: Low-Confidence Fallbacks (priority=0) ──

  anchor('vh_catchall_civilian', 'vehicle',
    [['transport_function', 'eq', 'civilian_transport']],
    'primary_vehicle', 'civilian_vehicle', 0.30, 0,
    'registry_rule: vh_catchall_civilian',
    'low_confidence_placeholder',
    'insufficient_context_for_specific_vehicle_inference'),

  anchor('vh_catchall_military', 'vehicle',
    [['transport_function', 'eq', 'military']],
    'primary_vehicle', 'military_vehicle', 0.30, 0,
    'registry_rule: vh_catchall_military',
    'low_confidence_placeholder',
    'insufficient_context_for_specific_military_vehicle_inference'),

  anchor('vh_catchall_commercial', 'vehicle',
    [['transport_function', 'eq', 'commercial']],
    'primary_vehicle', 'commercial_vehicle', 0.30, 0,
    'registry_rule: vh_catchall_commercial',
    'low_confidence_placeholder',
    'insufficient_context_for_specific_commercial_vehicle_inference'),

  anchor('vh_catchall_emergency', 'vehicle',
    [['transport_function', 'eq', 'emergency_services']],
    'primary_vehicle', 'emergency_vehicle', 0.30, 0,
    'registry_rule: vh_catchall_emergency',
    'low_confidence_placeholder',
    'insufficient_context_for_specific_emergency_vehicle_inference'),

  anchor('vh_catchall_utility', 'vehicle',
    [['transport_function', 'eq', 'civilian_utility']],
    'primary_vehicle', 'utility_vehicle', 0.30, 0,
    'registry_rule: vh_catchall_utility',
    'low_confidence_placeholder',
    'insufficient_context_for_specific_utility_vehicle_inference'),
];



// ══════════════════════════════════════════════════════════════════════
//  CREATURE RULES — Context-Driven Inference
// ══════════════════════════════════════════════════════════════════════
// Driven by: genre, period, mythology, ecology, biome, threat_role,
// intelligence, symbolism, narrative_function

const CREATURE_ANCHORS: RegistryAnchor[] = [

  // ── Fantasy Creatures ──

  anchor('cr_fantasy_dragon', 'creature',
    [['genre', 'in', 'fantasy,epic,mythic'], ['threat_role', 'in', 'predator,guardian,antagonist'], ['period', 'in', 'fantasy_medieval,medieval,ancient']],
    'creature_type', 'dragon', 0.88, 100,
    'registry_rule: cr_fantasy_dragon',
    'genre=fantasy/epic',
    'threat_role=predator/guardian',
    'period=fantasy_medieval',
    'fantasy_settings_with_dangerous_creatures_feature_dragons'),

  anchor('cr_fantasy_griffin', 'creature',
    [['genre', 'in', 'fantasy,epic'], ['period', 'in', 'fantasy_medieval,ancient'], ['biome', 'in', 'mountain,forest']],
    'creature_type', 'griffin', 0.75, 85,
    'registry_rule: cr_fantasy_griffin',
    'genre=fantasy/epic',
    'period=fantasy_medieval',
    'biome=mountain/forest',
    'fantasy_settings_in_mountainous_areas_feature_griffins'),

  anchor('cr_fantasy_beast', 'creature',
    [['genre', 'in', 'fantasy,epic,mythic'], ['threat_role', 'in', 'predator,guardian']],
    'creature_type', 'beast_archetype', 0.70, 80,
    'registry_rule: cr_fantasy_beast',
    'genre=fantasy',
    'threat_role=predator',
    'fantasy_settings_feature_mythical_beasts'),

  anchor('cr_fantasy_guardian', 'creature',
    [['genre', 'in', 'fantasy,epic'], ['narrative_function', 'in', 'guardian,ally,companion']],
    'creature_type', 'sacred_guardian', 0.78, 85,
    'registry_rule: cr_fantasy_guardian',
    'genre=fantasy',
    'narrative_function=guardian',
    'fantasy_settings_with_guardian_roles_feature_sacred_beasts'),

  anchor('cr_fantasy_horse', 'creature',
    [['genre', 'in', 'fantasy,historical'], ['narrative_function', 'in', 'transport,companion']],
    'creature_type', 'warhorse', 0.85, 90,
    'registry_rule: cr_fantasy_horse',
    'genre=fantasy/historical',
    'narrative_function=transport',
    'fantasy_transport_animals_are_warhorses'),

  anchor('cr_fantasy_ambient', 'creature',
    [['genre', 'in', 'fantasy,epic'], ['narrative_function', 'eq', 'ambient']],
    'creature_type', 'ambient_wildlife', 0.65, 60,
    'registry_rule: cr_fantasy_ambient',
    'genre=fantasy',
    'narrative_function=ambient',
    'fantasy_ambient_wildlife'),

  anchor('cr_fantasy_small', 'creature',
    [['genre', 'in', 'fantasy,epic'], ['intelligence', 'in', 'instinctual,animal']],
    'creature_type', 'small_fantasy_creature', 0.55, 50,
    'registry_rule: cr_fantasy_small',
    'genre=fantasy',
    'intelligence=instinctual',
    'fantasy_settings_have_small_mythical_creatures'),

  // ── Horror Creatures ──

  anchor('cr_horror_stalker', 'creature',
    [['genre', 'in', 'horror,thriller,suspense'], ['threat_role', 'in', 'predator,antagonist']],
    'creature_type', 'stalking_predator', 0.82, 100,
    'registry_rule: cr_horror_stalker',
    'genre=horror',
    'threat_role=predator',
    'horror_settings_feature_stalking_predators'),

  anchor('cr_horror_parasite', 'creature',
    [['genre', 'in', 'horror,body_horror'], ['ecology', 'in', 'engineered,parasitic,supernatural']],
    'creature_type', 'parasitic_presence', 0.75, 90,
    'registry_rule: cr_horror_parasite',
    'genre=body_horror',
    'ecology=parasitic',
    'body_horror_settings_feature_parasitic_presences'),

  anchor('cr_horror_unknown', 'creature',
    [['genre', 'in', 'horror,thriller,suspense']],
    'creature_type', 'unknown_threat', 0.65, 60,
    'registry_rule: cr_horror_unknown',
    'genre=horror',
    'horror_settings_feature_unknown_threats'),

  // ── Sci-Fi Creatures ──

  anchor('cr_scifi_alien', 'creature',
    [['genre', 'in', 'sci_fi,cyberpunk,space_opera'], ['ecology', 'in', 'alien,engineered']],
    'creature_type', 'alien_organism', 0.85, 100,
    'registry_rule: cr_scifi_alien',
    'genre=sci_fi/cyberpunk',
    'ecology=alien',
    'sci_fi_settings_feature_alien_organisms'),

  anchor('cr_scifi_engineered', 'creature',
    [['genre', 'in', 'sci_fi,cyberpunk,biopunk'], ['threat_role', 'in', 'bioweapon,experiment']],
    'creature_type', 'engineered_organism', 0.80, 95,
    'registry_rule: cr_scifi_engineered',
    'genre=sci_fi/biopunk',
    'threat_role=bioweapon',
    'sci_fi_with_bioweapon_threats_feature_engineered_organisms'),

  anchor('cr_scifi_robot', 'creature',
    [['genre', 'in', 'sci_fi,cyberpunk'], ['technology_level', 'in', 'sci_fi_advanced,post_human']],
    'creature_type', 'autonomous_drone', 0.72, 85,
    'registry_rule: cr_scifi_robot',
    'genre=sci_fi',
    'technology_level=sci_fi_advanced',
    'advanced_sci_fi_settings_feature_autonomous_drones'),

  anchor('cr_scifi_ambient', 'creature',
    [['genre', 'in', 'sci_fi,space_opera'], ['narrative_function', 'eq', 'ambient']],
    'creature_type', 'alien_ecology', 0.60, 60,
    'registry_rule: cr_scifi_ambient',
    'genre=sci_fi',
    'narrative_function=ambient',
    'sci_fi_ambient_wildlife'),

  // ── Mythological Creatures ──

  anchor('cr_myth_sacred', 'creature',
    [['mythology', 'not_eq', 'none'], ['symbolism', 'in', 'power,wisdom,guardianship']],
    'creature_type', 'symbolic_guardian', 0.82, 95,
    'registry_rule: cr_myth_sacred',
    'mythology=present',
    'symbolism=power/wisdom',
    'mythological_settings_feature_symbolic_guardians'),

  anchor('cr_myth_serpent', 'creature',
    [['mythology', 'in', 'norse,greek,mesoamerican'], ['symbolism', 'in', 'chaos,destruction,rebirth']],
    'creature_type', 'mythic_serpent', 0.78, 90,
    'registry_rule: cr_myth_serpent',
    'mythology=norse/greek',
    'symbolism=chaos/destruction',
    'norse_and_greek_mythology_feature_mythic_serpents'),

  // ── Period-Specific Creatures ──

  anchor('cr_wwii_war_animal', 'creature',
    [['period', 'regex', '1940s|wwii'], ['narrative_function', 'in', 'transport,companion,ambient']],
    'creature_type', 'war_animal', 0.70, 80,
    'registry_rule: cr_wwii_war_animal',
    'period=wwii',
    'narrative_function=transport',
    'wwii_settings_feature_war_animals_mules_horses_dogs'),

  anchor('cr_wwii_military_dog', 'creature',
    [['period', 'regex', '1940s|wwii'], ['threat_role', 'in', 'guardian,combat']],
    'creature_type', 'military_dog', 0.72, 85,
    'registry_rule: cr_wwii_military_dog',
    'period=wwii',
    'threat_role=guardian',
    'wwii_combat_zones_use_military_dogs'),

  anchor('cr_prehistoric_mega', 'creature',
    [['period', 'regex', 'prehistoric|primitive|stone_age'], ['threat_role', 'in', 'predator,antagonist']],
    'creature_type', 'prehistoric_predator', 0.78, 90,
    'registry_rule: cr_prehistoric_mega',
    'period=prehistoric',
    'threat_role=predator',
    'prehistoric_settings_feature_large_predators'),

  anchor('cr_prehistoric_prey', 'creature',
    [['period', 'regex', 'prehistoric|primitive|stone_age']],
    'creature_type', 'prehistoric_herbivore', 0.65, 60,
    'registry_rule: cr_prehistoric_prey',
    'period=prehistoric',
    'prehistoric_settings_have_herbivores'),

  // ── Biome-Based Creatures ──

  anchor('cr_biome_desert', 'creature',
    [['biome', 'in', 'desert,arid'], ['intelligence', 'in', 'instinctual,animal']],
    'creature_type', 'desert_creature', 0.60, 60,
    'registry_rule: cr_biome_desert',
    'biome=desert',
    'desert_biomes_have_specialized_creatures'),

  anchor('cr_biome_forest', 'creature',
    [['biome', 'in', 'forest,jungle,woods']],
    'creature_type', 'forest_creature', 0.55, 50,
    'registry_rule: cr_biome_forest',
    'biome=forest',
    'forest_biomes_have_diverse_wildlife'),

  anchor('cr_biome_ocean', 'creature',
    [['biome', 'in', 'ocean,sea,deep_sea,coastal']],
    'creature_type', 'marine_creature', 0.65, 60,
    'registry_rule: cr_biome_ocean',
    'biome=ocean',
    'oceanic_biomes_have_marine_life'),

  anchor('cr_biome_urban', 'creature',
    [['biome', 'in', 'urban,city,metropolitan'], ['intelligence', 'in', 'instinctual,animal']],
    'creature_type', 'urban_animal', 0.55, 50,
    'registry_rule: cr_biome_urban',
    'biome=urban',
    'urban_environments_have_city_adapted_animals'),

  anchor('cr_biome_underground', 'creature',
    [['biome', 'in', 'underground,subterranean,cave']],
    'creature_type', 'subterranean_creature', 0.62, 60,
    'registry_rule: cr_biome_underground',
    'biome=underground',
    'subterranean_environments_have_dark_adapted_creatures'),

  // ── Generic Role-Based Creatures ──

  anchor('cr_role_predator', 'creature',
    [['threat_role', 'in', 'predator,bioweapon']],
    'creature_type', 'predator_archetype', 0.50, 40,
    'registry_rule: cr_role_predator',
    'threat_role=predator',
    'predators_appear_across_settings'),

  anchor('cr_role_transport', 'creature',
    [['narrative_function', 'eq', 'transport']],
    'creature_type', 'transport_animal', 0.60, 50,
    'registry_rule: cr_role_transport',
    'narrative_function=transport',
    'transport_animals_appear_across_settings'),

  anchor('cr_role_companion', 'creature',
    [['narrative_function', 'eq', 'companion']],
    'creature_type', 'companion_animal', 0.65, 55,
    'registry_rule: cr_role_companion',
    'narrative_function=companion',
    'companion_animals_appear_across_settings'),

  anchor('cr_role_ambient', 'creature',
    [['narrative_function', 'eq', 'ambient']],
    'creature_type', 'background_wildlife', 0.45, 30,
    'registry_rule: cr_role_ambient',
    'narrative_function=ambient',
    'ambient_background_wildlife'),

  // ── Catch-All: Low-Confidence Fallbacks ──

  anchor('cr_catchall_working', 'creature',
    [['narrative_function', 'in', 'transport,companion']],
    'creature_type', 'working_animal', 0.30, 0,
    'registry_rule: cr_catchall_working',
    'low_confidence_placeholder',
    'insufficient_context_for_specific_working_animal_inference'),

  anchor('cr_catchall_small', 'creature',
    [['intelligence', 'in', 'animal,instinctual']],
    'creature_type', 'small_animal', 0.30, 0,
    'registry_rule: cr_catchall_small',
    'low_confidence_placeholder',
    'insufficient_context_for_specific_small_animal_inference'),

  anchor('cr_catchall_unknown', 'creature',
    [['threat_role', 'any', '']],
    'creature_type', 'unknown_creature_presence', 0.30, 0,
    'registry_rule: cr_catchall_unknown',
    'low_confidence_placeholder',
    'insufficient_context_for_creature_type_inference'),
];


// ── Rule Counts ──────────────────────────────────────────────────────

const LOCATION_ANCHORS: RegistryAnchor[] = [
  anchor('lc_pre_industrial_residential_arch', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'residential']], 'architecture_style', 'pre_industrial_residential', 0.88, 100, ),
  anchor('lc_pre_industrial_residential_era', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'residential']], 'construction_era', 'pre_industrial', 0.87, 100, ),
  anchor('lc_pre_industrial_residential_mat', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'residential']], 'material_palette', 'wood_stone_thatch', 0.82, 100, ),
  anchor('lc_pre_industrial_residential_lgt', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'residential']], 'lighting_character', 'residential_standard', 0.8, 100, ),
  anchor('lc_pre_industrial_residential_den', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'residential']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_pre_industrial_commercial_arch', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'commercial']], 'architecture_style', 'pre_industrial_commercial', 0.88, 100, ),
  anchor('lc_pre_industrial_commercial_era', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'commercial']], 'construction_era', 'pre_industrial', 0.87, 100, ),
  anchor('lc_pre_industrial_commercial_mat', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'commercial']], 'material_palette', 'wood_stone_thatch', 0.82, 100, ),
  anchor('lc_pre_industrial_commercial_lgt', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'commercial']], 'lighting_character', 'commercial_standard', 0.8, 100, ),
  anchor('lc_pre_industrial_commercial_den', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'commercial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_pre_industrial_civic_arch', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'civic']], 'architecture_style', 'pre_industrial_civic', 0.88, 100, ),
  anchor('lc_pre_industrial_civic_era', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'civic']], 'construction_era', 'pre_industrial', 0.87, 100, ),
  anchor('lc_pre_industrial_civic_mat', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'civic']], 'material_palette', 'wood_stone_thatch', 0.82, 100, ),
  anchor('lc_pre_industrial_civic_lgt', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'civic']], 'lighting_character', 'civic_standard', 0.8, 100, ),
  anchor('lc_pre_industrial_civic_den', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'civic']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_pre_industrial_military_arch', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'military']], 'architecture_style', 'pre_industrial_military', 0.88, 100, ),
  anchor('lc_pre_industrial_military_era', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'military']], 'construction_era', 'pre_industrial', 0.87, 100, ),
  anchor('lc_pre_industrial_military_mat', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'military']], 'material_palette', 'wood_stone_thatch', 0.82, 100, ),
  anchor('lc_pre_industrial_military_lgt', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'military']], 'lighting_character', 'military_standard', 0.8, 100, ),
  anchor('lc_pre_industrial_military_den', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'military']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_pre_industrial_religious_arch', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'religious']], 'architecture_style', 'pre_industrial_religious', 0.88, 100, ),
  anchor('lc_pre_industrial_religious_era', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'religious']], 'construction_era', 'pre_industrial', 0.87, 100, ),
  anchor('lc_pre_industrial_religious_mat', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'religious']], 'material_palette', 'wood_stone_thatch', 0.82, 100, ),
  anchor('lc_pre_industrial_religious_lgt', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'religious']], 'lighting_character', 'religious_standard', 0.8, 100, ),
  anchor('lc_pre_industrial_religious_den', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'religious']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_pre_industrial_industrial_arch', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'industrial']], 'architecture_style', 'pre_industrial_industrial', 0.88, 100, ),
  anchor('lc_pre_industrial_industrial_era', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'industrial']], 'construction_era', 'pre_industrial', 0.87, 100, ),
  anchor('lc_pre_industrial_industrial_mat', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'industrial']], 'material_palette', 'wood_stone_thatch', 0.82, 100, ),
  anchor('lc_pre_industrial_industrial_lgt', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'industrial']], 'lighting_character', 'industrial_standard', 0.8, 100, ),
  anchor('lc_pre_industrial_industrial_den', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'industrial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_pre_industrial_transportation_arch', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'transportation']], 'architecture_style', 'pre_industrial_transportation', 0.88, 100, ),
  anchor('lc_pre_industrial_transportation_era', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'transportation']], 'construction_era', 'pre_industrial', 0.87, 100, ),
  anchor('lc_pre_industrial_transportation_mat', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'transportation']], 'material_palette', 'wood_stone_thatch', 0.82, 100, ),
  anchor('lc_pre_industrial_transportation_lgt', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'transportation']], 'lighting_character', 'transportation_standard', 0.8, 100, ),
  anchor('lc_pre_industrial_transportation_den', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'transportation']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_pre_industrial_hospitality_arch', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'hospitality']], 'architecture_style', 'pre_industrial_hospitality', 0.88, 100, ),
  anchor('lc_pre_industrial_hospitality_era', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'hospitality']], 'construction_era', 'pre_industrial', 0.87, 100, ),
  anchor('lc_pre_industrial_hospitality_mat', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'hospitality']], 'material_palette', 'wood_stone_thatch', 0.82, 100, ),
  anchor('lc_pre_industrial_hospitality_lgt', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'hospitality']], 'lighting_character', 'hospitality_standard', 0.8, 100, ),
  anchor('lc_pre_industrial_hospitality_den', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age'], ['spatial_function', 'eq', 'hospitality']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_early_industrial_residential_arch', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'residential']], 'architecture_style', 'early_industrial_residential', 0.88, 100, ),
  anchor('lc_early_industrial_residential_era', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'residential']], 'construction_era', 'early_industrial', 0.87, 100, ),
  anchor('lc_early_industrial_residential_mat', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'residential']], 'material_palette', 'brick_stone_iron', 0.82, 100, ),
  anchor('lc_early_industrial_residential_lgt', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'residential']], 'lighting_character', 'residential_standard', 0.8, 100, ),
  anchor('lc_early_industrial_residential_den', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'residential']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_early_industrial_commercial_arch', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'commercial']], 'architecture_style', 'early_industrial_commercial', 0.88, 100, ),
  anchor('lc_early_industrial_commercial_era', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'commercial']], 'construction_era', 'early_industrial', 0.87, 100, ),
  anchor('lc_early_industrial_commercial_mat', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'commercial']], 'material_palette', 'brick_stone_iron', 0.82, 100, ),
  anchor('lc_early_industrial_commercial_lgt', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'commercial']], 'lighting_character', 'commercial_standard', 0.8, 100, ),
  anchor('lc_early_industrial_commercial_den', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'commercial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_early_industrial_civic_arch', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'civic']], 'architecture_style', 'early_industrial_civic', 0.88, 100, ),
  anchor('lc_early_industrial_civic_era', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'civic']], 'construction_era', 'early_industrial', 0.87, 100, ),
  anchor('lc_early_industrial_civic_mat', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'civic']], 'material_palette', 'brick_stone_iron', 0.82, 100, ),
  anchor('lc_early_industrial_civic_lgt', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'civic']], 'lighting_character', 'civic_standard', 0.8, 100, ),
  anchor('lc_early_industrial_civic_den', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'civic']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_early_industrial_military_arch', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'military']], 'architecture_style', 'early_industrial_military', 0.88, 100, ),
  anchor('lc_early_industrial_military_era', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'military']], 'construction_era', 'early_industrial', 0.87, 100, ),
  anchor('lc_early_industrial_military_mat', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'military']], 'material_palette', 'brick_stone_iron', 0.82, 100, ),
  anchor('lc_early_industrial_military_lgt', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'military']], 'lighting_character', 'military_standard', 0.8, 100, ),
  anchor('lc_early_industrial_military_den', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'military']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_early_industrial_religious_arch', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'religious']], 'architecture_style', 'early_industrial_religious', 0.88, 100, ),
  anchor('lc_early_industrial_religious_era', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'religious']], 'construction_era', 'early_industrial', 0.87, 100, ),
  anchor('lc_early_industrial_religious_mat', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'religious']], 'material_palette', 'brick_stone_iron', 0.82, 100, ),
  anchor('lc_early_industrial_religious_lgt', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'religious']], 'lighting_character', 'religious_standard', 0.8, 100, ),
  anchor('lc_early_industrial_religious_den', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'religious']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_early_industrial_industrial_arch', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'industrial']], 'architecture_style', 'early_industrial_industrial', 0.88, 100, ),
  anchor('lc_early_industrial_industrial_era', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'industrial']], 'construction_era', 'early_industrial', 0.87, 100, ),
  anchor('lc_early_industrial_industrial_mat', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'industrial']], 'material_palette', 'brick_stone_iron', 0.82, 100, ),
  anchor('lc_early_industrial_industrial_lgt', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'industrial']], 'lighting_character', 'industrial_standard', 0.8, 100, ),
  anchor('lc_early_industrial_industrial_den', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'industrial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_early_industrial_transportation_arch', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'transportation']], 'architecture_style', 'early_industrial_transportation', 0.88, 100, ),
  anchor('lc_early_industrial_transportation_era', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'transportation']], 'construction_era', 'early_industrial', 0.87, 100, ),
  anchor('lc_early_industrial_transportation_mat', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'transportation']], 'material_palette', 'brick_stone_iron', 0.82, 100, ),
  anchor('lc_early_industrial_transportation_lgt', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'transportation']], 'lighting_character', 'transportation_standard', 0.8, 100, ),
  anchor('lc_early_industrial_transportation_den', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'transportation']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_early_industrial_hospitality_arch', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'hospitality']], 'architecture_style', 'early_industrial_hospitality', 0.88, 100, ),
  anchor('lc_early_industrial_hospitality_era', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'hospitality']], 'construction_era', 'early_industrial', 0.87, 100, ),
  anchor('lc_early_industrial_hospitality_mat', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'hospitality']], 'material_palette', 'brick_stone_iron', 0.82, 100, ),
  anchor('lc_early_industrial_hospitality_lgt', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'hospitality']], 'lighting_character', 'hospitality_standard', 0.8, 100, ),
  anchor('lc_early_industrial_hospitality_den', 'location', [['period', 'regex', 'renaissance|colonial|victorian|18th|19th|1700|1800'], ['spatial_function', 'eq', 'hospitality']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_modern_war_residential_arch', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'residential']], 'architecture_style', 'modern_war_residential', 0.88, 100, ),
  anchor('lc_modern_war_residential_era', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'residential']], 'construction_era', 'modern_war', 0.87, 100, ),
  anchor('lc_modern_war_residential_mat', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'residential']], 'material_palette', 'concrete_brick_iron', 0.82, 100, ),
  anchor('lc_modern_war_residential_lgt', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'residential']], 'lighting_character', 'residential_standard', 0.8, 100, ),
  anchor('lc_modern_war_residential_den', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'residential']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_modern_war_commercial_arch', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'commercial']], 'architecture_style', 'modern_war_commercial', 0.88, 100, ),
  anchor('lc_modern_war_commercial_era', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'commercial']], 'construction_era', 'modern_war', 0.87, 100, ),
  anchor('lc_modern_war_commercial_mat', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'commercial']], 'material_palette', 'concrete_brick_iron', 0.82, 100, ),
  anchor('lc_modern_war_commercial_lgt', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'commercial']], 'lighting_character', 'commercial_standard', 0.8, 100, ),
  anchor('lc_modern_war_commercial_den', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'commercial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_modern_war_civic_arch', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'civic']], 'architecture_style', 'modern_war_civic', 0.88, 100, ),
  anchor('lc_modern_war_civic_era', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'civic']], 'construction_era', 'modern_war', 0.87, 100, ),
  anchor('lc_modern_war_civic_mat', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'civic']], 'material_palette', 'concrete_brick_iron', 0.82, 100, ),
  anchor('lc_modern_war_civic_lgt', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'civic']], 'lighting_character', 'civic_standard', 0.8, 100, ),
  anchor('lc_modern_war_civic_den', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'civic']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_modern_war_military_arch', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'military']], 'architecture_style', 'modern_war_military', 0.88, 100, ),
  anchor('lc_modern_war_military_era', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'military']], 'construction_era', 'modern_war', 0.87, 100, ),
  anchor('lc_modern_war_military_mat', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'military']], 'material_palette', 'concrete_brick_iron', 0.82, 100, ),
  anchor('lc_modern_war_military_lgt', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'military']], 'lighting_character', 'military_standard', 0.8, 100, ),
  anchor('lc_modern_war_military_den', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'military']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_modern_war_religious_arch', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'religious']], 'architecture_style', 'modern_war_religious', 0.88, 100, ),
  anchor('lc_modern_war_religious_era', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'religious']], 'construction_era', 'modern_war', 0.87, 100, ),
  anchor('lc_modern_war_religious_mat', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'religious']], 'material_palette', 'concrete_brick_iron', 0.82, 100, ),
  anchor('lc_modern_war_religious_lgt', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'religious']], 'lighting_character', 'religious_standard', 0.8, 100, ),
  anchor('lc_modern_war_religious_den', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'religious']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_modern_war_industrial_arch', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'industrial']], 'architecture_style', 'modern_war_industrial', 0.88, 100, ),
  anchor('lc_modern_war_industrial_era', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'industrial']], 'construction_era', 'modern_war', 0.87, 100, ),
  anchor('lc_modern_war_industrial_mat', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'industrial']], 'material_palette', 'concrete_brick_iron', 0.82, 100, ),
  anchor('lc_modern_war_industrial_lgt', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'industrial']], 'lighting_character', 'industrial_standard', 0.8, 100, ),
  anchor('lc_modern_war_industrial_den', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'industrial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_modern_war_transportation_arch', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'transportation']], 'architecture_style', 'modern_war_transportation', 0.88, 100, ),
  anchor('lc_modern_war_transportation_era', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'transportation']], 'construction_era', 'modern_war', 0.87, 100, ),
  anchor('lc_modern_war_transportation_mat', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'transportation']], 'material_palette', 'concrete_brick_iron', 0.82, 100, ),
  anchor('lc_modern_war_transportation_lgt', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'transportation']], 'lighting_character', 'transportation_standard', 0.8, 100, ),
  anchor('lc_modern_war_transportation_den', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'transportation']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_modern_war_hospitality_arch', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'hospitality']], 'architecture_style', 'modern_war_hospitality', 0.88, 100, ),
  anchor('lc_modern_war_hospitality_era', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'hospitality']], 'construction_era', 'modern_war', 0.87, 100, ),
  anchor('lc_modern_war_hospitality_mat', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'hospitality']], 'material_palette', 'concrete_brick_iron', 0.82, 100, ),
  anchor('lc_modern_war_hospitality_lgt', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'hospitality']], 'lighting_character', 'hospitality_standard', 0.8, 100, ),
  anchor('lc_modern_war_hospitality_den', 'location', [['period', 'regex', 'wwi|interwar|1940s|wwii|1930s|1910|1920'], ['spatial_function', 'eq', 'hospitality']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_contemporary_residential_arch', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'residential']], 'architecture_style', 'contemporary_residential', 0.88, 100, ),
  anchor('lc_contemporary_residential_era', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'residential']], 'construction_era', 'contemporary', 0.87, 100, ),
  anchor('lc_contemporary_residential_mat', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'residential']], 'material_palette', 'concrete_steel_glass', 0.82, 100, ),
  anchor('lc_contemporary_residential_lgt', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'residential']], 'lighting_character', 'residential_standard', 0.8, 100, ),
  anchor('lc_contemporary_residential_den', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'residential']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_contemporary_commercial_arch', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'commercial']], 'architecture_style', 'contemporary_commercial', 0.88, 100, ),
  anchor('lc_contemporary_commercial_era', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'commercial']], 'construction_era', 'contemporary', 0.87, 100, ),
  anchor('lc_contemporary_commercial_mat', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'commercial']], 'material_palette', 'concrete_steel_glass', 0.82, 100, ),
  anchor('lc_contemporary_commercial_lgt', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'commercial']], 'lighting_character', 'commercial_standard', 0.8, 100, ),
  anchor('lc_contemporary_commercial_den', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'commercial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_contemporary_civic_arch', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'civic']], 'architecture_style', 'contemporary_civic', 0.88, 100, ),
  anchor('lc_contemporary_civic_era', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'civic']], 'construction_era', 'contemporary', 0.87, 100, ),
  anchor('lc_contemporary_civic_mat', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'civic']], 'material_palette', 'concrete_steel_glass', 0.82, 100, ),
  anchor('lc_contemporary_civic_lgt', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'civic']], 'lighting_character', 'civic_standard', 0.8, 100, ),
  anchor('lc_contemporary_civic_den', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'civic']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_contemporary_military_arch', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'military']], 'architecture_style', 'contemporary_military', 0.88, 100, ),
  anchor('lc_contemporary_military_era', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'military']], 'construction_era', 'contemporary', 0.87, 100, ),
  anchor('lc_contemporary_military_mat', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'military']], 'material_palette', 'concrete_steel_glass', 0.82, 100, ),
  anchor('lc_contemporary_military_lgt', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'military']], 'lighting_character', 'military_standard', 0.8, 100, ),
  anchor('lc_contemporary_military_den', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'military']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_contemporary_religious_arch', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'religious']], 'architecture_style', 'contemporary_religious', 0.88, 100, ),
  anchor('lc_contemporary_religious_era', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'religious']], 'construction_era', 'contemporary', 0.87, 100, ),
  anchor('lc_contemporary_religious_mat', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'religious']], 'material_palette', 'concrete_steel_glass', 0.82, 100, ),
  anchor('lc_contemporary_religious_lgt', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'religious']], 'lighting_character', 'religious_standard', 0.8, 100, ),
  anchor('lc_contemporary_religious_den', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'religious']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_contemporary_industrial_arch', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'industrial']], 'architecture_style', 'contemporary_industrial', 0.88, 100, ),
  anchor('lc_contemporary_industrial_era', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'industrial']], 'construction_era', 'contemporary', 0.87, 100, ),
  anchor('lc_contemporary_industrial_mat', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'industrial']], 'material_palette', 'concrete_steel_glass', 0.82, 100, ),
  anchor('lc_contemporary_industrial_lgt', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'industrial']], 'lighting_character', 'industrial_standard', 0.8, 100, ),
  anchor('lc_contemporary_industrial_den', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'industrial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_contemporary_transportation_arch', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'transportation']], 'architecture_style', 'contemporary_transportation', 0.88, 100, ),
  anchor('lc_contemporary_transportation_era', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'transportation']], 'construction_era', 'contemporary', 0.87, 100, ),
  anchor('lc_contemporary_transportation_mat', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'transportation']], 'material_palette', 'concrete_steel_glass', 0.82, 100, ),
  anchor('lc_contemporary_transportation_lgt', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'transportation']], 'lighting_character', 'transportation_standard', 0.8, 100, ),
  anchor('lc_contemporary_transportation_den', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'transportation']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_contemporary_hospitality_arch', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'hospitality']], 'architecture_style', 'contemporary_hospitality', 0.88, 100, ),
  anchor('lc_contemporary_hospitality_era', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'hospitality']], 'construction_era', 'contemporary', 0.87, 100, ),
  anchor('lc_contemporary_hospitality_mat', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'hospitality']], 'material_palette', 'concrete_steel_glass', 0.82, 100, ),
  anchor('lc_contemporary_hospitality_lgt', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'hospitality']], 'lighting_character', 'hospitality_standard', 0.8, 100, ),
  anchor('lc_contemporary_hospitality_den', 'location', [['period', 'regex', '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern'], ['spatial_function', 'eq', 'hospitality']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_future_residential_arch', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'residential']], 'architecture_style', 'future_residential', 0.88, 100, ),
  anchor('lc_future_residential_era', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'residential']], 'construction_era', 'future', 0.87, 100, ),
  anchor('lc_future_residential_mat', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'residential']], 'material_palette', 'composite_glass_alloy', 0.82, 100, ),
  anchor('lc_future_residential_lgt', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'residential']], 'lighting_character', 'residential_standard', 0.8, 100, ),
  anchor('lc_future_residential_den', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'residential']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_future_commercial_arch', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'commercial']], 'architecture_style', 'future_commercial', 0.88, 100, ),
  anchor('lc_future_commercial_era', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'commercial']], 'construction_era', 'future', 0.87, 100, ),
  anchor('lc_future_commercial_mat', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'commercial']], 'material_palette', 'composite_glass_alloy', 0.82, 100, ),
  anchor('lc_future_commercial_lgt', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'commercial']], 'lighting_character', 'commercial_standard', 0.8, 100, ),
  anchor('lc_future_commercial_den', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'commercial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_future_civic_arch', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'civic']], 'architecture_style', 'future_civic', 0.88, 100, ),
  anchor('lc_future_civic_era', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'civic']], 'construction_era', 'future', 0.87, 100, ),
  anchor('lc_future_civic_mat', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'civic']], 'material_palette', 'composite_glass_alloy', 0.82, 100, ),
  anchor('lc_future_civic_lgt', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'civic']], 'lighting_character', 'civic_standard', 0.8, 100, ),
  anchor('lc_future_civic_den', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'civic']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_future_military_arch', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'military']], 'architecture_style', 'future_military', 0.88, 100, ),
  anchor('lc_future_military_era', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'military']], 'construction_era', 'future', 0.87, 100, ),
  anchor('lc_future_military_mat', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'military']], 'material_palette', 'composite_glass_alloy', 0.82, 100, ),
  anchor('lc_future_military_lgt', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'military']], 'lighting_character', 'military_standard', 0.8, 100, ),
  anchor('lc_future_military_den', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'military']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_future_religious_arch', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'religious']], 'architecture_style', 'future_religious', 0.88, 100, ),
  anchor('lc_future_religious_era', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'religious']], 'construction_era', 'future', 0.87, 100, ),
  anchor('lc_future_religious_mat', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'religious']], 'material_palette', 'composite_glass_alloy', 0.82, 100, ),
  anchor('lc_future_religious_lgt', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'religious']], 'lighting_character', 'religious_standard', 0.8, 100, ),
  anchor('lc_future_religious_den', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'religious']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_future_industrial_arch', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'industrial']], 'architecture_style', 'future_industrial', 0.88, 100, ),
  anchor('lc_future_industrial_era', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'industrial']], 'construction_era', 'future', 0.87, 100, ),
  anchor('lc_future_industrial_mat', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'industrial']], 'material_palette', 'composite_glass_alloy', 0.82, 100, ),
  anchor('lc_future_industrial_lgt', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'industrial']], 'lighting_character', 'industrial_standard', 0.8, 100, ),
  anchor('lc_future_industrial_den', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'industrial']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_future_transportation_arch', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'transportation']], 'architecture_style', 'future_transportation', 0.88, 100, ),
  anchor('lc_future_transportation_era', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'transportation']], 'construction_era', 'future', 0.87, 100, ),
  anchor('lc_future_transportation_mat', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'transportation']], 'material_palette', 'composite_glass_alloy', 0.82, 100, ),
  anchor('lc_future_transportation_lgt', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'transportation']], 'lighting_character', 'transportation_standard', 0.8, 100, ),
  anchor('lc_future_transportation_den', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'transportation']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_future_hospitality_arch', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'hospitality']], 'architecture_style', 'future_hospitality', 0.88, 100, ),
  anchor('lc_future_hospitality_era', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'hospitality']], 'construction_era', 'future', 0.87, 100, ),
  anchor('lc_future_hospitality_mat', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'hospitality']], 'material_palette', 'composite_glass_alloy', 0.82, 100, ),
  anchor('lc_future_hospitality_lgt', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'hospitality']], 'lighting_character', 'hospitality_standard', 0.8, 100, ),
  anchor('lc_future_hospitality_den', 'location', [['period', 'regex', 'distant_future|near_future|2087|post_apocalyptic|2050'], ['spatial_function', 'eq', 'hospitality']], 'visual_density', 'moderate', 0.78, 100, ),
  anchor('lc_arid_mat', 'location', [['climate', 'in', 'hot_arid,arid,desert']], 'material_palette', 'stone_mudbrick_adobe', 0.82, 105, ),
  anchor('lc_rainy_mat', 'location', [['climate', 'in', 'temperate_rainy,rainy,wet,tropical_humid']], 'material_palette', 'waterproofed_wood_stone_tile', 0.8, 105, ),
  anchor('lc_snowy_mat', 'location', [['climate', 'in', 'cold_snowy,arctic,sub_arctic']], 'material_palette', 'insulated_timber_stone_felt', 0.82, 105, ),
  anchor('lc_wild_cave', 'location', [['spatial_function', 'eq', 'wilderness'], ['biome', 'in', 'cave,subterranean']], 'architecture_style', 'natural_cavern', 0.9, 100, ),
  anchor('lc_wild_forest', 'location', [['spatial_function', 'eq', 'wilderness'], ['biome', 'in', 'forest,jungle,woods']], 'architecture_style', 'forest_clearing', 0.85, 100, ),
  anchor('lc_wild_desert', 'location', [['spatial_function', 'eq', 'wilderness'], ['climate', 'in', 'hot_arid,arid']], 'architecture_style', 'open_desert_plain', 0.85, 100, ),
  anchor('lc_light_noir', 'location', [['genre', 'in', 'noir,crime,thriller']], 'lighting_character', 'shadow_high_contrast', 0.85, 110, ),
  anchor('lc_light_horror', 'location', [['genre', 'in', 'horror,suspense']], 'lighting_character', 'dim_ominous_unstable', 0.85, 110, ),
  anchor('lc_tech_future', 'location', [['period', 'regex', 'future|distant_future|2087']], 'tech_integration', 'full_digital_automated', 0.88, 105, ),
  anchor('lc_tech_modern', 'location', [['period', 'regex', 'contemporary|modern|2000|2020']], 'tech_integration', 'digital_networked', 0.82, 100, ),
  anchor('lc_tech_pre', 'location', [['period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age']], 'tech_integration', 'pre_industrial_none', 0.9, 100, ),
  anchor('lc_cond_affl', 'location', [['economy', 'in', 'post_scarcity,industrial,developed']], 'condition', 'pristine_maintained', 0.8, 95, ),
  anchor('lc_cond_work', 'location', [['economy', 'in', 'industrial,agrarian']], 'condition', 'functional_worn', 0.78, 95, ),
  anchor('lc_cond_feud', 'location', [['economy', 'in', 'feudal,subsistence']], 'condition', 'weathered_utilitarian', 0.8, 95, ),
  anchor('lc_catch_res_arch', 'location', [['spatial_function', 'eq', 'residential']], 'architecture_style', 'domestic_interior', 0.3, 0, ),
  anchor('lc_catch_com_arch', 'location', [['spatial_function', 'eq', 'commercial']], 'architecture_style', 'retail_interior', 0.3, 0, ),
  anchor('lc_catch_civ_arch', 'location', [['spatial_function', 'eq', 'civic']], 'architecture_style', 'public_institutional', 0.3, 0, ),
  anchor('lc_catch_mil_arch', 'location', [['spatial_function', 'eq', 'military']], 'architecture_style', 'military_installation', 0.3, 0, ),
  anchor('lc_catch_ind_arch', 'location', [['spatial_function', 'eq', 'industrial']], 'architecture_style', 'industrial_space', 0.3, 0, ),
  anchor('lc_catch_rel_arch', 'location', [['spatial_function', 'eq', 'religious']], 'architecture_style', 'religious_structure', 0.3, 0, ),
  anchor('lc_catch_tra_arch', 'location', [['spatial_function', 'eq', 'transportation']], 'architecture_style', 'transportation_infrastructure', 0.3, 0, ),
  anchor('lc_catch_hos_arch', 'location', [['spatial_function', 'eq', 'hospitality']], 'architecture_style', 'social_venue', 0.3, 0, ),
  anchor('lc_catch_agr_arch', 'location', [['spatial_function', 'eq', 'agricultural']], 'architecture_style', 'agricultural_facility', 0.3, 0, ),
  anchor('lc_catch_wil_arch', 'location', [['spatial_function', 'eq', 'wilderness']], 'architecture_style', 'natural_terrain', 0.3, 0, ),
  anchor('lc_catch_pub_arch', 'location', [['spatial_function', 'eq', 'public_realm']], 'architecture_style', 'public_thoroughfare', 0.3, 0, ),
  anchor('lc_catch_gen_arch', 'location', [['spatial_function', 'any', '']], 'architecture_style', 'generic_interior_exterior', 0.3, 0, ),
];

// ── VL ANCHORS ───────────────────────────────────────────────────────

const VL_ANCHORS: RegistryAnchor[] = [
  // ── CONTRAST MODEL (6 anchors) ──
  anchor('vl_noir_contrast', 'vl', [['genre', 'in', 'noir,crime,mystery']], 'contrast_model', 'high_contrast_noir', 0.88, 100,
    'registry_rule: vl_noir_contrast', 'noir_genre_drives_high_contrast'),
  anchor('vl_fantasy_contrast', 'vl', [['genre', 'in', 'fantasy,epic,mythic']], 'contrast_model', 'soft_contrast_fantasy', 0.82, 100,
    'registry_rule: vl_fantasy_contrast', 'fantasy_genre_drives_soft_magical_contrast'),
  anchor('vl_scifi_contrast', 'vl', [['genre', 'in', 'sci_fi,cyberpunk,space_opera']], 'contrast_model', 'clean_crisp_contrast', 0.85, 100,
    'registry_rule: vl_scifi_contrast', 'scifi_genre_drives_clean_crisp_contrast'),
  anchor('vl_horror_contrast', 'vl', [['genre', 'in', 'horror,thriller,suspense']], 'contrast_model', 'harsh_deep_contrast', 0.86, 100,
    'registry_rule: vl_horror_contrast', 'horror_genre_drives_deep_contrast'),
  anchor('vl_drama_contrast', 'vl', [['genre', 'in', 'drama,romance,contemporary']], 'contrast_model', 'naturalistic_contrast', 0.78, 100,
    'registry_rule: vl_drama_contrast', 'drama_genre_drives_naturalistic_contrast'),
  anchor('vl_comedy_contrast', 'vl', [['genre', 'in', 'comedy,light']], 'contrast_model', 'flat_even_contrast', 0.76, 100,
    'registry_rule: vl_comedy_contrast', 'comedy_genre_drives_even_flat_contrast'),

  // ── COLOUR PHILOSOPHY (6 anchors) ──
  anchor('vl_noir_colour', 'vl', [['genre', 'in', 'noir,crime']], 'colour_philosophy', 'warm_amber_with_teal_shadows', 0.88, 100,
    'registry_rule: vl_noir_colour', 'noir_uses_warm_highlights_and_cool_shadows'),
  anchor('vl_fantasy_colour', 'vl', [['genre', 'in', 'fantasy,epic,mythic']], 'colour_philosophy', 'rich_saturated_nature_tones', 0.84, 100,
    'registry_rule: vl_fantasy_colour', 'fantasy_uses_rich_saturated_colors'),
  anchor('vl_scifi_colour', 'vl', [['genre', 'in', 'sci_fi,cyberpunk,space_opera']], 'colour_philosophy', 'cool_blue_teal_neon_accent', 0.86, 100,
    'registry_rule: vl_scifi_colour', 'scifi_uses_cool_blues_with_neon_accents'),
  anchor('vl_horror_colour', 'vl', [['genre', 'in', 'horror,thriller,suspense']], 'colour_philosophy', 'desaturated_muddy_with_blood_accents', 0.85, 100,
    'registry_rule: vl_horror_colour', 'horror_uses_desaturated_palette'),
  anchor('vl_drama_colour', 'vl', [['genre', 'in', 'drama,romance,contemporary']], 'colour_philosophy', 'natural_muted_earthy', 0.78, 100,
    'registry_rule: vl_drama_colour', 'drama_uses_natural_muted_colors'),
  anchor('vl_comedy_colour', 'vl', [['genre', 'in', 'comedy,light']], 'colour_philosophy', 'bright_warm_primary', 0.76, 100,
    'registry_rule: vl_comedy_colour', 'comedy_uses_bright_warm_primaries'),

  // ── SATURATION PROFILE (6 anchors) ──
  anchor('vl_noir_sat', 'vl', [['genre', 'in', 'noir,crime']], 'saturation_profile', 'muted_warm', 0.82, 100,
    'registry_rule: vl_noir_sat', 'noir_uses_muted_saturation'),
  anchor('vl_fantasy_sat', 'vl', [['genre', 'in', 'fantasy,epic,mythic']], 'saturation_profile', 'vibrant_enriched', 0.84, 100,
    'registry_rule: vl_fantasy_sat', 'fantasy_uses_vibrant_saturation'),
  anchor('vl_scifi_sat', 'vl', [['genre', 'in', 'sci_fi,cyberpunk']], 'saturation_profile', 'cool_desaturated_base', 0.80, 100,
    'registry_rule: vl_scifi_sat', 'scifi_uses_desaturated_base'),
  anchor('vl_horror_sat', 'vl', [['genre', 'in', 'horror']], 'saturation_profile', 'desaturated_pale', 0.83, 100,
    'registry_rule: vl_horror_sat', 'horror_uses_desaturated_pale'),
  anchor('vl_drama_sat', 'vl', [['genre', 'in', 'drama,romance']], 'saturation_profile', 'natural_muted', 0.76, 100,
    'registry_rule: vl_drama_sat', 'drama_uses_natural_saturation'),
  anchor('vl_comedy_sat', 'vl', [['genre', 'in', 'comedy,light']], 'saturation_profile', 'vibrant_saturated', 0.78, 100,
    'registry_rule: vl_comedy_sat', 'comedy_uses_vibrant_saturation'),

  // ── PALETTE BIAS (4 anchors) ──
  anchor('vl_palette_warm', 'vl', [['genre', 'in', 'noir,drama,romance,comedy']], 'palette_bias', 'warm_leaning', 0.82, 100,
    'registry_rule: vl_palette_warm'),
  anchor('vl_palette_cool', 'vl', [['genre', 'in', 'sci_fi,cyberpunk,horror']], 'palette_bias', 'cool_leaning', 0.84, 100,
    'registry_rule: vl_palette_cool'),
  anchor('vl_palette_neutral', 'vl', [['genre', 'in', 'crime,thriller,contemporary']], 'palette_bias', 'neutral_leaning', 0.72, 100,
    'registry_rule: vl_palette_neutral'),
  anchor('vl_palette_nature', 'vl', [['genre', 'in', 'fantasy,epic,historical']], 'palette_bias', 'earth_nature_leaning', 0.80, 100,
    'registry_rule: vl_palette_nature'),

  // ── LIGHTING PHILOSOPHY (8 anchors) ──
  anchor('vl_noir_light_contemp', 'vl', [['genre', 'in', 'noir,crime'], ['period', 'regex', 'contemporary|modern|2020']], 'lighting_philosophy', 'low_key_practical_motivated', 0.88, 100,
    'registry_rule: vl_noir_light_contemp', 'noir_contemporary_uses_practical_motivated_lighting'),
  anchor('vl_noir_light_1940s', 'vl', [['genre', 'in', 'noir,crime'], ['period', 'regex', '1940s|1950s|interwar']], 'lighting_philosophy', 'chiaroscuro_venetian_blind', 0.90, 100,
    'registry_rule: vl_noir_light_1940s', 'noir_1940s_uses_chiaroscuro_venetian_blind'),
  anchor('vl_fantasy_light', 'vl', [['genre', 'in', 'fantasy,epic']], 'lighting_philosophy', 'candle_firelight_ambient', 0.82, 100,
    'registry_rule: vl_fantasy_light', 'fantasy_uses_candle_and_firelight'),
  anchor('vl_scifi_light', 'vl', [['genre', 'in', 'sci_fi,cyberpunk,space_opera']], 'lighting_philosophy', 'neon_and_ambient_glow', 0.85, 100,
    'registry_rule: vl_scifi_light', 'scifi_uses_neon_and_ambient_glows'),
  anchor('vl_horror_light', 'vl', [['genre', 'in', 'horror']], 'lighting_philosophy', 'single_source_ominous', 0.86, 100,
    'registry_rule: vl_horror_light', 'horror_uses_single_source_ominous_lighting'),
  anchor('vl_drama_light', 'vl', [['genre', 'in', 'drama,romance,contemporary']], 'lighting_philosophy', 'soft_naturalistic', 0.80, 100,
    'registry_rule: vl_drama_light', 'drama_uses_soft_naturalistic_lighting'),
  anchor('vl_historical_light', 'vl', [['genre', 'in', 'historical,period']], 'lighting_philosophy', 'period_accurate_lighting', 0.84, 100,
    'registry_rule: vl_historical_light', 'historical_uses_period_accurate_lighting'),
  anchor('vl_comedy_light', 'vl', [['genre', 'in', 'comedy,light,animation']], 'lighting_philosophy', 'high_key_even_lighting', 0.78, 100,
    'registry_rule: vl_comedy_light', 'comedy_uses_high_key_even_lighting'),

  // ── SHADOW PHILOSOPHY (6 anchors) ──
  anchor('vl_noir_shadow', 'vl', [['genre', 'in', 'noir,crime,mystery']], 'shadow_philosophy', 'deep_crushing_blocked_shadows', 0.86, 100,
    'registry_rule: vl_noir_shadow', 'noir_uses_crushing_shadows'),
  anchor('vl_fantasy_shadow', 'vl', [['genre', 'in', 'fantasy,epic,mythic']], 'shadow_philosophy', 'soft_magical_ambient_shadow', 0.78, 100,
    'registry_rule: vl_fantasy_shadow', 'fantasy_uses_soft_shadows'),
  anchor('vl_scifi_shadow', 'vl', [['genre', 'in', 'sci_fi,cyberpunk,space_opera']], 'shadow_philosophy', 'hard_defined_neon_shadow', 0.82, 100,
    'registry_rule: vl_scifi_shadow', 'scifi_uses_hard_neon_shadows'),
  anchor('vl_horror_shadow', 'vl', [['genre', 'in', 'horror,thriller']], 'shadow_philosophy', 'impenetrable_black_shadow', 0.85, 100,
    'registry_rule: vl_horror_shadow', 'horror_uses_impenetrable_shadows'),
  anchor('vl_drama_shadow', 'vl', [['genre', 'in', 'drama,romance,contemporary']], 'shadow_philosophy', 'soft_natural_shadow', 0.76, 100,
    'registry_rule: vl_drama_shadow', 'drama_uses_natural_shadows'),
  anchor('vl_comedy_shadow', 'vl', [['genre', 'in', 'comedy,light']], 'shadow_philosophy', 'minimal_even_shadow', 0.72, 100,
    'registry_rule: vl_comedy_shadow', 'comedy_uses_minimal_shadows'),

  // ── LENS PHILOSOPHY (6 anchors) ──
  anchor('vl_noir_lens', 'vl', [['genre', 'in', 'noir,crime']], 'lens_philosophy', 'spherical_mid_wide_anamorphic', 0.82, 100,
    'registry_rule: vl_noir_lens', 'noir_uses_spherical_mid_to_wide_lenses'),
  anchor('vl_fantasy_lens', 'vl', [['genre', 'in', 'fantasy,epic']], 'lens_philosophy', 'spherical_wide_epic', 0.78, 100,
    'registry_rule: vl_fantasy_lens', 'fantasy_uses_wide_spherical_lenses'),
  anchor('vl_scifi_lens', 'vl', [['genre', 'in', 'sci_fi,cyberpunk,space_opera']], 'lens_philosophy', 'anamorphic_wide', 0.84, 100,
    'registry_rule: vl_scifi_lens', 'scifi_uses_anamorphic_lenses'),
  anchor('vl_horror_lens', 'vl', [['genre', 'in', 'horror']], 'lens_philosophy', 'spherical_wide_handheld', 0.80, 100,
    'registry_rule: vl_horror_lens', 'horror_uses_wide_spherical_for_intimacy'),
  anchor('vl_drama_lens', 'vl', [['genre', 'in', 'drama,romance,contemporary']], 'lens_philosophy', 'spherical_standard_prime', 0.76, 100,
    'registry_rule: vl_drama_lens', 'drama_uses_standard_spherical_primes'),
  anchor('vl_period_lens', 'vl', [['genre', 'in', 'historical,period']], 'lens_philosophy', 'period_vintage_lens', 0.82, 100,
    'registry_rule: vl_period_lens', 'historical_uses_vintage_period_lenses'),

  // ── DEPTH PHILOSOPHY (4 anchors) ──
  anchor('vl_noir_depth', 'vl', [['genre', 'in', 'noir,crime']], 'depth_philosophy', 'moderate_deep_focus', 0.76, 100,
    'registry_rule: vl_noir_depth'),
  anchor('vl_fantasy_depth', 'vl', [['genre', 'in', 'fantasy,epic']], 'depth_philosophy', 'deep_focus_epic', 0.78, 100,
    'registry_rule: vl_fantasy_depth'),
  anchor('vl_scifi_depth', 'vl', [['genre', 'in', 'sci_fi,cyberpunk']], 'depth_philosophy', 'deep_focus_crisp', 0.80, 100,
    'registry_rule: vl_scifi_depth'),
  anchor('vl_drama_depth', 'vl', [['genre', 'in', 'drama,romance,horror']], 'depth_philosophy', 'shallow_depth_portrait', 0.76, 100,
    'registry_rule: vl_drama_depth'),

  // ── FOCUS PHILOSOPHY (4 anchors) ──
  anchor('vl_rack_focus', 'vl', [['genre', 'in', 'noir,crime,thriller']], 'focus_philosophy', 'rack_focus_dominant', 0.72, 100,
    'registry_rule: vl_rack_focus', 'noir_thrillers_use_rack_focus'),
  anchor('vl_deep_focus', 'vl', [['genre', 'in', 'fantasy,epic,historical']], 'focus_philosophy', 'deep_stop_focus', 0.76, 100,
    'registry_rule: vl_deep_focus', 'fantasy_epics_use_deep_focus'),
  anchor('vl_shallow_focus', 'vl', [['genre', 'in', 'drama,romance,horror']], 'focus_philosophy', 'shallow_soft_focus', 0.74, 100,
    'registry_rule: vl_shallow_focus', 'drama_and_horror_use_shallow_focus'),
  anchor('vl_clean_focus', 'vl', [['genre', 'in', 'sci_fi,comedy,contemporary']], 'focus_philosophy', 'clean_sharp_focus', 0.72, 100,
    'registry_rule: vl_clean_focus', 'scifi_comedy_use_clean_sharp_focus'),

  // ── REALISM LEVEL (6 anchors) ──
  anchor('vl_gritty_realism', 'vl', [['production_language', 'eq', 'gritty_realism']], 'realism_level', 'highly_realistic_grounded', 0.90, 100,
    'registry_rule: vl_gritty_realism'),
  anchor('vl_heightened_realism', 'vl', [['production_language', 'eq', 'heightened_reality']], 'realism_level', 'stylized_grounded', 0.82, 100,
    'registry_rule: vl_heightened_realism'),
  anchor('vl_magical_realism', 'vl', [['production_language', 'in', 'magical_realism']], 'realism_level', 'dreamlike_soft_realism', 0.80, 100,
    'registry_rule: vl_magical_realism'),
  anchor('vl_minimalist_realism', 'vl', [['production_language', 'eq', 'minimalist']], 'realism_level', 'clean_abstract_realism', 0.82, 100,
    'registry_rule: vl_minimalist_realism'),
  anchor('vl_noir_realism', 'vl', [['genre', 'in', 'noir,crime'], ['visual_tone', 'eq', 'dark']], 'realism_level', 'grounded_dark_realism', 0.80, 100,
    'registry_rule: vl_noir_realism'),
  anchor('vl_fantasy_realism', 'vl', [['genre', 'in', 'fantasy,epic,mythic']], 'realism_level', 'heightened_fantasy_realism', 0.76, 100,
    'registry_rule: vl_fantasy_realism'),

  // ── VISUAL SCALE (4 anchors) ──
  anchor('vl_scale_epic', 'vl', [['genre', 'in', 'fantasy,epic,space_opera,historical']], 'visual_scale', 'epic_wide_scale', 0.80, 100,
    'registry_rule: vl_scale_epic'),
  anchor('vl_scale_intimate', 'vl', [['genre', 'in', 'drama,romance']], 'visual_scale', 'intimate_close_scale', 0.78, 100,
    'registry_rule: vl_scale_intimate'),
  anchor('vl_scale_moderate', 'vl', [['genre', 'in', 'noir,crime,contemporary']], 'visual_scale', 'moderate_balanced_scale', 0.76, 100,
    'registry_rule: vl_scale_moderate'),
  anchor('vl_scale_claustro', 'vl', [['genre', 'in', 'horror,suspense,thriller']], 'visual_scale', 'claustrophobic_tight_scale', 0.78, 100,
    'registry_rule: vl_scale_claustro'),

  // ── ATMOSPHERE PHILOSOPHY (base — 4 anchors) ──
  anchor('vl_noir_atm', 'vl', [['genre', 'in', 'noir,crime']], 'atmosphere_philosophy', 'haze_smoke_present_light', 0.78, 100,
    'registry_rule: vl_noir_atm', 'noir_settings_have_smoke_haze'),
  anchor('vl_fantasy_atm', 'vl', [['genre', 'in', 'fantasy,epic,mythic']], 'atmosphere_philosophy', 'mist_fog_present_moderate', 0.76, 100,
    'registry_rule: vl_fantasy_atm', 'fantasy_settings_have_mist'),
  anchor('vl_horror_atm', 'vl', [['genre', 'in', 'horror']], 'atmosphere_philosophy', 'fog_heavy_oppressive', 0.80, 100,
    'registry_rule: vl_horror_atm', 'horror_uses_heavy_fog'),
  anchor('vl_scifi_atm', 'vl', [['genre', 'in', 'sci_fi,cyberpunk']], 'atmosphere_philosophy', 'clean_crisp_or_steam', 0.74, 100,
    'registry_rule: vl_scifi_atm', 'scifi_uses_clean_or_steam'),

  // ── TEXTURE PHILOSOPHY (base — 6 anchors) ──
  anchor('vl_noir_tex', 'vl', [['genre', 'in', 'noir,crime']], 'texture_philosophy', 'organic_grain_moderate', 0.80, 100,
    'registry_rule: vl_noir_tex', 'noir_uses_organic_grain'),
  anchor('vl_fantasy_tex', 'vl', [['genre', 'in', 'fantasy,epic']], 'texture_philosophy', 'film_stock_soft', 0.76, 100,
    'registry_rule: vl_fantasy_tex', 'fantasy_uses_soft_film_texture'),
  anchor('vl_scifi_tex', 'vl', [['genre', 'in', 'sci_fi,cyberpunk']], 'texture_philosophy', 'clean_digital_crisp', 0.82, 100,
    'registry_rule: vl_scifi_tex', 'scifi_uses_clean_digital_texture'),
  anchor('vl_horror_tex', 'vl', [['genre', 'in', 'horror']], 'texture_philosophy', 'rough_organic_grain_heavy', 0.78, 100,
    'registry_rule: vl_horror_tex', 'horror_uses_rough_heavy_grain'),
  anchor('vl_drama_tex', 'vl', [['genre', 'in', 'drama,romance,contemporary']], 'texture_philosophy', 'clean_digital_natural', 0.76, 100,
    'registry_rule: vl_drama_tex', 'drama_uses_clean_natural_texture'),
  anchor('vl_historical_tex', 'vl', [['genre', 'in', 'historical,period']], 'texture_philosophy', 'film_stock_vintage_grain', 0.80, 100,
    'registry_rule: vl_historical_tex', 'historical_uses_vintage_film_grain'),

  // ── VISUAL TONE OVERRIDES (4 anchors — tertiary) ──
  anchor('vl_tone_dark_override', 'vl', [['visual_tone', 'eq', 'dark']], 'contrast_model', 'crushed_black_shadows', 0.72, 50,
    'registry_rule: vl_tone_dark_override', 'dark_tone_overrides_to_crushed_shadows'),
  anchor('vl_tone_moody_override', 'vl', [['visual_tone', 'eq', 'moody']], 'shadow_philosophy', 'deep_ambiguous_shadows', 0.70, 50,
    'registry_rule: vl_tone_moody_override'),
  anchor('vl_tone_bright_override', 'vl', [['visual_tone', 'eq', 'bright']], 'saturation_profile', 'bright_vibrant_saturated', 0.68, 50,
    'registry_rule: vl_tone_bright_override', 'bright_tone_increases_saturation'),
  anchor('vl_tone_vibrant_override', 'vl', [['visual_tone', 'eq', 'vibrant']], 'saturation_profile', 'fully_saturated_rich', 0.70, 50,
    'registry_rule: vl_tone_vibrant_override'),

  // ── STYLE INFLUENCE CROSS-REFERENCES (4 anchors) ──
  anchor('vl_style_noir_ref', 'vl', [['style_influences', 'in', 'film_noir,german_expressionism']], 'shadow_philosophy', 'venetian_blind_crosshatch_shadow', 0.74, 50,
    'registry_rule: vl_style_noir_ref', 'style_influences_add_nuance'),
  anchor('vl_style_anime_ref', 'vl', [['style_influences', 'in', 'anime,manga,cel_shaded']], 'colour_philosophy', 'vibrant_cel_shaded_palette', 0.72, 50,
    'registry_rule: vl_style_anime_ref'),
  anchor('vl_style_neon_ref', 'vl', [['style_influences', 'in', 'neon_noir,cyberpunk_noir']], 'lighting_philosophy', 'neon_and_practical_motivated_hybrid', 0.76, 50,
    'registry_rule: vl_style_neon_ref'),
  anchor('vl_style_nature_ref', 'vl', [['style_influences', 'in', 'nature_documentary,landscape']], 'lens_philosophy', 'spherical_wide_telephoto_set', 0.66, 50,
    'registry_rule: vl_style_nature_ref'),

  // ── CATCH-ALL FALLBACKS (4 anchors — priority 0) ──
  anchor('vl_catchall_contrast', 'vl', [['genre', 'any', '']], 'contrast_model', 'moderate_balanced_contrast', 0.30, 0,
    'registry_rule: vl_catchall_contrast', 'low_confidence_placeholder', 'insufficient_context'),
  anchor('vl_catchall_colour', 'vl', [['genre', 'any', '']], 'colour_philosophy', 'neutral_balanced_palette', 0.30, 0,
    'registry_rule: vl_catchall_colour', 'low_confidence_placeholder'),
  anchor('vl_catchall_lighting', 'vl', [['genre', 'any', '']], 'lighting_philosophy', 'standard_three_point', 0.25, 0,
    'registry_rule: vl_catchall_lighting', 'low_confidence_placeholder'),
  anchor('vl_catchall_lens', 'vl', [['genre', 'any', '']], 'lens_philosophy', 'spherical_standard', 0.25, 0,
    'registry_rule: vl_catchall_lens', 'low_confidence_placeholder'),
];


// ── PD ANCHORS ───────────────────────────────────────────────────────

const PD_ANCHORS: RegistryAnchor[] = [
  // ── DRESSING STYLE (8 anchors — spatial_function x genre) ──
  anchor('pd_hospitality_dressing', 'pd', [['spatial_function', 'eq', 'hospitality']], 'dressing_style', 'functional_bar_cafe_dressing', 0.82, 100,
    'registry_rule: pd_hospitality_dressing', 'spatial_function=hospitality_to_bar_cafe_dressing'),
  anchor('pd_hospitality_noir_dressing', 'pd', [['spatial_function', 'eq', 'hospitality'], ['genre', 'in', 'noir,crime,mystery']], 'dressing_style', 'cluttered_noir_ambient_wood_brass', 0.86, 100,
    'registry_rule: pd_hospitality_noir_dressing', 'noir_hospitality_uses_cluttered_ambient_dressing'),
  anchor('pd_residential_dressing', 'pd', [['spatial_function', 'eq', 'residential']], 'dressing_style', 'lived_in_home_dressing', 0.80, 100,
    'registry_rule: pd_residential_dressing', 'spatial_function=residential_to_home_dressing'),
  anchor('pd_civic_dressing', 'pd', [['spatial_function', 'eq', 'civic']], 'dressing_style', 'formal_civic_institutional_dressing', 0.82, 100,
    'registry_rule: pd_civic_dressing', 'spatial_function=civic_to_institutional_dressing'),
  anchor('pd_commercial_dressing', 'pd', [['spatial_function', 'eq', 'commercial']], 'dressing_style', 'functional_commercial_retail_dressing', 0.80, 100,
    'registry_rule: pd_commercial_dressing', 'spatial_function=commercial_to_retail_dressing'),
  anchor('pd_military_dressing', 'pd', [['spatial_function', 'eq', 'military']], 'dressing_style', 'austere_military_functional_dressing', 0.84, 100,
    'registry_rule: pd_military_dressing', 'spatial_function=military_to_austere_dressing'),
  anchor('pd_industrial_dressing', 'pd', [['spatial_function', 'eq', 'industrial']], 'dressing_style', 'utilitarian_industrial_warehouse_dressing', 0.82, 100,
    'registry_rule: pd_industrial_dressing', 'spatial_function=industrial_to_warehouse_dressing'),
  anchor('pd_religious_dressing', 'pd', [['spatial_function', 'eq', 'religious']], 'dressing_style', 'sacred_devotional_ritual_dressing', 0.82, 100,
    'registry_rule: pd_religious_dressing', 'spatial_function=religious_to_sacred_dressing'),

  // ── SURFACE TREATMENT (6 anchors — spatial_function x period) ──
  anchor('pd_pub_surface', 'pd', [['spatial_function', 'eq', 'hospitality']], 'surface_treatment', 'dark_wainscoting_warm_wood', 0.80, 100,
    'registry_rule: pd_pub_surface', 'hospitality_uses_warm_wood_surfaces'),
  anchor('pd_residential_surface', 'pd', [['spatial_function', 'eq', 'residential']], 'surface_treatment', 'painted_walls_trim_baseboards', 0.78, 100,
    'registry_rule: pd_residential_surface', 'residential_uses_painted_finishes'),
  anchor('pd_civic_surface', 'pd', [['spatial_function', 'eq', 'civic']], 'surface_treatment', 'neutral_institutional_painted_walls', 0.78, 100,
    'registry_rule: pd_civic_surface', 'civic_uses_neutral_institutional_finishes'),
  anchor('pd_military_surface', 'pd', [['spatial_function', 'eq', 'military']], 'surface_treatment', 'utilitarian_painted_concrete_metal', 0.80, 100,
    'registry_rule: pd_military_surface', 'military_uses_utilitarian_finishes'),
  anchor('pd_industrial_surface', 'pd', [['spatial_function', 'eq', 'industrial']], 'surface_treatment', 'exposed_brick_concrete_metal', 0.80, 100,
    'registry_rule: pd_industrial_surface', 'industrial_uses_raw_material_finishes'),
  anchor('pd_religious_surface', 'pd', [['spatial_function', 'eq', 'religious']], 'surface_treatment', 'stone_marble_stained_glass_ornate', 0.82, 100,
    'registry_rule: pd_religious_surface', 'religious_uses_enduring_ornate_finishes'),

  // ── INSTITUTIONAL CULTURE (6 anchors — spatial_function x culture) ──
  anchor('pd_hospitality_institution', 'pd', [['spatial_function', 'eq', 'hospitality']], 'institutional_culture', 'bar_signs_menu_boards_regulars_photos', 0.78, 100,
    'registry_rule: pd_hospitality_institution', 'hospitality_has_bar_signs_and_memorabilia'),
  anchor('pd_civic_institution', 'pd', [['spatial_function', 'eq', 'civic']], 'institutional_culture', 'official_seals_directories_notices', 0.80, 100,
    'registry_rule: pd_civic_institution', 'civic_spaces_have_official_signage'),
  anchor('pd_military_institution', 'pd', [['spatial_function', 'eq', 'military']], 'institutional_culture', 'military_crests_rank_charts_orders', 0.82, 100,
    'registry_rule: pd_military_institution', 'military_spaces_have_rank_and_crest_display'),
  anchor('pd_religious_institution', 'pd', [['spatial_function', 'eq', 'religious']], 'institutional_culture', 'religious_icons_scripture_ritual_objects', 0.82, 100,
    'registry_rule: pd_religious_institution', 'religious_spaces_have_icons_and_ritual_objects'),
  anchor('pd_commercial_institution', 'pd', [['spatial_function', 'eq', 'commercial']], 'institutional_culture', 'branding_signage_product_displays', 0.78, 100,
    'registry_rule: pd_commercial_institution', 'commercial_spaces_have_branding'),
  anchor('pd_industrial_institution', 'pd', [['spatial_function', 'eq', 'industrial']], 'institutional_culture', 'safety_notices_diagrams_inventory_labels', 0.76, 100,
    'registry_rule: pd_industrial_institution', 'industrial_spaces_have_safety_institutional_elements'),

  // ── ENVIRONMENTAL STORY (6 anchors — spatial_function x class x economy) ──
  anchor('pd_env_lived_in', 'pd', [['spatial_function', 'eq', 'residential']], 'environmental_story', 'lived_in_daily_use_warm', 0.80, 100,
    'registry_rule: pd_env_lived_in', 'residential_has_lived_in_daily_use_feel'),
  anchor('pd_env_hospitality_working', 'pd', [['spatial_function', 'eq', 'hospitality'], ['economy', 'in', 'depression,subsistence']], 'environmental_story', 'working_class_daily_lived-in_worn', 0.82, 100,
    'registry_rule: pd_env_hospitality_working', 'depression_economy_hospitality_is_working_class'),
  anchor('pd_env_hospitality_boom', 'pd', [['spatial_function', 'eq', 'hospitality'], ['economy', 'in', 'boom,post_scarcity']], 'environmental_story', 'affluent_pristine_prosperous', 0.80, 100,
    'registry_rule: pd_env_hospitality_boom', 'boom_economy_hospitality_is_affluent'),
  anchor('pd_env_civic', 'pd', [['spatial_function', 'eq', 'civic']], 'environmental_story', 'orderly_official_civic_presence', 0.78, 100,
    'registry_rule: pd_env_civic', 'civic_spaces_are_orderly_official'),
  anchor('pd_env_military', 'pd', [['spatial_function', 'eq', 'military']], 'environmental_story', 'austere_combat_ready_ordered', 0.80, 100,
    'registry_rule: pd_env_military', 'military_spaces_are_austere_ordered'),
  anchor('pd_env_noir_clutter', 'pd', [['spatial_function', 'any', ''], ['genre', 'in', 'noir,crime,mystery']], 'environmental_story', 'high_clutter_noir_detritus', 0.78, 100,
    'registry_rule: pd_env_noir_clutter', 'noir_genre_increases_clutter_and_detritus'),

  // ── SCENE SPECIFIC DRESSING (4 anchors — baseline) ──
  anchor('pd_scene_baseline', 'pd', [['spatial_function', 'eq', 'hospitality']], 'scene_specific_dressing', 'baseline_unmodified', 0.70, 100,
    'registry_rule: pd_scene_baseline', 'baseline_hospitality_dressing_unmodified'),
  anchor('pd_scene_residential', 'pd', [['spatial_function', 'eq', 'residential']], 'scene_specific_dressing', 'baseline_unmodified', 0.68, 100,
    'registry_rule: pd_scene_residential', 'baseline_residential_dressing_unmodified'),
  anchor('pd_scene_civic', 'pd', [['spatial_function', 'eq', 'civic']], 'scene_specific_dressing', 'baseline_unmodified', 0.68, 100,
    'registry_rule: pd_scene_civic', 'baseline_civic_dressing_unmodified'),
  anchor('pd_scene_formal', 'pd', [['spatial_function', 'eq', 'religious']], 'scene_specific_dressing', 'ritual_ceremonial_baseline', 0.72, 100,
    'registry_rule: pd_scene_formal', 'religious_spaces_have_ceremonial_baseline'),

  // ── HERO BACKGROUND OBJECTS (4 anchors — spatial_function x genre) ──
  anchor('pd_hero_pub', 'pd', [['spatial_function', 'eq', 'hospitality']], 'hero_background_objects', 'cigarette_machine_dartboard_jukebox', 0.76, 100,
    'registry_rule: pd_hero_pub', 'hospitality_hero_objects'),
  anchor('pd_hero_office', 'pd', [['spatial_function', 'eq', 'commercial']], 'hero_background_objects', 'water_cooler_plant_photocopier', 0.74, 100,
    'registry_rule: pd_hero_office', 'commercial_hero_objects'),
  anchor('pd_hero_civic', 'pd', [['spatial_function', 'eq', 'civic']], 'hero_background_objects', 'flag_crest_official_portrait', 0.76, 100,
    'registry_rule: pd_hero_civic', 'civic_hero_objects'),
  anchor('pd_hero_military', 'pd', [['spatial_function', 'eq', 'military']], 'hero_background_objects', 'flag_weapon_rack_map_board', 0.78, 100,
    'registry_rule: pd_hero_military', 'military_hero_objects'),

  // ── COLOR ACCENTS (4 anchors — constrained by VL) ──
  anchor('pd_color_warm', 'pd', [['spatial_function', 'eq', 'hospitality']], 'color_accents', 'warm_amber_brown_wood', 0.78, 100,
    'registry_rule: pd_color_warm', 'hospitality_uses_warm_color_accents'),
  anchor('pd_color_civic', 'pd', [['spatial_function', 'eq', 'civic']], 'color_accents', 'neutral_grey_navy_institutional', 0.76, 100,
    'registry_rule: pd_color_civic', 'civic_uses_neutral_color_accents'),
  anchor('pd_color_military', 'pd', [['spatial_function', 'eq', 'military']], 'color_accents', 'olive_black_drab_utilitarian', 0.78, 100,
    'registry_rule: pd_color_military', 'military_uses_subdued_colors'),
  anchor('pd_color_residential', 'pd', [['spatial_function', 'eq', 'residential']], 'color_accents', 'warm_neutral_mixed_domestic', 0.76, 100,
    'registry_rule: pd_color_residential', 'residential_uses_warm_domestic_accents'),

  // ── ATMOSPHERE PHYSICS (4 anchors — genre x spatial_function) ──
  anchor('pd_atm_hospitality_noir', 'pd', [['spatial_function', 'eq', 'hospitality'], ['genre', 'in', 'noir,crime']], 'atmosphere_physics', 'smoke_haze_present_light', 0.78, 100,
    'registry_rule: pd_atm_hospitality_noir', 'noir_hospitality_has_smoke_haze'),
  anchor('pd_atm_noir', 'pd', [['genre', 'in', 'noir,crime']], 'atmosphere_physics', 'smoke_haze_present_moderate', 0.76, 100,
    'registry_rule: pd_atm_noir', 'noir_genre_has_smoke_haze'),
  anchor('pd_atm_horror', 'pd', [['genre', 'in', 'horror']], 'atmosphere_physics', 'dust_fog_present_heavy', 0.78, 100,
    'registry_rule: pd_atm_horror', 'horror_genre_has_heavy_atmosphere'),
  anchor('pd_atm_industrial', 'pd', [['spatial_function', 'eq', 'industrial']], 'atmosphere_physics', 'dust_steam_present_moderate', 0.76, 100,
    'registry_rule: pd_atm_industrial', 'industrial_spaces_have_dust_and_steam'),

  // ── CATCH-ALL (4 anchors — priority 0) ──
  anchor('pd_catchall_dressing', 'pd', [['spatial_function', 'any', '']], 'dressing_style', 'standard_baseline_dressing', 0.30, 0,
    'registry_rule: pd_catchall_dressing', 'low_confidence_placeholder', 'insufficient_context'),
  anchor('pd_catchall_surface', 'pd', [['spatial_function', 'any', '']], 'surface_treatment', 'standard_contemporary_finish', 0.30, 0,
    'registry_rule: pd_catchall_surface', 'low_confidence_placeholder'),
  anchor('pd_catchall_story', 'pd', [['spatial_function', 'any', '']], 'environmental_story', 'minimal_inhabited_presence', 0.30, 0,
    'registry_rule: pd_catchall_story', 'low_confidence_placeholder'),
  anchor('pd_catchall_color', 'pd', [['spatial_function', 'any', '']], 'color_accents', 'neutral_baseline_palette', 0.25, 0,
    'registry_rule: pd_catchall_color', 'low_confidence_placeholder'),
];

export const PD_RULE_COUNT = PD_ANCHORS.length;

export const VL_RULE_COUNT = VL_ANCHORS.length;
export const WARDROBE_RULE_COUNT = WARDROBE_ANCHORS.length;
export const PROP_RULE_COUNT = PROP_ANCHORS.length;
export const VEHICLE_RULE_COUNT = VEHICLE_ANCHORS.length;
export const CREATURE_RULE_COUNT = CREATURE_ANCHORS.length;
export const LOCATION_RULE_COUNT = LOCATION_ANCHORS.length;

// ── Resolvers ────────────────────────────────────────────────────────

/** Resolve wardrobe inference for a single entity */

/**
 * Resolve Visual Language for a project context.
 * Project-level inference — single call, not entity-iterated.
 * PCP fields consumed: genre, period, visual_tone, style_influences, production_language
 */
export function resolveVL(context: CPIEPCPContext): Map<string, RegistryAnchor> {
  const matched = matchRules(VL_ANCHORS, 'vl', context, {
    entity_key: 'project',
    profession: '',  // Not used for VL — dummy for function signature
  });

  // Apply priority resolution: 
  // Higher priority anchors win over lower for same output_field
  const results = new Map<string, RegistryAnchor>();
  const fieldPriorities = new Map<string, number>();

  const entries = Array.from(matched.entries());
  entries.sort((a, b) => {
    const pa = a[1].priority;
    const pb = b[1].priority;
    if (pa !== pb) return pb - pa;  // Higher priority first
    return b[1].confidence - a[1].confidence;
  });

  for (const [field, anchor] of entries) {
    if (!results.has(field) || (anchor.priority > 0 && (fieldPriorities.get(field) || 0) < anchor.priority)) {
      results.set(field, anchor);
      fieldPriorities.set(field, anchor.priority);
    }
    // If we already have a priority>0 entry for this field, skip priority 0 entries
    if (fieldPriorities.get(field) && fieldPriorities.get(field)! > 0 && anchor.priority === 0) continue;
  }

  return results;
}


export function resolveWardrobe(
  context: CPIEPCPContext,
  entity: EntityWithContext,
): Map<string, CPIEInference> {
  const matched = matchRules(WARDROBE_ANCHORS, 'wardrobe', context, entity);
  const now = new Date().toISOString();
  const deps = ['profession_map', 'genre', 'climate', 'period'];
  const result = new Map<string, CPIEInference>();
  for (const [field, anchor] of matched) {
    result.set(field, anchorToInference(anchor, entity.entity_key, deps, now));
  }
  return result;
}

/** Resolve prop inference for a single entity */
export function resolveProps(
  context: CPIEPCPContext,
  entity: EntityWithContext,
): Map<string, CPIEInference> {
  const matched = matchRules(PROP_ANCHORS, 'prop', context, entity);
  const now = new Date().toISOString();
  const deps = ['profession_map', 'period', 'technology_level'];
  const result = new Map<string, CPIEInference>();
  for (const [field, anchor] of matched) {
    result.set(field, anchorToInference(anchor, entity.entity_key, deps, now));
  }
  return result;
}



/** Resolve vehicle inference for a single entity.
 *  Accepts transport_function from the vehicle-processor layer.
 */
export function resolveVehicle(
  context: CPIEPCPContext,
  transportFunction: TransportFunction,
  entity: EntityWithContext,
): Map<string, CPIEInference> {
  // Build augmented context with transport_function for trigger matching
  const augmentedCtx = {
    ...context,
    transport_function: transportFunction,
    infrastructure: context.infrastructure ?? '',
    geography: context.geography ?? '',
    economy: context.economy ?? '',
    class_structure: context.class_structure ?? '',
  } as CPIEPCPContext & { transport_function: string };

  const matched = matchRules(VEHICLE_ANCHORS, 'vehicle', augmentedCtx as any, entity);
  const now = new Date().toISOString();
  const deps = [
    'profession_map', 'period', 'technology_level', 'infrastructure',
    'geography', 'economy', 'class_structure', 'transport_function', 'genre',
  ];
  const result = new Map<string, CPIEInference>();
  for (const [field, anchor] of matched) {
    result.set(field, anchorToInference(anchor, entity.entity_key, deps, now));
  }
  return result;
}

/** Resolve creature inference for a single entity */
export function resolveCreature(
  context: CPIEPCPContext,
  entity: EntityWithContext,
): Map<string, CPIEInference> {
  const matched = matchRules(CREATURE_ANCHORS, 'creature', context, entity);
  const now = new Date().toISOString();
  const deps = [
    'genre', 'period', 'mythology', 'ecology', 'biome',
    'threat_role', 'intelligence', 'symbolism', 'narrative_function',
  ];
  const result = new Map<string, CPIEInference>();
  for (const [field, anchor] of matched) {
    result.set(field, anchorToInference(anchor, entity.entity_key, deps, now));
  }
  return result;
}

/** Update metadata to include vehicle and creature rules */


/** Resolve location inference (Phase 2A). */
export function resolveLocation(
  context: CPIEPCPContext, spatialFunction: string,
  entity: { entity_key: string; canonical_name: string },
): Map<string, CPIEInference> {
  const augmentedCtx = {
    ...context, spatial_function: spatialFunction,
    geography: context.geography ?? "", economy: context.economy ?? "",
    class_structure: context.class_structure ?? "", biome: context.biome ?? "",
  } as CPIEPCPContext & { spatial_function: string };
  const matched = matchRules(LOCATION_ANCHORS, "location", augmentedCtx as any, {
    entity_key: entity.entity_key, canonical_name: entity.canonical_name });
  const now = new Date().toISOString();
  const deps = ["period", "spatial_function", "climate", "culture", "genre",
    "economy", "geography", "biome", "technology_level"];
  const result = new Map<string, CPIEInference>();
  for (const [field, anchor] of matched) {
    result.set(field, anchorToInference(anchor, entity.entity_key, deps, now));
  }
  return result;
}


/**
 * Resolve Production Design for a venue entity.
 * Entity-level inference — per-venue, same pattern as Location.
 * Primary driver: spatial_function from LC. Secondary: genre, period, economy, class.
 */
export function resolvePD(
  context: CPIEPCPContext,
  entity: { entity_key: string; canonical_name: string; profession?: string; role_archetype?: string },
): Map<string, RegistryAnchor> {
  const matched = matchRules(PD_ANCHORS, 'pd', context, entity);

  // Priority resolution: higher priority wins for same output_field
  const results = new Map<string, RegistryAnchor>();
  const entries = Array.from(matched.entries());
  entries.sort((a, b) => {
    const pa = a[1].priority;
    const pb = b[1].priority;
    if (pa !== pb) return pb - pa;
    return b[1].confidence - a[1].confidence;
  });

  for (const [field, anchor] of entries) {
    if (!results.has(field) || anchor.priority > 0) {
      results.set(field, anchor);
    }
  }
  return results;
}

export function getRegistryMetadata(): CPIERegistryMetadata {
  // Collect coverage stats
  const rules = [...WARDROBE_ANCHORS, ...PROP_ANCHORS, ...VEHICLE_ANCHORS, ...CREATURE_ANCHORS, ...LOCATION_ANCHORS];
  const professions = new Set<string>();
  const genres = new Set<string>();
  const climates = new Set<string>();
  const periods = new Set<string>();

  for (const rule of rules) {
    for (const t of rule.triggers) {
      if (t.operator === 'eq' || t.operator === 'in') {
        const vals = Array.isArray(t.value) ? t.value : [t.value];

        for (const v of vals) {
          if (t.pcp_field === 'profession' || t.pcp_field === 'role_archetype') professions.add(v);
          if (t.pcp_field === 'genre') genres.add(v);
          if (t.pcp_field === 'climate') climates.add(v);
          if (t.pcp_field === 'period') periods.add(v);
        }
      }
    }
  }

  return {
    version: CPIE_REGISTRY_VERSION,
    description: 'CPIE Registry v1 — Wardrobe + Prop + Vehicle + Creature inference anchors',
    domain: 'wardrobe_and_prop',
    total_rules: rules.length,
    created_at: CPIE_REGISTRY_CREATED_AT,
    profession_coverage: Array.from(professions).sort(),
    genre_coverage: Array.from(genres).sort(),
    climate_coverage: Array.from(climates).sort(),
    period_coverage: Array.from(periods).sort(),
  };
}
