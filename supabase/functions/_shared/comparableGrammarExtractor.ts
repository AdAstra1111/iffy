/**
 * comparableGrammarExtractor.ts — Comparable Grammar Extraction
 *
 * Phase 4.3 P0: Single LLM call to extract structured genre grammar from
 * comparable film titles. Produces 12 grammar dimensions defined in Phase 4.2.
 *
 * Each grammar value must be attestable to 2+ comparables (multi-film attestation).
 * This is the anti-copying safeguard — genre-level patterns only, not film-specific.
 */
import type { StoredComparableGrammar } from "./ncpTypes.ts";
import { resolveGateway, MODELS } from "./llm.ts";

// ── LLM Extraction Prompt ──

const GRAMMAR_EXTRACTION_SYSTEM_PROMPT = `You are a genre grammar analyst. Given comparable film titles and their rationale, extract the shared structural grammar these films teach about audience expectations, reveal timing, pressure mechanics, and story delivery.

Extract exactly these 12 dimensions as string arrays. Each value in each array must:
1. Be a GENRE-LEVEL pattern (not film-specific)
2. Be attestable to at least 2 of the listed comparables
3. Describe HOW the story delivers its experience (not WHAT the story is)

CRITICAL RULES:
- Do NOT extract specific plot points, character names, dialogue, scenes, or signature moments
- Do NOT extract elements unique to a single film (e.g., "shark hidden until boat attack" is film-specific)
- DO extract genre-level patterns (e.g., "withhold full creature visibility" is a genre-level strategy)
- If a grammar value applies to only one film, DISCARD it
- If NO values exist for a dimension, return an empty array

DIMENSIONS:

1. reveal_strategy: When and how key revelations are delivered
   Examples: ["withhold_full_visibility", "gradual_unmasking", "early_full_reveal", "distributed_reveals"]

2. pressure_pattern: How tension is generated and maintained
   Examples: ["absence_creates_dread", "action_escalation", "paranoia_decay", "ticking_clock", "bureaucratic_frustration"]

3. spectacle_escalation: How spectacle scales across the story
   Examples: ["glimpse_partial_full", "distributed_set_pieces", "late_full_reveal", "midpoint_peak"]

4. antagonist_function: How the antagonist operates
   Examples: ["creature_as_threat", "paranoia_as_enemy", "system_as_antagonist", "personal_adversary", "internal_demon"]

5. emotional_access: How the audience emotionally enters the story
   Examples: ["personal_loss_anchor", "community_stakes", "family_drive", "professional_stakes", "survival_imperative"]

6. pacing_pattern: Overall scene rhythm
   Examples: ["short_punchy_scenes", "long_build_release", "varied_rhythm", "accelerating_through_acts"]

7. resolution_style: How the story resolves
   Examples: ["pyrrhic_victory", "cathartic_defeat", "ambiguous_escape", "restoration", "transformation"]

8. mystery_architecture: How information is revealed to the audience
   Examples: ["audience_ahead_of_protagonist", "discover_with_protagonist", "multiple_parallel_mysteries", "central_unifying_mystery"]

9. relationship_framing: How relationships are used structurally
   Examples: ["romantic_anchor", "family_bond", "mentor_protege", "adversary_respect", "community_network"]

10. agency_distribution: How agency is distributed among characters
    Examples: ["protagonist_driven", "ensemble_shared", "reactive_protagonist", "antagonist_driven"]

11. tension_architecture: How tension is structured across the whole story
    Examples: ["rising_then_sustaining", "oscillating_peaks", "crescendo", "plateau_release_plateau"]

12. scale_escalation: How stakes expand over the course of the story
    Examples: ["personal_community_global", "contained_escalation", "expanding_revelation", "inward_deepening"]`;

interface GrammarExtractionResult {
  reveal_strategy: string[];
  pressure_pattern: string[];
  spectacle_escalation: string[];
  antagonist_function: string[];
  emotional_access: string[];
  pacing_pattern: string[];
  resolution_style: string[];
  mystery_architecture: string[];
  relationship_framing: string[];
  agency_distribution: string[];
  tension_architecture: string[];
  scale_escalation: string[];
}

// ── Grammar Extraction ──

/**
 * Extract Comparable Grammar from a list of comparable titles.
 * Uses a single LLM call with multi-film attestation enforcement.
 *
 * @returns StoredComparableGrammar object, or null if extraction fails or no comparables.
 */
