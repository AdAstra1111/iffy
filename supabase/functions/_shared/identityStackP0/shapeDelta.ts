/**
 * identityStackP0/shapeDelta.ts
 *
 * Shape Δ computation for Identity Delta P0.
 * 100% deterministic — no LLM, no heuristics.
 *
 * Compares document text against CIP narrative_shape
 * to compute scene count deviation, act distribution,
 * compression ratio, trajectory match, and key position fidelity.
 *
 * Phase 7.2A — Theme Δ skipped in P0.
 */

import type { StoredCIP } from "../ncpTypes.ts";
import type { ShapeDelta } from "./types.ts";

// ── Pattern Constants ──────────────────────────────────────────────────────

const SLUGLINE_RE = /^(?:INT|EXT|INT\.\s*\/\s*EXT|I\.\s*\/\s*E)\./gim;
const BEAT_HEADING_RE = /^#{3,4}\s+(\d+)\.\s+(.+)$/gm;
const ACT_HEADER_RE = /^##\s+Act\s+(\d+)[:\s]/im;
const SCENE_ACT_MARKER_RE = /^##\s+Act\s+(\d+)/im;

/** Key position labels we scan for in document text. */
const KEY_POSITION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Opening Image", pattern: /opening\s+image/i },
  { label: "Inciting Incident", pattern: /inciting/i },
  { label: "Lock In", pattern: /lock.?in|break.?into.?2/i },
  { label: "Midpoint", pattern: /midpoint/i },
  { label: "All Is Lost", pattern: /all.?is.?lost/i },
  { label: "Dark Night of the Soul", pattern: /dark.?night/i },
  { label: "Break Into Three", pattern: /break.?into.?3|final.?push/i },
  { label: "Climax", pattern: /climax/i },
  { label: "Final Image", pattern: /final.?image|denouement/i },
];

// ── Extraction Helpers ──────────────────────────────────────────────────────

function countSluglines(text: string): number {
  const matches = text.match(SLUGLINE_RE);
  return matches ? matches.length : 0;
}

function countBeatHeadings(text: string): number {
  let count = 0;
  const re = new RegExp(BEAT_HEADING_RE.source, "gim");
  while (re.exec(text) !== null) count++;
  return count;
}

function extractActDistribution(text: string): Array<{ act: number; count: number }> {
  const lines = text.split("\n");
  const actScenes: Map<number, number> = new Map();
  let currentAct = 1;

  for (const line of lines) {
    const actMatch = line.match(ACT_HEADER_RE);
    if (actMatch) {
      currentAct = parseInt(actMatch[1], 10);
      continue;
    }
    if (SLUGLINE_RE.test(line)) {
      actScenes.set(currentAct, (actScenes.get(currentAct) || 0) + 1);
    }
  }

  return Array.from(actScenes.entries())
    .map(([act, count]) => ({ act, count }))
    .sort((a, b) => a.act - b.act);
}

function computePercentages(
  distribution: Array<{ act: number; count: number }>,
  total: number,
): Array<{ act: number; count: number; pct: number }> {
  return distribution.map((d) => ({
    act: d.act,
    count: d.count,
    pct: total > 0 ? Math.round((d.count / total) * 100) : 0,
  }));
}

function findKeyPositions(text: string): string[] {
  const found: string[] = [];
  for (const kp of KEY_POSITION_PATTERNS) {
    if (kp.pattern.test(text)) {
      found.push(kp.label);
    }
  }
  return found;
}

function extractTrajectoryFromText(text: string): string | null {
  const lower = text.toLowerCase();
  if (/oscillat/i.test(lower)) return "oscillating";
  if (/relentless|ever[.\s]*rising|constant/i.test(lower)) return "rising";
  if (/falling|descend|declin/i.test(lower)) return "falling";
  if (/rising[.\s]*falling|arc|journey/i.test(lower)) return "rising_falling";
  return null; // can't determine from document text alone
}

// ── Main Computation ───────────────────────────────────────────────────────

/**
 * Compute Shape Δ from document text vs CIP narrative_shape.
 * 100% deterministic. No LLM. No exceptions thrown.
 *
 * @param documentText - The projection's plaintext output
 * @param cip - Canon Identity Profile (or null if unavailable)
 * @returns ShapeDelta — never null, always { available: true/false }
 */
export function computeShapeDelta(
  documentText: string | null | undefined,
  cip: StoredCIP | null | undefined,
): ShapeDelta {
  const warnings: string[] = [];

  if (!documentText || documentText.trim().length < 20) {
    return {
      available: false,
      scene_count: { expected: null, observed: null, delta: null },
      act_distribution: [],
      compression_ratio: { expected: null, observed: null },
      trajectory_match: null,
      key_positions_found: [],
      sps: null,
    };
  }

  // Scene count
  const observedScenes = countSluglines(documentText);
  const expectedScenes = cip?.narrative_shape?.total_estimated_scenes ?? null;
  const sceneDelta = (expectedScenes !== null && observedScenes > 0)
    ? observedScenes - expectedScenes
    : null;

  // Act distribution
  const rawActDist = extractActDistribution(documentText);
  const totalObservedScenes = rawActDist.reduce((s, d) => s + d.count, 0);
  const observedPcts = computePercentages(rawActDist, totalObservedScenes);

  const actDistribution = cip?.narrative_shape?.act_distribution?.length
    ? cip.narrative_shape.act_distribution.map((cipAct) => {
        const observed = rawActDist.find((d) => d.act === cipAct.act);
        const expectedPct = cipAct.estimated_scenes > 0
          ? Math.round((cipAct.estimated_scenes / (cip.narrative_shape.total_estimated_scenes || 1)) * 100)
          : null;
        const observedPct = observed
          ? Math.round((observed.count / Math.max(1, totalObservedScenes)) * 100)
          : null;
        return {
          act: cipAct.act,
          expected_pct: expectedPct ?? null,
          observed_pct: observedPct,
        };
      })
    : [];

  // Compression ratio
  const beatCount = countBeatHeadings(documentText);
  const compressionRatio = {
    expected: expectedScenes !== null && beatCount > 0
      ? Math.round((expectedScenes / beatCount) * 10) / 10
      : null,
    observed: beatCount > 0 && observedScenes > 0
      ? Math.round((observedScenes / beatCount) * 10) / 10
      : null,
  };

  // Trajectory
  const observedTrajectory = extractTrajectoryFromText(documentText);
  const expectedTrajectory = cip?.narrative_shape?.trajectory ?? null;
  const trajectoryMatch = (observedTrajectory && expectedTrajectory)
    ? observedTrajectory === expectedTrajectory
    : null;

  // Key positions found
  const keyPositionsFound = findKeyPositions(documentText);

  // SPS — Shape Preservation Score
  let sps: number | null = null;
  if (expectedScenes !== null && observedScenes > 0) {
    const sceneAccuracy = 100 - Math.abs(sceneDelta ?? 0) / Math.max(1, expectedScenes) * 100;
    const trajectoryScore = trajectoryMatch === true ? 100 : trajectoryMatch === false ? 50 : 100;
    sps = Math.max(0, Math.min(100, Math.round(sceneAccuracy * 0.7 + trajectoryScore * 0.3)));
  }

  return {
    available: true,
    scene_count: {
      expected: expectedScenes,
      observed: observedScenes,
      delta: sceneDelta,
    },
    act_distribution: actDistribution,
    compression_ratio: compressionRatio,
    trajectory_match: trajectoryMatch,
    key_positions_found: keyPositionsFound,
    sps,
  };
}
