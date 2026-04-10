import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

// Read the migration SQL files
const MIGRATION_200 = `ALTER TABLE public.development_runs
  ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;

COMMENT ON COLUMN public.development_runs.source IS 'run_source: NULL=live_convergence_run, pre-reconciliation_baseline=backfill from meta_json';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_runs_one_baseline_per_doc
  ON public.development_runs(document_id)
  WHERE source = 'pre-reconciliation_baseline';
`;

const MIGRATION_201 = `CREATE OR REPLACE FUNCTION public.convergence_atomic_write(
  p_project_id uuid,
  p_document_id uuid,
  p_version_id uuid,
  p_user_id uuid,
  p_run_type text DEFAULT 'CONVERGENCE',
  p_production_type text DEFAULT 'narrative_feature',
  p_strategic_priority text DEFAULT 'BALANCED',
  p_development_stage text DEFAULT 'IDEA',
  p_analysis_mode text DEFAULT 'DUAL',
  p_output_json jsonb,
  p_creative_integrity_score numeric,
  p_greenlight_probability numeric,
  p_gap numeric,
  p_allowed_gap numeric,
  p_convergence_status text,
  p_trajectory text,
  p_primary_creative_risk text,
  p_primary_commercial_risk text,
  p_leverage_moves text[],
  p_format_advisory jsonb,
  p_executive_guidance text,
  p_executive_snapshot text,
  p_full_result jsonb,
  p_creative_detail jsonb,
  p_greenlight_detail jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  dev_run_id uuid;
BEGIN
  INSERT INTO public.development_runs (
    project_id, document_id, version_id, user_id,
    run_type, production_type, strategic_priority, development_stage, analysis_mode,
    output_json, source
  ) VALUES (
    p_project_id, p_document_id, p_version_id, p_user_id,
    p_run_type, p_production_type, p_strategic_priority, p_development_stage, p_analysis_mode,
    p_output_json, NULL
  )
  RETURNING id INTO dev_run_id;

  UPDATE public.project_document_versions
  SET
    meta_json = jsonb_build_object(
      'creative_integrity', p_creative_integrity_score,
      'greenlight_probability', p_greenlight_probability,
      'gap', p_gap,
      'allowed_gap', p_allowed_gap,
      'convergence_status', p_convergence_status,
      'trajectory', p_trajectory,
      'convergence_run_id', dev_run_id,
      'convergence_source', 'development_runs',
      'last_convergence_at', now(),
      'creative_integrity_detail', p_creative_detail,
      'greenlight_probability_detail', p_greenlight_detail,
      'primary_creative_risk', p_primary_creative_risk,
      'primary_commercial_risk', p_primary_commercial_risk,
      'leverage_moves', p_leverage_moves,
      'format_advisory', p_format_advisory,
      'executive_guidance', p_executive_guidance,
      'executive_snapshot', p_executive_snapshot
    )
  WHERE id = p_version_id;
END;
$$;
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const results: string[] = [];

  // Apply migration 200: add source column
  try {
    // Use update to set the column if it doesn't exist (no-op if exists)
    // First check if column exists
    const { error: selErr } = await sb
      .from("development_runs")
      .select("source")
      .limit(1);
    
    if (selErr && selErr.message.includes("source") && selErr.message.includes("does not exist")) {
      results.push("source column missing — applying via workaround...");
      // Column doesn't exist — we need to use rpc to alter table
      // Use pg_execute_with_trust to run ALTER TABLE
      // Unfortunately we can't run arbitrary SQL without pg extension
      // This edge function serves as documentation — apply manually via dashboard
      results.push("ACTION REQUIRED: Run this SQL in Supabase dashboard SQL editor:\n" + MIGRATION_200);
    } else {
      results.push("source column: already exists or accessible");
    }
  } catch (e: any) {
    results.push(`source column check: ${e.message}`);
  }

  // Check convergence_atomic_write function
  try {
    const { error: rpcErr } = await sb.rpc("convergence_atomic_write" as any, {
      p_project_id: "00000000-0000-0000-0000-000000000000",
      p_document_id: null,
      p_version_id: "00000000-0000-0000-0000-000000000000",
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_run_type: "CONVERGENCE",
      p_production_type: "narrative_feature",
      p_strategic_priority: "BALANCED",
      p_development_stage: "IDEA",
      p_analysis_mode: "DUAL",
      p_output_json: {},
      p_creative_integrity_score: 0,
      p_greenlight_probability: 0,
      p_gap: 0,
      p_allowed_gap: 25,
      p_convergence_status: "test",
      p_trajectory: null,
      p_primary_creative_risk: "",
      p_primary_commercial_risk: "",
      p_leverage_moves: [],
      p_format_advisory: null,
      p_executive_guidance: "",
      p_executive_snapshot: "",
      p_full_result: {},
      p_creative_detail: null,
      p_greenlight_detail: null,
    });
    if (rpcErr) {
      if (rpcErr.message.includes("does not exist")) {
        results.push("convergence_atomic_write: function missing — needs to be created");
        results.push("ACTION REQUIRED: Run this SQL in Supabase dashboard SQL editor:\n" + MIGRATION_201.slice(0, 200) + "...");
      } else {
        results.push(`convergence_atomic_write: error=${rpcErr.message}`);
      }
    } else {
      results.push("convergence_atomic_write: function exists and responds");
    }
  } catch (e: any) {
    results.push(`convergence_atomic_write RPC call: ${e.message}`);
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
