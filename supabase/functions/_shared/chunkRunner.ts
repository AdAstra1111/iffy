/**
 * Chunk Runner — Orchestrates chunked generation, DB storage, assembly.
 *
 * Responsible for:
 * 1. Upserting chunk plan entries in project_document_chunks (preserving existing)
 * 2. Generating each chunk via LLM
 * 3. Validating each chunk
 * 4. Assembly repair loop (regen only missing/failed chunks)
 * 5. Storing assembled result in project_document_versions
 *
 * Used by: generate-document, dev-engine-v2, auto-run.
 */

import { resolveGateway } from "./llm.ts";
import { type ChunkPlan, type ChunkPlanEntry, chunkPlanFor, isEpisodicDocType } from "./largeRiskRouter.ts";
import { validateEpisodicChunk, validateEpisodicContent, validateSectionedContent, validateBeatSequentialChunk, hasBannedSummarizationLanguage, hasScreenplayFormat } from "./chunkValidator.ts";

// ── Types ──

export interface ChunkRunnerOptions {
  supabase: any;
  apiKey: string;
  gatewayUrl?: string; // If omitted, resolves from env via resolveGateway()
  projectId: string;
  documentId: string;
  versionId: string;
  docType: string;
  plan: ChunkPlan;
  systemPrompt: string;
  upstreamContent: string;
  projectTitle: string;
  additionalContext?: string;
  model?: string;
  maxChunkRepairs?: number;
  episodeCount?: number;
  requestId?: string;
  projectFormat?: string;
}

export interface ChunkRunResult {
  success: boolean;
  assembledContent: string;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  validationResult: any;
  assembledFromChunks: boolean;
}

// ── Constants ──

const GATEWAY_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_ASSEMBLY_REPAIR_PASSES = 2;
const CHUNK_LLM_TIMEOUT_MS = 180_000; // 3 minutes per chunk LLM call
const STALE_RUNNING_THRESHOLD_MS = 120_000; // 2 minutes — running chunk considered stale

/**
 * Pattern used in assembled text when a chunk fails generation.
 * Exported for fail-closed guards: callers MUST check for this before
 * promoting assembled content to is_current.
 */
