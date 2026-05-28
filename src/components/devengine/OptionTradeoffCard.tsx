/**
 * OptionTradeoffCard — Phase 5 Pressure-Aware Option Display
 *
 * Transforms options from implicit recommendations into trajectory proposals.
 * Shows: pressure relief, compression risks, estimated impact, creative risk.
 * Removes: "Recommended" badge, green/red correctness framing, rank ordering.
 * Footer: "Observation only — creator decides."
 *
 * ZERO SCORING. ZERO CONVERGENCE AUTHORITY. HUMAN DECIDES.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── Phase 4: Pressure type lookup (matches _shared/pressureTypes.ts) ──
const CATEGORY_TO_PRESSURE: Record<string, { primary: string; risk?: string }> = {
  structural: { primary: 'structural' },
  character: { primary: 'emotional', risk: 'atmosphere' },
  escalation: { primary: 'propulsion' },
  pacing: { primary: 'propulsion', risk: 'atmosphere' },
  hook: { primary: 'commercial', risk: 'propulsion' },
  cliffhanger: { primary: 'propulsion' },
  lane: { primary: 'commercial' },
  packaging: { primary: 'commercial' },
  risk: { primary: 'commercial' },
  spine_alignment: { primary: 'structural' },
  spine_drift: { primary: 'structural' },
};

// ── Types ──────────────────────────────────────────────────────

export interface OptionTradeoff {
  optionId: string;
  title: string;
  whatChanges: string[];
  /** Which pressure types this option relieves */
  pressureRelief: string[];
  /** Which pressure types this option risks compressing */
  compressionRisks: string[];
  /** Estimated commercial impact (0-20) — LLM estimate, NOT verified */
  estimatedCommercialImpact: number | null;
  /** Creative risk level */
  creativeRisk: 'low' | 'med' | 'high' | null;
  /** Optional evidence backing this option */
  evidence: string[];
  /** Whether this option was LLM-suggested (NOT authoritative) */
  suggested: boolean;
}

interface OptionTradeoffCardProps {
  option: OptionTradeoff;
  isSelected: boolean;
  onSelect: (optionId: string) => void;
}

