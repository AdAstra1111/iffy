/**
 * PCP Resolver — Deterministic Context Resolution Engine
 *
 * Takes raw narrative truth (canon_json, metadata, documents) and produces
 * a fully-resolved ProjectContextProfile with provenance tracking.
 *
 * Resolution hierarchy (per field):
 *   1. User-supplied override (highest authority)
 *   2. Explicit narrative extraction
 *   3. Deterministic inference rules
 *   4. LLM expansion fallback (lowest confidence)
 *
 * Every value carries: source_type, confidence_score, reasoning[]
 * No LLM calls in this resolver — this is the deterministic front door.
 * LLM expansion happens in the CPIE layer when a field is still null
 * after deterministic resolution.
 */

import {
  type ProjectContextProfile,
  type PCPField,
  type PCPProvenance,
  type PCPFieldProvenance,
  type ProvenanceSourceType,
  type ProjectIdentity,
  type TemporalContext,
  type GeographicContext,
  type CulturalContext,
  type TechnologyContext,
  type EconomicContext,
  type ProfessionalContext,
  type VisualContext,
  type PCPCategoryKey,
  type ProfessionEntry,
} from './types';
import {
  resolveTechFromPeriod,
  resolveToneFromGenre,
  resolveClimateFromBiome,
  resolveTransportFromPeriod,
  resolveInfrastructureFromPeriod,
  resolveSocialStructureFromGenre,
  resolveProductionLanguageFromGenre,
  resolveEnergySource,
  PCP_REGISTRY_VERSION,
} from './registry';

// ── Input Types ──────────────────────────────────────────────────────────

/** Raw input to the PCP resolver — narrative truth + project metadata */
export interface PCPResolverInput {
  project_id: string;
  canon_json?: CanonJsonFragment;
  project_metadata?: ProjectMetadataFragment;
  user_overrides?: Partial<ProjectedPCPFields>;
  /** Reference for provenance — which input version was used */
  input_hash?: string;
}

/** Fragment of project_canon.canon_json that PCP can consume */
export interface CanonJsonFragment {
  genre?: string | string[];
  tone?: string;
  characters?: Array<{
    name: string;
    role?: string;
    archetype?: string;
    affiliation?: string;
  }>;
  world_rules?: string[];
  locations?: Array<{
    name: string;
    type?: string;
    region?: string;
    climate?: string;
  }>;
  setting?: {
    period?: string;
    era?: string;
    geography?: string;
    climate?: string;
  };
  timeline?: string;
}

/** Fragment of project-level metadata */
export interface ProjectMetadataFragment {
  genre_tags?: string[];
  format?: string;
  target_audience?: string;
  format_subtype?: string;
}

/**
 * Flattened PCP field types for user override specification.
 * Keys are dotted paths like "temporal_context.period".
 */
export interface ProjectedPCPFields {
  'project_identity.genre': string[];
  'project_identity.subgenre': string[];
  'project_identity.format': string;
  'project_identity.target_audience': string;
  'project_identity.format_subtype': string;
  'temporal_context.era': string;
  'temporal_context.period': string;
  'temporal_context.historical_accuracy': string;
  'temporal_context.year_range': { from?: number; to?: number };
  'temporal_context.time_markers': string[];
  'geographic_context.primary_region': string;
  'geographic_context.primary_country': string;
  'geographic_context.primary_biome': string;
  'geographic_context.climate': string;
  'geographic_context.season': string;
  'geographic_context.urban_density': string;
  'geographic_context.setting_scope': string;
  'cultural_context.dominant_cultures': string[];
  'cultural_context.cultural_mix': string;
  'cultural_context.social_norms': string[];
  'cultural_context.belief_systems': string[];
  'cultural_context.language_context': string[];
  'technology_context.level': string;
  'technology_context.infrastructure': string;
  'technology_context.transportation_assumptions': string[];
  'technology_context.communication_level': string;
  'technology_context.energy_source': string;
  'economic_context.wealth_distribution': string;
  'economic_context.class_structure': string;
  'economic_context.industrialization_level': string;
  'economic_context.economic_baseline': string;
  'professional_context.profession_map': Record<string, ProfessionEntry>;
  'professional_context.institutional_systems': string[];
  'professional_context.authority_structures': string;
  'visual_context.visual_tone': string;
  'visual_context.style_influences': string[];
  'visual_context.production_language': string;
}

