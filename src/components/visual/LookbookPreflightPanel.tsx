/**
 * LookbookPreflightPanel — Preflight readiness display for lookbook execution.
 *
 * Shows per-requirement pass/fail status with exact missing upstream dependencies.
 * No execute button — observation only until lookbook executor is enabled.
 */
import { useLookbookPreflight } from '@/hooks/useLookbookPreflight';
import {
  LOOKBOOK_PREFLIGHT_BLOCKER_LABELS,
  LOOKBOOK_PREFLIGHT_BLOCKER_DETAILS,
  type LookbookPreflightBlockerCode,
} from '@/lib/visual/visualGovernanceTypes';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Shield, AlertTriangle, FileText, Users, Palette, Frame, Eye, MapPin, Key, RefreshCw, Lock } from 'lucide-react';

interface Props {
  projectId: string;
  activeStage: string;
}

/** Map blocker code to icon for visual clarity. */
function BlockerIcon({ code }: { code: LookbookPreflightBlockerCode }) {
  const iconMap: Record<LookbookPreflightBlockerCode, typeof Check> = {
    MISSING_CANON_HASH: Key,
    MISSING_VISUAL_CANON: Eye,
    MISSING_CAST: Users,
    MISSING_PRODUCTION_DESIGN: Palette,
    MISSING_HERO_FRAMES: Frame,
    MISSING_VISUAL_LANGUAGE: FileText,
    MISSING_SCENE_INDEX: MapPin,
    HIGH_SEVERITY_STALE_RISK: RefreshCw,
    LOCKED_REVIEW_REQUIRED: Lock,
  };
  const Icon = iconMap[code] || Shield;
  return <Icon className="h-3 w-3" />;
}

export function LookbookPreflightPanel({ projectId, activeStage }: Props) {
  const { data, isLoading, isError, error } = useLookbookPreflight(projectId);

  // Only show when lookbook is active
  if (activeStage !== 'lookbook') return null;

  return (
    <div className="border border-amber-500/20 rounded-lg bg-amber-500/[0.02] p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-semibold text-amber-600">
            Lookbook Preflight
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

      {isLoading && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Evaluating lookbook readiness...
        </div>
      )}

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
                    <BlockerIcon code={req.code as LookbookPreflightBlockerCode} />
                    <span className="text-[10px] font-medium text-foreground/80">
                      {LOOKBOOK_PREFLIGHT_BLOCKER_LABELS[req.code as LookbookPreflightBlockerCode]}
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

          {/* Upstream stage statuses */}
          {data.upstream_stage_statuses && Object.keys(data.upstream_stage_statuses).length > 0 && (
            <div className="flex flex-wrap gap-2 text-[9px] text-muted-foreground/70 border-t border-border/20 pt-2">
              {Object.entries(data.upstream_stage_statuses).map(([stage, status]) => (
                <span key={stage} className="inline-flex items-center gap-1">
                  {stage}: <Badge variant="outline" className="text-[7px] h-3 px-1">{status}</Badge>
                </span>
              ))}
              <span>Canon: {data.canon_hash ? data.canon_hash.slice(0, 8) + '…' : '—'}</span>
              <span>Scenes: {data.scene_count}</span>
              <span>Hero Frames: {data.hero_frame_count}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}