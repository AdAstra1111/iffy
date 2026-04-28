/**
 * useScriptDropProject
 *
 * Orchestrates the screenplay-import pipeline initiated from the Script Drop
 * Zone on /projects/new. Writes persistent stage-level observability records
 * to screenplay_intake_runs + screenplay_intake_stage_runs throughout execution.
 *
 * Pipeline (canonical stage order):
 *   0. upload          — file → scripts storage bucket
 *   1. ingest          — script-intake:ingest_pdf → extracts text + title guess
 *   2. project_create  — creates projects row + project_scripts record
 *   3. scene_extract   — dev-engine-v2:scene_graph_extract → scene_graph_scenes
 *   4. entity_extract — entity-links-engine → extracts characters/locations from scene content
 *   5. nit_dialogue    — nit-sync:sync_dialogue_characters → dialogue links + write-back
 *   6. role_classify   — dev-engine-v2:scene_graph_classify_roles_heuristic
 *   7. spine_sync      — dev-engine-v2:scene_graph_sync_spine_links
 *   8. binding_derive  — dev-engine-v2:scene_derive_blueprint_bindings
 *
 * Note: NIT name scan (syncSceneEntityLinksForProject) is run INSIDE
 * scene_graph_extract automatically; it is not a separate stage here.
 *
 * Observability:
 *   - screenplay_intake_runs: one row per import event, top-level status
 *   - screenplay_intake_stage_runs: one row per stage per run (UPDATE on retry)
 *   - Stage state is never trusted from in-memory; DB is authoritative
 *
 * Retry semantics: see STAGE_DEFINITIONS.retryable
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DropStageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface DropStage {
  key:       string;
  label:     string;
  status:    DropStageStatus;
  detail?:   string;
  retryable: boolean;
}

// ── Stage Definitions ─────────────────────────────────────────────────────────
//
// Canonical stage list. This is the single source of truth for:
//   - stage_key values written to screenplay_intake_stage_runs
//   - stage_order (index in this array)
//   - retry semantics
//
// retryable=false means the stage cannot be meaningfully retried independently:
//   - upload: file is already in storage; re-uploading would create a duplicate
//   - project_create: project either exists or doesn't; non-repeatable
//
// All enrichment stages (scene_extract onward) are idempotent and retryable.

interface StageDef {
  key:           string;
  label:         string;
  functionName:  string;
  actionName?:   string;
  retryable:     boolean;
}

export const STAGE_DEFINITIONS: StageDef[] = [
  { key: 'upload',         label: 'Uploading script…',                    functionName: 'storage:scripts',    retryable: false },
  { key: 'ingest',         label: 'Extracting text & detecting title…',   functionName: 'script-intake',      actionName: 'ingest_pdf',                          retryable: true  },
  { key: 'project_create', label: 'Creating project…',                    functionName: 'supabase:projects',  retryable: false },
  { key: 'scene_extract',  label: 'Extracting scene graph…',              functionName: 'dev-engine-v2',      actionName: 'scene_graph_extract',                 retryable: true  },
  { key: 'entity_extract', label: 'Extracting entities & links…',         functionName: 'entity-links-engine',                                          retryable: true  },
  { key: 'nit_dialogue',   label: 'Linking characters (dialogue)…',       functionName: 'nit-sync',           actionName: 'sync_dialogue_characters',            retryable: true  },
  { key: 'role_classify',  label: 'Classifying scene roles…',             functionName: 'dev-engine-v2',      actionName: 'scene_graph_classify_roles_heuristic',retryable: true  },
  { key: 'spine_sync',     label: 'Syncing spine links…',                 functionName: 'dev-engine-v2',      actionName: 'scene_graph_sync_spine_links',        retryable: true  },
  { key: 'binding_derive', label: 'Deriving blueprint bindings…',         functionName: 'dev-engine-v2',      actionName: 'scene_derive_blueprint_bindings',     retryable: true  },
  { key: 'scene_index',   label: 'Building scene index…',                functionName: 'extract-scene-index',                                                   retryable: true  },
];

const INITIAL_STAGES: DropStage[] = STAGE_DEFINITIONS.map(s => ({
  key: s.key, label: s.label, status: 'pending', retryable: s.retryable,
}));

/** Detect if plaintext is a screenplay (has INT./EXT. scene headings). */
function isScreenplayText(text: string): { isScreenplay: boolean; sceneCount: number } {
  const sluglinePattern = /^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.?|INTERIOR|EXTERIOR)[\s\-\.\/]( |\t)/gmi;
  const matches = [...text.matchAll(sluglinePattern)];
  return { isScreenplay: matches.length >= 3, sceneCount: matches.length };
}

