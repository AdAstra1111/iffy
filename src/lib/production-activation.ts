/**
 * Production Activation Layer — orthogonal to ladder progression.
 *
 * Production readiness artifacts (e.g. visual_project_bible) are NOT ladder docs.
 * When they converge, the system should enable "activation" rather than "promotion".
 *
 * This module provides:
 *   1. Deterministic eligibility check (IEL-gated, no LLM)
 *   2. Persist/read production_flags in project_features
 */

import { supabase } from '@/integrations/supabase/client';
import { convergenceThresholds, type DevelopmentBehavior } from '@/lib/dev-os-config';

// ── Types ──

export interface ProductionFlags {
  visual_locked?: boolean;
}

export interface VisualActivationEligibility {
  eligible: boolean;
  reason: string;
}

// ── Doc types that are production activation artifacts (not ladder docs) ──

const PRODUCTION_ACTIVATION_DOC_TYPES = new Set(['visual_project_bible']);

export function isProductionActivationDoc(docType: string | undefined | null): boolean {
  return !!docType && PRODUCTION_ACTIVATION_DOC_TYPES.has(docType);
}

// ── Deterministic eligibility ──

export function canActivateVisualProduction({
  docType,
  ciScore,
  gpScore,
  blockers,
  behavior = 'market',
}: {
  docType: string;
  ciScore: number | null;
  gpScore: number | null;
  blockers: string[];
  behavior?: DevelopmentBehavior;
}): VisualActivationEligibility {
  if (docType !== 'visual_project_bible') {
    return { eligible: false, reason: 'Not a visual_project_bible document' };
  }
  if (ciScore == null || gpScore == null) {
    return { eligible: false, reason: 'No scores available' };
  }
  if (blockers.length > 0) {
    return { eligible: false, reason: `${blockers.length} blocker(s) remain` };
  }
  const t = convergenceThresholds[behavior];
  if (ciScore < t.minCI) {
    return { eligible: false, reason: `CI ${ciScore} below threshold ${t.minCI}` };
  }
  if (gpScore < t.minGP) {
    return { eligible: false, reason: `GP ${gpScore} below threshold ${t.minGP}` };
  }
  return { eligible: true, reason: 'Visual production ready for activation' };
}

// ── Read production flags from project_features ──

export function readProductionFlags(projectFeatures: Record<string, any> | null | undefined): ProductionFlags {
  if (!projectFeatures) return {};
  const flags = projectFeatures.production_flags;
  if (typeof flags === 'object' && flags !== null) return flags as ProductionFlags;
  return {};
}

// ── Persist visual_locked to project_features ──

export async function activateVisualProduction(projectId: string): Promise<void> {
  // Read current project_features
  const { data, error: readErr } = await supabase
    .from('projects')
    .select('project_features')
    .eq('id', projectId)
    .single();

  if (readErr) throw new Error(`Failed to read project: ${readErr.message}`);

  const current = (data?.project_features as Record<string, any>) || {};
  const updated = {
    ...current,
    production_flags: {
      ...(current.production_flags || {}),
      visual_locked: true,
    },
  };

  const { error: writeErr } = await supabase
    .from('projects')
    .update({ project_features: updated } as any)
    .eq('id', projectId);

  if (writeErr) throw new Error(`Failed to activate visual production: ${writeErr.message}`);
}
