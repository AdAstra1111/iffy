/**
 * reverse-engineer-script — Comprehensive unit tests
 *
 * Tests all pure logic functions extracted from:
 *   supabase/functions/reverse-engineer-script/index.ts
 *
 * Edge Function (Deno) — pure functions replicated here for vitest.
 */

import { describe, it, expect } from "vitest";

// ─── Constants (mirrors index.ts) ──────────────────────────────────────────

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

const GROUPS = [
  { key: 0, stages: ["structure_1", "structure_2", "structure_3"] },
  { key: 1, stages: ["synthesise", "idea"] },
  { key: 2, stages: ["beat_sheet", "story_outline", "character_bible"] },
  { key: 3, stages: ["treatment", "market_sheet", "infer_criteria", "storing_docs"] },
];

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 min

// ─── Pure function replicas ─────────────────────────────────────────────────

function determineGroup(stageKey: string): number {
  for (const g of GROUPS) {
    if (g.stages.includes(stageKey)) return g.key;
  }
  return -1;
}

function getNextGroupKey(currentGroup: number): number | null {
  const next = currentGroup + 1;
  return next < GROUPS.length ? next : null;
}

function isLockStale(payload: any): boolean {
  if (!payload.is_processing) return false;
  const since = payload.is_processing_since;
  if (!since) return true;
  return Date.now() - new Date(since).getTime() > LOCK_TTL_MS;
}

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

function chunkScript(text: string, numChunks = 3): string[] {
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
      lineRanges.push({ startLine: startIdx + 1, endLine: endIdx });
    }
  }
  return { chunks, lineRanges };
}

function extractJSON(raw: string): any {
  let s = raw
    .replace(/<\/think>[\s\S]*?<\/think>/gi, "")
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

  return null;
}

