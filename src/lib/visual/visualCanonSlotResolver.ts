/**
 * visualCanonSlotResolver.ts — Canonical missing visual canon slot resolver.
 *
 * Single source of truth for computing which visual canon slots are missing,
 * complete, or blocked. Used by Visual Canon Alignment display AND the
 * auto-complete orchestrator.
 *
 * Domains:
 *   - character_identity: primary character visual bound to canon entity
 *   - character_wardrobe: wardrobe *visual* (costume look) bound to character
 *   - production_design_location: PD visual bound to canon location
 *
 * IMPORTANT: Wardrobe profile/extraction existence is an eligibility signal,
 * NOT completion. A wardrobe slot is complete only when a wardrobe *visual*
 * asset is linked to the character.
 *
 * IEL: No duplicate coverage calculation. All consumers use this resolver.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type VisualCanonDomain =
  | 'character_identity'
  | 'character_wardrobe'
  | 'production_design_location';

export type SlotStatus = 'complete' | 'missing' | 'blocked';

export interface VisualCanonSlot {
  domain: VisualCanonDomain;
  entityKey: string;
  entityLabel: string;
  status: SlotStatus;
  /** Why blocked, if status is 'blocked' */
  blocker: string | null;
  /** Whether generation can be triggered now */
  eligible: boolean;
}

export interface VisualCanonCoverage {
  slots: VisualCanonSlot[];
  totalSlots: number;
  completeSlots: number;
  missingSlots: number;
  blockedSlots: number;
  byDomain: Record<VisualCanonDomain, {
    total: number;
    complete: number;
    missing: number;
    blocked: number;
  }>;
}

// ── Input shape (DB-agnostic for testability) ────────────────────────────────

export interface CanonCharacter {
  key: string;
  name: string;
}

export interface CanonLocation {
  id: string;
  name: string;
}

export interface SlotResolverInputs {
  /** Canon characters from project_canon */
  characters: CanonCharacter[];
  /** Canon locations from canon_locations */
  locations: CanonLocation[];
  /** Character keys that have a primary active identity image */
  characterIdentityLinked: Set<string>;
  /**
   * Character keys that have a linked wardrobe *visual* asset
   * (e.g. costume look visual set with approved/active imagery).
   * NOT wardrobe profile text — actual visual coverage.
   */
  characterWardrobeVisualLinked: Set<string>;
  /**
   * Character keys that have wardrobe truth available
   * (extraction ran + profile exists). Used as eligibility signal only.
   */
  characterWardrobeTruthAvailable: Set<string>;
  /** Location IDs that have linked PD visuals */
  locationPDLinked: Set<string>;
  /** Character keys that have a cast binding (actor assigned) */
  castBound: Set<string>;
  /** Whether wardrobe extraction has been run at all */
  wardrobeExtractionExists: boolean;
}

// ── Core Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve all visual canon slots deterministically.
 * Pure function — no DB calls. Fed by hook or test fixture.
 */