export const FAILED_CHUNK_PLACEHOLDER_RE = /\[SECTION \d+ GENERATION FAILED/;

/**
 * Returns true if assembled text contains one or more failed-chunk placeholders.
 * Callers should refuse to promote such content to is_current.
 */
export function containsFailedPlaceholders(text: string): boolean {
  return FAILED_CHUNK_PLACEHOLDER_RE.test(text);
}

// ── Token budgets per strategy/docType ──

function maxTokensForChunk(strategy: string, docType: string): number {
  if (strategy === "episodic_indexed") return 16000;
  if (strategy === "beat_sequential") return 8000;
  if (docType.includes("script") || docType === "screenplay_draft" || docType === "production_draft") return 32000;
  if (docType.includes("treatment")) return 24000;
  return 16000;
}

// ── LLM Gateway ──

async function callChunkLLM(
  apiKey: string,
  gatewayUrl: string,
  system: string,
  user: string,
  model: string = "google/gemini-2.5-flash",
  maxTokens: number = 16000
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error(`LLM call timed out after ${CHUNK_LLM_TIMEOUT_MS/1000}s`)), CHUNK_LLM_TIMEOUT_MS);
  try {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.5,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`Chunk LLM call failed (${res.status}): ${errText.slice(0, 500)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Chunk LLM call timed out after ${CHUNK_LLM_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }
}

// ── Chunk Plan Initialization (UPSERT, preserving existing) ──

async function initializeChunks(
  supabase: any,
  documentId: string,
  versionId: string,
  plan: ChunkPlan
): Promise<void> {
  // Load existing chunks for this version
  const { data: existing } = await supabase
    .from("project_document_chunks")
    .select("chunk_index, status, content")
    .eq("document_id", documentId)
    .eq("version_id", versionId);

  const existingMap = new Map((existing || []).map((c: any) => [c.chunk_index, c]));

  // Only insert chunks that don't already exist
  const newRows = plan.chunks
    .filter(chunk => !existingMap.has(chunk.chunkIndex))
    .map(chunk => ({
      document_id: documentId,
      version_id: versionId,
      chunk_index: chunk.chunkIndex,
      chunk_key: chunk.chunkKey,
      status: "pending",
      attempts: 0,
      meta_json: {
        label: chunk.label,
        episodeStart: chunk.episodeStart,
        episodeEnd: chunk.episodeEnd,
        sectionId: chunk.sectionId,
        strategy: plan.strategy,
      },
    }));

  if (newRows.length > 0) {
    const { error } = await supabase
      .from("project_document_chunks")
      .insert(newRows);

    if (error) {
      console.error("[chunkRunner] Failed to initialize chunks:", error);
      throw new Error(`Failed to initialize chunks: ${error.message}`);
    }
  }

  console.log(`[chunkRunner] initializeChunks: ${newRows.length} new, ${existingMap.size} preserved`);
}

// ── Single Chunk Generation ──

async function generateSingleChunk(
  opts: ChunkRunnerOptions,
  chunk: ChunkPlanEntry,
  previousChunkEnding?: string
): Promise<string> {
  const { apiKey, gatewayUrl, upstreamContent, projectTitle, docType, additionalContext, model, plan } = opts;
  let systemPrompt = opts.systemPrompt;
  const tokenBudget = maxTokensForChunk(plan.strategy, docType);

  let chunkPrompt: string;

  if (plan.strategy === "episodic_indexed") {
    const isSingleEpisodeUnit = chunk.episodeStart != null && chunk.episodeEnd != null && chunk.episodeStart === chunk.episodeEnd;
    const epRange = isSingleEpisodeUnit
      ? `Episode ${chunk.episodeStart}`
      : `Episodes ${chunk.episodeStart}–${chunk.episodeEnd}`;
    const episodeCountLabel = isSingleEpisodeUnit
      ? `Episode ${chunk.episodeStart} of ${plan.totalChunks}`
      : epRange;
    chunkPrompt = `You are generating ${episodeCountLabel} for the project "${projectTitle}".
Document type: ${docType.replace(/_/g, " ")}

CRITICAL RULES:
- Output ONLY ${epRange}. Do NOT output episodes outside this range.
- Each episode MUST have its own heading: "## EPISODE N" or "**EPISODE N**"
- Do NOT summarize, compress, or skip any episode.
- Do NOT use phrases like "remaining episodes follow similar pattern" or "etc."
- Every episode in the requested unit must be fully developed.

${additionalContext ? `CREATIVE DIRECTION:\n${additionalContext}\n` : ""}
${previousChunkEnding ? `PREVIOUS EPISODE ENDING (for continuity):\n...${previousChunkEnding}\n` : ""}
UPSTREAM CONTEXT:
${upstreamContent}

Generate ${epRange} now. Full content only.`;
  } else if (plan.strategy === "sectioned") {
    const sectionLabel = chunk.label;

    // ── Per-section length targets for all sectioned doc types ─────────────
    // Without explicit targets the model defaults to a "complete" but short
    // section. These targets enforce minimum output for every doc type that
    // goes through the sectioned chunk strategy. No document should ever be
    // shortened — if a section is worth generating, it is worth generating in full.
    const sectionKey = chunk.sectionId || chunk.chunkKey;
    let lengthGuidance = "";

    // ── Feature-length screenplay types ──────────────────────────────────────
    if (["feature_script", "production_draft", "screenplay_draft"].includes(docType)) {
      const PER_ACT_TARGETS: Record<string, string> = {
        "act_1":  "25–30 pages (approximately 6,000–7,500 words). Opens the world, establishes protagonist + goal, lands the Inciting Incident, ends with the Break Into Two.",
        "act_2a": "28–32 pages (approximately 7,000–8,000 words). Rising action, B Story launch, Fun & Games / Promise of the Premise section, builds to Midpoint.",
        "act_2b": "28–32 pages (approximately 7,000–8,000 words). Bad Guys Close In, All Is Lost, Dark Night of the Soul, ends at the Break Into Three.",
        "act_3":  "22–28 pages (approximately 5,500–7,000 words). Finale, climax, resolution, final image.",
      };
      const actTarget = PER_ACT_TARGETS[sectionKey] ?? "25–30 pages (approximately 6,000–7,500 words)";
      lengthGuidance = `
FEATURE SCREENPLAY LENGTH — MANDATORY:
- A feature film screenplay is 95–115 pages (approximately 24,000–28,000 words total across all 4 acts).
- This act (${sectionLabel}) must reach: ${actTarget}
- Write EVERY scene in FULL: INT./EXT. slugline, action paragraph(s), complete dialogue.
- Do NOT compress, summarise, or skip any scene.
- Do NOT stop writing until you have reached the page/word target above.
- Every scene in the story outline or beat sheet is important enough to be written in full here.
`;

    // ── Treatment (standard) ─────────────────────────────────────────────────
    } else if (docType === "treatment") {
      const PER_ACT_TARGETS: Record<string, string> = {
        "act_1_setup":           "3–5 pages (approximately 750–1,250 words). Introduce the world, protagonist, ordinary life, and the inciting incident that disrupts everything.",
        "act_2a_rising_action":  "4–6 pages (approximately 1,000–1,500 words). Protagonist commits to the journey. Rising stakes, early obstacles, key relationships forged or strained.",
        "act_2b_complications":  "4–6 pages (approximately 1,000–1,500 words). Complications escalate. Midpoint turn, reversals, the protagonist pushed to their limit. Dark night of the soul.",
        "act_3_climax_resolution": "3–5 pages (approximately 750–1,250 words). Climax, final confrontation, resolution. Thematic statement landed. Closing image.",
      };
      const actTarget = PER_ACT_TARGETS[sectionKey] ?? "4–6 pages (approximately 1,000–1,500 words)";
      lengthGuidance = `
TREATMENT LENGTH — MANDATORY:
- A feature film treatment is 14–22 pages (approximately 3,500–5,500 words total across all 4 sections).
- This section (${sectionLabel}) must reach: ${actTarget}
- Write in vivid present-tense prose. Describe scenes, action, and emotional beats — not summaries.
- Do NOT compress or skip story beats. Every beat in the outline belongs in the treatment.
- Do NOT stop writing until you have reached the word target above.
`;

    // ── Long treatment ───────────────────────────────────────────────────────
    } else if (docType === "long_treatment") {
      const PER_ACT_TARGETS: Record<string, string> = {
        "act_1_setup":           "6–10 pages (approximately 1,500–2,500 words). Full establishment of world, protagonist psychology, stakes, and inciting incident with scene-level texture.",
        "act_2a_rising_action":  "8–12 pages (approximately 2,000–3,000 words). Scene-level rising action, key set-pieces, relationship dynamics, midpoint build.",
        "act_2b_complications":  "8–12 pages (approximately 2,000–3,000 words). Full complications, reversals, midpoint consequence, all-is-lost sequence.",
        "act_3_climax_resolution": "6–10 pages (approximately 1,500–2,500 words). Full climax sequence, resolution, thematic close, final image.",
      };
      const actTarget = PER_ACT_TARGETS[sectionKey] ?? "8–12 pages (approximately 2,000–3,000 words)";
      lengthGuidance = `
LONG TREATMENT LENGTH — MANDATORY:
- A long treatment is 28–44 pages (approximately 7,000–11,000 words total across all 4 sections).
- This section (${sectionLabel}) must reach: ${actTarget}
- Write in vivid present-tense prose with full scene-level texture. Not a summary — a reading experience.
- Every scene, set-piece, and emotional beat must be rendered in full.
- Do NOT compress or skip. Do NOT stop writing until you have reached the word target above.
`;

    // ── Story Outline ────────────────────────────────────────────────────────
    } else if (docType === "story_outline") {
      const PER_ACT_TARGETS: Record<string, string> = {
        "act_1_setup":              "5–8 JSON entries (approximately 800–1,500 words). Each entry: 3-5 sentence description covering dramatic purpose and emotional shift. Covers world establishment through inciting incident to end of Act 1.",
        "act_2a_rising_action":     "5–8 JSON entries (approximately 800–1,500 words). Rising action, B story introduction, Fun & Games section, build to Midpoint. Each entry fully described.",
        "act_2b_complications":     "5–8 JSON entries (approximately 800–1,500 words). Post-midpoint complications, All Is Lost, Dark Night of the Soul. Every entry fully described.",
        "act_3_climax_resolution":  "5–8 JSON entries (approximately 600–1,200 words). Break Into Three, finale sequence, climax, resolution, final image. Every entry fully described.",
      };
      const actTarget = PER_ACT_TARGETS[sectionKey] ?? "5\u20138 JSON entries (approximately 800\u20131,500 words)";
      lengthGuidance = `
STORY OUTLINE LENGTH \u2014 MANDATORY:
- A feature film story outline is 25\u201332 entries (approximately 3,000\u20135,500 words total across all 4 acts).
- This act (${sectionLabel}) must contain: ${actTarget}
- Each entry is one {"number", "title", "description"} object in the "entries" JSON array. Description: 3\u20135 sentences covering what happens, dramatic purpose, and emotional shift.
- Do NOT use sluglines, character cues, or dialogue formatting.
- Do NOT summarise multiple moments into one entry. Every moment is its own entry.
- Do NOT stop writing until you have reached the entry count target above.
`;

    // ── Beat Sheet ───────────────────────────────────────────────────────────
    } else if (docType === "beat_sheet") {
      const PER_ACT_TARGETS: Record<string, string> = {
        "act_1_beats":  "10–14 named beats (approximately 900–1,400 words). Opening Image through Break Into Two. Each beat: name, 2–3 sentence description, page number, emotional/dramatic function.",
        "act_2a_beats": "10–14 named beats (approximately 900–1,400 words). B Story through Midpoint. Each beat fully described.",
        "act_2b_beats": "10–14 named beats (approximately 900–1,400 words). Bad Guys Close In through Dark Night of the Soul. Each beat fully described.",
        "act_3_beats":  "8–12 named beats (approximately 700–1,100 words). Break Into Three through Final Image. Each beat fully described.",
      };
      const actTarget = PER_ACT_TARGETS[sectionKey] ?? "10–14 named beats (approximately 900–1,400 words)";
      // Section header label written into the LLM output so it appears in the assembled beat sheet
      const BEAT_SHEET_ACT_HEADERS: Record<string, string> = {
        "act_1_beats":  "## Act 1: Setup — Beats",
        "act_2a_beats": "## Act 2A: Rising Action — Beats",
        "act_2b_beats": "## Act 2B: Complications — Beats",
        "act_3_beats":  "## Act 3: Climax & Resolution — Beats",
      };
      const actHeader = BEAT_SHEET_ACT_HEADERS[sectionKey] ?? (`## ${sectionLabel}`);
      lengthGuidance = `
BEAT SHEET LENGTH — MANDATORY:
- A feature film beat sheet has 38–54 named beats (approximately 3,500–5,000 words total across all 4 acts).
- This act (${sectionLabel}) must contain: ${actTarget}
- Each beat MUST include: beat name (e.g. "Opening Image"), page number, 2–3 sentence description, dramatic/emotional function.
- Do NOT merge multiple beats into one. Do NOT skip beats to save space.
- Do NOT stop writing until you have reached the beat count and word target above.

IMPORTANT: Start your output with the section header "${actHeader}" on its own line, then write all beats below it.`;

    // ── Character Bible ──────────────────────────────────────────────────────
    } else if (docType === "character_bible" || docType === "long_character_bible") {
      const isLong = docType === "long_character_bible";
      const PER_SECTION_TARGETS: Record<string, string> = isLong ? {
        "protagonists":              "Minimum 800–1,200 words per protagonist. Cover: full backstory, psychology, wound, want vs need, voice, arc, relationships, contradictions.",
        "antagonists":               "Minimum 600–1,000 words per antagonist. Cover: motivation, ideology, relationship to protagonist, how they embody the theme's dark mirror.",
        "supporting_cast":           "Minimum 400–600 words per supporting character. Cover: role in story, relationship to protagonist, arc, distinct voice.",
        "relationships_and_dynamics": "Minimum 800–1,200 words total. Map all key relationships: power dynamics, history, how each relationship tests the protagonist's arc.",
      } : {
        "protagonists":              "Minimum 500–800 words per protagonist. Cover: backstory, psychology, want vs need, voice, arc.",
        "antagonists":               "Minimum 400–600 words per antagonist. Cover: motivation, relationship to protagonist, thematic role.",
        "supporting_cast":           "Minimum 250–400 words per supporting character. Cover: role, relationship to protagonist, distinct voice.",
        "relationships_and_dynamics": "Minimum 500–800 words total. Map key relationships and how they drive the story.",
      };
      const sectionTarget = PER_SECTION_TARGETS[sectionKey] ?? "Minimum 500 words per character. Full profiles — do not truncate.";
      lengthGuidance = `
CHARACTER BIBLE LENGTH — MANDATORY:
- Every character profile must be COMPLETE. Do NOT truncate or summarise any character.
- This section (${sectionLabel}): ${sectionTarget}
- For each character: write the FULL profile to the word target. A short entry means a shortchanged character.
- Do NOT use placeholder text, bullet-point stubs, or "see above" references.
- Do NOT stop writing until EVERY character in this section has a complete profile.
`;
    }

    // ── Format reinforcement for production_draft chunks ────────────────────
    let formatReinforcement = "";
    if (docType === "production_draft") {
      const fmt = (opts as any).projectFormat || "";
      const fmtLower = fmt.toLowerCase();
      const isSeriesFmt = ["tv-series","limited-series","digital-series","anim-series","reality"].includes(fmtLower);
      const isVDFmt = fmtLower.includes("vertical");
      if (!isSeriesFmt && !isVDFmt) {
        formatReinforcement = `
FORMAT LOCK — FEATURE FILM:
- This is a SINGLE CONTINUOUS FEATURE SCREENPLAY — NOT episodic, NOT a season script.
- Do NOT use Episode headings, episode numbers, or any episodic structure.
- Write standard feature film screenplay format: continuous narrative, Act 1/2/3 structure.
`;
      }
    }

    chunkPrompt = `You are generating the "${sectionLabel}" section for the project "${projectTitle}".
Document type: ${docType.replace(/_/g, " ")}
${lengthGuidance}${formatReinforcement}
CRITICAL RULES:
- Output ONLY the "${sectionLabel}" section.
- Write full, complete content — do NOT summarize or abbreviate.
- Do NOT skip scenes, beats, or details.
- Maintain professional formatting appropriate for ${docType}.

${additionalContext ? `CREATIVE DIRECTION:\n${additionalContext}\n` : ""}
${previousChunkEnding ? `PREVIOUS SECTION ENDING (for continuity):\n...${previousChunkEnding}\n` : ""}
UPSTREAM CONTEXT:
${upstreamContent}

Generate the "${sectionLabel}" section now. Write to the full page target specified above.`;
  } else if (plan.strategy === "beat_sequential") {
    const beatNumber = chunk.chunkKey.replace("beat_", "");
    const beatLabel = chunk.label;
    chunkPrompt = `You are generating the beat screenplay segment for "${projectTitle}".
Document type: feature_script
Beat: ${beatLabel}

CRITICAL RULES:
- Generate ONLY the screenplay content for ${beatLabel}.
- Output MUST start with "## BEAT ${beatNumber}: " followed by the beat name from the beat sheet.
- Write full screenplay format: INT./EXT. sluglines, action paragraphs, character names, dialogue.
- Each beat typically has 2-4 scenes.
- Write COMPLETE scenes — do NOT summarize or abbreviate.
- Do NOT skip ahead to later beats. Output ONLY this beat's content.
- Maintain consistent character voice, tone, and story continuity.

|- Do NOT include meta-commentary, subtext tables, meaning shift sections, analytical/deconstructive text, or any material describing dramatic function. Output ONLY screenplay content — no tables, bullet points, or analysis.
${additionalContext ? `CREATIVE DIRECTION:\n${additionalContext}\n` : ""}
${previousChunkEnding ? `PREVIOUS BEAT ENDING (for continuity):\n...${previousChunkEnding}\n` : ""}
UPSTREAM CONTEXT:
${upstreamContent}

Generate the screenplay content for ${beatLabel} now. Full screenplay format. Complete scenes.`;
  } else if (plan.strategy === "scene_indexed") {
    // ── scene_indexed: Generate screenplay from feature_script scene-by-scene ──
    // production_draft uses scene_indexed — expand feature_script scenes into
    // full feature screenplay format.

    // ── Format reinforcement for production_draft ──
    let formatReinforcement = "";
    if (docType === "production_draft") {
      const fmt = (opts as any).projectFormat || "";
      const fmtLower = fmt.toLowerCase();
      const isSeriesFmt = ["tv-series","limited-series","digital-series","anim-series","reality"].includes(fmtLower);
      const isVDFmt = fmtLower.includes("vertical");
      if (!isSeriesFmt && !isVDFmt) {
        formatReinforcement = `
FORMAT LOCK — FEATURE FILM:
- This is a SINGLE CONTINUOUS FEATURE SCREENPLAY — NOT episodic, NOT a season script.
- Do NOT use Episode headings, episode numbers, or any episodic structure.
- Write standard feature film screenplay format: continuous narrative, Act 1/2/3 structure.`;
      }
    }

    const sceneRangeKey = chunk.chunkKey;
    const sceneRangeLabel = chunk.label;
    chunkPrompt = `You are generating screenplay content for ${sceneRangeLabel} of "$${projectTitle}".
Document type: ${docType.replace(/_/g, " ")}
Strategy: Scene-by-scene expansion — writing full screenplay format for a contiguous batch of scenes.

${formatReinforcement ? formatReinforcement.trim() + "\n" : ""}CRITICAL RULES:
- Output ONLY screenplay content for ${sceneRangeLabel}.
- Write COMPLETE scenes: INT./EXT. slugline, action paragraphs, character names, dialogue.
- Each scene from the upstream feature_script must be expanded into full screenplay format.
|- Output SCENE N markers (SCENE 1, SCENE 2...) before each scene for consistent numbering across the assembled document.
- Do NOT compress, summarise, or skip any scene in this batch.
- Maintain consistent character voice, tone, and story continuity.
- Each scene must have its own slugline — do NOT merge adjacent scenes.
- Action lines should be descriptive and visual. Dialogue should reveal character and advance plot.
- Do NOT use placeholder text, "(CONTINUED)" markers, or transitional phrases like "we see".
|- Do NOT include meta-commentary, subtext tables, meaning shift sections, analytical/deconstructive text, or any material describing dramatic function. Output ONLY screenplay content — no tables, bullet points, or analysis.

${additionalContext ? `CREATIVE DIRECTION:\n${additionalContext}\n` : ""}
${previousChunkEnding ? `PREVIOUS SCENE BATCH ENDING (for continuity):\n...${previousChunkEnding}\n` : ""}
UPSTREAM CONTEXT (from feature_script):
${upstreamContent}

Generate the screenplay content for ${sceneRangeLabel} now. Full screenplay format. Complete scenes. Complete dialogue.`;
  } else {
    chunkPrompt = `Generate chunk ${chunk.chunkIndex + 1} (${chunk.label}) for "${projectTitle}".
${upstreamContent}`;
  }

  // ── Season script: one episode per chunk, plain-text screenplay ──────────
  // JSON transport is unreliable for screenplay content — quotes and colons in
  // dialogue break JSON parsers. Each chunk is one episode (batchSize=1),
  // generated as raw screenplay markdown and stored directly to DB.
  if (docType === "season_script" && chunk.episodeStart != null && chunk.episodeStart === chunk.episodeEnd) {
    const epNum = chunk.episodeStart;
    const totalEps = opts.episodeCount ?? epNum;
    const SEASON_SCRIPT_SYSTEM = `You are writing ONE EPISODE of a vertical drama screenplay.
Output ONLY the raw screenplay text — no JSON, no markdown code blocks, no preamble.

Format exactly:
## EPISODE [N]: [EPISODE TITLE]
*Duration: 120–180 seconds*

COLD OPEN
[Action line: scroll-stopping hook — 2-3 lines max]

SCENE 1 — [SCENE HEADING]
[Action line]
CHARACTER NAME
(parenthetical if needed)
Dialogue line.
[Action / reaction]
CHARACTER NAME
Dialogue line.

[Repeat for 2-4 more scenes]

EPISODE END
[Final image + micro-cliffhanger pulling viewer to next episode]

---

Rules:
- Use ONLY characters, story events, and locations from the upstream documents below
- Write REAL dialogue — character-specific, subtext-loaded, personality-revealing
- Every scene must have a clear dramatic function
- End on an unresolved micro-cliffhanger that pulls to the next episode
- 400–600 words of scripted content per episode
- Do NOT include character descriptions, beat summaries, or metadata`;
    const epPrompt = `Write Episode ${epNum} of ${totalEps} for "${projectTitle}".

UPSTREAM CONTEXT (episode beats, character bible, season arc — use these as canon):
${upstreamContent.slice(0, 9000)}

${previousChunkEnding ? `PREVIOUS EPISODE ENDING (for continuity):\n...${previousChunkEnding}\n\n` : ""}Write Episode ${epNum} now. Start directly with "## EPISODE ${epNum}:".`;
    const raw = await callChunkLLM(apiKey, gatewayUrl, SEASON_SCRIPT_SYSTEM, epPrompt, "google/gemini-2.5-pro", 4000);
    return raw.replace(/^```[\s\S]*?\n/, "").replace(/\n?```\s*$/, "").trim();
  }

  return await callChunkLLM(apiKey, gatewayUrl, systemPrompt, chunkPrompt, model || "google/gemini-2.5-flash", tokenBudget);
}

