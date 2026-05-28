/**
 * Legacy Route Redirect System
 *
 * Maps old IFFY route patterns (pre-workspace reorg) to their new workspace paths.
 * Pure utility — no React dependencies, no route mutations.
 *
 * Redirects are managed by the routing layer, not this file. This is a reference
 * mapping for future use when redirects are implemented.
 *
 * @see {@link https://hermes-agent.nousresearch.com/docs} — part of A6 foundation phase
 */

// ── Redirect Map ─────────────────────────────────────────────────────────────

/**
 * Mapping of old route patterns (with `:id` placeholder) to new workspace paths.
 *
 * All legacy routes that previously lived under flat `/projects/:id/*` URLs
 * are grouped into one of seven workspace namespaces:
 *   concept, develop, visualize, cast, produce, package, deliver
 *
 * Note: `/projects/:id/audio-export` was listed under both `produce` and `deliver`
 * in the original spec; `deliver` wins as the effective mapping.
 */
const LEGACY_REDIRECT_MAP: Record<string, string> = {
  // ── Develop workspace ──────────────────────────────────────────────────────
  '/projects/:id/development': '/projects/:id/develop',
  '/projects/:id/script': '/projects/:id/develop',
  '/projects/:id/canon': '/projects/:id/develop',
  '/projects/:id/series-writer': '/projects/:id/develop',
  '/projects/:id/feature-script': '/projects/:id/develop',
  '/projects/:id/notes': '/projects/:id/develop',

  // ── Visualize workspace ────────────────────────────────────────────────────
  '/projects/:id/visual-production': '/projects/:id/visualize',
  '/projects/:id/visual-dev': '/projects/:id/visualize',
  '/projects/:id/visual-references': '/projects/:id/visualize',
  '/projects/:id/visual-units': '/projects/:id/visualize',

  // ── Cast workspace ─────────────────────────────────────────────────────────
  '/projects/:id/casting': '/projects/:id/cast',
  '/projects/:id/casting-studio': '/projects/:id/cast',
  '/projects/:id/casting-advanced': '/projects/:id/cast',
  '/projects/:id/ai-cast': '/projects/:id/cast',
  '/projects/:id/casting-pipeline': '/projects/:id/cast',

  // ── Produce workspace ──────────────────────────────────────────────────────
  '/projects/:id/storyboards': '/projects/:id/produce',
  '/projects/:id/shot-list': '/projects/:id/produce',
  '/projects/:id/storyboard-pipeline': '/projects/:id/produce',
  '/projects/:id/trailer': '/projects/:id/produce',
  '/projects/:id/trailer-pipeline': '/projects/:id/produce',
  '/projects/:id/trailer-clips': '/projects/:id/produce',
  '/projects/:id/trailer-assemble': '/projects/:id/produce',
  '/projects/:id/ai-trailer': '/projects/:id/produce',
  '/projects/:id/production-design': '/projects/:id/produce',
  '/projects/:id/animatic': '/projects/:id/produce',
  '/projects/:id/produce': '/projects/:id/produce',
  '/projects/:id/cockpit': '/projects/:id/produce',

  // ── Package workspace ──────────────────────────────────────────────────────
  '/projects/:id/lookbook': '/projects/:id/package',
  '/projects/:id/pitch-deck': '/projects/:id/package',
  '/projects/:id/deck': '/projects/:id/package',
  '/projects/:id/market-sheet': '/projects/:id/package',

  // ── Deliver workspace ──────────────────────────────────────────────────────
  '/projects/:id/images': '/projects/:id/deliver',
  '/projects/:id/export': '/projects/:id/deliver',
  '/projects/:id/share': '/projects/:id/deliver',
  '/projects/:id/audio-export': '/projects/:id/deliver',
}

// ── Pattern helpers ──────────────────────────────────────────────────────────

/**
 * Extract the `:id` parameter and the trailing segment from a concrete path.
 *
 * Given `/projects/abc123/development`, returns:
 *   { projectId: 'abc123', page: 'development' }
 *
 * Returns null if the path doesn't match the `/projects/:id/:page` shape.
 */
function parseProjectPath(path: string): { projectId: string; page: string } | null {
  const match = path.match(/^\/projects\/([^/]+)\/([^/]+)$/)
  if (!match) return null
  return { projectId: match[1], page: match[2] }
}

// ── Exported API ─────────────────────────────────────────────────────────────

/**
 * Given a concrete path like `/projects/abc123/development`, return the
 * redirected workspace path (e.g. `/projects/abc123/develop`).
 *
 * Returns `null` if no redirect exists for the given path.
 *
 * @example
 * ```ts
 * getLegacyRedirect('/projects/abc123/development') // → '/projects/abc123/develop'
 * getLegacyRedirect('/projects/abc123/nonexistent')  // → null
 * ```
 */
export function getLegacyRedirect(path: string): string | null {
  const parsed = parseProjectPath(path)
  if (!parsed) return null

  const pattern = `/projects/:id/${parsed.page}`
  const target = LEGACY_REDIRECT_MAP[pattern]
  if (!target) return null

  return target.replace(':id', parsed.projectId)
}

/**
 * Returns `true` if the given path is a legacy route that has a redirect mapping.
 *
 * @example
 * ```ts
 * isLegacyPath('/projects/abc123/development') // → true
 * isLegacyPath('/projects/abc123/develop')      // → false (new path)
 * ```
 */
export function isLegacyPath(path: string): boolean {
  return getLegacyRedirect(path) !== null
}

/**
 * Returns all legacy route patterns (with `:id` placeholder).
 * Useful for registering redirect routes or generating documentation.
 */
export function getAllLegacyPaths(): string[] {
  return Object.keys(LEGACY_REDIRECT_MAP)
}