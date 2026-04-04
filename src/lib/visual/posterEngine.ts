/**
 * posterEngine — Selects top 1–3 commercially viable poster candidates
 * from the project's PREMIUM IMAGE POOL (canonical selector).
 *
 * MUST use getPremiumPosterPool — NO direct project_images queries.
 *
 * Selection criteria:
 *   - Emotional intensity
 *   - Composition strength (landscape, cinematic aspect)
 *   - Character clarity (identity-locked, anchored)
 *   - Market readability (not too abstract, not too literal)
 */

import { supabase } from '@/integrations/supabase/client';
import { getPremiumPosterPool, assertPremiumPoolNotEmpty } from '@/lib/images/premiumImagePool';
import type { ProjectImage } from '@/lib/images/types';

// ── Scoring ───────────────────────────────────────────────────────

export interface PosterScore {
  emotional_intensity: number;
  composition: number;
  character_clarity: number;
  market_readability: number;
  total: number;
}

function scorePosterCandidate(img: ProjectImage & { signedUrl?: string }): PosterScore {
  const gc = (img.generation_config || {}) as Record<string, unknown>;
  let emotional_intensity = 50;
  let composition = 50;
  let character_clarity = 50;
  let market_readability = 50;

  // Emotional intensity — hero frames with dramatic narrative functions score higher
  if (img.asset_group === 'hero_frame') emotional_intensity += 15;
  if (gc.narrative_function === 'climax_transformation') emotional_intensity += 15;
  if (gc.narrative_function === 'confrontation') emotional_intensity += 12;
  if (gc.narrative_function === 'protagonist_intro') emotional_intensity += 10;
  if (gc.narrative_function === 'inciting_disruption') emotional_intensity += 8;

  // Composition — landscape + cinematic aspect ratio
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  if (w > 0 && h > 0) {
    const aspect = w / h;
    if (aspect >= 1.6 && aspect <= 2.4) composition += 20; // cinematic
    else if (aspect >= 1.3) composition += 10; // acceptable landscape
  }
  if (w >= 1920) composition += 10; // high res bonus

  // Character clarity — identity locked + anchors injected
  if (gc.identity_locked) character_clarity += 15;
  if (gc.identity_mode === 'anchors_injected') character_clarity += 15;
  if (img.subject_type === 'character' && img.subject) character_clarity += 10;

  // Market readability — not too abstract
  if (img.shot_type === 'wide' || img.shot_type === 'tableau') market_readability += 10;
  if (img.shot_type === 'close_up' || img.shot_type === 'medium') market_readability += 15;
  if (img.is_primary) market_readability += 10;

  // Clamp
  emotional_intensity = Math.min(100, emotional_intensity);
  composition = Math.min(100, composition);
  character_clarity = Math.min(100, character_clarity);
  market_readability = Math.min(100, market_readability);

  const total = Math.round(
    emotional_intensity * 0.3 +
    composition * 0.25 +
    character_clarity * 0.25 +
    market_readability * 0.2,
  );

  return { emotional_intensity, composition, character_clarity, market_readability, total };
}

// ── Engine ─────────────────────────────────────────────────────────

export interface PosterCandidateResult {
  image: ProjectImage;
  score: PosterScore;
  rank: number;
}

/**
 * Select top poster candidates from governed premium pool.
 * Returns ranked list of up to `maxCandidates` images.
 */
export function selectPosterCandidates(
  images: ProjectImage[],
  maxCandidates: number = 3,
): PosterCandidateResult[] {
  // Images MUST already be from premium pool — no re-filtering needed
  const scored = images.map(img => ({
    image: img,
    score: scorePosterCandidate(img),
    rank: 0,
  }));

  scored.sort((a, b) => b.score.total - a.score.total);

  return scored.slice(0, maxCandidates).map((item, i) => ({
    ...item,
    rank: i + 1,
  }));
}

/**
 * Full poster selection pipeline: fetch premium pool → score → rank.
 * Fails closed if no premium images exist.
 */
export async function selectPosterCandidatesFromPool(
  projectId: string,
  maxCandidates: number = 3,
): Promise<PosterCandidateResult[]> {
  const pool = await getPremiumPosterPool(projectId);
  assertPremiumPoolNotEmpty(pool, 'poster selection');
  return selectPosterCandidates(pool.images, maxCandidates);
}

// ── Persistence ───────────────────────────────────────────────────

/**
 * Persist poster candidates to the database.
 * Replaces existing candidates for the project.
 */
export async function persistPosterCandidates(
  projectId: string,
  candidates: PosterCandidateResult[],
  selectedBy?: string,
): Promise<void> {
  await (supabase as any)
    .from('poster_candidates')
    .delete()
    .eq('project_id', projectId)
    .eq('status', 'candidate');

  if (candidates.length === 0) return;

  const rows = candidates.map(c => ({
    project_id: projectId,
    source_image_id: c.image.id,
    rank_position: c.rank,
    score_json: c.score,
    total_score: c.score.total,
    selection_mode: 'auto',
    selected_by: selectedBy || null,
    status: 'candidate',
  }));

  const { error } = await (supabase as any)
    .from('poster_candidates')
    .insert(rows);

  if (error) {
    console.error('[POSTER_ENGINE] Failed to persist candidates:', error);
    throw error;
  }
}
