/**
 * pressureTypes.ts — Category-to-Pressure Type Lookup Table
 *
 * Maps IFFY's existing note categories to the pressure dimensions they express.
 * This is a compile-time lookup, not a runtime scoring system.
 * No behavior change. No convergence authority. No new scoring.
 *
 * Phase: Scoring Semantics Phase 2 — Pressure Taxonomy Audit
 * Classification: A — compile-time lookup. Zero risk.
 */

export type PressureType =
  | "clarity"
  | "propulsion"
  | "atmosphere"
  | "contradiction"
  | "structural"
  | "emotional"
  | "commercial"
  | "convergence";

export interface PressureMapping {
  /** The primary pressure dimension this note category represents */
  primary: PressureType;
  /** A secondary pressure dimension, if applicable */
  secondary?: PressureType;
  /** The pressure dimension most at risk if this note is acted upon */
  risk?: PressureType;
  /** Human-readable description of the tradeoff */
  description: string;
}

/**
 * Lookup table mapping IFFY note categories to pressure dimensions.
 * Every existing category maps to at least one pressure type.
 * The "risk" field identifies which narrative dimension is most
 * likely to be compressed if the note is acted upon.
 */
export const CATEGORY_TO_PRESSURE: Record<string, PressureMapping> = {
  structural: {
    primary: "structural",
    secondary: "emotional",
    description: "Structural pressure: demands completeness, format conformance, or architectural clarity.",
  },
  character: {
    primary: "emotional",
    secondary: "clarity",
    risk: "atmosphere",
    description: "Emotional/clarity pressure: demands articulated interiority. May compress withheld emotion, subtext, or performative ambiguity.",
  },
  escalation: {
    primary: "propulsion",
    secondary: "structural",
    description: "Propulsion pressure: demands rising stakes, tension progression, or dramatic buildup.",
  },
  pacing: {
    primary: "propulsion",
    risk: "atmosphere",
    description: "Propulsion pressure: demands faster tempo. Risk: may compress atmospheric holding time, stillness, or tonal breathing.",
  },
  hook: {
    primary: "commercial",
    secondary: "propulsion",
    description: "Commercial/propulsion pressure: demands audience capture at opening.",
  },
  cliffhanger: {
    primary: "propulsion",
    secondary: "structural",
    description: "Propulsion pressure: demands episode-ending tension.",
  },
  lane: {
    primary: "commercial",
    secondary: "structural",
    description: "Commercial pressure: demands format fit, genre alignment, or audience expectation conformance.",
  },
  packaging: {
    primary: "commercial",
    description: "Commercial pressure: demands market positioning, castability, or project attractiveness.",
  },
  risk: {
    primary: "commercial",
    secondary: "structural",
    description: "Commercial/structural pressure: demands reduction of production or creative uncertainty.",
  },
  spine_alignment: {
    primary: "structural",
    secondary: "emotional",
    description: "Structural/coherence pressure: demands narrative spine conformity.",
  },
  spine_drift: {
    primary: "structural",
    secondary: "emotional",
    description: "Structural/coherence pressure: demands correction of spine deviation.",
  },
};

/**
 * Returns the pressure mapping for a note category.
 * Returns a neutral default for unknown categories rather than throwing.
 */
export function getPressureMapping(category: string): PressureMapping {
  return (
    CATEGORY_TO_PRESSURE[category] ?? {
      primary: "structural",
      description: "Unknown pressure type. Treating as structural pressure by default.",
    }
  );
}

/**
 * Given a pressure mapping, produces a human-readable tradeoff summary
 * suitable for UI display in the format:
 * "Acting on this improves [primary] but may compress [risk]."
 */
export function describeTradeoff(mapping: PressureMapping): string {
  const gain = mapping.primary;
  if (!mapping.risk) {
    return `Acting on this applies ${gain} pressure.`;
  }
  return `Acting on this improves ${gain} but may compress ${mapping.risk}.`;
}