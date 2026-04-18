/**
 * useCanonicalTemporalTruth — Single canonical hook for temporal/era truth.
 *
 * Persists resolved temporal truth into project_canon.canon_json.canonical_temporal_truth.
 * Fetches full document texts from relevant project documents to feed the resolver.
 * All downstream consumers must read temporal truth through this hook — no ad hoc resolution.
 */

import { useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mergeProjectCanonJson } from '@/lib/canon/projectCanonStorage';
import {
  resolveTemporalTruth,
  type TemporalTruth,
  type TemporalSourceInput,
} from '@/lib/visual/temporalTruthResolver';

// Doc types that carry temporal/era signal
const TEMPORAL_DOC_TYPES = [
  'treatment', 'story_outline', 'character_bible',
  'feature_script', 'episode_script', 'screenplay_draft',
  'production_draft', 'season_script',
  'world_bible', 'series_bible',
];

// Max chars per doc to avoid blowing up the resolver

export const CANONICAL_TEMPORAL_KEY = (pid: string) => ['canonical-temporal-truth', pid];

export interface CanonicalTemporalResult {
  truth: TemporalTruth;
  /** Whether this is from persisted canon or freshly computed */
  persisted: boolean;
  /** ISO timestamp of last extraction */
  extracted_at: string | null;
}

