// @ts-nocheck
/**
 * narrativebeat-atomiser — Hybrid Deterministic Extraction (D2)
 *
 * Extracts key experiential story beats — memorable moments that deliver
 * emotional impact, revelation, or tonal shift.
 *
 * Architecture:
 *   LLM → ordered string array of beat names (low responsibility)
 *   TypeScript → scene matching, spans, function, summary, dedup (high responsibility)
 *   Fallback → deterministic scene bucketing when LLM returns empty
 *
 * Actions:
 *   extract      — LLM-derive key narrative beats from scene data → create structured atoms
 *   generate     — LLM-generate rich beat attributes (background)
 *   status       — return all narrativebeat atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recoverStaleRunning } from "../_shared/stale-running-recovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function makeAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function fetchSceneData(admin: any, projectId: string) {
  const { data: enrichments } = await admin
    .from("scene_enrichment")
    .select("scene_id, scene_slugline, tension_level, emotional_tone, narrative_momentum, narrative_beat")
    .eq("project_id", projectId)
    .order("tension_level", { ascending: false })
    .limit(80);

  const { data: sceneVersions } = await admin
    .from("scene_graph_versions")
    .select("scene_id, slugline, summary, content, characters_present, tension_delta, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (enrichments && enrichments.length > 0) {
    const versionMap = new Map((sceneVersions || []).map((s: any) => [s.scene_id, s]));
    const scenes = enrichments.map((e: any) => ({
      ...e,
      content: versionMap.get(e.scene_id)?.content || "",
      slugline: e.scene_slugline || versionMap.get(e.scene_id)?.slugline || e.scene_id,
    }));
    return { scenes };
  }

  const { data: vebDocs } = await admin
    .from("project_documents")
    .select("id, latest_version_id")
    .eq("project_id", projectId)
    .eq("doc_type", "vertical_episode_beats");

  if (vebDocs && vebDocs.length > 0 && vebDocs[0].latest_version_id) {
    const { data: version } = await admin
      .from("project_document_versions")
      .select("plaintext")
      .eq("id", vebDocs[0].latest_version_id)
      .single();

    if (version?.plaintext) {
      const episodeRegex = /^##\s*EPISODE\s+(\d+)[:\s]+(.+)$/gm;
      const episodes: Array<{ num: number; title: string; content: string }> = [];
      let match: RegExpExecArray | null;
      let currentEpisode: { num: number; title: string; startIdx: number } | null = null;

      while ((match = episodeRegex.exec(version.plaintext)) !== null) {
        if (currentEpisode) {
          episodes.push({
            num: currentEpisode.num,
            title: currentEpisode.title,
            content: version.plaintext.slice(currentEpisode.startIdx, match.index).trim(),
          });
        }
        currentEpisode = { num: parseInt(match[1], 10), title: match[2].trim(), startIdx: match.index };
      }
      if (currentEpisode) {
        episodes.push({
          num: currentEpisode.num,
          title: currentEpisode.title,
          content: version.plaintext.slice(currentEpisode.startIdx).trim(),
        });
      }

      const scenes = episodes.map((ep) => ({
        scene_id: `veb_episode_${ep.num}`,
        slugline: ep.title,
        content: ep.content,
        summary: ep.content.substring(0, 300),
        tension_level: 5,
        emotional_tone: "",
        narrative_momentum: "medium",
        narrative_beat: ep.title,
        episode_number: ep.num,
      }));
      return { scenes };
    }
  }

  // Fallback: use raw scene_graph_versions when enrichment is not available
  if (sceneVersions && sceneVersions.length > 0) {
    const scenes = sceneVersions.map((s: any, i: number) => ({
      scene_id: s.scene_id,
      scene_index: i + 1,
      slugline: s.slugline || s.scene_id,
      content: s.content || "",
      summary: (s.summary || s.content || "").substring(0, 300),
      characters_present: s.characters_present || [],
      tension_delta: s.tension_delta ?? null,
      narrative_position: `${i + 1}/${sceneVersions.length}`,
      source: "scene_graph_versions",
    }));

    return { scenes };
  }

  return { scenes: [] };
}

// ── Helper: text normalisation ──

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(the|a|an|of|and|in|to|for|is|at|on|its|with|from|by|that|this|are|was|were|been|has|had|have|does|did|do|will|would|shall|should|may|might|can|could|not|no|nor)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(/\s+/).filter(Boolean);
}

// ── Helper: assign function by narrative position ──

function computeFunction(beatIndex: number, totalBeats: number): string {
  const pct = ((beatIndex + 0.5) / totalBeats) * 100;
  if (pct <= 10) return "setup";
  if (pct <= 20) return "inciting_incident";
  if (pct <= 45) return "development";
  if (pct <= 60) return "midpoint_or_reversal";
  if (pct <= 80) return "escalation";
  if (pct <= 95) return "climax";
  return "resolution";
}

// ── Helper: scene span overlap ratio ──

function sceneSpanOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
  if (overlap <= 0) return 0;
  const aSpan = aEnd - aStart + 1;
  const bSpan = bEnd - bStart + 1;
  return overlap / Math.min(aSpan, bSpan);
}

// ── Helper: match a beat name to the best scene index ──

function matchBeatToScene(
  beatName: string,
  scenes: any[],
  beatIndex: number,
  totalBeats: number,
  isFallback: boolean,
): number {
  const beatTokens = tokenize(beatName);
  const expectedPosition = totalBeats > 1 ? (beatIndex / (totalBeats - 1)) * (scenes.length - 1) : 0;

  // If no tokens or fallback mode, use pure positional assignment
  if (beatTokens.length === 0 || isFallback) {
    return Math.max(0, Math.min(scenes.length - 1, Math.round(expectedPosition)));
  }

  let bestScore = -Infinity;
  let bestIdx = Math.round(expectedPosition);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    let score = 0;

    // Position bias: prefer scenes near expected position
    const posDistance = Math.abs(i - expectedPosition);
    const posScore = scenes.length > 1 ? Math.max(0, 1 - posDistance / (scenes.length * 0.5)) : 1;
    score += posScore * 0.3;

    // Slugline match (highest weight per token)
    const slugTokens = tokenize(scene.slugline || "");
    for (const bt of beatTokens) {
      if (slugTokens.some((st: string) => st.includes(bt) || bt.includes(st))) {
        score += 0.35;
      }
    }

    // Summary match
    const summaryText = normalize(scene.summary || "");
    for (const bt of beatTokens) {
      if (summaryText.includes(bt)) {
        score += 0.15;
      }
    }

    // Content excerpt match
    const contentText = normalize((scene.content || "").substring(0, 500));
    for (const bt of beatTokens) {
      if (contentText.includes(bt)) {
        score += 0.1;
      }
    }

    // Characters_present match
    const chars = scene.characters_present || [];
    const charList = Array.isArray(chars)
      ? chars.map((c: any) => normalize(typeof c === "string" ? c : String(c)))
      : [];
    for (const bt of beatTokens) {
      if (charList.some((c: string) => c.includes(bt) || bt.includes(c))) {
        score += 0.1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return Math.max(0, Math.min(scenes.length - 1, bestIdx));
}

// ── Helper: generate scenes context for LLM prompt ──

function buildSceneContexts(scenes: any[]): string {
  return scenes.map((s: any, i: number) => {
    const idx = s.scene_index ?? (i + 1);
    const chars = s.characters_present?.length
      ? ` [${(Array.isArray(s.characters_present) ? s.characters_present : []).slice(0, 4).join(",")}]`
      : "";
    const tension = s.tension_delta != null ? ` tension=${Number(s.tension_delta).toFixed(2)}` : "";
    return `[Scene ${idx}/${scenes.length}]${chars}${tension} ${s.slugline}: ${(s.summary || s.content || "").substring(0, 200)}`;
  }).join("\n\n");
}

// ── Helper: deterministic fallback — create beat names from scene buckets ──

function deterministicSceneBucketFallback(scenes: any[]): string[] {
  const totalScenes = scenes.length;
  if (totalScenes === 0) return [];

  // Target 18-25 beats
  const targetBeats = Math.max(18, Math.min(25, Math.ceil(totalScenes / 4)));
  const beats: string[] = [];

  for (let b = 0; b < targetBeats; b++) {
    const startIdx = Math.floor((b / targetBeats) * totalScenes);
    const endIdx = Math.floor(((b + 1) / targetBeats) * totalScenes) - 1;
    const bucket = scenes.slice(startIdx, endIdx + 1);

    // Pick scene with highest tension_delta within bucket
    let bestScene = bucket[0] || scenes[startIdx];
    let bestTension = -Infinity;
    for (const sc of bucket) {
      const td = sc.tension_delta != null ? Number(sc.tension_delta) : -1;
      if (td > bestTension) {
        bestTension = td;
        bestScene = sc;
      }
    }

    // Generate beat name from slugline
    let name = (bestScene.slugline || "").trim();
    // Clean up slugline to a beat name
    name = name
      .replace(/^(INT\.|EXT\.|INT\/EXT\.)\s*/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Title case
    name = name.replace(/\b\w/g, (c) => c.toUpperCase());
    // Fallback if empty
    if (!name) name = `Scene ${b + 1}`;

    beats.push(name);
  }

  return beats;
}

