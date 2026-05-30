/**
 * PCP — Project Context Profile
 *
 * Canonical source: SESS-ARCH-0024 (PCP Schema Design)
 * Ownership: Context only. No PCP field directly creates a production asset.
 *
 * Architecture: PCP is the resolved context layer between Narrative Truth
 * (extraction) and Production Canon (CPIE outputs). Every inference engine
 * reads from the same profile.
 *
 * Invariants:
 * - Every field carries provenance (source_type, confidence, reasoning)
 * - No PCP field duplicates narrative truth or canon
 * - PCP is context, NOT production reality
 * - Deterministic resolution preferred over LLM expansion
 */

// ── Provenance Types ──────────────────────────────────────────────────────

export type ProvenanceSourceType =
  | 'extracted'      // from explicit narrative truth
  | 'inferred'       // from deterministic inference rules
  | 'user_supplied' // manually overridden by user
  | 'imported';     // from external metadata

export interface PCPFieldProvenance {
  source_type: ProvenanceSourceType;
  confidence: number;       // 0.0–1.0
  original_source: string;  // e.g. "canon_json.world_rules.genre"
  resolution_rule?: string; // e.g. "genre_from_world_rules_regex"
  override_history: Array<{
    previous_value: unknown;
    new_value: unknown;
    changed_by: string;
    changed_at: string;     // ISO 8601
  }>;
}

export interface PCPField<T> {
  value: T;
  provenance: {
    source_type: ProvenanceSourceType;
    confidence_score: number;   // 0.0–1.0
    reasoning: string[];        // human-readable chain
    resolved_at: string;        // ISO 8601
    resolver_version: string;   // semver of PCP resolver that set this
  };
}

// ── Category Types ────────────────────────────────────────────────────────

export interface ProjectIdentity {
  genre: PCPField<string[]>;
  subgenre: PCPField<string[]>;
  format: PCPField<string>;          // "feature_film" | "vertical_drama" | "series" | "episodic"
  target_audience: PCPField<string>; // "adults_25-55" | "family" | etc.
  format_subtype: PCPField<string>;  // "pilot" | "miniseries" | "seasoned_series"
}

export interface TemporalContext {
  era: PCPField<string>;              // "historical" | "contemporary" | "future" | "fantasy_era" | "alternate_history"
  period: PCPField<string>;           // "1940s" | "2024" | "2087" | "medieval" | "bronze_age"
  historical_accuracy: PCPField<string>; // "accurate" | "stylised" | "anachronistic"
  year_range: PCPField<{ from?: number; to?: number }>;
  time_markers: PCPField<string[]>;   // ["WWII", "cold_war", "interwar", "post_apocalyptic"]
}

export interface GeographicContext {
  primary_region: PCPField<string>;     // "Western_Europe" | "North_Africa" | "North_America"
  primary_country: PCPField<string>;    // "UK" | "Morocco" | "USA"
  primary_biome: PCPField<string>;      // "temperate_forest" | "arid_desert" | "arctic_tundra" | "urban"
  climate: PCPField<string>;            // "temperate_rainy" | "hot_arid" | "cold_snowy" | "tropical_humid"
  season: PCPField<string>;             // "spring" | "summer" | "autumn" | "winter" | "year_round"
  urban_density: PCPField<string>;      // "urban" | "suburban" | "rural" | "wilderness" | "mixed"
  setting_scope: PCPField<string>;      // "single_location" | "city_wide" | "cross_country" | "global"
}

export interface CulturalContext {
  dominant_cultures: PCPField<string[]>;  // ["British", "Moroccan_Amazigh", "Japanese"]
  cultural_mix: PCPField<string>;        // "homogeneous" | "multicultural" | "colonial" | "diaspora"
  social_norms: PCPField<string[]>;       // ["formal", "hierarchical", "individualistic", "collectivist"]
  belief_systems: PCPField<string[]>;     // implied religious/philosophical context
  language_context: PCPField<string[]>;   // ["English", "Arabic", "bilingual"]
}

