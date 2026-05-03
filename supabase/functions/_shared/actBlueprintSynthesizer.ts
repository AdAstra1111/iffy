/**
 * actBlueprintSynthesizer.ts
 *
 * Builds Act Blueprint objects for the per-act Treatment rewrite pipeline.
 * 100% deterministic — no LLM calls. Assembles from:
 *   - Act function descriptions (deliverableSectionRegistry)
 *   - Canon constraints (canon_json from project_canon)
 *   - Approved notes targeting this act
 *   - Prior arc-state deltas (from previous acts in this rewrite pass)
 *
 * Used by: dev-engine-v2/index.ts (TREATMENT_REWRITE action)
 */

import { findSectionDef } from "./deliverableSectionRegistry.ts";

// ── Types ──────────────────────────────────────────────────────────────────

/** Arc-state delta produced at each act completion. */
export interface ArcStateDeltas {
  character_states: Record<string, {
    current_desire: string;
    current_fear: string;
    emotional_state: string;
    relationship_states: Record<string, string>;
  }>;
  pending_arcs: Array<{
    character: string;
    arc_description: string;
    tension_level: "low" | "medium" | "high";
  }>;
  unresolved_tensions: Array<{
    tension: string;
    introduced_in_act: number;
    escalation_level: "building" | "near_crisis" | "at_crisis";
  }>;
}

/** Structured preamble passed to each act's rewrite prompt. */
export interface PrecedingContext {
  /** Plaintext content of prior acts in order. */
  priorActsContent: Array<{ actKey: string; label: string; content: string }>;
  /** Arc-state deltas from each prior act. */
  arcStateDeltas: Array<{ actKey: string; actNumber: number; delta: ArcStateDeltas }>;
  /** A short structured summary rendered as prompt text. */
  summaryBlock: string;
}

/** The full Act Blueprint passed to each act rewrite call. */
export interface ActBlueprint {
  actKey: string;
  actNumber: number;
  label: string;
  /** From deliverableSectionRegistry act_function_description. */
  functionDescription: string;
  /** Canonical constraints derived from project canon and concept brief. */
  canonConstraints: string[];
  /** Notes targeting this act (act_target === actKey or act_target === undefined). */
  targetingNotes: string[];
  /** Context from prior acts (null for Act 1). */
  precedingContext: PrecedingContext | null;
}

// ── Canon constraint extractor ──────────────────────────────────────────────

/**
 * Extract canon constraints relevant to a given act.
 * Reads from canon_json (project_canon table) and concept brief text.
 */
export function extractCanonConstraintsForAct(
  actKey: string,
  canonJson: Record<string, any> | null,
): string[] {
  const constraints: string[] = [];
  if (!canonJson) return constraints;

  // Protagonist is always a constraint for every act.
  if (canonJson.protagonist && typeof canonJson.protagonist === "string" && canonJson.protagonist.trim()) {
    constraints.push(`Protagonist: ${canonJson.protagonist.trim()}`);
  }

  // Characters array — always include protagonist + antagonist.
  if (Array.isArray(canonJson.characters)) {
    for (const c of canonJson.characters) {
      if (!c || typeof c !== "object") continue;
      const role: string = c.role || "";
      const name: string = c.name || "";
      if (!name) continue;
      if (role === "protagonist" || role === "main_protagonist" || role === "primary_protagonist") {
        constraints.push(`Protagonist: ${name}`);
      } else if (role === "antagonist" || role === "main_antagonist" || role === "villain") {
        constraints.push(`Antagonist: ${name}`);
      } else if (role === "supporting") {
        // Supporting characters — include for act 2a/2b/3 where they're more active.
        if (actKey !== "act_1_setup") {
          constraints.push(`Supporting character: ${name}`);
        }
      }
    }
  }

  // World rules — always included.
  if (Array.isArray(canonJson.world_rules)) {
    for (const rule of canonJson.world_rules) {
      if (typeof rule === "string" && rule.trim()) {
        constraints.push(`World rule: ${rule.trim()}`);
      }
    }
  }

  // Hard plot anchors per act.
  if (Array.isArray(canonJson.plot_anchors)) {
    for (const anchor of canonJson.plot_anchors) {
      if (!anchor || typeof anchor !== "object") continue;
      const anchorAct: string = anchor.act_key || "";
      // Include anchors for this act, or anchors with no act affiliation.
      if (!anchorAct || anchorAct === actKey) {
        if (typeof anchor.description === "string" && anchor.description.trim()) {
          constraints.push(`Plot anchor: ${anchor.description.trim()}`);
        }
      }
    }
  }

  // Deduplicate.
  return [...new Set(constraints)];
}

// ── Note filter ───────────────────────────────────────────────────────────

/**
 * Filter approved notes to those targeting this act.
 * Notes with act_target === actKey apply to this act.
 * Notes with act_target === undefined/null apply to all acts.
 */
export function filterNotesForAct(
  approvedNotes: any[],
  actKey: string,
): string[] {
  if (!approvedNotes || approvedNotes.length === 0) return [];
  return approvedNotes
    .filter((n: any) => {
      if (!n) return false;
      const target = n.act_target;
      return target === undefined || target === null || target === actKey;
    })
    .map((n: any) => {
      if (typeof n === "string") return n;
      if (n.resolution_directive) return n.resolution_directive;
      if (n.note_key) return `[${n.note_key}] ${n.description || n.note || JSON.stringify(n)}`;
      return n.description || n.note || JSON.stringify(n);
    })
    .filter(Boolean);
}

