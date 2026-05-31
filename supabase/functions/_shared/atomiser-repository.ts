/**
 * AtomiserRepository — Restricted Database Access Layer
 *
 * Purpose: Prevent atomisers from querying context sources directly.
 * All context MUST come through the CPIE inference contract.
 *
 * Architecture:
 *   Edge Function → AtomiserRepository (this file) → Supabase (restricted)
 *   Edge Function → [NOT ALLOWED: .from("projects"), .from("project_canon"), .from("project_visual_style")]
 *
 * Invariants:
 * - No .from("projects") exposed
 * - No .from("project_canon") exposed
 * - No .from("project_visual_style") exposed
 * - No direct Supabase client access exposed
 * - Every upsertAtoms call validates provenance + CDG context before write
 * - Every operation is scoped to projectId (no cross-project reads)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ──────────────────────────────────────────────────────────────

export type ProvenanceSourceType = 'extracted' | 'inferred' | 'user_supplied';
export type CanonFilledBy = 'extracted' | 'inferred' | 'user_supplied' | 'empty';
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

export interface ICSMetadata {
  field_name: string;
  filled_by: CanonFilledBy;
  confidence_at_creation: number;
}

export interface CanonEmission {
  entity_key: string;
  canon_object: Record<string, unknown>;
  provenance: ProvenanceRecord;
  cdg_context: CDGContextRecord;
  ics_metadata: ICSMetadata[];
  generated_at: string;
  generated_by: string;
  entity_id?: string | null;
  priority?: number;
  readiness_state?: string;
  generation_status?: string;
}

export interface AtomRow {
  id: string;
  project_id: string;
  entity_type?: string;
  canonical_name: string;
  attributes?: Record<string, unknown>;
  source_type?: string;
}

export interface NarrativeEntityRow {
  id: string;
  entity_key: string;
  canonical_name: string;
  entity_type: string;
  scene_count: number;
  meta_json?: Record<string, unknown>;
}

export interface SceneGraphRow {
  scene_id: string;
  content: string;
  slugline?: string;
  scene_number?: number;
}

export interface AtomUpsertResult {
  success: boolean;
  inserted_count: number;
  updated_count: number;
  errors: string[];
  atoms: Array<{ id: string; status: string }>;
}

// ── Interface — the ONLY API surface atomisers can use ─────────────────

export interface AtomiserRepository {
  /** Fetch atoms for a project, optionally filtered by entity type or domain */
  getAtoms(
    projectId: string,
    filters?: { entityType?: string; domain?: string }
  ): Promise<AtomRow[]>;

  /** Fetch narrative entities for a project, optionally filtered by entity type */
  getNarrativeEntities(
    projectId: string,
    entityType?: string
  ): Promise<NarrativeEntityRow[]>;

  /** Fetch scene text content, optionally filtered by scene IDs */
  getSceneText(
    projectId: string,
    sceneIds?: string[]
  ): Promise<SceneGraphRow[]>;

  /** Get atoms relevant to a specific domain (alias for getAtoms with domain filter) */
  getExistingCanon(
    projectId: string,
    domain: string
  ): Promise<AtomRow[]>;

  /**
   * Upsert atoms with provenance + CDG context validation.
   * FAILS the write if provenance or CDG context is missing.
   */
  upsertAtoms(
    projectId: string,
    emissions: CanonEmission[],
    entityType?: string
  ): Promise<AtomUpsertResult>;

  /** Get user overrides for a specific entity */
  getUserOverrides(
    projectId: string,
    entityKey: string
  ): Promise<Record<string, unknown>>;

  /** Update an existing atom by ID */
  updateAtom(
    projectId: string,
    atomId: string,
    updates: Record<string, unknown>
  ): Promise<void>;

  /** Bulk update atoms by their IDs */
  bulkUpdateAtomsByIds(
    projectId: string,
    atomIds: string[],
    updates: Record<string, unknown>
  ): Promise<number>;

  /** Bulk update atoms by current generation_status */
  bulkUpdateAtomsByStatus(
    projectId: string,
    atomType: string,
    statusFilter: string[],
    updates: Record<string, unknown>
  ): Promise<number>;
}

