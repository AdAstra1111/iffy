/**
 * PhaseNavigation — horizontal phase bar with 7 phases + Intelligence trigger.
 *
 * All phases are locked/disabled for now (workspaces come in later tasks).
 * Clicking any locked phase shows a "Coming soon" tooltip.
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Lock } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
  // No active phase initially — all locked
  const [activePhase] = useState<string | null>(null)

  return (
    <nav className={cn(
      'h-10 border-b border-border/10',
      'bg-background/80',
      'flex items-center px-3 gap-0.5 shrink-0',
    )}>
      {/* Phase items */}
      <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
        {PHASES.map((phase) => {
          const isActive = activePhase === phase.key
          const isLocked = true // All phases locked for now

          return (
            <Tooltip key={phase.key}>
              <TooltipTrigger asChild>
                <button
                  disabled
                  className={cn(
                    'relative flex items-center gap-1.5',
                    'px-2.5 py-1.5 rounded-md',
                    'text-[11px] font-medium tracking-tight',
                    'transition-all duration-150',
                    'cursor-not-allowed',
                    isActive
                      ? 'text-foreground bg-muted/30'
                      : cn(SHELL_UI.disabled, SHELL_UI.hoverText, SHELL_UI.hoverBg),
                    SHELL_FOCUS,
                  )}
                >
                  <span className="text-xs">{phase.icon}</span>
                  <span>{phase.label}</span>
                  {isLocked && (
                    <Lock className="h-2.5 w-2.5 text-muted-foreground/20 ml-0.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                Coming soon
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