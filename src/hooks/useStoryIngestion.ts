import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface IngestionManifest {
  scenes_parsed: number;
  scenes_written: number;
  characters: number;
  locations: number;
  props: number;
  costume_looks: number;
  state_transitions: number;
  participation_records: number;
  canon_locations_created: number;
  entity_visual_states_created: number;
  entities_total: number;
  cast_candidates?: number;
  props_seeded?: number;
  costume_looks_seeded?: number;
  review_required?: {
    entities: number;
    aliases: number;
    transitions: number;
    participation: number;
  };
  auto_resolved?: {
    participation: number;
  };
}

export interface ParseQuality {
  scenes_detected: number;
  slugline_count: number;
  dialogue_cue_count: number;
  parse_method: string;
  parse_quality: string;
  warnings: string[];
  text_length: number;
}

export interface SourceResolution {
  documents_considered: { id: string; doc_type: string }[];
  selected_document_id: string | null;
  selected_doc_type: string | null;
  selection_reason: string;
  version_id_used: string | null;
  text_length: number;
  fallback_used: boolean;
  inline_text_provided: boolean;
}

export interface RunDiff {
  prior_run_id: string;
  scenes_added: string[];
  scenes_removed: string[];
  scenes_unchanged: number;
  characters_added: string[];
  characters_removed: string[];
  locations_added: string[];
  locations_removed: string[];
  props_added: string[];
  props_removed: string[];
  costume_looks_added: string[];
  costume_looks_removed: string[];
  total_entities_added: number;
  total_entities_removed: number;
}

export interface IngestionRun {
  id: string;
  project_id: string;
  source_kind: string;
  status: string;
  manifest_json: IngestionManifest | null;
  stage_summary: any;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
  source_resolution_json?: SourceResolution | null;
  parse_quality_json?: ParseQuality | null;
  diff_json?: RunDiff | null;
}

export interface ReviewSummary {
  entities_needing_review: number;
  aliases_needing_review: number;
  transitions_pending: number;
  participation_pending: number;
  participation_auto_resolved: number;
  participation_total: number;
}

export interface ParticipationSummary {
  entity_id: string;
  entity_type: string;
  entity_name: string;
  total: number;
  auto_resolved: number;
  pending: number;
  pending_items: any[];
}

export interface ReviewData {
  entities: any[];
  state_transitions: any[];
  aliases: any[];
  participation_pending: any[];
  participation_summaries: ParticipationSummary[];
  review_summary: ReviewSummary;
}

/**
 * ─── NEL (Narrative Extraction Layer) Types ─────────────────────────────
 * NEL is the canonical extraction bridge. Story Ingestion is legacy adapter.
 */

export interface NelStageResult {
  status: 'complete' | 'failed' | 'skipped';
  [key: string]: any;
}

export interface NelRunResult {
  projectId: string;
  pipelineMode: string;
  stagesRun: string[];
  results: Record<string, NelStageResult>;
  errors: string[] | null;
  fatal: boolean;
  startedAt: string;
  completedAt: string;
}

/**
 * ─── HOOK ───────────────────────────────────────────────────────────────
 *
 * Exposes BOTH legacy (story-ingestion) and canonical (NEL) extraction paths.
 * NEL is the default canonical pipeline. Story Ingestion is a legacy adapter.
 */

