import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import * as entropy from '@/lib/entropy';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface VersionTimelineEntry {
  id: string;
  versionNumber: number;
  label: string | null;
  createdAt: string;
  triggerType: 'ai_rewrite' | 'human_edit';
  specificity: ReturnType<typeof entropy.computeSpecificity>;
  charCount: number;
}

export interface ConvergencePoint {
  id: string;
  creativeScore: number;
  greenlightScore: number;
  gap: number;
  trajectory: string | null;
  createdAt: string;
  versionId: string;
}

export interface BlockerNoteGroup {
  versionId: string;
  versionNumber: number;
  total: number;
  resolved: number;
  unresolved: number;
  regressed: number;
}

export interface EntropyMetric {
  versionId: string;
  versionNumber: number;
  specificity: ReturnType<typeof entropy.computeSpecificity>;
  changes: {
    jaccard: number;
    entityOverlap: number;
    nounOverlap: number;
    textLengthDelta: number;
  } | null;
}

export interface RiskIndicator {
  type:
    | 'convergence_gap_widening'
    | 'high_unresolved_blockers'
    | 'falling_specificity'
    | 'diverging_trajectory'
    | 'no_convergence_data';
  severity: 'low' | 'medium' | 'high';
  label: string;
  detail: string;
}

export interface MissingDataReport {
  section: 'versions' | 'convergence' | 'notes' | 'readiness';
  present: boolean;
  count: number;
  note: string;
}

