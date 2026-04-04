/**
 * ConvergencePanel — Mission Control for the Image Convergence Engine.
 * Composes header, stage progress, round timeline, candidate grid,
 * best-candidate spotlight, diagnostics, and run controls.
 *
 * All data derives from canonical backend state.
 * No invented percentages or fake progress.
 * AI CAST CONVERGENCE BASELINE V1 — BANKED invariants preserved.
 */
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
import { Play, Square, Zap, Shield, Loader2, RotateCcw } from 'lucide-react';
import {
  useConvergenceRuns,
  useConvergenceRounds,
  useConvergenceCandidates,
  useStartConvergence,
  useStepConvergence,
  useAbortConvergence,
  DEFAULT_EXPLORATORY_POLICY,
  DEFAULT_LOCKED_POLICY,
  type ConvergenceRun,
  type ConvergenceMode,
} from '@/lib/aiCast/convergenceEngine';

import { ConvergenceHeaderStrip } from './convergence/ConvergenceHeaderStrip';
import { ConvergenceStageProgress } from './convergence/ConvergenceStageProgress';
import { ConvergenceRoundTimeline } from './convergence/ConvergenceRoundTimeline';
import { ConvergenceCandidateGrid } from './convergence/ConvergenceCandidateGrid';
import { ConvergenceBestCandidate } from './convergence/ConvergenceBestCandidate';
import { ConvergenceDiagnosticsPanel } from './convergence/ConvergenceDiagnosticsPanel';

// ── Start Controls ─────────────────────────────────────────────────────────

function ConvergenceStartControls({
  actorId,
  versionId,
  hasAnchors,
}: {
  actorId: string;
  versionId: string;
  hasAnchors: boolean;
}) {
  const startMutation = useStartConvergence();

  const handleStart = (mode: ConvergenceMode) => {
    const policy = mode === 'exploratory' ? DEFAULT_EXPLORATORY_POLICY : DEFAULT_LOCKED_POLICY;
    startMutation.mutate({ actorId, versionId, mode, policy });
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <RotateCcw className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground">Identity Convergence</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automatically generate, validate, score, and refine visual identity candidates
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Exploratory */}
        <button
          onClick={() => handleStart('exploratory')}
          disabled={startMutation.isPending}
          className="group flex flex-col items-start gap-2 p-4 rounded-lg border border-border/50 bg-card/40 hover:bg-violet-500/5 hover:border-violet-500/30 transition-all text-left disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium text-foreground">Exploratory</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Discover visual identity through cohesion scoring. No reference anchors required.
          </p>
        </button>

        {/* Locked */}
        <button
          onClick={() => handleStart('reference_locked')}
          disabled={startMutation.isPending || !hasAnchors}
          className="group flex flex-col items-start gap-2 p-4 rounded-lg border border-border/50 bg-card/40 hover:bg-primary/5 hover:border-primary/30 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Reference-Locked</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {hasAnchors
              ? 'Preserve anchor-locked identity across controlled conditions.'
              : 'Upload 3 anchor references to enable locked convergence.'
            }
          </p>
        </button>
      </div>

      {startMutation.isPending && (
        <div className="flex items-center gap-2 text-xs text-primary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Starting convergence run…</span>
        </div>
      )}
    </div>
  );
}

// ── Active Run View ────────────────────────────────────────────────────────

