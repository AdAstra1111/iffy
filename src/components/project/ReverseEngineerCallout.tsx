import { useState, useMemo, useEffect, useRef } from 'react';
import { Zap, Loader2, X, FileText, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReverseEngineer } from '@/hooks/useReverseEngineer';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getLadderForFormat } from '@/lib/stages/registry';
import type { DeliverableStage } from '@/lib/stages/registry';

const BASE_DOC_ROWS: Array<{ key: string; label: string; icon: typeof FileText }> = [
  { key: 'concept_brief',   label: 'Concept Brief',    icon: FileText },
  { key: 'market_sheet',    label: 'Market Sheet',     icon: FileText },
  { key: 'format_rules',    label: 'Format Rules',     icon: FileText },
  { key: 'character_bible', label: 'Character Bible',   icon: FileText },
];

/** Maps ladder stage → human-readable label for the post-character_bible stage */
const POST_CHAR_BIBLE_LABELS: Partial<Record<DeliverableStage, string>> = {
  beat_sheet:             'Beat Sheet',
  episode_grid:           'Episode Grid',
  vertical_episode_beats: 'Episode Beats',
  story_outline:          'Story Outline',
  season_arc:             'Story Arc',
  treatment:              'Treatment',
};

type DocState = 'pending' | 'working' | 'done';

interface ReverseEngineerCalloutProps {
  projectId: string;
  documents: any[];
  /** Project format (e.g. 'film', 'vertical-drama', 'tv-series') — used to determine format-specific doc stages */
  projectFormat?: string;
}

export function ReverseEngineerCallout({ projectId, documents, projectFormat }: ReverseEngineerCalloutProps) {
  // Derive format-aware doc rows from the canonical ladder
  const docRows = useMemo(() => {
    const ladder = getLadderForFormat(projectFormat ?? 'film') ?? [];
    const cbIdx = ladder.indexOf('character_bible');
    const afterCharBible = ladder[cbIdx + 1] as DeliverableStage | undefined;
    const extraLabel = afterCharBible ? (POST_CHAR_BIBLE_LABELS[afterCharBible] ?? afterCharBible.replace(/_/g, ' ')) : null;
    return extraLabel
      ? [...BASE_DOC_ROWS, { key: afterCharBible, label: extraLabel, icon: FileText as typeof FileText }]
      : BASE_DOC_ROWS;
  }, [projectFormat]);

  // Format-aware phase labels (one per doc row, preceded by "Analysing script…")
  const phases = useMemo(() => [
    'Analysing script…',
    ...docRows.map(d => `Generating ${d.label}…`),
  ], [docRows]);

  const [dismissed, setDismissed] = useState(false);
  const { reverseEngineerFromScript, isRunning } = useReverseEngineer();
  const queryClient = useQueryClient();

  // Per-doc progress animation
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [docStates, setDocStates] = useState<Record<string, DocState>>(
    Object.fromEntries(docRows.map(d => [d.key, 'pending'])) as Record<string, DocState>
  );
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      setPhaseIdx(0);
      setDocStates(Object.fromEntries(docRows.map(d => [d.key, 'pending'])) as Record<string, DocState>);
      progressInterval.current = setInterval(() => {
        setPhaseIdx(prev => {
          const next = Math.min(prev + 1, phases.length - 1);
          // Mark doc rows done as phases advance (phase 0 = analysing, phase 1+ = doc rows)
          docRows.forEach((doc, i) => {
            if (next > i) setDocStates(ds => ({ ...ds, [doc.key]: 'done' }));
          });
          return next;
        });
      }, 5000);
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current);
    }
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  }, [isRunning, docRows, phases.length]);

  const scriptDoc = useMemo(() =>
    documents.find(d => {
      const dt = (d.doc_type || '') as string;
      const role = (d.doc_role || '') as string;
      const title = (d.title || '') as string;
      if (dt.includes('script')) return true;
      if (dt === 'source_script') return true;
      if (role === 'source_script') return true;
      if (role === 'creative_primary' && title.toLowerCase().includes('script')) return true;
      return false;
    }), [documents]);

  const hasConceptBrief = useMemo(() =>
    documents.some(d => d.doc_type === 'concept_brief'), [documents]);

  if (dismissed || !scriptDoc || hasConceptBrief) return null;

  const activePhaseLabel = isRunning ? phases[phaseIdx] : null;

  const handleGenerate = async () => {
    const result = await reverseEngineerFromScript(projectId, scriptDoc.id);
    if (result.success) {
      toast.success(`Pipeline documents generated! ${result.documents_created || ''} docs created.`);
      queryClient.invalidateQueries({ queryKey: ['dev-v2-docs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['seed-pack-versions', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
      setDismissed(true);
    } else {
      toast.error(result.error || 'Could not generate pipeline documents');
    }
  };

  return (
    <div className="relative rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="rounded-md bg-amber-500/10 p-2 shrink-0">
          <Zap className="h-4 w-4 text-amber-500" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-foreground mb-1">
            Script detected — generate full pipeline?
          </h4>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Generate {docRows.map(d => d.label).join(', ')} from your script in one click.
          </p>

          {isRunning && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 mb-3 space-y-2">
              {/* Phase label */}
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 shrink-0" />
                <span className="text-[11px] text-amber-400 font-medium animate-pulse">
                  {activePhaseLabel || 'Starting…'}
                </span>
              </div>

              {/* Per-doc progress rows */}
              <div className="space-y-1 pl-1">
                {docRows.map(doc => {
                  const Icon = doc.icon;
                  const state = docStates[doc.key];
                  return (
                    <div key={doc.key} className="flex items-center gap-2 text-[11px]">
                      <div className="shrink-0 w-4 h-4 flex items-center justify-center">
                        {state === 'done' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : state === 'working' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                        ) : (
                          <Circle className="h-3 w-3 text-muted-foreground/40" />
                        )}
                      </div>
                      <Icon className={`h-3 w-3 shrink-0 ${state === 'done' ? 'text-emerald-500/70' : state === 'working' ? 'text-amber-500' : 'text-muted-foreground/40'}`} />
                      <span className={state === 'done' ? 'text-foreground/60' : state === 'working' ? 'text-foreground font-medium' : 'text-muted-foreground/50'}>
                        {doc.label}
                      </span>
                      {state === 'done' && <span className="ml-auto text-[9px] text-emerald-500/80 font-medium pr-1">Done</span>}
                      {state === 'working' && <span className="ml-auto text-[9px] text-amber-400/70 animate-pulse pr-1">Working…</span>}
                    </div>
                  );
                })}
              </div>

              {/* Overall progress bar */}
              <div className="relative h-0.5 rounded-full bg-amber-900/40 overflow-hidden mt-1">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-amber-500 transition-all duration-700"
                  style={{ width: `${((phaseIdx + 1) / phases.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-foreground border-0"
            disabled={isRunning}
            onClick={handleGenerate}
          >
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Generate Pipeline Documents
          </Button>
        </div>
      </div>
    </div>
  );
}