export interface TechnologyContext {
  level: PCPField<string>;               // "pre_industrial" | "industrial_revolution" | "WWII_era" | "contemporary" | "near_future" | "sci_fi_advanced" | "fantasy_magic"
  infrastructure: PCPField<string>;      // "primitive" | "developing" | "modern" | "advanced" | "ruined"
  transportation_assumptions: PCPField<string[]>; // ["horse_drawn", "automotive", "rail", "aviation", "hover", "teleportation"]
  communication_level: PCPField<string>; // "none" | "analog" | "digital" | "networked" | "quantum"
  energy_source: PCPField<string>;       // "animal" | "fossil_fuel" | "electric" | "fusion" | "magic"
}

export interface EconomicContext {
  wealth_distribution: PCPField<string>; // "extreme_inequality" | "broad_middle_class" | "subsistence" | "post_scarcity"
  class_structure: PCPField<string>;     // "feudal" | "industrial" | "corporate" | "meritocratic" | "caste"
  industrialization_level: PCPField<string>; // "pre_industrial" | "industrializing" | "industrialized" | "post_industrial"
  economic_baseline: PCPField<string>;   // "wartime_economy" | "peace_time" | "depression" | "boom"
}

export interface ProfessionEntry {
  character_name: string;
  profession: string;         // "detective", "knight", "courier"
  role_archetype: string;     // "investigator", "warrior", "messenger"
  authority_level: string;    // "law_enforcement" | "military" | "civilian" | "criminal"
  institutional_affiliation: string | null; // "NYPD" | "Knights_Of_The_Realm" | null
  confidence: number;         // 0.0–1.0
  source: string;             // "canon_extracted" | "inferred_from_role"
}

export interface ProfessionalContext {
  profession_map: PCPField<Record<string, ProfessionEntry>>; // character_name → structured role
  institutional_systems: PCPField<string[]>;   // ["police", "military", "legal", "medical", "corporate"]
  authority_structures: PCPField<string>;      // "corrupt" | "legitimate" | "fragmented" | "absent"
}

export interface VisualContext {
  visual_tone: PCPField<string>;            // "dark" | "bright" | "moody" | "vibrant" | "monochromatic"
  style_influences: PCPField<string[]>;     // ["film_noir", "german_expressionism", "neon_noir"]
  production_language: PCPField<string>;    // "gritty_realism" | "heightened_reality" | "magical_realism" | "minimalist"
}

// ── Categories Keys ──────────────────────────────────────────────────────

export type PCPCategoryKey =
  | 'project_identity'
  | 'temporal_context'
  | 'geographic_context'
  | 'cultural_context'
  | 'technology_context'
  | 'economic_context'
  | 'professional_context'
  | 'visual_context';

// ── Top-Level Profile ─────────────────────────────────────────────────────

export type PCPProfileStatus = 'resolving' | 'complete' | 'stale' | 'overridden';

export interface PCPProvenance {
  profile_version: string;
  resolver_version: string;
  source_hash: string;          // hash of all inputs at resolution time
  resolution_count: number;     // how many times this profile has been resolved
  last_resolved_at: string;     // ISO 8601
  stale_fields: string[];       // fields flagged for re-resolution
  field_provenance: Record<string, PCPFieldProvenance>;
}

export interface ProjectContextProfile {
  // ── Identity ──
  profile_id: string;
  project_id: string;
  version_number: number;
  status: PCPProfileStatus;
  resolved_at: string;

  // ── Category Blocks ──
  project_identity: ProjectIdentity;
  temporal_context: TemporalContext;
  geographic_context: GeographicContext;
  cultural_context: CulturalContext;
  technology_context: TechnologyContext;
  economic_context: EconomicContext;
  professional_context: ProfessionalContext;
  visual_context: VisualContext;

  // ── Metadata ──
  provenance: PCPProvenance;
  source_hash: string;
  stale_fields: string[];
}

// ── Helper Types ──────────────────────────────────────────────────────────

export type PCPCategory =
  | ProjectIdentity
  | TemporalContext
  | GeographicContext
  | CulturalContext
  | TechnologyContext
  | EconomicContext
  | ProfessionalContext
  | VisualContext;

/** Union type for any PCP field value — useful for generic traversal */
export type PCPFieldValue =
  | string
  | string[]
  | number
  | number[]
  | boolean
  | { from?: number; to?: number }
  | Record<string, ProfessionEntry>;

/** Field-level change represented for CDG consumption */
export interface PCPFieldChange {
  category: PCPCategoryKey;
  field: string;        // e.g. "period" inside temporal_context
  previous_value: unknown;
  new_value: unknown;
  changed_at: string;   // ISO 8601
}
