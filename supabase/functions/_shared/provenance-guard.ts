/**
 * Provenance Write Guard — Runtime Validation for Canon Emissions
 *
 * Enforces SESS-ARCH-0028A CPIE Consumer Contract requirements:
 * - Every canon emission must carry provenance
 * - No orphan outputs (missing CDG registration)
 * - No missing confidence scores
 * - No empty reasoning chains
 *
 * No bypass paths. Every write through AtomiserRepository.upsertAtoms()
 * MUST pass provenance validation.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type ProvenanceSourceType = 'extracted' | 'inferred' | 'user_supplied';
export type CDGStaleness = 'FRESH' | 'STALE';

export interface ProvenanceRecord {
  source_type: ProvenanceSourceType;
  confidence_score: number;
  reasoning: string[];
  pcp_dependencies: string[];
  cpie_event_id?: string;
}

export interface CDGContextRecord {
  node_id: string;
  staleness: CDGStaleness;
  upstream_node: string;
  regeneration_count: number;
}

export interface CanonEmission {
  entity_key: string;
  canon_object: Record<string, unknown>;
  provenance: ProvenanceRecord;
  cdg_context: CDGContextRecord;
  generated_at: string;
  generated_by: string;
  /** Optional ICS metadata for tracking coverage */
  ics_metadata?: Array<{
    field_name: string;
    filled_by: 'extracted' | 'inferred' | 'user_supplied' | 'empty';
    confidence_at_creation: number;
    source_type: ProvenanceSourceType;
  }>;
}

export interface ValidationError {
  emissionIndex: number;
  entityKey: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  counts: {
    source_type_total: number;
    confidence_score_valid: number;
    reasoning_non_empty: number;
    cdg_node_id_present: number;
    cdg_upstream_present: number;
    generated_at_present: number;
    generated_by_present: number;
  };
}

// ── Valid Canon Nodes ─────────────────────────────────────────────────

