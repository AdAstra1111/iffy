import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AutoRunStageHistoryEntry {
  doc_type: string;
  base_version_id: string | null;
  output_version_id: string | null;
  started_at: string;
  completed_at: string | null;
  status: 'completed' | 'failed' | 'skipped' | 'in_progress';
}

export interface AutoRunJob {
  id: string;
  user_id: string;
  project_id: string;
  status: 'queued' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
  mode: 'fast' | 'balanced' | 'premium';
  start_document: string;
  target_document: string;
  current_document: string;
  max_stage_loops: number;
  max_total_steps: number;
  step_count: number;
  stage_loop_count: number;
  last_ci: number | null;
  last_gp: number | null;
  last_gap: number | null;
  last_readiness: number | null;
  last_confidence: number | null;
  last_risk_flags: string[];
  stop_reason: string | null;
  error: string | null;
  pending_decisions: unknown[] | null;
  awaiting_approval: boolean;
  approval_type: string | null;
  approval_payload: unknown;
  pending_doc_id: string | null;
  pending_version_id: string | null;
  pending_doc_type: string | null;
  pending_next_doc_type: string | null;
  follow_latest: boolean;
  resume_document_id: string | null;
  resume_version_id: string | null;
  pipeline_key: string | null;
  current_stage_index: number;
  stage_history: AutoRunStageHistoryEntry[];
  pinned_inputs: Record<string, string>;
  last_ui_message: string | null;
  approval_required_for_doc_type: string | null;
  pause_reason: string | null;
  converge_target_json: { ci: number; gp: number };
  stage_exhaustion_remaining: number;
  stage_exhaustion_default: number;
  allow_defaults: boolean;
  is_processing: boolean;
  max_versions_per_doc_per_job: number | null;
  processing_started_at: string | null;
  frontier_version_id: string | null;
  best_document_id: string | null;
  frontier_ci: number | null;
  frontier_gp: number | null;
  frontier_attempts: number;
  lock_expires_at: string | null;
  created_at: string;
  updated_at: string;
  last_step_at: string | null;
  // joined
  project_name?: string;
}

export type StalenessStatus = 'active' | 'stalled' | 'failed' | 'completed' | 'paused';

export function getStalenessStatus(job: AutoRunJob): StalenessStatus {
  if (job.status === 'failed' || job.status === 'stopped') return 'failed';
  if (job.status === 'completed') return 'completed';
  if (job.status === 'paused') return 'paused';
  if (job.is_processing && job.last_step_at) {
    const age = Date.now() - new Date(job.last_step_at).getTime();
    if (age < 5 * 60 * 1000) return 'active';
    return 'stalled';
  }
  if (!job.is_processing && job.last_step_at) {
    const age = Date.now() - new Date(job.last_step_at).getTime();
    if (age >= 15 * 60 * 1000) return 'stalled';
    return 'active';
  }
  return 'stalled';
}

async function fetchAllAutoRunJobs(): Promise<AutoRunJob[]> {
  const { data, error } = await supabase
    .from('auto_run_jobs')
    .select(`
      *,
      last_step_at
    `)
    .order('last_step_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  // Fetch project names separately (join-safe approach)
  const projectIds = [...new Set((data ?? []).map(j => j.project_id).filter(Boolean))];
  let projectNames: Record<string, string> = {};

  if (projectIds.length > 0) {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds);
    if (projects) {
      projectNames = Object.fromEntries(projects.map(p => [p.id, p.name]));
    }
  }

  return (data ?? []).map(job => ({
    ...job,
    project_name: projectNames[job.project_id] ?? job.project_id,
  }));
}

export function useAllAutoRunJobs() {
  return useQuery({
    queryKey: ['all-auto-run-jobs'],
    queryFn: fetchAllAutoRunJobs,
    staleTime: 1000 * 30, // 30s
  });
}
