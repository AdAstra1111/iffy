/**
 * visualCanonEnrichment.ts — Canonical enrichment layer from VisualCanonSignals.
 *
 * ARCHITECTURE:
 *   This is the ONLY approved pathway for downstream systems to receive
 *   structured influence from the visual_canon_brief.
 *
 *   visual_canon_brief (prose) → extractVisualCanonSignals() → enrichment bundles
 *
 *   Enrichment is NON-AUTHORITATIVE. Downstream truth owners (effective profile,
 *   state wardrobe, PD resolver, location datasets) remain canonical authorities.
 *   Enrichment adds context — it does NOT override.
 *
 * IEL: No raw visual_canon_brief prose may pass through this layer.
 *      Only typed VisualCanonSignals are accepted as input.
 */

import type {
  VisualCanonSignals,
  MaterialSignal,
  MotifSignal,
  VisualExclusion,
  PaletteSignal,
} from './visualCanonBrief';

// ── Wardrobe Enrichment Bundle ──────────────────────────────────────────────

export interface WardrobeEnrichmentBundle {
  /** Material/fabric preference hints (non-authoritative) */
  material_hints: string[];
  /** Class/labor expression hints for formality/workwear logic */
  class_expression_hints: string[];
  /** Motif consistency hints for costume coherence */
  motif_hints: string[];
  /** Costume philosophy summary (structured, not prose) */
  costume_philosophy_summary: string;
  /** Additional exclusion hints (reinforce forbidden families) */
  exclusion_hints: string[];
  /** Palette hints relevant to wardrobe color logic */
  palette_hints: string[];
  /** Provenance */
  source_version_id: string | null;
  extracted_at: string;
}

// ── Production Design Enrichment Bundle ─────────────────────────────────────

export interface PDEnrichmentBundle {
  /** Material/texture signals to enrich PD material palette */
  material_signals: MaterialSignal[];
  /** Architecture/spatial philosophy summary */
  pd_philosophy_summary: string;
  /** Palette signals for environment color logic */
  palette_signals: PaletteSignal[];
  /** Class/labor spatial hints (density, wear, hierarchy) */
  class_spatial_hints: string[];
  /** Motif recurrence signals for environment consistency */
  motif_signals: MotifSignal[];
  /** Exclusion signals for anti-drift */
  exclusion_signals: VisualExclusion[];
  /** Era classification for period enforcement */
  era_classification: string;
  /** Provenance */
  source_version_id: string | null;
  extracted_at: string;
}

// ── Enrichment Mappers ──────────────────────────────────────────────────────

/**
 * Map VisualCanonSignals → WardrobeEnrichmentBundle.
 *
 * ARCHITECTURE: This is enrichment-only. The returned bundle must be consumed
 * by canonical wardrobe resolvers as supplementary hints, never as overrides.
 */
export function mapWardrobeEnrichment(
  signals: VisualCanonSignals,
): WardrobeEnrichmentBundle {
  assertSignalsInput(signals);

  return {
    material_hints: signals.materials
      .map(m => m.material)
      .filter(Boolean)
      .slice(0, 10),
    class_expression_hints: signals.class_expression_rules.slice(0, 6),
    motif_hints: signals.motifs
      .map(m => `${m.motif}: ${m.meaning}`.trim())
      .filter(Boolean)
      .slice(0, 6),
    costume_philosophy_summary: signals.costume_philosophy.slice(0, 400),
    exclusion_hints: signals.exclusions
      .map(e => e.excluded_element)
      .filter(Boolean),
    palette_hints: signals.palettes
      .map(p => `${p.palette_name}: ${p.usage_context}`)
      .filter(Boolean)
      .slice(0, 4),
    source_version_id: signals.source_version_id,
    extracted_at: signals.extracted_at,
  };
}

/**
 * Map VisualCanonSignals → PDEnrichmentBundle.
 *
 * ARCHITECTURE: This is enrichment-only. The returned bundle must be consumed
 * by canonical PD resolvers as supplementary context, never as replacement.
 */
export function mapPDEnrichment(
  signals: VisualCanonSignals,
): PDEnrichmentBundle {
  assertSignalsInput(signals);

  return {
    material_signals: signals.materials.slice(0, 12),
    pd_philosophy_summary: signals.production_design_philosophy.slice(0, 400),
    palette_signals: signals.palettes.slice(0, 6),
    class_spatial_hints: signals.class_expression_rules
      .filter(r => /\b(space|density|wear|hierarchy|environment|room|workshop|home)\b/i.test(r))
      .slice(0, 4),
    motif_signals: signals.motifs.slice(0, 8),
    exclusion_signals: signals.exclusions.slice(0, 8),
    era_classification: signals.era_classification,
    source_version_id: signals.source_version_id,
    extracted_at: signals.extracted_at,
  };
}

// ── Absence Handling ────────────────────────────────────────────────────────

/** Sentinel for explicit absence — downstream systems check this to skip enrichment cleanly */
export const NO_ENRICHMENT = null;

/**
 * Resolve wardrobe enrichment from signals, or return null if absent.
 * Fail-soft: no fabricated defaults.
 */
export function resolveWardrobeEnrichmentOrNull(
  signals: VisualCanonSignals | null | undefined,
): WardrobeEnrichmentBundle | null {
  if (!signals || !signals.is_complete) return NO_ENRICHMENT;
  return mapWardrobeEnrichment(signals);
}

/**
 * Resolve PD enrichment from signals, or return null if absent.
 * Fail-soft: no fabricated defaults.
 */
export function resolvePDEnrichmentOrNull(
  signals: VisualCanonSignals | null | undefined,
): PDEnrichmentBundle | null {
  if (!signals || !signals.is_complete) return NO_ENRICHMENT;
  return mapPDEnrichment(signals);
}

// ── IEL Guard ───────────────────────────────────────────────────────────────

/**
 * Assert that the input is typed VisualCanonSignals, not raw markdown.
 * Prevents accidental raw-prose passthrough.
 */
function assertSignalsInput(input: unknown): asserts input is VisualCanonSignals {
  if (!input || typeof input !== 'object') {
    throw new Error('[IEL] ENRICHMENT_INVALID_INPUT: input must be VisualCanonSignals object');
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.extracted_at !== 'string' || !('materials' in obj) || !('exclusions' in obj)) {
    throw new Error(
      '[IEL] ENRICHMENT_RAW_PROSE_BLOCKED: input does not match VisualCanonSignals shape. ' +
      'Use extractVisualCanonSignals() first — raw markdown is forbidden.',
    );
  }
}

/**
 * Assert that no raw visual_canon_brief markdown is being passed where
 * only enrichment bundles or structured signals should be used.
 * Call at downstream consumption boundaries.
 */
export function assertNoRawVisualCanonMarkdown(input: unknown, context: string): void {
  if (typeof input === 'string' && input.length > 100) {
    // Heuristic: raw markdown will have headings
    if (/^#{1,4}\s+/m.test(input)) {
      throw new Error(
        `[IEL] RAW_VISUAL_CANON_MARKDOWN_BLOCKED in ${context}: ` +
        `raw visual_canon_brief prose detected. Use extractVisualCanonSignals() → enrichment mappers.`,
      );
    }
  }
}
