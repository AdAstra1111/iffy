/**
 * character-atomiser — Edge function for character atom extraction + generation.
 *
 * Actions:
 *   - status:    get all character atoms for a project
 *   - extract:   create atom stubs from character entities linked to scenes
 *   - generate:  LLM-generate full character atom attributes
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a character design and casting analyst for a film/TV production.
Generate a comprehensive character atom — a structured production reference document.
Respond with ONLY valid JSON matching the exact schema provided. Be specific and production-ready.`;

// ─── LLM helpers ──────────────────────────────────────────────────────────────
async function callOpenRouter(apiKey: string, system: string, user: string, temperature = 0.4, maxTokens = 16000): Promise<string> {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://iffy-analysis.vercel.app",
      "X-Title": "IFFY Character Atomiser",
    },
    body: JSON.stringify({
      model: "minimax/minimax-m2.7",
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenRouter failed ${resp.status}: ${text}`);
  }
  const data: any = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function parseJSONResponse(raw: string): any {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found in response");
  return JSON.parse(trimmed.substring(jsonStart, jsonEnd + 1));
}

// ─── Action Handlers ─────────────────────────────────────────────────────────

async function handleStatus(sb: any, projectId: string, atomType = "character") {
  const { data, error } = await sb
    .from("atoms")
    .select("*")
    .eq("project_id", projectId)
    .eq("atom_type", atomType)
    .order("priority", { ascending: false });

  if (error) throw error;
  return { atoms: data || [], count: (data || []).length };
}

async function handleExtract(sb: any, projectId: string) {
  // 1. Get all character entities linked to scenes
  const { data: entities, error: entErr } = await sb
    .from("narrative_entities")
    .select("id, entity_key, canonical_name, entity_type, meta_json")
    .eq("project_id", projectId)
    .eq("entity_type", "character");

  if (entErr) throw entErr;
  if (!entities || entities.length === 0) {
    return { created: 0, updated: 0, message: "No character entities found" };
  }

  // 1b. Fetch alias table — identify entities that are fragments/aliases of other entities
  // Entities whose canonical_name appears as an alias_name are non-canonical (skip them)
  const { data: aliases, error: aliasErr } = await sb
    .from("narrative_entity_aliases")
    .select("alias_name, canonical_entity_id")
    .eq("project_id", projectId);

  if (aliasErr) throw aliasErr;

  // canonicalEntityIds = entity IDs that are the canonical target of some alias
  const canonicalEntityIds = new Set((aliases || []).map((a: any) => a.canonical_entity_id));
  // aliasNames = fragment/typo names that map to a different canonical entity
  const aliasNames = new Set((aliases || []).map((a: any) => a.alias_name));

  // Filter: keep only canonical entities (not fragments/aliases of other entities)
  // An entity is canonical if its name is NOT an alias for a different entity
  const canonicalEntities = (entities || []).filter((e: any) => {
    // If this entity's name appears as an alias pointing to a DIFFERENT canonical entity, skip it
    if (aliasNames.has(e.canonical_name) && !canonicalEntityIds.has(e.id)) {
      return false; // this entity is itself a fragment — skip
    }
    return true;
  });

  // Filter: must have at least one scene link
  const entityIds = canonicalEntities.map((e: any) => e.id);
  if (entityIds.length === 0) {
    return { created: 0, updated: 0, message: "No canonical character entities with scene links found" };
  }

  const { data: links, error: linkErr } = await sb
    .from("narrative_scene_entity_links")
    .select("entity_id, scene_id")
    .eq("project_id", projectId)
    .in("entity_id", entityIds);

  if (linkErr) throw linkErr;

  const sceneCountByEntity = new Map<string, number>();
  for (const link of (links || [])) {
    sceneCountByEntity.set(link.entity_id, (sceneCountByEntity.get(link.entity_id) || 0) + 1);
  }

  // 2. Build upsert rows — only canonical entities
  const rows = canonicalEntities
    .filter((e: any) => sceneCountByEntity.has(e.id))
    .map((e: any) => ({
      project_id: projectId,
      atom_type: "character",
      entity_id: e.id,
      canonical_name: e.canonical_name || e.entity_key,
      priority: 50,
      confidence: 0,
      readiness_state: "canon_linked",
      generation_status: "pending",
      attributes: {
        entity_key: e.entity_key,
        scene_count: sceneCountByEntity.get(e.id) || 0,
        meta_json: (e as any).meta_json || {},
      },
    }));

  if (rows.length === 0) {
    return { created: 0, updated: 0, message: "No character entities with scene links found" };
  }

  const { data: upserted, error: upsertErr } = await sb
    .from("atoms")
    .upsert(rows, {
      onConflict: "project_id,atom_type,entity_id",
      ignoreDuplicates: false,
    })
    .select("id");

  if (upsertErr) throw upsertErr;
  return { created: upserted?.length || rows.length, updated: 0, total: rows.length };
}

async function handleGenerate(sb: any, apiKey: string, projectId: string, atomIds?: string[]) {
  let query = sb
    .from("atoms")
    .select("*")
    .eq("project_id", projectId)
    .eq("atom_type", "character")
    .eq("readiness_state", "canon_linked");

  // When atomIds are explicitly provided, generate those regardless of status
  // (allows retrying failed atoms)
  if (atomIds && atomIds.length > 0) {
    query = query.in("id", atomIds);
  } else {
    query = query.eq("generation_status", "pending");
  }

  const { data: atoms, error: atomErr } = await query;
  if (atomErr) throw atomErr;
  if (!atoms || atoms.length === 0) {
    return { generated: 0, message: "No atoms ready for generation" };
  }

  // Mark all as running
  await sb
    .from("atoms")
    .update({ generation_status: "running", updated_at: new Date().toISOString() })
    .in("id", atoms.map((a: any) => a.id));

  let generated = 0;
  let failed = 0;

  for (const atom of atoms) {
    try {
      const { data: entity } = await sb
        .from("narrative_entities")
        .select("canonical_name, entity_key, meta_json, entity_type")
        .eq("id", atom.entity_id)
        .single();

      if (!entity) continue;

      const { data: links } = await sb
        .from("narrative_scene_entity_links")
        .select("scene_id")
        .eq("entity_id", atom.entity_id)
        .eq("project_id", projectId);

      const sceneIds = (links || []).map((l: any) => l.scene_id);
      let sceneContexts: string[] = [];

      if (sceneIds.length > 0) {
        const { data: versions } = await sb
          .from("scene_graph_versions")
          .select("scene_id, slugline, summary, content")
          .in("scene_id", sceneIds)
          .eq("project_id", projectId)
          .is("superseded_at", null)
          .order("created_at", { ascending: true })
          .limit(10);

        sceneContexts = (versions || []).map((v: any) =>
          `[${v.slugline || "untitled"}] ${(v.summary || "").slice(0, 200)}`
        );
      }

      const userPrompt = `Generate a character atom for production use.

Character: ${entity.canonical_name || atom.canonical_name}
Entity Key: ${entity.entity_key || ""}
Linked Scenes (${sceneContexts.length}):
${sceneContexts.length > 0 ? sceneContexts.join("\n") : "(no scene links — use entity metadata only)"}

Generate a JSON object with ALL of the following fields:

{
  "physical_description": "Full paragraph physical description — vivid and production-ready",
  "age_estimate": "e.g. early 30s, mid-50s, late teens",
  "physical_markings": "e.g. scar on left hand, mole above right eye, birthmark",
  "build": "athletic, heavy, wiry, stocky, lean, etc",
  "height_estimate": "approx 5'10, 6'2, 5'6, etc",
  "skin_tone": "deep brown, pale, olive, medium tan, etc",
  "hair": "black buzz cut, shoulder-length auburn, receding hairline, etc",
  "eyes": "brown, striking blue, hazel, etc",
  "distinctive_features": "limps, tattoo sleeves, perfect teeth, bad teeth, etc",
  "wardrobe_notes": "colour palette, signature pieces, era-appropriate clothing, key costume pieces",
  "movement_gait": "smooth, stilted, predatory, bouncy — describe walk and key gesture patterns",
  "facial_expression_range": "default expression + emotional range this character moves through",
  "casting_suggestions": "age range, actor type, relevant comparables (actors or character archetypes)",
  "cultural_context": "background, nationality, accent guidance, cultural sensitivity notes",
  "casting_type_tags": ["action-lead", "comic-relief", "villain", "mentor"],
  "visual_complexity": "simple|moderate|complex — based on costume/makeup/prosthetic requirements"
}

Respond with ONLY valid JSON. No markdown, no commentary.`;

      const rawContent = await callOpenRouter(apiKey, SYSTEM_PROMPT, userPrompt);
      const attrs = parseJSONResponse(rawContent);

      const attrKeys = Object.keys(attrs).filter(k => k !== "casting_type_tags" && k !== "meta_json");
      const confidence = Math.min(100, 50 + attrKeys.length * 5);
      const mergedAttrs = { ...((atom.attributes as object) || {}), ...attrs };

      await sb
        .from("atoms")
        .update({
          attributes: mergedAttrs,
          confidence,
          readiness_state: "generated",
          generation_status: "complete",
          updated_at: new Date().toISOString(),
        })
        .eq("id", atom.id);

      generated++;
    } catch (e: any) {
      console.error(`[character-atomiser] atom=${atom.id} failed:`, e?.message);
      await sb
        .from("atoms")
        .update({ generation_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", atom.id);
      failed++;
    }
  }

  return { generated, failed, total: atoms.length };
}

// ─── Main Handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") || "";

    const sb = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const action: string = body.action || "status";
    const projectId: string = body.projectId;
    const atomIds: string[] = body.atomIds || [];

    if (!projectId) throw new Error("projectId required");

    let result: any;

    if (action === "status") {
      result = await handleStatus(sb, projectId, body.atomType || "character");
    } else if (action === "extract") {
      result = await handleExtract(sb, projectId);
    } else if (action === "generate") {
      // Spawn generation in background — return immediately so HTTP doesn't time out
      // The atoms will be processed asynchronously and their status updated in DB
      result = { spawned: true, message: "Generation started in background" };
      // @ts-ignore EdgeRuntime available in Deno Deploy
      EdgeRuntime.waitUntil(handleGenerate(sb, openrouterKey, projectId, atomIds));
    } else if (action === "debug") {
      const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") || "";
      if (!openrouterKey) {
        result = { error: "OPENROUTER_API_KEY not set" };
      } else {
        try {
          const testResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${openrouterKey}`,
              "HTTP-Referer": "https://iffy-analysis.vercel.app",
              "X-Title": "IFFY Test",
            },
            body: JSON.stringify({
              model: "minimax/minimax-m2.7",
              max_tokens: 10,
              messages: [{ role: "user", content: "say hi" }],
            }),
          });
          const text = await testResp.text();
          result = { ok: testResp.ok, status: testResp.status, body_preview: text.slice(0, 200) };
        } catch (e: any) {
          result = { error: e.message };
        }
      }
    } else if (action === "reset_failed") {
      // Reset failed and running atoms (stuck from interrupted requests)
      const { data, error } = await sb
        .from("atoms")
        .update({ generation_status: "pending", updated_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("atom_type", "character")
        .in("generation_status", ["failed", "running"])
        .select("id");
      result = { reset: data?.length || 0 };
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