// ── Helper: Make a PCPField ─────────────────────────────────────────────

const RESOLVER_VERSION = '1.0.0';

function makeField<T>(
  value: T,
  source_type: ProvenanceSourceType,
  confidence: number,
  reasoning: string[],
): PCPField<T> {
  return {
    value,
    provenance: {
      source_type,
      confidence_score: confidence,
      reasoning,
      resolved_at: new Date().toISOString(),
      resolver_version: RESOLVER_VERSION,
    },
  };
}

// ── Extraction Helpers ───────────────────────────────────────────────────

function extractArrayField(
  source: string[] | string | undefined,
  label: string,
): { value: string[]; source_type: ProvenanceSourceType; confidence: number; reasoning: string[] } | null {
  if (!source || (Array.isArray(source) && source.length === 0)) return null;
  if (Array.isArray(source)) {
    return {
      value: source,
      source_type: 'extracted',
      confidence: 0.95,
      reasoning: [`extracted from ${label}`],
    };
  }
  return {
    value: [source],
    source_type: 'extracted',
    confidence: 0.9,
    reasoning: [`parsed from ${label}`],
  };
}

function extractStringField(
  source: string | undefined,
  label: string,
  confidence = 0.95,
): { value: string; source_type: ProvenanceSourceType; confidence: number; reasoning: string[] } | null {
  if (!source || source.trim().length === 0) return null;
  return {
    value: source.trim(),
    source_type: 'extracted',
    confidence,
    reasoning: [`extracted from ${label}`],
  };
}

// ── Inferred Field Helpers ──────────────────────────────────────────────

function inferredField<T>(
  value: T,
  ruleName: string,
  rationale: string[],
  confidence = 0.85,
): PCPField<T> {
  return makeField(value, 'inferred', confidence, [
    `rule: ${ruleName}`,
    ...rationale,
  ]);
}

// ── Project Identity Resolver ────────────────────────────────────────────

function resolveProjectIdentity(
  input: PCPResolverInput,
): ProjectIdentity {
  const meta = input.project_metadata;
  const canon = input.canon_json;
  const overrides = input.user_overrides;

  // genre: overrides → metadata → canon_json → ["unknown"]
  let genre: string[];
  let genreSource: string;
  if (overrides?.['project_identity.genre']) {
    genre = overrides['project_identity.genre'];
    genreSource = 'user_supplied';
  } else if (meta?.genre_tags && meta.genre_tags.length > 0) {
    genre = meta.genre_tags;
    genreSource = 'project_metadata.genre_tags';
  } else if (canon?.genre) {
    genre = Array.isArray(canon.genre) ? canon.genre : [canon.genre];
    genreSource = 'canon_json.genre';
  } else {
    genre = ['unknown'];
    genreSource = 'fallback_default';
  }

  const genreConfidence = genreSource === 'fallback_default' ? 0.3 : 0.9;
  const genreSourceType: ProvenanceSourceType = 
    genreSource === 'user_supplied' ? 'user_supplied' 
    : genreSource === 'project_metadata.genre_tags' ? 'extracted'
    : genreSource === 'fallback_default' ? 'inferred'
    : genreSource === 'canon_json.genre' ? 'extracted'
    : 'inferred';

  return {
  genre: makeField(genre, genreSourceType, genreConfidence, [
      genreSource === 'fallback_default'
        ? 'no genre data found — default to unknown'
        : `resolved from ${genreSource}`,
    ]),
    subgenre: overrides?.['project_identity.subgenre']
      ? makeField(overrides['project_identity.subgenre'], 'user_supplied', 1.0, ['user override'])
      : makeField([], 'inferred', 0.3, ['no subgenre data available']),
    format: overrides?.['project_identity.format']
      ? makeField(overrides['project_identity.format'], 'user_supplied', 1.0, ['user override'])
      : meta?.format
        ? makeField(meta.format, 'extracted', 0.95, ['extracted from project_metadata.format'])
        : makeField('feature_film', 'inferred', 0.5, ['default format: feature_film']),
    target_audience: overrides?.['project_identity.target_audience']
      ? makeField(overrides['project_identity.target_audience'], 'user_supplied', 1.0, ['user override'])
      : meta?.target_audience
        ? makeField(meta.target_audience, 'extracted', 0.85, ['extracted from metadata'])
        : makeField('adults_25-55', 'inferred', 0.4, ['default audience assumption']),
    format_subtype: overrides?.['project_identity.format_subtype']
      ? makeField(overrides['project_identity.format_subtype'], 'user_supplied', 1.0, ['user override'])
      : meta?.format_subtype
        ? makeField(meta.format_subtype, 'extracted', 0.9, ['extracted from metadata'])
        : makeField('', 'inferred', 0.2, ['no format subtype available']),
  };
}

