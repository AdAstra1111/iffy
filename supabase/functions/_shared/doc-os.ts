/**
 * doc-os.ts — Canonical Document Operating System helpers.
 * Single source of truth for creating/versioning project documents.
 * ALL edge functions MUST use these helpers for project_documents + project_document_versions writes.
 */ import { buildCanonEntitiesFromDB, validateCanonAlignment } from "./docPolicyRegistry.ts";
import { emitTransition, TRANSITION_EVENTS } from "./transitionLedger.ts";
// ── Identity Stack P0 shadow telemetry (Phase 7.4A) ──
import { IDENTITY_STACK_SHADOW_ENABLED } from "./identityStackP0/identityStackFlags.ts";
import { computeIdentityStackShadow } from "./identityStackP0/index.ts";

// ── Phase 7.5C: PersistVersion — canonical persistence boundary ──
// All version writes to project_document_versions MUST route through this.
// Handles INSERT, UPDATE, and UPSERT patterns.

/**
 * Operation types for persistVersion().
 * Content writes trigger Identity Stack. Placeholder and metadata-only writes skip it.
 */
export type PersistVersionOperationType =
  // ── Content Writes (Identity Stack fires) ──
  | "CREATE_FINAL"         // INSERT with full content — new version with analyzable text
  | "UPDATE_CONTENT"       // UPDATE — fill placeholder with assembled content (chunk assembly complete)
  | "UPSERT_CONTENT"       // UPSERT — create-or-replace with full content (single-beat rewrite)
  | "CONVERT_FORMAT"       // INSERT — format conversion (convert-to-plaintext)
  | "REWRITE_FINAL"        // INSERT — surgical/beat rewrite producing new version
  | "PROMOTE_DERIVATIVE"   // INSERT — derived document from existing content
  // ── Placeholder (Identity Stack skips — no content to analyze) ──
  | "CREATE_PLACEHOLDER"   // INSERT with empty/placeholder text (bg_generating)
  // ── Metadata-Only (Identity Stack skips — no content change) ──
  | "UPDATE_METADATA_ONLY" // Update meta_json without content changes
  | "UPDATE_STATUS_ONLY"   // Update approval_status, is_current without content changes
  | "SUPERSEDE";           // Mark parent version as non-current

/** Operations that trigger Identity Stack shadow computation. */
export const CONTENT_WRITE_OPERATIONS = new Set<PersistVersionOperationType>([
  "CREATE_FINAL",
  "UPDATE_CONTENT",
  "UPSERT_CONTENT",
  "CONVERT_FORMAT",
  "REWRITE_FINAL",
  "PROMOTE_DERIVATIVE",
]);

