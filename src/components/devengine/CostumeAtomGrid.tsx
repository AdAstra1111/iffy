/**
 * CostumeAtomGrid — card grid + atomise controls for costume atoms
 *
 * Mirrors LocationAtomGrid pattern:
 *   - Header with atomise button + stats
 *   - Card grid with state badges, confidence bars, color dots
 *   - Click → detail drawer
 *   - Disabled state if no character atoms exist yet
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Shirt, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles, Clock, Package,
} from 'lucide-react';
import type { CostumeAtom } from '@/hooks/useCostumeAtoms';
import { CostumeAtomDetailDrawer } from './CostumeAtomDetailDrawer';

interface CostumeAtomGridProps {
  atoms: CostumeAtom[];
  isLoading: boolean;
  isRefreshing: boolean;
  isExtracting: boolean;
  isGenerating: boolean;
  lastUpdated: Date | null;
  error: string | null;
  characterAtomsReady?: boolean;
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
      label: 'Running',
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
  const pct = value != null ? (value > 1 ? value : Math.round(value * 100)) : 0;
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

function ColorDots({ colors }: { colors: string[] }) {
  if (!colors || colors.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {colors.slice(0, 4).map((color, i) => (
        <span
          key={i}
          className="inline-block h-3 w-3 rounded-full border border-border/50 shrink-0"
          style={{ backgroundColor: color.toLowerCase() }}
          title={color}
        />
      ))}
      {colors.slice(0, 4).map((color, i) => (
        <span key={`label-${i}`} className="text-xs text-muted-foreground">
          {i > 0 ? `, ${color}` : color}
        </span>
      )).slice(0, 1)}
    </div>
  );
}

function CostumeCard({
  atom,
  onClick,
}: {
  atom: CostumeAtom;
  onClick: () => void;
}) {
  const a = atom.attributes as any;
  const charName = a?.characterName || atom.canonical_name.replace(' — Primary Costume', '');

  return (
    <Card
      className="cursor-pointer hover:border-primary/40 transition-colors duration-150 group"
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <Shirt className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{charName}</span>
          </div>
          <StatusBadge status={atom.generation_status} />
        </div>

        {/* Era + Silhouette */}
        {(a?.eraAlignment || a?.silhouette) && (
          <div className="text-xs text-muted-foreground truncate">
            {[a.eraAlignment, a.silhouette].filter(Boolean).join(' · ')}
          </div>
        )}

        {/* Dominant colors */}
        {a?.dominantColors && a.dominantColors.length > 0 && (
          <ColorDots colors={a.dominantColors} />
        )}

        {/* Key pieces */}
        {a?.keyPieces && a.keyPieces.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(a.keyPieces as string[]).slice(0, 3).map((piece: string, i: number) => (
              <span
                key={i}
                className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded truncate max-w-[120px]"
              >
                {piece}
              </span>
            ))}
          </div>
        )}

        {/* Character signal excerpt */}
        {a?.characterSignal && (
          <p className="text-xs text-muted-foreground line-clamp-2">{a.characterSignal}</p>
        )}

        {/* Confidence */}
        <ConfidenceBar value={a?.confidence ?? atom.confidence} />
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

export function CostumeAtomGrid({
  atoms,
  isLoading,
  isRefreshing,
  isExtracting,
  isGenerating,
  lastUpdated,
  error,
  characterAtomsReady = true,
  onExtract,
  onGenerate,
  onResetFailed,
  onRefresh,
}: CostumeAtomGridProps) {
  const [selected, setSelected] = useState<CostumeAtom | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const completedCount = atoms.filter(
    (a) => a.generation_status === 'completed' || a.generation_status === 'complete',
  ).length;
  const failedCount = atoms.filter((a) => a.generation_status === 'failed').length;
  const totalCount = atoms.length;
  const pendingCount = atoms.filter(
    (a) => a.generation_status === 'pending' || a.generation_status === 'generating',
  ).length;

  const handleExtract = async () => {
    const result = await onExtract();
    if (result?.created != null && result.created > 0) {
      await onGenerate();
    }
  };

  const handleCardClick = (atom: CostumeAtom) => {
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
                ? 'Extracting costume atoms from script...'
                : isGenerating
                ? `Generating costume atoms ({completedCount}/{totalCount})...`
                : ''}
            </span>
          </div>
          <Progress value={isExtracting ? 25 : generationProgress} className="h-1.5" />
          <div className="text-[10px] text-blue-300/70">
            {isExtracting
              ? `Found {totalCount} costume atoms in script — building atoms...`
              : isGenerating
              ? `{completedCount} of {totalCount} atoms complete`
              : ''}
          </div>
        </div>
      )}


      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <Shirt className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Costumes</span>
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
            disabled={isLoading || isRefreshing || !characterAtomsReady}
            className="h-8 text-xs shrink-0"
            title={!characterAtomsReady ? 'Generate character atoms first' : undefined}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            {totalCount === 0 ? 'Atomise Costumes' : 'Regenerate'}
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

      {/* Disabled state — character atoms not ready */}
      {!characterAtomsReady && totalCount === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="font-medium">Generate character atoms first</p>
          <p className="text-xs mt-1">
            Costume atoms are extracted from completed character atoms.
          </p>
        </div>
      )}

      {/* Grid */}
      {characterAtomsReady && (
        <>
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
              <Shirt className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No costume atoms yet.</p>
              <p className="text-xs mt-1">Click "Atomise Costumes" to extract from character atoms.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {atoms.map((atom) => (
                <CostumeCard
                  key={atom.id}
                  atom={atom}
                  onClick={() => handleCardClick(atom)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail drawer */}
      <CostumeAtomDetailDrawer
        atom={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