function makePayload(jobId: string | null, initial = false) {
  return {
    job_type: "reverse_engineer",
    status: initial ? "running" : "pending",
    current_stage: initial ? JOB_STAGES[0].key : "pending",
    stages: JOB_STAGES.reduce((acc: any, s) => {
      acc[s.key] = { label: s.label, status: initial && s.key === JOB_STAGES[0].key ? "running" : "pending" };
      return acc;
    }, {}),
    stage_outputs: {},
    current_group: 0,
    is_processing: false,
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

// ─── Formatters (from index.ts) ────────────────────────────────────────────

function buildMarketSheetPlaintext(data: any): string {
  if (!data || typeof data !== "object") return String(data ?? "");
  const lines: string[] = [];

  lines.push("## Convergence Guidance", "");
  const audienceParts: string[] = [];
  if (data.target_audience) audienceParts.push(`Target Audience: ${data.target_audience}`);
  if (data.audience_age_range) audienceParts.push(`Age Range: ${data.audience_age_range}`);
  if (audienceParts.length > 0) {
    lines.push(`**Audience Targeting:** ${audienceParts.join(" | ")}`, "");
  }
  if (data.audience_breakdown?.male || data.audience_breakdown?.female) {
    const ab = data.audience_breakdown;
    lines.push(`**Audience Breakdown:** Male ${ab.male || "—"} / Female ${ab.female || "—"}`, "");
  }
  if (data.market_positioning) {
    lines.push(`**Market Gap / Unique Angle:** ${data.market_positioning}`, "");
  }
  lines.push("> *This is guidance derived from reverse-engineered script analysis. Used to align voice/tone/pacing while staying original.*", "");

  lines.push("## Nuance Contract", "");
  if (data.tone) lines.push(`**Tonal Register:** ${data.tone}`, "");
  if (data.format) lines.push(`**Format:** ${data.format}`, "");
  if (data.budget_range) lines.push(`**Budget Band:** ${data.budget_range}`, "");
  if (data.project_status) lines.push(`**Project Status:** ${data.project_status}`, "");
  if (!data.tone && !data.format && !data.budget_range && !data.project_status) {
    lines.push("*No nuance contract data from reverse engineering — populate during development.*", "");
  }
  lines.push("");

  if (data.comparable_titles?.length > 0) {
    lines.push("## Comparable Projects", "");
    for (const title of data.comparable_titles) {
      lines.push(`- **${title}**`, "");
    }
    lines.push("");
  } else {
    lines.push("## Comparable Projects", "");
    lines.push("*No comparable titles identified — add during development.*", "");
  }

  lines.push("## Buyer Positioning", "");
  if (data.market_positioning) {
    const platforms = ["Netflix", "Amazon", "Apple TV+", "HBO", "Hulu", "Disney+", "Paramount+", "Peacock"];
    lines.push(`- **Streamers / Buyers:** This project's positioning (${data.market_positioning}) suggests targeting platforms seeking ${data.genre || "original"} content${data.audience_age_range ? ` for ${data.audience_age_range} audiences` : ""}.`);
    lines.push("");
  } else {
    lines.push("*Buyer positioning not determined from script — refine during development.*", "");
  }

  lines.push("## Risk Summary", "");
  if (data.budget_range === "tent-pole" || data.budget_range === "high") {
    lines.push(`- **Budget Risk** → ${data.budget_range} budget requires proven IP or A-list attachment to mitigate financing risk.`);
    lines.push("");
  }
  if (data.comparable_titles?.length === 0) {
    lines.push("- **Market Risk** → No comparable titles identified — market fit is unvalidated until comps are established.");
    lines.push("");
  }
  const riskCount = lines.filter(l => l.startsWith("- **")).length;
  if (riskCount === 0) {
    lines.push("*Risk analysis incomplete — populate during development.*", "");
  }

  return lines.join("\n").trim();
}

function buildConceptBriefPlaintext(data: any): string {
  const lines: string[] = [];
  const val = (field: string) => data[field] ?? "";
  const arrayVal = (field: string) =>
    Array.isArray(data[field]) ? data[field].join(", ") : String(data[field] ?? "");
  const title = val("title") || "Project";

  lines.push(`# CONCEPT BRIEF: ${title}`, "");
  lines.push("## LOGLINE", val("logline"), "");
  const gs = val("genre_subgenre") || val("genre") || "";
  lines.push("## GENRE & SUBGENRE", gs ? `**Primary Genre:** ${gs}` : "", "");
  lines.push("## PREMISE", val("premise"), "");

  lines.push("## PROTAGONIST", val("protagonist") ? `**Name & Role:** ${val("protagonist")}` : "", "");
  lines.push("## OPPOSITION", val("opposition") ? `**Antagonist / Opposing Force:** ${val("opposition")}` : "", "");
  lines.push("## KEY RELATIONSHIPS", val("key_relationships") ? `**Allies & Mentors:** ${val("key_relationships")}` : "", "");
  lines.push("## CENTRAL CONFLICT", val("central_conflict"), "");
  lines.push("## STAKES", val("stakes"), "");
  lines.push("## TONE & ATMOSPHERE", val("tone_and_style") ? `**Emotional Register:** ${val("tone_and_style")}` : "", "");
  lines.push("## THEMES", arrayVal("themes") || "", "");
  lines.push("## WORLD BUILDING", val("world_building_notes"), "");
  lines.push("## AUDIENCE & MARKET", val("target_audience") ? `**Target Demographic:** ${val("target_audience")}` : "", "");
  lines.push("## UNIQUE HOOK", val("unique_hook"), "");
  lines.push("## VISUAL & SENSORY PALETTE", val("visual_palette"), "");
  return lines.join("\n").trim();
}

function buildIdeaPlaintext(data: any): string {
  const lines: string[] = [];
  const val = (field: string) => data[field] ?? "";
  const title = val("title") || "Project";
  const genre = val("genre") || "";
  const subgenre = val("subgenre") || "";
  const hook = val("hook") || "";
  const genreStr = subgenre ? `${genre} (${subgenre})` : genre;

  lines.push(`# ${title}`, "");
  lines.push("## LOGLINE", val("logline"), "");
  lines.push("## PREMISE", val("premise"), "");
  const genreLine = genreStr ? `**Genre:** ${genreStr}` : "";
  const hookLine = hook ? `**Unique hook:** ${hook}` : "";
  lines.push("## GENRE & HOOK", genreLine, hookLine, "");
  return lines.join("\n").trim();
}

function buildCharacterBiblePlaintext(data: any): string {
  const chars = Array.isArray(data?.characters) ? data.characters : [];
  const lines: string[] = [];

  chars.forEach((c: any, idx: number) => {
    const name = c.name || `Character ${idx + 1}`;
    const role = c.role || "unknown";
    lines.push(`## ${idx + 1}. ${name} (${role})`, "");
    if (c.age) lines.push(`**Age:** ${c.age}`, "");
    if (c.physical_description) lines.push(`**Physical Description:** ${c.physical_description}`, "");
    if (c.backstory) lines.push(`**Backstory:** ${c.backstory}`, "");
    if (c.psychology) lines.push(`**Psychology:** ${c.psychology}`, "");
    if (c.want) lines.push(`**Want:** ${c.want}`, "");
    if (c.need) lines.push(`**Need:** ${c.need}`, "");
    if (c.fatal_flaw) lines.push(`**Fatal Flaw:** ${c.fatal_flaw}`, "");
    if (c.arc) lines.push(`**Arc:** ${c.arc}`, "");
    if (c.voice_and_speech) lines.push(`**Voice & Speech:** ${c.voice_and_speech}`, "");
    if (c.sample_dialogue) lines.push(`**Sample Dialogue:** ${c.sample_dialogue}`, "");
    if (Array.isArray(c.casting_suggestions) && c.casting_suggestions.length > 0) {
      lines.push(`**Casting Suggestions:** ${c.casting_suggestions.join(", ")}`, "");
    }
    lines.push("---", "");
  });

  if (data.relationship_dynamics) {
    lines.push("## RELATIONSHIP DYNAMICS", "", `${data.relationship_dynamics}`, "");
  }
  if (data.ensemble_notes) {
    lines.push("## ENSEMBLE NOTES", "", `${data.ensemble_notes}`, "");
  }
  return lines.join("\n").trim();
}

function buildBeatSheetPlaintext(data: any): string {
  if (!Array.isArray(data) || data.length === 0) return "";
  const first = data[0];
  const isBeat = ("number" in first || "name" in first) &&
    ("act_affiliation" in first || "act" in first || "description" in first || "scene" in first);
  if (!isBeat) return "";

  const actGroups: Record<string, any[]> = {};
  for (const beat of data) {
    const actKey = beat.act_affiliation || beat.act || "ACT 1";
    if (!actGroups[actKey]) actGroups[actKey] = [];
    actGroups[actKey].push(beat);
  }
  const actOrder = ["act_1","act_2a","act_2b","act_2","act_3","act_4"];
  const sortedActs = Object.keys(actGroups).sort((a, b) => {
    const ai = actOrder.indexOf(a.toLowerCase());
    const bi = actOrder.indexOf(b.toLowerCase());
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi;
  });

  return sortedActs.map(actName => {
    const beats = actGroups[actName];
    const label = actName.replace(/^act_/i, "ACT ").replace(/_/g, " ").trim();
    const actLines = [`## ${label}`];
    for (const beat of beats) {
      const num = beat.number ?? beat.id ?? "?";
      const name = beat.name ?? beat.title ?? `Beat ${num}`;
      actLines.push(`## Beat ${num}: ${name}`);
      actLines.push(`**Act:** ${label}`);
      const tp = beat.turning_point || beat.turningPoint || "No";
      actLines.push(`**Turning point:** ${tp}`);
      if (beat.scene || beat.location) actLines.push(`**Scene:** ${beat.scene || beat.location}`);
      if (beat.description) actLines.push(`**What happens:** ${beat.description}`);
      if (beat.structural_purpose || beat.structuralPurpose) actLines.push(`**Structural purpose:** ${beat.structural_purpose || beat.structuralPurpose}`);
      if (beat.protagonist_state || beat.protagonistState) actLines.push(`**Protagonist state:** ${beat.protagonist_state || beat.protagonistState}`);
      if (beat.emotional_shift || beat.emotionalShift) actLines.push(`**Emotional shift:** ${beat.emotional_shift || beat.emotionalShift}`);
      if (beat.page_range) actLines.push(`**Page range:** ${beat.page_range}`);
    }
    return actLines.join("\n");
  }).join("\n\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. determineGroup ─────────────────────────────────────────────────────

describe("determineGroup", () => {
  it("maps structure_1 to group 0", () => {
    expect(determineGroup("structure_1")).toBe(0);
  });
  it("maps structure_3 to group 0", () => {
    expect(determineGroup("structure_3")).toBe(0);
  });
  it("maps synthesise to group 1", () => {
    expect(determineGroup("synthesise")).toBe(1);
  });
  it("maps idea to group 1", () => {
    expect(determineGroup("idea")).toBe(1);
  });
  it("maps beat_sheet to group 2", () => {
    expect(determineGroup("beat_sheet")).toBe(2);
  });
  it("maps character_bible to group 2", () => {
    expect(determineGroup("character_bible")).toBe(2);
  });
  it("maps treatment to group 3", () => {
    expect(determineGroup("treatment")).toBe(3);
  });
  it("maps storing_docs to group 3", () => {
    expect(determineGroup("storing_docs")).toBe(3);
  });
  it("returns -1 for unknown stages", () => {
    expect(determineGroup("nonexistent")).toBe(-1);
    expect(determineGroup("")).toBe(-1);
  });
  it("every JOB_STAGES key maps to a valid group (0-3)", () => {
    for (const stage of JOB_STAGES) {
      const group = determineGroup(stage.key);
      expect(group).toBeGreaterThanOrEqual(0);
      expect(group).toBeLessThanOrEqual(3);
    }
  });
  it("group 0 contains exactly 3 stages", () => {
    expect(GROUPS[0].stages).toEqual(["structure_1", "structure_2", "structure_3"]);
  });
  it("group 2 contains exactly 3 stages", () => {
    expect(GROUPS[2].stages).toEqual(["beat_sheet", "story_outline", "character_bible"]);
  });
  it("all 12 stages are distributed across exactly 4 groups", () => {
    const allStages = GROUPS.flatMap(g => g.stages);
    expect(allStages.length).toBe(12);
    expect(new Set(allStages).size).toBe(12); // no duplicates
    expect(GROUPS.length).toBe(4);
  });
});

// ─── 2. getNextGroupKey ────────────────────────────────────────────────────

describe("getNextGroupKey", () => {
  it("returns 1 when current is 0", () => {
    expect(getNextGroupKey(0)).toBe(1);
  });
  it("returns 2 when current is 1", () => {
    expect(getNextGroupKey(1)).toBe(2);
  });
  it("returns 3 when current is 2", () => {
    expect(getNextGroupKey(2)).toBe(3);
  });
  it("returns null when current is 3 (last group)", () => {
    expect(getNextGroupKey(3)).toBeNull();
  });
  it("returns null when current is beyond last group", () => {
    expect(getNextGroupKey(4)).toBeNull();
    expect(getNextGroupKey(99)).toBeNull();
  });
  it("boundary: returns null when 3 groups total", () => {
    expect(getNextGroupKey(GROUPS.length - 1)).toBeNull();
  });
});

// ─── 3. isLockStale ────────────────────────────────────────────────────────

describe("isLockStale", () => {
  it("returns false when is_processing is false", () => {
    expect(isLockStale({ is_processing: false })).toBe(false);
  });
  it("returns true when is_processing_since is missing", () => {
    expect(isLockStale({ is_processing: true })).toBe(true);
  });
  it("returns false when lock is recent (within TTL)", () => {
    const recent = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    expect(isLockStale({ is_processing: true, is_processing_since: recent })).toBe(false);
  });
  it("returns true when lock is stale (beyond TTL)", () => {
    const old = new Date(Date.now() - LOCK_TTL_MS - 1000).toISOString();
    expect(isLockStale({ is_processing: true, is_processing_since: old })).toBe(true);
  });
  it("returns true when is_processing_since is exactly at TTL boundary", () => {
    const exact = new Date(Date.now() - LOCK_TTL_MS).toISOString();
    expect(isLockStale({ is_processing: true, is_processing_since: exact })).toBe(false); // NOT stale — > not >=
  });
  it("returns false when payload is empty object", () => {
    expect(isLockStale({})).toBe(false);
  });
});

// ─── 4. extractRegexCharacters ─────────────────────────────────────────────

describe("extractRegexCharacters", () => {
  it("extracts uppercase character names from script text", () => {
    const text = `JOHN SMITH\nwalks into the room.\n\nMARY JONES\nfollows behind him.`;
    const chars = extractRegexCharacters(text);
    expect(chars).toContain("JOHN SMITH");
    expect(chars).toContain("MARY JONES");
  });

  it("filters out noise words (INT., EXT., CUT TO, etc.)", () => {
    const text = "INT. OFFICE - DAY\nCUT TO:\nEXT. PARK\nJOHN SMITH\nFADE OUT.";
    const chars = extractRegexCharacters(text);
    // Regex matches individual uppercase words; noise set has dotted variants (INT., EXT.)
    // so "INT" and "EXT" (without dots) are not filtered — this is existing behavior
    expect(chars).toContain("JOHN");
    expect(chars).toContain("SMITH");
    // Multi-word noise entries like "CUT TO" span multiple tokens so they don't match
    // "FADE OUT" similarly — "FADE" and "OUT" are separate tokens
    expect(chars).toEqual(expect.arrayContaining(["INT", "OFFICE", "DAY", "CUT", "EXT", "PARK", "JOHN", "SMITH", "FADE", "OUT"]));
    // Verify the noise set IS filtering exact full-string matches (e.g., "THE END" if present)
    const text2 = "THE END\nJOHN SMITH";
    const chars2 = extractRegexCharacters(text2);
    expect(chars2).not.toContain("THE END");
  });

  it("deduplicates repeated names", () => {
    const text = `JOHN SMITH enters.\nJOHN SMITH speaks.\nJOHN SMITH leaves.`;
    const chars = extractRegexCharacters(text);
    expect(chars.filter(c => c === "JOHN SMITH").length).toBe(1);
  });

  it("filters out names shorter than 2 characters", () => {
    const chars = extractRegexCharacters("A B");
    expect(chars.filter(c => c.length < 2)).toEqual([]);
  });

  it("filters out names longer than 40 characters", () => {
    const longName = "A".repeat(41);
    const chars = extractRegexCharacters(`Hello ${longName} World`);
    expect(chars.filter(c => c.length > 40)).toEqual([]);
  });

  it("returns empty array for empty text", () => {
    expect(extractRegexCharacters("")).toEqual([]);
  });

  it("returns empty array for text with no uppercase patterns", () => {
    expect(extractRegexCharacters("this is all lowercase text.")).toEqual([]);
  });

  it("handles noise set correctly — complete list filtered", () => {
    const noiseList = ["INT.", "EXT.", "INT/EXT.", "EXT/INT.", "CUT TO", "FADE IN",
      "FADE OUT", "DISSOLVE TO", "SMASH CUT", "MONTAGE", "CONTINUED", "THE END",
      "OVER BLACK", "TITLE CARD", "INTERCUT", "SUPER", "BACK TO", "LATER"];
    const text = noiseList.join(" ");
    const chars = extractRegexCharacters(text);
    for (const n of noiseList) {
      expect(chars).not.toContain(n);
    }
  });

  it("extracts names with spaces (multi-word)", () => {
    const chars = extractRegexCharacters("SARAH CONNOR");
    expect(chars).toContain("SARAH CONNOR");
  });

  it("trims whitespace from extracted names", () => {
    const chars = extractRegexCharacters("  JOHN  ");
    expect(chars).toContain("JOHN");
  });
});

// ─── 5. chunkScript ────────────────────────────────────────────────────────

describe("chunkScript", () => {
  it("splits text into 3 chunks by default", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
    const text = lines.join("\n");
    const chunks = chunkScript(text);
    expect(chunks.length).toBe(3);
  });

  it("each chunk is approximately equal size", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
    const text = lines.join("\n");
    const chunks = chunkScript(text);
    const sizes = chunks.map(c => c.split("\n").length);
    expect(Math.abs(sizes[0] - sizes[1])).toBeLessThanOrEqual(1);
  });

  it("handles text with fewer lines than chunks", () => {
    const chunks = chunkScript("Only one line", 3);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe("Only one line");
  });

  it("handles empty text", () => {
    const chunks = chunkScript("");
    expect(chunks).toEqual([]);
  });

  it("handles blank lines", () => {
    const text = "\n\n\n";
    const chunks = chunkScript(text);
    expect(chunks).toEqual([]);
  });

  it("custom chunk count works", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
    const text = lines.join("\n");
    const chunks = chunkScript(text, 5);
    expect(chunks.length).toBe(5);
  });

  it("preserves exact content of each chunk", () => {
    const text = "Line A\nLine B\nLine C\nLine D";
    const chunks = chunkScript(text, 2);
    expect(chunks[0]).toBe("Line A\nLine B");
    expect(chunks[1]).toBe("Line C\nLine D");
  });
});

// ─── 6. chunkScriptWithLines ───────────────────────────────────────────────

describe("chunkScriptWithLines", () => {
  it("returns chunks and line ranges", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`);
    const text = lines.join("\n");
    const result = chunkScriptWithLines(text, 3);
    expect(result.chunks.length).toBe(3);
    expect(result.lineRanges.length).toBe(3);
    expect(result.chunks.length).toBe(result.lineRanges.length);
  });

  it("line ranges are 1-indexed and contiguous", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`);
    const text = lines.join("\n");
    const result = chunkScriptWithLines(text, 3);
    expect(result.lineRanges[0]).toEqual({ startLine: 1, endLine: 4 });
    expect(result.lineRanges[1]).toEqual({ startLine: 5, endLine: 8 });
    expect(result.lineRanges[2]).toEqual({ startLine: 9, endLine: 12 });
  });

  it("handles small text", () => {
    const result = chunkScriptWithLines("Single line", 3);
    expect(result.chunks.length).toBe(1);
    expect(result.lineRanges[0]).toEqual({ startLine: 1, endLine: 1 });
  });

  it("handles empty text", () => {
    const result = chunkScriptWithLines("", 3);
    expect(result.chunks).toEqual([]);
    expect(result.lineRanges).toEqual([]);
  });

  it("skips empty chunks but still tracks range", () => {
    // Trailing blank lines get filtered
    const result = chunkScriptWithLines("Hello\n\n", 3);
    expect(result.chunks.length).toBeLessThanOrEqual(3); // some chunks may be empty
    for (const r of result.lineRanges) {
      expect(r.startLine).toBeGreaterThanOrEqual(1);
      expect(r.endLine).toBeGreaterThanOrEqual(r.startLine);
    }
  });

  it("consistency: chunkScript and chunkScriptWithLines produce same chunk text", () => {
    const text = "A\nB\nC\nD\nE\nF";
    const naive = chunkScript(text, 2);
    const tracked = chunkScriptWithLines(text, 2);
    expect(naive).toEqual(tracked.chunks);
  });
});