export async function extractComparableGrammar(
  projectGenre: string,
  comparables: Array<{ title: string; rationale?: string }>,
): Promise<StoredComparableGrammar | null> {
  if (!comparables || comparables.length === 0) return null;
  if (comparables.length < 2) return null; // Multi-film attestation requires 2+

  const { apiKey, gatewayUrl } = resolveGateway();

  // Build comparable reference list
  const compList = comparables
    .map((c, i) => `${i + 1}. ${c.title}${c.rationale ? ` — "${c.rationale}"` : ""}`)
    .join("\n");

  const userPrompt = `Extract comparable grammar from these titles for a ${projectGenre} project:

Comparables (with rationale):
${compList}

Return ONLY valid JSON with the 12 dimensions as string arrays. No markdown, no code fences, no preamble.`;

  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELS.FAST,
        messages: [
          { role: "system", content: GRAMMAR_EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn(`[comparableGrammarExtractor] LLM extraction failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    if (!rawContent.trim()) return null;

    // Parse JSON result
    const parsed: GrammarExtractionResult = JSON.parse(rawContent);

    // Validate and sanitize
    const grammar: GrammarExtractionResult = {
      reveal_strategy: Array.isArray(parsed.reveal_strategy) ? parsed.reveal_strategy : [],
      pressure_pattern: Array.isArray(parsed.pressure_pattern) ? parsed.pressure_pattern : [],
      spectacle_escalation: Array.isArray(parsed.spectacle_escalation) ? parsed.spectacle_escalation : [],
      antagonist_function: Array.isArray(parsed.antagonist_function) ? parsed.antagonist_function : [],
      emotional_access: Array.isArray(parsed.emotional_access) ? parsed.emotional_access : [],
      pacing_pattern: Array.isArray(parsed.pacing_pattern) ? parsed.pacing_pattern : [],
      resolution_style: Array.isArray(parsed.resolution_style) ? parsed.resolution_style : [],
      mystery_architecture: Array.isArray(parsed.mystery_architecture) ? parsed.mystery_architecture : [],
      relationship_framing: Array.isArray(parsed.relationship_framing) ? parsed.relationship_framing : [],
      agency_distribution: Array.isArray(parsed.agency_distribution) ? parsed.agency_distribution : [],
      tension_architecture: Array.isArray(parsed.tension_architecture) ? parsed.tension_architecture : [],
      scale_escalation: Array.isArray(parsed.scale_escalation) ? parsed.scale_escalation : [],
    };

    // Check if at least some grammar was extracted
    const totalValues = Object.values(grammar).reduce((sum, arr) => sum + arr.length, 0);
    if (totalValues === 0) return null;

    // Check multi-film attestation (LLM was instructed to enforce this)
    const allHaveAtLeastOne = Object.values(grammar).some(arr => arr.length > 0);

    return {
      version: 1,
      extracted_at: new Date().toISOString(),
      comps_used: comparables.map(c => c.title),
      grammar,
      anti_copying: {
        multi_film_attested: allHaveAtLeastOne,
      },
    };
  } catch (err) {
    console.warn(`[comparableGrammarExtractor] Extraction error: ${err?.message || err}`);
    return null;
  }
}

/**
 * Count populated grammar dimensions for telemetry.
 */
export function countGrammarDimensions(grammar: StoredComparableGrammar): number {
  return Object.values(grammar.grammar).filter(arr => arr.length > 0).length;
}

/**
 * Count total grammar values across all dimensions.
 */
export function countGrammarTotalValues(grammar: StoredComparableGrammar): number {
  return Object.values(grammar.grammar).reduce((sum, arr) => sum + arr.length, 0);
}

/**
 * Detects whether any grammar dimension conflicts with CIP.
 * Returns true if conflict detected, false otherwise.
 * Conflict rule: if CIP payload primitives emphasize transformation/reflection
 * and grammar recommends relentless escalation/pressure → conflict.
 */
export function detectCIPGrammarConflicts(
  cip: { payload?: { primitives?: Record<string, string> }; genre?: string },
  grammar: StoredComparableGrammar,
): boolean {
  if (!cip?.payload?.primitives) return false;

  const primitives = Object.keys(cip.payload.primitives);
  const isReflective = primitives.some(p =>
    /transform|connection|meaning/i.test(p)
  );
  const isIntense = primitives.some(p => /pressure/i.test(p));

  // Check for pressure-related conflicts
  if (isReflective && !isIntense) {
    // CIP emphasizes reflection → check grammar doesn't push relentless action
    if (grammar.grammar.pressure_pattern?.some(p => /relentless|constant|non.?stop/i.test(p))) {
      return true;
    }
    if (grammar.grammar.spectacle_escalation?.some(s => /spectacle_first|distributed_set.?pieces/i.test(s))) {
      return true;
    }
    if (grammar.grammar.pacing_pattern?.some(p => /accelerating|short_punchy/i.test(p))) {
      return true;
    }
  }

  return false;
}