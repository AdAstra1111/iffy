/**
 * HeroFramePreflightPanel — Preflight readiness display for hero-frame execution.
 *
 * Shows per-requirement pass/fail status with exact missing dependencies.
 * No execute button — observation only until hero-frame executor is enabled.
 */
import { useHeroFramePreflight } from '@/hooks/useHeroFramePreflight';
import {
  PREFLIGHT_BLOCKER_LABELS,
  PREFLIGHT_BLOCKER_DETAILS,
  type PreflightBlockerCode,
} from '@/lib/visual/visualGovernanceTypes';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Shield, AlertTriangle, FileText, Users, MapPin, Palette, Key, RefreshCw, Lock } from 'lucide-react';
import { VisualSkeleton } from '@/components/visual/VisualSkeleton';
import { VisualPanelErrorBoundary } from '@/components/visual/VisualPanelErrorBoundary';

interface Props {
  projectId: string;
  activeStage: string;
}

/** Map blocker code to icon for visual clarity. */
function BlockerIcon({ code }: { code: PreflightBlockerCode }) {
  const iconMap: Record<PreflightBlockerCode, typeof Check> = {
    MISSING_SCENE_INDEX: FileText,
    MISSING_CAST_BINDINGS: Users,
    MISSING_LOCATION_BINDINGS: MapPin,
    MISSING_VISUAL_STYLE: Palette,
    MISSING_CANON_HASH: Key,
    STALE_UPSTREAM_STAGE: RefreshCw,
    LOCKED_REVIEW_REQUIRED: Lock,
  };
  const Icon = iconMap[code] || Shield;
  return <Icon className="h-3 w-3" />;
}

export function HeroFramePreflightPanel({ projectId, activeStage }: Props) {
  const { data, isLoading, isError, error } = useHeroFramePreflight(projectId);

  // Only show when hero_frames is active
  if (activeStage !== 'hero_frames') return null;

  return (
    <VisualPanelErrorBoundary panelLabel="HeroFramePreflightPanel">
      <div className="border border-amber-500/20 rounded-lg bg-amber-500/[0.02] p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-semibold text-amber-600">
            Hero Frame Preflight
          </span>
        </div>
        {data && (
          <Badge
            variant={data.all_requirements_pass ? 'outline' : 'secondary'}
            className={
              data.all_requirements_pass
                ? 'text-[9px] h-4 border-green-500/30 text-green-600 bg-green-500/10'
                : 'text-[9px] h-4 border-red-500/30 text-red-600 bg-red-500/10'
            }
          >
            {data.all_requirements_pass ? 'Ready' : 'Blocked'}
          </Badge>
        )}
      </div>

      {isLoading && <VisualSkeleton variant="panel" lines={2} />}

      {isError && (
        <div className="flex items-center gap-2 text-[10px] text-red-600 py-1">
          <AlertTriangle className="h-3 w-3" />
          Preflight error: {error?.message || 'Unknown error'}
        </div>
      )}

      {data && (
        <>
          {/* Requirements list */}
          <div className="space-y-1.5">
            {data.requirements.map((req) => (
              <div
                key={req.code}
                className={`flex items-start gap-2 rounded px-2 py-1 ${
                  req.passed
                    ? 'bg-green-500/[0.03]'
                    : 'bg-red-500/[0.03] border border-red-500/10'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {req.passed ? (
                    <Check className="h-3 w-3 text-green-600" />
                  ) : (
                    <X className="h-3 w-3 text-red-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <BlockerIcon code={req.code as PreflightBlockerCode} />
                    <span className="text-[10px] font-medium text-foreground/80">
                      {PREFLIGHT_BLOCKER_LABELS[req.code as PreflightBlockerCode]}
                    </span>
                    {!req.passed && (
                      <Badge
                        variant="outline"
                        className="text-[8px] h-3.5 px-1 border-red-500/20 text-red-500"
                      >
                        missing
                      </Badge>
                    )}
                    {req.passed && (
                      <Badge
                        variant="outline"
                        className="text-[8px] h-3.5 px-1 border-green-500/20 text-green-600"
                      >
                        ok
                      </Badge>
                    )}
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    {req.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Summary stats */}
          <div className="flex flex-wrap gap-2 text-[9px] text-muted-foreground/70 border-t border-border/20 pt-2">
            <span>Canon: {data.canon_hash ? data.canon_hash.slice(0, 8) + '…' : '—'}</span>
            <span>Scenes: {data.scene_count}</span>
            <span>Characters: {data.character_count}</span>
            <span>Locations: {data.location_count}</span>
            <span>Bound: {data.cast_bound_count}c / {data.location_bound_count}l</span>
          </div>
        </>
      )}
    </div>
    </VisualPanelErrorBoundary>
  );
}