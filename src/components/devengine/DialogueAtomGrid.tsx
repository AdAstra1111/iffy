import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, Drawer, Drawer, DrawerClose } from '@/components/ui/drawer';
import { Loader2, RefreshCw, Sparkles, Clock, AlertTriangle, CheckCircle2, X, MessageSquare } from 'lucide-react';
import type { DialogueAtom } from '@/hooks/useDialogueAtoms';

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
  useEffect(() => { const i = setInterval(() => setLabel(`${Math.floor((Date.now() - date.getTime()) / 60000)}m ago`), 30000); return () => clearInterval(i); }, [date]);
  return <span className="text-xs text-muted-foreground">{label}</span>;
}
interface DialogueAtomGridProps { atoms: DialogueAtom[]; isLoading: boolean; isRefreshing: boolean; lastUpdated: Date | null; error: string | null; onExtract: () => Promise<any>; onGenerate: () => Promise<any>; onResetFailed: () => Promise<any>; onRefresh: () => Promise<void>; }
function AttrRow({ label, value }: { label: string; value: React.ReactNode }) { if (!value) return null; return <div className="grid grid-cols-[140px_1fr] gap-2 py-2 border-b border-border/50 last:border-0"><dt className="text-xs text-muted-foreground font-medium">{label}</dt><dd className="text-sm">{value}</dd></div>; }

