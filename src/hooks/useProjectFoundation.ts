/**
 * useProjectFoundation.ts
 *
 * Stage-gate hook for the dev-engine fire decision.
 * Returns true only when ALL foundation documents are complete,
 * all notes are resolved, and the dev seed is ready.
 *
 * This is the canFireDevEngine() predicate — use it to gate
 * the "Generate Dev Engine" button or auto-fire logic.
 */

import { useMemo } from "react";
import { useProjectNotes } from "@/hooks/useProjectNotes";
import { useFoundationDocStatus } from "@/hooks/useFoundationDocStatus";
import { useDevSeedReady } from "@/hooks/useDevSeedReady";

export interface FoundationState {
  allDocsComplete: boolean;
  noOrphanedNotes: boolean;
  devSeedReady: boolean;
  noBlockers: boolean;
  blockers: string[];  // list of unresolved blocker descriptions
  orphanedNotes: string[];  // notes with no mapped section
  incompleteDocs: string[];  // doc types that are not 'complete'
  canFireDevEngine: boolean;
}

export function useProjectFoundation(projectId: string | null): FoundationState {
  const { data: notes = [] } = useProjectNotes(projectId);
  const { data: foundationStatus = {} } = useFoundationDocStatus(projectId);
  const { data: devSeedReady = false } = useDevSeedReady(projectId);

  return useMemo(() => {
    if (!projectId) {
      return {
        allDocsComplete: false,
        noOrphanedNotes: false,
        devSeedReady: false,
        noBlockers: false,
        blockers: [],
        orphanedNotes: [],
        incompleteDocs: [],
        canFireDevEngine: false,
      };
    }

    // Foundation docs: concept_brief, character_bible, story_outline, beat_sheet, ...
    const foundationDocTypes = [
      "concept_brief",
      "character_bible",
      "story_outline",
      "beat_sheet",
      "pitch_deck",
    ];

    const incompleteDocs = foundationDocTypes.filter(
      dt => !foundationStatus[dt] || foundationStatus[dt] !== "complete",
    );

    const allDocsComplete = incompleteDocs.length === 0;

    // Orphaned notes: notes with no section mapping (unmapped categories)
    const orphanedNotes = notes
      .filter(n => n.doc_type === "concept_brief" && !n.section)
      .map(n => n.category || n.note_key || "unknown");

    const noOrphanedNotes = orphanedNotes.length === 0;

    // Blockers: unresolved notes with severity 'blocker'
    const blockers = notes
      .filter(n => n.severity === "blocker" && n.status !== "resolved" && n.status !== "waived")
      .map(n => n.description || n.category || "blocker");

    const noBlockers = blockers.length === 0;

    const canFireDevEngine = allDocsComplete && noOrphanedNotes && devSeedReady && noBlockers;

    return {
      allDocsComplete,
      noOrphanedNotes,
      devSeedReady,
      noBlockers,
      blockers,
      orphanedNotes,
      incompleteDocs,
      canFireDevEngine,
    };
  }, [projectId, notes, foundationStatus, devSeedReady]);
}
