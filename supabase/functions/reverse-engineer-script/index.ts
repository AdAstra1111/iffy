/**
 * reverse-engineer-script
 *
 * Accepts a script, kicks off async job to generate foundation documents
 * (Concept Brief, Market Sheet, Beat Sheet, Character Bible, Story Outline).
 *
 * Foreground: creates job record, returns immediately.
 * Background: does the actual LLM work, writes documents, updates job status.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Stages ──────────────────────────────────────────────────────────────────
const JOB_STAGES = [
  { key: "structure_1",     label: "Analysing script — part 1 of 3..." },
  { key: "structure_2",     label: "Analysing script — part 2 of 3..." },
  { key: "structure_3",     label: "Analysing script — part 3 of 3..." },
  { key: "synthesise",      label: "Synthesising analysis..." },
  { key: "beat_sheet",      label: "Building beat sheet..." },
  { key: "character_bible", label: "Building character bible..." },
  { key: "infer_criteria", label: "Inferring criteria..." },
  { key: "storing_docs",   label: "Saving foundation documents..." },
];

// ─── Chunking helper ──────────────────────────────────────────────────────────
function chunkScript(text: string, numChunks = 3): string[] {
  // Split on scene headings when possible to avoid mid-scene cuts
  const sceneHeadingRe = /^(INT\.|EXT\.|INT\/EXT\.|EXT\/INT\.)[\s\S]/m;
  const lines = text.split("\n");
  const chunkSize = Math.ceil(lines.length / numChunks);
  const chunks: string[] = [];
  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, lines.length);
    chunks.push(lines.slice(start, end).join("\n"));
  }
  return chunks.filter(c => c.trim().length > 0);
}

// ─── LLM Gateway ─────────────────────────────────────────────────────────────
function resolveGatewayKey(): { key: string; baseUrl: string; model: string } {
  const lovable = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("OPENROUTER_API_KEY");
  if (lovable) return { key: lovable, baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-2.5-flash" };
  const openai = Deno.env.get("OPENAI_API_KEY");
  if (openai) return { key: openai, baseUrl: "https://api.openai.com/v1", model: "gpt-4o" };
  throw new Error("No AI gateway key configured");
}

function extractJSON(raw: string): any {
  // Pre-process: strip Gemini thinking blocks (<think>...</think>) and XML-style tags
  let s = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();

  // Strategy 1: strip markdown code fences
  s = s.replace(/^```json\s*/im, "").replace(/^```\s*/im, "").replace(/\s*```$/im, "").trim();
  try { return JSON.parse(s); } catch (_) {}

  // Strategy 2: find first { and last }
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  if (open !== -1 && close > open) {
    try { return JSON.parse(s.slice(open, close + 1)); } catch (_) {}
  }

  // Strategy 3: find any {...} block
  const match = s.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }

  // Strategy 4: strip everything before first [ or { and after last ] or }
  const arrOpen = s.indexOf("[");
  const arrClose = s.lastIndexOf("]");
  if (arrOpen !== -1 && arrClose > arrOpen) {
    try { return JSON.parse(s.slice(arrOpen, arrClose + 1)); } catch (_) {}
  }

  // Strategy 5: handle truncated JSON — count braces, auto-close if unbalanced
  let opens = 0, closes = 0;
  for (const ch of s) { if (ch === '{') opens++; else if (ch === '}') closes++; }
  if (opens > closes) {
    const deficit = opens - closes;
    const padded = s + ' }'.repeat(deficit).trim();
    try { return JSON.parse(padded); } catch (_) {}
  }

  // Strategy 6: same for arrays
  let aOpens = 0, aCloses = 0;
  for (const ch of s) { if (ch === '[') aOpens++; else if (ch === ']') aCloses++; }
  if (aOpens > aCloses) {
    const padded = s + ' ]'.repeat(aOpens - aCloses).trim();
    try { return JSON.parse(padded); } catch (_) {}
  }

  // Strategy 7: extract partial JSON by finding balanced brace regions
  // Walk through string, track depth, capture highest-depth balanced block
  let depth = 0, maxDepth = 0, bestStart = 0, bestEnd = 0, inStr = false, escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inStr) { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') {
      if (depth === 0) bestStart = i;
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && maxDepth > 0) { bestEnd = i + 1; break; }
    }
  }
  if (maxDepth > 0) {
    try { return JSON.parse(s.slice(bestStart, bestEnd)); } catch (_) {}
  }

  throw new Error("No valid JSON in LLM response");
}

