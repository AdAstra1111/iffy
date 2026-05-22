import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, ChevronRight, Loader2 } from 'lucide-react';
import type { GraphMutationProposal } from '@/hooks/useGraphMutations';

// ── Props ──

export interface GraphMutationArbitrationPanelProps {
  proposals: GraphMutationProposal[];
  loading: boolean;
  error: string | null;
  onApprove: (proposalId: string) => Promise<boolean>;
  onReject: (proposalId: string, comment?: string) => Promise<boolean>;
  onApproveAll: () => Promise<boolean>;
  onRetry?: () => void;
}

// ── Mutation type labels ──

const MUTATION_LABELS: Record<string, string> = {
  create_entity: 'Create Entity',
  update_entity: 'Update Entity',
  merge_entities: 'Merge Entities',
  delete_entity: 'Delete Entity',
  create_relation: 'Create Relation',
  update_relation: 'Update Relation',
  delete_relation: 'Delete Relation',
};

function mutationLabel(type: string): string {
  return MUTATION_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Confidence color ──

function confidenceColor(score: number): string {
  if (score >= 0.8) return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
  if (score >= 0.5) return 'bg-amber-500/10 text-amber-600 border-amber-200';
  return 'bg-red-500/10 text-red-600 border-red-200';
}

// ── Status badge variant ──

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'applied':
      return 'default';
    case 'rejected':
      return 'destructive';
    case 'failed':
      return 'destructive';
    case 'approved':
      return 'secondary';
    default:
      return 'outline';
  }
}

// ── Skeleton card ──

