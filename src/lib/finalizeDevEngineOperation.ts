/**
 * finalizeDevEngineOperation — Shared post-mutation finalization contract.
 *
 * Centralises cache invalidation, version selection, and authoritative refetch
 * for every Dev Engine mutation (rewrite, convert, analyze, notes, promote, create-paste, beat-sheet-to-script).
 *
 * Replaces ad-hoc per-mutation onSuccess logic with a single canonical path.
 */
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface FinalizeResult {
  success: boolean;
  projectId?: string;
  documentId?: string;
  documentType?: string;
  versionId?: string;
  status?: string;
  operationType: string;
  updatedAt?: string;
}

export interface FinalizeOptions {
  qc: QueryClient;
  projectId: string | undefined;
  currentDocId: string | null;
  setSelectedDocId: (id: string) => void;
  setSelectedVersionId: (id: string | null) => void;
  result: FinalizeResult;
  /** Callback when the authoritative refetch is complete */
  onComplete?: () => void;
  /** Override the toast message. Set null to suppress toast. */
  toastMessage?: string | null;
}

const OPERATION_TOASTS: Record<string, string> = {
  analyze: 'Analysis complete',
  notes: 'Notes generated',
  rewrite: 'Rewrite complete — new version ready',
  convert: 'Convert complete',
  'beat-sheet-to-script': 'Script created',
  'create-paste': 'Document created',
};

const FALLBACK_TOAST = 'Operation complete';

/**
 * Centralized finalization after any dev-engine-v2 mutation.
 *
 * Steps:
 * 1. Verify success — abort if failed (caller handles error path separately).
 * 2. Update selected document if the operation created a new one.
 * 3. Update selected version to the returned versionId.
 * 4. Invalidate ALL relevant caches — version lists, chunk content, document lists.
 * 5. Perform authoritative refetch — guarantees the viewer sees fresh data.
 * 6. Call onComplete when content is available.
 */
export function finalizeDevEngineOperation(options: FinalizeOptions) {
  const { qc, projectId, currentDocId, setSelectedDocId, setSelectedVersionId, result, onComplete, toastMessage } = options;

  if (!result.success) {
    console.warn('[finalizeDevEngine] FinalizeResult.success is false — skipping finalization', { operationType: result.operationType });
    return;
  }

  // ── Step 1: Select the new document if created ──
  if (result.documentId && result.documentId !== currentDocId) {
    setSelectedDocId(result.documentId);
  }

  // ── Step 2: Select the new version if returned ──
  if (result.versionId) {
    setSelectedVersionId(result.versionId);
  }

  // ── Step 3: Build invalidation key set ──
  const invalidationKeys: unknown[][] = [];

  // Always invalidate the documents list and seed pack
  invalidationKeys.push(['dev-v2-docs', projectId]);
  invalidationKeys.push(['seed-pack-versions', projectId]);

  if (result.documentId) {
    invalidationKeys.push(['dev-v2-versions', result.documentId]);
    invalidationKeys.push(['document-versions', result.documentId]);
  }

  if (result.versionId) {
    // Version-scoped data
    invalidationKeys.push(['dev-v2-runs', result.versionId]);
    invalidationKeys.push(['dev-v2-drift', result.versionId]);
    invalidationKeys.push(['dev-v2-sr-convergence', result.versionId]);

    // CHUNK CACHES — these are the critical keys SectionedDocViewer uses
    invalidationKeys.push(['sectioned-doc-viewer-chunks', result.versionId]);
    invalidationKeys.push(['has-chunks', result.versionId, result.documentType]);
    invalidationKeys.push(['season-script-chunks', result.versionId]);

    if (result.documentId) {
      invalidationKeys.push(['doc-chunks', result.documentId, result.versionId]);
    }
  }

  // Operation-specific depth
  if (result.operationType === 'rewrite' || result.operationType === 'notes' || result.operationType === 'analyze') {
    if (result.documentId) {
      invalidationKeys.push(['dev-v2-doc-runs', result.documentId]);
    }
    invalidationKeys.push(['dev-v2-convergence', result.documentId, result.versionId]);

    // Notes and decisions — flux after rewrite/analyze
    invalidationKeys.push(['project-notes', projectId]);
    invalidationKeys.push(['decisions', projectId]);
    invalidationKeys.push(['decision-events', projectId]);
  }

  if (result.operationType === 'convert' || result.operationType === 'beat-sheet-to-script') {
    // Also invalidate the auto-run jobs
    invalidationKeys.push(['all-auto-run-jobs']);
  }

  // Treatment-specific keys
  if (result.documentId) {
    invalidationKeys.push(['treatment-rewrite-acts', result.documentId]);
    invalidationKeys.push(['treatment-acts', result.documentId]);
    invalidationKeys.push(['treatment-acts-blueprint', result.documentId]);
    invalidationKeys.push(['wr-changesets', result.documentId]);
    invalidationKeys.push(['dev-engine-project', projectId]);
  }

  // ── Step 4: Invalidate then refetch ──
  // Invalidate all at once (triggers refetch in active queries)
  for (const key of invalidationKeys) {
    qc.invalidateQueries({ queryKey: key });
  }

  // ── Step 5: Authoritative refetch — wait for content to be available ──
  const refetchPromises: Promise<void>[] = [];

  // Refetch the key queries the viewer depends on
  if (result.versionId) {
    refetchPromises.push(
      qc.refetchQueries({ queryKey: ['sectioned-doc-viewer-chunks', result.versionId] })
        .then(() => {}),
    );
  }
  if (result.documentId) {
    refetchPromises.push(
      qc.refetchQueries({ queryKey: ['dev-v2-versions', result.documentId] })
        .then(() => {}),
    );
  }
  refetchPromises.push(
    qc.refetchQueries({ queryKey: ['dev-v2-docs', projectId] }).then(() => {}),
  );

  // Wait for ALL refetches to complete, then call onComplete + toast
  Promise.all(refetchPromises)
    .then(() => {
      onComplete?.();
      if (toastMessage !== null) {
        const msg = toastMessage ?? OPERATION_TOASTS[result.operationType] ?? FALLBACK_TOAST;
        toast.success(msg);
      }
    })
    .catch((err) => {
      console.error('[finalizeDevEngine] Refetch failed:', err);
      onComplete?.();
      // Fail-closed: show recoverable error
      toast.error('Operation completed, but the updated content could not be loaded. Tap to retry.', {
        action: {
          label: 'Retry',
          onClick: () => {
            // Re-trigger authoritative refetch
            for (const key of invalidationKeys) {
              qc.refetchQueries({ queryKey: key });
            }
          },
        },
        duration: 10_000,
      });
    });
}
