-- Migration: Add stage_readiness fields to convergence_atomic_write RPC
-- Persists SR metadata to project_document_versions.meta_json so cascade can query by version_id

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
  p_greenlight_detail jsonb DEFAULT NULL,
  -- SR fields (added 2026-04-23)
  p_stage_readiness_score numeric DEFAULT NULL,
  p_stage_readiness_status text DEFAULT NULL,
  p_promotion_allowed boolean DEFAULT NULL,
  p_override_allowed boolean DEFAULT NULL,
  p_data_integrity_ok boolean DEFAULT NULL
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
    p_output_json, NULL
  )
  RETURNING id INTO dev_run_id;

  -- 2. Update meta_json cache on the version — preserves existing fields + adds SR fields
  UPDATE public.project_document_versions
  SET
    meta_json = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_build_object(
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
                    ),
                    '{stage_readiness_score}', to_jsonb(p_stage_readiness_score)
                  ),
                  '{stage_readiness_status}', to_jsonb(p_stage_readiness_status)
                ),
                '{promotion_allowed}', to_jsonb(p_promotion_allowed)
              ),
              '{override_allowed}', to_jsonb(p_override_allowed)
            ),
            '{data_integrity_ok}', to_jsonb(p_data_integrity_ok)
          ),
          '{convergence_detail}', to_jsonb(p_full_result)
        ),
        '{score_breakdown}', to_jsonb(p_full_result->'stage_readiness'->'score_breakdown')
      ),
      '{sr_source}', to_jsonb('convergence_atomic_write')
    )
  WHERE id = p_version_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.convergence_atomic_write(
  uuid, uuid, uuid, uuid,
  text, text, text, text, text, jsonb,
  numeric, numeric, numeric, numeric,
  text, text, text, text,
  text[], jsonb, text, text, jsonb,
  jsonb, jsonb,
  -- SR fields
  numeric, text, boolean, boolean, boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convergence_atomic_write(
  uuid, uuid, uuid, uuid,
  text, text, text, text, text, jsonb,
  numeric, numeric, numeric, numeric,
  text, text, text, text,
  text[], jsonb, text, text, jsonb,
  jsonb, jsonb,
  -- SR fields
  numeric, text, boolean, boolean, boolean
) TO service_role;
