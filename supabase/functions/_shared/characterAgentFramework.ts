/**
 * Character Agent Framework — Phase 4
 *
 * Defines how character agents consume the Phase 1-3 substrate to produce
 * in-character performance generation.
 *
 * Substrate consumed:
 *   narrative_entities          → canonical character roster + protagonist flag
 *   narrative_scene_entity_links → per-scene character presence
 *   scene_enrichment           → 9 attributes per scene (tension, arc, thematic tags, etc.)
 *   narrative_entity_relations  → semantic roles (ally_of, antagonist_of, romantic_of, family_of)
 *   entity-links-engine v2     → alias resolution (CHAR_BILL → "BILL BLACKSTONE")
 *
 * Output:
 *   Character agent responses: performance notes, line reads, emotional beats,
 *   relationship-aware dialogue adjustments, casting notes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Data Access ───────────────────────────────────────────────────────────────

export interface Character {
  id: string;
  canonical_name: string;
  entity_key: string;
  scene_count: number;
  is_protagonist: boolean;
  meta_json: {
    is_protagonist?: boolean;
    source?: string;
    variant_names?: string[];
  };
}

export interface SceneEnrichment {
  scene_id: string;
  tension_level: number;        // 1-10
  tension_label: string;         // EXPOSITORY | TENSE | CONFLICT
  emotional_arc_direction: string; // ESCALATING | DEESCALATING | FLAT | COMPLEX
  protagonist_emotional_state: string;
  thematic_tags: string[];
  relationship_context: string;  // ALLY_PRESENT | ANTAGONIST_PRESENT | SOLO | etc.
  narrative_beat: string;        // matched beat name from beat sheet
  scene_type_override?: string;
}

export interface SemanticRelation {
  source_id: string;
  target_id: string;
  relation_type: "co_occurs" | "ally_of" | "antagonist_of" | "romantic_of" | "family_of";
  confidence: number;
}

export interface CharacterAgentInput {
  projectId: string;
  characterId: string;
  sceneId: string;
}

export interface CharacterAgentOutput {
  characterId: string;
  sceneId: string;
  characterName: string;
  isProtagonist: boolean;
  emotionalState: string;
  emotionalArc: string;
  tensionLevel: number;
  relationshipContext: string;
  thematicTags: string[];
  alliesInScene: string[];
  antagonistsInScene: string[];
  neutralInScene: string[];
  protagonistId: string;
  performanceNotes: string;      // AI-generated in-character performance guidance
  emotionalBeat: string;         // one-line description of this scene's emotional contribution
  castingNote?: string;          // optional casting colour
}

// ── Core character agent function ─────────────────────────────────────────────

/**
 * Reads the full substrate for a given (character, scene) pair and returns
 * a structured CharacterAgentOutput ready for performance generation.
 *
 * This is the READ path — it does not generate performance text, it assembles
 * the context that a downstream LLM would use to do so.
 */