/** Options for persistVersion(). */
export interface PersistVersionArgs {
  supabase: any;
  projectId: string;
  documentId: string;
  docType: string;
  operation: PersistVersionOperationType;
  // ── Target version (required for UPDATE/UPSERT) ──
  versionId?: string;
  // ── Content ──
  plaintext?: string;
  // ── Version Identity ──
  label?: string;
  createdBy?: string;
  generatorId?: string;
  inputsUsed?: Record<string, any>;
  parentVersionId?: string;
  sourceDocumentIds?: string[];
  dependsOn?: Record<string, any>;
  dependsOnResolverHash?: string;
  deliverableType?: string;
  // ── Meta JSON (merged into existing, never overwrites) ──
  metaJson?: Record<string, any>;
  // ── Version State ──
  approvalStatus?: string;
  isCurrent?: boolean;
  status?: string;
  // ── Chunk Assembly ──
  assembledFromChunks?: boolean;
  assembledChunkCount?: number;
  // ── Format ──
  format?: string;
  // ── Inheritance ──
  inheritedCore?: any;
  // ── Convergence ──
  isStale?: boolean;
  staleReason?: string;
  generatorRunId?: string;
  styleTemplateVersionId?: string;
  // ── Version Number Override (bypasses next-sequential) ──
  versionNumberOverride?: number;
  // ── Branch ──
  branchId?: string;
}
// ── Deterministic resolver hash (no crypto dependency) ──
function simpleHash(str) {
  let hash = 0;
  for(let i = 0; i < str.length; i++){
    const ch = str.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
export function computeDefaultResolverHash(docType, generatorId, label) {
  return `auto_${simpleHash(`${docType}:${generatorId}:${label}`)}`;
}
export const DOC_TYPE_REGISTRY = {
  // Seed core (5) — support category
  project_overview: {
    title: "Project Overview",
    file_name: "project_overview.md",
    is_seed_core: true,
    is_ladder: false,
    doc_category: "support"
  },
  creative_brief: {
    title: "Creative Brief",
    file_name: "creative_brief.md",
    is_seed_core: true,
    is_ladder: false,
    doc_category: "support"
  },
  market_positioning: {
    title: "Market Positioning",
    file_name: "market_positioning.md",
    is_seed_core: true,
    is_ladder: false,
    doc_category: "support"
  },
  canon: {
    title: "Canon & Constraints",
    file_name: "canon.md",
    is_seed_core: true,
    is_ladder: false,
    doc_category: "support"
  },
  nec: {
    title: "Narrative Energy Contract",
    file_name: "nec.md",
    is_seed_core: true,
    is_ladder: false,
    doc_category: "support"
  },
  // Input docs — canon category (ladder stages)
  idea: {
    title: "Idea",
    file_name: "idea.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  concept_brief: {
    title: "Concept Brief",
    file_name: "concept_brief.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  // Output documents — NOT ladder stages (parallel outputs)
  market_sheet: {
    title: "Market Sheet",
    file_name: "market_sheet.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "output"
  },
  vertical_market_sheet: {
    title: "Market Sheet (VD)",
    file_name: "vertical_market_sheet.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "output"
  },
  deck: {
    title: "Deck",
    file_name: "deck.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "output"
  },
  // Ladder deliverables — canon category
  treatment: {
    title: "Treatment",
    file_name: "treatment.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  story_outline: {
    title: "Story Outline",
    file_name: "story_outline.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  character_bible: {
    title: "Character Bible",
    file_name: "character_bible.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  beat_sheet: {
    title: "Beat Sheet",
    file_name: "beat_sheet.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  episode_beats: {
    title: "Episode Beats",
    file_name: "episode_beats.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  feature_script: {
    title: "Feature Script",
    file_name: "feature_script.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  episode_script: {
    title: "Episode Script",
    file_name: "episode_script.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  season_script: {
    title: "Season Script",
    file_name: "season_script.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  season_master_script: {
    title: "Master Season Script",
    file_name: "season_master_script.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  complete_season_script: {
    title: "Complete Season Script",
    file_name: "complete_season_script.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "canon"
  },
  production_draft: {
    title: "Production Draft",
    file_name: "production_draft.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  documentary_outline: {
    title: "Documentary Outline",
    file_name: "documentary_outline.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  format_rules: {
    title: "Format Rules",
    file_name: "format_rules.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  season_arc: {
    title: "Season Arc",
    file_name: "season_arc.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  episode_grid: {
    title: "Episode Grid",
    file_name: "episode_grid.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  vertical_episode_beats: {
    title: "Episode Beats (VD)",
    file_name: "vertical_episode_beats.md",
    is_seed_core: false,
    is_ladder: true,
    doc_category: "canon"
  },
  topline_narrative: {
    title: "Topline Narrative",
    file_name: "topline_narrative.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "support"
  },
  trailer_script: {
    title: "Trailer Script",
    file_name: "trailer_script.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "output"
  },
  // Development documents — non-ladder canonical
  visual_canon_brief: {
    title: "Visual Canon Brief",
    file_name: "visual_canon_brief.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "canon"
  },
  // Assembled visual output — downstream read-only assembly of canonical visual truth
  visual_project_bible: {
    title: "Visual Project Bible",
    file_name: "visual_project_bible.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "output"
  },
  // Derived (non-ladder) doc types
  scene_graph: {
    title: "Scene Index",
    file_name: "scene_graph.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "derived"
  },
  change_report: {
    title: "Change Report",
    file_name: "change_report.md",
    is_seed_core: false,
    is_ladder: false,
    doc_category: "derived"
  },
  // Non-deliverable
  other: {
    title: "Document",
    file_name: "document.md",
    is_seed_core: false,
    is_ladder: false
  }
};
export const SEED_CORE_TYPES = Object.entries(DOC_TYPE_REGISTRY).filter(([_, c])=>c.is_seed_core).map(([k])=>k);
/** Legacy alias map — mirrors DOC_TYPE_ALIASES from stage-ladders.json.
 *  IMPORTANT: "script" is format-ambiguous and MUST be resolved via format-aware path.
 *  The alias here is kept ONLY for non-format-aware callers; format-aware callers
 *  MUST pass `format` to resolveDocType() which will reject "script" and require
 *  explicit resolution. */ const DOC_TYPE_ALIASES = {
  // "script" deliberately REMOVED — must use format-aware resolution
  draft: "feature_script",
  blueprint: "treatment",
  architecture: "story_outline",
  plot_architecture: "story_outline",
  outline: "treatment",
  series_bible: "treatment",
  season_outline: "treatment",
  logline: "idea",
  one_pager: "concept_brief",
  notes: "concept_brief",
  pilot_script: "episode_script",
  episode_beat_sheet: "beat_sheet",
  coverage: "production_draft",
  episode_1_script: "episode_script",
  writers_room: "other"
};
/** Format-aware script type resolution from stage-ladders */ import { STAGE_LADDERS } from "./stage-ladders.ts";
const FORMAT_SCRIPT_TYPES_PAL = STAGE_LADDERS.FORMAT_SCRIPT_TYPES;
/**
 * Resolve a doc_type to its canonical config.
 * 
 * PIPELINE AUTHORITY LAYER (PAL):
 * - If `format` is provided and docType is "script", resolves to the correct
 *   script type for that format (e.g. season_script for vertical-drama).
 * - If `format` is NOT provided and docType is "script", REJECTS with error
 *   (fail-closed: no silent fallback to feature_script).
 * - All other aliases are applied as before.
 */ export function resolveDocType(docType, format) {
  let canonical;
  // PAL: Handle "script" with format-awareness
  if (docType === "script") {
    const fmtKey = (format ?? '').trim().toLowerCase().replace(/[_ ]+/g, '-');
    if (fmtKey && FORMAT_SCRIPT_TYPES_PAL[fmtKey]) {
      canonical = FORMAT_SCRIPT_TYPES_PAL[fmtKey];
      console.log(`[doc-os][IEL] script_resolved_by_format { format: "${fmtKey}", resolved: "${canonical}" }`);
    } else if (fmtKey) {
      // Format provided but not in FORMAT_SCRIPT_TYPES — fail closed
      throw new Error(`resolveDocType: "script" cannot be resolved for unknown format "${fmtKey}". Provide explicit doc_type.`);
    } else {
      // No format provided — fail closed (no silent fallback to feature_script)
      throw new Error(`resolveDocType: "script" is format-ambiguous. Provide format parameter or use explicit doc_type (feature_script, episode_script, season_script).`);
    }
  } else {
    canonical = DOC_TYPE_ALIASES[docType] ?? docType;
    if (canonical !== docType) {
      console.log(`[doc-os][IEL] alias_resolved { from: "${docType}", to: "${canonical}" }`);
    }
  }
  if (DOC_TYPE_REGISTRY[canonical]) {
    console.log(`[doc-os][IEL] doc_type_resolved { input: "${docType}", canonical: "${canonical}", format: "${format || 'none'}" }`);
    return {
      key: canonical,
      config: DOC_TYPE_REGISTRY[canonical]
    };
  }
  throw new Error(`resolveDocType: unknown doc_type "${docType}" (resolved to "${canonical}"). Must be one of: ${Object.keys(DOC_TYPE_REGISTRY).join(", ")}`);
}
/**
 * Ensure exactly one project_documents row exists for (projectId, docType).
 * Returns the existing or newly created document ID.
 */ export async function ensureDocSlot(supabase, projectId, userId, docType, opts) {
  const { key, config } = resolveDocType(docType);
  // Build query for existing slot
  let query = supabase.from("project_documents").select("id").eq("project_id", projectId).eq("doc_type", key);
  // Per-episode matching: if episodeIndex provided, match on meta_json->episode_index
  if (opts?.episodeIndex != null) {
    query = query.eq("meta_json->>episode_index", String(opts.episodeIndex));
  }
  const { data: existing } = await query.limit(1);
  if (existing && existing.length > 0) {
    return {
      documentId: existing[0].id,
      isNew: false
    };
  }
  // Build title and file_name for per-episode docs
  const epIdx = opts?.episodeIndex;
  const epSuffix = epIdx != null ? `_e${String(epIdx).padStart(2, "0")}` : "";
  const title = opts?.title || (epIdx != null ? `${config.title} — Episode ${epIdx}` : config.title);
  const fileName = epIdx != null ? config.file_name.replace(".md", `${epSuffix}.md`) : config.file_name;
  // Create new
  const insertPayload = {
    project_id: projectId,
    user_id: userId,
    doc_type: key,
    title,
    file_name: fileName,
    // Scripts bucket path: scripts/<user_id>/<project_id>/<filename>
    // (user_id prefix ensures user's storage namespace, not a shared UUID bucket)
    file_path: `${userId}/${projectId}/${fileName}`,
    char_count: 0,
    extraction_status: "complete",
    source: opts?.source || "generated",
    is_primary: false,
    doc_role: opts?.docRole || "creative_primary"
  };
  // Merge meta_json with episode_index
  const meta = {
    ...opts?.metaJson || {}
  };
  if (epIdx != null) meta.episode_index = epIdx;
  if (Object.keys(meta).length > 0) insertPayload.meta_json = meta;
  const { data: newDoc, error } = await supabase.from("project_documents").insert(insertPayload).select("id").single();
  if (error) {
    const isDuplicateSlot = error.code === "23505" || (error.message || "").includes("uq_project_documents_project_doc_type");
    if (isDuplicateSlot) {
      let retryQuery = supabase.from("project_documents").select("id").eq("project_id", projectId).eq("doc_type", key);
      if (epIdx != null) {
        retryQuery = retryQuery.eq("meta_json->>episode_index", String(epIdx));
      }
      const { data: racedExisting, error: retryErr } = await retryQuery.limit(1);
      if (!retryErr && racedExisting && racedExisting.length > 0) {
        return {
          documentId: racedExisting[0].id,
          isNew: false
        };
      }
    }
    throw new Error(`ensureDocSlot(${key}${epSuffix}): ${error.message}`);
  }
  return {
    documentId: newDoc.id,
    isNew: true
  };
}
// ── Known system generator IDs — versions from these MUST have non-empty inputs_used ──
const SYSTEM_GENERATOR_IDS = new Set([
  "auto-run-convert",
  "auto-run-setup",
  "auto-run-seed",
  "dev-engine-v2-convert",
  "dev-engine-v2-regen-insufficient",
  "dev-engine-v2-series-scripts",
  "dev-engine-v2-series-autorun",
  "dev-engine-v2-build-master",
  "dev-engine-v2-rebase",
  "dev-engine-v2-regen-tick",
  "dev-engine-v2-rewrite",
  "dev-engine-v2-rewrite-chunked",
  "dev-engine-v2-rewrite-episodic",
  "seed-pack",
  "generate-document",
  "system",
  "notes-engine",
  "idea-to-project",
  "season-package"
]);
// seed-trigger is NOT in the set — it's DB-trigger generated and exempt from provenance
// seed-pack IS in the set — seed-pack outputs should have provenance for auditability
// ── PIPELINE AUTHORITY LAYER: Lane-aware canon alignment control ──
// Canon alignment should ONLY run on doc_types that CONSUME canon (scripts).
// All other types either DEFINE canon or are structural.
//
// Instead of a broad exempt set, we define which doc_types per format SHOULD run alignment.
// Everything else is implicitly exempt.
const CANON_ALIGNMENT_APPLICABLE = {
  "film": new Set([
    "feature_script",
    "production_draft"
  ]),
  "feature": new Set([
    "feature_script",
    "production_draft"
  ]),
  "short": new Set([
    "feature_script"
  ]),
  "animation": new Set([
    "feature_script"
  ]),
  "tv-series": new Set([
    "episode_script",
    "season_master_script",
    "production_draft"
  ]),
  "limited-series": new Set([
    "episode_script",
    "season_master_script",
    "production_draft"
  ]),
  "digital-series": new Set([
    "episode_script",
    "season_master_script",
    "production_draft"
  ]),
  "anim-series": new Set([
    "episode_script",
    "season_master_script",
    "production_draft"
  ]),
  "vertical-drama": new Set([
    "season_script"
  ]),
  "documentary": new Set([]),
  "documentary-series": new Set([]),
  "hybrid-documentary": new Set([]),
  "reality": new Set([
    "episode_script"
  ])
};
/**
 * PAL: Determine if canon alignment should run for a given format + doc_type.
 * Returns true ONLY if the doc_type is a canon-consuming type for that format.
 * Fail-closed: if format is unknown, alignment does NOT run (no false positives).
 *
 * Rewrite refinement exception:
 * production_draft chunked rewrites are editing an existing approved script shape,
 * so they must not be blocked by first-pass canon entity coverage heuristics.
 */ export function shouldRunCanonAlignment(format, docType, generatorId) {
  const fmtKey = (format ?? '').trim().toLowerCase().replace(/[_ ]+/g, '-');
  // Rewrite-refinement exemption: chunked rewrites of output scripts are refining
  // existing approved content, not generating from scratch. Entity coverage heuristics
  // produce false positives because chunks may not mention all canon entity names.
  if ((docType === "production_draft" || docType === "season_script" || docType === "feature_script") && (generatorId === "dev-engine-v2-rewrite-chunked" || generatorId === "dev-engine-v2-rewrite-episodic" || generatorId === "dev-engine-v2-scene-rewrite")) {
    console.log(`[doc-os][PAL] canon_alignment_skipped: rewrite_refinement_exempt { format: "${fmtKey || 'unknown'}", doc_type: "${docType}", generator: "${generatorId}" }`);
    return false;
  }
  if (!fmtKey) {
    console.warn(`[doc-os][PAL] canon_alignment_skipped: no format provided for doc_type="${docType}"`);
    return false;
  }
  const applicable = CANON_ALIGNMENT_APPLICABLE[fmtKey];
  if (!applicable) {
    console.warn(`[doc-os][PAL] canon_alignment_skipped: unknown format="${fmtKey}" for doc_type="${docType}"`);
    return false;
  }
  const should = applicable.has(docType);
  console.log(`[doc-os][IEL] canon_alignment_check { format: "${fmtKey}", doc_type: "${docType}", should_run: ${should} }`);
  return should;
}
// Legacy fallback for callers that don't have format context — minimal set
const CANON_ALIGNMENT_EXEMPT_FALLBACK = new Set([
  "canon",
  "nec",
  "format_rules",
  "project_overview",
  "creative_brief",
  "market_positioning",
  "idea",
  "concept_brief",
  "vertical_market_sheet",
  "market_sheet",
  "episode_grid",
  "season_arc",
  "vertical_episode_beats",
  "character_bible",
  "beat_sheet",
  "treatment",
  "story_outline",
  "documentary_outline",
  "topline_narrative",
  "season_master_script",
  "deck",
  "episode_beats"
]);
/**
 * Create a new version for a document, handling is_current swap atomically.
 * Returns the new version row.
 * 
 * PROVENANCE INVARIANT: System-generated versions (generatorId in SYSTEM_GENERATOR_IDS)
 * MUST provide non-empty inputsUsed or the call will throw PROVENANCE_MISSING.
 * Seed-trigger versions are exempt (they are DB-trigger generated).
 * 
 * NOTE: This function now wraps persistVersion() — the canonical persistence boundary.
 * New callers SHOULD use persistVersion() directly.
 */
export async function createVersion(supabase, opts) {
  // Map createVersion opts to persistVersion format
  // Determine operation type based on content presence
  const hasContent = !!(opts.plaintext && opts.plaintext.trim().length > 0);
  const op: PersistVersionOperationType = hasContent ? "CREATE_FINAL" : "CREATE_PLACEHOLDER";
  
  // Resolve projectId from document
  let resolvedProjectId: string | null = null;
  try {
    const { data: docRow } = await supabase.from("project_documents")
      .select("project_id").eq("id", opts.documentId).maybeSingle();
    resolvedProjectId = docRow?.project_id || null;
  } catch {}

  const { key } = resolveDocType(opts.docType, opts.format);
  const effectiveGeneratorId = opts.generatorId || "system";

  // Provenance enforcement still runs at this layer (blocking gate)
  const isSystemGenerated = (SYSTEM_GENERATOR_IDS.has(effectiveGeneratorId) || opts.generatorId && opts.generatorId.length > 0) && effectiveGeneratorId !== "seed-trigger";
  const hasProvenance = opts.inputsUsed && Object.keys(opts.inputsUsed).length > 0;
  if (isSystemGenerated && !hasProvenance) {
    const msg = `PROVENANCE_MISSING: System generator "${effectiveGeneratorId}" must provide non-empty inputsUsed for doc_type="${key}"`;
    console.error(`[doc-os] ${msg}`);
    throw new Error(msg);
  }

  // PAL: Lane-aware canon alignment gate (blocking gate)
  const runAlignment = (()=>{
    if (!isSystemGenerated || !opts.plaintext) return false;
    if (opts.format) {
      return shouldRunCanonAlignment(opts.format, key, effectiveGeneratorId);
    }
    return !CANON_ALIGNMENT_EXEMPT_FALLBACK.has(key);
  })();
  if (runAlignment) {
    try {
      const { data: docRow } = await supabase.from("project_documents").select("project_id").eq("id", opts.documentId).maybeSingle();
      if (docRow?.project_id) {
        const canon = await buildCanonEntitiesFromDB(supabase, docRow.project_id);
        if (canon && canon.entities.length > 0) {
          const alignResult = validateCanonAlignment(opts.plaintext, canon.entities);
          if (!alignResult.pass) {
            const msg = `CANON_MISMATCH: doc_type="${key}" format="${opts.format || 'unknown'}" generator="${effectiveGeneratorId}" coverage=${alignResult.entityCoverage} missing=[${alignResult.missingEntities.slice(0, 5).join(",")}] foreign=[${alignResult.foreignEntities.slice(0, 5).join(",")}]`;
            console.error(`[doc-os] ${msg}`);
            throw new Error(msg);
          }
          console.log(`[doc-os] canon_alignment_pass doc_type=${key} format=${opts.format || 'unknown'} coverage=${alignResult.entityCoverage}`);
        }
      }
    } catch (err) {
      if (err?.message?.startsWith("CANON_MISMATCH:")) throw err;
      const gateErr = `CANON_GATE_ERROR: doc_type="${key}" generator="${effectiveGeneratorId}" error="${err?.message}"`;
      console.error(`[doc-os] ${gateErr}`);
      throw new Error(gateErr);
    }
  }

  // Delegate to persistVersion for the actual DB write
  return await persistVersion(supabase, {
    projectId: resolvedProjectId || undefined,
    documentId: opts.documentId,
    docType: opts.docType,
    operation: op,
    plaintext: opts.plaintext,
    label: opts.label,
    createdBy: opts.createdBy,
    generatorId: effectiveGeneratorId,
    inputsUsed: opts.inputsUsed,
    parentVersionId: opts.parentVersionId,
    sourceDocumentIds: opts.sourceDocumentIds,
    dependsOn: opts.dependsOn,
    dependsOnResolverHash: opts.dependsOnResolverHash,
    deliverableType: opts.deliverableType || key,
    metaJson: opts.metaJson,
    approvalStatus: opts.approvalStatus,
    status: opts.status,
    format: opts.format,
    inheritedCore: opts.inheritedCore,
    isStale: opts.isStale,
    staleReason: opts.staleReason,
    generatorRunId: opts.generatorRunId,
    styleTemplateVersionId: opts.styleTemplateVersionId,
    changeSummary: opts.changeSummary,
    branchId: opts.branchId,
  });
}

/**
 * persistVersion — Canonical version persistence boundary.
 * 
 * ALL version writes to project_document_versions MUST route through this function.
 * Handles INSERT (content & placeholder), UPDATE (content & metadata), and UPSERT patterns.
 * Fires Identity Stack shadow on content writes only.
 * 
 * Key design decisions:
 * - DB write happens FIRST (identity stack is post-write, non-fatal)
 * - Content writes trigger identity stack shadow computation
 * - Placeholder and metadata-only writes skip identity stack
 * - Dedup guards prevent double computation
 * - createVersion() wraps this function for backward compatibility
 */
export async function persistVersion(
  supabase: any,
  opts: PersistVersionArgs,
): Promise<any> {
  const { key } = resolveDocType(opts.docType, opts.format);

  // ── Phase 7.5C: Operation Classification ──
  const isContentOp = CONTENT_WRITE_OPERATIONS.has(opts.operation);
  const hasContent = !!(opts.plaintext && opts.plaintext.trim().length > 0);
  const effectiveGeneratorId = opts.generatorId || "system";

  // ── 1. DETERMINE VERSION NUMBER (for INSERT operations) ──
  // For UPDATE operations, use existing version number
  let versionNumber: number | undefined;

  if (opts.versionNumberOverride) {
    versionNumber = opts.versionNumberOverride;
  } else if (opts.operation === "UPDATE_CONTENT" || opts.operation === "UPDATE_METADATA_ONLY" || opts.operation === "UPDATE_STATUS_ONLY" || opts.operation === "SUPERSEDE") {
    // UPDATE — version number already exists, don't change it
    versionNumber = undefined;
  } else {
    // INSERT/UPSERT — get next sequential version number
    const { data: maxRow } = await supabase.from("project_document_versions")
      .select("version_number")
      .eq("document_id", opts.documentId)
      .order("version_number", { ascending: false })
      .limit(1);
    versionNumber = (maxRow?.[0]?.version_number || 0) + 1;
  }

  // ── 2. CONFLICT DETECTION (for INSERT parent version check) ──
  let shouldPromote = opts.isCurrent !== undefined ? opts.isCurrent : true;

  if (opts.parentVersionId && (opts.operation === "CREATE_FINAL" || opts.operation === "CREATE_PLACEHOLDER" || opts.operation === "CONVERT_FORMAT" || opts.operation === "REWRITE_FINAL" || opts.operation === "PROMOTE_DERIVATIVE")) {
    const { data: parentRow } = await supabase.from("project_document_versions")
      .select("id, is_current, version_number")
      .eq("id", opts.parentVersionId)
      .maybeSingle();
    if (parentRow && !parentRow.is_current) {
      shouldPromote = false;
      console.warn(`[persistVersion] VERSION_CONFLICT: parent ${opts.parentVersionId} (v${parentRow.version_number}) is no longer current. v${versionNumber} will NOT be auto-promoted.`);
    }
  }

  // ── 3. PERFORM DB WRITE ──
  let version: any;

  if (opts.operation === "UPDATE_CONTENT" && opts.versionId) {
    // UPDATE_CONTENT — fill placeholder with assembled content
    // Compute merged meta_json
    const existingMeta = opts.metaJson || {};
    const mergedMeta = {
      ...existingMeta,
      bg_generating: false,
      ...(opts.assembledFromChunks ? { assembled_from_chunks: true } : {}),
      ...(opts.assembledChunkCount !== undefined ? { assembled_chunk_count: opts.assembledChunkCount } : {}),
    };

    const { data: updated, error } = await supabase
      .from("project_document_versions")
      .update({
        plaintext: opts.plaintext,
        meta_json: mergedMeta,
        ...(opts.assembledFromChunks ? { assembled_from_chunks: true } : {}),
        ...(opts.assembledChunkCount !== undefined ? { assembled_chunk_count: opts.assembledChunkCount } : {}),
      })
      .eq("id", opts.versionId)
      .select()
      .single();

    if (error) throw new Error(`persistVersion(${opts.operation}): ${error.message}`);
    version = updated;

    // Promote to current if needed
    if (shouldPromote) {
      await supabase.from("project_document_versions")
        .update({ is_current: false })
        .eq("document_id", opts.documentId)
        .eq("is_current", true);
      await supabase.from("project_document_versions")
        .update({ is_current: true })
        .eq("id", opts.versionId);
    }
  } else if (opts.operation === "UPDATE_METADATA_ONLY" && opts.versionId) {
    // UPDATE_METADATA_ONLY — merge meta_json only
    const updatePayload: any = {};
    if (opts.metaJson) {
      // Merge meta_json — read existing, merge, write back
      const { data: curVer } = await supabase.from("project_document_versions")
        .select("meta_json").eq("id", opts.versionId).maybeSingle();
      const curMeta = (curVer?.meta_json || {});
      updatePayload.meta_json = { ...curMeta, ...opts.metaJson };
    }

    const { data: updated, error } = await supabase
      .from("project_document_versions")
      .update(updatePayload)
      .eq("id", opts.versionId)
      .select()
      .single();

    if (error) throw new Error(`persistVersion(${opts.operation}): ${error.message}`);
    version = updated;
  } else if (opts.operation === "UPDATE_STATUS_ONLY" && opts.versionId) {
    // UPDATE_STATUS_ONLY — update approval_status, is_current
    const updatePayload: any = {};
    if (opts.approvalStatus) updatePayload.approval_status = opts.approvalStatus;
    if (opts.isCurrent !== undefined) updatePayload.is_current = opts.isCurrent;

    const { data: updated, error } = await supabase
      .from("project_document_versions")
      .update(updatePayload)
      .eq("id", opts.versionId)
      .select()
      .single();

    if (error) throw new Error(`persistVersion(${opts.operation}): ${error.message}`);
    version = updated;
  } else if (opts.operation === "SUPERSEDE" && opts.versionId) {
    // SUPERSEDE — mark parent as non-current
    const { data: updated, error } = await supabase
      .from("project_document_versions")
      .update({
        is_current: false,
        superseded_at: new Date().toISOString(),
        superseded_by: opts.parentVersionId || null,
      })
      .eq("id", opts.versionId)
      .select()
      .single();

    if (error) throw new Error(`persistVersion(${opts.operation}): ${error.message}`);
    version = updated;
  } else if (opts.operation === "UPSERT_CONTENT" && opts.versionId) {
    // UPSERT_CONTENT with explicit versionId — update existing version
    // (Used by beat-rewrite which targets a specific version)
    const resolvedOnConflict = opts.generatorId === "dev-engine-v2-beat-rewrite"
      ? ["document_id", "version_number"]
      : undefined;

    const upsertPayload: any = {
      document_id: opts.documentId,
      version_number: versionNumber,
      plaintext: opts.plaintext,
      is_current: shouldPromote,
      status: opts.status || "draft",
      label: opts.label,
      created_by: opts.createdBy,
      approval_status: opts.approvalStatus || "draft",
      deliverable_type: opts.deliverableType || key,
      meta_json: opts.metaJson && typeof opts.metaJson === 'object' && !Array.isArray(opts.metaJson) ? opts.metaJson : {},
      generator_id: effectiveGeneratorId,
    };
    if (opts.changeSummary) upsertPayload.change_summary = opts.changeSummary;
    if (opts.inheritedCore) upsertPayload.inherited_core = opts.inheritedCore;
    if (opts.sourceDocumentIds) upsertPayload.source_document_ids = opts.sourceDocumentIds;
    if (opts.dependsOn) upsertPayload.depends_on = opts.dependsOn;
    if (opts.dependsOnResolverHash) upsertPayload.depends_on_resolver_hash = opts.dependsOnResolverHash;
    if (opts.branchId) upsertPayload.branch_id = opts.branchId;
    if (opts.generatorRunId) upsertPayload.generator_run_id = opts.generatorRunId;
    if (opts.styleTemplateVersionId) upsertPayload.style_template_version_id = opts.styleTemplateVersionId;

    const { data: upserted, error } = await supabase
      .from("project_document_versions")
      .upsert(upsertPayload, { onConflict: resolvedOnConflict })
      .select()
      .single();

    if (error) throw new Error(`persistVersion(${opts.operation}): ${error.message}`);
    version = upserted;

    // Promote to current if flagged
    if (shouldPromote) {
      await supabase.from("project_document_versions")
        .update({ is_current: false })
        .eq("document_id", opts.documentId)
        .neq("id", version.id);
    }
  } else {
    // ── INSERT operations: CREATE_FINAL, CREATE_PLACEHOLDER, CONVERT_FORMAT, REWRITE_FINAL, PROMOTE_DERIVATIVE ──
    // Also UPSERT without versionId (create with upsert)
    const isPlaceholder = opts.operation === "CREATE_PLACEHOLDER";

    if (shouldPromote && !isPlaceholder) {
      // Clear current flag on existing version before creating new one
      await supabase.from("project_document_versions")
        .update({ is_current: false })
        .eq("document_id", opts.documentId)
        .eq("is_current", true);
    }

    const insertPayload: any = {
      document_id: opts.documentId,
      version_number: versionNumber,
      plaintext: opts.plaintext || "",
      is_current: isPlaceholder ? false : shouldPromote,
      status: opts.status || "draft",
      label: opts.label,
      created_by: opts.createdBy,
      approval_status: opts.approvalStatus || "draft",
      deliverable_type: opts.deliverableType || key,
      meta_json: opts.metaJson && typeof opts.metaJson === 'object' && !Array.isArray(opts.metaJson) ? opts.metaJson : {},
      generator_id: effectiveGeneratorId,
    };

    if (opts.changeSummary) insertPayload.change_summary = opts.changeSummary;
    if (opts.inheritedCore) insertPayload.inherited_core = opts.inheritedCore;
    if (opts.sourceDocumentIds) insertPayload.source_document_ids = opts.sourceDocumentIds;
    if (opts.dependsOn) insertPayload.depends_on = opts.dependsOn;
    if (opts.dependsOnResolverHash) insertPayload.depends_on_resolver_hash = opts.dependsOnResolverHash;
    if (opts.generatorRunId) insertPayload.generator_run_id = opts.generatorRunId;
    if (opts.styleTemplateVersionId) insertPayload.style_template_version_id = opts.styleTemplateVersionId;
    if (opts.branchId) insertPayload.branch_id = opts.branchId;
    if (opts.isStale !== undefined) insertPayload.is_stale = opts.isStale;
    if (opts.staleReason !== undefined) insertPayload.stale_reason = opts.staleReason;
    if (opts.parentVersionId) insertPayload.parent_version_id = opts.parentVersionId;

    // Persist inputs_used for provenance
    const hasProvenance = opts.inputsUsed && Object.keys(opts.inputsUsed).length > 0;
    if (hasProvenance) {
      insertPayload.inputs_used = opts.inputsUsed;
    }

    const { data: newVersion, error } = await supabase
      .from("project_document_versions")
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw new Error(`persistVersion(${opts.operation} v${versionNumber}): ${error.message}`);
    version = newVersion;
  }

  // ── 4. POST-WRITE: Set latest_version_id for documents with renderable content ──
  if (hasContent && version?.id) {
    const { error: lvErr } = await supabase.from("project_documents").update({
      latest_version_id: version.id,
      char_count: opts.plaintext!.trim().length
    }).eq("id", opts.documentId);
    if (lvErr) {
      console.warn(`[persistVersion] failed to set latest_version_id: ${lvErr.message}`);
    }
  }

  // ── 5. POST-WRITE: Transition Ledger (for INSERT operations) ──
  if (opts.projectId && version?.id && (opts.operation === "CREATE_FINAL" || opts.operation === "CREATE_PLACEHOLDER" || opts.operation === "CONVERT_FORMAT" || opts.operation === "REWRITE_FINAL" || opts.operation === "PROMOTE_DERIVATIVE")) {
    try {
      await emitTransition(supabase, {
        projectId: opts.projectId,
        eventType: TRANSITION_EVENTS.VERSION_CREATED,
        docType: key,
        resultingVersionId: version.id,
        sourceVersionId: opts.parentVersionId || undefined,
        generatorId: effectiveGeneratorId,
        trigger: opts.label,
        sourceOfTruth: "doc-os.persistVersion",
        resultingState: {
          version_number: versionNumber,
          is_current: shouldPromote,
          approval_status: opts.approvalStatus || "draft",
          has_provenance: !!(opts.inputsUsed && Object.keys(opts.inputsUsed).length > 0),
          content_length: opts.plaintext?.length || 0,
          operation: opts.operation,
        },
        createdBy: opts.createdBy
      });
    } catch (ledgerErr) {
      console.warn(`[persistVersion] Transition ledger non-fatal: ${ledgerErr?.message}`);
    }
  }

  // ── 6. POST-WRITE: NIT v2.1 Auto entity mention extraction ──
  if (opts.projectId && version?.id && hasContent && isContentOp) {
    try {
      const { extractEntityMentionsForVersion } = await import("./narrativeEntityEngine.ts");
      const mentionResult = await extractEntityMentionsForVersion(
        supabase, opts.projectId, opts.documentId, version.id, key, opts.plaintext!
      );
      if (mentionResult.skipped_reason) {
        console.log(`[persistVersion] NIT mention sync skipped version=${version.id} reason=${mentionResult.skipped_reason}`);
      } else {
        console.log(`[persistVersion] NIT mention sync ok version=${version.id} mentions=${mentionResult.mentions_upserted}`);
      }
    } catch (nitErr) {
      console.warn(`[persistVersion] NIT mention sync non-fatal version=${version?.id}: ${nitErr?.message}`);
    }
  }

  // ── 7. POST-WRITE: Identity Stack Shadow ──
  // Only fires on content-write operations with non-empty content
  if (opts.projectId && version?.id && hasContent && isContentOp && IDENTITY_STACK_SHADOW_ENABLED) {
    try {
      const curMeta = version.meta_json || {};
      if (curMeta.identity_stack_shadow) {
        console.log(`[persistVersion] Identity Stack shadow already exists for version ${version.id} — skipping`);
      } else {
        const { data: canon } = await supabase.from("project_canon")
          .select("canon_json")
          .eq("project_id", opts.projectId)
          .maybeSingle();
        const cip = canon?.canon_json?.identity_profile ?? null;
        const shadow = computeIdentityStackShadow(
          opts.plaintext,
          opts.deliverableType || key,
          cip,
          null, // DAB not available at this layer
        );
        if (shadow) {
          const existingMeta = version.meta_json || {};
          await supabase.from("project_document_versions").update({
            meta_json: { ...existingMeta, identity_stack_shadow: shadow }
          }).eq("id", version.id);
        }
      }
    } catch (e) {
      // Non-fatal: shadow failure never blocks version persistence
      console.warn("[persistVersion] Identity Stack shadow failed (non-fatal):", e?.message || e);
    }
  }

  // ── 8. POST-WRITE: Atomize version (extract atoms + rebuild deps + staleness) ──
  // GATED: NEL is the canonical extraction pipeline. This auto-extraction is
  // a lightweight pre-NEL indexer only when ENABLE_ATOMIZE_VERSION=true.
  // When false (default), NEL owns all canonical atom extraction.
  // Non-blocking — version validity never depends on atom extraction.
  if (opts.projectId && version?.id && hasContent && isContentOp && opts.plaintext!.trim().length >= 50) {
    const enableAtomizeVersion = Deno.env.get("ENABLE_ATOMIZE_VERSION") || "false";
    if (enableAtomizeVersion === "true") {
      try {
        const { atomizeVersion } = await import("./atomizeVersion.ts");
        const atomResult = await atomizeVersion(
          supabase,
          opts.projectId,
          key,
          version.id,
          opts.plaintext!
        );
        if (atomResult.errors.length > 0) {
          console.warn(`[persistVersion] Atomization non-blocking errors: ${atomResult.errors.slice(0, 3).join("; ")}`);
        }
        console.log(`[persistVersion] Atomization: ${atomResult.atoms_written} atoms, ${atomResult.dependencies_written} deps, ${atomResult.staleness_flags_generated} staleness flags`);
      } catch (atomErr: any) {
        console.warn(`[persistVersion] Atomization failed (non-blocking): ${atomErr?.message}`);
      }
    } else {
      console.log(`[persistVersion] Atomization skipped — NEL is canonical pipeline (ENABLE_ATOMIZE_VERSION not set to true)`);
    }
  }

  return version;
}
export async function upsertDoc(supabase, opts) {
  const slot = await ensureDocSlot(supabase, opts.projectId, opts.userId, opts.docType, {
    title: opts.title,
    source: opts.source
  });
  const version = await createVersion(supabase, {
    documentId: slot.documentId,
    docType: opts.docType,
    plaintext: opts.plaintext,
    label: opts.label,
    createdBy: opts.userId,
    approvalStatus: opts.approvalStatus,
    metaJson: opts.metaJson,
    changeSummary: opts.changeSummary,
    inheritedCore: opts.inheritedCore,
    sourceDocumentIds: opts.sourceDocumentIds,
    dependsOnResolverHash: opts.dependsOnResolverHash,
    generatorId: opts.generatorId,
    inputsUsed: opts.inputsUsed
  });
  return {
    documentId: slot.documentId,
    versionId: version.id,
    isNewDoc: slot.isNew,
    versionNumber: version.version_number
  };
}
