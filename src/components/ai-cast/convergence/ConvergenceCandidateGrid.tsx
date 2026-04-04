import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, Loader2, XCircle, AlertTriangle, Crown, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  type ConvergenceCandidate,
  type ConvergenceRun,
  checkCandidatePromotionEligibility,
  usePromoteCandidate,
} from '@/lib/aiCast/convergenceEngine';

interface Props {
  candidates: ConvergenceCandidate[];
  bestCandidateId?: string | null;
  run?: ConvergenceRun | null;
}

function scoreBandColor(band: string | null): string {
  switch (band) {
    case 'elite': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'stable': return 'bg-primary/20 text-primary border-primary/30';
    case 'promising': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'weak': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-muted text-muted-foreground border-border/50';
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    queued: 'Queued',
    generating: 'Generating',
    generated: 'Generated',
    validating: 'Validating',
    scoring: 'Scoring',
    scored: 'Scored',
    keeper: 'Keeper',
    rejected: 'Rejected',
    promoted: 'Promoted',
    failed: 'Failed',
  };
  return map[status] || status;
}

function CandidateCard({
  candidate,
  isBest,
  run,
}: {
  candidate: ConvergenceCandidate;
  isBest: boolean;
  run?: ConvergenceRun | null;
}) {
  const imgUrl = candidate.asset?.public_url;
  const isActive = ['queued', 'generating', 'validating', 'scoring'].includes(candidate.status);
  const isKeeper = candidate.selection_status === 'keeper';
  const isPromoted = candidate.selection_status === 'promoted';
  const hasFails = (candidate.hard_fail_codes?.length || 0) > 0;

  const promoteMutation = usePromoteCandidate();
  const eligibility = checkCandidatePromotionEligibility(candidate, run || null);
  const showPromote = eligibility.eligible && !isPromoted && !isBest; // Best gets promoted from spotlight

  return (
    <div className={cn(
      'relative rounded-xl border overflow-hidden bg-card/60 backdrop-blur-sm transition-all group',
      isBest ? 'ring-2 ring-primary/40 border-primary/30' :
      isPromoted ? 'ring-1 ring-emerald-500/30 border-emerald-500/30' :
      isKeeper ? 'border-amber-500/30' :
      hasFails ? 'border-red-500/20' :
      'border-border/50',
    )}>
      {/* Image */}
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={`Candidate ${candidate.candidate_index + 1}`}
          className="w-full aspect-[3/4] object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-[3/4] bg-muted/20 flex items-center justify-center">
          {isActive ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-[10px] text-muted-foreground">{statusLabel(candidate.status)}</span>
            </div>
          ) : candidate.status === 'failed' ? (
            <XCircle className="w-5 h-5 text-destructive/50" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-muted-foreground/10" />
          )}
        </div>
      )}

      {/* Top-left: rank */}
      {candidate.rank_position && (
        <div className="absolute top-2 left-2">
          <div className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
            candidate.rank_position === 1
              ? 'bg-primary/90 text-primary-foreground'
              : 'bg-card/80 backdrop-blur-sm text-foreground border border-border/50',
          )}>
            {candidate.rank_position}
          </div>
        </div>
      )}

      {/* Top-right: keeper/best badges */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
        {isBest && (
          <div className="p-1 rounded-md bg-primary/90">
            <Crown className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
        )}
        {isPromoted && (
          <div className="p-1 rounded-md bg-emerald-500/90">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        {isKeeper && !isBest && !isPromoted && (
          <div className="p-1 rounded-md bg-amber-500/20 backdrop-blur-sm">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
          </div>
        )}
      </div>

      {/* Bottom overlay */}
      {(candidate.score !== null || hasFails || showPromote || isPromoted) && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-2 pt-6">
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-1">
              {hasFails && (
                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 w-fit">
                  <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                  {candidate.hard_fail_codes.join(', ')}
                </Badge>
              )}
              {isPromoted && (
                <Badge className="bg-emerald-500/80 text-white text-[9px] px-1 py-0 h-4 w-fit border-0">
                  <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                  Promoted
                </Badge>
              )}
              {showPromote && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 text-[10px] px-2 gap-1 bg-white/10 hover:bg-white/20 text-white border-0"
                  disabled={promoteMutation.isPending}
                  onClick={() => promoteMutation.mutate({ candidateId: candidate.id, runId: run?.id })}
                >
                  {promoteMutation.isPending ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-2.5 h-2.5" />
                  )}
                  Promote
                </Button>
              )}
            </div>
            {candidate.score !== null && (
              <div className="flex flex-col items-end gap-0.5">
                <Badge className={cn('text-[10px] px-1.5 py-0 h-5 border', scoreBandColor(candidate.score_band))}>
                  {Number(candidate.score).toFixed(0)}
                </Badge>
                {candidate.confidence && (
                  <span className={cn(
                    'text-[9px] font-medium',
                    candidate.confidence === 'high' ? 'text-emerald-300' :
                    candidate.confidence === 'low' ? 'text-red-300' :
                    'text-white/60',
                  )}>
                    {candidate.confidence} conf.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConvergenceCandidateGrid({ candidates, bestCandidateId, run }: Props) {
  if (candidates.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {candidates.map(c => (
        <CandidateCard
          key={c.id}
          candidate={c}
          isBest={c.id === bestCandidateId}
          run={run}
        />
      ))}
    </div>
  );
}