export function useCanonicalTemporalTruth(projectId: string | undefined) {
  const queryClient = useQueryClient();

  // 1. Load canon JSON (shared query key with useProjectCanon)
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
    staleTime: 10_000,
  });

  // 2. Load scene index for location keys
  const sceneQuery = useQuery({
    queryKey: ['scene-index-locations', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data } = await (supabase as any)
        .from('scene_graph_order')
        .select('scene_id, scene:scene_graph_scenes!inner(id, scene_key), version:scene_graph_versions!inner(location)')
        .eq('project_id', projectId)
        .eq('is_active', true);
      return (data || []).map((r: any) => r.version?.location).filter(Boolean) as string[];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // 3. Load canon locations era_relevance
  const locationQuery = useQuery({
    queryKey: ['canon-locations-eras', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data } = await (supabase as any)
        .from('canon_locations')
        .select('canonical_name, era_relevance')
        .eq('project_id', projectId)
        .eq('active', true);
      return (data || [])
        .filter((l: any) => l.era_relevance)
        .map((l: any) => ({ name: l.canonical_name, era: l.era_relevance }));
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // 4. Load document texts for temporal-relevant doc types
  const docTextsQuery = useQuery({
    queryKey: ['temporal-doc-texts', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      // Get docs of relevant types
      const { data: docs } = await supabase
        .from('project_documents')
        .select('id, doc_type, extracted_text, plaintext')
        .eq('project_id', projectId)
        .in('doc_type', TEMPORAL_DOC_TYPES);
      if (!docs || docs.length === 0) return [];

      const results: Array<{ source: string; text: string }> = [];
      for (const doc of docs) {
        const text = doc.plaintext || doc.extracted_text || '';
        if (text.length > 20) {
          results.push({ source: `document.${doc.doc_type}`, text });
        }
      }
      return results;
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const canonJson = canonQuery.data;

  // 5. Read persisted temporal truth from canon_json
  const persisted = useMemo((): CanonicalTemporalResult | null => {
    if (!canonJson) return null;
    const raw = canonJson.canonical_temporal_truth as any;
    if (raw && typeof raw === 'object' && raw.era) {
      return {
        truth: raw as TemporalTruth,
        persisted: true,
        extracted_at: raw._extracted_at || null,
      };
    }
    return null;
  }, [canonJson]);

  // 6. Build live (non-persisted) temporal truth for display when not yet extracted
  const liveTruth = useMemo((): TemporalTruth | null => {
    if (!canonJson) return null;
    const input: TemporalSourceInput = {
      logline: canonJson.logline as string | undefined,
      premise: canonJson.premise as string | undefined,
      setting: (canonJson as any).setting as string | undefined,
      timeline: canonJson.timeline as string | undefined,
      world_rules: canonJson.world_rules as string | undefined,
      tone_style: canonJson.tone_style as string | undefined,
      format_constraints: canonJson.format_constraints as string | undefined,
      locations: canonJson.locations as string | undefined,
      ongoing_threads: canonJson.ongoing_threads as string | undefined,
      document_texts: docTextsQuery.data || [],
      scene_locations: sceneQuery.data || [],
      location_eras: locationQuery.data || [],
    };
    return resolveTemporalTruth(input);
  }, [canonJson, docTextsQuery.data, sceneQuery.data, locationQuery.data]);

  // 7. The canonical result: persisted if available, else live
  const canonical: CanonicalTemporalResult = useMemo(() => {
    if (persisted) return persisted;
    if (liveTruth) return { truth: liveTruth, persisted: false, extracted_at: null };
    return {
      truth: resolveTemporalTruth({}),
      persisted: false,
      extracted_at: null,
    };
  }, [persisted, liveTruth]);

  // 8. Extract + persist mutation
  const extractMutation = useMutation({
    mutationFn: async (options?: { silent?: boolean }) => {
      if (!projectId || !canonJson) throw new Error('No canon available');

      const input: TemporalSourceInput = {
        logline: canonJson.logline as string | undefined,
        premise: canonJson.premise as string | undefined,
        setting: (canonJson as any).setting as string | undefined,
        timeline: canonJson.timeline as string | undefined,
        world_rules: canonJson.world_rules as string | undefined,
        tone_style: canonJson.tone_style as string | undefined,
        format_constraints: canonJson.format_constraints as string | undefined,
        locations: canonJson.locations as string | undefined,
        ongoing_threads: canonJson.ongoing_threads as string | undefined,
        document_texts: docTextsQuery.data || [],
        scene_locations: sceneQuery.data || [],
        location_eras: locationQuery.data || [],
      };

      const result = resolveTemporalTruth(input);
      const toStore = { ...result, _extracted_at: new Date().toISOString() };

      const committed = await mergeProjectCanonJson(
        projectId,
        (current) => ({ ...current, canonical_temporal_truth: toStore }),
        'useCanonicalTemporalTruth.extract',
      );

      const persisted = committed.canonJson.canonical_temporal_truth as any;
      if (!persisted || typeof persisted !== 'object' || !persisted.era) {
        throw new Error('Canonical temporal truth did not persist durably.');
      }

      console.log('[TemporalTruth] verified canonical persisted row', {
        projectId,
        updatedAt: committed.updatedAt,
        era: persisted.era,
        family: persisted.family,
        silent: options?.silent ?? false,
      });

      return result;
    },
    onSuccess: (result, options) => {
      queryClient.invalidateQueries({ queryKey: ['project-canon', projectId] });
      queryClient.invalidateQueries({ queryKey: CANONICAL_TEMPORAL_KEY(projectId!) });
      if (!options?.silent) {
        toast.success(`Temporal truth resolved: ${result.label} (${result.confidence})`);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Temporal truth extraction failed');
    },
  });

  const isLoading = canonQuery.isLoading || docTextsQuery.isLoading || sceneQuery.isLoading || locationQuery.isLoading;

  return {
    /** The canonical temporal truth result (persisted or live) */
    temporalTruth: canonical.truth,
    /** Whether the result is from persisted canonical storage */
    isPersisted: canonical.persisted,
    /** When the canonical result was last extracted */
    extractedAt: canonical.extracted_at,
    /** Whether data is still loading */
    isLoading,
    /** Whether canon exists */
    hasCanon: !!canonJson,
    /** Whether document texts are loaded */
    hasDocTexts: (docTextsQuery.data || []).length > 0,
    /** Number of document sources feeding temporal resolution */
    docSourceCount: (docTextsQuery.data || []).length,
    /** Run extraction and persist to canon */
    extract: (options?: { silent?: boolean }) => extractMutation.mutate(options),
    /** Run extraction and persist — returns promise */
    extractAsync: (options?: { silent?: boolean }) => extractMutation.mutateAsync(options),
    /** Whether extraction is in progress */
    extracting: extractMutation.isPending,
  };
}