// ── Helper: pressure → neutral color ──────────────────────────
function pressureColor(pressure: string): string {
  const colors: Record<string, string> = {
    emotional: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    structural: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    propulsion: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    clarity: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    commercial: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    atmosphere: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    contradiction: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    convergence: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return colors[pressure] || 'bg-muted/20 text-muted-foreground border-border/30';
}

function riskColor(risk: string): string {
  const colors: Record<string, string> = {
    low: 'bg-muted/30 text-muted-foreground border-border/30',
    med: 'bg-muted/30 text-muted-foreground border-border/30',
    high: 'bg-muted/30 text-muted-foreground border-border/30',
  };
  return colors[risk] || colors.low;
}

// ── Component ──────────────────────────────────────────────────

export function OptionTradeoffCard({
  option,
  isSelected,
  onSelect,
}: OptionTradeoffCardProps) {
  return (
    <TooltipProvider>
      <Card
        className={`cursor-pointer transition-colors text-xs ${
          isSelected
            ? 'border-border/60 bg-muted/10'
            : 'border-border/30 hover:border-border/50'
        }`}
        onClick={() => onSelect(option.optionId)}
      >
        <CardHeader className="py-1.5 px-3 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Selection indicator — neutral circle, no checkmark */}
            <div
              className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                isSelected
                  ? 'border-foreground/50 bg-foreground/10'
                  : 'border-border'
              }`}
            />
            <span className="font-mono text-xs truncate">
              {option.title || option.optionId}
            </span>
          </div>
          {option.suggested && (
            <Badge
              variant="outline"
              className="text-[8px] px-1 py-0 bg-muted/20 text-muted-foreground border-border/30 shrink-0"
            >
              AI suggestion
            </Badge>
          )}
        </CardHeader>

        <CardContent className="px-3 pb-1.5 space-y-1.5">
          {/* What changes */}
          {option.whatChanges.length > 0 && (
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              {option.whatChanges.map((change, i) => (
                <div key={i} className="flex items-start gap-1">
                  <span className="text-muted-foreground/50 mt-0.5 shrink-0">→</span>
                  <span>{change}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pressure dimensions */}
          <div className="flex flex-wrap items-center gap-1">
            {/* Pressure relief */}
            {option.pressureRelief.map((p) => (
              <Tooltip key={`relief-${p}`}>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-[7px] px-1 py-0 ${pressureColor(p)}`}
                  >
                    relieves {p}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[10px] max-w-[200px]">
                  Acting on this option reduces {p} pressure on the work.
                </TooltipContent>
              </Tooltip>
            ))}

            {/* Compression risks */}
            {option.compressionRisks.map((p) => (
              <Tooltip key={`risk-${p}`}>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-[7px] px-1 py-0 ${pressureColor(p)} border-dashed`}
                  >
                    risks {p}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[10px] max-w-[200px]">
                  This option may compress {p} pressure. This is a tradeoff, not&nbsp;a defect.
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </CardContent>

        <CardFooter className="px-3 py-1 flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground border-t border-border/30">
          {/* Estimated commercial impact — neutral */}
          {option.estimatedCommercialImpact != null && (
            <span className="text-muted-foreground/70">
              {option.estimatedCommercialImpact > 0 ? '+' : ''}
              {option.estimatedCommercialImpact} GP
              <span className="text-muted-foreground/40 ml-0.5">(estimated)</span>
            </span>
          )}

          {/* Creative risk — neutral color */}
          {option.creativeRisk && (
            <Badge
              variant="outline"
              className={`text-[7px] px-1 py-0 ${riskColor(option.creativeRisk)}`}
            >
              risk: {option.creativeRisk}
            </Badge>
          )}

          {/* Evidence */}
          {option.evidence.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-muted-foreground/50">
                  {option.evidence.length} evidence ref{option.evidence.length > 1 ? 's' : ''}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px] max-w-[250px]">
                {option.evidence.join('; ')}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Constitutional footer */}
          <span className="text-muted-foreground/30 ml-auto text-[8px]">
            Observation only — creator decides
          </span>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}

// ── Utility: Build OptionTradeoff from existing LLM option data ──

export function buildTradeoff(
  opt: any,
  noteCategory?: string | null,
  suggested: boolean = false,
): OptionTradeoff {
  const catPressure = (noteCategory && CATEGORY_TO_PRESSURE[noteCategory]) || null;

  // Infer pressure relief from category (the option addresses the note's pressure type)
  const pressureRelief: string[] = [];
  if (catPressure) {
    pressureRelief.push(catPressure.primary);
    // If the note has a secondary pressure from full mapping, include it
  }

  // Infer compression risks from the category's risk dimension
  const compressionRisks: string[] = [];
  if (catPressure?.risk) {
    compressionRisks.push(catPressure.risk);
  }

  // If the LLM provided pressure_tradeoff annotation, use it and override inferred
  if (opt.pressure_tradeoff?.gains) {
    pressureRelief.length = 0;
    pressureRelief.push(...opt.pressure_tradeoff.gains);
  }
  if (opt.pressure_tradeoff?.risks) {
    compressionRisks.length = 0;
    compressionRisks.push(...opt.pressure_tradeoff.risks);
  }

  return {
    optionId: opt.option_id || opt.id || '?',
    title: opt.title || opt.option_id || 'Untitled',
    whatChanges: Array.isArray(opt.what_changes) ? opt.what_changes : [opt.what_changes].filter(Boolean),
    pressureRelief,
    compressionRisks,
    estimatedCommercialImpact:
      typeof opt.commercial_lift === 'number' ? opt.commercial_lift : null,
    creativeRisk: opt.creative_risk || null,
    evidence: [],
    suggested,
  };
}