export async function buildCharacterAgentContext(
  supabaseUrl: string,
  serviceRoleKey: string,
  input: CharacterAgentInput
): Promise<CharacterAgentOutput> {
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { characterId, sceneId, projectId } = input;

  // ── 1. Character data ──────────────────────────────────────────────────────
  const { data: character } = await admin
    .from("narrative_entities")
    .select("*")
    .eq("id", characterId)
    .single();

  if (!character) throw new Error(`Character ${characterId} not found`);

  const isProtagonist = (character.meta_json as any)?.is_protagonist === true;

  // ── 2. Scene enrichment ────────────────────────────────────────────────────
  const { data: enrichmentRows } = await admin
    .from("scene_enrichment")
    .select("*")
    .eq("scene_id", sceneId);

  const enrichment: SceneEnrichment | null = enrichmentRows?.[0] ?? null;

  // ── 3. Characters present in this scene ────────────────────────────────────
  const { data: sceneLinks } = await admin
    .from("narrative_scene_entity_links")
    .select("entity_id")
    .eq("scene_id", sceneId)
    .eq("relation_type", "character_present");

  const presentEntityIds = [...new Set((sceneLinks || []).map((l: any) => l.entity_id))];

  // Fetch all present characters
  const { data: presentCharacters } = await admin
    .from("narrative_entities")
    .select("id, canonical_name, meta_json")
    .in("id", presentEntityIds);

  const allChars = presentCharacters as Character[];
  const protagonist = allChars.find(c => (c.meta_json as any)?.is_protagonist);
  const protagonistId = protagonist?.id || "";

  // ── 4. Semantic relations for present characters ───────────────────────────
  const { data: relations } = await admin
    .from("narrative_entity_relations")
    .select("*")
    .eq("project_id", projectId)
    .in("source_entity_id", presentEntityIds)
    .in("target_entity_id", presentEntityIds);

  const presentIds = new Set(presentEntityIds);

  const alliesInScene = new Set<string>();
  const antagonistsInScene = new Set<string>();
  const neutralInScene = new Set<string>();

  for (const rel of (relations || []) as SemanticRelation[]) {
    if (!presentIds.has(rel.source_entity_id) || !presentIds.has(rel.target_entity_id)) continue;
    if (rel.relation_type === "ally_of") {
      alliesInScene.add(rel.source_entity_id === characterId ? rel.target_entity_id : rel.source_entity_id);
    } else if (rel.relation_type === "antagonist_of") {
      antagonistsInScene.add(rel.source_entity_id === characterId ? rel.target_entity_id : rel.source_entity_id);
    }
  }

  // ── 5. Build output ─────────────────────────────────────────────────────────
  const resolveName = (id: string) =>
    allChars.find(c => c.id === id)?.canonical_name || id;

  return {
    characterId,
    sceneId,
    characterName: character.canonical_name,
    isProtagonist,
    emotionalState: enrichment?.protagonist_emotional_state || "neutral",
    emotionalArc: enrichment?.emotional_arc_direction || "FLAT",
    tensionLevel: enrichment?.tension_level || 5,
    relationshipContext: enrichment?.relationship_context || "SOLO",
    thematicTags: enrichment?.thematic_tags || [],
    alliesInScene: [...alliesInScene].map(resolveName),
    antagonistsInScene: [...antagonistsInScene].map(resolveName),
    neutralInScene: [...neutralInScene].map(resolveName),
    protagonistId,
    performanceNotes: "",   // populated by downstream LLM call
    emotionalBeat: enrichment?.narrative_beat || "",
    castingNote: undefined,
  };
}

/**
 * Assemble a performance prompt for an LLM given a CharacterAgentOutput.
 * This is the GENERATE path — given the context, produce a performance note.
 */
export function assemblePerformancePrompt(ctx: CharacterAgentOutput): string {
  const arcDescriptions: Record<string, string> = {
    ESCALATING: "building toward a climax",
    DEESCALATING: "releasing tension after a peak",
    FLAT: "maintaining a steady state",
    COMPLEX: "experiencing mixed/conflicting emotions",
  };

  const arc = arcDescriptions[ctx.emotionalArc] || "in a neutral state";

  let prompt = `You are ${ctx.characterName}${ctx.isProtagonist ? " (the PROTAGONIST)" : ""}.\n\n`;
  prompt += `SCENE EMOTIONAL BEAT: ${ctx.emotionalBeat}\n`;
  prompt += `EMOTIONAL STATE: ${ctx.emotionalState} — this scene is ${arc}.\n`;
  prompt += `TENSION LEVEL: ${ctx.tensionLevel}/10 — ${ctx.tensionLevel >= 7 ? "HIGH STAKES" : ctx.tensionLevel >= 4 ? "MODERATE" : "low-key"}\n`;
  prompt += `THEMATIC WEIGHT: ${ctx.thematicTags.join(", ") || "none detected"}\n\n`;

  if (ctx.antagonistsInScene.length > 0) {
    prompt += `ANTAGONISTS PRESENT: ${ctx.antagonistsInScene.join(", ")} — ${ctx.relationshipContext}\n`;
  }
  if (ctx.alliesInScene.length > 0) {
    prompt += `ALLIES PRESENT: ${ctx.alliesInScene.join(", ")}\n`;
  }

  prompt += `\nWrite a brief performance note (2-3 sentences) for ${ctx.characterName} in this scene. `;
  prompt += `Focus on: emotional objective, the specific beat beat (${ctx.emotionalArc.toLowerCase()}), `;
  prompt += `and how their relationships with ${ctx.alliesInScene.length + ctx.antagonistsInScene.length} other characters inform their choices.\n`;

  return prompt;
}
