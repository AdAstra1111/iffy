import { useCallback, useRef, useEffect, useReducer, startTransition } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AutoRunJob, AutoRunStep, DebugWhyBlockedResult } from '@/hooks/useAutoRun';
import { mapDocTypeToLadderStage } from '@/lib/stages/registry';
import { AUTO_RUN_EXECUTION_MODE } from '@/lib/autoRunConfig';
import { parseEdgeResponse } from '@/lib/edgeResponseGuard';
import { extractRecoverableAutoRunConflict } from '@/lib/autoRunConflict';
import { isValidUUID } from '@/lib/validation/uuid';

// ── API helper ──
async function callAutoRun(action: string, extra: Record<string, any> = {}) {
  // Guard: reject calls with invalid projectId
  if (extra.projectId && !isValidUUID(extra.projectId)) {
    console.warn('[useAutoRunMC] skipping callAutoRun — invalid projectId:', extra.projectId);
    return null;
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Supabase URL not configured');
  // Refresh session before every call to ensure a valid token
  let sessionToken = '';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    sessionToken = session?.access_token || '';
  } catch {
    const { data: { session } } = await supabase.auth.getSession();
    sessionToken = session?.access_token || '';
  }
  if (!sessionToken) throw new Error('Not authenticated');
  const url = `${supabaseUrl}/functions/v1/auto-run`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ action, ...extra }),
    });
  } catch (fetchErr: any) {
    throw new Error(`Failed to reach auto-run service (action=${action}, url=${url}): ${fetchErr.message}`);
  }
  // ── IEL: Hardened JSON boundary — never pass HTML/non-JSON to .json() ──
  const result = await parseEdgeResponse(resp, 'auto-run', action);
  // Handle 409 STALE_DECISION gracefully (must parse body only once)
  if (resp.status === 409 && result?.code === 'STALE_DECISION') {
    return { ...result, _stale: true };
  }
  const recoverableConflict = resp.status === 409
    ? extractRecoverableAutoRunConflict(result, extra.projectId)
    : null;
  if (recoverableConflict) {
    return { ...result, ...recoverableConflict, _resumable: true };
  }
  if (resp.status === 409 && (result?.code === 'job_already_running' || result?.recoverable === true || result?.error === 'RESUMABLE_JOB_EXISTS')) {
    throw new Error('Auto-Run conflict received without resumable job data.');
  }
  if (!resp.ok) throw new Error(result.error || result.message || `Auto-run error (${resp.status})`);
  return result;
}

