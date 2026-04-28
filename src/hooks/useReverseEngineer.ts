import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface JobStage {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  error?: string;
}

export interface ReverseEngineerJob {
  job_id: string;
  project_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  current_stage: string;
  stages: Record<string, JobStage>;
  result?: { title?: string; documents_created?: string[] };
  error?: string;
  created_at: string;
  updated_at: string;
}

interface UseReverseEngineerReturn {
  /** Start reverse-engineering. Returns job_id immediately, polls in background. */
  reverseEngineerFromScript: (projectId: string, scriptDocumentId: string) => Promise<{ job_id: string }>;
  /** Poll the status of an existing job */
  pollJobStatus: (jobId: string) => Promise<ReverseEngineerJob | null>;
  /** Get all jobs for a project */
  getProjectJobs: (projectId: string) => Promise<ReverseEngineerJob[]>;
  isRunning: boolean;
  currentJob: ReverseEngineerJob | null;
  pollError: string | null;
}

const POLL_INTERVAL_MS = 2000;

// Vercel proxy URL — bypasses Supabase Edge Function RLS issue
const STATUS_PROXY_URL = '/api/re_status';

async function pollViaProxy(body: { job_id?: string; project_id?: string }): Promise<ReverseEngineerJob | { jobs: ReverseEngineerJob[] } | null> {
  try {
    const res = await fetch(STATUS_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Surface HTTP errors instead of silently ignoring them
    if (!res.ok) {
      let errMsg = `Proxy error ${res.status}`;
      try {
        const errBody = await res.json();
        errMsg = errBody?.error || errMsg;
      } catch { /* ignore parse errors */ }
      // Throw so polling loop can surface the error rather than silently continue
      throw new Error(errMsg);
    }
    return res.json();
  } catch (e: any) {
    // Re-throw so callers can handle specific errors
    throw new Error(`pollViaProxy failed: ${e?.message || e}`);
  }
}

export function useReverseEngineer(): UseReverseEngineerReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [currentJob, setCurrentJob] = useState<ReverseEngineerJob | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Start reverse-engineer job */
  const reverseEngineerFromScript = useCallback(async (
    projectId: string,
    scriptDocumentId: string,
  ): Promise<{ job_id: string }> => {
    setIsRunning(true);
    setCurrentJob(null);

    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase.functions.invoke('reverse-engineer-script', {
        body: { project_id: projectId, script_document_id: scriptDocumentId, user_id: userId },
      });
      if (error) throw error;
      if (!data?.job_id) throw new Error(data?.error || 'Failed to start reverse-engineering');

      const jobId = data.job_id as string;

      // Seed with initial pending state
      setCurrentJob({
        job_id: jobId,
        project_id: projectId,
        status: 'running',
        current_stage: data.stages?.[0]?.key ?? 'structure',
        stages: (data.stages || []).reduce((acc: Record<string, JobStage>, s: any) => {
          acc[s.key] = { key: s.key, label: s.label, status: 'pending' };
          return acc;
        }, {}),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Start polling via Vercel proxy (bypasses RLS issue in Supabase Edge Function)
      const poll = async () => {
        try {
          const result = await pollViaProxy({ job_id: jobId });
          setPollError(null);
          if (result && !('jobs' in result)) {
            const job = result as ReverseEngineerJob;
            setCurrentJob(job);
            if (job.status === 'done' || job.status === 'error') {
              setIsRunning(false);
              if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
              pollTimerRef.current = null;
              return;
            }
          }
        } catch (e: any) {
          console.warn('[reverse-engineer] poll error:', e?.message);
          setPollError(e?.message || 'Poll failed');
        }
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      };
      poll();

      return { job_id: jobId };
    } catch (e: any) {
      setIsRunning(false);
      throw new Error(e?.message || 'Failed to start reverse-engineering');
    }
  }, []);

  /** Poll a specific job's status (for external use) */
  const pollJobStatus = useCallback(async (jobId: string): Promise<ReverseEngineerJob | null> => {
    const result = await pollViaProxy({ job_id: jobId });
    if (!result || ('jobs' in result)) return null;
    return result as ReverseEngineerJob;
  }, []);

  /** Get all reverse-engineer jobs for a project */
  const getProjectJobs = useCallback(async (projectId: string): Promise<ReverseEngineerJob[]> => {
    const result = await pollViaProxy({ project_id: projectId });
    if (!result || !('jobs' in result)) return [];
    return result.jobs;
  }, []);

  return { reverseEngineerFromScript, pollJobStatus, getProjectJobs, isRunning, currentJob, pollError };
}
