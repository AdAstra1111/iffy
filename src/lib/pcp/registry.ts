/**
 * PCP Registry — Deterministic Mapping Tables
 *
 * These tables define the inference rules for context fields that are
 * DERIVED from other fields. Rules are deterministic (no LLM) to ensure
 * auditable, reproducible resolution.
 *
 * Invariant: Every mapping table is pure — same input -> same output.
 */

// ---- Period -> Technology Level -------------------------------------------

export const PERIOD_TECH_MAP: Record<string, string> = {
  'ancient': 'pre_industrial',
  'medieval': 'pre_industrial',
  'bronze_age': 'pre_industrial',
  'iron_age': 'pre_industrial',
  'renaissance': 'early_industrial',
  'colonial': 'industrial_revolution',
  'victorian': 'industrial_revolution',
  'wwi': 'industrial_warfare',
  'interwar': 'early_modern',
  'wwii_era': 'mid_20th_century',
  '1950s': 'post_war_modern',
  '1960s': 'modern_analog',
  '1970s': 'modern_analog',
  '1980s': 'early_digital',
  '1990s': 'digital_emerging',
  '2000s': 'contemporary',
  '2010s': 'contemporary',
  '2020s': 'contemporary',
  'near_future': 'advanced_contemporary',
  'distant_future': 'sci_fi_advanced',
  'post_apocalyptic': 'ruined',
};

/** Resolve technology level from period label. Returns null if unknown. */
export function resolveTechFromPeriod(period: string): string | null {
  const normalized = period.toLowerCase().replace(/[^a-z0-9_ ]/g, '').trim();
  if (PERIOD_TECH_MAP[normalized]) return PERIOD_TECH_MAP[normalized];
  for (const [key, value] of Object.entries(PERIOD_TECH_MAP)) {
    if (normalized.includes(key)) return value;
  }
  // Handle numeric periods like "1944" or "2087"
  const yearMatch = normalized.match(/(\d{4})s?/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 2080) return 'sci_fi_advanced';
    if (year >= 2000) return 'contemporary';
    if (year >= 1990) return 'digital_emerging';
    if (year >= 1980) return 'early_digital';
    if (year >= 1970) return 'modern_analog';
    if (year >= 1960) return 'modern_analog';
    if (year >= 1950) return 'post_war_modern';
    if (year >= 1940) return 'mid_20th_century';
    if (year >= 1920) return 'early_modern';
    if (year >= 1900) return 'industrial_warfare';
    if (year >= 1800) return 'industrial_revolution';
    if (year >= 1700) return 'early_industrial';
    return 'pre_industrial';
  }
  if (normalized.includes('future')) return 'sci_fi_advanced';
  if (normalized.includes('apocalypse')) return 'ruined';
  return null;
}

// ---- Genre -> Default Visual Tone -----------------------------------------

export const GENRE_TONE_MAP: Record<string, string> = {
  'noir': 'dark_high_contrast',
  'crime': 'dark_gritty',
  'thriller': 'tense_moody',
  'horror': 'dark_ominous',
  'fantasy': 'rich_vibrant',
  'sci_fi': 'sleek_cool',
  'comedy': 'bright_light',
  'romance': 'warm_soft',
  'drama': 'naturalistic',
  'action': 'dynamic_saturated',
  'historical': 'period_authentic',
  'animation': 'stylised_colorful',
};

/** Resolve visual tone from primary genre. Returns null if unknown. */
export function resolveToneFromGenre(genre: string): string | null {
  const normalized = genre.toLowerCase().trim();
  if (GENRE_TONE_MAP[normalized]) return GENRE_TONE_MAP[normalized];
  return null;
}

// ---- Biome -> Climate -----------------------------------------------------

export const BIOME_CLIMATE_MAP: Record<string, string> = {
  'temperate_forest': 'temperate_rainy',
  'arid_desert': 'hot_arid',
  'arctic_tundra': 'cold_snowy',
  'tropical_rainforest': 'tropical_humid',
  'mediterranean': 'warm_dry_summer',
  'continental': 'seasonal_extremes',
  'grassland': 'temperate_dry',
  'mountain': 'cold_mountain',
  'urban': 'climate_of_geography',
};

