import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useDeleteVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ versionId, documentId }: { versionId: string; documentId: string }) => {
      const { error } = await supabase.functions.invoke('delete-version', {
        body: { version_id: versionId },
      });
      if (error) throw new Error(error.message || error);
      return { versionId, documentId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['document-versions', variables.documentId] });
      queryClient.invalidateQueries({ queryKey: ['project-documents'] });
      queryClient.invalidateQueries({ queryKey: ['package-status'] });
      toast.success('Version deleted');
    },
    onError: (e: Error) => toast.error(`Failed to delete version: ${e.message}`),
  });
}
