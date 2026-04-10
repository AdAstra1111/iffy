-- Migration: Atomic convergence write — stored procedure
-- Writes to development_runs AND updates meta_json in project_document_versions
-- in a single transaction so they stay in sync.

CREATE OR REPLACE FUNCTION public.convergence_atomic_write(
  p_project_id uuid,
  p_document_id uuid,
  p_version_id uuid,
  p_user_id uuid,
  p_run_type text DEFAULT 'CONVERGENCE',
  p_production_type text DEFAULT 'narrative_feature',
  p_strategic_priority text DEFAULT 'BALANCED',
  p_development_stage text DEFAULT 'IDEA',
  p_analysis_mode text DEFAULT 'DUAL',
  p_output_json jsonb DEFAULT '{}',
  p_creative_integrity_score numeric DEFAULT 0,
  p_greenlight_probability numeric DEFAULT 0,
  p_gap numeric DEFAULT 0,
  p_allowed_gap numeric DEFAULT 25,
  p_convergence_status text DEFAULT NULL,
  p_trajectory text DEFAULT NULL,
  p_primary_creative_risk text DEFAULT '',
  p_primary_commercial_risk text DEFAULT '',
  p_leverage_moves text[] DEFAULT '{}',
  p_format_advisory jsonb DEFAULT NULL,
  p_executive_guidance text DEFAULT '',
  p_executive_snapshot text DEFAULT '',
  p_full_result jsonb DEFAULT '{}',
  p_creative_detail jsonb DEFAULT NULL,
  p_greenlight_detail jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  dev_run_id uuid;
BEGIN
  -- 1. Insert into development_runs (immutable log — always append)
  INSERT INTO public.development_runs (
    project_id, document_id, version_id, user_id,
    run_type, production_type, strategic_priority, development_stage, analysis_mode,
    output_json, source
  ) VALUES (
    p_project_id, p_document_id, p_version_id, p_user_id,
    p_run_type, p_production_type, p_strategic_priority, p_development_stage, p_analysis_mode,
    p_output_json, NULL  -- NULL source = live convergence run
  )
  RETURNING id INTO dev_run_id;

  -- 2. Update meta_json cache on the version (source of truth for UI reads)
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
      -- Preserve existing meta_json fields
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
