// auto-run-start-brain — scans for autorun-enabled projects and starts auto-run jobs
// Called by Hermes cron. Auth: verify_jwt=false in config.toml, accepts any Bearer token.
// The function is not user-facing so this is acceptable.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);
  const results: any[] = [];

  try {
    // Get all projects with autorun_enabled = true
    const { data: projects, error: pErr } = await supabase
      .from("projects")
      .select("id, title, format")
      .eq("autorun_enabled", true);

    if (pErr) throw new Error(`Projects query failed: ${pErr.message}`);

    // Get projects already with active (running/paused) auto-run jobs
    const { data: activeJobs, error: jErr } = await supabase
      .from("auto_run_jobs")
      .select("project_id")
      .in("status", ["running", "paused"]);

    if (jErr) throw new Error(`Jobs query failed: ${jErr.message}`);

    const activeIds = new Set((activeJobs || []).map((j) => j.project_id));
    const needingStart = (projects || []).filter((p) => !activeIds.has(p.id));

    console.log(
      `[auto-run-start-brain] scan: ${projects?.length || 0} autorun_enabled, ${needingStart.length} needing start`
    );

    // Start auto-run for each project by calling auto-run function
    for (const project of needingStart) {
      try {
        const startRes = await fetch(
          `${supabaseUrl}/functions/v1/auto-run`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              action: "start",
              projectId: project.id,
              userId: "auto-run-start-brain",
              allow_defaults: true,
            }),
          }
        );
        const body = await startRes.json();
        results.push({
          project: project.title,
          id: project.id,
          http_status: startRes.status,
          job_id: body?.job?.id || null,
          error: body?.error || null,
        });
      } catch (e: any) {
        results.push({
          project: project.title,
          id: project.id,
          http_status: 0,
          error: e?.message || String(e),
        });
      }
    }

    return new Response(JSON.stringify({ started: results.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});