// ── Temporal Context Resolver ────────────────────────────────────────────

function resolveTemporalContext(
  input: PCPResolverInput,
  projectIdentity: ProjectIdentity,
): TemporalContext {
  const canon = input.canon_json;
  const overrides = input.user_overrides;
  const genre = projectIdentity.genre.value[0] || '';

  // period: overrides → canon_json → genre inference
  let periodValue: string;
  let periodSource: string;
  if (overrides?.['temporal_context.period']) {
    periodValue = overrides['temporal_context.period'];
    periodSource = 'user_supplied';
  } else if (canon?.setting?.period) {
    periodValue = canon.setting.period;
    periodSource = 'canon_json.setting.period';
  } else {
    // Infer from genre
    periodValue = genre === 'historical' ? 'unknown_historical'
      : genre === 'sci_fi' ? 'distant_future'
      : genre === 'fantasy' ? 'fantasy_era'
      : 'contemporary';
    periodSource = 'inferred_from_genre';
  }

  const periodField = makeField(periodValue,
    periodSource === 'user_supplied' ? 'user_supplied'
    : periodSource === 'inferred_from_genre' ? 'inferred'
    : 'extracted',
    periodSource === 'user_supplied' ? 1.0
    : periodSource === 'inferred_from_genre' ? 0.5
    : 0.95,
    [periodSource === 'inferred_from_genre'
      ? `inferred period from genre=${genre}`
      : `resolved from ${periodSource}`,
    ],
  );

  // era: derived from period
  let eraValue: string;
  if (overrides?.['temporal_context.era']) {
    eraValue = overrides['temporal_context.era'];
  } else {
    const pLow = periodValue.toLowerCase();
    if (pLow.includes('future') || pLow.includes('sci_fi') || pLow.includes('2087')) eraValue = 'future';
    else if (pLow.includes('fantasy') || pLow.includes('medieval') || pLow.includes('bronze') || pLow.includes('ancient')) eraValue = 'fantasy_era';
    else if (pLow.includes('194') || pLow.includes('195') || pLow.includes('ww') || pLow.includes('interwar')) eraValue = 'historical';
    else if (pLow.includes('20') || pLow.includes('21')) eraValue = 'contemporary';
    else eraValue = 'historical';
  }

  return {
    era: makeField(eraValue, 'inferred', 0.85, [
      `derived from period=${periodValue}`,
    ]),
    period: periodField,
    historical_accuracy: overrides?.['temporal_context.historical_accuracy']
      ? makeField(overrides['temporal_context.historical_accuracy'], 'user_supplied', 1.0, ['user override'])
      : makeField('stylised', 'inferred', 0.6, ['default: stylised (no accuracy constraint specified)']),
    year_range: overrides?.['temporal_context.year_range']
      ? makeField(overrides['temporal_context.year_range'], 'user_supplied', 1.0, ['user override'])
      : makeField({}, 'inferred', 0.2, ['no year range available']),
    time_markers: overrides?.['temporal_context.time_markers']
      ? makeField(overrides['temporal_context.time_markers'], 'user_supplied', 1.0, ['user override'])
      : makeField([], 'inferred', 0.3, ['no time markers extracted']),
  };
}