function ActiveRunView({ run }: { run: ConvergenceRun }) {
  const { data: rounds = [] } = useConvergenceRounds(run.id);
  const { data: candidates = [] } = useConvergenceCandidates(run.id);
  const stepMutation = useStepConvergence();
  const abortMutation = useAbortConvergence();

  const isActive = run.status === 'running' || run.status === 'pending';
  const currentRound = rounds.find(r => r.round_number === run.current_round) || null;

  const roundCandidates = useMemo(() => {
    if (!currentRound) return [];
    return candidates.filter(c => c.round_id === currentRound.id);
  }, [candidates, currentRound]);

  // Derive best score from all candidates
  const bestScore = useMemo(() => {
    const scored = candidates.filter(c => c.score !== null && c.status !== 'failed');
    if (scored.length === 0) return null;
    return Math.max(...scored.map(c => Number(c.score)));
  }, [candidates]);

  // Best candidate by canonical ranking (lowest rank_position among keepers, or highest score)
  const bestCandidate = useMemo(() => {
    if (run.best_candidate_id) {
      const bc = candidates.find(c => c.id === run.best_candidate_id);
      if (bc) return bc;
    }
    const keepers = candidates.filter(c => c.selection_status === 'keeper' && c.score !== null);
    if (keepers.length > 0) {
      return keepers.sort((a, b) => (Number(a.rank_position) || 999) - (Number(b.rank_position) || 999))[0];
    }
    const scored = candidates.filter(c => c.score !== null && c.status !== 'failed');
    if (scored.length > 0) {
      return scored.sort((a, b) => Number(b.score) - Number(a.score))[0];
    }
    return null;
  }, [candidates, run.best_candidate_id]);

  // Candidate counts for stage message
  const counts = useMemo(() => {
    const rc = roundCandidates;
    return {
      total: rc.length,
      generated: rc.filter(c => !['queued', 'generating'].includes(c.status)).length,
      scored: rc.filter(c => c.score !== null).length,
      keepers: rc.filter(c => c.selection_status === 'keeper').length,
    };
  }, [roundCandidates]);

  return (
    <div className="space-y-4">
      {/* Header Strip */}
      <ConvergenceHeaderStrip run={run} bestScore={bestScore} />

      {/* Controls bar */}
      {isActive && (
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            {counts.total > 0 && (
              <span>{counts.generated}/{counts.total} generated · {counts.scored} scored · {counts.keepers} keepers</span>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => stepMutation.mutate(run.id)}
              disabled={stepMutation.isPending}
              className="gap-1.5 h-8"
            >
              {stepMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />
              }
              Next Step
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-destructive hover:text-destructive">
                  <Square className="w-3.5 h-3.5" /> Abort
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Abort convergence run?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Generated candidates will be preserved but the run will be marked as aborted. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => abortMutation.mutate({ runId: run.id, actorId: run.actor_id })}>
                    Abort Run
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {/* Stage Progress (current round) */}
      {currentRound && (
        <ConvergenceStageProgress
          currentStage={currentRound.stage}
          isRunActive={isActive}
        />
      )}

      {/* Best Candidate Spotlight */}
      {bestCandidate && (
        <ConvergenceBestCandidate
          candidate={bestCandidate}
          roundNumber={run.current_round}
          run={run}
        />
      )}

      {/* Current Round Candidates */}
      {roundCandidates.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Round {currentRound?.round_number || run.current_round} Candidates
          </div>
          <ConvergenceCandidateGrid
            candidates={roundCandidates}
            bestCandidateId={bestCandidate?.id}
            run={run}
          />
        </div>
      )}

      {/* Round Timeline */}
      {rounds.length > 0 && (
        <ConvergenceRoundTimeline
          rounds={rounds}
          currentRoundId={currentRound?.id}
        />
      )}

      {/* Diagnostics */}
      <ConvergenceDiagnosticsPanel run={run} currentRound={currentRound} />
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────

interface ConvergencePanelProps {
  actorId: string;
  versionId: string;
  hasAnchors: boolean;
}

export function ConvergencePanel({ actorId, versionId, hasAnchors }: ConvergencePanelProps) {
  const { data: runs = [], isLoading } = useConvergenceRuns(actorId);

  const activeRun = runs.find(r => r.status === 'running' || r.status === 'pending');
  const latestCompletedRun = runs.find(r => r.status === 'completed');

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading convergence…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeRun ? (
        <ActiveRunView run={activeRun} />
      ) : latestCompletedRun ? (
        <div className="space-y-4">
          <ActiveRunView run={latestCompletedRun} />
          <Separator className="my-2" />
          <ConvergenceStartControls actorId={actorId} versionId={versionId} hasAnchors={hasAnchors} />
        </div>
      ) : (
        <ConvergenceStartControls actorId={actorId} versionId={versionId} hasAnchors={hasAnchors} />
      )}
    </div>
  );
}
