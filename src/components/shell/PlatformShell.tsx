/**
 * PlatformShell — cinematic operating system shell that wraps ALL routes.
 *
 * When NEW_IFFY_SHELL flag is enabled, renders the full shell structure:
 *   ShellHeader → PhaseNavigation → children → ProgressionBar
 *   + IntelligenceOverlay (toggled via phase nav ✦)
 *
 * When flag is disabled, passes children through invisibly (legacy behavior).
 *
 * All phases are locked/placeholder — workspaces come in later tasks.
 */

import { useState, type ReactNode } from 'react'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { ShellHeader } from '@/components/shell/ShellHeader'
import { PhaseNavigation } from '@/components/shell/PhaseNavigation'
import { ProgressionBar } from '@/components/shell/ProgressionBar'
import { IntelligenceOverlay } from '@/components/shell/IntelligenceOverlay'

interface PlatformShellProps {
  children: ReactNode
}

export function PlatformShell({ children }: PlatformShellProps) {
  const shellEnabled = useFeatureFlag('NEW_IFFY_SHELL')
  const [intelligenceOpen, setIntelligenceOpen] = useState(false)

  // Flag disabled: pass through invisibly — exact legacy behavior
  if (!shellEnabled) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen flex flex-col bg-background" data-platform-shell>
      {/* Shell header */}
      <ShellHeader />

      {/* Phase navigation */}
      <PhaseNavigation
        onIntelligenceToggle={() => setIntelligenceOpen((prev) => !prev)}
      />

      {/* Main workspace content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Progression bar */}
      <ProgressionBar />

      {/* Intelligence overlay (slide-out panel) */}
      <IntelligenceOverlay
        open={intelligenceOpen}
        onClose={() => setIntelligenceOpen(false)}
      />
    </div>
  )
}