export function DialogueAtomGrid({ atoms, isLoading, isRefreshing, lastUpdated, error, onExtract, onGenerate, onResetFailed, onRefresh }: DialogueAtomGridProps) {
  const [selected, setSelected] = useState<DialogueAtom | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const totalCount = atoms.length;
  const completedCount = atoms.filter(a => a.generation_status === 'completed' || a.generation_status === 'complete').length;
  const failedCount = atoms.filter(a => a.generation_status === 'failed').length;
  const handleExtract = async () => { const result = await onExtract(); if (result?.created != null) await onGenerate(); };

  return (
    <div className="space-y-4">
      {/* Progress bar during extraction/generation */}
      {(isExtracting || isGenerating) && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
            <span className="text-xs font-medium text-blue-300">
              {isExtracting
                ? 'Extracting dialogue atoms from script...'
                : isGenerating
                ? `Generating dialogue atoms ({completedCount}/{totalCount})...`
                : ''}
            </span>
          </div>
          <Progress value={isExtracting ? 25 : generationProgress} className="h-1.5" />
          <div className="text-[10px] text-blue-300/70">
            {isExtracting
              ? `Found {totalCount} dialogue atoms in script — building atoms...`
              : isGenerating
              ? `{completedCount} of {totalCount} atoms complete`
              : ''}
          </div>
        </div>
      )}


      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">Dialogue</span>{isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}</div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdated && !isLoading && <div className="flex items-center gap-1 text-xs text-muted-foreground">{isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}<TimeAgo date={lastUpdated} /></div>}
          {totalCount > 0 && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{completedCount > 0 && <span className="text-emerald-400">{completedCount} done</span>}{failedCount > 0 && <><span className="text-muted-foreground">·</span><span className="text-red-400">{failedCount} failed</span></>}</div>}
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={isLoading || isRefreshing} className="h-8 text-xs text-muted-foreground shrink-0"><RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />Refresh</Button>
          <Button size="sm" variant="outline" onClick={handleExtract} disabled={isLoading || isRefreshing} className="h-8 text-xs shrink-0"><Sparkles className="h-3 w-3 mr-1" />{totalCount === 0 ? 'Atomise Dialogue' : 'Regenerate'}</Button>
          {failedCount > 0 && <Button size="sm" variant="ghost" onClick={onResetFailed} className="h-8 text-xs text-amber-400 shrink-0"><RefreshCw className="h-3 w-3 mr-1" />Reset Failed</Button>}
        </div>
      </div>
      {error && <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2"><AlertTriangle className="h-3 w-3 shrink-0" />{error}</div>}
      {isLoading && totalCount === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3].map(i => <Card key={i} className="p-3"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></Card>)}</div>
      ) : totalCount === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground"><MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No dialogue profiles yet.</p><p className="text-xs mt-1">Click "Atomise Dialogue" to fingerprint character speech.</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {atoms.map(atom => {
            const a = atom.attributes as any;
            return (
              <Card key={atom.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => { setSelected(atom); setDrawerOpen(true); }}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="font-medium text-sm truncate">{atom.canonical_name}</span></div>
                    <StatusBadge status={atom.generation_status} />
                  </div>
                  {a?.speechRegister && <div className="text-xs text-muted-foreground">Register: {a.speechRegister}</div>}
                  {a?.accentGuidance && <div className="text-xs text-muted-foreground">Accent: {a.accentGuidance}</div>}
                  {a?.dialogueTags?.length > 0 && <div className="flex flex-wrap gap-1">{a.dialogueTags.slice(0, 3).map((t: string) => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</span>)}</div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <DialogueAtomDetailDrawer atom={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

export function DialogueAtomDetailDrawer({ atom, open, onOpenChange }: { atom: DialogueAtom | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const a = atom?.attributes as any;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-lg mx-auto">
        <DrawerHeader>
          <div className="flex items-center justify-between"><DrawerTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />{atom?.canonical_name || 'Dialogue'}</DrawerTitle><DrawerClose className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></DrawerClose></div>
          {atom && <DrawerDescription><StatusBadge status={atom.generation_status} /></DrawerDescription>}
        </DrawerHeader>
        <div class="overflow-y-auto max-h-[70vh] px-6 py-4" className="overflow-y-auto max-h-[70vh] px-6">
          {a ? (
            <dl className="text-sm">
              <AttrRow label="Speech Register" value={a.speechRegister} />
              <AttrRow label="Vocabulary" value={a.vocabularyComplexity} />
              <AttrRow label="Sentence Structure" value={a.sentenceStructure} />
              <AttrRow label="Accent Guidance" value={a.accentGuidance} />
              <AttrRow label="Speech Tempo" value={a.speechTempo} />
              <AttrRow label="Emotional Range" value={a.emotionalRange} />
              <AttrRow label="Subtext" value={a.subtextCapability} />
              <AttrRow label="Exposition Style" value={a.expositionStyle} />
              <AttrRow label="Casting Direction" value={a.castingDirection} />
              <AttrRow label="Audience Perception" value={a.audiencePerception} />
              <AttrRow label="Dialogue Weakness" value={a.dialogueWeakness} />
              {a.dialectMarkers?.length > 0 && <div className="py-2 border-b border-border/50"><dt className="text-xs text-muted-foreground font-medium mb-1.5">Dialect Markers</dt><dd className="flex flex-wrap gap-1">{a.dialectMarkers.map((t: string) => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</span>)}</dd></div>}
              {a.signaturePhrases?.length > 0 && <div className="py-2 border-b border-border/50"><dt className="text-xs text-muted-foreground font-medium mb-1.5">Signature Phrases</dt><dd className="flex flex-col gap-1">{a.signaturePhrases.map((p: string) => <span key={p} className="text-xs italic">"{p}"</span>)}</dd></div>}
              {a.verbalTics?.length > 0 && <div className="py-2 border-b border-border/50"><dt className="text-xs text-muted-foreground font-medium mb-1.5">Verbal Tics</dt><dd className="flex flex-wrap gap-1">{a.verbalTics.map((t: string) => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</span>)}</dd></div>}
              {a.dialogueTags?.length > 0 && <div className="py-2 border-b border-border/50"><dt className="text-xs text-muted-foreground font-medium mb-1.5">Tags</dt><dd className="flex flex-wrap gap-1">{a.dialogueTags.map((t: string) => <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</span>)}</dd></div>}
              {a.sampleLines?.length > 0 && <div className="py-2 border-b border-border/50"><dt className="text-xs text-muted-foreground font-medium mb-1.5">Sample Lines</dt><dd className="flex flex-col gap-1.5">{a.sampleLines.map((l: string, i: number) => <span key={i} className="text-xs italic border-l-2 border-primary/30 pl-2">"{l}"</span>)}</dd></div>}
            </dl>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Select a dialogue profile to view details</p>}
        </div>
        <div class="px-6 pb-4 pt-2 border-t shrink-0">{a?.confidence != null && <div className="flex items-center gap-2 text-xs"><span>Confidence: {Math.round(a.confidence)}%</span><Progress value={a.confidence} className="flex-1 h-1.5" /></div>}</div>
      </DrawerContent>
    </Drawer>
  );
}
