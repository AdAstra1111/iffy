/**
 * QualityScore — Single-number quality indicator.
 *
 * - Large number with color (green >75, amber 50-75, red <50)
 * - Click to expand breakdown in expert mode
 * - Empty state: "--" when no score yet
 */
import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'

interface QualityScoreProps {
  score: number | null
  label?: string
  breakdown?: { label: string; score: number }[]
}

function getScoreColor(score: number): string {
  if (score >= 75) return 'text-green-500 dark:text-green-400'
  if (score >= 50) return 'text-amber-500 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
}

function getScoreBg(score: number): string {
  if (score >= 75) return 'bg-green-100/60 dark:bg-green-950/20'
  if (score >= 50) return 'bg-amber-100/60 dark:bg-amber-950/20'
  return 'bg-red-100/60 dark:bg-red-950/20'
}

const QualityScore: React.FC<QualityScoreProps> = ({
  score,
  label = 'Quality Score',
  breakdown,
}) => {
  const expertMode = useFeatureFlag('NEW_EXPERT_MODE')
  const [expanded, setExpanded] = useState(false)

  const isEmpty = score === null || score === undefined

  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </span>

      {/* Score display */}
      <button
        onClick={() => {
          if (expertMode && !isEmpty && breakdown) {
            setExpanded(!expanded)
          }
        }}
        disabled={!expertMode || isEmpty || !breakdown}
        className={cn(
          'flex items-center justify-center w-12 h-12 rounded-lg text-lg font-bold transition-colors',
          isEmpty
            ? 'bg-muted/30 text-muted-foreground/50'
            : [getScoreBg(score!), getScoreColor(score!)],
          expertMode && !isEmpty && 'cursor-pointer hover:opacity-80',
        )}
        title={expertMode && breakdown ? 'Click to expand breakdown' : label}
      >
        {isEmpty ? '--' : score}
      </button>

      {/* Expert breakdown */}
      {expanded && breakdown && breakdown.length > 0 && (
        <div className="mt-2 p-2 rounded-md bg-muted/40 text-xs space-y-1.5">
          {breakdown.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground truncate">{item.label}</span>
              <span className={cn('font-medium', getScoreColor(item.score))}>
                {item.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default QualityScore