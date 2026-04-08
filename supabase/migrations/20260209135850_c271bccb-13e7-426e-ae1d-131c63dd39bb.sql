
-- Trend signals table
CREATE TABLE IF NOT EXISTS public.trend_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Narrative', 'IP', 'Market Behaviour')),
  cycle_phase TEXT NOT NULL CHECK (cycle_phase IN ('Early', 'Building', 'Peaking', 'Declining')),
  explanation TEXT NOT NULL,
  sources_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  first_detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trend_signals ENABLE ROW LEVEL SECURITY;

-- Public read access (intelligence layer is shared)
DROP POLICY IF EXISTS "Anyone authenticated can view signals" ON public.trend_signals;
CREATE POLICY "Anyone authenticated can view signals"
  ON public.trend_signals FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only service role can insert/update (automated ingestion)
DROP POLICY IF EXISTS "Service role can manage signals" ON public.trend_signals;
CREATE POLICY "Service role can manage signals"
  ON public.trend_signals FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Weekly briefs table
CREATE TABLE IF NOT EXISTS public.trend_weekly_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trend_weekly_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view briefs" ON public.trend_weekly_briefs;
CREATE POLICY "Anyone authenticated can view briefs"
  ON public.trend_weekly_briefs FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Service role can manage briefs" ON public.trend_weekly_briefs;
CREATE POLICY "Service role can manage briefs"
  ON public.trend_weekly_briefs FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_trend_signals_status ON public.trend_signals (status);
CREATE INDEX IF NOT EXISTS idx_trend_signals_category ON public.trend_signals (category);
CREATE INDEX IF NOT EXISTS idx_trend_weekly_briefs_week ON public.trend_weekly_briefs (week_start DESC);
