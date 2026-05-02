// useAudioExport — API hook for audio export pipeline
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

// ── Types ────────────────────────────────────────────────────────────────────
export interface AudioJobOptions {
  project_id: string;
  layers: {
    dialogue: boolean;
    sound: boolean;
    music: boolean;
    mix: boolean;
  };
  quality: 'draft' | 'production';
  range: 'full' | 'acts' | 'episodes';
  range_values?: number[];
  voice_overrides?: Record<string, string>;
}

export interface AudioJob {
  id: string;
  project_id: string;
  owner_id: string;
  status: 'queued' | 'running' | 'complete' | 'error' | 'no_job';
  progress_pct: number;
  message: string;
  output_url: string | null;
  created_at: string;
}

export interface AudioExportOptions extends AudioJobOptions {
  // Nothing extra — AudioJobOptions is the full interface
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useAudioExport() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [pollingJob, setPollingJob] = useState<AudioJob | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);

  // ── Create + dispatch job ─────────────────────────────────────────────────
  const startExport = useCallback(async (options: AudioJobOptions): Promise<string | null> => {
    if (!user) {
      toast.error('You must be logged in to export audio');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('audio-export', {
        body: options,
        method: 'POST',
      });

      if (error) {
        // Fallback: try direct fetch
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audio-export`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify(options),
        });
        const fallback = await res.json();
        if (!res.ok) throw new Error(fallback.error || 'Export failed');
        toast.success(fallback.message || 'Audio export started');
        return fallback.job_id;
      }

      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || 'Audio export started');
      return data?.job_id;
    } catch (err: any) {
      toast.error(err.message || 'Failed to start audio export');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ── Poll job status ─────────────────────────────────────────────────────
  const pollJob = useCallback(async (projectId: string): Promise<AudioJob | null> => {
    setPollingError(null);
    try {
      // Use the proxy route — /api/audio-export polls the edge function
      const { data, error } = await supabase.functions.invoke('audio-export', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        // Supabase Edge Functions don't support query params via invoke — use searchParams workaround
      });

      // Fallback: direct fetch with session token
      const session = (await supabase.auth.getSession()).data.session;
      const params = new URLSearchParams({ project_id: projectId });
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audio-export?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Poll failed: ${res.status}`);
      }

      const job: AudioJob = await res.json();
      setPollingJob(job);
      return job;
    } catch (err: any) {
      setPollingError(err.message);
      return null;
    }
  }, []);

  // ── Start polling ───────────────────────────────────────────────────────
  const startPolling = useCallback((projectId: string, intervalMs = 5000) => {
    setPollingJob(null);
    setPollingError(null);

    // Immediate first poll
    pollJob(projectId);

    const interval = setInterval(() => {
      pollJob(projectId).then(job => {
        if (job && (job.status === 'complete' || job.status === 'error')) {
          clearInterval(interval);
          if (job.status === 'complete') {
            toast.success('Audio export complete! Download ready.');
          } else {
            toast.error(`Export error: ${job.message}`);
          }
        }
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [pollJob]);

  return {
    loading,
    pollingJob,
    pollingError,
    startExport,
    pollJob,
    startPolling,
  };
}
