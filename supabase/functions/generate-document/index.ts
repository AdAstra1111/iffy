// generate-document v2026-03-27T09 — canonical version creation convergence
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  resolveGateway,
} from "../_shared/llm.ts";
import {
  resolveDocumentGenerationMode,
  assertLLMAllowed,
  buildModeDiagnostic,
  buildGenerationProvenance,
  type GenerationMode,
} from "../_shared/generationModeResolver.ts";
import { isCPMEnabled, CPM_GENERATION_PROMPT_BLOCK, logCPM } from "../_shared/characterPressureMatrix.ts";
import { buildBeatGuidanceBlock } from "../_shared/verticalDramaBeats.ts";
import { resolveNarrativeContext, buildNarrativeContextBlock } from "../_shared/narrativeContextResolver.ts";
import { detectCanonDrift, logDriftResult } from "../_shared/canonConstraintEnforcement.ts";
import { validateStageIdentity, getStageIdentityPromptBlock, buildDiagnostic } from "../_shared/stageIdentityContracts.ts";
import { generateEpisodeBeatsChunked } from "../_shared/episodeBeatsChunked.ts";
import { buildLadderPromptBlock, formatToLane } from "../_shared/documentLadders.ts";
import { EPISODE_DOC_TYPES, extractEpisodeNumbersFromOutput, detectCollapsedRangeSummaries } from "../_shared/episodeScope.ts";
import { isLargeRiskDocType, isEpisodicDocType as isLargeRiskEpisodic, chunkPlanFor, strategyFor } from "../_shared/largeRiskRouter.ts";
import { runChunkedGeneration, resumeChunkedGeneration } from "../_shared/chunkRunner.ts";
import { validateEpisodicContent, hasBannedSummarizationLanguage } from "../_shared/chunkValidator.ts";
import { validateCharacterCues } from "../_shared/coreDocs.ts";
import { createVersion, ensureDocSlot } from "../_shared/doc-os.ts";
import { validateNarrativeContext } from "../_shared/ncpTypes.ts";
import type { NarrativeContextPackage, ScenePlanEntry } from "../_shared/ncpTypes.ts";
import { findSectionDef } from "../_shared/deliverableSectionRegistry.ts";
import { findOrCreateCharacterEntity } from "../_shared/characterDedupUtils.ts";
import {
  buildNuancePromptBlock, computeMetrics, melodramaScore, nuanceScore,
  runGate, buildRepairInstruction, computeFingerprint, computeSimilarityRisk,
  type NuanceParams,
} from "../_shared/nuanceEngine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Document Dependency Map (mirrors src/lib/document-dependencies.ts) ───

const DOC_DEPENDENCY_MAP: Record<string, string[]> = {
  pitch_document: ["qualifications.season_episode_count", "qualifications.episode_target_duration_seconds"],
  season_arc: ["qualifications.season_episode_count", "qualifications.episode_target_duration_seconds"],
  episode_grid: ["qualifications.season_episode_count", "qualifications.episode_target_duration_seconds"],
  vertical_episode_beats: ["qualifications.season_episode_count", "qualifications.episode_target_duration_seconds"],
  vertical_market_sheet: ["qualifications.season_episode_count", "qualifications.episode_target_duration_seconds"],
  series_overview: ["qualifications.season_episode_count"],
  format_rules: ["qualifications.episode_target_duration_seconds"],
  pilot_script: ["qualifications.episode_target_duration_seconds"],
  pilot_outline: ["qualifications.episode_target_duration_seconds"],
  season_scripts_bundle: ["qualifications.season_episode_count", "qualifications.episode_target_duration_seconds"],
  future_seasons_map: ["qualifications.season_episode_count"],
  character_bible: ["qualifications.season_episode_count"],
  feature_outline: ["qualifications.target_runtime_min_low", "qualifications.target_runtime_min_high"],
  screenplay_draft: ["qualifications.target_runtime_min_low", "qualifications.target_runtime_min_high"],
  long_synopsis: ["qualifications.target_runtime_min_low", "qualifications.target_runtime_min_high"],
};

// ─── Upstream dependency map: which doc_types feed into others ───

const UPSTREAM_DEPS: Record<string, string[]> = {
  concept_brief: ["idea"],
  beat_sheet: ["character_bible", "concept_brief", "treatment", "story_outline"],
  logline: ["idea_brief"],
  one_pager: ["idea_brief", "logline"],
  long_synopsis: ["one_pager", "logline"],
  treatment: ["concept_brief", "character_bible"],
  character_bible: ["concept_brief"],
  feature_outline: ["treatment", "character_bible"],
  feature_script: ["beat_sheet", "character_bible", "treatment", "story_outline"],
  screenplay_draft: ["beat_sheet", "character_bible", "treatment"],
  story_outline: ["concept_brief", "character_bible", "treatment"],
  series_overview: ["idea_brief", "logline", "concept_brief", "market_sheet"],
  season_arc: ["series_overview", "character_bible", "concept_brief", "market_sheet"],
  episode_grid: ["season_arc", "character_bible", "concept_brief"],
  vertical_episode_beats: ["episode_grid", "season_arc", "character_bible", "format_rules"],
  pilot_outline: ["episode_grid", "character_bible"],
  pilot_script: ["pilot_outline", "character_bible"],
  format_rules: ["idea_brief", "concept_brief"],
  vertical_market_sheet: ["idea_brief", "concept_brief"],
  season_scripts_bundle: ["episode_grid", "vertical_episode_beats", "character_bible"],
  season_script: ["vertical_episode_beats", "character_bible", "season_arc", "episode_grid", "concept_brief", "format_rules"],
  // ARCHITECTURE: visual_canon_brief is upstream visual intent — sources are narrative ONLY.
  // It MUST NOT depend on visual_sets, effective wardrobe resolvers, or any downstream visual output.
  visual_canon_brief: ["concept_brief", "treatment", "story_outline", "character_bible", "beat_sheet", "feature_script"],
  future_seasons_map: ["season_arc", "series_overview"],
  topline_narrative: ["idea", "idea_brief", "concept_brief", "market_sheet", "vertical_market_sheet", "treatment"],
  budget_topline: ["treatment"],
  finance_plan: ["budget_topline"],
  packaging_targets: ["treatment", "character_bible", "concept_brief", "market_sheet"],
  production_draft: ["feature_script"],
  production_plan: ["budget_topline"],
  delivery_requirements: [],
  story_arc_plan: ["doc_premise_brief", "research_dossier"],
  shoot_plan: ["story_arc_plan"],
};

// ── Cycle & self-dep guard (runs once at cold start) ──
let DEP_GRAPH_VALID = true;
try {
  for (const [dt, deps] of Object.entries(UPSTREAM_DEPS)) {
    if (deps.includes(dt)) throw new Error(`UPSTREAM_DEPS self-dep: ${dt}`);
  }
  for (const start of Object.keys(UPSTREAM_DEPS)) {
    const visited = new Set<string>();
    const queue = [...(UPSTREAM_DEPS[start] || [])];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === start) throw new Error(`UPSTREAM_DEPS cycle: ${start} → ... → ${start}`);
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const dep of (UPSTREAM_DEPS[cur] || [])) queue.push(dep);
    }
  }
} catch (e: any) {
  DEP_GRAPH_VALID = false;
  console.error(`[generate-document] FATAL dep graph error: ${e.message}`);
}

// ── Convergence guidance section extractor (pure string, no LLM) ──
const CONVERGENCE_HEADINGS = [
  "## Creative DNA Targets (From Trend Convergence)",
  "## Convergence Guidance (Audience Appetite Context)",
];
const MAX_GUIDANCE_EXTRACT_CHARS = 2000;
const MAX_SECTION_CHARS = 1200;

function extractConvergenceGuidance(upstreamBlocks: Map<string, string>): string {
  const extracts: string[] = [];
  const seen = new Set<string>();
  // Deterministic order: concept_brief first, then market_sheet
  for (const dt of ["concept_brief", "market_sheet"]) {
    const text = upstreamBlocks.get(dt);
    if (!text) continue;
    for (const heading of CONVERGENCE_HEADINGS) {
      const dedupKey = `${dt}::${heading}`;
      if (seen.has(dedupKey)) continue;
      const idx = text.indexOf(heading);
      if (idx === -1) continue;
      seen.add(dedupKey);
      // Find end of heading line, then search for next ## from there
      const headingEnd = text.indexOf("\n", idx + heading.length);
      if (headingEnd === -1) {
        const section = text.slice(idx).trim();
        if (section.length > 0) extracts.push(section.slice(0, MAX_SECTION_CHARS));
        continue;
      }
      const afterHeadingLine = text.slice(headingEnd + 1);
      const nextH2 = afterHeadingLine.search(/^\s*## /m);
      const bodyText = nextH2 >= 0 ? afterHeadingLine.slice(0, nextH2).trim() : afterHeadingLine.trim();
      const fullSection = (text.slice(idx, headingEnd + 1) + "\n" + bodyText).trim();
      if (fullSection.length > 0) extracts.push(fullSection.slice(0, MAX_SECTION_CHARS));
    }
  }
  if (extracts.length === 0) return "";
  let combined = extracts.join("\n\n");
  if (combined.length > MAX_GUIDANCE_EXTRACT_CHARS) {
    combined = combined.slice(0, MAX_GUIDANCE_EXTRACT_CHARS) + "\n[truncated]";
  }
  return `=== CONVERGENCE GUIDANCE EXTRACT (FROM DOCS) ===\n${combined}\n=== END CONVERGENCE GUIDANCE EXTRACT ===`;
}

/**
 * Counts the number of act sections found in a treatment document.
 * Acts are identified by headers matching "## Act N:" pattern.
 * Returns { found: number, total: number, foundActs: string[] }.
 */
function countTreatmentActSections(treatmentText: string): { found: number; total: number; foundActs: string[] } {
  const actHeaders = ["## Act 1:", "## Act 2A:", "## Act 2B:", "## Act 3:"];
  const foundActs = actHeaders.filter(h => treatmentText.includes(h));
  return { found: foundActs.length, total: actHeaders.length, foundActs };
}

// ── Beat sheet data resolver for feature_script beat_sequential strategy ──
// Reads the latest approved beat_sheet version and parses beat numbers + titles.
interface ResolvedBeat {
  number: number;
  title: string;
}
async function resolveBeatsFromBeatSheet(
  supabase: any,
  projectId: string,
): Promise<ResolvedBeat[] | null> {
  try {
    const { data: beatDoc } = await supabase
      .from("project_documents")
      .select("id")
      .eq("project_id", projectId)
      .eq("doc_type", "beat_sheet")
      .maybeSingle();
    if (!beatDoc) return null;

    const { data: beatVersion } = await supabase
      .from("project_document_versions")
      .select("plaintext")
      .eq("document_id", beatDoc.id)
      .eq("is_current", true)
      .eq("approval_status", "approved")
      .maybeSingle();
    if (!beatVersion?.plaintext) return null;

    const beats: ResolvedBeat[] = [];
    const beatRe = /^###\s+(\d+)\.\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = beatRe.exec(beatVersion.plaintext)) !== null) {
      beats.push({ number: parseInt(match[1], 10), title: match[2].trim() });
    }
    return beats.length > 0 ? beats : null;
  } catch (err) {
    console.error(`[generate-document] resolveBeatsFromBeatSheet failed:`, err?.message || err);
    return null;
  }
}


// ── Scene Plan Generator for feature_script scene_indexed strategy ──
// Generates a structured Scene Plan JSON array that bridges beat_sheet structure
// into individual screenplay scenes. Each scene has dramatic purpose, turn, and outcome.
interface ScenePlanEntry {
  scene_number: number;
  act: number;
  slugline: string;
  location: string;
  time_of_day: string;
  characters_present: string[];
  source_beat_number: number;
  source_beat_title: string;
  summary: string;
  dramatic_purpose: string;
  scene_turn: string;
  scene_outcome: string;
  estimated_pages?: number;
  pov_character?: string;
}

