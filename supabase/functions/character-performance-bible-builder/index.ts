/**
 * character-performance-bible-builder - Phase 4.3 (Chunked)
 *
 * Architecture: instead of one LLM call for all scenes, processes in chunks
 * of ~10 scenes each. Each function call handles one chunk, stores partial
 * results in the job record, and returns. Client calls back for next chunk.
 *
 * Schema-grounded: uses actual column names from the DB.
 *
 * Input (POST): { projectId: string, characterId: string, chunkSize?: number }
 * Output: { ok: true, jobId: string, status: "queued" | "chunking" }
 *
 * GET /character-performance-bible-builder/{jobId}:
 *   status: "queued" | "chunking" | "complete" | "failed"
 *   If "complete": returns full bible content
 *   If "chunking": returns { currentChunk, totalChunks, processedScenes }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MODEL = "minimax/minimax-m2.7";
const DEFAULT_CHUNK_SIZE = 3; // 3 scenes per call - ~3500 chars prompt, ~4500 chars response, fits in 12k output

// -- Types ---------------------------------------------------------------------

interface BibleBuilderInput {
  projectId: string;
  characterId: string;
  chunkSize?: number;
}

interface SceneContext {
  sceneGraphId: string;
  sceneId: string;
  slugline: string;
  beat: string;
  emotionalState: string;
  content: string;
  allies: string[];
  antagonists: string[];
  tensionLevel: number;
}

interface BibleJobRecord {
  id: string;
  project_id: string;
  character_id: string;
  status: "queued" | "chunking" | "complete" | "failed";
  result_content: Record<string, unknown> | null;
  result_bible_id: string | null;
  result_version: number | null;
  result_hash: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// -- Hash ---------------------------------------------------------------------

async function computeHash(str: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeCombinedHash(hashes: string[]): Promise<string> {
  const sorted = [...new Set(hashes)].sort();
  return computeHash(sorted.join("|"));
}

// -- Prompt --------------------------------------------------------------------

function buildChunkPrompt(
  characterName: string,
  isProtagonist: boolean,
  protagonistName: string | null,
  scenes: SceneContext[],
): string {
  const sceneList = scenes
    .map((s, i) => {
      const tension =
        s.tensionLevel >= 8 ? "CRITICAL" :
        s.tensionLevel >= 6 ? "HIGH" :
        s.tensionLevel >= 4 ? "MODERATE" : "LOW";
      return `[SCENE ${i + 1}] ${s.slugline || s.sceneId}
  Beat: ${s.beat || "(none)"}
  Emotional State: ${s.emotionalState || "unspecified"} | Tension: ${tension}
  Allies: ${s.allies.join(", ") || "none"}
  Antagonists: ${s.antagonists.join(", ") || "none"}`;
    })
    .join("\n\n");

  return `You are a senior character director building a performance bible for an actor.

CHARACTER: ${characterName}${isProtagonist ? " * PROTAGONIST" : ""}${!isProtagonist && protagonistName ? ` (protagonist: ${protagonistName})` : ""}

SCENES (${scenes.length} total):
${sceneList}

TASK:
Step 1 - For each scene, generate a performance note:
  * performanceNote: 1-2 sentences of observable acting choice
  * emotionalObjective: what the character wants (verb + object)
  * physicalReaction: specific, observable physical behavior
  * unspokenThoughts: what the character thinks but never says
  * dramaticIrony: protagonist only - what audience knows that character doesn't
  * stageDirection: 1-2 sentence actionable direction for the actor

Step 2 - Synthesize into a performance bible:
  * PERFORMANCE THESIS: one paragraph directing thesis for the entire role
  * CORE TENSIONS (3-5): internal and external conflicts defining this character
  * EMOTIONAL RANGE (3-6): full emotional spectrum across the project
  * PHYSICAL MANNERISMS (3-5): specific observable physical choices
  * DIALOGUE VOICE: pace, register, 2-3 signature phrases
  * DIRECTING NOTES (2-4): what the director must know

Return a single JSON object:
{
  "sceneBreakdown": [
    {
      "sceneId": "string",
      "slugline": "string",
      "beat": "string",
      "emotionalState": "string",
      "performanceNote": "string",
      "emotionalObjective": "string",
      "physicalReaction": "string",
      "unspokenThoughts": "string",
      "dramaticIrony": "string | null",
      "stageDirection": "string"
    }
  ],
  "performanceThesis": "string",
  "coreTensions": ["string"],
  "emotionalRange": ["string"],
  "physicalMannerisms": ["string"],
  "dialogueVoice": {
    "pace": "string",
    "register": "string",
    "signaturePhrases": ["string"]
  },
  "directingNotes": ["string"]
}

sceneBreakdown must include ALL ${scenes.length} scenes in order.`;
}

// -- Helpers -------------------------------------------------------------------

function extractBeatDescription(beats: unknown): string {
  if (!Array.isArray(beats) || beats.length === 0) return "";
  const first = beats[0];
  if (typeof first !== "object" || first === null) return "";
  const b = first as Record<string, unknown>;
  return (
    (b.description as string | undefined) ??
    (b.beat as string | undefined) ??
    (b.emotional_state as string | undefined) ??
    (b.emotion as string | undefined) ??
    ""
  );
}

function extractEmotionalState(beats: unknown): string {
  if (!Array.isArray(beats) || beats.length === 0) return "";
  const first = beats[0];
  if (typeof first !== "object" || first === null) return "";
  const b = first as Record<string, unknown>;
  return (
    (b.emotional_state as string | undefined) ??
    (b.emotion as string | undefined) ??
    (b.description as string | undefined) ??
    ""
  );
}

// -- Process one chunk ---------------------------------------------------------

interface ChunkResult {
  sceneBreakdown: Array<Record<string, unknown>>;
  performanceThesis: string;
  coreTensions: string[];
  emotionalRange: string[];
  physicalMannerisms: string[];
  dialogueVoice: Record<string, unknown>;
  directingNotes: string[];
  sceneIds: string[];
}

async function processOneChunk(
  jobId: string,
  supabaseClient: ReturnType<typeof createClient>,
  scenes: SceneContext[],
  characterName: string,
  isProtagonist: boolean,
  protagonistName: string | null,
  abortController: AbortController,
): Promise<ChunkResult> {
  const prompt = buildChunkPrompt(characterName, isProtagonist, protagonistName, scenes);

  const llmResponse = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY") ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: Math.min(16000, Math.max(8000, scenes.length * 3500)),
    }),
    signal: abortController.signal,
  });

  if (!llmResponse.ok) {
    const errText = await llmResponse.text();
    throw new Error(`OpenRouter error ${llmResponse.status}: ${errText}`);
  }

  const llmData = await llmResponse.json();
  const rawContent = llmData.choices?.[0]?.message?.content ?? "";

  if (!rawContent || rawContent.trim().length === 0) {
    throw new Error("LLM returned empty response");
  }

  const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/\s*```$/s, "").trim();
  if (!cleaned) {
    throw new Error("LLM returned only whitespace/markdown");
  }
  let bibleJson: Record<string, unknown>;
  try {
    bibleJson = JSON.parse(cleaned);
  } catch (_) {
    throw new Error(`LLM returned invalid JSON (${cleaned.length} chars): ${cleaned.slice(0, 200)}`);
  }

  const llmBreakdown = (Array.isArray(bibleJson.sceneBreakdown) ? bibleJson.sceneBreakdown : []) as Array<Record<string, unknown>>;
  const dialogueVoice = (bibleJson.dialogueVoice as Record<string, unknown>) ?? {};

  return {
    sceneBreakdown: scenes.map((s, i) => {
      const llmScene = llmBreakdown[i] as Record<string, unknown> | undefined;
      return {
        sceneId: s.sceneId,
        slugline: s.slugline,
        beat: s.beat,
        emotionalState: s.emotionalState,
        performanceNote: (llmScene?.performanceNote as string | undefined) ?? "",
        emotionalObjective: (llmScene?.emotionalObjective as string | undefined) ?? "",
        physicalReaction: (llmScene?.physicalReaction as string | undefined) ?? "",
        unspokenThoughts: (llmScene?.unspokenThoughts as string | undefined) ?? "",
        dramaticIrony: llmScene?.dramaticIrony as string | undefined,
        stageDirection: (llmScene?.stageDirection as string | undefined) ?? (llmScene?.performanceNote as string | undefined) ?? "",
      };
    }),
    performanceThesis: (bibleJson.performanceThesis as string | undefined) ?? "",
    coreTensions: (Array.isArray(bibleJson.coreTensions) ? bibleJson.coreTensions : []) as string[],
    emotionalRange: (Array.isArray(bibleJson.emotionalRange) ? bibleJson.emotionalRange : []) as string[],
    physicalMannerisms: (Array.isArray(bibleJson.physicalMannerisms) ? bibleJson.physicalMannerisms : []) as string[],
    dialogueVoice: {
      pace: (dialogueVoice.pace as string | undefined) ?? "",
      register: (dialogueVoice.register as string | undefined) ?? "",
      signaturePhrases: (Array.isArray(dialogueVoice.signaturePhrases) ? dialogueVoice.signaturePhrases : []) as string[],
    },
    directingNotes: (Array.isArray(bibleJson.directingNotes) ? bibleJson.directingNotes : []) as string[],
    sceneIds: scenes.map((s) => s.sceneId),
  };
}

// -- Single-chunk processor (one chunk per invocation) -------------------------
// Each POST call processes ONE chunk, stores partial result, and returns.
// Caller is responsible for polling and calling back for subsequent chunks.

async function runSingleChunk(
  jobId: string,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<void> {
  const TIMEOUT_MS = 85000; // 85s per chunk - accommodates DB fetch (~35s) + LLM (~20-30s) for first chunk
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[t${Date.now()-t0}ms] ${msg}`);
  log(`start jobId=${jobId}`);
  const { data: job } = await supabaseClient
      .from("character_performance_bible_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) return;
    const j = job as BibleJobRecord;

    const { projectId, characterId } = { projectId: j.project_id, characterId: j.character_id };
    const chunkSize = DEFAULT_CHUNK_SIZE;

    // Get or resume chunk state from result_content
    const existingContent = (j.result_content ?? {}) as Record<string, unknown>;
    const chunkPartials = (existingContent.chunkPartials as ChunkResult[] | undefined) ?? [];
    const processedSceneIds = new Set<string>(chunkPartials.flatMap((c) => c.sceneIds));
    const totalScenes = (existingContent.totalScenes as number | undefined) ?? 0;
    const currentOffset = processedSceneIds.size;

    // -- 1. Fetch character entity (cached after first chunk) -------------
    let characterName = existingContent.characterName as string | undefined;
    let isProtagonistFlag = existingContent.isProtagonist as boolean | undefined;
    let protagonistNameVal = existingContent.protagonistName as string | null | undefined;
    let allSceneContexts: SceneContext[] = (existingContent.allSceneContexts as SceneContext[] | undefined) ?? [];

    if (!characterName) {
      const { data: characterEntity } = await supabaseClient
        .from("narrative_entities")
        .select("id, entity_key, canonical_name, entity_type, meta_json")
        .eq("id", characterId)
        .eq("project_id", projectId)
        .single();

      if (!characterEntity) {
        await supabaseClient.from("character_performance_bible_jobs")
          .update({ status: "failed", error: `Character not found: ${characterId}`, updated_at: new Date().toISOString() })
          .eq("id", jobId);
        return;
      }
      const ce = characterEntity as { entity_key: string; canonical_name: string; meta_json: Record<string, unknown> | null };
      characterName = ce.canonical_name || ce.entity_key || "Unknown";
      const metaJson = ce.meta_json ?? {};
      isProtagonistFlag = ce.entity_key.toLowerCase().includes("protagonist") || String(metaJson.isProtagonist) === "true";

      if (!isProtagonistFlag) {
        const { data: protags } = await supabaseClient
          .from("narrative_entities")
          .select("canonical_name, entity_key")
          .eq("project_id", projectId)
          .eq("entity_type", "character")
          .or(`entity_key.ilike.%protagonist%,meta_json.ilike.%isProtagonist%`);
        if (protags && protags.length > 0) {
          const p = protags[0] as { canonical_name?: string; entity_key?: string };
          protagonistNameVal = p.canonical_name || p.entity_key || null;
        }
        if (!protagonistNameVal) {
          const { data: rels } = await supabaseClient
            .from("narrative_entity_relations")
            .select("source_entity_id")
            .eq("project_id", projectId)
            .eq("target_entity_id", characterId)
            .eq("relation_type", "antagonist_of")
            .limit(1);
          if (rels && rels.length > 0) {
            const { data: source } = await supabaseClient
              .from("narrative_entities")
              .select("canonical_name")
              .eq("id", (rels[0] as { source_entity_id: string }).source_entity_id)
              .single();
            protagonistNameVal = (source as { canonical_name?: string })?.canonical_name ?? null;
          }
        }
      }
    }

    // -- 2. Fetch scene links (cached after first chunk) -----------------
    let sceneLinks: Array<{ scene_id: string; relation_type: string; entity_id: string }> = [];
    if (allSceneContexts.length === 0) {

      // -- Phase 3.1: Try character_scene_contexts cache first -------------
      const { data: cachedContexts, error: cacheErr } = await supabaseClient
        .from("character_scene_contexts")
        .select("id, scene_id, character_name, scene_number")
        .eq("character_id", characterId)
        .eq("project_id", projectId)
        .order("scene_number", { ascending: true, nullsFirst: false })
        .limit(200);
      console.log(`[csc] characterId=${characterId} cached=${cachedContexts?.length ?? 0} rows cacheErr=${cacheErr?.message}`);

      if (cachedContexts && cachedContexts.length > 0) {
        // Cache hit: build allSceneContexts from cached rows (NO DB fetching needed)
        allSceneContexts = (cachedContexts as Array<Record<string, unknown>>).map((c) => ({
          sceneGraphId: c.scene_id as string,
          sceneId: c.scene_id as string,
          slugline: (c.relationship_context as string | null)?.split(";")[0] ?? "",
          beat: (c.emotional_beat as string | null) ?? "",
          emotionalState: (c.emotional_state as string | null) ?? "",
          content: "",
          allies: (c.allies_in_scene as string[] | null) ?? [],
          antagonists: (c.antagonists_in_scene as string[] | null) ?? [],
          tensionLevel: (c.tension_level as number | null) ?? 5,
        }));
      }
    }

    // -- Fallback: if cache miss, build from scratch (original logic) -----
    // NOTE: This runs BEFORE the pre-write checkpoint so allSceneContexts is always populated first.
    if (allSceneContexts.length === 0) {
      const { data: links } = await supabaseClient
        .from("narrative_scene_entity_links")
        .select("scene_id, relation_type, entity_id")
        .eq("entity_id", characterId)
        .eq("project_id", projectId);

      if (!links || links.length === 0) {
        await supabaseClient.from("character_performance_bible_jobs")
          .update({ status: "failed", error: `No scenes linked to character ${characterId}`, updated_at: new Date().toISOString() })
          .eq("id", jobId);
        return;
      }
      sceneLinks = links as typeof sceneLinks;

      // -- 3. Fetch scene graph versions ---------------------------------
      const sceneIds = [...new Set(sceneLinks.map((l) => l.scene_id))];
      const { data: sceneGraphRows } = await supabaseClient
        .from("scene_graph_versions")
        .select("id, scene_id, slugline, beats, tension_delta")
        .eq("project_id", projectId)
        .in("scene_id", sceneIds)
        .is("superseded_at", null);

      if (!sceneGraphRows || sceneGraphRows.length === 0) {
        await supabaseClient.from("character_performance_bible_jobs")
          .update({ status: "failed", error: "No current scene graph versions found. Run Phase 3 first.", updated_at: new Date().toISOString() })
          .eq("id", jobId);
        return;
      }

      // -- 4. Build entity name map ---------------------------------------
      const otherEntityIds = sceneLinks
        .map((l) => l.entity_id)
        .filter((id) => id !== characterId);
      const { data: otherEntities } = await supabaseClient
        .from("narrative_entities")
        .select("id, canonical_name, entity_key")
        .in("id", [...new Set(otherEntityIds)]);
      const entityNameMap = new Map<string, string>();
      for (const e of otherEntities ?? []) {
        const eRaw = e as { id: string; canonical_name?: string; entity_key?: string };
        entityNameMap.set(eRaw.id, eRaw.canonical_name || eRaw.entity_key || "");
      }

      // -- 5. Assemble all scene contexts ---------------------------------
      allSceneContexts = (sceneGraphRows as Array<{
        id: string; scene_id: string; slugline: string | null;
        beats: unknown; tension_delta: number | null;
      }>).map((sg) => {
        const linksForScene = sceneLinks.filter((l) => l.scene_id === sg.scene_id);
        const allies: string[] = [];
        const antagonists: string[] = [];
        for (const link of linksForScene) {
          const name = entityNameMap.get(link.entity_id) ?? "";
          if (!name) continue;
          if (link.relation_type === "ally_of" || link.relation_type === "co_occurs") allies.push(name);
          if (link.relation_type === "antagonist_of") antagonists.push(name);
        }
        return {
          sceneGraphId: sg.id,
          sceneId: sg.scene_id,
          slugline: sg.slugline ?? "",
          beat: extractBeatDescription(sg.beats),
          emotionalState: extractEmotionalState(sg.beats),
          content: "",
          allies,
          antagonists,
          tensionLevel: sg.tension_delta ?? 5,
        };
      });

      allSceneContexts.sort((a, b) =>
        (a.slugline || a.sceneId).localeCompare(b.slugline || b.sceneId, undefined, { numeric: true })
      );
    }

    // -- Pre-write checkpoint (before LLM) - ensures offset advances even if post-LLM write fails --
    // Write current progress BEFORE LLM call. If Edge Runtime kills request after LLM succeeds,
    // next call will see this checkpoint and skip already-processed scenes (LLM is idempotent).
    const checkpointOffset = (existingContent?.lastProcessedOffset as number | undefined) ?? 0;

    // Always update checkpoint before LLM - includes allSceneContexts for subsequent calls
    await supabaseClient.from("character_performance_bible_jobs").update({
      status: "chunking",
      result_content: {
        ...(existingContent ?? {}),
        lastProcessedOffset: checkpointOffset, // checkpoint: we are ABOUT to process scene `checkpointOffset`
        totalScenes: allSceneContexts.length,
        characterName,
        isProtagonist: isProtagonistFlag,
        protagonistName: protagonistNameVal,
        chunkPartials: existingContent?.chunkPartials ?? [],
        allSceneContexts, // cache all contexts in result_content for subsequent calls
      },
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    // Re-read fresh from DB to get committed state after pre-write checkpoint
    const { data: freshJob } = await supabaseClient
      .from("character_performance_bible_jobs")
      .select("result_content")
      .eq("id", jobId)
      .single();
    const freshContent = (freshJob?.result_content ?? {}) as Record<string, unknown>;
    const continuationOffset = (freshContent.lastProcessedOffset as number | undefined) ?? 0;
    const freshPartials = (freshContent.chunkPartials as ChunkResult[] | undefined) ?? [];
    const localTotalScenes = allSceneContexts.length;

    if (localTotalScenes > 0 && continuationOffset >= localTotalScenes) {
      // All chunks done - finalize
      await finalizeBible(jobId, supabaseClient, freshContent, characterName!, isProtagonistFlag!, protagonistNameVal!, projectId, characterId, localTotalScenes);
      return;
    }

    // Process next chunk - use continuationOffset to handle DB commit lag
    const nextScenes = allSceneContexts.slice(continuationOffset, continuationOffset + chunkSize);
    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), TIMEOUT_MS);

    try {
      const chunkResult = await processOneChunk(
        jobId, supabaseClient, nextScenes,
        characterName!, isProtagonistFlag!, protagonistNameVal!,
        abortCtrl,
      );
      clearTimeout(timeoutId);

      // Append chunk result - use freshPartials from re-read DB state
      const updatedPartials = [...freshPartials, chunkResult];
      const newOffset = continuationOffset + nextScenes.length;
      const updatedContent = { ...freshContent, chunkPartials: updatedPartials, lastProcessedOffset: newOffset };

      // Check if more chunks remain
      if (newOffset >= allSceneContexts.length) {
        // All done - finalize
        await supabaseClient.from("character_performance_bible_jobs")
          .update({ result_content: updatedContent, updated_at: new Date().toISOString() })
          .eq("id", jobId);
        await finalizeBible(jobId, supabaseClient, updatedContent, characterName!, isProtagonistFlag!, protagonistNameVal!, projectId, characterId, allSceneContexts.length);
      } else {
        // More chunks remain - store partial and return
        // Caller should poll then call again with same jobId
        await supabaseClient.from("character_performance_bible_jobs")
          .update({
            status: "chunking",
            result_content: updatedContent,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    } catch (chunkErr) {
      clearTimeout(timeoutId);
      const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
      await supabaseClient.from("character_performance_bible_jobs")
        .update({ status: "failed", error: `Chunk failed: ${msg}`, updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }
}

// Finalize bible from all chunks

async function finalizeBible(
  jobId: string,
  supabaseClient: ReturnType<typeof createClient>,
  content: Record<string, unknown>,
  characterName: string,
  isProtagonist: boolean,
  protagonistName: string | null,
  projectId: string,
  characterId: string,
  totalScenes: number,
): Promise<void> {
  const partials = (content.chunkPartials as ChunkResult[] | undefined) ?? [];
  if (partials.length === 0) {
    await supabaseClient.from("character_performance_bible_jobs")
      .update({ status: "failed", error: "No chunks were processed", updated_at: new Date().toISOString() })
      .eq("id", jobId);
    return;
  }

  // Merge all scene breakdowns in order
  const allBreakdowns = partials.flatMap((p) => p.sceneBreakdown);
  const performanceThesis = partials[0]?.performanceThesis ?? "";
  const coreTensions = partials.flatMap((p) => p.coreTensions);
  const emotionalRange = partials.flatMap((p) => p.emotionalRange);
  const physicalMannerisms = partials.flatMap((p) => p.physicalMannerisms);
  const directingNotes = partials.flatMap((p) => p.directingNotes);
  const dialogueVoice = partials[0]?.dialogueVoice ?? { pace: "", register: "", signaturePhrases: [] };

  // De-duplicate arrays
  const dedup = <T>(arr: T[]): T[] => [...new Set(arr)];

  const finalContent = {
    characterName,
    characterId: (content.characterId as string) ?? "",
    isProtagonist,
    protagonistName,
    performanceThesis,
    coreTensions: dedup(coreTensions).slice(0, 10),
    emotionalRange: dedup(emotionalRange).slice(0, 10),
    physicalMannerisms: dedup(physicalMannerisms).slice(0, 10),
    dialogueVoice,
    sceneBreakdown: allBreakdowns,
    directingNotes: dedup(directingNotes).slice(0, 10),
    generatedAt: new Date().toISOString(),
  };

  // Compute hash from all scene IDs
  const sceneIds = allBreakdowns.map((b) => b.sceneId as string);
  const sceneHashes = await Promise.all(sceneIds.map((id) => computeHash(id)));
  const dependsOnHash = await computeCombinedHash([...sceneHashes, characterId]);

  // Get next version number
  const { data: versionRow } = await supabaseClient
    .from("character_performance_bibles")
    .select("version_number")
    .eq("project_id", projectId)
    .eq("character_id", characterId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = ((versionRow as { version_number?: number } | null)?.version_number ?? 0) + 1;

  // Insert new bible
  const { data: newBible, error: insertError } = await supabaseClient
    .from("character_performance_bibles")
    .insert({
      project_id: projectId,
      character_id: characterId,
      version_number: nextVersion,
      is_current: false,
      content: finalContent,
      depends_on_resolver_hash: dependsOnHash,
    })
    .select("id, version_number")
    .single();

  if (insertError) {
    await supabaseClient.from("character_performance_bible_jobs")
      .update({ status: "failed", error: `Insert failed: ${insertError.message}`, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    return;
  }

  // Demote old current and promote new
  if (nextVersion > 1) {
    await supabaseClient.from("character_performance_bibles")
      .update({ is_current: false })
      .eq("project_id", projectId)
      .eq("character_id", characterId)
      .eq("is_current", true);
  }
  await supabaseClient.from("character_performance_bibles")
    .update({ is_current: true })
    .eq("id", newBible.id);

  await supabaseClient.from("character_performance_bible_jobs")
    .update({
      status: "complete",
      result_content: finalContent,
      result_bible_id: newBible.id,
      result_version: newBible.version_number,
      result_hash: dependsOnHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

// -- Main serve -----------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const url = new URL(req.url);

  // GET /character-performance-bible-builder/{jobId} - poll for status
  const jobIdMatch = url.pathname.match(/\/character-performance-bible-builder\/([\w-]+)$/);
  if (req.method === "GET" && jobIdMatch) {
    const jobId = jobIdMatch[1];
    const { data: job } = await supabaseClient
      .from("character_performance_bible_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) {
      return Response.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    const j = job as BibleJobRecord;
    if (j.status === "complete") {
      const content = (j.result_content ?? {}) as Record<string, unknown>;
      return Response.json({
        ok: true,
        status: "complete",
        bibleId: j.result_bible_id,
        version: j.result_version,
        content: j.result_content,
        dependsOnHash: j.result_hash,
        sceneCount: (content.sceneBreakdown as unknown[])?.length ?? 0,
      }, { headers: corsHeaders });
    } else if (j.status === "failed") {
      return Response.json({ ok: false, status: "failed", error: j.error }, { status: 500 });
    } else if (j.status === "chunking") {
      const content = (j.result_content ?? {}) as Record<string, unknown>;
      const partials = (content.chunkPartials as ChunkResult[] | undefined) ?? [];
      const processedScenes = partials.flatMap((p) => p.sceneIds).length;
      const totalScenes = (content.totalScenes as number | undefined) ?? 0;
      const chunksDone = partials.length;
      const chunkSize = DEFAULT_CHUNK_SIZE;
      const totalChunks = Math.ceil(totalScenes / chunkSize);
      return Response.json({
        ok: true,
        status: "chunking",
        jobId: j.id,
        currentChunk: chunksDone + 1,
        totalChunks,
        processedScenes,
        totalScenes,
        callAgain: j.status === "chunking",
      }, { headers: corsHeaders });
    } else {
      return Response.json({ ok: true, status: j.status, jobId: j.id });
    }
  }

  // POST - create job and start chunked processing
  if (req.method === "POST") {
    let body: BibleBuilderInput;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const { projectId, characterId } = body;
    if (!projectId || !characterId) {
      return Response.json({ ok: false, error: "projectId and characterId are required" }, { status: 400 });
    }

    // Check if job already exists for this character (resume)
    const { data: existingJob } = await supabaseClient
      .from("character_performance_bible_jobs")
      .select("id, status, result_content")
      .eq("project_id", projectId)
      .eq("character_id", characterId)
      .in("status", ["queued", "chunking"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJob) {
      // Resume existing job - process ONE chunk and return updated state
      const ej = existingJob as { id: string; status: string; result_content: Record<string, unknown> | null };
      if (ej.status === "queued" || ej.status === "chunking") {
        const content = (ej.result_content ?? {}) as Record<string, unknown>;
        const partials = (content.chunkPartials as ChunkResult[] | undefined) ?? [];
        const totalScenes = (content.totalScenes as number | undefined) ?? 0;
        const bgClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        await runSingleChunk(ej.id, bgClient);
        // Re-fetch to get post-chunk status
        const { data: updatedJob } = await supabaseClient
          .from("character_performance_bible_jobs")
          .select("status, result_bible_id, result_version, result_content, result_hash, error")
          .eq("id", ej.id)
          .single();
        if (updatedJob) {
          const uj = updatedJob as { status: string; result_bible_id: string | null; result_version: number | null; result_content: Record<string, unknown> | null; result_hash: string | null; error: string | null };
          if (uj.status === "complete") {
            const ucontent = (uj.result_content ?? {}) as Record<string, unknown>;
            return Response.json({
              ok: true, status: "complete",
              bibleId: uj.result_bible_id, version: uj.result_version,
              content: uj.result_content, dependsOnHash: uj.result_hash,
              sceneCount: (ucontent.sceneBreakdown as unknown[])?.length ?? 0,
            }, { headers: corsHeaders });
          } else if (uj.status === "failed") {
            return Response.json({ ok: false, status: "failed", error: uj.error }, { status: 500, headers: corsHeaders });
          } else {
            const upartials = ((uj.result_content ?? {}) as Record<string, unknown>);
            const p2 = (upartials.chunkPartials as ChunkResult[] | undefined) ?? [];
            const done = p2.flatMap((p) => p.sceneIds).length;
            return Response.json({
              ok: true, status: uj.status, jobId: ej.id,
              currentChunk: p2.length + 1,
              totalChunks: Math.ceil(totalScenes / DEFAULT_CHUNK_SIZE),
              processedScenes: done,
              totalScenes,
              callAgain: true,
            }, { headers: corsHeaders });
          }
        }
      }
      return Response.json({ ok: true, jobId: ej.id, status: ej.status, resumed: true });
    }

    // Create new job
    const jobId = crypto.randomUUID();
    const { error: jobError } = await supabaseClient
      .from("character_performance_bible_jobs")
      .insert({
        id: jobId,
        project_id: projectId,
        character_id: characterId,
        status: "queued",
        result_content: { projectId, characterId },
      });

    if (jobError) {
      return Response.json({ ok: false, error: `Failed to create job: ${jobError.message}` }, { status: 500 });
    }

    // Process first chunk synchronously, then return current state
    const bgClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    await runSingleChunk(jobId, bgClient);

    // Return current status
    const { data: finishedJob } = await supabaseClient
      .from("character_performance_bible_jobs")
      .select("status, result_bible_id, result_version, result_content, result_hash, error")
      .eq("id", jobId)
      .single();

    if (!finishedJob) {
      return Response.json({ ok: false, error: "Job not found after processing" }, { status: 404 });
    }
    const fj = finishedJob as { status: string; result_bible_id: string | null; result_version: number | null; result_content: Record<string, unknown> | null; result_hash: string | null; error: string | null };

    if (fj.status === "complete") {
      const content = (fj.result_content ?? {}) as Record<string, unknown>;
      return Response.json({
        ok: true, status: "complete",
        bibleId: fj.result_bible_id, version: fj.result_version,
        content: fj.result_content, dependsOnHash: fj.result_hash,
        sceneCount: (content.sceneBreakdown as unknown[])?.length ?? 0,
      }, { headers: corsHeaders });
    } else if (fj.status === "failed") {
      return Response.json({ ok: false, status: "failed", error: fj.error }, { status: 500 });
    } else {
      const content = (fj.result_content ?? {}) as Record<string, unknown>;
      const partials = (content.chunkPartials as ChunkResult[] | undefined) ?? [];
      const processedScenes = partials.flatMap((p) => p.sceneIds).length;
      const totalScenes = (content.totalScenes as number | undefined) ?? 0;
      const chunksDone = partials.length;
      const totalChunks = Math.ceil(totalScenes / DEFAULT_CHUNK_SIZE);
      return Response.json({
        ok: true, status: fj.status, jobId,
        currentChunk: chunksDone + 1, totalChunks,
        processedScenes, totalScenes,
        callAgain: true,
      }, { headers: corsHeaders });
    }
  }

  return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
});
