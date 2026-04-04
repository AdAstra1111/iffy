
ALTER TABLE public.pitch_decks ADD COLUMN IF NOT EXISTS share_expires_at timestamptz;

DROP POLICY IF EXISTS "Anyone can view shared pitch decks" ON public.pitch_decks;

CREATE POLICY "Anyone can view non-expired shared pitch decks"
  ON public.pitch_decks FOR SELECT
  USING (
    share_token IS NOT NULL
    AND (share_expires_at IS NULL OR share_expires_at > now())
  );
