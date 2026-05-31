// @ts-nocheck
/**
 * approve-cast-suggestion — Creates AI Actors on explicit cast approval.
 *
 * CONSTITUTIONAL RULES:
 * 1. AI actors may ONLY be created via this function (explicit approval event).
 * 2. NEL may NOT create ai_actors automatically.
 * 3. Sets project_ai_cast.ai_actor_id = new ai_actor.id on approval.
 * 4. No automatic completion, no automatic approval, no automatic cast locking.
 *
 * Feature gate: ENABLE_CAST_APPROVAL (default: false)
 *
 * Schema note: project_ai_cast has NO status/character_id columns.
 * Approval state is: ai_actor_id === sentinel -> suggested, ai_actor_id !== sentinel -> approved.
 * 
 * See: cast-hero-frame-architecture-revision-v2-2026-05-31.md
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Feature gate
  const enabled = Deno.env.get("ENABLE_CAST_APPROVAL") || "false";
  if (enabled !== "true") {
    console.log("[approve-cast-suggestion] Feature disabled (ENABLE_CAST_APPROVAL != true)");
    return new Response(
      JSON.stringify({ ok: false, skipped: true, reason: "Feature disabled: ENABLE_CAST_APPROVAL" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }

  try {
    const input = await req.json();
    const { project_id, character_name, actor_name, user_id } = input;

    if (!project_id || !character_name) {
      return new Response(
        JSON.stringify({ ok: false, error: "project_id and character_name are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    // 1. Find the cast suggestion record by character_key (project_ai_cast has no character_id column)
    const { data: castRecords } = await sb
      .from("project_ai_cast")
      .select("id, character_key, ai_actor_id")
      .eq("project_id", project_id)
      .eq("character_key", character_name)
      .limit(1);

    if (!castRecords || castRecords.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "Cast suggestion not found. Run suggest-cast-from-dna first." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const castRecord = castRecords[0];

    // 2. Check if already approved (non-sentinel ai_actor_id)
    const SENTINEL = "00000000-0000-0000-0000-000000000000";
    if (castRecord.ai_actor_id && castRecord.ai_actor_id !== SENTINEL) {
      // Already has a real actor — check if it exists
      const { data: existingActor } = await sb.from("ai_actors").select("id").eq("id", castRecord.ai_actor_id).maybeSingle();
      if (existingActor) {
        return new Response(
          JSON.stringify({ ok: true, already_complete: true, cast_id: castRecord.id, ai_actor_id: castRecord.ai_actor_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // 3. Get project's user_id for ai_actor.user_id
    let effectiveUserId = user_id;
    if (!effectiveUserId) {
      const { data: proj } = await sb.from("projects").select("user_id").eq("id", project_id).single();
      effectiveUserId = proj?.user_id || null;
    }
    if (!effectiveUserId) {
      // Last resort: look up the user who created the earliest cast suggestions
      const { data: firstCast } = await sb.from("project_ai_cast").select("created_at").eq("project_id", project_id).order("created_at", { ascending: true }).limit(1).single();
      effectiveUserId = "00000000-0000-0000-0000-000000000000"; // fallback
    }

    const effectiveActorName = actor_name || character_name;

    // 4. Create real AI actor record (uses actual ai_actors columns)
    const { data: newActor, error: actorError } = await sb
      .from("ai_actors")
      .insert({
        user_id: effectiveUserId,
        name: effectiveActorName,
        description: `Cast approved for ${character_name} in project ${project_id}`,
        negative_prompt: "",
        tags: ["cast-approved"],
        status: "active",
        roster_ready: false,
        anchor_coverage_status: "none",
        anchor_coherence_status: "none",
      })
      .select("id")
      .single();

    if (actorError) {
      return new Response(
        JSON.stringify({ ok: false, error: `Failed to create AI actor: ${actorError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // 5. Update cast record with real ai_actor_id
    const { error: updateError } = await sb
      .from("project_ai_cast")
      .update({ ai_actor_id: newActor.id })
      .eq("id", castRecord.id);

    if (updateError) {
      // Rollback: delete the orphaned actor
      await sb.from("ai_actors").delete().eq("id", newActor.id);
      return new Response(
        JSON.stringify({ ok: false, error: `Failed to update cast record: ${updateError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        cast_id: castRecord.id,
        character_name: character_name,
        actor_name: effectiveActorName,
        ai_actor_id: newActor.id,
        status: "approved",
        message: "Cast approved and AI actor created",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[approve-cast-suggestion] Fatal error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});