/**
 * Visual Language Domain Processor — CPIE Domain C7
 *
 * Consumes PCP context and produces Visual Language Canon (D7) inferences.
 * PROJECT-LEVEL inference — not entity-level. One VL profile per project.
 *
 * Architecture: PCP (genre/period/visual_tone) -> CPIE Registry -> VL Canon
 *
 * Ownership:
 *   VL Canon = how the world is PHOTOGRAPHED
 *   Location Canon = what light EXISTS in the world
 *   Production Design = what is physically ON SET
 *   PCP visual_context = what the project IS (context signals only)
 *
 * Deterministic fields: contrast_model, colour_philosophy, saturation_profile,
 *   palette_bias, lighting_philosophy, shadow_philosophy, lens_philosophy,
 *   depth_philosophy, focus_philosophy, realism_level, visual_scale
 * Hybrid fields: texture_philosophy, atmosphere_philosophy
 * LLM-only fields: camera_philosophy, framing_philosophy,
 *   movement_philosophy, composition_philosophy
 *
 * No LLM calls in registry. No independent inference in consumers.
 */

import type { CPIEPCPContext, CPIEInference } from './types';
import { resolveVL, anchorToInference } from './registry';


export interface VLInferenceOutput {
  project_id: string;
  inferences: CPIEInference[];
  inference_count: number;
  generated_at: string;
}

/**
 * Infer Visual Language for a project.
 * Single inference call — no entity iteration.
 */
export function inferVL(context: CPIEPCPContext): VLInferenceOutput {
  const matched = resolveVL(context);
  const now = new Date().toISOString();
  const deps = ['genre', 'period', 'visual_tone', 'style_influences', 'production_language'];
  const inferences: CPIEInference[] = [];

  for (const [field, anchor] of matched.entries()) {
    inferences.push(anchorToInference(anchor, 'project', deps, now));
  }

  return {
    project_id: context.project_id,
    inferences,
    inference_count: inferences.length,
    generated_at: now,
  };
}
