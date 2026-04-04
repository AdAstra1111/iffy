/**
 * ConvergenceDiagnosticsPanel — Collapsible transparency section.
 * Shows convergence events, stop reason, reference policy, and evidence.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, FileText, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConvergenceRun, ConvergenceRound } from '@/lib/aiCast/convergenceEngine';

interface Props {
  run: ConvergenceRun;
  currentRound: ConvergenceRound | null;
}

export function ConvergenceDiagnosticsPanel({ run, currentRound }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const policy = run.policy_json;

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          <span className="font-medium">Diagnostics & Evidence</span>
        </div>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30">
          {/* Policy summary */}
          <div className="pt-2 space-y-1.5">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Run Policy</div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                Max {policy.maxRounds} rounds
              </Badge>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                {policy.candidatesPerRound} per round
              </Badge>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                Keep top {policy.keepTopN}
              </Badge>
              {policy.requiredScoreBand && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                  Target: {policy.requiredScoreBand}
                </Badge>
              )}
              {policy.strictness && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                  {policy.strictness}
                </Badge>
              )}
              {policy.failFastOnHardFail && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-red-400 border-red-500/30">
                  Fail-fast enabled
                </Badge>
              )}
            </div>
          </div>

          {/* Reference policy */}
          {currentRound?.evaluation_reference_policy && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Evaluation Reference</div>
              <div className="flex items-start gap-2">
                <Info className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div>Policy: <span className="text-foreground font-medium">{currentRound.evaluation_reference_policy}</span></div>
                  {currentRound.evaluation_mode && (
                    <div>Mode: <span className="text-foreground">{currentRound.evaluation_mode}</span></div>
                  )}
                  {currentRound.reference_ids?.length > 0 && (
                    <div>References: <span className="text-foreground">{currentRound.reference_ids.length} canonical IDs</span></div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stop reason */}
          {run.stop_reason && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Stop Reason</div>
              <p className="text-[11px] text-foreground">{run.stop_reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
