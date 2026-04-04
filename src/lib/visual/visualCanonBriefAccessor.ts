/**
 * visualCanonBriefAccessor.ts — Canonical accessor for raw visual canon brief content.
 *
 * ARCHITECTURE:
 *   This is the ONLY public retrieval path for raw visual_canon_brief content
 *   from persisted canon JSON. All consumers that need to extract VisualCanonSignals
 *   must go through this accessor, never via direct ad hoc JSON key reads.
 *
 *   Retrieval path:
 *     canon_json.visual_canon_brief_content → getVisualCanonBriefContent()
 *       → extractVisualCanonSignals() → enrichment mappers
 *
 *   IEL: Raw brief content retrieved here must ONLY be passed to
 *   extractVisualCanonSignals(). No direct UI/prompt/export consumption.
 *
 * CANONICAL JSON KEY: 'visual_canon_brief_content'
 *   This key is the single persisted location for visual canon brief markdown.
 *   It is stored in project_canon.canon_json by the generate-document pipeline.
 */

// ── Access Result ───────────────────────────────────────────────────────────

export type VisualCanonBriefStatus = 'present' | 'missing' | 'malformed' | 'empty';

export interface VisualCanonBriefAccessResult {
  /** Status of the retrieval */
  status: VisualCanonBriefStatus;
  /** Raw markdown content — only populated when status === 'present' */
  content: string | null;
  /** Human-readable diagnostic for absence/failure */
  diagnostic: string;
}

/**
 * The canonical JSON key where visual canon brief content is persisted.
 * Single source of truth for the key name — all reads must reference this constant.
 */
export const VISUAL_CANON_BRIEF_CANON_KEY = 'visual_canon_brief_content' as const;

// ── Canonical Accessor ──────────────────────────────────────────────────────

/**
 * getVisualCanonBriefContent — THE ONLY public retrieval path for raw
 * visual canon brief content from canon JSON.
 *
 * Returns a typed access result with explicit status and diagnostics.
 * Never returns silent null — every absence is diagnosable.
 *
 * @param canonJson - The project canon JSON object (or null/undefined)
 * @returns VisualCanonBriefAccessResult with status, content, and diagnostic
 *
 * ARCHITECTURE:
 *   - Consumers MUST use this helper, not direct key reads
 *   - The returned content MUST only be passed to extractVisualCanonSignals()
 *   - No direct UI/prompt/export consumption of the returned content
 */
export function getVisualCanonBriefContent(
  canonJson: Record<string, unknown> | null | undefined,
): VisualCanonBriefAccessResult {
  // No canon at all
  if (!canonJson) {
    return {
      status: 'missing',
      content: null,
      diagnostic: 'No project canon available — visual canon brief cannot be retrieved',
    };
  }

  const raw = canonJson[VISUAL_CANON_BRIEF_CANON_KEY];

  // Key absent
  if (raw === undefined || raw === null) {
    return {
      status: 'missing',
      content: null,
      diagnostic: `Canon JSON does not contain '${VISUAL_CANON_BRIEF_CANON_KEY}' — visual canon brief has not been generated or persisted`,
    };
  }

  // Wrong type
  if (typeof raw !== 'string') {
    return {
      status: 'malformed',
      content: null,
      diagnostic: `'${VISUAL_CANON_BRIEF_CANON_KEY}' is type '${typeof raw}', expected string — data may be corrupted`,
    };
  }

  // Empty string
  if (raw.trim().length === 0) {
    return {
      status: 'empty',
      content: null,
      diagnostic: `'${VISUAL_CANON_BRIEF_CANON_KEY}' is an empty string — visual canon brief was persisted but contains no content`,
    };
  }

  // Valid
  return {
    status: 'present',
    content: raw,
    diagnostic: `Visual canon brief content retrieved (${raw.length} chars)`,
  };
}