export interface RewriteTrajectoryData {
  versionTimeline: VersionTimelineEntry[];
  convergenceTrajectory: ConvergencePoint[];
  blockerEvolution: BlockerNoteGroup[];
  entropyMetrics: EntropyMetric[];
  riskIndicators: RiskIndicator[];
  missingDataReport: MissingDataReport[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Infer whether a version was produced by an AI rewrite or a human edit.
 */
export function inferTriggerType(
  version: {
    created_by: string | null;
    label: string | null;
    source_run_id: string | null;
  },
  currentUserId: string | null,
): 'ai_rewrite' | 'human_edit' {
  if (
    version.created_by !== currentUserId ||
    (version.label !== null && version.label.includes('auto')) ||
    version.source_run_id !== null
  ) {
    return 'ai_rewrite';
  }
  return 'human_edit';
}

/**
 * Chunk an array into fixed-size batches.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRewriteTrajectory(
  documentId: string | undefined,
  projectId: string | undefined,
): { data: RewriteTrajectoryData | undefined; isLoading: boolean; error: Error | null; refetch: () => void } {
  const { data, isLoading, error, refetch } = useQuery<RewriteTrajectoryData>({
    queryKey: ['rewriteTrajectory', documentId, projectId],
    enabled: !!documentId && !!projectId,
    queryFn: async (): Promise<RewriteTrajectoryData> => {
      const missingDataReport: MissingDataReport[] = [];

      // --- Get current user id -------------------------------------------
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      const currentUserId = user?.id ?? null;

      // --- 1. Fetch all versions for the document ------------------------
      const {
        data: versions,
        error: versionsError,
      } = await (supabase as any)
        .from('project_document_versions')
        .select('*')
        .eq('document_id', documentId)
        .order('version_number', { ascending: true });

      if (versionsError) throw versionsError;
      const versionList: any[] = versions ?? [];

      missingDataReport.push({
        section: 'versions',
        present: versionList.length > 0,
        count: versionList.length,
        note:
          versionList.length === 0
            ? 'No versions exist for this document.'
            : `${versionList.length} version(s) found.`,
      });

      // --- 2. Build version timeline & entropy metrics --------------------
      const versionTimeline: VersionTimelineEntry[] = versionList.map(
        (v: any) => {
          const specificity = entropy.computeSpecificity(v.plaintext ?? '');
          return {
            id: v.id,
            versionNumber: v.version_number,
            label: v.label ?? null,
            createdAt: v.created_at,
            triggerType: inferTriggerType(v, currentUserId),
            specificity,
            charCount: (v.plaintext ?? '').length,
          };
        },
      );

      // --- 3. Compute per-version-pair metrics for entropy ----------------
      const entropyMetrics: EntropyMetric[] = versionList.map(
        (v: any, idx: number) => {
          const specificity = entropy.computeSpecificity(v.plaintext ?? '');
          let changes: EntropyMetric['changes'] = null;

          if (idx > 0) {
            const prev = versionList[idx - 1];
            const pairMetrics = entropy.computeVersionPairMetrics(
                  prev.plaintext ?? '',
                  v.plaintext ?? '',
                );
            changes = {
              jaccard: pairMetrics.jaccard,
              entityOverlap: pairMetrics.entityOverlap,
              nounOverlap: pairMetrics.nounOverlap,
              textLengthDelta: pairMetrics.textLengthDelta,
            };
          }

          return {
            versionId: v.id,
            versionNumber: v.version_number,
            specificity,
            changes,
          };
        },
      );

      // --- 4. Fetch convergence history ----------------------------------
      const {
        data: convergenceRows,
        error: convergenceError,
      } = await (supabase as any)
        .from('dev_engine_convergence_history')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true });

      if (convergenceError) throw convergenceError;
      const convergenceList: any[] = convergenceRows ?? [];

      const convergenceTrajectory: ConvergencePoint[] = convergenceList.map(
        (c: any) => ({
          id: c.id,
          creativeScore: c.creative_score,
          greenlightScore: c.greenlight_score,
          gap: c.gap,
          trajectory: c.trajectory ?? null,
          createdAt: c.created_at,
          versionId: c.version_id,
        }),
      );

      missingDataReport.push({
        section: 'convergence',
        present: convergenceList.length > 0,
        count: convergenceList.length,
        note:
          convergenceList.length === 0
            ? 'No convergence history records found.'
            : `${convergenceList.length} convergence point(s) found.`,
      });

      // --- 5. Fetch development notes (batched by version_id) -------------
      const versionIds: string[] = versionList.map((v: any) => v.id);
      let allNotes: any[] = [];

      if (versionIds.length > 0) {
        const batches = chunk(versionIds, 50);
        for (const batch of batches) {
          const {
            data: notesBatch,
            error: notesError,
          } = await (supabase as any)
            .from('development_notes')
            .select('*')
            .in('document_version_id', batch);

          if (notesError) throw notesError;
          if (notesBatch) {
            allNotes = allNotes.concat(notesBatch);
          }
        }
      }

      missingDataReport.push({
        section: 'notes',
        present: allNotes.length > 0,
        count: allNotes.length,
        note:
          allNotes.length === 0
            ? 'No development notes found.'
            : `${allNotes.length} development note(s) found across ${versionIds.length} version(s).`,
      });

      // --- 6. Build blocker evolution grouped by version ------------------
      const notesByVersionId: Record<string, any[]> = {};
      for (const note of allNotes) {
        const vid = note.document_version_id;
        if (!notesByVersionId[vid]) {
          notesByVersionId[vid] = [];
        }
        notesByVersionId[vid].push(note);
      }

      const blockerEvolution: BlockerNoteGroup[] = versionList.map(
        (v: any) => {
          const notes = notesByVersionId[v.id] ?? [];
          const total = notes.length;
          const resolved = notes.filter((n: any) => n.resolved === true).length;
          const unresolved = notes.filter(
            (n: any) => n.resolved === false || n.resolved === null,
          ).length;
          const regressed = notes.filter(
            (n: any) => n.regressed === true,
          ).length;

          return {
            versionId: v.id,
            versionNumber: v.version_number,
            total,
            resolved,
            unresolved,
            regressed,
          };
        },
      );

      // --- 7. Fetch readiness score history -------------------------------
      const {
        data: readinessRows,
        error: readinessError,
      } = await (supabase as any)
        .from('readiness_score_history')
        .select('*')
        .eq('project_id', projectId)
        .order('snapshot_date', { ascending: true });

      if (readinessError) throw readinessError;
      const readinessList: any[] = readinessRows ?? [];

      missingDataReport.push({
        section: 'readiness',
        present: readinessList.length > 0,
        count: readinessList.length,
        note:
          readinessList.length === 0
            ? 'No readiness score history found.'
            : `${readinessList.length} readiness score record(s) found.`,
      });

      // --- 8. Compute risk indicators -------------------------------------
      const riskIndicators: RiskIndicator[] = [];

      // 8a. convergence_gap_widening
      const gaps = convergenceTrajectory
        .map((p) => p.gap)
        .filter((g): g is number => g !== null && g !== undefined);
      if (gaps.length >= 3) {
        const last3 = gaps.slice(-3);
        const increasing = last3[0] < last3[1] && last3[1] < last3[2];
        if (increasing) {
          const latestGap = last3[last3.length - 1];
          riskIndicators.push({
            type: 'convergence_gap_widening',
            severity: latestGap > 20 ? 'high' : latestGap > 10 ? 'medium' : 'low',
            label: 'Convergence gap widening',
            detail:
              latestGap > 20
                ? `Gap has increased to ${latestGap.toFixed(1)} across the last 3 convergence points, exceeding the high threshold of 20.`
                : latestGap > 10
                  ? `Gap has increased to ${latestGap.toFixed(1)} across the last 3 convergence points, crossing the medium threshold of 10.`
                  : `Gap trend is increasing but currently at ${latestGap.toFixed(1)}.`,
          });
        }
      }

      // 8b. high_unresolved_blockers
      const totalUnresolved = blockerEvolution.reduce(
        (sum, g) => sum + g.unresolved,
        0,
      );
      if (totalUnresolved > 5) {
        riskIndicators.push({
          type: 'high_unresolved_blockers',
          severity: 'high',
          label: 'High unresolved blockers',
          detail: `${totalUnresolved} unresolved blocker(s) across all versions — exceeds the high threshold of 5.`,
        });
      } else if (totalUnresolved > 2) {
        riskIndicators.push({
          type: 'high_unresolved_blockers',
          severity: 'medium',
          label: 'Moderate unresolved blockers',
          detail: `${totalUnresolved} unresolved blocker(s) across all versions — exceeds the medium threshold of 2.`,
        });
      }

      // 8c. falling_specificity
      if (versionTimeline.length >= 2) {
        const lastVersionMetrics =
          entropyMetrics[entropyMetrics.length - 1]?.specificity;
        const previousVersionMetrics =
          entropyMetrics[entropyMetrics.length - 2]?.specificity;

        if (
          lastVersionMetrics &&
          previousVersionMetrics &&
          previousVersionMetrics.specificityScore > 0
        ) {
          const dropPercent =
            ((previousVersionMetrics.specificityScore -
              lastVersionMetrics.specificityScore) /
              previousVersionMetrics.specificityScore) *
            100;
          if (dropPercent > 20) {
            riskIndicators.push({
              type: 'falling_specificity',
              severity: 'medium',
              label: 'Falling specificity',
              detail: `Specificity score dropped ${dropPercent.toFixed(1)}% over the last 2 versions — exceeds the 20% threshold.`,
            });
          }
        }
      }

      // 8d. diverging_trajectory
      for (const cp of convergenceTrajectory) {
        if (
          cp.trajectory &&
          (cp.trajectory.toLowerCase().includes('diverging') ||
            cp.trajectory.toLowerCase().includes('divergent'))
        ) {
          // Avoid duplicates
          const alreadyTracked = riskIndicators.some(
            (r) => r.type === 'diverging_trajectory',
          );
          if (!alreadyTracked) {
            riskIndicators.push({
              type: 'diverging_trajectory',
              severity: 'medium',
              label: 'Diverging trajectory detected',
              detail: `Trajectory field contains "diverging"/"divergent" language (latest: "${cp.trajectory}").`,
            });
          }
          break;
        }
      }

      // 8e. no_convergence_data
      if (convergenceTrajectory.length === 0) {
        riskIndicators.push({
          type: 'no_convergence_data',
          severity: 'high',
          label: 'No convergence data available',
          detail: 'No convergence history records found for this document — cannot assess creative/greenlight gap trends.',
        });
      }

      // --- 9. Assemble result --------------------------------------------
      return {
        versionTimeline,
        convergenceTrajectory,
        blockerEvolution,
        entropyMetrics,
        riskIndicators,
        missingDataReport,
      };
    },
  });

  return { data, isLoading, error, refetch };
}