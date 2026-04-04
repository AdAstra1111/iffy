/**
 * VisualCoherencePanel — VCS evaluative score display.
 *
 * ROLE: evaluative_score (per UI_SURFACE_BOUNDARIES.VCS_PANEL)
 * Displays visual coherence quality evaluation — NOT a progression gate, NOT a truth surface.
 */
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, TrendingUp, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VCSResult, VCSComponentKey, VCSComponentResult } from '@/lib/visual/visualCoherenceEngine';
import type { VCSDiagnostics } from '@/lib/visual/vcsInputAssembler';

interface Props {
  result: VCSResult | null;
  loading?: boolean;
  diagnostics?: VCSDiagnostics | null;
}

const COMPONENT_LABELS: Record<VCSComponentKey, { label: string; icon: string }> = {
  world_coherence: { label: 'World Coherence', icon: '🌍' },
  material_consistency: { label: 'Material Consistency', icon: '🧱' },
  character_integration: { label: 'Character Integration', icon: '👤' },
  stylistic_unity: { label: 'Stylistic Unity', icon: '🎨' },
  iconic_appeal: { label: 'Iconic Appeal', icon: '⭐' },
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function progressColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

function ComponentRow({ name, comp }: { name: VCSComponentKey; comp: VCSComponentResult }) {
  const meta = COMPONENT_LABELS[name];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {meta.icon} {meta.label}
        </span>
        <span className={cn('text-xs font-mono font-bold', scoreColor(comp.score))}>
          {comp.score}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', progressColor(comp.score))}
          style={{ width: `${comp.score}%` }}
        />
      </div>
      {comp.issues.length > 0 && (
        <ul className="space-y-0.5 mt-1">
          {comp.issues.slice(0, 2).map((issue, i) => (
            <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
              <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-0.5 text-orange-400" />
              {issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function VisualCoherencePanel({ result, loading, diagnostics }: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border/40 p-4">
        <div className="text-xs text-muted-foreground animate-pulse">Computing visual coherence…</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-lg border border-border/40 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Eye className="w-3.5 h-3.5" />
          <span>Visual coherence evaluation unavailable — upstream visual truth inputs not yet resolved</span>
        </div>
      </div>
    );
  }

  const entries = Object.entries(result.components) as [VCSComponentKey, VCSComponentResult][];

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Visual Coherence Score</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-2xl font-bold font-mono', scoreColor(result.total_score))}>
            {result.total_score}
          </span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">
            {result.weighting_profile.replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>

      {/* Component Breakdown */}
      <div className="p-4 space-y-3">
        {entries.map(([name, comp]) => (
          <ComponentRow key={name} name={name} comp={comp} />
        ))}
      </div>

      {/* Key Failures */}
      {result.key_failures.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          <div className="text-[10px] font-medium text-red-400 uppercase tracking-wider">Key Failures</div>
          {result.key_failures.map((f, i) => (
            <div key={i} className="text-[10px] text-red-300 flex items-start gap-1">
              <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-0.5" />
              {f}
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recommendations</div>
          {result.recommendations.map((r, i) => (
            <div key={i} className="text-[10px] text-foreground flex items-start gap-1">
              <CheckCircle className="w-2.5 h-2.5 shrink-0 mt-0.5 text-green-400" />
              {r}
            </div>
          ))}
        </div>
      )}

      {/* Diagnostic Trace */}
      {diagnostics && (
        <div className="px-4 pb-3 space-y-0.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Grounding</div>
          <div className="text-[10px] text-muted-foreground">
            Temporal: {diagnostics.temporalEra} ({diagnostics.temporalSource})
            {!diagnostics.worldSystemFound && ' · ⚠ No world system doc'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Profiles: {diagnostics.charactersWithEffectiveProfiles}/{diagnostics.totalCharacters} characters grounded
            {diagnostics.charactersWithoutProfiles > 0 && ` · ${diagnostics.charactersWithoutProfiles} missing`}
          </div>
        </div>
      )}
    </div>
  );
}
