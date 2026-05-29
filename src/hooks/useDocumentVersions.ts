/**
 * useDocumentVersions — fetch versions for a document + switch current version.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDocumentRuntimeBinding } from '@/lib/versionBinding/useDocumentRuntimeBinding';

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  is_current: boolean;
  status: string;
  approval_status: string | null;
  change_summary: string | null;
  label: string | null;
  generator_id: string | null;
  created_at: string;
  meta_json?: Record<string, any> | null;
}

export function useDocumentVersions(documentId: string | undefined) {
  return useQuery({
    queryKey: ['document-versions', documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const { data, error } = await (supabase as any)
        .from('project_document_versions')
        .select('id, document_id, version_number, is_current, status, approval_status, change_summary, label, generator_id, created_at, meta_json')
        .eq('document_id', documentId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentVersion[];
    },
    enabled: !!documentId,
    // Poll every 20s when any version is bg_generating — stops once all are done
    refetchInterval: (query) => {
      const versions = query.state.data;
      if (!versions) return false;
      const anyGenerating = versions.some(v => v.meta_json?.bg_generating === true);
      return anyGenerating ? 20_000 : false;
    },
  });
}

/**
 * Mutation hook to set a version as current.
 * Accepts optional binding context (docType, versions) for invariant guard.
 * When binding context is provided, the guard blocks invalid set_current calls.
 */
export function useSetCurrentVersion(
  bindingContext?: {
    docType: string | null;
    versions: any[];
    selectedVersionId: string | null;
  },
) {
  const queryClient = useQueryClient();

  // ── Runtime binding guard ──
  const { assertEligible } = useDocumentRuntimeBinding(
    bindingContext?.docType ?? null,
    bindingContext?.versions ?? [],
    bindingContext?.selectedVersionId ?? null,
  );

  return useMutation({
    mutationFn: async ({ documentId, versionId }: { documentId: string; versionId: string }) => {
      // Invariant guard: block invalid set_current_version calls
      if (bindingContext) {
        const result = assertEligible('set_current', {
          sourceBinding: 'authoritative',
          targetVersionId: versionId,
        });
        if (!result.eligible) {
          throw new Error(
            `[binding-guard] set_current_version blocked: ${JSON.stringify(result.violations)}`,
          );
        }
      }

      const { data, error } = await (supabase as any).rpc('set_current_version', {
        p_document_id: documentId,
        p_new_version_id: versionId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['document-versions', variables.documentId] });
      queryClient.invalidateQueries({ queryKey: ['project-documents'] });
      toast.success('Version switched');
    },
    onError: (e: Error) => toast.error(`Failed to switch version: ${e.message}`),
  });
}
