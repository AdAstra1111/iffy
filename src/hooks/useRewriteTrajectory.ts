/**
 * useRewriteTrajectory — Read-only data fetching + observatory state computation.
 *
 * Fetches project_document_versions, dev_engine_convergence_history,
 * development_notes for a given document, and computes all observatory state
 * including entropy metrics, risk flags, and missing-data report.
 *
 * ZERO WRITES. ZERO MUTATIONS.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  computeVersionPairs,
  computeScoreTrend,
  noteOverlapPercentage,
  wordCount,
  type VersionPair,
} from '@/lib/entropy';

// ── Types ───────────────────────────────────────────────────────

export interface VersionRow {
  id: string;
  document_id: string;
  version_number: number;
  created_at: string;
  label: string | null;
  change_summary: string | null;
  parent_version_id: string | null;
  plaintext: string;
  meta_json: Record<string, any> | null;
  is_current: boolean;
  approval_status: string;
  status: string | null;
  content_hash: string | null;
  deliverable_type: string | null;
}

export interface ScoreRow {
  id?: string;
  version_id?: string;
  creative_score?: number;
  greenlight_score?: number;
  gap?: number;
  convergence_status?: string;
  trajectory?: string | null;
  ci_score?: number;
  gp_score?: number;
  run_type?: string;
  created_at: string;
}

export interface NoteRow {
  id: string;
  document_version_id: string;
  note_key: string;
  category: string | null;
  severity: string | null;
  description: string | null;
  resolved: boolean | null;
  resolved_in_version: string | null;
  regressed: boolean | null;
  created_at: string | null;
}

export interface ScorePoint {
  versionNumber: number;
  versionId?: string;
  ci: number | null;
  gp: number | null;
  source: 'convergence_history' | 'development_runs';
  created_at: string;
}

export interface NoteEntry {
  versionNumber: number;
  noteKey: string;
  severity: string;
  description: string;
  resolved: boolean;
  resolvedInVersion: number | null;
  regressed: boolean;
}

export interface DiagnosticFlag {
  flag: string;                     // e.g. "POSSIBLE_PARAPHRASE_LOOP"
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  detected: boolean;
  triggerCondition: string;         // exact deterministic rule
  observedValues: Record<string, any>;
  thresholdUsed: number | string;
  missingDataState: string;         // e.g. "Insufficient version count (need 4+, have 2)"
  explanation: string;
  involvedVersions: number[];
}

export interface MissingDataReport {
  versionsMissingScores: number[];
  versionsMissingNotes: number[];
  versionsMissingText: number[];
  versionsDuplicates: number[];
  summary: string;
}

export interface ObservatoryState {
  versions: VersionRow[];
  scorePoints: ScorePoint[];
  noteEntries: NoteEntry[];
  versionPairs: VersionPair[];
  ciTrend: ReturnType<typeof computeScoreTrend>;
  gpTrend: ReturnType<typeof computeScoreTrend>;
  diagnosticFlags: DiagnosticFlag[];
  missingData: MissingDataReport;
  noteOverlapPct: number;
  lastStopReason: string | null;
  lastBlockersReduced: boolean | null;
  rewriteNoopSameContent: number;   // count of rewrites with >0.95 Jaccard sim
  rewriteCreatedNewVersion: number; // count of rewrites (non-v1 versions with label containing "rewrite")
  isLoading: boolean;
  error: string | null;
}

// ── Diagnostic flag thresholds ───────────────────────────────────

const THRESHOLDS = {
  PARAPHRASE_LOOP_SIMILARITY: 0.85,
  PARAPHRASE_LOOP_MIN_VERSIONS: 3,
  PARAPHRASE_LOOP_MAX_CI_GRADIENT: 2,
  FALSE_CONVERGENCE_MIN_SCORE: 80,
  FALSE_CONVERGENCE_MAX_SIMILARITY: 0.3,
  FALSE_CONVERGENCE_STABLE_SIMILARITY: 0.4,
  FALSE_CONVERGENCE_STABLE_VERSIONS: 3,
  SPECIFICITY_COLLAPSE_DROP_PCT: 30,
  SPECIFICITY_COLLAPSE_MIN_VERSIONS: 3,
  COSMETIC_REWRITE_MIN_SIMILARITY: 0.95,
  NOTE_CHURN_MIN_OVERLAP: 80,
  NOTE_CHURN_MIN_VERSIONS: 3,
  DIMINISHING_RETURNS_MIN_VERSIONS: 4,
  DIMINISHING_RETURNS_MAX_CI_GRADIENT: 1,
  DIMINISHING_RETURNS_MAX_GP_GRADIENT: 1,
  DIMINISHING_RETURNS_MIN_BLOCKER_COUNT: 2,
  DIMINISHING_RETURNS_BLOCKER_DELTA: -1,
};

// ── Diagnostic flag computation ─────────────────────────────────

function computeFlags(
  versions: VersionRow[],
  pairs: VersionPair[],
  scorePoints: ScorePoint[],
  noteEntries: NoteEntry[],
  ciTrend: ReturnType<typeof computeScoreTrend>,
  gpTrend: ReturnType<typeof computeScoreTrend>,
  noteOverlapPct: number,
  lastBlockerDelta: number | null,
): DiagnosticFlag[] {
  const flags: DiagnosticFlag[] = [];

  // ── POSSIBLE_PARAPHRASE_LOOP ──
  // Condition: 3+ consecutive rewrites with Jaccard sim > 0.85 AND flat CI/GP
  const paraphraseCandidates: number[] = [];
  let consecutiveParaphraseCount = 0;

  for (const pair of pairs) {
    if (pair.jaccardSimilarity > THRESHOLDS.PARAPHRASE_LOOP_SIMILARITY) {
      consecutiveParaphraseCount++;
      if (!paraphraseCandidates.includes(pair.fromVersion)) {
        paraphraseCandidates.push(pair.fromVersion);
      }
      if (!paraphraseCandidates.includes(pair.toVersion)) {
        paraphraseCandidates.push(pair.toVersion);
      }
    } else {
      consecutiveParaphraseCount = 0;
    }
  }

  const hasFlatCiGp = ciTrend.gradient < THRESHOLDS.PARAPHRASE_LOOP_MAX_CI_GRADIENT &&
                       gpTrend.gradient < THRESHOLDS.PARAPHRASE_LOOP_MAX_CI_GRADIENT;

  const paraphraseDetected = consecutiveParaphraseCount >= THRESHOLDS.PARAPHRASE_LOOP_MIN_VERSIONS &&
                              hasFlatCiGp;

  const paraphraseCondition = `Jaccard similarity > ${THRESHOLDS.PARAPHRASE_LOOP_SIMILARITY} for ${THRESHOLDS.PARAPHRASE_LOOP_MIN_VERSIONS}+ consecutive versions AND CI/GP gradient < ${THRESHOLDS.PARAPHRASE_LOOP_MAX_CI_GRADIENT}`;

  flags.push({
    flag: 'POSSIBLE_PARAPHRASE_LOOP',
    level: paraphraseDetected ? 'HIGH' : 'LOW',
    detected: paraphraseDetected,
    triggerCondition: paraphraseCondition,
    observedValues: {
      maxConsecutiveHighSimilarity: consecutiveParaphraseCount,
      ciGradient: ciTrend.gradient,
      gpGradient: gpTrend.gradient,
      similarities: pairs.slice(-consecutiveParaphraseCount || -1).map(p => p.jaccardSimilarity),
    },
    thresholdUsed: THRESHOLDS.PARAPHRASE_LOOP_SIMILARITY,
    missingDataState: scorePoints.length < 2
      ? 'Insufficient score data for CI/GP trajectory (need 2+ scores, have ' + scorePoints.length + ')'
      : pairs.length < THRESHOLDS.PARAPHRASE_LOOP_MIN_VERSIONS
      ? 'Insufficient version pairs for 3+ consecutive check (need ' + THRESHOLDS.PARAPHRASE_LOOP_MIN_VERSIONS + ', have ' + pairs.length + ')'
      : 'Data sufficient for computation',
    explanation: paraphraseDetected
      ? `${consecutiveParaphraseCount} consecutive versions have token overlap > 85% with flat CI/GP trajectory (CI gradient: ${ciTrend.gradient.toFixed(1)}/version, GP gradient: ${gpTrend.gradient.toFixed(1)}/version) — content may be repeating without improvement`
      : `No paraphrase loop pattern detected`,
    involvedVersions: paraphraseDetected ? paraphraseCandidates : [],
  });

  // ── POSSIBLE_FALSE_CONVERGENCE ──
  // Condition: CI/GP > 80 AND (sim < 0.3 OR stable 3+ versions with sim < 0.4)
  const recentCi = scorePoints.filter(s => s.ci !== null).slice(-3).map(s => s.ci!);
  const recentGp = scorePoints.filter(s => s.gp !== null).slice(-3).map(s => s.gp!);
  const scoresHigh = recentCi.every(c => c >= THRESHOLDS.FALSE_CONVERGENCE_MIN_SCORE) &&
                     recentGp.every(g => g >= THRESHOLDS.FALSE_CONVERGENCE_MIN_SCORE);

  let lowSimilarityCount = 0;
  let lowSimilarityVersions: number[] = [];
  for (const pair of pairs) {
    if (pair.jaccardSimilarity < THRESHOLDS.FALSE_CONVERGENCE_MAX_SIMILARITY) {
      lowSimilarityCount++;
      if (!lowSimilarityVersions.includes(pair.fromVersion)) lowSimilarityVersions.push(pair.fromVersion);
      if (!lowSimilarityVersions.includes(pair.toVersion)) lowSimilarityVersions.push(pair.toVersion);
    }
  }

  let stableLowSimCount = 0;
  let stableLowSimVersions: number[] = [];
  for (const pair of pairs.slice(-THRESHOLDS.FALSE_CONVERGENCE_STABLE_VERSIONS)) {
    if (pair.jaccardSimilarity < THRESHOLDS.FALSE_CONVERGENCE_STABLE_SIMILARITY) {
      stableLowSimCount++;
      if (!stableLowSimVersions.includes(pair.fromVersion)) stableLowSimVersions.push(pair.fromVersion);
      if (!stableLowSimVersions.includes(pair.toVersion)) stableLowSimVersions.push(pair.toVersion);
    }
  }

  const falseConvDetected = scoresHigh && (lowSimilarityCount >= 2 || stableLowSimCount >= 2);

  const falseConvCondition = `CI/GP >= ${THRESHOLDS.FALSE_CONVERGENCE_MIN_SCORE} AND ` +
    `(similarity < ${THRESHOLDS.FALSE_CONVERGENCE_MAX_SIMILARITY} for 2+ pairs OR ` +
    `similarity < ${THRESHOLDS.FALSE_CONVERGENCE_STABLE_SIMILARITY} for ${THRESHOLDS.FALSE_CONVERGENCE_STABLE_VERSIONS}+ consecutive pairs)`;

  flags.push({
    flag: 'POSSIBLE_FALSE_CONVERGENCE',
    level: falseConvDetected ? 'MEDIUM' : 'LOW',
    detected: falseConvDetected,
    triggerCondition: falseConvCondition,
    observedValues: {
      recentCiValues: recentCi,
      recentGpValues: recentGp,
      lowSimilarityPairCount: lowSimilarityCount,
      stableLowSimilarityCount: stableLowSimCount,
      recentSimilarities: pairs.slice(-3).map(p => p.jaccardSimilarity),
    },
    thresholdUsed: `${THRESHOLDS.FALSE_CONVERGENCE_MIN_SCORE} (score) / ${THRESHOLDS.FALSE_CONVERGENCE_MAX_SIMILARITY} (similarity)`,
    missingDataState: scorePoints.length < 2
      ? 'Insufficient score data for convergence check (need 2+ scores, have ' + scorePoints.length + ')'
      : 'Data sufficient for computation',
    explanation: falseConvDetected
      ? `Scores >= ${THRESHOLDS.FALSE_CONVERGENCE_MIN_SCORE} (CI: [${recentCi.join(', ')}], GP: [${recentGp.join(', ')}]) while ${lowSimilarityCount} version pairs show low token overlap (< ${THRESHOLDS.FALSE_CONVERGENCE_MAX_SIMILARITY}) — scores may not reflect actual content stability`
      : `No false convergence pattern detected`,
    involvedVersions: falseConvDetected ? [...new Set([...lowSimilarityVersions, ...stableLowSimVersions])] : [],
  });

  // ── POSSIBLE_SPECIFICITY_COLLAPSE ──
  // Condition: entity count drops > 30% over 3 consecutive versions
  let specificityDetected = false;
  let specificityVersions: number[] = [];
  let specificityExplanation = '';
  let specificityEntityCounts: number[] = [];

  if (pairs.length >= THRESHOLDS.SPECIFICITY_COLLAPSE_MIN_VERSIONS - 1) {
    const recentPairs = pairs.slice(-(THRESHOLDS.SPECIFICITY_COLLAPSE_MIN_VERSIONS - 1));
    const entityCounts = [recentPairs[0].properNounCountFrom];
    for (let i = 0; i < recentPairs.length; i++) {
      entityCounts.push(recentPairs[i].properNounCountTo);
    }
    specificityEntityCounts = entityCounts;

    if (entityCounts.length >= THRESHOLDS.SPECIFICITY_COLLAPSE_MIN_VERSIONS) {
      const first = entityCounts[0];
      const last = entityCounts[entityCounts.length - 1];
      const dropPct = first > 0 ? ((first - last) / first) * 100 : 0;
      specificityDetected = dropPct > THRESHOLDS.SPECIFICITY_COLLAPSE_DROP_PCT;

      specificityVersions = entityCounts.length >= 3
        ? [recentPairs[0].fromVersion, ...recentPairs.slice(-2).map(p => p.toVersion)]
        : [];

      specificityExplanation = specificityDetected
        ? `Entity count dropped ${dropPct.toFixed(0)}% over ${entityCounts.length} versions (${entityCounts[0]} → ${entityCounts[entityCounts.length - 1]}) — content may be losing specificity`
        : `Entity count stable (${entityCounts[0]} → ${entityCounts[entityCounts.length - 1]} over ${entityCounts.length} versions)`;
    }
  }

  flags.push({
    flag: 'POSSIBLE_SPECIFICITY_COLLAPSE',
    level: specificityDetected ? 'HIGH' : 'LOW',
    detected: specificityDetected,
    triggerCondition: `Proper noun count drops > ${THRESHOLDS.SPECIFICITY_COLLAPSE_DROP_PCT}% over ${THRESHOLDS.SPECIFICITY_COLLAPSE_MIN_VERSIONS} consecutive versions`,
    observedValues: {
      entityCounts: specificityEntityCounts,
      dropPercentage: specificityEntityCounts.length >= 2
        ? ((specificityEntityCounts[0] - specificityEntityCounts[specificityEntityCounts.length - 1]) / Math.max(specificityEntityCounts[0], 1)) * 100
        : 0,
    },
    thresholdUsed: `${THRESHOLDS.SPECIFICITY_COLLAPSE_DROP_PCT}%`,
    missingDataState: pairs.length < THRESHOLDS.SPECIFICITY_COLLAPSE_MIN_VERSIONS - 1
      ? 'Insufficient version pairs for 3-version specificity trend (need ' + (THRESHOLDS.SPECIFICITY_COLLAPSE_MIN_VERSIONS - 1) + '+, have ' + pairs.length + ')'
      : 'Data sufficient for computation',
    explanation: specificityExplanation || 'Data insufficient or no collapse detected',
    involvedVersions: specificityVersions,
  });

  // ── POSSIBLE_COSMETIC_REWRITE ──
  // Condition: Jaccard sim > 0.95 AND paragraph change ratio < 0.1
  let cosmeticCount = 0;
  let cosmeticVersions: number[] = [];
  for (const pair of pairs) {
    if (pair.jaccardSimilarity > THRESHOLDS.COSMETIC_REWRITE_MIN_SIMILARITY &&
        pair.paragraphChangeRatio < 0.1) {
      cosmeticCount++;
      if (!cosmeticVersions.includes(pair.fromVersion)) cosmeticVersions.push(pair.fromVersion);
      if (!cosmeticVersions.includes(pair.toVersion)) cosmeticVersions.push(pair.toVersion);
    }
  }

  flags.push({
    flag: 'POSSIBLE_COSMETIC_REWRITE',
    level: cosmeticCount >= 1 ? 'MEDIUM' : 'LOW',
    detected: cosmeticCount >= 1,
    triggerCondition: `Jaccard similarity > ${THRESHOLDS.COSMETIC_REWRITE_MIN_SIMILARITY} AND paragraph change ratio < 0.1`,
    observedValues: {
      cosmeticVersionPairCount: cosmeticCount,
      cosmeticVersions: cosmeticVersions,
    },
    thresholdUsed: THRESHOLDS.COSMETIC_REWRITE_MIN_SIMILARITY,
    missingDataState: pairs.length === 0 ? 'No version pairs available for comparison' : 'Data sufficient for computation',
    explanation: cosmeticCount >= 1
      ? `${cosmeticCount} version pair(s) show > 95% token overlap and < 10% paragraph change — these may be cosmetic (whitespace, punctuation, minor formatting) rather than substantive`
      : `No cosmetic rewrite patterns detected`,
    involvedVersions: cosmeticVersions,
  });

  // ── NOTE_CHURN ──
  // Condition: Note overlap > 80% across 3+ versions (same issues persisting)
  const noteChurnDetected = noteOverlapPct > THRESHOLDS.NOTE_CHURN_MIN_OVERLAP &&
                             noteEntries.length >= THRESHOLDS.NOTE_CHURN_MIN_VERSIONS;

  const uniqueNoteKeys = [...new Set(noteEntries.map(n => n.noteKey))];
  const resolvedCount = noteEntries.filter(n => n.resolved).length;
  const regressedCount = noteEntries.filter(n => n.regressed).length;

  flags.push({
    flag: 'NOTE_CHURN',
    level: noteChurnDetected ? 'HIGH' : (uniqueNoteKeys.length > 0 ? 'LOW' : 'LOW'),
    detected: noteChurnDetected,
    triggerCondition: `Note overlap > ${THRESHOLDS.NOTE_CHURN_MIN_OVERLAP}% across ${THRESHOLDS.NOTE_CHURN_MIN_VERSIONS}+ versions`,
    observedValues: {
      noteOverlapPercentage: noteOverlapPct,
      totalNotes: noteEntries.length,
      uniqueNoteKeys: uniqueNoteKeys.length,
      resolvedCount,
      regressedCount,
    },
    thresholdUsed: `${THRESHOLDS.NOTE_CHURN_MIN_OVERLAP}%`,
    missingDataState: noteEntries.length === 0
      ? 'No note data available for this document'
      : noteEntries.length < THRESHOLDS.NOTE_CHURN_MIN_VERSIONS
      ? 'Insufficient note versions for churn analysis (need ' + THRESHOLDS.NOTE_CHURN_MIN_VERSIONS + ', have ' + noteEntries.length + ')'
      : 'Data sufficient for computation',
    explanation: noteChurnDetected
      ? `${noteOverlapPct.toFixed(0)}% of notes overlap across versions (${resolvedCount} resolved, ${regressedCount} regressed of ${noteEntries.length} total) — same issues may be persisting${regressedCount > 0 ? ' or regressing' : ''}`
      : resolvedCount > 0
      ? `${resolvedCount} of ${noteEntries.length} notes resolved across versions`
      : 'No note persistence pattern detected',
    involvedVersions: noteChurnDetected
      ? [...new Set(noteEntries.map(n => n.versionNumber))]
      : [],
  });

  // ── DIMINISHING_RETURNS ──
  // Condition: 4+ versions, CI gradient < 1, GP gradient < 1, blockers >= 2, blocker delta <= 0
  const blDelta = lastBlockerDelta ?? 0;
  const dimRetDetected =
    versions.length >= THRESHOLDS.DIMINISHING_RETURNS_MIN_VERSIONS &&
    ciTrend.gradient < THRESHOLDS.DIMINISHING_RETURNS_MAX_CI_GRADIENT &&
    gpTrend.gradient < THRESHOLDS.DIMINISHING_RETURNS_MAX_GP_GRADIENT;

  const dimRetCondition = `${THRESHOLDS.DIMINISHING_RETURNS_MIN_VERSIONS}+ versions, CI gradient < ${THRESHOLDS.DIMINISHING_RETURNS_MAX_CI_GRADIENT}, GP gradient < ${THRESHOLDS.DIMINISHING_RETURNS_MAX_GP_GRADIENT}`;

  flags.push({
    flag: 'DIMINISHING_RETURNS',
    level: dimRetDetected ? 'MEDIUM' : 'LOW',
    detected: dimRetDetected,
    triggerCondition: dimRetCondition,
    observedValues: {
      versionCount: versions.length,
      ciGradient: ciTrend.gradient,
      gpGradient: gpTrend.gradient,
      ciDirection: ciTrend.direction,
      gpDirection: gpTrend.direction,
    },
    thresholdUsed: `CI/GP gradient < ${THRESHOLDS.DIMINISHING_RETURNS_MAX_CI_GRADIENT}`,
    missingDataState: versions.length < THRESHOLDS.DIMINISHING_RETURNS_MIN_VERSIONS
      ? 'Insufficient versions for diminishing returns analysis (need ' + THRESHOLDS.DIMINISHING_RETURNS_MIN_VERSIONS + ', have ' + versions.length + ')'
      : scorePoints.length < 2
      ? 'Insufficient score data for CI/GP trajectory'
      : 'Data sufficient for computation',
    explanation: dimRetDetected
      ? `${versions.length} versions produced with near-flat CI/GP trajectory (CI: ${ciTrend.gradient.toFixed(1)}/version, GP: ${gpTrend.gradient.toFixed(1)}/version) — additional rewrites may yield diminishing score returns`
      : `Score trajectory shows movement (CI: ${ciTrend.gradient.toFixed(1)}/version, GP: ${gpTrend.gradient.toFixed(1)}/version)`,
    involvedVersions: dimRetDetected ? versions.map(v => v.version_number) : [],
  });

  return flags;
}

// ── Missing data report ─────────────────────────────────────────

function computeMissingData(
  versions: VersionRow[],
  scorePoints: ScorePoint[],
  noteEntries: NoteEntry[],
): MissingDataReport {
  const versionsMissingScores: number[] = [];
  const versionsMissingNotes: number[] = [];
  const versionsMissingText: number[] = [];
  const versionsDuplicates: number[] = [];

  const versionIdsWithScore = new Set(
    scorePoints.map(s => s.versionId).filter(Boolean),
  );
  const versionIdsWithNote = new Set(
    noteEntries.map(n => n.versionNumber),
  );

  const seenHashes = new Set<string>();

  for (const v of versions) {
    if (!versionIdsWithScore.has(v.id)) {
      versionsMissingScores.push(v.version_number);
    }
    if (!versionIdsWithNote.has(v.version_number)) {
      versionsMissingNotes.push(v.version_number);
    }
    if (!v.plaintext || v.plaintext.trim().length < 10) {
      versionsMissingText.push(v.version_number);
    }
    if (v.content_hash) {
      if (seenHashes.has(v.content_hash)) {
        versionsDuplicates.push(v.version_number);
      }
      seenHashes.add(v.content_hash);
    }
  }

  const parts: string[] = [];
  if (versionsMissingScores.length > 0) {
    parts.push(`${versionsMissingScores.length} version(s) missing CI/GP scores`);
  }
  if (versionsMissingNotes.length > 0) {
    parts.push(`${versionsMissingNotes.length} version(s) missing notes`);
  }
  if (versionsMissingText.length > 0) {
    parts.push(`${versionsMissingText.length} version(s) with no content text`);
  }
  if (versionsDuplicates.length > 0) {
    parts.push(`${versionsDuplicates.length} duplicate content hash(es)`);
  }
  if (parts.length === 0) {
    parts.push('All signals available for all versions');
  }

  return {
    versionsMissingScores,
    versionsMissingNotes,
    versionsMissingText,
    versionsDuplicates,
    summary: parts.join('; '),
  };
}

// ── Score point merging ─────────────────────────────────────────

function mergeScores(
  versions: VersionRow[],
  convergenceHistory: ScoreRow[],
  devRuns: ScoreRow[],
): ScorePoint[] {
  const versionMap = new Map<number, { id: string }>();
  for (const v of versions) {
    versionMap.set(v.version_number, { id: v.id });
  }

  const points: ScorePoint[] = [];

  // From convergence_history
  for (const ch of convergenceHistory) {
    // Find version by id
    const v = versions.find(vv => vv.id === ch.version_id);
    if (!v) continue;
    points.push({
      versionNumber: v.version_number,
      versionId: ch.version_id,
      ci: ch.creative_score ?? null,
      gp: ch.greenlight_score ?? null,
      source: 'convergence_history',
      created_at: ch.created_at,
    });
  }

  // From development_runs
  for (const dr of devRuns) {
    const v = versions.find(vv => vv.id === dr.version_id);
    if (!v) continue;
    // Avoid duplicate if already from convergence_history
    const isDuplicate = points.some(
      p => p.versionId === dr.version_id && p.source === 'convergence_history',
    );
    if (!isDuplicate) {
      points.push({
        versionNumber: v.version_number,
        versionId: dr.version_id,
        ci: dr.ci_score ?? null,
        gp: dr.gp_score ?? null,
        source: 'development_runs',
        created_at: dr.created_at,
      });
    }
  }

  // Sort by version number
  points.sort((a, b) => a.versionNumber - b.versionNumber);
  return points;
}

// ── Main hook ───────────────────────────────────────────────────

interface UseRewriteTrajectoryOptions {
  projectId: string | undefined;
  documentId: string | undefined;
}

export function useRewriteTrajectory({
  projectId,
  documentId,
}: UseRewriteTrajectoryOptions) {
  const versionsQuery = useQuery<VersionRow[]>({
    queryKey: ['observatory-versions', documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const { data, error } = await (supabase as any)
        .from('project_document_versions')
        .select('id, document_id, version_number, created_at, label, change_summary, parent_version_id, plaintext, meta_json, is_current, approval_status, status, content_hash, deliverable_type')
        .eq('document_id', documentId)
        .order('version_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as VersionRow[];
    },
    enabled: !!documentId,
  });

  const convergenceHistoryQuery = useQuery<ScoreRow[]>({
    queryKey: ['observatory-convergence', documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const { data, error } = await (supabase as any)
        .from('dev_engine_convergence_history')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
    enabled: !!documentId,
  });

  const devRunsQuery = useQuery<ScoreRow[]>({
    queryKey: ['observatory-dev-runs', documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const { data, error } = await (supabase as any)
        .from('development_runs')
        .select('id, version_id, run_type, output_json, created_at')
        .eq('document_id', documentId)
        .in('run_type', ['ANALYZE', 'CONVERGENCE'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      // Extract ci/gp from output_json
      return (data ?? []).map((r: any) => ({
        version_id: r.version_id,
        run_type: r.run_type,
        ci_score: r.output_json?.ci_score ?? r.output_json?.scores?.ci_score ?? null,
        gp_score: r.output_json?.gp_score ?? r.output_json?.scores?.gp_score ?? null,
        created_at: r.created_at,
      }));
    },
    enabled: !!documentId,
  });

  const notesQuery = useQuery<NoteRow[]>({
    queryKey: ['observatory-notes', documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const { data, error } = await (supabase as any)
        .from('development_notes')
        .select('id, document_version_id, note_key, category, severity, description, resolved, resolved_in_version, regressed, created_at')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
    enabled: !!documentId,
  });

  const isLoading =
    versionsQuery.isLoading ||
    convergenceHistoryQuery.isLoading ||
    devRunsQuery.isLoading ||
    notesQuery.isLoading;

  const error =
    versionsQuery.error?.message ??
    convergenceHistoryQuery.error?.message ??
    devRunsQuery.error?.message ??
    notesQuery.error?.message ??
    null;

  const versions = versionsQuery.data ?? [];
  const convergenceHistory = convergenceHistoryQuery.data ?? [];
  const devRuns = devRunsQuery.data ?? [];
  const notes = notesQuery.data ?? [];

  // Compute all derived state
  const scorePoints = mergeScores(versions, convergenceHistory, devRuns);

  // Map notes to version numbers
  const noteEntries: NoteEntry[] = notes.map(n => ({
    versionNumber: versions.find(v => v.id === n.document_version_id)?.version_number ?? -1,
    noteKey: n.note_key,
    severity: n.severity ?? 'unknown',
    description: n.description ?? '',
    resolved: n.resolved ?? false,
    resolvedInVersion: n.resolved_in_version
      ? versions.find(v => v.id === n.resolved_in_version)?.version_number ?? null
      : null,
    regressed: n.regressed ?? false,
  }));

  // Note overlap percentage (consecutive version-pair notes)
  const prevNoteKeys = noteEntries
    .filter(n => n.versionNumber === (versions[versions.length - 2]?.version_number ?? -1))
    .map(n => n.noteKey);
  const currNoteKeys = noteEntries
    .filter(n => n.versionNumber === (versions[versions.length - 1]?.version_number ?? -1))
    .map(n => n.noteKey);
  const noteOverlapPct = noteOverlapPercentage(prevNoteKeys, currNoteKeys);

  // Version pairs
  const versionPairs = computeVersionPairs(
    versions.map(v => ({ versionNumber: v.version_number, plaintext: v.plaintext ?? '' })),
  );

  // Score trends
  const ciScores = versions.map(v => {
    const match = scorePoints.find(s => s.versionId === v.id);
    return match?.ci ?? null;
  });
  const gpScores = versions.map(v => {
    const match = scorePoints.find(s => s.versionId === v.id);
    return match?.gp ?? null;
  });
  const ciTrend = computeScoreTrend(ciScores);
  const gpTrend = computeScoreTrend(gpScores);

  // Rewrite noop count (versions with >0.95 similarity to previous)
  const rewriteNoopSameContent = versionPairs.filter(p => p.jaccardSimilarity > 0.95).length;

  // Rewrite created new version count (versions labeled as rewrite)
  const rewriteCreatedNewVersion = versions.filter(
    v => (v.label?.toLowerCase().includes('rewrite') ?? false),
  ).length;

  // Last stop reason from scorePoints or versions
  const lastStopReason = null;

  // Last blocker delta
  const lastBlockerDelta = null;

  const diagnosticFlags = computeFlags(
    versions, versionPairs, scorePoints, noteEntries,
    ciTrend, gpTrend, noteOverlapPct, lastBlockerDelta,
  );

  const missingData = computeMissingData(versions, scorePoints, noteEntries);

  return {
    state: {
      versions,
      scorePoints,
      noteEntries,
      versionPairs,
      ciTrend,
      gpTrend,
      diagnosticFlags,
      missingData,
      noteOverlapPct,
      lastStopReason,
      lastBlockersReduced: lastBlockerDelta !== null ? lastBlockerDelta < 0 : null,
      rewriteNoopSameContent,
      rewriteCreatedNewVersion,
      isLoading,
      error,
    } as ObservatoryState,
    isLoading,
    error,
    refetchAll: () => {
      versionsQuery.refetch();
      convergenceHistoryQuery.refetch();
      devRunsQuery.refetch();
      notesQuery.refetch();
    },
  };
}
