/**
 * VehicleAtomGrid — card grid + atomise controls for vehicle atoms
 *
 * Mirrors LocationAtomGrid pattern:
 *   - Header with atomise button + stats
 *   - Card grid with state badges, confidence bars
 *   - Click → detail drawer
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Car,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  Clock,
  DollarSign,
  Tag,
  Shield,
  Wrench,
} from 'lucide-react';
import type { VehicleAtom } from '@/hooks/useVehicleAtoms';
import { VehicleAtomDetailDrawer } from './VehicleAtomDetailDrawer';

interface VehicleAtomGridProps {
  atoms: VehicleAtom[];
  isLoading: boolean;
  isRefreshing: boolean;
  isExtracting: boolean;
  isGenerating: boolean;
  lastUpdated: Date | null;
  error: string | null;
  onExtract: () => Promise<any>;
  onGenerate: () => Promise<any>;
  onResetFailed: () => Promise<any>;
  onRefresh: () => Promise<void>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    completed: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: 'Done',
      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
    complete: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: 'Done',
      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
    pending: {
      icon: <Clock className="h-3 w-3" />,
      label: 'Pending',
      cls: 'bg-muted text-muted-foreground border-border',
    },
    generating: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: 'Generating',
      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    },
    running: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: 'Generating',
      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    },
    failed: {
      icon: <AlertTriangle className="h-3 w-3" />,
      label: 'Failed',
      cls: 'bg-red-500/15 text-red-400 border-red-500/30',
    },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number | null }) {
  const pct =
    value != null ? (value > 1 ? value : Math.round(value * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Confidence</span>
        <span>{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

function ComplexityChip({
  value,
  type,
}: {
  value: string;
  type: 'visual' | 'budget';
}) {
  const colorForVisual =
    value === 'complex'
      ? 'bg-red-500/15 text-red-400 border-red-500/30'
      : value === 'moderate'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';

  const colorForBudget =
    value === 'prohibitively_expensive'
      ? 'bg-red-500/15 text-red-400 border-red-500/30'
      : value === 'expensive'
        ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
        : value === 'moderate'
          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';

  const color = type === 'visual' ? colorForVisual : colorForBudget;
  const label = type === 'visual' ? `Vis: ${value}` : value?.replace(/_/g, ' ');

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${color}`}>{label}</span>
  );
}

function VehicleCard({
  atom,
  onClick,
}: {
  atom: VehicleAtom;
  onClick: () => void;
}) {
  const a = atom.attributes as any;
  const name = a?.vehicle_type || atom.canonical_name;

  return (
    <Card
      className="cursor-pointer hover:border-primary/40 transition-colors duration-150 group"
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{name}</span>
          </div>
          <StatusBadge status={atom.generation_status} />
        </div>

        {/* Era alignment */}
        {a?.era_alignment && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="truncate">{a.era_alignment}</span>
          </div>
        )}

        {/* Make/model */}
        {a?.make_model && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tag className="h-3 w-3 shrink-0" />
            <span className="truncate italic">{a.make_model}</span>
          </div>
        )}

        {/* Ownership + condition */}
        {(a?.ownership || a?.condition) && (
          <div className="flex flex-wrap gap-1">
            {a.ownership && (
              <span className="text-xs bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-1">
                <Shield className="h-2.5 w-2.5" />
                {a.ownership.replace(/-/g, ' ')}
              </span>
            )}
            {a.condition && (
              <span className="text-xs bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-1">
                <Wrench className="h-2.5 w-2.5" />
                {a.condition.replace(/-/g, ' ')}
              </span>
            )}
          </div>
        )}

        {/* Distinctive features snippet */}
        {a?.distinctive_features && (
          <p className="text-xs text-muted-foreground line-clamp-2">{a.distinctive_features}</p>
        )}

        {/* Complexity + budget chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {a?.visual_complexity && (
            <ComplexityChip value={a.visual_complexity} type="visual" />
          )}
          {a?.budget_estimate && (
            <span className="flex items-center gap-0.5">
              <DollarSign className="h-2.5 w-2.5 text-muted-foreground" />
              <ComplexityChip value={a.budget_estimate} type="budget" />
            </span>
          )}
        </div>

        {/* Confidence */}
        <ConfidenceBar value={a?.confidence ?? atom.confidence} />

        {/* Scene count */}
        {a?.frequencyInScript != null && (
          <div className="text-xs text-muted-foreground">
            {a.frequencyInScript} scene{a.frequencyInScript !== 1 ? 's' : ''}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimeAgo({ date }: { date: Date }) {
  const [label, setLabel] = useState(() => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
      if (seconds < 5) setLabel('just now');
      else if (seconds < 60) setLabel(`${seconds}s ago`);
      else {
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) setLabel(`${minutes}m ago`);
        else setLabel(`${Math.floor(minutes / 60)}h ago`);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [date]);

  return <span className="text-xs text-muted-foreground tabular-nums">{label}</span>;
}

export function VehicleAtomGrid({
  atoms,
  isLoading,
  isRefreshing,
  isExtracting,
  isGenerating,
  lastUpdated,
  error,
  onExtract,
  onGenerate,
  onResetFailed,
  onRefresh,
}: VehicleAtomGridProps) {
  const [selected, setSelected] = useState<VehicleAtom | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const completedCount = atoms.filter(
    (a) => a.generation_status === 'completed' || a.generation_status === 'complete',
  ).length;
  const failedCount = atoms.filter((a) => a.generation_status === 'failed').length;
  const totalCount = atoms.length;
  const generationProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const pendingCount = atoms.filter(
    (a) =>
      a.generation_status === 'pending' ||
      a.generation_status === 'generating' ||
      a.generation_status === 'running',
  ).length;

  const handleExtract = async () => {
    const result = await onExtract();
    if (result?.created != null && result.created > 0) {
      await onGenerate();
    }
  };

  const handleCardClick = (atom: VehicleAtom) => {
    setSelected(atom);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Progress bar during extraction/generation */}
      {(isExtracting || isGenerating) && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
            <span className="text-xs font-medium text-blue-300">
              {isExtracting
                ? 'Extracting vehicle atoms from script...'
                : isGenerating
                ? `Generating vehicle atoms (${completedCount}/${totalCount})...`
                : ''}
            </span>
          </div>
          <Progress value={isExtracting ? 25 : generationProgress} className="h-1.5" />
          <div className="text-[10px] text-blue-300/70">
            {isExtracting
              ? `Found {totalCount} vehicle atoms in script — building atoms...`
              : isGenerating
              ? `${completedCount} of ${totalCount} atoms complete`
              : ''}
          </div>
        </div>
      )}


      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <Car className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Vehicles</span>
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Last updated */}
          {lastUpdated && !isLoading && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {isRefreshing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              <TimeAgo date={lastUpdated} />
            </div>
          )}

          {/* Stats */}
          {totalCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {completedCount > 0 && (
                <span className="text-emerald-400">{completedCount} done</span>
              )}
              {failedCount > 0 && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-red-400">{failedCount} failed</span>
                </>
              )}
              {pendingCount > 0 && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span>{pendingCount} pending</span>
                </>
              )}
            </div>
          )}

          {/* Refresh */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={isLoading || isRefreshing}
            className="h-8 text-xs text-muted-foreground shrink-0"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Atomise / Regenerate */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExtract}
            disabled={isLoading || isRefreshing}
            className="h-8 text-xs shrink-0"
          >
            <Sparkles className="h-3 w-3 mr-1" />
            {totalCount === 0 ? 'Atomise Vehicles' : 'Regenerate'}
          </Button>

          {failedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onResetFailed}
              className="h-8 text-xs text-amber-400 shrink-0"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reset Failed
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Grid / empty states */}
      {isLoading && totalCount === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-3 space-y-2.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-1.5 w-full" />
            </Card>
          ))}
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Car className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No vehicle atoms yet.</p>
          <p className="text-xs mt-1">
            Click "Atomise Vehicles" to extract from your script.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {atoms.map((atom) => (
            <VehicleCard
              key={atom.id}
              atom={atom}
              onClick={() => handleCardClick(atom)}
            />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <VehicleAtomDetailDrawer
        atom={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
