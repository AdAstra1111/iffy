import { useState } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Props {
  docType: string;
  oldHash: string;
  currentHash: string;
  staleReasons?: string[];
  regenerationProgress?: number; // 0–100, undefined = no active job
  regenerationLabel?: string;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export function StaleDocBanner({
  docType, oldHash, currentHash, staleReasons = [],
  regenerationProgress, regenerationLabel,
  onRegenerate, isRegenerating,
}: Props) {
  const [reasonsExpanded, setReasonsExpanded] = useState(false);
  const hasReasons = staleReasons.length > 0;
  const isWorking = isRegenerating || regenerationProgress !== undefined;

  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs">
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <p className="text-foreground font-medium">
          Stale: <span className="capitalize">{docType.replace(/_/g, ' ')}</span> is out of sync with current Canon inputs
        </p>
        <p className="text-muted-foreground">
          Document hash{' '}
          <Badge variant="outline" className="text-[9px] mx-0.5 bg-destructive/10 text-destructive font-mono">
            {oldHash.slice(0, 12)}
          </Badge>{' '}
          vs current{' '}
          <Badge variant="outline" className="text-[9px] mx-0.5 bg-primary/10 text-primary font-mono">
            {currentHash.slice(0, 12)}
          </Badge>
        </p>

        {/* Specific reasons — expandable */}
        {hasReasons && (
          <div className="space-y-1">
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
              onClick={() => setReasonsExpanded(v => !v)}
            >
              {reasonsExpanded
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronRight className="h-3 w-3" />}
              {reasonsExpanded ? 'Hide' : 'Show'} specific contradictions ({staleReasons.length})
            </button>
            {reasonsExpanded && (
              <ul className="pl-4 space-y-0.5 list-disc list-inside text-[10px] text-muted-foreground">
                {staleReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Progress bar during regeneration */}
        {isWorking && (
          <div className="space-y-1">
            {regenerationLabel && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                <span className="text-[10px] text-amber-400">{regenerationLabel}</span>
              </div>
            )}
            {regenerationProgress !== undefined && (
              <Progress value={regenerationProgress} className="h-1" />
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-6 text-xs gap-1",
            isWorking && "opacity-60 pointer-events-none"
          )}
          onClick={onRegenerate}
          disabled={isWorking}
        >
          {isWorking
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <RefreshCw className="h-3 w-3" />}
          {isWorking
            ? 'Regenerating…'
            : `Regenerate ${docType.replace(/_/g, ' ')} to match canonical format`}
        </Button>
      </div>
    </div>
  );
}
