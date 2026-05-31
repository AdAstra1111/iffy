// run-test-approval — test approve-cast-suggestion for one character
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const CONCRETE = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";
  const CHAR_NAME = "Captain Reyes";

  // Get the cast record
  const { data: castRows } = await sb
    .from("project_ai_cast")
    .select("id, character_key, ai_actor_id")
    .eq("project_id", CONCRETE)
    .eq("character_key", CHAR_NAME)
    .limit(1);

  if (!castRows || castRows.length === 0) {
    return new Response(JSON.stringify({ error: "Cast record not found" }), { status: 404 });
  }

  const cast = castRows[0];

  // Get project user_id
  const { data: proj } = await sb.from("projects").select("user_id").eq("id", CONCRETE).single();
  const userId = proj?.user_id || "00000000-0000-0000-0000-000000000000";

  // Create real ai_actor
  const { data: newActor, error: actorErr } = await sb
    .from("ai_actors")
    .insert({
      user_id: userId,
      name: CHAR_NAME,
      description: "Cast approved for " + CHAR_NAME,
      negative_prompt: "",
      tags: ["cast-approved", "test"],
      status: "active",
      roster_ready: true,
      anchor_coverage_status: "none",
      anchor_coherence_status: "none",
    })
    .select("id")
    .single();

  if (actorErr) {
    return new Response(JSON.stringify({ error: "Actor creation failed: " + actorErr.message }), { status: 500 });
  }

  // Update cast record
  const { error: updateErr } = await sb
    .from("project_ai_cast")
    .update({ ai_actor_id: newActor.id })
    .eq("id", cast.id);

  if (updateErr) {
    await sb.from("ai_actors").delete().eq("id", newActor.id);
    return new Response(JSON.stringify({ error: "Update failed: " + updateErr.message }), { status: 500 });
  }

  // Verify
  const { data: finalCast } = await sb.from("project_ai_cast").select("*").eq("id", cast.id).single();
  const { data: finalActor } = await sb.from("ai_actors").select("id, name, status").eq("id", newActor.id).single();

  return new Response(JSON.stringify({
    ok: true,
    approved: true,
    character: CHAR_NAME,
    project: "Concrete Angels",
    cast_record: finalCast,
    actor: finalActor,
  }), { headers: { "Content-Type": "application/json" } });
});