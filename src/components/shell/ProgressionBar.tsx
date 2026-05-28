/**
 * ProgressionBar — thin ambient bottom bar showing phase indicators
 * and a placeholder next-action label.
 */

import { cn } from '@/lib/utils'

const PHASE_COUNT = 7

export function ProgressionBar() {
  return (
    <div className={cn(
      'h-8 border-t border-border/10',
      'bg-card/5',
      'flex items-center px-4 gap-3 shrink-0',
      'text-muted-foreground/40',
    )}>
      {/* Phase indicator dots */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: PHASE_COUNT }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-[5px] w-[5px] rounded-full transition-all duration-300',
              'bg-muted-foreground/15',
            )}
          />
        ))}
      </div>

      {/* Separator */}
      <span className="text-muted-foreground/15">·</span>

      {/* Next action placeholder */}
      <span className="text-[11px] tracking-tight text-muted-foreground/30">
        Next: <span className="text-muted-foreground/20">Next action will appear here</span>
      </span>
    </div>
  )
}