// ── Geographic Context Resolver ──────────────────────────────────────────

function resolveGeographicContext(
  input: PCPResolverInput,
): GeographicContext {
  const canon = input.canon_json;
  const overrides = input.user_overrides;

  const region = overrides?.['geographic_context.primary_region']
    ?? canon?.setting?.geography
    ?? 'unknown';
  const biome = overrides?.['geographic_context.primary_biome']
    ?? extractStringField(canon?.setting?.climate, 'canon_json.setting.climate', 0.9)?.value
    ?? 'urban';
  const climate = overrides?.['geographic_context.climate']
    ?? resolveClimateFromBiome(biome);

  return {
    primary_region: makeField(region,
      overrides?.['geographic_context.primary_region'] ? 'user_supplied'
      : canon?.setting?.geography ? 'extracted'
      : 'inferred',
      overrides?.['geographic_context.primary_region'] ? 1.0
      : canon?.setting?.geography ? 0.9
      : 0.3,
      ['resolved from ' + (overrides?.['geographic_context.primary_region'] ? 'user override'
        : canon?.setting?.geography ? 'canon_json.setting.geography'
        : 'fallback (unknown)')],
    ),
    primary_country: overrides?.['geographic_context.primary_country']
      ? makeField(overrides['geographic_context.primary_country'], 'user_supplied', 1.0, ['user override'])
      : makeField('unknown', 'inferred', 0.2, ['no country data available']),
    primary_biome: makeField(biome,
      overrides?.['geographic_context.primary_biome'] ? 'user_supplied' : 'extracted',
      overrides?.['geographic_context.primary_biome'] ? 1.0 : 0.85,
      ['resolved from ' + (overrides?.['geographic_context.primary_biome'] ? 'user override'
        : 'canon_json.setting')],
    ),
    climate: makeField(climate,
      overrides?.['geographic_context.climate'] ? 'user_supplied'
      : climate !== 'unknown' ? 'inferred'
      : 'inferred',
      overrides?.['geographic_context.climate'] ? 1.0
      : climate !== 'unknown' ? 0.75
      : 0.3,
      [overrides?.['geographic_context.climate']
        ? 'user override'
        : `inferred from biome=${biome}`
      ],
    ),
    season: overrides?.['geographic_context.season']
      ? makeField(overrides['geographic_context.season'], 'user_supplied', 1.0, ['user override'])
      : makeField('year_round', 'inferred', 0.5, ['default season: year_round']),
    urban_density: overrides?.['geographic_context.urban_density']
      ? makeField(overrides['geographic_context.urban_density'], 'user_supplied', 1.0, ['user override'])
      : makeField('urban', 'inferred', 0.5, ['default: urban (most common filming context)']),
    setting_scope: overrides?.['geographic_context.setting_scope']
      ? makeField(overrides['geographic_context.setting_scope'], 'user_supplied', 1.0, ['user override'])
      : makeField('city_wide', 'inferred', 0.5, ['default: city_wide']),
  };
}

// ── Cultural Context Resolver ────────────────────────────────────────────

