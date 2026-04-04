/**
 * visualPublicEntrypoints.ts — Canonical declaration of approved public APIs
 * for the Visual OS.
 *
 * ARCHITECTURE:
 *   This file is the single importable reference for what may be called
 *   directly by consumers (UI, hooks, assemblers, orchestrators).
 *   Internal primitives are NOT listed here and MUST NOT be called
 *   from outside their owning module.
 *
 *   If a function is not listed here, it is internal-only.
 *
 * IEL: This file is the canonical registry. Adding a new public entrypoint
 *   requires explicit justification and architectural review.
 */

// ── Visual Canon Brief Retrieval ────────────────────────────────────────────
// Canonical accessor for raw visual canon brief content from canon JSON.
// Returned content MUST only be passed to extractVisualCanonSignals().
export { getVisualCanonBriefContent, VISUAL_CANON_BRIEF_CANON_KEY } from './visualCanonBriefAccessor';

// ── Visual Canon Signal Extraction ──────────────────────────────────────────
// THE ONLY legal extraction path from visual_canon_brief prose → structured signals.
export { extractVisualCanonSignals } from './visualCanonBrief';
export type { VisualCanonSignals } from './visualCanonBrief';

// ── Effective Wardrobe Profile ──────────────────────────────────────────────
// Profile-level wardrobe resolution with temporal exclusion applied.
// All wardrobe consumers MUST use this instead of reading signature_garments directly.
export { resolveEffectiveProfile, resolveEffectiveProfileOrNull } from './effectiveProfileResolver';

// ── State Wardrobe Resolution ───────────────────────────────────────────────
// Per-scene/state costume resolution. Returns displayGarments for rendering.
export { resolveStateWardrobe } from './costumeOnActor';

// ── Visual Canon Enrichment ─────────────────────────────────────────────────
// Structured enrichment mappers (additive, non-authoritative).
export { mapWardrobeEnrichment, mapPDEnrichment, resolvePDEnrichmentOrNull } from './visualCanonEnrichment';

// ── Visual Project Bible ────────────────────────────────────────────────────
// Read-only canonical assembler. Does NOT create truth.
// Assembly core lives in visualProjectBibleCore.ts — the ONLY section-construction authority.
// Client wrapper (visualProjectBibleAssembler.ts) and edge wrapper delegate to it.
export { assembleVisualProjectBible } from './visualProjectBibleAssembler';
export { assembleVPBCore, VPB_SECTION_KEYS, VPB_REQUIRED_SECTION_COUNT } from './visualProjectBibleCore';
export type { VPBCoreInput, VPBCoreResult } from './visualProjectBibleCore';

// ── Visual Canon Extraction (Creative Design Primitives) ────────────────────
// Derived artistic synthesis — NOT upstream truth.
export { extractVisualCanon, getMotifRelevantPrimitives, getPDRelevantPrimitives } from './visualCanonExtractor';

// ── Wardrobe Profile Validation ─────────────────────────────────────────────
// Guard against placeholder/degraded wardrobe profiles.
export { validateWardrobeProfile, getDegradedProfileReason } from './wardrobeProfileGuard';

// ── Authority Map ───────────────────────────────────────────────────────────
// Importable authority constants for guards and documentation.
export { VISUAL_AUTHORITIES, UI_SURFACE_BOUNDARIES, assertAuthority } from './visualAuthorityMap';

// ── INTERNAL-ONLY (NOT RE-EXPORTED) ─────────────────────────────────────────
// The following are internal primitives and MUST NOT be imported directly
// by consumers outside their owning module:
//
//   effectiveWardrobeNormalizer.ts → normalizeWardrobe() [internal]
//   effectiveWardrobeNormalizer.ts → normalizeIdentitySummary() [internal]
//   characterWardrobeExtractor.ts → extractCharacterWardrobeProfile() [extractor input contract]
//   temporalTruthResolver.ts → resolveTemporalTruth() [use useCanonicalTemporalTruth hook]
//
// If you need wardrobe normalization, use resolveEffectiveProfile() or resolveStateWardrobe().
// If you need temporal truth, use useCanonicalTemporalTruth() hook.
