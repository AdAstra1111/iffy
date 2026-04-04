/**
 * costumeOnActor.ts — Canonical Costume-on-Actor Look System.
 *
 * Deterministic generation of actor-bound costume looks from:
 * - approved actor identity
 * - character wardrobe profile
 * - wardrobe state definition
 * - world validation mode
 * - costume system constraints
 *
 * ═══ VISUAL AUTHORITY BOUNDARY ═══
 * PUBLIC ENTRYPOINT: resolveStateWardrobe()
 * All state-level wardrobe consumers MUST use resolveStateWardrobe().
 * Display chips MUST read displayGarments/displayFabrics — never raw signature_garments.
 * Temporal exclusion is applied at entry via resolveEffectiveProfile().
 * See: src/lib/visual/visualPublicEntrypoints.ts
 *
 * v1.0.0
 */

import type { CharacterWardrobeProfile, WardrobeStateDefinition } from './characterWardrobeExtractor';
import type { WorldValidationRules } from './worldValidationMode';
import type { TemporalTruth } from './temporalTruthResolver';
import { normalizeWardrobe } from './effectiveWardrobeNormalizer';
import { resolveEffectiveProfile } from './effectiveProfileResolver';
import {
  GARMENT_NOUN_PATTERN,
  FABRIC_NOUN_PATTERN,
  deriveCostumeFingerprint,
  type CostumeFamilyFingerprint,
} from './costumeValidation';
import type { WardrobeEnrichmentBundle } from './visualCanonEnrichment';
import { reconstructStateGarments, classifyStateCategory, resolveTransformationAxes, resolveBaselineWardrobe, deriveCanonInputsFromProfile, type StateCategory, type IntelligenceSource, type TransformationAxes, type CanonWardrobeInputs, type BaselineWardrobe } from './stateWardrobeReconstructor';

// ── Constants ───────────────────────────────────────────────────────────────

export const COSTUME_ON_ACTOR_VERSION = '1.0.0';
export const COSTUME_ON_ACTOR_DOMAIN = 'character_costume_look';

// ── Look Slot Definitions ───────────────────────────────────────────────────
// CANONICAL ORDER: required slots first, then optional, in priority sequence.
// Generation and convergence MUST iterate in this order.

export interface CostumeLookSlotDef {
  key: string;
  label: string;
  required: boolean;
  shot_type: string;
  /** Explicit prompt template routing key — must match buildSlotFraming */
  prompt_template_key: string;
}

export const COSTUME_LOOK_SLOTS: CostumeLookSlotDef[] = [
  // Required slots first (priority order)
  // CRITICAL: shot_type MUST NOT use identity_* prefixes — those trigger the identity-reference
  // prompt path in generate-lookbook-image, which BYPASSES the custom_prompt (costume brief).
  { key: 'full_body_primary', label: 'Full Body Primary', required: true, shot_type: 'full_body', prompt_template_key: 'full_body_primary' },
  { key: 'three_quarter', label: 'Three-Quarter View', required: true, shot_type: 'medium', prompt_template_key: 'three_quarter' },
  // Optional slots (priority order)
  { key: 'front_silhouette', label: 'Front Silhouette', required: false, shot_type: 'full_body', prompt_template_key: 'front_silhouette' },
  { key: 'back_silhouette', label: 'Back Silhouette', required: false, shot_type: 'full_body', prompt_template_key: 'back_silhouette' },
  { key: 'fabric_detail', label: 'Fabric Detail', required: false, shot_type: 'detail', prompt_template_key: 'fabric_detail' },
  { key: 'closure_detail', label: 'Closure Detail', required: false, shot_type: 'detail', prompt_template_key: 'closure_detail' },
  { key: 'accessory_detail', label: 'Accessory Detail', required: false, shot_type: 'detail', prompt_template_key: 'accessory_detail' },
  { key: 'hair_grooming', label: 'Hair & Grooming', required: false, shot_type: 'close_up', prompt_template_key: 'hair_grooming' },
];

/** Canonical priority-ordered slot keys */
export const COSTUME_SLOT_PRIORITY_ORDER = COSTUME_LOOK_SLOTS.map(s => s.key);

/** Required slot keys only */
export const COSTUME_REQUIRED_SLOT_KEYS = COSTUME_LOOK_SLOTS.filter(s => s.required).map(s => s.key);

/** Valid prompt template routing keys — fail closed if slot_key not in this set */
const VALID_COSTUME_PROMPT_KEYS = new Set(COSTUME_LOOK_SLOTS.map(s => s.prompt_template_key));

/**
 * Validate that a slot_key can resolve to a costume prompt template.
 * FAIL CLOSED: returns false for unknown/identity/casting keys.
 */
export function isValidCostumeSlotKey(slotKey: string): boolean {
  return VALID_COSTUME_PROMPT_KEYS.has(slotKey);
}

/**
 * Sort slots into canonical generation order: required first, then optional,
 * each group in COSTUME_LOOK_SLOTS priority order.
 */
