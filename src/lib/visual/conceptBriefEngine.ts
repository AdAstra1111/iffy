/**
 * conceptBriefEngine — Curates the Executive Concept Brief.
 *
 * Selects exactly ≤8 images from the PREMIUM IMAGE POOL (canonical selector)
 * and classifies them into narrative sections for maximum investor impact.
 *
 * MUST use getPremiumBriefPool — NO direct project_images queries.
 *
 * Sections: Hook, World, Character, Dramatic Engine, Signature Moments, Tone
 */

import { supabase } from '@/integrations/supabase/client';
import { getPremiumBriefPool, assertPremiumPoolNotEmpty } from '@/lib/images/premiumImagePool';
import type { ProjectImage } from '@/lib/images/types';

// ── Types ──────────────────────────────────────────────────────────

export type BriefSection =
  | 'hook'
  | 'world'
  | 'character'
  | 'dramatic_engine'
  | 'signature_moments'
  | 'tone';

export const BRIEF_SECTION_LABELS: Record<BriefSection, string> = {
  hook: 'The Hook',
  world: 'The World',
  character: 'The Characters',
  dramatic_engine: 'The Dramatic Engine',
  signature_moments: 'Signature Moments',
  tone: 'Tone & Atmosphere',
};

export const BRIEF_SECTION_ORDER: BriefSection[] = [
  'hook', 'world', 'character', 'dramatic_engine', 'signature_moments', 'tone',
];

const MAX_BRIEF_IMAGES = 8;

export interface BriefImageSelection {
  image_id: string;
  section: BriefSection;
  rank_in_section: number;
  score: number;
  reason: string;
}

export interface ConceptBriefResult {
  selections: BriefImageSelection[];
  sections: Record<BriefSection, BriefImageSelection[]>;
  scoringSummary: {
    totalCandidates: number;
    qualityGatePassed: number;
    selected: number;
    sectionCoverage: number;
  };
}

// ── Section Classification ────────────────────────────────────────

function classifySection(img: ProjectImage): BriefSection {
  const gc = (img.generation_config || {}) as Record<string, unknown>;
  const nf = gc.narrative_function as string | undefined;

  if (img.subject_type === 'character') return 'character';

  if (nf === 'protagonist_intro' || nf === 'key_relationship' || nf === 'ensemble_dynamic') return 'character';
  if (nf === 'world_setup') return 'world';
  if (nf === 'atmosphere_mood') return 'tone';
  if (nf === 'inciting_disruption' || nf === 'climax_transformation') return 'hook';
  if (nf === 'confrontation' || nf === 'escalation_pressure' || nf === 'reversal_midpoint') return 'dramatic_engine';
  if (nf === 'collapse_loss' || nf === 'aftermath_iconic') return 'signature_moments';

  if (img.asset_group === 'world') return 'world';
  if (img.asset_group === 'character') return 'character';

  if (img.shot_type === 'atmospheric') return 'tone';
  if (img.shot_type === 'tableau') return 'signature_moments';

  return 'hook';
}

function scoreBriefCandidate(img: ProjectImage): number {
  const gc = (img.generation_config || {}) as Record<string, unknown>;
  let score = 50;

  // Images in premium pool already passed quality gate — bonus for pool admission
  score += 15;

  // Hero frame bonus
  if (img.asset_group === 'hero_frame') score += 15;

  // Primary bonus
  if (img.is_primary) score += 10;

  // Identity anchored
  if (gc.identity_locked) score += 5;
  if (gc.identity_mode === 'anchors_injected') score += 5;

  // Resolution bonus
  if ((img.width ?? 0) >= 1920) score += 5;

  return Math.round(Math.min(100, score));
}

// ── Engine ─────────────────────────────────────────────────────────

/**
 * Build an Executive Concept Brief from premium-eligible imagery.
 * Images MUST already be from the premium pool.
 * Selects ≤8 images classified into narrative sections.
 */
export function buildConceptBrief(images: ProjectImage[]): ConceptBriefResult {
  // Score and classify — images already premium-filtered
  const candidates = images.map(img => ({
    image: img,
    section: classifySection(img),
    score: scoreBriefCandidate(img),
  }));

  candidates.sort((a, b) => b.score - a.score);

  // Greedy selection: best-first, max 2 per section, max 8 total
  const selections: BriefImageSelection[] = [];
  const sectionCounts: Record<BriefSection, number> = {
    hook: 0, world: 0, character: 0,
    dramatic_engine: 0, signature_moments: 0, tone: 0,
  };

  for (const c of candidates) {
    if (selections.length >= MAX_BRIEF_IMAGES) break;
    if (sectionCounts[c.section] >= 2) continue;

    sectionCounts[c.section]++;
    selections.push({
      image_id: c.image.id,
      section: c.section,
      rank_in_section: sectionCounts[c.section],
      score: c.score,
      reason: `Quality: ${c.score}, Section: ${BRIEF_SECTION_LABELS[c.section]}`,
    });
  }

  const sections = {} as Record<BriefSection, BriefImageSelection[]>;
  for (const s of BRIEF_SECTION_ORDER) {
    sections[s] = selections.filter(sel => sel.section === s);
  }

  const sectionCoverage = BRIEF_SECTION_ORDER.filter(s => sections[s].length > 0).length;

  return {
    selections,
    sections,
    scoringSummary: {
      totalCandidates: images.length,
      qualityGatePassed: images.length, // all from premium pool
      selected: selections.length,
      sectionCoverage,
    },
  };
}

/**
 * Full concept brief pipeline: fetch premium pool → build brief.
 * Fails closed if no premium images exist.
 */
export async function buildConceptBriefFromPool(
  projectId: string,
): Promise<ConceptBriefResult> {
  const pool = await getPremiumBriefPool(projectId);
  assertPremiumPoolNotEmpty(pool, 'concept brief');
  return buildConceptBrief(pool.images);
}

// ── Persistence ───────────────────────────────────────────────────

/**
 * Persist a concept brief version to the database.
 */
export async function persistConceptBrief(
  projectId: string,
  brief: ConceptBriefResult,
  createdBy?: string,
): Promise<string> {
  const { data: existing } = await (supabase as any)
    .from('concept_brief_versions')
    .select('version_number')
    .eq('project_id', projectId)
    .order('version_number', { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version_number ?? 0) + 1;

  const { data, error } = await (supabase as any)
    .from('concept_brief_versions')
    .insert({
      project_id: projectId,
      version_number: nextVersion,
      status: 'draft',
      sections: brief.sections,
      image_selections: brief.selections,
      scoring_summary: brief.scoringSummary,
      created_by: createdBy || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[CONCEPT_BRIEF_ENGINE] Failed to persist:', error);
    throw error;
  }

  return data.id;
}
