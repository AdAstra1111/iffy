// @ts-nocheck
/**
 * prop-atomiser — Phase 5
 *
 * Extracts props from scene content and generates
 * rich production-ready prop atoms via OpenRouter MiniMax M2.7.
 *
 * Actions:
 *   extract      — scan scene content for significant props, insert stub atoms
 *   generate     — LLM-generate attributes for pending prop atoms (background)
 *   status       — return all prop atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function makeStubAttributes(name: string, sceneCount: number) {
  return {
    canonicalName: name,
    aliases: [],
    propType: "held",
    physicalDescription: "",
    primaryColor: "",
    materialComposition: [],
    condition: "",
    sizeCategory: "medium",
    distinctiveFeatures: [],
    narrativeFunction: "",
    firstAppearance: "",
    lastAppearance: "",
    frequencyInScript: sceneCount,
    usageContexts: [],
    associatedCharacters: [],
    associatedLocations: [],
    symbolicMeaning: "",
    stateChanges: [],
    productionComplexity: "moderate",
    fabricationRequirements: [],
    specialHandling: [],
    referenceImageTerms: [],
    propBudgetEstimate: "",
    confidence: 0,
    readinessBadge: "foundation",
    generationStatus: "pending",
  };
}

// Generic stop words + structural words to filter out
const STOP_WORDS = new Set([
  "THE", "A", "AN", "SOME", "THIS", "THAT", "THESE", "THOSE", "HIS", "HER",
  "ITS", "OUR", "YOUR", "THEIR", "EVERY", "EACH", "ALL", "BOTH", "ANY",
  // Scene directions and slugline prefixes
  "INT", "EXT", "INT.", "EXT.", "FADE OUT", "FADE TO", "FADE IN",
  "COLD OPEN", "CUT TO", "DISSOLVE TO", "SMASH CUT", "MATCH CUT",
  "JUMP CUT", "FLASHBACK", "END FLASHBACK", "BACK TO PRESENT",
  "LATER", "CONTINUOUS", "MOMENTS LATER", "CLOSE ON", "POV",
  "SCENE 1", "SCENE 2", "SCENE 3", "SCENE 4", "SCENE 5",
  "SCENE",
  "DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "EVENING", "SUNSET", "SUNRISE",
  // Time periods
  "TITLE", "OPENING", "CLOSING", "PRE", "POST",
  // Generic descriptors often in scene direction
  "MALE", "FEMALE", "WOMAN", "MAN", "BOY", "GIRL", "CHILD",
  "CLOSE", "FILMING", "OPENING", "CLOSING",
  "INT.", "EXT.", "INT/EXT",
  "WIDE", "SHOT", "POV", "ANGLE", "CAMERA", "CU", "ECU", "MS", "LS",
  "LATER", "CONTINUOUS", "MORNING", "EVENING", "AFTERNOON", "MOMENT",
  "TIME", "MAN", "WOMAN", "GIRL", "BOY", "PERSON", "PEOPLE", "SOMEONE",
  "EVERYONE", "NOBODY", "NOTHING", "SOMETHING", "ANYTHING", "EVERYTHING",
  "PAGE BREAK", "PAGE", "BREAK",
  // Time/transition markers that leak from sluglines
  "KST", "EST", "PST", "LATE", "EARLY", "MOMENTS", "SOMETIME", "ALMOST",
  "CONT", "BACK", "NEXT", "FEW", "HOURS", "MINUTES", "SECONDS", "DAWN",
  "DUSK", "SUNRISE", "SUNSET", "OVER", "THROUGH", "AGAINST", "ALONG",
  "AROUND", "BETWEEN", "BEHIND", "BEFORE", "AFTER", "ABOVE", "BELOW",
  "INSIDE", "OUTSIDE", "ACROSS", "UNDER", "UPON",
  "TWO", "THREE", "FOUR", "MORE", "LESS", "ALSO", "JUST", "STILL",
]);

// ── Lowercase prop dictionary — for narrative prose (season_script vertical drama) ──
// These words are detected in the season_script fallback even when not in ALL CAPS.
const PROP_NOUNS = new Set([
  // Kitchen / food prep (cooking competition show)
  "knife", "knives", "pan", "pans", "pot", "pots", "plate", "plates", "bowl", "bowls",
  "tray", "trays", "spoon", "spoons", "fork", "forks", "whisk", "spatula", "ladle",
  "grater", "peeler", "colander", "strainer", "scale", "scales", "thermometer",
  "timer", "oven", "stove", "burner", "grill", "griddle", "fryer", "steamer",
  "blender", "mixer", "processor", "slicer", "mandoline", "shears", "scissors",
  "cutting board", "cutting boards", "chopsticks", "skewer", "skewers",
  "rolling pin", "pastry brush", "piping bag", "mold", "molds", "cutter", "cutters",
  // Serveware
  "platter", "platters", "dish", "dishes", "cup", "cups", "glass", "glasses",
  "mug", "mugs", "jug", "pitcher", "carafe", "teapot", "coffeepot",
  // Food items that are props
  "fish", "meat", "steak", "chicken", "herbs", "spices", "sauce", "sauces",
  "oil", "butter", "cream", "stock", "broth", "garnish", "garnishes",
  // Weapons / tools
  "gun", "rifle", "pistol", "sword", "blade", "axe", "hammer", "wrench",
  "screwdriver", "drill", "saw", "flashlight", "rope", "chain", "lock", "key",
  // Documents / tech
  "phone", "laptop", "tablet", "camera", "remote", "battery", "charger",
  "letter", "envelope", "file", "folder", "notebook", "pen", "pencil",
  "map", "ticket", "receipt", "money", "cash", "wallet", "purse", "bag",
  // Clothing that are costume-props
  "coat", "jacket", "scarf", "gloves", "hat", "mask", "goggles", "belt",
  // Furniture / set dressing
  "chair", "table", "desk", "couch", "sofa", "bed", "lamp", "clock",
  "mirror", "painting", "picture", "vase", "candle", "curtain", "rug",
  // Miscellaneous
  "candle", "match", "lighter", "cigarette", "bottle", "can", "box",
  "briefcase", "suitcase", "backpack", "umbrella", "cane", "wheelchair",
  "trophy", "medal", "ribbon", "flag", "sign", "poster", "banner",
]);

// Narrative role keywords that boost a prop's score
const NARRATIVE_KEYWORDS = [
  "carries", "carry", "carried",
  "holds", "hold", "held",
  "grips", "grip", "gripped",
  "uses", "use", "used",
  "shows", "show", "shown",
  "gives", "give", "given",
  "takes", "take", "taken",
  "drops", "drop", "dropped",
  "reveals", "reveal", "revealed",
  "opens", "open", "opened",
  "unlocks", "unlock", "unlocked",
  "pulls", "pull", "pulled",
  "picks", "pick", "picked",
  "throws", "throw", "thrown",
  "hands", "passes", "pass",
  "places", "place", "placed",
  "puts", "put",
  "clutches", "clutch",
  "wields", "wield",
  "raises", "raise",
];

/**
 * Extract capitalized noun phrases from text.
 * Returns array of candidates (uppercased for matching).
 */