// ── Preceding context builder ─────────────────────────────────────────────

/**
 * Build the PrecedingContext object for an act from all prior act results.
 */
export function buildPrecedingContext(
  priorActs: Array<{
    actKey: string;
    actNumber: number;
    label: string;
    content: string;
    arcStateDeltas: ArcStateDeltas | null;
  }>,
): PrecedingContext | null {
  if (priorActs.length === 0) return null;

  const arcStateDeltas: PrecedingContext["arcStateDeltas"] = priorActs
    .filter(a => a.arcStateDeltas !== null)
    .map(a => ({ actKey: a.actKey, actNumber: a.actNumber, delta: a.arcStateDeltas! }));

  // Build a compact summaryBlock as prompt text.
  const summaryParts: string[] = [];

  // Character states from last completed act.
  const lastDelta = arcStateDeltas[arcStateDeltas.length - 1]?.delta;
  if (lastDelta) {
    const characterEntries = Object.entries(lastDelta.character_states);
    if (characterEntries.length > 0) {
      summaryParts.push(
        "CHARACTER STATES ENTERING THIS ACT:\n" +
        characterEntries
          .map(([name, state]) =>
            `- ${name}: desires "${state.current_desire}", fears "${state.current_fear}", emotional state: ${state.emotional_state}`
          )
          .join("\n"),
      );
    }
    if (lastDelta.pending_arcs.length > 0) {
      summaryParts.push(
        "PENDING ARCS:\n" +
        lastDelta.pending_arcs
          .map(a => `- ${a.character}: ${a.arc_description} [tension: ${a.tension_level}]`)
          .join("\n"),
      );
    }
    if (lastDelta.unresolved_tensions.length > 0) {
      summaryParts.push(
        "UNRESOLVED TENSIONS:\n" +
        lastDelta.unresolved_tensions
          .map(t => `- ${t.tension} (introduced act ${t.introduced_in_act}, escalation: ${t.escalation_level})`)
          .join("\n"),
      );
    }
  }

  return {
    priorActsContent: priorActs.map(a => ({
      actKey: a.actKey,
      label: a.label,
      content: a.content,
    })),
    arcStateDeltas,
    summaryBlock: summaryParts.join("\n\n"),
  };
}

// ── Main blueprint builder ────────────────────────────────────────────────

/**
 * Build a complete Act Blueprint for one act.
 *
 * @param actKey        e.g. "act_2a_rising_action"
 * @param actNumber     1 | 2 | 3 | 4
 * @param approvedNotes Array of approved note objects from the Notes Panel
 * @param canonJson     Project canon JSON from project_canon table
 * @param priorActs     Results from all prior acts in this rewrite pass
 */
export function buildActBlueprint(
  actKey: string,
  actNumber: number,
  approvedNotes: any[],
  canonJson: Record<string, any> | null,
  priorActs: Array<{
    actKey: string;
    actNumber: number;
    label: string;
    content: string;
    arcStateDeltas: ArcStateDeltas | null;
  }>,
): ActBlueprint {
  const sectionDef = findSectionDef("treatment", actKey);
  const label = sectionDef?.label ?? actKey;
  const functionDescription = sectionDef?.act_function_description ??
    "Write vivid present-tense prose. Full scenes, atmosphere, character interiority.";

  const canonConstraints = extractCanonConstraintsForAct(actKey, canonJson);
  const targetingNotes = filterNotesForAct(approvedNotes, actKey);
  const precedingContext = buildPrecedingContext(priorActs);

  return {
    actKey,
    actNumber,
    label,
    functionDescription,
    canonConstraints,
    targetingNotes,
    precedingContext,
  };
}

// ── Prompt serializer ─────────────────────────────────────────────────────

/**
 * Render an ActBlueprint as a prompt block to inject into the system prompt.
 * Called once per act immediately before the rewrite LLM call.
 */
export function renderActBlueprintBlock(blueprint: ActBlueprint): string {
  const parts: string[] = [];

  parts.push(`=== ACT BLUEPRINT: ${blueprint.label.toUpperCase()} ===`);
  parts.push(`FUNCTION: ${blueprint.functionDescription}`);

  if (blueprint.canonConstraints.length > 0) {
    parts.push(
      "CANON CONSTRAINTS (do not contradict):\n" +
      blueprint.canonConstraints.map(c => `- ${c}`).join("\n"),
    );
  }

  if (blueprint.targetingNotes.length > 0) {
    parts.push(
      "NOTES TARGETING THIS ACT:\n" +
      blueprint.targetingNotes.map(n => `- ${n}`).join("\n"),
    );
  }

  if (blueprint.precedingContext?.summaryBlock) {
    parts.push("STORY STATE FROM PRIOR ACTS:\n" + blueprint.precedingContext.summaryBlock);
  }

  parts.push(`=== END ACT BLUEPRINT ===`);

  return parts.join("\n\n");
}
