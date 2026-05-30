/**
 * Atomiser Types — Shared Type Definitions for All Atomisers
 *
 * These types replace @ts-nocheck by providing structured schemas
 * for atomiser inputs, outputs, and configuration.
 *
 * Migration: Once all atomisers import from this instead of relying on
 * implicit `any` types, @ts-nocheck can be safely removed.
 */

// ── Core Inferred Value ───────────────────────────────────────────────

export interface InferredValue {
  field: string;
  value: string | string[];
  source_type: 'extracted' | 'inferred' | 'user_supplied';
  confidence_score: number;
  reasoning: string[];
  pcp_dependencies: string[];
  registry_rule_hit?: string;
  llm_expanded?: boolean;
  generated_at: string;         // ISO 8601
  generated_by: string;          // 'cpie_registry' | 'cpie_llm' | 'cpie_both'
}

// ── Domain-Specific Inference Results ─────────────────────────────────

export interface CPIEInferenceResult {
  domain: string;               // 'wardrobe' | 'prop' | 'vehicle' | 'creature'
  entity_key: string;
  inferences: InferredValue[];
  provenance_summary: {
    extracted: number;
    inferred: number;
    user_supplied: number;
  };
  inference_coverage_score: number;  // 0.0–1.0
  generated_at: string;
}

// ── LLM Generation Config ─────────────────────────────────────────────

export interface LLMGenerationConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
}

// ── Extract Result ────────────────────────────────────────────────────

export interface ExtractedEntity {
  name: string;
  occurrences: number;
  source: 'narrative_entity' | 'scene_content' | 'document';
  contexts?: string[];          // Snippets of text where entity appears
}

// ── Atomiser Handler Config ───────────────────────────────────────────

export interface AtomiserConfig {
  project_id: string;
  /** CPIE-provided inferences (may be null if CPIE not yet run) */
  cpie_results?: Record<string, CPIEInferenceResult>;
  /** Entities extracted from narrative or scene content */
  extracted_entities?: ExtractedEntity[];
  /** Scene text for additional extraction */
  scene_text?: string;
  /** User overrides keyed by entity_key */
  user_overrides?: Record<string, unknown>;
  /** LLM configuration override */
  llm_config?: Partial<LLMGenerationConfig>;
  /** If true, skip LLM generation (stubs only) */
  stubs_only?: boolean;
}

// ── Generation Result ─────────────────────────────────────────────────

export interface GeneratedAtom {
  entity_key: string;
  attributes: Record<string, unknown>;
  provenance: {
    source_type: string;
    confidence_score: number;
    reasoning: string[];
    pcp_dependencies: string[];
    merged: boolean;              // true if CPIE + extraction merged
    merge_strategy?: string;     // 'extraction_wins' | 'inference_fills'
  };
  status: 'pending' | 'complete' | 'failed' | 'needs_review';
}

// ── Atomiser Action ───────────────────────────────────────────────────

export type AtomiserAction = 'extract' | 'generate' | 'status' | 'reset_failed';

// ── Atomiser Response ─────────────────────────────────────────────────

export interface AtomiserResponse {
  action: AtomiserAction;
  project_id: string;
  status: 'ok' | 'error';
  message?: string;
  results?: {
    atoms_created: number;
    atoms_updated: number;
    atoms_failed: number;
    entities: Array<{
      id: string;
      canonical_name: string;
      status: string;
    }>;
    cpie_inferences_used: number;
    provenances_recorded: number;
  };
  errors?: string[];
}
