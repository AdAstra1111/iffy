/**
 * Hero Frame Slot Plan — plans a 13-slot narrative story set.
 *
 * Each slot corresponds to a distinct narrative function.
 * The plan is computed once; execution fills slots sequentially.
 */

export type NarrativeFunction =
  | 'world_setup'
  | 'protagonist_intro'
  | 'inciting_disruption'
  | 'key_relationship'
  | 'escalation_pressure'
  | 'reversal_midpoint'
  | 'collapse_loss'
  | 'confrontation'
  | 'climax_transformation'
  | 'aftermath_iconic'
  | 'ensemble_dynamic'
  | 'atmosphere_mood'
  | 'unassigned';

export const NARRATIVE_FUNCTION_LABELS: Record<NarrativeFunction, string> = {
  world_setup: 'World Setup',
  protagonist_intro: 'Protagonist Intro',
  inciting_disruption: 'Inciting Disruption',
  key_relationship: 'Key Relationship',
  escalation_pressure: 'Escalation',
  reversal_midpoint: 'Reversal / Midpoint',
  collapse_loss: 'Collapse / Loss',
  confrontation: 'Confrontation',
  climax_transformation: 'Climax',
  aftermath_iconic: 'Aftermath',
  ensemble_dynamic: 'Ensemble',
  atmosphere_mood: 'Atmosphere',
  unassigned: 'Open Slot',
};

/**
 * The canonical 13-slot narrative plan.
 * 12 named story functions + 1 open slot for diversity.
 */
export const STORY_SET_PLAN: NarrativeFunction[] = [
  'world_setup',
  'protagonist_intro',
  'inciting_disruption',
  'key_relationship',
  'escalation_pressure',
  'reversal_midpoint',
  'collapse_loss',
  'confrontation',
  'climax_transformation',
  'aftermath_iconic',
  'ensemble_dynamic',
  'atmosphere_mood',
  'unassigned', // 13th slot — open for diversity
];

export const STORY_SET_SIZE = STORY_SET_PLAN.length; // 13

export interface HeroFrameSlotDiagnostics {
  slot_index?: number;
  narrative_function?: string;
  selected_scene?: string | null;
  selected_moment_summary?: string | null;
  dramatic_intensity?: number | null;
  hero_worthiness_score?: number;
  hero_worthiness_reasons?: string[];
  anchor_refs_injected_count?: number;
  anchor_injection_detail?: Array<{ name: string; count: number; source: string }>;
  canon_evidence_sources?: string[];
  characters_in_moment?: string[];
  location_matched?: string | null;
  unanchored_characters?: string[];
  generation_status?: string;
}

export interface HeroFrameSlot {
  index: number;
  narrativeFunction: NarrativeFunction;
  label: string;
  status: 'pending' | 'generating' | 'ready' | 'failed' | 'skipped' | 'deferred';
  imageId?: string;
  signedUrl?: string;
  error?: string;
  errorCode?: string;
  attempts?: number;
  narrativeFunctionLabel: string;
  generation_config?: Record<string, unknown>;
  prompt_used?: string;
  subject?: string;
  subject_type?: string;
  model?: string;
  provider?: string;
  width?: number;
  height?: number;
  diagnostics?: HeroFrameSlotDiagnostics;
}

/**
 * Build the initial 13-slot plan. All slots start as 'pending'.
 */
export function buildStorySetPlan(): HeroFrameSlot[] {
  return STORY_SET_PLAN.map((fn, index) => ({
    index,
    narrativeFunction: fn,
    label: `Slot ${index + 1}`,
    status: 'pending' as const,
    narrativeFunctionLabel: NARRATIVE_FUNCTION_LABELS[fn],
  }));
}