// ── Determine which chunks need (re)generation ──

function chunksNeedingGeneration(
  plan: ChunkPlan,
  existingMap: Map<number, any>
): ChunkPlanEntry[] {
  return plan.chunks.filter(c => {
    const existing = existingMap.get(c.chunkIndex);
    if (!existing) return true;
    // Include pending, failed, failed_validation, needs_regen
    if (["pending", "failed", "failed_validation", "needs_regen"].includes(existing.status)) return true;
    // Include stale running chunks (from crashed background tasks)
    if (existing.status === "running") {
      const updatedAt = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const age = Date.now() - updatedAt;
      if (age > STALE_RUNNING_THRESHOLD_MS) {
        console.warn(`[chunkRunner][IEL] stale_running_chunk: index=${c.chunkIndex} key=${c.chunkKey} age=${Math.round(age/1000)}s — will retry`);
        return true;
      }
      // Recently marked running — skip (another task is actively generating)
      return false;
    }
    return false;
  });
}

// ── Main Runner ──

export async function runChunkedGeneration(opts: ChunkRunnerOptions): Promise<ChunkRunResult> {
  const {
    supabase, documentId, versionId, plan, docType,
    maxChunkRepairs = 2, episodeCount, requestId,
  } = opts;

  // Resolve gateway URL if not explicitly provided — avoids hardcoded URL mismatch
  const resolvedGw = opts.gatewayUrl
    ? { url: opts.gatewayUrl }
    : (() => {
        try { return resolveGateway(); } catch { return { url: "https://openrouter.ai/api/v1/chat/completions" }; }
      })();
  const effectiveGatewayUrl = opts.gatewayUrl || resolvedGw.url;

  // Attach resolved URL back so generateSingleChunk gets it too
  const chunkOpts = { ...opts, gatewayUrl: effectiveGatewayUrl };

  const rid = requestId || crypto.randomUUID();
  console.log(`[chunkRunner] Starting: ${plan.totalChunks} chunks, strategy=${plan.strategy}, rid=${rid}`);

  // 1. Upsert chunk entries (preserving existing)
  await initializeChunks(supabase, documentId, versionId, plan);

  // 2. Load current chunk state
  const { data: existingChunks } = await supabase
    .from("project_document_chunks")
    .select("*")
    .eq("document_id", documentId)
    .eq("version_id", versionId)
    .order("chunk_index", { ascending: true });

  const chunkMap = new Map((existingChunks || []).map((c: any) => [c.chunk_index, c]));

  // Pre-fill content array from existing done chunks
  const chunkContents: string[] = new Array(plan.totalChunks).fill("");
  for (const [idx, row] of chunkMap.entries()) {
    const r = row as any;
    if (r.status === "done" && r.content) {
      chunkContents[idx] = r.content;
    }
  }

  // 3. Generate only chunks that need it
  const toGenerate = chunksNeedingGeneration(plan, chunkMap);
  let completedChunks = plan.totalChunks - toGenerate.length;
  let failedChunks = 0;

  for (const chunk of toGenerate) {
    // FIX (trinity-2026-05-03-generate-2a2b-dropped-fix — Bug 1):
    // For sectioned strategy (Treatment, Beat Sheet, etc.), DO NOT pass the previous
    // chunk's narrative ending as continuity context. Each act is a standalone
    // structural contract — NOT a continuation of the previous act.
    //
    // The bug: upstreamContent (global treatment context) + previousEnding (Act 1's
    // actual narrative text) together give the LLM both the structural contract AND
    // the narrative content. Seeing Act 1's actual text as "what came before" causes
    // the LLM to skip Act 2A/2B generation and jump to the next structural position.
    //
    // Fix: For sectioned strategy, pass a plain structural description of the previous
    // section (its dramatic function, position in the arc) WITHOUT its narrative content.
    // The lengthGuidance block already tells the LLM what each act IS — no need to also
    // hand it the previous act's actual prose.
    //
    // Episodic_indexed strategy STILL gets narrative continuity (episodes ARE
    // sequential continuations of each other — this is correct and expected).
    let previousEnding: string | undefined;
    if (plan.strategy === "episodic_indexed") {
      // Episodic: pass last 500 chars of previous episode for genuine continuity
      previousEnding = chunk.chunkIndex > 0
        ? chunkContents[chunk.chunkIndex - 1].slice(-500)
        : undefined;
    } else if (plan.strategy === "sectioned") {
      // Sectioned: each act is standalone. Provide structural description only —
      // no narrative content from the previous act that would make the LLM "continue"
      // instead of generating the act as an independent piece.
      const ACT_STRUCTURAL_DESCRIPTIONS: Record<string, string> = {
        "act_2a_rising_action": "Act 2A: Rising Action — The protagonist commits to the journey. Rising stakes, early obstacles, key relationships forged or strained. Follows Act 1 Setup.",
        "act_2b_complications": "Act 2B: Complications — Complications escalate. Midpoint turn, reversals, the protagonist pushed to their limit. Dark night of the soul. Follows Act 2A Rising Action.",
        "act_3_climax_resolution": "Act 3: Climax & Resolution — Climax, final confrontation, resolution. Thematic statement landed. Closing image. Follows Act 2B Complications.",
        "act_1_setup": "Act 1: Setup — Introduces the world, protagonist, ordinary life, and the inciting incident that disrupts everything. This is the first act.",
        "act_2a_beats": "Act 2A: Rising Action — Beats covering B Story through Midpoint. Follows Act 1 Setup.",
        "act_2b_beats": "Act 2B: Complications — Beats covering Bad Guys Close In through Dark Night of the Soul. Follows Act 2A Rising Action.",
        "act_3_beats": "Act 3: Climax & Resolution — Beats covering Break Into Three through Final Image. Follows Act 2B Complications.",
        "act_1_beats": "Act 1: Setup — Beats covering Opening Image through Break Into Two.",
        "act_2a": "Act 2A: Rising Action — Follows Act 1. The protagonist commits to the journey. Rising stakes, early obstacles.",
        "act_2b": "Act 2B: Complications — Follows Act 2A. Escalating complications, midpoint turn, dark night of the soul.",
        "act_3": "Act 3: Climax & Resolution — Follows Act 2B. Climax, final confrontation, resolution.",
        "act_1": "Act 1: Setup — Opening of the story. Establishes world, protagonist, goal, inciting incident.",
      };
      if (chunk.chunkIndex > 0) {
        const prevChunk = plan.chunks[chunk.chunkIndex - 1];
        previousEnding = ACT_STRUCTURAL_DESCRIPTIONS[prevChunk.chunkKey]
          ?? ACT_STRUCTURAL_DESCRIPTIONS[prevChunk.sectionId ?? ""]
          ?? `Previous section was ${prevChunk.label}.`;
      }
    } else if (plan.strategy === "beat_sequential") {
      // Beat sequential: pass last 800 chars of previous beat for genuine continuity
      previousEnding = chunk.chunkIndex > 0
        ? chunkContents[chunk.chunkIndex - 1].slice(-800)
        : undefined;
    } else if (plan.strategy === "scene_indexed") {
      // Scene indexed: scene batches are sequential — pass last 800 chars of previous batch for genuine screenplay continuity
      previousEnding = chunk.chunkIndex > 0
        ? chunkContents[chunk.chunkIndex - 1].slice(-800)
        : undefined;
    }

    // Mark as running with heartbeat timestamp
    const chunkStartedAt = new Date().toISOString();
    const existingMeta = chunkMap.get(chunk.chunkIndex)?.meta_json || {};
    await supabase
      .from("project_document_chunks")
      .update({
        status: "running",
        attempts: (chunkMap.get(chunk.chunkIndex)?.attempts || 0) + 1,
        meta_json: {
          ...existingMeta,
          heartbeat_at: chunkStartedAt,
          generation_started_at: chunkStartedAt,
          stale_reason: null,
          cleared_at: null,
        },
      })
      .eq("document_id", documentId)
      .eq("version_id", versionId)
      .eq("chunk_index", chunk.chunkIndex);

    let content = "";
    let chunkPassed = false;

    for (let attempt = 0; attempt <= maxChunkRepairs; attempt++) {
      try {
        content = await generateSingleChunk(chunkOpts, chunk, previousEnding);

        // Validate chunk
        if (plan.strategy === "episodic_indexed" && chunk.episodeStart && chunk.episodeEnd) {
          const expectedEps = Array.from(
            { length: chunk.episodeEnd - chunk.episodeStart + 1 },
            (_, i) => chunk.episodeStart! + i
          );
          const validation = validateEpisodicChunk(content, expectedEps, docType);

          if (!validation.pass && attempt < maxChunkRepairs) {
            console.warn(`[chunkRunner] Chunk ${chunk.chunkKey} failed validation (attempt ${attempt}): ${validation.failures.map(f => f.detail).join("; ")}`);
            continue;
          }
          chunkPassed = validation.pass;
        } else if (plan.strategy === "beat_sequential") {
          const validation = validateBeatSequentialChunk(content, docType);
          if (!validation.pass && attempt < maxChunkRepairs) {
            console.warn(`[chunkRunner] Beat chunk ${chunk.chunkKey} failed validation (attempt ${attempt}): ${validation.failures.map(f => f.detail).join("; ")}`);
            continue;
          }
          chunkPassed = validation.pass;
        } else {
          // Check for banned summarization language
          const hasBanned = hasBannedSummarizationLanguage(content);
          // Check for screenplay format in prose-only doc types
          const hasScript = hasScreenplayFormat(content, docType);
          chunkPassed = !hasBanned && !hasScript;
          if (!chunkPassed && attempt < maxChunkRepairs) {
            if (hasScript) {
              console.warn(`[chunkRunner] Chunk ${chunk.chunkKey} contains screenplay format (INT./EXT. sluglines) in prose doc type "${docType}" — retrying with stronger instruction`);
              // Inject a stronger instruction on retry to override screenplay habit
              systemPrompt = systemPrompt + `\n\nCRITICAL RETRY INSTRUCTION: Your previous attempt used INT./EXT. scene headings (screenplay format). This is STRICTLY FORBIDDEN for a ${docType}. Write ONLY in prose narrative paragraphs. No sluglines. No character cues. No dialogue blocks. Start directly with descriptive prose.`;
            } else {
              console.warn(`[chunkRunner] Chunk ${chunk.chunkKey} contains banned language, retrying`);
            }
            continue;
          }
        }
        break;
      } catch (err: any) {
        const isTimeout = err.message?.includes("timed out");
        const failureReason = isTimeout ? "llm_call_timeout" : "generation_error";
        console.error(`[chunkRunner][IEL] chunk_generation_failed: key=${chunk.chunkKey} attempt=${attempt} reason=${failureReason} error=${err.message}`);
        if (attempt >= maxChunkRepairs) {
          failedChunks++;
          const failMeta = {
            ...existingMeta,
            heartbeat_at: new Date().toISOString(),
            failure_reason: failureReason,
            failed_at: new Date().toISOString(),
            last_error: err.message?.slice(0, 300),
          };
          await supabase
            .from("project_document_chunks")
            .update({
              status: "failed",
              error: err.message?.slice(0, 500),
              attempts: (chunkMap.get(chunk.chunkIndex)?.attempts || 0) + attempt + 1,
              meta_json: failMeta,
            })
            .eq("document_id", documentId)
            .eq("version_id", versionId)
            .eq("chunk_index", chunk.chunkIndex);
        }
      }
    }

    if (content) {
      chunkContents[chunk.chunkIndex] = content;

      // HONEST STATUS: done only if validation passed, failed_validation otherwise
      const finalStatus = chunkPassed ? "done" : "failed_validation";
      if (!chunkPassed) failedChunks++;
      if (chunkPassed) completedChunks++;

      await supabase
        .from("project_document_chunks")
        .update({
          status: finalStatus,
          content,
          char_count: content.length,
          error: chunkPassed ? null : "Chunk validation failed (banned language or missing episodes)",
        })
        .eq("document_id", documentId)
        .eq("version_id", versionId)
        .eq("chunk_index", chunk.chunkIndex);
    }
  }

  // 4. If any chunks are missing (failed with no content), reset them to "pending"
  // so the repair loop below will regenerate them. Do NOT silently skip gaps.
  const missingIndexes: number[] = [];
  for (let i = 0; i < plan.totalChunks; i++) {
    if (!chunkContents[i]) {
      missingIndexes.push(i);
      console.warn(`[chunkRunner] Chunk ${i} has no content — resetting to pending for repair`);
      await supabase
        .from("project_document_chunks")
        .update({ status: "pending", error: null })
        .eq("document_id", documentId)
        .eq("version_id", versionId)
        .eq("chunk_index", i);
    }
  }

  // If there are missing chunks, regenerate them now before assembly
  if (missingIndexes.length > 0) {
    console.log(`[chunkRunner] Regenerating ${missingIndexes.length} missing chunk(s): [${missingIndexes.join(", ")}]`);
    for (const idx of missingIndexes) {
      const chunk = plan.chunks[idx];
      if (!chunk) continue;
      const previousEnding = (() => {
        if (plan.strategy === "episodic_indexed") {
          return idx > 0 ? (chunkContents[idx - 1] || "").slice(-500) : undefined;
        } else if (plan.strategy === "sectioned" && idx > 0) {
          const prevChunk = plan.chunks[idx - 1];
          const ACT_STRUCTURAL_DESCRIPTIONS: Record<string, string> = {
            "act_2a_rising_action": "Act 2A: Rising Action — The protagonist commits to the journey. Rising stakes, early obstacles, key relationships forged or strained. Follows Act 1 Setup.",
            "act_2b_complications": "Act 2B: Complications — Complications escalate. Midpoint turn, reversals, the protagonist pushed to their limit. Dark night of the soul. Follows Act 2A Rising Action.",
            "act_3_climax_resolution": "Act 3: Climax & Resolution — Climax, final confrontation, resolution. Thematic statement landed. Closing image. Follows Act 2B Complications.",
            "act_1_setup": "Act 1: Setup — Introduces the world, protagonist, ordinary life, and the inciting incident that disrupts everything. This is the first act.",
            "act_2a_beats": "Act 2A: Rising Action — Beats covering B Story through Midpoint. Follows Act 1 Setup.",
            "act_2b_beats": "Act 2B: Complications — Beats covering Bad Guys Close In through Dark Night of the Soul. Follows Act 2A Rising Action.",
            "act_3_beats": "Act 3: Climax & Resolution — Beats covering Break Into Three through Final Image. Follows Act 2B Complications.",
            "act_1_beats": "Act 1: Setup — Beats covering Opening Image through Break Into Two.",
            "act_2a": "Act 2A: Rising Action — Follows Act 1. The protagonist commits to the journey. Rising stakes, early obstacles.",
            "act_2b": "Act 2B: Complications — Follows Act 2A. Escalating complications, midpoint turn, dark night of the soul.",
            "act_3": "Act 3: Climax & Resolution — Follows Act 2B. Climax, final confrontation, resolution.",
            "act_1": "Act 1: Setup — Opening of the story. Establishes world, protagonist, goal, inciting incident.",
          };
          return ACT_STRUCTURAL_DESCRIPTIONS[prevChunk.chunkKey]
            ?? ACT_STRUCTURAL_DESCRIPTIONS[prevChunk.sectionId ?? ""]
            ?? `Previous section was ${prevChunk.label}.`;
        } else if (plan.strategy === "beat_sequential" && idx > 0) {
          return (chunkContents[idx - 1] || "").slice(-800);
        }
        return undefined;
      })();
      try {
        const regenContent = await generateSingleChunk(chunkOpts, chunk, previousEnding);
        if (regenContent) {
          chunkContents[idx] = regenContent;
          await supabase
            .from("project_document_chunks")
            .update({ status: "done", content: regenContent, char_count: regenContent.length, error: null })
            .eq("document_id", documentId)
            .eq("version_id", versionId)
            .eq("chunk_index", idx);
          console.log(`[chunkRunner] Missing chunk ${idx} recovered: ${regenContent.length} chars`);
        }
      } catch (err: any) {
        console.error(`[chunkRunner] Recovery regen for chunk ${idx} failed:`, err.message);
        await supabase
          .from("project_document_chunks")
          .update({ status: "failed", error: `Recovery failed: ${err.message?.slice(0, 300)}` })
          .eq("document_id", documentId)
          .eq("version_id", versionId)
          .eq("chunk_index", idx);
      }
    }
  }

  // ── FIX (trinity-2026-05-03-beat-sheet-generate-acts-dropped-plus-apply-notes-collapse.md — Bug 2):
  // Chunk content is stored without prepended act headers. The LLM is instructed to include
  // the header in its output (via BEAT_SHEET_ACT_HEADERS for beat_sheet, or via section
  // labels in lengthGuidance for Treatment), but the assembly step used simple `.join("\n\n")`
  // which does NOT inject headers — if the LLM omits or reformats the header, the assembled
  // plaintext loses the Act 2A / Act 2B structural labels.
  //
  // Fix: During assembly, inject the canonical act header BEFORE each chunk's content.
  // We also need to handle the case where a chunk's content ALREADY starts with the header
  // (the LLM did include it) — avoid double-injecting.
  //
  // ACT header mapping for sectioned chunks:
  const ACT_ASSEMBLY_HEADERS: Record<string, string> = {
    // Treatment
    "act_1_setup":            "## Act 1: Setup",
    "act_2a_rising_action":   "## Act 2A: Rising Action",
    "act_2b_complications":   "## Act 2B: Complications",
    "act_3_climax_resolution": "## Act 3: Climax & Resolution",
    // Beat Sheet
    "act_1_beats":  "## Act 1: Setup — Beats",
    "act_2a_beats": "## Act 2A: Rising Action — Beats",
    "act_2b_beats": "## Act 2B: Complications — Beats",
    "act_3_beats":  "## Act 3: Climax & Resolution — Beats",
    // Screenplay / story outline
    "act_1":        "## Act 1",
    "act_2a":       "## Act 2A",
    "act_2b":       "## Act 2B",
    "act_3":        "## Act 3",
    // Character bible sections
    "protagonists":               "## Protagonists",
    "antagonists":               "## Antagonists",
    "supporting_cast":           "## Supporting Cast",
    "relationships_and_dynamics": "## Relationships & Dynamics",
  };

  const assembledParts: string[] = [];
  for (let i = 0; i < plan.totalChunks; i++) {
    const c = chunkContents[i];
    const chunkDef = plan.chunks[i];
    if (!c) {
      assembledParts.push(`[SECTION ${i + 1} GENERATION FAILED — REGENERATE THIS DOCUMENT]`);
      continue;
    }
    // Determine the act header for this chunk
    const headerForChunk = ACT_ASSEMBLY_HEADERS[chunkDef.chunkKey]
      ?? ACT_ASSEMBLY_HEADERS[chunkDef.sectionId ?? ""]
      ?? null;

    if (headerForChunk) {
      // Check if the chunk content already starts with an act header
      // Use broad regex to cover all LLM variants:
      // "## Act 1: Setup — Beats", "## Act 1", "## ACT ONE — Setup", "## Act 2A"
      // Prevents duplicate headers when LLM uses different format than injection header
      const broadActHeader = /^##\s+Act\s+/i;
      const startsWithHeader = broadActHeader.test(c.trim());
      if (startsWithHeader) {
        // LLM already included an act header — keep content as-is
        assembledParts.push(c);
      } else {
        // Header missing — inject it
        assembledParts.push(`${headerForChunk}\n\n${c.trim()}`);
      }
    } else {
      // No header mapping — use as-is (fallback)
      assembledParts.push(c);
    }
  }

  let assembledContent = assembledParts.join("\n\n");
  let validationResult: any;

  for (let repairPass = 0; repairPass <= MAX_ASSEMBLY_REPAIR_PASSES; repairPass++) {
    // Validate assembled content
    if (plan.strategy === "episodic_indexed" && episodeCount) {
      validationResult = validateEpisodicContent(assembledContent, episodeCount, docType);
    } else if (plan.strategy === "beat_sequential") {
      // For beat_sequential: verify all beat headers present + no banned language
      const foundHeaders = new Set<number>();
      const headerRe = /^##\s+BEAT\s+(\d+):/gm;
      let m: RegExpExecArray | null;
      while ((m = headerRe.exec(assembledContent)) !== null) {
        foundHeaders.add(parseInt(m[1], 10));
      }
      const missingBeatIndices: number[] = [];
      for (const chunkDef of plan.chunks) {
        const beatNum = parseInt(chunkDef.chunkKey.replace("beat_", ""), 10);
        if (!foundHeaders.has(beatNum)) {
          missingBeatIndices.push(chunkDef.chunkIndex);
        }
      }
      const bannedHit = hasBannedSummarizationLanguage(assembledContent);
      const failures: any[] = [];
      if (missingBeatIndices.length > 0) {
        failures.push({
          type: "missing_section",
          detail: `Assembly missing ${missingBeatIndices.length} beat header(s) — re-generating affected chunks`,
          sections: plan.chunks
            .filter(c => missingBeatIndices.includes(c.chunkIndex))
            .map(c => c.chunkKey),
        });
      }
      if (bannedHit) {
        failures.push({ type: "banned_phrase", detail: "Assembly contains banned summarization language" });
      }
      validationResult = {
        pass: failures.length === 0,
        failures,
        missingIndices: [],
        missingSections: missingBeatIndices.map(i => plan.chunks[i]?.chunkKey || "").filter(Boolean),
        bannedPhraseHits: bannedHit ? ["banned_language_in_assembly"] : [],
        repairAction: missingBeatIndices.length > 0 ? "regen_missing" : bannedHit ? "regen_all" : "none",
      };
    } else {
      validationResult = validateSectionedContent(
        assembledContent,
        plan.chunks.map(c => c.chunkKey),
        docType
      );
    }

    if (validationResult.pass || repairPass >= MAX_ASSEMBLY_REPAIR_PASSES) break;

    // Determine which chunks need regen based on validation failures
    const chunksToRegen: number[] = [];

    if (validationResult.missingIndices?.length > 0 && plan.strategy === "episodic_indexed") {
      // Find which chunks contain the missing episodes
      for (const missingEp of validationResult.missingIndices) {
        const owningChunk = plan.chunks.find(
          c => c.episodeStart != null && c.episodeEnd != null &&
               missingEp >= c.episodeStart && missingEp <= c.episodeEnd
        );
        if (owningChunk && !chunksToRegen.includes(owningChunk.chunkIndex)) {
          chunksToRegen.push(owningChunk.chunkIndex);
        }
      }
    } else if (validationResult.missingSections?.length > 0) {
      // Find chunks for missing sections
      for (const missingSec of validationResult.missingSections) {
        const owningChunk = plan.chunks.find(c => c.chunkKey === missingSec || c.sectionId === missingSec);
        if (owningChunk && !chunksToRegen.includes(owningChunk.chunkIndex)) {
          chunksToRegen.push(owningChunk.chunkIndex);
        }
      }
    }

    if (chunksToRegen.length === 0) break; // No actionable repair

    console.log(`[chunkRunner] Assembly repair pass ${repairPass + 1}: regenerating chunks ${chunksToRegen.join(", ")}`);

    // Mark affected chunks as needs_regen
    for (const idx of chunksToRegen) {
      await supabase
        .from("project_document_chunks")
        .update({ status: "needs_regen" })
        .eq("document_id", documentId)
        .eq("version_id", versionId)
        .eq("chunk_index", idx);
    }

    // Regenerate only those chunks
    for (const idx of chunksToRegen) {
      const chunk = plan.chunks[idx];
      const previousEnding = (() => {
        if (plan.strategy === "episodic_indexed") {
          return idx > 0 ? chunkContents[idx - 1].slice(-500) : undefined;
        } else if (plan.strategy === "sectioned" && idx > 0) {
          const prevChunk = plan.chunks[idx - 1];
          const ACT_STRUCTURAL_DESCRIPTIONS: Record<string, string> = {
            "act_2a_rising_action": "Act 2A: Rising Action — The protagonist commits to the journey. Rising stakes, early obstacles, key relationships forged or strained. Follows Act 1 Setup.",
            "act_2b_complications": "Act 2B: Complications — Complications escalate. Midpoint turn, reversals, the protagonist pushed to their limit. Dark night of the soul. Follows Act 2A Rising Action.",
            "act_3_climax_resolution": "Act 3: Climax & Resolution — Climax, final confrontation, resolution. Thematic statement landed. Closing image. Follows Act 2B Complications.",
            "act_1_setup": "Act 1: Setup — Introduces the world, protagonist, ordinary life, and the inciting incident that disrupts everything. This is the first act.",
            "act_2a_beats": "Act 2A: Rising Action — Beats covering B Story through Midpoint. Follows Act 1 Setup.",
            "act_2b_beats": "Act 2B: Complications — Beats covering Bad Guys Close In through Dark Night of the Soul. Follows Act 2A Rising Action.",
            "act_3_beats": "Act 3: Climax & Resolution — Beats covering Break Into Three through Final Image. Follows Act 2B Complications.",
            "act_1_beats": "Act 1: Setup — Beats covering Opening Image through Break Into Two.",
            "act_2a": "Act 2A: Rising Action — Follows Act 1. The protagonist commits to the journey. Rising stakes, early obstacles.",
            "act_2b": "Act 2B: Complications — Follows Act 2A. Escalating complications, midpoint turn, dark night of the soul.",
            "act_3": "Act 3: Climax & Resolution — Follows Act 2B. Climax, final confrontation, resolution.",
            "act_1": "Act 1: Setup — Opening of the story. Establishes world, protagonist, goal, inciting incident.",
          };
          return ACT_STRUCTURAL_DESCRIPTIONS[prevChunk.chunkKey]
            ?? ACT_STRUCTURAL_DESCRIPTIONS[prevChunk.sectionId ?? ""]
            ?? `Previous section was ${prevChunk.label}.`;
        } else if (plan.strategy === "beat_sequential" && idx > 0) {
          return (chunkContents[idx - 1] || "").slice(-800);
        }
        return undefined;
      })();

      await supabase
        .from("project_document_chunks")
        .update({ status: "running" })
        .eq("document_id", documentId)
        .eq("version_id", versionId)
        .eq("chunk_index", idx);

      try {
        const content = await generateSingleChunk(chunkOpts, chunk, previousEnding);
        chunkContents[idx] = content;

        const isValid = plan.strategy === "episodic_indexed" && chunk.episodeStart && chunk.episodeEnd
          ? validateEpisodicChunk(content, Array.from({ length: chunk.episodeEnd - chunk.episodeStart + 1 }, (_, i) => chunk.episodeStart! + i), docType).pass
          : !hasBannedSummarizationLanguage(content);

        await supabase
          .from("project_document_chunks")
          .update({
            status: isValid ? "done" : "failed_validation",
            content,
            char_count: content.length,
            error: isValid ? null : "Repair pass: validation still failing",
          })
          .eq("document_id", documentId)
          .eq("version_id", versionId)
          .eq("chunk_index", idx);
      } catch (err: any) {
        console.error(`[chunkRunner] Repair regen for chunk ${idx} failed:`, err.message);
        await supabase
          .from("project_document_chunks")
          .update({ status: "failed", error: err.message?.slice(0, 500) })
          .eq("document_id", documentId)
          .eq("version_id", versionId)
          .eq("chunk_index", idx);
      }
    }

    // Reassemble — apply ACT_ASSEMBLY_HEADERS injection to repaired assembly too
    const repairedParts: string[] = [];
    for (let i = 0; i < plan.totalChunks; i++) {
      const c = chunkContents[i];
      if (!c) { repairedParts.push(''); continue; }
      const chunkDef = plan.chunks[i];
      const hdr = ACT_ASSEMBLY_HEADERS[chunkDef.chunkKey] ?? ACT_ASSEMBLY_HEADERS[chunkDef.sectionId ?? ''] ?? null;
      if (hdr) {
        const broadActHeader = /^##\s+Act\s+/i;
        const startsHdr = broadActHeader.test(c.trim());
        repairedParts.push(startsHdr ? c : hdr + '\n\n' + c.trim());
      } else {
        repairedParts.push(c);
      }
    }
    assembledContent = repairedParts.join("\n\n");
  }

  // 5. Store assembled content AND atomically clear bg_generating.
  // Fetch existing meta_json first so we preserve fields like bg_started_at, episode_count, etc.
  // This prevents generate-document's background cleanup from being the single point of failure —
  // if the edge function times out before cleanup runs, the version is still marked done here.
  const { data: verForMeta } = await supabase
    .from("project_document_versions")
    .select("meta_json")
    .eq("id", versionId)
    .maybeSingle();

  // ── PATCH B: Screenplay word-count floor validation ──
  const SCREENPLAY_CLASS_DOCS = new Set(["feature_script", "production_draft", "screenplay_draft"]);
  const SCREENPLAY_WORD_FLOOR = 19800;
  const assembledWordCount = assembledContent.split(/\s+/).filter(Boolean).length;
  let belowFloor = false;

  if (SCREENPLAY_CLASS_DOCS.has(docType) && assembledWordCount < SCREENPLAY_WORD_FLOOR) {
    belowFloor = true;
    console.error(
      `[chunkRunner][IEL] SCREENPLAY FLOOR VIOLATION: ${docType} assembled with ${assembledWordCount} words (floor=${SCREENPLAY_WORD_FLOOR}). ` +
      `This version will be flagged as below_floor in meta_json. Runtime will be significantly shorter than expected.`
    );
  } else if (SCREENPLAY_CLASS_DOCS.has(docType)) {
    console.log(`[chunkRunner] Screenplay floor check PASSED: ${docType} assembled with ${assembledWordCount} words (floor=${SCREENPLAY_WORD_FLOOR})`);
  }

  const mergedMeta: Record<string, any> = {
    ...(verForMeta?.meta_json || {}),
    bg_generating: false,
    bg_completed_at: new Date().toISOString(),
    chunks_total: plan.totalChunks,
    chunks_completed: completedChunks,
    ...(SCREENPLAY_CLASS_DOCS.has(docType) ? {
      assembled_word_count: assembledWordCount,
      below_floor: belowFloor,
      screenplay_word_floor: SCREENPLAY_WORD_FLOOR,
    } : {}),
  };

  await supabase
    .from("project_document_versions")
    .update({
      plaintext: assembledContent,
      assembled_from_chunks: true,
      assembled_chunk_count: plan.totalChunks,
      meta_json: mergedMeta,
    })
    .eq("id", versionId);

  // ── BEAT SHEET EXPLOSION: After assembly, parse act-level output into individual beat chunks ──
  // Each beat becomes its own chunk in project_document_chunks, enabling per-beat rewrite.
  if (docType === "beat_sheet" && assembledContent && assembledContent.trim().length > 50) {
    try {
      await explodeBeatSheetChunks(supabase, documentId, versionId, assembledContent, plan.totalChunks);
    } catch (explodeErr: any) {
      // Non-fatal — the beat sheet is still usable, just without per-beat chunks.
      console.error(`[chunkRunner] Beat explosion failed (non-fatal):`, explodeErr?.message);
    }
  }

  // ── SEASON_SCRIPT COMPLETION GATE ──
  // For episodic docs (especially season_script), verify that completedChunks == totalChunks.
  // A partial run must NEVER report success — even if validation.pass is true on partial assembly.
  const episodeCompletionPass = plan.strategy === "episodic_indexed"
    ? completedChunks === plan.totalChunks
    : true;

  if (!episodeCompletionPass) {
    console.error(`[chunkRunner][IEL] COMPLETION_GATE_FAILED: episodic doc completed ${completedChunks}/${plan.totalChunks} — marking as incomplete, NOT success`);
  }

  const isSuccess = validationResult.pass && failedChunks === 0 && episodeCompletionPass;

  console.log(`[chunkRunner] Complete: ${completedChunks}/${plan.totalChunks}, validation=${validationResult.pass ? "PASS" : "FAIL"}, episodeGate=${episodeCompletionPass ? "PASS" : "FAIL"}, success=${isSuccess}, rid=${rid}`);

  return {
    success: isSuccess,
    assembledContent,
    totalChunks: plan.totalChunks,
    completedChunks,
    failedChunks,
    validationResult,
    assembledFromChunks: true,
  };
}