// ── Helper: structure beat names into full beat objects ──

function structureBeats(
  beatNames: string[],
  scenes: any[],
  source: string,
  extractionVersion: string,
  confidence: number,
  isFallback: boolean,
): Array<{
  stable_key: string;
  name: string;
  normalized_name: string;
  scene_start: number;
  scene_end: number;
  scene_ids: string[];
  function: string;
  summary: string;
  source: string;
  extraction_version: string;
  scene_projection_version: string;
  narrative_inputs: string[];
  narrative_outputs: string[];
  depends_on: string[];
  enables: string[];
  character_state_delta: string[];
  world_state_delta: string[];
  revelations: string[];
  promises_made: string[];
  promises_paid_off: string[];
  confidence: number;
}> {
  const totalBeats = beatNames.length;
  if (totalBeats === 0) return [];
  if (!scenes || scenes.length === 0) {
    throw new Error("No ordered scenes available for narrative beat extraction");
  }

  // Phase 2a: match each beat to its best scene
  const matchedSceneIndices: number[] = beatNames.map((name, i) =>
    matchBeatToScene(name, scenes, i, totalBeats, isFallback)
  );

  // Sort matched indices to ensure monotonic ordering (scene order should follow beat order)
  const sortedIndices = [...matchedSceneIndices].sort((a, b) => a - b);
  // Apply sorted positions — beats are expected in story order
  // NOTE: Use iterative for loop, NOT .map(). The .map() callback creates a TDZ
  // crash by referencing orderedIndices[i-1] before const initialization completes.
  const orderedIndices: number[] = [];
  for (let i = 0; i < matchedSceneIndices.length; i++) {
    const prevEnd = i > 0 ? orderedIndices[i - 1] : -1;
    const rawIdx = sortedIndices[Math.min(i, sortedIndices.length - 1)];
    orderedIndices.push(Math.max(prevEnd, rawIdx));
  }

  // Phase 2b: assign scene spans
  const structuredBeats = beatNames.map((name: any, i: number) => {
    const sceneStart = orderedIndices[i];
    const sceneEnd = i < totalBeats - 1
      ? Math.max(sceneStart, Math.min(orderedIndices[i + 1] - 1, scenes.length - 1))
      : scenes.length - 1;

    const matchedScene = scenes[sceneStart] || null;
    const sceneIds: string[] = [];
    for (let si = sceneStart; si <= sceneEnd && si < scenes.length; si++) {
      if (scenes[si]?.scene_id) sceneIds.push(scenes[si].scene_id);
    }

    const norm = normalize(name).slice(0, 40);
    const stableKey = `beat_${String(i).padStart(3, "0")}_${norm.replace(/\s+/g, "_")}`;

    return {
      stable_key: stableKey,
      name,
      normalized_name: norm,
      scene_start: sceneStart,
      scene_end: sceneEnd,
      scene_ids: sceneIds,
      function: computeFunction(i, totalBeats),
      summary: matchedScene ? (matchedScene.summary || (matchedScene.content || "").substring(0, 200) || "") : "",
      source,
      extraction_version: extractionVersion,
      confidence,
      scene_projection_version: "scene_graph_versions_current",
      narrative_inputs: [],
      narrative_outputs: [],
      depends_on: [],
      enables: [],
      character_state_delta: [],
      world_state_delta: [],
      revelations: [],
      promises_made: [],
      promises_paid_off: [],
    };
  });

  return structuredBeats;
}