async function callLLM(prompt: string, maxTokens = 8000): Promise<any> {
  const { key, baseUrl, model } = resolveGatewayKey();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are a JSON-only API. Return ONLY valid JSON — no markdown, no explanation, no code fences. Start your response with { and end with }." },
            { role: "user", content: prompt }
          ],
          max_tokens: maxTokens,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 429 || res.status >= 500) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
          continue;
        }
        throw new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
      }
      const raw = (await res.json()).choices[0].message.content as string;
      console.log(`[reverse-engineer] LLM raw (first 500):`, raw?.slice(0, 500));
      return extractJSON(raw);
    } catch (err: any) {
      if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
      else throw err;
    }
  }
  throw new Error("LLM call failed");
}

// ─── Doc storage ──────────────────────────────────────────────────────────────
async function storeDoc(sb: any, projectId: string, scriptDocId: string, userId: string | null, docType: string, docRole: string, title: string, data: any): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const plaintext = Object.entries(data).map(([k, v]) => {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return `${k.toUpperCase().replace(/_/g," ")}\n${v.map((i: any) => typeof i === "object" ? JSON.stringify(i, null, 2) : `• ${i}`).join("\n")}`;
    if (typeof v === "object") return `${k.toUpperCase().replace(/_/g," ")}\n${JSON.stringify(v, null, 2)}`;
    return `${k.toUpperCase().replace(/_/g," ")}\n${v}`;
  }).filter(Boolean).join("\n\n");

  // Fall back to project owner if userId not provided (e.g. direct API calls without auth)
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    const { data: proj } = await sb.from("projects").select("user_id").eq("id", projectId).maybeSingle();
    effectiveUserId = proj?.user_id || "system";
  }

  const { data: doc, error } = await sb.from("project_documents").upsert({ project_id: projectId, doc_type: docType, doc_role: docRole, title, plaintext, user_id: effectiveUserId }, { onConflict: "project_id,doc_type" }).select("id").single();
  if (error || !doc) throw new Error(`Failed to upsert ${docType}: ${error?.message}`);
  try {
    const { createVersion } = await import("../_shared/doc-os.ts");
    const ver = await createVersion(sb, { documentId: doc.id, docType, plaintext: content, label: "v1 (reverse-engineered)", createdBy: userId || "system", approvalStatus: "approved", isStale: false, generatorId: "reverse-engineer-script", inputsUsed: { extracted_from: scriptDocId }, metaJson: { reverse_engineered: true } });
    if (ver) await sb.from("project_documents").update({ latest_version_id: ver.id }).eq("id", doc.id);
  } catch (e) { console.warn("Version creation skipped:", e); }
}

