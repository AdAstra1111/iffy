import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { VisualSkeleton } from '@/components/visual/VisualSkeleton';
import { VisualEmptyState } from '@/components/visual/VisualEmptyState';
import { VisualPanelErrorBoundary } from '@/components/visual/VisualPanelErrorBoundary';
import { Sparkles } from 'lucide-react';
import type { VisualUnitRun } from '@/lib/types/visualUnits';

interface Props {
  runs: VisualUnitRun[];
  selectedRunId: string | null;
  onSelect: (id: string) => void;
}

export function VisualUnitRunsList({ runs, selectedRunId, onSelect }: Props) {
  if (runs.length === 0) {
    return <VisualEmptyState compact icon={<Sparkles className="h-3 w-3" />} title="No runs yet" description="Create one to extract visual units." />;
  }

  return (
    <VisualPanelErrorBoundary panelLabel="VisualUnitRunsList">
      <ScrollArea className="h-[20vh]">
      <div className="space-y-0.5 px-3 pb-3">
        {runs.map(run => (
          <button
            key={run.id}
            onClick={() => onSelect(run.id)}
            className={`w-full text-left p-2 rounded text-[10px] transition-colors ${
              selectedRunId === run.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-muted-foreground">{run.id.slice(0, 8)}</span>
              <Badge variant={run.status === 'complete' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'} className="text-[7px]">
                {run.status}
              </Badge>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {new Date(run.created_at).toLocaleString()}
            </p>
          </button>
        ))}
      </div>
    </ScrollArea>
    </VisualPanelErrorBoundary>
  );
}