/**
 * Resume a partially completed chunked generation.
 * Only generates chunks that are pending/failed/failed_validation/needs_regen.
 * Does NOT call fresh init that overwrites state.
 */
export async function resumeChunkedGeneration(opts: ChunkRunnerOptions): Promise<ChunkRunResult> {
  const { supabase, documentId, versionId, plan } = opts;

  // Resolve gateway URL if not explicitly provided
  const resolvedGw = opts.gatewayUrl
    ? { url: opts.gatewayUrl }
    : (() => {
        try { return resolveGateway(); } catch { return { url: "https://openrouter.ai/api/v1/chat/completions" }; }
      })();
  const effectiveGatewayUrl = opts.gatewayUrl || resolvedGw.url;
  const chunkOpts = { ...opts, gatewayUrl: effectiveGatewayUrl };

  // Load existing chunks
  const { data: existingChunks } = await supabase
    .from("project_document_chunks")
    .select("*")
    .eq("document_id", documentId)
    .eq("version_id", versionId)
    .order("chunk_index", { ascending: true });

  const chunkMap = new Map((existingChunks || []).map((c: any) => [c.chunk_index, c]));

  // Check if any chunks need generation
  const pendingChunks = chunksNeedingGeneration(plan, chunkMap);

  if (pendingChunks.length === 0) {
    // All chunks done — just reassemble
    const resumeAssembledParts: string[] = [];
    for (const c of plan.chunks) {
      const existing = chunkMap.get(c.chunkIndex);
      const content = existing?.content || "";
      if (!content) { resumeAssembledParts.push(''); continue; }
      const hdr = ACT_ASSEMBLY_HEADERS[c.chunkKey] ?? ACT_ASSEMBLY_HEADERS[c.sectionId ?? ''] ?? null;
      if (hdr) {
        const broadActHeader = /^##\s+Act\s+/i;
        const startsHdr = broadActHeader.test(content.trim());
        resumeAssembledParts.push(startsHdr ? content : hdr + '\n\n' + content.trim());
      } else {
        resumeAssembledParts.push(content);
      }
    }
    const assembled = resumeAssembledParts.join("\n\n");

    return {
      success: true,
      assembledContent: assembled,
      totalChunks: plan.totalChunks,
      completedChunks: plan.totalChunks,
      failedChunks: 0,
      validationResult: { pass: true, failures: [] },
      assembledFromChunks: true,
    };
  }

  // Ensure any missing chunk rows exist (upsert, not delete)
  await initializeChunks(supabase, documentId, versionId, plan);

  // Run the main generation (which now respects existing done chunks)
  return runChunkedGeneration(opts);
}

