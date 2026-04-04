// generationModeResolver v2026-03-26T16 — hardened
/**
 * generationModeResolver.ts — Canonical generation mode resolver.
 *
 * ═══ INVARIANT ENFORCEMENT LAYER ═══
 * This module is the SINGLE SOURCE OF TRUTH for document generation routing.
 * All generation paths in generate-document MUST resolve mode through this module.
 *
 * MODES:
 *   - deterministic_assembly: No LLM. Content assembled from structured sources.
 *   - llm_single_pass: Standard single-call LLM generation.
 *   - llm_chunked: Multi-chunk LLM generation for large/episodic docs.
 *
 * RULES:
 *   - deterministic_assembly docs MUST NOT call any LLM function in any phase.
 *   - This includes: generation, repair, nuance, retry, placeholder, JSON fix.
 *   - Violations are fail-closed: throw, never silently degrade.
 */

// ── Generation Modes ────────────────────────────────────────────────────────

export type GenerationMode = "deterministic_assembly" | "llm_single_pass" | "llm_chunked";

// ── Deterministic Doc Types Registry ────────────────────────────────────────
// Add new deterministic doc types here. This is the ONLY place to register them.

const DETERMINISTIC_DOC_TYPES: ReadonlySet<string> = new Set([
  "visual_project_bible",
]);

// ── Mode Resolver ───────────────────────────────────────────────────────────

/**
 * Resolves the canonical generation mode for a document type.
 *
 * @param docType - The document type being generated.
 * @param isEpisodic - Whether the doc type is episodic (from EPISODE_DOC_TYPES).
 * @param isLargeRisk - Whether the doc type is a large-risk chunked type.
 * @returns The resolved GenerationMode.
 */
export function resolveDocumentGenerationMode(
  docType: string,
  isEpisodic: boolean,
  isLargeRisk: boolean,
): GenerationMode {
  if (DETERMINISTIC_DOC_TYPES.has(docType)) {
    return "deterministic_assembly";
  }
  if (isEpisodic || isLargeRisk) {
    return "llm_chunked";
  }
  return "llm_single_pass";
}

// ── LLM Eligibility Guard ───────────────────────────────────────────────────

export type GenerationPhase =
  | "primary_generation"
  | "chunked_generation"
  | "nuance_repair"
  | "json_extraction_retry"
  | "banned_language_retry"
  | "placeholder_retry"
  | "episode_count_repair"
  | "post_generation_validation";

/**
 * Returns true if LLM calls are allowed for this doc type in this phase.
 * For deterministic_assembly mode, returns false for ALL phases.
 */
export function isLLMAllowedForDocPhase(
  mode: GenerationMode,
  _phase: GenerationPhase,
): boolean {
  if (mode === "deterministic_assembly") {
    return false;
  }
  return true;
}

/**
 * Throws if LLM is not allowed for this doc type in this phase.
 * Use this as a fail-closed guard before any callLLM() invocation.
 */
export function assertLLMAllowed(
  mode: GenerationMode,
  phase: GenerationPhase,
  docType: string,
): void {
  if (!isLLMAllowedForDocPhase(mode, phase)) {
    throw new Error(
      `[IEL] LLM_FORBIDDEN: docType="${docType}" mode="${mode}" phase="${phase}". ` +
      `Deterministic assembly docs must not call LLM in any phase.`
    );
  }
}

// ── Diagnostic Helpers ──────────────────────────────────────────────────────

export interface GenerationModeDiagnostic {
  doc_type: string;
  resolved_mode: GenerationMode;
  llm_allowed: boolean;
  is_deterministic: boolean;
  resolved_at: string;
}

/**
 * Builds a structured diagnostic for logging/provenance.
 */
export function buildModeDiagnostic(docType: string, mode: GenerationMode): GenerationModeDiagnostic {
  return {
    doc_type: docType,
    resolved_mode: mode,
    llm_allowed: mode !== "deterministic_assembly",
    is_deterministic: mode === "deterministic_assembly",
    resolved_at: new Date().toISOString(),
  };
}

// ── Provenance Metadata ─────────────────────────────────────────────────────

export interface GenerationProvenance {
  generation_mode: GenerationMode;
  generated_via: string;
  llm_calls_used: number;
  deterministic_source: string | null;
}

/**
 * Builds provenance metadata for persisting with the document version.
 */
export function buildGenerationProvenance(
  mode: GenerationMode,
  docType: string,
  llmCallCount: number,
): GenerationProvenance {
  const DETERMINISTIC_SOURCES: Record<string, string> = {
    visual_project_bible: "assembleVisualProjectBibleFromDB",
  };

  return {
    generation_mode: mode,
    generated_via: mode === "deterministic_assembly"
      ? (DETERMINISTIC_SOURCES[docType] || "unknown_assembly")
      : (mode === "llm_chunked" ? "chunked_llm_pipeline" : "single_pass_llm"),
    llm_calls_used: mode === "deterministic_assembly" ? 0 : llmCallCount,
    deterministic_source: DETERMINISTIC_SOURCES[docType] || null,
  };
}

/**
 * Returns whether a doc type is deterministic.
 * Convenience for external consumers that don't need mode resolution.
 */
export function isDeterministicDocType(docType: string): boolean {
  return DETERMINISTIC_DOC_TYPES.has(docType);
}