async function callDocumentText(documentId?: string, versionId?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const resp = await fetch(`/api/supabase-proxy/functions/v1/document-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ documentId, versionId }),
  });
  const result = await parseEdgeResponse(resp, 'document-text');
  if (!resp.ok) throw new Error(result.error || 'Document text error');
  return result;
}

export interface DocumentTextResult {
  plaintext: string;
  extracted_text: string;
  doc_type: string;
  version_number: number;
  char_count: number;
}

export type ConnectionState = 'online' | 'reconnecting' | 'disconnected';

// ── Human-required pause reasons that must NOT be auto-resumed ──
const HUMAN_REQUIRED_PAUSES = [
  'COMPLETED', 'ERROR', 'VERSION_CAP_REACHED',
  'SAFE_MODE_GATE', 'STEP_LIMIT_REACHED',
  'PLATEAU_RECOVERY_EXHAUSTED',
];

function isHumanRequiredPause(job: AutoRunJob): boolean {
  if (HUMAN_REQUIRED_PAUSES.some(r =>
    job.stop_reason?.includes(r) || job.pause_reason?.includes(r)
  )) return true;
  if (job.awaiting_approval && (job as any).approval_type === 'human_required') return true;
  return false;
}

function buildPauseLoopSignature(job: AutoRunJob): string {
  return [
    job.id,
    job.current_document,
    job.pause_reason || '',
    String(job.step_count ?? ''),
    String(job.last_ci ?? ''),
    String(job.stage_loop_count ?? ''),
  ].join('|');
}

// ── Reducer ──
interface MissionState {
  job: AutoRunJob | null;
  steps: AutoRunStep[];
  isRunning: boolean;
  error: string | null;
  activated: boolean;
  connectionState: ConnectionState;
  backendDiagnostic: DebugWhyBlockedResult | null;
}

const initialState: MissionState = {
  job: null,
  steps: [],
  isRunning: false,
  error: null,
  activated: false,
  connectionState: 'online',
  backendDiagnostic: null,
};

type MissionAction =
  | { type: 'JOB_UPDATED'; job: AutoRunJob | null; steps: AutoRunStep[]; isRunning: boolean; backendDiagnostic?: DebugWhyBlockedResult | null }
  | { type: 'ERROR'; error: string | null }
  | { type: 'CONNECTION_STATE'; connectionState: ConnectionState }
  | { type: 'RESET' }
  | { type: 'ACTIVATE' }
  | { type: 'STEPS_UPDATED'; steps: AutoRunStep[] };

function missionReducer(state: MissionState, action: MissionAction): MissionState {
  switch (action.type) {
    case 'JOB_UPDATED':
      return {
        ...state,
        job: action.job,
        steps: action.steps,
        isRunning: action.isRunning,
        backendDiagnostic: action.backendDiagnostic ?? state.backendDiagnostic,
        error: null,
        connectionState: 'online',
      };
    case 'ERROR':
      return { ...state, error: action.error };
    case 'CONNECTION_STATE':
      return { ...state, connectionState: action.connectionState };
    case 'RESET':
      return { ...initialState, activated: state.activated };
    case 'ACTIVATE':
      return { ...state, activated: true };
    case 'STEPS_UPDATED':
      return { ...state, steps: action.steps };
    default:
      return state;
  }
}

export function useAutoRunMissionControl(projectId: string | undefined) {
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(missionReducer, initialState);

  // Preserve all existing refs used by auto-resume and other logic
  const abortRef = useRef(false);
  const autoResumeFailCountRef = useRef(0);
  const autoResumeInFlightRef = useRef(false);
  const autoResumeLastAttemptSignatureRef = useRef<string | null>(null);
  const lastSuccessRef = useRef(Date.now());

  // Conditional cache invalidation tracker
  const prevJobSignatureRef = useRef<{ status?: string; current_document?: string }>({});

  // Deferred cache invalidation: only triggers on document transition, not every Realtime event
  const prevJobDocRef = useRef<string | undefined>(undefined);

  // ── Helpers ──
  const invalidateCachesConditionally = useCallback((job: AutoRunJob | null) => {
    if (!job) return;
    const currentSignature = { status: job.status, current_document: job.current_document };
    // Only invalidate when status OR current_document actually change between updates
    if (job.status !== prevJobSignatureRef.current.status || job.current_document !== prevJobSignatureRef.current.current_document) {
      startTransition(() => {
        qc.invalidateQueries({ queryKey: ['dev-v2-docs', projectId] });
        qc.invalidateQueries({ queryKey: ['dev-v2-versions'] });
        qc.invalidateQueries({ queryKey: ['dev-v2-approved', projectId] });
        qc.invalidateQueries({ queryKey: ['seed-pack-versions', projectId] });
      });
      prevJobSignatureRef.current = currentSignature;
    }
  }, [qc, projectId]);

  // Derive from state for backwards-compat destructuring
  const { job, steps } = state;

  // Auto-activate Mission Control on entry so controls/status are always available
  useEffect(() => {
    if (projectId) dispatch({ type: 'ACTIVATE' });
  }, [projectId]);

  // Reset local mission state when project changes (prevents cross-project bleed)
  useEffect(() => {
    abortRef.current = false;
    autoResumeFailCountRef.current = 0;
    autoResumeInFlightRef.current = false;
    autoResumeLastAttemptSignatureRef.current = null;
    lastSuccessRef.current = Date.now();
    prevJobSignatureRef.current = {};
    dispatch({ type: 'RESET' });
    dispatch({ type: 'CONNECTION_STATE', connectionState: 'online' });
  }, [projectId]);

  // ── Fetch existing job when mission control is activated ──
  const { data: existingJob } = useQuery({
    queryKey: ['auto-run-mission-status', projectId],
    queryFn: async () => {
      if (!projectId || !isValidUUID(projectId)) return null;
      const { data: { user } } = await supabase.auth.getUser();
      return await callAutoRun('status', { projectId, userId: user?.id });
    },
    enabled: isValidUUID(projectId) && state.activated,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (existingJob?.job) {
      // Zombie job guard: skip stopped jobs with no steps — these are dead jobs
      // that would trigger the job_rehydrate → snapshot_fail_closed → rehydrate loop
      if (existingJob.job.status === 'stopped' && (existingJob.job.step_count ?? 0) === 0) {
        console.log(`[mission-control][IEL] job_rehydrate_skipped { reason: "zombie_job", job_id: "${existingJob.job.id}" }`);
        return;
      }
      const running = existingJob.job.status === 'running' && !existingJob.job.awaiting_approval;
      dispatch({
        type: 'JOB_UPDATED',
        job: existingJob.job,
        steps: existingJob.latest_steps || [],
        isRunning: running,
        backendDiagnostic: existingJob as DebugWhyBlockedResult,
      });
      console.log(`[mission-control][IEL] job_rehydrate { job_id: "${existingJob.job.id}", status: "${existingJob.job.status}", current_document: "${existingJob.job.current_document}", step_count: ${existingJob.job.step_count} }`);
      invalidateCachesConditionally(existingJob.job);
    }
  }, [existingJob, invalidateCachesConditionally]);

  // Discover jobs started from other panels (keeps Clean/Advanced in sync)
  // One-shot: Realtime subscription handles live updates
  useEffect(() => {
    if (!projectId || !state.activated || state.job?.id) return;

    let cancelled = false;
    const discover = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const result = await callAutoRun('status', { projectId, userId: user?.id });
        if (cancelled || !result?.job) return;
        const running = result.job.status === 'running' && !result.job.awaiting_approval;
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || [],
          isRunning: running,
          backendDiagnostic: result as DebugWhyBlockedResult,
        });
        invalidateCachesConditionally(result.job);
      } catch {
        // no active job yet
      }
    };

    discover();
    return () => { cancelled = true; };
  }, [projectId, state.activated, state.job?.id, invalidateCachesConditionally]);

  // ── Supabase Realtime subscription for auto_run_jobs ──
  useEffect(() => {
    if (!projectId || !isValidUUID(projectId) || !state.activated) return;

    const channelName = `auto-run-mc-${projectId}-${Date.now()}`;
    const channel = supabase.channel(channelName);

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'auto_run_jobs',
        filter: `project_id=eq.${projectId}`,
      },
      (payload: { new: Record<string, any>; old: Record<string, any> }) => {
        const updatedData = payload.new;
        if (!updatedData?.id) return;

        // Realtime received an update — connection is online
        dispatch({ type: 'CONNECTION_STATE', connectionState: 'online' });

        // Realtime delivers complete row data — no merge needed
        const mergedJob = updatedData as unknown as AutoRunJob;
        const running = mergedJob.status === 'running' && !mergedJob.awaiting_approval;

        dispatch({
          type: 'JOB_UPDATED',
          job: mergedJob,
          steps: state.steps || [],
          isRunning: running,
        });

        // Fire-and-forget fetch latest steps so UI shows pipeline progress
        if (mergedJob.id) {
          supabase.from('auto_run_steps')
            .select('*')
            .eq('job_id', mergedJob.id)
            .order('step_index', { ascending: false })
            .limit(50)
            .then(({ data: freshSteps }) => {
              if (freshSteps && freshSteps.length > 0) {
                dispatch({
                  type: 'STEPS_UPDATED',
                  steps: freshSteps as any,
                });
              }
            })
            .catch(() => { /* silent */ });
        }

        // NOTE: Cache invalidation moved to separate deferred effect below
        // to avoid blocking the main-thread Realtime message handler (~269ms).
      }
    )
    .subscribe((status: string) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        dispatch({ type: 'CONNECTION_STATE', connectionState: 'reconnecting' });
      } else if (status === 'SUBSCRIBED') {
        dispatch({ type: 'CONNECTION_STATE', connectionState: 'online' });
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [projectId, state.activated, invalidateCachesConditionally]);

  // ── Deferred cache invalidation on document transition ──
  // Root cause: cache invalidation inside Realtime callback blocked main thread for 269ms per message.
  // Moved to separate deferred effect so Realtime callback only dispatches (sub-millisecond).
  useEffect(() => {
    if (!state.job) return;
    // Only invalidate when current_document changes (stage transition) — not on every heartbeat/status
    if (state.job.current_document !== prevJobDocRef.current) {
      prevJobDocRef.current = state.job.current_document;
      requestAnimationFrame(() => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['dev-v2-docs', projectId] });
          qc.invalidateQueries({ queryKey: ['dev-v2-versions'] });
          qc.invalidateQueries({ queryKey: ['dev-v2-approved', projectId] });
          qc.invalidateQueries({ queryKey: ['seed-pack-versions', projectId] });
        });
      });
    }
  }, [state.job?.current_document, projectId, qc]);

  // ── Passive connectivity heartbeat (no status fetch when Realtime is healthy) ──
  // Root cause: 30s heartbeat ran full status fetch + cache invalidation even when Realtime was healthy.
  // Replaced with passive connectivity check — only fetches when connection is down, no cache invalidations.
  useEffect(() => {
    if (!projectId || !isValidUUID(projectId) || !state.activated) return;

    let pingTimer: ReturnType<typeof setTimeout> | null = null;

    const ping = async () => {
      // If Realtime is healthy, skip entirely — no work needed
      if (state.connectionState === 'online') {
        schedulePing();
        return;
      }

      // Realtime is down — do a single status fetch, no cache invalidate
      try {
        const result = await callAutoRun('status', { projectId });
        if (result?.job) {
          const running = result.job.status === 'running' && !result.job.awaiting_approval;
          dispatch({
            type: 'JOB_UPDATED',
            job: result.job,
            steps: result.latest_steps || [],
            isRunning: running,
          });
          dispatch({ type: 'CONNECTION_STATE', connectionState: 'online' });
        }
      } catch {
        // Still down — will retry next cycle
      }
      schedulePing();
    };

    const schedulePing = () => {
      pingTimer = setTimeout(ping, 60_000);
    };

    schedulePing();
    return () => { if (pingTimer) clearTimeout(pingTimer); };
  }, [projectId, state.activated, state.connectionState]);

  // ── Auto-resume effect: when paused + allow_defaults, resume automatically ──
  useEffect(() => {
    if (!state.job) return;

    if (state.job.status !== 'paused') {
      // Clear snapshot guard outside paused state so next real pause can be handled
      autoResumeLastAttemptSignatureRef.current = null;
      // Reset failed attempts once we leave pause (completed / running / stopped / failed)
      if (['running', 'completed', 'stopped', 'failed'].includes(state.job.status)) {
        autoResumeFailCountRef.current = 0;
      }
      return;
    }

    if (!state.job.allow_defaults) return;
    if (isHumanRequiredPause(state.job)) return;
    if (autoResumeFailCountRef.current >= 3) {
      dispatch({
        type: 'JOB_UPDATED',
        job: state.job,
        steps: state.steps,
        isRunning: false,
      });
      return;
    }
    if (autoResumeInFlightRef.current) return;

    const pauseSignature = buildPauseLoopSignature(state.job);
    // Prevent duplicate scheduling for the same paused snapshot
    if (autoResumeLastAttemptSignatureRef.current === pauseSignature) return;
    autoResumeLastAttemptSignatureRef.current = pauseSignature;

    console.log(`[mission-control][IEL] auto_resume_scheduled { job_id: "${state.job.id}", pause_reason: "${state.job.pause_reason}", attempt: ${autoResumeFailCountRef.current + 1} }`);

    const timer = setTimeout(async () => {
      autoResumeInFlightRef.current = true;
      try {
        const resumeResult = await callAutoRun('resume', { jobId: state.job.id, followLatest: true });
        if (resumeResult?.job) {
          dispatch({
            type: 'JOB_UPDATED',
            job: resumeResult.job,
            steps: resumeResult.latest_steps || [],
            isRunning: true,
          });
        }

        // Nudge run-next immediately after resume
        const nextResult = await callAutoRun('run-next', { jobId: state.job.id });
        if (nextResult?.job) {
          dispatch({
            type: 'JOB_UPDATED',
            job: nextResult.job,
            steps: nextResult.latest_steps || [],
            isRunning: true,
          });
        }

        const postJob = nextResult?.job || resumeResult?.job || null;
        if (postJob?.status === 'paused' && buildPauseLoopSignature(postJob) === pauseSignature) {
          autoResumeFailCountRef.current += 1;
          console.warn(`[mission-control] auto-resume stalled (attempt ${autoResumeFailCountRef.current}) for ${postJob.current_document}: ${postJob.pause_reason}`);
          if (autoResumeFailCountRef.current >= 3) {
            dispatch({
              type: 'JOB_UPDATED',
              job: postJob,
              steps: [],
              isRunning: false,
            });
          }
          return;
        }

        // Successful progress (status changed and/or pause signature changed)
        autoResumeFailCountRef.current = 0;
        autoResumeLastAttemptSignatureRef.current = null;
        console.log(`[mission-control][IEL] auto_resume_success { job_id: "${state.job.id}" }`);
      } catch (e: any) {
        autoResumeFailCountRef.current += 1;
        // Allow retry for the same paused snapshot on transient failures
        autoResumeLastAttemptSignatureRef.current = null;
        console.warn(`[mission-control] auto-resume failed (attempt ${autoResumeFailCountRef.current}):`, e.message);
        if (autoResumeFailCountRef.current >= 3) {
          dispatch({
            type: 'JOB_UPDATED',
            job: state.job,
            steps: state.steps,
            isRunning: false,
          });
        }
      } finally {
        autoResumeInFlightRef.current = false;
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [state.job?.id, state.job?.status, state.job?.allow_defaults, state.job?.pause_reason, state.job?.stop_reason, state.job?.step_count, state.job?.last_ci, state.job?.stage_loop_count]);

  // ── Core actions ──
  const refreshStatus = useCallback(async (preferredJobId?: string) => {
    const lookupJobId = preferredJobId || state.job?.id;
    if (!lookupJobId && !projectId) return;
    try {
      const result = await callAutoRun('status', lookupJobId ? { jobId: lookupJobId, projectId } : { projectId });
      if (result?.job) {
        const running = result.job.status === 'running' && !result.job.awaiting_approval;
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || [],
          isRunning: running,
        });
      }
   } catch {}
  }, [state.job?.id, projectId]);

  const activate = useCallback(() => dispatch({ type: 'ACTIVATE' }), []);

  const start = useCallback(async (mode: string, startDocument: string, targetDocument?: string, allowDefaults?: boolean) => {
    if (!projectId) {
      const msg = 'Cannot start Auto-Run: no project ID';
      dispatch({ type: 'ERROR', error: msg });
      throw new Error(msg);
    }
    dispatch({ type: 'ACTIVATE' });
    dispatch({ type: 'ERROR', error: null });
    abortRef.current = false;
    const mappedStart = mapDocTypeToLadderStage(startDocument);

    try {
      // Preflight: avoid 409 by resuming any existing resumable job first.
      try {
        const existing = await callAutoRun('status', { projectId });
        if (existing?.job && ['paused', 'running', 'queued'].includes(existing.job.status)) {
          console.log(`[mission-control][IEL] start_vs_resume_decision { action: "preflight_resume", reason: "job_already_running", existing_job_id: "${existing.job.id}", current_document: "${existing.job.current_document}", step_count: ${existing.job.step_count} }`);
          const running = existing.job.status === 'running' && !existing.job.awaiting_approval;
          dispatch({
            type: 'JOB_UPDATED',
            job: existing.job,
            steps: existing.latest_steps || [],
            isRunning: running || existing.job.status === 'paused',
          });

          if (existing.job.status === 'paused') {
            await callAutoRun('resume', { jobId: existing.job.id, followLatest: true });
          }

          await refreshStatus(existing.job.id);
          return;
        }
      } catch {
        // No resumable job found — continue with normal start path.
      }

      const result = await callAutoRun('start', {
        projectId, mode: AUTO_RUN_EXECUTION_MODE === 'full' ? 'balanced' : 'staged', start_document: mappedStart, target_document: targetDocument || 'production_draft',
        max_total_steps: 100,
        allow_defaults: allowDefaults ?? false,
        max_versions_per_doc_per_job: 60,
      });

      const existingJobId = result.job_id || result.existing_job_id;
      if (result._resumable && existingJobId) {
        console.log(`[mission-control][IEL] start_vs_resume_decision { action: "auto_attach_existing_job", reason: "job_already_running", existing_job_id: "${existingJobId}", current_document: "${result.current_document}", step_count: ${result.step_count} }`);
        try {
          const statusResult = await callAutoRun('status', { jobId: existingJobId, projectId });
          if (statusResult?.job) {
            const running = statusResult.job.status === 'running' && !statusResult.job.awaiting_approval;
            dispatch({
              type: 'JOB_UPDATED',
              job: statusResult.job,
              steps: statusResult.latest_steps || [],
              isRunning: running || statusResult.job.status === 'paused',
            });
            if (statusResult.job.status === 'paused') {
              await callAutoRun('resume', { jobId: statusResult.job.id, followLatest: true });
            }
            await refreshStatus(statusResult.job.id);
            return;
          }
        } catch (resumeErr: any) {
          console.warn('[mission-control][IEL] reattach_fallback', resumeErr.message);
          // Fallback: use the conflict payload directly instead of crashing
          dispatch({
            type: 'JOB_UPDATED',
            job: { id: existingJobId, status: result.status || 'running', current_document: result.current_document, step_count: result.step_count ?? 0, project_id: projectId } as any,
            steps: [],
            isRunning: true,
          });
          return;
        }
      }

      const running = result.job?.status === 'running' && !result.job?.awaiting_approval;
      dispatch({
        type: 'JOB_UPDATED',
        job: result.job,
        steps: result.latest_steps || [],
        isRunning: running,
      });
      console.log(`[mission-control][IEL] start_new_job { job_id: "${result.job?.id}", current_document: "${result.job?.current_document}" }`);

      // Nudge run-next immediately after start to advance the pipeline
      if (running && result.job?.id) {
        try {
          const nextResult = await callAutoRun('run-next', { jobId: result.job.id });
          if (nextResult?.job) {
            const stillRunning = nextResult.job.status === 'running' && !nextResult.job.awaiting_approval;
            dispatch({
              type: 'JOB_UPDATED',
              job: nextResult.job,
              steps: nextResult.latest_steps || [],
              isRunning: stillRunning,
            });
          }
        } catch (nextErr: any) {
          console.warn(`[mission-control] start run-next nudge failed: ${nextErr.message}`);
        }
      }
    } catch (e: any) {
      dispatch({ type: 'ERROR', error: e.message });
      // Don't re-throw — let the UI show the error gracefully instead of blank screen
    }
  }, [projectId, refreshStatus]);

  const pause = useCallback(async () => {
    if (!state.job) return;
    abortRef.current = true;
    try {
      const result = await callAutoRun('pause', { jobId: state.job.id });
      dispatch({
        type: 'JOB_UPDATED',
        job: result.job,
        steps: state.steps,
        isRunning: false,
      });
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps]);

  const resume = useCallback(async (followLatest?: boolean) => {
    if (!state.job) return;
    abortRef.current = false;
    dispatch({ type: 'ERROR', error: null });
    try {
      await callAutoRun('resume', { jobId: state.job.id, ...(followLatest !== undefined ? { followLatest } : {}) });
      dispatch({
        type: 'JOB_UPDATED',
        job: state.job,
        steps: state.steps,
        isRunning: true,
      });
      refreshStatus();
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps, refreshStatus]);

  const setResumeSource = useCallback(async (documentId: string, versionId: string) => {
    if (!state.job) return;
    dispatch({ type: 'ERROR', error: null });
    try {
      const result = await callAutoRun('set-resume-source', { jobId: state.job.id, documentId, versionId });
      if (result.job) {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || [],
          isRunning: false,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job]);

  const stop = useCallback(async () => {
    if (!state.job) return;
    abortRef.current = true;
    try {
      const result = await callAutoRun('stop', { jobId: state.job.id });
      dispatch({
        type: 'JOB_UPDATED',
        job: result.job,
        steps: state.steps,
        isRunning: false,
      });
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps]);

  const runNext = useCallback(async () => {
    if (!state.job) return;
    try {
      const result = await callAutoRun('run-next', { jobId: state.job.id });
      if (result?.job) {
        const running = result.job.status === 'running' && !result.job.awaiting_approval;
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: running,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps]);

  // ── Approval ──
  const getPendingDoc = useCallback(async () => {
    if (!state.job) return null;
    // Guard: only call if job is actually awaiting approval with a pending doc
    if (!state.job.awaiting_approval || !state.job.pending_doc_id) return null;
    try {
      const result = await callAutoRun('get-pending-doc', { jobId: state.job.id });
      return result.pending_doc || null;
    } catch (e: any) {
      // Silently handle stale state — job may have moved on
      if (e.message?.includes('No pending document')) return null;
      dispatch({ type: 'ERROR', error: e.message }); return null;
    }
  }, [state.job]);

  const approveNext = useCallback(async (decision: 'approve' | 'revise' | 'stop') => {
    if (!state.job) return;
    // Guard: only call if job is actually awaiting approval
    if (!state.job.awaiting_approval) return;
    dispatch({ type: 'ERROR', error: null });
    abortRef.current = false;
    try {
      const result = await callAutoRun('approve-next', { jobId: state.job.id, decision });
      if (result.job) {
        const running = result.job.status === 'running' && !result.job.awaiting_approval;
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: running,
        });
        if (running) {
          await new Promise(r => setTimeout(r, 300));
          dispatch({
            type: 'JOB_UPDATED',
            job: result.job,
            steps: result.latest_steps || state.steps,
            isRunning: true,
          });
        }
      }
    } catch (e: any) {
      if (e.message?.includes('not awaiting approval')) {
        try {
          const status = await callAutoRun('status', { jobId: state.job.id });
          if (status?.job) {
            dispatch({
              type: 'JOB_UPDATED',
              job: status.job,
              steps: status.latest_steps || state.steps,
              isRunning: status.job?.status === 'running' && !status.job?.awaiting_approval,
            });
          }
        } catch {
          // no-op: stale-state sync best effort
        }
        return;
      }
      dispatch({ type: 'ERROR', error: e.message });
    }
  }, [state.job, state.steps]);

  const approveDecision = useCallback(async (decisionId: string, selectedValue: string) => {
    if (!state.job) return;
    dispatch({ type: 'ERROR', error: null });
    try {
      const result = await callAutoRun('approve-decision', { jobId: state.job.id, decisionId, selectedValue });
      if (result.job) {
        const running = result.job.status === 'running' && !result.job.awaiting_approval;
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: running,
        });
      }
      if (result._stale || result.code === 'STALE_DECISION') {
        console.warn('[auto-run] Decision was stale, refreshed job state');
        // Toast handled by UI — no error surfaced
        return;
      }
      if (result.job?.status === 'running') {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: true,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps]);

  // ── Stage control ──
  const setStage = useCallback(async (stage: string) => {
    if (!state.job) return;
    dispatch({ type: 'ERROR', error: null });
    try {
      const result = await callAutoRun('set-stage', { jobId: state.job.id, stage });
      if (result.job) {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: result.job?.status === 'running' && !result.job?.awaiting_approval,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps]);

  const forcePromote = useCallback(async () => {
    if (!state.job) return;
    dispatch({ type: 'ERROR', error: null });
    try {
      const result = await callAutoRun('force-promote', { jobId: state.job.id });
      if (result.job) {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: result.job?.status === 'running' && !result.job?.awaiting_approval,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps]);

  const restartFromStage = useCallback(async (stage: string) => {
    if (!state.job) return;
    dispatch({ type: 'ERROR', error: null });
    abortRef.current = false;
    try {
      const result = await callAutoRun('restart-from-stage', { jobId: state.job.id, stage });
      if (result.job) {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: result.job?.status === 'running' && !result.job?.awaiting_approval,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps]);

  // ── Intervention saves ──
  const saveStorySetup = useCallback(async (storySetup: Record<string, string>) => {
    if (!projectId) return;
    const { data: proj } = await supabase.from('projects').select('guardrails_config').eq('id', projectId).single();
    const gc = (proj?.guardrails_config as any) || {};
    gc.overrides = gc.overrides || {};
    gc.overrides.story_setup = storySetup;
    await supabase.from('projects').update({ guardrails_config: gc }).eq('id', projectId);
  }, [projectId]);

  const saveQualifications = useCallback(async (quals: {
    episode_target_duration_min_seconds?: number;
    episode_target_duration_max_seconds?: number;
    season_episode_count?: number;
    target_runtime_min_low?: number;
    target_runtime_min_high?: number;
  }) => {
    if (!projectId) return;
    const updates: Record<string, any> = {};
    if (quals.episode_target_duration_min_seconds) {
      updates.episode_target_duration_min_seconds = quals.episode_target_duration_min_seconds;
      updates.episode_target_duration_seconds = quals.episode_target_duration_min_seconds; // legacy
    }
    if (quals.episode_target_duration_max_seconds) {
      updates.episode_target_duration_max_seconds = quals.episode_target_duration_max_seconds;
    }
    const { data: proj } = await supabase.from('projects').select('guardrails_config').eq('id', projectId).single();
    const gc = (proj?.guardrails_config as any) || {};
    gc.overrides = gc.overrides || {};
    gc.overrides.qualifications = { ...(gc.overrides.qualifications || {}), ...quals };
    updates.guardrails_config = gc;
    await supabase.from('projects').update(updates).eq('id', projectId);
  }, [projectId]);

  const saveLaneBudget = useCallback(async (lane: string, budget: string) => {
    if (!projectId) return;
    await supabase.from('projects').update({ assigned_lane: lane, budget_range: budget }).eq('id', projectId);
  }, [projectId]);

  const saveGuardrails = useCallback(async (guardrails: any) => {
    if (!projectId) return;
    await supabase.from('projects').update({ guardrails_config: guardrails }).eq('id', projectId);
  }, [projectId]);

  // ── Document text helper ──
  const fetchDocumentText = useCallback(async (documentId?: string, versionId?: string): Promise<DocumentTextResult | null> => {
    try {
      return await callDocumentText(documentId, versionId);
    } catch { return null; }
  }, []);

  const clear = useCallback(() => {
    abortRef.current = true;
    dispatch({ type: 'RESET' });
    dispatch({ type: 'ERROR', error: null });
  }, []);

  const applyingDecisionsRef = useRef(false);

  const approveSeedCore = useCallback(async () => {
    if (!projectId) return null;
    dispatch({ type: 'ERROR', error: null });
    abortRef.current = false;
    try {
      const result = await callAutoRun('approve-seed-core', {
        projectId,
        jobId: state.job?.id,
      });

      let effectiveJob = result?.job ?? null;
      let latestSteps: AutoRunStep[] = [];

      // Fallback sync: some backend responses may not include job payload
      if (!effectiveJob && state.job?.id) {
        try {
          const status = await callAutoRun('status', { jobId: state.job.id });
          effectiveJob = status?.job ?? null;
          latestSteps = status?.latest_steps || [];
        } catch {
          // best-effort status sync
        }
      }

      if (effectiveJob) {
        const running = effectiveJob.status === 'running' && !effectiveJob.awaiting_approval;
        dispatch({
          type: 'JOB_UPDATED',
          job: effectiveJob,
          steps: latestSteps.length > 0 ? latestSteps : state.steps,
          isRunning: running,
        });
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ['seed-pack-versions', projectId] }),
        qc.invalidateQueries({ queryKey: ['dev-v2-docs', projectId] }),
        qc.invalidateQueries({ queryKey: ['auto-run-mission-status', projectId] }),
      ]);

      return { ...result, job: effectiveJob ?? result?.job ?? null };
    } catch (e: any) {
      dispatch({ type: 'ERROR', error: e.message });
      return null;
    }
  }, [projectId, state.job, state.steps, qc]);

  const applyDecisionsAndContinue = useCallback(async (
    selectedOptions: Array<{ note_id: string; option_id: string; custom_direction?: string }>,
    globalDirections?: string[]
  ) => {
    if (!state.job) return;
    if (applyingDecisionsRef.current) {
      console.warn('[auto-run] applyDecisionsAndContinue already in flight — skipping');
      return;
    }
    applyingDecisionsRef.current = true;
    dispatch({ type: 'ERROR', error: null });
    abortRef.current = false;
    try {
      const result = await callAutoRun('apply-decisions-and-continue', {
        jobId: state.job.id, selectedOptions, globalDirections,
        source_version_id: state.job.pending_version_id || state.job.frontier_version_id || undefined,
      });
      if (result.job) {
        const running = result.job.status === 'running' && !result.job?.awaiting_approval;
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: running,
        });
      }
      if (result._stale || result.code === 'STALE_DECISION') {
        console.warn('[auto-run] Decision was stale in applyDecisions, refreshed job state');
        return;
      }
      if (result.job?.status === 'running' && !result.job?.awaiting_approval) {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: true,
        });
      }
    } catch (e: any) {
      dispatch({ type: 'ERROR', error: e.message });
    } finally {
      applyingDecisionsRef.current = false;
    }
  }, [state.job, state.steps]);

  const updateStepLimit = useCallback(async (newLimit: number) => {
    if (!state.job) return;
    const HARD_MAX = 1000;
    const clamped = Math.max(1, Math.min(newLimit, HARD_MAX));
    try {
      const result = await callAutoRun('update-step-limit', { jobId: state.job.id, new_step_limit: clamped });
      if (result.job) {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: state.steps,
          isRunning: state.isRunning,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps, state.isRunning]);

  const updateTarget = useCallback(async (ci: number, gp: number) => {
    if (!state.job) return;
    dispatch({ type: 'ERROR', error: null });
    try {
      const result = await callAutoRun('update-target', { jobId: state.job.id, ci, gp });
      if (result.job) {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: state.steps,
          isRunning: state.isRunning,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps, state.isRunning]);

  const toggleAllowDefaults = useCallback(async (val: boolean) => {
    if (!state.job) return;
    try {
      await supabase.from('auto_run_jobs').update({ allow_defaults: val } as any).eq('id', state.job.id);
      dispatch({
        type: 'JOB_UPDATED',
        job: { ...state.job, allow_defaults: val },
        steps: state.steps,
        isRunning: state.isRunning,
      });

      // When enabling auto-decide while paused with pending decisions, auto-resolve them
      // Use the in-flight guard to prevent racing with the button
      const hasPending = Array.isArray(state.job.pending_decisions) && (state.job.pending_decisions as any[]).length > 0;
      if (val && state.job.status === 'paused' && hasPending && !applyingDecisionsRef.current) {
        // Small delay to let any concurrent button click claim the lock first
        await new Promise(r => setTimeout(r, 200));
        if (applyingDecisionsRef.current) return; // button click took priority
        applyingDecisionsRef.current = true;
        try {
          const result = await callAutoRun('apply-decisions-and-continue', {
            jobId: state.job.id,
            selectedOptions: [],
            source_version_id: state.job.pending_version_id || state.job.frontier_version_id || undefined,
          });
          if (result.job) {
            const running = result.job.status === 'running' && !result.job?.awaiting_approval;
            dispatch({
              type: 'JOB_UPDATED',
              job: result.job,
              steps: result.latest_steps || state.steps,
              isRunning: running,
            });
          }
        } catch (resumeErr: any) {
          console.warn('[auto-run] auto-resolve pending decisions failed:', resumeErr.message);
        } finally {
          applyingDecisionsRef.current= false;
        }
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps, state.isRunning]);

  const updateVersionCap = useCallback(async (newCap: number) => {
    if (!state.job) return;
    dispatch({ type: 'ERROR', error: null });
    try {
      const result = await callAutoRun('update-version-cap', { jobId: state.job.id, max_versions_per_doc_per_job: newCap });
      if (result.job) {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: state.steps,
          isRunning: state.isRunning,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps, state.isRunning]);

  const resumeFromStepLimit = useCallback(async () => {
    if (!state.job) return;
    const RESUME_BUMP = 10;
    const HARD_MAX = 1000;
    let newLimit = state.job.max_total_steps;
    // Always bump if limit <= used so we never get stuck
    if (newLimit <= state.job.step_count) {
      newLimit = Math.min(state.job.step_count + RESUME_BUMP, HARD_MAX);
    }
    abortRef.current = false;
    dispatch({ type: 'ERROR', error: null });
    try {
      // Always update limit to ensure it's above step_count
      await callAutoRun('update-step-limit', { jobId: state.job.id, new_step_limit: newLimit });
      // Resume — also clear pause_reason
      await callAutoRun('resume', { jobId: state.job.id, followLatest: true });
      dispatch({
        type: 'JOB_UPDATED',
        job: state.job,
        steps: state.steps,
        isRunning: true,
      });
      refreshStatus();
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps, refreshStatus]);

  const repairBaseline = useCallback(async (strategy: 'promote_best_scored' | 'promote_latest') => {
    if (!state.job) return;
    dispatch({ type: 'ERROR', error: null });
    abortRef.current = false;
    try {
      const result = await callAutoRun('repair-baseline', { jobId: state.job.id, strategy });
      if (result.job) {
        dispatch({
          type: 'JOB_UPDATED',
          job: result.job,
          steps: result.latest_steps || state.steps,
          isRunning: result.job?.status === 'running' && !result.job?.awaiting_approval,
        });
      }
    } catch (e: any) { dispatch({ type: 'ERROR', error: e.message }); }
  }, [state.job, state.steps]);

  return {
    job: state.job, steps: state.steps, isRunning: state.isRunning, error: state.error, activated: state.activated, connectionState: state.connectionState, backendDiagnostic: state.backendDiagnostic,
    // Core actions
    start, pause, resume, stop, runNext, clear, refreshStatus, activate,
    // Approval
    getPendingDoc, approveNext, approveDecision, approveSeedCore,
    // Decisions
    applyDecisionsAndContinue,
    // Stage control
    setStage, forcePromote, restartFromStage,
    // Resume source
    setResumeSource,
    // Interventions
    saveStorySetup, saveQualifications, saveLaneBudget, saveGuardrails,
    // Document text
    fetchDocumentText,
    // Step budget
    updateStepLimit, resumeFromStepLimit,
    // Version cap
    updateVersionCap,
    // Auto-decide
    toggleAllowDefaults,
    // Target
    updateTarget,
    // Baseline repair
    repairBaseline,
  };
}