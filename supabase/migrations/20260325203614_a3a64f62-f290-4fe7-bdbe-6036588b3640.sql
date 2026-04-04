-- Add quality gate columns to project_images
ALTER TABLE public.project_images
  ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS premium_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quality_rejection_codes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS quality_warnings TEXT[] DEFAULT '{}';

-- Add constraint for valid quality_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_images_quality_status_check'
  ) THEN
    ALTER TABLE public.project_images
      ADD CONSTRAINT project_images_quality_status_check
      CHECK (quality_status IN ('pending', 'pass', 'warn', 'reject'));
  END IF;
END $$;

-- Create index for premium pool queries
CREATE INDEX IF NOT EXISTS idx_project_images_premium_pool
  ON public.project_images (project_id, premium_eligible, quality_status)
  WHERE premium_eligible = true AND quality_status = 'pass';

-- Backfill: mark all existing images as warn + not premium by default
UPDATE public.project_images
SET quality_status = 'warn', premium_eligible = false
WHERE quality_status = 'pending';