const VALID_CANON_NODES = new Set(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
const VALID_SOURCE_TYPES = new Set(['extracted', 'inferred', 'user_supplied']);

// ── Core Validation Function ──────────────────────────────────────────

export function validateEmission(emission: CanonEmission, index: number): ValidationError[] {
  const entityKey = emission.entity_key || `emission[${index}]`;
  const errors: ValidationError[] = [];

  const addError = (field: string, message: string) => {
    errors.push({ emissionIndex: index, entityKey, field, message });
  };

  const p = emission.provenance;
  const c = emission.cdg_context;

  // Source type
  if (!p.source_type) {
    addError('provenance.source_type', 'Missing source_type');
  } else if (!VALID_SOURCE_TYPES.has(p.source_type)) {
    addError('provenance.source_type', `Must be extracted|inferred|user_supplied, got "${p.source_type}"`);
  }

  // Confidence score
  if (p.confidence_score === undefined || p.confidence_score === null) {
    addError('provenance.confidence_score', 'Missing confidence_score');
  } else if (typeof p.confidence_score !== 'number') {
    addError('provenance.confidence_score', `Must be a number, got ${typeof p.confidence_score}`);
  } else if (p.confidence_score < 0 || p.confidence_score > 1) {
    addError('provenance.confidence_score', `Must be 0.0–1.0, got ${p.confidence_score}`);
  }

  // Reasoning chain
  if (!p.reasoning || !Array.isArray(p.reasoning)) {
    addError('provenance.reasoning', 'Must be an array');
  } else if (p.reasoning.length === 0) {
    addError('provenance.reasoning', 'Must be a non-empty array');
  } else {
    for (let i = 0; i < p.reasoning.length; i++) {
      if (typeof p.reasoning[i] !== 'string' || p.reasoning[i].trim().length === 0) {
        addError(`provenance.reasoning[${i}]`, 'Each reasoning entry must be a non-empty string');
      }
    }
  }

  // PCP dependencies
  if (!p.pcp_dependencies || !Array.isArray(p.pcp_dependencies)) {
    addError('provenance.pcp_dependencies', 'Must be an array');
  }

  // CDG context
  if (!c.node_id) {
    addError('cdg_context.node_id', 'Missing node_id');
  } else if (!VALID_CANON_NODES.has(c.node_id)) {
    addError('cdg_context.node_id', `"${c.node_id}" is not a valid canon node. Must be D1-D7`);
  }

  if (!c.upstream_node) {
    addError('cdg_context.upstream_node', 'Missing upstream_node');
  }

  if (!c.staleness) {
    addError('cdg_context.staleness', 'Missing staleness');
  } else if (!['FRESH', 'STALE'].includes(c.staleness)) {
    addError('cdg_context.staleness', `Must be FRESH or STALE, got "${c.staleness}"`);
  }

  // Temporal fields
  if (!emission.generated_at) {
    addError('generated_at', 'Missing generated_at (ISO 8601)');
  }
  if (!emission.generated_by) {
    addError('generated_by', 'Missing generated_by');
  }

  // ICS metadata
  if (emission.ics_metadata && Array.isArray(emission.ics_metadata)) {
    for (let i = 0; i < emission.ics_metadata.length; i++) {
      const ics = emission.ics_metadata[i];
      if (!ics.field_name) addError(`ics_metadata[${i}].field_name`, 'Missing field_name');
      if (!ics.filled_by) addError(`ics_metadata[${i}].filled_by`, 'Missing filled_by');
    }
  }

  return errors;
}

// ── Batch Validation ─────────────────────────────────────────────────

export function validateBatch(emissions: CanonEmission[]): ValidationResult {
  let allErrors: ValidationError[] = [];
  const warnings: string[] = [];
  const counts = {
    source_type_total: 0,
    confidence_score_valid: 0,
    reasoning_non_empty: 0,
    cdg_node_id_present: 0,
    cdg_upstream_present: 0,
    generated_at_present: 0,
    generated_by_present: 0,
  };

  for (let i = 0; i < emissions.length; i++) {
    const emissionErrors = validateEmission(emissions[i], i);
    allErrors = allErrors.concat(emissionErrors);

    // Track counts for valid emissions
    const p = emissions[i].provenance;
    const c = emissions[i].cdg_context;

    if (p.source_type) counts.source_type_total++;
    if (typeof p.confidence_score === 'number' && p.confidence_score >= 0 && p.confidence_score <= 1) counts.confidence_score_valid++;
    if (p.reasoning && p.reasoning.length > 0) counts.reasoning_non_empty++;
    if (c.node_id) counts.cdg_node_id_present++;
    if (c.upstream_node) counts.cdg_upstream_present++;
    if (emissions[i].generated_at) counts.generated_at_present++;
    if (emissions[i].generated_by) counts.generated_by_present++;
  }

  // Quick warning if all emissions use the same source type
  if (emissions.length > 1 && allErrors.length === 0) {
    const types = new Set(emissions.map(e => e.provenance.source_type));
    if (types.size === 1) {
      warnings.push(`All ${emissions.length} emissions use the same source_type: ${[...types][0]}`);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings,
    counts,
  };
}

// ── Quick Assertion Helpers ─────────────────────────────────────────

export function assertValidEmission(emission: CanonEmission): void {
  const errors = validateEmission(emission, 0);
  if (errors.length > 0) {
    throw new Error(`Provenance guard rejected emission: ${errors.map(e => e.message).join('; ')}`);
  }
}

export function assertValidBatch(emissions: CanonEmission[]): void {
  const result = validateBatch(emissions);
  if (!result.valid) {
    throw new Error(`Provenance guard rejected batch: ${result.errors.map(e => `[${e.entityKey}] ${e.message}`).join('; ')}`);
  }
}

// ── ICS Calculation ──────────────────────────────────────────────────

export function calculateICS(emissions: CanonEmission[], totalPossibleFields: number): number {
  if (totalPossibleFields <= 0) return 0;
  let filled = 0;
  for (const emission of emissions) {
    if (emission.provenance.source_type === 'extracted' || emission.provenance.source_type === 'inferred') {
      filled++;
    }
  }
  return Math.min(filled / totalPossibleFields, 1.0);
}