function resolveCulturalContext(
  input: PCPResolverInput,
  geographic: GeographicContext,
): CulturalContext {
  const overrides = input.user_overrides;

  return {
    dominant_cultures: overrides?.['cultural_context.dominant_cultures']
      ? makeField(overrides['cultural_context.dominant_cultures'], 'user_supplied', 1.0, ['user override'])
      : makeField([], 'inferred', 0.3, ['no culture data — infer from geography not yet implemented']),
    cultural_mix: overrides?.['cultural_context.cultural_mix']
      ? makeField(overrides['cultural_context.cultural_mix'], 'user_supplied', 1.0, ['user override'])
      : makeField('unknown', 'inferred', 0.2, ['no cultural mix data']),
    social_norms: overrides?.['cultural_context.social_norms']
      ? makeField(overrides['cultural_context.social_norms'], 'user_supplied', 1.0, ['user override'])
      : makeField([], 'inferred', 0.2, ['no social norms data']),
    belief_systems: overrides?.['cultural_context.belief_systems']
      ? makeField(overrides['cultural_context.belief_systems'], 'user_supplied', 1.0, ['user override'])
      : makeField([], 'inferred', 0.2, ['no belief system data']),
    language_context: overrides?.['cultural_context.language_context']
      ? makeField(overrides['cultural_context.language_context'], 'user_supplied', 1.0, ['user override'])
      : makeField(['English'], 'inferred', 0.5, ['default: English']),
  };
}

// ── Technology Context Resolver ─────────────────────────────────────────

function resolveTechnologyContext(
  input: PCPResolverInput,
  temporal: TemporalContext,
): TechnologyContext {
  const overrides = input.user_overrides;
  const period = temporal.period.value;

  const techLevel = overrides?.['technology_context.level']
    ?? resolveTechFromPeriod(period)
    ?? 'contemporary';

  return {
    level: makeField(techLevel,
      overrides?.['technology_context.level'] ? 'user_supplied'
      : 'inferred',
      overrides?.['technology_context.level'] ? 1.0
      : techLevel !== 'contemporary' ? 0.85
      : 0.65,
      [overrides?.['technology_context.level']
        ? 'user override'
        : `inferred from period=${period}`
      ],
    ),
    infrastructure: overrides?.['technology_context.infrastructure']
      ? makeField(overrides['technology_context.infrastructure'], 'user_supplied', 1.0, ['user override'])
      : inferredField(
          resolveInfrastructureFromPeriod(period),
          'infrastructure_from_period',
          [`period=${period}`],
        ),
    transportation_assumptions: overrides?.['technology_context.transportation_assumptions']
      ? makeField(overrides['technology_context.transportation_assumptions'], 'user_supplied', 1.0, ['user override'])
      : inferredField(
          resolveTransportFromPeriod(period),
          'transport_from_period',
          [`period=${period}`],
        ),
    communication_level: overrides?.['technology_context.communication_level']
      ? makeField(overrides['technology_context.communication_level'], 'user_supplied', 1.0, ['user override'])
      : makeField('digital', 'inferred', 0.6, ['default: digital']),
    energy_source: overrides?.['technology_context.energy_source']
      ? makeField(overrides['technology_context.energy_source'], 'user_supplied', 1.0, ['user override'])
      : inferredField(
          resolveEnergySource(period),
          'energy_from_period',
          [`period=${period}`],
        ),
  };
}

// ── Economic Context Resolver ───────────────────────────────────────────

function resolveEconomicContext(
  input: PCPResolverInput,
): EconomicContext {
  const overrides = input.user_overrides;

  return {
    wealth_distribution: overrides?.['economic_context.wealth_distribution']
      ? makeField(overrides['economic_context.wealth_distribution'], 'user_supplied', 1.0, ['user override'])
      : makeField('unknown', 'inferred', 0.2, ['no economic data']),
    class_structure: overrides?.['economic_context.class_structure']
      ? makeField(overrides['economic_context.class_structure'], 'user_supplied', 1.0, ['user override'])
      : makeField('unknown', 'inferred', 0.2, ['no class structure data']),
    industrialization_level: overrides?.['economic_context.industrialization_level']
      ? makeField(overrides['economic_context.industrialization_level'], 'user_supplied', 1.0, ['user override'])
      : makeField('unknown', 'inferred', 0.2, ['no industrialization data']),
    economic_baseline: overrides?.['economic_context.economic_baseline']
      ? makeField(overrides['economic_context.economic_baseline'], 'user_supplied', 1.0, ['user override'])
      : makeField('peace_time', 'inferred', 0.5, ['default: peace_time']),
  };
}

