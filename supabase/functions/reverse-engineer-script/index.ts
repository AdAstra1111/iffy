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
  { key: "idea",            label: "Creating idea document..." },
  { key: "beat_sheet",      label: "Building beat sheet..." },
  { key: "story_outline",   label: "Building story outline..." },
  { key: "character_bible", label: "Building character bible..." },
  { key: "treatment",       label: "Writing treatment..." },
  { key: "market_sheet",    label: "Building market sheet..." },
  { key: "infer_criteria",  label: "Inferring criteria..." },
  { key: "storing_docs",   label: "Saving foundation documents..." },
];

// ─── Regex character extraction helper ───────────────────────────────────────
function extractRegexCharacters(scriptText: string): string[] {
  const regex = /\b[A-Z][A-Z\s]{2,}\b/g;
  const found = scriptText.match(regex) || [];
  const noise = new Set([
    "INT.", "EXT.", "INT/EXT.", "EXT/INT.", "CUT TO", "FADE IN", "FADE OUT",
    "DISSOLVE TO", "SMASH CUT", "MONTAGE", "CONTINUED", "THE END",
    "OVER BLACK", "TITLE CARD", "INTERCUT", "SUPER", "BACK TO", "LATER",
  ]);
  return [...new Set(found.map(n => n.trim()))].filter(n => !noise.has(n) && n.length >= 2 && n.length <= 40);
}

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

/** Chunks script text AND tracks 1-indexed line ranges for each chunk.
 *  lineRanges[i] = { startLine, endLine } for chunks[i].
 */
function chunkScriptWithLines(text: string, numChunks = 3): {
  chunks: string[];
  lineRanges: Array<{ startLine: number; endLine: number }>;
} {
  const lines = text.split("\n");
  const chunkSize = Math.ceil(lines.length / numChunks);
  const chunks: string[] = [];
  const lineRanges: Array<{ startLine: number; endLine: number }> = [];
  for (let i = 0; i < numChunks; i++) {
    const startIdx = i * chunkSize;
    const endIdx = Math.min(startIdx + chunkSize, lines.length);
    const chunkText = lines.slice(startIdx, endIdx).join("\n");
    if (chunkText.trim().length > 0) {
      chunks.push(chunkText);
      lineRanges.push({ startLine: startIdx + 1, endLine: endIdx }); // 1-indexed
    }
  }
  return { chunks, lineRanges };
}

// ─── LLM Gateway ─────────────────────────────────────────────────────────────
function resolveGatewayKey(): { key: string; baseUrl: string; model: string } {
  const lovable = Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("OPENROUTER_API_KEY");
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

  console.warn("[extractJSON] All strategies exhausted — LLM returned unparseable content:", String(raw).slice(0, 300));
  return null;
}

async function callLLM(prompt: string, maxTokens = 8000, timeoutMs = 60000): Promise<any> {
  const { key, baseUrl, model } = resolveGatewayKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`LLM call timed out after ${timeoutMs/1000}s`)), timeoutMs);
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
        signal: controller.signal as any,
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
      clearTimeout(timeout);
      return extractJSON(raw);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        clearTimeout(timeout);
        throw new Error(`LLM call timed out after ${timeoutMs}ms`);
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
      else { clearTimeout(timeout); throw err; }
    }
  }
  clearTimeout(timeout);
  throw new Error("LLM call failed");
}

