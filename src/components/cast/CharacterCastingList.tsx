/**
 * CharacterCastingList — Left rail showing all characters with casting status.
 */
import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import type { CastingStatus } from '@/lib/adapters/AdapterTypes'

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CastingStatus['status'], { label: string; className: string }> = {
  uncast:      { label: 'Uncast',      className: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
  candidates:  { label: 'Candidates',  className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  shortlisted: { label: 'Shortlisted', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  approved:    { label: 'Approved',    className: 'bg-green-500/15 text-green-400 border-green-500/30' },
}

// ── Props ────────────────────────────────────────────────────────────────────

interface CharacterCastingListProps {
  statuses: CastingStatus[]
  onSelect: (characterId: string) => void
  selectedId: string | null
  isLoading?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

const CharacterCastingList: React.FC<CharacterCastingListProps> = ({
  statuses,
  onSelect,
  selectedId,
  isLoading = false,
}) => {
  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-2 p-0">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
          Characters
        </h3>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (statuses.length === 0) {
    return (
      <div className="p-0">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
          Characters
        </h3>
        <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground max-w-[200px]">
            No characters found. Create characters in Develop first.
          </p>
        </div>
      </div>
    )
  }

  // ── Normal state ───────────────────────────────────────────────────────
  return (
    <div className="p-0">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
        Characters
        <span className="ml-1.5 font-normal text-xs">({statuses.length})</span>
      </h3>
      <div className="space-y-1">
        {statuses.map((s) => {
          const isSelected = s.characterId === selectedId
          const statusCfg = STATUS_CONFIG[s.status]

          return (
            <button
              key={s.characterId}
              onClick={() => onSelect(s.characterId)}
              className={cn(
                'w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected
                  ? 'bg-accent border border-border/60'
                  : 'border border-transparent',
              )}
            >
              {/* Actor thumbnail or placeholder */}
              <div className={cn(
                'w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden',
                s.boundActorId
                  ? 'bg-green-500/10 ring-1 ring-green-500/30'
                  : 'bg-muted',
              )}>
                {s.boundActorId ? (
                  <div className="w-full h-full bg-gradient-to-br from-green-400/20 to-emerald-600/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                ) : (
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                )}
              </div>

              {/* Character name + status */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {s.characterName}
                </div>
                <Badge
                  variant="outline"
                  className={cn('text-[10px] px-1.5 py-0 h-4 mt-0.5', statusCfg.className)}
                >
                  {statusCfg.label}
                </Badge>
              </div>

              {/* Candidate count indicator */}
              {s.candidateCount > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {s.candidateCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CharacterCastingList