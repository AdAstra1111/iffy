/**
 * TreatmentActBlueprintPanel — Shows the structural blueprint for each act in a Treatment document.
 * Displays act function, canon constraints, targeting notes, arc-state deltas, and generated content.
 * Props: documentId, versionId, docType
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Shield,
  Target,
  GitBranch,
  AlertTriangle,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActBlueprint {
  actKey?: string;
  actNumber?: number;
  label?: string;
  functionDescription?: string;
  canonConstraints?: string[];
  targetingNotes?: string[];
  hasPrecedingContext?: boolean;
}

interface CharacterState {
  current_desire?: string;
  current_fear?: string;
  emotional_state?: string;
  relationship_states?: Record<string, string>;
}

interface PendingArc {
  character?: string;
  arc_description?: string;
  tension_level?: string | number;
}

interface UnresolvedTension {
  tension?: string;
  introduced_in_act?: string | number;
  escalation_level?: string | number;
}

interface ArcStateDeltas {
  character_states?: Record<string, CharacterState>;
  pending_arcs?: PendingArc[];
  unresolved_tensions?: UnresolvedTension[];
}

interface TreatmentActRow {
  id: string;
  act_number: number;
  act_key: string;
  label: string;
  content: string | null;
  content_hash: string | null;
  act_blueprint: ActBlueprint | null;
  arc_state_deltas: ArcStateDeltas | null;
  status: string;
  error_message: string | null;
  created_at: string;
  revised_at: string | null;
}

export interface TreatmentActBlueprintPanelProps {
  documentId: string;
  versionId?: string;
  docType?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'done':
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 border">
          <CheckCircle className="h-2.5 w-2.5" />
          Done
        </Badge>
      );
    case 'rewriting':
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1 border">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          Rewriting
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-destructive/15 text-destructive border-destructive/30 gap-1 border">
          <XCircle className="h-2.5 w-2.5" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-muted/30 text-muted-foreground border-border/30 gap-1 border">
          <Clock className="h-2.5 w-2.5" />
          Pending
        </Badge>
      );
  }
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
      {icon}
      {label}
    </div>
  );
}

function ConstraintList({ items, emptyText = 'None' }: { items?: string[]; emptyText?: string }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-muted-foreground/50 italic">{emptyText}</p>;
  }
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ArcStateSection({ deltas }: { deltas: ArcStateDeltas | null }) {
  if (!deltas) return <p className="text-xs text-muted-foreground/50 italic">No arc-state data</p>;

  const { character_states, pending_arcs, unresolved_tensions } = deltas;
  const hasAny =
    (character_states && Object.keys(character_states).length > 0) ||
    (pending_arcs && pending_arcs.length > 0) ||
    (unresolved_tensions && unresolved_tensions.length > 0);

  if (!hasAny) return <p className="text-xs text-muted-foreground/50 italic">No arc-state data from prior acts</p>;

  return (
    <div className="space-y-3">
      {character_states && Object.keys(character_states).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Character States</p>
          <div className="space-y-2">
            {Object.entries(character_states).map(([name, state]) => (
              <div key={name} className="pl-2 border-l border-border/40">
                <p className="text-xs font-medium text-foreground/90">{name}</p>
                {state.current_desire && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-foreground/60">Wants:</span> {state.current_desire}
                  </p>
                )}
                {state.current_fear && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-foreground/60">Fears:</span> {state.current_fear}
                  </p>
                )}
                {state.emotional_state && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-foreground/60">State:</span> {state.emotional_state}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pending_arcs && pending_arcs.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Pending Arcs</p>
          <div className="space-y-1.5">
            {pending_arcs.map((arc, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <GitBranch className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
                <span>
                  {arc.character && <span className="font-medium">{arc.character}: </span>}
                  {arc.arc_description}
                  {arc.tension_level != null && (
                    <span className="ml-1 text-[10px] text-muted-foreground/60">(tension: {arc.tension_level})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {unresolved_tensions && unresolved_tensions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Unresolved Tensions</p>
          <div className="space-y-1.5">
            {unresolved_tensions.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <AlertTriangle className="h-3 w-3 text-amber-500/60 shrink-0 mt-0.5" />
                <span>
                  {t.tension}
                  {t.introduced_in_act != null && (
                    <span className="ml-1 text-[10px] text-muted-foreground/60">
                      (act {t.introduced_in_act}
                      {t.escalation_level != null ? `, escalation: ${t.escalation_level}` : ''})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActCard({ act }: { act: TreatmentActRow }) {
  const [contentExpanded, setContentExpanded] = useState(false);
  const bp = act.act_blueprint;
  const isDone = act.status === 'done';

  return (
    <div className="rounded-lg border border-border/40 bg-card/30 overflow-hidden">
      {/* Act header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/50">
        <span className="text-sm font-semibold text-foreground">
          {act.label || bp?.label || `Act ${act.act_number}`}
        </span>
        {statusBadge(act.status)}
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Function description */}
        {bp?.functionDescription && (
          <div>
            <SectionLabel icon={<BookOpen className="h-3 w-3" />} label="Function" />
            <p className="text-xs text-foreground/80 leading-relaxed">{bp.functionDescription}</p>
          </div>
        )}

        {/* Canon constraints */}
        <div>
          <SectionLabel icon={<Shield className="h-3 w-3" />} label="Canon Constraints" />
          <ConstraintList items={bp?.canonConstraints} emptyText="No canon constraints" />
        </div>

        {/* Targeting notes */}
        {bp?.targetingNotes && bp.targetingNotes.length > 0 && (
          <div>
            <SectionLabel icon={<Target className="h-3 w-3" />} label="Notes Targeting This Act" />
            <ConstraintList items={bp.targetingNotes} />
          </div>
        )}

        {/* Arc-state deltas */}
        <div>
          <SectionLabel icon={<GitBranch className="h-3 w-3" />} label="Arc-State from Prior Acts" />
          <ArcStateSection deltas={act.arc_state_deltas} />
        </div>

        {/* Error */}
        {act.status === 'failed' && act.error_message && (
          <div className="flex items-start gap-2 p-2.5 rounded bg-destructive/10 border border-destructive/20">
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive/90">{act.error_message}</p>
          </div>
        )}

        {/* Generated content — collapsible */}
        {isDone && act.content && (
          <div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setContentExpanded(e => !e)}
            >
              <BookOpen className="h-3 w-3" />
              Generated Content
              {contentExpanded
                ? <ChevronUp className="h-3 w-3 ml-1" />
                : <ChevronDown className="h-3 w-3 ml-1" />}
            </button>
            {contentExpanded && (
              <ScrollArea className="max-h-[400px] mt-2">
                <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap pr-3 pt-1">
                  {act.content}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function TreatmentActBlueprintPanel({ documentId, versionId, docType }: TreatmentActBlueprintPanelProps) {
  const { data: acts = [], isLoading, isError } = useQuery<TreatmentActRow[]>({
    queryKey: ['treatment-acts-blueprint', documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const { data, error } = await (supabase as any)
        .from('treatment_acts')
        .select('*')
        .eq('treatment_id', documentId)
        .order('act_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TreatmentActRow[];
    },
    enabled: !!documentId,
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (!rows || rows.length === 0) return 8000;
      const TERMINAL = new Set(['done', 'failed']);
      const allTerminal = rows.every((r: TreatmentActRow) => TERMINAL.has(r.status));
      return allTerminal ? false : 8000;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[200px] gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading act blueprints…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-[200px] gap-2 text-destructive/70 text-sm">
        <XCircle className="h-4 w-4" />
        Failed to load act blueprints
      </div>
    );
  }

  if (acts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] gap-2 text-muted-foreground text-sm">
        <Clock className="h-5 w-5 opacity-40" />
        <p>No act data yet — generation may not have started.</p>
      </div>
    );
  }

  const doneCount = acts.filter(a => a.status === 'done').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Act-by-act structural blueprint — function, constraints, arc state, and generated prose.
        </p>
        <span className="text-[10px] text-muted-foreground font-mono">
          {doneCount} / {acts.length} acts done
        </span>
      </div>

      <div className="space-y-3">
        {acts.map((act) => (
          <ActCard key={act.id} act={act} />
        ))}
      </div>
    </div>
  );
}
