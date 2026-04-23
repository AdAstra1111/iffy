/**
 * canon-cascade-status — Canon Cascade Status Endpoint
 *
 * Returns the active cascade job + ordered targets for a project.
 *
 * GET /functions/v1/canon-cascade-status?projectId={id}
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    if (!projectId) {
      return Response.json({ ok: false, error: "projectId is required" }, { status: 400 });
    }

    // Get most recent non-cancelled job for this project
    const { data: job, error: jobErr } = await supabase
      .from("canon_cascade_jobs")
      .select("*")
      .eq("project_id", projectId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (jobErr) {
      return Response.json({ ok: false, error: jobErr.message }, { status: 500 });
    }

    if (!job) {
      return Response.json({
        ok: true,
        job: null,
        targets: [],
        progress: {
          total: 0, pending: 0, regenerating: 0,
          approved: 0, blocked: 0, failed: 0, flagged: 0, paused: 0,
        },
      });
    }

    // Get all targets ordered by cascade_order
    const { data: targets, error: tErr } = await supabase
      .from("canon_cascade_targets")
      .select("*")
      .eq("cascade_job_id", job.id)
      .order("direction", { ascending: false }) // downstream first
      .order("cascade_order", { ascending: true });

    if (tErr) {
      return Response.json({ ok: false, error: tErr.message }, { status: 500 });
    }

    const targetList = targets ?? [];

    // Compute progress summary
    const counts: Record<string, number> = {
      total: targetList.length,
      pending: 0, regenerating: 0, approved: 0,
      blocked: 0, failed: 0, flagged: 0, paused: 0,
    };
    for (const t of targetList) {
      if (t.status in counts) counts[t.status]++;
    }

    // Shape targets for UI
    const shapedTargets = targetList.map((t: any) => ({
      id: t.id,
      target_doc_id: t.target_doc_id,
      target_doc_type: t.target_doc_type,
      direction: t.direction,
      cascade_order: t.cascade_order,
      status: t.status,
      sr_status: t.sr_status,
      sr_score: t.sr_score,
      promotion_allowed: t.promotion_allowed,
      override_allowed: t.override_allowed,
      ci_score: t.ci_score,
      gp_score: t.gp_score,
      composite_score: t.composite_score,
      error_message: t.error_message,
      new_version_id: t.new_version_id,
      retry_count: t.retry_count,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));

    return Response.json({
      ok: true,
      job: {
        id: job.id,
        project_id: job.project_id,
        trigger_doc_id: job.trigger_doc_id,
        trigger_doc_type: job.trigger_doc_type,
        trigger_version_id: job.trigger_version_id,
        direction: job.direction,
        status: job.status,
        safe_target_limit: job.safe_target_limit,
        created_at: job.created_at,
        updated_at: job.updated_at,
      },
      targets: shapedTargets,
      progress: counts,
    });

  } catch (err: any) {
    console.error("[canon-cascade-status] error:", err);
    return Response.json({ ok: false, error: err?.message ?? "unknown error" }, { status: 500 });
  }
});
