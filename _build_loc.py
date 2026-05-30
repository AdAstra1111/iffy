import subprocess, sys

# Read clean registry
with open('src/lib/cpie/registry.ts', 'r') as f:
    reg = f.read()

# Find correct insertion point
idx_creature = reg.find('const CREATURE_ANCHORS')
after = reg[idx_creature:]
idx_creature_end = after.rfind('];')
insert_after = idx_creature + idx_creature_end + 2

def mk_a(id, t, o_f, o_v, c, p, *rs):
    ts = ', '.join([f"['{f}', '{o}', '{v}']" for f, o, v in t])
    rs_str = ', '.join([f"'{x}'" for x in rs[:4]])
    return f"  anchor('{id}', 'location', [{ts}], '{o_f}', '{o_v}', {c}, {p}, {rs_str}),\n"

anchors = []
PGS = {'pre_industrial': 'ancient|medieval|fantasy_medieval|bronze_age',
       'early_industrial': 'renaissance|colonial|victorian|18th|19th|1700|1800',
       'modern_war': 'wwi|interwar|1940s|wwii|1930s|1910|1920',
       'contemporary': '1950s|1960s|1970s|1980s|1990s|2000s|2020s|contemporary|modern',
       'future': 'distant_future|near_future|2087|post_apocalyptic|2050'}
MATS = {'pre_industrial': 'wood_stone_thatch', 'early_industrial': 'brick_stone_iron',
        'modern_war': 'concrete_brick_iron', 'contemporary': 'concrete_steel_glass',
        'future': 'composite_glass_alloy'}
FUNCS = ['residential', 'commercial', 'civic', 'military', 'religious', 'industrial', 'transportation', 'hospitality']

for pg, pg_re in PGS.items():
    for func in FUNCS:
        t = [('period', 'regex', pg_re), ('spatial_function', 'eq', func)]
        anchors.append(mk_a(f'lc_{pg}_{func}_arch', t, 'architecture_style', f'{pg}_{func}', 0.88, 100))
        anchors.append(mk_a(f'lc_{pg}_{func}_era', t, 'construction_era', pg, 0.87, 100))
        anchors.append(mk_a(f'lc_{pg}_{func}_mat', t, 'material_palette', MATS[pg], 0.82, 100))
        anchors.append(mk_a(f'lc_{pg}_{func}_lgt', t, 'lighting_character', f'{func}_standard', 0.80, 100))
        anchors.append(mk_a(f'lc_{pg}_{func}_den', t, 'visual_density', 'moderate', 0.78, 100))

SPECIAL = [
    ('lc_arid_mat', [('climate', 'in', 'hot_arid,arid,desert')], 'material_palette', 'stone_mudbrick_adobe', 0.82, 105),
    ('lc_rainy_mat', [('climate', 'in', 'temperate_rainy,rainy,wet,tropical_humid')], 'material_palette', 'waterproofed_wood_stone_tile', 0.80, 105),
    ('lc_snowy_mat', [('climate', 'in', 'cold_snowy,arctic,sub_arctic')], 'material_palette', 'insulated_timber_stone_felt', 0.82, 105),
    ('lc_wild_cave', [('spatial_function', 'eq', 'wilderness'), ('biome', 'in', 'cave,subterranean')], 'architecture_style', 'natural_cavern', 0.90, 100),
    ('lc_wild_forest', [('spatial_function', 'eq', 'wilderness'), ('biome', 'in', 'forest,jungle,woods')], 'architecture_style', 'forest_clearing', 0.85, 100),
    ('lc_wild_desert', [('spatial_function', 'eq', 'wilderness'), ('climate', 'in', 'hot_arid,arid')], 'architecture_style', 'open_desert_plain', 0.85, 100),
    ('lc_light_noir', [('genre', 'in', 'noir,crime,thriller')], 'lighting_character', 'shadow_high_contrast', 0.85, 110),
    ('lc_light_horror', [('genre', 'in', 'horror,suspense')], 'lighting_character', 'dim_ominous_unstable', 0.85, 110),
    ('lc_tech_future', [('period', 'regex', 'future|distant_future|2087')], 'tech_integration', 'full_digital_automated', 0.88, 105),
    ('lc_tech_modern', [('period', 'regex', 'contemporary|modern|2000|2020')], 'tech_integration', 'digital_networked', 0.82, 100),
    ('lc_tech_pre', [('period', 'regex', 'ancient|medieval|fantasy_medieval|bronze_age')], 'tech_integration', 'pre_industrial_none', 0.90, 100),
    ('lc_cond_affl', [('economy', 'in', 'post_scarcity,industrial,developed')], 'condition', 'pristine_maintained', 0.80, 95),
    ('lc_cond_work', [('economy', 'in', 'industrial,agrarian')], 'condition', 'functional_worn', 0.78, 95),
    ('lc_cond_feud', [('economy', 'in', 'feudal,subsistence')], 'condition', 'weathered_utilitarian', 0.80, 95),
]

for a in SPECIAL:
    anchors.append(mk_a(a[0], a[1], a[2], a[3], a[4], a[5]))

CATCH = [
    ('lc_catch_res', 'residential', 'domestic_interior'), ('lc_catch_com', 'commercial', 'retail_interior'),
    ('lc_catch_civ', 'civic', 'public_institutional'), ('lc_catch_mil', 'military', 'military_installation'),
    ('lc_catch_ind', 'industrial', 'industrial_space'), ('lc_catch_rel', 'religious', 'religious_structure'),
    ('lc_catch_tra', 'transportation', 'transportation_infrastructure'), ('lc_catch_hos', 'hospitality', 'social_venue'),
    ('lc_catch_agr', 'agricultural', 'agricultural_facility'), ('lc_catch_wil', 'wilderness', 'natural_terrain'),
    ('lc_catch_pub', 'public_realm', 'public_thoroughfare'), 
    ('lc_catch_gen', None, 'generic_interior_exterior'),
]
for aid, func_val, arch in CATCH:
    t = [('spatial_function', 'any', '')] if func_val is None else [('spatial_function', 'eq', func_val)]
    anchors.append(mk_a(f'{aid}_arch', t, 'architecture_style', arch, 0.30, 0))