// ── Professional Context Resolver ───────────────────────────────────────

function resolveProfessionalContext(
  input: PCPResolverInput,
): ProfessionalContext {
  const canon = input.canon_json;
  const overrides = input.user_overrides;

  // profession map from characters
  const professionMap: Record<string, ProfessionEntry> = {};
  const charList = canon?.characters ?? [];
  for (const char of charList) {
    if (char.name) {
      professionMap[char.name] = {
        character_name: char.name,
        profession: char.role || char.archetype || 'unknown',
        role_archetype: char.archetype || char.role || 'unknown',
        authority_level: 'civilian',
        institutional_affiliation: char.affiliation || null,
        confidence: char.role ? 0.9 : 0.6,
        source: char.role ? 'canon_extracted' : 'inferred_from_role',
      };
    }
  }

  if (overrides?.['professional_context.profession_map']) {
    Object.assign(professionMap, overrides['professional_context.profession_map']);
  }

  return {
    profession_map: makeField(professionMap,
      charList.length > 0 ? 'extracted' : 'inferred',
      charList.length > 0 ? 0.85 : 0.3,
      [charList.length > 0
        ? `extracted ${charList.length} characters from canon_json`
        : 'no character data available for profession inference'
      ],
    ),
    institutional_systems: overrides?.['professional_context.institutional_systems']
      ? makeField(overrides['professional_context.institutional_systems'], 'user_supplied', 1.0, ['user override'])
      : makeField([], 'inferred', 0.2, ['no institutional data']),
    authority_structures: overrides?.['professional_context.authority_structures']
      ? makeField(overrides['professional_context.authority_structures'], 'user_supplied', 1.0, ['user override'])
      : makeField('unknown', 'inferred', 0.2, ['no authority structure data']),
  };
}

// ── Visual Context Resolver ─────────────────────────────────────────────

function resolveVisualContext(
  input: PCPResolverInput,
  projectIdentity: ProjectIdentity,
  temporal: TemporalContext,
): VisualContext {
  const overrides = input.user_overrides;
  const genre = projectIdentity.genre.value[0] || '';
  const period = temporal.period.value;

  const visualTone = overrides?.['visual_context.visual_tone']
    ?? resolveToneFromGenre(genre)
    ?? 'naturalistic';

  const prodLang = overrides?.['visual_context.production_language']
    ?? resolveProductionLanguageFromGenre(genre)
    ?? 'gritty_realism';

  return {
    visual_tone: makeField(visualTone,
      overrides?.['visual_context.visual_tone'] ? 'user_supplied'
      : 'inferred',
      overrides?.['visual_context.visual_tone'] ? 1.0
      : visualTone !== 'naturalistic' ? 0.85
      : 0.65,
      [overrides?.['visual_context.visual_tone']
        ? 'user override'
        : `inferred from genre=${genre}`,
      ],
    ),
    style_influences: overrides?.['visual_context.style_influences']
      ? makeField(overrides['visual_context.style_influences'], 'user_supplied', 1.0, ['user override'])
      : makeField([], 'inferred', 0.3, ['no style influences data']),
    production_language: makeField(prodLang,
      overrides?.['visual_context.production_language'] ? 'user_supplied'
      : 'inferred',
      overrides?.['visual_context.production_language'] ? 1.0
      : prodLang !== 'gritty_realism' ? 0.8
      : 0.55,
      [overrides?.['visual_context.production_language']
        ? 'user override'
        : `inferred from genre=${genre}`,
      ],
    ),
  };
}

// ── Source Hash ──────────────────────────────────────────────────────────

