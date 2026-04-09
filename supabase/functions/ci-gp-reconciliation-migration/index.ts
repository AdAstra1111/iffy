/**
 * CI/GP Reconciliation Migration — Option A
 * 
 * One-time migration to reconcile meta_json.ci/gp with development_runs.ci_score/gp_score.
 * Policy: development_runs is authoritative. meta_json is stamped from dev-engine-v2 going forward.
 * 
 * For each project_document_version:
 *   - If a latest ANALYZE development_runs exists for this version:
 *       Stamp development_runs.ci_score/gp_score → meta_json.ci/gp
 *       (using "stamp if higher" policy: only update if dev_runs > meta_json)
 *       Mark with _ci_gp_reconciled_at, _ci_gp_reconciled_by: "migration"
 *   - If no development_runs entry but meta_json has ci/gp:
 *       Keep meta_json values. Mark as score_source: "legacy_no_dev_runs"
 *       (these versions were scored before dev-engine-v2 was the scoring system)
 *   - If neither source has scores: leave meta_json.ci/gp as null/undefined
 * 
 * Run once, then delete this function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  console.log("[ci-gp-reconciliation] Starting migration...");

  // Fetch all project_document_versions — filter ci/gp presence in JS (JSONB filter syntax varies by PG version)
  const { data: allVersions, error: fetchErr } = await supabase
    .from("project_document_versions")
    .select("id, document_id, meta_json");

  // Filter to only versions with meta_json containing ci or gp
  const versions = (allVersions || []).filter((v: any) => {
    const meta = v.meta_json;
    return meta && (typeof meta.ci === "number" || typeof meta.gp === "number");
  });

  if (fetchErr) {
    console.error("[ci-gp-reconciliation] Fetch error:", fetchErr);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  console.log(`[ci-gp-reconciliation] Found ${versions?.length ?? 0} versions with meta_json.ci/gp`);

  const results = {
    total: versions?.length ?? 0,
    stamped_from_dev_runs: 0,
    kept_legacy: 0,
    no_change: 0,
    errors: 0,
  };

  const now = new Date().toISOString();

  for (const version of (versions || [])) {
    try {
      const versionId = version.id;
      const existingMeta = (version.meta_json && typeof version.meta_json === "object" && !Array.isArray(version.meta_json))
        ? version.meta_json : {};

      // Check for latest ANALYZE development_runs
      const { data: latestRun } = await supabase
        .from("development_runs")
        .select("output_json")
        .eq("version_id", versionId)
        .eq("run_type", "ANALYZE")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let runCi: number | null = null;
      let runGp: number | null = null;

      if (latestRun?.output_json) {
        const out = latestRun.output_json;
        runCi = out?.ci_score ?? out?.scores?.ci_score ?? out?.scores?.ci ?? out?.ci ?? null;
        runGp = out?.gp_score ?? out?.scores?.gp_score ?? out?.scores?.gp ?? out?.gp ?? null;
      }

      const existingCi = typeof existingMeta.ci === "number" ? existingMeta.ci : null;
      const existingGp = typeof existingMeta.gp === "number" ? existingMeta.gp : null;

      if (runCi !== null || runGp !== null) {
        // development_runs exists — reconcile using "stamp if higher" policy
        let updatedMeta = { ...existingMeta };

        if (runCi !== null && (existingCi === null || runCi > existingCi)) {
          updatedMeta.ci = runCi;
        }
        if (runGp !== null && (existingGp === null || runGp > existingGp)) {
          updatedMeta.gp = runGp;
        }

        updatedMeta._ci_gp_reconciled_at = now;
        updatedMeta._ci_gp_reconciled_by = "migration";
        updatedMeta._ci_gp_score_source = "development_runs";

        await supabase
          .from("project_document_versions")
          .update({ meta_json: updatedMeta })
          .eq("id", versionId);

        results.stamped_from_dev_runs++;
        console.log(`[ci-gp-reconciliation] STAMPED: version=${versionId} ci=${updatedMeta.ci} gp=${updatedMeta.gp} (run: ${runCi}/${runGp}, meta: ${existingCi}/${existingGp})`);
      } else {
        // No development_runs — keep legacy meta_json values
        // Mark as legacy so we know these came from pre-dev-engine scoring
        let updatedMeta = { ...existingMeta };
        if (existingCi !== null || existingGp !== null) {
          updatedMeta._ci_gp_score_source = "legacy_no_dev_runs";
          updatedMeta._ci_gp_reconciled_at = now;
          updatedMeta._ci_gp_reconciled_by = "migration";

          await supabase
            .from("project_document_versions")
            .update({ meta_json: updatedMeta })
            .eq("id", versionId);

          results.kept_legacy++;
          console.log(`[ci-gp-reconciliation] LEGACY: version=${versionId} ci=${existingCi} gp=${existingGp}`);
        } else {
          results.no_change++;
        }
      }
    } catch (e: any) {
      console.error(`[ci-gp-reconciliation] ERROR on version ${version.id}:`, e.message);
      results.errors++;
    }
  }

  console.log("[ci-gp-reconciliation] Migration complete:", JSON.stringify(results));

  return new Response(JSON.stringify({
    success: true,
    message: "CI/GP reconciliation migration complete",
    results,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
