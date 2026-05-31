// run-casting — deploys casting for test projects, handling FK constraint
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const CONCRETE = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";
  const EVENT = "6c4e2f48-fe9c-47b6-aac8-656a3ed4274b";

  async function runCastWithStubs(projectId) {
    // Step 1: Get characters from project_characters or fallback to character_visual_dna
    let { data: chars } = await sb
      .from("project_characters")
      .select("character_name, id")
      .eq("project_id", projectId);

    if (!chars || chars.length === 0) {
      // Fallback: distinct names from character_visual_dna
      const { data: dnaNames } = await sb
        .from("character_visual_dna")
        .select("character_name")
        .eq("project_id", projectId)
        .order("character_name");

      if (dnaNames && dnaNames.length > 0) {
        const seen = new Set();
        chars = dnaNames
          .filter((d) => { const u = d.character_name.toLowerCase(); if (seen.has(u)) return false; seen.add(u); return true; })
          .map((d) => ({ character_name: d.character_name, id: null }));
      }
    }

    if (!chars || chars.length === 0) {
      return { http_status: 200, response: { ok: true, message: "No characters found" }, cast_rows: [], count: 0 };
    }

    const results = [];
    let suggestionsCreated = 0;

    for (const char of chars) {
      const charName = char.character_name;

      // Check if entry already exists
      const { data: existing } = await sb
        .from("project_ai_cast")
        .select("id, character_key, ai_actor_id")
        .eq("project_id", projectId)
        .eq("character_key", charName)
        .limit(1);

      if (existing && existing.length > 0) {
        results.push({ character: charName, status: "skipped", existing: true });
        continue;
      }

      // Get project's user_id for placeholder ai_actor
      const { data: proj } = await sb
        .from("projects")
        .select("user_id")
        .eq("id", projectId)
        .single();

      const userId = proj?.user_id || "00000000-0000-0000-0000-000000000000";

      // Create stub ai_actor record (required by FK constraint on project_ai_cast)
      const { data: actor, error: actorErr } = await sb
        .from("ai_actors")
        .insert({
          user_id: userId,
          name: charName,
          description: "Auto-generated cast suggestion for " + charName,
          negative_prompt: "",
          tags: ["cast-suggestion"],
          status: "draft",
          roster_ready: false,
          anchor_coverage_status: "none",
          anchor_coherence_status: "none",
        })
        .select("id")
        .single();

      if (actorErr || !actor) {
        results.push({ character: charName, status: "error", error: actorErr?.message || "No actor created" });
        continue;
      }

      // Create project_ai_cast record linking to stub actor
      const { data: castRow, error: castErr } = await sb
        .from("project_ai_cast")
        .insert({
          project_id: projectId,
          character_key: charName,
          ai_actor_id: actor.id,
        })
        .select("id, character_key, ai_actor_id")
        .single();

      if (castErr) {
        results.push({ character: charName, status: "error", error: castErr.message });
        // Cleanup: remove orphaned actor
        await sb.from("ai_actors").delete().eq("id", actor.id);
        continue;
      }

      suggestionsCreated++;
      results.push({ character: charName, status: "suggested", cast_id: castRow.id, ai_actor_id: actor.id });
    }

    // Verify all records
    const { data: castRows } = await sb
      .from("project_ai_cast")
      .select("id, character_key, ai_actor_id")
      .eq("project_id", projectId);

    return {
      http_status: 200,
      response: { ok: true, suggestions_created: suggestionsCreated, total_characters: chars.length, results },
      cast_rows: castRows || [],
      count: (castRows || []).length,
    };
  }

  const concreteResult = await runCastWithStubs(CONCRETE);
  const eventResult = await runCastWithStubs(EVENT);

  return new Response(JSON.stringify({
    concrete_angels: concreteResult,
    event_horizon: eventResult,
  }), { headers: { "Content-Type": "application/json" } });
});