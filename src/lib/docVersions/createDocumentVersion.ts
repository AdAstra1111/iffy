/**
 * createDocumentVersion — Canonical client-side caller for creating
 * a new project_document_versions row.
 *
 * ALL UI-layer version writes MUST go through this helper.
 * This is a PURE TRANSPORT layer — all logic lives server-side
 * in the create-document-version edge function → doc-os.createVersion().
 *
 * Client MUST NEVER:
 *  - compute version_number
 *  - insert into project_document_versions
 *  - set is_current
 */

import { supabase } from '@/integrations/supabase/client';

export type ClientSourceMode =
  | 'vpb_section_refinement_commit'
  | 'manual_edit'
  | 'script_derive'
  | 'seed_override';

export interface CreateDocumentVersionParams {
  documentId: string;
  parentVersionId: string | null;
  plaintext: string;
  label: string;
  changeSummary: string;
  generatorId: string;
  createdBy: string;
  sourceMode: ClientSourceMode;
  status?: string;
  metaJson?: Record<string, unknown>;
}

export interface CreateDocumentVersionResult {
  versionId: string;
  versionNumber: number;
}

/**
 * Creates a new document version by calling the server-side edge function.
 * All validation, version_number resolution, and persistence happen server-side.
 *
 * DOES NOT set is_current — the server handles promotion logic.
 * Caller must use set_current_version RPC separately if needed.
 */
export async function createDocumentVersion(
  params: CreateDocumentVersionParams,
): Promise<CreateDocumentVersionResult> {
  // Minimal client-side guards (fail-fast before network call)
  if (!params.documentId) throw new Error('createDocumentVersion: documentId is required');
  if (!params.plaintext || params.plaintext.trim().length === 0) {
    throw new Error('createDocumentVersion: plaintext must be non-empty');
  }
  if (!params.label) throw new Error('createDocumentVersion: label is required');
  if (!params.generatorId) throw new Error('createDocumentVersion: generatorId is required');
  if (!params.sourceMode) throw new Error('createDocumentVersion: sourceMode is required');

  const { data, error } = await supabase.functions.invoke('create-document-version', {
    body: {
      documentId: params.documentId,
      parentVersionId: params.parentVersionId,
      plaintext: params.plaintext,
      label: params.label,
      changeSummary: params.changeSummary,
      generatorId: params.generatorId,
      sourceMode: params.sourceMode,
      status: params.status || 'draft',
      metaJson: params.metaJson || {},
    },
  });

  if (error) {
    throw new Error(`createDocumentVersion: edge function error: ${error.message}`);
  }

  if (!data || !data.versionId) {
    const serverError = data?.error || 'Unknown server error';
    throw new Error(`createDocumentVersion: server rejected: ${serverError}`);
  }

  return { versionId: data.versionId, versionNumber: data.versionNumber };
}
