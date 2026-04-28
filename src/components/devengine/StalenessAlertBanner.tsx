import { X, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Link } from 'react-router-dom';
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

interface Props {
  stalledJobs: AutoRunJob[];
  onDismiss: (jobId: string) => void;
}

export function StalenessAlertBanner({ stalledJobs, onDismiss }: Props) {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-amber-400">
              ⚠️ {stalledJobs.length} autorun{stalledJobs.length !== 1 ? 's' : ''} stalled
            </span>
            <span className="text-xs text-muted-foreground">—</span>
            {stalledJobs.slice(0, 5).map((job, i) => (
              <span key={job.id} className="text-xs text-muted-foreground">
                {i > 0 && ', '}
                <Link
                  to={`/projects/${job.project_id}`}
                  className="hover:text-amber-300 transition-colors underline underline-offset-2"
                >
                  {job.project_name ?? job.project_id}
                </Link>
                {' '}
                <span className="text-amber-400/70">({relativeTime(job.last_step_at)})</span>
              </span>
            ))}
            {stalledJobs.length > 5 && (
              <span className="text-xs text-muted-foreground">
                +{stalledJobs.length - 5} more
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => stalledJobs.forEach(j => onDismiss(j.id))}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}
