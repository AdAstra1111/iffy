/**
 * AutoCastModal — Runs casting across all characters in a single pass.
 * Shows canon per character, allows per-character notes, then fires generation.
 * Results flow back into existing casting_candidates table.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wand2, Loader2, ChevronDown, ChevronRight, Check, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  buildCharacterCastingProfile,
  type CharacterCastingProfile,
} from '@/lib/aiCast/castingProfile';
import { parseLikenessReferences } from '@/lib/aiCast/likenessParser';
import { Users } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface AutoCastModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  characters: string[];
  onComplete: () => void;
}

interface CharacterAutoCastRow {
  name: string;
  profile: CharacterCastingProfile | null;
  notes: string;
  enabled: boolean;
  expanded: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AutoCastModal({
  open,
  onOpenChange,
  projectId,
  characters,
  onComplete,
}: AutoCastModalProps) {
  const [rows, setRows] = useState<CharacterAutoCastRow[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [results, setResults] = useState<{ character: string; generated: number; failed: number }[]>([]);
  const [phase, setPhase] = useState<'setup' | 'running' | 'done'>('setup');

  // Load profiles for all characters
  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['auto-cast-profiles', projectId, characters],
    queryFn: async () => {
      const out: Record<string, CharacterCastingProfile | null> = {};
      for (const name of characters) {
        out[name] = await buildCharacterCastingProfile(projectId, name);
      }
      return out;
    },
    enabled: open && characters.length > 0,
    staleTime: 60_000,
  });

  // Initialize rows when profiles load
  useEffect(() => {
    if (!profiles) return;
    setRows(
      characters.map(name => ({
        name,
        profile: profiles[name] || null,
        notes: '',
        enabled: true,
        expanded: false,
      })),
    );
  }, [profiles, characters]);

  const updateRow = (idx: number, patch: Partial<CharacterAutoCastRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const enabledRows = rows.filter(r => r.enabled);

  const handleRun = async () => {
    if (enabledRows.length === 0) return;
    setPhase('running');
    setRunning(true);
    setProgress(0);
    setResults([]);

    const batchResults: typeof results = [];

    for (let i = 0; i < enabledRows.length; i++) {
      const row = enabledRows[i];
      setStatusMessage(`Casting ${row.name}… (${i + 1}/${enabledRows.length})`);
      setProgress(Math.round(((i) / enabledRows.length) * 100));

      try {
        // Build effective guidance: canon profile + user notes
        const guidanceNotes = row.notes.trim() || undefined;

        const { data, error } = await supabase.functions.invoke('generate-casting-candidates', {
          body: {
            projectId,
            candidatesPerCharacter: 4,
            characterFilter: row.name,
            explorationMode: false,
            autoCastNotes: guidanceNotes,
          },
        });

        if (error) throw error;
        batchResults.push({
          character: row.name,
          generated: data?.generated || 0,
          failed: data?.failed || 0,
        });
      } catch (e: any) {
        console.error(`Auto-cast failed for ${row.name}:`, e);
        batchResults.push({ character: row.name, generated: 0, failed: 1 });
      }
    }

    setResults(batchResults);
    setProgress(100);
    setStatusMessage('Auto-Cast complete');
    setRunning(false);
    setPhase('done');
  };

  const handleClose = () => {
    if (phase === 'done') {
      onComplete();
    }
    setPhase('setup');
    setProgress(0);
    setResults([]);
    setStatusMessage('');
    onOpenChange(false);
  };

  const totalGenerated = results.reduce((s, r) => s + r.generated, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Wand2 className="h-4 w-4 text-primary" />
            Auto-Cast
          </DialogTitle>
          <DialogDescription className="text-xs">
            {phase === 'setup'
              ? 'Review character canon and add notes before running. Candidates will appear in the main casting view.'
              : phase === 'running'
              ? 'Generating candidates for each character…'
              : `Complete — ${totalGenerated} candidates generated across ${enabledRows.length} characters.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Setup Phase ── */}
        {phase === 'setup' && (
          <div className="space-y-2 py-2">
            {profilesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No characters found.</p>
            ) : (
              rows.map((row, idx) => (
                <AutoCastCharacterRow
                  key={row.name}
                  row={row}
                  onToggle={() => updateRow(idx, { enabled: !row.enabled })}
                  onExpand={() => updateRow(idx, { expanded: !row.expanded })}
                  onNotesChange={(notes) => updateRow(idx, { notes })}
                />
              ))
            )}
          </div>
        )}

        {/* ── Running Phase ── */}
        {phase === 'running' && (
          <div className="space-y-4 py-4">
            <Progress value={progress} className="h-2" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              {statusMessage}
            </div>
          </div>
        )}

        {/* ── Done Phase ── */}
        {phase === 'done' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-4 text-xs">
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                {totalGenerated} generated
              </Badge>
              {totalFailed > 0 && (
                <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                  {totalFailed} failed
                </Badge>
              )}
            </div>
            {results.map(r => (
              <div key={r.character} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/20 text-xs">
                <span className="font-medium text-foreground">{r.character}</span>
                <div className="flex items-center gap-2">
                  {r.generated > 0 && (
                    <span className="text-primary">{r.generated} candidates</span>
                  )}
                  {r.failed > 0 && (
                    <span className="text-destructive">{r.failed} failed</span>
                  )}
                  {r.generated === 0 && r.failed === 0 && (
                    <span className="text-muted-foreground">skipped</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={running}>
            {phase === 'done' ? 'Close & Refresh' : 'Cancel'}
          </Button>
          {phase === 'setup' && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleRun}
              disabled={enabledRows.length === 0 || profilesLoading}
            >
              <Wand2 className="h-3.5 w-3.5" />
              Auto-Cast {enabledRows.length} Character{enabledRows.length !== 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Character Row ────────────────────────────────────────────────────────────

function AutoCastCharacterRow({
  row,
  onToggle,
  onExpand,
  onNotesChange,
}: {
  row: CharacterAutoCastRow;
  onToggle: () => void;
  onExpand: () => void;
  onNotesChange: (notes: string) => void;
}) {
  const p = row.profile;
  const hasCanon = p && p.completeness > 0;

  return (
    <div className={cn(
      'rounded-lg border p-2.5 transition-colors',
      row.enabled ? 'border-border/50 bg-card/30' : 'border-border/20 bg-muted/10 opacity-60',
    )}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          className={cn(
            'h-4 w-4 rounded border flex items-center justify-center transition-colors shrink-0',
            row.enabled ? 'bg-primary border-primary' : 'border-border/60',
          )}
        >
          {row.enabled && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
        </button>

        <button onClick={onExpand} className="flex-1 flex items-center gap-2 text-left">
          <span className="text-xs font-medium text-foreground">{row.name}</span>
          {p && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">
              {p.completeness}% canon
            </Badge>
          )}
          {!hasCanon && (
            <AlertCircle className="h-3 w-3 text-amber-400" />
          )}
          {row.expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
          )}
        </button>
      </div>

      {/* Expanded: Canon + Notes */}
      {row.expanded && (
        <div className="mt-2 space-y-2 pl-6">
          {/* Canon summary */}
          {p ? (
            <div className="space-y-1 text-[10px]">
              {p.physical.gender && (
                <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                  {p.physical.gender}
                </span>
              )}
              {p.physical.age_range && (
                <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                  Age: {p.physical.age_range}
                </span>
              )}
              {p.physical.ethnicity && (
                <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                  {p.physical.ethnicity}
                </span>
              )}
              {p.physical.body_type && (
                <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                  Build: {p.physical.body_type}
                </span>
              )}
              {p.narrative.role_type && (
                <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                  {p.narrative.role_type}
                </span>
              )}
              {p.narrative.archetype && (
                <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                  {p.narrative.archetype}
                </span>
              )}
              {p.emotional.core_traits.length > 0 && (
                <div className="text-muted-foreground mt-0.5">
                  Traits: {p.emotional.core_traits.slice(0, 4).join(', ')}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">No canon data available — broader search will be used.</p>
          )}

          {/* Notes field */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Casting notes (optional)</label>
            <Textarea
              value={row.notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="e.g. 'looks like Tom Hardy', 'a mix of Cate Blanchett and Tilda Swinton', 'more weathered'"
              className="min-h-[52px] text-[11px] resize-none"
              rows={2}
            />
            {(() => {
              const lr = parseLikenessReferences(row.notes);
              if (!lr.has_references) return null;
              return (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {lr.references.map((ref, i) => (
                    <span
                      key={i}
                      className={cn(
                        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border',
                        ref.reference_strength === 'strong'
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-muted/30 text-muted-foreground border-border/40',
                      )}
                    >
                      <Users className="h-2 w-2" />
                      {ref.reference_people.join(' + ')}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
