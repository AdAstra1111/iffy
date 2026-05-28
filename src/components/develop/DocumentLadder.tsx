/**
 * DocumentLadder — Horizontal stepper showing document progression stages.
 *
 * - Completed docs: green checkmark
 * - Current doc: highlighted with glow
 * - Future docs: dimmed with lock icon
 * - Click on completed/current to view
 */
import React from 'react'
import { cn } from '@/lib/utils'
import { Check, Lock, ChevronRight } from 'lucide-react'
import type { LadderDocument } from '@/lib/adapters/AdapterTypes'

interface DocumentLadderProps {
  documents: LadderDocument[]
  currentDoc: string | null
  onSelect: (stage: string) => void
}

const STAGE_ICONS: Record<string, string> = {
  idea: '💡',
  concept_brief: '📋',
  market_sheet: '📊',
  vertical_market_sheet: '📊',
  treatment: '📝',
  story_outline: '📐',
  character_bible: '👤',
  beat_sheet: '🥁',
  episode_beats: '🎬',
  feature_script: '🎭',
  episode_script: '📺',
  season_script: '📺',
  season_master_script: '📀',
  production_draft: '🎬',
  documentary_outline: '🎥',
}

const DocumentLadder: React.FC<DocumentLadderProps> = ({
  documents,
  currentDoc,
  onSelect,
}) => {
  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
        No document stages configured for this project format.
      </div>
    )
  }

  return (
    <div className="flex items-center overflow-x-auto py-3 px-2 gap-0">
      {documents.map((doc, idx) => {
        const isCompleted = doc.status === 'approved'
        const isCurrent = doc.stage === currentDoc
        const isFuture = !isCompleted && !isCurrent && doc.status === 'not_started'
        const clickable = isCompleted || isCurrent

        return (
          <React.Fragment key={doc.stage}>
            {/* Stage node */}
            <button
              onClick={() => clickable && onSelect(doc.stage)}
              disabled={!clickable}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[80px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                isCompleted && 'cursor-pointer hover:bg-green-50 dark:hover:bg-green-950/20',
                isCurrent && [
                  'cursor-pointer bg-primary/10 dark:bg-primary/20',
                  'shadow-[0_0_12px_rgba(59,130,246,0.3)] dark:shadow-[0_0_12px_rgba(96,165,250,0.25)]',
                  'ring-1 ring-primary/30',
                ],
                isFuture && 'cursor-not-allowed opacity-40',
                !isCompleted && !isCurrent && !isFuture && 'opacity-70',
              )}
            >
              {/* Icon area */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm',
                  isCompleted && 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
                  isCurrent && 'bg-primary/20 text-primary dark:text-primary-foreground',
                  isFuture && 'bg-muted text-muted-foreground',
                  !isCompleted && !isCurrent && !isFuture && 'bg-muted/60 text-muted-foreground',
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : isFuture ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <span>{STAGE_ICONS[doc.stage] || '📄'}</span>
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-[10px] leading-tight text-center font-medium whitespace-nowrap max-w-[72px] truncate',
                  isCurrent && 'text-primary',
                  isCompleted && 'text-green-600 dark:text-green-400',
                  isFuture && 'text-muted-foreground',
                )}
              >
                {doc.title}
              </span>
            </button>

            {/* Connector between stages */}
            {idx < documents.length - 1 && (
              <div className="flex-shrink-0 text-muted-foreground/30">
                <ChevronRight className="w-4 h-4" />
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default DocumentLadder