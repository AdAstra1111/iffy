import { Loader2, MessageSquareWarning } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCanonicalEntities, type CanonicalEntity } from '@/hooks/useCanonicalEntities';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CanonicalEntityRosterProps {
  projectId: string;
  entityType: 'character' | 'location' | 'prop';
}

const ENTITY_LABELS: Record<string, string> = {
  character: 'Character',
  location: 'Location',
  prop: 'Prop',
};

/* ── NameReviewPanel — shows pending name_review_suggestions ── */
interface NameSuggestion {
  id: string;
  extracted_name: string;
  suggested_canonical: string;
  matched_entity_id: string | null;
  confidence: string;
  reason: string;
  action: string;
}

function NameReviewPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['name-review-suggestions', projectId],
    queryFn: async (): Promise<NameSuggestion[]> => {
      const { data, error } = await supabase
        .from('name_review_suggestions')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'pending')
        .order('confidence', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!projectId,
    staleTime: 15_000,
  });

  const acceptMutation = useMutation({
    mutationFn: async (suggestion: NameSuggestion) => {
      const res = await fetch('/api/accept_name_suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_id: suggestion.id, project_id: projectId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['name-review-suggestions', projectId] });
      queryClient.invalidateQueries({ queryKey: ['canonical-entities', projectId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (suggestion: NameSuggestion) => {
      const { error } = await supabase
        .from('name_review_suggestions')
        .update({ status: 'rejected' })
        .eq('id', suggestion.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['name-review-suggestions', projectId] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/20">
        <MessageSquareWarning className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-amber-300">
          {suggestions.length} name {suggestions.length === 1 ? 'variant' : 'variants'} need review
        </span>
      </div>
      <div className="divide-y divide-border/20 max-h-56 overflow-y-auto">
        {suggestions.map((s) => (
          <div key={s.id} className="px-3 py-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-amber-200 truncate">{s.extracted_name}</span>
                <span className="text-xs text-muted-foreground shrink-0">→</span>
                <span className="text-xs text-muted-foreground truncate">{s.suggested_canonical}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => acceptMutation.mutate(s)}
                  disabled={acceptMutation.isPending || rejectMutation.isPending}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => rejectMutation.mutate(s)}
                  disabled={acceptMutation.isPending || rejectMutation.isPending}
                >
                  Reject
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{s.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntityRow({ entity }: { entity: CanonicalEntity }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate">{entity.name}</span>
          {entity.sceneCount > 0 && (
            <Badge variant="outline" className="text-xs bg-muted/40 text-muted-foreground border-border/50 shrink-0">
              {entity.sceneCount} {entity.sceneCount === 1 ? 'scene' : 'scenes'}
            </Badge>
          )}
        </div>
        {entity.variantNames.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {entity.variantNames.map((v) => (
              <span
                key={v}
                className="text-xs px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground border border-border/40"
              >
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CanonicalEntityRoster({ projectId, entityType }: CanonicalEntityRosterProps) {
  const { entities, isLoading, hasOrphans } = useCanonicalEntities({ projectId, entityType });

  const label = ENTITY_LABELS[entityType] ?? entityType;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Canonical {label}s
          </span>
          {entities.length > 0 && (
            <Badge variant="outline" className="text-xs bg-muted/30 text-muted-foreground border-border/50">
              {entities.length}
            </Badge>
          )}
        </div>
      </div>

      {/* Yellow warning banner for regex orphans */}
      {hasOrphans && regexOrphans.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2">
          <span className="text-yellow-400 text-sm shrink-0 mt-0.5">⚠</span>
          <p className="text-xs text-yellow-300 leading-relaxed">
            <span className="font-medium">{regexOrphans.length}</span>{' '}
            {regexOrphans.length === 1 ? 'name' : 'names'} found in script were not in the canonical set —
            review the character bible
          </p>
        </div>
      )}

      {/* NameReviewPanel — pending name canonicalization suggestions */}
      {entityType === 'character' && <NameReviewPanel projectId={projectId} />}

      {/* Entity list */}
      {entities.length === 0 ? (
        <div className="text-center py-6 rounded-md border border-dashed border-border/50">
          <p className="text-sm text-muted-foreground">
            No {label.toLowerCase()}s extracted yet — run script intake to populate the canonical roster
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border/40 bg-muted/10 overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {entities.map((entity) => (
              <EntityRow key={entity.id} entity={entity} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
