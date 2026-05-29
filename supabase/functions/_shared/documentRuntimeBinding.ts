// ── DocumentRuntimeBinding — Backend Shared Module ──
// Mirrors the frontend resolver contract for Supabase Edge Functions.
// Importable by auto-run, dev-engine-v2, project-folder-engine.
// Deno-compatible — uses Deno-style types (no TS strict mode).

export type BindingType = 'authoritative' | 'promotion_gate' | 'render' | 'pipeline';

export interface BackendBindingResult {
  versionId: string | null;
  source: string;
  reason: string;
}

export interface BackendVersion {
  id: string;
  version_number: number;
  approval_status: string | null;
  is_current: boolean | null;
  created_at: string;
  meta_json?: Record<string, any> | null;
}

/**
 * Log an IEL warning when a set_current_version call targets a version
 * that doesn't match the authoritative binding. Lightweight guard — logs
 * but does not block the operation (backend callers own their error handling).
 */
export async function logBindingGuardWarning(
  supabase: any,
  documentId: string,
  targetVersionId: string,
  context: { caller: string; docType?: string; projectId?: string },
): Promise<void> {
  try {
    const { data: versions } = await supabase
      .from('project_document_versions')
      .select('id, version_number, approval_status, is_current, created_at, meta_json')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false });

    if (!versions || versions.length === 0) return;

    const authoritative = resolveBackendBinding('authoritative', versions);
    if (authoritative.versionId && authoritative.versionId !== targetVersionId) {
      console.warn(
        `[binding-guard][IEL] set_current_version_binding_mismatch { caller: "${context.caller}", document_id: "${documentId}", target_version_id: "${targetVersionId}", authoritative_version_id: "${authoritative.versionId}", authoritative_reason: "${authoritative.reason}", doc_type: "${context.docType || 'unknown'}" }`
      );
    }
  } catch (e: any) {
    // Fail-open: guard is advisory only, never block the caller
    console.warn(`[binding-guard] logBindingGuardWarning failed: ${e?.message}`);
  }
}

function toNumericScore(val: any): number | null {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return null;
}

function parseVersionScores(metaJson: any): { ci: number | null; gp: number | null; scoreSource: string | null } {
  const meta = metaJson && typeof metaJson === 'object' && !Array.isArray(metaJson) ? metaJson : {};
  return {
    ci: toNumericScore(meta?.ci),
    gp: toNumericScore(meta?.gp),
    scoreSource: typeof meta?.score_source === 'string' ? meta.score_source : null,
  };
}

function pickBestScoredVersion(rows: any[]): any | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    // Higher total score first
    const scoreA = (a.ci || 0) + (a.gp || 0);
    const scoreB = (b.ci || 0) + (b.gp || 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    // Tiebreaker: higher version_number
    return (b.version_number || 0) - (a.version_number || 0);
  });
  return sorted[0] || null;
}

/**
 * Resolve a single binding type from a version list (back-end compatible).
 * Mirrors the front-end resolveSingleBinding signature but returns flat result.
 */
export function resolveBackendBinding(
  type: BindingType,
  versions: BackendVersion[],
  job?: { resume_version_id?: string; resume_document_id?: string; follow_latest?: boolean },
): BackendBindingResult {
  const allVersions = versions || [];
  if (!allVersions.length) {
    return { versionId: null, source: 'none', reason: 'no_versions' };
  }

  switch (type) {
    case 'authoritative':
      return resolveAuthoritativeBackend(allVersions);
    case 'promotion_gate':
      return resolvePromotionGateBackend(allVersions);
    case 'render':
      return resolveRenderBackend(allVersions);
    case 'pipeline':
      return resolvePipelineBackend(allVersions, job);
    default:
      return { versionId: null, source: 'error', reason: 'unknown_type' };
  }
}

function resolveAuthoritativeBackend(versions: BackendVersion[]): BackendBindingResult {
  const approved = versions.filter(v => v.approval_status === 'approved');
  const approvedCurrent = approved.find(v => !!v.is_current);
  if (approvedCurrent) {
    return { versionId: approvedCurrent.id, source: 'best_approved', reason: 'approved_and_current' };
  }
  // Best approved by score
  const scored = approved
    .map(v => ({ ...v, ...parseVersionScores(v.meta_json) }))
    .filter(v => v.ci !== null && v.gp !== null);
  const best = pickBestScoredVersion(scored);
  if (best) {
    return { versionId: best.id, source: 'best_approved', reason: 'approved_best_score' };
  }
  // Newest approved by created_at
  const newest = approved.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
  if (newest) {
    return { versionId: newest.id, source: 'best_approved', reason: 'best_approved_by_version' };
  }
  return { versionId: null, source: 'none', reason: 'no_approved_versions' };
}

