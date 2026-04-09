/**
 * text-extract-engine — NEW intake stage for IFFY entity pipeline
 *
 * Parses scene_graph_scenes content and extracts:
 *   - characters  (ALL_CAPS names in dialogue)
 *   - locations   (INT./EXT. scene headings)
 *   - props       (quoted items in action lines)
 *   - wardrobe    (clothing/fabric references in action lines)
 *
 * Writes to narrative_units with unit_type = 'character'|'location'|'prop'|'wardrobe'
 * and source_doc_type = 'screenplay'.
 *
 * Idempotent: uses upsert on (project_id, unit_key) to avoid duplicates.
 * Can be re-run safely at any time — stale entries get refreshed.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExtractResult {
  characters: string[];
  locations: string[];
  props: string[];
  wardrobe: string[];
}

interface EntityRow {
  unit_key: string;
  canonical_name: string;
  unit_type: string;
  payload_json: Record<string, any>;
}

/* ── noise-word blacklist ── */
// Words that appear in ALL-CAPS screenplays but are NOT character names.
// Includes: sound/music cues, scene direction, camera directions, generic phrases.
const NOISE_WORDS = new Set([
  // Sound / music cues
  "SOUNDS", "SOUND", "RINGING", "GUNSHOTS", "GUNSHOT", "EXPLOSIONS", "EXPLOSION",
  "MUSIC", "SONG", "CHORD", "HOWLING", "SCREAMING", "SHOUTING", "CHEERING",
  "APPLAUSE", "LAUGHTER", "GROANING", "MOANING", "CRYING", "WHISPERING",
  "BANGING", "CRASHING", "SPLASHING", "HONKING", "SIRENS", "ALARMS",
  "BLASTING", "THUNDER", "RAIN", "WIND", "FOOTSTEPS", "DOOR", "DOORS",
  // Scene / direction / camera
  "VARIOUS", "ANOTHER", "CONTINUED", "CONT", "BACK", "SHOT", "ANGLE",
  "CLOSEUP", "WIDE", "PAN", "TILT", "ZOOM", "REVERSE", "INSERT",
  "FOREGROUND", "BACKGROUND", "MIDGROUND", "OVER", "UNDER", "VIA",
  // Generic screenplay formatting
  "FLASHBACK", "FLASH", "MONTAGE", "SEQUENCE", "INTERCUT", "TITLE",
  "CAPTION", "TEXT", "SUPER", "SUPERIMPOSE",
  // Descriptive non-names (appear in location/action lines)
  "STREETS", "STREET", "CITY", "TOWN", "ROAD", "BRIDGE", "ROOMS", "ROOM",
  "FLOOR", "FLOORS", "WALL", "WALLS", "CEILING", "WINDOW", "WINDOWS",
  "BUILDING", "BUILDINGS", "OFFICE", "OFFICES", "HOUSE", "HOMES",
  // Common verbs/adjectives that slip through
  "RUNNING", "WALKING", "STANDING", "SITTING", "MOVING", "LOOKING",
  "TURNING", "COMING", "GOING", "LEANING", "SLUMPING", "RISING",
]);

function containsNoiseWord(name: string): boolean {
  const words = name.split(/\s+/);
  return words.some(w => NOISE_WORDS.has(w));
}

/* ── helpers ── */

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Extract scene heading location.
 * Input: "EXT. NEPALESE MOUNTAINS – DAWN"
 * Output: "NEPALESE MOUNTAINS"
 */
function extractLocation(content: string): string | null {
  const match = content.match(/^(?:INT\.|EXT\.|int\.|ext\.)\s+([^–-]+)/m);
  if (!match) return null;
  const loc = match[1].trim().replace(/\s+/g, " ");
  // Filter generic/non-specific location headers
  const genericLocations = ["VARIOUS LOCATIONS", "VARIOUS", "CONTINUED", "SAME", "INT./EXT.", "INT/EXT"];
  if (genericLocations.includes(loc.toUpperCase())) return null;
  if (loc.length < 3) return null;
  return loc;
}

/**
 * Extract characters from ALL-CAPS names in dialogue.
 * Pattern: standalone ALL-CAPS name (2-4 words) at start of line.
 * Filters noise: scene headings, page numbers, generic phrases.
 */