async function generateScenePlanAndNCP(
  apiKey: string,
  gatewayUrl: string,
  projectTitle: string,
  beatSheet: string,
  treatment: string,
  storyOutline: string,
  characterBible: string,
  formatRules: string
): Promise<{ scenes: ScenePlanEntry[]; narrativeContext: NarrativeContextPackage | null }> {
  const GL = "\n"; // Template literal helper to avoid escaping in heredoc
  const maxChars = 8000;
  
  const systemPrompt = `You are a professional screenwriter creating a Scene Plan with Narrative Context for a feature film.

A Scene Plan bridges the structural Beat Sheet into individual screenplay scenes.
The Narrative Context Package (NCP) provides the global story awareness that enables coherent, professional screenplay generation.

Your task:
1. Analyze the Beat Sheet — each beat is a structural unit (Opening Image, Theme Stated, etc.)
2. Break each beat into 2-4 individual scenes that fulfill the beat's dramatic function
3. For each scene, define its dramatic movement
4. Generate the Narrative Context Package

CRITICAL STRUCTURAL RULES:
- Beat 1-15 → Act 1 (Opening Image through Break into Two)
- Beat 16-25 → Act 2A (B Story through Midpoint)
- Beat 26-40 → Act 2B (Bad Guys Close In through Dark Night of the Soul)
- Beat 41+ → Act 3 (Break into Three through Final Image)
- Typical feature film: 40-60 beats, resulting in 90-130 scenes

For each scene, you MUST provide:
- slugline: Standard INT./EXT. format (e.g., "INT. SARAH'S APARTMENT - DAY")
- location: Where it takes place (e.g., "Sarah's Apartment")
- time_of_day: DAY, NIGHT, DAWN, DUSK, CONTINUOUS, LATER, MOMENTS LATER
- characters_present: Array of character names who appear
- source_beat_number: The beat number this scene belongs to
- source_beat_title: The beat title
- summary: 2-3 sentences describing what happens
- dramatic_purpose: Why this scene exists — what it reveals, establishes, or advances in the story
- scene_turn: The emotional/story shift within this scene — how the situation changes from its beginning to its end
- scene_outcome: The state left behind — how the world or character is changed by this scene

Optional per scene (include when relevant):
- estimated_pages: Rough page count (1 page = ~1 minute screen time)
- pov_character: Whose perspective this scene is told from
- scene_function_type: One of: exposition, conflict, reveal, aftermath, transition, set_piece, character_moment, confrontation, negotiation, discovery, suspense, reaction, preparation, montage, inciting_event
- character_goal: What the protagonist wants in this scene (1 sentence max)

NARRATIVE CONTEXT PACKAGE — You MUST also generate:
1. global_story_map: act structure with key turning points and narrative trajectory
2. causal_chain: For each scene, what triggered it (previous scene outcome) and what it enables
3. tension_curve: Tension value (1-10) and trajectory (rising/sustaining/releasing/resetting/oscillating) for each scene
4. promise_registry: Setups, character traits, props, mysteries, and statements that need payoff later
5. scene_function_registry: For each scene, its function type and a brief structure guideline

Output ONLY valid JSON with two root keys: "scenes" (array) and "narrative_context" (object).
No markdown. No preamble. No code fences. Start directly with {.`;

  const userPrompt = `Project: "${projectTitle}"

BEAT SHEET:
${beatSheet.slice(0, maxChars)}

${treatment ? `TREATMENT (for narrative context):\n${treatment.slice(0, 6000)}\n\n` : ""}
${storyOutline ? `STORY OUTLINE:\n${storyOutline.slice(0, 4000)}\n\n` : ""}
${characterBible ? `CHARACTER BIBLE (for character names and arcs):\n${characterBible.slice(0, 4000)}\n\n` : ""}
${formatRules ? `FORMAT RULES:\n${formatRules.slice(0, 2000)}\n\n` : ""}

Generate the complete Scene Plan + Narrative Context Package JSON.
Every beat must be expanded into 2-4 scenes. Total scenes should be 90-130 for a standard feature film.
The "scenes" array has the individual scene entries. The "narrative_context" object has the global story map, causal chain, tension curve, promise registry, and scene function registry.`;

  const response = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 32000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown");
    throw new Error(`Scene Plan generation failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "";
  if (!rawContent.trim()) throw new Error("Scene Plan generation returned empty content");

  // Clean and parse JSON — handle code fences if present
  const cleanJson = rawContent
      .replace(/^\s*```(?:json)?\s*/gm, "")
      .replace(/```\s*$/gm, "")
      .trim();

    // Belt-and-suspenders: if still wrapped in backtick fences, strip entire first/last lines
    const finalClean = cleanJson.startsWith("```")
      ? cleanJson.split("\n").slice(1, -1).join("\n").trim()
      : cleanJson;

  const parsed = JSON.parse(finalClean);
  
  // Two response formats supported:
  // 1. Array (backward compat) — treat as scenes only, no NCP
  // 2. { scenes, narrative_context } — Phase 2A format
  let scenes: ScenePlanEntry[];
  let narrativeContext: NarrativeContextPackage | null = null;

  if (Array.isArray(parsed)) {
    // Backward compatible mode — old format
    scenes = parsed;
  } else if (parsed && Array.isArray(parsed.scenes)) {
    scenes = parsed.scenes;
    narrativeContext = parsed.narrative_context || null;
    
    // Normalize NCP data — LLM may return arrays as objects with 'scenes' or 'entries' keys
    if (narrativeContext) {
      const arrayFields = [
        'tension_curve', 'causal_chain', 'sequence_map', 
        'scene_function_registry'
      ];
      for (const field of arrayFields) {
        const val = (narrativeContext as any)[field];
        if (val && !Array.isArray(val)) {
          // Try common sub-keys: scenes, entries, items, data
          (narrativeContext as any)[field] = (val.scenes || val.entries || val.items || val.data || []);
        }
      }
    }
    
    // Validate NCP if present
    if (narrativeContext) {
      const validation = validateNarrativeContext(narrativeContext, scenes.length);
      if (!validation.valid) {
        console.warn(`[generate-document] Narrative Context validation warnings: ${validation.warnings.join("; ")}`);
        // Fail closed on errors (not warnings — warnings are soft)
        if (validation.errors.length > 0 && validation.errors.some(e => !e.includes("causal_chain"))) {
          console.warn(`[generate-document] Narrative Context errors: ${validation.errors.join("; ")} — proceeding without NCP`);
          narrativeContext = null; // Fall back gracefully
        }
      }
    }
  } else {
    throw new Error("Scene Plan response must be a scenes array or {scenes, narrative_context} object");
  }

  if (!Array.isArray(scenes) || scenes.length < 5) {
    throw new Error(`Scene Plan generated ${scenes.length} scenes — expected at least 5`);
  }

  // Validate each entry has required fields
  for (let i = 0; i < scenes.length; i++) {
    const entry = scenes[i];
    const missing: string[] = [];
    if (!entry.scene_number) missing.push("scene_number");
    if (!entry.act) missing.push("act");
    if (!entry.slugline) missing.push("slugline");
    if (!entry.summary) missing.push("summary");
    if (!entry.dramatic_purpose) missing.push("dramatic_purpose");
    if (!entry.scene_turn) missing.push("scene_turn");
    if (!entry.scene_outcome) missing.push("scene_outcome");
    if (!entry.source_beat_number) missing.push("source_beat_number");
    if (missing.length > 0) {
      console.warn(`[generate-document] Scene Plan entry ${i} missing: ${missing.join(", ")}`);
    }
  }

  // Normalize scene numbers sequentially
  scenes.forEach((entry, i) => { entry.scene_number = i + 1; });

  console.log(`[generate-document] Scene Plan + NCP generated: ${scenes.length} scenes, NCP ${narrativeContext ? "present" : "absent"}`);
  return { scenes, narrativeContext };
}

interface ResolvedScene {
  number: number;
  heading: string;
}

async function resolveScenesFromFeatureScript(
  supabase: any,
  projectId: string,
): Promise<ResolvedScene[] | null> {
  try {
    const { data: scenes } = await supabase
      .from("scene_graph_scenes")
      .select(`
        key,
        scene_graph_versions!inner(slugline),
        scene_graph_order!inner(order_key, is_active)
      `)
      .eq("project_id", projectId)
      .is("deprecated_at", null)
      .eq("scene_graph_order.is_active", true)
      .order("scene_graph_order(order_key)", { ascending: true });

    if (!scenes || scenes.length < 1) return null;

    const result: ResolvedScene[] = scenes.map((scene: any, i: number) => ({
      number: i + 1,
      heading: scene.scene_graph_versions?.[0]?.slugline ||
               scene.scene_graph_order?.[0]?.order_key?.toString() ||
               `Scene ${scene.key}`,
    }));

    console.log(`[generate-document] resolveScenesFromFeatureScript: resolved ${result.length} scenes for project ${projectId}`);
    return result;
  } catch (err) {
    console.error(`[generate-document] resolveScenesFromFeatureScript failed:`, err?.message || err);
    return null;
  }
}

// ── Per-doc context cap ──
const MAX_PER_DOC_CHARS = 12000;

// ─── LLM Gateway ───

const gw = resolveGateway();
const GATEWAY_URL = gw.url;

async function callLLM(apiKey: string, system: string, user: string, model = "google/gemini-2.5-flash"): Promise<string> {
  const promptChars = (system + user).length;
  console.log(`[generate-document] LLM call: model=${model} max_tokens=65000 prompt_chars=${promptChars}`);
  const res = await fetch(gw.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 65000,
    }),
  });
  if (!res.ok) throw new Error(`LLM call failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Handler ───

Deno.serve(async (req) => {
  const jsonRes = (payload: Record<string, any>, status = 200) => new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  if (req.method === "OPTIONS") return jsonRes({ ok: true });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!bearer) return jsonRes({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = gw.apiKey || Deno.env.get("OPENROUTER_API_KEY") || serviceKey;

    const body = await req.json();
    const forwardedUserId = body?.userId ?? body?.user_id ?? null;

    // Detect service-role caller (raw key match OR JWT with role claim)
    let isServiceRole = false;
    if (bearer === serviceKey) {
      isServiceRole = true;
    } else if (bearer.split(".").length === 3) {
      try {
        const payloadB64 = bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = payloadB64 + "=".repeat((4 - payloadB64.length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        if (payload.role === "service_role") isServiceRole = true;
      } catch {
        // not a JWT, continue in user-auth path
      }
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const rlsClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });

    let actorUserId: string | null = null;
    if (!isServiceRole) {
      const { data: { user }, error: userErr } = await rlsClient.auth.getUser(bearer);
      if (userErr || !user) return jsonRes({ error: "Unauthorized" }, 401);
      actorUserId = user.id;
    } else {
      actorUserId = forwardedUserId;
    }

    const db = isServiceRole ? serviceClient : rlsClient;
    const supabase = db;

    console.log("[generate-document] auth", { fn: "generate-document", isServiceRole, hasActorUserId: !!actorUserId, hasForwardedUserId: !!forwardedUserId, action: body?.action ?? null });

    // Ping support
    if ((body as any).action === "ping") return jsonRes({ ok: true, function: "generate-document" });

    // Dep graph validity gate
    if (!DEP_GRAPH_VALID) return jsonRes({ error: "DEP_GRAPH_INVALID", message: "UPSTREAM_DEPS contains a cycle or self-dependency. Cannot proceed." }, 500);

    const { projectId, docType, mode = "draft", generatorId = "generate-document", generatorRunId, additionalContext, sourceDocType, sourceVersionId } = body;

    // Extract nuance parameters (with defaults)
    const nuanceParams: NuanceParams = {
      restraint: body.nuance?.restraint ?? 70,
      story_engine: body.nuance?.story_engine ?? 'pressure_cooker',
      causal_grammar: body.nuance?.causal_grammar ?? 'accumulation',
      drama_budget: body.nuance?.drama_budget ?? 2,
      anti_tropes: body.nuance?.anti_tropes ?? [],
      diversify: body.nuance?.diversify ?? true,
    };

    if (!projectId || !docType) return jsonRes({ error: "projectId and docType required" }, 400);

    // 1) Resolve qualifications
    const resolveRes = await fetch(`${supabaseUrl}/functions/v1/resolve-qualifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ projectId }),
    });
    const resolveData = await resolveRes.json();
    if (!resolveRes.ok) throw new Error(resolveData.error || "resolve-qualifications failed");

    const resolvedQuals = resolveData.resolvedQualifications;
    const currentHash = resolveData.resolver_hash;

    // 2) Load project metadata
    const { data: project } = await supabase.from("projects")
      .select("title, format, pipeline_stage, guardrails_config, season_style_template_version_id, season_style_profile, user_id, assigned_lane")
      .eq("id", projectId).single();

    if (!project) throw new Error("Project not found");

    if (isServiceRole && !actorUserId) {
      actorUserId = project.user_id || null;
    }
    // ── FORMAT SCRIPT TYPE GUARD ──
    // Block feature_script generation for formats where canonical script type is season_script or episode_script.
    const FORMAT_SCRIPT_TYPES_LOCAL: Record<string, string> = {
      "film": "feature_script", "feature": "feature_script", "short": "feature_script",
      "animation": "feature_script", "tv-series": "episode_script", "limited-series": "episode_script",
      "digital-series": "episode_script", "vertical-drama": "season_script", "anim-series": "episode_script",
      "reality": "episode_script", "documentary": "feature_script", "documentary-series": "feature_script",
      "hybrid-documentary": "feature_script",
    };
    const fmtKey = (project.format || "film").toLowerCase().replace(/_/g, "-");
    const canonicalScriptType = FORMAT_SCRIPT_TYPES_LOCAL[fmtKey];
    if (docType === "feature_script" && canonicalScriptType && canonicalScriptType !== "feature_script") {
      return jsonRes({
        error: "BLOCKED: feature_script is not valid for " + project.format + " projects. Use " + canonicalScriptType + " instead."
      }, 400);
    }


    // 3) Load upstream documents
    const upstreamTypes = UPSTREAM_DEPS[docType] || [];
    const inputsUsed: Record<string, any> = {};
    let upstreamContent = "";
    const upstreamBlocks = new Map<string, string>();

    if (upstreamTypes.length > 0) {
      // Get upstream project_documents for this project
      const { data: allDocs } = await supabase.from("project_documents")
        .select("id, doc_type, latest_version_id")
        .eq("project_id", projectId)
        .in("doc_type", upstreamTypes);

      const upstreamDocIds = (allDocs || []).map((d: any) => d.id);
      const versionsByDoc = new Map<string, any[]>();

      if (upstreamDocIds.length > 0) {
        const { data: versions } = await supabase.from("project_document_versions")
          .select("id, document_id, version_number, approval_status, is_current, plaintext, created_at")
          .in("document_id", upstreamDocIds)
          .order("version_number", { ascending: false });

        for (const v of (versions || [])) {
          const arr = versionsByDoc.get(v.document_id) || [];
          arr.push(v);
          versionsByDoc.set(v.document_id, arr);
        }
      }

      for (const doc of (allDocs || [])) {
        const candidates = versionsByDoc.get(doc.id) || [];
        const explicitSourceVersion =
          sourceVersionId && sourceDocType === doc.doc_type
            ? candidates.find((v: any) => v.id === sourceVersionId)
            : null;
        const version =
          explicitSourceVersion ||
          candidates.find((v: any) => v.approval_status === "approved" && v.is_current === true) ||
          candidates.find((v: any) => v.approval_status === "approved") ||
          (doc.latest_version_id ? candidates.find((v: any) => v.id === doc.latest_version_id) : null) ||
          null;
        // Fallback to longest version if primary chain returned null or empty plaintext
        const resolvedVersion = (!version || !version.plaintext || version.plaintext.trim().length < 200)
          ? candidates.reduce((best: any, v) => {
              if (!v.plaintext || v.plaintext.trim().length < 200) return best;
              if (!best || v.plaintext.length > best.plaintext.length) return v;
              return best;
            }, null)
          : version;

        if (resolvedVersion) {
          inputsUsed[doc.doc_type] = {
            version_id: resolvedVersion.id,
            version_number: resolvedVersion.version_number,
          };
          let plaintext = resolvedVersion.plaintext || "(empty)";
          // Per-doc cap to keep prompt size stable
          if (plaintext.length > MAX_PER_DOC_CHARS) {
            const headChars = Math.floor(MAX_PER_DOC_CHARS * 0.6);
            const tailChars = MAX_PER_DOC_CHARS - headChars;
            plaintext = plaintext.slice(0, headChars) + "\n\n[...content trimmed for context budget...]\n\n" + plaintext.slice(-tailChars);
          }
          upstreamBlocks.set(doc.doc_type, plaintext);
          upstreamContent += `\n\n--- ${doc.doc_type.toUpperCase()} (v${resolvedVersion.version_number}) ---\n${plaintext}`;
        }
      }
    }

    // 3b) Extract convergence guidance as compact preface (truncation-safe)
    const guidanceExtract = extractConvergenceGuidance(upstreamBlocks);
    if (guidanceExtract) {
      upstreamContent = `\n\n${guidanceExtract}\n${upstreamContent}`;
    }

    console.log(`[generate-document] context: docType=${docType} upstreamTypes=${upstreamTypes.length} totalChars=${upstreamContent.length} guidanceExtracted=${!!guidanceExtract}`);

    // ── Validate Treatment sections for story_outline ──
    // story_outline depends on treatment. If treatment is missing act sections,
    // the LLM will have insufficient structural context. Warn and inject fallback.
    if (docType === "story_outline") {
      const treatmentText = upstreamBlocks.get("treatment") || "";
      if (treatmentText) {
        const { found, total, foundActs } = countTreatmentActSections(treatmentText);
        if (found < 3) {
          console.warn(`[generate-document] validateTreatmentSections: treatment has ${found}/${total} act sections (found: ${foundActs.join(", ") || "none"}) — injecting fallback instruction`);
          upstreamContent += `\n\n### TREATMENT ACT STRUCTURE FALLBACK\n` +
            `The upstream treatment may be missing some act sections. The project should follow a standard 4-act structure:\n` +
            `- Act 1: Setup — introduces characters, world, and central conflict\n` +
            `- Act 2A: Rising Action — complications escalate, stakes increase\n` +
            `- Act 2B: Complications — midpoint turn, darkest moment, preparing for climax\n` +
            `- Act 3: Climax & Resolution — final confrontation and resolution\n` +
            `Use the available treatment content as the primary source. Fill structural gaps with this fallback guide.`;
        } else {
          console.log(`[generate-document] validateTreatmentSections: treatment has ${found}/${total} act sections — OK`);
        }
      } else {
        console.warn(`[generate-document] validateTreatmentSections: no treatment content found for story_outline — story outline will lack treatment context`);
      }
    }

    // 4) Build prompt with HARD BINDING
    const durMin = resolvedQuals.episode_target_duration_min_seconds || resolvedQuals.episode_target_duration_seconds || null;
    const durMax = resolvedQuals.episode_target_duration_max_seconds || resolvedQuals.episode_target_duration_seconds || null;
    const durMid = durMin && durMax ? Math.round((durMin + durMax) / 2) : (durMin || durMax || null);
    const durRangeStr = (durMin && durMax && durMin !== durMax)
      ? `${durMin}–${durMax} seconds (midpoint ${durMid}s)`
      : `${durMid || 'N/A'} seconds`;

    // Beat guidance for vertical drama
    const isVerticalDrama = (resolvedQuals.format || project.format || '').toLowerCase().includes('vertical');
    const beatBlock = isVerticalDrama ? buildBeatGuidanceBlock(durMin, durMax) : '';

    const qualBlock = [
      "## CANONICAL QUALIFICATIONS (MUST USE — override any conflicting values)",
      resolvedQuals.is_series ? `- Canonical season length: ${resolvedQuals.season_episode_count} episodes.` : null,
      resolvedQuals.is_series ? `- Canonical episode duration range: ${durRangeStr}.` : null,
      resolvedQuals.target_runtime_min_low ? `- Target runtime: ${resolvedQuals.target_runtime_min_low}–${resolvedQuals.target_runtime_min_high} minutes.` : null,
      `- Format: ${resolvedQuals.format}`,
      `- Replace any conflicting episode count or runtime references with canonical values above.`,
      beatBlock || null,
    ].filter(Boolean).join("\n");

    // Build style profile block if season template exists
    const styleProfile = project.season_style_profile;
    const hasStyleProfile = styleProfile && Object.keys(styleProfile).length > 0 && styleProfile.tone_tags;
    const styleBlock = hasStyleProfile ? [
      `## SEASON STYLE TEMPLATE (LOCKED CONSTRAINTS — must follow)`,
      styleProfile.tone_tags?.length > 0 ? `- Tone: ${styleProfile.tone_tags.join(', ')}` : null,
      styleProfile.pacing ? `- Pacing: ${styleProfile.pacing}` : null,
      styleProfile.dialogue_ratio ? `- Dialogue ratio target: ${Math.round(styleProfile.dialogue_ratio * 100)}%` : null,
      styleProfile.has_cliffhanger_pattern ? `- Must include cliffhanger ending pattern` : null,
      styleProfile.forbidden_elements?.length > 0 ? `- Forbidden elements: ${styleProfile.forbidden_elements.join(', ')}` : null,
      `- Style template version: ${project.season_style_template_version_id || 'n/a'}`,
    ].filter(Boolean).join("\n") : "";

    const completenessBlock = `## UNIVERSAL COMPLETENESS RULES (MANDATORY — IFFY STANDARD)

YOUR #1 JOB IS COMPLETENESS. Never output partial documents.

A) HARD UNIVERSAL RULES
1) NO GAPS / NO SKIPS — If the output contains numbered items (episodes, scenes, beats, steps, acts, chapters), include EVERY number in sequence. Never jump from EP5 to EP7. Never omit sections.
2) ALWAYS FINISH THE DOCUMENT — If too large to fully expand, complete it using MINIMUM COMPLETE PLACEHOLDER format. You are NOT allowed to stop early or give only highlights/anchors.
3) STRUCTURE FIRST, THEN DETAIL — Lock the full skeleton (all headings/slots), then populate each slot. If short on space, reduce detail per slot, NOT the number of slots.
4) SELF-CHECK IS MANDATORY — Before final output, confirm every required section/slot is present. If anything is missing, add it before responding.
5) NO HALLUCINATED FORMATS — Obey the requested format exactly.

B) MINIMUM COMPLETE PLACEHOLDER — If you cannot fully expand, use the smallest valid unit per slot:
- Episodic grids: each episode MUST have: HOOK (0–10s): / CORE MOVE / OBJECTIVE: / CLIFFHANGER / TURN:
- Beat sheets: BEAT 1: / BEAT 2: / BEAT 3: / CLIFFHANGER:
- Sections (briefs, sheets, bibles): 1–3 bullets per required section, never empty headings.

C) ANTI-ANCHOR MODE — You are FORBIDDEN from outputting only "key episodes", "highlights", "anchors", or "selected examples". If you include anchors, you MUST still include every missing connective episode as placeholders.

D) OUTPUT CONTRACT — At the top of your response, print:
- Deliverable Type: [type]
- Completion Status: COMPLETE (Full Detail) OR COMPLETE (Placeholder Detail)
- Completeness Check: PASS (no missing sections/slots)`;

    // ── Narrative Context Resolver: NEC + canon + signals + decisions + voice ──
    const genLane = project.assigned_lane || "independent-film";
    const genFormat = (resolvedQuals.format || project.format || "film").toLowerCase().replace(/_/g, "-");
    const narrativeCtx = await resolveNarrativeContext(supabase, projectId, {
      lane: genLane,
      format: genFormat,
      includeSignals: true,
    });
    const narrativeBlock = buildNarrativeContextBlock(narrativeCtx);
    console.log(`[generate-document] narrative-context: hash=${narrativeCtx.metadata.resolverHash} signals=${narrativeCtx.metadata.counts.signals} decisions=${narrativeCtx.metadata.counts.decisions} canonChars=${narrativeCtx.metadata.counts.canonChars}`);

    // ── Topline narrative: bespoke system + validator ──────────────────────────
    const isTopline = docType === "topline_narrative";

    let system: string;
    let userPrompt: string;
    let content: string;

    if (isTopline) {
      // Hard-fail if no source docs exist
      if (!upstreamContent.trim()) {
        return new Response(JSON.stringify({
          error: "no_source_documents",
          message: "No source documents found (Idea, Concept Brief, Market Sheet, or Blueprint). Add at least one document before generating the Topline Narrative.",
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const isSeries = resolvedQuals.is_series;

      system = [
        `You are a senior script editor generating a TOPLINE NARRATIVE document for a ${project.format || "film/TV"} project.`,
        `Project title: "${project.title}"`,
        ``,
        `## OUTPUT FORMAT (USE EXACTLY — no other headings)`,
        ``,
        `# TOPLINE NARRATIVE`,
        ``,
        `## LOGLINE`,
        `[Write 1–2 sentences only — ONE crisp logline using the project-specific details below]`,
        ``,
        `## SHORT SYNOPSIS`,
        `[150–300 words. Describe what actually happens: protagonist, goal, conflict, stakes, world. Use project specifics.]`,
        ``,
        `## LONG SYNOPSIS`,
        `[~1–2 pages (400–700 words). Cover the full story arc: setup → escalation → climax → resolution.]`,
        ``,
        `## STORY PILLARS`,
        `- Theme: [core thematic statement specific to this project]`,
        `- Protagonist: [name, role, specific want vs. need]`,
        `- Goal: [concrete objective]`,
        `- Stakes: [specific consequence of failure]`,
        `- Antagonistic force: [person, system, or internal conflict]`,
        `- Setting: [world, era, specific environment]`,
        `- Tone: [tonal descriptors, comps]`,
        `- Comps: [2–3 real comparable titles with brief rationale]`,
        isSeries ? `\n## SERIES ONLY\n- Series promise / engine: [the engine that drives episode-to-episode tension]\n- Season arc snapshot: [what changes from ep 1 to season finale]` : "",
        ``,
        `## CRITICAL RULES`,
        `1. FILL EVERY SECTION with project-specific content from the PROJECT FACTS block below.`,
        `2. NEVER output placeholder brackets like [1–2 sentences] or [Theme:] in the final text.`,
        `3. NEVER repeat the template instructions — replace them with actual content.`,
        `4. If context is insufficient for a section, synthesize from what is available. Do not leave any section empty.`,
        `5. Begin your response DIRECTLY with "# TOPLINE NARRATIVE". No preamble.`,
        qualBlock,
        styleBlock,
        narrativeBlock,
      ].filter(Boolean).join("\n");

      userPrompt = `PROJECT FACTS (use these as the primary source of truth):\n${upstreamContent}\n\nGenerate the full Topline Narrative for "${project.title}" now. Replace every template placeholder with real content derived from the project facts above.`;
    } else if (docType === "visual_canon_brief") {
      // ══════════════════════════════════════════════════════════════════════════
      // VISUAL CANON BRIEF — BESPOKE SECTIONED SYNTHESIS
      //
      // ARCHITECTURE: This is an UPSTREAM visual intent document generated from
      // NARRATIVE sources ONLY. It MUST NOT depend on visual_sets, effective
      // wardrobe resolvers, or any downstream visual output. No circularity.
      //
      // Downstream systems MUST consume extracted signals only via
      // extractVisualCanonSignals(), not the raw prose. IEL guards enforce this.
      // ══════════════════════════════════════════════════════════════════════════

      // ── Source sufficiency gate ──
      if (!upstreamContent.trim()) {
        return new Response(JSON.stringify({
          error: "no_source_documents",
          message: "Cannot generate Visual Canon Brief: no narrative source documents found. Add at least a Concept Brief or Treatment first.",
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Visual Evidence Map (internal synthesis step) ──
      const evidenceMapPrompt = `You are a visual development researcher. Analyze the following narrative source documents and extract a structured VISUAL EVIDENCE MAP — concrete visual signals embedded in the text.

Extract evidence for each category below. Use ONLY what the source text implies or states. Do NOT invent or assume generic visual choices.

Categories:
1. WORLD IDENTITY — physical environment, architecture, geography, weather, urban/rural
2. TEMPORAL CUES — era, period, technology level, historical markers
3. CULTURAL CUES — cultural context, traditions, rituals, social customs
4. CLASS HIERARCHY — economic stratification, wealth markers, poverty markers
5. LABOR/CRAFT PATTERNS — occupations, workspaces, tools, manual vs intellectual labor
6. RECURRING LOCATIONS — named or described locations that appear multiple times
7. RECURRING MATERIALS/OBJECTS — physical materials, textures, objects with narrative weight
8. MOTIFS/SYMBOLIC OBJECTS — objects, images, or patterns with symbolic meaning
9. EMOTIONAL CONTRASTS — opposing emotional states, tonal shifts, light/dark dynamics
10. EXCLUSION CLUES — things the world explicitly avoids, rejects, or lacks
11. COSTUME-RELEVANT SIGNALS — clothing mentions, dress codes, appearance descriptions
12. PD-RELEVANT SIGNALS — set decoration, architectural details, environmental atmosphere

For each category, list 2–6 specific evidence items with brief source attribution.
Output as structured text with numbered categories and bullet points.
If a category has no evidence in the sources, write "No evidence found."`;

      const evidenceMapUser = `SOURCE DOCUMENTS:\n${upstreamContent}`;
      const evidenceMap = await callLLM(apiKey, evidenceMapPrompt, evidenceMapUser);
      console.log(`[generate-document][visual_canon_brief] evidence_map_generated { chars: ${evidenceMap.length} }`);

      // ── Sectioned synthesis: 4 grouped passes + coherence pass ──
      const VCB_SYSTEM_BASE = `You are a senior visual development consultant generating sections of a VISUAL CANON BRIEF for the project "${project.title}" (${project.format || "film"}).

RULES:
1. Write for a visual development team — specific, actionable, project-grounded.
2. Every statement must be traceable to the narrative sources or evidence map provided.
3. NEVER use generic film-school language like "visually striking" or "cinematic feel".
4. NEVER dictate final locked outfits, final image prompts, or downstream generated outputs.
5. This is UPSTREAM VISUAL INTENT — it guides, it does not prescribe final assets.
6. Use the exact section heading format: "# Section Name" (H1 markdown).
7. Each section: 150–400 words of substantive prose + bullet points where appropriate.
8. Output ONLY the requested sections — no preamble, no commentary.`;

      const passA = await callLLM(apiKey, VCB_SYSTEM_BASE, `Using the evidence map and source documents below, generate EXACTLY these two sections:

# Visual World Overview
[Describe the project's visual world identity: physical environment, architecture, geography, atmosphere, spatial logic. Be specific to THIS project.]

# Temporal and Cultural Grounding
[Define the era, period, cultural context, and how time/culture shapes the visual language. First bullet should be a clear era classification.]

EVIDENCE MAP:
${evidenceMap}

SOURCE DOCUMENTS:
${upstreamContent}`);

      const passB = await callLLM(apiKey, VCB_SYSTEM_BASE, `Using the evidence map, source documents, and previously generated world/temporal sections below, generate EXACTLY these four sections:

# Costume Philosophy
[Define how clothing serves the narrative: what costumes reveal about character, status, psychology. NOT a list of outfits — a philosophy of how dress communicates.]

# Production Design Philosophy
[Define the spatial and environmental storytelling approach: how sets, locations, and spaces serve the narrative. What makes this project's physical world unique.]

# Material and Texture System
[Define the dominant materials and textures in this project's world and what they signify narratively. Each material entry: material name — narrative role.]

# Palette Logic
[Define the color logic: named palette groups with hex values where inferrable, usage context. NOT generic "warm and cool" — project-specific color meaning.]

EVIDENCE MAP:
${evidenceMap}

PREVIOUS SECTIONS (for coherence):
${passA}

SOURCE DOCUMENTS:
${upstreamContent}`);

      const passC = await callLLM(apiKey, VCB_SYSTEM_BASE, `Using the evidence map, source documents, and previously generated sections below, generate EXACTLY these three sections:

# Class and Labor Expression
[Define how economic class, labor, and social hierarchy are expressed visually: clothing quality, workspace aesthetics, body language, grooming differences.]

# Grooming and Physicality
[Define physical appearance directives: how characters' bodies, grooming, and physical presence reflect their narrative roles and world conditions.]

# Motifs and Symbolism
[Define recurring visual motifs and symbolic objects: what they represent, how they recur. Each entry: motif — meaning — recurrence pattern.]

PREVIOUS SECTIONS (for coherence):
${passA}

${passB}

EVIDENCE MAP:
${evidenceMap}

SOURCE DOCUMENTS:
${upstreamContent}`);

      const passD = await callLLM(apiKey, VCB_SYSTEM_BASE, `Using the evidence map, source documents, and all previously generated sections below, generate EXACTLY these three sections:

# Contrast Rules
[Define the visual contrasts that structure the project's visual language: axis — pole A vs pole B — visual expression. At least 3 contrast rules.]

# Visual Exclusions
[Define what this project's visual world explicitly AVOIDS or REJECTS. Each entry: excluded element — reason for exclusion. At least 3 exclusions. This section prevents generic visual output.]

# Cinematic References
[List 3–5 specific films/shows that inform the visual approach: title (director) — specific relevance to this project's visual language. NOT generic "great cinematography" — explain exactly what visual element is borrowed.]

PREVIOUS SECTIONS (for coherence):
${passA}

${passB}

${passC}

EVIDENCE MAP:
${evidenceMap}

SOURCE DOCUMENTS:
${upstreamContent}`);

      console.log(`[generate-document][visual_canon_brief] section_passes_complete { passA: ${passA.length}, passB: ${passB.length}, passC: ${passC.length}, passD: ${passD.length} }`);

      // ── Coherence pass ──
      const assembledDraft = [passA, passB, passC, passD].join("\n\n");
      const coherenceResult = await callLLM(apiKey, `You are a senior visual development editor performing a COHERENCE PASS on a Visual Canon Brief for "${project.title}".

Your job:
1. Ensure all 12 sections are present with correct headings (# Section Name).
2. Ensure motifs, materials, costume philosophy, PD philosophy, and palette logic reinforce each other.
3. Ensure exclusions meaningfully oppose the stated visual logic.
4. Ensure no section contradicts another.
5. Remove any generic filler language.
6. Ensure every statement is grounded in the project's narrative reality.
7. Do NOT add content about final locked outfits, image prompts, or downstream assets.

Output the COMPLETE final document with all 12 sections. Preserve the exact heading format. Make targeted edits only — do not rewrite sections that are already strong.`, assembledDraft);

      // ── Completeness gate ──
      const REQUIRED_HEADINGS = [
        "Visual World Overview", "Temporal and Cultural Grounding", "Costume Philosophy",
        "Production Design Philosophy", "Material and Texture System", "Palette Logic",
        "Class and Labor Expression", "Grooming and Physicality", "Motifs and Symbolism",
        "Contrast Rules", "Visual Exclusions", "Cinematic References",
      ];
      const missingHeadings = REQUIRED_HEADINGS.filter(h =>
        !new RegExp(`^#+\\s*${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'mi').test(coherenceResult)
      );

      let vcbContent = coherenceResult;
      if (missingHeadings.length > 0) {
        console.error(`[generate-document][visual_canon_brief][IEL] COMPLETENESS_GATE_FAILED: missing=[${missingHeadings.join(",")}]`);
        if (missingHeadings.length <= 4) {
          const repairPrompt = `The following sections are MISSING from the Visual Canon Brief. Generate ONLY these missing sections using the evidence map and source documents. Use exact heading format "# Section Name".\n\nMISSING SECTIONS:\n${missingHeadings.map(h => `- ${h}`).join("\n")}\n\nEVIDENCE MAP:\n${evidenceMap}\n\nSOURCE DOCUMENTS:\n${upstreamContent}`;
          const repairContent = await callLLM(apiKey, VCB_SYSTEM_BASE, repairPrompt);
          vcbContent = coherenceResult + "\n\n" + repairContent;
          console.log(`[generate-document][visual_canon_brief] completeness_repair_applied { repaired: ${missingHeadings.length} }`);
        } else {
          return new Response(JSON.stringify({
            error: "visual_canon_brief_incomplete",
            message: `Visual Canon Brief generation failed completeness gate: ${missingHeadings.length} of 12 required sections missing.`,
            missing_sections: missingHeadings,
          }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // ── Anti-generic gate ──
      const genericPatterns = [
        /visually striking/gi, /cinematic feel/gi, /rich visual tapestry/gi,
        /stunning visuals/gi, /bold visual choices/gi, /visual storytelling at its finest/gi,
      ];
      let genericHits = 0;
      for (const pat of genericPatterns) {
        const matches = vcbContent.match(pat);
        if (matches) genericHits += matches.length;
      }
      if (genericHits > 2) {
        console.warn(`[generate-document][visual_canon_brief] ANTI_GENERIC_WARNING: ${genericHits} generic phrases detected`);
      }

      content = vcbContent;
      system = VCB_SYSTEM_BASE;
      userPrompt = `[visual_canon_brief multi-pass synthesis]`;

      console.log(`[generate-document][visual_canon_brief] generation_complete { chars: ${content.length}, missing_after_repair: ${missingHeadings.length}, generic_hits: ${genericHits} }`);
    } else if (docType === "beat_sheet") {
      // ── Beat Sheet: fail-closed if upstream is missing ──
      if (!upstreamContent.trim()) {
        return new Response(JSON.stringify({
          error: "no_source_documents",
          message: "Cannot generate Beat Sheet: requires a Character Bible, Concept Brief, Treatment, and Story Outline. Generate those documents first before generating the Beat Sheet.",
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else if (docType === "visual_project_bible") {
      // ══════════════════════════════════════════════════════════════════════════
      // VISUAL PROJECT BIBLE — DETERMINISTIC ASSEMBLY (NO LLM)
      //
      // ARCHITECTURE: This is a READ-ONLY assembler. It consumes canonical visual
      // truth outputs and assembles them into a structured visual-development document.
      // NO LLM is invoked. All content is deterministically derived from:
      //   - visual_canon_brief → extractSignalsFromBrief (structured signals)
      //   - production design from canon_json
      //   - character wardrobe profiles from canon_json
      //   - canon_locations table
      //   - approved visual_set_slots
      //
      // FORBIDDEN:
      //   - LLM calls
      //   - Raw visual_canon_brief prose in output
      //   - Inventing missing truth
      //
      // See: src/lib/visual/visualPublicEntrypoints.ts
      // ══════════════════════════════════════════════════════════════════════════

      const { assembleVisualProjectBibleFromDB } = await import("../_shared/visualProjectBibleEdge.ts");

      const vpbResult = await assembleVisualProjectBibleFromDB(
        supabase,
        projectId,
        project.title || "Untitled Project",
      );

      console.log(`[generate-document][visual_project_bible] assembly_complete { method: ${vpbResult.generation_method}, chars: ${vpbResult.markdown.length}, signals: ${vpbResult.visual_canon_signals_available}, characters: ${vpbResult.character_count}, locations: ${vpbResult.location_count}, assets: ${vpbResult.asset_count}, blockers: ${vpbResult.blockers.length}, is_complete: ${vpbResult.is_complete} }`);

      // Log blockers for diagnostics
      for (const b of vpbResult.blockers) {
        if (b.severity === 'hard') {
          console.error(`[generate-document][visual_project_bible][BLOCKER] ${b.blocker}: ${b.detail}`);
        } else {
          console.warn(`[generate-document][visual_project_bible][SOFT] ${b.blocker}: ${b.detail}`);
        }
      }

      content = vpbResult.markdown;
      system = "[deterministic_assembly — no LLM system prompt]";
      userPrompt = "[visual_project_bible deterministic assembly]";
    } else {
      const ladderBlock = buildLadderPromptBlock(formatToLane(project.format));
      const nuanceBlock = buildNuancePromptBlock(nuanceParams);

      // ── CPM_V1: inject Character Pressure Matrix block for episode_grid ──
      const cpmEnabled = isCPMEnabled();
      const cpmBlock = (cpmEnabled && docType === "episode_grid")
        ? CPM_GENERATION_PROMPT_BLOCK
        : "";
      if (cpmEnabled && docType === "episode_grid") {
        logCPM("cpm_v1_applied", { doc_type: "episode_grid", source: "generate-document" });
      }

      // ── CHARACTER_BIBLE_DEPTH_V1: inject depth checklist for character_bible ──
      let charBibleDepthBlock = "";
      try {
        const { isCharBibleDepthEnabled, CHARACTER_BIBLE_DEPTH_PROMPT_BLOCK } = await import("../_shared/ciBlockerGate.ts");
        if (isCharBibleDepthEnabled() && docType === "character_bible") {
          charBibleDepthBlock = CHARACTER_BIBLE_DEPTH_PROMPT_BLOCK;
          console.log(`[generate-document][IEL] char_bible_depth_v1_applied { doc_type: "character_bible" }`);
        }
      } catch { /* flag off or import fails — no-op */ }

      // ── VD_FORMAT_RULES_SEED: deterministic constraints for Vertical Drama format_rules ──
      let vdFormatRulesBlock = "";
      if (docType === "format_rules" && isVerticalDrama) {
        // Load pitch criteria from canon_json and project metadata
        let canonData: any = null;
        try {
          const { data: canonRow } = await supabase.from("project_canon")
            .select("canon_json").eq("project_id", projectId).maybeSingle();
          canonData = canonRow?.canon_json;
        } catch { /* no canon — proceed with defaults */ }

        const epCount = resolvedQuals.season_episode_count || canonData?.episode_count || 30;
        const epDurMin = durMin || 120;
        const epDurMax = durMax || 180;
        const epDurMidVal = Math.round((epDurMin + epDurMax) / 2);
        const budgetBand = canonData?.budget_band || canonData?.budgetBand || "micro-to-low";
        const culturalAnchor = canonData?.cultural_tag || canonData?.culturalTag || "";
        const toneAnchor = canonData?.tone_anchor || canonData?.toneAnchor || "";

        // Compute beat targets from shared module
        const vdBeatTargets = (await import("../_shared/verticalDramaBeats.ts")).computeBeatTargets({
          minSeconds: epDurMin,
          maxSeconds: epDurMax,
        });

        // Pacing heuristic from cultural anchor
        let pacingGuidance = "Standard scroll-stopping cadence with constant forward momentum.";
        const culturalLower = culturalAnchor.toLowerCase();
        if (culturalLower.includes("k-drama") || culturalLower.includes("korean")) {
          pacingGuidance = "K-drama rhythmic pacing: emotional swell → beat → reaction → cliffhanger. Lingering close-ups on emotional pivots. Restrained dialogue density.";
        } else if (culturalLower.includes("telenovela") || culturalLower.includes("latin")) {
          pacingGuidance = "Telenovela-driven pacing: rapid emotional reversals, confrontational dialogue peaks, dramatic reveals every 30–45 seconds.";
        } else if (culturalLower.includes("bollywood") || culturalLower.includes("indian")) {
          pacingGuidance = "Bollywood-influenced pacing: melodrama peaks balanced with intimate moments, musical/emotional punctuation points, family-centric tension arcs.";
        } else if (culturalLower.includes("anime") || culturalLower.includes("manga")) {
          pacingGuidance = "Anime-influenced pacing: hard cuts between action and stillness, internal monologue beats, visual metaphor moments, escalating power dynamics.";
        }

        // Budget discipline from budgetBand
        let budgetDiscipline = "Standard production constraints.";
        const budgetLower = budgetBand.toLowerCase();
        if (budgetLower.includes("micro") || budgetLower.includes("ultra-low")) {
          budgetDiscipline = "ULTRA-TIGHT BUDGET: Maximum 2 standing locations per episode. No crowd scenes. No VFX. No stunts. Cast limit: 3–5 principals per episode. Natural lighting preferred. Single-camera coverage.";
        } else if (budgetLower.includes("low")) {
          budgetDiscipline = "LOW BUDGET: Maximum 3 locations per episode. Minimal extras. No complex VFX. Cast limit: 5–7 principals per episode. Simple practical effects only.";
        } else if (budgetLower.includes("mid") || budgetLower.includes("medium")) {
          budgetDiscipline = "MID BUDGET: Maximum 4–5 locations per episode. Modest extras allowed. Simple VFX permitted. Cast limit: 8–10 principals per episode.";
        }

        vdFormatRulesBlock = `## VERTICAL DRAMA FORMAT RULES — DETERMINISTIC SEED (MANDATORY)

The following constraints are NON-NEGOTIABLE. The generated Format Rules document MUST include ALL of these as explicit, numbered rules. Do NOT omit or soften any constraint.

### FRAME & DELIVERY
- Aspect ratio: 9:16 (vertical, mobile-first)
- Platform: Mobile streaming / short-form vertical platform
- Delivery format: Episodic series, ${epCount} episodes per season

### EPISODE DURATION
- Target duration range: ${epDurMin}–${epDurMax} seconds per episode (midpoint: ${epDurMidVal}s)
- Hard minimum: ${epDurMin}s — no episode may be shorter
- Hard maximum: ${epDurMax}s — no episode may exceed this

### BEAT CADENCE
- ${vdBeatTargets.summaryText}
- Beat spacing target: ${vdBeatTargets.beatSpacingLabel}
- HOOK within first ${vdBeatTargets.hookWindowSeconds[0]}–${vdBeatTargets.hookWindowSeconds[1]} seconds — scroll-stopping opening mandatory
- Micro-cliffhanger REQUIRED at end of every episode — no resolution within same episode
- 3-beat minimum structure: HOOK → CORE TURN → CLIFFHANGER

### VISUAL GRAMMAR
- Close-up dominant: 60–70% of shots must be close-ups or medium close-ups (MCU)
- No wide establishing shots longer than 3 seconds
- Vertical framing: all composition optimized for 9:16 — no horizontal pans, no letterboxing
- Single-subject framing preferred — avoid two-shots wider than MCU

### PACING & CULTURAL ANCHOR
${toneAnchor ? `- Tone anchor: ${toneAnchor}` : ""}
${culturalAnchor ? `- Cultural anchor: ${culturalAnchor}` : ""}
- ${pacingGuidance}
- Dead air prohibition: no beat gap longer than ${vdBeatTargets.beatSpacingTargetSeconds + 3} seconds without narrative progression
- Every scene must contain forward momentum — no static exposition dumps

### LOCATION DISCIPLINE
${budgetDiscipline}
- Location repetition encouraged — audience builds spatial familiarity in short-form
- Exterior-to-interior ratio: favor interiors (70%+ interior) for lighting and audio control

### DIALOGUE RULES
- Maximum 3 lines of uninterrupted dialogue before a visual cut, reaction, or beat shift
- Dialogue must be speakable in under ${Math.round(epDurMidVal * 0.4)} seconds total per episode (≈40% dialogue ratio)
- Subtext preferred over exposition — show don't tell

### BUDGET DISCIPLINE
- Budget band: ${budgetBand}
${budgetDiscipline}

IMPORTANT: Structure the output as a formal FORMAT RULES document with numbered rules under clear section headings. Every constraint above must appear as an explicit rule.

SCOPE GUARD: This document contains ONLY format and technical production rules. Do NOT include season narrative arcs, character arcs, act breakdowns, episode story summaries, or any story content. Those belong in Season Arc, Episode Grid, and Character Bible respectively.`;

        console.log(`[generate-document] VD_FORMAT_RULES_SEED applied: epCount=${epCount} dur=${epDurMin}-${epDurMax}s budget=${budgetBand} cultural=${culturalAnchor || 'none'}`);
      }

      // ── SEASON_ARC_SCOPE: deterministic scope definition for season_arc ──
      let seasonArcScopeBlock = "";
      if (docType === "season_arc") {
        const sacEpCount = resolvedQuals?.season_episode_count || 30;
        seasonArcScopeBlock = `
## SEASON ARC — SCOPE DEFINITION (MANDATORY)

You are generating a SEASON ARC document. This document defines the macro-level narrative architecture of the entire season. Follow the scope rules below exactly.

### MUST CONTAIN — every section below is required:

1. **Series Arc** — The overarching narrative spine from episode 1 to the finale. State the central dramatic question and how it resolves.

2. **Act Structure** — How the ${sacEpCount} episodes divide into acts (typically 3). Lock turning-point episode numbers (e.g. Act 1: eps 1–N, Act 2: eps N+1–M, Act 3: eps M+1–${sacEpCount}).

3. **Character Arcs** — For each principal character: internal vs. external transformation, what they want vs. what they need, where they start vs. where they end.

4. **Relationship Arc** — The central relationship progression beat by beat from first meeting/encounter to resolution.

5. **Antagonist Arc** — The antagonist's escalation, revelation, and resolution across the season.

6. **Thematic Arc** — How the central theme builds, complicates, and pays off across the season.

7. **Key Episode Anchors** — Locked story pivots with episode numbers: inciting incident, midpoint revelation, break into Act 3, climax, finale.

8. **Tone Map** — Emotional rhythm across the season: when tension peaks, when it breathes, where comedy relief lands.

### MUST NOT CONTAIN — scope violations will be flagged as blocking issues:

- Format or technical production rules → belongs in Format Rules
- Episode-by-episode breakdown or per-episode summaries → belongs in Episode Grid
- Individual episode scripts or dialogue → belongs in Season Script
- Character descriptions, backstory, or casting notes → belongs in Character Bible
- Vertical beat structure or episode templates → belongs in Format Rules / Vertical Episode Beats
- Scene-level detail or shot descriptions → belongs in Episode Script

### SCOPE GUARD
If you find yourself writing content that belongs in another document type listed above, STOP and redirect. The Season Arc is a MACRO document — it operates at the season level, not the episode level. Each section should describe trajectories and turning points, not granular scene-by-scene content.
`;
        console.log(`[generate-document] SEASON_ARC_SCOPE applied: epCount=${sacEpCount}`);
      }

      // ── FORMAT_RULES_SCOPE: scope definition for all format_rules documents ──
      // ── SEASON_SCRIPT_SCOPE: scope definition for vertical drama season scripts ──
      let seasonScriptScopeBlock = "";
      if (docType === "season_script") {
        const ssEpCount = resolvedQuals?.season_episode_count || 30;
        const ssDurMin = durMin || 120;
        const ssDurMax = durMax || 180;
        const isVD = isVerticalDrama;
        if (isVD) {
          seasonScriptScopeBlock = `## VERTICAL DRAMA SEASON SCRIPT — MANDATORY STRUCTURE

You are generating a SEASON SCRIPT for a ${ssEpCount}-episode vertical drama series. This is NOT a project overview, treatment, or summary. It is a SCRIPTED document containing actual scene content for every episode.

### WHAT THIS DOCUMENT MUST CONTAIN

For EVERY episode (Episodes 1–${ssEpCount}), write the following:

**EPISODE [N] — [EPISODE TITLE]**
*Duration target: ${ssDurMin}–${ssDurMax} seconds*

**COLD OPEN (0:00–0:15)**
[Action line: what the viewer sees. No more than 3 lines. Must be a scroll-stopping hook.]

**SCENE 1 — [SCENE HEADING]**
[Action line]
CHARACTER NAME
(parenthetical if needed)
Dialogue line.
[Continue action / reaction]
CHARACTER NAME
Dialogue line.

**SCENE 2 — [SCENE HEADING]**
[Continue with 2–4 more scenes per episode]

**CLIFFHANGER / EPISODE END**
[Action line: final image + unresolved tension that drives to next episode]

---

### MANDATORY RULES
1. Write EVERY episode — do not skip, summarise, or abbreviate any episode
2. Use PROPER SCREENPLAY FORMAT: sluglines, action lines, character names, dialogue
3. Each episode must have: COLD OPEN + minimum 3 scenes + CLIFFHANGER
4. Dialogue must be character-specific and reveal personality — no generic lines
5. Every episode must end on an unresolved micro-cliffhanger
6. Total document target: ${ssEpCount * 2}–${ssEpCount * 4} pages of scripted content

### WHAT THIS DOCUMENT MUST NOT CONTAIN
- Project overview sections or loglines (belongs in Concept Brief)
- Character descriptions or backstory summaries (belongs in Character Bible)
- Technical format rules (belongs in Format Rules)
- Beat structure templates or patterns (belongs in Episode Beats)
- Completion status headers or deliverable metadata preambles

### CRITICAL
Begin DIRECTLY with "# [PROJECT TITLE] — SEASON SCRIPT" then "## EPISODE 1". 
Do NOT include any preamble, status headers, or deliverable type declarations.
The upstream documents (Episode Beats, Character Bible, Season Arc) contain all the story beats — use them to write ACTUAL scripted scenes.`;
        } else {
          seasonScriptScopeBlock = `## SEASON SCRIPT — MANDATORY STRUCTURE

You are generating a SEASON SCRIPT. This is a SCRIPTED document with actual scene content, dialogue, and action lines — NOT a summary or project overview.

Write proper screenplay format (sluglines, action lines, character names, dialogue) for all key scenes across the season. Prioritise the pilot episode as a full script, then provide scripted highlight scenes for each subsequent episode.`;
        }
      }

      // ── FORMAT_RULES_SCOPE: scope definition for all format_rules documents ──
      let formatRulesScopeBlock = "";
      if (docType === "format_rules") {
        formatRulesScopeBlock = `
## FORMAT RULES — SCOPE DEFINITION (MANDATORY)

You are generating a FORMAT RULES document. This document defines the technical and production constraints that govern how episodes are constructed. Follow the scope rules below exactly.

### MUST CONTAIN — only technical/format rules:

- Screen/aspect ratio rules (e.g. 9:16 for vertical, 16:9 for broadcast)
- Episode length and pacing rules (target duration, word count targets, timing constraints)
- Visual grammar — camera rules, framing rules, required/forbidden shot types
- Beat cadence — hook window timing, beat count per episode, beat spacing targets
- Dialogue rules — density limits, subtext requirements, exposition caps
- Location and production discipline — location caps per episode, budget-driven constraints
- Technical production constraints derived from format, budget, and platform

### MUST NOT CONTAIN — scope violations will be flagged as blocking issues:

- Season narrative structure, act breakdowns, or story arc → belongs in Season Arc
- Character arcs, character descriptions, or backstory → belongs in Season Arc / Character Bible
- Episode-by-episode story content or summaries → belongs in Episode Grid
- Scripts, dialogue samples, or scene content → belongs in Season Script / Episode Script
- Any story content whatsoever — this is a TECHNICAL document

### SCOPE GUARD
If you find yourself describing what happens in the story, which characters appear, or how the narrative develops, STOP. Format Rules describe HOW episodes are built (technical constraints), not WHAT they contain (story).
`;
      }

      // ── PRODUCTION_DRAFT_SCOPE: format-aware scope for production_draft ──
      let productionDraftScopeBlock = "";
      if (docType === "production_draft") {
        const formatStr = (project.format || "film").toLowerCase();
        const isSeriesFormat = ["tv-series","limited-series","digital-series","anim-series","reality"].includes(formatStr);
        const isVDFormat = formatStr.includes("vertical");

        if (isVDFormat) {
          productionDraftScopeBlock = `## PRODUCTION DRAFT — VERTICAL DRAMA (MANDATORY)

You are generating a PRODUCTION DRAFT for a vertical drama series. This is the final production-ready version of the season script.
Maintain the episodic structure from the season script — each episode is a discrete unit.
Use proper screenplay format throughout.`;
        } else if (isSeriesFormat) {
          productionDraftScopeBlock = `## PRODUCTION DRAFT — SERIES (MANDATORY)

You are generating a PRODUCTION DRAFT for a series episode. This is the final production-ready version of the episode script.
Maintain proper screenplay format. This is a single episode — do NOT write multiple episodes.`;
        } else {
          productionDraftScopeBlock = `## PRODUCTION DRAFT — FEATURE FILM (MANDATORY)

You are generating a PRODUCTION DRAFT for a single, continuous feature film. This is the final production-ready screenplay.

### CRITICAL FORMAT RULES
1. This is a SINGLE CONTINUOUS FEATURE SCREENPLAY — NOT a series, NOT episodic, NOT a season script
2. Do NOT divide the script into episodes, episode numbers, or episode titles
3. Do NOT label any section as "Episode 01", "Episode 02", etc.
4. Do NOT use season/episode structure of any kind
5. Structure the screenplay using standard feature film acts (Act 1, Act 2, Act 3)
6. Use standard screenplay format throughout: INT./EXT. sluglines, action lines, character names, dialogue
7. The entire document is ONE continuous story from FADE IN to FADE OUT
8. Target: 95–115 pages (approximately 24,000–28,000 words)

### SCOPE GUARD
If you find yourself writing "Episode" headings, episode numbers, or dividing the screenplay into discrete episodic units, STOP. This is a feature film — one continuous narrative from beginning to end.`;
        }
      }

      const isScriptType = ["feature_script","episode_script","season_script","production_draft","screenplay_draft"].includes(docType);
      const screenplayProhibition = !isScriptType
        ? `## SCREENPLAY FORMAT PROHIBITION (MANDATORY)\nThis is a ${docType.replace(/_/g, " ")} — NOT a screenplay. Do NOT use:\n- INT./EXT. scene headings or sluglines\n- Character name cues (CHARACTER NAME on its own line above dialogue)\n- Parenthetical action directions\n- Formatted dialogue blocks\nWrite in prose or structured text only. Violations will cause rejection.`
        : "";

      // Fix E — Per-act vs full prompt split:
      // Full outline (no resumeVersionId): emphasise ALL 4 acts context.
      // Per-act resume (resumeVersionId present): keep "specified act" phrasing.
      const isFullOutline = docType === "story_outline" && !(body as any).resumeVersionId;
      const storyOutlineRule = (docType === "story_outline" || docType === "architecture")
        ? isFullOutline
          ? `## STORY OUTLINE FORMAT (MANDATORY)\nOUTPUT AS JSON — see template for exact JSON structure. You are generating ALL 4 acts (Act 1, Act 2A, Act 2B, Act 3) in parallel chunks. Each chunk must produce one act's entries. For your assigned act: generate 5-8 individual moments in the JSON entries array. Each moment: 3-5 sentences describing what happens, the dramatic purpose, and the emotional shift. Each moment is one {"number", "title", "description"} entry in the "entries" array — EVERY entry follows THIS EXACT schema. NO per-act schema variation is permitted. No sluglines. No character cues. No dialogue formatting. Total ~25-32 moments across all 4 acts.`
          : `## STORY OUTLINE FORMAT (MANDATORY)\nOUTPUT AS JSON — see template for exact JSON structure. Generate the specified act as 5-8 individual moments in the JSON entries array. Each moment: 3-5 sentences describing what happens, the dramatic purpose, and the emotional shift. Each moment is one {"number", "title", "description"} entry in the "entries" array — EVERY entry follows THIS EXACT schema. NO per-act schema variation is permitted. No sluglines. No character cues. No dialogue formatting. Total ~25-32 moments across all acts.`
        : "";

      // ── Stage Identity Prompt Injection ──
      const stageIdentityBlock = getStageIdentityPromptBlock(docType) || "";

      system = [
        `You are a professional development document generator for film/TV projects. Creative direction in this prompt must be honoured — implement the intent with full craft across the full document. Never ignore, dilute, or reinterpret creative direction away from what was asked.`,
        `Generate a ${docType.replace(/_/g, " ")} document for the project "${project.title}".`,
        `Production type: ${project.format || "film"}`,
        docType === "story_outline"
          ? `## OUTPUT FORMAT RULE (MANDATORY)\nOutput VALID JSON ONLY. Follow the template JSON structure exactly. Do NOT output markdown, code fences, or anything outside the JSON object. No preamble.`
          : `## OUTPUT FORMAT RULE (MANDATORY)\nOutput PLAIN MARKDOWN TEXT only. Do NOT output JSON, XML, code blocks, or any structured data format. Do NOT wrap your response in \`\`\`json or \`\`\`markdown fences. Begin directly with the document content (e.g. a heading like "# CONCEPT BRIEF" or "## LOGLINE"). No preamble.`,
        stageIdentityBlock,
        screenplayProhibition,
        storyOutlineRule,
        completenessBlock,
        qualBlock,
        styleBlock,
        ladderBlock,
        nuanceBlock,
        narrativeBlock,
        cpmBlock,
        charBibleDepthBlock,
        vdFormatRulesBlock,
        seasonArcScopeBlock,
        formatRulesScopeBlock,
        seasonScriptScopeBlock,
        productionDraftScopeBlock,
        additionalContext ? `## CREATIVE DIRECTION (MUST INCORPORATE)\n${additionalContext}` : "",
        `If the upstream documents contain sections titled "Creative DNA Targets (From Trend Convergence)" or "Convergence Guidance (Audience Appetite Context)", treat them as strong recommendations for voice, tone, pacing, and world density while staying original.`,
        mode === "final" ? "This is a FINAL version — ensure completeness and polish." : "This is a DRAFT — focus on substance over polish.",
      ].filter(Boolean).join("\n\n");

      // ── format_rules content focus override ──
      let contentFocus = "";
      if (docType === "format_rules") {
        contentFocus = "\n\n⚠️ FORMAT RULES SCOPE: Generate ONLY technical/production constraints (aspect ratio, beat cadence, visual grammar rules, dialogue density limits, location discipline, budget constraints). UPSTREAM CHARACTER CONTENT IS IRRELEVANT — do not include character names, descriptions, arcs, backstory, or any narrative elements in this document.";
      }

      // ── beat_sheet: read Treatment for tone + atmosphere, Story Outline for scene structure ──
      if (docType === "beat_sheet") {
        contentFocus = "\n\n## IMPORT/EVOLVE/GENERATE — MANDATORY\n- LOGLINE: IMPORT from concept_brief.logline. Copy exactly. Do NOT reinterpret or paraphrase.\n- TONE: IMPORT from treatment.tone. Copy exactly. Do NOT reinterpret.\n- THE WORLD: EVOLVE from concept_brief.world and treatment.world. Do not contradict either source.\n- BEATS: GENERATE from story_outline scenes. Use story_outline scene structure as the spine. Each beat must cite which story_outline scene it expands.\n- CHARACTER BACKSTORY, WORLD RULES, RELATIONSHIP FACTS: Only from concept_brief or character_bible. Do NOT invent new facts.\n- BEYOND THIS: Use Beat Sheet format (numbered beats with descriptions, act labels, turning point flags, structural purpose).";
      }

      // ── screenplay_draft / feature_script: read Beat Sheet for structural beats ──
      if (docType === "screenplay_draft" || docType === "feature_script") {
        contentFocus = "\n\n## IMPORT/EVOLVE/GENERATE — MANDATORY\n- BEAT STRUCTURE: IMPORT from beat_sheet. Follow the beat sequence exactly. Do not reorder, skip, or add beats outside the beat_sheet structure.\n- SCENE SETTING: EVOLVE from treatment.world and story_outline scene settings. Do not contradict either source.\n- CHARACTER VOICE: IMPORT from character_bible dialogue style notes. Use as the voice guide.\n- DIALOGUE: GENERATE in authentic character voice drawn from character_bible. Do not use generic dialogue.\n- SCENE ACTION: EVOLVE from treatment.world and beat.purpose. Build physical world texture from the source material.\n- NEW STORY EVENTS: Forbidden. All events must come from beat_sheet. Do not invent new story facts.";
      }


      userPrompt = upstreamContent
        ? `Using the upstream documents below, generate the ${docType.replace(/_/g, " ")}.\n\n${upstreamContent}${contentFocus}`
        : `Generate the ${docType.replace(/_/g, " ")} from scratch based on the project context.`;

      // ── Template injection ──
      // Append a canonical scaffold so the LLM fills a defined structure rather than
      // inventing formatting. Guarantees markdown output, all sections present, no JSON.
      try {
        const { buildTemplatePrompt } = await import("../_shared/docTypeTemplates.ts");
        const templateBlock = buildTemplatePrompt(docType, {
          title: project.title,
          format: project.format,
          episodeCount: resolvedQuals?.season_episode_count,
          episodeDurationMin: resolvedQuals?.episode_target_duration_min_seconds,
          episodeDurationMax: resolvedQuals?.episode_target_duration_max_seconds,
        });
        if (templateBlock) {
          userPrompt += templateBlock;
          console.log(`[generate-document] template_injected { doc_type: "${docType}", project_id: "${projectId}" }`);
        }
      } catch (tErr: any) {
        console.warn(`[generate-document] template_inject_failed { doc_type: "${docType}", error: "${tErr?.message}" }`);
      }
    }

    // 5) Generate content

    // ─────────────────────────────────────────────────────────────
    // EPISODE FORENSICS + ROUTING
    // Fires for: episode_grid, episode_beats, vertical_episode_beats
    // ─────────────────────────────────────────────────────────────
    const requestId = crypto.randomUUID();
    const isEpisodeDocType = EPISODE_DOC_TYPES.has(docType);
    let llmCallCount = 0;

    // ═══ CANONICAL GENERATION MODE RESOLVER ═══
    // Single source of truth for how this doc type is generated.
    // Replaces ad-hoc isDeterministicAssembly booleans.
    const isLargeRisk = isLargeRiskDocType(docType);
    const generationMode: GenerationMode = resolveDocumentGenerationMode(docType, isEpisodeDocType, isLargeRisk);
    const isDeterministicAssembly = generationMode === "deterministic_assembly";

    const modeDiag = buildModeDiagnostic(docType, generationMode);
    console.log(`[generate-document][IEL] generation_mode_resolved ${JSON.stringify(modeDiag)}`);

    // Episode count: prefer client override, then qualifiers, NO fallback
    const finalEpisodeCount: number | null =
      (body as any)?.episodeCount ?? resolvedQuals?.season_episode_count ?? null;

    if (isDeterministicAssembly) {
      // ═══ DETERMINISTIC ASSEMBLY: SKIP ALL LLM GENERATION ═══
      // `content` was already set by the assembly branch above (e.g. VPB).
      // All LLM phases are fail-closed forbidden for this mode.
      console.log(`[generate-document][IEL] deterministic_assembly_bypass { docType: "${docType}", contentLength: ${content.length}, mode: "${generationMode}" }`);
    } else if (isEpisodeDocType) {
      // A) DIAG_REQ — Request Context
      console.error(JSON.stringify({
        diag: "DIAG_REQ",
        requestId,
        timestamp: new Date().toISOString(),
        project_id: projectId,
        document_id: (body as any)?.documentId ?? (body as any)?.document_id ?? null,
        doc_type: docType,
        project_format: project?.format ?? null,
        user_id: actorUserId,
      }));

      // B) DIAG_EP_COUNT — Episode Count Resolution
      const clientEpCount = (body as any)?.episodeCount ?? null;
      const qualsEpCount = resolvedQuals?.season_episode_count ?? null;
      const episodeCountSource =
        clientEpCount != null ? "body.episodeCount"
        : qualsEpCount != null ? "resolvedQuals.season_episode_count"
        : "NONE";

      console.error(JSON.stringify({
        diag: "DIAG_EP_COUNT",
        requestId,
        candidates: { clientEpCount, qualsEpCount },
        finalEpisodeCount,
        episodeCountSource,
      }));

      if (finalEpisodeCount == null) {
        console.error(JSON.stringify({
          diag: "⚠️ DEFAULT_EPISODE_COUNT_USED",
          requestId,
          message: "All episode count sources are null — will return error",
        }));
      }

      if (finalEpisodeCount != null && finalEpisodeCount <= 8 &&
          ((clientEpCount != null && clientEpCount > 8) || (qualsEpCount != null && qualsEpCount > 8))) {
        console.error(JSON.stringify({
          diag: "⚠️ EPISODE_COUNT_COLLAPSE",
          requestId,
          message: `finalEpisodeCount=${finalEpisodeCount} but a source indicates >8`,
          candidates: { clientEpCount, qualsEpCount },
        }));
      }

      // C) DIAG_PATH — Generation Path
      console.error(JSON.stringify({
        diag: "DIAG_PATH",
        requestId,
        chunked_generator: finalEpisodeCount != null,
        single_shot_callLLM: false,
        branch_condition: "ALL episode doc types use chunked generator",
        batch_size: 6,
      }));

      // D) DIAG_UPSTREAM_DOCS — Upstream Document Forensics
      const upstreamDiag: any[] = [];
      if (upstreamTypes.length > 0) {
        const { data: diagDocs } = await supabase
          .from("project_documents")
          .select("id, doc_type, latest_version_id, project_id, created_at")
          .eq("project_id", projectId)
          .in("doc_type", upstreamTypes);

        const diagVIds = (diagDocs || [])
          .filter((d: any) => d.latest_version_id)
          .map((d: any) => d.latest_version_id);
        let diagVerMap = new Map<string, any>();
        if (diagVIds.length > 0) {
          const { data: diagVers } = await supabase
            .from("project_document_versions")
            .select("id, document_id, version_number, plaintext, created_at")
            .in("id", diagVIds);
          diagVerMap = new Map((diagVers || []).map((v: any) => [v.id, v]));
        }

        for (const doc of (diagDocs || [])) {
          const ver = doc.latest_version_id
            ? diagVerMap.get(doc.latest_version_id)
            : null;
          const snippet = ver?.plaintext
            ? ver.plaintext.substring(0, 300)
            : "(no content)";
          upstreamDiag.push({
            document_id: doc.id,
            project_id: doc.project_id,
            doc_type: doc.doc_type,
            latest_version_id: doc.latest_version_id ?? null,
            version_number: ver?.version_number ?? null,
            created_at: doc.created_at,
            content_first_300: snippet,
          });

          if (doc.project_id !== projectId) {
            console.error(JSON.stringify({
              diag: "⚠️ CROSS_PROJECT_LEAK",
              requestId,
              document_id: doc.id,
              doc_project_id: doc.project_id,
              request_project_id: projectId,
            }));
          }
        }
      }
      console.error(JSON.stringify({
        diag: "DIAG_UPSTREAM_DOCS",
        requestId,
        count: upstreamDiag.length,
        documents: upstreamDiag,
      }));

      // E) DIAG_MAYA_SCAN
      const mayaHits = {
        system_prompt: system.includes("Maya"),
        user_prompt: userPrompt.includes("Maya"),
        additionalContext: !!(additionalContext && additionalContext.includes("Maya")),
        upstreamContent: upstreamContent.includes("Maya"),
      };
      const mayaUpstreamDocs = upstreamDiag
        .filter(d => (d.content_first_300 || "").includes("Maya"))
        .map(d => ({
          document_id: d.document_id,
          doc_type: d.doc_type,
          project_id: d.project_id,
        }));
      const anyMaya = Object.values(mayaHits).some(Boolean);
      console.error(JSON.stringify({
        diag: "DIAG_MAYA_SCAN",
        requestId,
        found: anyMaya,
        locations: mayaHits,
        attributed_upstream_docs: mayaUpstreamDocs,
      }));

      if (anyMaya) {
        console.error(JSON.stringify({
          diag: "⚠️ MAYA_DETECTED",
          requestId,
          upstream_attribution: mayaUpstreamDocs,
        }));
      }
    }

    // ── Episode doc types: ALWAYS use chunked generator ──
    // Deterministic assembly docs skip ALL generation — they already have content.
    if (isDeterministicAssembly) {
      // No-op: content already set by assembly branch above.
      // Fall through directly to post-generation persistence.
    } else if (isEpisodeDocType) {
      if (finalEpisodeCount == null) {
        return new Response(JSON.stringify({
          error: "missing_episode_count",
          message: "Cannot generate episode document: season_episode_count is not set. Please set the episode count in project criteria or pass episodeCount in the request.",
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Defense-in-depth: vertical_episode_beats requires episode_grid as upstream.
      // If episode_grid wasn't resolved but character_bible was, the upstream resolution
      // fell through to character_bible — reject this as a wrong-configuration error.
      if (docType === "vertical_episode_beats" && !inputsUsed["episode_grid"] && inputsUsed["character_bible"]) {
        return new Response(JSON.stringify({
          error: "wrong_upstream",
          message: "vertical_episode_beats requires episode_grid as upstream, but character_bible was resolved.",
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // episode_grid = structural overview — can run 60+ episodes hitting the 60s timeout.
      // episode_beats / vertical_episode_beats = full micro-beat breakdown — slow (BATCH_SIZE=6,
      // 30-ep vertical-drama = 5 batches × ~40s = ~200s >> 150s edge function limit).
      // All episode modes use background generation: create placeholder version first, fire in background,
      // return immediately. Grid mode uses the same EdgeRuntime.waitUntil pattern as beats/script.
      const epOutputMode = docType === 'episode_grid' ? 'grid' : docType === 'season_script' ? 'script' : 'beats';

      // ── BACKGROUND GENERATION (beats / script / grid) ─────────────────────────────────────────
      if (epOutputMode === 'beats' || epOutputMode === 'script' || epOutputMode === 'grid') {
        // 1. Ensure doc row exists
        let { data: epDocRecord } = await supabase.from("project_documents")
          .select("id").eq("project_id", projectId).eq("doc_type", docType).maybeSingle();
        if (!epDocRecord) {
          const { data: newEpDoc, error: epDocErr } = await supabase.from("project_documents")
            .insert({
              project_id: projectId, doc_type: docType, user_id: actorUserId,
              file_name: `${docType}.md`, file_path: `${projectId}/${docType}.md`,
              extraction_status: "complete",
            }).select("id").single();
          if (epDocErr) throw new Error(`Failed to create episode beats doc record: ${epDocErr.message}`);
          epDocRecord = newEpDoc;
        }

        // 2. Guard: if a generation is ACTIVELY IN PROGRESS (<30 min ago, bg_generating=true), return it.
        //    IMPORTANT: only match bg_generating=true — NOT failed/completed versions (bg_generating=false).
        //    A failed version has bg_generating set to false (not null), and must NOT block a fresh retry.
        const { data: inProgressVer } = await supabase.from("project_document_versions")
          .select("id, version_number, created_at, meta_json")
          .eq("document_id", epDocRecord!.id)
          .eq("status", "draft")
          .eq("meta_json->>bg_generating", "true")   // Only truly-in-progress versions
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (inProgressVer) {
          const ageMs = Date.now() - new Date(inProgressVer.created_at).getTime();
          if (ageMs < 30 * 60 * 1000) {
            console.log(`[generate-document] Episode beats generation already in progress for ${docType} (version ${inProgressVer.version_number}, age ${Math.round(ageMs/1000)}s). Returning existing version.`);
            return new Response(JSON.stringify({
              success: true,
              document_id: epDocRecord!.id,
              version_id: inProgressVer.id,
              version_number: inProgressVer.version_number,
              generating: true,
              generating_since: inProgressVer.created_at,
              message: "Episode doc generation already in progress — poll for completion",
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Stale active flag (>30 min) — clear and start fresh
          console.log(`[generate-document] Stale bg_generating=true version found for ${docType} (age ${Math.round(ageMs/60000)} min) — clearing and starting fresh generation`);
          await supabase.from("project_document_versions")
            .update({ status: "draft", is_current: false, meta_json: { bg_generating: false, bg_stale: true } })
            .eq("id", inProgressVer.id);
        }

        // 3. Create placeholder version (is_current=true so UI can find the slot)
        // ── JUSTIFIED EXCEPTION: Direct insert — bg_generating placeholder with empty plaintext.
        // Cannot use doc-os.createVersion() because: (a) plaintext is empty (provenance gate rejects),
        // (b) requires serviceClient for is_current swap (RLS blocks user-scoped updates),
        // (c) placeholder is filled async in background task. This is the ONLY justified bypass. ──
        // Use serviceClient: user-scoped rlsClient UPDATE is silently blocked by RLS on this table.
        await serviceClient.from("project_document_versions")
          .update({ is_current: false })
          .eq("document_id", epDocRecord!.id)
          .eq("is_current", true);
        const { count: epVerCount } = await supabase.from("project_document_versions")
          .select("id", { count: "exact", head: true }).eq("document_id", epDocRecord!.id);
        const epVersionNum = (epVerCount || 0) + 1;
        const epDependsOn = DOC_DEPENDENCY_MAP[docType] || [];

        const { data: epVersion, error: epVerErr } = await supabase.from("project_document_versions")
          .insert({
            document_id: epDocRecord!.id,
            version_number: epVersionNum,
            status: "draft",
            plaintext: "",
            created_by: actorUserId,
            is_current: true,
            depends_on: epDependsOn,
            depends_on_resolver_hash: currentHash,
            inputs_used: inputsUsed,
            is_stale: false,
            stale_reason: null,
            meta_json: { bg_generating: true, bg_started_at: new Date().toISOString(), episode_count: finalEpisodeCount },
          }).select("id").single();
        if (epVerErr) throw new Error(`Failed to create episode beats version placeholder: ${epVerErr.message}`);

        // Mark all older versions as not-current
        await supabase.from("project_document_versions")
          .update({ is_current: false })
          .eq("document_id", epDocRecord!.id)
          .neq("id", epVersion!.id);

        // NOTE: Do NOT set latest_version_id here — version is empty placeholder.
        // latest_version_id will be set on successful completion in the bg task below.

        console.log(`[generate-document] Episode beats background generation starting: ${docType} v${epVersionNum} episodeCount=${finalEpisodeCount}`);

        // 4. Fire generation as background task (up to 2h via EdgeRuntime.waitUntil)
        const bgEpTask = (async () => {
          // Use serviceClient throughout: rlsClient silently blocks writes on
          // project_document_versions and project_document_chunks via RLS.
          try {
            const genContent = await generateEpisodeBeatsChunked({
              apiKey,
              episodeCount: finalEpisodeCount,
              systemPrompt: system,
              upstreamContent,
              projectTitle: project.title || "Untitled",
              requestId,
              outputMode: epOutputMode,
              supabase: serviceClient,
              versionId: epVersion!.id,
              documentId: epDocRecord!.id,
            });

            // ── Post-generation character validation ──
            if (genContent && upstreamContent) {
              // Build allowed character list from all upstream docs
              const allUpstreamText = upstreamContent;
              const charValidation = validateCharacterCues(genContent, allUpstreamText);
              if (!charValidation.passed) {
                console.warn(`[generate-document] CHARACTER INVENTION DETECTED in ${docType}: invented=[${charValidation.inventedCharacters.join(", ")}]`);
                // Log but don't block — the character lock prompt should prevent most cases.
                // Future: add retry with explicit "remove these invented names" instruction.
              } else {
                console.log(`[generate-document] Character validation PASSED for ${docType}`);
              }
            }

            await serviceClient.from("project_document_versions")
              .update({ plaintext: genContent, status: "draft", is_current: true, meta_json: { bg_generating: false, bg_completed_at: new Date().toISOString(), episode_count: finalEpisodeCount } })
              .eq("id", epVersion!.id);

            // NOW set latest_version_id — content is confirmed valid
            await serviceClient.from("project_documents")
              .update({ latest_version_id: epVersion!.id, updated_at: new Date().toISOString() })
              .eq("id", epDocRecord!.id);

            console.log(`[generate-document] Episode beats background generation COMPLETE: ${docType} v${epVersionNum} chars=${genContent.length}`);
          } catch (bgErr: any) {
            console.error(`[generate-document] Episode beats background generation FAILED: ${bgErr?.message}`);
            await serviceClient.from("project_document_versions")
              .update({ status: "draft", is_current: false, meta_json: { bg_generating: false, bg_failed: true, bg_failed_at: new Date().toISOString() } })
              .eq("id", epVersion!.id);
          }
        })();

        // @ts-ignore — EdgeRuntime available in Supabase edge function context
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
          EdgeRuntime.waitUntil(bgEpTask);
        }

        // 5. Return immediately — auto-run will poll on next loop
        return new Response(JSON.stringify({
          success: true,
          document_id: epDocRecord!.id,
          version_id: epVersion!.id,
          version_number: epVersionNum,
          mode,
          resolver_hash: currentHash,
          inputs_used: inputsUsed,
          depends_on: epDependsOn,
          generating: true,
          episode_count: finalEpisodeCount,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── SYNC GENERATION SECTION (dead code — all episode modes use background gen) ──
      // All episode modes (beats/script/grid) now route through the background generation
      // path at line 1333 and return at line 1492. This block is unreachable.
      // The synchronous grid mode was replaced because 60-episode grids hit the 60s timeout.

    } else if (docType === "character_bible" || docType === "long_character_bible") {
      // ── Per-character bible generation ──
      // Extract characters from concept brief via LLM, create narrative_entities,
      // generate per-character profiles, then assemble into final bible document.
      // Uses background task pattern matching episode/chunked branches.
      console.log(`[generate-document] Character bible "${docType}" — starting per-character background generation`);

      // 1. Ensure doc record exists
      let { data: cbDocRecord } = await supabase.from("project_documents")
        .select("id").eq("project_id", projectId).eq("doc_type", docType).single();
      if (!cbDocRecord) {
        const { data: newCbDoc, error: createErr } = await supabase.from("project_documents")
          .insert({
            project_id: projectId, doc_type: docType, user_id: actorUserId,
            file_name: `${docType}.md`, file_path: `${projectId}/${docType}.md`,
            extraction_status: "complete",
          }).select("id").single();
        if (createErr) throw new Error(`Failed to create doc record: ${createErr.message}`);
        cbDocRecord = newCbDoc;
      }

      // In-progress guard: don't double-start if already generating (<30 min)
      const { data: inProgressCbVer } = await supabase.from("project_document_versions")
        .select("id, version_number, created_at, meta_json")
        .eq("document_id", cbDocRecord!.id)
        .eq("status", "draft")
        .eq("meta_json->>bg_generating", "true")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (inProgressCbVer) {
        const ageMs = Date.now() - new Date(inProgressCbVer.created_at).getTime();
        if (ageMs < 30 * 60 * 1000) {
          console.log(`[generate-document] Character bible generation already in progress (age ${Math.round(ageMs/1000)}s) — returning existing version`);
          return new Response(JSON.stringify({
            success: true,
            document_id: cbDocRecord!.id,
            version_id: inProgressCbVer.id,
            version_number: inProgressCbVer.version_number,
            generating: true,
            message: "Character bible generation already in progress — poll for completion",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        // Stale flag (>30 min) — clear and restart
        console.log(`[generate-document] Stale bg_generating=true for ${docType} (${Math.round(ageMs/60000)} min) — clearing and restarting`);
        await serviceClient.from("project_document_versions")
          .update({ meta_json: { bg_generating: false, bg_stale: true } })
          .eq("id", inProgressCbVer.id);
      }

      // 2. Create placeholder version
      await serviceClient.from("project_document_versions")
        .update({ is_current: false })
        .eq("document_id", cbDocRecord!.id)
        .eq("is_current", true);
      const { count: cbVerCount } = await supabase.from("project_document_versions")
        .select("id", { count: "exact", head: true }).eq("document_id", cbDocRecord!.id);
      const cbVersionNum = (cbVerCount || 0) + 1;
      const cbDependsOnFields = DOC_DEPENDENCY_MAP[docType] || [];
      const { data: cbVersion, error: cbVerErr } = await supabase.from("project_document_versions")
        .insert({
          document_id: cbDocRecord!.id, version_number: cbVersionNum,
          status: "draft", plaintext: "", created_by: actorUserId,
          depends_on: cbDependsOnFields, depends_on_resolver_hash: currentHash,
          inputs_used: inputsUsed,
          is_current: true,
          is_stale: false,
          stale_reason: null,
          meta_json: { bg_generating: true, bg_started_at: new Date().toISOString(), doc_type: docType },
        }).select("id").single();
      if (cbVerErr) throw new Error(`Failed to create character bible version: ${cbVerErr.message}`);

      // Mark older versions as not-current
      await supabase.from("project_document_versions")
        .update({ is_current: false })
        .eq("document_id", cbDocRecord!.id)
        .neq("id", cbVersion!.id);

      // 3. Fire background generation task
      const bgCbTask = (async () => {
        try {
          const conceptBriefContent = upstreamContent || "";

          // Load existing character bible content for regeneration context
          let existingCBContent = "";
          try {
            const { data: prevBible } = await serviceClient
              .from("project_document_versions")
              .select("plaintext")
              .eq("document_id", cbDocRecord!.id)
              .neq("id", cbVersion!.id)
              .not("plaintext", "eq", "")
              .order("version_number", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (prevBible?.plaintext) {
              existingCBContent = prevBible.plaintext;
              console.log(`[generate-document] Loaded existing bible content (${existingCBContent.length} chars)`);
            }
          } catch (e) {
            console.log(`[generate-document] No previous bible — first-time generation`);
          }

          // Step A: Read characters from project_canon (canonical source established by DevSeed).
          // This avoids canon conflicts: same source → same characters → no conflicting notes.
          let characters: Array<{name: string; role: string; description: string}> = [];
          try {
            const { data: canonRow } = await serviceClient
              .from("project_canon")
              .select("canon_json")
              .eq("project_id", projectId)
              .maybeSingle();
            const canonChars = canonRow?.canon_json?.characters;
            if (Array.isArray(canonChars) && canonChars.length > 0) {
              characters = canonChars.map((c: any) => ({
                name: c.name || "Unknown",
                role: c.role || "unknown",
                description: c.description || "",
              }));
              console.log(`[generate-document] Read ${characters.length} characters from project_canon`);
            }
          } catch { /* fall through to fallback */ }

          // Fallback: extract from concept brief via LLM if canon is empty
          if (!Array.isArray(characters) || characters.length === 0) {
            console.log(`[generate-document] No characters in project_canon — extracting from concept brief`);
            const extractPrompt = `Analyze the concept brief below and identify ALL characters mentioned. Return a JSON array of objects, each with:
- "name": the character's full name
- "role": their role in the story (e.g., "protagonist", "antagonist", "supporting", "love interest", "mentor", etc.)
- "description": a brief 1-2 sentence description based solely on the concept brief

Return ONLY valid JSON, no markdown, no explanation.

Example:
[{"name": "Jane Doe", "role": "protagonist", "description": "A brilliant scientist who discovers a way to communicate across dimensions."}]`;

            const extractUser = `CONCEPT BRIEF:\n${conceptBriefContent.slice(0, 50000)}`;
            const extractRaw = await callLLM(apiKey, extractPrompt, extractUser);
            const jsonMatch = extractRaw.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              try {
                characters = JSON.parse(jsonMatch[0]);
              } catch { /* fall through to default */ }
            }
            if (!Array.isArray(characters) || characters.length === 0) {
              characters = [{ name: "Protagonist", role: "protagonist", description: "The main character of the story." }];
              console.warn(`[generate-document] Character extraction returned empty — using fallback`);
            }
            console.log(`[generate-document] Extracted ${characters.length} characters from concept brief`);
          }

          // Dedup guardrail: filter out characters whose names are aliases of other characters in the list
          // Prevents duplicate bible entries when e.g., "Brother" and "Enki" both appear in project_canon
          if (Array.isArray(characters) && characters.length > 1) {
            try {
              const { data: allAliases } = await serviceClient
                .from("narrative_entity_aliases")
                .select("alias_name, canonical_entity_id")
                .eq("project_id", projectId);

              if (allAliases && allAliases.length > 0) {
                // Get canonical names for all aliased entities
                const targetIds = [...new Set(allAliases.map((a: any) => a.canonical_entity_id))];
                const { data: targetEntities } = await serviceClient
                  .from("narrative_entities")
                  .select("id, canonical_name")
                  .in("id", targetIds);

                if (targetEntities && targetEntities.length > 0) {
                  // Build alias_lowercase -> canonical_name_lowercase map
                  const aliasToCanonical = new Map<string, string>();
                  const entityIdToName = new Map(targetEntities.map((e: any) => [e.id, e.canonical_name]));
                  // Build lowercased canonical name -> original case canonical name map
                  const canonicalLowerToOriginal = new Map<string, string>();
                  for (const e of targetEntities) {
                    canonicalLowerToOriginal.set(e.canonical_name.toLowerCase(), e.canonical_name);
                  }
                  for (const a of allAliases) {
                    const canonical = entityIdToName.get(a.canonical_entity_id);
                    if (canonical) {
                      aliasToCanonical.set(a.alias_name.toLowerCase(), canonical.toLowerCase());
                    }
                  }

                  // Build set of names from the input array (lowercased)
                  const charNameLower = new Set(characters.map((c: any) => c.name.toLowerCase()));

                  // Filter: keep only characters whose name is NOT an alias of another character already in the list
                  const filtered = characters.filter((c: any) => {
                    const canonicalLower = aliasToCanonical.get(c.name.toLowerCase());
                    if (canonicalLower && canonicalLower !== c.name.toLowerCase() && charNameLower.has(canonicalLower)) {
                      const canonicalOriginal = canonicalLowerToOriginal.get(canonicalLower) || canonicalLower;
                      console.log(`[generate-document] Dedup guardrail: skipping "${c.name}" (alias of "${canonicalOriginal}")`);
                      return false;
                    }
                    return true;
                  });

                  if (filtered.length < characters.length) {
                    console.log(`[generate-document] Dedup guardrail: filtered ${characters.length - filtered.length} alias-based duplicate(s) from character list`);
                    characters = filtered;
                  }
                }
              }
            } catch (dedupErr: any) {
              console.error(`[generate-document] Dedup guardrail error: ${dedupErr?.message || dedupErr}`);
              // Non-fatal — proceed with original characters array
            }
          }

          // Step B: For each character, create entity + generate profile
          const profiles: Array<{name: string; role: string; profile: string}> = [];
          let completedCount = 0;

          for (const char of characters) {
            try {
              // Create or find narrative_entity (dedup-aware)
              const { entity_id: entityId } = await findOrCreateCharacterEntity(
                serviceClient,
                projectId,
                char.name,
                char.role,
                char.description,
                docType,
                cbVersion!.id,
              );

              // Generate character profile via LLM
              const profilePrompt = `You are generating a detailed character profile for a character bible. 
Based on the concept brief, character details, and any existing bible content below, write a thorough character profile using markdown.

IMPORTANT: If existing bible content is provided, PRESERVE and enhance it — don't discard previous work. 
Incorporate new details from the concept brief while keeping established character traits and arcs.

Include these sections where applicable:
- **Overview**: Who is this character?
- **Role in Story**: Their narrative function
- **Personality**: Key traits, motivations, flaws
- **Backstory**: History and background (infer from concept brief clues)
- **Relationships**: How they relate to other characters
- **Arc**: Potential growth or change throughout the story

Write naturally — read like a professional development bible entry. 300-800 words.`;

              const profileUser = `Character Name: ${char.name}
Role: ${char.role}
Description: ${char.description}

Source Concept Brief:
${conceptBriefContent.slice(0, 30000)}

Existing Bible Content:
${existingCBContent.slice(0, 30000)}`;

              const profile = await callLLM(apiKey, profilePrompt, profileUser);
              profiles.push({ name: char.name, role: char.role, profile });
              completedCount++;

              // Update per-character progress in meta_json
              await serviceClient.from("project_document_versions")
                .update({
                  meta_json: {
                    bg_generating: true,
                    bg_started_at: new Date().toISOString(),
                    doc_type: docType,
                    characters_total: characters.length,
                    characters_completed: completedCount,
                    current_character: char.name,
                  },
                })
                .eq("id", cbVersion!.id);
            } catch (charErr: any) {
              console.error(`[generate-document] Character profile failed for "${char.name}": ${charErr?.message}`);
              // Continue with next character — partial generation is acceptable
              completedCount++;
            }
          }

          // Step C: Assemble all profiles into final bible document
          const header = `# ${docType === "long_character_bible" ? "COMPREHENSIVE CHARACTER BIBLE" : "CHARACTER BIBLE"}\n\n`;
          const projectLine = `**Project:** ${project.title || "Untitled"}\n\n---\n\n`;
          const profileSections = profiles.map((p, i) => {
            return `## ${i + 1}. ${p.name} (${p.role})\n\n${p.profile}\n\n---\n`;
          }).join("\n");
          const assembledContent = header + projectLine + profileSections;

          // Step D: Write back and promote version
          await serviceClient.from("project_document_versions")
            .update({
              plaintext: assembledContent,
              status: "draft",
              is_current: true,
              meta_json: {
                bg_generating: false,
                bg_completed_at: new Date().toISOString(),
                characters_total: characters.length,
                characters_completed: completedCount,
                characters_list: characters.map(c => c.name),
              },
            })
            .eq("id", cbVersion!.id);

          await serviceClient.from("project_documents")
            .update({ latest_version_id: cbVersion!.id, updated_at: new Date().toISOString() })
            .eq("id", cbDocRecord!.id);

          console.log(`[generate-document] Character bible COMPLETE: ${docType} v${cbVersionNum} characters=${completedCount}/${characters.length}`);

        } catch (bgErr: any) {
          console.error(`[generate-document] Character bible generation FAILED: ${docType} — ${bgErr?.message}`);
          await serviceClient.from("project_document_versions")
            .update({ meta_json: { bg_generating: false, bg_failed: true, bg_failed_at: new Date().toISOString() } })
            .eq("id", cbVersion!.id);
        }
      })();

      // @ts-ignore — EdgeRuntime available in Supabase edge function context
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(bgCbTask);
      }

      return new Response(JSON.stringify({
        success: true,
        document_id: cbDocRecord!.id,
        version_id: cbVersion!.id,
        version_number: cbVersionNum,
        mode,
        resolver_hash: currentHash,
        inputs_used: inputsUsed,
        depends_on: cbDependsOnFields,
        generating: true,
        per_character: true,
        message: "Character bible generation started — per-character profiles being created in background",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else if (isLargeRiskDocType(docType) && !isTopline) {
      // ── Non-episodic large-risk doc: background chunked generation ──
      // runChunkedGeneration can take 2–10 min (sectioned: 4 acts × 30–60s each;
      // beat_sequential: one LLM call per beat from the beat sheet).
      // Use the same placeholder-version + EdgeRuntime.waitUntil pattern
      // as episodic beats — return immediately, write content in background.
      console.log(`[generate-document] Large-risk doc type "${docType}" — starting background chunked generation`);

      // ── PATCH A: Resolve scenes for production_draft beat_sequential strategy ──
      let resolvedScenes: ResolvedScene[] | null = null;
      if (docType === "production_draft") {
        resolvedScenes = await resolveScenesFromFeatureScript(supabase, projectId);
        if (resolvedScenes && resolvedScenes.length > 0) {
          console.log(`[generate-document] production_draft: resolved ${resolvedScenes.length} scenes for beat_sequential strategy`);
        } else {
          console.warn(`[generate-document] production_draft: no scenes resolved — will throw at chunkPlanFor`);
        }
      }

      // Ensure doc record exists
      let { data: chunkDocRecord } = await supabase.from("project_documents")
        .select("id").eq("project_id", projectId).eq("doc_type", docType).single();
      if (!chunkDocRecord) {
        const { data: newDoc, error: createErr } = await supabase.from("project_documents")
          .insert({
            project_id: projectId, doc_type: docType, user_id: actorUserId,
            file_name: `${docType}.md`, file_path: `${projectId}/${docType}.md`,
            extraction_status: "complete",
          }).select("id").single();
        if (createErr) throw new Error(`Failed to create doc record: ${createErr.message}`);
        chunkDocRecord = newDoc;
      }

      // In-progress guard: don't double-start if already generating (<60 min)
      const { data: inProgressChunkVer } = await supabase.from("project_document_versions")
        .select("id, version_number, created_at")
        .eq("document_id", chunkDocRecord!.id)
        .eq("status", "draft")
        .eq("meta_json->>bg_generating", "true")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (inProgressChunkVer) {
        const ageMs = Date.now() - new Date(inProgressChunkVer.created_at).getTime();
        if (ageMs < 60 * 60 * 1000) {
          console.log(`[generate-document] Chunked generation already in progress for ${docType} (age ${Math.round(ageMs/1000)}s) — returning existing version`);
          return new Response(JSON.stringify({
            success: true,
            document_id: chunkDocRecord!.id,
            version_id: inProgressChunkVer.id,
            version_number: inProgressChunkVer.version_number,
            generating: true,
            message: "Chunked generation already in progress — poll for completion",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        // Stale flag (>60 min) — clear and restart
        console.log(`[generate-document] Stale bg_generating=true for ${docType} (${Math.round(ageMs/60000)} min) — clearing and restarting`);
        await supabase.from("project_document_versions")
          .update({ meta_json: { bg_generating: false, bg_stale: true } })
          .eq("id", inProgressChunkVer.id);
      }

      // ── RESUME MODE: retry failed/validation chunks without creating a new version ──
      // Triggered when body.resumeVersionId is present (from "Retry section" button).
      // resumeChunkedGeneration skips 'done' chunks — only re-runs failed/needs_regen ones.
      const resumeVersionId: string | null = (body as any).resumeVersionId ?? null;
      if (resumeVersionId) {
        const { data: resumeVer } = await supabase.from("project_document_versions")
          .select("id, version_number, meta_json, document_id")
          .eq("id", resumeVersionId)
          .maybeSingle();

        if (!resumeVer) {
          return jsonRes({ error: "Resume version not found", version_id: resumeVersionId }, 404);
        }

        // Re-arm bg_generating (merge — preserve bg_started_at, episode_count etc.)
        const rearmedMeta = {
          ...(resumeVer.meta_json || {}),
          bg_generating: true,
          bg_retry_at: new Date().toISOString(),
          bg_stale: false,
        };
        await supabase.from("project_document_versions")
          .update({ meta_json: rearmedMeta })
          .eq("id", resumeVersionId);

        // ── SCENE PLAN GENERATION (feature_script resume) ──
        // Generate Scene Plan BEFORE chunk planning so scenePlan.length
        // drives sceneCount — NOT the beats.length * 3 heuristic.
        let resumeScenePlanForMeta: any = null;
        let resumeScenePlanBlock = "";
        let resumeSceneCountForPlan: number | null = null;
        const beats = docType === "feature_script" ? await resolveBeatsFromBeatSheet(supabase, projectId) : null;
        if (docType === "feature_script") {
          const beatSheetText = upstreamBlocks.get("beat_sheet") || "";
          if (beatSheetText && beats && beats.length > 0) {
            try {
              const { scenes: sp, narrativeContext: resumeNCP } = await generateScenePlanAndNCP(
                apiKey, gw.url, project.title || "Untitled",
                beatSheetText,
                upstreamBlocks.get("treatment") || "",
                upstreamBlocks.get("story_outline") || "",
                upstreamBlocks.get("character_bible") || "",
                upstreamBlocks.get("format_rules") || ""
              );
              resumeScenePlanForMeta = sp;
              resumeSceneCountForPlan = sp.length;

              const planBlocks = sp.map((scene) => {
                return `SCENE ${scene.scene_number} - ${scene.slugline}
  Act: ${scene.act} | Beat: ${scene.source_beat_number} (${scene.source_beat_title})
  Characters: ${(scene.characters_present || []).join(", ")}
  Summary: ${scene.summary}
  Dramatic Purpose: ${scene.dramatic_purpose}
  Scene Turn: ${scene.scene_turn}
  Scene Outcome: ${scene.scene_outcome}${scene.estimated_pages ? `\n  Est. Pages: ${scene.estimated_pages}` : ""}${scene.pov_character ? `\n  POV: ${scene.pov_character}` : ""}`;
              }).join("\n\n");

              resumeScenePlanBlock = `\n\n=== SCENE PLAN (${sp.length} scenes) ===\n${planBlocks}\n=== END SCENE PLAN ===`;
              console.log(`[generate-document] Scene Plan generated for resume: ${sp.length} scenes — sceneCount drives chunk plan`);
            } catch (spErr: any) {
              // Scene Plan failure is FATAL for native feature_script resume
              console.error(`[generate-document] Scene Plan generation for resume FAILED — aborting: ${spErr?.message?.slice(0, 200)}`);
              await supabase.from("project_document_versions")
                .update({ meta_json: {
                  ...rearmedMeta,
                  bg_generating: false,
                  bg_failed: true,
                  bg_failed_at: new Date().toISOString(),
                  scene_plan_failed: true,
                  scene_plan_error: spErr?.message?.slice(0, 300),
                } })
                .eq("id", resumeVersionId);
              return jsonRes({
                success: false,
                error: "scene_plan_failed",
                message: `Scene Plan generation failed for feature_script resume: ${spErr?.message?.slice(0, 200)}`,
              }, 422);
            }
          } else {
            // No beat sheet available — cannot resume
            console.error(`[generate-document] Scene Plan cannot be generated for resume: no beat sheet for feature_script`);
            await supabase.from("project_document_versions")
              .update({ meta_json: {
                ...rearmedMeta,
                bg_generating: false,
                bg_failed: true,
                bg_failed_at: new Date().toISOString(),
                scene_plan_failed: true,
                scene_plan_error: "No beat sheet available for Scene Plan generation",
              } })
              .eq("id", resumeVersionId);
            return jsonRes({
              success: false,
              error: "scene_plan_no_beat_sheet",
              message: "Cannot resume feature_script: beat sheet is required",
            }, 422);
          }
        }

        const resumePlan = chunkPlanFor(docType, {
          episodeCount: resolvedQuals?.season_episode_count,
          scenes: resolvedScenes,
          sceneCount: resumeSceneCountForPlan ?? undefined,
          beats: docType === "feature_script" ? beats : null,
        });
        const resumeDocId = resumeVer.document_id || chunkDocRecord!.id;
        console.log(`[generate-document] Resume mode: ${docType} versionId=${resumeVersionId} chunks=${resumePlan.totalChunks}`);

        const bgResumeTask = (async () => {
          // Use serviceClient throughout: rlsClient silently blocks writes on
          // project_document_versions and project_document_chunks via RLS.
          try {
            // Scene Plan already generated in handler before resume chunk planning.
            // resumeScenePlanForMeta and resumeScenePlanBlock are pre-populated.
            const finalUpstreamContent = resumeScenePlanBlock
            ? upstreamContent + resumeScenePlanBlock
            : upstreamContent;
            
            const resumeResult = await resumeChunkedGeneration({
              supabase: serviceClient, apiKey, gatewayUrl: gw.url, projectId,
              documentId: resumeDocId, versionId: resumeVersionId,
              docType, plan: resumePlan, systemPrompt: system, upstreamContent: finalUpstreamContent,
              projectTitle: project.title || "Untitled",
              additionalContext, model: "google/gemini-2.5-flash",
              episodeCount: resolvedQuals?.season_episode_count,
              requestId,
            });

            // ── COMPLETION GATE: only promote if generation truly succeeded ──
            if (resumeResult.success) {
              await serviceClient.from("project_document_versions")
                .update({
                  is_current: true,
                  meta_json: {
                    bg_generating: false,
                    bg_completed_at: new Date().toISOString(),
                    chunks_total: resumeResult.totalChunks,
                    chunks_completed: resumeResult.completedChunks,
                    scenes: resumeScenePlanForMeta || undefined,
                  },
                })
                .eq("id", resumeVersionId);
              await serviceClient.from("project_documents")
                .update({ latest_version_id: resumeVersionId, updated_at: new Date().toISOString() })
                .eq("id", resumeDocId);
              console.log(`[generate-document] Resume COMPLETE: ${docType} versionId=${resumeVersionId} chunks=${resumeResult.completedChunks}/${resumeResult.totalChunks}`);
            } else {
              // Partial completion — do NOT promote to is_current or latest_version_id
              console.error(`[generate-document][IEL] Resume PARTIAL — NOT promoting: ${docType} versionId=${resumeVersionId} completed=${resumeResult.completedChunks}/${resumeResult.totalChunks} failed=${resumeResult.failedChunks}`);
              await serviceClient.from("project_document_versions")
                .update({
                  meta_json: {
                    ...rearmedMeta,
                    bg_generating: false,
                    bg_failed: true,
                    bg_failed_at: new Date().toISOString(),
                    incomplete_generation: true,
                    chunks_completed: resumeResult.completedChunks,
                    chunks_total: resumeResult.totalChunks,
                    chunks_failed: resumeResult.failedChunks,
                  },
                  is_current: false,
                })
                .eq("id", resumeVersionId);
            }
          } catch (bgErr: any) {
            console.error(`[generate-document] Resume FAILED: ${docType} — ${bgErr?.message}`);
            await serviceClient.from("project_document_versions")
              .update({ meta_json: { ...rearmedMeta, bg_generating: false, bg_failed: true, bg_failed_at: new Date().toISOString() } })
              .eq("id", resumeVersionId);
          }
        })();

        // @ts-ignore — EdgeRuntime available in Supabase edge function context
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
          EdgeRuntime.waitUntil(bgResumeTask);
        }

        return new Response(JSON.stringify({
          success: true,
          document_id: resumeDocId,
          version_id: resumeVersionId,
          version_number: resumeVer.version_number,
          generating: true,
          resumed: true,
          chunk_plan: { total_chunks: resumePlan.totalChunks, strategy: resumePlan.strategy },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // ── END RESUME MODE ──

      // Create placeholder version
      // ── JUSTIFIED EXCEPTION: Direct insert — bg_generating placeholder with empty plaintext.
      // Cannot use doc-os.createVersion() because: (a) plaintext is empty (provenance gate rejects),
      // (b) requires serviceClient for is_current swap (RLS blocks user-scoped updates),
      // (c) placeholder is filled async via chunked background generation. This is the ONLY justified bypass. ──
      await serviceClient.from("project_document_versions")
        .update({ is_current: false })
        .eq("document_id", chunkDocRecord!.id)
        .eq("is_current", true);
      const { count: chunkVerCount } = await supabase.from("project_document_versions")
        .select("id", { count: "exact", head: true }).eq("document_id", chunkDocRecord!.id);
      const chunkVersionNum = (chunkVerCount || 0) + 1;
      const dependsOnFields = DOC_DEPENDENCY_MAP[docType] || [];
      const { data: chunkVersion, error: chunkVerErr } = await supabase.from("project_document_versions")
        .insert({
          document_id: chunkDocRecord!.id, version_number: chunkVersionNum,
          status: "draft", plaintext: "", created_by: actorUserId,
          depends_on: dependsOnFields, depends_on_resolver_hash: currentHash,
          inputs_used: inputsUsed,
          is_current: true,
          is_stale: false,
          stale_reason: null,
          meta_json: { bg_generating: true, bg_started_at: new Date().toISOString(), doc_type: docType, episode_count: resolvedQuals?.season_episode_count ?? null },
        }).select("id").single();
      if (chunkVerErr) throw new Error(`Failed to create chunk version: ${chunkVerErr.message}`);

      // Mark all older versions as not-current
      await supabase.from("project_document_versions")
        .update({ is_current: false })
        .eq("document_id", chunkDocRecord!.id)
        .neq("id", chunkVersion!.id);

      // NOTE: Do NOT set latest_version_id here — version is empty placeholder (bg_generating).
      // latest_version_id will be set on successful completion in the bg task below.

      // ── SCENE PLAN GENERATION (feature_script only) ──
      // Generate Scene Plan BEFORE chunk planning so the actual scene count
      // drives chunk sizing — NOT the beats.length * 3 heuristic.
      // Scene Plan is also injected into upstreamContent as dramatic guidance.
      let scenePlanForMeta: any = null;
      let scenePlanUpstreamBlock = "";
      let sceneCountForPlan: number | null = null;
      let ncpForChunkPlan: any = null;
      const beats = docType === "feature_script" ? await resolveBeatsFromBeatSheet(supabase, projectId) : null;
      if (docType === "feature_script") {
        const beatSheetText = upstreamBlocks.get("beat_sheet") || "";
        if (beatSheetText && beats && beats.length > 0) {
          try {
            const { scenes: scenePlan, narrativeContext: ncp } = await generateScenePlanAndNCP(
              apiKey, gw.url, project.title || "Untitled",
              beatSheetText,
              upstreamBlocks.get("treatment") || "",
              upstreamBlocks.get("story_outline") || "",
              upstreamBlocks.get("character_bible") || "",
              upstreamBlocks.get("format_rules") || ""
            );
            scenePlanForMeta = scenePlan;
            sceneCountForPlan = scenePlan.length;
            ncpForChunkPlan = ncp;

            // Build SCENE PLAN block for upstream context
            const planBlocks = scenePlan.map((scene) => {
              return `SCENE ${scene.scene_number} - ${scene.slugline}
  Act: ${scene.act} | Beat: ${scene.source_beat_number} (${scene.source_beat_title})
  Characters: ${(scene.characters_present || []).join(", ")}
  Summary: ${scene.summary}
  Dramatic Purpose: ${scene.dramatic_purpose}
  Scene Turn: ${scene.scene_turn}
  Scene Outcome: ${scene.scene_outcome}${scene.estimated_pages ? `\n  Est. Pages: ${scene.estimated_pages}` : ""}${scene.pov_character ? `\n  POV: ${scene.pov_character}` : ""}`;
            }).join("\n\n");

            scenePlanUpstreamBlock = `\n\n=== SCENE PLAN (${scenePlan.length} scenes) ===\n${planBlocks}\n=== END SCENE PLAN ===`;
            console.log(`[generate-document] Scene Plan generated: ${scenePlan.length} scenes for feature_script — sceneCount drives chunk plan`);
          } catch (spErr: any) {
            // Scene Plan generation failure is FATAL for native feature_script
            console.error(`[generate-document] Scene Plan generation FAILED — aborting feature_script: ${spErr?.message?.slice(0, 200)}`);
            await serviceClient.from("project_document_versions")
              .update({ meta_json: {
                bg_generating: false,
                bg_failed: true,
                bg_failed_at: new Date().toISOString(),
                scene_plan_failed: true,
                scene_plan_error: spErr?.message?.slice(0, 300),
              } })
              .eq("id", chunkVersion!.id);
            return new Response(JSON.stringify({
              success: false,
              error: "scene_plan_failed",
              message: `Scene Plan generation failed for feature_script: ${spErr?.message?.slice(0, 200)}`,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } else {
          // No beat sheet available — cannot generate Scene Plan
          console.error(`[generate-document] Scene Plan cannot be generated: no beat sheet for feature_script`);
          await serviceClient.from("project_document_versions")
            .update({ meta_json: {
              bg_generating: false,
              bg_failed: true,
              bg_failed_at: new Date().toISOString(),
              scene_plan_failed: true,
              scene_plan_error: "No beat sheet available for Scene Plan generation",
            } })
            .eq("id", chunkVersion!.id);
          return new Response(JSON.stringify({
            success: false,
            error: "scene_plan_no_beat_sheet",
            message: "Cannot generate feature_script: beat sheet is required for Scene Plan generation",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const plan = chunkPlanFor(docType, {
        episodeCount: resolvedQuals?.season_episode_count,
        scenes: scenePlanForMeta, // ScenePlanEntry[] for sequence_indexed
        sceneCount: sceneCountForPlan ?? undefined,
        batchSize: isLargeRiskEpisodic(docType) ? 1 : undefined,
        beats: docType === "feature_script" ? beats : null,
        // Pass sequence map from NCP for sequence_indexed chunk planning
        sequenceMap: ncpForChunkPlan?.sequence_map || null,
      });

      // ── PREFLIGHT CONTRACT GUARD (all episode-indexed docs) ──
      // Assert chunk plan matches canonical episode count to prevent silent truncation.
      const EPISODE_INDEXED_DOC_TYPES = new Set(["season_script", "season_master_script", "episode_grid", "episode_beats", "vertical_episode_beats"]);
      if (EPISODE_INDEXED_DOC_TYPES.has(docType) && resolvedQuals?.season_episode_count) {
        const contractCount = resolvedQuals.season_episode_count;
        if (plan.totalChunks !== contractCount) {
          console.error(`[generate-document][IEL] PREFLIGHT_ABORT: ${docType} plan.totalChunks=${plan.totalChunks} !== contract=${contractCount}`);
          return new Response(JSON.stringify({
            error: "PREFLIGHT_CONTRACT_MISMATCH",
            message: `${docType} chunk plan (${plan.totalChunks} chunks) does not match canonical episode count (${contractCount}). Aborting to prevent partial generation.`,
            plan_chunks: plan.totalChunks,
            contract_episodes: contractCount,
          }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        console.log(`[generate-document] Preflight OK: ${docType} contract=${contractCount} plan=${plan.totalChunks}`);
      }

      console.log(`[generate-document] Chunked background generation starting: ${docType} v${chunkVersionNum}, ${plan.totalChunks} chunks`);

      // Fire generation as background task
      const bgChunkTask = (async () => {
        // Use serviceClient throughout: rlsClient silently blocks writes on
        // project_document_versions and project_document_chunks via RLS.
        try {
          // Scene Plan already generated in handler before chunk planning.
          // scenePlanForMeta and scenePlanUpstreamBlock are pre-populated
          // from the main handler and should never be null for native feature_script.
          const finalUpstreamContent = scenePlanUpstreamBlock
            ? upstreamContent + scenePlanUpstreamBlock
            : upstreamContent;
          
          const chunkResult = await runChunkedGeneration({
            supabase: serviceClient, apiKey, gatewayUrl: gw.url, projectId,
            documentId: chunkDocRecord!.id, versionId: chunkVersion!.id,
            docType, plan, systemPrompt: system, upstreamContent: finalUpstreamContent,
            projectTitle: project.title || "Untitled",
            additionalContext, model: "google/gemini-2.5-flash",
            episodeCount: resolvedQuals?.season_episode_count,
            requestId,
            projectFormat: project.format || undefined,
          });
          // runChunkedGeneration already writes plaintext to the version — promote only on full success

            // ── PRE-PROMOTION SCENE GRAPH BOOTSTRAP ────────────────────────────
            // For screenplay-class docs (feature_script only — production_draft has
            // resolvedSceneCount so it skips this), auto-extract scenes from the
            // generated text BEFORE version promotion so auto-run never sees the
            // version as complete before scenes are indexed.
            const SCREENPLAY_BOOTSTRAP_TYPES = new Set(["feature_script", "production_draft"]);
            if (SCREENPLAY_BOOTSTRAP_TYPES.has(docType) && !resolvedSceneCount) {
              const bootstrapTag = `[generate-document][scene-bootstrap]`;
              try {
                // Gate: verify assembled plaintext exists and has screenplay-class length
                const { data: assembledVer } = await serviceClient
                  .from("project_document_versions")
                  .select("plaintext")
                  .eq("id", chunkVersion!.id)
                  .single();
                const assembledText = assembledVer?.plaintext || "";

                if (assembledText.length < 5000) {
                  console.log(`${bootstrapTag} SKIP — assembled text too short (${assembledText.length} chars), not a viable screenplay source. versionId=${chunkVersion!.id}`);
                } else {
                  console.log(`${bootstrapTag} ATTEMPTING — docType=${docType} versionId=${chunkVersion!.id} textLen=${assembledText.length}`);

                  const sgRes = await fetch(
                    `${supabaseUrl}/functions/v1/dev-engine-v2`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${serviceKey}`,
                        apikey: anonKey,
                      },
                      body: JSON.stringify({
                        action: "scene_graph_extract",
                        projectId,
                        sourceDocumentId: chunkDocRecord!.id,
                        sourceVersionId: chunkVersion!.id,
                        mode: "from_text",
                        text: assembledText,
                        force: true,
                      }),
                    }
                  );

                  if (sgRes.ok) {
                    const sgData = await sgRes.json();
                    const sceneCount = sgData?.scenes?.length ?? sgData?.scene_count ?? "unknown";
                    console.log(`${bootstrapTag} SUCCESS — extracted ${sceneCount} scenes. versionId=${chunkVersion!.id} docType=${docType}`);

                    // Stamp provenance on version meta so the bootstrap is traceable
                    const { data: curVer } = await serviceClient
                      .from("project_document_versions")
                      .select("meta_json")
                      .eq("id", chunkVersion!.id)
                      .single();
                    await serviceClient
                      .from("project_document_versions")
                      .update({
                        meta_json: {
                          ...(curVer?.meta_json || {}),
                          scene_graph_bootstrap: {
                            status: "success",
                            scene_count: sceneCount,
                            source_version_id: chunkVersion!.id,
                            bootstrapped_at: new Date().toISOString(),
                          },
                        },
                      })
                      .eq("id", chunkVersion!.id);
                  } else {
                    const errText = await sgRes.text().catch(() => "unknown");
                    // scene_graph_not_empty is expected if scenes already exist — not a failure
                    if (errText.includes("scene_graph_not_empty")) {
                      console.log(`${bootstrapTag} SKIP — scene graph already populated for project. versionId=${chunkVersion!.id}`);
                    } else {
                      console.warn(`${bootstrapTag} FAILED — HTTP ${sgRes.status}: ${errText.slice(0, 300)}. versionId=${chunkVersion!.id} docType=${docType}`);
                    }
                  }
                }
              } catch (sgErr: any) {
                // Non-fatal: bootstrap failure must never affect the generated document
                console.warn(`${bootstrapTag} ERROR (non-fatal) — ${sgErr?.message}. versionId=${chunkVersion!.id} docType=${docType}`);
              }
            }
            // ── END SCENE GRAPH BOOTSTRAP ───────────────────────────────────────

          if (chunkResult.success) {
            await serviceClient.from("project_document_versions")
              .update({ is_current: true, meta_json: { 
                bg_generating: false, 
                bg_completed_at: new Date().toISOString(), 
                chunks_total: chunkResult.totalChunks, 
                chunks_completed: chunkResult.completedChunks,
                scenes: scenePlanForMeta || undefined,
                narrative_context: ncpForChunkPlan || undefined,
              } })
              .eq("id", chunkVersion!.id);
            // NOW set latest_version_id — content is confirmed valid
            await serviceClient.from("project_documents")
              .update({ latest_version_id: chunkVersion!.id, updated_at: new Date().toISOString() })
              .eq("id", chunkDocRecord!.id);
            console.log(`[generate-document] Chunked background generation COMPLETE: ${docType} v${chunkVersionNum} chunks=${chunkResult.completedChunks}/${chunkResult.totalChunks}`);

            // ── POST-GENERATION TREATMENT ACTS POPULATION ─────────────────
            // Populate treatment_acts from the assembled plaintext so the
            // TreatmentActsProgress component shows content immediately.
            // The per-act rewrite pipeline (dev-engine-v2) handles rewrite.
            if (docType === "treatment" || docType === "long_treatment") {
              const taPopTag = `[generate-document][treatment-acts]`;
              try {
                const { data: assembledVer } = await serviceClient
                  .from("project_document_versions")
                  .select("plaintext")
                  .eq("id", chunkVersion!.id)
                  .single();
                const assembledText = assembledVer?.plaintext || "";
                if (assembledText.trim().length > 0) {
                  const ACT_SEQUENCE = [
                    { actKey: "act_1_setup",            actNumber: 1 },
                    { actKey: "act_2a_rising_action",   actNumber: 2 },
                    { actKey: "act_2b_complications",   actNumber: 3 },
                    { actKey: "act_3_climax_resolution", actNumber: 4 },
                  ];
                  for (const { actKey } of ACT_SEQUENCE) {
                    const label = findSectionDef("treatment", actKey)?.label ?? actKey;
                    const sectionHeader = `## ${label}`;
                    const headerIdx = assembledText.indexOf(sectionHeader);
                    let content = "";
                    if (headerIdx >= 0) {
                      const afterHeader = assembledText.slice(headerIdx + sectionHeader.length);
                      const nextActMatch = afterHeader.match(/\n##\s+Act\s+\d/i);
                      content = nextActMatch && nextActMatch.index !== undefined
                        ? afterHeader.slice(0, nextActMatch.index).trim()
                        : afterHeader.trim();
                    }
                    await serviceClient.from("treatment_acts")
                      .update({ content: content || null, status: "done" })
                      .eq("treatment_id", chunkDocRecord!.id)
                      .eq("act_key", actKey);
                  }
                  console.log(`${taPopTag} populated ${ACT_SEQUENCE.length} acts with content from assembled text. treatment_id=${chunkDocRecord!.id}`);
                } else {
                  console.warn(`${taPopTag} assembled text empty — skipping act population`);
                }
              } catch (taErr: any) {
                // Non-fatal: population failure must never break the generated document
                console.warn(`${taPopTag} ERROR (non-fatal) — ${taErr?.message}`);
              }
            }
            // ── END TREATMENT ACTS POPULATION ─────────────────────────────

          } else {
            // Failed or incomplete: persist for observability but do NOT promote to is_current/latest
            const isIncomplete = chunkResult.completedChunks > 0 && chunkResult.completedChunks < chunkResult.totalChunks;
            await serviceClient.from("project_document_versions")
              .update({
                is_current: false,
                meta_json: {
                  bg_generating: false,
                  bg_failed: !isIncomplete,
                  incomplete_generation: isIncomplete,
                  bg_failed_at: new Date().toISOString(),
                  chunks_total: chunkResult.totalChunks,
                  chunks_completed: chunkResult.completedChunks,
                  chunks_failed: chunkResult.failedChunks,
                },
              })
              .eq("id", chunkVersion!.id);
            console.error(`[generate-document][IEL] Chunked generation ${isIncomplete ? 'INCOMPLETE' : 'FAILED'} — NOT promoting: ${docType} v${chunkVersionNum} completed=${chunkResult.completedChunks}/${chunkResult.totalChunks} failed=${chunkResult.failedChunks}`);

            // ── AUTO-RESUME (Fix D) ──────────────────────────────────────────────
            // When incomplete (partial chunks completed), trigger resumeChunkedGeneration
            // to retry only the failed chunks. Skip 'done' chunks automatically.
            if (isIncomplete) {
              console.log(`[generate-document][AUTO-RESUME] Triggering resume for ${docType} v${chunkVersionNum} — ${chunkResult.completedChunks}/${chunkResult.totalChunks} done, ${chunkResult.failedChunks} failed`);
              try {
                const resumeResult = await resumeChunkedGeneration({
                  supabase: serviceClient, apiKey, gatewayUrl: gw.url, projectId,
                  documentId: chunkDocRecord!.id, versionId: chunkVersion!.id,
                  docType, plan, systemPrompt: system, upstreamContent,
                  projectTitle: project.title || "Untitled",
                  additionalContext, model: "google/gemini-2.5-flash",
                  episodeCount: resolvedQuals?.season_episode_count,
                  requestId,
                });
                if (resumeResult.success) {
                  await serviceClient.from("project_document_versions")
                    .update({ is_current: true, meta_json: { 
                      bg_generating: false, 
                      bg_completed_at: new Date().toISOString(), 
                      chunks_total: resumeResult.totalChunks, 
                      chunks_completed: resumeResult.completedChunks,
                      scenes: scenePlanForMeta || undefined,
                      narrative_context: ncpForChunkPlan || undefined,
                    } })
                    .eq("id", chunkVersion!.id);
                  await serviceClient.from("project_documents")
                    .update({ latest_version_id: chunkVersion!.id, updated_at: new Date().toISOString() })
                    .eq("id", chunkDocRecord!.id);
                  console.log(`[generate-document][AUTO-RESUME] SUCCESS: ${docType} v${chunkVersionNum} resume completed ${resumeResult.completedChunks}/${resumeResult.totalChunks}`);
                } else {
                  console.error(`[generate-document][AUTO-RESUME] FAILED: ${docType} v${chunkVersionNum} resume still incomplete — ${resumeResult.completedChunks}/${resumeResult.totalChunks} failed=${resumeResult.failedChunks}`);
                }
              } catch (resumeErr: any) {
                console.error(`[generate-document][AUTO-RESUME] ERROR: ${docType} v${chunkVersionNum} — ${resumeErr?.message}`);
              }
            }
            // ── END AUTO-RESUME ────────────────────────────────────────────
          }
        } catch (bgErr: any) {
          console.error(`[generate-document] Chunked background generation FAILED: ${docType} — ${bgErr?.message}`);
          await serviceClient.from("project_document_versions")
            .update({ meta_json: { bg_generating: false, bg_failed: true, bg_failed_at: new Date().toISOString() } })
            .eq("id", chunkVersion!.id);
        }
      })();

      // @ts-ignore — EdgeRuntime available in Supabase edge function context
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(bgChunkTask);
      }

      return new Response(JSON.stringify({
        success: true,
        document_id: chunkDocRecord!.id,
        version_id: chunkVersion!.id,
        version_number: chunkVersionNum,
        mode,
        resolver_hash: currentHash,
        inputs_used: inputsUsed,
        depends_on: dependsOnFields,
        generating: true,
        chunked: true,
        chunk_plan: { total_chunks: plan.totalChunks, strategy: plan.strategy },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    } else {
      assertLLMAllowed(generationMode, "primary_generation", docType);
      content = await callLLM(apiKey, system, userPrompt);
      llmCallCount++;

      // ── JSON output guard: if LLM returned JSON instead of markdown, extract and convert ──
      // Some models (especially Gemini) return structured JSON objects despite plain-markdown instructions.
      // This safety net detects JSON output and converts it to formatted markdown before saving.
      const trimmedContent = content.trim();
      const looksLikeJson = trimmedContent.startsWith("{") || trimmedContent.startsWith("```json");
      if (looksLikeJson) {
        console.warn(`[generate-document] LLM returned JSON for ${docType} — extracting to markdown`);
        try {
          const jsonStr = trimmedContent.replace(/^```json\s*/, "").replace(/\s*```\s*$/, "");
          const parsed = JSON.parse(jsonStr);
          // Recursively flatten JSON object into readable markdown
          function jsonToMarkdown(obj: any, depth = 0): string {
            if (typeof obj === "string") return obj;
            if (Array.isArray(obj)) return obj.map((item: any) => `- ${jsonToMarkdown(item, depth + 1)}`).join("\n");
            if (typeof obj === "object" && obj !== null) {
              return Object.entries(obj).map(([key, val]: [string, any]) => {
                const heading = "#".repeat(Math.min(depth + 2, 4));
                const label = key.replace(/_/g, " ").toUpperCase();
                if (typeof val === "string") return `${heading} ${label}\n\n${val}`;
                if (Array.isArray(val)) return `${heading} ${label}\n\n${val.map((v: any) => `- ${typeof v === "string" ? v : jsonToMarkdown(v, depth + 1)}`).join("\n")}`;
                if (typeof val === "object") return `${heading} ${label}\n\n${jsonToMarkdown(val, depth + 1)}`;
                return `${heading} ${label}\n\n${val}`;
              }).join("\n\n");
            }
            return String(obj);
          }
          const extracted = jsonToMarkdown(parsed);
          if (extracted && extracted.length > 50) {
            content = `# ${docType.replace(/_/g, " ").toUpperCase()}\n\n${extracted}`;
            console.log(`[generate-document] JSON extracted to markdown for ${docType}, chars=${content.length}`);
          } else {
            // Extraction produced too little — retry with stronger instruction
            throw new Error("extracted content too short");
          }
        } catch (jsonErr: any) {
          console.warn(`[generate-document] JSON extraction failed for ${docType}: ${jsonErr?.message} — retrying with stricter instruction`);
          const noJsonSystem = system + `\n\n⛔ CRITICAL: Your previous response was JSON. This is FORBIDDEN. You MUST output plain markdown text only. Start directly with a heading like "# CONCEPT BRIEF" followed by sections. Never use JSON, objects, or key-value pairs.`;
          assertLLMAllowed(generationMode, "json_extraction_retry", docType);
          content = await callLLM(apiKey, noJsonSystem, userPrompt);
          llmCallCount++;
        }
      }

      // Post-generation banned language check for non-large-risk docs
      if (hasBannedSummarizationLanguage(content)) {
        console.warn(`[generate-document] Banned summarization language detected in ${docType}, retrying`);
        const retrySystem = system + `\n\n⚠️ CRITICAL: Your output contained summarization language ("remaining episodes", "and so on", etc.). This is FORBIDDEN. Output COMPLETE content for every section/item. Never abbreviate or summarize.`;
        assertLLMAllowed(generationMode, "banned_language_retry", docType);
        content = await callLLM(apiKey, retrySystem, userPrompt);
        llmCallCount++;
      }
    }

    // 6a) Topline placeholder validator (hard gate — never save template)
    if (isTopline) {
      const PLACEHOLDER_PATTERNS = [
        /\[\s*1[–-]2 sentences\s*\]/i,
        /\[\s*150[–-]300 words\s*\]/i,
        /\[\s*~?1[–-]2 pages\s*\]/i,
        /\[\s*Theme:\s*\]/i,
        /\[\s*Protagonist:\s*\]/i,
        /\[\s*Goal:\s*\]/i,
        /\[\s*Stakes:\s*\]/i,
        /\[\s*core thematic\s/i,
        /\[\s*name,\s*role\s/i,
        /\[\s*concrete objective\s*\]/i,
        /\[\s*specific consequence\s/i,
        /\[\s*Write 1[–-]2 sentences\s/i,
        /\[\s*400[–-]700 words\s*\]/i,
      ];

      const hasPlaceholders = PLACEHOLDER_PATTERNS.some(p => p.test(content));

      if (hasPlaceholders) {
        // One retry with even stronger instruction
        const retrySystem = system + `\n\n⚠️ CRITICAL FAILURE DETECTED: Your previous output contained literal bracket placeholders like [1–2 sentences] or [Theme:]. These are FORBIDDEN. Replace EVERY bracket placeholder with real, project-specific text. DO NOT output any text inside square brackets.`;
        assertLLMAllowed(generationMode, "placeholder_retry", docType);
        content = await callLLM(apiKey, retrySystem, userPrompt);
        llmCallCount++;

        const stillHasPlaceholders = PLACEHOLDER_PATTERNS.some(p => p.test(content));
        if (stillHasPlaceholders) {
          return new Response(JSON.stringify({
            error: "template_not_filled",
            message: "Generated content still contains unfilled template placeholders. Generation blocked. Please ensure project context documents exist and retry.",
          }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Strip any Output Contract header if present (internal instruction, not user content)
      content = content.replace(/^Deliverable Type:.*?\n/gim, "").replace(/^Completion Status:.*?\n/gim, "").replace(/^Completeness Check:.*?\n/gim, "");

      // Ensure starts with the correct heading
      if (!content.trimStart().startsWith("# TOPLINE NARRATIVE")) {
        const match = content.match(/(#\s*TOPLINE NARRATIVE[\s\S]*)/i);
        if (match) content = match[1];
      }
    }

    // 6b) Post-generation validation (FAIL CLOSED for episode count)
    // Only validate doc types that structurally declare total episode counts.
    // Doc types like topline_narrative, idea, concept_brief naturally reference
    // sub-groupings ("5-episode arc") that are NOT total-count conflicts.
    const EPISODE_COUNT_STRICT_DOC_TYPES = [
      "episode_grid", "season_arc", "series_overview", "vertical_episode_beats",
      "season_scripts_bundle", "pitch_document",
    ];
    const shouldValidateEpCount = resolvedQuals.is_series
      && resolvedQuals.season_episode_count
      && EPISODE_COUNT_STRICT_DOC_TYPES.includes(docType);

    if (shouldValidateEpCount) {
      const expectedCount = resolvedQuals.season_episode_count!;
      // Only match definitive total-count declarations, not passing references
      // e.g. "60-episode series", "Season 1 (60 episodes)", "comprises 60 episodes"
      const totalCountPatterns = [
        new RegExp(`\\b(\\d+)[- ]episode\\s+(series|season|show|run)`, "gi"),
        new RegExp(`(?:comprises|contains|consists of|totaling|total of|has|with)\\s+(\\d+)\\s+episodes`, "gi"),
        new RegExp(`Season\\s+\\d+\\s*[:(]\\s*(\\d+)\\s+episodes`, "gi"),
      ];

      const foundCounts = new Set<number>();
      for (const pat of totalCountPatterns) {
        for (const m of content.matchAll(pat)) {
          // The capture group with the number might be group 1 or 2 depending on pattern
          const numStr = m[1] || m[2];
          const num = parseInt(numStr);
          if (!isNaN(num) && num > 1 && num !== expectedCount) {
            foundCounts.add(num);
          }
        }
      }

      if (foundCounts.size > 0) {
        // Regenerate with stronger instruction
        const strongerSystem = system + `\n\nCRITICAL: This is a ${expectedCount}-episode season. The output MUST reference exactly ${expectedCount} episodes as the total count. Do NOT declare any other total episode count.`;
        assertLLMAllowed(generationMode, "episode_count_repair", docType);
        content = await callLLM(apiKey, strongerSystem, userPrompt);
        llmCallCount++;

        // Check again
        const stillWrong = new Set<number>();
        for (const pat of totalCountPatterns) {
          pat.lastIndex = 0;
          for (const m of content.matchAll(pat)) {
            const numStr = m[1] || m[2];
            const num = parseInt(numStr);
            if (!isNaN(num) && num > 1 && num !== expectedCount) {
              stillWrong.add(num);
            }
          }
        }

        if (stillWrong.size > 0) {
          console.error(`[generate-document] episode_count_conflict: expected=${expectedCount} found=${[...stillWrong]} docType=${docType}`);
          return new Response(JSON.stringify({
            error: "episode_count_conflict",
            message: `Generated content declares ${[...stillWrong][0]} episodes as total count instead of canonical ${expectedCount}. Generation blocked.`,
            expected: expectedCount,
            found: [...stillWrong],
          }), {
            status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ── NUANCE GATE (deterministic, repair once) ──────────────────────────────
    const lane = formatToLane(project.format);
    const metrics0 = computeMetrics(content);
    const fp = computeFingerprint(content, lane, nuanceParams.story_engine, nuanceParams.causal_grammar);

    // Fetch recent fingerprints for diversity defense
    let simRisk = 0;
    if (nuanceParams.diversify) {
      const { data: recentRuns } = await supabase.from("nuance_runs")
        .select("fingerprint")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(10);
      const recentFps = (recentRuns || []).map((r: any) => r.fingerprint).filter(Boolean);
      simRisk = computeSimilarityRisk(fp, recentFps);
    }

    const attempt0 = runGate(metrics0, lane, nuanceParams, simRisk);
    let attempt1 = null;
    let repairInst: string | null = null;

    // If gate fails, build repair instruction and retry ONCE
    if (!attempt0.pass && !isEpisodeDocType && !isDeterministicAssembly) {
      assertLLMAllowed(generationMode, "nuance_repair", docType);
      repairInst = buildRepairInstruction(attempt0.failures, nuanceParams.anti_tropes);
      const repairSystem = system + `\n\n## NUANCE REPAIR (MANDATORY)\n${repairInst}`;
      content = await callLLM(apiKey, repairSystem, userPrompt);
      llmCallCount++;
      const metrics1 = computeMetrics(content);
      attempt1 = runGate(metrics1, lane, nuanceParams, simRisk);
    }

    const finalGate = attempt1 || attempt0;
    const nuanceGateResult = {
      attempt0: { pass: attempt0.pass, failures: attempt0.failures, metrics: attempt0.metrics, melodrama_score: attempt0.melodrama_score, nuance_score: attempt0.nuance_score },
      ...(attempt1 ? { attempt1: { pass: attempt1.pass, failures: attempt1.failures, metrics: attempt1.metrics, melodrama_score: attempt1.melodrama_score, nuance_score: attempt1.nuance_score } } : {}),
      final: { pass: finalGate.pass, failures: finalGate.failures, melodrama_score: finalGate.melodrama_score, nuance_score: finalGate.nuance_score },
      ...(repairInst ? { repair_instruction: repairInst } : {}),
    };

    console.error(JSON.stringify({
      diag: "NUANCE_GATE",
      requestId,
      attempt0_pass: attempt0.pass,
      attempt0_failures: attempt0.failures,
      attempt1_pass: attempt1?.pass ?? null,
      final_pass: finalGate.pass,
      melodrama_score: finalGate.melodrama_score,
      nuance_score: finalGate.nuance_score,
      similarity_risk: simRisk,
    }));

    // ── STAGE IDENTITY VALIDATION ──
    const stageIdResult = validateStageIdentity(docType, content);
    if (stageIdResult && !stageIdResult.pass) {
      const diag = buildDiagnostic(stageIdResult);
      console.error(JSON.stringify({
        diag: "STAGE_IDENTITY_VIOLATION",
        requestId,
        project_id: projectId,
        ...diag,
      }));
      // Log violation but still persist — downstream consumers (auto-run, UI) will gate on meta_json.stage_identity
    }

    // ── CANON DRIFT DETECTION (CCE Phase 1) ──
    const driftResult = detectCanonDrift(content, narrativeCtx.canonConstraints);
    logDriftResult("generate-document", projectId, docType, driftResult);
    if (!driftResult.passed) {
      console.error(JSON.stringify({
        diag: "CANON_DRIFT_VIOLATION",
        requestId,
        project_id: projectId,
        doc_type: docType,
        violations: driftResult.findings.filter(f => f.severity === "violation").map(f => f.detail),
        warnings: driftResult.findings.filter(f => f.severity === "warning").map(f => f.detail),
      }));
    }

    let { data: docRecord } = await supabase.from("project_documents")
      .select("id")
      .eq("project_id", projectId)
      .eq("doc_type", docType)
      .single();

    if (!docRecord) {
      const { data: newDoc, error: createErr } = await supabase.from("project_documents")
        .insert({
          project_id: projectId,
          doc_type: docType,
          user_id: actorUserId,
          file_name: `${docType}.md`,
          file_path: `${projectId}/${docType}.md`,
          extraction_status: "complete",
        })
        .select("id")
        .single();
      if (createErr) throw new Error(`Failed to create doc record: ${createErr.message}`);
      docRecord = newDoc;
    }

    // 8–9) Create version via CANONICAL doc-os.createVersion()
    const dependsOn = DOC_DEPENDENCY_MAP[docType] || [];
    const newVersion = await createVersion(supabase, {
      documentId: docRecord!.id,
      docType,
      plaintext: content,
      label: `${docType} ${mode}`,
      createdBy: actorUserId,
      status: mode === "final" ? "final" : "draft",
      dependsOn,
      dependsOnResolverHash: currentHash,
      inputsUsed,
      isStale: false,
      staleReason: null,
      generatorId,
      generatorRunId: generatorRunId || null,
      sourceDocumentIds: Object.values(inputsUsed).map((v: any) => v.version_id),
      styleTemplateVersionId: project.season_style_template_version_id || null,
      metaJson: {
        ...(driftResult.constraintsUsed ? {
          canon_drift: {
            passed: driftResult.passed,
            violations: driftResult.findings.filter((f: any) => f.severity === "violation").length,
            warnings: driftResult.findings.filter((f: any) => f.severity === "warning").length,
            domains_checked: driftResult.domains_checked,
            checked_at: driftResult.checkedAt,
          },
        } : {}),
        ...(stageIdResult ? {
          stage_identity: {
            passed: stageIdResult.pass,
            violation: stageIdResult.violation,
            char_count: stageIdResult.details.char_count,
            word_count: stageIdResult.details.word_count,
            section_count: stageIdResult.details.section_count,
            screenplay_contamination: stageIdResult.details.has_screenplay_formatting,
            density_class: stageIdResult.details.density_class,
            violations: stageIdResult.details.violations,
            repair_hint: stageIdResult.repair_hint || null,
          },
        } : {}),
        // Visual Canon Brief provenance
        ...(docType === "visual_canon_brief" ? {
          visual_canon_brief: {
            generation_method: "sectioned_synthesis_v1",
            source_doc_types: Object.keys(inputsUsed),
            section_count: 12,
            is_upstream_visual_intent: true,
            extraction_contract: "extractVisualCanonSignals",
          },
        } : {}),
        // Visual Project Bible provenance
        ...(docType === "visual_project_bible" ? {
          visual_project_bible: {
            generation_method: "deterministic_assembly",
            no_llm: true,
            is_output_document: true,
            assembly_contract: "assembleVisualProjectBibleFromDB",
          },
        } : {}),
        // ═══ CANONICAL GENERATION PROVENANCE ═══
        generation_provenance: buildGenerationProvenance(generationMode, docType, llmCallCount),
      },
    });

    if (!newVersion) throw new Error(`Failed to create version via doc-os.createVersion`);

    // 10) Insert treatment_acts rows for Treatment doc types
    // These rows are required by the per-act rewrite pipeline (dev-engine-v2 Step 3)
    const isTreatmentGen = docType === "treatment" || docType === "long_treatment";
    if (isTreatmentGen) {
      const ACT_SEQUENCE = [
        { actKey: "act_1_setup",            actNumber: 1 },
        { actKey: "act_2a_rising_action",   actNumber: 2 },
        { actKey: "act_2b_complications",   actNumber: 3 },
        { actKey: "act_3_climax_resolution", actNumber: 4 },
      ];
      const taRows = ACT_SEQUENCE.map(({ actKey, actNumber }) => ({
        treatment_id: docRecord!.id,
        act_number: actNumber,
        act_key: actKey,
        label: findSectionDef("treatment", actKey)?.label ?? actKey,
        status: "pending",
      }));
      const { error: taErr } = await supabase.from("treatment_acts").insert(taRows);
      if (taErr) {
        console.error("[generate-document] treatment_acts insert failed:", taErr.message);
      } else {
        console.log("[generate-document] treatment_acts: inserted " + taRows.length + " rows for treatment_id=" + docRecord!.id);
      }
    }

    // 11) Update project_document pointer
    const updatePayload: Record<string, any> = {
      latest_version_id: newVersion!.id,
      updated_at: new Date().toISOString(),
    };

    // 11) If final: export to Storage
    if (mode === "final") {
      const format = (project.format || project.production_type || "film").toLowerCase().replace(/[_ ]+/g, "-");
      // Simple order lookup
      const orderStr = String(1).padStart(2, "0"); // Will be set by caller or computed
      const storagePath = `projects/${projectId}/package/${docType}/LATEST.md`;
      const encoder = new TextEncoder();
      const contentBytes = encoder.encode(content);

      await supabase.storage.from("projects").upload(storagePath, contentBytes, {
        contentType: "text/markdown",
        upsert: true,
      });

      updatePayload.latest_export_path = storagePath;

      // Mark older finals as superseded
      await supabase.from("project_document_versions")
        .update({ status: "superseded" })
        .eq("document_id", docRecord!.id)
        .neq("id", newVersion!.id)
        .eq("status", "final");
    }

    await supabase.from("project_documents")
      .update(updatePayload)
      .eq("id", docRecord!.id);

    // 12) Persist nuance run (fire-and-forget)
    try {
      await supabase.from("nuance_runs").insert({
        project_id: projectId,
        user_id: actorUserId,
        document_id: docRecord!.id,
        version_id: newVersion!.id,
        doc_type: docType,
        restraint: nuanceParams.restraint,
        story_engine: nuanceParams.story_engine,
        causal_grammar: nuanceParams.causal_grammar,
        drama_budget: nuanceParams.drama_budget,
        nuance_score: finalGate.nuance_score,
        melodrama_score: finalGate.melodrama_score,
        similarity_risk: simRisk,
        anti_tropes: nuanceParams.anti_tropes,
        constraint_pack: {},
        fingerprint: fp,
        nuance_metrics: finalGate.metrics,
        nuance_gate: nuanceGateResult,
        attempt: attempt1 ? 1 : 0,
      });
    } catch (nuanceErr: any) {
      console.error(JSON.stringify({ type: "NUANCE_RUN_PERSIST_ERROR", error: nuanceErr?.message }));
    }

    return new Response(JSON.stringify({
      success: true,
      document_id: docRecord!.id,
      version_id: newVersion!.id,
      version_number: newVersion.version_number,
      mode,
      resolver_hash: currentHash,
      inputs_used: inputsUsed,
      depends_on: dependsOn,
      nuance: {
        nuance_score: finalGate.nuance_score,
        melodrama_score: finalGate.melodrama_score,
        similarity_risk: simRisk,
        gate_passed: finalGate.pass,
        repaired: !!attempt1,
        failures: finalGate.failures,
      },
      canon_drift: driftResult.constraintsUsed ? {
        passed: driftResult.passed,
        violations: driftResult.findings.filter((f: any) => f.severity === "violation").length,
        warnings: driftResult.findings.filter((f: any) => f.severity === "warning").length,
        findings: driftResult.findings.map((f: any) => ({ domain: f.domain, severity: f.severity, detail: f.detail })),
      } : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[generate-document] FATAL error:", {
      error: e?.message,
      status: (e as any)?.status,
      stack: e?.stack ? String(e?.stack).split("\n").slice(0,3) : null,
    });
    // Extract the most useful error message for the caller
    let errorMsg = e?.message || "Internal error";
    // If it's a fetch/network error (no response at all)
    if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('URL') || errorMsg.includes('TypeError')) {
      errorMsg = `Network error generating document: ${errorMsg}`;
    }
    // If it's a FunctionsHttpError from Supabase (non-2xx wrapped)
    if (e?.context?.error) {
      errorMsg = `Supabase function error: ${e.context.error}`;
    } else if (e?.context?.message) {
      errorMsg = `Supabase function error: ${e.context.message}`;
    }
    return jsonRes({
      error: errorMsg,
      detail: e?.stack ? String(e.stack).split("\n").slice(0, 2).join(" | ") : undefined,
    }, 500);
  }
});