/** Resolve climate from biome. Returns 'unknown' for unrecognized biomes. */
export function resolveClimateFromBiome(biome: string): string {
  const normalized = biome.toLowerCase().replace(/[^a-z_]/g, '').trim();
  return BIOME_CLIMATE_MAP[normalized] ?? 'unknown';
}

// ---- Period -> Transportation Defaults ------------------------------------

export const PERIOD_TRANSPORT_MAP: Record<string, string[]> = {
  'ancient': ['walking', 'horse_drawn', 'sailing'],
  'medieval': ['walking', 'horse_drawn', 'sailing'],
  'bronze_age': ['walking', 'horse_drawn', 'sailing'],
  'renaissance': ['walking', 'horse_drawn', 'sailing'],
  'colonial': ['walking', 'horse_drawn', 'sailing', 'rail'],
  'victorian': ['horse_drawn', 'rail', 'sailing', 'early_automotive'],
  'wwi': ['automotive', 'rail', 'aviation', 'horse_drawn'],
  'interwar': ['automotive', 'rail', 'aviation'],
  'wwii_era': ['automotive', 'rail', 'aviation', 'military_vehicle'],
  '1950s': ['automotive', 'rail', 'aviation'],
  '1960s': ['automotive', 'rail', 'aviation'],
  '1970s': ['automotive', 'rail', 'aviation'],
  '1980s': ['automotive', 'rail', 'aviation'],
  '1990s': ['automotive', 'rail', 'aviation'],
  '2000s': ['automotive', 'rail', 'aviation'],
  '2010s': ['automotive', 'rail', 'aviation'],
  '2020s': ['automotive', 'rail', 'aviation', 'ride_share'],
  'near_future': ['automotive', 'rail', 'aviation', 'autonomous_vehicle'],
  'distant_future': ['hover', 'autonomous_vehicle', 'teleportation', 'space_travel'],
  'post_apocalyptic': ['walking', 'makeshift_vehicle'],
};

/** Resolve transportation assumptions from period. */
export function resolveTransportFromPeriod(period: string): string[] {
  const normalized = period.toLowerCase().replace(/[^a-z0-9_ ]/g, '').trim();
  if (PERIOD_TRANSPORT_MAP[normalized]) return PERIOD_TRANSPORT_MAP[normalized];
  for (const [key, value] of Object.entries(PERIOD_TRANSPORT_MAP)) {
    if (normalized.includes(key)) return value;
  }
  // Handle numeric periods
  const yearMatch = normalized.match(/(\d{4})s?/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 2080) return ['hover', 'autonomous_vehicle', 'teleportation', 'space_travel'];
    if (year >= 2000) return ['automotive', 'rail', 'aviation', 'ride_share'];
    if (year >= 1950) return ['automotive', 'rail', 'aviation'];
    if (year >= 1940) return ['automotive', 'rail', 'aviation', 'military_vehicle'];
    if (year >= 1920) return ['automotive', 'rail', 'aviation'];
    if (year >= 1900) return ['horse_drawn', 'rail', 'early_automotive'];
    if (year >= 1800) return ['horse_drawn', 'sailing', 'rail'];
    return ['walking', 'horse_drawn'];
  }
  return ['automotive', 'walking'];
}

// ---- Period -> Infrastructure Default --------------------------------------

export const PERIOD_INFRASTRUCTURE_MAP: Record<string, string> = {
  'ancient': 'primitive',
  'medieval': 'primitive',
  'bronze_age': 'primitive',
  'iron_age': 'primitive',
  'renaissance': 'developing',
  'colonial': 'developing',
  'victorian': 'developing',
  'wwi': 'modern',
  'interwar': 'modern',
  'wwii_era': 'modern',
  '1950s': 'modern',
  '1960s': 'modern',
  '1970s': 'modern',
  '1980s': 'advanced',
  '1990s': 'advanced',
  '2000s': 'advanced',
  '2010s': 'advanced',
  '2020s': 'advanced',
  'near_future': 'advanced',
  'distant_future': 'advanced',
  'post_apocalyptic': 'ruined',
};

/** Resolve infrastructure level from period. */
export function resolveInfrastructureFromPeriod(period: string): string {
  const normalized = period.toLowerCase().replace(/[^a-z0-9_ ]/g, '').trim();
  if (PERIOD_INFRASTRUCTURE_MAP[normalized]) return PERIOD_INFRASTRUCTURE_MAP[normalized];
  for (const [key, value] of Object.entries(PERIOD_INFRASTRUCTURE_MAP)) {
    if (normalized.includes(key)) return value;
  }
  const yearMatch = normalized.match(/(\d{4})s?/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 2080) return 'advanced';
    if (year >= 1980) return 'advanced';
    if (year >= 1920) return 'modern';
    if (year >= 1800) return 'developing';
    return 'primitive';
  }
  return 'modern';
}