export function useStoryIngestion(projectId: string | undefined) {
  const [isRunning, setIsRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<IngestionRun | null>(null);
  const [isNelRunning, setIsNelRunning] = useState(false);
  const [latestNelRun, setLatestNelRun] = useState<NelRunResult | null>(null);

  // ── LEGACY: Story Ingestion Engine (deprecated adapter) ───────────────
  const runIngestion = useCallback(async (opts?: { force?: boolean; sourceKind?: string }) => {
    if (!projectId) return null;
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('story-ingestion-engine', {
        body: {
          action: 'ingest',
          projectId,
          force: opts?.force ?? true,
          sourceKind: opts?.sourceKind ?? 'feature_script',
        },
      });

      if (error) {
        const actualMessage = (error as any)?.context?.data?.error
          || (error as any)?.context?.data
          || error.message
          || 'Unknown error';
        throw new Error(actualMessage);
      }
      if (data?.error) throw new Error(data.error);

      const manifest = data.manifest as IngestionManifest;
      const decisionCount = manifest.review_required
        ? (manifest.review_required.entities + manifest.review_required.aliases + manifest.review_required.transitions)
        : 0;
      const pendingParticipation = manifest.review_required?.participation || 0;
      const autoResolved = manifest.auto_resolved?.participation || 0;

      let msg = `[LEGACY] Ingestion complete: ${manifest.scenes_parsed} scenes, ${manifest.characters} characters, ${manifest.locations} locations`;
      if (decisionCount > 0) msg += ` · ${decisionCount} decisions need review`;
      if (autoResolved > 0) msg += ` · ${autoResolved} participation auto-resolved`;
      if (pendingParticipation > 0) msg += ` · ${pendingParticipation} participation need review`;

      toast.success(msg);

      setLatestRun({
        id: data.run_id,
        project_id: projectId,
        source_kind: opts?.sourceKind ?? 'feature_script',
        status: 'completed',
        manifest_json: manifest,
        stage_summary: manifest,
        failure_reason: null,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        source_resolution_json: data.source_resolution || null,
        parse_quality_json: data.parse_quality || null,
        diff_json: data.diff || null,
      });
      return data;
    } catch (err: any) {
      const errorContext: Record<string, any> = {
        message: err.message,
        name: err.name,
      };
      if (err.context) {
        errorContext.status = err.context.status;
        errorContext.responseBody = err.context.data;
      }
      errorContext.requestPayload = {
        action: 'ingest',
        projectId,
        force: opts?.force ?? true,
        sourceKind: opts?.sourceKind ?? 'feature_script',
      };
      console.error('[useStoryIngestion] LEGACY ingestion error:', JSON.stringify(errorContext, null, 2), err);
      toast.error(`[LEGACY] ${err.message || 'Ingestion failed'}`);
      return null;
    } finally {
      setIsRunning(false);
    }
  }, [projectId]);

  const fetchStatus = useCallback(async () => {
    if (!projectId) return [];
    try {
      const { data, error } = await supabase.functions.invoke('story-ingestion-engine', {
        body: { action: 'status', projectId },
      });
      if (error) throw error;
      const runs = (data?.runs || []) as IngestionRun[];
      if (runs.length > 0) setLatestRun(runs[0]);
      return runs;
    } catch (err: any) {
      console.error('[useStoryIngestion] Status error:', err);
      return [];
    }
  }, [projectId]);

  const fetchReview = useCallback(async (runId: string): Promise<ReviewData | null> => {
    if (!projectId) return null;
    try {
      const { data, error } = await supabase.functions.invoke('story-ingestion-engine', {
        body: { action: 'review', projectId, runId },
      });
      if (error) throw error;
      return data as ReviewData;
    } catch (err: any) {
      console.error('[useStoryIngestion] Review error:', err);
      return null;
    }
  }, [projectId]);

  const reviewAction = useCallback(async (
    target: 'entity' | 'alias' | 'transition' | 'participation',
    targetId: string,
    reviewVerb: 'approve' | 'reject' | 'escalate'
  ) => {
    if (!projectId) return null;
    try {
      const reviewBody: Record<string, unknown> = { projectId, target, targetId };
      reviewBody.action = 'review_action';
      reviewBody.reviewVerb = reviewVerb;
      const { data, error } = await supabase.functions.invoke('story-ingestion-engine', {
        body: reviewBody,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${target} ${reviewVerb}d`);
      return data;
    } catch (err: any) {
      console.error('[useStoryIngestion] Review action error:', err);
      toast.error(err.message || 'Review action failed');
      return null;
    }
  }, [projectId]);

  // ── CANONICAL: NEL Extraction Pipeline ───────────────────────────────
  /**
   * Run the canonical Narrative Extraction Layer (NEL) pipeline.
   * This is the single constitutional bridge between the Approved Narrative
   * Corpus and Visual Production OS. Story Ingestion is a legacy adapter.
   *
   * @param stages Optional subset of stages to run (default: all)
   * @param mode Pipeline mode: "full" (default), "extract_only", "dna_only"
   */
  const runNelExtraction = useCallback(async (
    stages?: string[],
    mode?: 'full' | 'extract_only' | 'dna_only'
  ): Promise<NelRunResult | null> => {
    if (!projectId) return null;
    setIsNelRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('nel-orchestrator', {
        body: {
          projectId,
          stages: stages ?? [
            'corpus', 'scenes', 'entities', 'atoms',
            'vehicle', 'creature', 'costume', 'relationships',
            'dna', 'pd_canon', 'governance',
          ],
          mode: mode ?? 'full',
        },
      });

      if (error) {
        const actualMessage = (error as any)?.context?.data?.error
          || (error as any)?.context?.data
          || error.message
          || 'Unknown error';
        throw new Error(actualMessage);
      }
      if (data?.error) throw new Error(data.error);

      const result = data as NelRunResult;
      setLatestNelRun(result);

      // Summarize results
      const stageSummary = result.stagesRun
        .map(s => `${s}:${result.results[s]?.status || 'unknown'}`)
        .join(', ');
      const errors = result.errors?.length || 0;

      let msg = `NEL extraction complete: ${result.stagesRun.length} stages [${stageSummary}]`;
      if (errors > 0) msg += ` · ${errors} error(s) — see console`;
      toast.success(msg);

      if (errors > 0) {
        console.warn('[useStoryIngestion] NEL errors:', result.errors);
      }

      return result;
    } catch (err: any) {
      const errorContext: Record<string, any> = {
        message: err.message,
        name: err.name,
      };
      if (err.context) {
        errorContext.status = err.context.status;
        errorContext.responseBody = err.context.data;
      }
      console.error('[useStoryIngestion] NEL error:', JSON.stringify(errorContext, null, 2), err);
      toast.error(`NEL extraction failed: ${err.message || 'Unknown error'}`);
      return null;
    } finally {
      setIsNelRunning(false);
    }
  }, [projectId]);

  return {
    // Legacy story-ingestion (deprecated adapter)
    isRunning,
    latestRun,
    runIngestion,
    fetchStatus,
    fetchReview,
    reviewAction,
    // Canonical NEL pipeline
    isNelRunning,
    latestNelRun,
    runNelExtraction,
  };
}