function SkeletonCard() {
  return (
    <Card className="animate-pulse border-muted">
      <CardHeader className="pb-3">
        <div className="h-5 w-2/5 rounded bg-muted-foreground/10" />
        <div className="mt-2 h-4 w-3/5 rounded bg-muted-foreground/10" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-muted-foreground/10" />
          <div className="h-4 w-4/5 rounded bg-muted-foreground/10" />
          <div className="h-4 w-3/5 rounded bg-muted-foreground/10" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Mutation card ──

interface MutationCardProps {
  proposal: GraphMutationProposal;
  onApprove: (id: string) => void;
  onReject: (id: string, comment?: string) => void;
  approving: boolean;
  rejecting: boolean;
}

function MutationCard({ proposal, onApprove, onReject, approving, rejecting }: MutationCardProps) {
  const [showRejectComment, setShowRejectComment] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const { proposal_json, mutation_type, entity_type, proposal_status } = proposal;
  const { confidence, rationale, proposed_name, proposed_role } = proposal_json;
  const isPending = proposal_status === 'pending';
  const isResolved = !isPending;

  const handleReject = () => {
    if (showRejectComment && rejectComment.trim()) {
      onReject(proposal.id, rejectComment.trim());
    } else if (showRejectComment && !rejectComment.trim()) {
      onReject(proposal.id);
    } else {
      setShowRejectComment(true);
    }
  };

  return (
    <Card className={`border-l-4 transition-shadow hover:shadow-md ${
      proposal_status === 'applied' ? 'border-l-emerald-500' :
      proposal_status === 'rejected' ? 'border-l-red-500' :
      proposal_status === 'failed' ? 'border-l-amber-500' :
      'border-l-blue-500'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="truncate">{mutationLabel(mutation_type)}</span>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0">
                {entity_type}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              <span className="font-medium">{proposed_name}</span>
              {proposed_role ? <span className="text-muted-foreground"> &mdash; {proposed_role}</span> : null}
            </CardDescription>
          </div>
          <Badge className={`shrink-0 ${confidenceColor(confidence)}`} variant="outline">
            {Math.round(confidence * 100)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">{rationale}</p>

        {isResolved && proposal.review_comment && (
          <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium">Review comment:</span> {proposal.review_comment}
          </div>
        )}

        {proposal_status === 'failed' && proposal.error_log && (
          <div className="mt-3 rounded-md bg-red-500/5 px-3 py-2 text-xs text-red-600 font-mono whitespace-pre-wrap">
            {proposal.error_log}
          </div>
        )}

        {isPending && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={approving || rejecting}
              onClick={() => onApprove(proposal.id)}
            >
              {approving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={approving || rejecting}
              onClick={handleReject}
            >
              {rejecting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="mr-1 h-3.5 w-3.5" />
              )}
              {showRejectComment ? 'Reject with comment' : 'Reject'}
            </Button>
            {showRejectComment && (
              <div className="mt-2 w-full space-y-2">
                <Textarea
                  placeholder="Optional rejection reason..."
                  value={rejectComment}
                  onChange={e => setRejectComment(e.target.value)}
                  className="min-h-[60px] text-xs"
                  disabled={rejecting}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={rejecting}
                  onClick={() => onReject(proposal.id, rejectComment.trim())}
                >
                  {rejecting ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="mr-1 h-3.5 w-3.5" />
                  )}
                  Confirm Rejection
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Summary card (all-resolved state) ──

function ResolvedSummary({ proposals }: { proposals: GraphMutationProposal[] }) {
  const applied = proposals.filter(p => p.proposal_status === 'applied').length;
  const rejected = proposals.filter(p => p.proposal_status === 'rejected').length;
  const failed = proposals.filter(p => p.proposal_status === 'failed').length;

  return (
    <Card className="border-emerald-200 bg-emerald-50/50">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Check className="h-5 w-5 text-emerald-600" />
          <CardTitle className="text-base">All Proposals Resolved</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {applied > 0 && `${applied} applied`}
          {applied > 0 && (rejected > 0 || failed > 0) && ' \u00b7 '}
          {rejected > 0 && `${rejected} rejected`}
          {rejected > 0 && failed > 0 && ' \u00b7 '}
          {failed > 0 && `${failed} failed`}
          {applied === 0 && rejected === 0 && failed === 0 && 'No mutations were processed.'}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main component ──

export function GraphMutationArbitrationPanel({
  proposals,
  loading,
  error,
  onApprove,
  onReject,
  onApproveAll,
  onRetry,
}: GraphMutationArbitrationPanelProps) {
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [rejectingIds, setRejectingIds] = useState<Set<string>>(new Set());
  const [approveAllLoading, setApproveAllLoading] = useState(false);

  const pendingProposals = proposals.filter(p => p.proposal_status === 'pending');
  const hasResolved = proposals.length > 0 && pendingProposals.length === 0;
  const hasPending = pendingProposals.length > 0;

  const handleApprove = async (id: string) => {
    setApprovingIds(prev => new Set(prev).add(id));
    await onApprove(id);
    setApprovingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleReject = async (id: string, comment?: string) => {
    setRejectingIds(prev => new Set(prev).add(id));
    await onReject(id, comment);
    setRejectingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleApproveAll = async () => {
    setApproveAllLoading(true);
    await onApproveAll();
    setApproveAllLoading(false);
  };

  // ── Loading skeleton state ──
  if (loading && proposals.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // ── Error state ──
  if (error && proposals.length === 0) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <X className="h-8 w-8 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-600">Failed to load proposals</p>
            <p className="mt-1 text-xs text-red-500">{error}</p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Empty state ──
  if (proposals.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No graph mutation proposals yet.
        </CardContent>
      </Card>
    );
  }

  // ── All-resolved summary state ──
  if (hasResolved) {
    return <ResolvedSummary proposals={proposals} />;
  }

  // ── Normal pending state with proposals ──
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {proposals.length} proposal{proposals.length !== 1 && 's'}
          {hasPending && (
            <span className="ml-1">
              &mdash; <span className="font-medium text-foreground">{pendingProposals.length} pending</span>
            </span>
          )}
        </div>
        {hasPending && (
          <Button
            size="sm"
            variant="default"
            disabled={approveAllLoading}
            onClick={handleApproveAll}
          >
            {approveAllLoading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            Approve All ({pendingProposals.length})
          </Button>
        )}
      </div>

      {/* Proposals list */}
      <div className="space-y-3">
        {proposals.map(proposal => (
          <MutationCard
            key={proposal.id}
            proposal={proposal}
            onApprove={handleApprove}
            onReject={handleReject}
            approving={approvingIds.has(proposal.id)}
            rejecting={rejectingIds.has(proposal.id)}
          />
        ))}
      </div>

      {/* Inline loading indicator for background refresh */}
      {loading && proposals.length > 0 && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating...
        </div>
      )}
    </div>
  );
}