// ---- Genre -> Default Social Structure -------------------------------------

export const GENRE_SOCIAL_STRUCTURE_MAP: Record<string, string> = {
  'noir': 'corrupt_individualistic',
  'crime': 'stratified_opportunistic',
  'thriller': 'surveillance_controlled',
  'horror': 'breakdown_collective',
  'fantasy': 'feudal_magical',
  'sci_fi': 'corporate_stratified',
  'comedy': 'whimsical_inclusive',
  'romance': 'sentimental_structured',
  'drama': 'realistic_complex',
  'action': 'heroic_individualistic',
  'historical': 'period_authentic_hierarchical',
  'animation': 'stylised_moralistic',
};

/** Resolve default social structure from genre. */
export function resolveSocialStructureFromGenre(genre: string): string | null {
  const normalized = genre.toLowerCase().trim();
  return GENRE_SOCIAL_STRUCTURE_MAP[normalized] ?? null;
}

// ---- Genre -> Production Language Default ----------------------------------

export const GENRE_PRODUCTION_LANGUAGE_MAP: Record<string, string> = {
  'noir': 'heightened_reality',
  'crime': 'gritty_realism',
  'thriller': 'heightened_reality',
  'horror': 'heightened_reality',
  'fantasy': 'magical_realism',
  'sci_fi': 'heightened_reality',
  'comedy': 'heightened_reality',
  'romance': 'gritty_realism',
  'drama': 'gritty_realism',
  'action': 'heightened_reality',
  'historical': 'gritty_realism',
  'animation': 'magical_realism',
};

/** Resolve production language default from genre. */
export function resolveProductionLanguageFromGenre(genre: string): string | null {
  const normalized = genre.toLowerCase().trim();
  return GENRE_PRODUCTION_LANGUAGE_MAP[normalized] ?? null;
}

// ---- Genre -> Energy Source Default ----------------------------------------

export const GENRE_ENERGY_MAP: Record<string, string> = {
  'fantasy': 'magic',
  'sci_fi': 'fusion',
  'noir': 'fossil_fuel',
  'crime': 'fossil_fuel',
  'historical': 'animal',
};

export const PERIOD_ENERGY_MAP: Record<string, string> = {
  'ancient': 'animal',
  'medieval': 'animal',
  'bronze_age': 'animal',
  'renaissance': 'animal',
  'colonial': 'animal',
  'victorian': 'fossil_fuel',
  'wwi': 'fossil_fuel',
  'interwar': 'fossil_fuel',
  'wwii_era': 'fossil_fuel',
  '1950s': 'fossil_fuel',
  '1960s': 'fossil_fuel',
  '1970s': 'fossil_fuel',
  '1980s': 'fossil_fuel',
  '1990s': 'fossil_fuel',
  '2000s': 'electric',
  '2010s': 'electric',
  '2020s': 'electric',
  'near_future': 'electric',
  'distant_future': 'fusion',
  'post_apocalyptic': 'ruined',
};

/** Resolve energy source from period + genre (period wins for conflict). */
export function resolveEnergySource(period: string, genre?: string): string {
  const periodLower = period.toLowerCase().replace(/[^a-z0-9_ ]/g, '').trim();
  for (const key of Object.keys(PERIOD_ENERGY_MAP)) {
    if (periodLower.includes(key)) return PERIOD_ENERGY_MAP[key];
  }
  // Handle numeric periods
  const yearMatch = periodLower.match(/(\d{4})s?/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 2050) return 'fusion';
    if (year >= 2000) return 'electric';
    if (year >= 1900) return 'fossil_fuel';
    return 'animal';
  }
  if (genre && GENRE_ENERGY_MAP[genre.toLowerCase().trim()]) {
    return GENRE_ENERGY_MAP[genre.toLowerCase().trim()];
  }
  return 'fossil_fuel';
}

// ---- Registry Version -----------------------------------------------------

/** Version of the registry — bump when mapping tables change */
export const PCP_REGISTRY_VERSION = '1.0.0';
