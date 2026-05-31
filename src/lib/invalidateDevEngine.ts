/**
 * invalidateDevEngine — Centralised React Query invalidation for the
 * Development Engine.  Call this after EVERY action that touches notes,
 * issues, versions, or documents so every panel in the system stays in sync.
 *
 * Uses PREFIX-BASED invalidation to automatically cover all dev-v2-* and
 * project-* query keys, plus specific treatment/script-scoped keys.
 * This eliminates the manual whitelist problem where new query keys were
 * added to components but forgotten here, leaving panels stale.
 */

import type { QueryClient } from '@tanstack/react-query';

export interface InvalidateOptions {
  projectId: string | undefined;
  docId?: string | null;
  versionId?: string | null;
  episodeNumber?: number | null;
  /** When true, also clears the persistent-issue and canon-audit caches. Default true. */
  deep?: boolean;
}

export function invalidateDevEngine(
  qc: QueryClient,
  {
    projectId,
    docId,
    versionId,
    episodeNumber,
    deep = true,
  }: InvalidateOptions,
) {
  // ── Always: ALL dev-v2-* keys via predicate (catches docs, versions, runs,
  //   convergence, drift, documents, approved — everything with dev-v2 prefix) ──
  // This automatically covers: dev-v2-docs, dev-v2-versions, dev-v2-runs,
  // dev-v2-doc-runs, dev-v2-convergence, dev-v2-approved, dev-v2-drift,
  // dev-v2-documents, treatment-rewrite-acts, treatment-acts, etc.
  qc.invalidateQueries({
    predicate: (query) => {
      const key0 = query.queryKey[0];
      return typeof key0 === 'string' && key0.startsWith('dev-v2-');
    },
  });

  // Seed pack versions (doesn't follow dev-v2- prefix)
  qc.invalidateQueries({ queryKey: ['seed-pack-versions', projectId] });

  // ── Per-document keys ──────────────────────────────────────────────────────
  if (docId) {
    qc.invalidateQueries({ queryKey: ['document-versions', docId] });
    // Treatment/rewrite/script-scoped keys
    qc.invalidateQueries({ queryKey: ['treatment-rewrite-acts', docId] });
    qc.invalidateQueries({ queryKey: ['treatment-acts', docId] });
    qc.invalidateQueries({ queryKey: ['treatment-acts-blueprint', docId] });
    qc.invalidateQueries({ queryKey: ['wr-changesets', docId] });
  }

  // ── Per-version keys ───────────────────────────────────────────────────────
  if (versionId) {
    qc.invalidateQueries({ queryKey: ['doc-chunks', docId, versionId] });
    qc.invalidateQueries({ queryKey: ['sectioned-doc-chunks', versionId] });
    qc.invalidateQueries({ queryKey: ['season-script-chunks', versionId] });
  }

  if (!deep) return;

  // ── Deep: project-level keys ──────────────────────────────────────────────
  if (projectId) {
    // Invalidate ALL project-* prefix keys (project-issues, project-documents,
    // project-shares, project-runtime-settings, etc.)
    qc.invalidateQueries({
      predicate: (query) => {
        const key0 = query.queryKey[0];
        return typeof key0 === 'string' && key0.startsWith('project-');
      },
    });
    // Other project-scoped keys (non-standard prefixes)
    qc.invalidateQueries({ queryKey: ['resolved-notes', projectId] });
    qc.invalidateQueries({ queryKey: ['series-episodes', projectId] });
    qc.invalidateQueries({ queryKey: ['active-folder', projectId] });
    qc.invalidateQueries({ queryKey: ['document-package', projectId] });
    qc.invalidateQueries({ queryKey: ['package-status', projectId] });
    qc.invalidateQueries({ queryKey: ['dev-engine-project', projectId] });
    qc.invalidateQueries({ queryKey: ['project-images', projectId] });
    qc.invalidateQueries({ queryKey: ['project-shares', projectId] });
    qc.invalidateQueries({ queryKey: ['name-review-suggestions', projectId] });
    qc.invalidateQueries({ queryKey: ['canonical-entities', projectId] });
    qc.invalidateQueries({ queryKey: ['universe-manifest', projectId] });
    qc.invalidateQueries({ queryKey: ['all-auto-run-jobs'] });
    // Decision/approval keys (don't follow dev-v2- or project- prefix)
    qc.invalidateQueries({ queryKey: ['decisions', projectId] });
    qc.invalidateQueries({ queryKey: ['decision-events', projectId] });
    qc.invalidateQueries({ queryKey: ['approval-notes', projectId] });
    // Canon audit (Series Writer)
    if (episodeNumber != null) {
      qc.invalidateQueries({ queryKey: ['canon-audit-run', projectId, episodeNumber] });
      qc.invalidateQueries({ queryKey: ['canon-audit-issues', projectId, episodeNumber] });
    } else {
      qc.invalidateQueries({ queryKey: ['canon-audit-run', projectId] });
      qc.invalidateQueries({ queryKey: ['canon-audit-issues', projectId] });
    }
  }
}
