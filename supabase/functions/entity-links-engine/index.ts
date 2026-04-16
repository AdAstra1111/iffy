/**
 * entity-links-engine v2
 *
 * Canonical entity extraction and scene linking.
 *
 * Responsibilities:
 * 1. Extract character/location/prop entities from scene content
 * 2. Write to narrative_entities (canonical store) — NOT narrative_units
 * 3. Deduplicate: Levenshtein + n-gram merges variants (Bill Blackstone → 1 record)
 * 4. Store variant_names in meta_json.variant_names[]
 * 5. Create narrative_scene_entity_links using narrative_entities.id
 * 6. Extract character co-occurrences → write to narrative_entity_relations
 *
 * DB Schema:
 * - narrative_scene_entity_links.entity_id → narrative_entities(id) ✓ (already correct FK)
 * - narrative_entity_relations: source_entity_id + target_entity_id → narrative_entities(id)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ─────────────────────────────────────────────────────────────────
   Content hash utility (Gap C — staleness detection)
   SHA-256 of deterministic scene content fields.
   Must be deterministic: same content always produces the same hash.
   ───────────────────────────────────────────────────────────────── */

async function computeContentHash(
  slugline: string,
  sceneText: string,
  characters: string[],
): Promise<string> {
  const input = [
    slugline || "",
    sceneText || "",
    [...characters].sort().join(","),
  ].join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─────────────────────────────────────────────────────────────────
   Deduplication utilities
   ───────────────────────────────────────────────────────────────── */

function normalizeForDedup(name: string): string {
  return name.toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

function ngrams(s: string, n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i <= s.length - n; i++) {
    result.push(s.slice(i, i + n));
  }
  return result;
}

function ngramSimilarity(a: string, b: string, n = 2): number {
  if (a === b) return 1.0;
  if (a.length < n || b.length < n) return a === b ? 1.0 : 0.0;
  const aNgrams = new Set(ngrams(a, n));
  const bNgrams = new Set(ngrams(b, n));
  let intersection = 0;
  for (const ng of aNgrams) if (bNgrams.has(ng)) intersection++;
  const union = aNgrams.size + bNgrams.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isDedupMatch(a: string, b: string): boolean {
  const na = normalizeForDedup(a);
  const nb = normalizeForDedup(b);
  if (na === nb) return true;
  if (na.length < 3 || nb.length < 3) return false;
  const dist = levenshteinDistance(na, nb);
  if (dist <= 2) return true;
  if (Math.max(na.length, nb.length) <= 5 && dist <= 1) return true;
  const sim = ngramSimilarity(na, nb, 2);
  if (sim >= 0.7) return true;
  return false;
}

/**
 * Find the best duplicate match for an incoming name from existing entities.
 * Uses layered matching: exact → entity_key → surname-aware → fuzzy.
 * Returns the existing entity if a match is found, null otherwise.
 */
function findDuplicateEntity(
  rawName: string,
  entityKey: string,
  existingByEntityKey: Map<string, any>,
  existingByCanonicalName: Map<string, any>,
): any | null {
  const upperName = rawName.toUpperCase().trim();
  const nameParts = upperName.split(/\s+/);

  // Layer 1: Exact entity_key match (already handled in main loop, but included for completeness)
  if (existingByEntityKey.has(entityKey)) {
    return existingByEntityKey.get(entityKey);
  }

  // Layer 2: Exact canonical name match (case-insensitive)
  if (existingByCanonicalName.has(upperName)) {
    return existingByCanonicalName.get(upperName);
  }

  // Layer 3: Surname-aware matching
  // Handles: "BILL BLACKSTONE" vs "BLACKSTONE" (surname only), "BILL" vs "BILL BLACKSTONE" (first name only)
  // Rules:
  // - If surname of incoming matches surname of existing, AND incoming is a prefix/suffix of existing, consider match
  // - Bill Blackstone ("BILL BLACKSTONE") vs Blackstone ("BLACKSTONE") → match (same surname)
  // - "BILL BLACKSTONE" vs "BILL" → match (same first name)
  if (nameParts.length >= 1) {
    const incomingSurname = nameParts[nameParts.length - 1];
    const incomingFirstName = nameParts[0];

    for (const [existingName, existingEntity] of existingByCanonicalName) {
      const existingParts = existingName.split(/\s+/);
      if (existingParts.length < 1) continue;
      const existingSurname = existingParts[existingParts.length - 1];
      const existingFirstName = existingParts[0];

      // Same surname check: "BILL BLACKSTONE" vs "BLACKSTONE"
      if (incomingSurname === existingSurname && incomingSurname.length >= 3) {
        // Incoming is a partial name with matching surname
        // Accept if: incoming is a suffix/prefix of existing, OR same first name
        const isSuffix = existingName.endsWith(upperName) || existingName.startsWith(upperName + " ");
        const isFirstNameMatch = nameParts.length === 1 && existingFirstName === incomingFirstName;
        if (isSuffix || isFirstNameMatch) {
          return existingEntity;
        }
        // Also accept if existing is a suffix of incoming: "BLACKSTONE" vs "BILL BLACKSTONE"
        if (upperName.endsWith(" " + existingSurname) || upperName === existingSurname) {
          // Same surname, and at least one part matches beyond just surname
          const nonSurnameIncoming = nameParts.slice(0, -1).join(" ");
          const nonSurnameExisting = existingParts.slice(0, -1).join(" ");
          // Accept if one name is a prefix of the other (same entity, partial mention)
          if (existingName.startsWith(upperName + " ") || upperName.startsWith(existingName + " ") ||
              nonSurnameIncoming.length === 0 || nonSurnameExisting.length === 0) {
            return existingEntity;
          }
        }
      }
    }
  }

  // Layer 4: Generic fuzzy match (Levenshtein + n-gram)
  for (const [existingName, existingEntity] of existingByCanonicalName) {
    if (isDedupMatch(upperName, existingName)) {
      return existingEntity;
    }
  }

  return null;
}

/** Choose the best canonical name from a set of variants */
function pickCanonical(variants: string[]): string {
  // Prefer names with more parts (more complete)
  // Among same-part-count, prefer alphabetical
  return [...variants].sort((a, b) => {
    const aParts = a.trim().split(/\s+/).length;
    const bParts = b.trim().split(/\s+/).length;
    if (bParts !== aParts) return bParts - aParts;
    return a.localeCompare(b);
  })[0];
}

/* ─────────────────────────────────────────────────────────────────
   Inline entity extractor
   ───────────────────────────────────────────────────────────────── */

const NOISE_WORDS = new Set([
  "SOUNDS","SOUND","RINGING","GUNSHOTS","GUNSHOT","EXPLOSIONS","EXPLOSION",
  "MUSIC","SONG","CHORD","HOWLING","SCREAMING","SHOUTING","CHEERING",
  "APPLAUSE","LAUGHTER","GROANING","MOANING","CRYING","WHISPERING",
  "BANGING","CRASHING","SPLASHING","HONKING","SIRENS","ALARMS",
  "BLASTING","THUNDER","RAIN","WIND","FOOTSTEPS","DOOR","DOORS",
  "VARIOUS","ANOTHER","CONTINUED","CONT","BACK","SHOT","ANGLE",
  "CLOSEUP","WIDE","PAN","TILT","ZOOM","REVERSE","INSERT",
  "FOREGROUND","BACKGROUND","MIDGROUND","FLASHBACK","FLASH","MONTAGE",
  "SEQUENCE","INTERCUT","TITLE","CAPTION","TEXT","SUPER",
  "STREETS","STREET","CITY","TOWN","ROAD","BRIDGE","ROOMS","ROOM",
  "FLOOR","FLOORS","WALL","WALLS","CEILING","WINDOW","WINDOWS",
  "BUILDING","BUILDINGS","OFFICE","OFFICES","HOUSE","HOMES",
  "RUNNING","WALKING","STANDING","SITTING","MOVING","LOOKING",
  "TURNING","COMING","GOING","LEANING","SLUMPING","RISING",
]);

function isNoiseName(name: string): boolean {
  const words = name.split(/\s+/);
  return words.some(w => w.length > 2 && NOISE_WORDS.has(w));
}

/** Strip screenplay voice-convention suffixes before entity name matching (Gap D follow-on) */
function stripScreenplaySuffix(name: string): string {
  // Strip screenplay voice-convention suffixes before entity name matching
  // (O.S.) = Off Screen, (V.O.) = Voice Over, (O.C.) = Off Camera
  // (CONT'D) = Continued, (BACKWRD) = Backwards (smoke/drug reference convention)
  // These are screenplay conventions, not distinct entities
  return name
    .replace(/\s*\(O\.S\.\)\s*$/i, "")
    .replace(/\s*\(V\.O\.\)\s*$/i, "")
    .replace(/\s*\(O\.C\.\)\s*$/i, "")
    .replace(/\s*\(CONT'D\)\s*$/i, "")
    .replace(/\s*\(CONT\)\s*$/i, "")
    .replace(/\s*\(CONTINUED\)\s*$/i, "")
    .replace(/\s*\(BACKWRD\)\s*$/i, "")
    .replace(/\s*\([A-Z ]+\)\s*$/g, "")  // Generic (UPPER CASE) annotations
    .trim();
}

function makeEntityKey(name: string, unitType: string): string {
  const normalized = name.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${unitType.toUpperCase()}_${normalized}`;
}

function extractRawFromScenes(
  scenes: any[],
  latestVersionByScene: Map<string, any>,
): { charMap: Map<string, string>; locMap: Map<string, string> } {
  // charMap: rawName → entityKey
  // locMap: rawName → entityKey
  const charMap = new Map<string, string>();
  const locMap = new Map<string, string>();

  const charPattern = /^([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3}(?:\s*\([A-Z\.]+\))?)$/gm;

  for (const scene of scenes) {
    const version = latestVersionByScene.get(scene.id);
    if (!version) continue;

    // 1. characters_present from NIT sync — strip (O.S.), (V.O.) etc. before matching
    for (const charName of (version.characters_present || []) as string[]) {
      const stripped = stripScreenplaySuffix(charName.trim());
      if (!stripped || stripped.length < 2) continue;
      if (isNoiseName(stripped)) continue;
      const key = makeEntityKey(stripped, "char");
      if (!charMap.has(stripped)) charMap.set(stripped, key);
    }

    // 2. ALL-CAPS names from scene content — strip suffixes
    const content = version.content || "";
    let match;
    charPattern.lastIndex = 0;
    while ((match = charPattern.exec(content)) !== null) {
      const raw = match[1].trim();
      const name = stripScreenplaySuffix(raw);
      if (/^(CONT'D|CONTINUED|THE END|FADE (IN|OUT)|CUT TO|DISSOLVE TO|MATCH CUT|SWISH PAN|SMASH CUT|PAGE|BOOKING|COPYRIGHT|DEMO|PRODUCED BY|WRITTEN BY|SCENE|INTRODUCING|RELEASE)/i.test(name)) continue;
      if (/^\d+$/.test(name)) continue;
      if (isNoiseName(name)) continue;
      const key = makeEntityKey(name, "char");
      if (!charMap.has(name)) charMap.set(name, key);
    }

    // 3. Location — use dedicated location field, cleaned of time-of-day suffixes
    // scene_graph_versions.location often has form "TRIBAL VILLAGE.HUT.MORNING" or "PLATEAU - DAY"
    // We strip common time-of-day suffixes to get clean location names
    const locRaw = (version.location || "").trim();
    if (locRaw.length >= 2) {
      const locClean = locRaw
        .replace(/^[\'\/]+/, "")  // strip leading ' or /
        .replace(/\.(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DUSK|DAWN|DARKNESS)$/i, "")
        .replace(/\s*-\s*(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DUSK|DAWN|DARKNESS)$/i, "")
        .replace(/\.(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DUSK|DAWN|DARKNESS)$/i, "")
        .trim();
      if (locClean.length >= 2) {
        const locUpper = locClean.toUpperCase();
        const SKIP_LOCS = new Set(["VARIOUS LOCATIONS","VARIOUS","CONTINUED","SAME","NARRATOR","INT","EXT","INT./EXT","INT/EXT"]);
        if (!SKIP_LOCS.has(locUpper)) {
          const key = makeEntityKey(locUpper, "loc");
          if (!locMap.has(locUpper)) locMap.set(locUpper, key);
        }
      }
    }
  }

  return { charMap, locMap };
}

/* ─────────────────────────────────────────────────────────────────
   Relationship extractor
   ───────────────────────────────────────────────────────────────── */

interface CoOccurrence {
  char1Name: string;
  char2Name: string;
  sceneId: string;
}

function extractCoOccurrences(
  scenes: any[],
  latestVersionByScene: Map<string, any>,
  entityNameToId: Map<string, string>, // canonical entity name → id
): CoOccurrence[] {
  const coOccurrences: CoOccurrence[] = [];

  for (const scene of scenes) {
    const version = latestVersionByScene.get(scene.id);
    if (!version) continue;

    const charsInScene: string[] = [];

    // From characters_present array
    for (const cp of (version.characters_present || []) as string[]) {
      const clean = cp.trim().toUpperCase();
      if (entityNameToId.has(clean)) charsInScene.push(clean);
    }

    // From scene content — ALL-CAPS names
    const charPattern = /^([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3}(?:\s*\([A-Z\.]+\))?)$/gm;
    const content = version.content || "";
    let match;
    charPattern.lastIndex = 0;
    while ((match = charPattern.exec(content)) !== null) {
      const name = match[1].trim().toUpperCase();
      if (/^(CONT'D|CONTINUED|THE END|FADE (IN|OUT)|CUT TO|DISSOLVE TO|MATCH CUT|SWISH PAN|SMASH CUT|PAGE|BOOKING|COPYRIGHT|DEMO|PRODUCED BY|WRITTEN BY|SCENE|INTRODUCING|RELEASE)/i.test(name)) continue;
      if (/^\d+$/.test(name)) continue;
      if (isNoiseName(name)) continue;
      if (entityNameToId.has(name)) charsInScene.push(name);
    }

    // Deduplicate within scene
    const uniqueChars = [...new Set(charsInScene)];

    // All pairs
    for (let i = 0; i < uniqueChars.length; i++) {
      for (let j = i + 1; j < uniqueChars.length; j++) {
        coOccurrences.push({
          char1Name: uniqueChars[i],
          char2Name: uniqueChars[j],
          sceneId: scene.id,
        });
      }
    }
  }

  return coOccurrences;
}

/* ─────────────────────────────────────────────────────────────────
   Main serve handler
   ───────────────────────────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { projectId } = await req.json();
    if (!projectId) throw new Error("projectId required");

    // ── Step 1: Fetch existing canonical entities from narrative_entities ─────
    const { data: existingEntities, error: entityError } = await adminClient
      .from("narrative_entities")
      .select("id, entity_key, canonical_name, entity_type, meta_json")
      .eq("project_id", projectId)
      .in("entity_type", ["character", "location", "prop", "arc", "conflict", "wardrobe"]);

    if (entityError) throw new Error(`Failed to fetch entities: ${entityError.message}`);
    const existingEntitiesList = existingEntities || [];

    // Build fast-lookup maps for dedup
    const canonicalNameToEntity = new Map<string, any>();
    const entityKeyToEntity = new Map<string, any>();
    for (const e of existingEntitiesList) {
      const name = (e.canonical_name || "").toUpperCase().trim();
      if (name) canonicalNameToEntity.set(name, e);
      entityKeyToEntity.set(e.entity_key, e);
    }

    // ── Step 2: Fetch all scenes ─────────────────────────────────────────────
    const { data: scenes, error: scenesError } = await adminClient
      .from("scene_graph_scenes")
      .select("id, scene_key, scene_kind")
      .eq("project_id", projectId)
      .is("deprecated_at", null);

    if (scenesError) throw new Error(`Failed to fetch scenes: ${scenesError.message}`);
    if (!scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ ok: true, linked: 0, byType: {}, message: "No scenes found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sceneIds = scenes.map((s: any) => s.id);

    const { data: versions, error: versionsError } = await adminClient
      .from("scene_graph_versions")
      .select("id, scene_id, content, characters_present, location, slugline")
      .in("scene_id", sceneIds)
      .order("version_number", { ascending: false });

    if (versionsError) throw new Error(`Failed to fetch scene versions: ${versionsError.message}`);

    const latestVersionByScene = new Map<string, any>();
    for (const v of versions ?? []) {
      if (!latestVersionByScene.has(v.scene_id)) {
        latestVersionByScene.set(v.scene_id, v);
      }
    }

    // ── Step 2b: Pre-compute scene content hashes (Gap C — staleness detection) ─
    // Hash of deterministic scene content fields. Same scene → same hash.
    const sceneContentHashBySceneId = new Map<string, string>();
    for (const scene of scenes) {
      const v = latestVersionByScene.get(scene.id);
      if (!v) continue;
      const hash = await computeContentHash(
        v.slugline || "",
        v.content || "",
        v.characters_present || [],
      );
      sceneContentHashBySceneId.set(scene.id, hash);
    }

    // ── Step 3: Seed entity→scene-hashes map with existing entity names (Gap C) ──
    // Pre-populate so existing entities (created in prior runs) get correct inputs_used.
    // canonical_name + all variant_names are keys; each starts with an empty array.
    const entitySceneHashes = new Map<string, string[]>(); // canonicalNameUpper → scene hashes
    for (const e of existingEntitiesList) {
      entitySceneHashes.set((e.canonical_name || "").toUpperCase().trim(), []);
      const variants: string[] = ((e.meta_json || {}) as Record<string, any>).variant_names || [];
      for (const v of variants) {
        const k = v.toUpperCase().trim();
        if (k) entitySceneHashes.set(k, []);
      }
    }

    // ── Step 3b: Populate entitySceneHashes from current scene extraction ─────────
    // For each scene, associate the scene hash with all character names extracted from it.
    // This accumulates onto the pre-seeded keys above.
    for (const scene of scenes) {
      const v = latestVersionByScene.get(scene.id);
      if (!v) continue;
      const sceneHash = sceneContentHashBySceneId.get(scene.id);
      if (!sceneHash) continue;

      // Characters present in this scene
      for (const charName of (v.characters_present || []) as string[]) {
        const upper = charName.trim().toUpperCase();
        if (!entitySceneHashes.has(upper)) entitySceneHashes.set(upper, []);
        entitySceneHashes.get(upper)!.push(sceneHash);
      }

      // ALL-CAPS character names from scene content
      const charPattern = /^([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3}(?:\s*\([A-Z\.]+\))?)$/gm;
      const content = v.content || "";
      let match;
      charPattern.lastIndex = 0;
      while ((match = charPattern.exec(content)) !== null) {
        const name = match[1].trim().toUpperCase();
        if (/^(CONT'D|CONTINUED|THE END|FADE (IN|OUT)|CUT TO|DISSOLVE TO|MATCH CUT|SWISH PAN|SMASH CUT|PAGE|BOOKING|COPYRIGHT|DEMO|PRODUCED BY|WRITTEN BY|SCENE|INTRODUCING|RELEASE)/i.test(name)) continue;
        if (/^\d+$/.test(name)) continue;
        if (isNoiseName(name)) continue;
        if (!entitySceneHashes.has(name)) entitySceneHashes.set(name, []);
        entitySceneHashes.get(name)!.push(sceneHash);
      }
    }

    // Helper: build inputs_used JSON for an entity given its aggregated scene hashes
    const buildInputsUsed = (sceneHashes: string[]): Record<string, unknown> => ({
      parent_plaintext: sceneHashes.length > 0
        ? sceneHashes.slice().sort().join(",")  // sorted composite — deterministic per entity
        : null,
      source_doc_type: "scene_graph",
      scene_count: sceneHashes.length,
    });

    // ── Step 4: Extract raw entities from scenes ───────────────────────────────
    const { charMap, locMap } = extractRawFromScenes(scenes, latestVersionByScene);

    // ── Step 4: Deduplicate + upsert to narrative_entities (canonical) ───────
    type RawEntity = { entityKey: string; unitType: string; canonicalName: string; variants: string[] };
    const toUpsertCanonical: RawEntity[] = [];
    const newNameToEntity: Map<string, any> = new Map(); // temp map for new canonicals

    // Process characters
    for (const [rawName, entityKey] of charMap) {
      const upperName = rawName.toUpperCase().trim();

      // Check if entity_key already exists
      if (entityKeyToEntity.has(entityKey)) {
        const existing = entityKeyToEntity.get(entityKey)!;
        // Update variant_names
        const existingMeta = (existing.meta_json || {}) as Record<string, any>;
        const existingVariants: string[] = existingMeta.variant_names || [];
        if (!existingVariants.includes(upperName)) {
          existingVariants.push(upperName);
          existingMeta.variant_names = existingVariants;
          const mergedName = pickCanonical([existing.canonical_name, ...existingVariants]);
          const hashes = entitySceneHashes.get(mergedName.toUpperCase()) || [];
          await adminClient
            .from("narrative_entities")
            .update({
              meta_json: existingMeta,
              canonical_name: mergedName,
              inputs_used: buildInputsUsed(hashes),
            })
            .eq("id", existing.id);
        }
        newNameToEntity.set(upperName, existing);
        continue;
      }

      // Check dedup using layered matching (entity_key → exact → surname-aware → fuzzy)
      const matchedCanonical = findDuplicateEntity(rawName, entityKey, entityKeyToEntity, canonicalNameToEntity);

      if (matchedCanonical) {
        // Merge: update variant_names on existing canonical
        const existingMeta = (matchedCanonical.meta_json || {}) as Record<string, any>;
        const existingVariants: string[] = existingMeta.variant_names || [];
        if (!existingVariants.includes(upperName)) {
          existingVariants.push(upperName);
          existingMeta.variant_names = existingVariants;
          const mergedCanonical = pickCanonical([matchedCanonical.canonical_name, upperName, ...existingVariants]);
          const hashes = entitySceneHashes.get(mergedCanonical.toUpperCase()) || [];
          await adminClient
            .from("narrative_entities")
            .update({
              meta_json: existingMeta,
              canonical_name: mergedCanonical,
              inputs_used: buildInputsUsed(hashes),
            })
            .eq("id", matchedCanonical.id);
          // Refresh local map
          matchedCanonical.meta_json = existingMeta;
          matchedCanonical.canonical_name = mergedCanonical;
        }
        newNameToEntity.set(upperName, matchedCanonical);
      } else {
        // New entity
        toUpsertCanonical.push({
          entityKey,
          unitType: "character",
          canonicalName: upperName,
          variants: [upperName],
        });
        newNameToEntity.set(upperName, { entity_key: entityKey, _pending: true, _canonicalName: upperName, _variants: [upperName] });
      }
    }

    // Process locations
    for (const [rawName, entityKey] of locMap) {
      const upperName = rawName.toUpperCase().trim();

      if (entityKeyToEntity.has(entityKey)) {
        const existing = entityKeyToEntity.get(entityKey)!;
        const existingMeta = (existing.meta_json || {}) as Record<string, any>;
        const existingVariants: string[] = existingMeta.variant_names || [];
        if (!existingVariants.includes(upperName)) {
          existingVariants.push(upperName);
          existingMeta.variant_names = existingVariants;
          const hashes = entitySceneHashes.get(upperName) || [];
          await adminClient
            .from("narrative_entities")
            .update({ meta_json: existingMeta, inputs_used: buildInputsUsed(hashes) })
            .eq("id", existing.id);
        }
        newNameToEntity.set(upperName, existing);
        continue;
      }

      const matchedCanonical = findDuplicateEntity(rawName, entityKey, entityKeyToEntity, canonicalNameToEntity);

      if (matchedCanonical) {
        const existingMeta = (matchedCanonical.meta_json || {}) as Record<string, any>;
        const existingVariants: string[] = existingMeta.variant_names || [];
        if (!existingVariants.includes(upperName)) {
          existingVariants.push(upperName);
          existingMeta.variant_names = existingVariants;
          const hashes = entitySceneHashes.get(upperName) || [];
          await adminClient
            .from("narrative_entities")
            .update({ meta_json: existingMeta, inputs_used: buildInputsUsed(hashes) })
            .eq("id", matchedCanonical.id);
          matchedCanonical.meta_json = existingMeta;
        }
        newNameToEntity.set(upperName, matchedCanonical);
      } else {
        toUpsertCanonical.push({
          entityKey,
          unitType: "location",
          canonicalName: upperName,
          variants: [upperName],
        });
        newNameToEntity.set(upperName, { entity_key: entityKey, _pending: true, _canonicalName: upperName, _variants: [upperName] });
      }
    }

    // Bulk upsert new entities
    if (toUpsertCanonical.length > 0) {
      const upsertRecords = toUpsertCanonical.map(e => {
        const hashes = entitySceneHashes.get(e.canonicalName) || [];
        return {
          project_id: projectId,
          entity_key: e.entityKey,
          canonical_name: e.canonicalName,
          entity_type: e.unitType,
          source_kind: "screenplay",
          source_key: "entity-links-engine:v2",
          status: "extant",
          meta_json: { source: "entity-links-engine:v2", variant_names: e.variants },
          inputs_used: buildInputsUsed(hashes),
        };
      });

      const { error: upsertErr } = await adminClient
        .from("narrative_entities")
        .upsert(upsertRecords, { onConflict: "project_id,entity_key" });

      if (upsertErr) throw new Error(`Canonical entity upsert failed: ${upsertErr.message}`);
    }

    // ── Step 5: Re-fetch all entities (now canonical + new) ────────────────────
    const { data: allEntities } = await adminClient
      .from("narrative_entities")
      .select("id, entity_key, canonical_name, entity_type, meta_json")
      .eq("project_id", projectId)
      .in("entity_type", ["character", "location", "prop", "arc", "conflict", "wardrobe"]);

    const entityList = allEntities || [];

    // Build name→entity map (uppercase canonical + all variants)
    const nameToEntity = new Map<string, any>();
    for (const e of entityList) {
      const meta = (e.meta_json || {}) as Record<string, any>;
      const variants: string[] = meta.variant_names || [];
      nameToEntity.set((e.canonical_name || "").toUpperCase().trim(), e);
      for (const v of variants) {
        nameToEntity.set(v.toUpperCase().trim(), e);
      }
    }

    // ── Step 5b: Load aliases and resolve alias names to canonical entities (Gap D Layer 3) ─
    // Alias table maps raw name fragments (BI, LACKSTONE, etc.) → canonical entity
    // This resolves fragments that survive as separate entities despite being the same character
    const { data: aliasRows } = await adminClient
      .from("narrative_entity_aliases")
      .select("alias_name, canonical_entity_id")
      .eq("project_id", projectId);

    if (aliasRows && aliasRows.length > 0) {
      for (const row of aliasRows) {
        const aliasKey = (row.alias_name || "").toUpperCase().trim();
        const canonicalEntity = entityList.find((e: any) => e.id === row.canonical_entity_id);
        if (!aliasKey || !canonicalEntity) continue;

        if (nameToEntity.has(aliasKey)) {
          const existing = nameToEntity.get(aliasKey)!;
          if (existing.id !== canonicalEntity.id) {
            // Alias points to a different entity — redirect to canonical
            // Add alias as variant on the canonical entity in DB
            const meta = (canonicalEntity.meta_json || {}) as Record<string, any>;
            const variants: string[] = meta.variant_names || [];
            if (!variants.includes(aliasKey)) {
              variants.push(aliasKey);
              meta.variant_names = variants;
              await adminClient
                .from("narrative_entities")
                .update({ meta_json: meta })
                .eq("id", canonicalEntity.id);
              canonicalEntity.meta_json = meta;
            }
            // Redirect: next lookup of aliasKey gets canonical entity
            nameToEntity.set(aliasKey, canonicalEntity);
          }
        } else {
          // Alias name not yet in map — add it pointing to canonical
          nameToEntity.set(aliasKey, canonicalEntity);
        }
      }
    }

    // ── Step 6: Create scene-entity links ──────────────────────────────────────
    interface Link {
      scene_id: string;
      entity_id: string;
      relation_type: string;
    }

    const linksToInsert: Link[] = [];
    const seen = new Set<string>();

    for (const scene of scenes) {
      const version = latestVersionByScene.get(scene.id);
      if (!version) continue;

      const content = (version.content || "").toUpperCase();
      const charactersPresent: string[] = (version.characters_present || []).map((c: string) => c.toUpperCase());
      const slugline = (version.slugline || "").toUpperCase();
      const location = (version.location || "").toUpperCase();
      const sceneText = `${slugline} ${location} ${content}`;

      for (const [nameKey, entity] of nameToEntity) {
        const upperName = nameKey.toUpperCase();
        if (!upperName || upperName.length < 2) continue;

        const nameParts = upperName.split(/\s+/).filter(p => p.length > 2);
        const firstName = nameParts[0] || "";

        let relationType = "entity_mentioned";
        if (entity.entity_type === "character") {
          const charMatch = charactersPresent.some((cp: string) =>
            cp.includes(upperName) || cp.includes(firstName) ||
            cp.includes(entity.entity_key.replace(/^CHAR_/, "").replace(/_/g, " "))
          );
          if (charMatch || sceneText.includes(upperName) || (firstName && sceneText.includes(firstName))) {
            relationType = "character_present";
          }
        } else if (entity.entity_type === "location") {
          const locMatch = entity.entity_key.replace(/^LOC_/, "").replace(/_/g, " ").toUpperCase();
          if (sceneText.includes(upperName) || sceneText.includes(locMatch)) {
            relationType = "location_present";
          }
        } else if (entity.entity_type === "prop") {
          const propMatch = entity.entity_key.replace(/^PROP_/, "").replace(/_/g, " ").toUpperCase();
          if (sceneText.includes(upperName) || sceneText.includes(propMatch)) {
            relationType = "prop_present";
          }
        }

        const isMentioned = sceneText.includes(upperName) || (firstName && sceneText.includes(firstName));
        if (!isMentioned && relationType === "entity_mentioned") continue;

        if (entity.entity_type === "character" && relationType === "entity_mentioned") {
          const charMatch = charactersPresent.some((cp: string) =>
            cp.includes(upperName) || cp.includes(firstName) ||
            cp.includes(entity.entity_key.replace(/^CHAR_/, "").replace(/_/g, " "))
          );
          if (!charMatch) continue;
          relationType = "character_present";
        }

        const uniq = `${scene.id}::${entity.id}::${relationType}`;
        if (seen.has(uniq)) continue;
        seen.add(uniq);

        linksToInsert.push({
          scene_id: scene.id,
          entity_id: entity.id,
          relation_type: relationType,
          _sceneHash: sceneContentHashBySceneId.get(scene.id) || null,  // temp field for insert
        });
      }
    }

    // Clear old links and insert new
    await adminClient
      .from("narrative_scene_entity_links")
      .delete()
      .eq("project_id", projectId);

    if (linksToInsert.length > 0) {
      const { error: insertError } = await adminClient
        .from("narrative_scene_entity_links")
        .insert(linksToInsert.map((l) => ({
          project_id: projectId,
          scene_id: l.scene_id,
          entity_id: l.entity_id,
          relation_type: l.relation_type,
          confidence: "deterministic",
          source_version_id: latestVersionByScene.get(l.scene_id)?.id || null,
          // Gap C: content hash for staleness detection
          inputs_used: {
            parent_plaintext: l._sceneHash || null,
            source_id: l.scene_id,
            source_doc_type: "scene_graph",
          },
        })));

      if (insertError) throw new Error(`Failed to insert links: ${insertError.message}`);
    }

    // ── Step 6b: Aggregate scene_count on narrative_units (Gap F — character anchoring) ──
    // Always recalculate from narrative_scene_entity_links source of truth.
    const { error: sceneCountError } = await adminClient
      .rpc("aggregate_character_scene_counts", { p_project_id: projectId });
    if (sceneCountError) {
      console.error(`[entity-links-engine] scene_count aggregation failed: ${sceneCountError.message}`);
      // Non-fatal: scene_count is advisory, don't fail the whole run
    }

    // ── Step 7: Extract co-occurrences → narrative_entity_relations ────────────
    // Build entityName → entityId map (canonical + variants)
    const entityNameToId = new Map<string, string>();
    for (const e of entityList) {
      entityNameToId.set((e.canonical_name || "").toUpperCase().trim(), e.id);
      const variants: string[] = ((e.meta_json || {}) as Record<string, any>).variant_names || [];
      for (const v of variants) entityNameToId.set(v.toUpperCase().trim(), e.id);
    }

    const coOccurrences = extractCoOccurrences(scenes, latestVersionByScene, entityNameToId);

    // Aggregate to unique character pairs
    const relationPairs = new Map<string, { source: string; target: string; scenes: Set<string> }>();
    for (const co of coOccurrences) {
      const sourceId = entityNameToId.get(co.char1Name);
      const targetId = entityNameToId.get(co.char2Name);
      if (!sourceId || !targetId || sourceId === targetId) continue;

      const key = [sourceId, targetId].sort().join("::");
      if (!relationPairs.has(key)) {
        relationPairs.set(key, { source: sourceId, target: targetId, scenes: new Set() });
      }
      relationPairs.get(key)!.scenes.add(co.sceneId);
    }

    // Clear old relations and insert new
    await adminClient
      .from("narrative_entity_relations")
      .delete()
      .eq("project_id", projectId);

    const relationsToInsert = [];
    for (const [, pair] of relationPairs) {
      relationsToInsert.push({
        project_id: projectId,
        source_entity_id: pair.source,
        target_entity_id: pair.target,
        relation_type: "co_occurs",
        source_kind: "entity-links-engine:v2",
        confidence: Math.min(1.0, pair.scenes.size / 10), // more scenes = higher confidence
      });
    }

    if (relationsToInsert.length > 0) {
      const { error: relError } = await adminClient
        .from("narrative_entity_relations")
        .insert(relationsToInsert);

      if (relError) throw new Error(`Failed to insert relations: ${relError.message}`);
    }

    // ── Step 7b: Auto-populate alias table from co-occurrence (Gap D Layer 3) ──
    // If entity A appears in >70% of entity B's scenes and vice versa, they are
    // likely the same character with a fragment name. Create an auto-alias.
    // Uses a two-pass approach: first collect co-scene counts per pair, then evaluate.
    try {
      // Pass 1: collect (scene_id, entity_id) pairs
      const { data: linkData } = await adminClient
        .from("narrative_scene_entity_links")
        .select("scene_id, entity_id")
        .eq("project_id", projectId)
        .eq("relation_type", "character_present");

      if (linkData && linkData.length > 0) {
        // Build scene→entityIds map
        const sceneEntities = new Map<string, string[]>();
        for (const row of linkData as any[]) {
          if (!sceneEntities.has(row.scene_id)) sceneEntities.set(row.scene_id, []);
          sceneEntities.get(row.scene_id)!.push(row.entity_id);
        }

        // Build entity pair co-occurrence counts
        const pairCounts = new Map<string, { co: number; a: number; b: number }>();
        for (const [, entityIds] of sceneEntities) {
          // Deduplicate within scene
          const unique = [...new Set(entityIds)];
          for (let i = 0; i < unique.length; i++) {
            for (let j = i + 1; j < unique.length; j++) {
              const key = [unique[i], unique[j]].sort().join("::");
              if (!pairCounts.has(key)) {
                // We'll fill a/b counts after
                pairCounts.set(key, { co: 0, a: 0, b: 0 });
              }
              const c = pairCounts.get(key)!;
              c.co++;
            }
          }
        }

        // Get per-entity total scene counts
        const entitySceneCount = new Map<string, number>();
        for (const row of linkData as any[]) {
          entitySceneCount.set(row.entity_id, (entitySceneCount.get(row.entity_id) || 0) + 1);
        }

        // Evaluate pairs: require co > 3 scenes AND co/total > 0.7 for both
        const newAliases = [];
        for (const [key, counts] of pairCounts) {
          const [idA, idB] = key.split("::");
          const totalA = entitySceneCount.get(idA) || 0;
          const totalB = entitySceneCount.get(idB) || 0;
          if (counts.co < 3) continue;
          const ratioA = counts.co / totalA;
          const ratioB = counts.co / totalB;
          if (ratioA > 0.7 && ratioB > 0.7) {
            const entityA = entityList.find((e: any) => e.id === idA);
            const entityB = entityList.find((e: any) => e.id === idB);
            if (!entityA || !entityB) continue;
            // Shorter name → alias of the longer canonical name
            const [shorter, longer] = entityA.canonical_name.length <= entityB.canonical_name.length
              ? [entityA, entityB] : [entityB, entityA];
            const aliasKey = (shorter.canonical_name || "").toUpperCase().trim();
            if (!aliasKey || aliasKey.length < 2) continue;
            newAliases.push({
              project_id: projectId,
              canonical_entity_id: longer.id,
              alias_name: aliasKey,
              source: "co_occurrence",
              confidence: Math.min(0.95, counts.co / Math.max(totalA, totalB)),
              reason: `Auto: co-occurs ${counts.co}x (>70% of both entities' ${Math.min(totalA, totalB)} scenes)`,
            });
          }
        }

        if (newAliases.length > 0) {
          await adminClient
            .from("narrative_entity_aliases")
            .upsert(newAliases, { onConflict: "project_id,alias_name" });
        }
      }
    } catch (aliasErr) {
      console.error(`[entity-links-engine] alias auto-population failed: ${(aliasErr as Error).message}`);
    }
    const byType: Record<string, number> = {};
    for (const l of linksToInsert) {
      byType[l.relation_type] = (byType[l.relation_type] || 0) + 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        linked: linksToInsert.length,
        byType,
        entitiesCanonical: entityList.length,
        relationsCreated: relationsToInsert.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
