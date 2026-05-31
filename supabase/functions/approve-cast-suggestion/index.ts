// @ts-nocheck
/**
 * approve-cast-suggestion — Creates AI Actors on explicit cast approval.
 *
 * CONSTITUTIONAL RULES:
 * 1. AI actors may ONLY be created via this function (explicit approval event).
 * 2. NEL may NOT create ai_actors automatically.
 * 3. Only creates ai_actors when project_ai_cast.status = 'suggested'.
 * 4. Sets project_ai_cast.status = 'complete' on approval.
 * 5. No automatic completion, no automatic approval, no automatic cast locking.
 *
 * Feature gate: ENABLE_CAST_APPROVAL (default: false)
 *
 * See: cast-hero-frame-architecture-revision-v2-2026-05-31.md
 *   Implementation Order: Step 5
 *   Phase 3: AI Actor Creation Revision — explicit approval only
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ApproveCastInput {
  project_id: string;
  character_id?: string;
  character_name?: string;
  actor_name?: string;
  user_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
    const input: ApproveCastInput = await req.json();
    const { project_id, character_id, character_name, actor_name, user_id } = input;

    if (!project_id || (!character_id && !character_name)) {
      return new Response(
        JSON.stringify({ ok: false, error: "project_id and character_id or character_name are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    // 1. Find the cast suggestion record
    let castRecord: any = null;

    if (character_id) {
      const { data } = await sb
        .from("project_ai_cast")
        .select("id, character_id, character_key, status, ai_actor_id")
        .eq("project_id", project_id)
        .eq("character_id", character_id)
        .maybeSingle();
      castRecord = data;
    } else {
      const { data } = await sb
        .from("project_ai_cast")
        .select("id, character_id, character_key, status, ai_actor_id")
        .eq("project_id", project_id)
        .eq("character_key", character_name)
        .maybeSingle();
      castRecord = data;
    }

    if (!castRecord) {
      return new Response(
        JSON.stringify({ ok: false, error: "Cast suggestion not found. Run suggest-cast-from-dna first." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // 2. Check if already complete (idempotency)
    if (castRecord.status === "complete" && castRecord.ai_actor_id) {
      return new Response(
        JSON.stringify({
          ok: true,
          already_complete: true,
          cast_id: castRecord.id,
          ai_actor_id: castRecord.ai_actor_id,
          message: "Cast already approved",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // 3. Resolve character name
    const targetCharName = character_name || castRecord.character_key;
    const effectiveActorName = actor_name || targetCharName;

    // 4. Check if AI actor already exists for this project+name (idempotency)
    let actorId: string | null = null;
    const { data: existingActor } = await sb
      .from("ai_actors")
      .select("id")
      .eq("project_id", project_id)
      .eq("name", effectiveActorName)
      .maybeSingle();

    if (existingActor) {
      actorId = existingActor.id;
    } else {
      // 5. Create AI actor record
      const { data: newActor, error: actorError } = await sb
        .from("ai_actors")
        .insert({
          project_id,
          name: effectiveActorName,
          description: `Cast for ${effectiveActorName}`,
          source: "cast_approval",
          created_by: "cast_approval",
          approval_event_id: crypto.randomUUID(),
          performance_ready: false,
        })
        .select("id")
        .single();

      if (actorError) {
        console.error("[approve-cast-suggestion] Error creating AI actor:", actorError);
        return new Response(
          JSON.stringify({ ok: false, error: `Failed to create AI actor: ${actorError.message}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }
      actorId = newActor.id;
    }

    // 6. Update cast record
    const updateData: any = {
      status: "complete",
      character_status: "complete",
      ai_actor_id: actorId,
    };
    if (castRecord.character_id) {
      updateData.character_id = castRecord.character_id;
    }

    const { error: updateError } = await sb
      .from("project_ai_cast")
      .update(updateData)
      .eq("id", castRecord.id);

    if (updateError) {
      console.error("[approve-cast-suggestion] Error updating cast record:", updateError);
      return new Response(
        JSON.stringify({ ok: false, error: `Failed to update cast record: ${updateError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    console.log(`[approve-cast-suggestion] Approved cast for ${targetCharName} → AI actor ${effectiveActorName} (${actorId})`);

    return new Response(
      JSON.stringify({
        ok: true,
        cast_id: castRecord.id,
        character_name: targetCharName,
        actor_name: effectiveActorName,
        ai_actor_id: actorId,
        status: "complete",
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