export function resolveVisualCanonSlots(inputs: SlotResolverInputs): VisualCanonCoverage {
  const slots: VisualCanonSlot[] = [];

  // ── Character Identity Slots ──
  for (const char of inputs.characters) {
    const key = char.key.toLowerCase();
    const linked = inputs.characterIdentityLinked.has(key);
    const hasCast = inputs.castBound.has(key);

    if (linked) {
      slots.push({
        domain: 'character_identity',
        entityKey: key,
        entityLabel: char.name,
        status: 'complete',
        blocker: null,
        eligible: false,
      });
    } else if (!hasCast) {
      slots.push({
        domain: 'character_identity',
        entityKey: key,
        entityLabel: char.name,
        status: 'blocked',
        blocker: 'No cast binding — assign an actor first',
        eligible: false,
      });
    } else {
      slots.push({
        domain: 'character_identity',
        entityKey: key,
        entityLabel: char.name,
        status: 'missing',
        blocker: null,
        eligible: true,
      });
    }
  }

  // ── Character Wardrobe Visual Slots ──
  for (const char of inputs.characters) {
    const key = char.key.toLowerCase();
    const hasVisual = inputs.characterWardrobeVisualLinked.has(key);
    const hasTruth = inputs.characterWardrobeTruthAvailable.has(key);
    const hasIdentity = inputs.characterIdentityLinked.has(key);

    if (hasVisual) {
      slots.push({
        domain: 'character_wardrobe',
        entityKey: key,
        entityLabel: char.name,
        status: 'complete',
        blocker: null,
        eligible: false,
      });
    } else if (!inputs.wardrobeExtractionExists) {
      slots.push({
        domain: 'character_wardrobe',
        entityKey: key,
        entityLabel: char.name,
        status: 'blocked',
        blocker: 'Wardrobe extraction not yet run',
        eligible: false,
      });
    } else if (!hasTruth) {
      slots.push({
        domain: 'character_wardrobe',
        entityKey: key,
        entityLabel: char.name,
        status: 'blocked',
        blocker: 'No wardrobe truth extracted for this character',
        eligible: false,
      });
    } else if (!hasIdentity) {
      slots.push({
        domain: 'character_wardrobe',
        entityKey: key,
        entityLabel: char.name,
        status: 'blocked',
        blocker: 'Identity visual missing — complete identity first',
        eligible: false,
      });
    } else {
      slots.push({
        domain: 'character_wardrobe',
        entityKey: key,
        entityLabel: char.name,
        status: 'missing',
        blocker: null,
        eligible: true,
      });
    }
  }

  // ── Location PD Slots ──
  for (const loc of inputs.locations) {
    const linked = inputs.locationPDLinked.has(loc.id);

    if (linked) {
      slots.push({
        domain: 'production_design_location',
        entityKey: loc.id,
        entityLabel: loc.name,
        status: 'complete',
        blocker: null,
        eligible: false,
      });
    } else {
      slots.push({
        domain: 'production_design_location',
        entityKey: loc.id,
        entityLabel: loc.name,
        status: 'missing',
        blocker: null,
        eligible: true,
      });
    }
  }

  // ── Aggregate ──
  const domains: VisualCanonDomain[] = ['character_identity', 'character_wardrobe', 'production_design_location'];
  const byDomain = {} as VisualCanonCoverage['byDomain'];
  for (const d of domains) {
    const domainSlots = slots.filter(s => s.domain === d);
    byDomain[d] = {
      total: domainSlots.length,
      complete: domainSlots.filter(s => s.status === 'complete').length,
      missing: domainSlots.filter(s => s.status === 'missing').length,
      blocked: domainSlots.filter(s => s.status === 'blocked').length,
    };
  }

  return {
    slots,
    totalSlots: slots.length,
    completeSlots: slots.filter(s => s.status === 'complete').length,
    missingSlots: slots.filter(s => s.status === 'missing').length,
    blockedSlots: slots.filter(s => s.status === 'blocked').length,
    byDomain,
  };
}

/**
 * Get missing slots in canonical dependency order for orchestration.
 * Order: character_identity → character_wardrobe → production_design_location
 */
export function getMissingSlotsByDependencyOrder(coverage: VisualCanonCoverage): VisualCanonSlot[] {
  const domainOrder: VisualCanonDomain[] = [
    'character_identity',
    'character_wardrobe',
    'production_design_location',
  ];
  return domainOrder.flatMap(d =>
    coverage.slots.filter(s => s.domain === d && s.status === 'missing' && s.eligible)
  );
}

/**
 * Domain display labels.
 */
export const DOMAIN_LABELS: Record<VisualCanonDomain, string> = {
  character_identity: 'Character Identity',
  character_wardrobe: 'Character Wardrobe',
  production_design_location: 'Location / Production Design',
};
