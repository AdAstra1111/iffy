import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { project_id, image_id } = body;
    if (!project_id) return new Response(JSON.stringify({ error: "project_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // 1. Governance status
    const { data: governance } = await sb
      .from("project_visual_stage_governance")
      .select("stage_id, computed_status, blocker_codes")
      .eq("project_id", project_id);

    // 2. Wardrobe canon stats
    const { count: profileCount } = await sb
      .from("character_wardrobe_profiles")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project_id)
      .eq("is_current", true);

    const { count: assignmentCount } = await sb
      .from("scene_wardrobe_assignments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project_id);

    // 3. PD canon stats
    const { count: locDesignCount } = await sb
      .from("pd_location_design")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project_id);

    const { count: templateCount } = await sb
      .from("pd_design_templates")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project_id);

    // 4. Identity canon stats
    const { count: dnaCount } = await sb
      .from("character_visual_dna")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project_id)
      .eq("is_current", true);

    // 5. Image provenance (for a specific image_id if provided)
    let provenance = null;
    if (image_id) {
      const { data: img } = await sb
        .from("project_images")
        .select("id, generation_config")
        .eq("id", image_id)
        .maybeSingle();
      if (img) {
        const gc = typeof img.generation_config === "string" ? JSON.parse(img.generation_config) : img.generation_config;
        provenance = {
          identity_mode: gc.identity_mode,
          identity_locked: gc.identity_locked,
          wardrobe_canon_used: gc.wardrobe_canon_used || gc.wardrobe_canon_consumed,
          wardrobe_state_key: gc.wardrobe_state_key,
          wardrobe_state_name: gc.wardrobe_state_name,
          pd_canon_consumed: gc.pd_canon_consumed || (gc.canon_sources_used?.length > 0),
          canon_sources_used: gc.canon_sources_used,
          pd_location_design_id: gc.pd_location_design_id,
          pd_template_name: gc.pd_template_name,
          fallback_used: gc.wardrobe_fallback_map ? (Object.keys(gc.wardrobe_fallback_map).length > 0 && !gc.wardrobe_canon_used) : false,
        };
      }
    }

    // Compute canon health
    const allStagesEligible = (governance || []).every(
      (g: any) => g.computed_status === "eligible" || g.computed_status === "locked"
    );

    return new Response(JSON.stringify({
      project_id,
      canon_status: {
        identity: { active: true, characters: dnaCount },
        wardrobe: { active: true, profiles: profileCount, assignments: assignmentCount },
        pd: { active: true, locations: locDesignCount, templates: templateCount },
      },
      governance: (governance || []).map((g: any) => ({
        stage: g.stage_id,
        status: g.computed_status,
        blocked: g.blocker_codes?.length > 0,
        blockers: g.blocker_codes || [],
      })),
      provenance,
      pipeline_ready: {
        identity_canon: !!dnaCount,
        wardrobe_canon: !!profileCount,
        production_design_canon: !!locDesignCount,
        governance_cleared: allStagesEligible,
        vpb_ready: allStagesEligible && !!locDesignCount && !!profileCount,
      },
      certified: true,
      certification: "YETI_VISUAL_PIPELINE_BASELINE_V1",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});