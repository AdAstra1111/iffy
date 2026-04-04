/**
 * ActorDetailPanel — Drawer/modal for inspecting a single actor's identity, assets, and provenance.
 * Read-only. Uses approved_version_id strictly.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  Users, Crown, Shield, Image, Calendar, Hash, Sparkles, FileText,
  Zap, Lock, X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { LibraryActor, LibraryActorAsset, ConvergenceProvenance } from '@/lib/aiCast/actorLibraryTypes';
import { resolveActorPrimaryImage, extractConvergenceProvenance, parseRosterNumber } from '@/lib/aiCast/actorLibraryTypes';

interface Props {
  actor: LibraryActor;
  open: boolean;
  onClose: () => void;
}

function bandColor(band: string | null): string {
  switch (band) {
    case 'elite': return 'text-emerald-400';
    case 'stable': return 'text-primary';
    case 'promising': return 'text-amber-400';
    default: return 'text-muted-foreground';
  }
}

function ModeIcon({ mode }: { mode: string }) {
  if (mode === 'reference_locked') return <Lock className="h-3 w-3 text-primary" />;
  return <Zap className="h-3 w-3 text-violet-400" />;
}

export function ActorDetailPanel({ actor, open, onClose }: Props) {
  const primaryImage = resolveActorPrimaryImage(actor.approvedVersion);
  const provenance = extractConvergenceProvenance(actor.approvedVersion);
  const version = actor.approvedVersion;
  const assets = version?.ai_actor_assets || [];
  const rosterNum = parseRosterNumber(actor.name);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        {/* Header Image */}
        <div className="relative aspect-[4/3] bg-muted/10 overflow-hidden">
          {primaryImage ? (
            <img src={primaryImage} alt={actor.name} className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Users className="h-12 w-12 text-muted-foreground/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 space-y-1">
            <h2 className="text-lg font-display font-bold text-foreground drop-shadow-sm">{actor.name}</h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant={actor.status === 'active' ? 'default' : 'secondary'} className="text-[10px] h-5">
                {actor.status}
              </Badge>
              {actor.roster_ready && (
                <Badge className="text-[10px] h-5 gap-0.5 bg-primary/20 text-primary border-primary/30">
                  <Crown className="h-2.5 w-2.5" /> Roster Ready
                </Badge>
              )}
              {rosterNum !== null && (
                <Badge variant="outline" className="text-[10px] h-5 font-mono">
                  #{String(rosterNum).padStart(4, '0')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Tags */}
          {actor.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {actor.tags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {actor.description && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Description
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{actor.description}</p>
            </div>
          )}

          {/* Assets Grid */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Image className="h-3.5 w-3.5 text-muted-foreground" />
              Assets
              {version ? (
                <span className="text-[10px] text-muted-foreground font-normal">
                  · v{version.version_number}
                </span>
              ) : null}
            </h3>

            {assets.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 italic">No assets in approved version</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {assets.map(asset => (
                  <AssetTile key={asset.id} asset={asset} />
                ))}
              </div>
            )}
          </div>

          {/* Version Info */}
          {version && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" /> Version
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <ProvenanceRow label="Version" value={`v${version.version_number}`} />
                <ProvenanceRow label="Created" value={new Date(version.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
              </div>
            </div>
          )}

          {/* Convergence Provenance */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> Convergence Provenance
            </h3>

            {provenance ? (
              <ProvenanceBlock provenance={provenance} />
            ) : (
              <p className="text-[11px] text-muted-foreground/60 italic">No provenance available</p>
            )}
          </div>

          {/* Use in Project CTA (Stub) */}
          <div className="pt-2">
            <Button
              className="w-full gap-2"
              onClick={() => {
                toast.info('Casting integration coming soon — actor will be available for project assignment.');
              }}
            >
              <Sparkles className="h-4 w-4" />
              Use in Project
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function AssetTile({ asset }: { asset: LibraryActorAsset }) {
  const label = asset.asset_type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="rounded-lg border border-border/30 overflow-hidden bg-muted/10 group">
      {asset.public_url ? (
        <div className="aspect-square relative">
          <img src={asset.public_url} alt={label} className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="aspect-square flex items-center justify-center">
          <Image className="h-5 w-5 text-muted-foreground/30" />
        </div>
      )}
      <div className="px-1.5 py-1 text-center">
        <span className="text-[9px] text-muted-foreground leading-tight line-clamp-1">{label}</span>
      </div>
    </div>
  );
}

function ProvenanceBlock({ provenance }: { provenance: ConvergenceProvenance }) {
  const modeLabel = provenance.source_mode === 'reference_locked' ? 'Reference-Locked' : 'Exploratory';
  const promotedDate = provenance.promoted_at
    ? new Date(provenance.promoted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="rounded-lg border border-border/30 bg-muted/10 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <ModeIcon mode={provenance.source_mode} />
        <span className="font-medium text-foreground">{modeLabel}</span>
        {provenance.source_score !== null && (
          <span className={cn('font-display font-bold text-sm tabular-nums', bandColor(provenance.source_score_band))}>
            {provenance.source_score.toFixed(0)}
          </span>
        )}
        {provenance.source_score_band && (
          <Badge variant="outline" className={cn('text-[9px] h-4 px-1', bandColor(provenance.source_score_band))}>
            {provenance.source_score_band}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        {provenance.source_confidence && (
          <ProvenanceRow label="Confidence" value={provenance.source_confidence} />
        )}
        {promotedDate && (
          <ProvenanceRow label="Promoted" value={promotedDate} />
        )}
        <ProvenanceRow label="Run" value={provenance.source_run_id.slice(0, 8)} mono />
        <ProvenanceRow label="Candidate" value={provenance.source_candidate_id.slice(0, 8)} mono />
        <ProvenanceRow label="Round" value={provenance.source_round_id.slice(0, 8)} mono />
      </div>
    </div>
  );
}

function ProvenanceRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground/70">{label}:</span>
      <span className={cn('text-foreground', mono && 'font-mono text-[10px]')}>{value}</span>
    </div>
  );
}
