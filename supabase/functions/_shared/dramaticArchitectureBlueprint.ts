/**
 * Dramatic Architecture Blueprint (DAB) — Phase 2B.1
 *
 * LLM analysis pass that reads Treatment, Character Bible, Beat Sheet,
 * Story Outline, and Concept Brief to produce a structured JSON document
 * describing what the story must deliver dramatically.
 *
 * The DAB answers: "What must this story deliver to satisfy the audience?"
 * NOT: "How many scenes should there be?"
 *
 * Pipeline position:
 * Beat Sheet + Treatment + Character Bible + Story Outline
 *   → Dramatic Architecture Blueprint (this module)
 *   → Scene Architecture (Phase 2B.2)
 *   → Scene Expansion Engine (modified)
 *   → Scene Plan + NCP
 */
import type {
  DramaticArchitectureBlueprint,
  DramaticMovement,
  AudiencePromiseRegistry,
  CharacterTransformationEntry,
  RelationshipArchitectureEntry,
  MysteryInformationArchitecture,
  EmotionalArchitecture,
  SpectacleSetPieceEntry,
  BreathingRoomEntry,
  DramaticSceneSlot,
} from "./ncpTypes.ts";
import { resolveGateway } from "./llm.ts";

// ── Constants ──

const MAX_INPUT_CHARS = 6000; // Per-doc truncation limit
const DAB_SYSTEM_PROMPT = `You are a professional story architect creating a Dramatic Architecture Blueprint (DAB) for a feature film.

The DAB describes what dramatic work the story must do to satisfy its audience promises. It is NOT a Scene Plan.

CRITICAL INSTRUCTION:
- Do NOT generate scenes.
- Do NOT generate sluglines (INT./EXT.).
- Do NOT generate screenplay text.
- Do NOT assign exact scene numbers.
- Do NOT write prose paragraphs.
- Only produce the DAB JSON as specified below.

The DAB should answer: "What must this story deliver to satisfy the audience?"
NOT: "How many scenes should there be?"

Output ONLY valid JSON with the structure shown below. No markdown. No code fences. No preamble.`;

const DAB_OUTPUT_SCHEMA = `{
  "audience_promise_registry": {
    "genre_promises": ["List of genre obligations this story must fulfill"],
    "emotional_promises": ["What the audience should feel"],
    "mystery_promises": ["Mysteries that must be set up and resolved"],
    "spectacle_promises": ["Visual/set-piece moments the audience expects"],
    "relationship_promises": ["Relationship arcs that must develop"],
    "thematic_promises": ["Thematic questions that must be explored"]
  },
  "character_transformation_architecture": [
    {
      "character": "Name",
      "stages": [
        {
          "stage": "Stage name (e.g., innocent, disillusioned, transformed)",
          "required_scenes": 3,
          "function_preference": "What scene functions serve this stage (e.g., exposition, reaction, decision)",
          "purpose": "What this stage must accomplish dramatically"
        }
      ],
      "total_required_scenes": 10
    }
  ],
  "relationship_architecture": [
    {
      "pair": ["Character1", "Character2"],
      "stages": [
        {
          "stage": "Stage name (e.g., distance, forced proximity, trust)",
          "required_scenes": 2,
          "interaction_type": "How they interact (e.g., conflict, intimacy, negotiation)"
        }
      ],
      "total_scenes": 5
    }
  ],
  "mystery_information_architecture": {
    "revelations_per_act": [
      {
        "act": 1,
        "reveals": [
          { "what": "What is revealed", "when_scene_approx": "early/ mid/ late Act 1", "to_whom": "audience or specific character" }
        ]
      }
    ],
    "withholding_strategy": [
      "What is deliberately NOT shown and why"
    ],
    "dramatic_irony_opportunities": [
      "When the audience knows something characters don't"
    ]
  },
  "emotional_architecture": {
    "sequence": [
      { "movement_range": "Movements 1-3", "dominant_emotion": "the primary emotion", "purpose": "Why this emotional state serves the story" }
    ]
  },
  "spectacle_setpiece_architecture": [
    {
      "name": "Set piece name",
      "estimated_scenes": 3,
      "estimated_pages": 5,
      "position": "e.g., Act 1 climax, Midpoint, Act 3 climax",
      "type": "e.g., horror reveal, action set piece, emotional climax"
    }
  ],
  "breathing_room_architecture": [
    {
      "after_movement": "Movement name or number",
      "reason": "Why the audience needs to process before continuing"
    }
  ],
  "dramatic_movements": [
    {
      "movement_number": 1,
      "name": "Movement name (e.g., The Ship Appears)",
      "act": 1,
      "source_reference": "Which beat it serves (e.g., Catalyst)",
      "dramatic_payoff": "What this movement achieves for the audience (1 sentence)",
      "estimated_scenes": 5,
      "scene_cluster": [
        {
          "slot_in_movement": 1,
          "function": "Scene function (e.g., setup, discovery, revelation, reaction, transition)",
          "purpose": "This specific scene's purpose within the movement"
        }
      ],
      "pacing": "e.g., escalating, slow build, fast, oscillating, decelerating",
      "breathing_room_required_after": true
    }
  ]
}`;

