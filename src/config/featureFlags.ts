/**
 * IFFY Feature Flag Registry — canonical source of truth.
 *
 * All flags default to TRUE (preview mode).
 * Override priority chain: URL query params > localStorage > config defaults.
 *
 * THIS IS THE ONLY PLACE flags are defined. Do NOT add flags elsewhere.
 */

// ── Flag definition ──────────────────────────────────────────────────────────

export interface FeatureFlags {
  /** New PlatformShell wrapper */
  NEW_IFFY_SHELL: boolean
  /** New Develop workspace */
  NEW_WORKSPACE_DEVELOP: boolean
  /** New Visualize workspace */
  NEW_WORKSPACE_VISUALIZE: boolean
  /** New Cast workspace */
  NEW_WORKSPACE_CAST: boolean
  /** New Produce workspace */
  NEW_WORKSPACE_PRODUCE: boolean
  /** New Package workspace */
  NEW_WORKSPACE_PACKAGE: boolean
  /** New Deliver workspace */
  NEW_WORKSPACE_DELIVER: boolean
  /** New Intelligence overlay */
  NEW_INTELLIGENCE_LAYER: boolean
  /** New Expert mode */
  NEW_EXPERT_MODE: boolean
  /** New System mode */
  NEW_SYSTEM_MODE: boolean
}

// ── All flags default to true (preview mode, production-safe via per-project control) ──

export const DEFAULT_FLAGS: FeatureFlags = {
  NEW_IFFY_SHELL: true,
  NEW_WORKSPACE_DEVELOP: true,
  NEW_WORKSPACE_VISUALIZE: true,
  NEW_WORKSPACE_CAST: true,
  NEW_WORKSPACE_PRODUCE: true,
  NEW_WORKSPACE_PACKAGE: true,
  NEW_WORKSPACE_DELIVER: true,
  NEW_INTELLIGENCE_LAYER: true,
  NEW_EXPERT_MODE: true,
  NEW_SYSTEM_MODE: true,
}

// ── All valid flag names (for runtime validation) ──────────────────────────

export const FLAG_NAMES: ReadonlyArray<keyof FeatureFlags> =
  Object.keys(DEFAULT_FLAGS) as unknown as Array<keyof FeatureFlags>

// ── Workspace flag grouping ──────────────────────────────────────────────────

export const WORKSPACE_FLAGS: ReadonlyArray<keyof FeatureFlags> = [
  'NEW_WORKSPACE_DEVELOP',
  'NEW_WORKSPACE_VISUALIZE',
  'NEW_WORKSPACE_CAST',
  'NEW_WORKSPACE_PRODUCE',
  'NEW_WORKSPACE_PACKAGE',
  'NEW_WORKSPACE_DELIVER',
] as const

/** Map workspace short name → canonical flag key */
export const WORKSPACE_FLAG_MAP: Record<string, keyof FeatureFlags> = {
  develop: 'NEW_WORKSPACE_DEVELOP',
  visualize: 'NEW_WORKSPACE_VISUALIZE',
  cast: 'NEW_WORKSPACE_CAST',
  produce: 'NEW_WORKSPACE_PRODUCE',
  package: 'NEW_WORKSPACE_PACKAGE',
  deliver: 'NEW_WORKSPACE_DELIVER',
}