/**
 * generate-scene-demo — Edge function for scene demo image generation.
 *
 * Generates images for a scene demo run from a ready SceneDemoPlan.
 * Consumes locked upstream dependencies only.
 *
 * IEL: Fails closed if plan is not ready or dependencies are unlocked.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  generateImageViaGateway,
  uploadToStorage,
} from "../_shared/imageGen.ts";
import { resolveImageGenerationConfig } from "../_shared/imageGenerationResolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Slot framing prompts ───────────────────────────────────────────────────

const SLOT_FRAMINGS: Record<string, string> = {
  establishing_wide:
    "Wide establishing shot, full environment visible, characters in context",
  character_action:
    "Medium shot, character action, costume and expression visible",
  emotional_beat:
    "Close-up emotional beat, face and expression, intimate framing",
  environment_detail:
    "Detail shot, environment texture, props, architectural detail",
};

// ── Purpose framing ────────────────────────────────────────────────────────

const PURPOSE_FRAMINGS: Record<string, string> = {
  character_identity_intro: "character introduction, establishing presence",
  labor_process: "at work, craft or labor, showing process",
  ritual_or_ceremony: "ceremonial context, formal and significant",
  intimacy_or_private_moment: "private moment, tender and personal",
  public_formality: "public formal setting, composed",
  travel_transition: "in transit, movement and passage",
  distress_aftermath: "aftermath, emotional weight and damage",
  confrontation: "confrontation, dramatic tension",
  environmental_storytelling: "environment as storyteller, atmospheric",
  motif_insert: "symbolic detail, motif element",
  class_status_display: "class and status through costume and setting",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { run_id, project_id, plan } = await req.json();

    if (!run_id || !project_id || !plan) {
      return new Response(
        JSON.stringify({ error: "Missing run_id, project_id, or plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // IEL: Plan must be ready
    if (plan.readiness_status !== "ready") {
      await updateRunStatus(run_id, "failed", `Plan not ready: ${plan.readiness_status}`);
      return new Response(
        JSON.stringify({ error: `Plan readiness is ${plan.readiness_status}` }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // Mark run as running
    await db.from("scene_demo_runs").update({ status: "running" }).eq("id", run_id);

    // Fetch reference images from locked sets
    const referenceUrls = await fetchLockedReferenceUrls(db, plan);

    // Resolve generation config
    const genConfig = resolveImageGenerationConfig({
      role: "visual_reference",
      styleMode: "photorealistic_cinematic",
      qualityTarget: "standard",
    });

    const apiKey = Deno.env.get(genConfig.apiKeyEnvVar);
    if (!apiKey) {
      await updateRunStatus(run_id, "failed", "No API key configured");
      return new Response(
        JSON.stringify({ error: "No API key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch slot image rows
    const { data: imageRows } = await db
      .from("scene_demo_images")
      .select("*")
      .eq("run_id", run_id)
      .order("created_at", { ascending: true });

    if (!imageRows?.length) {
      await updateRunStatus(run_id, "failed", "No image slots found");
      return new Response(
        JSON.stringify({ error: "No image slots" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let completedCount = 0;
    const results: Array<{ slot_key: string; status: string; public_url?: string }> = [];

    for (const img of imageRows) {
      try {
        // Build prompt
        const slotFraming = SLOT_FRAMINGS[img.slot_key] || "Scene reference shot";
        const purposeFrame = PURPOSE_FRAMINGS[plan.scene_purpose] || "";
        const charBlock = (plan.characters || [])
          .map((c: any) => `${c.character_key} in ${c.wardrobe_state_label} state`)
          .join("; ");

        const promptParts = [
          slotFraming,
          purposeFrame,
          plan.slugline || "",
          charBlock,
          "cinematic lighting, production still quality, natural composition",
          "[NO CHARACTER DROPOUT]",
        ].filter(Boolean);

        const prompt = promptParts.join(". ");
        const negativePrompt =
          "blurry, low quality, watermark, text overlay, UI elements, wrong costume, fashion editorial";

        // Update image row with prompt
        await db
          .from("scene_demo_images")
          .update({ status: "running", prompt_used: prompt, negative_prompt: negativePrompt })
          .eq("id", img.id);

        // Generate
        const genResult = await generateImageViaGateway({
          gatewayUrl: genConfig.gatewayUrl,
          apiKey,
          model: genConfig.model,
          prompt,
          referenceImageUrls: referenceUrls.slice(0, 4),
        });

        // Upload
        const storagePath = `scene-demos/${project_id}/${run_id}/${img.slot_key}.png`;

        // Ensure bucket exists
        await db.storage.createBucket("scene-demos", { public: true }).catch(() => {});

        await uploadToStorage(db, "scene-demos", storagePath, genResult.rawBytes);

        // Get public URL
        const { data: urlData } = db.storage.from("scene-demos").getPublicUrl(storagePath);
        const publicUrl = urlData?.publicUrl || "";

        // Update image row
        await db
          .from("scene_demo_images")
          .update({
            status: "done",
            storage_path: storagePath,
            public_url: publicUrl,
            generation_config: {
              ...img.generation_config,
              model: genConfig.model,
              provider: genConfig.provider,
              rationale: genConfig.rationale,
            },
          })
          .eq("id", img.id);

        completedCount++;
        results.push({ slot_key: img.slot_key, status: "done", public_url: publicUrl });

        // Update run progress
        await db
          .from("scene_demo_runs")
          .update({ completed_count: completedCount })
          .eq("id", run_id);
      } catch (slotErr) {
        const errMsg = slotErr instanceof Error ? slotErr.message : "Unknown slot error";
        console.error(`Slot ${img.slot_key} failed:`, errMsg);
        await db
          .from("scene_demo_images")
          .update({ status: "failed", error: errMsg.slice(0, 500) })
          .eq("id", img.id);
        results.push({ slot_key: img.slot_key, status: "failed" });
      }
    }

    // Finalize run
    const allDone = completedCount === imageRows.length;
    const finalStatus = completedCount === 0 ? "failed" : allDone ? "done" : "partial";
    await db
      .from("scene_demo_runs")
      .update({
        status: finalStatus,
        completed_count: completedCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run_id);

    return new Response(
      JSON.stringify({ run_id, status: finalStatus, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("generate-scene-demo error:", errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function updateRunStatus(runId: string, status: string, error?: string) {
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  await db
    .from("scene_demo_runs")
    .update({ status, error: error?.slice(0, 500) || null })
    .eq("id", runId);
}

async function fetchLockedReferenceUrls(
  db: any,
  plan: any,
): Promise<string[]> {
  const urls: string[] = [];

  // Collect all set IDs from plan
  const setIds: string[] = [];
  for (const c of plan.characters || []) {
    if (c.costume_look_set_id) setIds.push(c.costume_look_set_id);
  }
  if (plan.location_set_id) setIds.push(plan.location_set_id);
  if (plan.atmosphere_set_id) setIds.push(plan.atmosphere_set_id);

  if (setIds.length === 0) return urls;

  // Fetch selected images from locked visual set slots
  const { data: slots } = await db
    .from("visual_set_slots")
    .select("selected_image_id, visual_set_id")
    .in("visual_set_id", setIds)
    .not("selected_image_id", "is", null);

  if (!slots?.length) return urls;

  const imageIds = slots.map((s: any) => s.selected_image_id);
  const { data: images } = await db
    .from("project_images")
    .select("id, public_url, storage_path")
    .in("id", imageIds);

  for (const img of images || []) {
    if (img.public_url) {
      urls.push(img.public_url);
    } else if (img.storage_path) {
      // Try to construct public URL
      const bucket = img.storage_path.split("/")[0] || "project-images";
      const path = img.storage_path.replace(`${bucket}/`, "");
      const { data: urlData } = db.storage.from(bucket).getPublicUrl(path);
      if (urlData?.publicUrl) urls.push(urlData.publicUrl);
    }
  }

  // Also fetch actor anchor images for characters
  const actorIds = (plan.characters || [])
    .map((c: any) => c.actor_id)
    .filter(Boolean);
  if (actorIds.length > 0) {
    const { data: assets } = await db
      .from("ai_actor_assets")
      .select("public_url, actor_version_id")
      .in(
        "actor_version_id",
        (plan.characters || []).map((c: any) => c.actor_version_id).filter(Boolean)
      )
      .eq("asset_type", "anchor_image")
      .limit(4);
    for (const a of assets || []) {
      if (a.public_url) urls.push(a.public_url);
    }
  }

  return urls.slice(0, 8);
}
