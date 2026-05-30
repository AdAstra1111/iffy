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

function anchorToInference(
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
    reasoning: anchor.reasoning,
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

export const WARDROBE_RULE_COUNT = WARDROBE_ANCHORS.length;
export const PROP_RULE_COUNT = PROP_ANCHORS.length;
export const VEHICLE_RULE_COUNT = VEHICLE_ANCHORS.length;
export const CREATURE_RULE_COUNT = CREATURE_ANCHORS.length;

// ── Resolvers ────────────────────────────────────────────────────────

/** Resolve wardrobe inference for a single entity */
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
export function getRegistryMetadata(): CPIERegistryMetadata {
  // Collect coverage stats
  const rules = [...WARDROBE_ANCHORS, ...PROP_ANCHORS, ...VEHICLE_ANCHORS, ...CREATURE_ANCHORS];
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
