/**
 * LookbookQASummary — Persistent QA review surface.
 * Consumes canonical QAResult only. No duplicate computation.
 */
import { cn } from '@/lib/utils';
import { Shield, ShieldAlert, ShieldCheck, ShieldX, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import type { QAResult, QualityGrade } from '@/lib/lookbook/pipeline/types';

const GRADE_CONFIG: Record<QualityGrade, { label: string; color: string; icon: typeof Shield; description: string }> = {
  strong: {
    label: 'Strong',
    color: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5',
    icon: ShieldCheck,
    description: 'Production-grade — all sections present, no critical issues.',
  },
  publishable: {
    label: 'Publishable',
    color: 'text-blue-500 border-blue-500/30 bg-blue-500/5',
    icon: Shield,
    description: 'Publishable but could be improved. Review warnings below.',
  },
  exportable: {
    label: 'Exportable',
    color: 'text-amber-500 border-amber-500/30 bg-amber-500/5',
    icon: ShieldAlert,
    description: 'Exportable but not production-grade. Address issues below.',
  },
  incomplete: {
    label: 'Incomplete',
    color: 'text-destructive border-destructive/30 bg-destructive/5',
    icon: ShieldX,
    description: 'Critical issues prevent production use. Fix errors below.',
  },
};

type DiagCategory = 'coverage' | 'reuse' | 'fill' | 'identity' | 'slot_purpose' | 'diversity' | 'editorial';

const CATEGORY_LABELS: Record<string, string> = {
  coverage: 'Section Coverage',
  reuse: 'Image Reuse',
  fill: 'Sparse / Under-filled',
  identity: 'Identity',
  slot_purpose: 'Slot Purpose',
  diversity: 'Diversity',
  editorial: 'Editorial',
};

interface Props {
  qa: QAResult;
  className?: string;
}

export function LookbookQASummary({ qa, className }: Props) {
  const [open, setOpen] = useState(true);
  const grade = qa.qualityGrade;
  const config = GRADE_CONFIG[grade];
  const GradeIcon = config.icon;

  const diags = qa.diagnostics || [];
  const errors = diags.filter(d => d.severity === 'error');
  const warnings = diags.filter(d => d.severity === 'warning');
  const infos = diags.filter(d => d.severity === 'info');

  // Group by category
  const grouped = new Map<string, typeof diags>();
  for (const d of diags) {
    const list = grouped.get(d.category) || [];
    list.push(d);
    grouped.set(d.category, list);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn('rounded-lg border', config.color, className)}>
        <CollapsibleTrigger className="w-full px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2 min-w-0">
            <GradeIcon className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold">Quality: {config.label}</span>
            <div className="flex items-center gap-1.5 ml-2">
              {errors.length > 0 && (
                <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">{errors.length} error{errors.length !== 1 && 's'}</Badge>
              )}
              {warnings.length > 0 && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-600 dark:text-amber-400">{warnings.length} warning{warnings.length !== 1 && 's'}</Badge>
              )}
              {infos.length > 0 && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{infos.length} info</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {qa.slidesWithImages}/{qa.totalSlides} slides imaged
              {qa.unresolvedSlides.length > 0 && ` · ${qa.unresolvedSlides.length} unresolved`}
            </span>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2">
            {/* Grade description */}
            <p className="text-[10px] text-muted-foreground">{config.description}</p>

            {/* Stats row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              <span>Total slides: <span className="text-foreground font-medium">{qa.totalSlides}</span></span>
              <span>Image refs: <span className="text-foreground font-medium">{qa.totalImageRefs}</span></span>
              <span>Without images: <span className="text-foreground font-medium">{qa.slidesWithoutImages}</span></span>
              {qa.reuseWarnings.length > 0 && (
                <span>Reuse warnings: <span className="text-foreground font-medium">{qa.reuseWarnings.length}</span></span>
              )}
            </div>

            {/* Grouped diagnostics */}
            {grouped.size > 0 && (
              <div className="space-y-1.5">
                {Array.from(grouped.entries()).map(([cat, items]) => {
                  const hasError = items.some(i => i.severity === 'error');
                  const hasWarn = items.some(i => i.severity === 'warning');
                  return (
                    <div key={cat} className="space-y-0.5">
                      <p className={cn(
                        'text-[10px] font-semibold',
                        hasError ? 'text-destructive' : hasWarn ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                      )}>
                        {CATEGORY_LABELS[cat] || cat}
                      </p>
                      {items.map((d, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px] pl-2">
                          <span className={cn(
                            'mt-0.5 h-1.5 w-1.5 rounded-full shrink-0',
                            d.severity === 'error' ? 'bg-destructive' :
                            d.severity === 'warning' ? 'bg-amber-500' : 'bg-muted-foreground/40',
                          )} />
                          <span className={cn(
                            d.severity === 'error' ? 'text-destructive' :
                            d.severity === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                          )}>
                            <span className="font-medium">{d.slideType}</span>: {d.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Clean state */}
            {grouped.size === 0 && (
              <p className="text-[10px] text-emerald-500">No issues detected.</p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
