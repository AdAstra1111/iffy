/**
 * useCommitSectionPatch — Audited commit gate for VPB section patch persistence.
 *
 * Uses the CANONICAL createDocumentVersion helper (single write path).
 * Uses set_current_version RPC to atomically switch current.
 * Never overwrites existing versions.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { invalidateDevEngine } from '@/lib/invalidateDevEngine';
import { createDocumentVersion } from '@/lib/docVersions/createDocumentVersion';
import type { RewriteContract, PatchResult } from '@/lib/visual/vpbRefinementResolver';

export interface CommitSectionPatchParams {
  documentId: string;
  currentVersionId: string;
  projectId: string;
  patchResult: PatchResult;
  contract: RewriteContract;
}

export interface CommitProvenance {
  source_mode: 'vpb_section_refinement_commit';
  source_doc_type: 'visual_project_bible';
  section_key: string;
  section_heading: string;
  section_anchor: string;
  action: 'create' | 'refine';
  contract_summary: {
    scope_rule: string;
    forbidden_count: number;
    preservation_count: number;
    validation_count: number;
    prev_heading: string | null;
    next_heading: string | null;
  };
  validation_passed: true;
  patch_simulation_passed: true;
  previous_version_id: string;
  commit_timestamp: string;
  no_auto_generation: true;
}

/**
 * Validates provenance has all required fields. Throws if incomplete.
 */
function validateProvenance(p: CommitProvenance): void {
  if (!p.section_key) throw new Error('Provenance missing: section_key');
  if (!p.action) throw new Error('Provenance missing: action');
  if (!p.contract_summary) throw new Error('Provenance missing: contract_summary');
  if (!p.previous_version_id) throw new Error('Provenance missing: previous_version_id');
}

export function useCommitSectionPatch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentId,
      currentVersionId,
      projectId,
      patchResult,
      contract,
    }: CommitSectionPatchParams) => {
      // Gate: patch must have passed
      if (!patchResult.passed || !patchResult.patchedMarkdown) {
        throw new Error('Cannot commit: patch simulation did not pass');
      }

      // Gate: required IDs
      if (!documentId) throw new Error('Cannot commit: documentId is missing');
      if (!currentVersionId) throw new Error('Cannot commit: currentVersionId is missing');
      if (!projectId) throw new Error('Cannot commit: projectId is missing');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Build provenance metadata
      const provenance: CommitProvenance = {
        source_mode: 'vpb_section_refinement_commit',
        source_doc_type: 'visual_project_bible',
        section_key: contract.sectionKey,
        section_heading: contract.sectionHeading,
        section_anchor: contract.sectionAnchor,
        action: contract.action,
        contract_summary: {
          scope_rule: contract.scopeRule,
          forbidden_count: contract.forbiddenMutations.length,
          preservation_count: contract.requiredPreservation.length,
          validation_count: contract.validationRules.length,
          prev_heading: contract.prevHeading,
          next_heading: contract.nextHeading,
        },
        validation_passed: true,
        patch_simulation_passed: true,
        previous_version_id: currentVersionId,
        commit_timestamp: new Date().toISOString(),
        no_auto_generation: true,
      };

      // Validate provenance completeness (fail-closed)
      validateProvenance(provenance);

      // Create version via CANONICAL helper (no direct insert)
      const result = await createDocumentVersion({
        documentId,
        parentVersionId: currentVersionId,
        plaintext: patchResult.patchedMarkdown,
        label: `Section ${contract.action}: ${contract.sectionLabel}`,
        changeSummary: `VPB section ${contract.action} — ${contract.sectionHeading} (one-section-only)`,
        generatorId: 'vpb_section_refinement',
        createdBy: user.id,
        sourceMode: 'vpb_section_refinement_commit',
        metaJson: { refinement_provenance: provenance },
      });

      // Atomically switch current via canonical RPC
      const { error: rpcErr } = await supabase.rpc('set_current_version', {
        p_document_id: documentId,
        p_new_version_id: result.versionId,
      });
      if (rpcErr) throw new Error(`Failed to set current version: ${rpcErr.message}`);

      return { newVersionId: result.versionId, versionNumber: result.versionNumber };
    },
    onSuccess: (result, variables) => {
      invalidateDevEngine(qc, {
        projectId: variables.projectId,
        docId: variables.documentId,
        versionId: result.newVersionId,
        deep: false,
      });
      qc.invalidateQueries({ queryKey: ['document-versions', variables.documentId] });
      // Invalidate package-status so LATEST badge refreshes (bugfix: latest_version_id was stale)
      qc.invalidateQueries({ queryKey: ['package-status', variables.projectId] });
      toast.success(`Version v${result.versionNumber} committed — section patch applied`);
    },
    onError: (e: Error) => {
      toast.error(`Commit failed: ${e.message}`);
    },
  });
}
