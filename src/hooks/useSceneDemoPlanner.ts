/**
 * useSceneDemoPlanner — Hook for the Scene Demo Planning System.
 *
 * Fetches scene graph + locked dependencies, builds deterministic
 * scene demo plans for review. No image generation.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCharacterWardrobe } from './useCharacterWardrobe';
import { useCostumeOnActor } from './useCostumeOnActor';
import {
  buildSceneDemoPlan,
  summarizeSceneDemoPlans,
  type SceneDemoPlan,
  type SceneVersionInput,
  type CharacterBinding,
  type LockedLookSetRef,
  type LockedVisualSetRef,
} from '@/lib/visual/sceneDemoPlanner';

export function useSceneDemoPlanner(projectId: string | undefined) {
  const wardrobe = useCharacterWardrobe(projectId);
  const costumeOnActor = useCostumeOnActor(projectId);

  // Fetch latest scene versions with characters_present
  const scenesQuery = useQuery({
    queryKey: ['scene-demo-scenes', projectId],
    queryFn: async (): Promise<SceneVersionInput[]> => {
      if (!projectId) return [];

      // Get active scenes with their latest version
      const { data: scenes, error: scErr } = await (supabase as any)
        .from('scene_graph_scenes')
        .select('id, scene_key')
        .eq('project_id', projectId)
        .is('deprecated_at', null);
      if (scErr) throw scErr;
      if (!scenes?.length) return [];

      const sceneIds = scenes.map((s: any) => s.id);

      // Get latest version per scene (highest version_number)
      const { data: versions, error: vErr } = await (supabase as any)
        .from('scene_graph_versions')
        .select('scene_id, slugline, summary, content, characters_present, canon_location_id, location, time_of_day, purpose, version_number')
        .in('scene_id', sceneIds)
        .order('version_number', { ascending: false });
      if (vErr) throw vErr;

      // Deduplicate: keep only latest version per scene
      const latestMap = new Map<string, any>();
      for (const v of (versions || [])) {
        if (!latestMap.has(v.scene_id)) {
          latestMap.set(v.scene_id, v);
        }
      }

      return scenes
        .filter((s: any) => latestMap.has(s.id))
        .map((s: any) => {
          const v = latestMap.get(s.id);
          const chars = Array.isArray(v.characters_present)
            ? v.characters_present.filter((c: unknown) => typeof c === 'string')
            : [];
          return {
            scene_id: s.id,
            scene_key: s.scene_key,
            slugline: v.slugline || null,
            summary: v.summary || null,
            content: v.content || '',
            characters_present: chars,
            canon_location_id: v.canon_location_id || null,
            location: v.location || null,
            time_of_day: v.time_of_day || null,
            purpose: v.purpose || null,
          };
        });
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Fetch character bindings
  const bindingsQuery = useQuery({
    queryKey: ['scene-demo-bindings', projectId],
    queryFn: async (): Promise<CharacterBinding[]> => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('project_ai_cast')
        .select('character_key, ai_actor_id, ai_actor_version_id')
        .eq('project_id', projectId);
      if (error) throw error;
      return (data || [])
        .filter((b: any) => b.ai_actor_id && b.ai_actor_version_id)
        .map((b: any) => ({
          character_key: b.character_key,
          actor_id: b.ai_actor_id,
          actor_version_id: b.ai_actor_version_id,
        }));
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Fetch locked visual sets (locations, atmosphere, motifs)
  const lockedSetsQuery = useQuery({
    queryKey: ['scene-demo-locked-sets', projectId],
    queryFn: async (): Promise<LockedVisualSetRef[]> => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('visual_sets')
        .select('id, domain, target_name, target_id, status')
        .eq('project_id', projectId)
        .in('domain', [
          'production_design_location',
          'production_design_atmosphere',
          'production_design_motif',
        ]);
      if (error) throw error;
      return (data || []).map((s: any) => ({
        domain: s.domain,
        set_id: s.id,
        target_name: s.target_name || '',
        target_id: s.target_id || null,
        status: s.status,
      }));
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Build locked look set refs from costume-on-actor sets
  const lockedLooks: LockedLookSetRef[] = useMemo(() => {
    return (costumeOnActor.sets || []).map(s => ({
      character_key: s.characterKey,
      wardrobe_state_key: s.wardrobeStateKey,
      set_id: s.id,
      status: s.status,
    }));
  }, [costumeOnActor.sets]);

  // Build wardrobe state matrix
  const wardrobeStates = useMemo(() => {
    return wardrobe.extraction?.state_matrix || {};
  }, [wardrobe.extraction]);

  // Build plans
  const plans: SceneDemoPlan[] = useMemo(() => {
    const scenes = scenesQuery.data || [];
    const bindings = bindingsQuery.data || [];
    const lockedSets = lockedSetsQuery.data || [];

    return scenes.map(scene =>
      buildSceneDemoPlan(scene, bindings, lockedLooks, lockedSets, wardrobeStates)
    );
  }, [scenesQuery.data, bindingsQuery.data, lockedSetsQuery.data, lockedLooks, wardrobeStates]);

  const summary = useMemo(() => summarizeSceneDemoPlans(plans), [plans]);

  const isLoading = scenesQuery.isLoading || bindingsQuery.isLoading
    || lockedSetsQuery.isLoading || wardrobe.loading || costumeOnActor.isLoading;

  return {
    plans,
    summary,
    isLoading,
    hasScenes: (scenesQuery.data?.length || 0) > 0,
    hasWardrobe: !!wardrobe.extraction,
  };
}
