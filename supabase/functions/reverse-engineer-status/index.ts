import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://hdfderbphdobomkdjypc.supabase.co";
const SUPABASE_MANAGEMENT_PAT = Deno.env.get("SUPABASE_MANAGEMENT_PAT") ?? "";

const PROJECT_REF = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");

async function mgmtQuery(query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_MANAGEMENT_PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Management API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { job_id, project_id } = await req.json().catch(() => ({}));
    if (!job_id && !project_id) {
      return new Response(JSON.stringify({ error: "job_id or project_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (job_id) {
      const rows: any[] = await mgmtQuery(
        `SELECT id, project_id, payload_json FROM narrative_units WHERE id = '${job_id}' AND unit_type = 'async_job' LIMIT 1;`
      );
      if (!rows.length) {
        return new Response(JSON.stringify({ error: "Job not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const d = rows[0];
      const p = d.payload_json || {};
      return new Response(JSON.stringify({
        job_id: d.id,
        project_id: d.project_id,
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
    const rows: any[] = await mgmtQuery(
      `SELECT id, project_id, payload_json FROM narrative_units WHERE project_id = '${project_id}' AND unit_type = 'async_job' ORDER BY created_at DESC LIMIT 20;`
    );
    const allJobs = rows.filter((d: any) => d.payload_json?.job_type === "reverse_engineer");
    const jobs = allJobs.map((d: any) => {
      const p = d.payload_json || {};
      return {
        job_id: d.id,
        project_id: d.project_id,
        status: p.status,
        current_stage: p.current_stage,
        stages: p.stages,
        result: p.result,
        error: p.error,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });
    return new Response(JSON.stringify({ jobs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("[reverse-engineer-status] error:", err?.message);
    return new Response(JSON.stringify({ error: err?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
