/**
 * VisualExecutionReviewPanel — Post-execution quality review UI.
 *
 * Allows human review of generated visual outputs per execution.
 * Shows review state, accepts input for acceptance/rejection/revision.
 * No auto-approval — all review decisions are human-driven.
 */
import { useState } from 'react';
import { useVisualExecutionReview, isReviewAccepted, isReviewRejected, isReviewPending } from '@/hooks/useVisualExecutionReview';
import { REVIEW_STATES } from '@/lib/visual/visualExecutionProvenanceTypes';
import type { ExecutionProvenanceRow } from '@/lib/visual/visualExecutionProvenanceTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, RotateCcw, MessageSquare, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react';
import { VisualPanelErrorBoundary } from './VisualPanelErrorBoundary';

interface Props {
  execution: ExecutionProvenanceRow;
  onReviewComplete?: () => void;
}

/** Review state badge configuration. */
const REVIEW_BADGE: Record<string, { label: string; className: string }> = {
  pending_review: { label: 'Pending Review', className: 'border-amber-500/30 text-amber-600 bg-amber-500/10' },
  accepted: { label: 'Accepted', className: 'border-green-500/30 text-green-600 bg-green-500/10' },
  rejected: { label: 'Rejected', className: 'border-red-500/30 text-red-600 bg-red-500/10' },
  needs_revision: { label: 'Needs Revision', className: 'border-orange-500/30 text-orange-600 bg-orange-500/10' },
};

export function VisualExecutionReviewPanel({ execution, onReviewComplete }: Props) {
  const { review, reviewing } = useVisualExecutionReview();
  const [reviewNotes, setReviewNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const currentState = execution.review_state || 'pending_review';
  const badge = REVIEW_BADGE[currentState] || REVIEW_BADGE.pending_review;

  const handleReview = async (reviewState: string) => {
    setAction(reviewState);
    setResultMsg(null);
    const result = await review({
      executionId: execution.id,
      reviewState,
      reviewNotes: reviewNotes.trim() || undefined,
    });
    if (result.success) {
      setResultMsg(
        reviewState === 'accepted' ? 'Outputs accepted' :
        reviewState === 'rejected' ? 'Outputs rejected' :
        reviewState === 'needs_revision' ? 'Flagged for revision' :
        'Review reset'
      );
      setShowNotes(false);
      setReviewNotes('');
      if (onReviewComplete) onReviewComplete();
    } else {
      setResultMsg(`Error: ${result.error}`);
    }
    setAction(null);
  };

  // Determine what states can transition to
  const canAccept = currentState !== 'accepted';
  const canReject = currentState !== 'rejected';
  const canRevision = currentState !== 'needs_revision';
  const canReset = currentState !== 'pending_review';

  return (
    <VisualPanelErrorBoundary panelLabel="VisualExecutionReviewPanel" compact>
      <div className="border border-border/20 rounded p-2.5 space-y-2 bg-muted/[0.02]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-foreground/70">Quality Review</span>
          <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${badge.className}`}>
            {badge.label}
          </Badge>
        </div>
      </div>

      {/* Review notes display */}
      {execution.review_notes && (
        <div className="text-[9px] text-muted-foreground/70 italic px-1 py-0.5 bg-muted/10 rounded">
          "{execution.review_notes}"
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5">
        {canAccept && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[9px] gap-1 text-green-600 hover:text-green-700 hover:bg-green-500/10"
            onClick={() => handleReview('accepted')}
            disabled={reviewing}
          >
            {reviewing && action === 'accepted' ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <ThumbsUp className="h-2.5 w-2.5" />
            )}
            Accept
          </Button>
        )}
        {canReject && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[9px] gap-1 text-red-600 hover:text-red-700 hover:bg-red-500/10"
            onClick={() => handleReview('rejected')}
            disabled={reviewing}
          >
            {reviewing && action === 'rejected' ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <ThumbsDown className="h-2.5 w-2.5" />
            )}
            Reject
          </Button>
        )}
        {canRevision && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[9px] gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-500/10"
            onClick={() => handleReview('needs_revision')}
            disabled={reviewing}
          >
            {reviewing && action === 'needs_revision' ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <RotateCcw className="h-2.5 w-2.5" />
            )}
            Needs Revision
          </Button>
        )}
        {canReset && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[9px] gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => handleReview('pending_review')}
            disabled={reviewing}
          >
            {reviewing && action === 'pending_review' ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <RefreshCw className="h-2.5 w-2.5" />
            )}
            Reset
          </Button>
        )}
        {!showNotes && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[9px] gap-1 text-muted-foreground"
            onClick={() => setShowNotes(true)}
          >
            <MessageSquare className="h-2.5 w-2.5" />
            Notes
          </Button>
        )}
      </div>

      {/* Review notes input */}
      {showNotes && (
        <div className="space-y-1">
          <input
            type="text"
            className="w-full text-[10px] px-2 py-1 rounded border border-border/30 bg-background placeholder:text-muted-foreground/40"
            placeholder="Optional review notes..."
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && reviewNotes.trim()) {
                // Submit notes with current intent
              }
            }}
          />
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[8px] text-muted-foreground"
              onClick={() => { setShowNotes(false); setReviewNotes(''); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Result message */}
      {resultMsg && (
        <div className={`text-[9px] px-1 py-0.5 rounded ${
          resultMsg.startsWith('Error')
            ? 'text-red-600 bg-red-500/10'
            : 'text-green-600 bg-green-500/10'
        }`}>
          {resultMsg}
        </div>
      )}

      {/* Asset summary */}
      {execution.generated_asset_ids && execution.generated_asset_ids.length > 0 && (
        <div className="text-[8px] text-muted-foreground/50 pt-1 border-t border-border/10">
          {execution.generated_asset_ids.length} asset(s) — {isReviewAccepted(execution.review_state) ? 'accepted' : isReviewRejected(execution.review_state) ? 'rejected' : isReviewPending(execution.review_state) ? 'pending review' : execution.review_state}
        </div>
      )}
    </div>
    </VisualPanelErrorBoundary>
  );
}