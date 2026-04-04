/**
 * ActorCard — Compact card for the Actor Library grid.
 * Displays primary image, name, tags, status. No mutations.
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Users, Crown, ChevronRight, Shield, Zap } from 'lucide-react';
import type { LibraryActor } from '@/lib/aiCast/actorLibraryTypes';
import { resolveActorPrimaryImage, parseRosterNumber } from '@/lib/aiCast/actorLibraryTypes';

interface Props {
  actor: LibraryActor;
  onClick: () => void;
}

export function ActorCard({ actor, onClick }: Props) {
  const primaryImage = resolveActorPrimaryImage(actor.approvedVersion);
  const rosterNum = parseRosterNumber(actor.name);
  const created = new Date(actor.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm hover:bg-muted/20 hover:border-border/60 transition-all duration-200 overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-muted/10 relative overflow-hidden">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={actor.name}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Users className="h-8 w-8 text-muted-foreground/20" />
          </div>
        )}

        {/* Overlays */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {actor.roster_ready && (
            <span className="rounded-full text-[8px] px-1.5 py-0.5 font-semibold bg-primary/90 text-primary-foreground inline-flex items-center gap-0.5 shadow-sm">
              <Crown className="h-2 w-2" /> Roster
            </span>
          )}
        </div>

        {rosterNum !== null && (
          <div className="absolute bottom-2 left-2">
            <span className="rounded-md text-[10px] px-1.5 py-0.5 font-mono font-medium bg-background/80 backdrop-blur-sm text-foreground border border-border/30 shadow-sm">
              #{String(rosterNum).padStart(4, '0')}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-display font-semibold text-foreground truncate">{actor.name}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {actor.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{actor.description}</p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={actor.status === 'active' ? 'default' : 'secondary'}
            className="text-[10px] h-5 px-1.5"
          >
            {actor.status}
          </Badge>

          {actor.approved_version_id && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-0.5 text-emerald-400 border-emerald-500/30">
              <Shield className="h-2.5 w-2.5" /> Approved
            </Badge>
          )}

          {actor.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted/80 text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>

        <div className="text-[10px] text-muted-foreground/70">
          {created}
        </div>
      </div>
    </button>
  );
}
