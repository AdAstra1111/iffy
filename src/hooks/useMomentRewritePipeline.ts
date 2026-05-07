/**
 * useMomentRewritePipeline — Moment-by-moment rewrite pipeline for Story Outlines.
 *
 * Thin wrapper over useSceneRewritePipeline with targetDocType='story_outline'
 * so the backend selects the moment-by-moment code path instead of scene-by-scene.
 * Labels/progress use "Moment" terminology automatically.
 */

import { useSceneRewritePipeline } from './useSceneRewritePipeline';

export function useMomentRewritePipeline(projectId: string | undefined) {
  return useSceneRewritePipeline(projectId, 'story_outline');
}