// ─── Doc storage ──────────────────────────────────────────────────────────────
async function storeDoc(sb: any, projectId: string, scriptDocId: string, userId: string | null, docType: string, docRole: string, title: string, data: any, extraMeta?: Record<string, any>, dependsOnResolverHash?: string): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  // Smart plaintext formatter for structured docs (beat_sheet, story_outline)
  // - Arrays of objects (beats/entries): formatted individually
  // - Object fields within beats/entries: skipped
  function buildPlaintext(data: any): string {
    if (!data || typeof data !== "object") return String(data ?? "");
    if (Array.isArray(data)) {
      if (data.length === 0) return "";
      const first = data[0];
      if (typeof first === "object" && first !== null) {
        // Array of objects (beats/entries) — format each one individually
        return data.map((item: any, idx: number) => {
          const num = item.number ?? item.entry_number ?? idx + 1;
          const label = item.name ?? item.title ?? item.entry_title ?? `Item ${num}`;
          const lines: string[] = [`ITEM ${num}: ${label}`];
          for (const [k, val] of Object.entries(item)) {
            if (k === "number" || k === "name" || k === "title" || k === "entry_title" || val === null || val === undefined) continue;
            const label2 = k.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
            if (Array.isArray(val)) { lines.push(`  ${label2}: ${val.join(", ")}`); }
            else if (typeof val === "object") { /* skip nested objects at item level */ }
            else { lines.push(`  ${label2}: ${val}`); }
          }
          return lines.join("\n");
        }).join("\n\n");
      }
      return data.map((i: any) => typeof i === "object" ? JSON.stringify(i) : `• ${i}`).join("\n");
    }
    // Plain object — recurse on entries
    return Object.entries(data).map(([k, v]) => {
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return `${k.toUpperCase().replace(/_/g," ")}\n${v.map((i: any) => typeof i === "object" ? JSON.stringify(i, null, 2) : `• ${i}`).join("\n")}`;
      if (typeof v === "object") return buildPlaintext(v);
      return `${k.toUpperCase().replace(/_/g," ")}\n${v}`;
    }).filter(Boolean).join("\n\n");
  }
  const plaintext = buildPlaintext(data);

  // Fall back to project owner if userId not provided (e.g. direct API calls without auth)
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    const { data: proj } = await sb.from("projects").select("user_id").eq("id", projectId).maybeSingle();
    effectiveUserId = proj?.user_id || "system";
  }

  const { data: doc, error } = await sb.from("project_documents").upsert({ project_id: projectId, doc_type: docType, doc_role: docRole, title, plaintext, user_id: effectiveUserId }, { onConflict: "project_id,doc_type" }).select("id").single();
  if (error || !doc) throw new Error(`Failed to upsert ${docType}: ${error?.message}`);

  // Check for existing versions — if a seed version exists (label: initial_baseline_seed),
  // UPDATE it in-place so it stays as v1 rather than creating a new v2 on top.
  const { data: existingVersions } = await sb
    .from("project_document_versions")
    .select("id, version_number")
    .eq("document_id", doc.id)
    .order("version_number", { ascending: false });

  if (existingVersions && existingVersions.length > 0) {
    // Update the most recent version in place (replaces seed content + metadata, keeps v1)
    const latestId = existingVersions[0].id;
    await sb.from("project_document_versions").update({
      plaintext: content,
      label: "v1 (reverse-engineered)",
      status: "draft",
      approval_status: "draft",
      generator_id: "reverse-engineer-script",
      is_stale: false,
      inputs_used: { extracted_from: scriptDocId },
      depends_on_resolver_hash: dependsOnResolverHash || null,
      meta_json: { reverse_engineered: true, ...(extraMeta || {}) },
    }).eq("id", latestId);
    await sb.from("project_documents").update({ latest_version_id: latestId }).eq("id", doc.id);
    console.log(`[storeDoc] ${docType}: updated existing v${existingVersions[0].version_number} in place (id: ${latestId})`);
  } else {
    // No existing versions — create fresh (this is a truly new doc)
    try {
      const { createVersion } = await import("../_shared/doc-os.ts");
      const ver = await createVersion(sb, { documentId: doc.id, docType, plaintext: content, label: "v1 (reverse-engineered)", createdBy: userId || "system", approvalStatus: "draft", isStale: false, generatorId: "reverse-engineer-script", inputsUsed: { extracted_from: scriptDocId }, dependsOnResolverHash, metaJson: { reverse_engineered: true, ...(extraMeta || {}) } });
      if (ver) await sb.from("project_documents").update({ latest_version_id: ver.id }).eq("id", doc.id);
    } catch (e) { console.warn("Version creation skipped:", e); }
  }
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
  console.log("[reverse-engineer] runBackgroundJob start", new Date().toISOString());
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log("[reverse-engineer] Supabase client created", new Date().toISOString());
  const { _job_id: jobId, project_id, script_document_id, user_id, script_text, format } = body;
  console.log("[reverse-engineer] body parsed, jobId:", jobId, new Date().toISOString());

  // Load existing job record
  console.log("[reverse-engineer] loading job record...", new Date().toISOString());
  const { data: job } = await sb.from("narrative_units").select("id, payload_json").eq("id", jobId).single();
  console.log("[reverse-engineer] job loaded:", job?.id, new Date().toISOString());
  if (!job) { console.error("[reverse-engineer] job not found:", jobId); return; }
  if (!job) { console.error("[reverse-engineer] job not found:", jobId); return; }

  // Deep clone payload so we can modify safely
  let payload = JSON.parse(JSON.stringify(job.payload_json || {}));
  if (!payload.stages) payload = makePayload(jobId);

  // ── Split full script into 3 chunks for complete coverage ────────────────
  const { chunks, lineRanges } = chunkScriptWithLines(script_text, 3);
  console.log(`[reverse-engineer] script length: ${script_text.length} chars, chunks: ${chunks.map(c => c.length)}, lineRanges: ${JSON.stringify(lineRanges)}`);

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

    // ── Regex pre-pass: merge ALL-CAPS names into allCharacters ──────────────
    const regexNames = extractRegexCharacters(script_text);
    const allCharactersSet = new Set(allCharacters);
    for (const name of regexNames) {
      const lc = name.toLowerCase();
      const alreadyPresent = [...allCharactersSet].some(c => c.toLowerCase().includes(lc) || lc.includes(c.toLowerCase()));
      if (!alreadyPresent && name.length >= 3) allCharactersSet.add(name);
    }
    const mergedCharacters = [...allCharactersSet];

    // Check against narrative_entities canonical roster
    let regexOrphans: string[] = [];
    try {
      const { data: canonEntities } = await sb
        .from("narrative_entities")
        .select("id, name, variant_names")
        .eq("project_id", project_id)
        .eq("entity_type", "character");

      if (canonEntities && canonEntities.length > 0) {
        const canonNames = new Set(
          canonEntities.flatMap((e: any) => [e.name, ...(e.variant_names || [])]).map((n: string) => n.toLowerCase())
        );
        regexOrphans = regexNames.filter(n => !canonNames.has(n.toLowerCase()));
        console.log(`[reverse-engineer] regex: ${regexNames.length} names found, ${regexOrphans.length} not in canonical`);

        if (regexOrphans.length > 0) {
          try {
            await sb.from("reverse_engineer_context").upsert({
              project_id,
              regex_found_names: regexOrphans,
              locked_entity_ids: canonEntities.map((e: any) => e.id),
              locked_scene_ids: [],
              created_by: user_id || "system",
            }, { onConflict: "project_id" });
          } catch (rceErr) {
            console.warn("[reverse-engineer] reverse_engineer_context write failed (non-fatal):", rceErr);
          }
        }
      }
    } catch (e) {
      console.warn("[reverse-engineer] canonical check failed (non-fatal):", e);
    }

    const synthSummary = `CHARACTERS: ${mergedCharacters.join(", ")}\nLOCATIONS: ${allLocations.join(", ")}\nKEY EVENTS:\n${allEvents.map(e => `- ${e}`).join("\n")}\nTHEMES: ${allThemes.join(", ")}\nTONE: ${toneNotes}`;

    // Use beginning of script for title/logline + synthesis summary for full picture
    const scriptHead = script_text.slice(0, 8000);

    const call1 = await callLLM(`You are a senior film/TV analyst. You have analysed a complete ${format} script in chunks. Below is:
1. The script opening (for title, logline, voice)
2. A synthesis of what was found across ALL parts

Produce a complete concept brief and market sheet.
IMPORTANT: Return ONLY raw JSON with no thinking, no explanation, no markdown.

IMPORTANT — genre classification guide:
Classify by what the story is STRUCTURALLY and FUNCTIONALLY about, not the tone, setting, or subject matter.

NUANCED DETECTION RULES (use these when genres overlap):

ACTION-ADVENTURE vs THRILLER: If the script has chases, physical fights, explosions, or survival sequences as the PRIMARY draw → action-adventure. If the primary draw is not knowing what happens next, a threat you can't see, or a mystery that keeps you on edge → thriller.

DRAMA vs THRILLER: If the emotional/relationship conflict would still drive the story if you removed all suspense elements → drama. If removing the threat/secret/mystery collapses the plot → thriller.

DRAMA vs HORROR: If the story is primarily about a character's grief, trauma, or mental state as an internal journey → drama (psychological drama). If the dread, fear, or survival against a supernatural/physical threat is what the audience comes for → horror.

THRILLER vs HORROR: Thriller keeps you anxious about WHAT WILL HAPPEN. Horror keeps you disturbed by WHAT IS HAPPENING. Thriller threat is usually human/knowable. Horror threat is often unknowable, cosmic, or primal.

DRAMA vs ROMANCE: If the central relationship is the vehicle for exploring a character's emotional journey → drama. If the relationship IS the story and its development/resolution is the primary payoff → romance.

SCI-FI vs FANTASY: If the story would BREAK without the speculative science/technology rule → sci-fi. If it would break without a magical/mythological logic → fantasy. If it works with either explanation → prefer the more specific.

COMEDY vs DRAMA: If you laugh more than you feel → comedy. If you're moved more than you laugh → drama. Blends exist: call it comedy-drama if both laugh and emotional beats land equally.

PERIOD SETTING: Setting era does not determine genre. A period piece can be a thriller, romance, drama, or action-adventure. Determine genre by plot structure first, then note the period in subgenre if structurally relevant.

GENRE BLENDS: When two genres are equally strong (e.g., action-comedy, horror-thriller) → pick the stronger PRIMARY and put the secondary in subgenre. "It's a [subgenre] [genre]" is the test: "a creature-feature action-adventure" ✓, "a thriller comedy" → thriller is primary, comedy is subgenre.

PRIMARY GENRE (pick ONE — answer: what drives the plot and what does the audience come for?):
- action-adventure: physical stakes, external conflict, action set-pieces, survival, pursuit. Examples: Die Hard, Mad Max: Fury Road, Jumanji, The Lost World, Independence Day, Jurassic Park
- comedy: primarily designed to amuse, driven by character quirks, dialogue, or situation. Examples: Groundhog Day, Bridesmaids, The Big Lebowski, Clueless, mean Girls
- drama: character interiority, emotional relationships, personal stakes, life choices. Examples: Marriage Story, Manchester by the Sea, Moonlight, The Florida Project
- thriller: suspense, threat, pacing, mystery, cat-and-mouse. Examples: Se7en, Gone Girl, Prisoners, Shutter Island, No Country for Old Men
- horror: fear, dread, survival, the supernatural or psychological unknown. Examples: Hereditary, Get Out, The Witch, A Quiet Place, The Descent
- sci-fi: speculative technology, science, or world-building logic as plot engine. Examples: Blade Runner 2049, Arrival, Ex Machina, Interstellar, Annihilation
- fantasy: magical systems, mythological logic, otherworldly setting. Examples: LOTR, Pan's Labyrinth, Spirited Away, Shape of Water
- romance: love, relationships, or emotional connection as primary engine. Examples: When Harry Met Sally, La La Land, Call Me by Your Name, Brokeback Mountain
- animated: animation as the storytelling medium (can be any genre above for plot). Examples: Spider-Verse, Toy Story, Wall-E, The Triplets of Belleville
- documentary: real-world subject, factual or真实性-based. Examples: Free Solo, 20 Feet from Stardom, Capote

SUBGENRE (one level deeper — be specific):
- action-adventure subgenres: creature feature (giant animal/monster as threat), heist, survival, martial arts, disaster, war, adventure-comedy
- comedy subgenres: workplace, romantic, dark/cult, parody/satire, coming-of-age, mockumentary
- drama subgenres: period drama, family drama, crime drama, psychological drama, political drama
- thriller subgenres: psychological thriller, crime thriller, political thriller, supernatural thriller, survival thriller
- horror subgenres: body horror, psychological horror, folk horror, found footage, creature horror, domestic horror
- sci-fi subgenres: hard sci-fi, space opera, dystopian, time travel, biopunk/techno-thriller
- fantasy subgenres: high fantasy, urban fantasy, dark fantasy, fairy tale, mythic

TONE (emotional register — can combine): darkly comedic, earnestly dramatic, pulp adventurous, brooding, exhilarating, wry, bittersweet, lighthearted, intense, quirky, operatic, grounded

COMPARABLE TITLES: 2-4 films with similar AUDIENCE EXPERIENCE, not just premise. Think: "someone who loved X would love this because..."

Return ONLY valid JSON:
{
  "metadata": {
    "title": "string",
    "logline": "string — 1-2 sentence hook",
    "format": "string — must be one of: film, tv-series, limited-series, vertical-drama, documentary, documentary-series, short, animation",
    "genre": "string — primary story type (action-adventure, comedy, drama, thriller, horror, sci-fi, fantasy, romance, animated, documentary)",
    "subgenre": "string or null — specific sub-category based on the genre-specific subgenre list above",
    "tone": "string — emotional register (can combine, e.g. 'darkly comedic', 'pulp adventurous high-stakes')",
    "themes": ["string"],
    "target_audience": "string"
  },
  "concept_brief": {
    "premise": "string",
    "central_question": "string",
    "world_building_notes": "string"
  },
  "market_sheet": {
    "tagline": "string — one-line hook summing the core appeal (derive from tone + premise). Use null if script provides insufficient signal.",
    "comparable_titles": ["string"],
    "market_positioning": "string",
    "budget_range": "string — micro | low | medium | high | tent-pole. Infer from: location count, period/era, VFX complexity, cast size, action density. Use null if script provides insufficient signal.",
    "project_status": "string — default 'pre-production' for reverse-engineered pipelines. Use null if script provides a signal suggesting otherwise (e.g., 'in-development', 'script-completed').",
    "audience_age_range": "string — derive from genre norms and content rating signals. Use null if insufficient signal.",
    "audience_breakdown": {"male": "string — percentage", "female": "string — percentage"}
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

Respond with ONLY JSON.`, 16000);

    updateStage(payload, "synthesise", "done");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    // Debug: log the raw genre/subgenre/tone from synthesis stage so we can see exactly what the LLM returned
    console.log("[reverse-engineer] call1 genre =", (call1 as any)?.metadata?.genre, "| subgenre =", (call1 as any)?.metadata?.subgenre, "| tone =", (call1 as any)?.metadata?.tone);
    // Debug: log market_sheet fields so we can see what was inferred vs left null
    const ms = (call1 as any)?.market_sheet || {};
    console.log("[reverse-engineer] market_sheet: tagline =", ms.tagline, "| budget_range =", ms.budget_range, "| project_status =", ms.project_status, "| comparable_titles =", ms.comparable_titles, "| audience_age_range =", ms.audience_age_range);

    // ── Stage 4.5: Idea document ─────────────────────────────────────────────
    const { metadata } = call1;

    // Build source citations here so all downstream stages can use them
    const scriptTitle = metadata.title || "Script";
    const allLinesStart = lineRanges[0]?.startLine ?? 1;
    const allLinesEnd   = lineRanges[lineRanges.length - 1]?.endLine ?? script_text.split("\n").length;
    const allChunksCitation = scriptTitle + ", lines " + allLinesStart + "–" + allLinesEnd;
    const chunkCitations = lineRanges.map((r: any, i: number) => scriptTitle + ", lines " + r.startLine + "–" + r.endLine + " (part " + (i + 1) + ")");
    const beatScriptLineEnd = script_text.slice(0, 80000).split("\n").length;
    const partialCitation   = scriptTitle + ", lines 1–" + beatScriptLineEnd;

    updateStage(payload, "idea", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    // Fetch project resolver hash so Idea version stays in sync with project state
    const { data: projRow } = await sb.from("projects").select("resolved_qualifications_hash").eq("id", project_id).single();
    const ideaResolverHash = projRow?.resolved_qualifications_hash || undefined;

    // Dedicated idea call: full synthesis + script voice excerpt
    const ideaScriptExcerpt = script_text.slice(0, 2000);
    const callIdea = await callLLM(`Given the full synthesis and script opening, write the creative seed document.

The logline must be 1-2 sentences that hook immediately — it should make someone want to see this story.
Genre, subgenre, tone, themes, and target_audience must all be consistent with each other.

Return ONLY valid JSON:
{
  "title": "string",
  "logline": "string — 1-2 sentence hook that sells the story",
  "genre": "string",
  "subgenre": "string or null",
  "tone": "string",
  "themes": ["string"],
  "target_audience": "string"
}

PRIMARY CONTEXT — FULL SCRIPT ANALYSIS (all characters, events, locations, themes from all chunks):
${synthSummary}

SUPPLEMENTARY — SCRIPT OPENING (for voice/tone check):
${ideaScriptExcerpt}

Respond with ONLY JSON.`, 14000);

    const ideaData = typeof callIdea === "object" ? { ...callIdea } : {
      title: metadata.title || "Untitled",
      logline: metadata.logline || "",
      genre: metadata.genre || null,
      subgenre: metadata.subgenre || null,
      tone: metadata.tone || null,
      themes: metadata.themes || [],
      target_audience: metadata.target_audience || null,
    };
    await storeDoc(sb, project_id, script_document_id, user_id, "idea", "creative_primary",
      (ideaData.title || metadata.title || "Script") + " — Idea",
      ideaData,
      { source_citations: [allChunksCitation, ...chunkCitations] },
      ideaResolverHash
    );
    updateStage(payload, "idea", "done");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    // ── Stage 5: Beat sheet (use full script head + synthesis) ──────────────
    updateStage(payload, "beat_sheet", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    // Synthesis-first context: synthSummary covers all 3 chunks completely.
    // Raw script excerpt kept as supplementary reference for style/voice only.
    const beatScript = script_text.slice(0, 15000);
    const call2 = await callLLM(`Extract a beat sheet from this ${format} script. Use the full structural arc.

IMPORTANT — beat naming:
- Each beat "name" must be a SHORT, EVOCATIVE DESCRIPTIVE TITLE (1-6 words)
- Use the ACTUAL CHARACTER NAMES from the cast list below
- NEVER use "Character 1", "Character 2", "Protagonist", "MC", or placeholder labels
- Good names: "The Discovery", "Amara's Betrayal", "First Contact", "Point of No Return", "The Reckoning"
- Bad names: "Character 1 Arrives", "Protagonist meets someone", "MC does something"

Return ONLY valid JSON:
{
  "title": "string",
  "total_beats": N,
  "beats": [
    {
      "number": 1,
      "name": "string — short evocative title for this beat (1-6 words, use real character names)",
      "page_range": "string",
      "act_affiliation": "string — Act 1, Act 2A, Act 2B, Act 3, or Act 4 (which act this beat belongs to)",
      "description": "string — full description of what happens in this beat",
      "emotional_shift": "string",
      "protagonist_state": "string",
      "turning_point": "string — is this a structural turning point? If yes, name it (e.g. \"inciting incident\", \"midpoint\", \"climax\", \"second turning point\"). If no, use empty string.",
      "dramatic_function": "string — short functional label for this beat within its act (e.g. \"inciting incident\", \"break into two\", \"midpoint reversal\", \"all is lost\", \"climax\", \"finale\")"
    }
  ],
  "structural_notes": "string",
  "pacing_notes": "string",
  "turning_points": [{"page": "string", "description": "string"}]
}

PRIMARY CONTEXT — FULL SCRIPT ANALYSIS (covers entire story, all chunks):
${synthSummary}

SUPPLEMENTARY — SCRIPT EXCERPT (for style/voice reference):
${beatScript}

Respond with ONLY JSON.`, 14000);

    // ── Stage 6: Story outline (dedicated call — not a beat_sheet slice) ───
    updateStage(payload, "story_outline", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    const beatStructuralLabels = (call2 as any).beats
      ? (call2 as any).beats.map((b: any) => {
          const act = (b.act_affiliation || "").toLowerCase();
          const fn = (b.dramatic_function || "").toLowerCase();
          const actLabel = act || (fn.includes('actbreak') || b.number <= 3 ? 'Act 1' :
                            fn.includes('midpoint') ? 'Midpoint' :
                            fn.includes('climax') || fn.includes('finale') ? 'Finale' : 'Act 2');
          return `Beat ${b.number} [${actLabel}]`;
        }).join("\n")
      : "";
    const callStoryOutline = await callLLM(`Given the full story arc (synthSummary) and structural beat labels, produce an abbreviated story sequence.

RULES:
- Each entry: number, title (a short structural label), and description (1-2 sentences of narrative prose)
- Descriptions must ADVANCE the story arc from the previous entry — they are sequential narrative prose, not paraphrased beat summaries
- Do NOT repeat in the description what the title/label says. The description moves the story forward.
- A reader should understand the full story arc from the sequence of descriptions alone.

Return ONLY valid JSON:
{
  "title": "string",
  "format": "string",
  "entries": [
    { "number": 1, "title": "string — short structural label (e.g. Act 1 Opening, Midpoint, Act 2 Turn)", "description": "string — 1-2 sentences, sequential narrative prose that advances the arc" }
  ]
}

PRIMARY CONTEXT — FULL STORY ARC (characters, locations, events, themes, tonal beats):
${synthSummary}

STRUCTURAL BEAT MARKERS:
${beatStructuralLabels}

Respond with ONLY JSON.`, 14000);

    updateStage(payload, "story_outline", "done");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    // ── Stage 7: Character bible ─────────────────────────────────────────────
    updateStage(payload, "character_bible", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    // Synthesis-first: synthSummary is complete across all chunks. Script excerpt for style only.
    const charScript = script_text.slice(0, 15000);
    const call3 = await callLLM(`Write a complete character bible for this ${format} script.

CRITICAL ORDERING RULE: Characters array MUST be ordered by narrative importance — protagonist(s) first, then antagonist(s), then supporting roles in descending order of screen time and story weight, then recurring/minor roles last. NEVER alphabetical order.

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

PRIMARY CONTEXT — FULL SCRIPT ANALYSIS (covers all characters from all script chunks):
${synthSummary}

SUPPLEMENTARY — SCRIPT EXCERPT (for character voice/style reference only):
${charScript}

Respond with ONLY JSON.`, 14000);

    // ── Stage 6.5: Treatment synthesis ──────────────────────────────────────
    updateStage(payload, "treatment", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    const premise      = (call1.concept_brief as any)?.premise || "";
    const worldNotes  = (call1.concept_brief as any)?.world_building_notes || "";
    const protagonist = (call3 as any)?.characters?.[0]?.name || "The protagonist";
    const beats       = (call2 as any).beats || [];

    // Full beat descriptions — no truncation, all beats
    const allBeatDescriptions = beats.map((b: any) =>
      `Beat ${b.number} [${b.name}]: ${b.description || ""}`
    ).join("\n");

    const callTreatment = await callLLM(`You are writing descriptive narrative prose for a feature film production.
This prose will be used as a foundational corpus for AI image and video generation.
It must capture the sensory and emotional texture of each scene — not just the plot events.

STRUCTURE: 3-4 acts. Use a fourth act if the story has a dedicated confrontation/climax section that needs more space than a single act break can accommodate. Act breaks fall at: Act 1 ends at first turning point, Act 2 ends at midpoint, Act 3 ends at second turning point. If the confrontation section is distinct enough to need its own act, label it Act 4.
FORMAT: Flowing prose narrative — NOT a beat list, NOT entries with titles and descriptions.
The reader should experience the story, not read a structural outline.

PER ACT:
Act 1 — Setup. Establish the world, the characters, the central tension.
Act 2 — Complication. Escalation, turning points, growing stakes.
Act 3 — Resolution. Climax and denouement.

FOR EACH SCENE/MOMENT, WRITE WITH:
- Atmospheric specificity: What does this location actually look/sound/smell feel like?
  (Not "the mine" — the specific cold, the ancient carved walls, the way torchlight catches the stone face)
- Character interiority in motion: How does this character feel and behave in this moment?
  (Not "Bill is angry" — the controlled stillness before he speaks, the way he holds his left hand still)
- Emotional texture: What is the felt experience of this beat?
  (Not "tense" — the particular quality of silence when the stone dust settles)

AVOID:
- Plot summary language ("He discovers...", "She realizes...")
- Beat catalogue structure with titles and descriptions
- Generic sensory descriptors (not "dark and scary" — what's specifically dark and scary here?)
- Emotional shorthand (not "tense" or "dramatic" — what does it feel like exactly?)

REMEMBER:
- This prose will be read by AI systems to understand the visual and emotional world of the story
- Specificity is everything. "Ancient carved walls with torchlight catching the stone" creates AI consistency. "The dark mine" creates generic AI.
- Character voice in the prose should match their established psychology
- Act breaks should match the beat_sheet exactly

Return valid JSON:
{
  "title": "string",
  "treatment": "string — full prose narrative, paragraphs per act, no structure markers except act transitions",
  "act_breaks": [{"act_number": 1, "description": "string"}]
}

PRIMARY CONTEXT — FULL BEAT DESCRIPTIONS (all beats, complete arc):
${allBeatDescriptions}

PRIMARY CONTEXT — FULL SCRIPT ANALYSIS (all characters, locations, events, themes from all chunks):
${synthSummary}

CHARACTER ROSTER:
${(call3 as any)?.characters?.map((c: any) => `${c.name} (${c.role}): ${c.backstory?.slice(0, 200)}`).join('\n') || protagonist}

SOURCE:
LOGLINE: ${metadata.logline}
PREMISE: ${premise}
WORLD NOTES: ${worldNotes}

Respond with ONLY JSON.`, 12000);

    updateStage(payload, "treatment", "done");

    // ── Stage 8: Market sheet (dedicated call — not embedded in call1) ────
    updateStage(payload, "market_sheet", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    const marketCallInput = {
      concept_brief: call1.concept_brief || {},
      structural: {
        total_beats: (call2 as any).total_beats || 0,
        locations_count: allLocations.length,
        characters_count: mergedCharacters.length,
        tone_notes: toneNotes,
      },
      format,
    };

    const callMarketSheet = await callLLM(`Given the concept brief and structural analysis, produce the commercial context document.

RULES:
- Comparable titles must be genuinely comparable — tone + subject matter + target demographic, not obvious defaults
- Budget range must be derived from structural analysis: location count, period/era, VFX complexity, cast size, action density
  - If beat_sheet has 14+ locations across multiple countries + period setting + VFX creatures → budget_range cannot be micro
  - If beat_sheet is confined locations + minimal cast + contemporary → low or micro possible
- Audience age range and gender breakdown must be consistent with genre norms and comparable titles
- Tagline: one-line hook summing core appeal, derive from tone + premise
- Market positioning: specific placement, not generic

Return ONLY valid JSON:
{
  "tagline": "string — one-line hook (derive from tone + premise)",
  "comparable_titles": ["string"],
  "market_positioning": "string",
  "budget_range": "string — micro | low | medium | high | tent-pole (derived from structural analysis)",
  "audience_age_range": "string",
  "audience_breakdown": {"male": "string", "female": "string"}
}

INPUT:
${JSON.stringify(marketCallInput, null, 2)}

Respond with ONLY JSON.`, 8000);

    updateStage(payload, "market_sheet", "done");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    // ── Store documents ────────────────────────────────────────────────────
    updateStage(payload, "storing_docs", "running");
    await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

    const isTV = format === "tv-series";

    await storeDoc(sb, project_id, script_document_id, user_id, "concept_brief", "creative_primary",
      `${metadata.title} — Concept Brief`,
      { title: metadata.title, logline: metadata.logline, genre: metadata.genre, subgenre: metadata.subgenre, tone: metadata.tone, themes: metadata.themes || [], target_audience: metadata.target_audience, ...call1.concept_brief },
      { source_citations: [allChunksCitation, ...chunkCitations] });

    const marketType = isTV ? "vertical_market_sheet" : "market_sheet";
    // callMarketSheet is the dedicated call — run after beat_sheet has structural metadata
    const marketSheetData = typeof callMarketSheet === "object" ? { ...(call1.market_sheet || {}), ...callMarketSheet } : (call1.market_sheet || {});
    await storeDoc(sb, project_id, script_document_id, user_id, marketType, "creative_primary",
      `${metadata.title} — Market Sheet`,
      { title: metadata.title, logline: metadata.logline, genre: metadata.genre, format, ...marketSheetData });

    const arcType = isTV ? "season_arc" : "treatment";
    // Store callTreatment response directly — FormattedDocContent knows how to render:
    //   treatment: string  → prose narrative
    //   act_breaks: array → "Act 1", "Act 2" etc. via dedicated renderer
    //   treatment_narrative (legacy) → treated as prose string by generic handler
    await storeDoc(sb, project_id, script_document_id, user_id, arcType, "creative_primary",
      `${metadata.title} — ${isTV ? "Season Arc" : "Treatment"}`,
      typeof callTreatment === "string" ? { treatment: callTreatment } : callTreatment,
      { source_citations: [partialCitation] });

    const beatType = isTV ? "format_rules" : "beat_sheet";
    await storeDoc(sb, project_id, script_document_id, user_id, beatType, "creative_primary",
      `${metadata.title} — Beat Sheet`, call2,
      { source_citations: [partialCitation] });

    await storeDoc(sb, project_id, script_document_id, user_id, "character_bible", "creative_primary",
      `${metadata.title} — Character Bible`, call3,
      { source_citations: [partialCitation] });

    const outlineType = isTV ? "episode_grid" : "story_outline";
    await storeDoc(sb, project_id, script_document_id, user_id, outlineType, "creative_primary",
      `${metadata.title} — Story Outline`,
      typeof callStoryOutline === "object" ? callStoryOutline : { title: metadata.title, format, entries: [] });

    // Write all extracted canonical fields back to canon_json so downstream drift detection is accurate
    try {
      const canonUpdate = {
        title: metadata.title,
        logline: (call1 as any)?.metadata?.logline || null,
        format: (call1 as any)?.metadata?.format || format,
        genre: (call1 as any)?.metadata?.genre || null,
        subgenre: (call1 as any)?.metadata?.subgenre || null,
        tone: (call1 as any)?.metadata?.tone || null,
        themes: (call1 as any)?.metadata?.themes || [],
        target_audience: (call1 as any)?.metadata?.target_audience || null,
        premise: (call1 as any)?.concept_brief?.premise || null,
        voice_profile: (call1 as any)?.voice_profile || null,
        characters: (call3 as any)?.characters || [],
      };
      const { data: canon } = await sb.from("project_canon").select("project_id, canon_json").eq("project_id", project_id).maybeSingle();
      if (canon) {
        await sb.from("project_canon").update({ canon_json: { ...(canon.canon_json || {}), ...canonUpdate } }).eq("project_id", project_id);
      } else {
        await sb.from("project_canon").insert({ project_id, canon_json: canonUpdate });
      }
    } catch (canonErr) {
      console.warn("[reverse-engineer] canon_json write failed (non-fatal):", canonErr);
    }

    // ── Stage 7: Infer remaining criteria from beats + characters ─────────────────────

    // ── Cleanup: delete seed versions so user only sees reverse-engineered content ──
    try {
      const { data: seedVersions } = await sb
        .from("project_document_versions")
        .select("id, document_id")
        .eq("label", "initial_baseline_seed")
        .in("document_id", await sb.from("project_documents").select("id").eq("project_id", project_id).then((r: any) => r.data.map((d: any) => d.id)));
      if (seedVersions?.length) {
        const seedIds = seedVersions.map((v: any) => v.id);
        // Clear latest_version_id refs pointing to deleted seed versions
        await sb.from("project_documents")
          .update({ latest_version_id: null })
          .in("id", seedVersions.map((v: any) => v.document_id));
        // Delete the seed versions
        await sb.from("project_document_versions").delete().in("id", seedIds);
        // Point each doc back to its remaining (reverse-engineered) version
        const { data: remaining } = await sb
          .from("project_document_versions")
          .select("id, document_id")
          .eq("label", "v1 (reverse-engineered)")
          .in("document_id", seedVersions.map((v: any) => v.document_id));
        if (remaining?.length) {
          for (const v of remaining) {
            await sb.from("project_documents").update({ latest_version_id: v.id }).eq("id", v.document_id);
          }
        }
        console.log(`[reverse-engineer] cleaned up ${seedVersions.length} seed versions`);
      }
    } catch (cleanupErr) {
      console.warn("[reverse-engineer] seed version cleanup failed (non-fatal):", cleanupErr);
    }

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
    payload.result = { title: metadata.title, documents_created: ["idea", "concept_brief", marketType, arcType, beatType, "character_bible", outlineType] };

  } catch (err: any) {
    console.error("[reverse-engineer] background error:", err?.message);
    payload.status = "error";
    payload.error = err?.message;
    payload.updated_at = new Date().toISOString();
  }

  await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);
}

// ─── Main handler ────────────────────────────────────────────────────────────
console.log("[reverse-engineer] HANDLER START", new Date().toISOString());
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Background trigger (from cron or self-dispatch) ──────────────────────
  if (body._bg && body._job_id) {
    await runBackgroundJob(body);
    return new Response(JSON.stringify({ ok: true, job_id: body._job_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── UI trigger: create job, dispatch via BG, return immediately ─────────────
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

    // Dispatch to background via EdgeRuntime.waitUntil so the response returns immediately
    const bgPayload = JSON.stringify({ _bg: true, _job_id: jobId, project_id, script_document_id, user_id, script_text: scriptText, format });
    const bgHeaders = new Headers({ "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` });
    const bgWork = fetch(`${SUPABASE_URL}/functions/v1/reverse-engineer-script`, {
      method: "POST", headers: bgHeaders, body: bgPayload,
    }).catch(err => console.error("[reverse-engineer] bg dispatch error:", err));
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
