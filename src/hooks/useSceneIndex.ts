/**
 * useSceneIndex — React hook for Scene Index read/write + readiness.
 * Provides ordered scene index data, extraction trigger, and readiness check.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSceneIndex, isSceneIndexReady } from '@/lib/scene-index/client';
import type { SceneIndex, SceneIndexReadiness } from '@/lib/scene-index/types';
import { toast } from 'sonner';

const SCENE_INDEX_KEY = 'scene-index';
const SCENE_INDEX_READY_KEY = 'scene-index-ready';

export function useSceneIndex(projectId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<SceneIndex[]>({
    queryKey: [SCENE_INDEX_KEY, projectId],
    queryFn: () => getSceneIndex(projectId!),
    enabled: !!projectId,
  });

  const readinessQuery = useQuery<SceneIndexReadiness>({
    queryKey: [SCENE_INDEX_READY_KEY, projectId],
    queryFn: () => isSceneIndexReady(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const extractMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-scene-index`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ project_id: projectId }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Extraction failed' }));
        throw new Error(err.error || err.message || 'Extraction failed');
      }

      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SCENE_INDEX_KEY, projectId] });
      queryClient.invalidateQueries({ queryKey: [SCENE_INDEX_READY_KEY, projectId] });
      toast.success('Scene index built successfully');
    },
    onError: (err: Error) => {
      toast.error(`Scene index build failed: ${err.message}`);
    },
  });

  return {
    scenes: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    /** Readiness assessment — used by downstream systems as a gate */
    readiness: readinessQuery.data || { ready: false, sceneCount: 0, missingCharacters: 0, unknownWardrobeCount: 0, reason: 'Loading…' },
    isReadinessLoading: readinessQuery.isLoading,
    /** Trigger Scene Index extraction from canonical scene_graph data */
    extractSceneIndex: extractMutation.mutateAsync,
    isExtracting: extractMutation.isPending,
  };
}
