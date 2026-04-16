// @ts-nocheck
/**
 * creature-atomiser — Phase 5
 *
 * Extracts creature entities from narrative_entities and scene content,
 * then generates rich production-ready creature atoms via OpenRouter MiniMax M2.7.
 *
 * Actions:
 *   extract      — create pending atom stubs for all creatures in project
 *   generate     — LLM-generate attributes for pending creature atoms (background)
 *   status       — return all creature atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Creature noun dictionary ──────────────────────────────────────────────────

const CREATURE_NOUNS = [
  // Common animals
  "horse", "horses", "mare", "stallion", "gelding", "foal", "pony",
  "dog", "dogs", "hound", "hounds", "puppy", "bitch",
  "cat", "cats", "kitten",
  "rat", "rats", "mouse", "mice",
  "bird", "birds", "pigeon", "pigeons", "dove", "doves", "crow", "crows",
  "eagle", "hawk", "raven", "seagull", "albatross",
  "camel", "camels",
  "donkey", "donkeys", "mule", "mules",
  "ox", "oxen", "cow", "cattle", "bull",
  "goat", "goats", "sheep", "lamb",
  "pig", "pigs", "boar",
  "chicken", "chickens", "hen", "rooster",
  "wolf", "wolves",
  "bear", "bears",
  "lion", "lions", "tiger", "tigers", "leopard",
  "snake", "snakes", "viper",
  "rabbit", "rabbits", "hare",
  "fox", "foxes",
  // Military / WWII relevant
  "warhorse", "dispatch horse", "pack animal",
  "german shepherd", "alsatian",
  // Fictional
  "dragon", "dragons",
  "alien", "aliens",
  "droid", "droids",
  "robot", "robots",
  "monster", "monsters",
  "beast", "beasts",
  "creature", "creatures",
];

// Returns deduplicated canonical creature names found in text
function extractCreatureNames(text: string): Array<{ name: string; occurrences: number }> {
  const textLower = text.toLowerCase();
  const counts = new Map<string, number>();

  for (const noun of CREATURE_NOUNS) {
    // Match whole-word occurrences (with word boundaries where possible)
    const regex = new RegExp(`\\b${noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      // Normalise to singular/canonical form
      const canonical = normaliseCreatureName(noun);
      const existing = counts.get(canonical) || 0;
      counts.set(canonical, existing + matches.length);
    }
  }

  return Array.from(counts.entries())
    .map(([name, occurrences]) => ({ name, occurrences }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

function normaliseCreatureName(noun: string): string {
  const map: Record<string, string> = {
    horses: "horse", mare: "horse", stallion: "horse", gelding: "horse", foal: "horse", pony: "horse",
    warhorse: "horse", "dispatch horse": "horse", "pack animal": "horse",
    dogs: "dog", hound: "dog", hounds: "dog", puppy: "dog", bitch: "dog",
    "german shepherd": "dog", alsatian: "dog",
    cats: "cat", kitten: "cat",
    rats: "rat", mouse: "rat", mice: "rat",
    birds: "bird", pigeon: "bird", pigeons: "bird", dove: "bird", doves: "bird",
    crow: "bird", crows: "bird", eagle: "bird", hawk: "bird", raven: "bird",
    seagull: "bird", albatross: "bird",
    camels: "camel",
    donkeys: "donkey", mule: "donkey", mules: "donkey",
    oxen: "ox", cow: "cattle", cattle: "cattle", bull: "cattle",
    goats: "goat", sheep: "sheep", lamb: "sheep",
    pigs: "pig", boar: "pig",
    chickens: "chicken", hen: "chicken", rooster: "chicken",
    wolves: "wolf",
    bears: "bear",
    lions: "lion", tigers: "tiger", leopard: "leopard",
    snakes: "snake", viper: "snake",
    rabbits: "rabbit", hare: "rabbit",
    foxes: "fox",
    dragons: "dragon",
    aliens: "alien",
    droids: "droid",
    robots: "robot",
    monsters: "monster",
    beasts: "beast",
    creatures: "creature",
  };
  return map[noun.toLowerCase()] || noun.toLowerCase();
}

function makeStubAttributes(
  name: string,
  occurrences: number
) {
  return {
    creature_type: "animal",
    species_name: name,
    species_accuracy: "real_world",
    behaviour_class: "domesticated",
    physical_description: "",
    distinctive_markings: "",
    movement_pattern: "",
    sound_profile: "",
    role_in_story: "",
    CGI_requirements: "trained_animal",
    practical_effects_notes: "",
    handling_requirements: "",
    budget_category: "moderate",
    availability: "readily_available",
    reference_images_needed: ["description", "movement", "behaviour"],
    cultural_period_accuracy: "accurate",
    casting_type_tags: [],
    animal_welfare_notes: "",
    production_notes: "",
    occurrences_in_script: occurrences,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();

  // 1. Try narrative_entities first (entity_type = 'creature')
  const { data: creatureEntities } = await admin
    .from("narrative_entities")
    .select("id, entity_key, canonical_name, entity_type, scene_count, meta_json")
    .eq("project_id", projectId)
    .eq("entity_type", "creature");

  // 2. Always also scan scene_graph_versions content for creature nouns (Option A fallback + supplement)
  const { data: sceneVersions } = await admin
    .from("scene_graph_versions")
    .select("scene_id, content, slugline")
    .eq("project_id", projectId)
    .limit(500);

  // Aggregate all scene content
  const allSceneText = (sceneVersions || []).map((sv) => sv.content || "").join("\n");

  // Extract creature names from scene content
  const sceneCreatures = extractCreatureNames(allSceneText);

  // Build unified creature map: canonical_name → { entity_id, occurrences }
  const creatureMap = new Map<string, { entity_id: string | null; occurrences: number; source: string }>();

  // Add from narrative_entities
  for (const entity of creatureEntities || []) {
    const canonical = entity.canonical_name.toLowerCase().trim();
    creatureMap.set(canonical, {
      entity_id: entity.id,
      occurrences: entity.scene_count || 1,
      source: "narrative_entities",
    });
  }

  // Supplement with scene content extraction (higher occurrence wins)
  for (const sc of sceneCreatures) {
    if (sc.name === "creature" || sc.name === "beast" || sc.name === "monster") {
      // Skip generic terms unless specifically prominent
      if (sc.occurrences < 3) continue;
    }
    const existing = creatureMap.get(sc.name);
    if (!existing) {
      creatureMap.set(sc.name, { entity_id: null, occurrences: sc.occurrences, source: "scene_content" });
    } else {
      // Use max occurrences
      if (sc.occurrences > existing.occurrences) {
        existing.occurrences = sc.occurrences;
      }
    }
  }

  if (creatureMap.size === 0) {
    return { created: 0, message: "No creatures found in this project (neither narrative_entities nor scene content)" };
  }

  // 3. Get existing creature atoms to avoid duplicates
  const { data: existingAtoms } = await admin
    .from("atoms")
    .select("canonical_name")
    .eq("project_id", projectId)
    .eq("atom_type", "creature");

  const existingNames = new Set<string>(
    (existingAtoms || []).map((a) => a.canonical_name.toLowerCase().trim())
  );

  // 4. Build atom stubs
  const toInsert: any[] = [];
  const now = new Date().toISOString();

  for (const [name, info] of creatureMap.entries()) {
    if (existingNames.has(name)) {
      console.log(`Skipping existing creature atom: ${name}`);
      continue;
    }

    toInsert.push({
      project_id: projectId,
      atom_type: "creature",
      entity_id: info.entity_id,
      canonical_name: name,
      priority: Math.min(100, info.occurrences * 10 + 10),
      confidence: 0,
      readiness_state: "stub",
      generation_status: "pending",
      attributes: makeStubAttributes(name, info.occurrences),
      created_at: now,
      updated_at: now,
    });
  }

  if (toInsert.length === 0) {
    return { created: 0, message: "All creature atoms already exist" };
  }

  // 5. Insert in batches of 50
  let totalCreated = 0;
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    const { error: insertErr, data: inserted } = await admin
      .from("atoms")
      .insert(batch)
      .select("id");

    if (insertErr) {
      console.error("Insert batch error:", insertErr);
      throw new Error(`Failed to insert creature atoms batch: ${insertErr.message}`);
    }
    totalCreated += inserted?.length || 0;
  }

  console.log(`Created ${totalCreated} creature atom stubs`);
  return {
    created: totalCreated,
    creatures_found: Array.from(creatureMap.keys()),
  };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();

  const { data: atoms, error } = await admin
    .from("atoms")
    .select("*")
    .eq("project_id", projectId)
    .eq("atom_type", "creature")
    .order("priority", { ascending: false });

  if (error) throw new Error(`Failed to load creature atoms: ${error.message}`);

  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();

  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId)
    .eq("atom_type", "creature")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Failed to reset atoms: ${error.message}`);

  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();

  // Get pending creature atoms
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms")
    .select("id, entity_id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "creature")
    .eq("generation_status", "pending");

  if (fetchErr) throw new Error(`Failed to fetch pending atoms: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) {
    return { spawned: false, message: "No pending creature atoms to generate" };
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
      for (const atom of pendingAtoms) {
        try {
          console.log(`Generating creature atom: ${atom.canonical_name}`);

          // Get scene contexts where this creature appears
          let sceneContexts: string[] = [];

          // Search for scenes mentioning this creature
          const { data: sceneVersions } = await admin
            .from("scene_graph_versions")
            .select("scene_id, slugline, summary, content, tension_delta")
            .eq("project_id", projectId)
            .ilike("content", `%${atom.canonical_name}%`)
            .order("tension_delta", { ascending: false })
            .limit(8);

          for (const sv of sceneVersions || []) {
            const excerpt = (sv.summary || sv.content || "").substring(0, 400);
            sceneContexts.push(`[${sv.slugline || "SCENE"}] (tension: ${sv.tension_delta || 0}) — ${excerpt}`);
          }

          const occurrences = (atom.attributes as any)?.occurrences_in_script || 1;

          const prompt = `You are a production designer and visual effects supervisor for a WWII spy thriller set in North Africa and Europe. Generate a rich, production-ready creature atom for the following animal/creature.

CREATURE: ${atom.canonical_name}
OCCURRENCES IN SCRIPT: ${occurrences}
SETTING CONTEXT: WWII era spy thriller, North Africa and Europe. Period accuracy is critical.

SCENE CONTEXTS WHERE THIS CREATURE APPEARS:
${sceneContexts.length > 0 ? sceneContexts.join("\n\n") : "No specific scene context available — infer from creature type and WWII setting."}

Generate a complete creature atom JSON object for production planning.

Output ONLY a valid JSON object (no markdown, no commentary) with ALL of the following fields:
- creature_type (string: "animal" | "mythological" | "alien" | "robotic" | "hybrid")
- species_name (string: specific species e.g. "Arabian horse", "German Shepherd", "Norwegian rat")
- species_accuracy (string: "real_world" | "fictional" | "hybrid_fictional")
- behaviour_class (string: "domesticated" | "wild" | "trained" | "feral" | "CGI_only")
- physical_description (string: detailed physical description for production design)
- distinctive_markings (string: any notable markings, scars, equipment like saddles/collars)
- movement_pattern (string: how the creature moves — gait, speed, agility)
- sound_profile (string: vocalisations, realistic vs enhanced, sound design notes)
- role_in_story (string: "transport" | "surveillance" | "emotional_support" | "threat" | "comic_relief" | "plot_device" — or combination)
- CGI_requirements (string: "full_CGI" | "puppet" | "practical_effects" | "trained_animal")
- practical_effects_notes (string: suit requirements, animatronics, trainer needs, doubles)
- handling_requirements (string: animal handler requirements, safety protocols, legal permits)
- budget_category (string: "low" | "moderate" | "high" | "very_high")
- availability (string: "readily_available" | "limited_availability" | "requires_training" | "custom_build")
- reference_images_needed (array of 3-5 strings: types of reference images needed for production)
- cultural_period_accuracy (string: "accurate" | "stylised" | "anachronistic")
- casting_type_tags (array of strings: e.g. ["animal", "period-piece", "WWII-compatible", "trained"])
- animal_welfare_notes (string: welfare protocols, rest requirements, legal compliance, AHA guidelines)
- production_notes (string: scheduling considerations, weather dependencies, handler availability, breed sourcing)`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://iffy-analysis.vercel.app",
              "X-Title": "IFFY Creature Atomiser",
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
              max_tokens: 1500,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error(`OpenRouter error for ${atom.canonical_name}:`, response.status, errText);
            await admin
              .from("atoms")
              .update({ generation_status: "failed", updated_at: new Date().toISOString() })
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
            console.error(`Failed to parse JSON for ${atom.canonical_name}:`, parseErr, "Raw:", rawContent.substring(0, 200));
            await admin
              .from("atoms")
              .update({ generation_status: "failed", updated_at: new Date().toISOString() })
              .eq("id", atom.id);
            continue;
          }

          // Merge with occurrences from extract
          const finalAttributes = {
            ...generatedAttrs,
            occurrences_in_script: occurrences,
            generationStatus: "completed",
          };

          // Preserve CGI_requirements field exactly (with underscore)
          if (generatedAttrs.CGI_requirements && !finalAttributes.CGI_requirements) {
            finalAttributes.CGI_requirements = generatedAttrs.CGI_requirements;
          }

          const { error: updateErr } = await admin
            .from("atoms")
            .update({
              generation_status: "complete",
              readiness_state: "generated",
              confidence: 70,
              attributes: finalAttributes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", atom.id);

          if (updateErr) {
            console.error(`Failed to update atom ${atom.id}:`, updateErr);
          } else {
            console.log(`✓ Generated: ${atom.canonical_name}`);
          }
        } catch (atomErr) {
          console.error(`Error processing atom ${atom.id} (${atom.canonical_name}):`, atomErr);
          await admin
            .from("atoms")
            .update({ generation_status: "failed", updated_at: new Date().toISOString() })
            .eq("id", atom.id);
        }
      }

      console.log(`Creature atomiser generation complete for ${pendingAtoms.length} atoms`);
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

    console.log(`creature-atomiser: action=${action} project=${projectId}`);

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
    console.error("creature-atomiser error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
