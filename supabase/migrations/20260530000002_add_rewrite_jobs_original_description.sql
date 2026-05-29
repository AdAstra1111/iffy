-- Add original_description column to rewrite_jobs for story outline moment fallback
ALTER TABLE public.rewrite_jobs ADD COLUMN IF NOT EXISTS original_description text NULL;
