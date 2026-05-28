/**
 * ProgressionBar — thin ambient bottom bar showing phase indicators
 * and a live "Next:" action label based on the current active phase.
 */

import { cn } from '@/lib/utils'
import { useWorkspaceNav } from '@/hooks/useWorkspaceNav'

export function ProgressionBar() {
  const { active, completed, allPhases } = useWorkspaceNav()

  // Determine the "next" phase after the active one
  const activeIdx = active ? allPhases.indexOf(active) : -1
  const nextPhase = activeIdx >= 0 && activeIdx < allPhases.length - 1
    ? allPhases[activeIdx + 1]
    : null

  const nextLabel = nextPhase
    ? `${nextPhase.charAt(0).toUpperCase() + nextPhase.slice(1)}`
    : null

  return (
    <div className={cn(
      'h-8 border-t border-border/10',
      'bg-card/5',
      'flex items-center px-4 gap-3 shrink-0',
      'text-muted-foreground/40',
    )}>
      {/* Phase indicator dots */}
      <div className="flex items-center gap-1.5">
        {allPhases.map((phase) => {
          const isActivePhase = phase === active
          const isCompleted = (completed as string[]).includes(phase)

          return (
            <div
              key={phase}
              className={cn(
                'h-[5px] w-[5px] rounded-full transition-all duration-300',
                // Active phase: highlighted with subtle glow
                isActivePhase && cn(
                  'bg-purple-400/60',
                  'shadow-[0_0_4px_rgba(168,85,247,0.5)]',
                ),
                // Completed phase: filled
                isCompleted && !isActivePhase && 'bg-muted-foreground/40',
                // Future phase: dim
                !isActivePhase && !isCompleted && 'bg-muted-foreground/15',
              )}
            />
          )
        })}
      </div>

      {/* Separator */}
      {nextLabel && (
        <>
          <span className="text-muted-foreground/15">·</span>

          {/* Next action label */}
          <span className="text-[11px] tracking-tight text-muted-foreground/30">
            Next: <span className="text-muted-foreground/40">{nextLabel}</span>
          </span>
        </>
      )}
    </div>
  )
}