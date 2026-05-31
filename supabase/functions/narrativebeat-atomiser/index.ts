// @ts-nocheck
/**
 * narrativebeat-atomiser — Phase 5
 *
 * Extracts key experiential story beats — memorable moments that deliver
 * emotional impact, revelation, or tonal shift.
 *
 * Actions:
 *   extract      — LLM-derive key narrative beats from scene enrichment data → create stubs
 *   generate     — LLM-generate rich beat attributes (background)
 *   status       — return all narrativebeat atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        // For >45 scenes, sample evenly to fit token limits
        if (scenes.length <= 35) return scenes.slice();
        // Deterministic: take step-sized samples for even coverage
        const step = Math.max(1, Math.floor(scenes.length / 35));
        const sampled = scenes.filter((_: any, i: number) => i % step === 0);
        // Always include last scene
        if (sampled[sampled.length - 1]?.scene_id !== scenes[scenes.length - 1]?.scene_id) sampled.push(scenes[scenes.length - 1]);
        return sampled;
      })()

  // ── PHASE 3 — Deterministic LLM extraction ──
  // Build scene context with narrative position and scene_number
  const sceneContexts = candidateScenes.map((s: any, i: number) => {
    const idx = s.scene_index ?? (i + 1);
    const chars = s.characters_present?.length ? ` chars=[${s.characters_present.slice(0, 4).join(",")}]` : "";
    const tension = s.tension_delta != null ? ` tension=${s.tension_delta.toFixed(2)}` : "";
    return `[Scene ${idx}/${candidateScenes.length}]${chars}${tension} ${s.slugline}: ${(s.summary || s.content || "").substring(0, 200)}`;
  }).join("\n\n");

  const totalScenes = candidateScenes.length;
  const extractPrompt = `You are a story beat analyst. Return a JSON array of beat objects from these scenes (18-25 beats preferred). Example: [{"stable_key":"opening","name":"Opening","scene_start":1,"scene_end":3,"scene_ids":[],"function":"setup","summary":"desc","confidence":0.8}]
SCENE DATA:
${sceneContexts}
Respond with ONLY valid JSON. No explanation.`
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
      messages: [{ role: "user", content: extractPrompt }],
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);
  const aiData = await response.json();
  const rawContent = aiData.choices?.[0]?.message?.content || "";

  let beats: Array<{
    stable_key: string;
    name: string;
    scene_start: number;
    scene_end: number;
    scene_ids: string[];
    function: string;
    summary: string;
    confidence: number;
  }> = [];
  try {
    const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    beats = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse beats: ${rawContent.substring(0, 300)}`);
  }

  if (!Array.isArray(beats) || beats.length === 0) throw new Error("LLM returned no beats");

  // ── PHASE 4 — Semantic dedup ──
  const existingRows = await admin
    .from("atoms").select("id, canonical_name, attributes")
    .eq("project_id", projectId).eq("atom_type", "narrativebeat");

  const existingBeats = (existingRows.data || []) as Array<{
    id: string;
    canonical_name: string;
    attributes: Record<string, any>;
  }>;

  // Normalize for exact match dedup
  function normalize(s: string): string {
    return s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\b(the|a|an|of|and|in|to|for|is|at|on)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sceneSpanOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
    const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
    if (overlap <= 0) return 0;
    const aSpan = aEnd - aStart + 1;
    const bSpan = bEnd - bStart + 1;
    return overlap / Math.min(aSpan, bSpan);
  }

  const newBeats: typeof beats = [];

  for (const beat of beats) {
    const nKey = beat.stable_key || normalize(beat.name);
    let isDuplicate = false;

    for (const existing of existingBeats) {
      const exAttrs = existing.attributes || {};
      const exKey = exAttrs.stable_key || normalize(existing.canonical_name);
      const exStart = exAttrs.scene_start ?? 0;
      const exEnd = exAttrs.scene_end ?? 0;

      // Check 1: same stable_key
      if (exKey && nKey && exKey === nKey) {
        isDuplicate = true;
        break;
      }

      // Check 2: normalized name match
      if (normalize(existing.canonical_name) === normalize(beat.name)) {
        isDuplicate = true;
        break;
      }

      // Check 3: scene span overlap > 0.6
      if (beat.scene_start && beat.scene_end && exStart && exEnd) {
        if (sceneSpanOverlap(beat.scene_start, beat.scene_end, exStart, exEnd) > 0.6) {
          isDuplicate = true;
          break;
        }
      }

      // Check 4: scene_ids overlap substantially
      if (beat.scene_ids && exAttrs.scene_ids && Array.isArray(beat.scene_ids) && Array.isArray(exAttrs.scene_ids)) {
        const shared = beat.scene_ids.filter((id: string) => exAttrs.scene_ids.includes(id));
        if (shared.length > 0 && shared.length >= Math.min(beat.scene_ids.length, exAttrs.scene_ids.length) * 0.5) {
          isDuplicate = true;
          break;
        }
      }
    }

    if (!isDuplicate) {
      newBeats.push(beat);
    }
  }

  if (newBeats.length === 0) return { created: 0, message: "All beats already exist (semantic dedup)" };

  const now = new Date().toISOString();
  const toInsert = newBeats.map((beat: typeof beats[0], i: number) => ({
    project_id: projectId,
    atom_type: "narrativebeat",
    entity_id: null,
    canonical_name: beat.name,
    priority: 80 - i * 5,
    confidence: Math.round((beat.confidence || 0.5) * 100),
    readiness_state: "stub",
    generation_status: "pending",
    attributes: {
      stable_key: beat.stable_key || beat.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      beatName: beat.name,
      scene_start: beat.scene_start ?? 0,
      scene_end: beat.scene_end ?? 0,
      scene_ids: beat.scene_ids || [],
      function: beat.function || "",
      summary: beat.summary || "",
      source: hasEnrichment ? "scene_enrichment" : "scene_graph_versions",
      extraction_version: "deterministic_v1",
      confidence: beat.confidence || 0.5,
      readinessBadge: "foundation",
      generationStatus: "pending",
    },
    created_at: now,
    updated_at: now,
  }));

  const { data: inserted, error } = await admin.from("atoms").insert(toInsert).select("id");
  if (error) throw new Error(`Failed to insert narrativebeat atoms: ${error.message}`);
  return { created: inserted?.length || 0, beats: newBeats.map((b) => b.name), scene_coverage: `${newBeats[0]?.scene_start}-${newBeats[newBeats.length - 1]?.scene_end}` };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();
  const { data: atoms, error } = await admin
    .from("atoms").select("*").eq("project_id", projectId).eq("atom_type", "narrativebeat")
    .order("priority", { ascending: false });
  if (error) throw new Error(`Failed to load narrativebeat atoms: ${error.message}`);
  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
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
Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- beatType (string: revelation | action_climax | emotional_turn | tonal_shift | setup)
- sceneReference (string: the slugline or scene_id where this beat occurs, if identifiable)
- emotionalImpact (string: what the audience feels at this beat)
- structuralFunction (string: act_turn | midpoint | climax | resolution | setup)
- narrativeMomentum (string: low | medium | high | peak)
- charactersInvolved (array of 1-4 character names)
- beatSequenceOrder (number: approximate order in the film, 1 = beginning)
- precededBy (string: what sets this beat up)
- followedBy (string: what this beat leads to)
- setPieceRequirement (string: minimal | practical | full_production)
- beatTags (array of 3-5 keyword strings)
- marketingRelevance (boolean: is this a trailer beat?)
- productionCriticality (string: can_this_be_restructured | must_it_stay)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;

          const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://iffy-analysis.vercel.app", "X-Title": "IFFY NarrativeBeat Atomiser" },
            body: JSON.stringify({ model: "minimax/minimax-m2.7", messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 1500 }),
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

          const finalAttributes = { ...attrs, beatName: atom.canonical_name, generationStatus: "completed" };
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
      case "reset_failed": result = await handleResetFailed(projectId); break;
      default: return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("narrativebeat-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});