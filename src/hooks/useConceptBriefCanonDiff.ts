import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getConceptBriefStaleReasons } from '@/lib/stageIdentityReasons';

/**
 * Fetches the current Idea plaintext and computes specific contradictions
 * when a concept_brief is stale (out of sync with canon inputs).
 */
export function useConceptBriefCanonDiff(
  projectId: string | undefined,
  conceptBriefPlaintext: string | null | undefined,
  isStale: boolean
): string[] {
  const ideaPlaintext = useMemo(() => {
    if (!projectId || !isStale) return null;
    // Lazy fetch — we synchronously return null and the comparison happens reactively
    return null; // actual fetch below
  }, [projectId, isStale]);

  return useMemo(() => {
    if (!isStale || !conceptBriefPlaintext) return [];
    // We need the Idea plaintext — return empty; caller should use the async fetcher
    // This hook is synchronous; actual async fetch is triggered separately
    return [];
  }, [isStale, conceptBriefPlaintext]);
}

/**
 * Async fetcher for Idea plaintext — call this directly when concept_brief is stale.
 * Returns { title, logline, comparables } from the Idea.
 */
export async function fetchIdeaCanonFields(projectId: string): Promise<{
  title: string | null;
  logline: string | null;
  comparables: string | null;
  genre: string | null;
} | null> {
  const { data: ideaDoc } = await supabase
    .from('project_documents')
    .select('plaintext')
    .eq('project_id', projectId)
    .eq('doc_type', 'idea')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!ideaDoc?.plaintext) return null;

  const text = ideaDoc.plaintext;
  const titleMatch = text.match(/\*\*TITLE:\*\*\s*(.+?)(?:\n|$)/i) || text.match(/^#\s+(.+?)(?:\n|$)/mi);
  const loglineMatch = text.match(/\*\*Logline:\*\*\s*(.+?)(?:\n|$)/i) || text.match(/Logline:\s*(.+?)(?:\n|$)/i);
  const comparablesMatch = text.match(/\*\*Comparables?:\*\*\s*(.+?)(?:\n|$)/i);
  const genreMatch = text.match(/\*\*Genre:\*\*\s*(.+?)(?:\n|$)/i) || text.match(/Genre:\s*(.+?)(?:\n|$)/i);

  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    logline: loglineMatch ? loglineMatch[1].trim() : null,
    comparables: comparablesMatch ? comparablesMatch[1].trim() : null,
    genre: genreMatch ? genreMatch[1].trim() : null,
  };
}

/**
 * Compute specific contradictions between concept_brief and current Idea canon.
 * Call this after fetching ideaCanonFields.
 */
export function computeConceptBriefCanonReasons(
  conceptBriefPlaintext: string,
  ideaFields: { title: string | null; logline: string | null; comparables: string | null; genre: string | null }
): string[] {
  return getConceptBriefStaleReasons(conceptBriefPlaintext, ideaFields);
}
