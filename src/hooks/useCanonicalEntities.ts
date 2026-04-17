import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CanonicalEntity {
  id: string;
  name: string;
  entityType: string;
  variantNames: string[];
  sceneCount: number;
}

interface UseCanonicalEntitiesOptions {
  projectId: string;
  entityType: 'character' | 'location' | 'prop' | 'wardrobe' | 'vehicle' | 'creature';
}

export function useCanonicalEntities({ projectId, entityType }: UseCanonicalEntitiesOptions) {
  // Fetch narrative_entities for this project + type
  const entitiesQuery = useQuery({
    queryKey: ['canonical-entities', projectId, entityType],
    queryFn: async (): Promise<CanonicalEntity[]> => {
      const { data, error } = await supabase
        .from('narrative_entities')
        .select('id, canonical_name, entity_type, scene_count, meta_json')
        .eq('project_id', projectId)
        .eq('entity_type', entityType);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const entities: CanonicalEntity[] = data.map((row: any) => ({
        id: row.id as string,
        name: row.canonical_name as string,
        entityType: row.entity_type as string,
        sceneCount: (row.scene_count as number) ?? 0,
        variantNames: (row.meta_json as any)?.variant_names ?? [],
      }));

      // Batch-fetch aliases for all entity IDs
      const entityIds = entities.map((e) => e.id);
      if (entityIds.length === 0) return entities;

      const { data: aliasRows, error: aliasError } = await supabase
        .from('narrative_entity_aliases')
        .select('canonical_entity_id, alias_name')
        .eq('project_id', projectId)
        .in('canonical_entity_id', entityIds);

      if (!aliasError && aliasRows) {
        const aliasMap: Record<string, string[]> = {};
        for (const row of aliasRows as any[]) {
          if (!aliasMap[row.canonical_entity_id]) {
            aliasMap[row.canonical_entity_id] = [];
          }
          aliasMap[row.canonical_entity_id].push(row.alias_name as string);
        }
        for (const entity of entities) {
          // Merge meta_json variant_names with DB aliases, dedupe
          const all = [...new Set([...entity.variantNames, ...(aliasMap[entity.id] ?? [])])];
          entity.variantNames = all;
        }
      }

      return entities;
    },
    enabled: !!projectId && !!entityType,
    staleTime: 30_000,
  });

  // Fetch reverse_engineer_context for regex orphan warning
  const regexContextQuery = useQuery({
    queryKey: ['reverse-engineer-context', projectId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('reverse_engineer_context')
        .select('regex_found_names')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error || !data) return [];
      const found = data.regex_found_names;
      if (Array.isArray(found)) return found;
      if (typeof found === 'string') {
        try { return JSON.parse(found); } catch { return []; }
      }
      return [];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  return {
    entities: entitiesQuery.data ?? [],
    isLoading: entitiesQuery.isLoading,
    regexOrphans: regexContextQuery.data ?? [],
    hasOrphans: (regexContextQuery.data?.length ?? 0) > 0,
  };
}