function extractCharacters(content: string): string[] {
  const chars = new Set<string>();
  // Match ALL-CAPS name lines: 1-4 words of 2+ chars each, possibly with (O.S.) or (V.O.)
  // Words must be all uppercase letters (no mixed case). Includes single-name characters.
  const charPattern = /^([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3}(?:\s*\([A-Z\.]+\))?)$/gm;
  let match;
  while ((match = charPattern.exec(content)) !== null) {
    const name = match[1].trim();
    // Skip noise: generic uppercase phrases (prefix-based)
    if (
      /^(CONT'D|CONTINUED|THE END|FADE (IN|OUT)|CUT TO|DISSOLVE TO|MATCH CUT|SWISH PAN|SMASH CUT|PAGE|BOOKING|COPYRIGHT|DEMO|PRODUCED BY|WRITTEN BY|SCENE|ACT |INTRODUCING|BOOK|RELEASE)/i.test(name) ||
      /^\d+$/.test(name) // pure numbers
    ) {
      continue;
    }
    // Remove parentheticals like (O.S.), (V.O.), (cont'd)
    const cleanName = name.replace(/\s*\([A-Z\.]+\)\s*/g, "").trim();
    // Validate: 1-4 words, each 2+ uppercase letters
    const words = cleanName.split(/\s+/).filter(w => w.length >= 2);
    if (words.length < 1 || words.length > 4) continue;
    if (!words.every(w => /^[A-Z]{2,}$/.test(w))) continue;
    // Filter out candidates containing noise words (sound cues, scene directions, etc.)
    if (containsNoiseWord(cleanName)) continue;
    chars.add(cleanName);
  }
  return Array.from(chars);
}

/**
 * Remove near-duplicate character names (script OCR artefacts).
 * E.g. "BILL BLACKSTOSNE" ← typo of "BILL BLACKSTONE"
 * E.g. "LL BLACKSTONE" ← truncated "BILL BLACKSTONE"
 * Strategy: if two names share the same last-word and the first word differs by
 * ≤2 characters (Levenshtein), drop the shorter/damaged one.
 */
function deduplicateCharacters(names: string[]): string[] {
  if (names.length <= 1) return names;
  const drop = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    if (drop.has(names[i])) continue;
    for (let j = i + 1; j < names.length; j++) {
      if (drop.has(names[j])) continue;
      const wi = names[i].split(/\s+/);
      const wj = names[j].split(/\s+/);
      // Only dedupe if same number of words and same last word
      if (wi.length !== wj.length) continue;
      if (wi[wi.length - 1] !== wj[wj.length - 1]) continue;
      // Compare first words with Levenshtein distance ≤ 2 (same last word)
      const d = levenshtein(wi[0], wj[0]);
      if (d <= 2 && d > 0) {
        // Drop the shorter/truncated one
        drop.add(wi.length <= wj.length ? names[i] : names[j]);
      }
      // Fallback: first word identical, last words differ by Levenshtein ≤ 1 (script typo)
      // E.g. "BILL BLACKSTONE" vs "BILL BLACKSTOSNE"
      if (wi[0] === wj[0]) {
        const lastD = levenshtein(wi[wi.length - 1], wj[wj.length - 1]);
        if (lastD === 1) {
          // Drop the one with the typo (last word longer = has the extra char)
          drop.add(wi[wi.length - 1].length >= wj[wj.length - 1].length ? names[i] : names[j]);
        }
      }
      // Full-name Levenshtein fallback: if full names differ by ≤3 chars, drop shorter
      // Catches OCR artefacts where both first and last words are corrupted
      const fullD = levenshtein(names[i], names[j]);
      if (fullD > 0 && fullD <= 3 && names[i].split(/\s+/).length === names[j].split(/\s+/).length) {
        drop.add(names[i].length <= names[j].length ? names[i] : names[j]);
      }
    }
  }
  return names.filter(n => !drop.has(n));
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Extract props: quoted strings in action lines.
 */
function extractProps(content: string): string[] {
  const props = new Set<string>();
  const quotePattern = /"([^"]{3,50})"/g;
  let match;
  while ((match = quotePattern.exec(content)) !== null) {
    const item = match[1].trim();
    // Skip generic quoted text
    if (
      item.length < 3 ||
      /^(the|a|an|his|her|their|this|that|it)$/i.test(item)
    ) {
      continue;
    }
    props.add(item);
  }
  return Array.from(props);
}

/**
 * Extract wardrobe hints: clothing/fabric references.
 */
function extractWardrobe(content: string): string[] {
  const wardrobe = new Set<string>();
  // Common wardrobe/fabric patterns
  const patterns = [
    /\b(wears?)\s+([^,.\n]{5,40})/gi,
    /\b(in)\s+(?:a |an |the )?([\w\s]+?)(?:dress|suit|jacket|coat|robe|gown|uniform|armor|furs?|leather|velvet)/gi,
    /\b(layered)\s+([\w\s]+)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const item = (match[2] || match[1] || "").trim();
      if (item.length > 2) {
        wardrobe.add(item);
      }
    }
  }
  return Array.from(wardrobe).slice(0, 20); // cap at 20 items per scene
}

/* ── extraction ── */