// ── Validation ──

export interface DABValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a Dramatic Architecture Blueprint for completeness and correctness.
 * Fails visibly — no silent fallback.
 */
export function validateDramaticArchitectureBlueprint(
  dab: any,
): DABValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!dab) {
    return { valid: false, errors: ["DAB is null or undefined"], warnings: [] };
  }

  // 1. audience_promise_registry must exist
  const apr = dab.audience_promise_registry;
  if (!apr) {
    errors.push("audience_promise_registry is required");
  } else {
    const promiseFields = ["genre_promises", "emotional_promises", "mystery_promises", "spectacle_promises", "relationship_promises", "thematic_promises"];
    for (const field of promiseFields) {
      if (!Array.isArray(apr[field])) {
        errors.push(`audience_promise_registry.${field} must be a non-empty array`);
      }
    }
  }

  // 2. character_transformation_architecture must exist with at least one entry
  const charArch = dab.character_transformation_architecture;
  if (!Array.isArray(charArch) || charArch.length === 0) {
    errors.push("character_transformation_architecture must be a non-empty array");
  } else {
    for (let i = 0; i < charArch.length; i++) {
      const c = charArch[i];
      if (!c.character) errors.push(`character_transformation_architecture[${i}].character is required`);
      if (!Array.isArray(c.stages) || c.stages.length === 0) {
        errors.push(`character_transformation_architecture[${i}].stages must be a non-empty array`);
      }
      if (typeof c.total_required_scenes !== "number") {
        errors.push(`character_transformation_architecture[${i}].total_required_scenes is required`);
      }
    }
  }

  // 3. dramatic_movements must exist with at least one entry
  const movements = dab.dramatic_movements;
  if (!Array.isArray(movements) || movements.length === 0) {
    errors.push("dramatic_movements must be a non-empty array");
  } else {
    for (let i = 0; i < movements.length; i++) {
      const m = movements[i];
      if (typeof m.movement_number !== "number") errors.push(`dramatic_movements[${i}].movement_number is required`);
      if (!m.name) errors.push(`dramatic_movements[${i}].name is required`);
      if (typeof m.act !== "number") errors.push(`dramatic_movements[${i}].act is required`);
      if (!m.source_reference) errors.push(`dramatic_movements[${i}].source_reference is required`);
      if (!m.dramatic_payoff) errors.push(`dramatic_movements[${i}].dramatic_payoff is required`);
      if (typeof m.estimated_scenes !== "number" || m.estimated_scenes < 1) {
        errors.push(`dramatic_movements[${i}].estimated_scenes must be >= 1`);
      }

      // Validate scene_cluster
      const cluster = m.scene_cluster;
      if (!Array.isArray(cluster) || cluster.length === 0) {
        errors.push(`dramatic_movements[${i}].scene_cluster must be a non-empty array`);
      } else {
        for (let j = 0; j < cluster.length; j++) {
          const slot = cluster[j];
          if (typeof slot.slot_in_movement !== "number") {
            errors.push(`dramatic_movements[${i}].scene_cluster[${j}].slot_in_movement is required`);
          }
          if (!slot.function) errors.push(`dramatic_movements[${i}].scene_cluster[${j}].function is required`);
          if (!slot.purpose) errors.push(`dramatic_movements[${i}].scene_cluster[${j}].purpose is required`);

          // Check for forbidden Scene Plan fields
          const forbidden = ["slugline", "scene_number", "time_of_day", "characters_present", "summary", "scene_turn", "scene_outcome"];
          for (const f of forbidden) {
            if (slot[f] !== undefined) {
              errors.push(`dramatic_movements[${i}].scene_cluster[${j}].${f} is not allowed in DAB — belongs in Scene Plan`);
            }
          }
        }
      }

      if (!m.pacing) errors.push(`dramatic_movements[${i}].pacing is required`);
      if (typeof m.breathing_room_required_after !== "boolean") {
        errors.push(`dramatic_movements[${i}].breathing_room_required_after must be boolean`);
      }
    }
  }

  // 4. relationship_architecture validation (soft — story may not have multiple relationships)
  if (dab.relationship_architecture !== undefined && !Array.isArray(dab.relationship_architecture)) {
    errors.push("relationship_architecture must be an array if present");
  }

  // 5. mystery_information_architecture validation (soft — not all stories have mysteries)
  if (dab.mystery_information_architecture !== undefined) {
    const mia = dab.mystery_information_architecture;
    if (Array.isArray(mia.revelations_per_act)) {
      for (let i = 0; i < mia.revelations_per_act.length; i++) {
        const rb = mia.revelations_per_act[i];
        if (typeof rb.act !== "number") warnings.push(`mystery_information_architecture.revelations_per_act[${i}].act should be a number`);
      }
    }
  }

  // 6. emotional_architecture validation
  if (dab.emotional_architecture !== undefined) {
    const ea = dab.emotional_architecture;
    if (!Array.isArray(ea.sequence)) {
      warnings.push("emotional_architecture.sequence should be an array");
    }
  }

  // 7. spectacle_setpiece_architecture validation
  if (dab.spectacle_setpiece_architecture !== undefined && !Array.isArray(dab.spectacle_setpiece_architecture)) {
    warnings.push("spectacle_setpiece_architecture should be an array if present");
  }

  // 8. breathing_room_architecture validation
  if (dab.breathing_room_architecture !== undefined && !Array.isArray(dab.breathing_room_architecture)) {
    warnings.push("breathing_room_architecture should be an array if present");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Generation ──

/**
 * Generate a Dramatic Architecture Blueprint from upstream documents.
 *
 * @returns The parsed and validated DAB, or null if generation failed.
 * Failure is always visible — errors are thrown.
 */
export async function generateDramaticArchitectureBlueprint(
  apiKey: string,
  gatewayUrl: string,
  projectTitle: string,
  treatment: string,
  characterBible: string,
  beatSheet: string,
  storyOutline: string,
  conceptBrief?: string,
  formatRules?: string,
): Promise<DramaticArchitectureBlueprint> {
  const GL = "\n";

  const userPrompt = `Project: "${projectTitle}"

Generate the Dramatic Architecture Blueprint JSON for this feature film.

BEAT SHEET:
${(beatSheet || "N/A").slice(0, MAX_INPUT_CHARS)}

TREATMENT:
${(treatment || "N/A").slice(0, MAX_INPUT_CHARS)}

CHARACTER BIBLE:
${(characterBible || "N/A").slice(0, MAX_INPUT_CHARS)}

STORY OUTLINE:
${(storyOutline || "N/A").slice(0, MAX_INPUT_CHARS)}

${conceptBrief ? `CONCEPT BRIEF:\n${conceptBrief.slice(0, 3000)}\n\n` : ""}
${formatRules ? `FORMAT RULES:\n${formatRules.slice(0, 2000)}\n\n` : ""}

RULES:
1. Do NOT generate scenes. Do NOT use sluglines. Do NOT write screenplay text.
2. Each dramatic_movement must have 2-5 scene clusters (estimated_scenes = sum of scene_cluster entries).
3. scene_cluster entries describe the FUNCTION of each scene slot, not the exact scene content.
4. Every dramatic_movement.scene_cluster entry must have: slot_in_movement, function, purpose.
5. scene_cluster entries must NOT contain: slugline, scene_number, time_of_day, characters_present, summary, scene_turn, scene_outcome.
6. Estimated total scenes across all movements should be appropriate for a feature film (typically 75-130).
7. Output ONLY valid JSON matching the schema provided in the system prompt.`;

  const response = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `${DAB_SYSTEM_PROMPT}\n\nOutput JSON schema:\n${DAB_OUTPUT_SCHEMA}`,
        },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 16000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown");
    throw new Error(`DAB generation failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "";
  if (!rawContent.trim()) throw new Error("DAB generation returned empty content");

  // Clean and parse JSON — handle code fences if present
  const cleanJson = rawContent
    .replace(/^\s*```(?:json)?\s*/gm, "")
    .replace(/```\s*$/gm, "")
    .trim();

  const finalClean = cleanJson.startsWith("```")
    ? cleanJson.split("\n").slice(1, -1).join("\n").trim()
    : cleanJson;

  let parsed: any;
  try {
    parsed = JSON.parse(finalClean);
  } catch (parseErr) {
    throw new Error(`DAB JSON parse failed: ${parseErr} — raw start: ${rawContent.slice(0, 200)}`);
  }

  // Validate
  const validation = validateDramaticArchitectureBlueprint(parsed);
  if (!validation.valid) {
    throw new Error(`DAB validation failed:\n${validation.errors.join("\n")}`);
  }

  if (validation.warnings.length > 0) {
    console.warn(`[DAB] Validation warnings:\n${validation.warnings.join("\n")}`);
  }

  return parsed as DramaticArchitectureBlueprint;
}

/**
 * Build a human-readable prompt block from the DAB for Scene Plan context.
 * Used to inject architectural guidance into the Scene Plan generation prompt.
 */
export function buildDABPromptBlock(dab: DramaticArchitectureBlueprint): string {
  const lines: string[] = [];

  lines.push("=== DRAMATIC ARCHITECTURE BLUEPRINT ===");
  lines.push("");

  // Audience promises
  const apr = dab.audience_promise_registry;
  lines.push("AUDIENCE PROMISES:");
  if (apr.genre_promises?.length) lines.push(`  Genre: ${apr.genre_promises.join(", ")}`);
  if (apr.emotional_promises?.length) lines.push(`  Emotional: ${apr.emotional_promises.join(", ")}`);
  if (apr.mystery_promises?.length) lines.push(`  Mystery: ${apr.mystery_promises.join(", ")}`);
  if (apr.spectacle_promises?.length) lines.push(`  Spectacle: ${apr.spectacle_promises.join(", ")}`);
  if (apr.relationship_promises?.length) lines.push(`  Relationships: ${apr.relationship_promises.join(", ")}`);
  if (apr.thematic_promises?.length) lines.push(`  Thematic: ${apr.thematic_promises.join(", ")}`);
  lines.push("");

  // Character arcs
  lines.push("CHARACTER ARCS:");
  for (const c of (dab.character_transformation_architecture || [])) {
    const stages = c.stages.map(s => `${s.stage} (${s.required_scenes} scenes)`).join(" → ");
    lines.push(`  ${c.character}: ${stages} [total: ${c.total_required_scenes}]`);
  }
  lines.push("");

  // Dramatic movements
  lines.push("DRAMATIC MOVEMENTS:");
  let totalSceneEstimate = 0;
  for (const m of (dab.dramatic_movements || [])) {
    const functions = m.scene_cluster.map(s => s.function).join(", ");
    const breathMarker = m.breathing_room_required_after ? " [breathe after]" : "";
    lines.push(`  Movement ${m.movement_number}: "${m.name}" (Act ${m.act}, ${m.estimated_scenes} scenes)${breathMarker}`);
    lines.push(`    Source: ${m.source_reference}`);
    lines.push(`    Payoff: ${m.dramatic_payoff}`);
    lines.push(`    Scene functions: ${functions}`);
    lines.push(`    Pacing: ${m.pacing}`);
    totalSceneEstimate += m.estimated_scenes;
  }
  lines.push(`  [Total estimated scenes from movements: ${totalSceneEstimate}]`);
  lines.push("");

  // Breathing room
  if (dab.breathing_room_architecture?.length) {
    lines.push("BREATHING ROOM:");
    for (const br of dab.breathing_room_architecture) {
      lines.push(`  After ${br.after_movement}: ${br.reason}`);
    }
    lines.push("");
  }

  // Spectacle
  if (dab.spectacle_setpiece_architecture?.length) {
    lines.push("SPECTACLE SET PIECES:");
    for (const sp of dab.spectacle_setpiece_architecture) {
      lines.push(`  "${sp.name}" — ${sp.position}, ${sp.estimated_scenes} scenes, ~${sp.estimated_pages} pages (${sp.type})`);
    }
    lines.push("");
  }

  lines.push("=== END DRAMATIC ARCHITECTURE BLUEPRINT ===");

  return lines.join("\n");
}

/**
 * Get the total estimated scenes from a DAB by summing movement estimated_scenes.
 */
export function getDABEstimatedSceneCount(dab: DramaticArchitectureBlueprint): number {
  return (dab.dramatic_movements || []).reduce(
    (sum, m) => sum + (m.estimated_scenes || 0),
    0,
  );
}
