/**
 * CascadePanel — Canon Cascade status UI
 * Shows active cascade job, downstream targets, upstream flagged docs.
 * Reads from canon-cascade-status edge function.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Clock, Flag, GitBranch } from 'lucide-react';

interface CascadeTarget {
  id: string;
  target_doc_id: string;
  target_doc_type: string;
  direction: 'upstream' | 'downstream';
  cascade_order: number;
  status: string;
  sr_status: string | null;
  sr_score: number | null;
  promotion_allowed: boolean | null;
  override_allowed: boolean | null;
  ci_score: number | null;
  gp_score: number | null;
  composite_score: number | null;
  error_message: string | null;
  new_version_id: string | null;
  retry_count: number;
}

interface CascadeJob {
  id: string;
  project_id: string;
  trigger_doc_type: string;
  trigger_version_id: string;
  direction: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CascadeProgress {
  total: number;
  pending: number;
  regenerating: number;
  approved: number;
  blocked: number;
  failed: number;
  flagged: number;
  paused: number;
}

interface CascadeStatusResponse {
  ok: boolean;
  job: CascadeJob | null;
  targets: CascadeTarget[];
  progress: CascadeProgress;
}

interface CascadePanelProps {
  projectId: string;
}

// ── Status badge helpers ──────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'approved':   return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Approved</Badge>;
    case 'regenerating': return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Regenerating</Badge>;
    case 'pending':    return <Badge className="bg-muted/40 text-muted-foreground border-border text-xs">Pending</Badge>;
    case 'paused':     return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Paused</Badge>;
    case 'blocked':    return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">Blocked</Badge>;
    case 'failed':     return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Failed</Badge>;
    case 'flagged':    return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs flex items-center gap-1"><Flag className="w-3 h-3" />Flagged</Badge>;
    default:           return <Badge className="text-xs">{status}</Badge>;
  }
}

function srStatusBadge(srStatus: string | null) {
  if (!srStatus) return null;
  switch (srStatus) {
    case 'READY':       return <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">SR: Ready</Badge>;
    case 'AT_RISK':     return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs">SR: At Risk</Badge>;
    case 'BLOCKED':     return <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs">SR: Blocked</Badge>;
    case 'UNSCORABLE':  return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">SR: Unscorable</Badge>;
    default:            return <Badge className="text-xs">SR: {srStatus}</Badge>;
  }
}

function jobStatusBadge(status: string) {
  switch (status) {
    case 'active':    return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Active</Badge>;
    case 'complete':  return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Complete</Badge>;
    case 'paused':    return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Paused — Review Required</Badge>;
    case 'cancelled': return <Badge className="bg-muted/40 text-muted-foreground border-border">Cancelled</Badge>;
    default:          return <Badge>{status}</Badge>;
  }
}

function docTypeLabel(docType: string): string {
  return docType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ── Main Component ────────────────────────────────────────────────────────

export function CascadePanel({ projectId }: CascadePanelProps) {
  const { data, isLoading, error } = useQuery<CascadeStatusResponse>({
    queryKey: ['canon-cascade-status', projectId],
    queryFn: async () => {
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/canon-cascade-status?projectId=${projectId}`,
        {
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      return resp.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as CascadeStatusResponse | undefined;
      // Poll more frequently while active
      if (data?.job?.status === 'active') return 3000;
      if (data?.job?.status === 'paused') return 10000;
      return false;
    },
    staleTime: 2000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading cascade state...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 text-sm p-4">
        Failed to load cascade status: {(error as Error).message}
      </div>
    );
  }

  if (!data?.job) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
        <GitBranch className="w-8 h-8 mx-auto opacity-30" />
        <p className="font-medium">No active canon cascade</p>
        <p className="text-xs opacity-60">A cascade starts automatically when a canonical document is promoted.</p>
      </div>
    );
  }

  const { job, targets, progress } = data;
  const downstream = targets.filter(t => t.direction === 'downstream');
  const upstream = targets.filter(t => t.direction === 'upstream');

  return (
    <div className="space-y-4">
      {/* Job header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Canon Cascade
            </CardTitle>
            {jobStatusBadge(job.status)}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <div className="text-xs text-muted-foreground">
            Trigger: <span className="text-foreground font-medium">{docTypeLabel(job.trigger_doc_type)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Direction: <span className="text-foreground">{job.direction}</span>
          </div>
          {/* Progress bar */}
          <div className="flex gap-1 mt-3 flex-wrap text-xs">
            {progress.approved > 0 && <span className="text-green-400">{progress.approved} approved</span>}
            {progress.regenerating > 0 && <span className="text-blue-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{progress.regenerating} regenerating</span>}
            {progress.pending > 0 && <span className="text-muted-foreground">{progress.pending} pending</span>}
            {progress.flagged > 0 && <span className="text-purple-400">{progress.flagged} flagged</span>}
            {progress.paused > 0 && <span className="text-yellow-400">{progress.paused} paused</span>}
            {progress.blocked > 0 && <span className="text-orange-400">{progress.blocked} blocked</span>}
            {progress.failed > 0 && <span className="text-red-400">{progress.failed} failed</span>}
          </div>
          {/* Human action prompts */}
          {job.status === 'paused' && (
            <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md text-xs text-yellow-300">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              <strong>Cascade paused — review required.</strong> A target did not pass stage readiness. Review the blocked document before resuming.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Downstream targets */}
      {downstream.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            Downstream — Auto-Regenerate ({downstream.length})
          </h4>
          {downstream.map((target) => (
            <TargetRow key={target.id} target={target} />
          ))}
        </div>
      )}

      {/* Upstream flagged */}
      {upstream.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            Upstream — Flagged for Re-review ({upstream.length})
          </h4>
          <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-md text-xs text-purple-300">
            <Flag className="w-3 h-3 inline mr-1" />
            These documents contributed canon to the changed doc. Review them manually — their approved versions are now stale.
          </div>
          {upstream.map((target) => (
            <TargetRow key={target.id} target={target} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Target Row ────────────────────────────────────────────────────────────

function TargetRow({ target }: { target: CascadeTarget }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-medium truncate">{docTypeLabel(target.target_doc_type)}</span>
            <span className="text-xs text-muted-foreground shrink-0">#{target.cascade_order + 1}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {statusBadge(target.status)}
            {srStatusBadge(target.sr_status)}
          </div>
        </div>
        {/* Score row */}
        {(target.ci_score != null || target.sr_score != null) && (
          <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
            {target.sr_score != null && (
              <span>SR <span className="text-foreground font-medium">{target.sr_score}</span></span>
            )}
            {target.ci_score != null && (
              <span>CI <span className="text-foreground">{target.ci_score}</span></span>
            )}
            {target.gp_score != null && (
              <span>GP <span className="text-foreground">{target.gp_score}</span></span>
            )}
            {target.promotion_allowed != null && (
              <span>
                {target.promotion_allowed
                  ? <span className="text-green-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Promotion OK</span>
                  : <span className="text-yellow-400 flex items-center gap-0.5"><XCircle className="w-3 h-3" /> Promotion blocked</span>
                }
              </span>
            )}
          </div>
        )}
        {target.error_message && (
          <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
            {target.error_message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
