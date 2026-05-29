-- Add meta_json column to rewrite_runs for storing rewrite metadata
ALTER TABLE public.rewrite_runs
  ADD COLUMN IF NOT EXISTS meta_json jsonb NULL;