anchor_block = '\n\n// LOCATION ANCHORS\n\nconst LOCATION_ANCHORS: RegistryAnchor[] = [\n' + ''.join(anchors) + '];\n\n// ── Rule Counts ──────────────────────────────────────────────────────\n\n'

# Insert and add rule count + resolveLocation + metadata update
reg = reg[:insert_after] + anchor_block + reg[insert_after:]

rc_old = 'export const CREATURE_RULE_COUNT = CREATURE_ANCHORS.length;'
rc_new = rc_old + '\nexport const LOCATION_RULE_COUNT = LOCATION_ANCHORS.length;'
reg = reg.replace(rc_old, rc_new)

resolve_fn = '''\n\n/** Resolve location inference (Phase 2A). */\nexport function resolveLocation(\n  context: CPIEPCPContext, spatialFunction: string,\n  entity: { entity_key: string; canonical_name: string },\n): Map<string, CPIEInference> {\n  const augmentedCtx = {\n    ...context, spatial_function: spatialFunction,\n    geography: context.geography ?? \"\", economy: context.economy ?? \"\",\n    class_structure: context.class_structure ?? \"\", biome: context.biome ?? \"\",\n  } as CPIEPCPContext & { spatial_function: string };\n  const matched = matchRules(LOCATION_ANCHORS, \"location\", augmentedCtx as any, {\n    entity_key: entity.entity_key, canonical_name: entity.canonical_name });\n  const now = new Date().toISOString();\n  const deps = [\"period\", \"spatial_function\", \"climate\", \"culture\", \"genre\",\n    \"economy\", \"geography\", \"biome\", \"technology_level\"];\n  const result = new Map<string, CPIEInference>();\n  for (const [field, anchor] of matched) {\n    result.set(field, anchorToInference(anchor, entity.entity_key, deps, now));\n  }\n  return result;\n}\n'''

idx_meta = reg.find('export function getRegistryMetadata')
reg = reg[:idx_meta] + resolve_fn + '\n' + reg[idx_meta:]
reg = reg.replace('...CREATURE_ANCHORS];', '...CREATURE_ANCHORS, ...LOCATION_ANCHORS];')

with open('src/lib/cpie/registry.ts', 'w') as f:
    f.write(reg)

# Engine
with open('src/lib/cpie/engine.ts', 'r') as f:
    eng = f.read()
eng = eng.replace("import { inferCreature } from './creature';",
    "import { inferCreature } from './creature';\nimport { inferLocation } from './location';\nimport type { LocationInferenceOutput } from './location';")
eng = eng.replace("creature: CreatureInferenceOutput[];\n  };",
    "creature: CreatureInferenceOutput[];\n    location: LocationInferenceOutput[];\n  };")
eng = eng.replace("const domainCreature: CreatureInferenceOutput[] = [];",
    "const domainCreature: CreatureInferenceOutput[] = [];\n  const domainLocation: LocationInferenceOutput[] = [];")
eng = eng.replace("ics.creature = calculateICS(domainCreature.flatMap(c => c.inferences), 'creature');",
    "ics.creature = calculateICS(domainCreature.flatMap(c => c.inferences), 'creature');\n  ics.location = calculateICS(domainLocation.flatMap(l => l.inferences), 'location');")
eng = eng.replace("domains: { wardrobe: domainWardrobe, props: domainProps, vehicle: domainVehicle, creature: domainCreature },",
    "domains: { wardrobe: domainWardrobe, props: domainProps, vehicle: domainVehicle, creature: domainCreature, location: domainLocation },")
with open('src/lib/cpie/engine.ts', 'w') as f:
    f.write(eng)

# CDG
with open('src/lib/cpie/cdg-integration.ts', 'r') as f:
    cdg = f.read()
cdg = cdg.replace(
    "const DOMAIN_NODE_MAP: Record<string, string> = {\n  wardrobe: 'D1',\n  prop: 'D2',\n  vehicle: 'D3',\n  creature: 'D4',\n};",
    "const DOMAIN_NODE_MAP: Record<string, string> = {\n  wardrobe: 'D1',\n  prop: 'D2',\n  vehicle: 'D3',\n  creature: 'D4',\n  location: 'D5',\n};")
cdg = cdg.replace(
    "const CPIE_NODE_MAP: Record<string, string> = {\n  wardrobe: 'C1',\n  prop: 'C2',\n  vehicle: 'C3',\n  creature: 'C4',\n};",
    "const CPIE_NODE_MAP: Record<string, string> = {\n  wardrobe: 'C1',\n  prop: 'C2',\n  vehicle: 'C3',\n  creature: 'C4',\n  location: 'C5',\n};")
with open('src/lib/cpie/cdg-integration.ts', 'w') as f:
    f.write(cdg)

# Now run the tests
print("=== Running location tests ===")
r = subprocess.run(['npx', 'vitest', 'run', 'src/test/cpie/location.test.ts', '--reporter=verbose'],
    capture_output=True, text=True, timeout=60)
print(r.stdout[-800:] if len(r.stdout) > 800 else r.stdout)
if r.returncode != 0:
    print("STDERR:", r.stderr[-500:])
    sys.exit(1)
