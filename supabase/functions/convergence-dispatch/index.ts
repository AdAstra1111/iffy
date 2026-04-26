import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY")!;

  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { version_id, project_id, deliverable_type, development_behavior, format } = await req.json();

    if (!version_id || !project_id) {
      return new Response(JSON.stringify({ error: "version_id and project_id required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // ── 1. Create convergence_jobs record ────────────────────────────────
    const { data: job, error: jobErr } = await sb
      .from("convergence_jobs")
      .insert({
        project_id,
        version_id,
        status: "running",
      })
      .select()
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Failed to create convergence job", detail: jobErr }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const jobId = job.id;

    // ── 2. Dispatch full analyze action in background via waitUntil ───────
    const bgWork = (async () => {
      try {
        // Fetch version plaintext
        const { data: ver } = await sb
          .from("project_document_versions")
          .select("plaintext, meta_json")
          .eq("id", version_id)
          .single();

        if (!ver?.plaintext || ver.plaintext.trim().length < 100) {
          await sb.from("convergence_jobs").update({
            status: "error",
            error: "Document empty or too short to analyze",
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          }).eq("id", jobId);
          return;
        }

        // Fetch project metadata
        const { data: proj } = await sb
          .from("projects")
          .select("format, development_behavior, assigned_lane, budget_range, title")
          .eq("id", project_id)
          .single();

        const effFormat = (format || proj?.format || "film").toLowerCase().replace(/[_ -]+/g, "-");
        const effBehavior = development_behavior || proj?.development_behavior || "market";

        // ── Call dev-engine-v2 analyze action ─────────────────────────
        // We call the analyze action via internal fetch to the dev-engine-v2 endpoint
        const { data: session } = await sb.auth.getSession();
        const anonToken = Deno.env.get("SUPABASE_ANON_KEY")!;

        const analyzeResp = await fetch(`${supabaseUrl}/functions/v1/dev-engine-v2`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonToken}`,
          },
          body: JSON.stringify({
            action: "analyze",
            projectId: project_id,
            documentId: ver.id, // same as version_id here
            versionId: version_id,
            deliverableType: deliverable_type || "script",
            developmentBehavior: effBehavior,
            format: effFormat,
            strategicPriority: "normal",
            developmentStage: "revision",
          }),
        });

        if (!analyzeResp.ok) {
          const errText = await analyzeResp.text();
          await sb.from("convergence_jobs").update({
            status: "error",
            error: `Analyze failed (${analyzeResp.status}): ${errText.slice(0, 300)}`,
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          }).eq("id", jobId);
          return;
        }

        const result = await analyzeResp.json();
        const analysis = result?.analysis;
        const run = result?.run;

        // Extract CI and GP from the analysis result
        const ciScore = analysis?.ci_score ?? analysis?.scores?.ci ?? run?.output_json?.ci_score ?? null;
        const gpScore = analysis?.gp_score ?? analysis?.scores?.gp ?? run?.output_json?.gp_score ?? null;
        const readinessScore = analysis?.readiness_score ?? null;

        // ── 3. Update convergence_jobs with scores ───────────────────
        await sb.from("convergence_jobs").update({
          status: "done",
          ci_score: ciScore,
          gp_score: gpScore,
          readiness_score: readinessScore,
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);

        // Also stamp scores on the version record
        if (ciScore !== null || gpScore !== null) {
          const metaUpdate: Record<string, any> = { ...(ver.meta_json || {}) };
          if (ciScore !== null) metaUpdate.latest_ci = ciScore;
          if (gpScore !== null) metaUpdate.latest_gp = gpScore;
          metaUpdate.convergence_job_id = jobId;
          metaUpdate.converged_at = new Date().toISOString();
          await sb.from("project_document_versions")
            .update({ meta_json: metaUpdate })
            .eq("id", version_id);
        }

        console.log(`[convergence-dispatch] Job ${jobId} complete: CI=${ciScore} GP=${gpScore}`);

      } catch (e: any) {
        console.error(`[convergence-dispatch] Job ${jobId} error:`, e?.message);
        await sb.from("convergence_jobs").update({
          status: "error",
          error: e?.message?.slice(0, 500),
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
    })();

    // If EdgeRuntime is available, use waitUntil so bg work continues after response
    if (typeof (globalThis as any).EdgeRuntime !== "undefined") {
      (globalThis as any).EdgeRuntime.waitUntil(bgWork);
    } else {
      // Fallback: await directly (may still hit timeout if analyze is slow)
      await bgWork;
    }

    return new Response(JSON.stringify({
      ok: true,
      convergence_job_id: jobId,
      status: "running",
      message: "Convergence scoring dispatched. Poll GET /convergence-status?job_id=" + jobId,
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[convergence-dispatch] Fatal:", e?.message);
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