const FUNC_BASE = `/api/supabase-proxy/functions/v1`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callFunction(
  name: string,
  body: Record<string, unknown>,
  token: string,
): Promise<any> {
  // nit-sync uses service role key internally (verify_jwt: false).
  // Route through server-side proxy to avoid gateway JWT validation failures
  // when user token expires during long-running pipelines.
  const url = name === 'nit-sync' ? '/api/nit-sync-proxy' : `${FUNC_BASE}/${name}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (name !== 'nit-sync') headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error || `${name} failed: HTTP ${resp.status}`);
  if (json?.error) throw new Error(json.error);
  return json;
}

/** Create the top-level run record. Returns run id. */
async function createIntakeRun(
  userId: string,
  projectId: string,
  metadata: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('screenplay_intake_runs')
    .insert({ user_id: userId, project_id: projectId, status: 'running', metadata })
    .select('id')
    .single();
  if (error) throw new Error(`intake_run create: ${error.message}`);
  return data.id;
}

/** Pre-populate all stage rows for a run. */
async function seedStageRuns(runId: string): Promise<void> {
  const rows = STAGE_DEFINITIONS.map((s, i) => ({
    run_id:        runId,
    stage_key:     s.key,
    stage_order:   i,
    status:        'pending',
    function_name: s.functionName,
    action_name:   s.actionName ?? null,
    retryable:     s.retryable,
  }));
  const { error } = await (supabase as any)
    .from('screenplay_intake_stage_runs')
    .insert(rows);
  if (error) throw new Error(`stage_runs seed: ${error.message}`);
}

/** Update a stage row. */
async function updateStageRun(
  runId: string,
  stageKey: string,
  patch: {
    status: DropStageStatus;
    started_at?: string;
    completed_at?: string;
    error?: string;
    output_summary?: Record<string, unknown>;
  },
): Promise<void> {
  await (supabase as any)
    .from('screenplay_intake_stage_runs')
    .update(patch)
    .eq('run_id', runId)
    .eq('stage_key', stageKey);
}

/** Finalise the top-level run record. */
async function finaliseIntakeRun(
  runId: string,
  stages: DropStage[],
  extraPatch?: Partial<{ source_doc_id: string; script_version_id: string; error: string }>,
): Promise<void> {
  const anyFailed = stages.some(s => s.status === 'failed');
  const allDone   = stages.every(s => s.status === 'done' || s.status === 'skipped');
  const status    = allDone ? 'done' : anyFailed ? 'partial' : 'done';
  await (supabase as any)
    .from('screenplay_intake_runs')
    .update({ status, completed_at: new Date().toISOString(), ...extraPatch })
    .eq('id', runId);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useScriptDropProject() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [stages,    setStages]    = useState<DropStage[]>(INITIAL_STAGES);
  const [isRunning, setIsRunning] = useState(false);
  const [runId,     setRunId]     = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  const setStage = useCallback((key: string, status: DropStageStatus, detail?: string) => {
    setStages(prev => prev.map(s => s.key === key ? { ...s, status, detail } : s));
  }, []);

  const run = useCallback(async (file: File) => {
    if (!user)     { toast.error('Sign in required'); return; }
    if (isRunning) return;

    setIsRunning(true);
    setStages(INITIAL_STAGES.map(s => ({ ...s, status: 'pending' })));
    setRunId(null);
    setProjectId(null);

    let currentRunId: string | null = null;
    let currentStages = INITIAL_STAGES.map(s => ({ ...s }));

    const mutStage = (key: string, status: DropStageStatus, detail?: string) => {
      currentStages = currentStages.map(s => s.key === key ? { ...s, status, detail } : s);
      setStages([...currentStages]);
    };

    const markRunning = async (key: string) => {
      mutStage(key, 'running');
      if (currentRunId) {
        await updateStageRun(currentRunId, key, {
          status: 'running',
          started_at: new Date().toISOString(),
        }).catch(() => {}); // observability write failure is non-fatal
      }
    };

    const markDone = async (key: string, summary?: Record<string, unknown>) => {
      mutStage(key, 'done');
      if (currentRunId) {
        await updateStageRun(currentRunId, key, {
          status: 'done',
          completed_at: new Date().toISOString(),
          output_summary: summary,
        }).catch(() => {});
      }
    };

    const markFailed = async (key: string, err: Error) => {
      mutStage(key, 'failed', err.message);
      if (currentRunId) {
        await updateStageRun(currentRunId, key, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: err.message.slice(0, 500),
        }).catch(() => {});
      }
    };

    const markSkipped = async (key: string, reason: string) => {
      mutStage(key, 'skipped', reason);
      if (currentRunId) {
        await updateStageRun(currentRunId, key, {
          status: 'skipped',
          completed_at: new Date().toISOString(),
          error: reason,
        }).catch(() => {});
      }
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';

      // ── Stage 0: Upload ────────────────────────────────────────────────────
      await markRunning('upload');
      const ts       = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${user.id}/${ts}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from('scripts')
        .upload(storagePath, file, { upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      await markDone('upload', { storage_path: storagePath });

      // ── Stage 1: Create project (placeholder title from filename) ──────────
      // Project must be created before ingest_pdf so we have an FK for docs.
      await markRunning('project_create');
      const placeholderTitle = file.name
        .replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';

      const { data: proj, error: ppErr } = await supabase
        .from('projects')
        .insert({
          user_id:          user.id,
          title:            placeholderTitle,
          format:           'film',
          genres:           [],
          budget_range:     '',
          target_audience:  '',
          tone:             '',
          comparable_titles:'',
        })
        .select('id')
        .single();
      if (ppErr) throw new Error(`Project create: ${ppErr.message}`);
      const pid = proj.id;
      setProjectId(pid);

      // Now we have a project_id — create the intake run
      currentRunId = await createIntakeRun(user.id, pid, {
        source:          'drop',
        original_filename: file.name,
        storage_path:    storagePath,
      }).catch(() => null); // intake run create failure is non-fatal
      if (currentRunId) {
        setRunId(currentRunId);
        await seedStageRuns(currentRunId).catch(() => {});
        // Retroactively mark upload+project_create as done in DB
        await updateStageRun(currentRunId, 'upload', {
          status: 'done',
          started_at: new Date(ts).toISOString(),
          completed_at: new Date().toISOString(),
          output_summary: { storage_path: storagePath },
        }).catch(() => {});
        await updateStageRun(currentRunId, 'project_create', {
          status: 'running',
          started_at: new Date().toISOString(),
        }).catch(() => {});
      }

      // Create project_documents record so ingest_pdf can write extracted text
      // Use feature_script as doc_type so the script is visible in the dev engine
      // document tray on the feature_film ladder. Title will be updated after ingest.
      const { data: doc, error: docErr } = await (supabase as any)
        .from('project_documents')
        .insert({
          project_id:       pid,
          user_id:          user.id,
          doc_type:         'feature_script',
          title:            placeholderTitle,
          file_name:        file.name,
          file_path:        storagePath,
          storage_path:     storagePath,
          extraction_status:'pending',
          source:           'drop',
        })
        .select('id')
        .single();
      if (docErr) throw new Error(`Doc create: ${docErr.message}`);

      const { data: ver, error: verErr } = await (supabase as any)
        .from('project_document_versions')
        .insert({
          document_id:     doc.id,
          created_by:      user.id,
          version_number:  1,
          plaintext:       '',
          label:           'v1',
          deliverable_type:'feature_script',
        })
        .select('id')
        .single();
      if (verErr) throw new Error(`Version create: ${verErr.message}`);

      await (supabase as any)
        .from('project_documents')
        .update({ latest_version_id: ver.id })
        .eq('id', doc.id);

      await markDone('project_create', { project_id: pid });

      // ── Stage 2: Ingest PDF ────────────────────────────────────────────────
      await markRunning('ingest');
      let titleGuess   = placeholderTitle;
      let docVersionId = ver.id;

      try {
        const ingestResult = await callFunction('script-intake', {
          action:     'ingest_pdf',
          projectId:  pid,
          storagePath,
          documentId: doc.id,
          versionId:  ver.id,
        }, token);
        if (ingestResult?.titleGuess) titleGuess = ingestResult.titleGuess;
        await markDone('ingest', {
          title_guess:  titleGuess,
          page_count:   ingestResult?.pageCount,
        });
      } catch (ingestErr: any) {
        // Non-fatal: scene_graph_extract will attempt with whatever text is available
        await markFailed('ingest', ingestErr);
        console.warn('[drop] ingest_pdf failed (non-fatal):', ingestErr.message);
      }

      // Update project title and document title with AI-detected title
      if (titleGuess !== placeholderTitle) {
        await supabase.from('projects').update({ title: titleGuess }).eq('id', pid);
        // Update the script document title to match the detected script title
        await (supabase as any)
          .from('project_documents')
          .update({ title: titleGuess })
          .eq('id', doc.id);
      }

      // Create project_scripts record — archive any existing current first, then insert.
      // (No unique constraint on project_id alone, so upsert would silently fail.)
      await (supabase as any)
        .from('project_scripts')
        .update({ status: 'archived' })
        .eq('project_id', pid)
        .eq('status', 'current');
      await (supabase as any).from('project_scripts').insert({
        project_id:    pid,
        user_id:       user.id,
        version_label: titleGuess,
        status:        'current',
        file_path:     storagePath,
        notes:         'Created via Script Drop Zone',
      });

      // Update intake run with doc refs now that we have them
      if (currentRunId) {
        try {
          await (supabase as any)
            .from('screenplay_intake_runs')
            .update({
              source_doc_id:     doc.id,
              script_version_id: docVersionId,
              metadata:          {
                source: 'drop', original_filename: file.name,
                storage_path: storagePath, title_guess: titleGuess,
              },
            })
            .eq('id', currentRunId);
        } catch (_) { /* non-fatal — intake run update failure does not block import */ }
      }

      // ── Classify document type after ingest ────────────────────────────────
      // Read plaintext back from the version record to determine if this is
      // a screenplay (has scene headings) or a non-screenplay doc.
      const { data: versionData } = await (supabase as any)
        .from("project_document_versions")
        .select("plaintext")
        .eq("id", ver.id)
        .single();
      const plaintext = versionData?.plaintext || "";
      const { isScreenplay, sceneCount } = isScreenplayText(plaintext);

      if (!isScreenplay) {
        // Non-screenplay document — skip all screenplay-specific enrichment stages
        const skippedStages = ["scene_extract", "entity_extract", "nit_dialogue", "role_classify", "spine_sync", "binding_derive", "scene_index"];
        for (const key of skippedStages) {
          await markSkipped(key, `Document has ${sceneCount} detected scene headings — not a screenplay; skipping screenplay-specific enrichment`);
        }
        // Navigate to project immediately
        if (currentRunId) {
          await finaliseIntakeRun(currentRunId, currentStages).catch(() => {});
        }
        const anyFailed = currentStages.some(s => s.status === "failed");
        toast.warning(anyFailed
          ? `"${titleGuess}" created — some stages need attention`
          : `"${titleGuess}" created — document ready for development`);
        navigate(`/projects/${pid}`);
        setIsRunning(false);
        return;
      }

      // ── Enrichment stages — fail-tolerant after project exists ──────────────
      // Each stage is individually fail-tolerant. A failure marks the stage
      // 'failed' in DB and continues to the next stage where possible.

      // Stage 3: scene_graph_extract
      // Uses dev-engine-v2:scene_graph_extract — reads plaintext from
      // project_document_versions, writes to scene_graph_scenes + order + snapshot.
      // Also auto-runs syncSceneEntityLinksForProject internally.
      // force:true clears any pre-existing scene graph for this project (safe for
      // freshly-created projects; idempotent on re-run).
      await markRunning('scene_extract');
      try {
        const extractResult = await callFunction('dev-engine-v2', {
          action:            'scene_graph_extract',
          projectId:         pid,
          sourceDocumentId:  doc.id,
          sourceVersionId:   ver.id,
          force:             false,  // project is new — no existing scene graph to clear
        }, token);
        await markDone('scene_extract', {
          scene_count: extractResult?.sceneCount ?? extractResult?.scenes?.length,
          snapshot_id: extractResult?.snapshotId,
        });
      } catch (e: any) {
        await markFailed('scene_extract', e);
        // Without scenes, downstream stages will produce no output but won't error
      }

      // Stage 4: entity_extract
      // Scans scene_graph_versions content for character and location names,
      // creates narrative_entities + narrative_scene_entity_links.
      // entity-links-engine self-extracts if no narrative_units exist.
      // Idempotent — safe to re-run.
      await markRunning('entity_extract');
      try {
        const entityResult = await callFunction('entity-links-engine', {
          projectId: pid,
        }, token);
        await markDone('entity_extract', {
          linked:     entityResult?.linked ?? 0,
          byType:    entityResult?.byType ?? {},
        });
      } catch (e: any) {
        await markFailed('entity_extract', e);
      }

      // Stage 5: nit_dialogue (sync_dialogue_characters)
      // Supplementary character detection via screenplay dialogue heading analysis.
      // Additive to entity_extract (exact name scan) — together they give
      // complete coverage: entity-extracted names + dialogue headings.
      await markRunning('nit_dialogue');
      try {
        const nitResult = await callFunction('nit-sync', {
          projectId: pid,
          action:    'sync_dialogue_characters',
        }, token);
        await markDone('nit_dialogue', {
          scenes_processed:   nitResult?.scenes_processed,
          links_upserted:     nitResult?.links_upserted,
          characters_written: nitResult?.characters_written,
        });
      } catch (e: any) {
        await markFailed('nit_dialogue', e);
      }

      // Stage 6: role_classify
      await markRunning('role_classify');
      try {
        const roleResult = await callFunction('dev-engine-v2', {
          action:    'scene_graph_classify_roles_heuristic',
          projectId: pid,
          force:     true,
        }, token);
        await markDone('role_classify', {
          scenes_classified: roleResult?.scenes_classified,
          total_scenes:      roleResult?.total_scenes,
        });
      } catch (e: any) {
        await markFailed('role_classify', e);
      }

      // Stage 7: spine_sync
      await markRunning('spine_sync');
      try {
        const spineResult = await callFunction('dev-engine-v2', {
          action:    'scene_graph_sync_spine_links',
          projectId: pid,
        }, token);
        await markDone('spine_sync', {
          links_upserted: spineResult?.links_upserted,
        });
      } catch (e: any) {
        await markFailed('spine_sync', e);
      }

      // Stage 8: binding_derive
      await markRunning('binding_derive');
      try {
        const bindResult = await callFunction('dev-engine-v2', {
          action:    'scene_derive_blueprint_bindings',
          projectId: pid,
        }, token);
        await markDone('binding_derive', {
          bindings_upserted: bindResult?.bindings_upserted,
        });
      } catch (e: any) {
        await markFailed('binding_derive', e);
      }

      // Stage 9: scene_index_build (MUST run after NIT completes)
      // Reads canonical scene_graph_* data including characters_present
      // populated by NIT entity sync. Fail-closed if data is incomplete.
      await markRunning('scene_index');
      try {
        const sceneIndexResult = await callFunction('extract-scene-index', {
          project_id: pid,
        }, token);
        await markDone('scene_index', {
          scene_count: sceneIndexResult?.count,
          source: sceneIndexResult?.source,
        });
      } catch (e: any) {
        await markFailed('scene_index', e);
      }

      // Finalise run record
      if (currentRunId) {
        await finaliseIntakeRun(currentRunId, currentStages).catch(() => {});
      }

      const anyFailed = currentStages.some(s => s.status === 'failed');
      if (anyFailed) {
        toast.warning(`"${titleGuess}" created — some enrichment stages need retry`, {
          description: 'Open the project to see which stages need attention.',
        });
      } else {
        toast.success(`"${titleGuess}" created — scene graph fully enriched`);
      }

      navigate(`/projects/${pid}`);

    } catch (err: any) {
      // Fatal error: project creation failed or earlier non-tolerant stage failed
      console.error('[useScriptDropProject]', err);
      toast.error('Script import failed', { description: err.message });
      if (currentRunId) {
        try {
          await (supabase as any)
            .from('screenplay_intake_runs')
            .update({ status: 'failed', completed_at: new Date().toISOString(), error: err.message })
            .eq('id', currentRunId);
        } catch (_) { /* best-effort failure recording */ }
      }
    } finally {
      setIsRunning(false);
    }
  }, [user, isRunning, navigate, setStage]);

  return { run, stages, isRunning, runId, projectId };
}
