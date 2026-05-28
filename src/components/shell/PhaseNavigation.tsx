/**
 * PhaseNavigation — horizontal phase bar with 7 phases + Intelligence trigger.
 *
 * Detects active phase from URL, highlights current phase, enables navigation
 * to available workspaces, and shows locked/coming-soon states for unavailable
 * phases. Respects feature flags for workspace gating.
 */

import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Lock, Check } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useWorkspaceNav, getLegacyFallbackUrl, useProjectIdFromPath } from '@/hooks/useWorkspaceNav'

const SHELL_FOCUS =
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const SHELL_UI = {
  inactive:  'text-muted-foreground/50',
  hoverText: 'hover:text-foreground/70',
  hoverBg:   'hover:bg-muted/20',
  disabled:  'text-muted-foreground/30',
} as const

interface Phase {
  key: string
  label: string
  icon: string
}

const PHASES: Phase[] = [
  { key: 'concept',   label: 'Concept',   icon: '💡' },
  { key: 'develop',   label: 'Develop',   icon: '✍️' },
  { key: 'visualize', label: 'Visualize', icon: '🎨' },
  { key: 'cast',      label: 'Cast',      icon: '🎭' },
  { key: 'produce',   label: 'Produce',   icon: '🎬' },
  { key: 'package',   label: 'Package',   icon: '📦' },
  { key: 'deliver',   label: 'Deliver',   icon: '🚀' },
]

interface PhaseNavigationProps {
  onIntelligenceToggle: () => void
}

export function PhaseNavigation({ onIntelligenceToggle }: PhaseNavigationProps) {
  const navigate = useNavigate()
  const { active, completed, isAvailable } = useWorkspaceNav()
  const projectId = useProjectIdFromPath()

  const handlePhaseClick = (phaseKey: string) => {
    if (!projectId) return

    if (isAvailable(phaseKey)) {
      // Navigate to the workspace route
      navigate(`/projects/${projectId}/${phaseKey}`)
    } else {
      // Navigate to the legacy fallback URL
      navigate(getLegacyFallbackUrl(phaseKey, projectId))
    }
  }

  // Determine if this is a workspace route at all
  const onWorkspaceRoute = active !== null

  return (
    <nav className={cn(
      'h-10 border-b border-border/10',
      'bg-background/80',
      'flex items-center px-3 gap-0.5 shrink-0',
    )}>
      {/* Phase items */}
      <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
        {PHASES.map((phase) => {
          const isActive = active === phase.key
          const isCompleted = (completed as string[]).includes(phase.key)
          const isAvailableForPhase = isAvailable(phase.key)
          const isFuturePhase = !isActive && !isCompleted
          const isClickable = !!projectId
          const showLocked = !isAvailableForPhase && !isActive && !isCompleted

          // If the workspace flag is false, phase still navigates (to legacy URL)
          // Only show as genuinely locked if not even the legacy route exists
          // Since all phases can navigate (either to workspace or legacy), we keep them all clickable

          return (
            <Tooltip key={phase.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handlePhaseClick(phase.key)}
                  className={cn(
                    'relative flex items-center gap-1.5',
                    'px-2.5 py-1.5 rounded-md',
                    'text-[11px] font-medium tracking-tight',
                    'transition-all duration-150',
                    isClickable ? 'cursor-pointer' : 'cursor-default',
                    // Active phase: highlighted with glow
                    isActive && cn(
                      'text-foreground bg-muted/30',
                      'shadow-[0_0_8px_rgba(168,85,247,0.15)]',
                      'after:absolute after:bottom-0 after:left-1/4 after:w-1/2 after:h-[2px]',
                      'after:bg-purple-400/60 after:rounded-full after:shadow-[0_0_4px_rgba(168,85,247,0.4)]',
                    ),
                    // Completed phase
                    isCompleted && !isActive && cn(
                      'text-foreground/80',
                      SHELL_UI.hoverText,
                      SHELL_UI.hoverBg,
                    ),
                    // Future phase (not active, not completed)
                    isFuturePhase && !isActive && cn(
                      SHELL_UI.disabled,
                      SHELL_UI.hoverText,
                      SHELL_UI.hoverBg,
                    ),
                    // Not on a workspace route — dim everything
                    !onWorkspaceRoute && cn(SHELL_UI.disabled),
                    SHELL_FOCUS,
                  )}
                >
                  <span className="text-xs">{phase.icon}</span>
                  <span>{phase.label}</span>
                  {isCompleted && !isActive && (
                    <Check className="h-2.5 w-2.5 text-green-400/70 ml-0.5" />
                  )}
                  {showLocked && (
                    <Lock className="h-2.5 w-2.5 text-muted-foreground/20 ml-0.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                {isActive && 'Current phase'}
                {isCompleted && !isActive && 'Completed'}
                {!isActive && !isCompleted && !isAvailableForPhase && 'Coming soon'}
                {!isActive && !isCompleted && isAvailableForPhase && !onWorkspaceRoute && phase.label}
                {isFuturePhase && !isActive && isAvailableForPhase && onWorkspaceRoute && 'Complete current phase first'}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Intelligence trigger */}
      <div className="shrink-0 pl-2 border-l border-border/10 ml-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onIntelligenceToggle}
              className={cn(
                'flex items-center gap-1.5',
                'px-2.5 py-1.5 rounded-md',
                'text-[11px] font-medium tracking-tight',
                'transition-all duration-150',
                SHELL_UI.inactive,
                SHELL_UI.hoverText,
                SHELL_UI.hoverBg,
                SHELL_FOCUS,
              )}
            >
              <span className="text-xs">✦</span>
              <span>Intel</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            Intelligence
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  )
}