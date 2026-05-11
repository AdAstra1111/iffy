/**
 * CharacterBibleProgress — Per-character progress cards for character bible generation.
 *
 * Polls version meta_json.characters_completed / characters_total during
 * per-character background generation. Shows each character with status
 * (pending/generating/complete/failed) as individual cards.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Clock, AlertTriangle, XCircle, RefreshCw, User } from 'lucide-react';

interface CharacterBibleProgressProps {
  versionId: string;
  docType: string;
  mode?: 'generate' | 'rewrite';
}

interface VersionMeta {
  bg_generating?: boolean;
  bg_completed_at?: string;
  bg_failed?: boolean;
  characters_total?: number;
  characters_completed?: number;
  characters_to_rewrite?: number;
  characters_list?: string[];
  affected_characters?: string[];
  current_character?: string;
  rewrite_mode?: string;
}

function characterStatusIcon(idx: number, meta: VersionMeta): { icon: React.ReactNode; label: string; color: string } {
  const total = meta.characters_total ?? 0;
  const completed = meta.characters_completed ?? 0;

  if (meta.bg_failed) {
    return {
      icon: <XCircle className="h-4 w-4 text-destructive shrink-0" />,
      label: 'Failed',
      color: 'border-destructive/40',
    };
  }

  if (idx < completed) {
    return {
      icon: <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />,
      label: 'Done',
      color: 'border-emerald-500/20',
    };
  }

  if (idx === completed) {
    return {
      icon: <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />,
      label: meta.current_character || 'Generating',
      color: 'border-blue-500/30',
    };
  }

  return {
    icon: <Clock className="h-4 w-4 text-muted-foreground/50 shrink-0" />,
    label: 'Pending',
    color: 'border-border/20',
  };
}

export function CharacterBibleProgress({ versionId, docType, mode = 'generate' }: CharacterBibleProgressProps) {
  const { data: meta, isLoading } = useQuery<VersionMeta>({
    queryKey: ['character-bible-progress', versionId],
    queryFn: async () => {
      if (!versionId) return {};
      const { data, error } = await (supabase as any)
        .from('project_document_versions')
        .select('meta_json')
        .eq('id', versionId)
        .single();
      if (error) throw error;
      return (data?.meta_json || {}) as VersionMeta;
    },
    enabled: !!versionId,
    refetchInterval: (query) => {
      const m = query.state.data;
      if (!m) return 5000;
      // Stop polling when generation is done or failed
      if (m.bg_failed || m.bg_completed_at) return false;
      return 4000;
    },
  });

  const total = meta?.characters_total ?? 0;
  const completed = meta?.characters_completed ?? 0;
  const charList = meta?.characters_list ?? [];
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isGenerating = !meta?.bg_completed_at && !meta?.bg_failed && total > 0;
  const isComplete = !!meta?.bg_completed_at;
  const isFailed = !!meta?.bg_failed;

  // Generate character cards — use characters_list if available, otherwise show numbered slots
  const cardItems = charList.length > 0
    ? charList
    : Array.from({ length: Math.max(total, 1) }, (_, i) => `Character ${i + 1}`);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm text-center max-w-sm">Loading character progress…</p>
      </div>
    );
  }

  // No generation data yet
  if (total === 0 && !meta?.bg_failed) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm text-center max-w-sm">
          {mode === 'rewrite'
            ? 'Preparing per-character rewrite — reading existing character profiles…'
            : 'Preparing character generation — identifying characters from concept brief…'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full space-y-4">
      {/* Header + progress bar */}
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {mode === 'rewrite' ? 'Character Bible Rewrite' : 'Generating Character Bible'}
            </span>
            {isGenerating && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/20 gap-1">
                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                Live
              </Badge>
            )}
            {isComplete && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                Complete
              </Badge>
            )}
            {isFailed && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400 border-red-500/20">
                Failed
              </Badge>
            )}
          </div>
          <span className="text-muted-foreground font-mono text-xs">
            {meta?.characters_to_rewrite != null && meta.characters_to_rewrite !== total
              ? `Rewriting ${completed} of ${meta.characters_to_rewrite} characters (${total} total)`
              : `${completed} / ${total} characters`}
          </span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      {/* Character cards */}
      <div className="w-full space-y-2">
        {cardItems.map((charName, idx) => {
          const st = characterStatusIcon(idx, meta || {});
          return (
            <Card key={idx} className={`transition-all duration-200 ${st.color}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">{st.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <h4 className="text-xs font-semibold text-foreground truncate">
                          {charName}
                        </h4>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 capitalize">{st.label}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground/60 text-center">
        {isGenerating
          ? `Writing character profiles — ${completed} of ${total} complete.`
          : isComplete
            ? 'Character bible generation complete.'
            : isFailed
              ? 'Generation failed — try again.'
              : ''}
      </p>
    </div>
  );
}
