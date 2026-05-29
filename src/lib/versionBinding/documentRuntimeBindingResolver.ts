// ── DocumentRuntimeBinding Resolver ──
// Pure resolution logic — no React, no side effects. Deterministic, testable, shareable.
// Mirrors the existing inline resolution in DevelopmentEngine.tsx (lines 843-864)
// and the backend ABVR in auto-run/index.ts (lines 914-1056).

import type { RuntimeBinding, BindingType, BindingSource } from './documentRuntimeBindingTypes';

// Re-export Version type for consumer convenience
export interface ResolverVersion {
  id: string;
  version_number: number;
  approval_status: string | null;
  is_current: boolean | null;
  created_at: string;
  meta_json?: Record<string, any> | null;
}

/**
 * Resolve all 4 binding types from a version list.
 * Uses deterministic algorithms matching existing inline code.
 */
export function resolveBindings(
  versions: ResolverVersion[],
  selectedVersionId: string | null,
  docType: string,
): RuntimeBinding[] {
  const now = Date.now();

  // Group by type — each resolver produces one binding
  const authoritative = resolveSingleBinding('authoritative', versions, selectedVersionId, docType);
  const promotionGate = resolveSingleBinding('promotion_gate', versions, selectedVersionId, docType);
  const render = resolveSingleBinding('render', versions, selectedVersionId, docType);
  const pipeline = resolveSingleBinding('pipeline', versions, selectedVersionId, docType);

  // Attach type to each result (resolveSingleBinding returns partial)
  return [
    { ...authoritative, type: 'authoritative' as const, boundAt: now },
    { ...promotionGate, type: 'promotion_gate' as const, boundAt: now },
    { ...render, type: 'render' as const, boundAt: now },
    { ...pipeline, type: 'pipeline' as const, boundAt: now },
  ].map(b => ({ ...b, docType }));
}

/**
 * Resolve a single binding type from a version list.
 */
export function resolveSingleBinding(
  type: BindingType,
  versions: ResolverVersion[],
  selectedVersionId: string | null,
  docType: string, // used for context in logging, not for resolution logic
): { versionId: string | null; source: BindingSource } {
  if (!versions || versions.length === 0) {
    return { versionId: null, source: 'unavailable' };
  }

  switch (type) {
    case 'authoritative':
      return resolveAuthoritative(versions);
    case 'promotion_gate':
      return resolvePromotionGate(versions);
    case 'render':
      return resolveRender(versions, selectedVersionId);
    case 'pipeline':
      return resolvePipeline(versions);
    default:
      return { versionId: null, source: 'error' };
  }
}

// ── Authoritative: approved+current, fallback newest approved by created_at ──
function resolveAuthoritative(versions: ResolverVersion[]): { versionId: string | null; source: BindingSource } {
  const strict = versions.find(
    (v: any) => v.approval_status === 'approved' && v.is_current === true,
  );
  if (strict) return { versionId: strict.id, source: 'approved_and_current' };

  const approved = versions.filter((v: any) => v.approval_status === 'approved');
  if (approved.length > 0) {
    const fallback = approved.sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )[approved.length - 1];
    return { versionId: fallback.id, source: 'newest_approved' };
  }

  return { versionId: null, source: 'unavailable' };
}

// ── Promotion Gate: approved+current sorted by version_number DESC, fallback best approved ──
// NEVER falls through to selectedVersionId (root cause of 3573b98c↔c8ca087c oscillation)
function resolvePromotionGate(versions: ResolverVersion[]): { versionId: string | null; source: BindingSource } {
  // Strict: approved+current, sorted by version_number DESC
  const strict = versions
    .filter((v: any) => v.approval_status === 'approved' && v.is_current === true)
    .sort((a: any, b: any) => (b.version_number || 0) - (a.version_number || 0));
  if (strict.length > 0) return { versionId: strict[0].id, source: 'approved_and_current' };

  // Fallback: approved by highest version_number
  const fallback = versions
    .filter((v: any) => v.approval_status === 'approved')
    .sort((a: any, b: any) => (b.version_number || 0) - (a.version_number || 0));
  if (fallback.length > 0) return { versionId: fallback[0].id, source: 'best_version_number' };

  // NEVER falls through to selectedVersionId
  return { versionId: null, source: 'unavailable' };
}

// ── Render: authoritative wins, then selected, then latest ──
function resolveRender(
  versions: ResolverVersion[],
  selectedVersionId: string | null,
): { versionId: string | null; source: BindingSource } {
  const auth = resolveAuthoritative(versions);
  if (auth.versionId) return auth;

  if (selectedVersionId) return { versionId: selectedVersionId, source: 'user_selected' };

  // Latest by version_number
  const sorted = [...versions].sort(
    (a: any, b: any) => (b.version_number || 0) - (a.version_number || 0),
  );
  if (sorted.length > 0) return { versionId: sorted[0].id, source: 'auto_select_latest' };

  return { versionId: null, source: 'unavailable' };
}

// ── Pipeline: mirrors ABVR backend contract ──
// A1) approved+current, A2) best approved by score, A3) newest approved
// B) pinned (not available client-side — skip), C) is_current, D) latest by version_number
function resolvePipeline(versions: ResolverVersion[]): { versionId: string | null; source: BindingSource } {
  // A1) Authoritative approved+current
  const approvedCurrent = versions.find(
    (v: any) => v.approval_status === 'approved' && v.is_current === true,
  );
  if (approvedCurrent) return { versionId: approvedCurrent.id, source: 'approved_and_current' };

  // A2) Best approved by composite score (CI+GP)
  const approvedVersions = versions.filter((v: any) => v.approval_status === 'approved');
  const approvedScored = approvedVersions
    .map(v => ({
      id: v.id,
      version_number: v.version_number,
      ci: (v as any).meta_json?.ci ?? null,
      gp: (v as any).meta_json?.gp ?? null,
    }))
    .filter(v => v.ci !== null && v.gp !== null);
  if (approvedScored.length > 0) {
    const best = approvedScored.reduce((a, b) => ((a.ci || 0) + (a.gp || 0) > (b.ci || 0) + (b.gp || 0) ? a : b));
    if (best) return { versionId: best.id, source: 'best_version_number' };
  }

  // A3) Newest approved by created_at
  if (approvedVersions.length > 0) {
    const newest = approvedVersions.sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
    return { versionId: newest.id, source: 'newest_approved' };
  }

  // C) is_current
  const currentVer = versions.find((v: any) => v.is_current === true);
  if (currentVer) return { versionId: currentVer.id, source: 'approved_and_current' };

  // D) Latest by version_number
  const sorted = [...versions].sort(
    (a: any, b: any) => (b.version_number || 0) - (a.version_number || 0),
  );
  if (sorted.length > 0) return { versionId: sorted[0].id, source: 'auto_select_latest' };

  return { versionId: null, source: 'unavailable' };
}