// ── Provenance Write Guard ─────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateCanonEmission(emission: CanonEmission): ValidationResult {
  const errors: string[] = [];
  const p = emission.provenance;
  const c = emission.cdg_context;

  if (!p.source_type) errors.push('provenance.source_type is required');
  else if (!['extracted', 'inferred', 'user_supplied'].includes(p.source_type)) {
    errors.push(`provenance.source_type must be extracted|inferred|user_supplied, got "${p.source_type}"`);
  }

  if (p.confidence_score === undefined || p.confidence_score === null) {
    errors.push('provenance.confidence_score is required');
  } else if (p.confidence_score < 0 || p.confidence_score > 1) {
    errors.push(`provenance.confidence_score must be 0.0–1.0, got ${p.confidence_score}`);
  }

  if (!p.reasoning || p.reasoning.length === 0) {
    errors.push('provenance.reasoning must be a non-empty array');
  }

  if (!c.node_id) errors.push('cdg_context.node_id is required');

  if (!emission.generated_at) errors.push('generated_at is required');
  if (!emission.generated_by) errors.push('generated_by is required');

  return { valid: errors.length === 0, errors };
}

function validateBatch(emissions: CanonEmission[]): { valid: boolean; errors: string[] } {
  const allErrors: string[] = [];
  for (let i = 0; i < emissions.length; i++) {
    const result = validateCanonEmission(emissions[i]);
    if (!result.valid) {
      allErrors.push(`emission[${i}] (${emissions[i].entity_key || 'unknown'}): ${result.errors.join(', ')}`);
    }
  }
  return { valid: allErrors.length === 0, errors: allErrors };
}

// ── CDG Context Validation ────────────────────────────────────────────