/** Simple hash for input dedup */
export function hashInput(input: PCPResolverInput): string {
  const str = JSON.stringify({ canon: input.canon_json, meta: input.project_metadata });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // convert to 32bit int
  }
  return Math.abs(hash).toString(16);
}

// ── Collect Stale Fields ────────────────────────────────────────────────

/** Compare two profiles and return field paths that changed */
export function detectPCPChanges(
  previous: ProjectContextProfile,
  current: ProjectContextProfile,
): string[] {
  const changes: string[] = [];
  const categories: PCPCategoryKey[] = [
    'project_identity', 'temporal_context', 'geographic_context',
    'cultural_context', 'technology_context', 'economic_context',
    'professional_context', 'visual_context',
  ];

  for (const cat of categories) {
    const prevCat = previous[cat] as Record<string, PCPField<unknown>>;
    const currCat = current[cat] as Record<string, PCPField<unknown>>;
    if (!prevCat || !currCat) continue;

    for (const [field, currField] of Object.entries(currCat)) {
      const prevField = prevCat[field];
      if (!prevField) {
        changes.push(`${cat}.${field}`);
        continue;
      }
      try {
        if (JSON.stringify(prevField.value) !== JSON.stringify(currField.value)) {
          changes.push(`${cat}.${field}`);
        }
      } catch {
        changes.push(`${cat}.${field}`);
      }
    }
  }
  return changes;
}

// ── Main Resolver ───────────────────────────────────────────────────────

/**
 * Resolve a full ProjectContextProfile from narrative truth + metadata.
 *
 * Deterministic: same inputs → same output (same hash).
 * No LLM calls — this is the deterministic front door.
 *
 * @param input Raw narrative truth and project metadata
 * @param previousProfile Optional previous profile for change detection
 * @returns Fully-resolved ProjectContextProfile
 */
export function resolvePCP(
  input: PCPResolverInput,
  previousProfile?: ProjectContextProfile,
): ProjectContextProfile {
  const projectId = input.project_id;

  // Resolve each category (ordered — some depend on previous)
  const projectIdentity = resolveProjectIdentity(input);
  const temporalContext = resolveTemporalContext(input, projectIdentity);
  const geographicContext = resolveGeographicContext(input);
  const culturalContext = resolveCulturalContext(input, geographicContext);
  const technologyContext = resolveTechnologyContext(input, temporalContext);
  const economicContext = resolveEconomicContext(input);
  const professionalContext = resolveProfessionalContext(input);
  const visualContext = resolveVisualContext(input, projectIdentity, temporalContext);

  // Build the profile
  const sourceHash = input.input_hash || hashInput(input);
  const now = new Date().toISOString();

  const profile: ProjectContextProfile = {
    profile_id: `pcp-${projectId}-${Date.now()}`,
    project_id: projectId,
    version_number: (previousProfile?.version_number ?? 0) + 1,
    status: 'complete',
    resolved_at: now,
    project_identity: projectIdentity,
    temporal_context: temporalContext,
    geographic_context: geographicContext,
    cultural_context: culturalContext,
    technology_context: technologyContext,
    economic_context: economicContext,
    professional_context: professionalContext,
    visual_context: visualContext,
    provenance: {
      profile_version: `${previousProfile?.version_number ?? 0}.${sourceHash.slice(0, 4)}`,
      resolver_version: RESOLVER_VERSION,
      source_hash: sourceHash,
      resolution_count: (previousProfile?.provenance.resolution_count ?? 0) + 1,
      last_resolved_at: now,
      stale_fields: [],
      field_provenance: {},
    },
    source_hash: sourceHash,
    stale_fields: [],
  };

  // Detect changes if previous exists
  if (previousProfile) {
    profile.stale_fields = detectPCPChanges(previousProfile, profile);
    profile.provenance.stale_fields = profile.stale_fields;
  }

  return profile;
}

/** Get the resolver version */
export function getPCPResolverVersion(): string {
  return `${RESOLVER_VERSION}+registry.${PCP_REGISTRY_VERSION}`;
}
