import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, Drawer, Drawer, DrawerClose
} from '@/components/ui/drawer';
import { Loader2, RefreshCw, Sparkles, Clock, AlertTriangle, CheckCircle2, X, Clapperboard } from 'lucide-react';
import type { GenreAtom } from '@/hooks/useGenreAtoms';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    completed: { icon: <CheckCircle2 className="h-3 w-3" />, label: 'Done', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    complete: { icon: <CheckCircle2 className="h-3 w-3" />, label: 'Done', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    pending: { icon: <Clock className="h-3 w-3" />, label: 'Pending', cls: 'bg-muted text-muted-foreground border-border' },
    generating: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: 'Generating', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    running: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: 'Generating', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    failed: { icon: <AlertTriangle className="h-3 w-3" />, label: 'Failed', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  };
  const s = map[status] || map.pending;
  return <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${s.cls}`}>{s.icon}{s.label}</span>;
}

function TimeAgo({ date }: { date: Date }) {
  const [label, setLabel] = useState(() => `${Math.floor((Date.now() - date.getTime()) / 60000)}m ago`);
  useEffect(() => {
    const interval = setInterval(() => setLabel(`${Math.floor((Date.now() - date.getTime()) / 60000)}m ago`), 30000);
    return () => clearInterval(interval);
  }, [date]);
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

interface GenreAtomGridProps {
  atoms: GenreAtom[]; isLoading: boolean; isRefreshing: boolean;
  isExtracting: boolean;
  isGenerating: boolean;
  lastUpdated: Date | null; error: string | null;
  onExtract: () => Promise<any>; onGenerate: () => Promise<any>;
  onResetFailed: () => Promise<any>; onRefresh: () => Promise<void>;
}

function AttrRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2 border-b border-border/50 last:border-0">
      <dt className="text-xs text-muted-foreground font-medium">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function GenreAtomGrid({ atoms, isLoading, isRefreshing, lastUpdated, error, onExtract, onGenerate, onResetFailed, onRefresh }: GenreAtomGridProps) {
  const [selected, setSelected] = useState<GenreAtom | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const totalCount = atoms.length;
  const completedCount = atoms.filter((a) => a.generation_status === 'completed' || a.generation_status === 'complete').length;
  const failedCount = atoms.filter((a) => a.generation_status === 'failed').length;

  const handleExtract = async () => {
    const result = await onExtract();
    if (result?.created != null) await onGenerate();
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
                ? 'Extracting genre atoms from script...'
                : isGenerating
                ? `Generating genre atoms ({completedCount}/{totalCount})...`
                : ''}
            </span>
          </div>
          <Progress value={isExtracting ? 25 : generationProgress} className="h-1.5" />
          <div className="text-[10px] text-blue-300/70">
            {isExtracting
              ? `Found {totalCount} genre atoms in script — building atoms...`
              : isGenerating
              ? `{completedCount} of {totalCount} atoms complete`
              : ''}
          </div>
        </div>
      )}


      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Genre</span>
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdated && !isLoading && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
              <TimeAgo date={lastUpdated} />
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={isLoading || isRefreshing} className="h-8 text-xs text-muted-foreground shrink-0">
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={handleExtract} disabled={isLoading || isRefreshing} className="h-8 text-xs shrink-0">
            <Sparkles className="h-3 w-3 mr-1" />{totalCount === 0 ? 'Atomise Genre' : 'Regenerate'}
          </Button>
          {failedCount > 0 && <Button size="sm" variant="ghost" onClick={onResetFailed} className="h-8 text-xs text-amber-400 shrink-0"><RefreshCw className="h-3 w-3 mr-1" />Reset</Button>}
        </div>
      </div>
      {error && <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2"><AlertTriangle className="h-3 w-3 shrink-0" />{error}</div>}
      {isLoading && totalCount === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3].map(i => <Card key={i} className="p-3"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></Card>)}
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Clapperboard className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No genre classification yet.</p><p className="text-xs mt-1">Click "Atomise Genre" to classify your project.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {atoms.map(atom => (
            <Card key={atom.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => { setSelected(atom); setDrawerOpen(true); }}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm truncate">{atom.canonical_name}</span>
                  <StatusBadge status={atom.generation_status} />
                </div>
                {((atom.attributes as any))?.primaryGenre && <div className="text-xs text-muted-foreground">Primary: {((atom.attributes as any)).primaryGenre}</div>}
                {((atom.attributes as any))?.genreTags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {((atom.attributes as any)).genreTags.slice(0, 4).map((t: string) => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</span>)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <GenreAtomDetailDrawer atom={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

export function GenreAtomDetailDrawer({ atom, open, onOpenChange }: { atom: GenreAtom | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const a = atom?.attributes as any;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-lg mx-auto">
        <DrawerHeader>
          <div className="flex items-center justify-between">
            <DrawerTitle className="flex items-center gap-2"><Clapperboard className="h-4 w-4" />{atom?.canonical_name || 'Genre'}</DrawerTitle>
            <DrawerClose className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></DrawerClose>
          </div>
          {atom && <DrawerDescription><StatusBadge status={atom.generation_status} /></DrawerDescription>}
        </DrawerHeader>
        <div class="overflow-y-auto max-h-[70vh] px-6 py-4" className="overflow-y-auto max-h-[70vh] px-6">
          {a ? (
            <dl className="text-sm">
              <AttrRow label="Primary Genre" value={a.primaryGenre} />
              <AttrRow label="Secondary Genres" value={a.secondaryGenres?.join(', ')} />
              <AttrRow label="Subgenre Tags" value={a.subgenreTags?.join(', ')} />
              <AttrRow label="Genre Mashup" value={a.genreMashupNotes} />
              <AttrRow label="Tone Tags" value={a.toneTags?.join(', ')} />
              <AttrRow label="Intended Rating" value={a.intendedRating} />
              <AttrRow label="Narrative Structure" value={a.narrativeStructure} />
              <AttrRow label="Pacing" value={a.pacingClass?.join(', ')} />
              <AttrRow label="Setting Classification" value={a.settingClassification?.join(', ')} />
              <AttrRow label="Comparable Films" value={a.comparableFilms?.join(', ')} />
              <AttrRow label="Audience Profile" value={a.audienceProfile} />
              <AttrRow label="Genre Purity" value={a.genrePurity} />
              <AttrRow label="Marketing" value={a.marketingClassification} />
              {a.genreTags?.length > 0 && (
                <div className="py-2 border-b border-border/50">
                  <dt className="text-xs text-muted-foreground font-medium mb-1.5">Genre Tags</dt>
                  <dd className="flex flex-wrap gap-1">{a.genreTags.map((t: string) => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</span>)}</dd>
                </div>
              )}
            </dl>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Select a genre label to view details</p>}
        </div>
        <div class="px-6 pb-4 pt-2 border-t shrink-0">
          {a?.confidence != null && <div className="flex items-center gap-2 text-xs"><span>Confidence: {Math.round(a.confidence)}%</span><Progress value={a.confidence} className="flex-1 h-1.5" /></div>}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
