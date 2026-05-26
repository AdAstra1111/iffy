/**
 * useVisualExecutionReview — Review visual execution outputs.
 *
 * Allows setting review_state on execution provenance rows.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ExecutionProvenanceRow } from '@/lib/visual/visualExecutionProvenanceTypes';

interface ReviewVisualExecutionOptions {
  executionId: string;
  reviewState: string;
  reviewNotes?: string;
  userId?: string;
}

interface UseVisualExecutionReviewResult {
  review: (opts: ReviewVisualExecutionOptions) => Promise<{ success: boolean; error?: string }>;
  reviewing: boolean;
}

export function useVisualExecutionReview(): UseVisualExecutionReviewResult {
  const [reviewing, setReviewing] = useState(false);

  const review = useCallback(async (opts: ReviewVisualExecutionOptions) => {
    setReviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'review-visual-execution',
        {
          body: {
            executionId: opts.executionId,
            reviewState: opts.reviewState,
            reviewNotes: opts.reviewNotes ?? null,
            userId: opts.userId ?? null,
          },
        },
      );

      if (error) {
        return { success: false, error: error.message };
      }

      if (data?.error) {
        return { success: false, error: data.error };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' };
    } finally {
      setReviewing(false);
    }
  }, []);

  return { review, reviewing };
}

/**
 * Check if a given review state makes the execution output usable
 * for downstream preflight.
 */
export function isReviewAccepted(reviewState: string | null | undefined): boolean {
  return reviewState === 'accepted';
}

/**
 * Check if a given review state blocks downstream preflight.
 */
export function isReviewRejected(reviewState: string | null | undefined): boolean {
  return reviewState === 'rejected';
}

/**
 * Check if a given review state is pending (not yet reviewed).
 */
export function isReviewPending(reviewState: string | null | undefined): boolean {
  return !reviewState || reviewState === 'pending_review';
}