/**
 * useActorLibrary — Query hook for the Actor Library (Roster) page.
 * Fetches actors with their approved versions and assets using approved_version_id only.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LibraryActor, LibraryActorVersion, LibraryActorAsset } from './actorLibraryTypes';

export function useActorLibrary() {
  return useQuery({
    queryKey: ['actor-library'],
    queryFn: async (): Promise<LibraryActor[]> => {
      // 1. Fetch all actors
      const { data: actors, error: actorsErr } = await supabase
        .from('ai_actors')
        .select('id, name, description, negative_prompt, tags, status, roster_ready, approved_version_id, promotion_status, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (actorsErr) throw actorsErr;
      if (!actors?.length) return [];

      // 2. Collect approved version IDs (only non-null)
      const approvedIds = actors
        .map(a => a.approved_version_id)
        .filter((id): id is string => id !== null);

      // 3. Fetch approved versions with assets in one query
      let versionMap = new Map<string, LibraryActorVersion>();
      if (approvedIds.length > 0) {
        const { data: versions, error: versErr } = await supabase
          .from('ai_actor_versions')
          .select('id, actor_id, version_number, recipe_json, is_approved, created_at, created_by, ai_actor_assets(id, actor_version_id, asset_type, public_url, storage_path, meta_json, created_at)')
          .in('id', approvedIds);

        if (versErr) throw versErr;
        for (const v of versions || []) {
          versionMap.set(v.id, {
            id: v.id,
            actor_id: v.actor_id,
            version_number: v.version_number,
            recipe_json: v.recipe_json as LibraryActorVersion['recipe_json'],
            is_approved: v.is_approved,
            created_at: v.created_at,
            created_by: v.created_by,
            ai_actor_assets: (v.ai_actor_assets || []) as LibraryActorAsset[],
          });
        }
      }

      // 4. Assemble results
      return actors.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        negative_prompt: a.negative_prompt,
        tags: a.tags || [],
        status: a.status,
        roster_ready: a.roster_ready,
        approved_version_id: a.approved_version_id,
        promotion_status: a.promotion_status,
        created_at: a.created_at,
        updated_at: a.updated_at,
        approvedVersion: a.approved_version_id ? (versionMap.get(a.approved_version_id) ?? null) : null,
      }));
    },
    staleTime: 30_000,
  });
}