// ── Phase 1-3: LLM extraction with fallback ──

async function extractBeatNames(
  scenes: any[],
  openrouterKey: string,
): Promise<{ names: string[]; source: string; version: string; confidence: number; llmEmpty: boolean }> {
  const totalScenes = scenes.length;
  const sceneContexts = buildSceneContexts(scenes);

  const prompt = `You are a story beat analyst for a feature film.

Analyze these ${totalScenes} scenes and identify the 18-25 key narrative beats in story order.

Return ONLY a JSON array of beat name strings, like:
["Opening Ruins", "The Gate Is Discovered", "Kristina Enters the Ruins"]

Rules:
- 18-25 beat names for this ${totalScenes}-scene feature film
- ordered by story sequence
- short canonical names (2-7 words each)
- cover the entire film from opening to resolution
- JSON array of strings only — no objects, no markdown, no explanations

SCENE DATA:
${sceneContexts}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://iffy-analysis.vercel.app",
      "X-Title": "IFFY NarrativeBeat Atomiser",
    },
    body: JSON.stringify({
      model: "minimax/minimax-m2.7",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`);
  }

  const aiData = await response.json();
  const rawContent = aiData.choices?.[0]?.message?.content || "";

  // Phase 2: Parse string array
  if (rawContent.trim()) {
    try {
      const cleaned = rawContent
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate: all items are strings
        const allStrings = parsed.every((item: any) => typeof item === "string");
        if (allStrings) {
          return {
            names: parsed.slice(0, 30),
            source: "scene_graph_versions",
            version: "hybrid_v1_llm",
            confidence: 0.85,
            llmEmpty: false,
          };
        }
      }
    } catch {
      // Parse failed — fall through to fallback
    }
  }

  // Phase 3: Empty/invalid response → deterministic fallback
  const fallbackNames = deterministicSceneBucketFallback(scenes);
  return {
    names: fallbackNames,
    source: "scene_graph_versions",
    version: "hybrid_v1_fallback",
    confidence: 0.45,
    llmEmpty: true,
  };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { scenes } = await fetchSceneData(admin, projectId);
  if (scenes.length === 0) {
    return { error: "no_scenes", message: "No scene enrichment data found. Run scene enrichment first." };
  }

  // Determine if scenes are from enrichment or raw fallback
  const hasEnrichment = scenes.length > 0 && "narrative_momentum" in scenes[0];
  const candidateScenes = hasEnrichment
    ? scenes
        .filter((s: any) => s.narrative_momentum === "high" || s.narrative_momentum === "peak" || (s.tension_level && s.tension_level >= 7))
        .slice(0, 30)
    : (() => {
        // Deterministic sampling: take every-N scenes across full film
        if (scenes.length <= 35) return scenes.slice();
        const step = Math.max(1, Math.floor(scenes.length / 35));
        const sampled = scenes.filter((_: any, i: number) => i % step === 0);
        if (sampled[sampled.length - 1]?.scene_id !== scenes[scenes.length - 1]?.scene_id) sampled.push(scenes[scenes.length - 1]);
        return sampled;
      })();

  // ── Phase 1 + 3: Extract beat names (LLM with deterministic fallback) ──
  const { names: beatNames, source, version, confidence: baseConfidence, llmEmpty } =
    await extractBeatNames(candidateScenes, openrouterKey);

  if (beatNames.length === 0) {
    return { error: "no_beats", message: "Could not determine narrative beats from scene data." };
  }

  // ── Phase 2: Structure beats deterministically ──
  const isFallback = llmEmpty;
  const structuredBeats = structureBeats(
    beatNames,
    candidateScenes,
    source,
    version,
    baseConfidence,
    isFallback,
  );

  // ── Phase 4: Semantic dedup ──
  const existingRows = await admin
    .from("atoms").select("id, canonical_name, attributes")
    .eq("project_id", projectId).eq("atom_type", "narrativebeat");

  const existingBeats = (existingRows.data || []) as Array<{
    id: string;
    canonical_name: string;
    attributes: Record<string, any>;
  }>;

  const newBeats: typeof structuredBeats = [];
  let duplicateSkipped = 0;

  for (const beat of structuredBeats) {
    let isDuplicate = false;

    for (const existing of existingBeats) {
      const exAttrs = existing.attributes || {};
      const exKey = exAttrs.stable_key || "";
      const exNorm = normalize(existing.canonical_name);
      const exStart = typeof exAttrs.scene_start === "number" ? exAttrs.scene_start : 0;
      const exEnd = typeof exAttrs.scene_end === "number" ? exAttrs.scene_end : 0;

      // Check 1: same stable_key
      if (exKey && beat.stable_key === exKey) {
        isDuplicate = true;
        break;
      }

      // Check 2: normalized name match
      if (exNorm && beat.normalized_name === exNorm) {
        isDuplicate = true;
        break;
      }

      // Check 3: function + summary similarity
      const exFunc = exAttrs.function || "";
      const exSummary = normalize(exAttrs.summary || "");
      const beatSummary = normalize(beat.summary);
      if (exFunc && beat.function === exFunc && exSummary && beatSummary) {
        // Check if summaries share significant overlap
        const exWords = new Set(exSummary.split(/\s+/).filter(Boolean));
        const beatWords = beatSummary.split(/\s+/).filter(Boolean);
        const shared = beatWords.filter(w => exWords.has(w)).length;
        const totalWords = Math.max(beatWords.length, exWords.size);
        if (totalWords > 0 && shared / totalWords >= 0.3) {
          isDuplicate = true;
          break;
        }
      }


      // Check 4: scene span overlap > 0.6
      if (exStart !== undefined && exEnd !== undefined) {
        if (sceneSpanOverlap(beat.scene_start, beat.scene_end, exStart, exEnd) > 0.6) {
          isDuplicate = true;
          break;
        }
      }

      // Check 5: scene_ids overlap substantially
      const exSceneIds = exAttrs.scene_ids || [];
      if (Array.isArray(beat.scene_ids) && Array.isArray(exSceneIds) && beat.scene_ids.length > 0 && exSceneIds.length > 0) {
        const shared = beat.scene_ids.filter((id: string) => exSceneIds.includes(id));
        if (shared.length >= Math.min(beat.scene_ids.length, exSceneIds.length) * 0.5) {
          isDuplicate = true;
          break;
        }
      }
    }

    if (!isDuplicate) {
      newBeats.push(beat);
    } else {
      duplicateSkipped++;
    }
  }

  if (newBeats.length === 0) {
    return { created: 0, duplicate_skipped: duplicateSkipped, message: "All beats already exist (semantic dedup)" };
  }

  // ── Phase 5: Insert ──
  const now = new Date().toISOString();
  const toInsert = newBeats.map((beat: typeof structuredBeats[0], i: number) => ({
    project_id: projectId,
    atom_type: "narrativebeat",
    entity_id: null,
    canonical_name: beat.name,
    priority: 80 - i * 5,
    confidence: Math.round((beat.confidence || 0.45) * 100),
    readiness_state: "stub",
    generation_status: "pending",
    attributes: {
      stable_key: beat.stable_key,
      beatName: beat.name,
      normalized_name: beat.normalized_name,
      scene_start: beat.scene_start,
      scene_end: beat.scene_end,
      scene_ids: beat.scene_ids,
      function: beat.function,
      summary: beat.summary,
      source: beat.source,
      extraction_version: beat.extraction_version,
      confidence: beat.confidence,
      readinessBadge: "foundation",
      generationStatus: "pending",
      scene_projection_version: beat.scene_projection_version,
      narrative_inputs: beat.narrative_inputs,
      narrative_outputs: beat.narrative_outputs,
      depends_on: beat.depends_on,
      enables: beat.enables,
      character_state_delta: beat.character_state_delta,
      world_state_delta: beat.world_state_delta,
      revelations: beat.revelations,
      promises_made: beat.promises_made,
      promises_paid_off: beat.promises_paid_off,
    },
    created_at: now,
    updated_at: now,
  }));

  const { data: inserted, error } = await admin.from("atoms").insert(toInsert).select("id");
  if (error) throw new Error(`Failed to insert narrativebeat atoms: ${error.message}`);

  return {
    created: inserted?.length || 0,
    duplicate_skipped: duplicateSkipped,
    beats: newBeats.map((b) => b.name),
    llm_empty: llmEmpty,
    extraction_source: version,
    scene_coverage: `${newBeats[0]?.scene_start}-${newBeats[newBeats.length - 1]?.scene_end}`,
    scene_count: candidateScenes.length,
    beat_count: newBeats.length,
    first_five: newBeats.slice(0, 5).map((b: any) => `[s${b.scene_start}] ${b.name}`),
    last_five: newBeats.slice(-5).map((b: any) => `[s${b.scene_start}] ${b.name}`),
  };
}