function extractEntities(content: string): ExtractResult {
  return {
    characters: extractCharacters(content),
    locations: extractLocation(content) ? [extractLocation(content)!] : [],
    props: extractProps(content),
    wardrobe: extractWardrobe(content),
  };
}

/* ── main handler ── */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { projectId, forceRefresh } = body;

    if (!projectId) {
      throw new Error("projectId required");
    }

    console.log(`[text-extract] Starting for project ${projectId}, force=${!!forceRefresh}`);

    // ── 1. Get all scenes with latest version content ────────────────────────
    const { data: scenes, error: scenesErr } = await supabase
      .from("scene_graph_scenes")
      .select("id, scene_key, project_id")
      .eq("project_id", projectId)
      .is("deprecated_at", null);

    if (scenesErr) throw new Error(`Failed to fetch scenes: ${scenesErr.message}`);
    if (!scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ ok: true, extracted: 0, message: "No scenes found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[text-extract] Found ${scenes.length} scenes`);

    // ── 2. Get latest version content for each scene ────────────────────────
    const sceneIds = scenes.map((s) => s.id);
    const { data: versions, error: verErr } = await supabase
      .from("scene_graph_versions")
      .select("id, scene_id, content, version_number")
      .in("scene_id", sceneIds)
      .order("version_number", { ascending: false });

    if (verErr) throw new Error(`Failed to fetch versions: ${verErr.message}`);

    // Build scene_id → latest version content map
    const versionMap = new Map<string, { id: string; content: string }>();
    for (const v of versions || []) {
      if (!versionMap.has(v.scene_id)) {
        versionMap.set(v.scene_id, { id: v.id, content: v.content || "" });
      }
    }

    // ── 3. Extract entities from each scene ─────────────────────────────────
    // First pass: collect all raw characters for global deduplication
    const allCharacters: string[] = [];
    const entityMap = new Map<string, EntityRow>(); // unit_key → row

    for (const scene of scenes) {
      const version = versionMap.get(scene.id);
      if (!version || !version.content) continue;
      const { characters, locations, props, wardrobe } = extractEntities(version.content);
      allCharacters.push(...characters);
      for (const loc of locations) {
        const key = `loc_${slugify(loc)}`;
        entityMap.set(key, { unit_key: key, canonical_name: loc, unit_type: "location", payload_json: { name: loc, source: "text_extract" } });
      }
      for (const prop of props) {
        const key = `prop_${slugify(prop)}`;
        entityMap.set(key, { unit_key: key, canonical_name: prop, unit_type: "prop", payload_json: { name: prop, source: "text_extract" } });
      }
      for (const item of wardrobe) {
        const key = `ward_${slugify(item)}`;
        entityMap.set(key, { unit_key: key, canonical_name: item, unit_type: "wardrobe", payload_json: { name: item, source: "text_extract" } });
      }
    }

    // Deduplicate characters globally (handles OCR artefacts like "LL BLACKSTONE" vs "BILL BLACKSTONE")
    const cleanCharacters = deduplicateCharacters([...new Set(allCharacters)]);
    for (const char of cleanCharacters) {
      const key = `char_${slugify(char)}`;
      entityMap.set(key, { unit_key: key, canonical_name: char, unit_type: "character", payload_json: { name: char, source: "text_extract" } });
    }

    const entityRows = Array.from(entityMap.values());
    console.log(`[text-extract] Extracted ${entityRows.length} unique entities`);

    if (entityRows.length === 0) {
      return new Response(JSON.stringify({ ok: true, extracted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Upsert entities into narrative_units ───────────────────────────────
    const now = new Date().toISOString();
    const upsertRows = entityRows.map((row) => ({
      project_id: projectId,
      unit_key: row.unit_key,
      unit_type: row.unit_type,
      payload_json: row.payload_json,
      source_doc_type: "screenplay",
      source_doc_version_id: null as string | null,
      status: "active",
      confidence: 0.7,
      extraction_method: "text_extract",
      stale_reason: null,
      updated_at: now,
    }));

    const { error: upsertErr } = await supabase
      .from("narrative_units")
      .upsert(upsertRows, {
        onConflict: "project_id,unit_type,unit_key",
        ignoreDuplicates: false,
      });

    if (upsertErr) {
      console.error("[text-extract] Upsert error:", upsertErr);
      throw new Error(`Failed to upsert entities: ${upsertErr.message}`);
    }

    console.log(`[text-extract] Successfully upserted ${entityRows.length} entities`);

    return new Response(
      JSON.stringify({
        ok: true,
        extracted: entityRows.length,
        byType: {
          character: entityRows.filter((r) => r.unit_type === "character").length,
          location: entityRows.filter((r) => r.unit_type === "location").length,
          prop: entityRows.filter((r) => r.unit_type === "prop").length,
          wardrobe: entityRows.filter((r) => r.unit_type === "wardrobe").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[text-extract] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
