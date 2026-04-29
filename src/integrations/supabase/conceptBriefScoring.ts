/**
 * conceptBriefScoring.ts
 *
 * Extended meta_json structure for concept_brief project_document_versions.
 *
 * When a concept_brief version's meta_json contains per-section scoring,
 * it uses this shape. The top-level ci/gp/canon_drift remain intact;
 * the `sections` sub-object is where per-section data lives.
 *
 * Usage:
 *   import type { ConceptBriefMetaJson } from '@/integrations/supabase/conceptBriefScoring';
 *   const meta = row.meta_json as ConceptBriefMetaJson;
 *   if (meta?.sections?.logline?.status === 'complete') { ... }
 */

export type SectionStatus = "pending" | "generating" | "complete" | "failed";

export interface SectionScoring {
  status: SectionStatus;
  ci?: number;
  gp?: number;
  blockers?: number;
  canon_drift_passed?: boolean;
  last_rewrite_at?: string;   // ISO timestamp
  rewrite_attempts?: number;
}

export interface ConceptBriefSectionScorings {
  logline?: SectionScoring;
  premise?: SectionScoring;
  protagonist?: SectionScoring;
  central_conflict?: SectionScoring;
  tone_and_style?: SectionScoring;
  audience?: SectionScoring;
  unique_hook?: SectionScoring;
  world_building_notes?: SectionScoring;
}

/**
 * Extended meta_json shape for concept_brief project_document_versions.
 * Standard top-level fields coexist with the optional `sections` sub-object.
 */
export interface ConceptBriefMetaJson {
  // Top-level convergence (document-level) — always present after analyze
  ci?: number;
  gp?: number;
  canon_drift?: {
    passed: boolean;
    violations?: string[];
    warnings?: string[];
  };

  // Top-level generator metadata
  generator_id?: string;
  generator_run_id?: string;
  resolver_hash?: string;

  // Per-section scoring (concept_brief_sections table mirrors this data)
  sections?: ConceptBriefSectionScorings;
}
