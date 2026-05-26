-- Add UPDATE policy for readiness_score_history
-- Pre-existing migration 20260210233408 created SELECT and INSERT policies
-- but did NOT include an UPDATE policy, causing upsert re-saves to fail (403).
-- This migration closes the gap.

CREATE POLICY "Project members can update own score history"
  ON public.readiness_score_history FOR UPDATE
  TO authenticated
  USING (public.has_project_access(auth.uid(), project_id))
  WITH CHECK (auth.uid() = user_id AND public.has_project_access(auth.uid(), project_id));