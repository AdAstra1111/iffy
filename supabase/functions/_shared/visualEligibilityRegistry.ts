/**
 * Visual Eligibility Registry
 *
 * Canonical source of truth for visual pipeline eligibility checks.
 * Controls which stages, inputs, and doc types are eligible for
 * visual generation, auto-run, and proxy forwarding.
 *
 * INVARIANT: All eligibility checks fail closed — return false on
 * null/undefined/unknown input.
 */

// ── Visual pipeline stage progression ──────────────────────────────────────

/** Ordered visual pipeline stages from most fundamental to most derived. */
export const VISUAL_STAGE_ORDER = [
  'source_truth',
  'visual_canon',
  'cast',
  'hero_frames',
  'production_design',
  'visual_language',
  'poster',
  'lookbook',
] as const;

export type VisualStage = (typeof VISUAL_STAGE_ORDER)[number];

/** Prerequisites: a stage requires these earlier stages to be complete. */
export const VISUAL_STAGE_PREREQUISITES: Record<VisualStage, VisualStage[]> = {
  source_truth: [],
  visual_canon: ['source_truth'],
  cast: ['source_truth', 'visual_canon'],
  hero_frames: ['source_truth', 'visual_canon', 'cast'],
  production_design: ['source_truth', 'visual_canon', 'cast'],
  visual_language: ['source_truth', 'visual_canon', 'cast', 'hero_frames'],
  poster: ['source_truth', 'visual_canon', 'cast', 'hero_frames'],
  lookbook: ['source_truth', 'visual_canon', 'cast', 'hero_frames', 'production_design'],
};

// ── Proxy-eligible visual functions ────────────────────────────────────────

/** Edge function names that are eligible for visual proxy forwarding (P0). */
const PROXY_ELIGIBLE_FUNCTIONS = new Set([
  'generate-lookbook-image',
  'generate-hero-frames',
  'generate-poster',
]);

/** P1/P2 functions (deferred — not yet wired). */
const PROXY_DEFERRED_FUNCTIONS = new Set<string>([
  // Reserved for future visual auto-run functions
]);

// ── Eligibility helpers ─────────────────────────────────────────────────────

/**
 * Returns true if the given stage is eligible to run (all prerequisites met).
 * Fail-closed: unknown stages return false.
 */
export function isStageEligible(
  stage: string | null | undefined,
  completedStages: Set<string>,
): boolean {
  if (!stage) return false;
  const prereqs = VISUAL_STAGE_PREREQUISITES[stage as VisualStage];
  if (!prereqs) return false;
  return prereqs.every((p) => completedStages.has(p));
}

/**
 * Returns true if the given edge function name has a visual proxy handler.
 * Fail-closed: null/undefined/unknown returns false.
 */
export function isProxyEligibleFunction(
  functionName: string | null | undefined,
): boolean {
  if (!functionName) return false;
  return PROXY_ELIGIBLE_FUNCTIONS.has(functionName);
}

/**
 * Returns true if the given function is a deferred (P1/P2) visual handler
 * that has not been wired yet.
 */
export function isProxyDeferredFunction(
  functionName: string | null | undefined,
): boolean {
  if (!functionName) return false;
  return PROXY_DEFERRED_FUNCTIONS.has(functionName);
}

/**
 * Returns the ordered prerequisite stage names for a given stage.
 * Returns an empty array for unknown stages (fail-closed).
 */
export function getPrerequisitesForStage(
  stage: string | null | undefined,
): VisualStage[] {
  if (!stage) return [];
  return VISUAL_STAGE_PREREQUISITES[stage as VisualStage] || [];
}

/**
 * Validates a visual pipeline stage name. Returns true for known stages.
 */
export function isValidVisualStage(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return VISUAL_STAGE_ORDER.includes(stage as VisualStage);
}