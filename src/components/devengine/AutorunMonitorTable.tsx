import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getStalenessStatus } from '@/hooks/useAllAutoRunJobs';
import { supabase } from '@/lib/supabase';
import type { AutoRunJob } from '@/hooks/useAllAutoRunJobs';

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusDot({ job }: { job: AutoRunJob }) {
  const status = getStalenessStatus(job);
  const dot =
    status === 'active'  ? 'bg-emerald-400' :
    status === 'stalled' ? 'bg-amber-400' :
    status === 'failed'  ? 'bg-red-500' :
    'bg-muted-foreground/30';
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`}
      title={status}
    />
  );
}

function StageLabel({ job }: { job: AutoRunJob }) {
  const stageIndex = job.current_stage_index;
  const history = job.stage_history ?? [];
  const entry = history.find(e => e.status === 'in_progress') ?? history[history.length - 1];
  const docType = entry?.doc_type ?? job.current_document;
  const label = docType
    ? docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : `Stage ${stageIndex}`;
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className="text-xs font-normal">
        #{stageIndex}
      </Badge>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function LockCell({ job }: { job: AutoRunJob }) {
  const lockExpiry = job.lock_expires_at;
  if (!lockExpiry) return <span className="text-xs text-muted-foreground">—</span>;
  const expired = new Date(lockExpiry).getTime() < Date.now();
  return (
    <span className={`text-xs ${expired ? 'text-red-400' : 'text-muted-foreground/60'}`}>
      {relativeTime(lockExpiry)}
    </span>
  );
}

type Filter = 'all' | 'running' | 'stalled' | 'failed' | 'completed';

interface Props {
  jobs: AutoRunJob[];
  filter: Filter;
}

export function AutorunMonitorTable({ jobs, filter }: Props) {
  const queryClient = useQueryClient();
  const filtered = useMemo(() => {
    if (filter === 'all') return jobs;
    if (filter === 'running') return jobs.filter(j => getStalenessStatus(j) === 'active');
    if (filter === 'stalled') return jobs.filter(j => getStalenessStatus(j) === 'stalled');
    if (filter === 'failed') return jobs.filter(j => getStalenessStatus(j) === 'failed');
    if (filter === 'completed') return jobs.filter(j => getStalenessStatus(j) === 'completed' || getStalenessStatus(j) === 'paused');
    return jobs;
  }, [jobs, filter]);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No jobs match this filter.
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8">Status</TableHead>
            <TableHead className="w-10">Actions</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Current Doc</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Steps</TableHead>
            <TableHead>CI</TableHead>
            <TableHead>GP</TableHead>
            <TableHead>Last Step</TableHead>
            <TableHead>Lock</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map(job => (
            <TableRow key={job.id}>
              <TableCell><StatusDot job={job} /></TableCell>
              <TableCell>
                {(() => {
                  const isRunningOrPaused = job.status === 'running' || job.status === 'paused';
                  if (isRunningOrPaused) {
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50"
                        onClick={async () => {
                          await supabase
                            .from('auto_run_jobs')
                            .update({ status: 'stopped', stop_reason: 'user_stopped' })
                            .eq('id', job.id);
                          queryClient.invalidateQueries({ queryKey: ['all-auto-run-jobs'] });
                        }}
                      >
                        Stop
                      </Button>
                    );
                  }
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground border-border/30 hover:bg-muted hover:text-foreground"
                      onClick={async () => {
                        await supabase.from('auto_run_jobs').delete().eq('id', job.id);
                        queryClient.invalidateQueries({ queryKey: ['all-auto-run-jobs'] });
                      }}
                    >
                      Delete
                    </Button>
                  );
                })()}
              </TableCell>
              <TableCell>
                <Link
                  to={`/projects/${job.project_id}`}
                  className="text-sm font-medium hover:text-primary transition-colors"
                >
                  {job.project_name ?? job.project_id}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {job.mode ?? '—'}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {job.current_document
                    ? job.current_document.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                    : '—'}
                </span>
              </TableCell>
              <TableCell><StageLabel job={job} /></TableCell>
              <TableCell>
                <span className="text-xs tabular-nums">
                  {job.step_count ?? 0}
                </span>
              </TableCell>
              <TableCell>
                <span className={`text-xs tabular-nums ${job.last_ci != null ? '' : 'text-muted-foreground'}`}>
                  {job.last_ci != null ? job.last_ci.toFixed(2) : '—'}
                </span>
              </TableCell>
              <TableCell>
                <span className={`text-xs tabular-nums ${job.last_gp != null ? '' : 'text-muted-foreground'}`}>
                  {job.last_gp != null ? job.last_gp.toFixed(2) : '—'}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(job.last_step_at)}
                </span>
              </TableCell>
              <TableCell><LockCell job={job} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
