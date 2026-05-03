/**
 * arcStateDeltaGenerator.ts
 *
 * Handles the arc-state delta extraction from per-act Treatment rewrite responses.
 *
 * Design: The LLM is instructed to output act prose FIRST, then a hard delimiter,
 * then a structured JSON arc-state delta. This module provides:
 *
 *   1. buildArcStateDeltaSystemInstruction()
 *      Returns the system prompt block that instructs the LLM to produce the delimiter + JSON.
 *      Import this and append to every per-act rewrite system prompt.
 *
 *   2. parseActRewriteResponse(raw)
 *      Splits the LLM response on the delimiter, returns { actContent, arcStateDeltas }.
 *      Falls back gracefully — never blocks the rewrite if the delta is malformed.
 *
 * Used by: dev-engine-v2/index.ts (TREATMENT_REWRITE action)
 * Types re-exported for use by actBlueprintSynthesizer and the rewrite loop.
 */

import type { ArcStateDeltas } from "./actBlueprintSynthesizer.ts";
export type { ArcStateDeltas } from "./actBlueprintSynthesizer.ts";

// ── Constants ─────────────────────────────────────────────────────────────

/** Hard delimiter separating act prose from the JSON arc-state delta. */
export const ARC_STATE_DELIMITER = "---ARC_STATE_JSON---";

// ── System instruction ────────────────────────────────────────────────────

/**
 * Returns the system prompt block to append to every per-act rewrite call.
 * Instructs the LLM to output prose first, then the delimiter, then JSON.
 */
export function buildArcStateDeltaSystemInstruction(): string {
  return `
STRUCTURED OUTPUT REQUIRED AT END OF EACH ACT:

After the act prose, output EXACTLY the following delimiter on its own line, then a JSON object:

${ARC_STATE_DELIMITER}
{
  "character_states": {
    "<CharacterName>": {
      "current_desire": "<what they want most after this act>",
      "current_fear": "<what they fear most after this act>",
      "emotional_state": "<one-phrase emotional state, e.g. 'desperate but resolute'>",
      "relationship_states": {
        "<OtherCharacterName>": "<one-phrase relationship state, e.g. 'deeply mistrustful'>"
      }
    }
  },
  "pending_arcs": [
    {
      "character": "<CharacterName>",
      "arc_description": "<what arc is in motion for them>",
      "tension_level": "low" | "medium" | "high"
    }
  ],
  "unresolved_tensions": [
    {
      "tension": "<description of the unresolved tension>",
      "introduced_in_act": <act number as integer, e.g. 1>,
      "escalation_level": "building" | "near_crisis" | "at_crisis"
    }
  ]
}

Rules:
- Include ONLY characters who appear in this act or carry active arcs into the next act.
- Do NOT include placeholder characters with no scene presence.
- Keep each field concise (one phrase or short sentence).
- The JSON must be valid — no trailing commas, no comments.
- Do NOT include any text after the JSON object.
`.trim();
}

// ── Response parser ───────────────────────────────────────────────────────

export interface ParsedActResponse {
  /** The act prose content (everything before the delimiter). */
  actContent: string;
  /** Parsed arc-state delta, or null if parsing failed. */
  arcStateDeltas: ArcStateDeltas | null;
  /** Whether the delta was successfully parsed. */
  deltaParseSuccess: boolean;
  /** Parse error message if deltaParseSuccess === false. */
  deltaParseError?: string;
}

/**
 * Parse the raw LLM response from a per-act rewrite call.
 * Splits on ARC_STATE_DELIMITER; never throws — returns null delta on failure.
 */
export function parseActRewriteResponse(raw: string): ParsedActResponse {
  if (!raw || !raw.trim()) {
    return {
      actContent: "",
      arcStateDeltas: null,
      deltaParseSuccess: false,
      deltaParseError: "Empty LLM response",
    };
  }

  const delimiterIndex = raw.indexOf(ARC_STATE_DELIMITER);

  // No delimiter found — entire response is act content, no delta.
  if (delimiterIndex === -1) {
    console.warn("[arcStateDelta] Delimiter not found in LLM response — delta will be null");
    return {
      actContent: raw.trim(),
      arcStateDeltas: null,
      deltaParseSuccess: false,
      deltaParseError: "Delimiter not found in response",
    };
  }

  const actContent = raw.slice(0, delimiterIndex).trim();
  const jsonPart = raw.slice(delimiterIndex + ARC_STATE_DELIMITER.length).trim();

  if (!jsonPart) {
    return {
      actContent,
      arcStateDeltas: null,
      deltaParseSuccess: false,
      deltaParseError: "No JSON found after delimiter",
    };
  }

  // Extract JSON — handle possible markdown code fence wrapping.
  let jsonStr = jsonPart
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // Find the outermost { } boundaries.
  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return {
      actContent,
      arcStateDeltas: null,
      deltaParseSuccess: false,
      deltaParseError: "No valid JSON object found after delimiter",
    };
  }
  jsonStr = jsonStr.slice(start, end + 1);

  try {
    const parsed = JSON.parse(jsonStr) as ArcStateDeltas;

    // Minimal structural validation.
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.character_states !== "object" ||
      !Array.isArray(parsed.pending_arcs) ||
      !Array.isArray(parsed.unresolved_tensions)
    ) {
      return {
        actContent,
        arcStateDeltas: null,
        deltaParseSuccess: false,
        deltaParseError: "Parsed JSON missing required fields (character_states, pending_arcs, unresolved_tensions)",
      };
    }

    return {
      actContent,
      arcStateDeltas: parsed,
      deltaParseSuccess: true,
    };
  } catch (err: any) {
    return {
      actContent,
      arcStateDeltas: null,
      deltaParseSuccess: false,
      deltaParseError: `JSON.parse failed: ${err?.message || String(err)}`,
    };
  }
}

// ── Empty delta factory ───────────────────────────────────────────────────

/**
 * Returns a well-formed empty ArcStateDeltas object.
 * Use as the safe fallback when delta parsing fails.
 */
export function emptyArcStateDeltas(): ArcStateDeltas {
  return {
    character_states: {},
    pending_arcs: [],
    unresolved_tensions: [],
  };
}