function extractCapitalizedNounPhrases(text: string): string[] {
  if (!text) return [];

  // Normalize \u2029 (paragraph separator) — V8 treats it as \s, 
  // which chains adjacent ALL-CAPS words into false multi-word phrases.
  // Also normalize real newlines to spaces so scene directions split across
  // lines (like "COLD OPEN\nINT") don't form false multi-word phrases.
  const normalized = text.replace(/\u2029/g, "\0").replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ");

  const results: Set<string> = new Set();

  // Match 1-3 word sequences where first word is capitalized
  // but NOT at start of sentence (i.e. not following . ! ? or start of string after newline)
  // We look for patterns like: "the Gun", "a Phone", "THE KNIFE"
  // Simplified: find ALLCAPS words of 3+ chars (typical screenplay prop notation)
  // Also find Title Case words that appear inline
  const allCapsPattern = /\b([A-Z]{2,}(?:\s+[A-Z]{2,}){0,2})\b/g;
  let match;
  while ((match = allCapsPattern.exec(normalized)) !== null) {
    const phrase = match[1].trim();
    // Filter out stop words
    const words = phrase.split(/\s+/);
    if (words.every((w) => STOP_WORDS.has(w))) continue;
    if (phrase.length < 3) continue;
    // Filter direction/slug words
    if (STOP_WORDS.has(phrase)) continue;
    results.add(phrase);
  }

  return Array.from(results);
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();

  // 1. Load all scene_graph_versions for the project (feature film)
  const { data: sceneVersions, error: svErr } = await admin
    .from("scene_graph_versions")
    .select("id, scene_id, slugline, content, tension_delta")
    .eq("project_id", projectId);

  if (svErr) throw new Error(`Failed to load scene versions: ${svErr.message}`);

  let sceneContent: { id: string; content: string }[] = [];

  if (sceneVersions && sceneVersions.length > 0) {
    // Feature film path: use scene graph content
    sceneContent = sceneVersions.map((sv: any) => ({
      id: sv.scene_id || sv.id,
      content: sv.content || "",
    }));
    console.log(`Scanning ${sceneVersions.length} scene versions for props...`);
  } else {
    // Vertical drama fallback: use season_script plaintext
    const { data: ssDocs } = await admin
      .from("project_documents")
      .select("id, latest_version_id")
      .eq("project_id", projectId)
      .eq("doc_type", "season_script");

    if (ssDocs && ssDocs.length > 0 && ssDocs[0].latest_version_id) {
      const { data: version } = await admin
        .from("project_document_versions")
        .select("plaintext")
        .eq("id", ssDocs[0].latest_version_id)
        .single();

      if (version?.plaintext) {
        // Split the script into scene chunks by INT./EXT. slugline markers only.
        // Uses a regex that matches INT/EXT sluglines specifically, not character
        // dialogue names (ALL CAPS) or scene directions (FADE OUT, COLD OPEN, etc.)
        const slugMatch = version.plaintext.split(/(?:^|\n)(?=INT\.?\s+|EXT\.?\s+)/gm);
        sceneContent = slugMatch
          .map((chunk: string, i: number) => ({
            id: `ss_section_${i}`,
            content: chunk.replace(/^##\s+EPISODE\s+\d+[^\n]*\n*/gmi, '').trim(),
          }))
          .filter((chunk) => chunk.content.length > 50); // Skip tiny fragments
        console.log(`Split season_script into ${sceneContent.length} sections for prop scanning...`);
      }
    }

    if (sceneContent.length === 0) {
      return { created: 0, message: "No scene content or season_script found for this project" };
    }
  }

  // 2. Load existing character entity names to filter out
  const { data: charEntities } = await admin
    .from("narrative_entities")
    .select("canonical_name, entity_key")
    .eq("project_id", projectId)
    .eq("entity_type", "character");

  const characterNames = new Set<string>(
    (charEntities || []).flatMap((e) => [
      e.canonical_name?.toUpperCase().trim(),
      e.entity_key?.toUpperCase().trim(),
    ]).filter(Boolean)
  );
  // Also build word-level filter: individual words from character names
  // (catches "HAE" from "HAE SUNG", "SUNG" from "HAE SUNG", etc.)
  const characterWords = new Set<string>(
    (charEntities || []).flatMap((e) => {
      const name = e.canonical_name?.toUpperCase().trim();
      return name ? name.split(/\s+/) : [];
    }).filter((w: string) => w.length >= 3)
  );

  // 3. Load existing location entity names to filter out
  const { data: locEntities } = await admin
    .from("narrative_entities")
    .select("canonical_name, entity_key")
    .eq("project_id", projectId)
    .eq("entity_type", "location");

  const locationNames = new Set<string>(
    (locEntities || []).flatMap((e) => [
      e.canonical_name?.toUpperCase().trim(),
      e.entity_key?.toUpperCase().trim(),
    ]).filter(Boolean)
  );
  // Word-level location filter
  const locationWords = new Set<string>(
    (locEntities || []).flatMap((e) => {
      const name = e.canonical_name?.toUpperCase().trim();
      return name ? name.split(/\s+/) : [];
    }).filter((w: string) => w.length >= 3)
  );

  // 4. Already existing prop atoms (to avoid duplication)
  const { data: existingAtoms } = await admin
    .from("atoms")
    .select("canonical_name")
    .eq("project_id", projectId)
    .eq("atom_type", "prop");

  const existingPropNames = new Set<string>(
    (existingAtoms || []).map((a) => a.canonical_name?.toUpperCase().trim()).filter(Boolean)
  );

  // 4b. For vertical drama without full entity coverage, scan scene/script content
  //     for CHARACTER dialogue markers (ALL CAPS name line followed by dialogue)
  //     and add them to the character name filter so they're excluded from props.
  const dialogueNameRegex = /(?:^|\n)\s*([A-Z][A-Z\s]{2,30}?)\s*\(?(?:O\.S\.|V\.O\.|CONT'D|CONTINUED)?\)?\s*\n\s*(?:[A-Z][a-z]|\(|\[|")/g;
  for (const sv of sceneContent) {
    const content = sv.content || "";
    let dm;
    while ((dm = dialogueNameRegex.exec(content)) !== null) {
      const name = dm[1].trim().toUpperCase();
      if (name.length >= 3 && name.length <= 30) {
        characterNames.add(name);
        // Also add individual words
        for (const word of name.split(/\s+/)) {
          if (word.length >= 3) characterWords.add(word);
        }
      }
    }
  }

  // 5. Scan scenes and build frequency map
  // propName (upper) → { displayName, scenes: Set<scene_id>, hasNarrativeRole: bool }
  const propMap = new Map<string, { displayName: string; scenes: Set<string>; narrativeScore: number }>();

  // Determine if we're scanning real scenes (feature film) or script sections (vertical drama)
  const isRealScene = sceneVersions && sceneVersions.length > 0;
  // For real scenes, require 3+ appearances; for script sections, use 2+ (sections are larger)
  const minAppearances = isRealScene ? 3 : 2;

  for (const sv of sceneContent) {
    const content = sv.content || "";
    const sceneId = sv.id;

    const candidates = extractCapitalizedNounPhrases(content);

    for (const upper of candidates) {
      // Filter out character/location names
      if (characterNames.has(upper)) continue;
      if (locationNames.has(upper)) continue;
      // Word-level filter: skip if candidate matches any word in a character/location name
      if (characterWords.has(upper) || locationWords.has(upper)) continue;
      if (STOP_WORDS.has(upper)) continue;
      // Filter single chars
      if (upper.length < 3) continue;
      // Filter pure numbers
      if (/^\d+$/.test(upper)) continue;
      // Split multi-word candidates and check each word individually
      // (catches "LATER ELARA" where character name is concatenated with scene direction)
      const words = upper.split(/\s+/);
      if (words.some((w: string) => characterNames.has(w) || locationNames.has(w))) continue;
      // Check if any prefix of the multi-word candidate matches a stop phrase
      // (e.g. "COLD OPEN CLOSE" starts with stop phrase "COLD OPEN")
      let hasStopPrefix = false;
      if (words.length > 1) {
        for (let i = 1; i <= Math.min(words.length, 3); i++) {
          const prefix = words.slice(0, i).join(' ');
          if (STOP_WORDS.has(prefix)) {
            hasStopPrefix = true;
            break;
          }
        }
      }
      if (hasStopPrefix) continue;
 
      if (!propMap.has(upper)) {
        propMap.set(upper, {
          displayName: upper, // Use uppercase as canonical (screenplay style)
          scenes: new Set(),
          narrativeScore: 0,
        });
      }

      const entry = propMap.get(upper)!;
      entry.scenes.add(sceneId);

      // Check for narrative role keywords in surrounding context
      const lower = content.toLowerCase();
      for (const kw of NARRATIVE_KEYWORDS) {
        const idx = lower.indexOf(kw);
        if (idx !== -1) {
          // Check if the prop name appears within 100 chars of the keyword
          const propIdx = content.toUpperCase().indexOf(upper);
          if (propIdx !== -1 && Math.abs(propIdx - idx) < 100) {
            entry.narrativeScore += 1;
          }
        }
      }
    }
  }

  // 5b. Lowercase prop noun pass — for narrative prose (vertical drama season_script).
  // Scan content for lowercase prop dictionary words that the all-caps extractor misses.
  // Only runs for the season_script fallback (not real scenes).
  if (!isRealScene) {
    const lowerContent = sceneContent.map((sv) => sv.content || "").join("\n").toLowerCase();
    const sectionCount = sceneContent.length;
    for (const propWord of PROP_NOUNS) {
      // Use word-boundary regex to avoid partial matches
      const regex = new RegExp("\\b" + propWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
      let match;
      let count = 0;
      while ((match = regex.exec(lowerContent)) !== null) {
        count++;
      }
      if (count >= 2 && !existingPropNames.has(propWord.toUpperCase())) {
        // Check it's not a character or location name
        const upper = propWord.toUpperCase();
        if (characterNames.has(upper) || locationNames.has(upper)) continue;
        if (!propMap.has(upper)) {
          propMap.set(upper, {
            displayName: upper,
            scenes: new Set(Array.from({ length: Math.min(count, sectionCount) }, (_, i) => `prop_dict_${i}`)),
            narrativeScore: Math.min(count, 5),
          });
        } else {
          const entry = propMap.get(upper)!;
          for (let i = 0; i < Math.min(count, sectionCount); i++) {
            entry.scenes.add(`prop_dict_${i}`);
          }
          entry.narrativeScore = Math.max(entry.narrativeScore, Math.min(count, 5));
        }
      }
    }
  }

  // 6. Filter: only props that appear in enough sections (3+ for real scenes, 2+ for script sections)
  const qualified = Array.from(propMap.entries())
    .filter(([, v]) => v.scenes.size >= minAppearances)
    .filter(([upper]) => !existingPropNames.has(upper));

  // 7. Rank: frequency * 2 + narrativeScore, descending
  qualified.sort((a, b) => {
    const scoreA = a[1].scenes.size * 2 + a[1].narrativeScore;
    const scoreB = b[1].scenes.size * 2 + b[1].narrativeScore;
    return scoreB - scoreA;
  });

  // 8. Cap at 50
  const topProps = qualified.slice(0, 50);

  if (topProps.length === 0) {
    return { created: 0, message: "No significant props found (need 3+ scene appearances)" };
  }

  console.log(`Found ${topProps.length} qualified props`);

  // 9. Build atom stubs
  const now = new Date().toISOString();
  const toInsert = topProps.map(([upper, entry]) => ({
    project_id: projectId,
    atom_type: "prop",
    entity_id: null,
    canonical_name: entry.displayName,
    priority: Math.min(100, entry.scenes.size * 4 + entry.narrativeScore + 10),
    confidence: 0,
    readiness_state: "stub",
    generation_status: "pending",
    attributes: makeStubAttributes(entry.displayName, entry.scenes.size),
    created_at: now,
    updated_at: now,
  }));

  // 10. Insert in batches of 50
  let totalCreated = 0;
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    const { error: insertErr, data: inserted } = await admin
      .from("atoms")
      .insert(batch)
      .select("id");

    if (insertErr) {
      console.error("Insert batch error:", insertErr);
      throw new Error(`Failed to insert prop atoms batch: ${insertErr.message}`);
    }
    totalCreated += inserted?.length || 0;
  }

  console.log(`Created ${totalCreated} prop atom stubs`);
  return {
    created: totalCreated,
    topProps: topProps.slice(0, 10).map(([, e]) => ({
      name: e.displayName,
      scenes: e.scenes.size,
      narrativeScore: e.narrativeScore,
    })),
  };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();

  const { data: atoms, error } = await admin
    .from("atoms")
    .select("*")
    .eq("project_id", projectId)
    .eq("atom_type", "prop")
    .order("priority", { ascending: false });

  if (error) throw new Error(`Failed to load prop atoms: ${error.message}`);

  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();

  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId)
    .eq("atom_type", "prop")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Failed to reset prop atoms: ${error.message}`);

  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();

  // Get pending prop atoms
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms")
    .select("id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "prop")
    .eq("generation_status", "pending");

  if (fetchErr) throw new Error(`Failed to fetch pending prop atoms: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) {
    return { spawned: false, message: "No pending prop atoms to generate" };
  }

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  // Mark all as running immediately
  const atomIds = pendingAtoms.map((a) => a.id);
  await admin
    .from("atoms")
    .update({ generation_status: "running", updated_at: new Date().toISOString() })
    .in("id", atomIds);

  // Background generation
  // @ts-ignore — EdgeRuntime is Deno Deploy global
  EdgeRuntime.waitUntil(
    (async () => {
      // Load all scene content once for context assembly
      // Try scene_graph_versions first (feature film), then season_script (vertical drama)
      let sceneVersions: any[] = [];
      const { data: sgv } = await admin
        .from("scene_graph_versions")
        .select("scene_id, slugline, content, tension_delta")
        .eq("project_id", projectId)
        .order("tension_delta", { ascending: false })
        .limit(200);

      if (sgv && sgv.length > 0) {
        sceneVersions = sgv;
      } else {
        // Fallback: try season_script for context
        const { data: ssDocs } = await admin
          .from("project_documents")
          .select("id, latest_version_id")
          .eq("project_id", projectId)
          .eq("doc_type", "season_script");
        if (ssDocs && ssDocs.length > 0 && ssDocs[0].latest_version_id) {
          const { data: version } = await admin
            .from("project_document_versions")
            .select("plaintext")
            .eq("id", ssDocs[0].latest_version_id)
            .single();
          if (version?.plaintext) {
            sceneVersions = [{ slugline: "Season Script", content: version.plaintext.substring(0, 10000), tension_delta: 5 }];
          }
        }
      }

      for (const atom of pendingAtoms) {
        try {
          console.log(`Generating prop atom: ${atom.canonical_name}`);

          const propName = atom.canonical_name;
          const sceneCount = (atom.attributes as any)?.frequencyInScript || 0;
          const propNameUpper = propName.toUpperCase();

          // Find scenes mentioning this prop
          const relevantScenes = (sceneVersions || [])
            .filter((sv) => (sv.content || "").toUpperCase().includes(propNameUpper))
            .slice(0, 10);

          const sceneContexts = relevantScenes.map((sv) => {
            const excerpt = (sv.content || "").substring(0, 400);
            return `[${sv.slugline || "SCENE"}] (tension: ${sv.tension_delta || 0}) — ${excerpt}`;
          });

          const prompt = `You are a props master and visual story analyst for a film/TV production. Generate a rich, production-ready prop atom for the following prop.

PROP: ${propName}
SCENE COUNT: ${sceneCount}
SCENES MENTIONING THIS PROP:
${sceneContexts.length > 0 ? sceneContexts.join("\n\n") : "No direct scene context found — infer from prop name and story context."}

Generate a complete PropAtomAttributes JSON object. Focus on:
1. PHYSICAL DESCRIPTION — what does it look like? Size, shape, materials, color.
2. PROP TYPE — is it held (hand prop), set dressing, a vehicle, document, technology, weapon, etc.?
3. NARRATIVE FUNCTION — how does this prop serve the story?
4. STATE CHANGES — does this prop change state across scenes (damaged, stolen, given away)?
5. SYMBOLIC MEANING — what does this prop represent thematically?
6. PRODUCTION IMPLICATIONS — how complex is this to source/fabricate? What's the budget estimate?

Output ONLY a valid JSON object (no markdown, no commentary) with ALL of the following fields:
- propType (string: "held" | "set_dressing" | "vehicle" | "wardrobe_item" | "weapon" | "document" | "technology" | "food" | "flora" | "other")
- physicalDescription (string: 2-3 sentences describing the prop in detail)
- primaryColor (string)
- materialComposition (array of 2-5 material names)
- condition (string: e.g. "worn and scratched", "pristine", "damaged")
- sizeCategory (string: "small" | "medium" | "large" | "oversized")
- distinctiveFeatures (array of 3-5 notable visual details)
- narrativeFunction (string: how this prop drives the story)
- firstAppearance (string: slugline or scene description where prop first appears)
- lastAppearance (string: slugline or scene description of final appearance)
- frequencyInScript (number: how many scenes it appears in)
- usageContexts (array of 3-5 brief descriptions of how the prop is used)
- associatedCharacters (array of character names who interact with this prop)
- associatedLocations (array of location names where this prop appears)
- symbolicMeaning (string: thematic significance of this prop)
- stateChanges (array of objects: each with sceneSlugline, previousState, newState, trigger)
- productionComplexity (string: "simple" | "moderate" | "complex")
- fabricationRequirements (array: what's needed to make/source this prop)
- specialHandling (array: safety, storage, or handling notes)
- referenceImageTerms (array of 3-5 search terms for sourcing reference images)
- propBudgetEstimate (string: rough budget range, e.g. "£50-200" or "£500-2000")
- confidence (number 0.0-1.0: how confident you are based on available context)
- readinessBadge (string: "foundation" | "rich" | "verified")

confidence should reflect how much scene context was available. readinessBadge should be "foundation" if limited context, "rich" if multiple scenes available.`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://iffy-analysis.vercel.app",
              "X-Title": "IFFY Prop Atomiser",
            },
            body: JSON.stringify({
              model: "minimax/minimax-m2.7",
              messages: [
                {
                  role: "user",
                  content: prompt,
                },
              ],
              temperature: 0.7,
              max_tokens: 2000,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error(`OpenRouter error for ${propName}:`, response.status, errText);
            await admin
              .from("atoms")
              .update({
                generation_status: "failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", atom.id);
            continue;
          }

          const aiData = await response.json();
          const rawContent = aiData.choices?.[0]?.message?.content || "";

          // Parse JSON from response
          let generatedAttrs: Record<string, any> = {};
          try {
            const cleaned = rawContent
              .replace(/^```json\s*/i, "")
              .replace(/^```\s*/i, "")
              .replace(/```\s*$/i, "")
              .trim();
            generatedAttrs = JSON.parse(cleaned);
          } catch (parseErr) {
            console.error(`Failed to parse JSON for ${propName}:`, parseErr, "Raw:", rawContent.substring(0, 200));
            await admin
              .from("atoms")
              .update({
                generation_status: "failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", atom.id);
            continue;
          }

          // Merge with canonical name and stub fields
          const finalAttributes = {
            ...generatedAttrs,
            canonicalName: propName,
            frequencyInScript: sceneCount,
            generationStatus: "completed",
          };

          const { error: updateErr } = await admin
            .from("atoms")
            .update({
              generation_status: "complete",
              readiness_state: "generated",
              confidence: Math.round((generatedAttrs.confidence || 0.5) * 100),
              attributes: finalAttributes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", atom.id);

          if (updateErr) {
            console.error(`Failed to update atom ${atom.id}:`, updateErr);
          } else {
            console.log(`✓ Generated: ${propName}`);
          }
        } catch (atomErr) {
          console.error(`Error processing prop atom ${atom.id} (${atom.canonical_name}):`, atomErr);
          await admin
            .from("atoms")
            .update({
              generation_status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", atom.id);
        }
      }

      console.log(`Prop atomiser generation complete for ${pendingAtoms.length} atoms`);
    })()
  );

  return { spawned: true, count: pendingAtoms.length };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, project_id: projectId } = body;

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "Missing project_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing action. Use: extract | generate | status | reset_failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`prop-atomiser: action=${action} project=${projectId}`);

    let result: any;

    switch (action) {
      case "extract":
        result = await handleExtract(projectId);
        break;
      case "generate":
        result = await handleGenerate(projectId);
        break;
      case "status":
        result = await handleStatus(projectId);
        break;
      case "reset_failed":
        result = await handleResetFailed(projectId);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Use: extract | generate | status | reset_failed` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("prop-atomiser error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