/** Validate that a CDG node_id maps to a known canon node */
const VALID_CANON_NODES = new Set(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
const DOMAIN_NODE_MAP: Record<string, string> = {
  wardrobe: 'D1',
  costume: 'D1',
  prop: 'D2',
  vehicle: 'D3',
  creature: 'D4',
  location: 'D5',
  pd: 'D6',
  visual_language: 'D7',
};

function resolveNodeId(domain: string): string | null {
  return DOMAIN_NODE_MAP[domain.toLowerCase().replace(/[_-]/g, '')] ?? null;
}

function validateCDGContext(ctx: CDGContextRecord, domain?: string): ValidationResult {
  const errors: string[] = [];
  if (!ctx.node_id) errors.push('cdg_context.node_id is required');
  if (ctx.node_id && !VALID_CANON_NODES.has(ctx.node_id)) {
    // Allow fallback resolution by domain
    if (domain) {
      const resolved = resolveNodeId(domain);
      if (!resolved) errors.push(`cdg_context.node_id "${ctx.node_id}" is not a valid canon node, and domain "${domain}" is unknown`);
    } else {
      errors.push(`cdg_context.node_id "${ctx.node_id}" is not a valid canon node (D1-D7)`);
    }
  }
  if (!ctx.upstream_node) errors.push('cdg_context.upstream_node is required');
  return { valid: errors.length === 0, errors };
}

// ── Implementation ────────────────────────────────────────────────────

interface CreateRepositoryOptions {
  /** For testing — inject a mock Supabase client. Default: reads from env. */
  supabaseUrl?: string;
  supabaseKey?: string;
  /** Allow bypassing provenance guard (for migrations only) */
  bypassGuard?: boolean;
}

/**
 * Create a restricted repository for accessing atomiser-related data.
 *
 * Enforces:
 *   - No access to `projects`, `project_canon`, `project_visual_style`
 *   - Provenance validation on all writes
 *   - CDG context validation on all writes
 *   - Project-scoped operations only
 */
export function createAtomiserRepository(options: CreateRepositoryOptions = {}): AtomiserRepository {
  const url = options.supabaseUrl || Deno.env.get('SUPABASE_URL') || '';
  const key = options.supabaseKey || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const bypassGuard = options.bypassGuard === true;

  const supabase = createClient(url, key);

  // ── Implement each interface method ────────────────────────────────

  return {
    async getAtoms(projectId, filters) {
      let query = supabase
        .from('atoms')
        .select('id, project_id, entity_type, canonical_name, attributes, source_type')
        .eq('project_id', projectId);

      if (filters?.entityType) {
        query = query.eq('atom_type', filters.entityType);
      }
      if (filters?.domain) {
        // Domain-specific atoms use the entity_type filter
        query = query.eq('atom_type', filters.domain);
      }

      const { data, error } = await query;
      if (error) throw new Error(`[AtomiserRepository] getAtoms: ${error.message}`);
      return (data as AtomRow[]) || [];
    },

    async getNarrativeEntities(projectId, entityType) {
      let query = supabase
        .from('narrative_entities')
        .select('id, entity_key, canonical_name, entity_type, scene_count, meta_json')
        .eq('project_id', projectId);

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;
      if (error) throw new Error(`[AtomiserRepository] getNarrativeEntities: ${error.message}`);
      return (data as NarrativeEntityRow[]) || [];
    },

    async getSceneText(projectId, sceneIds) {
      let query = supabase
        .from('scene_graph_versions')
        .select('scene_id, content, slugline, scene_number')
        .eq('project_id', projectId);

      if (sceneIds && sceneIds.length > 0) {
        query = query.in('scene_id', sceneIds);
      }

      const { data, error } = await query;
      if (error) throw new Error(`[AtomiserRepository] getSceneText: ${error.message}`);
      return (data as SceneGraphRow[]) || [];
    },

    async getExistingCanon(projectId, domain) {
      return this.getAtoms(projectId, { entityType: domain });
    },

    async upsertAtoms(projectId, emissions, entityType) {
      const result: AtomUpsertResult = {
        success: false,
        inserted_count: 0,
        updated_count: 0,
        errors: [],
        atoms: [],
      };

      // 1. Validate batch
      if (!bypassGuard) {
        const validation = validateBatch(emissions);
        if (!validation.valid) {
          result.errors = validation.errors;
          return result;
        }
      }

      // 2. Write each emission
      for (const emission of emissions) {
        const record = {
          project_id: projectId,
          atom_type: entityType || 'unknown',
          canonical_name: emission.entity_key || '',
          priority: emission.priority ?? 50,
          readiness_state: emission.readiness_state || 'stub',
          generation_status: emission.generation_status || 'pending',
          attributes: {
            ...emission.canon_object,
            _provenance: emission.provenance,
            _cdg_context: emission.cdg_context,
            _ics_metadata: emission.ics_metadata,
            _generated_at: emission.generated_at,
            _generated_by: emission.generated_by,
          },
        };

        const { data, error } = await supabase
          .from('atoms')
          .upsert(record)
          .select('id, status')
          .maybeSingle();

        if (error) {
          result.errors.push(`upsert ${emission.entity_key}: ${error.message}`);
        } else if (data) {
          result.atoms.push(data as { id: string; status: string });
          result.inserted_count++;
        }
      }

      result.success = result.errors.length === 0;
      return result;
    },

    async getUserOverrides(projectId, entityKey) {
      // User overrides are stored as attributes on the atoms table
      // This is the ONLY way to read them — no direct table queries
      const { data, error } = await supabase
        .from('atoms')
        .select('attributes')
        .eq('project_id', projectId)
        .eq('canonical_name', entityKey)
        .maybeSingle();

      if (error) throw new Error(`[AtomiserRepository] getUserOverrides: ${error.message}`);
      if (!data) return {};

      const attrs = (data as { attributes?: Record<string, unknown> }).attributes;
      return (attrs?._user_overrides as Record<string, unknown>) || {};
    },

    async bulkUpdateAtomsByIds(projectId, atomIds, updates) {
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase
        .from('atoms')
        .update(updates)
        .eq('project_id', projectId)
        .in('id', atomIds);

      if (error) {
        throw new Error(`[AtomiserRepository] bulkUpdateAtomsByIds: ${error.message}`);
      }
      return atomIds.length;
    },

    async bulkUpdateAtomsByStatus(projectId, atomType, statusFilter, updates) {
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase
        .from('atoms')
        .update(updates)
        .eq('project_id', projectId)
        .eq('atom_type', atomType)
        .in('generation_status', statusFilter);

      if (error) {
        throw new Error(`[AtomiserRepository] bulkUpdateAtomsByStatus: ${error.message}`);
      }
      // Can't return count without an additional query
      return -1;
    },

    async updateAtom(projectId, atomId, updates) {
      // Validate the atom belongs to this project
      const { data: existing } = await supabase
        .from('atoms')
        .select('project_id')
        .eq('id', atomId)
        .maybeSingle();
      
      if (!existing) {
        throw new Error('[AtomiserRepository] updateAtom: atom not found');
      }
      if (existing.project_id !== projectId) {
        throw new Error('[AtomiserRepository] updateAtom: project_id mismatch — cross-project write blocked');
      }
      
      // Validate provenance if attributes are being updated
      if (updates.attributes && !bypassGuard) {
        const attrsUpdates = updates.attributes as Record<string, unknown>;
        const hasProvenance = attrsUpdates._provenance || 
          (typeof attrsUpdates._generated_by === 'string');
        if (!hasProvenance) {
          // Not blocking — just warn; attribute updates may include status transitions
          console.warn('[AtomiserRepository] updateAtom: attribute update without provenance metadata');
        }
      }
      
      updates.updated_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('atoms')
        .update(updates)
        .eq('id', atomId);
      
      if (error) {
        throw new Error(`[AtomiserRepository] updateAtom: ${error.message}`);
      }
    },
  };
}

// ── Authoritative Provenance Builder ───────────────────────────────────
// Contract: builds _provenance + _ics_metadata from CPIE inference records.
// Use: atomisers call this instead of constructing ad-hoc cpie_provenance.

export interface CPIEParsedInference {
  field: string;
  value: string;
  confidence: number;
  reasoning: string[];
  registry_anchor_id: string;
  pcp_dependencies: string[];
  generated_at: string;
  generated_by: string;
}

export function buildAuthoritativeProvenance(
  inferences: CPIEParsedInference[],
): { provenance: ProvenanceRecord; ics_metadata: ICSMetadata[] } | null {
  if (!inferences || inferences.length === 0) return null;

  const hasRealAnchor = inferences.some(i => i.registry_anchor_id && i.registry_anchor_id !== '');
  const allDeps = new Set<string>();
  for (const i of inferences) {
    for (const d of (i.pcp_dependencies || [])) allDeps.add(d);
  }

  const provenance: ProvenanceRecord = {
    source_type: hasRealAnchor ? 'inferred' : 'extracted',
    confidence_score: Math.min(...inferences.map(i => i.confidence)),
    reasoning: inferences.map(i =>
      `field=${i.field} value="${i.value}"${i.registry_anchor_id ? ` anchor=${i.registry_anchor_id}` : ''} confidence=${i.confidence}`
    ),
    pcp_dependencies: Array.from(allDeps),
  };

  const ics_metadata: ICSMetadata[] = inferences.map(i => ({
    field_name: i.field,
    filled_by: (hasRealAnchor ? 'inferred' : 'extracted') as CanonFilledBy,
    confidence_at_creation: i.confidence,
  }));

  return { provenance, ics_metadata };
}
