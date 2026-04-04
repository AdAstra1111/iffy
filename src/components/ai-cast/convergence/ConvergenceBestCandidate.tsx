/**
 * ConvergenceBestCandidate — Spotlights the current leader with promotion CTA.
 * Shows image, score, score band, confidence, selection rationale, and promote action.
 */
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Crown, TrendingUp, Sparkles, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import {
  type ConvergenceCandidate,
  type ConvergenceRun,
  checkCandidatePromotionEligibility,
  usePromoteCandidate,
} from '@/lib/aiCast/convergenceEngine';

interface Props {
  candidate: ConvergenceCandidate | null;
  roundNumber: number;
  run?: ConvergenceRun | null;
}

function bandGradient(band: string | null): string {
  switch (band) {
    case 'elite': return 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20';
    case 'stable': return 'from-primary/10 to-primary/5 border-primary/20';
    case 'promising': return 'from-amber-500/10 to-amber-500/5 border-amber-500/20';
    default: return 'from-muted to-muted/50 border-border/50';
  }
}

function bandColor(band: string | null): string {
  switch (band) {
    case 'elite': return 'text-emerald-400';
    case 'stable': return 'text-primary';
    case 'promising': return 'text-amber-400';
    default: return 'text-muted-foreground';
  }
}

export function ConvergenceBestCandidate({ candidate, roundNumber, run }: Props) {
  const navigate = useNavigate();
  const promoteMutation = usePromoteCandidate();

  if (!candidate) return null;

  const imgUrl = candidate.asset?.public_url;
  const eligibility = checkCandidatePromotionEligibility(candidate, run || null);
  const isPromoted = candidate.selection_status === 'promoted';
  const isRunCompleted = run?.status === 'completed';

  return (
    <div className={cn(
      'rounded-xl border bg-gradient-to-br overflow-hidden',
      bandGradient(candidate.score_band),
    )}>
      <div className="flex gap-4 p-3">
        {/* Image */}
        {imgUrl && (
          <div className="w-20 h-24 rounded-lg overflow-hidden shrink-0 border border-border/30">
            <img src={imgUrl} alt="Best candidate" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-display font-semibold text-foreground">Current Leader</span>
            {isPromoted && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] h-4 px-1.5">
                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                Promoted
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {candidate.score !== null && (
              <div className="flex items-baseline gap-1">
                <span className={cn('text-2xl font-display font-bold tabular-nums', bandColor(candidate.score_band))}>
                  {Number(candidate.score).toFixed(0)}
                </span>
                {candidate.score_band && (
                  <span className={cn('text-xs font-medium', bandColor(candidate.score_band))}>
                    {candidate.score_band}
                  </span>
                )}
              </div>
            )}
            {candidate.confidence && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {candidate.confidence} confidence
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <TrendingUp className="w-3 h-3 shrink-0" />
            <span>Round {roundNumber} · Rank #{candidate.rank_position || '—'}</span>
          </div>

          {candidate.selection_rationale && (
            <p className="text-[11px] text-muted-foreground/80 line-clamp-2">
              {candidate.selection_rationale}
            </p>
          )}
        </div>
      </div>

      {/* Promotion CTA */}
      {eligibility.eligible && !isPromoted && (
        <div className="px-3 pb-3 pt-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="w-full gap-2 h-9 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-medium"
                disabled={promoteMutation.isPending}
              >
                {promoteMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Promote to AI Actor
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Promote to Reusable AI Actor</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>
                    This will create a new reusable AI Actor from this convergence result.
                    The actor will be assigned a roster number and registered in your actor library.
                  </p>
                  <div className="text-xs space-y-1 pt-2 text-muted-foreground">
                    <div>• Score: <span className="text-foreground font-medium">{Number(candidate.score).toFixed(0)} ({candidate.score_band})</span></div>
                    <div>• Confidence: <span className="text-foreground font-medium">{candidate.confidence || 'N/A'}</span></div>
                    <div>• Mode: <span className="text-foreground font-medium">{run?.mode === 'reference_locked' ? 'Reference-Locked' : 'Exploratory'}</span></div>
                    <div>• Full convergence provenance will be preserved</div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => promoteMutation.mutate({
                    candidateId: candidate.id,
                    runId: run?.id,
                  })}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Promote Actor
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {isPromoted && (
        <div className="px-3 pb-3 pt-0 space-y-2">
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg p-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>This candidate has been promoted to a reusable AI Actor</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 h-8 text-xs"
            onClick={() => navigate('/ai-cast/actors')}
          >
            <ExternalLink className="w-3 h-3" />
            View in Actor Library
          </Button>
        </div>
      )}

      {!eligibility.eligible && !isPromoted && isRunCompleted && (
        <div className="px-3 pb-3 pt-0">
          <div className="text-[11px] text-muted-foreground/60 italic">
            {eligibility.reason}
          </div>
        </div>
      )}
    </div>
  );
}
