/**
 * Edge Function: ai-cast
 * Manages AI actor library: create, version, assets, screen tests, cast context.
 * Actions: ping, create_actor, update_actor, list_actors, get_actor,
 *          create_version, approve_version, add_asset, delete_asset,
 *          generate_screen_test, get_cast_context
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveGateway } from "../_shared/llm.ts";
const gw = resolveGateway();

// Robust image data URL extraction (mirrors _shared/imageGen.ts)
function extractImageDataUrl(genResult: any): string | null {
  try {
    const choice = genResult?.choices?.[0]?.message;
    if (!choice) return null;
    const imgUrl = choice.images?.[0]?.image_url?.url;
    if (imgUrl && imgUrl.startsWith("data:image")) return imgUrl;
    if (Array.isArray(choice.content)) {
      for (const part of choice.content) {
        if (part.type === "image_url" && part.image_url?.url?.startsWith("data:image")) return part.image_url.url;
        if (part.type === "image" && part.image?.url?.startsWith("data:image")) return part.image.url;
        if (part.inline_data?.data) {
          const mime = part.inline_data.mime_type || "image/png";
          return `data:${mime};base64,${part.inline_data.data}`;
        }
        if (typeof part === "string" && part.startsWith("data:image")) return part;
        if (typeof part.text === "string" && part.text.startsWith("data:image")) return part.text;
      }
    }
    if (typeof choice.content === "string" && choice.content.startsWith("data:image")) return choice.content;
  } catch (_) {}
  return null;
}

const BUILD = "ai-cast-v3";

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

function jsonRes(data: any, status = 200, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

const MAX_SCREEN_TEST_STILLS = 12;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method === "GET") {
    return jsonRes({ ok: true, build: BUILD }, 200, req);
  }

  let body: any;
  try { body = await req.json(); } catch {
    return jsonRes({ error: "Invalid JSON" }, 400, req);
  }

  const { action } = body;
  if (action === "ping") return jsonRes({ ok: true, build: BUILD }, 200, req);

  // Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonRes({ error: "Unauthorized" }, 401, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const isServiceRole = token === serviceKey;

  let userId: string;
  if (isServiceRole) {
    userId = body.userId;
    if (!userId) return jsonRes({ error: "userId required for service_role" }, 400, req);
  } else {
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return jsonRes({ error: "Unauthorized" }, 401, req);
    userId = userData.user.id;
  }

  const db = createClient(supabaseUrl, serviceKey);

  try {
    switch (action) {
      case "create_actor": {
        const { name, description, negative_prompt, tags } = body;
        const { data, error } = await db.from("ai_actors").insert({
          user_id: userId,
          name: name || "Untitled Actor",
          description: description || "",
          negative_prompt: negative_prompt || "",
          tags: tags || [],
          status: "draft",
        }).select("id, name, status, created_at").single();
        if (error) throw error;

        // Auto-create version 1
        const { data: ver, error: verErr } = await db.from("ai_actor_versions").insert({
          actor_id: data.id,
          version_number: 1,
          recipe_json: { invariants: [], allowed_variations: [], camera_rules: [], lighting_rules: [] },
          created_by: userId,
        }).select("id, version_number").single();
        if (verErr) throw verErr;

        return jsonRes({ actor: data, version: ver }, 200, req);
      }

      case "update_actor": {
        const { actorId, name, description, negative_prompt, tags, status } = body;
        const { data: existing } = await db.from("ai_actors").select("id").eq("id", actorId).eq("user_id", userId).single();
        if (!existing) return jsonRes({ error: "Actor not found or access denied" }, 404, req);

        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (negative_prompt !== undefined) updates.negative_prompt = negative_prompt;
        if (tags !== undefined) updates.tags = tags;
        if (status !== undefined) updates.status = status;

        const { data, error } = await db.from("ai_actors").update(updates).eq("id", actorId).select("*").single();
        if (error) throw error;
        return jsonRes({ actor: data }, 200, req);
      }

      case "list_actors": {
        const { data, error } = await db.from("ai_actors")
          .select("*, ai_actor_versions!ai_actor_versions_actor_id_fkey(id, version_number, created_at, ai_actor_assets(id, actor_version_id, asset_type, public_url, storage_path, meta_json, created_at))")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return jsonRes({ actors: data || [] }, 200, req);
      }

      case "get_actor": {
        const { actorId } = body;
        const { data, error } = await db.from("ai_actors")
          .select("*, ai_actor_versions!ai_actor_versions_actor_id_fkey(*, ai_actor_assets(*))")
          .eq("id", actorId)
          .eq("user_id", userId)
          .single();
        if (error || !data) return jsonRes({ error: "Actor not found" }, 404, req);
        return jsonRes({ actor: data }, 200, req);
      }

      case "create_version": {
        const { actorId, recipe_json } = body;
        const { data: actor } = await db.from("ai_actors").select("id").eq("id", actorId).eq("user_id", userId).single();
        if (!actor) return jsonRes({ error: "Actor not found" }, 404, req);

        const { data: versions } = await db.from("ai_actor_versions")
          .select("version_number")
          .eq("actor_id", actorId)
          .order("version_number", { ascending: false })
          .limit(1);
        const nextVer = ((versions?.[0]?.version_number) || 0) + 1;

        const { data, error } = await db.from("ai_actor_versions").insert({
          actor_id: actorId,
          version_number: nextVer,
          recipe_json: recipe_json || { invariants: [], allowed_variations: [], camera_rules: [], lighting_rules: [] },
          created_by: userId,
        }).select("*").single();
        if (error) throw error;
        return jsonRes({ version: data }, 200, req);
      }

      case "approve_version": {
        const { actorId, versionId } = body;
        console.log("[approve_version] actorId:", actorId, "versionId:", versionId, "userId:", userId);

        if (!actorId || !versionId) {
          return jsonRes({ error: "actorId and versionId are required" }, 400, req);
        }

        const { data: actor, error: actorErr } = await db
          .from("ai_actors")
          .select("id, user_id")
          .eq("id", actorId)
          .eq("user_id", userId)
          .maybeSingle();
        if (actorErr) {
          console.error("[approve_version] actor lookup error:", actorErr.message);
          return jsonRes({ error: `Actor lookup failed: ${actorErr.message}` }, 500, req);
        }
        if (!actor) {
          console.error("[approve_version] actor not found or not owned. actorId:", actorId, "userId:", userId);
          return jsonRes({ error: "Actor not found or not owned by you" }, 404, req);
        }

        const { data: versionRow, error: versionErr } = await db
          .from("ai_actor_versions")
          .select("id, actor_id")
          .eq("id", versionId)
          .eq("actor_id", actorId)
          .maybeSingle();
        if (versionErr) {
          console.error("[approve_version] version lookup error:", versionErr.message);
          return jsonRes({ error: `Version lookup failed: ${versionErr.message}` }, 500, req);
        }
        if (!versionRow) {
          console.error("[approve_version] version not found. versionId:", versionId, "actorId:", actorId);
          // Check if version exists at all
          const { data: anyVer } = await db.from("ai_actor_versions").select("id, actor_id").eq("id", versionId).maybeSingle();
          if (anyVer) {
            console.error("[approve_version] version exists but belongs to actor:", anyVer.actor_id, "not:", actorId);
          } else {
            console.error("[approve_version] version does not exist at all");
          }
          return jsonRes({ error: `Version ${versionId} not found for actor ${actorId}` }, 404, req);
        }

        await db.from("ai_actor_versions")
          .update({ is_approved: false })
          .eq("actor_id", actorId)
          .neq("id", versionId);

        const { data, error } = await db.from("ai_actor_versions")
          .update({ is_approved: true })
          .eq("id", versionId)
          .eq("actor_id", actorId)
          .select("*")
          .single();
        if (error) throw error;

        const { error: actorUpdateError } = await db.from("ai_actors").update({
          status: "active",
          approved_version_id: versionId,
          roster_ready: true,
          promotion_status: "approved",
          promotion_updated_at: new Date().toISOString(),
        }).eq("id", actorId);
        if (actorUpdateError) throw actorUpdateError;

        return jsonRes({ version: data }, 200, req);
      }

      case "add_asset": {
        const { versionId, asset_type, storage_path, public_url, meta_json } = body;

        if (!versionId) {
          return jsonRes({ error: "versionId is required" }, 400, req);
        }

        console.log("[add_asset] Looking up versionId:", versionId, "userId:", userId);

        const { data: ver, error: verErr } = await db
          .from("ai_actor_versions")
          .select("id, actor_id")
          .eq("id", versionId)
          .maybeSingle();
        if (verErr) {
          console.error("[add_asset] version lookup error:", verErr.message);
          return jsonRes({ error: `Version lookup failed: ${verErr.message}` }, 500, req);
        }
        if (!ver) {
          console.error("[add_asset] version not found for id:", versionId);
          return jsonRes({ error: `Version ${versionId} not found` }, 404, req);
        }

        const { data: actorOwner, error: actorOwnerErr } = await db
          .from("ai_actors")
          .select("id, user_id")
          .eq("id", ver.actor_id)
          .maybeSingle();
        if (actorOwnerErr) {
          console.error("[add_asset] actor lookup error:", actorOwnerErr.message);
          return jsonRes({ error: `Actor lookup failed: ${actorOwnerErr.message}` }, 500, req);
        }
        if (!actorOwner) {
          console.error("[add_asset] actor not found for id:", ver.actor_id);
          return jsonRes({ error: `Actor ${ver.actor_id} not found` }, 404, req);
        }
        if (actorOwner.user_id !== userId) {
          console.error("[add_asset] user mismatch: actor.user_id=", actorOwner.user_id, "auth.userId=", userId);
          return jsonRes({ error: "Not your actor" }, 403, req);
        }

        const { data, error } = await db.from("ai_actor_assets").insert({
          actor_version_id: versionId,
          asset_type: asset_type || "reference_image",
          storage_path: storage_path || "",
          public_url: public_url || "",
          meta_json: meta_json || {},
        }).select("*").single();
        if (error) throw error;
        return jsonRes({ asset: data }, 200, req);
      }

      case "delete_asset": {
        const { assetId } = body;
        if (!assetId) return jsonRes({ error: "assetId required" }, 400, req);

        // Verify ownership chain: asset → version → actor.user_id == userId
        const { data: asset } = await db.from("ai_actor_assets")
          .select("id, actor_version_id, ai_actor_versions!inner(actor_id, ai_actors!inner(user_id))")
          .eq("id", assetId)
          .single();

        if (!asset) return jsonRes({ error: "Asset not found" }, 404, req);
        const ownerUserId = (asset as any).ai_actor_versions?.ai_actors?.user_id;
        if (ownerUserId !== userId) {
          return jsonRes({ error: "Access denied — you do not own this asset" }, 403, req);
        }

        const { error } = await db.from("ai_actor_assets").delete().eq("id", assetId);
        if (error) throw error;
        return jsonRes({ deleted: true }, 200, req);
      }

      case "generate_screen_test": {
        const { actorId, versionId, count, mode } = body;
        if (!actorId || !versionId) {
          return jsonRes({ error: "actorId and versionId required" }, 400, req);
        }

        const isExploratory = mode === "exploratory";

        // 1. Verify actor ownership
        const { data: stActor } = await db.from("ai_actors")
          .select("id, name, description, negative_prompt, anchor_coverage_status, user_id")
          .eq("id", actorId).eq("user_id", userId).single();
        if (!stActor) return jsonRes({ error: "Actor not found or access denied" }, 404, req);

        // 2. Verify version belongs to actor
        const { data: stVer } = await db.from("ai_actor_versions")
          .select("id, actor_id").eq("id", versionId).eq("actor_id", actorId).single();
        if (!stVer) return jsonRes({ error: "Version not found for this actor" }, 404, req);

        // 3. Check anchor coverage — ONLY for locked (non-exploratory) mode
        let anchors: any[] = [];
        if (!isExploratory) {
          if ((stActor as any).anchor_coverage_status !== "complete") {
            return jsonRes({
              error: "Insufficient anchor coverage. Upload headshot, full body, and profile reference images first.",
              code: "ANCHOR_COVERAGE_INSUFFICIENT",
              current_status: (stActor as any).anchor_coverage_status,
            }, 400, req);
          }

          // 4. Fetch anchor reference images
          const { data: anchorAssets } = await db.from("ai_actor_assets")
            .select("public_url, asset_type, meta_json")
            .eq("actor_version_id", versionId)
            .in("asset_type", ["reference_headshot", "reference_full_body", "reference_profile"]);
          anchors = (anchorAssets || []).filter((a: any) => a.public_url);

          if (anchors.length < 1) {
            return jsonRes({
              error: "No anchor reference images found for this version.",
              code: "NO_ANCHOR_ASSETS",
            }, 400, req);
          }
        }

        // 5. Build generation prompts
        const actorName = (stActor as any).name || "Character";
        const actorDesc = (stActor as any).description || "";
        const negPrompt = (stActor as any).negative_prompt || "";
        const genCount = Math.min(Math.max(count || 3, 1), MAX_SCREEN_TEST_STILLS);

        if (!gw.apiKey) {
          return jsonRes({ error: "AI generation not configured" }, 500, req);
        }

        const poses = [
          "a cinematic medium close-up portrait, natural lighting, looking slightly off-camera, film grain texture",
          "a cinematic three-quarter body shot, warm practical lighting, subtle environment context, captured on 35mm film",
          "a dramatic close-up with strong side lighting, shallow depth of field, moody atmosphere, shot on Arri Alexa",
          "a full body wide shot in a cinematic environment, natural daylight, authentic wardrobe, documentary-style framing",
          "an intimate over-the-shoulder perspective, soft bokeh background, golden hour light, real skin texture with pores",
          "a dynamic medium shot with movement, slightly desaturated color grade, environmental storytelling, handheld camera feel",
        ];

        // 6. Generate images
        const results: any[] = [];
        const errors: any[] = [];
        const assetType = isExploratory ? "exploratory_still" : "screen_test_still";
        const storageSubdir = isExploratory ? "exploratory" : "screen-test";

        for (let i = 0; i < genCount; i++) {
          const pose = poses[i % poses.length];
          const exploratoryNote = isExploratory
            ? " This is an exploratory concept — generate a distinctive, visually compelling interpretation of this character description."
            : "";
          const prompt = `Generate a photorealistic cinematic still of ${actorName}. ${actorDesc}. The shot is ${pose}. The image must look like a real photograph captured on set — not AI-rendered, not concept art. Real skin texture with visible pores, film grain, imperfect real-world lighting.${exploratoryNote} ${negPrompt ? `Avoid: ${negPrompt}.` : ""} No watermarks, no text overlays.`;

          try {
            // Build messages — include anchor refs only for locked mode
            const messageContent: any[] = [{ type: "text", text: prompt }];
            if (!isExploratory) {
              for (const anchor of anchors.slice(0, 2)) {
                if (anchor.public_url) {
                  messageContent.push({
                    type: "image_url",
                    image_url: { url: anchor.public_url },
                  });
                }
              }
            }

            const aiResp = await fetch(gw.url, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${gw.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3.1-flash-image-preview",
                messages: [{ role: "user", content: messageContent }],
                modalities: ["image", "text"],
              }),
            });

            if (!aiResp.ok) {
              const errText = await aiResp.text();
              console.error(`Screen test gen ${i} failed (${aiResp.status}):`, errText);
              if (aiResp.status === 429) {
                errors.push({ index: i, error: "Rate limited — try again shortly", code: "RATE_LIMITED" });
                continue;
              }
              if (aiResp.status === 402) {
                errors.push({ index: i, error: "Credits exhausted", code: "CREDITS_EXHAUSTED" });
                break;
              }
              errors.push({ index: i, error: `Generation failed: ${aiResp.status}` });
              continue;
            }

            const aiData = await aiResp.json();
            // Use robust multi-format extraction (matches shared imageGen.ts logic)
            const imageB64 = extractImageDataUrl(aiData);

            if (!imageB64) {
              console.error(`Screen test gen ${i}: no image extracted. Response keys:`, Object.keys(aiData?.choices?.[0]?.message || {}));
              errors.push({ index: i, error: "No image returned from model" });
              continue;
            }

            // 7. Decode and upload to storage
            const base64Data = imageB64.split(",")[1];
            const binaryStr = atob(base64Data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let b = 0; b < binaryStr.length; b++) {
              bytes[b] = binaryStr.charCodeAt(b);
            }

            const storagePath = `actors/${actorId}/${storageSubdir}/${versionId}_${i}_${Date.now()}.png`;
            const { error: uploadErr } = await db.storage
              .from("ai-media")
              .upload(storagePath, bytes, { contentType: "image/png", upsert: true });

            if (uploadErr) {
              console.error(`Upload failed for screen test ${i}:`, uploadErr);
              errors.push({ index: i, error: "Upload failed" });
              continue;
            }

            // 8. Get public URL
            const { data: urlData } = db.storage.from("ai-media").getPublicUrl(storagePath);
            const publicUrl = urlData?.publicUrl || "";

            // 9. Persist as asset
            const { data: assetRow, error: assetErr } = await db.from("ai_actor_assets").insert({
              actor_version_id: versionId,
              asset_type: assetType,
              storage_path: storagePath,
              public_url: publicUrl,
              meta_json: {
                shot_type: isExploratory ? "exploratory" : "screen_test",
                generation_mode: isExploratory ? "exploratory" : "reference_locked",
                pose_index: i,
                pose_description: pose,
                generated_at: new Date().toISOString(),
                model: "gemini-3.1-flash-image-preview",
                promotable: isExploratory, // exploratory results can be promoted
              },
            }).select("id, public_url, asset_type, meta_json").single();

            if (assetErr) {
              console.error(`Asset persist failed for ${i}:`, assetErr);
              errors.push({ index: i, error: "Failed to save asset record" });
              continue;
            }

            results.push(assetRow);
          } catch (genErr) {
            console.error(`Screen test generation ${i} exception:`, genErr);
            errors.push({ index: i, error: (genErr as any)?.message || "Unknown generation error" });
          }
        }

        return jsonRes({
          generated: results.length,
          requested: genCount,
          mode: isExploratory ? "exploratory" : "reference_locked",
          assets: results,
          errors: errors.length > 0 ? errors : undefined,
        }, 200, req);
      }

      // ── Generate Profile Reference ──────────────────────────────────────
      case "generate_profile": {
        const { actorId, versionId } = body;
        if (!actorId || !versionId) {
          return jsonRes({ error: "actorId and versionId required" }, 400, req);
        }

        // 1. Verify actor ownership
        const { data: profActor } = await db.from("ai_actors")
          .select("id, name, description, negative_prompt, user_id")
          .eq("id", actorId).eq("user_id", userId).single();
        if (!profActor) return jsonRes({ error: "Actor not found or access denied" }, 404, req);

        // 2. Verify version belongs to actor
        const { data: profVer } = await db.from("ai_actor_versions")
          .select("id, actor_id").eq("id", versionId).eq("actor_id", actorId).single();
        if (!profVer) return jsonRes({ error: "Version not found for this actor" }, 404, req);

        // 3. Check if profile already exists
        const { data: existingProfile } = await db.from("ai_actor_assets")
          .select("id, public_url")
          .eq("actor_version_id", versionId)
          .eq("asset_type", "reference_profile")
          .limit(1);
        if (existingProfile && existingProfile.length > 0 && existingProfile[0].public_url) {
          return jsonRes({
            generated: false,
            already_exists: true,
            asset: existingProfile[0],
            message: "Profile reference already exists",
          }, 200, req);
        }

        // 4. Fetch existing anchors (headshot + full_body) as reference
        const { data: anchorsForProfile } = await db.from("ai_actor_assets")
          .select("public_url, asset_type, meta_json")
          .eq("actor_version_id", versionId)
          .in("asset_type", ["reference_headshot", "reference_full_body"]);
        const validAnchors = (anchorsForProfile || []).filter((a: any) => a.public_url);

        if (validAnchors.length === 0) {
          return jsonRes({
            error: "No existing anchor references found to derive profile from",
            code: "NO_ANCHOR_ASSETS",
          }, 400, req);
        }

        // 5. Generate profile image
        if (!gw.apiKey) {
          return jsonRes({ error: "AI generation not configured" }, 500, req);
        }

        const actorName = (profActor as any).name || "Character";
        const actorDesc = (profActor as any).description || "";
        const negPrompt = (profActor as any).negative_prompt || "";

        const profilePrompt = `Generate a photorealistic cinematic true profile portrait of ${actorName}. ${actorDesc}. The shot is a true side-on profile view — the subject faces 90 degrees to the left or right, showing the full silhouette of nose, lips, chin, and forehead from a perfectly perpendicular angle. Studio or natural lighting, shallow depth of field, real skin texture with visible pores, film grain. This must look like a real photograph, not AI-generated or concept art. ${negPrompt ? `Avoid: ${negPrompt}.` : ""} No watermarks, no text overlays, no front-facing angle.`;

        const messageContent: any[] = [{ type: "text", text: profilePrompt }];
        for (const anchor of validAnchors.slice(0, 2)) {
          messageContent.push({
            type: "image_url",
            image_url: { url: anchor.public_url },
          });
        }

        try {
          const aiResp = await fetch(gw.url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${gw.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3.1-flash-image-preview",
              messages: [{ role: "user", content: messageContent }],
              modalities: ["image", "text"],
            }),
          });

          if (!aiResp.ok) {
            const errText = await aiResp.text();
            console.error(`[generate_profile] AI failed (${aiResp.status}):`, errText);
            return jsonRes({ error: `Profile generation failed: ${aiResp.status}` }, 500, req);
          }

          const aiData = await aiResp.json();
          const imageB64 = extractImageDataUrl(aiData);
          if (!imageB64) {
            return jsonRes({ error: "No image returned from model" }, 500, req);
          }

          // 6. Upload to storage
          const base64Data = imageB64.split(",")[1];
          const binaryStr = atob(base64Data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let b = 0; b < binaryStr.length; b++) {
            bytes[b] = binaryStr.charCodeAt(b);
          }

          const storagePath = `actors/${actorId}/profile/${versionId}_profile_${Date.now()}.png`;
          const { error: uploadErr } = await db.storage
            .from("ai-media")
            .upload(storagePath, bytes, { contentType: "image/png", upsert: true });

          if (uploadErr) {
            console.error("[generate_profile] upload failed:", uploadErr);
            return jsonRes({ error: "Failed to upload profile image" }, 500, req);
          }

          const { data: urlData } = db.storage.from("ai-media").getPublicUrl(storagePath);
          const publicUrl = urlData?.publicUrl || "";

          // 7. Persist as reference_profile asset
          const { data: assetRow, error: assetErr } = await db.from("ai_actor_assets").insert({
            actor_version_id: versionId,
            asset_type: "reference_profile",
            storage_path: storagePath,
            public_url: publicUrl,
            meta_json: {
              shot_type: "profile",
              generation_mode: "reference_locked",
              source: "cast_strengthening",
              generated_at: new Date().toISOString(),
              model: "gemini-3.1-flash-image-preview",
              derived_from: validAnchors.map((a: any) => a.asset_type),
            },
          }).select("id, public_url, asset_type, meta_json").single();

          if (assetErr) {
            console.error("[generate_profile] asset persist failed:", assetErr);
            return jsonRes({ error: "Failed to save profile asset" }, 500, req);
          }

          return jsonRes({
            generated: true,
            asset: assetRow,
          }, 200, req);
        } catch (genErr) {
          console.error("[generate_profile] exception:", genErr);
          return jsonRes({ error: (genErr as any)?.message || "Profile generation failed" }, 500, req);
        }
      }

      case "get_cast_context": {
        const { projectId } = body;
        if (!projectId) return jsonRes({ error: "projectId required" }, 400, req);

        // Verify project access — for service role, still verify the provided userId has access
        const { data: hasAccess } = await db.rpc("has_project_access", {
          _user_id: userId,
          _project_id: projectId,
        });
        if (!hasAccess) return jsonRes({ error: "Access denied" }, 403, req);

        // Get all cast mappings for the project, ensuring actors belong to the calling user
        const { data: castMappings, error: castErr } = await db
          .from("project_ai_cast")
          .select(`
            character_key, wardrobe_pack, notes, ai_actor_version_id,
            ai_actors!inner(id, name, description, negative_prompt, tags, user_id, approved_version_id, roster_ready)
          `)
          .eq("project_id", projectId);

        if (castErr) throw castErr;

        // Filter to only actors owned by the caller (cross-user actors blocked)
        const ownedMappings = (castMappings || []).filter(
          (m: any) => (m as any).ai_actors?.user_id === userId
        );

        // For each mapping, resolve ONLY the pinned version from binding — no fallback
        const castContext: any[] = [];
        for (const mapping of ownedMappings) {
          const actor = (mapping as any).ai_actors;
          // MUST use pinned version from binding only — no fallback to approved_version_id
          const versionId = (mapping as any).ai_actor_version_id || null;

          if (!versionId) {
            // No pinned version — explicit unbound, skip this mapping
            castContext.push({
              character_key: mapping.character_key,
              actor_name: actor?.name,
              bound: false,
              reason: 'no_pinned_version',
            });
            continue;
          }

          const { data: verData } = await db.from("ai_actor_versions")
            .select("id, version_number, recipe_json")
            .eq("id", versionId)
            .maybeSingle();

          const { data: assetData } = await db.from("ai_actor_assets")
            .select("asset_type, storage_path, public_url, meta_json")
            .eq("actor_version_id", versionId)
            .in("asset_type", ["reference_image", "screen_test_still", "reference_headshot", "reference_full_body"]);
          const assets = assetData || [];

          castContext.push({
            character_key: mapping.character_key,
            bound: true,
            actor_id: actor?.id,
            actor_name: actor?.name,
            actor_version_id: versionId,
            description: actor?.description,
            negative_prompt: actor?.negative_prompt,
            recipe: verData?.recipe_json || {},
            reference_images: assets.filter((a: any) => a.asset_type === "reference_image" || a.asset_type === "reference_headshot" || a.asset_type === "reference_full_body").map((a: any) => a.public_url),
            screen_test_images: assets.filter((a: any) => a.asset_type === "screen_test_still").map((a: any) => a.public_url),
            wardrobe_pack: mapping.wardrobe_pack,
          });
        }

        return jsonRes({ cast_context: castContext }, 200, req);
      }

      case "delete_actor": {
        const { actorId } = body;
        if (!actorId) return jsonRes({ error: "actorId required" }, 400, req);

        // Verify ownership
        const { data: actorRow } = await db.from("ai_actors")
          .select("id, roster_ready, user_id")
          .eq("id", actorId)
          .eq("user_id", userId)
          .single();
        if (!actorRow) return jsonRes({ error: "Actor not found or access denied" }, 404, req);

        // Safety: block deletion of roster-ready actors unless force flag
        if ((actorRow as any).roster_ready && !body.force) {
          return jsonRes({
            error: "Cannot delete a roster-ready actor. Revoke roster status first, or pass force: true.",
            code: "ROSTER_READY_BLOCK",
          }, 400, req);
        }

        // Cascade delete: assets → versions → validation data → promotion decisions → bindings → actor
        // 1. Delete assets for all versions
        const { data: versionIds } = await db.from("ai_actor_versions")
          .select("id").eq("actor_id", actorId);
        const vIds = (versionIds || []).map((v: any) => v.id);
        if (vIds.length > 0) {
          await db.from("ai_actor_assets").delete().in("actor_version_id", vIds);
        }

        // 2. Delete validation images → results → runs
        const { data: runIds } = await db.from("actor_validation_runs")
          .select("id").eq("actor_id", actorId);
        const rIds = (runIds || []).map((r: any) => r.id);
        if (rIds.length > 0) {
          await db.from("actor_validation_images").delete().in("validation_run_id", rIds);
          await db.from("actor_validation_results").delete().in("validation_run_id", rIds);
        }
        await db.from("actor_validation_runs").delete().eq("actor_id", actorId);

        // 3. Delete promotion decisions
        await db.from("actor_promotion_decisions").delete().eq("actor_id", actorId);

        // 4. Delete marketplace listings
        await db.from("actor_marketplace_listings").delete().eq("actor_id", actorId);

        // 5. Delete cast bindings referencing this actor
        await db.from("project_ai_cast").delete().eq("ai_actor_id", actorId);

        // 5b. Delete pending actor binds
        await db.from("pending_actor_binds").delete().eq("actor_id", actorId);

        // 6. Delete casting candidates referencing this actor
        await db.from("casting_candidates").delete().eq("promoted_actor_id", actorId);

        // 7. Delete versions
        await db.from("ai_actor_versions").delete().eq("actor_id", actorId);

        // 8. Delete actor
        const { error: delErr } = await db.from("ai_actors").delete().eq("id", actorId);
        if (delErr) throw delErr;

        return jsonRes({ deleted: true, actor_id: actorId, versions_deleted: vIds.length }, 200, req);
      }

      case "start_convergence": {
        const { actorId, versionId, mode, policy } = body;
        if (!actorId || !versionId) return jsonRes({ error: "actorId and versionId required" }, 400, req);

        // Verify actor ownership
        const { data: cvActor } = await db.from("ai_actors")
          .select("id, anchor_coverage_status").eq("id", actorId).eq("user_id", userId).single();
        if (!cvActor) return jsonRes({ error: "Actor not found" }, 404, req);

        // For locked mode, verify anchors
        if (mode === "reference_locked" && (cvActor as any).anchor_coverage_status !== "complete") {
          return jsonRes({ error: "Anchor coverage incomplete for locked convergence", code: "ANCHOR_COVERAGE_INSUFFICIENT" }, 400, req);
        }

        const defaultPolicy = mode === "exploratory"
          ? { maxRounds: 4, candidatesPerRound: 4, keepTopN: 2 }
          : { maxRounds: 5, candidatesPerRound: 3, keepTopN: 1 };
        const mergedPolicy = { ...defaultPolicy, ...(policy || {}) };

        const { data: run, error: runErr } = await db.from("convergence_runs").insert({
          actor_id: actorId,
          actor_version_id: versionId,
          user_id: userId,
          mode: mode || "exploratory",
          status: "running",
          policy_json: mergedPolicy,
          current_round: 0,
          max_rounds: mergedPolicy.maxRounds || 5,
          started_at: new Date().toISOString(),
        }).select("*").single();
        if (runErr) throw runErr;

        // Log event
        await db.from("convergence_events").insert({
          run_id: run.id,
          event_type: "run_started",
          payload: { mode, policy: mergedPolicy },
        });

        return jsonRes({ run }, 200, req);
      }

      case "step_convergence": {
        const { runId } = body;
        if (!runId) return jsonRes({ error: "runId required" }, 400, req);

        const { data: run } = await db.from("convergence_runs")
          .select("*").eq("id", runId).eq("user_id", userId).single();
        if (!run) return jsonRes({ error: "Run not found" }, 404, req);
        if ((run as any).status !== "running") {
          return jsonRes({ error: "Run is not active", status: (run as any).status }, 400, req);
        }

        const nextRoundNum = ((run as any).current_round || 0) + 1;
        const policyJson = (run as any).policy_json || {};
        const maxRounds = (run as any).max_rounds || 5;
        const genCount = policyJson.candidatesPerRound || 3;
        const keepTopN = policyJson.keepTopN || 1;
        const runMode = (run as any).mode || "exploratory";
        const isExploratory = runMode === "exploratory";

        // Check stop condition
        if (nextRoundNum > maxRounds) {
          await db.from("convergence_runs").update({
            status: "completed",
            stop_reason: `Max rounds reached (${maxRounds})`,
            completed_at: new Date().toISOString(),
          }).eq("id", runId);
          return jsonRes({ status: "completed", reason: "max_rounds" }, 200, req);
        }

        // Determine strategy
        let strategy = "exploratory_wide";
        if (!isExploratory) strategy = "locked_tight";
        if (nextRoundNum >= 4) strategy = "recovery_repair";

        // ── Resolve evaluation reference policy ──
        let evaluationReferencePolicy: string;
        let evaluationMode: string;
        let referenceIds: string[] = [];
        let referenceUrls: string[] = [];

        if (!isExploratory) {
          // LOCKED MODE: canonical anchors only, never generated candidates
          evaluationReferencePolicy = "canonical_anchors";
          evaluationMode = "reference_locked";
        } else if (nextRoundNum === 1) {
          // EXPLORATORY ROUND 1: intra-round pairwise cohesion — no single candidate is truth
          evaluationReferencePolicy = "intra_round_pairwise";
          evaluationMode = "exploratory_cohesion";
        } else {
          // EXPLORATORY ROUND 2+: prior-round keepers as reference cluster
          evaluationReferencePolicy = "prior_keeper_cluster";
          evaluationMode = "exploratory_cluster";
        }

        // Create round with evaluation metadata
        const { data: round, error: roundErr } = await db.from("convergence_rounds").insert({
          run_id: runId,
          round_number: nextRoundNum,
          stage: "generating",
          strategy,
          generation_count: genCount,
          started_at: new Date().toISOString(),
          evaluation_reference_policy: evaluationReferencePolicy,
          evaluation_mode: evaluationMode,
        }).select("*").single();
        if (roundErr) throw roundErr;

        // Update run
        await db.from("convergence_runs").update({ current_round: nextRoundNum }).eq("id", runId);

        // Create candidate placeholders
        const candidateRows = [];
        for (let i = 0; i < genCount; i++) {
          candidateRows.push({
            round_id: round.id,
            run_id: runId,
            candidate_index: i,
            status: "generating",
            generation_config: { pose_index: i, strategy },
          });
        }
        const { data: candidates, error: candErr } = await db.from("convergence_candidates")
          .insert(candidateRows).select("*");
        if (candErr) throw candErr;

        // Generate images for each candidate
        const actorId = (run as any).actor_id;
        const versionId = (run as any).actor_version_id;

        const { data: stActor } = await db.from("ai_actors")
          .select("name, description, negative_prompt, anchor_coverage_status")
          .eq("id", actorId).single();

        // Fetch anchors for locked mode — deterministic sort by created_at
        let anchors: any[] = [];
        if (!isExploratory) {
          const { data: anchorAssets } = await db.from("ai_actor_assets")
            .select("id, public_url, asset_type, meta_json, created_at")
            .eq("actor_version_id", versionId)
            .in("asset_type", ["reference_headshot", "reference_full_body", "reference_profile"])
            .order("created_at", { ascending: true });
          anchors = (anchorAssets || []).filter((a: any) => a.public_url);
          referenceIds = anchors.map((a: any) => a.id);
          referenceUrls = anchors.map((a: any) => a.public_url);
        }

        // For exploratory round 2+, fetch prior-round keepers as reference cluster
        if (isExploratory && nextRoundNum > 1) {
          const { data: priorKeepers } = await db.from("convergence_candidates")
            .select("id, asset_id, ai_actor_assets(public_url)")
            .eq("run_id", runId)
            .eq("selection_status", "keeper")
            .order("score", { ascending: false })
            .limit(3);
          const kps = ((priorKeepers || []) as any[]).filter((k: any) => k.ai_actor_assets?.public_url);
          referenceIds = kps.map((k: any) => k.id);
          referenceUrls = kps.map((k: any) => k.ai_actor_assets.public_url);
        }

        // Persist reference_ids on round
        if (referenceIds.length > 0) {
          await db.from("convergence_rounds").update({ reference_ids: referenceIds }).eq("id", round.id);
        }

        if (!gw.apiKey) {
          await db.from("convergence_rounds").update({ stage: "failed" }).eq("id", round.id);
          return jsonRes({ error: "AI generation not configured" }, 500, req);
        }

        const actorName = (stActor as any)?.name || "Character";
        const actorDesc = (stActor as any)?.description || "";
        const negPrompt = (stActor as any)?.negative_prompt || "";

        const poses = [
          "a cinematic medium close-up portrait, natural lighting, looking slightly off-camera, film grain texture",
          "a cinematic three-quarter body shot, warm practical lighting, subtle environment context, captured on 35mm film",
          "a dramatic close-up with strong side lighting, shallow depth of field, moody atmosphere, shot on Arri Alexa",
          "a full body wide shot in a cinematic environment, natural daylight, authentic wardrobe, documentary-style framing",
          "an intimate over-the-shoulder perspective, soft bokeh background, golden hour light, real skin texture with pores",
          "a dynamic medium shot with movement, slightly desaturated color grade, environmental storytelling, handheld camera feel",
        ];

        const assetType = isExploratory ? "exploratory_still" : "screen_test_still";
        const storageSubdir = isExploratory ? "exploratory" : "screen-test";
        let successCount = 0;

        for (let i = 0; i < (candidates || []).length; i++) {
          const cand = (candidates as any[])[i];
          const pose = poses[i % poses.length];
          const exploratoryNote = isExploratory
            ? " This is an exploratory concept — generate a distinctive, visually compelling interpretation."
            : "";
          const roundNote = nextRoundNum > 1 ? ` This is refinement round ${nextRoundNum} — prioritize identity consistency and stability.` : "";
          const prompt = `Generate a photorealistic cinematic still of ${actorName}. ${actorDesc}. The shot is ${pose}. Real photograph on set — not AI-rendered. Real skin texture, film grain, imperfect lighting.${exploratoryNote}${roundNote} ${negPrompt ? `Avoid: ${negPrompt}.` : ""} No watermarks, no text.`;

          try {
            const messageContent: any[] = [{ type: "text", text: prompt }];
            if (!isExploratory) {
              for (const anchor of anchors.slice(0, 2)) {
                if (anchor.public_url) {
                  messageContent.push({ type: "image_url", image_url: { url: anchor.public_url } });
                }
              }
            }

            const aiResp = await fetch(gw.url, {
              method: "POST",
              headers: { Authorization: `Bearer ${gw.apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-3.1-flash-image-preview",
                messages: [{ role: "user", content: messageContent }],
                modalities: ["image", "text"],
              }),
            });

            if (!aiResp.ok) {
              await db.from("convergence_candidates").update({ status: "failed" }).eq("id", cand.id);
              continue;
            }

            const aiData = await aiResp.json();
            const imageB64 = extractImageDataUrl(aiData);

            if (!imageB64) {
              await db.from("convergence_candidates").update({ status: "failed" }).eq("id", cand.id);
              continue;
            }

            // Upload
            const base64Data = imageB64.split(",")[1];
            const binaryStr = atob(base64Data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let b = 0; b < binaryStr.length; b++) bytes[b] = binaryStr.charCodeAt(b);

            const storagePath = `actors/${actorId}/convergence/${runId}_r${nextRoundNum}_c${i}_${Date.now()}.png`;
            const { error: uploadErr } = await db.storage.from("ai-media").upload(storagePath, bytes, { contentType: "image/png", upsert: true });
            if (uploadErr) {
              await db.from("convergence_candidates").update({ status: "failed" }).eq("id", cand.id);
              continue;
            }

            const { data: urlData } = db.storage.from("ai-media").getPublicUrl(storagePath);
            const publicUrl = urlData?.publicUrl || "";

            // Persist asset
            const { data: assetRow } = await db.from("ai_actor_assets").insert({
              actor_version_id: versionId,
              asset_type: assetType,
              storage_path: storagePath,
              public_url: publicUrl,
              meta_json: {
                generation_mode: runMode,
                convergence_run_id: runId,
                convergence_round: nextRoundNum,
                pose_index: i,
                model: "gemini-3.1-flash-image-preview",
                generated_at: new Date().toISOString(),
              },
            }).select("id").single();

            // Update candidate
            await db.from("convergence_candidates").update({
              status: "generated",
              asset_id: assetRow?.id || null,
            }).eq("id", cand.id);

            successCount++;
          } catch (e) {
            console.error(`Convergence gen ${i} error:`, e);
            await db.from("convergence_candidates").update({ status: "failed" }).eq("id", cand.id);
          }
        }

        // ── Validation Phase — multi-reference, mode-aware ──
        await db.from("convergence_rounds").update({ stage: "validating" }).eq("id", round.id);

        const { data: roundCands } = await db.from("convergence_candidates")
          .select("*, ai_actor_assets(public_url)").eq("round_id", round.id);

        const generatedCands = ((roundCands || []) as any[]).filter(
          c => c.status === "generated" && c.ai_actor_assets?.public_url
        );

        // Update all generated candidates to validating
        for (const c of generatedCands) {
          await db.from("convergence_candidates").update({ status: "validating" }).eq("id", c.id);
        }

        // ── Build reference set based on evaluation policy ──
        let evalReferenceSet: string[] = []; // URLs to compare against
        const SCORING_MODEL = "google/gemini-2.5-flash-lite";
        const SCORING_PROMPT_VERSION = "v2-multi-ref";

        if (evaluationReferencePolicy === "canonical_anchors") {
          // LOCKED: use all canonical anchors (already fetched, deterministically sorted by created_at)
          evalReferenceSet = referenceUrls;
        } else if (evaluationReferencePolicy === "prior_keeper_cluster") {
          // EXPLORATORY 2+: prior round keepers
          evalReferenceSet = referenceUrls;
        }
        // For "intra_round_pairwise" (exploratory round 1), we handle below specially

        // ── Scoring Phase — deterministic multi-reference aggregation ──
        await db.from("convergence_rounds").update({ stage: "scoring" }).eq("id", round.id);

        let bestScore = 0;
        let totalScore = 0;
        let scoredCount = 0;

        // Helper: single AI pairwise comparison
        async function evaluatePair(refUrl: string, candUrl: string): Promise<{ score: number; reason: string; error?: string }> {
          const comparePrompt = `You are an identity consistency evaluator. Compare these two images of the same character and rate identity consistency on a scale of 0-10.
Focus on: facial structure, nose shape, eye spacing, jawline, cheekbones, overall proportions, hair color/style, skin tone, body build.
Return ONLY a JSON object: {"score": <number 0-10>, "reason": "<brief reason>"}
Score guide: 10=identical person, 7-9=same person with natural variation, 4-6=ambiguous/uncertain, 0-3=different person.`;

          const compareContent: any[] = [
            { type: "image_url", image_url: { url: refUrl } },
            { type: "image_url", image_url: { url: candUrl } },
            { type: "text", text: comparePrompt },
          ];

          const evalResp = await fetch(gw.url, {
            method: "POST",
            headers: { Authorization: `Bearer ${gw.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: SCORING_MODEL,
              messages: [{ role: "user", content: compareContent }],
              response_format: { type: "json_object" },
            }),
          });

          if (!evalResp.ok) return { score: 5, reason: "evaluator_error", error: "ADV-EVALUATOR-ERROR" };
          const evalData = await evalResp.json();
          const evalText = evalData.choices?.[0]?.message?.content || "";
          try {
            const parsed = JSON.parse(evalText);
            if (typeof parsed.score === "number") {
              return { score: Math.min(10, Math.max(0, parsed.score)), reason: parsed.reason || "" };
            }
          } catch {}
          const match = evalText.match(/(\d+(?:\.\d+)?)/);
          if (match) return { score: Math.min(10, Math.max(0, parseFloat(match[1]))), reason: "parse_fallback", error: "ADV-PARSE-FALLBACK" };
          return { score: 5, reason: "parse_failed", error: "ADV-PARSE-FAILED" };
        }

        // Deterministic median aggregation
        function medianScore(scores: number[]): number {
          if (scores.length === 0) return 50;
          const sorted = [...scores].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }

        for (const cand of ((roundCands || []) as any[])) {
          if (cand.status === "failed") continue;
          const candUrl = cand.ai_actor_assets?.public_url;
          if (!candUrl) {
            await db.from("convergence_candidates").update({ status: "failed" }).eq("id", cand.id);
            continue;
          }

          let hardFailCodes: string[] = [];
          let advisoryCodes: string[] = [];
          let axisScores: Record<string, unknown> = {};
          let rawEvaluations: { ref_id: string; score: number; reason: string }[] = [];
          let evaluatedAgainst: string[] = [];
          let finalScore: number;

          if (evaluationReferencePolicy === "intra_round_pairwise") {
            // ── EXPLORATORY ROUND 1: pairwise cohesion ──
            // Compare this candidate against all OTHER generated candidates in the round
            // Score = median pairwise consistency (no single candidate is truth)
            const otherCands = generatedCands.filter((o: any) =>
              o.id !== cand.id && o.ai_actor_assets?.public_url
            );
            const pairScores: number[] = [];
            for (const other of otherCands.slice(0, 3)) { // cap at 3 comparisons for runtime safety
              try {
                const result = await evaluatePair(other.ai_actor_assets.public_url, candUrl);
                pairScores.push(result.score);
                rawEvaluations.push({ ref_id: other.id, score: result.score, reason: result.reason });
                evaluatedAgainst.push(other.id);
                if (result.error) advisoryCodes.push(result.error);
                await new Promise(r => setTimeout(r, 800));
              } catch (e) {
                advisoryCodes.push("ADV-EVALUATOR-EXCEPTION");
              }
            }
            if (pairScores.length === 0) {
              // Only candidate or all comparisons failed — neutral score
              finalScore = 50;
              axisScores.cohesion_note = "insufficient_peers";
            } else {
              const medianRaw = medianScore(pairScores);
              finalScore = Math.round(medianRaw * 10);
              axisScores.pairwise_scores = pairScores;
              axisScores.median_raw = medianRaw;
            }
          } else if (evalReferenceSet.length > 0) {
            // ── MULTI-REFERENCE SCORING: locked anchors or prior keeper cluster ──
            // Exclude self-reference: skip if candUrl matches any reference URL
            const nonSelfRefs = evalReferenceSet.filter(rUrl => rUrl !== candUrl);
            if (nonSelfRefs.length === 0) {
              // All references are self — neutral score, flag it
              finalScore = 50;
              advisoryCodes.push("ADV-SELF-REFERENCE-ONLY");
              axisScores.self_reference = true;
            } else {
              const refScores: number[] = [];
              for (const refUrl of nonSelfRefs.slice(0, 3)) { // cap at 3 for runtime safety
                // Resolve stable reference ID from parallel referenceIds/referenceUrls arrays
                const refIndex = evalReferenceSet.indexOf(refUrl);
                const stableRefId = refIndex >= 0 && refIndex < referenceIds.length ? referenceIds[refIndex] : null;
                try {
                  const result = await evaluatePair(refUrl, candUrl);
                  refScores.push(result.score);
                  rawEvaluations.push({ ref_id: stableRefId || "unknown", score: result.score, reason: result.reason });
                  evaluatedAgainst.push(stableRefId || "unknown");
                  if (result.error) advisoryCodes.push(result.error);
                  await new Promise(r => setTimeout(r, 800));
                } catch (e) {
                  advisoryCodes.push("ADV-EVALUATOR-EXCEPTION");
                }
              }
              if (refScores.length === 0) {
                finalScore = 50;
                advisoryCodes.push("ADV-ALL-EVALS-FAILED");
              } else {
                const medianRaw = medianScore(refScores);
                finalScore = Math.round(medianRaw * 10);
                axisScores.per_reference_scores = refScores;
                axisScores.median_raw = medianRaw;
                axisScores.reference_count = nonSelfRefs.length;
              }
            }
          } else {
            // No references available — neutral baseline
            finalScore = 50;
            advisoryCodes.push("ADV-NO-REFERENCES");
          }

          // Hard fail / advisory from score
          if (finalScore < 30) hardFailCodes.push("HF-IDENTITY-DRIFT");
          if (finalScore >= 30 && finalScore < 50) advisoryCodes.push("ADV-IDENTITY-MARGINAL");

          const scoreBand = finalScore >= 90 ? "elite" : finalScore >= 75 ? "stable" : finalScore >= 60 ? "promising" : "weak";
          const confidence = advisoryCodes.length === 0 ? "high"
            : advisoryCodes.some(c => c.includes("ERROR") || c.includes("FAILED")) ? "low" : "medium";

          // Deduplicate advisory codes
          advisoryCodes = [...new Set(advisoryCodes)];

          // Persist scored candidate — rank_position is NOT set here (written only in selection phase)
          await db.from("convergence_candidates").update({
            status: "scored",
            score: finalScore,
            score_band: scoreBand,
            axis_scores: axisScores,
            hard_fail_codes: hardFailCodes,
            advisory_codes: advisoryCodes,
            confidence,
            evaluation_mode: evaluationMode,
            evaluated_against: evaluatedAgainst,
            scoring_model: SCORING_MODEL,
            scoring_prompt_version: SCORING_PROMPT_VERSION,
            raw_evaluation_json: rawEvaluations,
          }).eq("id", cand.id);

          totalScore += finalScore;
          scoredCount++;
          if (finalScore > bestScore) bestScore = finalScore;
        }

        // ── Selection Phase (deterministic ranking: hard fails last, score desc, candidate_index asc) ──
        await db.from("convergence_rounds").update({ stage: "selecting" }).eq("id", round.id);

        // Re-fetch scored candidates for deterministic ranking
        const { data: scoredCands } = await db.from("convergence_candidates")
          .select("*").eq("round_id", round.id).not("status", "eq", "failed");

        // Deterministic sort: hard fails last → higher score first → lower candidate_index first
        const ranked = ((scoredCands || []) as any[]).sort((a, b) => {
          const aFails = (a.hard_fail_codes || []).length;
          const bFails = (b.hard_fail_codes || []).length;
          if (aFails !== bFails) return aFails - bFails; // fewer hard fails first
          const scoreDiff = (b.score || 0) - (a.score || 0); // higher score first
          if (scoreDiff !== 0) return scoreDiff;
          return (a.candidate_index || 0) - (b.candidate_index || 0); // deterministic tie-breaker
        });

        let keeperCount = 0;
        let rejectedCount = 0;
        const hardFailCount = ranked.filter((c: any) => (c.hard_fail_codes || []).length > 0).length;

        for (let i = 0; i < ranked.length; i++) {
          const c = ranked[i];
          const hasHardFails = (c.hard_fail_codes || []).length > 0;
          const isKeeper = i < keepTopN && !hasHardFails;
          const rationale = isKeeper
            ? `Ranked #${i + 1} — score ${Number(c.score).toFixed(0)}, no hard fails`
            : hasHardFails
              ? `Hard fail: ${(c.hard_fail_codes || []).join(", ")}`
              : `Below keep threshold (rank #${i + 1})`;
          await db.from("convergence_candidates").update({
            status: isKeeper ? "keeper" : "rejected",
            selection_status: isKeeper ? "keeper" : "rejected",
            selection_rationale: rationale,
            rank_position: i + 1,
          }).eq("id", c.id);
          if (isKeeper) keeperCount++;
          else rejectedCount++;
        }

        // Get previous round best for delta
        let improvementDelta: number | null = null;
        if (nextRoundNum > 1) {
          const { data: prevRounds } = await db.from("convergence_rounds")
            .select("best_score").eq("run_id", runId).eq("round_number", nextRoundNum - 1).single();
          if (prevRounds && (prevRounds as any).best_score !== null) {
            improvementDelta = bestScore - Number((prevRounds as any).best_score);
          }
        }

        // Determine stop eligibility — fully deterministic from persisted evidence
        const requiredBandThreshold: Record<string, number> = { weak: 0, promising: 60, stable: 75, elite: 90 };
        const requiredThreshold = requiredBandThreshold[policyJson.requiredScoreBand || "promising"] || 60;
        const stopEligible = bestScore >= requiredThreshold && hardFailCount === 0;

        // Fail-fast: persistent hard fails after multiple rounds
        const failFast = policyJson.failFastOnHardFail && hardFailCount > 0 && nextRoundNum >= 2;

        // Plateau detection from persisted round deltas
        const plateauDetected = nextRoundNum >= 2 && improvementDelta !== null
          && Math.abs(improvementDelta) < (policyJson.minImprovementDelta || 2);

        // Update round with evidence-based summary
        await db.from("convergence_rounds").update({
          stage: "complete",
          keeper_count: keeperCount,
          rejected_count: rejectedCount,
          best_score: bestScore,
          avg_score: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null,
          improvement_delta: improvementDelta,
          stop_eligible: stopEligible,
          completed_at: new Date().toISOString(),
        }).eq("id", round.id);

        // Update run best candidate — use deterministic ranked[0]
        const topKeeper = ranked[0];
        if (topKeeper) {
          const shortlisted = ((run as any).shortlisted_candidate_ids || []) as string[];
          await db.from("convergence_runs").update({
            best_candidate_id: topKeeper.id,
            shortlisted_candidate_ids: [...new Set([...shortlisted, topKeeper.id])],
          }).eq("id", runId);
        }

        // Check convergence — deterministic stop from persisted evidence
        const shouldStop = stopEligible || nextRoundNum >= maxRounds || failFast || plateauDetected;

        if (shouldStop) {
          let stopReason: string;
          if (stopEligible) {
            stopReason = `Score threshold met: ${bestScore} >= ${requiredThreshold} (${policyJson.requiredScoreBand || "promising"}), no hard fails`;
          } else if (failFast) {
            stopReason = `Hard failures persist after ${nextRoundNum} rounds (${hardFailCount} candidates with hard fails)`;
          } else if (plateauDetected) {
            stopReason = `Plateau: improvement ${improvementDelta?.toFixed(1)} < min delta ${policyJson.minImprovementDelta || 2}`;
          } else {
            stopReason = `Max rounds reached (${maxRounds})`;
          }

          const recommendation = stopEligible
            ? (runMode === "reference_locked" ? "Ready for promotion review" : "Ready to promote into locked identity flow")
            : failFast
              ? "Identity consistency too low — consider updating references or description"
              : "Best candidate available — manual review recommended";

          await db.from("convergence_runs").update({
            status: "completed",
            stop_reason: stopReason,
            final_recommendation: recommendation,
            completed_at: new Date().toISOString(),
          }).eq("id", runId);

          await db.from("convergence_events").insert({
            run_id: runId,
            round_id: round.id,
            event_type: "run_completed",
            payload: { stop_reason: stopReason, best_score: bestScore, rounds: nextRoundNum, hard_fail_count: hardFailCount, keeper_ids: ranked.filter((c: any) => c.selection_status === "keeper").map((c: any) => c.id) },
          });

          return jsonRes({
            status: "completed",
            round: nextRoundNum,
            best_score: bestScore,
            keepers: keeperCount,
            stop_reason: stopReason,
            recommendation,
          }, 200, req);
        }

        // Log round event with real evidence
        await db.from("convergence_events").insert({
          run_id: runId,
          round_id: round.id,
          event_type: "round_completed",
          payload: { round: nextRoundNum, best_score: bestScore, avg_score: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null, keepers: keeperCount, hard_fail_count: hardFailCount, improvement_delta: improvementDelta },
        });

        return jsonRes({
          status: "running",
          round: nextRoundNum,
          best_score: bestScore,
          keepers: keeperCount,
          improvement_delta: improvementDelta,
          next_round: nextRoundNum + 1,
        }, 200, req);
      }

      case "abort_convergence": {
        const { runId } = body;
        if (!runId) return jsonRes({ error: "runId required" }, 400, req);

        const { data: run } = await db.from("convergence_runs")
          .select("id, status").eq("id", runId).eq("user_id", userId).single();
        if (!run) return jsonRes({ error: "Run not found" }, 404, req);

        await db.from("convergence_runs").update({
          status: "aborted",
          stop_reason: "User aborted",
          completed_at: new Date().toISOString(),
        }).eq("id", runId);

        await db.from("convergence_events").insert({
          run_id: runId,
          event_type: "run_aborted",
          payload: { aborted_at_round: (run as any).current_round },
        });

        return jsonRes({ aborted: true }, 200, req);
      }

      case "get_convergence_status": {
        const { runId } = body;
        if (!runId) return jsonRes({ error: "runId required" }, 400, req);

        const { data: run } = await db.from("convergence_runs")
          .select("*").eq("id", runId).eq("user_id", userId).single();
        if (!run) return jsonRes({ error: "Run not found" }, 404, req);

        const { data: rounds } = await db.from("convergence_rounds")
          .select("*").eq("run_id", runId).order("round_number", { ascending: true });

        const { data: candidates } = await db.from("convergence_candidates")
          .select("*, ai_actor_assets(public_url, asset_type)")
          .eq("run_id", runId).order("created_at", { ascending: true });

        return jsonRes({ run, rounds: rounds || [], candidates: candidates || [] }, 200, req);
      }

      case "promote_convergence_candidate": {
        const { candidateId, runId: promRunId } = body;
        if (!candidateId) return jsonRes({ error: "candidateId required" }, 400, req);

        // 1. Fetch candidate with asset
        const { data: promCand } = await db.from("convergence_candidates")
          .select("*, ai_actor_assets(id, public_url, storage_path, asset_type, meta_json)")
          .eq("id", candidateId).single();
        if (!promCand) return jsonRes({ error: "Candidate not found" }, 404, req);

        const cand = promCand as any;

        // 2. Fetch run to verify ownership and get context
        const actualRunId = promRunId || cand.run_id;
        const { data: promRun } = await db.from("convergence_runs")
          .select("*, ai_actors!inner(id, name, description, negative_prompt, tags, user_id)")
          .eq("id", actualRunId).single();
        if (!promRun) return jsonRes({ error: "Convergence run not found" }, 404, req);

        const runData = promRun as any;
        if (runData.ai_actors?.user_id !== userId) {
          return jsonRes({ error: "Access denied" }, 403, req);
        }

        // 3. Eligibility checks — server-side canonical enforcement
        if (cand.status === "failed") {
          return jsonRes({ error: "Cannot promote a failed candidate", code: "CANDIDATE_FAILED" }, 400, req);
        }
        if ((cand.hard_fail_codes || []).length > 0) {
          return jsonRes({
            error: "Cannot promote a candidate with hard failures",
            code: "HAS_HARD_FAILS",
            hard_fail_codes: cand.hard_fail_codes,
          }, 400, req);
        }
        if (!cand.asset_id && !cand.ai_actor_assets?.public_url) {
          return jsonRes({ error: "Candidate has no generated asset", code: "NO_ASSET" }, 400, req);
        }

        // 4. Duplicate prevention — check if already promoted
        if (cand.selection_status === "promoted") {
          return jsonRes({
            error: "Candidate already promoted",
            code: "ALREADY_PROMOTED",
            idempotent: true,
          }, 400, req);
        }

        // 5. Create the reusable AI Actor
        const sourceActor = runData.ai_actors;
        const actorName = sourceActor.name || "Promoted Actor";
        const actorDesc = sourceActor.description || "";

        // Allocate roster number
        let rosterNumber: number | null = null;
        try {
          const { data: rosterData } = await db.rpc("next_actor_roster_number");
          rosterNumber = rosterData;
        } catch (e) {
          console.error("Roster number allocation failed:", e);
        }

        const promotedActorName = rosterNumber
          ? `${String(rosterNumber).padStart(4, "0")} — ${actorName}`
          : actorName;

        const { data: newActor, error: actorErr } = await db.from("ai_actors").insert({
          user_id: userId,
          name: promotedActorName,
          description: actorDesc,
          negative_prompt: sourceActor.negative_prompt || "",
          tags: [...(sourceActor.tags || []), "convergence-promoted"],
          status: "active",
        }).select("id, name, status, created_at").single();
        if (actorErr) throw actorErr;

        // 6. Create version 1
        const { data: newVersion, error: verErr } = await db.from("ai_actor_versions").insert({
          actor_id: newActor.id,
          version_number: 1,
          recipe_json: {
            invariants: [],
            allowed_variations: [],
            camera_rules: [],
            lighting_rules: [],
            convergence_provenance: {
              source_run_id: actualRunId,
              source_candidate_id: candidateId,
              source_round_id: cand.round_id,
              source_mode: runData.mode,
              source_score: cand.score,
              source_score_band: cand.score_band,
              source_confidence: cand.confidence,
              promoted_at: new Date().toISOString(),
            },
          },
          created_by: userId,
          is_approved: true,
        }).select("id, version_number").single();
        if (verErr) throw verErr;

        // 7. Copy the candidate's asset as the actor's primary reference
        const sourceAsset = cand.ai_actor_assets;
        if (sourceAsset?.public_url) {
          await db.from("ai_actor_assets").insert({
            actor_version_id: newVersion.id,
            asset_type: "reference_headshot",
            storage_path: sourceAsset.storage_path || "",
            public_url: sourceAsset.public_url,
            meta_json: {
              promoted_from_candidate: candidateId,
              promoted_from_run: actualRunId,
              original_asset_type: sourceAsset.asset_type,
              source_score: cand.score,
              source_score_band: cand.score_band,
              promoted_at: new Date().toISOString(),
            },
          });
        }

        // 8. Set actor as having approved version
        await db.from("ai_actors").update({
          approved_version_id: newVersion.id,
        }).eq("id", newActor.id);

        // 9. Mark candidate as promoted
        await db.from("convergence_candidates").update({
          selection_status: "promoted",
        }).eq("id", candidateId);

        // 10. Log promotion event
        await db.from("convergence_events").insert({
          run_id: actualRunId,
          round_id: cand.round_id,
          event_type: "candidate_promoted",
          payload: {
            candidate_id: candidateId,
            promoted_actor_id: newActor.id,
            promoted_version_id: newVersion.id,
            score: cand.score,
            score_band: cand.score_band,
            mode: runData.mode,
          },
        });

        return jsonRes({
          promoted: true,
          actor: newActor,
          version: newVersion,
          source: {
            candidate_id: candidateId,
            run_id: actualRunId,
            score: cand.score,
            score_band: cand.score_band,
            mode: runData.mode,
          },
        }, 200, req);
      }

      default:
        return jsonRes({ error: `Unknown action: ${action}` }, 400, req);
    }
  } catch (err: any) {
    console.error("ai-cast error:", err);
    return jsonRes({ error: err.message || "Internal error" }, 500, req);
  }
});
