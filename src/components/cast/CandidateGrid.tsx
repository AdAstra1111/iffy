/**
 * CandidateGrid — Grid of actor candidates for the selected character.
 */
import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserPlus, Check, Sparkles, Library } from 'lucide-react'
import type { ActorCandidate } from '@/lib/adapters/AdapterTypes'

// ── Props ────────────────────────────────────────────────────────────────────

interface CandidateGridProps {
  candidates: ActorCandidate[]
  onShortlist: (actorId: string) => void
  onApprove: (actorId: string) => void
  onFindMatches?: () => void
  isLoading?: boolean
  /** Set of actor IDs already shortlisted */
  shortlistedActorIds?: Set<string>
  /** Actor ID that is approved (null if none) */
  approvedActorId?: string | null
  /** Whether the actor library has any actors */
  hasActorsInLibrary?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

const CandidateGrid: React.FC<CandidateGridProps> = ({
  candidates,
  onShortlist,
  onApprove,
  onFindMatches,
  isLoading = false,
  shortlistedActorIds = new Set(),
  approvedActorId = null,
  hasActorsInLibrary = true,
}) => {
  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Candidates
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
              <Skeleton className="aspect-[3/4] w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
                <div className="flex gap-1">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-8 flex-1 rounded-md" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Empty state — no actor library ─────────────────────────────────────
  if (!hasActorsInLibrary) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Library className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No Actors in Library</h3>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          Add actors to the library to find matches for this character.
        </p>
      </div>
    )
  }

  // ── Empty state — no candidates found ─────────────────────────────────
  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Sparkles className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No Candidates Found</h3>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          Generate matches first to see actor recommendations for this character.
        </p>
        {onFindMatches && (
          <Button onClick={onFindMatches} variant="default" size="sm">
            <Sparkles className="w-4 h-4 mr-2" />
            Find Matches
          </Button>
        )}
      </div>
    )
  }

  // ── Normal state ───────────────────────────────────────────────────────
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Candidates
        <span className="ml-1.5 font-normal text-xs">({candidates.length})</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {candidates.map((actor) => {
          const isShortlisted = shortlistedActorIds.has(actor.id)
          const isApproved = approvedActorId === actor.id

          return (
            <div
              key={actor.id}
              className={cn(
                'rounded-xl border bg-card overflow-hidden transition-all',
                isApproved
                  ? 'border-green-500/40 ring-1 ring-green-500/20'
                  : isShortlisted
                    ? 'border-amber-500/40 ring-1 ring-amber-500/20'
                    : 'border-border hover:border-border/80 hover:shadow-sm',
              )}
            >
              {/* Headshot / Placeholder */}
              <div className="aspect-[3/4] bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center overflow-hidden">
                {actor.headshotUrl ? (
                  <img
                    src={actor.headshotUrl}
                    alt={actor.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <UserPlus className="w-8 h-8" />
                    <span className="text-xs">No headshot</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                {/* Name + Score */}
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm truncate">{actor.name}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div
                      className={cn(
                        'h-2 w-12 rounded-full overflow-hidden bg-muted',
                      )}
                    >
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          actor.matchScore >= 70
                            ? 'bg-green-500'
                            : actor.matchScore >= 40
                              ? 'bg-amber-500'
                              : 'bg-muted-foreground/30',
                        )}
                        style={{ width: `${actor.matchScore}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                      {actor.matchScore}%
                    </span>
                  </div>
                </div>

                {/* Specialties */}
                <div className="flex flex-wrap gap-1">
                  {actor.specialties.slice(0, 3).map((spec, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-4"
                    >
                      {spec}
                    </Badge>
                  ))}
                  {actor.specialties.length > 3 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4"
                    >
                      +{actor.specialties.length - 3}
                    </Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  {isApproved ? (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md bg-green-500/10 text-green-400 text-xs font-medium">
                      <Check className="w-3.5 h-3.5" />
                      Approved
                    </div>
                  ) : isShortlisted ? (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md bg-amber-500/10 text-amber-400 text-xs font-medium">
                      <Check className="w-3.5 h-3.5" />
                      Shortlisted
                    </div>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs h-8"
                        onClick={() => onShortlist(actor.id)}
                      >
                        Shortlist
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1 text-xs h-8"
                        onClick={() => onApprove(actor.id)}
                      >
                        Approve
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CandidateGrid