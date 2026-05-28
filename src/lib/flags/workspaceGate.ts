/**
 * Workspace Gate — component-level gating for workspace mounting points.
 *
 * Shows children only when the corresponding flag is true.
 * Renders nothing (or fallback) when the flag is false.
 *
 * For future use when mounting new workspace components into the PlatformShell.
 */

import React, { type ReactNode } from 'react'
import type { FeatureFlags } from '@/config/featureFlags'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'

// ── Props ───────────────────────────────────────────────────────────────────

interface WorkspaceGateProps {
  /** The feature flag to check */
  flag: keyof FeatureFlags
  /** Content to render when flag is true */
  children: ReactNode
  /** Optional fallback to render when flag is false (default: null — nothing) */
  fallback?: ReactNode
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Gate component: renders children only when the specified flag is true.
 *
 * When the flag is false, renders nothing by default (legacy behavior preserved).
 * An optional fallback can be provided for graceful transitions.
 *
 * Usage:
 * ```tsx
 * <WorkspaceGate flag="NEW_WORKSPACE_DEVELOP">
 *   <NewDevelopWorkspace />
 * </WorkspaceGate>
 * ```
 */
export function WorkspaceGate({
  flag,
  children,
  fallback = null,
}: WorkspaceGateProps): React.ReactElement | null {
  const enabled = useFeatureFlag(flag)

  if (!enabled) {
    return fallback as React.ReactElement | null
  }

  return React.createElement(React.Fragment, null, children)
}

// ── Higher-order component wrapper ──────────────────────────────────────────

/**
 * HOC wrapper: wraps a component so it only renders when the flag is enabled.
 *
 * Usage:
 * ```tsx
 * const GatedDevelop = withFeatureGate(DevelopWorkspace, 'NEW_WORKSPACE_DEVELOP');
 * ```
 */
export function withFeatureGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  flag: keyof FeatureFlags,
  FallbackComponent?: React.ComponentType<P>
): React.FC<P> {
  const displayName =
    WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component'

  const GatedComponent: React.FC<P> = (props: P) => {
    const enabled = useFeatureFlag(flag)

    if (!enabled) {
      if (FallbackComponent) {
        return React.createElement(FallbackComponent, props)
      }
      return null
    }

    return React.createElement(WrappedComponent, props)
  }

  GatedComponent.displayName = `withFeatureGate(${displayName})`
  return GatedComponent
}