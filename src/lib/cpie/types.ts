/**
 * CPIE — Contextual Production Inference Engine
 * Types and interfaces for the inference pipeline.
 *
 * Architecture: PCP -> CPIE Registry -> Domain Processor -> Canon
 * Invariant: Every inference carries provenance. No opaque outputs.
 */
import type { PCPCategoryKey } from '../pcp/types';

// Domain identifiers
export type CPIEDomain = 'wardrobe' | 'prop' | 'vehicle' | 'creature' | 'location' | 'pd' | 'vl';

// PCP fields CPIE consumes (subset of PCP)
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
  // For ICS tracking
  pcp_resolution_timestamp: string;
  // Vehicle inference fields
  infrastructure?: string;       // e.g. "roads", "rail", "aerial", "none"
  geography?: string;            // e.g. "urban", "rural", "mountainous", "coastal", "arctic"
  economy?: string;              // e.g. "industrial", "agrarian", "post_scarcity", "feudal"
  class_structure?: string;      // e.g. "stratified", "egalitarian", "corporate", "feudal"
  // Creature inference fields
  biome?: string;                // e.g. "forest", "ocean", "desert", "urban", "tundra", "underground"
  mythology?: string;            // e.g. "norse", "greek", "none", "original"
  ecology?: string;              // e.g. "natural", "engineered", "alien", "supernatural"
  threat_role?: string;          // e.g. "predator", "guardian", "prey", "neutral", "bioweapon"
  intelligence?: string;         // e.g. "animal", "sapient", "instinctual", "swarm"
  symbolism?: string;            // e.g. "power", "wisdom", "fear", "freedom", "none"
  narrative_function?: string;   // e.g. "transport", "companion", "antagonist", "ambient"
}

// Registry rule types
export type RegistryOperator = 'eq' | 'in' | 'regex' | 'any' | 'not_eq';

export interface RegistryTrigger {
  pcp_field: string;       // PCP field path (e.g. "profession", "genre", "climate")
  operator: RegistryOperator;
  value: string | string[];
}

export interface RegistryAnchor {
  id: string;
  domain: CPIEDomain;
  triggers: RegistryTrigger[];
  output_field: string;
  output_value: string;
  confidence: number;       // 0.0–1.0 (confidence when ALL triggers match)
  priority: number;         // Higher = wins on conflict
  reasoning: string[];      // Human-readable chain
  requires_extraction?: boolean; // If true, only used as fallback (extraction wins)
}

// Inference result for a single value
export interface CPIEInference {
  field: string;
  value: string;
  source_type: 'inferred' | 'inferred_low_confidence';
  confidence_score: number;
  reasoning: string[];
  registry_anchor_id: string;
  pcp_dependencies: string[];
  generated_at: string;
  generated_by: 'cpie_registry';
}

// Inference result for a full domain/entity pass
export interface CPIEDomainResult {
  domain: CPIEDomain;
  entity_key: string;
  inferences: CPIEInference[];
  provenance_summary: {
    inferred_count: number;
    extraction_count: number;
    user_supplied_count: number;
  };
  inference_coverage_score: number; // 0.0–1.0
  generated_at: string;
}

// Entity with extracted identity (from narrative)
export interface CPIEIdentity {
  entity_key: string;
  canonical_name: string;
  profession?: string;
  role_archetype?: string;
  authority_level?: string;
  institutional_affiliation?: string | null;
  confidence: number;
  extracted_at: string;
}

// CDG registration output
export interface CPIRegistration {
  node_id: string;         // "D1" or "D2"
  entity_key: string;
  upstream_dependencies: string[];
  downstream_consumers: string[];
  staleness_owned_by: 'cpie';
  certification_owned_by: 'user';
  registered_at: string;
}

// Registry metadata
export interface CPIERegistryMetadata {
  version: string;
  description: string;
  domain: CPIEDomain;
  total_rules: number;
  created_at: string;
  // Distribution stats
  profession_coverage: string[];
  genre_coverage: string[];
  climate_coverage: string[];
  period_coverage: string[];
}
