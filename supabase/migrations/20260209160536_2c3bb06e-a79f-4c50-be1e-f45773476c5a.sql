-- Add finance-aware fields to cast_trends
ALTER TABLE public.cast_trends
  ADD COLUMN IF NOT EXISTS sales_leverage text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS timing_window text NOT NULL DEFAULT '';

-- Add index for common filter patterns
CREATE INDEX IF NOT EXISTS idx_cast_trends_status_region ON public.cast_trends (status, region);
