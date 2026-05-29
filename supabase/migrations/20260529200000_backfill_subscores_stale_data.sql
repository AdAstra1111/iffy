-- Backfill: Fix stale subscore data from Block 2's `|| 5` defaults
-- Block 2 wrote scores with `(Number(ciSubScores[k]) || 5) * 10`, producing score=50
-- when actual values were missing, and never set is_valid=false or validation_error.
-- The correct Block 1 is now the only writer.
--
-- This is a one-time migration. Run against live Supabase.

-- 1. Mark rows that got score=50 from a default (not actual 5.0 sub-score) as invalid
UPDATE document_version_subscores
SET
  is_valid = false,
  validation_error = 'retroactive: score was defaulted to 50 by removed Block 2 writer (score=50 from || 5 fallback, no actual sub-score data)'
WHERE
  score = 50
  AND is_valid IS NULL
  AND (
    validation_error IS NULL
    OR validation_error = ''
  );

-- 2. Also flag any rows where is_valid = false but score was defaulted to 50
-- (these were caught by Block 1 but may have been written again by Block 2)
UPDATE document_version_subscores
SET
  validation_error = COALESCE(
    NULLIF(validation_error, ''),
    'retroactive: also hit by removed Block 2 default writer'
  ) || '; [backfill] overridden by Block 1 validation'
WHERE
  is_valid = false
  AND score = 50;

-- 3. Log count for audit
DO $$
DECLARE
  invalidated_count INTEGER;
  flagged_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalidated_count FROM document_version_subscores
    WHERE score = 50 AND is_valid = false AND validation_error LIKE 'retroactive:%';

  SELECT COUNT(*) INTO flagged_count FROM document_version_subscores
    WHERE is_valid = false AND validation_error LIKE '%; [backfill]%';

  RAISE NOTICE '[backfill-subscores] Invalidated % rows (score=50 from Block 2 defaults), flagged % rows (Block 1 + Block 2 overlap)',
    invalidated_count, flagged_count;
END $$;