// ─── Job helpers ──────────────────────────────────────────────────────────────
function makePayload(jobId: string, initial = false) {
  return {
    job_type: "reverse_engineer",
    status: initial ? "running" : "pending",
    current_stage: initial ? JOB_STAGES[0].key : "pending",
    stages: JOB_STAGES.reduce((acc: any, s) => { acc[s.key] = { label: s.label, status: initial && s.key === JOB_STAGES[0].key ? "running" : "pending" }; return acc; }, {}),
    result: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function updateStage(payload: any, stageKey: string, status: string) {
  if (payload.stages?.[stageKey]) payload.stages[stageKey].status = status;
  payload.current_stage = stageKey;
  payload.updated_at = new Date().toISOString();
}

// ─── Background worker ───────────────────────────────────────────────────────
async function runBackgroundJob(body: any) {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { _job_id: jobId, project_id, script_document_id, user_id, script_text, format } = body;

  // Load existing job record
  const { data: job } = await sb.from("narrative_units").select("id, payload_json").eq("id", jobId).single();
  if (!job) { console.error("[reverse-engineer] job not found:", jobId); return; }

  // Deep clone payload so we can modify safely
  let payload = JSON.parse(JSON.stringify(job.payload_json || {}));
  if (!payload.stages) payload = makePayload(jobId);

  // ── Split full script into 3 chunks for complete coverage ────────────────
  const chunks = chunkScript(script_text, 3);
  console.log(`[reverse-engineer] script length: ${script_text.length} chars, chunks: ${chunks.map(c => c.length)}`);

  try {
    // ── Stages 1-3: Analyse each chunk ──────────────────────────────────────
    const chunkAnalyses: any[] = [];
    const chunkStageKeys = ["structure_1", "structure_2", "structure_3"] as const;

    for (let i = 0; i < chunks.length; i++) {
      const stageKey = chunkStageKeys[i];
      updateStage(payload, stageKey, "running");
      await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

      const chunkResult = await callLLM(`You are a senior film/TV analyst. This is part ${i + 1} of ${chunks.length} of a ${format} script.
Analyse this section and extract all characters, locations, events, and themes you can identify.
IMPORTANT: Return ONLY raw JSON with no thinking, no explanation, no markdown.

Return ONLY valid JSON:
{
  "characters_seen": ["character name"],
  "locations_seen": ["location name"],
  "key_events": ["brief description of major event"],
  "themes": ["theme"],
  "tone_notes": "string",
  "dialogue_samples": ["short memorable line"]
}

SCRIPT PART ${i + 1}/${chunks.length}:
${chunks[i]}

Respond with ONLY JSON.`, 8000);

      chunkAnalyses.push(chunkResult);
      updateStage(payload, stageKey, "done");
      await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);
    }

    // ── Stage 4: Synthesise all chunks into concept brief + market sheet ────
    updateStage(payload, "synthesise", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    const allCharacters = [...new Set(chunkAnalyses.flatMap(c => c.characters_seen || []))];
    const allLocations  = [...new Set(chunkAnalyses.flatMap(c => c.locations_seen || []))];
    const allEvents     = chunkAnalyses.flatMap(c => c.key_events || []);
    const allThemes     = [...new Set(chunkAnalyses.flatMap(c => c.themes || []))];
    const toneNotes     = chunkAnalyses.map((c, i) => `Part ${i+1}: ${c.tone_notes || ""}`).join(" | ");

    const synthSummary = `CHARACTERS: ${allCharacters.join(", ")}\nLOCATIONS: ${allLocations.join(", ")}\nKEY EVENTS:\n${allEvents.map(e => `- ${e}`).join("\n")}\nTHEMES: ${allThemes.join(", ")}\nTONE: ${toneNotes}`;

    // Use beginning of script for title/logline + synthesis summary for full picture
    const scriptHead = script_text.slice(0, 8000);

    const call1 = await callLLM(`You are a senior film/TV analyst. You have analysed a complete ${format} script in chunks. Below is:
1. The script opening (for title, logline, voice)
2. A synthesis of what was found across ALL parts

Produce a complete concept brief and market sheet.
IMPORTANT: Return ONLY raw JSON with no thinking, no explanation, no markdown.

IMPORTANT — genre classification guide:
- "genre" = the PRIMARY story TYPE / STRUCTURAL CATEGORY. Choose from: action-adventure, comedy, drama, thriller, horror, sci-fi, fantasy, romance, animated, documentary.
- "subgenre" = the SPECIFIC SUB-CATEGORY (e.g. monster movie, pulp adventure, period action, psychological thriller, found footage horror).
- CRITICAL: If the story features a giant creature, kaiju, dinosaur, or large animal as a central threat/plot engine → genre is "action-adventure" and subgenre should reflect the creature type.
- CRITICAL: If the story is fundamentally about a person overcoming external obstacles/forces → genre is NOT "psychological drama". "Psychological drama" means the central conflict is the character's internal mental state.
- "tone" = the EMOTIONAL REGISTER (e.g. darkly comedic, earnest, pulp adventurous, brooding, exhilarating).
- "comparable_titles" = 2-4 films with similar AUDIENCE APPEAL, not just similar premise. Think: who walks out of this wanting more of the same?

Return ONLY valid JSON:
{
  "metadata": {
    "title": "string",
    "logline": "string — 1-2 sentence hook",
    "format": "string — must be one of: film, tv-series, limited-series, vertical-drama, documentary, documentary-series, short, animation",
    "genre": "string — primary story type (action-adventure, comedy, drama, thriller, horror, sci-fi, fantasy, romance, animated, documentary)",
    "subgenre": "string or null — specific sub-category (e.g. monster movie, pulp adventure, period action)",
    "tone": "string — emotional register",
    "themes": ["string"],
    "target_audience": "string"
  },
  "concept_brief": {
    "premise": "string",
    "central_question": "string",
    "world_building_notes": "string"
  },
  "market_sheet": {
    "comparable_titles": ["string"],
    "market_positioning": "string",
    "audience_age_range": "string",
    "audience_breakdown": {"string": "percentage"}
  },
  "voice_profile": {
    "narrative_voice": "string",
    "dialogue_style": "string",
    "visual_style": "string"
  }
}

SCRIPT OPENING:
${scriptHead}

FULL SCRIPT SYNTHESIS:
${synthSummary}

Respond with ONLY JSON.`, 12000);

    updateStage(payload, "synthesise", "done");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    // Debug: log the raw genre/subgenre/tone from synthesis stage so we can see exactly what the LLM returned
    console.log("[reverse-engineer] call1 genre =", (call1 as any)?.metadata?.genre, "| subgenre =", (call1 as any)?.metadata?.subgenre, "| tone =", (call1 as any)?.metadata?.tone);

    // ── Stage 5: Beat sheet (use full script head + synthesis) ──────────────
    updateStage(payload, "beat_sheet", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    const beatScript = script_text.slice(0, 80000); // beats need enough to track structure
    const call2 = await callLLM(`Extract a beat sheet from this ${format} script. Use the full structural arc.

Return ONLY valid JSON:
{
  "title": "string",
  "total_beats": N,
  "beats": [
    {
      "number": 1,
      "name": "string",
      "page_range": "string",
      "description": "string",
      "emotional_shift": "string",
      "protagonist_state": "string",
      "dramatic_function": "string"
    }
  ],
  "structural_notes": "string",
  "pacing_notes": "string",
  "turning_points": [{"page": "string", "description": "string"}]
}

SCRIPT (first 80k chars):
${beatScript}

KNOWN KEY EVENTS FROM FULL SCRIPT:
${allEvents.map(e => `- ${e}`).join("\n")}

Respond with ONLY JSON.`, 12000);

    // ── Stage 6: Character bible (use synthesis + head for full cast) ────────
    updateStage(payload, "character_bible", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    const charScript = script_text.slice(0, 80000);
    const call3 = await callLLM(`Write a complete character bible for this ${format} script.
Known characters from full script analysis: ${allCharacters.join(", ")}.

Return ONLY valid JSON:
{
  "characters": [
    {
      "name": "string",
      "age": "string",
      "role": "string — protagonist/antagonist/supporting",
      "physical_description": "string",
      "backstory": "string",
      "psychology": "string",
      "want": "string",
      "need": "string",
      "fatal_flaw": "string",
      "arc": "string",
      "voice_and_speech": "string",
      "sample_dialogue": "string",
      "casting_suggestions": ["string"]
    }
  ],
  "relationship_dynamics": "string",
  "ensemble_notes": "string"
}

CRITICAL ORDERING RULE: Characters array MUST be ordered by narrative importance — protagonist(s) first, then antagonist(s), then supporting roles in descending order of screen time and story weight, then recurring/minor roles last. NEVER alphabetical order.

SCRIPT (first 80k chars):
${charScript}

Respond with ONLY JSON.`, 12000);

    // ── Stage 4: Store documents ────────────────────────────────────────────
    updateStage(payload, "storing_docs", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    const { metadata } = call1;
    const isTV = format === "tv-series";

    await storeDoc(sb, project_id, script_document_id, user_id, "concept_brief", "creative_primary",
      `${metadata.title} — Concept Brief`,
      { title: metadata.title, logline: metadata.logline, genre: metadata.genre, subgenre: metadata.subgenre, tone: metadata.tone, themes: metadata.themes || [], target_audience: metadata.target_audience, ...call1.concept_brief });

    const marketType = isTV ? "vertical_market_sheet" : "market_sheet";
    await storeDoc(sb, project_id, script_document_id, user_id, marketType, "creative_primary",
      `${metadata.title} — Market Sheet`,
      { title: metadata.title, logline: metadata.logline, genre: metadata.genre, format, ...call1.market_sheet });

    const arcType = isTV ? "season_arc" : "treatment";
    await storeDoc(sb, project_id, script_document_id, user_id, arcType, "creative_primary",
      `${metadata.title} — ${isTV ? "Season Arc" : "Treatment"}`,
      { title: metadata.title, logline: metadata.logline, format, ...call1.treatment });

    const beatType = isTV ? "format_rules" : "beat_sheet";
    await storeDoc(sb, project_id, script_document_id, user_id, beatType, "creative_primary",
      `${metadata.title} — Beat Sheet`, call2);

    await storeDoc(sb, project_id, script_document_id, user_id, "character_bible", "creative_primary",
      `${metadata.title} — Character Bible`, call3);

    const outlineType = isTV ? "episode_grid" : "story_outline";
    await storeDoc(sb, project_id, script_document_id, user_id, outlineType, "creative_primary",
      `${metadata.title} — Story Outline`,
      { title: metadata.title, format, entries: (call2.beats || []).slice(0, 20).map((b: any, i: number) => ({ number: i + 1, title: b.name, description: b.description })) });

    try {
      const { data: canon } = await sb.from("project_canon").select("id, canon_json").eq("project_id", project_id).single();
      if (canon) await sb.from("project_canon").update({ canon_json: { ...(canon.canon_json || {}), voice_profile: call1.voice_profile, title: metadata.title } }).eq("id", canon.id);
      else await sb.from("project_canon").insert({ project_id, canon_json: { voice_profile: call1.voice_profile, title: metadata.title } });
    } catch (_) {}

    // ── Stage 7: Infer remaining criteria from beats + characters ─────────────────────
    updateStage(payload, "infer_criteria", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    const beatsText = (call2.beats || []).map((b: any) =>
      `Beat ${b.number}: ${b.name} — ${(b.description || "").slice(0, 200)} | Tone: ${b.emotional_shift || ""}`
    ).join("\n");
    const marketSheet = (call1 as any).market_sheet || {};
    const comparables = marketSheet.comparable_titles || [];

    const callCriteria = await callLLM(`You are a film/TV production analyst. Infer all remaining pitch criteria fields from the document evidence below.

EVIDENCE:
- Genre: ${(call1 as any).genre || "unknown"}
- Subgenre: ${(call1 as any).subgenre || "unknown"}
- Comparable titles: ${comparables.join(", ") || "none"}
- Market positioning: ${marketSheet.market_positioning || ""}
- Audience: ${(call1 as any).target_audience || ""}

BEAT SHEET (condensed):
${beatsText.slice(0, 4000)}

PRODUCTION TYPE: ${isTV ? "tv-series" : "film"}

RULES:
- Be CONCRETE — cite evidence from the beats when inferring
- Do NOT invent numbers not supported by evidence
- Use comparable titles and genre to infer platform, lane and budget
- Infer tone from the BEAT emotional shifts (emotional_shift), not just the logline
- Infer rating from violence, language and adult themes in beat descriptions

Return ONLY valid JSON:
{
  "subgenre": "string — e.g. Monster Movie, Pulp Adventure, Period Action",
  "toneAnchor": "string — comma-separated tone keywords matching BEAT SHIFT energy",
  "rating": "string — e.g. PG, PG-13, 12, 15, R",
  "platformTarget": "string — primary distribution platform or theatrical",
  "lane": "string — prestige | mainstream | independent-film | genre-market | micro-budget",
  "budgetBand": "string — micro | low | medium | high | tent-pole",
  "runtimeMin": number | null,
  "runtimeMax": number | null,
  "settingType": "string — Period/Historical | Contemporary | Near Future | etc.",
  "locationVibe": "string — brief description of primary setting energy",
  "confidence": {"subgenre": "high|med|low", "toneAnchor": "high|med|low", "rating": "high|med|low", "platformTarget": "high|med|low", "lane": "high|med|low", "budgetBand": "high|med|low", "runtimeMin": "high|med|low", "settingType": "high|med|low"},
  "evidence": "brief justification for key inferences"
}

Respond with ONLY JSON.`, 3000);

    let inferred: any = {};
    try { inferred = extractJSON(callCriteria); }
    catch (e) { console.warn("[reverse-engineer] criteria inference JSON parse failed:", String(callCriteria).slice(0, 500)); }
    if (Object.keys(inferred).length === 0) {
      console.warn("[reverse-engineer] criteria inference returned empty — raw output:", String(callCriteria).slice(0, 1000));
    }

    updateStage(payload, "infer_criteria", "done");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    // ── Auto-populate pitch criteria from extracted metadata + inferred fields ─────
    try {
      const marketSheet = (call2 as any)?.market_sheet || {};

      // criteria_json — pitch-facing fields
      const criteriaFields: Record<string, any> = {};
      if (metadata.genre)                               criteriaFields.genre             = metadata.genre;
      if (inferred.subgenre)                            criteriaFields.subgenre          = inferred.subgenre;
      if (inferred.toneAnchor)                          criteriaFields.toneAnchor        = inferred.toneAnchor;
      if (metadata.target_audience)                      criteriaFields.audience         = metadata.target_audience;
      if (inferred.rating)                              criteriaFields.rating           = inferred.rating;
      if (marketSheet.comparable_titles?.length)         criteriaFields.prohibitedComps = marketSheet.comparable_titles;
      if (marketSheet.market_positioning)                 criteriaFields.differentiateBy  = marketSheet.market_positioning;
      if (inferred.settingType)                          criteriaFields.settingType      = inferred.settingType;
      if (inferred.locationVibe)                          criteriaFields.locationVibe      = inferred.locationVibe;
      if (inferred.runtimeMin)                           criteriaFields.runtimeMin       = String(inferred.runtimeMin);
      if (inferred.runtimeMax)                           criteriaFields.runtimeMax       = String(inferred.runtimeMax);

      // guardrails qualifications — all fields for pipeline + CriteriaPanel
      const fmtFromLLM = (metadata as any).format;
      const fmtSubtype = fmtFromLLM || (isTV ? 'tv-series' : 'film');
      const quals: Record<string, any> = {
        format_subtype: fmtSubtype,
        genre: metadata.genre || null,
        subgenre: (inferred.subgenre || metadata.subgenre) || null,
        tone: (inferred.toneAnchor || metadata.tone) || null,
        target_audience: metadata.target_audience || null,
        audience_age_range: inferred.rating || null,
        comparable_titles: marketSheet.comparable_titles?.length ? marketSheet.comparable_titles : null,
        market_positioning: marketSheet.market_positioning || null,
        platformTarget: inferred.platformTarget || null,
        assigned_lane: inferred.lane || null,
        budget_range: inferred.budgetBand || null,
        runtimeMin: inferred.runtimeMin || null,
        runtimeMax: inferred.runtimeMax || null,
        settingType: inferred.settingType || null,
        locationVibe: inferred.locationVibe || null,
        _inference_confidence: inferred.confidence || null,
        _inference_evidence: inferred.evidence || null,
      };

      // Read current guardrails_config
      const { data: projRow } = await sb.from("projects")
        .select("guardrails_config, criteria_json")
        .eq("id", project_id).single();

      const gc = (projRow?.guardrails_config as any) || {};
      gc.overrides = gc.overrides || {};
      if (Object.keys(quals).length > 0) {
        gc.overrides.qualifications = { ...(gc.overrides.qualifications || {}), ...quals };
      }
      gc.derived_from_reverse_engineer = {
        populated_at: new Date().toISOString(),
        script_document_id: script_document_id,
      };

      await sb.from("projects").update({
        criteria_json: criteriaFields,
        guardrails_config: gc,
      }).eq("id", project_id);

      console.log("[reverse-engineer] criteria populated:", Object.keys(criteriaFields).join(", "));
    } catch (criteriaErr) {
      console.warn("[reverse-engineer] criteria population failed (non-fatal):", criteriaErr);
    }

    await sb.from("projects").update({ title: metadata.title, lifecycle_stage: outlineType }).eq("id", project_id);

    // Mark all stages done
    for (const s of JOB_STAGES) updateStage(payload, s.key, "done");
    payload.status = "done";
    payload.current_stage = "done";
    payload.updated_at = new Date().toISOString();
    payload.result = { title: metadata.title, documents_created: ["concept_brief", marketType, arcType, beatType, "character_bible", outlineType] };

  } catch (err: any) {
    console.error("[reverse-engineer] background error:", err?.message);
    payload.status = "error";
    payload.error = err?.message;
    payload.updated_at = new Date().toISOString();
  }

  await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);
}

// ─── Main handler ────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const body = await req.json().catch(() => ({}));

  // ── Background trigger ───────────────────────────────────────────────────
  if (body._bg && body._job_id) {
    await runBackgroundJob(body);
    return new Response(JSON.stringify({ ok: true, job_id: body._job_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Foreground: create job, dispatch background, return immediately ────────
  try {
    const { project_id, script_document_id, script_version_id, user_id } = body;
    if (!project_id || !script_document_id)
      return new Response(JSON.stringify({ error: "project_id and script_document_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch script text
    let scriptText = "";
    if (script_version_id) {
      const { data: v } = await sb.from("project_document_versions").select("plaintext").eq("id", script_version_id).maybeSingle();
      scriptText = v?.plaintext || "";
    }
    if (!scriptText) {
      const { data: doc } = await sb.from("project_documents").select("plaintext, extracted_text, latest_version_id").eq("id", script_document_id).maybeSingle();
      if (doc?.latest_version_id) {
        const { data: latestVer } = await sb.from("project_document_versions").select("plaintext").eq("id", doc.latest_version_id).maybeSingle();
        scriptText = latestVer?.plaintext || "";
      }
      if (!scriptText && doc?.plaintext) scriptText = doc.plaintext;
      if (!scriptText && doc?.extracted_text) scriptText = doc.extracted_text;
    }
    if (!scriptText) {
      const { data: latestVer } = await sb.from("project_document_versions").select("plaintext").eq("document_id", script_document_id).order("version_number", { ascending: false }).limit(1).maybeSingle();
      scriptText = latestVer?.plaintext || "";
    }
    if (!scriptText || scriptText.length < 100)
      return new Response(JSON.stringify({ error: "Script text not found — ensure the script has been uploaded and saved." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const isTV = /\b(episode\s*\d|ep\.?\s*\d|season\s*\d|series\s*\d)\b/i.test(scriptText.slice(0, 3000));
    const format = isTV ? "tv-series" : "film";

    // Create job record
    const jobKey = `reverse_job_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const jobRecord = {
      unit_type: "async_job",
      unit_key: jobKey,
      project_id,
      source_doc_type: "script",
      payload_json: makePayload(null, true),
      status: "active",
    };

    const { data: created, error: jobErr } = await sb.from("narrative_units").insert(jobRecord).select("id").single();
    if (jobErr || !created)
      return new Response(JSON.stringify({ error: `Failed to create job: ${jobErr?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const jobId = created.id;

    // Dispatch background work via EdgeRuntime.waitUntil so the worker stays alive
    // after we return the foreground response. Plain fire-and-forget fetch() gets
    // killed the moment the Response is sent — waitUntil prevents that.
    const bgPayload = JSON.stringify({ _bg: true, _job_id: jobId, project_id, script_document_id, user_id, script_text: scriptText, format });
    const bgHeaders = new Headers({ "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` });

    const bgWork = fetch(`${SUPABASE_URL}/functions/v1/reverse-engineer-script`, {
      method: "POST",
      headers: bgHeaders,
      body: bgPayload,
    }).then(r => {
      if (!r.ok) console.error("[reverse-engineer] bg dispatch non-2xx:", r.status);
    }).catch(err => console.error("[reverse-engineer] bg dispatch error:", err));

    // Keep worker alive until background job completes
    if (typeof (globalThis as any).EdgeRuntime !== "undefined") {
      (globalThis as any).EdgeRuntime.waitUntil(bgWork);
    }

    return new Response(JSON.stringify({
      job_id: jobId,
      status: "running",
      message: "Reverse-engineering started",
      stages: JOB_STAGES,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("[reverse-engineer] error:", err?.message);
    return new Response(JSON.stringify({ error: err?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
