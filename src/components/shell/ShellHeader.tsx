/**
 * ShellHeader — top bar of the PlatformShell.
 * Shows back arrow, project title/lane, confidence score, search, and user avatar.
 */

import { ArrowLeft } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const SHELL_UI = {
  meta:     'text-muted-foreground/70',
  inactive: 'text-muted-foreground/60',
  hoverText: 'hover:text-foreground',
  hoverBg:  'hover:bg-muted/40',
  border:   'border-border/50',
} as const

const SHELL_FOCUS =
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export function ShellHeader() {
  const navigate = useNavigate()
  const { id: projectId } = useParams<{ id: string }>()

  // Derive a placeholder title from the URL for now
  // Real data integration comes with workspace builds
  const projectTitle = projectId ? `Project ${projectId.slice(0, 8)}` : undefined

  return (
    <header className={cn(
      'sticky top-0 z-50 h-10',
      'border-b border-border/10',
      'bg-background/90 backdrop-blur-2xl',
      'flex items-center px-3',
    )}>
      {/* Left: back arrow + title */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => navigate(-1)}
              className={cn(
                'h-8 w-8 rounded-md flex items-center justify-center transition-colors shrink-0',
                SHELL_UI.inactive,
                SHELL_UI.hoverText,
                SHELL_UI.hoverBg,
                SHELL_FOCUS,
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            Back
          </TooltipContent>
        </Tooltip>

        {/* Project title */}
        {projectTitle ? (
          <div className="flex items-baseline gap-2 min-w-0">
            <span className={cn(
              'text-sm font-display font-medium text-foreground truncate max-w-[260px] leading-none',
            )}>
              {projectTitle}
            </span>
            {/* Lane badge placeholder */}
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border leading-none',
              'text-muted-foreground/50 border-border/30',
            )}>
              ▲ Lane
            </span>
          </div>
        ) : (
          <span className={cn(
            'text-sm font-display font-medium text-muted-foreground/40 leading-none',
          )}>
            No project selected
          </span>
        )}
      </div>

      {/* Right: score + search + avatar */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Confidence score placeholder */}
        <span className={cn(
          'text-[10px] font-mono leading-none px-2',
          SHELL_UI.meta,
        )}>
          --
        </span>

        {/* Search placeholder */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'h-8 w-8 rounded-md flex items-center justify-center transition-colors',
                SHELL_UI.inactive,
                SHELL_UI.hoverText,
                SHELL_UI.hoverBg,
                SHELL_FOCUS,
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            Search (coming soon)
          </TooltipContent>
        </Tooltip>

        {/* User avatar/settings placeholder */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center transition-colors',
                'bg-muted/30 border border-border/20',
                SHELL_UI.hoverBg,
                SHELL_FOCUS,
              )}
            >
              <span className="text-[10px] font-medium text-muted-foreground/60">
                U
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            Settings (coming soon)
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}