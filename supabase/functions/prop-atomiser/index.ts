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
  "INT", "EXT", "DAY", "NIGHT", "SCENE", "ACT", "CUT", "FADE", "CLOSE",
  "WIDE", "SHOT", "POV", "ANGLE", "CAMERA", "CU", "ECU", "MS", "LS",
  "LATER", "CONTINUOUS", "MORNING", "EVENING", "AFTERNOON", "MOMENT",
  "TIME", "MAN", "WOMAN", "GIRL", "BOY", "PERSON", "PEOPLE", "SOMEONE",
  "EVERYONE", "NOBODY", "NOTHING", "SOMETHING", "ANYTHING", "EVERYTHING",
  "PAGE BREAK", "PAGE", "BREAK",
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

  const results: Set<string> = new Set();

  // Match 1-3 word sequences where first word is capitalized
  // but NOT at start of sentence (i.e. not following . ! ? or start of string after newline)
  // We look for patterns like: "the Gun", "a Phone", "THE KNIFE"
  // Simplified: find ALLCAPS words of 3+ chars (typical screenplay prop notation)
  // Also find Title Case words that appear inline
  const allCapsPattern = /\b([A-Z]{2,}(?:\s+[A-Z]{2,}){0,2})\b/g;
  let match;
  while ((match = allCapsPattern.exec(text)) !== null) {
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

  // 1. Load all scene_graph_versions for the project
  const { data: sceneVersions, error: svErr } = await admin
    .from("scene_graph_versions")
    .select("id, scene_id, slugline, content, tension_delta")
    .eq("project_id", projectId);

  if (svErr) throw new Error(`Failed to load scene versions: ${svErr.message}`);
  if (!sceneVersions || sceneVersions.length === 0) {
    return { created: 0, message: "No scene content found for this project" };
  }

  console.log(`Scanning ${sceneVersions.length} scene versions for props...`);

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

  // 4. Already existing prop atoms (to avoid duplication)
  const { data: existingAtoms } = await admin
    .from("atoms")
    .select("canonical_name")
    .eq("project_id", projectId)
    .eq("atom_type", "prop");

  const existingPropNames = new Set<string>(
    (existingAtoms || []).map((a) => a.canonical_name?.toUpperCase().trim()).filter(Boolean)
  );

  // 5. Scan scenes and build frequency map
  // propName (upper) → { displayName, scenes: Set<scene_id>, hasNarrativeRole: bool }
  const propMap = new Map<string, { displayName: string; scenes: Set<string>; narrativeScore: number }>();

  for (const sv of sceneVersions) {
    const content = sv.content || "";
    const sceneId = sv.scene_id || sv.id;

    const candidates = extractCapitalizedNounPhrases(content);

    for (const upper of candidates) {
      // Filter out character/location names
      if (characterNames.has(upper)) continue;
      if (locationNames.has(upper)) continue;
      if (STOP_WORDS.has(upper)) continue;
      // Filter single chars
      if (upper.length < 3) continue;
      // Filter pure numbers
      if (/^\d+$/.test(upper)) continue;

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

  // 6. Filter: only props that appear in 3+ scenes
  const qualified = Array.from(propMap.entries())
    .filter(([, v]) => v.scenes.size >= 3)
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
      const { data: sceneVersions } = await admin
        .from("scene_graph_versions")
        .select("scene_id, slugline, content, tension_delta")
        .eq("project_id", projectId)
        .order("tension_delta", { ascending: false })
        .limit(200);

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
