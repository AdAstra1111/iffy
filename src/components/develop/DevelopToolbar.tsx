/**
 * DevelopToolbar — Action bar with primary development actions.
 *
 * - "Generate" button (generates current document stage)
 * - "Regenerate" dropdown option
 * - "Approve & Advance" button (approves and promotes to next stage)
 * - Notes indicator: count badge with tooltip
 * - Disabled states when generation is already running
 */
import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, CheckCircle2, MessageSquare, ChevronDown } from 'lucide-react'

interface DevelopToolbarProps {
  /** Is a generation currently in progress? */
  isGenerating: boolean
  /** Is the current document ready to be approved? */
  canApprove: boolean
  /** Can generate (has a current stage selected)? */
  canGenerate: boolean
  /** Notes count */
  notesCount?: number
  /** Callbacks */
  onGenerate: () => void
  onRegenerate: () => void
  onApprove: () => void
  onNotesClick?: () => void
}

const DevelopToolbar: React.FC<DevelopToolbarProps> = ({
  isGenerating,
  canApprove,
  canGenerate,
  notesCount = 0,
  onGenerate,
  onRegenerate,
  onApprove,
  onNotesClick,
}) => {
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  return (
    <div className="flex items-center gap-2 px-6 py-2.5 border-t border-border/40 bg-background">
      {/* Generate / Regenerate group */}
      <div className="flex items-center gap-0" ref={dropdownRef}>
        <Button
          onClick={onGenerate}
          disabled={!canGenerate || isGenerating}
          size="sm"
          className="rounded-r-none"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Generate
            </>
          )}
        </Button>

        <Button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={!canGenerate || isGenerating}
          variant="outline"
          size="sm"
          className="rounded-l-none border-l-0 px-2"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute top-full mt-1 z-50 min-w-[140px] rounded-md border border-border/50 bg-popover shadow-lg">
            <button
              onClick={() => {
                setShowDropdown(false)
                onRegenerate()
              }}
              disabled={isGenerating}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-40"
            >
              Regenerate
            </button>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Approve & Advance */}
      <Button
        onClick={onApprove}
        disabled={!canApprove || isGenerating}
        variant="default"
        size="sm"
        className="bg-green-600 hover:bg-green-700 text-white"
      >
        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
        Approve &amp; Advance
      </Button>

      {/* Notes indicator */}
      <div className="flex items-center">
        <button
          onClick={onNotesClick}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors text-xs',
            'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
          title={`${notesCount} note${notesCount !== 1 ? 's' : ''}`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {notesCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
              {notesCount > 99 ? '99+' : notesCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

export default DevelopToolbar