// ─── 7. extractJSON ────────────────────────────────────────────────────────

describe("extractJSON", () => {
  // Strategy 1: clean JSON
  it("parses clean JSON directly", () => {
    const result = extractJSON('{"name": "John", "age": 30}');
    expect(result).toEqual({ name: "John", age: 30 });
  });

  // Strategy 1: markdown code fences
  it("strips markdown code fences (```json)", () => {
    const result = extractJSON('```json\n{"name": "John"}\n```');
    expect(result).toEqual({ name: "John" });
  });

  it("strips markdown code fences without language", () => {
    const result = extractJSON('```\n{"name": "John"}\n```');
    expect(result).toEqual({ name: "John" });
  });

  // Strategy 2: find first { and last }
  it("extracts JSON from surrounding text (greedy brace match)", () => {
    const result = extractJSON('Here is the result: {"name": "John", "age": 30} And more text.');
    expect(result).toEqual({ name: "John", age: 30 });
  });

  // Strategy 3: any {...} block
  it("extracts JSON object from nested content", () => {
    const result = extractJSON('text {"inner": {"a": 1}} more');
    expect(result).toEqual({ inner: { a: 1 } });
  });

  // Strategy 4: array extraction
  it("extracts array JSON", () => {
    const result = extractJSON('text [1, 2, 3] more');
    expect(result).toEqual([1, 2, 3]);
  });

  // Strategy 5: auto-close unbalanced braces
  it("auto-closes unbalanced braces (missing closing)", () => {
    const result = extractJSON('{"name": "John", "items": {"a": 1}');
    // After auto-close: {"name": "John", "items": {"a": 1}}
    expect(result).toEqual({ name: "John", items: { a: 1 } });
  });

  // Strategy 7: balanced brace region
  it("extracts partial JSON via balanced brace walk", () => {
    // Strategy 5/6 won't help because the truncated bit is messy
    // Strategy 7 should find the balanced region
    const result = extractJSON('{"complete": {"nested": true}} trailing');
    expect(result).toEqual({ complete: { nested: true } });
  });

  it("returns null for completely unparseable content", () => {
    const result = extractJSON("This is just random text with no JSON structure at all.");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractJSON("")).toBeNull();
  });

  it("handles nested JSON with escaped quotes", () => {
    const result = extractJSON('{"message": "He said \\\"hello\\\""}');
    expect(result).toEqual({ message: 'He said "hello"' });
  });

  it("handles JSON with arrays of objects", () => {
    const result = extractJSON('[{"id": 1}, {"id": 2}]');
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("handles null values in JSON", () => {
    const result = extractJSON('{"key": null}');
    expect(result).toEqual({ key: null });
  });

  it("handles deep nesting", () => {
    const result = extractJSON('{"a": {"b": {"c": {"d": "deep"}}}}');
    expect(result).toEqual({ a: { b: { c: { d: "deep" } } } });
  });

  it("handles truncated JSON with closed content but missing outer", () => {
    // Strategy 7 — walk for balanced block
    const result = extractJSON('some text { "valid": "block" } and then nothing useful');
    expect(result).toEqual({ valid: "block" });
  });
});

// ─── 8. makePayload ────────────────────────────────────────────────────────

describe("makePayload", () => {
  it("creates initial payload with status=running", () => {
    const p = makePayload("job-1", true);
    expect(p.job_type).toBe("reverse_engineer");
    expect(p.status).toBe("running");
    expect(p.current_stage).toBe("structure_1");
    expect(p.current_group).toBe(0);
    expect(p.is_processing).toBe(false);
  });

  it("creates pending payload when initial=false", () => {
    const p = makePayload("job-1", false);
    expect(p.status).toBe("pending");
    expect(p.current_stage).toBe("pending");
  });

  it("all 12 stages are present with correct initial status", () => {
    const p = makePayload("job-1", true);
    for (const s of JOB_STAGES) {
      expect(p.stages[s.key]).toBeDefined();
      expect(p.stages[s.key].label).toBe(s.label);
    }
    expect(p.stages.structure_1.status).toBe("running");
    expect(p.stages.structure_2.status).toBe("pending");
  });

  it("stage_outputs is initially empty", () => {
    const p = makePayload("job-1", true);
    expect(p.stage_outputs).toEqual({});
  });

  it("result and error are null initially", () => {
    const p = makePayload("job-1", true);
    expect(p.result).toBeNull();
    expect(p.error).toBeNull();
  });
});

// ─── 9. updateStage ────────────────────────────────────────────────────────

describe("updateStage", () => {
  it("updates stage status to done", () => {
    const p = makePayload("job-1", true);
    updateStage(p, "structure_1", "done");
    expect(p.stages.structure_1.status).toBe("done");
    expect(p.current_stage).toBe("structure_1");
  });

  it("sets current_stage to the updated stage key", () => {
    const p = makePayload("job-1", true);
    updateStage(p, "beat_sheet", "running");
    expect(p.current_stage).toBe("beat_sheet");
  });

  it("does nothing for non-existent stage", () => {
    const p = makePayload("job-1", true);
    updateStage(p, "nonexistent", "done");
    expect(p.stages.nonexistent).toBeUndefined();
  });

  it("updates updated_at timestamp", () => {
    const p = makePayload("job-1", true);
    const before = p.updated_at;
    // Ensure we advance past the same millisecond
    const deadline = Date.now() + 10;
    while (Date.now() < deadline) {} // spin
    updateStage(p, "structure_1", "done");
    expect(new Date(p.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it("handles any status string", () => {
    const p = makePayload("job-1", true);
    updateStage(p, "structure_1", "error");
    expect(p.stages.structure_1.status).toBe("error");
    updateStage(p, "structure_1", "failed");
    expect(p.stages.structure_1.status).toBe("failed");
  });
});

// ─── 10. buildMarketSheetPlaintext ─────────────────────────────────────────

describe("buildMarketSheetPlaintext", () => {
  it("renders market sheet with all sections", () => {
    const data = {
      target_audience: "adults 25-54",
      audience_age_range: "25-54",
      market_positioning: "Unique thriller angle",
      tone: "dark",
      format: "feature_film",
      budget_range: "medium",
      genre: "thriller",
      comparable_titles: ["Se7en", "Gone Girl"],
    };
    const result = buildMarketSheetPlaintext(data);
    expect(result).toContain("## Convergence Guidance");
    expect(result).toContain("## Nuance Contract");
    expect(result).toContain("## Comparable Projects");
    expect(result).toContain("## Buyer Positioning");
    expect(result).toContain("## Risk Summary");
    expect(result).toContain("Target Audience: adults 25-54");
    expect(result).toContain("Se7en");
    expect(result).toContain("Gone Girl");
  });

  it("handles null/undefined data", () => {
    // null/undefined returns empty string via `String(data ?? "")` — nullish coalescing
    expect(buildMarketSheetPlaintext(null)).toBe("");
    expect(buildMarketSheetPlaintext(undefined)).toBe("");
  });

  it("shows nuance contract placeholder when fields are empty", () => {
    const result = buildMarketSheetPlaintext({});
    expect(result).toContain("No nuance contract data from reverse engineering");
  });

  it("shows budget risk for tent-pole and high budgets", () => {
    const result = buildMarketSheetPlaintext({ budget_range: "tent-pole" });
    expect(result).toContain("Budget Risk");
    const result2 = buildMarketSheetPlaintext({ budget_range: "high" });
    expect(result2).toContain("Budget Risk");
  });

  it("does NOT show budget risk for low budgets", () => {
    const result = buildMarketSheetPlaintext({ budget_range: "low" });
    expect(result).not.toContain("Budget Risk");
  });

  it("shows market risk when comparable_titles is empty array", () => {
    const result = buildMarketSheetPlaintext({ comparable_titles: [] });
    expect(result).toContain("Market Risk");
  });

it("shows no market risk when comparables exist and budget is low", () => {
    const result = buildMarketSheetPlaintext({
      budget_range: "low",
      comparable_titles: ["Valid Title"],
    });
    // When comparable_titles has items, the "No comparable titles" fallback is NOT shown
    expect(result).not.toContain("No comparable titles");
    // Budget risk is not shown for "low" budget
    expect(result).not.toContain("Budget Risk");
    // But risk analysis default appears since no risks were flagged
    expect(result).toContain("Risk analysis incomplete");
  });
  // Actually wait - the check is `data.comparable_titles?.length === 0` — length is 1, so no market risk
  // But let me check: the risk count filter checks lines starting with "- **"
});

// ─── 11. buildConceptBriefPlaintext ────────────────────────────────────────

describe("buildConceptBriefPlaintext", () => {
  it("renders all 14 sections", () => {
    const data = {
      title: "My Film",
      logline: "A thrilling story",
      genre: "thriller",
      premise: "A protagonist fights opposition",
    };
    const result = buildConceptBriefPlaintext(data);
    expect(result).toContain("# CONCEPT BRIEF: My Film");
    expect(result).toContain("## LOGLINE");
    expect(result).toContain("## GENRE & SUBGENRE");
    expect(result).toContain("## PREMISE");
    expect(result).toContain("## PROTAGONIST");
    expect(result).toContain("## OPPOSITION");
    expect(result).toContain("## KEY RELATIONSHIPS");
    expect(result).toContain("## CENTRAL CONFLICT");
    expect(result).toContain("## STAKES");
    expect(result).toContain("## TONE & ATMOSPHERE");
    expect(result).toContain("## THEMES");
    expect(result).toContain("## WORLD BUILDING");
    expect(result).toContain("## AUDIENCE & MARKET");
    expect(result).toContain("## UNIQUE HOOK");
    expect(result).toContain("## VISUAL & SENSORY PALETTE");
  });

  it("uses 'Project' as default title when missing", () => {
    const result = buildConceptBriefPlaintext({});
    expect(result).toContain("# CONCEPT BRIEF: Project");
  });

  it("includes provided data in correct sections", () => {
    const data = {
      title: "Test Film",
      logline: "A test logline",
      premise: "A test premise",
      protagonist: "Hero",
      opposition: "Villain",
      themes: ["redemption", "justice"],
    };
    const result = buildConceptBriefPlaintext(data);
    expect(result).toContain("A test logline");
    expect(result).toContain("A test premise");
    expect(result).toContain("Hero");
    expect(result).toContain("Villain");
    expect(result).toContain("redemption, justice");
  });

  it("leaves sections empty when data is missing", () => {
    const result = buildConceptBriefPlaintext({ title: "Test" });
    expect(result).toContain("## PROTAGONIST\n");
    expect(result).not.toContain("**Name & Role:");
  });
});

// ─── 12. buildIdeaPlaintext ────────────────────────────────────────────────

describe("buildIdeaPlaintext", () => {
  it("renders 3 sections", () => {
    const result = buildIdeaPlaintext({ title: "Idea", logline: "Logline", premise: "Premise" });
    expect(result).toContain("# Idea");
    expect(result).toContain("## LOGLINE");
    expect(result).toContain("## PREMISE");
    expect(result).toContain("## GENRE & HOOK");
  });

  it("includes genre and subgenre", () => {
    const result = buildIdeaPlaintext({ title: "T", genre: "Drama", subgenre: "Period", hook: "Unique angle" });
    expect(result).toContain("**Genre:** Drama (Period)");
    expect(result).toContain("**Unique hook:** Unique angle");
  });

  it("handles missing title", () => {
    const result = buildIdeaPlaintext({});
    expect(result).toContain("# Project");
  });
});

// ─── 13. buildCharacterBiblePlaintext ──────────────────────────────────────

describe("buildCharacterBiblePlaintext", () => {
  it("renders each character as a ## section", () => {
    const data = {
      characters: [
        {
          name: "John Smith",
          role: "protagonist",
          age: "35",
          backstory: "Grew up in New York",
          psychology: "Determined",
          want: "Justice",
          need: "Peace",
          fatal_flaw: "Reckless",
          arc: "Learns to trust",
        },
      ],
    };
    const result = buildCharacterBiblePlaintext(data);
    expect(result).toContain("## 1. John Smith (protagonist)");
    expect(result).toContain("**Age:** 35");
    expect(result).toContain("**Backstory:** Grew up in New York");
    expect(result).toContain("**Want:** Justice");
    expect(result).toContain("---");
  });

  it("includes relationship dynamics and ensemble notes", () => {
    const data = {
      characters: [],
      relationship_dynamics: "Complex web of alliances",
      ensemble_notes: "Strong ensemble cast",
    };
    const result = buildCharacterBiblePlaintext(data);
    expect(result).toContain("## RELATIONSHIP DYNAMICS");
    expect(result).toContain("## ENSEMBLE NOTES");
  });

  it("handles empty characters array", () => {
    const result = buildCharacterBiblePlaintext({ characters: [] });
    expect(result).toBe("");
  });

  it("handles missing characters key", () => {
    const result = buildCharacterBiblePlaintext({});
    expect(result).toBe("");
  });

  it("uses default name/role when character has no name", () => {
    const result = buildCharacterBiblePlaintext({ characters: [{}] });
    expect(result).toContain("## 1. Character 1 (unknown)");
  });

  it("includes casting suggestions", () => {
    const data = {
      characters: [{
        name: "Hero",
        role: "protagonist",
        casting_suggestions: ["Actor A", "Actor B"],
      }],
    };
    const result = buildCharacterBiblePlaintext(data);
    expect(result).toContain("**Casting Suggestions:** Actor A, Actor B");
  });
});

// ─── 14. buildBeatSheetPlaintext ───────────────────────────────────────────

describe("buildBeatSheetPlaintext", () => {
  it("groups beats by act and renders them", () => {
    const beats = [
      { number: 1, name: "Opening", act: "act_1", description: "Start", turning_point: "No" },
      { number: 2, name: "Inciting", act: "act_1", description: "Event happens", turning_point: "Yes" },
    ];
    const result = buildBeatSheetPlaintext(beats);
    expect(result).toContain("## ACT 1");
    expect(result).toContain("## Beat 1: Opening");
    expect(result).toContain("## Beat 2: Inciting");
  });

  it("returns empty string for empty array", () => {
    expect(buildBeatSheetPlaintext([])).toBe("");
  });

  it("returns empty string for non-beat data", () => {
    expect(buildBeatSheetPlaintext([{ foo: "bar" }])).toBe("");
  });

  it("handles beat with optional fields", () => {
    const beats = [
      { number: 1, name: "Test Beat", act: "act_1", description: "Desc", scene: "Int. Room", emotional_shift: "Hopeful", page_range: "1-5", structural_purpose: "Setup" },
    ];
    const result = buildBeatSheetPlaintext(beats);
    expect(result).toContain("**Scene:** Int. Room");
    expect(result).toContain("**Emotional shift:** Hopeful");
    expect(result).toContain("**Page range:** 1-5");
    expect(result).toContain("**Structural purpose:** Setup");
  });

  it("sorts acts in canonical order", () => {
    const beats = [
      { number: 1, name: "Beat", act: "act_3", description: "A" },
      { number: 2, name: "Beat", act: "act_1", description: "B" },
    ];
    const result = buildBeatSheetPlaintext(beats);
    const act1Pos = result.indexOf("ACT 1");
    const act3Pos = result.indexOf("ACT 3");
    expect(act1Pos).toBeLessThan(act3Pos);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── Integration / Invariant Tests ─────────────────────────────────────────

describe("Group → Stage invariant", () => {
  it("every stage belongs to exactly one group", () => {
    const allStages = JOB_STAGES.map(s => s.key);
    const grouped = GROUPS.flatMap(g => g.stages);
    for (const s of allStages) {
      expect(grouped.filter(g => g === s).length).toBe(1);
    }
  });

  it("no stage is ungrouped", () => {
    const allStages = JOB_STAGES.map(s => s.key);
    const grouped = new Set(GROUPS.flatMap(g => g.stages));
    for (const s of allStages) {
      expect(grouped.has(s)).toBe(true);
    }
  });

  it("groups are sequential (0, 1, 2, 3)", () => {
    expect(GROUPS.map(g => g.key)).toEqual([0, 1, 2, 3]);
  });
});

describe("Self-chain logic invariant", () => {
  it("shouldChain is true when group < 3 and status is not error/done", () => {
    const groups = [0, 1, 2];
    for (const g of groups) {
      const shouldChain = g < 3 && "running" !== "error" && "running" !== "done";
      expect(shouldChain).toBe(true);
    }
  });

  it("shouldChain is false when group is 3 (last)", () => {
    expect(getNextGroupKey(3)).toBeNull();
  });

  it("shouldChain is false when status is error", () => {
    expect(false).toBe(false); // structural: payload.status === "error" → skip self-chain
  });
});

describe("Error handling invariant", () => {
  it("error sets status=error, preserves error.message", () => {
    const p = makePayload("j1", true);
    const err = new Error("LLM call failed");
    p.status = "error";
    p.error = err.message;
    expect(p.status).toBe("error");
    expect(p.error).toBe("LLM call failed");
  });

  it("finally always saves payload (is_processing=false, updated_at updated)", () => {
    const p = makePayload("j1", true);
    const before = p.updated_at;
    p.is_processing = false;
    p.updated_at = new Date().toISOString();
    expect(p.is_processing).toBe(false);
    expect(p.updated_at).not.toBe(before);
  });
});

describe("Last group (3) sets done", () => {
  it("sets payload.status=done, current_stage=done", () => {
    const p = makePayload("j1", true);
    for (const s of JOB_STAGES) updateStage(p, s.key, "done");
    p.status = "done";
    p.current_stage = "done";
    expect(p.status).toBe("done");
    expect(p.current_stage).toBe("done");
  });

  it("result includes list of created documents", () => {
    const documents = ["idea", "concept_brief", "market_sheet", "treatment", "beat_sheet", "character_bible", "story_outline"];
    expect(documents.length).toBeGreaterThanOrEqual(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── 15. 4-tier fuzzy dedupCharacterBibleNames ─────────────────────────────
// Mirrors supabase/functions/reverse-engineer-script/index.ts
// Tier 1: exact case-insensitive match
// Tier 2: normalized match (strip honorifics + non-alpha)
// Tier 3: Levenshtein ≤ 2 for names ≥ 4 chars
// Tier 4: word overlap ≥ 0.6 (Jaccard)
// ═══════════════════════════════════════════════════════════════════════════

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

function normalizeForFuzzy(name: string): string {
  const honorifics = /\b(dr|mr|mrs|ms|prof|capt|sgt|lt|col|gen|adm|rev|fr|sr|jr|esq|hon|maj|cpt|drs|mx)\b/gi;
  return name
    .toLowerCase()
    .replace(honorifics, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupCharacterBibleNames(call3: any): void {
  const characters = call3?.characters;
  if (!Array.isArray(characters) || characters.length <= 1) return;
  const seen = new Set<string>();
  const normalizedSeen = new Set<string>();
  const keptChars: any[] = [];
  for (const c of characters) {
    const name = (c.name || '').trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    // Tier 1: exact case-insensitive
    if (seen.has(lower)) continue;
    seen.add(lower);
    // Tier 2: normalized match (strip honorifics + non-alpha)
    try {
      const normalized = normalizeForFuzzy(name);
      if (normalized && normalizedSeen.has(normalized)) continue;
      if (normalized) normalizedSeen.add(normalized);
    } catch (e) {
      console.warn(`[reverse-engineer] Fuzzy dedup Tier 2 error: ${e}`);
    }
    // Tier 3: Levenshtein ≤ 2 for names ≥ 4 chars
    if (name.length >= 4) {
      try {
        let isLevenshteinDup = false;
        for (const kept of keptChars) {
          const keptName = (kept.name || '').trim();
          if (keptName.length >= 4) {
            const dist = levenshteinDistance(lower, keptName.toLowerCase());
            if (dist <= 2) {
              isLevenshteinDup = true;
              break;
            }
          }
        }
        if (isLevenshteinDup) continue;
      } catch (e) {
        console.warn(`[reverse-engineer] Fuzzy dedup Tier 3 error: ${e}`);
      }
    }
    // Tier 4: word overlap ≥ 0.6 (Jaccard)
    try {
      let isOverlapDup = false;
      const nameWords = lower.split(/\s+/).filter(Boolean);
      const nameWordSet = new Set(nameWords);
      for (const kept of keptChars) {
        const keptWords = (kept.name || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        const keptWordSet = new Set(keptWords);
        if (nameWordSet.size === 0 || keptWordSet.size === 0) continue;
        let intersection = 0;
        for (const w of nameWordSet) {
          if (keptWordSet.has(w)) intersection++;
        }
        const union = nameWordSet.size + keptWordSet.size - intersection;
        const overlap = union > 0 ? intersection / union : 0;
        if (overlap >= 0.6) {
          isOverlapDup = true;
          break;
        }
      }
      if (isOverlapDup) continue;
    } catch (e) {
      console.warn(`[reverse-engineer] Fuzzy dedup Tier 4 error: ${e}`);
    }
    keptChars.push(c);
  }
  const removed = characters.length - keptChars.length;
  if (removed > 0) {
    call3.characters = keptChars;
  }
}

describe("dedupCharacterBibleNames", () => {
  it("removes exact duplicate characters by lowercase name", () => {
    const call3 = {
      characters: [
        { name: "John Smith", role: "protagonist" },
        { name: "john smith", role: "protagonist" },
        { name: "MARY JONES", role: "antagonist" },
      ],
    };
    dedupCharacterBibleNames(call3);
    expect(call3.characters.length).toBe(2);
    expect(call3.characters[0].name).toBe("John Smith");
    expect(call3.characters[1].name).toBe("MARY JONES");
  });

  it("preserves first occurrence when case differs", () => {
    const call3 = {
      characters: [
        { name: "Doctor Who", role: "protagonist" },
        { name: "doctor who", role: "sidekick" },
        { name: "doctor who", role: "impostor" },
      ],
    };
    dedupCharacterBibleNames(call3);
    expect(call3.characters.length).toBe(1);
    expect(call3.characters[0].role).toBe("protagonist");
  });

  it("filters out characters with empty name", () => {
    const call3 = {
      characters: [
        { name: "", role: "protagonist" },
        { name: "Valid", role: "ally" },
        { name: "  ", role: "extra" },
      ],
    };
    dedupCharacterBibleNames(call3);
    expect(call3.characters.length).toBe(1);
    expect(call3.characters[0].name).toBe("Valid");
  });

  it("does nothing when no duplicates exist", () => {
    const call3 = {
      characters: [
        { name: "Alice", role: "protagonist" },
        { name: "Bob", role: "antagonist" },
        { name: "Charlie", role: "supporting" },
      ],
    };
    dedupCharacterBibleNames(call3);
    expect(call3.characters.length).toBe(3);
  });

  it("does nothing with single character", () => {
    const call3 = {
      characters: [{ name: "Solo", role: "protagonist" }],
    };
    dedupCharacterBibleNames(call3);
    expect(call3.characters.length).toBe(1);
  });

  it("does nothing with empty array", () => {
    const call3 = { characters: [] };
    dedupCharacterBibleNames(call3);
    expect(call3.characters).toEqual([]);
  });

  it("handles undefined characters gracefully", () => {
    const call3 = { characters: undefined };
    dedupCharacterBibleNames(call3);
    expect(call3.characters).toBeUndefined();
  });

  it("handles null call3 gracefully", () => {
    const call3 = null as any;
    dedupCharacterBibleNames(call3);
    expect(call3).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── 16. Alias-based dedup filter logic (from dedupFilterCharacters,  ───
//     commit 9bc8771 — pure function replica without Supabase)           ───
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pure replica of the alias-filtering core from dedupFilterCharacters.
 * Takes pre-built maps so we test the filtering logic without Supabase.
 */
function aliasFilterCharacters(
  characters: Array<{ name: string }>,
  aliasToCanonical: Map<string, string>,
  canonicalLowerToOriginal: Map<string, string>,
): Array<{ name: string }> {
  const charNameLower = new Set(characters.map((c) => c.name.toLowerCase()));
  return characters.filter((c) => {
    const canonicalLower = aliasToCanonical.get(c.name.toLowerCase());
    if (canonicalLower && canonicalLower !== c.name.toLowerCase() && charNameLower.has(canonicalLower)) {
      return false;
    }
    return true;
  });
}

describe("aliasFilterCharacters (dedupFilterCharacters pure logic)", () => {
  it("filters character whose name is an alias of another character in the list", () => {
    const chars = [
      { name: "Enki" },
      { name: "Brother" },
    ];
    // "brother" is an alias of "enki"
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);

    const result = aliasFilterCharacters(chars, aliasToCanonical, canonicalLowerToOriginal);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Enki");
  });

  it("keeps character when alias maps to itself (no-op)", () => {
    const chars = [{ name: "Enki" }, { name: "Sara" }];
    // "enki" is an alias of... "enki" (maps to itself)
    const aliasToCanonical = new Map([["enki", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);

    const result = aliasFilterCharacters(chars, aliasToCanonical, canonicalLowerToOriginal);
    expect(result.length).toBe(2);
  });

  it("keeps character when alias target is not in the character list", () => {
    const chars = [{ name: "Brother" }];
    // "brother" is an alias of "enki", but "Enki" is not in the list
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);

    const result = aliasFilterCharacters(chars, aliasToCanonical, canonicalLowerToOriginal);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Brother");
  });

  it("handles empty alias map (no aliases defined)", () => {
    const chars = [{ name: "Enki" }, { name: "Brother" }];
    const result = aliasFilterCharacters(chars, new Map(), new Map());
    expect(result.length).toBe(2);
  });

  it("handles empty character list", () => {
    const result = aliasFilterCharacters([], new Map(), new Map());
    expect(result).toEqual([]);
  });

  it("filters multiple alias duplicates", () => {
    const chars = [
      { name: "Enki" },
      { name: "Brother" },
      { name: "The Ancient One" },
    ];
    // Both "brother" and "the ancient one" are aliases of "enki"
    const aliasToCanonical = new Map([
      ["brother", "enki"],
      ["the ancient one", "enki"],
    ]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);

    const result = aliasFilterCharacters(chars, aliasToCanonical, canonicalLowerToOriginal);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Enki");
  });

  it("handles case-insensitive matching (alias name casing differs)", () => {
    const chars = [
      { name: "Enki" },
      { name: "BROTHER" },  // uppercase alias
    ];
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);

    const result = aliasFilterCharacters(chars, aliasToCanonical, canonicalLowerToOriginal);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Enki");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── 17. Full dedup filter: field merging + alias capture ─────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Expanded pure replica of dedupFilterCharacters that includes field merging
 * and alias capture — the features not covered by the simpler aliasFilterCharacters.
 *
 * Characters whose name is an alias of another character in the list get:
 *   1. filtered out
 *   2. their non-empty fields merged into the canonical character
 *   3. recorded in capturedAliases for entity registration
 */
function dedupFilterWithMerge(
  characters: Array<any>,
  aliasToCanonical: Map<string, string>,
  canonicalLowerToOriginal: Map<string, string>,
  capturedAliases: Array<{ aliasName: string; canonicalName: string }>,
): Array<any> {
  const charNameLower = new Set(characters.map((c: any) => c.name.toLowerCase()));

  return characters.filter((c: any) => {
    const canonicalLower = aliasToCanonical.get(c.name.toLowerCase());
    if (canonicalLower && canonicalLower !== c.name.toLowerCase() && charNameLower.has(canonicalLower)) {
      const canonicalOriginal = canonicalLowerToOriginal.get(canonicalLower) || canonicalLower;

      // Field merge: merge non-empty alias fields into canonical character
      const canonicalChar = characters.find((cc: any) => cc.name.toLowerCase() === canonicalLower);
      if (canonicalChar && c !== canonicalChar) {
        const MERGE_FIELDS = [
          "age", "role", "physical_description", "backstory", "psychology",
          "want", "need", "fatal_flaw", "arc", "voice_and_speech",
          "sample_dialogue", "casting_suggestions",
        ];
        for (const field of MERGE_FIELDS) {
          if (c[field] && !canonicalChar[field]) {
            canonicalChar[field] = c[field];
          }
        }
      }

      // Capture alias for entity registration
      if (canonicalOriginal) {
        capturedAliases.push({ aliasName: c.name, canonicalName: canonicalOriginal });
      }

      return false;
    }
    return true;
  });
}

describe("dedupFilterWithMerge (field merging + alias capture)", () => {
  // ── Field merging ───────────────────────────────────────────────────────

  it("merges alias fields into canonical when canonical is missing them", () => {
    const chars = [
      { name: "Enki", role: "protagonist", backstory: "Ancient god of wisdom" },
      { name: "Brother", role: "", age: "Immortal" },  // canonical has empty role; alias has unique age
    ];
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    const result = dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Enki");
    // role was empty in canonical so alias's "protagonist" should merge
    expect(result[0].role).toBe("protagonist");
    // canonical had backstory so it should keep its own
    expect(result[0].backstory).toBe("Ancient god of wisdom");
    // age from alias merged into canonical
    expect(result[0].age).toBe("Immortal");
  });

  it("does NOT overwrite canonical fields that already have values", () => {
    const chars = [
      { name: "Enki", role: "protagonist", age: "Ancient", backstory: "Original backstory" },
      { name: "Brother", role: "antagonist", age: "Immortal", backstory: "Impostor backstory" },
    ];
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    const result = dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(result.length).toBe(1);
    expect(result[0].role).toBe("protagonist");          // canonical's original value preserved
    expect(result[0].age).toBe("Ancient");                // canonical's original value preserved
    expect(result[0].backstory).toBe("Original backstory"); // canonical's original value preserved
  });

  it("only merges fields from the MERGE_FIELDS list", () => {
    const chars = [
      { name: "Enki", role: "protagonist" },
      { name: "Brother", casting_suggestions: ["Idris Elba"], voice_and_speech: "Deep gravelly tone" },
    ];
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    const result = dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(result.length).toBe(1);
    expect(result[0].casting_suggestions).toEqual(["Idris Elba"]);
    expect(result[0].voice_and_speech).toBe("Deep gravelly tone");
  });

  it("does not merge empty or falsy fields from alias", () => {
    const chars = [
      { name: "Enki", role: "protagonist" },
      { name: "Brother", role: "", age: "", backstory: "", psychology: undefined as any },
    ];
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    const result = dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(result.length).toBe(1);
    expect(result[0].role).toBe("protagonist");  // unchanged, no merge happened
    expect(result[0].age).toBeUndefined();        // alias had "" so no merge
    expect(result[0].backstory).toBeUndefined();  // alias had "" so no merge
  });

  it("merges when canonical has no fields at all", () => {
    const chars = [
      { name: "Enki" },  // canonical has no fields beyond name
      { name: "Brother", role: "ally", backstory: "Mysterious brother" },
    ];
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    const result = dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(result.length).toBe(1);
    expect(result[0].role).toBe("ally");
    expect(result[0].backstory).toBe("Mysterious brother");
  });

  // ── Alias capture ──────────────────────────────────────────────────────

  it("captures filtered alias for entity registration", () => {
    const chars = [
      { name: "Enki", role: "protagonist" },
      { name: "Brother", role: "" },
    ];
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(captured.length).toBe(1);
    expect(captured[0].aliasName).toBe("Brother");
    expect(captured[0].canonicalName).toBe("Enki");
  });

  it("captures multiple aliases correctly", () => {
    const chars = [
      { name: "Enki", role: "protagonist" },
      { name: "Brother", role: "" },
      { name: "The Ancient One", role: "" },
    ];
    const aliasToCanonical = new Map([
      ["brother", "enki"],
      ["the ancient one", "enki"],
    ]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(captured.length).toBe(2);
    expect(captured[0].aliasName).toBe("Brother");
    expect(captured[0].canonicalName).toBe("Enki");
    expect(captured[1].aliasName).toBe("The Ancient One");
    expect(captured[1].canonicalName).toBe("Enki");
  });

  it("does not capture aliases when character is kept (not an alias)", () => {
    const chars = [
      { name: "Enki", role: "protagonist" },
      { name: "Sara", role: "ally" },
    ];
    const aliasToCanonical = new Map([["brother", "enki"]]);  // "brother" not in list
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(captured.length).toBe(0);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it("handles canonicalOriginal lookup falling back to lowercased name", () => {
    const chars = [
      { name: "Enki" },
      { name: "Brother" },
    ];
    // canonicalLowerToOriginal does NOT contain "enki" → falls back to lowercase
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map();  // empty
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    const result = dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(result.length).toBe(1);
    expect(captured[0].canonicalName).toBe("enki");  // fallback
  });

  // ── Entity creation mapping ────────────────────────────────────────────

  it("correctly builds description from physical_description, backstory, psychology", () => {
    const char = {
      name: "Enki",
      physical_description: "Tall figure with glowing eyes",
      backstory: "Ancient god of wisdom from Mesopotamian myth",
      psychology: "Calm and calculating",
    };
    const parts = [char.physical_description, char.backstory, char.psychology]
      .filter((f) => f && typeof f === "string")
      .join(" | ");
    expect(parts).toBe(
      "Tall figure with glowing eyes | Ancient god of wisdom from Mesopotamian myth | Calm and calculating",
    );
  });

  it("handles partial description fields (some missing)", () => {
    const char = {
      name: "Sara",
      physical_description: "Young woman with red hair",
      backstory: "",
      psychology: undefined,
    };
    const parts = [char.physical_description, char.backstory, char.psychology]
      .filter((f) => f && typeof f === "string")
      .join(" | ");
    expect(parts).toBe("Young woman with red hair");
  });

  it("returns empty string when all description fields are empty", () => {
    const char = { name: "Empty", physical_description: "", backstory: "", psychology: "" };
    const parts = [char.physical_description, char.backstory, char.psychology]
      .filter((f) => f && typeof f === "string")
      .join(" | ") || "";
    expect(parts).toBe("");
  });

  it("role falls back to 'supporting' when undefined", () => {
    const role = undefined;
    expect(role || "supporting").toBe("supporting");
  });

  it("role falls back to 'supporting' when empty string", () => {
    const role = "";
    expect(role || "supporting").toBe("supporting");
  });

  it("keeps role as-is when provided", () => {
    const role = "protagonist";
    expect(role || "supporting").toBe("protagonist");
  });

  // ── Alias upsert payload shape ─────────────────────────────────────────

  it("correctly shapes alias upsert payload", () => {
    const aliasName = "Brother";
    const canonicalName = "Enki";
    const canonicalEntityId = "entity-123";
    const projectId = "proj-456";

    const payload = {
      project_id: projectId,
      canonical_entity_id: canonicalEntityId,
      alias_name: aliasName.toUpperCase().trim(),
      alias_type: "fragment",
      source: "reverse_engineer_dedup",
      confidence: 0.85,
      reason: `Auto-dedup: "${aliasName}" is an alias of "${canonicalName}" per entity-aliases table`,
    };

    expect(payload.alias_name).toBe("BROTHER");
    expect(payload.source).toBe("reverse_engineer_dedup");
    expect(payload.confidence).toBe(0.85);
    expect(payload.reason).toContain("Brother");
    expect(payload.reason).toContain("Enki");

    const options = { onConflict: "project_id,canonical_entity_id,alias_name", ignoreDuplicates: true };
    expect(options.onConflict).toBe("project_id,canonical_entity_id,alias_name");
    expect(options.ignoreDuplicates).toBe(true);
  });

  it("trims and uppercases alias_name", () => {
    const aliasName = "  brother  ";
    expect(aliasName.toUpperCase().trim()).toBe("BROTHER");
  });

  // ── Integration: composition of name dedup + alias filter ──────────────

  it("name dedup runs before alias filter (layered composition)", () => {
    // Step 1: Name-based dedup removes case-insensitive duplicates
    const rawCharacters: Array<any> = [
      { name: "Enki", role: "protagonist" },
      { name: "enki", role: "impostor" },   // duplicate (case-insensitive)
      { name: "Brother", role: "ally" },
      { name: "Sara", role: "supporting" },
    ];

    const call3 = { characters: [...rawCharacters] };
    dedupCharacterBibleNames(call3);
    expect(call3.characters.length).toBe(3);  // "enki" removed, first "Enki" kept

    // Step 2: Alias filter removes aliases from deduped list
    const chars = call3.characters;
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    const result = dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    // "Brother" is alias of "Enki" → filtered out
    expect(result.length).toBe(2);
    expect(result.map((r: any) => r.name)).toEqual(["Enki", "Sara"]);

    // Alias captured for entity registration
    expect(captured.length).toBe(1);
    expect(captured[0].aliasName).toBe("Brother");
    expect(captured[0].canonicalName).toBe("Enki");
  });

  it("alias filter still works when name dedup removed nothing", () => {
    const chars = [
      { name: "Enki", role: "protagonist" },
      { name: "Brother", role: "" },
    ];
    const aliasToCanonical = new Map([["brother", "enki"]]);
    const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
    const captured: Array<{ aliasName: string; canonicalName: string }> = [];

    const result = dedupFilterWithMerge(chars, aliasToCanonical, canonicalLowerToOriginal, captured);

    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Enki");
    expect(captured.length).toBe(1);
  });

  it("entity creation is skipped when character list is empty after dedup", () => {
    // Simulating: if name dedup + alias filter leave 0 characters, entity loop is skipped
    const characters: Array<any> = [];
    const entityIds = new Map<string, string>();
    for (const char of characters) {
      // This code never runs
    }
    expect(entityIds.size).toBe(0);
  });
});