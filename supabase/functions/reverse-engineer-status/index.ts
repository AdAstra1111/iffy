import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { job_id, project_id } = await req.json().catch(() => ({}));
    if (!job_id && !project_id)
      return new Response(JSON.stringify({ error: "job_id or project_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (job_id) {
      // Single job status
      const { data, error } = await sb
        .from("narrative_units")
        .select("id, project_id, payload_json")
        .eq("id", job_id)
        .maybeSingle();
      if (error || !data)
        return new Response(JSON.stringify({ error: "Job not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const p = data.payload_json || {};
      return new Response(JSON.stringify({
        job_id: data.id,
        project_id: data.project_id,
        status: p.status,
        current_stage: p.current_stage,
        stages: p.stages,
        result: p.result,
        error: p.error,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // All jobs for a project
    const { data, error } = await sb
      .from("narrative_units")
      .select("id, project_id, payload_json")
      .eq("project_id", project_id)
      .eq("unit_type", "async_job")
      .order("created_at", { ascending: false });
    // Filter in JS: only reverse_engineer jobs
    const allJobs = (data || []).filter((d: any) => d.payload_json?.job_type === "reverse_engineer");
    const jobs = allJobs.map((d: any) => {
      const p = d.payload_json || {};
      return { job_id: d.id, project_id: d.project_id, status: p.status, current_stage: p.current_stage, stages: p.stages, result: p.result, error: p.error, created_at: p.created_at, updated_at: p.updated_at };
    });
    return new Response(JSON.stringify({ jobs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