// ── BEAT SHEET EXPLOSION ──────────────────────────────────────────────────────
// After act-level assembly, parse the assembled text into individual beat chunks.
// Each beat gets its own project_document_chunks row so it can be rewritten independently.

interface ParsedBeat {
  beatNumber: number;
  title: string;
  page: number | null;
  description: string;
  emotionalFunction: string | null;
}

/**
 * Parse the assembled beat sheet plaintext into individual beats.
 * Handles formats like:
 *   ### 1. Opening Image\nPage 1\nDescription...\n*Emotional/Dramatic Function:*
 *   **2. Theme Stated**\nPage 3\nDescription...
 */
function parseBeatSheetIntoBeats(plaintext: string): ParsedBeat[] {
  const beats: ParsedBeat[] = [];

  // Split on beat headers — matches ### N. Name or **N. Name** or ### Name
  const beatBlocks: string[] = [];
  const parts = plaintext.split(/(?=^#{3}\s+\d*\.?\s*|^\*{2}\d+\.?\s*)/m);

  for (const block of parts) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Extract beat number and title from header
    const headerMatch = trimmed.match(/^#{3}\s+(\d*\.?)\s*([^\n]+)|^\*{2}(\d*\.?)\s*([^*\n]+)\*{2}/m);
    if (!headerMatch) continue;

    const rawNum = headerMatch[1] || headerMatch[3] || "";
    const title = (headerMatch[2] || headerMatch[4] || "").trim();
    const beatNumber = parseInt(rawNum.replace(/\.$/, "")) || (beats.length + 1);

    // Extract page number
    const pageMatch = trimmed.match(/(?:^|\n)\s*Page\s+(\d+)/i);
    const page = pageMatch ? parseInt(pageMatch[1]) : null;

    // Extract emotional function
    const funcMatch = trimmed.match(/\*{0,2}Emotional(?:\s*\/\s*Dramatic)?\s*Function:\*{0,2}\s*([^*]+)/i);
    const emotionalFunction = funcMatch ? funcMatch[1].trim() : null;

    // Description is everything between the header and the emotional function
    let description = trimmed;
    // Remove the header line
    description = description.replace(/^#{1,3}\s+\d*\.?\s*[^\n]+\n?|^\*{2}\d*\.?\s*[^*\n]+\*{2}\n?/, "");
    // Remove Page line
    description = description.replace(/\n?\s*Page\s+\d+\s*\n?/i, "\n");
    // Remove emotional function line
    description = description.replace(/\n?\s*\*{0,2}Emotional(?:\s*\/\s*Dramatic)?\s*Function:\*{0,2}\s*[^*]*\*?/, "");
    description = description.trim();

    beats.push({ beatNumber, title, page, description, emotionalFunction });
  }

  // If no beats found via headers, fall back to numbering heuristic
  if (beats.length === 0) {
    const lines = plaintext.split("\n");
    let currentBeat: Partial<ParsedBeat> | null = null;
    for (const line of lines) {
      const numMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
      if (numMatch) {
        if (currentBeat?.title) {
          beats.push({
            beatNumber: currentBeat.beatNumber || beats.length + 1,
            title: currentBeat.title || "",
            page: currentBeat.page || null,
            description: (currentBeat.description || "").trim(),
            emotionalFunction: currentBeat.emotionalFunction || null,
          });
        }
        currentBeat = { beatNumber: parseInt(numMatch[1]), title: numMatch[2].trim(), description: "", page: null, emotionalFunction: null };
      } else if (currentBeat) {
        const pageMatch = line.match(/Page\s+(\d+)/i);
        if (pageMatch) currentBeat.page = parseInt(pageMatch[1]);
        else if (line.includes("Emotional") || line.includes("Function")) {
          const fMatch = line.match(/\*{0,2}Emotional(?:\s*\/\s*Dramatic)?\s*Function:\*{0,2}\s*([^*]+)/i);
          if (fMatch) currentBeat.emotionalFunction = fMatch[1].trim();
        } else if (line.trim()) {
          currentBeat.description = (currentBeat.description || "") + " " + line.trim();
        }
      }
    }
    if (currentBeat?.title) {
      beats.push({
        beatNumber: currentBeat.beatNumber || beats.length + 1,
        title: currentBeat.title || "",
        page: currentBeat.page || null,
        description: (currentBeat.description || "").trim(),
        emotionalFunction: currentBeat.emotionalFunction || null,
      });
    }
  }

  return beats;
}

/**
 * Replace act-level chunks with beat-level chunks for a beat sheet.
 * Deletes old chunks and inserts one chunk per parsed beat.
 */
export async function explodeBeatSheetChunks(
  supabase: any,
  documentId: string,
  versionId: string,
  assembledContent: string,
  oldChunkCount: number,
): Promise<void> {
  // Guard: skip if already exploded (check if beat chunks exist)
  const { data: existingChunks } = await supabase
    .from("project_document_chunks")
    .select("chunk_key")
    .eq("document_id", documentId)
    .eq("version_id", versionId)
    .limit(1);
  if ((existingChunks || []).length > 0 && (existingChunks[0]?.chunk_key || "").startsWith("beat_")) {
    console.log(`[chunkRunner][explode] Already exploded — skipping`);
    return;
  }

  const beats = parseBeatSheetIntoBeats(assembledContent);
  if (beats.length === 0) {
    console.log(`[chunkRunner][explode] No beats found in assembled content — skipping`);
    return;
  }

  console.log(`[chunkRunner][explode] Parsed ${beats.length} beats from beat sheet (was ${oldChunkCount} act-level chunks)`);

  // Delete old act-level chunks for this version
  await supabase
    .from("project_document_chunks")
    .delete()
    .eq("document_id", documentId)
    .eq("version_id", versionId);

  // Insert one chunk per beat
  const chunkRows = beats.map((beat, idx) => ({
    document_id: documentId,
    version_id: versionId,
    chunk_index: idx,
    chunk_key: `beat_${beat.beatNumber}`,
    status: "done",
    content: [
      `### ${beat.beatNumber}. ${beat.title}`,
      beat.page ? `Page ${beat.page}` : "",
      beat.description,
      beat.emotionalFunction ? `*Emotional/Dramatic Function:* ${beat.emotionalFunction}` : "",
    ].filter(Boolean).join("\n\n"),
    char_count: beat.description.length,
    meta_json: {
      label: beat.title,
      beat_number: beat.beatNumber,
      page: beat.page || null,
      emotional_function: beat.emotionalFunction || null,
      is_beat: true,
      exploded_from_acts: true,
    },
  }));

  // Batch insert in chunks of 25 to avoid request size limits
  for (let i = 0; i < chunkRows.length; i += 25) {
    const batch = chunkRows.slice(i, i + 25);
    await supabase.from("project_document_chunks").insert(batch);
  }

  // Update version meta to record the explosion
  await supabase
    .from("project_document_versions")
    .update({
      assembled_chunk_count: beats.length,
      meta_json: {
        beat_exploded: true,
        beat_count: beats.length,
        act_chunk_count: oldChunkCount,
      },
    })
    .eq("id", versionId);

  console.log(`[chunkRunner][explode] Inserted ${beats.length} beat-level chunks for version ${versionId}`);
}
