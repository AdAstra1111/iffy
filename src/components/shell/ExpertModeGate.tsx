/**
 * ExpertModeGate — Conditional rendering gate for expert mode content.
 *
 * When expert mode is disabled: renders nothing (no mount, no side effects).
 * When expert mode is enabled: renders children.
 *
 * Props:
 * - mode: 'hidden' | 'visible' — controls default visibility state (future use)
 *   Currently both modes behave identically (children render when expert mode on).
 *   The prop is reserved for future expanded/contracted panel states.
 *
 * Usage:
 *   <ExpertModeGate>
 *     <ExpertPanel projectId={projectId} />
 *   </ExpertModeGate>
 */

import { type ReactNode } from 'react'
import { useExpertMode } from '@/hooks/useExpertMode'

interface ExpertModeGateProps {
  children: ReactNode
  /** Reserved for future panel state control. Both values work identically now. */
  mode?: 'hidden' | 'visible'
}

export function ExpertModeGate({ children, mode: _mode }: ExpertModeGateProps) {
  const enabled = useExpertMode()

  // Do NOT mount children when expert mode is disabled — zero side effects
  if (!enabled) return null

  return <>{children}</>
}