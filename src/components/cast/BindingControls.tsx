/**
 * BindingControls — Action controls for casting decisions (Shortlist, Approve, Remove).
 */
import React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { UserPlus, Check, X, Lock, AlertTriangle } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export type BindingState = 'uncast' | 'shortlisted' | 'approved'

// ── Props ────────────────────────────────────────────────────────────────────

interface BindingControlsProps {
  characterName: string
  actorName: string | null
  bindingState: BindingState
  onShortlist: () => void
  onApprove: () => void
  onRemove: () => void
  isLoading?: boolean
  isActioning?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<BindingState, { label: string; className: string; icon: React.ReactNode }> = {
  uncast: {
    label: 'Uncast',
    className: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
    icon: <UserPlus className="w-3.5 h-3.5" />,
  },
  shortlisted: {
    label: 'Shortlisted',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    icon: <Check className="w-3.5 h-3.5" />,
  },
  approved: {
    label: 'Approved',
    className: 'bg-green-500/10 text-green-400 border-green-500/30',
    icon: <Lock className="w-3.5 h-3.5" />,
  },
}

const BindingControls: React.FC<BindingControlsProps> = ({
  characterName,
  actorName,
  bindingState,
  onShortlist,
  onApprove,
  onRemove,
  isLoading = false,
  isActioning = false,
}) => {
  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3 p-4 rounded-xl border border-border bg-card">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
    )
  }

  const stateCfg = STATE_CONFIG[bindingState]

  return (
    <div className="space-y-3 p-4 rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Casting Status
          </h4>
          <p className="text-sm font-medium truncate mt-0.5">
            {characterName}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn('text-xs gap-1 px-2 py-0.5', stateCfg.className)}
        >
          {stateCfg.icon}
          {stateCfg.label}
        </Badge>
      </div>

      {/* Actor name (if bound/shortlisted) */}
      {actorName && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Actor:</span>
          <span className="font-medium">{actorName}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {bindingState === 'uncast' && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={onShortlist}
              disabled={isActioning}
              className="w-full"
            >
              {isActioning ? (
                <span className="animate-pulse">Working...</span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Shortlist
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={onApprove}
              disabled={isActioning}
              className="w-full"
            >
              {isActioning ? (
                <span className="animate-pulse">Working...</span>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Approve Casting
                </>
              )}
            </Button>
          </>
        )}

        {bindingState === 'shortlisted' && (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={onApprove}
              disabled={isActioning}
              className="w-full"
            >
              {isActioning ? (
                <span className="animate-pulse">Working...</span>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Approve Casting
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onRemove}
              disabled={isActioning}
              className="w-full text-destructive hover:text-destructive"
            >
              {isActioning ? (
                <span className="animate-pulse">Working...</span>
              ) : (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Remove from Shortlist
                </>
              )}
            </Button>
          </>
        )}

        {bindingState === 'approved' && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/5 border border-green-500/20">
            <Lock className="w-4 h-4 text-green-400 flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              Casting is locked. Uncast character to change.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BindingControls