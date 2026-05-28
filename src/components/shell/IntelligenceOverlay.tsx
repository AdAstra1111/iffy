/**
 * IntelligenceOverlay — slide-out panel from the right.
 * Shows placeholder content until the Intelligence workspace is built.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface IntelligenceOverlayProps {
  open: boolean
  onClose: () => void
}

export function IntelligenceOverlay({ open, onClose }: IntelligenceOverlayProps) {
  const panelRef = useRef<HTMLElement>(null)

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus panel on open
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <aside
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'fixed top-0 bottom-0 right-0 z-50',
          'w-[420px] max-w-[90vw]',
          'border-l border-border/15',
          'bg-card/95 backdrop-blur-xl',
          'flex flex-col shadow-2xl outline-none',
          'animate-in slide-in-from-right-4 duration-150',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Intelligence</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Placeholder content */}
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <div className="text-3xl mb-3 opacity-30">✦</div>
            <p className="text-sm text-muted-foreground/60">
              Intelligence coming soon
            </p>
            <p className="text-xs text-muted-foreground/40 mt-1">
              Market insights, trend analysis, and competitive intelligence will appear here.
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}