async function handleStatus(projectId: string) {
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale narrativebeat atoms on status check");
  }

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  // P0.1: Auto-recover stale running atoms
  const staleRecovery = await recoverStaleRunning(admin, projectId, "narrativebeat").catch(() => ({ recovered: 0 }));
  if (staleRecovery.recovered > 0) {
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale narrativebeat atoms on status check");
  }

  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId).eq("atom_type", "narrativebeat")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to reset: ${error.message}`);
  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms").select("id, canonical_name, attributes")
    .eq("project_id", projectId).eq("atom_type", "narrativebeat").eq("generation_status", "pending");
  if (fetchErr) throw new Error(`Failed to fetch: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) return { spawned: false, message: "No pending narrativebeat atoms" };

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { scenes } = await fetchSceneData(admin, projectId);
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  if (typeof EdgeRuntime !== "undefined") {
    // @ts-ignore
    EdgeRuntime.waitUntil(
      (async () => {
        for (const atom of pendingAtoms) {
          try {
            const relevantScenes = scenes
              .filter((s: any) => {
                const summary = (s.summary || "").toLowerCase();
                const content = (s.content || "").toLowerCase();
                const beat = atom.canonical_name.toLowerCase();
                return summary.includes(beat.substring(0, 10)) || content.includes(beat.substring(0, 10));
              })
              .slice(0, 5);

            const sceneContext = relevantScenes.length > 0
              ? relevantScenes.map((s: any) => `[${s.slugline}]: ${(s.summary || s.content || "").substring(0, 300)}`).join("\n\n")
              : scenes.slice(0, 3).map((s: any) => `[${s.slugline}]: ${(s.summary || s.content || "").substring(0, 200)}`).join("\n\n");

            const prompt = `You are a story beat analyst. Generate rich attributes for the narrative beat: "${atom.canonical_name}".

This beat appears in the context of these scenes:\n${sceneContext}\n
Output ONLY a valid JSON object (no markdown, no commentary) with these fields:
- emotionalImpact (string: what the audience feels at this beat)
- charactersInvolved (array of 1-4 character names)
- narrativeMomentum (string: low | medium | high | peak)
- confidence (number 0.0-1.0)
Keep it concise. Valid JSON only.`;

            const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://iffy-analysis.vercel.app", "X-Title": "IFFY NarrativeBeat Atomiser" },
              body: JSON.stringify({ model: "minimax/minimax-m2.7", messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 800 }),
            });

            if (!resp.ok) {
              await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
              continue;
            }

            const aiData = await resp.json();
            let attrs: Record<string, any> = {};
            try {
              const cleaned = (aiData.choices?.[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
              attrs = JSON.parse(cleaned);
            } catch {
              await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
              continue;
            }

            const finalAttributes = { ...attrs, beatName: atom.canonical_name, generationStatus: "completed", beatType: attrs.beatType || "revelation", structuralFunction: attrs.structuralFunction || "development", narrativeMomentum: attrs.narrativeMomentum || "medium", confidence: attrs.confidence || 0.7, readinessBadge: attrs.readinessBadge || "foundation" };
            await admin.from("atoms").update({
              generation_status: "complete", readiness_state: "generated",
              confidence: Math.round((attrs.confidence || 0.5) * 100),
              attributes: finalAttributes, updated_at: new Date().toISOString(),
            }).eq("id", atom.id);

            console.log(`Generated narrativebeat: ${atom.canonical_name}`);
          } catch (err) {
            console.error(`Error for narrativebeat ${atom.id}:`, err);
            await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
          }
        }
      })()
    );
  }

  return { spawned: true, count: pendingAtoms.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { action, project_id: projectId } = body;
    if (!projectId) return new Response(JSON.stringify({ error: "Missing project_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!action) return new Response(JSON.stringify({ error: "Missing action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    let result: any;
    switch (action) {
      case "extract": result = await handleExtract(projectId); break;
      case "generate": result = await handleGenerate(projectId); break;
      case "status": result = await handleStatus(projectId); break;
            case "reset-failed":
        result = await handleResetFailed(projectId);
        break;
case "reset_failed": result = await handleResetFailed(projectId); break;
      default: return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("narrativebeat-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
