/**
 * useLocationVisualDatasets — Canonical hook for Location Visual Datasets.
 *
 * Regeneration is done through server-side edge function.
 * Client hook handles: queries, retrieval, edits, invalidation.
 *
 * Uses centralized slot mapping and retrieval resolver.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { resolveDatasetForSlot, findParentDataset, formatResolutionLog, type DatasetResolutionResult } from '@/lib/visual/datasetRetrievalResolver';
import { computeCanonHashFromSources, evaluateFreshness } from '@/lib/visual/datasetCanonHash';
import type { CanonLocation } from './useCanonLocations';

// ── DB Row Type ──────────────────────────────────────────────────────────────

export interface LocationVisualDataset {
  id: string;
  project_id: string;
  canon_location_id: string | null;
  location_name: string;
  dataset_version: number;
  source_mode: string;
  provenance: Record<string, string>;
  completeness_score: number;
  is_current: boolean;
  parent_location_id: string | null;
  location_class: string;
  inherits_from_parent: boolean;
  non_inheritable_traits: string[];
  structural_substrate: any;
  surface_condition: any;
  atmosphere_behavior: any;
  spatial_character: any;
  status_signal: any;
  contextual_dressing: any;
  occupation_trace: any;
  symbolic_motif: any;
  slot_establishing: any;
  slot_atmosphere: any;
  slot_architectural_detail: any;
  slot_time_variant: any;
  slot_surface_language: any;
  slot_motif: any;
  status_expression_mode: string;
  status_expression_notes: string | null;
  // Socio-economic hierarchy fields
  status_tier: string;
  material_privilege: { allowed: string[]; restricted: string[]; signature: string[] };
  craft_level: string;
  density_profile: { clutter: string; object_density: string; negative_space: string };
  spatial_intent: { purpose: string; symmetry: string; flow: string };
  material_hierarchy: { primary: string[]; secondary: string[]; forbidden: string[] };
  freshness_status: string;
  stale_reason: string | null;
  source_canon_hash: string | null;
  created_at: string;
  updated_at: string;
}

// ── Slot retrieval helper (kept for backward compat + retrieval resolver) ────

export type SlotKey = 'establishing' | 'atmosphere' | 'architectural_detail' | 'time_variant' | 'surface_language' | 'motif';

/**
 * Retrieve slot-ready truth for a specific slot type from a dataset.
 */
export function getSlotTruth(dataset: LocationVisualDataset, slotKey: SlotKey) {
  const fieldMap: Record<SlotKey, string> = {
    establishing: 'slot_establishing',
    atmosphere: 'slot_atmosphere',
    architectural_detail: 'slot_architectural_detail',
    time_variant: 'slot_time_variant',
    surface_language: 'slot_surface_language',
    motif: 'slot_motif',
  };
  const field = fieldMap[slotKey];
  const slotData = (dataset as any)[field] || {
    primary_truths: [],
    secondary_truths: [],
    contextual: [],
    forbidden_dominance: [],
    hard_negatives: [],
    notes: '',
  };
  return slotData;
}

/**
 * Build a structured prompt fragment from slot truth.
 */
