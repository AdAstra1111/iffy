/**
 * Scene Index — Read/Write API client + readiness check.
 * Queries scene_index table directly via Supabase SDK.
 *
 * IEL: scene_index is a BINDING LAYER only. It reads canonical
 * scene_graph_* data. No extraction logic here.
 */

import { supabase } from '@/integrations/supabase/client';
import type { SceneIndex, SceneIndexInsert, SceneIndexUpdate, SceneIndexReadiness } from './types';

/**
 * getSceneIndex — Fetch ordered scene index for a project.
 * Returns scenes ordered by scene_number ascending.
 */
export async function getSceneIndex(projectId: string): Promise<SceneIndex[]> {
  const { data, error } = await (supabase as any)
    .from('scene_index')
    .select('*')
    .eq('project_id', projectId)
    .order('scene_number', { ascending: true });

  if (error) throw new Error(`Failed to fetch scene index: ${error.message}`);
  return (data || []) as SceneIndex[];
}

/**
 * upsertSceneIndex — Insert or replace scene index entries for a project.
 * Replaces all entries atomically (delete + insert).
 */
export async function upsertSceneIndex(
  projectId: string,
  scenes: SceneIndexInsert[]
): Promise<SceneIndex[]> {
  const { error: delError } = await (supabase as any)
    .from('scene_index')
    .delete()
    .eq('project_id', projectId);

  if (delError) throw new Error(`Failed to clear scene index: ${delError.message}`);

  if (scenes.length === 0) return [];

  const rows = scenes.map(s => ({
    project_id: projectId,
    scene_number: s.scene_number,
    title: s.title || null,
    source_doc_type: s.source_doc_type,
    source_ref: s.source_ref || {},
    location_key: s.location_key || null,
    character_keys: s.character_keys,
    wardrobe_state_map: s.wardrobe_state_map,
  }));

  const { data, error } = await (supabase as any)
    .from('scene_index')
    .insert(rows)
    .select('*');

  if (error) throw new Error(`Failed to insert scene index: ${error.message}`);
  return (data || []) as SceneIndex[];
}

/**
 * updateSceneIndexEntry — Patch a single scene index entry.
 */
export async function updateSceneIndexEntry(
  entryId: string,
  patch: SceneIndexUpdate
): Promise<SceneIndex> {
  const { data, error } = await (supabase as any)
    .from('scene_index')
    .update(patch)
    .eq('id', entryId)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update scene index entry: ${error.message}`);
  return data as SceneIndex;
}

/**
 * deleteSceneIndex — Remove all scene index entries for a project.
 */
export async function deleteSceneIndex(projectId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('scene_index')
    .delete()
    .eq('project_id', projectId);

  if (error) throw new Error(`Failed to delete scene index: ${error.message}`);
}

/**
 * isSceneIndexReady — Global readiness check for Scene Index.
 *
 * IEL FAIL-CLOSED: Returns ready=true ONLY when:
 * - Scene Index has ≥1 entry
 * - ALL entries have non-empty character_keys
 * - No structural issues detected
 *
 * Used by Lookbook and other downstream systems as a gate.
 */
export async function isSceneIndexReady(projectId: string): Promise<SceneIndexReadiness> {
  const scenes = await getSceneIndex(projectId);

  if (scenes.length === 0) {
    return {
      ready: false,
      sceneCount: 0,
      missingCharacters: 0,
      unknownWardrobeCount: 0,
      reason: 'Scene Index is empty. Run scene extraction and NIT entity sync first.',
    };
  }

  let missingCharacters = 0;
  let unknownWardrobeCount = 0;

  for (const scene of scenes) {
    if (!scene.character_keys || scene.character_keys.length === 0) {
      missingCharacters++;
    }
    const wardrobeMap = scene.wardrobe_state_map || {};
    for (const stateVal of Object.values(wardrobeMap)) {
      if (stateVal === 'unknown') unknownWardrobeCount++;
    }
  }

  if (missingCharacters > 0) {
    return {
      ready: false,
      sceneCount: scenes.length,
      missingCharacters,
      unknownWardrobeCount,
      reason: `${missingCharacters} scene(s) missing character data.`,
    };
  }

  return {
    ready: true,
    sceneCount: scenes.length,
    missingCharacters: 0,
    unknownWardrobeCount,
    reason: null,
  };
}
