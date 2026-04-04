/**
 * useVisualCanonExtraction — Hook for extracting, persisting, and reading
 * visual canon primitives from project canon.
 *
 * Persists extraction results into project_canon.canon_json.visual_canon_primitives.
 * No new table required — uses existing canonical persistence.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { resolveWorldValidationMode } from '@/lib/visual/worldValidationMode';
import {
  extractVisualCanon,
  getMotifRelevantPrimitives,
  getPDRelevantPrimitives,
  type VisualCanonExtractionResult,
} from '@/lib/visual/visualCanonExtractor';

export function useVisualCanonExtraction(projectId: string | undefined) {
  const queryClient = useQueryClient();

  // Load canon JSON
  const canonQuery = useQuery({
    queryKey: ['project-canon', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await (supabase as any)
        .from('project_canon')
        .select('canon_json')
        .eq('project_id', projectId)
        .maybeSingle();
      if (error) throw error;
      return (data?.canon_json as Record<string, unknown>) || null;
    },
    enabled: !!projectId,
  });

  const canonJson = canonQuery.data;

  // Read persisted extraction
  const persisted: VisualCanonExtractionResult | null = useMemo(() => {
    if (!canonJson) return null;
    const raw = canonJson.visual_canon_primitives;
    if (raw && typeof raw === 'object' && 'extraction_version' in (raw as any)) {
      return raw as unknown as VisualCanonExtractionResult;
    }
    return null;
  }, [canonJson]);

  // Extract + persist mutation
  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !canonJson) throw new Error('No canon available');

      const result = extractVisualCanon(canonJson as any);

      // Co-persist visual canon primitives + world validation mode
      const wvm = resolveWorldValidationMode({
        genres: Array.isArray((canonJson as any)?.genres) ? (canonJson as any).genres : [],
        tone_style: typeof (canonJson as any)?.tone_style === 'string' ? (canonJson as any).tone_style : undefined,
        world_rules: typeof (canonJson as any)?.world_rules === 'string' ? (canonJson as any).world_rules : undefined,
        format: typeof (canonJson as any)?.format_constraints === 'string' ? (canonJson as any).format_constraints : undefined,
        logline: typeof (canonJson as any)?.logline === 'string' ? (canonJson as any).logline : undefined,
        premise: typeof (canonJson as any)?.premise === 'string' ? (canonJson as any).premise : undefined,
      });

      const updated = {
        ...canonJson,
        visual_canon_primitives: result,
        world_validation_mode: wvm,
      };

      const { error } = await (supabase as any)
        .from('project_canon')
        .update({ canon_json: updated })
        .eq('project_id', projectId);

      if (error) throw error;
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['project-canon', projectId] });
      const total = [
        result.material_systems,
        result.ritual_systems,
        result.communication_systems,
        result.power_systems,
        result.intimacy_systems,
        result.surface_condition_systems,
        result.recurrent_symbolic_objects,
        result.environment_behavior_pairings,
      ].reduce((sum, arr) => sum + arr.length, 0);
      toast.success(`Extracted ${total} visual canon primitives`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Visual canon extraction failed');
    },
  });

  // Coverage summary
  const coverage = useMemo(() => {
    if (!persisted) return null;
    return {
      material_systems: persisted.material_systems.length,
      ritual_systems: persisted.ritual_systems.length,
      communication_systems: persisted.communication_systems.length,
      power_systems: persisted.power_systems.length,
      intimacy_systems: persisted.intimacy_systems.length,
      surface_condition_systems: persisted.surface_condition_systems.length,
      recurrent_symbolic_objects: persisted.recurrent_symbolic_objects.length,
      environment_behavior_pairings: persisted.environment_behavior_pairings.length,
      total: [
        persisted.material_systems,
        persisted.ritual_systems,
        persisted.communication_systems,
        persisted.power_systems,
        persisted.intimacy_systems,
        persisted.surface_condition_systems,
        persisted.recurrent_symbolic_objects,
        persisted.environment_behavior_pairings,
      ].reduce((sum, arr) => sum + arr.length, 0),
      extracted_at: persisted.extracted_at,
      version: persisted.extraction_version,
    };
  }, [persisted]);

  return {
    /** Persisted extraction result */
    extraction: persisted,
    /** Coverage summary */
    coverage,
    /** Whether canon is loaded */
    loading: canonQuery.isLoading,
    /** Whether canon exists */
    hasCanon: !!canonJson,
    /** Run extraction and persist */
    extract: extractMutation.mutate,
    /** Extraction in progress */
    extracting: extractMutation.isPending,
    /** Motif-relevant primitives from persisted data */
    motifPrimitives: persisted ? getMotifRelevantPrimitives(persisted) : null,
    /** PD-relevant primitives from persisted data */
    pdPrimitives: persisted ? getPDRelevantPrimitives(persisted) : null,
  };
}