export function buildPromptFromSlotTruth(
  dataset: LocationVisualDataset,
  slotKey: SlotKey,
): { primaryBlock: string; secondaryBlock: string; contextualBlock: string; forbiddenBlock: string; negatives: string[] } {
  const truth = getSlotTruth(dataset, slotKey);
  return {
    primaryBlock: truth.primary_truths?.length > 0
      ? `PRIMARY VISUAL TRUTH: ${truth.primary_truths.join('; ')}`
      : '',
    secondaryBlock: truth.secondary_truths?.length > 0
      ? `SECONDARY ELEMENTS: ${truth.secondary_truths.join('; ')}`
      : '',
    contextualBlock: truth.contextual?.length > 0
      ? `CONTEXTUAL (traces only): ${truth.contextual.join('; ')}`
      : '',
    forbiddenBlock: truth.forbidden_dominance?.length > 0
      ? `FORBIDDEN AS DOMINANT: ${truth.forbidden_dominance.join('; ')}`
      : '',
    negatives: truth.hard_negatives || [],
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLocationVisualDatasets(projectId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ['location-visual-datasets', projectId];

  const datasetsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('location_visual_datasets')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .order('location_name');
      if (error) throw error;
      return (data || []) as LocationVisualDataset[];
    },
    enabled: !!projectId,
  });

  /** Get dataset for a specific canon location */
  const getDatasetForLocation = (canonLocationId: string): LocationVisualDataset | undefined => {
    return datasetsQuery.data?.find(d => d.canon_location_id === canonLocationId);
  };

  /** Get dataset by location name (fallback when no canon_location_id) */
  const getDatasetByName = (locationName: string): LocationVisualDataset | undefined => {
    const norm = locationName.toLowerCase().trim();
    return datasetsQuery.data?.find(d => d.location_name.toLowerCase().trim() === norm);
  };

  /**
   * Canonical dataset resolution for a PD slot.
   * Uses centralized retrieval resolver with explicit provenance.
   */
  const resolveForSlot = (
    pdSlotKey: string,
    canonLocationId: string | null,
    currentCanonHash: string | null,
  ): DatasetResolutionResult => {
    const allDatasets = datasetsQuery.data || [];
    const dataset = canonLocationId
      ? allDatasets.find(d => d.canon_location_id === canonLocationId && d.is_current)
      : null;
    const parentDataset = dataset ? findParentDataset(dataset, allDatasets) : null;

    return resolveDatasetForSlot({
      pdSlotKey,
      canonLocationId,
      datasets: allDatasets,
      currentCanonHash,
      parentDataset,
    });
  };

  /**
   * Evaluate freshness for a specific location against current canon sources.
   */
  const evaluateLocationFreshness = (
    canonLocationId: string,
    location: CanonLocation,
    canonJson: Record<string, unknown> | null,
    styleProfile: { period?: string; lighting_philosophy?: string; texture_materiality?: string; color_response?: string } | null,
    materialPalette: string[],
  ) => {
    const dataset = getDatasetForLocation(canonLocationId);
    if (!dataset) return { status: 'unknown' as const, reason: 'No dataset exists' };
    const currentHash = computeCanonHashFromSources(location, canonJson, styleProfile, materialPalette);
    return evaluateFreshness(dataset.source_canon_hash, currentHash);
  };

  /** Regenerate datasets through canonical server-side service */
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('No project');
      const { data, error } = await supabase.functions.invoke('regenerate-location-datasets', {
        body: { project_id: projectId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      const summary = data?.summary;
      const count = summary?.total || data?.datasets?.length || 0;
      const failedCount = summary?.failed_count || 0;
      if (failedCount > 0) {
        toast.warning(`Built ${count} dataset(s), ${failedCount} location(s) had issues`);
      } else {
        toast.success(`Built ${count} location visual dataset(s)`);
      }
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(`Dataset build failed: ${e.message}`),
  });

  /** Update a specific dataset field (user editing) */
  const updateDatasetMutation = useMutation({
    mutationFn: async (params: { id: string; updates: Partial<LocationVisualDataset> }) => {
      const { error } = await (supabase as any)
        .from('location_visual_datasets')
        .update({ ...params.updates, source_mode: 'edited' })
        .eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  // ── Dataset coverage summary ──
  const coverageSummary = (() => {
    const datasets = datasetsQuery.data || [];
    const fresh = datasets.filter(d => d.freshness_status === 'fresh').length;
    const stale = datasets.filter(d => d.freshness_status === 'stale').length;
    const unknown = datasets.filter(d => !d.freshness_status || d.freshness_status === 'rebuilding').length;
    return {
      total: datasets.length,
      fresh,
      stale,
      unknown,
      lastRegeneration: datasets.length > 0
        ? datasets.reduce((latest, d) => d.created_at > latest ? d.created_at : latest, datasets[0].created_at)
        : null,
    };
  })();

  return {
    datasets: datasetsQuery.data || [],
    isLoading: datasetsQuery.isLoading,
    getDatasetForLocation,
    getDatasetByName,
    resolveForSlot,
    evaluateLocationFreshness,
    regenerate: regenerateMutation,
    updateDataset: updateDatasetMutation,
    coverageSummary,
    refetch: () => qc.invalidateQueries({ queryKey }),
  };
}
