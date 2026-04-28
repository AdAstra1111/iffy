/**
 * ReverseEngineerContext — singleton provider for reverse-engineer state.
 *
 * Problem solved: DocumentSidebar and ReverseEngineerCallout each called
 * useReverseEngineer() independently, giving them separate React state trees.
 * Starting a job from the Sidebar meant the Callout never saw it.
 *
 * Solution: lift all hook logic into this context provider (mounted once in App.tsx).
 * Both components call useReverseEngineerContext() and share the same state.
 */
import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── Types (re-exported so consumers don't need to import from the hook) ─────

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

export interface ReverseEngineerContextValue {
  reverseEngineerFromScript: (projectId: string, scriptDocumentId: string) => Promise<{ job_id: string }>;
  pollJobStatus: (jobId: string) => Promise<ReverseEngineerJob | null>;
  getProjectJobs: (projectId: string) => Promise<ReverseEngineerJob[]>;
  isRunning: boolean;
  currentJob: ReverseEngineerJob | null;
  pollError: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const STATUS_PROXY_URL = '/api/re_status';

// ─── Internal helpers ────────────────────────────────────────────────────────

async function pollViaProxy(
  body: { job_id?: string; project_id?: string },
): Promise<ReverseEngineerJob | { jobs: ReverseEngineerJob[] } | null> {
  try {
    const res = await fetch(STATUS_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let errMsg = `Proxy error ${res.status}`;
      try {
        const errBody = await res.json();
        errMsg = errBody?.error || errMsg;
      } catch { /* ignore */ }
      throw new Error(errMsg);
    }
    return res.json();
  } catch (e: any) {
    throw new Error(`pollViaProxy failed: ${e?.message || e}`);
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ReverseEngineerContext = createContext<ReverseEngineerContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ReverseEngineerProvider({ children }: { children: ReactNode }) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentJob, setCurrentJob] = useState<ReverseEngineerJob | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reverseEngineerFromScript = useCallback(async (
    projectId: string,
    scriptDocumentId: string,
  ): Promise<{ job_id: string }> => {
    // Clear any existing poll loop before starting a new job
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

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

      // Seed with initial pending state so UI shows immediately
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

  const pollJobStatus = useCallback(async (jobId: string): Promise<ReverseEngineerJob | null> => {
    const result = await pollViaProxy({ job_id: jobId });
    if (!result || ('jobs' in result)) return null;
    return result as ReverseEngineerJob;
  }, []);

  const getProjectJobs = useCallback(async (projectId: string): Promise<ReverseEngineerJob[]> => {
    const result = await pollViaProxy({ project_id: projectId });
    if (!result || !('jobs' in result)) return [];
    return result.jobs;
  }, []);

  return (
    <ReverseEngineerContext.Provider
      value={{ reverseEngineerFromScript, pollJobStatus, getProjectJobs, isRunning, currentJob, pollError }}
    >
      {children}
    </ReverseEngineerContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useReverseEngineerContext(): ReverseEngineerContextValue {
  const ctx = useContext(ReverseEngineerContext);
  if (!ctx) {
    throw new Error(
      'useReverseEngineerContext must be used inside <ReverseEngineerProvider>. ' +
      'Make sure it is mounted in App.tsx.',
    );
  }
  return ctx;
}