export function sortSlotsForGeneration<T extends { slot_key: string; is_required: boolean }>(
  slots: T[],
): T[] {
  const orderMap = new Map(COSTUME_SLOT_PRIORITY_ORDER.map((k, i) => [k, i]));
  return [...slots].sort((a, b) => {
    // Required first
    if (a.is_required !== b.is_required) return a.is_required ? -1 : 1;
    // Then by canonical order
    const oa = orderMap.get(a.slot_key) ?? 999;
    const ob = orderMap.get(b.slot_key) ?? 999;
    return oa - ob;
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CostumeLookInput {
  characterName: string;
  characterKey: string;
  actorName: string;
  actorId: string;
  actorVersionId: string;
  wardrobeProfile: CharacterWardrobeProfile;
  wardrobeState: WardrobeStateDefinition;
  worldRules: WorldValidationRules | null;
  referenceImageUrls: string[];
  /** Canonical temporal truth for garment exclusion enforcement */
  temporalTruth?: TemporalTruth | null;
  /**
   * Visual canon enrichment for wardrobe context (non-authoritative).
   * ARCHITECTURE: Must be a WardrobeEnrichmentBundle from visualCanonEnrichment.ts.
   * Enriches material/class/motif hints in prompt — does NOT override canonical wardrobe truth.
   */
  wardrobeEnrichment?: WardrobeEnrichmentBundle | null;
  /**
   * Canon-first wardrobe inputs derived from profile/canon upstream.
   * Passed through to resolveStateWardrobe() for baseline resolution.
   */
  canonWardrobeInputs?: CanonWardrobeInputs | null;
}

export interface CostumeLookPromptResult {
  prompt: string;
  negative_prompt: string;
  identity_mode: true;
  actor_id: string;
  actor_version_id: string;
  character_key: string;
  wardrobe_state_key: string;
  slot_key: string;
  shot_type: string;
  domain: typeof COSTUME_ON_ACTOR_DOMAIN;
  version: typeof COSTUME_ON_ACTOR_VERSION;
}

export interface CostumeLookValidationResult {
  passed: boolean;
  identity_preserved: boolean;
  garment_match: boolean;
  state_adjustments_respected: boolean;
  class_coherence: boolean;
  no_editorial_drift: boolean;
  world_mode_respected: boolean;
  physically_wearable: boolean;
  hard_fail_codes: string[];
  advisory_codes: string[];
  overall_score: number;
  fingerprint: CostumeFamilyFingerprint;
  scoring_model: string;
  validation_version: string;
}

export interface CostumeLookDiagnostics {
  character_key: string;
  actor_id: string;
  wardrobe_state_key: string;
  slot_key: string;
  validation: CostumeLookValidationResult;
  selection_status: string;
  version: string;
}

// ── Prompt Builder ──────────────────────────────────────────────────────────

/**
 * Detect whether a garment_adjustment is an actual garment noun (scene-derived)
 * vs an abstract descriptor like "practical" or "ceremonial-specific".
 */
const CONCRETE_GARMENT_RE = /\b(robe|kimono|hakama|obi|haori|kosode|tunic|shirt|blouse|vest|jacket|coat|cloak|cape|shawl|sash|apron|skirt|trousers|pants|dress|gown|toga|sarong|caftan|tabard|doublet|bodice|corset|smock|uniform|armor|armour|boots|sandals|shoes|slippers|hat|cap|hood|veil|turban|scarf|wrap|belt|gloves|headwrap|suit|blazer|jeans|t-shirt|sweater|cardigan|hoodie|sneakers|heels|loafers|shorts|tank\s*top|polo)\b/i;

const CONCRETE_FABRIC_RE = /\b(silk|cotton|linen|hemp|wool|felt|leather|suede|fur|brocade|damask|satin|velvet|muslin|gauze|chiffon|canvas|burlap|tweed|homespun|denim|polyester|nylon|cashmere|jersey|fleece|chambray|khaki)\b/i;

const SOURCE_DECORATION_RES = [
  /\s*·\s*(scene|profile|inferred)\s*$/i,
  /\s*\.\s*(scene|profile|inferred)\s*$/i,
  /\s*\((scene|profile|inferred)\)\s*$/i,
  /\s*\[(scene|profile|inferred)\]\s*$/i,
  /\s*(?:-|–|—)\s*(scene|profile|inferred)\s*$/i,
];

function isConcreteGarment(adj: string): boolean {
  return CONCRETE_GARMENT_RE.test(adj);
}

function isConcreteFabric(adj: string): boolean {
  return CONCRETE_FABRIC_RE.test(adj);
}

function stripSourceDecoration(value: string): string {
  return SOURCE_DECORATION_RES.reduce(
    (acc, re) => acc.replace(re, ''),
    value,
  ).replace(/\s{2,}/g, ' ').trim();
}

function dedupeDisplayItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const clean = stripSourceDecoration(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

export function assertNoForbiddenDisplayGarments(
  displayGarments: string[],
  temporalTruth?: TemporalTruth | null,
): void {
  if (!temporalTruth || temporalTruth.confidence === 'low' || temporalTruth.forbidden_garment_families.length === 0) {
    return;
  }

  const forbiddenSet = new Set(
    temporalTruth.forbidden_garment_families.map(item => item.toLowerCase()),
  );
  const leaked = displayGarments.filter(item => forbiddenSet.has(stripSourceDecoration(item).toLowerCase()));

  if (leaked.length > 0) {
    throw new Error(
      `[CostumeOnActor] IEL violation: forbidden garments leaked into final display array: ${leaked.join(', ')}`,
    );
  }
}

function buildGarmentBlock(
  profile: CharacterWardrobeProfile,
  state: WardrobeStateDefinition,
  temporalTruth?: TemporalTruth | null,
  resolvedState?: ResolvedStateWardrobe,
): string {
  const resolved = resolvedState ?? resolveStateWardrobe(profile, state, temporalTruth);
  const abstractFromState = dedupeDisplayItems(state.garment_adjustments).filter(a => !isConcreteGarment(a));
  const abstractFabricsFromState = dedupeDisplayItems(state.fabric_adjustments).filter(f => !isConcreteFabric(f));

  const effectiveGarments = (resolved.displayGarments.length > 0 ? resolved.displayGarments : ['role-appropriate garments']).join(', ');
  const effectiveFabrics = resolved.displayFabrics.length > 0
    ? resolved.displayFabrics.join(', ')
    : (profile.fabric_language || 'class-appropriate fabrics');

  const silhouette = profile.silhouette_language || 'role-defined silhouette';

  const parts: string[] = [];

  // ── Baseline identity context (canon-first) ──
  const bl = resolved.baseline;
  if (bl) {
    const identityParts: string[] = [];
    if (bl.baselineSource === 'script') identityParts.push('script-specified wardrobe');
    if (bl.baseSilhouette && bl.baseSilhouette !== 'role-appropriate') identityParts.push(bl.baseSilhouette);
    if (identityParts.length > 0) {
      parts.push(`baseline identity: ${identityParts.join(', ')}`);
    }
  }

  parts.push(`wearing ${effectiveGarments}`);
  parts.push(`made of ${effectiveFabrics}`);
  parts.push(`${silhouette}`);

  // ── Transformation axes: state-specific visual modifications ──
  // These are identity-grounded, state-derived, and guaranteed distinct per state.
  const axes = resolved.transformationAxes;
  if (axes) {
    parts.push(`silhouette: ${axes.silhouette}`);
    parts.push(`material finish: ${axes.material_finish}`);
    parts.push(`condition: ${axes.cleanliness}`);
    parts.push(`structure/fit: ${axes.structure_fit}`);
    parts.push(`layering: ${axes.layering}`);
    if (axes.ornament_detail && axes.ornament_detail !== 'none') {
      parts.push(`ornament: ${axes.ornament_detail}`);
    }
    if (axes.damage_wear && axes.damage_wear !== 'none') {
      parts.push(`wear/damage: ${axes.damage_wear}`);
    }
    parts.push(`social read: ${axes.social_readability}`);
  }

  // Apply remaining abstract state adjustments (non-garment descriptors)
  if (abstractFromState.length > 0) {
    parts.push(`costume state: ${abstractFromState.join(', ')}`);
  }
  // Apply abstract fabric descriptors as condition
  if (abstractFabricsFromState.length > 0) {
    parts.push(`fabric condition: ${abstractFabricsFromState.join(', ')}`);
  }
  if (state.silhouette_adjustments.length > 0) {
    parts.push(`silhouette adjustments: ${state.silhouette_adjustments.join(', ')}`);
  }

  return parts.join('. ');
}

/**
 * Resolve the effective garments/fabrics/accessories for a state,
 * following the canonical truth hierarchy. Used by both prompt builder and UI.
 */
/**
 * ResolvedStateWardrobe — Canonical resolved wardrobe for a single state.
 *
 * PRESENTATION CONTRACT (IEL):
 * - `displayGarments` = ONLY array permitted for garment chip rendering in UI
 * - `displayFabrics`  = ONLY array permitted for fabric chip rendering in UI
 * - `garmentSources` / `fabricSources` = provenance/diagnostics only, NEVER chip source
 * - raw `state.garment_adjustments` = extraction layer only, NEVER direct UI chip source
 *
 * All fields are post-sanitization (decoration stripped) and post-temporal-exclusion.
 * `garments` and `displayGarments` are identical by design — `garments` exists for
 * backward compat but new code MUST prefer `displayGarments`.
 */
export interface ResolvedStateWardrobe {
  /** @deprecated Use displayGarments for all rendering. Kept for backward compat. */
  garments: string[];
  /** @deprecated Use displayFabrics for all rendering. Kept for backward compat. */
  fabrics: string[];
  accessories: string[];
  /** CANONICAL: Only array allowed for garment chip rendering + prompt garment block */
  displayGarments: string[];
  /** CANONICAL: Only array allowed for fabric chip rendering + prompt fabric block */
  displayFabrics: string[];
  /** Provenance/diagnostics only — NOT for chip rendering */
  garmentSources: Array<{ item: string; source: 'scene' | 'profile' | 'inferred' }>;
  /** Provenance/diagnostics only — NOT for chip rendering */
  fabricSources: Array<{ item: string; source: 'scene' | 'profile' | 'inferred' }>;
  /** Items excluded by temporal truth — diagnostics surface only */
  exclusions: Array<{ item: string; reason: string; detail: string }>;
  isSceneDerived: boolean;
  sceneKeys: string[];
  /** State category used for reconstruction */
  stateCategory: StateCategory;
  /** Whether state-semantic reconstruction was used (vs pure profile residue) */
  usedStateReconstruction: boolean;
  /** Whether effective-profile garments were carried forward as safety net */
  usedProfileCarryForward: boolean;
  /** Degradation diagnostic if resolution quality is poor */
  degradationDiagnostic: string;
  /** What intelligence sources drove the state result */
  intelligenceSources: IntelligenceSource[];
  /** Whether the result is primarily era-fallback vs character-specific */
  isPrimarilyFallback: boolean;
  /** Detailed intelligence diagnostic */
  intelligenceDiagnostic: string;
  /** 8-axis transformation modifiers — identity + state grounded */
  transformationAxes: TransformationAxes;
  /** Resolved baseline wardrobe (canon-first) — diagnostics + fingerprint */
  baseline?: BaselineWardrobe;
}

export function resolveStateWardrobe(
  rawProfile: CharacterWardrobeProfile,
  state: WardrobeStateDefinition,
  temporalTruth?: TemporalTruth | null,
  canonInputs?: CanonWardrobeInputs,
): ResolvedStateWardrobe {
  // ── Resolve canon-first baseline wardrobe ──
  const baseline = resolveBaselineWardrobe(rawProfile, canonInputs, temporalTruth);

  // ── Resolve effective profile at entry so all reads are clean ──
  const stateGarmentTokens = dedupeDisplayItems(state.garment_adjustments);
  const concreteFromState = stateGarmentTokens.filter(isConcreteGarment);
  // Pass scene garments for provenance tracking (NOT for bypass)
  const profile = resolveEffectiveProfile(rawProfile, temporalTruth, concreteFromState);
  const concreteFabricsFromState = dedupeDisplayItems(state.fabric_adjustments).filter(isConcreteFabric);

  // ── Apply temporal exclusion to scene garments too ──
  // Scene evidence does NOT bypass temporal truth. Filter concreteFromState.
  const sceneNormalized = normalizeWardrobe(
    { garments: concreteFromState, sceneExplicitGarments: concreteFromState },
    temporalTruth,
  );
  const allowedSceneGarments = new Set(sceneNormalized.garments.map(g => g.toLowerCase()));
  const sceneExclusions = sceneNormalized.exclusions;

  const garmentSources: ResolvedStateWardrobe['garmentSources'] = [];
  const fabricSources: ResolvedStateWardrobe['fabricSources'] = [];

  // ── Classify state category for semantic reconstruction ──
  const stateCategory = classifyStateCategory(state);

  // Merge exclusions from profile + scene (needed before reconstruction check)
  const allExclusions = [
    ...(profile.excluded_garments || []),
    ...sceneExclusions,
  ];

  // Build garment list with source tracking
  // Scene garments first (highest priority), then baseline garments
  const garments: string[] = [];
  for (const g of concreteFromState) {
    if (allowedSceneGarments.has(g.toLowerCase())) {
      garments.push(g);
      garmentSources.push({ item: g, source: 'scene' });
    }
  }

  // Use baseline garments instead of raw profile signature_garments
  // This ensures canon-first precedence (script > character context > profile > era)
  // Apply temporal filtering to baseline garments before merging
  const hasSceneGarments = garmentSources.length > 0;
  if (!hasSceneGarments) {
    const baselineNormalized = normalizeWardrobe(
      { garments: baseline.baseGarments, sceneExplicitGarments: [] },
      temporalTruth,
    );
    for (const g of dedupeDisplayItems(baselineNormalized.garments)) {
      if (!garments.some(eg => eg.toLowerCase() === g.toLowerCase())) {
        garments.push(g);
        garmentSources.push({ item: g, source: baseline.baselineSource === 'script' ? 'scene' : 'profile' });
      }
    }
    // Track baseline exclusions
    allExclusions.push(...baselineNormalized.exclusions);
  } else {
    // Scene garments present — still merge profile signature garments as fallback
    for (const g of dedupeDisplayItems(profile.signature_garments)) {
      if (!garments.some(eg => eg.toLowerCase() === g.toLowerCase())) {
        garments.push(g);
        garmentSources.push({ item: g, source: profile.source_doc_types.includes('scene_reinforcement') ? 'scene' : 'profile' });
      }
    }
  }

  // ── State-semantic reconstruction ──
  let usedStateReconstruction = false;
  let degradationDiagnostic = '';
  let intelligenceSources: IntelligenceSource[] = [];
  let isPrimarilyFallback = false;
  let intelligenceDiagnostic = '';

  const hasSceneGarmentsPost = garmentSources.some(s => s.source === 'scene');
  const profileResidueOnly = garments.length > 0 && !hasSceneGarmentsPost && allExclusions.length > 0;
  const garmentsSparse = garments.length <= 1;
  const baselineCarryThrough = garments.length > 0 && !hasSceneGarmentsPost && allExclusions.length === 0 && !!temporalTruth;

  if ((garmentsSparse || profileResidueOnly || baselineCarryThrough) && stateCategory !== 'default') {
    const reconstruction = reconstructStateGarments(rawProfile, state, temporalTruth);
    intelligenceSources = reconstruction.intelligenceSources;
    isPrimarilyFallback = reconstruction.isPrimarilyFallback;
    intelligenceDiagnostic = reconstruction.intelligenceDiagnostic;

    if (reconstruction.isStateSpecific && reconstruction.garments.length > 0) {
      const sceneGarments = garments.filter((_, i) => garmentSources[i]?.source === 'scene');
      const sceneGarmentSources = garmentSources.filter(s => s.source === 'scene');

      garments.length = 0;
      garmentSources.length = 0;
      for (let i = 0; i < sceneGarments.length; i++) {
        garments.push(sceneGarments[i]);
        garmentSources.push(sceneGarmentSources[i]);
      }

      for (const rg of reconstruction.garments) {
        if (!garments.some(eg => eg.toLowerCase() === rg.toLowerCase())) {
          garments.push(rg);
          garmentSources.push({ item: rg, source: 'inferred' });
        }
      }
      usedStateReconstruction = true;
    }
  } else if (!hasSceneGarmentsPost && garments.length > 0) {
    intelligenceSources = ['profile_identity_summary' as IntelligenceSource];
    isPrimarilyFallback = false;
    intelligenceDiagnostic = 'State wardrobe from baseline/profile garments (no temporal exclusion triggered reconstruction).';
  }

  if (garments.length <= 1 && allExclusions.length > 0) {
    degradationDiagnostic = 'State-specific wardrobe collapsed after era filtering. Fallback derived from profile residue only. Needs stronger upstream wardrobe truth.';
    isPrimarilyFallback = true;
  }

  // Build fabric list: use baseline fabrics as enrichment source
  const fabrics: string[] = [];
  for (const f of concreteFabricsFromState) {
    fabrics.push(f);
    fabricSources.push({ item: f, source: 'scene' });
  }
  // Baseline fabrics first (canon-first), then profile fabric_language fallback
  const baselineFabricSource = baseline.baseFabrics.length > 0 ? baseline.baseFabrics : [];
  const profileFabricSource = profile.fabric_language
    ? profile.fabric_language.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const fabricPool = baselineFabricSource.length > 0 ? baselineFabricSource : profileFabricSource;
  for (const f of dedupeDisplayItems(fabricPool)) {
    if (!fabrics.some(ef => ef.toLowerCase() === f.toLowerCase())) {
      fabrics.push(f);
      fabricSources.push({ item: f, source: 'profile' });
    }
  }

  // Accessories
  const accessories = [...profile.signature_accessories];

  // Scene keys from trigger conditions
  const sceneKeys = (state.trigger_conditions || [])
    .filter(t => t.startsWith('scene:'))
    .map(t => t.replace('scene:', ''));

  const isSceneDerived = state.explicit_or_inferred === 'explicit'
    && sceneKeys.length > 0;

  let displayGarments = dedupeDisplayItems(garments);
  const displayFabrics = dedupeDisplayItems(fabrics);

  // ── INVARIANT: Effective-profile carry-forward safety net ──
  // If all filtering/reconstruction left us with zero garments but the
  // effective profile still has canonical garments, carry them forward.
  // This prevents the "baseline has garments / package blocked" split-brain.
  let usedProfileCarryForward = false;
  if (displayGarments.length === 0 && profile.effective_signature_garments.length > 0) {
    for (const g of profile.effective_signature_garments) {
      if (!displayGarments.some(eg => eg.toLowerCase() === g.toLowerCase())) {
        displayGarments.push(g);
        garmentSources.push({ item: g, source: 'profile' });
      }
    }
    displayGarments = dedupeDisplayItems(displayGarments);
    usedProfileCarryForward = true;
    isPrimarilyFallback = true;
    if (!degradationDiagnostic) {
      degradationDiagnostic = 'Garments carried forward from effective profile after baseline/state resolution produced no results.';
    }
  }

  if (!import.meta.env.PROD) {
    assertNoForbiddenDisplayGarments(displayGarments, temporalTruth);
  }

  // ── Resolve transformation axes (always, even without reconstruction) ──
  const transformationAxes = resolveTransformationAxes(rawProfile, stateCategory);

  return {
    garments: displayGarments,
    fabrics: displayFabrics,
    accessories,
    displayGarments,
    displayFabrics,
    garmentSources,
    fabricSources,
    exclusions: allExclusions,
    isSceneDerived,
    sceneKeys,
    stateCategory,
    usedStateReconstruction,
    usedProfileCarryForward,
    degradationDiagnostic,
    intelligenceSources,
    isPrimarilyFallback,
    intelligenceDiagnostic,
    transformationAxes,
    baseline,
  };
}

// ── Package Strength + Slot Readiness Types ─────────────────────────────────

export type WardrobePackageStrength = 'strong' | 'usable' | 'weak' | 'blocked';
export type SlotReadiness = 'ready' | 'soft_ready' | 'blocked';

export interface StateWardrobePackage extends ResolvedStateWardrobe {
  packageStrength: WardrobePackageStrength;
  failureReasons: string[];
  slotReadiness: Record<string, SlotReadiness>;
  slotBlockedReasons: Record<string, string>;
  sourceSummary: string[];
}

export interface CostumeSlotBrief {
  slotKey: string;
  contentBlocks: string[];
  exclusions: string[];
  requiresIdentityLock: boolean;
  generatable: boolean;
  blockReason: string;
  focusType: 'full_wardrobe' | 'upper_body' | 'silhouette' | 'texture_material' | 'closure_fastening' | 'accessory_focus' | 'grooming_focus';
}

// ── Closure-bearing garment detection ──────────────────────────────────────

const CLOSURE_BEARING_RE = /\b(jacket|coat|vest|corset|doublet|blazer|cardigan|bodice|cloak|cape|robe|kimono|haori|shirt|blouse|tunic|dress|gown|uniform|suit|hoodie|sweater)\b/i;

function hasClosureBearingGarments(garments: string[]): boolean {
  return garments.some(g => CLOSURE_BEARING_RE.test(g));
}

// ── Package Resolver ────────────────────────────────────────────────────────

/**
 * Canonical state wardrobe package — single source of truth for panel, generation, and blockers.
 * Wraps resolveStateWardrobe() and extends with strength grading + slot readiness.
 */
export function resolveStateWardrobePackage(
  rawProfile: CharacterWardrobeProfile,
  state: WardrobeStateDefinition,
  temporalTruth?: TemporalTruth | null,
  canonInputs?: CanonWardrobeInputs,
): StateWardrobePackage {
  const resolved = resolveStateWardrobe(rawProfile, state, temporalTruth, canonInputs);

  const failureReasons: string[] = [];
  const sourceSummary: string[] = [];

  // Source summary
  if (resolved.isSceneDerived) sourceSummary.push('scene-derived');
  if (resolved.baseline?.baselineSource === 'script') sourceSummary.push('script-led');
  else if (resolved.baseline?.baselineSource === 'canon_character') sourceSummary.push('canon-input-derived');
  else if (resolved.baseline?.baselineSource === 'profile') sourceSummary.push('profile-derived');
  else if (resolved.baseline?.baselineSource === 'era_fallback') sourceSummary.push('era-fallback');
  if (resolved.usedStateReconstruction) sourceSummary.push('state-reconstructed');
  if (resolved.isPrimarilyFallback) sourceSummary.push('fallback-heavy');
  if (resolved.exclusions.length > 0) sourceSummary.push('era-filtered');

  // Assess truth richness
  const hasGarments = resolved.displayGarments.length >= 1;
  const hasFabrics = resolved.displayFabrics.length >= 1 || !!(rawProfile.fabric_language && rawProfile.fabric_language.trim());
  const hasAccessories = rawProfile.signature_accessories.length >= 1 || state.accessory_adjustments.length >= 1;
  const hasGrooming = !!(rawProfile.grooming_compatibility && rawProfile.grooming_compatibility.trim()) || state.grooming_adjustments.length >= 1;
  const hasClosures = hasClosureBearingGarments(resolved.displayGarments);
  const hasSilhouette = !!(rawProfile.silhouette_language && rawProfile.silhouette_language.trim()) || hasGarments;

  // Package strength — explicit blocker reasons required
  let packageStrength: WardrobePackageStrength;
  if (!hasGarments) {
    packageStrength = 'blocked';
    // Explicit reason: explain WHY garments are empty
    if (resolved.exclusions.length > 0) {
      const excludedItems = resolved.exclusions.map(e => e.item || e.detail).join(', ');
      failureReasons.push(`All garments invalidated by temporal/era exclusions: ${excludedItems}`);
    } else {
      failureReasons.push('No garments found in profile, script, canon, or era vocabulary for this state');
    }
  } else if (resolved.isPrimarilyFallback && resolved.displayGarments.length <= 1) {
    packageStrength = 'weak';
    failureReasons.push('Primarily fallback with minimal garment truth');
  } else if (resolved.isPrimarilyFallback) {
    packageStrength = 'weak';
    failureReasons.push('Wardrobe is primarily era-fallback, not character-specific');
  } else if (!hasFabrics && !hasAccessories && !hasGrooming) {
    packageStrength = 'usable';
    failureReasons.push('Missing fabric, accessory, and grooming detail');
  } else if (resolved.degradationDiagnostic) {
    packageStrength = 'usable';
    failureReasons.push(resolved.degradationDiagnostic);
  } else {
    packageStrength = 'strong';
  }

  // Slot readiness
  const slotReadiness: Record<string, SlotReadiness> = {};
  const slotBlockedReasons: Record<string, string> = {};

  for (const slotDef of COSTUME_LOOK_SLOTS) {
    const k = slotDef.key;
    if (packageStrength === 'blocked') {
      slotReadiness[k] = 'blocked';
      slotBlockedReasons[k] = failureReasons[0] || 'No garment truth available for this state';
      continue;
    }
    switch (k) {
      case 'full_body_primary':
      case 'three_quarter':
        slotReadiness[k] = hasGarments ? 'ready' : 'blocked';
        if (!hasGarments) slotBlockedReasons[k] = 'No garments available';
        break;
      case 'front_silhouette':
      case 'back_silhouette':
        slotReadiness[k] = hasSilhouette ? 'ready' : 'soft_ready';
        if (!hasSilhouette) slotBlockedReasons[k] = 'No silhouette data available';
        break;
      case 'fabric_detail':
        if (hasFabrics) slotReadiness[k] = 'ready';
        else { slotReadiness[k] = 'blocked'; slotBlockedReasons[k] = 'No fabric or material truth available'; }
        break;
      case 'closure_detail':
        if (hasClosures) slotReadiness[k] = 'ready';
        else { slotReadiness[k] = 'blocked'; slotBlockedReasons[k] = 'No closure-bearing garments identified'; }
        break;
      case 'accessory_detail':
        if (hasAccessories) slotReadiness[k] = 'ready';
        else { slotReadiness[k] = 'blocked'; slotBlockedReasons[k] = 'No accessory truth available'; }
        break;
      case 'hair_grooming':
        if (hasGrooming) slotReadiness[k] = 'ready';
        else { slotReadiness[k] = 'blocked'; slotBlockedReasons[k] = 'No grooming or hair truth available'; }
        break;
      default:
        slotReadiness[k] = hasGarments ? 'soft_ready' : 'blocked';
        if (!hasGarments) slotBlockedReasons[k] = 'No garments available';
    }
  }

  return {
    ...resolved,
    packageStrength,
    failureReasons,
    slotReadiness,
    slotBlockedReasons,
    sourceSummary,
  };
}

// ── Slot Brief Builder ──────────────────────────────────────────────────────

/**
 * Deterministic slot-specific brief from the canonical package.
 * Each slot gets materially different content — NOT the same garment block.
 */
export function buildCostumeSlotBrief(
  pkg: StateWardrobePackage,
  slotKey: string,
  profile: CharacterWardrobeProfile,
  state: WardrobeStateDefinition,
): CostumeSlotBrief {
  const readiness = pkg.slotReadiness[slotKey] || 'blocked';
  const blockReason = pkg.slotBlockedReasons[slotKey] || '';

  if (readiness === 'blocked') {
    return {
      slotKey,
      contentBlocks: [],
      exclusions: [],
      requiresIdentityLock: false,
      generatable: false,
      blockReason,
      focusType: 'full_wardrobe',
    };
  }

  const contentBlocks: string[] = [];
  const exclusions: string[] = pkg.exclusions.map(e => e.item);
  let requiresIdentityLock = true;
  let focusType: CostumeSlotBrief['focusType'] = 'full_wardrobe';

  const axes = pkg.transformationAxes;

  switch (slotKey) {
    case 'full_body_primary': {
      focusType = 'full_wardrobe';
      contentBlocks.push(`wearing ${pkg.displayGarments.join(', ')}`);
      if (pkg.displayFabrics.length > 0) contentBlocks.push(`made of ${pkg.displayFabrics.join(', ')}`);
      if (profile.silhouette_language) contentBlocks.push(profile.silhouette_language);
      if (axes) {
        contentBlocks.push(`silhouette: ${axes.silhouette}`, `material finish: ${axes.material_finish}`, `condition: ${axes.cleanliness}`, `structure/fit: ${axes.structure_fit}`, `layering: ${axes.layering}`);
        if (axes.ornament_detail !== 'none') contentBlocks.push(`ornament: ${axes.ornament_detail}`);
        if (axes.damage_wear !== 'none') contentBlocks.push(`wear/damage: ${axes.damage_wear}`);
        contentBlocks.push(`social read: ${axes.social_readability}`);
      }
      const accBlock = buildAccessoryBlock(profile, state);
      if (accBlock) contentBlocks.push(accBlock);
      const groomBlock = buildGroomingBlock(profile, state);
      if (groomBlock) contentBlocks.push(groomBlock);
      break;
    }
    case 'three_quarter': {
      focusType = 'upper_body';
      contentBlocks.push(`wearing ${pkg.displayGarments.join(', ')}`);
      if (pkg.displayFabrics.length > 0) contentBlocks.push(`made of ${pkg.displayFabrics.join(', ')}`);
      if (axes) {
        contentBlocks.push(`silhouette: ${axes.silhouette}`, `material finish: ${axes.material_finish}`, `structure/fit: ${axes.structure_fit}`, `layering: ${axes.layering}`);
        contentBlocks.push(`social read: ${axes.social_readability}`);
      }
      const accBlock = buildAccessoryBlock(profile, state);
      if (accBlock) contentBlocks.push(accBlock);
      break;
    }
    case 'front_silhouette':
    case 'back_silhouette': {
      focusType = 'silhouette';
      contentBlocks.push(`costume silhouette showing: ${pkg.displayGarments.join(', ')}`);
      if (profile.silhouette_language) contentBlocks.push(`silhouette character: ${profile.silhouette_language}`);
      if (axes) {
        contentBlocks.push(`silhouette: ${axes.silhouette}`, `layering: ${axes.layering}`, `structure/fit: ${axes.structure_fit}`);
      }
      break;
    }
    case 'fabric_detail': {
      focusType = 'texture_material';
      requiresIdentityLock = false;
      const fabricList = pkg.displayFabrics.length > 0 ? pkg.displayFabrics : (profile.fabric_language ? [profile.fabric_language] : []);
      contentBlocks.push(`fabric and material detail: ${fabricList.join(', ')}`);
      if (axes) {
        contentBlocks.push(`material finish: ${axes.material_finish}`, `condition: ${axes.cleanliness}`);
        if (axes.damage_wear !== 'none') contentBlocks.push(`wear/damage: ${axes.damage_wear}`);
      }
      contentBlocks.push('extreme close-up of fabric weave, texture, material quality, thread detail');
      break;
    }
    case 'closure_detail': {
      focusType = 'closure_fastening';
      requiresIdentityLock = false;
      const closureGarments = pkg.displayGarments.filter(g => CLOSURE_BEARING_RE.test(g));
      contentBlocks.push(`closure and fastening detail on: ${closureGarments.join(', ')}`);
      contentBlocks.push('close-up of buttons, clasps, ties, lacing, zippers, seams, fastenings');
      if (axes) {
        contentBlocks.push(`structure/fit: ${axes.structure_fit}`);
        if (axes.ornament_detail !== 'none') contentBlocks.push(`ornament: ${axes.ornament_detail}`);
      }
      break;
    }
    case 'accessory_detail': {
      focusType = 'accessory_focus';
      requiresIdentityLock = false;
      const accItems = [...profile.signature_accessories, ...state.accessory_adjustments].filter(Boolean);
      contentBlocks.push(`accessory detail: ${accItems.join(', ')}`);
      contentBlocks.push('close-up of accessories, jewelry, worn items, handheld objects');
      break;
    }
    case 'hair_grooming': {
      focusType = 'grooming_focus';
      requiresIdentityLock = false;
      const groomParts: string[] = [];
      if (profile.grooming_compatibility) groomParts.push(profile.grooming_compatibility);
      if (state.grooming_adjustments.length > 0) groomParts.push(...state.grooming_adjustments);
      contentBlocks.push(`hair and grooming detail: ${groomParts.join(', ')}`);
      contentBlocks.push('close-up of hairstyle, hair texture, facial hair, grooming finish');
      break;
    }
  }

  return {
    slotKey,
    contentBlocks,
    exclusions,
    requiresIdentityLock,
    generatable: true,
    blockReason: '',
    focusType,
  };
}

function buildAccessoryBlock(profile: CharacterWardrobeProfile, state: WardrobeStateDefinition): string {
  const accessories = profile.signature_accessories.length > 0
    ? profile.signature_accessories.join(', ')
    : '';
  const stateAdj = state.accessory_adjustments.length > 0
    ? state.accessory_adjustments.join(', ')
    : '';
  if (!accessories && !stateAdj) return '';
  const parts: string[] = [];
  if (accessories) parts.push(`accessories: ${accessories}`);
  if (stateAdj) parts.push(`(${stateAdj})`);
  return parts.join(' ');
}

function buildGroomingBlock(profile: CharacterWardrobeProfile, state: WardrobeStateDefinition): string {
  const base = profile.grooming_compatibility || '';
  const stateAdj = state.grooming_adjustments.length > 0
    ? state.grooming_adjustments.join(', ')
    : '';
  if (!base && !stateAdj) return '';
  return `grooming: ${[base, stateAdj].filter(Boolean).join(', ')}`;
}

function buildSlotFraming(slotKey: string): string {
  switch (slotKey) {
    case 'full_body_primary': return 'full body shot, standing, neutral pose, costume clearly visible head to toe';
    case 'three_quarter': return 'three-quarter view, mid-body framing, costume details visible';
    case 'front_silhouette': return 'front-facing full body silhouette, costume outline and proportions';
    case 'back_silhouette': return 'rear view full body, back of costume visible, hair and accessories from behind';
    case 'fabric_detail': return 'close-up detail shot of fabric texture, weave, and material quality';
    case 'closure_detail': return 'close-up of costume closures, ties, clasps, or fastenings';
    case 'accessory_detail': return 'close-up of accessories, jewelry, or costume details';
    case 'hair_grooming': return 'close-up of hairstyle, hair accessories, and grooming details';
    default: return 'costume reference shot';
  }
}

/**
 * Build a deterministic prompt for a costume-on-actor look slot.
 * Now uses canonical StateWardrobePackage + CostumeSlotBrief for slot-specific content.
 * FAIL CLOSED: rejects unknown slot keys and non-generatable slots.
 */
export function buildCostumeLookPrompt(
  input: CostumeLookInput,
  slotKey: string,
): CostumeLookPromptResult {
  // INVARIANT: slot_key must be a valid costume prompt template key
  if (!isValidCostumeSlotKey(slotKey)) {
    throw new Error(`[CostumeOnActor] ROUTING ERROR: slot_key "${slotKey}" is not a valid costume prompt template. This prevents identity/casting prompt contamination.`);
  }

  const { wardrobeProfile: rawProfile, wardrobeState: state, worldRules } = input;
  const profile = resolveEffectiveProfile(rawProfile, input.temporalTruth);
  const slotDef = COSTUME_LOOK_SLOTS.find(s => s.key === slotKey) || COSTUME_LOOK_SLOTS[0];

  // Build canonical package + slot brief
  const pkg = resolveStateWardrobePackage(rawProfile, state, input.temporalTruth, input.canonWardrobeInputs || deriveCanonInputsFromProfile(rawProfile, input.temporalTruth));
  const brief = buildCostumeSlotBrief(pkg, slotKey, rawProfile, state);

  // FAIL CLOSED: do not generate for blocked slots
  if (!brief.generatable) {
    throw new Error(`[CostumeOnActor] SLOT BLOCKED: "${slotKey}" is not generatable. Reason: ${brief.blockReason}`);
  }

  const classExpr = profile.class_status_expression || '';
  const framing = buildSlotFraming(slotKey);

  const promptParts = [
    `${input.characterName}, ${classExpr}`,
    `${state.label} state`,
    // ── Slot-specific content from brief (NOT shared garment block) ──
    ...brief.contentBlocks,
    framing,
  ];

  // Identity lock conditional on slot type
  if (brief.requiresIdentityLock) {
    promptParts.push(
      `[IDENTITY LOCK — SAME PERFORMER]`,
      `This is the SAME person shown in the reference images. Do NOT change the performer.`,
      `Maintain identical: face structure, jawline, cheekbones, eye shape, nose, mouth, skin tone, body proportions, hair color and texture.`,
      `Only the COSTUME changes — the person wearing it must remain visually identical to the reference.`,
      `costume reference, character identity locked, same approved actor`,
    );
  } else {
    // Soft identity for detail shots
    promptParts.push(
      `[COSTUME DETAIL — same character wardrobe]`,
      `This detail belongs to the same character's costume. Maintain consistent wardrobe materials and style.`,
    );
  }

  promptParts.push(
    `cinematic lighting, production still quality`,
    `[prompt_template: costume_on_actor/${slotKey}]`,
  );

  // Palette logic
  if (profile.palette_logic) {
    promptParts.push(`color palette: ${profile.palette_logic}`);
  }

  // Visual Canon Enrichment (non-authoritative hints)
  const enrichment = input.wardrobeEnrichment;
  if (enrichment) {
    if (enrichment.material_hints.length > 0) {
      promptParts.push(`preferred materials: ${enrichment.material_hints.slice(0, 4).join(', ')}`);
    }
    if (enrichment.class_expression_hints.length > 0) {
      promptParts.push(`class expression: ${enrichment.class_expression_hints[0]}`);
    }
    if (enrichment.motif_hints.length > 0) {
      promptParts.push(`motif consistency: ${enrichment.motif_hints[0]}`);
    }
  }

  const prompt = promptParts.filter(Boolean).join('. ');

  // Negative prompt
  const negativeParts = [
    'fashion editorial', 'runway', 'catalog', 'modern clothing',
    'out of character', 'wrong period', 'anachronistic',
    'casting reference', 'identity reference sheet', 'character sheet',
  ];

  if (brief.requiresIdentityLock) {
    negativeParts.push(
      'different person', 'different face', 'different actor',
      'different age', 'different ethnicity', 'different skin tone',
      'different bone structure', 'different jaw', 'face swap',
      'recast', 'lookalike', 'alternate performer', 'generic person',
      'changed hairstyle', 'wrong hair color', 'body type change',
    );
  }

  if (worldRules?.require_physical_buildability) {
    negativeParts.push('magical clothing', 'impossible costume', 'floating garment');
  }
  if (profile.costume_constraints.length > 0) {
    for (const c of profile.costume_constraints) {
      if (c.toLowerCase().includes('no luxury')) negativeParts.push('luxury fabrics', 'silk', 'brocade');
    }
  }

  return {
    prompt,
    negative_prompt: negativeParts.join(', '),
    identity_mode: true,
    actor_id: input.actorId,
    actor_version_id: input.actorVersionId,
    character_key: input.characterKey,
    wardrobe_state_key: state.state_key,
    slot_key: slotKey,
    shot_type: slotDef.shot_type,
    domain: COSTUME_ON_ACTOR_DOMAIN,
    version: COSTUME_ON_ACTOR_VERSION,
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

const LOOK_PASS_THRESHOLD = 0.45;
const LOOK_SCORING_MODEL = 'costume_look_v1';

/**
 * Validate a costume-on-actor candidate image prompt.
 */
export function validateCostumeLookCandidate(
  promptText: string,
  slotKey: string,
  profile: CharacterWardrobeProfile,
  state: WardrobeStateDefinition,
  worldRules: WorldValidationRules | null,
): CostumeLookValidationResult {
  const text = promptText.toLowerCase();
  const fingerprint = deriveCostumeFingerprint(text);
  const hard_fail_codes: string[] = [];
  const advisory_codes: string[] = [];

  // 1. Garment specificity
  GARMENT_NOUN_PATTERN.lastIndex = 0;
  const hasGarment = GARMENT_NOUN_PATTERN.test(text);
  GARMENT_NOUN_PATTERN.lastIndex = 0;
  if (!hasGarment) hard_fail_codes.push('no_garment_noun');

  // 2. Fabric specificity
  FABRIC_NOUN_PATTERN.lastIndex = 0;
  const hasFabric = FABRIC_NOUN_PATTERN.test(text);
  FABRIC_NOUN_PATTERN.lastIndex = 0;
  if (!hasFabric) hard_fail_codes.push('no_fabric_noun');

  // 3. Identity lock check
  const hasIdentitySignal = /\b(identity|actor|character|locked|approved)\b/i.test(text);
  const identity_preserved = hasIdentitySignal;
  if (!identity_preserved) advisory_codes.push('weak_identity_signal');

   // 4. Garment match to profile — use effective garments when temporal truth is available.
  // IEL: Raw signature_garments may contain forbidden items. For validation purposes
  // we check against the effective profile garments (post-temporal-exclusion) when
  // temporal truth context is available via the input. Since validateCostumeLookCandidate
  // operates on generated prompt text and the prompt was built from effective garments,
  // matching against raw garments would cause false positives.
  // NOTE: This is a diagnostic/validation function — it does not drive display or export.
  // The raw read here is acceptable as INPUT_CONTRACT for matching generated output
  // against the profile used to generate it.
  const profileGarments = profile.signature_garments.map(g => g.toLowerCase());
  const garment_match = profileGarments.length === 0 || profileGarments.some(g => text.includes(g));
  if (!garment_match) advisory_codes.push('garment_profile_mismatch');

  // 5. State adjustments
  const stateSignals = [...state.garment_adjustments, ...state.fabric_adjustments].map(s => s.toLowerCase());
  const stateHits = stateSignals.filter(s => text.includes(s)).length;
  const state_adjustments_respected = stateSignals.length === 0 || stateHits > 0;
  if (!state_adjustments_respected) advisory_codes.push('state_adjustments_missing');

  // 6. Class coherence
  const classExpr = profile.class_status_expression.toLowerCase();
  const class_coherence = !classExpr || classExpr === 'unspecified' || text.includes(classExpr.split(' ')[0]);
  if (!class_coherence) advisory_codes.push('class_mismatch');

  // 7. No editorial drift
  const editorialPattern = /\b(runway|fashion\s*show|haute\s*couture|editorial|catalog|photoshoot|vogue)\b/i;
  const no_editorial_drift = !editorialPattern.test(text);
  if (!no_editorial_drift) hard_fail_codes.push('editorial_drift');

  // 8. Physical wearability
  const impossiblePattern = /\b(floating\s*garment|self.?weaving|enchanted\s*robe|magical\s*cloth|holographic)\b/i;
  const requireBuildability = worldRules?.require_physical_buildability ?? true;
  const hasImpossible = impossiblePattern.test(text);
  const physically_wearable = !requireBuildability || !hasImpossible;
  if (!physically_wearable) hard_fail_codes.push('impossible_costume');

  // 9. World mode
  const world_mode_respected = physically_wearable; // Covered by wearability in grounded; pass in fantastical

  // Score
  const scores = {
    garment: hasGarment ? 0.8 : 0,
    fabric: hasFabric ? 0.8 : 0,
    identity: identity_preserved ? 0.9 : 0.4,
    garment_match: garment_match ? 0.9 : 0.3,
    state_adj: state_adjustments_respected ? 0.8 : 0.3,
    class: class_coherence ? 0.8 : 0.4,
    editorial: no_editorial_drift ? 1.0 : 0.1,
    wearable: physically_wearable ? 0.9 : 0.1,
  };

  const overall_score =
    scores.garment * 0.15 +
    scores.fabric * 0.15 +
    scores.identity * 0.15 +
    scores.garment_match * 0.15 +
    scores.state_adj * 0.10 +
    scores.class * 0.10 +
    scores.editorial * 0.10 +
    scores.wearable * 0.10;

  const passed = hard_fail_codes.length === 0 && overall_score >= LOOK_PASS_THRESHOLD;

  return {
    passed,
    identity_preserved,
    garment_match,
    state_adjustments_respected,
    class_coherence,
    no_editorial_drift,
    world_mode_respected,
    physically_wearable,
    hard_fail_codes,
    advisory_codes,
    overall_score,
    fingerprint,
    scoring_model: LOOK_SCORING_MODEL,
    validation_version: COSTUME_ON_ACTOR_VERSION,
  };
}

// ── Diagnostics Serialization ───────────────────────────────────────────────

export function serializeCostumeLookDiagnostics(
  characterKey: string,
  actorId: string,
  wardrobeStateKey: string,
  slotKey: string,
  validation: CostumeLookValidationResult,
  selectionStatus: string,
): CostumeLookDiagnostics {
  return {
    character_key: characterKey,
    actor_id: actorId,
    wardrobe_state_key: wardrobeStateKey,
    slot_key: slotKey,
    validation,
    selection_status: selectionStatus,
    version: COSTUME_ON_ACTOR_VERSION,
  };
}

// ── Seam Helpers ────────────────────────────────────────────────────────────

/**
 * Get available wardrobe states for a character from extraction result.
 */
export function getAvailableWardrobeStatesForCharacter(
  stateMatrix: Record<string, WardrobeStateDefinition[]>,
  characterKey: string,
): WardrobeStateDefinition[] {
  const key = characterKey.toLowerCase().trim().replace(/\s+/g, ' ');
  return stateMatrix[key] || [];
}

/**
 * Build canonical prompt inputs for a character + state combination.
 */
export function getCanonicalCostumeLookPromptInputs(
  input: CostumeLookInput,
): CostumeLookPromptResult[] {
  return COSTUME_LOOK_SLOTS.map(slot =>
    buildCostumeLookPrompt(input, slot.key)
  );
}

/**
 * Get validation summary for a character + state across all slots.
 */
export function getCostumeLookValidationSummary(
  results: CostumeLookValidationResult[],
): {
  total_slots: number;
  passed_slots: number;
  failed_slots: number;
  all_passed: boolean;
  hard_fails: string[];
  advisories: string[];
  avg_score: number;
} {
  const passed = results.filter(r => r.passed).length;
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.overall_score, 0) / results.length
    : 0;
  return {
    total_slots: results.length,
    passed_slots: passed,
    failed_slots: results.length - passed,
    all_passed: passed === results.length,
    hard_fails: [...new Set(results.flatMap(r => r.hard_fail_codes))],
    advisories: [...new Set(results.flatMap(r => r.advisory_codes))],
    avg_score: Math.round(avgScore * 100) / 100,
  };
}
