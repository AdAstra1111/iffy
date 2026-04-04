/**
 * useWorldValidationMode — Shared canonical hook for reading the resolved
 * World Validation Mode for a project. Derives from canon and caches.
 * 
 * Single source of truth: derive once from canon, consume everywhere.
 * Write path is NOT here — persistence happens via canon enrichment
 * workflows (visual canon extraction) or explicit manual action only.
 */
import { useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProjectCanon } from './useProjectCanon';
import {
  resolveWorldValidationMode,
  getActiveConstraintsSummary,
  type WorldValidationMode,
} from '@/lib/visual/worldValidationMode';

export function useWorldValidationMode(projectId: string | undefined) {
  const { canon, isLoading } = useProjectCanon(projectId);
  const qc = useQueryClient();

  // Check for persisted mode
  const persisted = useMemo<WorldValidationMode | null>(() => {
    if (!canon) return null;
    const raw = (canon as Record<string, unknown>).world_validation_mode;
    if (
      raw &&
      typeof raw === 'object' &&
      (raw as Record<string, unknown>).mode &&
      (raw as Record<string, unknown>).version
    ) {
      return raw as WorldValidationMode;
    }
    return null;
  }, [canon]);

  // Derive from canon fields (read-only fallback, no writes)
  const derived = useMemo<WorldValidationMode>(() => {
    if (!canon) return resolveWorldValidationMode({});
    return resolveWorldValidationMode({
      genres: Array.isArray(canon?.genres) ? canon.genres as string[] : [],
      tone_style: typeof canon?.tone_style === 'string' ? canon.tone_style : undefined,
      world_rules: typeof canon?.world_rules === 'string' ? canon.world_rules : undefined,
      format: typeof canon?.format_constraints === 'string' ? canon.format_constraints : undefined,
      logline: typeof canon?.logline === 'string' ? canon.logline : undefined,
      premise: typeof canon?.premise === 'string' ? canon.premise : undefined,
    });
  }, [canon]);

  // Resolved mode: persisted first, then derived
  const mode = persisted ?? derived;
  const isPersisted = !!persisted;

  const constraintsSummary = useMemo(() => getActiveConstraintsSummary(mode), [mode]);

  // Manual persist mutation — explicit action only, never auto-triggered
  const persistMutation = useMutation({
    mutationFn: async (modeToWrite: WorldValidationMode) => {
      if (!projectId) throw new Error('No project');

      const { data, error: readErr } = await (supabase as any)
        .from('project_canon')
        .select('canon_json')
        .eq('project_id', projectId)
        .maybeSingle();
      if (readErr) throw readErr;

      const current = (data?.canon_json || {}) as Record<string, unknown>;
      const existing = current.world_validation_mode as WorldValidationMode | undefined;
      if (existing?.version === modeToWrite.version && existing?.mode === modeToWrite.mode) {
        return modeToWrite;
      }

      const updated = { ...current, world_validation_mode: modeToWrite };
      const { data: user } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('project_canon')
        .update({ canon_json: updated, updated_by: user?.user?.id })
        .eq('project_id', projectId);
      if (error) throw error;
      return modeToWrite;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-canon', projectId] });
    },
  });

  const persistMode = useCallback(() => {
    persistMutation.mutate(derived);
  }, [derived, persistMutation]);

  return {
    mode,
    modeName: mode.mode,
    rules: mode.rules,
    confidence: mode.confidence,
    rationale: mode.rationale,
    constraintsSummary,
    isLoading,
    isPersisted,
    persistMode,
    isPersisting: persistMutation.isPending,
  };
}