function resolvePromotionGateBackend(versions: BackendVersion[]): BackendBindingResult {
  const strict = versions
    .filter(v => v.approval_status === 'approved' && !!v.is_current)
    .sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
  if (strict.length > 0) {
    return { versionId: strict[0].id, source: 'promotion_gate', reason: 'approved_and_current' };
  }
  const fallback = versions
    .filter(v => v.approval_status === 'approved')
    .sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
  if (fallback.length > 0) {
    return { versionId: fallback[0].id, source: 'promotion_gate', reason: 'best_version_number' };
  }
  return { versionId: null, source: 'none', reason: 'no_approved_versions' };
}

function resolveRenderBackend(versions: BackendVersion[]): BackendBindingResult {
  const auth = resolveAuthoritativeBackend(versions);
  if (auth.versionId) return auth;
  const sorted = [...versions].sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
  if (sorted.length > 0) {
    return { versionId: sorted[0].id, source: 'auto_select', reason: 'latest_version_number' };
  }
  return { versionId: null, source: 'none', reason: 'no_versions' };
}

/**
 * Pipeline binding — mirrors ABVR (Auto-Bound Version Resolver) algorithm
 * from auto-run/index.ts lines 914-1056.
 */
function resolvePipelineBackend(
  versions: BackendVersion[],
  job?: { resume_version_id?: string; resume_document_id?: string; follow_latest?: boolean },
): BackendBindingResult {
  const allVersions = versions || [];
  if (!allVersions.length) {
    return { versionId: null, source: 'none', reason: 'no_versions' };
  }

  const approvedVersions = allVersions.filter(v => v.approval_status === 'approved');

  // A) APPROVED-FIRST RESOLUTION
  if (approvedVersions.length > 0) {
    // A1) Authoritative approved+current
    const approvedCurrent = approvedVersions.find(v => !!v.is_current);
    if (approvedCurrent) {
      return { versionId: approvedCurrent.id, source: 'best_approved', reason: 'approved_and_current' };
    }
    // A2) Best approved by score
    const scored = approvedVersions
      .map(v => ({ id: v.id, version_number: v.version_number, ...parseVersionScores(v.meta_json) }))
      .filter(v => v.ci !== null && v.gp !== null);
    const best = pickBestScoredVersion(scored);
    if (best) {
      return { versionId: best.id, source: 'best_approved', reason: 'approved_best_score' };
    }
    // A3) Newest approved
    const newest = approvedVersions.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
    if (newest) {
      return { versionId: newest.id, source: 'best_approved', reason: 'best_approved_by_version' };
    }
  }

  // B) Pinned (when no approved version exists)
  if (job && !job.follow_latest && job.resume_version_id && job.resume_document_id) {
    const pinnedExists = allVersions.some(v => v.id === job.resume_version_id);
    if (pinnedExists) {
      return { versionId: job.resume_version_id, source: 'pinned', reason: 'pinned' };
    }
  }

  // C) No approved: use best scored current candidate
  const eligibleScored = allVersions
    .map(v => ({
      id: v.id,
      version_number: v.version_number,
      approval_status: v.approval_status,
      is_current: !!v.is_current,
      ...parseVersionScores(v.meta_json),
      eligibilityReason: v.is_current ? 'is_current' : null,
    }))
    .filter(v => v.eligibilityReason && v.ci !== null && v.gp !== null);
  const best = pickBestScoredVersion(eligibleScored);
  if (best) {
    return { versionId: best.id, source: 'eligible_best_score', reason: `eligible_best:${best.eligibilityReason}` };
  }

  // C1) is_current
  const currentVer = allVersions.find(v => !!v.is_current);
  if (currentVer) {
    return { versionId: currentVer.id, source: 'is_current', reason: 'is_current' };
  }

  // D) Latest by version_number (final fallback)
  const latest = allVersions.sort((a, b) => (b.version_number || 0) - (a.version_number || 0))[0];
  if (latest) {
    return { versionId: latest.id, source: 'latest_version_number', reason: 'latest_version_number' };
  }

  return { versionId: null, source: 'none', reason: 'no_versions' };
}

/**
 * ABVR entry point — wraps resolveBackendBinding with full Supabase-backed resolution.
 * Mirrors resolveActiveVersionForDoc from auto-run/index.ts.
 */
export async function resolveABVR(
  supabase: any,
  job: any,
  documentId: string,
  ctx?: { jobId?: string; docType?: string },
): Promise<BackendBindingResult | null> {
  const { data: versions, error: versionsErr } = await supabase
    .from('project_document_versions')
    .select('id, version_number, approval_status, is_current, created_by, meta_json, approved_at')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false });

  if (versionsErr) {
    console.error(`[shared-abvr] abvr_versions_query_failed { document_id: "${documentId}", error: "${versionsErr.message}" }`);
    return null;
  }

  return resolvePipelineBackend(versions || [], {
    resume_version_id: job?.resume_version_id,
    resume_document_id: job?.resume_document_id,
    follow_latest: job?.follow_latest,
  });
}