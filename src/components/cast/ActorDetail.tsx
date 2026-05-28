/**
 * ActorDetail — Detail panel for selected actor with full profile, match breakdown,
 * and portfolio thumbnails.
 */
import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, ImageIcon } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActorProfile {
  id: string
  name: string
  description: string
  tags: string[]
  headshotUrl?: string
  portfolioImages?: string[]
  matchBreakdown?: {
    genreFit: number
    roleTypeFit: number
    descriptionStrength: number
  }
  rosterReady?: boolean
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ActorDetailProps {
  actorId: string | null
  getActor?: (actorId: string) => ActorProfile | null
  isLoading?: boolean
  error?: string | null
}

// ── Component ────────────────────────────────────────────────────────────────

const ActorDetail: React.FC<ActorDetailProps> = ({
  actorId,
  getActor,
  isLoading = false,
  error = null,
}) => {
  // ── No actor selected ──────────────────────────────────────────────────
  if (!actorId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ImageIcon className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Select a candidate to view details
        </p>
      </div>
    )
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Headshot skeleton */}
        <Skeleton className="aspect-[3/4] w-full rounded-xl" />

        {/* Name skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Match breakdown skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>

        {/* Portfolio skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-16 w-16 rounded-md" />
            <Skeleton className="h-16 w-16 rounded-md" />
            <Skeleton className="h-16 w-16 rounded-md" />
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
          <AlertCircle className="w-5 h-5 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground">
          Could not load actor details
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">{error}</p>
      </div>
    )
  }

  // ── Resolve actor data ─────────────────────────────────────────────────
  const actor = actorId && getActor ? getActor(actorId) : null

  if (!actor) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Could not load actor details
        </p>
      </div>
    )
  }

  const breakdown = actor.matchBreakdown
  const hasBreakdown = breakdown && (breakdown.genreFit || breakdown.roleTypeFit || breakdown.descriptionStrength)

  // ── Normal state ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Headshot */}
      <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
        {actor.headshotUrl ? (
          <img
            src={actor.headshotUrl}
            alt={actor.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
        )}
      </div>

      {/* Name + tags */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-semibold">{actor.name}</h3>
          {actor.rosterReady && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-400 border-green-500/30">
              Ready
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {actor.description || 'No description available.'}
        </p>
      </div>

      {/* Tags */}
      {actor.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {actor.tags.map((tag, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Match breakdown */}
      {hasBreakdown && (
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Match Breakdown
          </h4>

          {breakdown!.genreFit > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Genre Fit</span>
                <span className="font-medium">{breakdown!.genreFit}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    breakdown!.genreFit >= 70 ? 'bg-green-500' : breakdown!.genreFit >= 40 ? 'bg-amber-500' : 'bg-muted-foreground/30',
                  )}
                  style={{ width: `${breakdown!.genreFit}%` }}
                />
              </div>
            </div>
          )}

          {breakdown!.roleTypeFit > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Role Type Fit</span>
                <span className="font-medium">{breakdown!.roleTypeFit}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    breakdown!.roleTypeFit >= 70 ? 'bg-green-500' : breakdown!.roleTypeFit >= 40 ? 'bg-amber-500' : 'bg-muted-foreground/30',
                  )}
                  style={{ width: `${breakdown!.roleTypeFit}%` }}
                />
              </div>
            </div>
          )}

          {breakdown!.descriptionStrength > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Description Strength</span>
                <span className="font-medium">{breakdown!.descriptionStrength}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    breakdown!.descriptionStrength >= 70 ? 'bg-green-500' : breakdown!.descriptionStrength >= 40 ? 'bg-amber-500' : 'bg-muted-foreground/30',
                  )}
                  style={{ width: `${breakdown!.descriptionStrength}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Portfolio thumbnail strip */}
      {actor.portfolioImages && actor.portfolioImages.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Portfolio
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {actor.portfolioImages.map((url, i) => (
              <div
                key={i}
                className="flex-shrink-0 h-16 w-16 rounded-md overflow-hidden bg-muted"
              >
                <img
                  src={url}
                  alt={`Portfolio ${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ActorDetail