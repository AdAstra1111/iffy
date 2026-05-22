/**
 * sceneGraphActAssigner.ts
 *
 * Format-aware act assignment for scene graphs.
 *
 * Provides assignSceneActs() with three execution paths:
 *   (A) JSON beat sheet with act_affiliation mapping
 *   (B) Text beat sheet — beats parsed via parseBeatsFromText, acts by proportional split
 *   (C) No beat sheet — pure proportional split per format thresholds
 *
 * The ACT_THRESHOLDS registry maps project.assigned_lane to act count and
 * proportional split percentages, replacing the old hardcoded 4-act heuristic.
 */

// ─── ACT_THRESHOLDS REGISTRY ─────────────────────────────────────────────────
// Each entry defines the act structure for a given market lane.
// thresholds are cumulative percentages (0..1), e.g. [0.22, 0.50, 0.78] means
// Act 1 spans [0, 0.22), Act 2 spans [0.22, 0.50), Act 3 spans [0.50, 0.78),
// Act 4 spans [0.78, 1.0].

interface ActThresholds {
  /** Number of acts implied by the thresholds array length + 1 */
  actCount: number;
  /** Cumulative thresholds: thresholds[i] = end of Act i+1 as fraction of total */
  thresholds: number[];
  /** Human-readable act labels */
  labels: string[];
}

const ACT_THRESHOLDS: Record<string, ActThresholds> = {
  // ── Feature Film / Cinema ──
  "feature_film": {
    actCount: 4,
    thresholds: [0.22, 0.50, 0.78],
    labels: ["ACT 1", "ACT 2", "ACT 3", "ACT 4"],
  },
  "independent-film": {
    actCount: 4,
    thresholds: [0.22, 0.50, 0.78],
    labels: ["ACT 1", "ACT 2", "ACT 3", "ACT 4"],
  },
  "studio": {
    actCount: 4,
    thresholds: [0.22, 0.50, 0.78],
    labels: ["ACT 1", "ACT 2", "ACT 3", "ACT 4"],
  },

  // ── TV Series / Episodic ──
  "series": {
    actCount: 4,
    thresholds: [0.20, 0.45, 0.75],
    labels: ["ACT 1", "ACT 2", "ACT 3", "ACT 4"],
  },

  // ── Vertical Drama ──
  "vertical_drama": {
    actCount: 3,
    thresholds: [0.30, 0.65],
    labels: ["ACT 1", "ACT 2", "ACT 3"],
  },

  // ── Documentary ──
  "documentary": {
    actCount: 3,
    thresholds: [0.25, 0.65],
    labels: ["ACT 1", "ACT 2", "ACT 3"],
  },

  // ── Animation ──
  "animation": {
    actCount: 3,
    thresholds: [0.25, 0.60],
    labels: ["ACT 1", "ACT 2", "ACT 3"],
  },

  // ── Short Film ──
  "short": {
    actCount: 3,
    thresholds: [0.30, 0.70],
    labels: ["ACT 1", "ACT 2", "ACT 3"],
  },

  // ── Default / Unspecified ──
  "unspecified": {
    actCount: 4,
    thresholds: [0.22, 0.50, 0.78],
    labels: ["ACT 1", "ACT 2", "ACT 3", "ACT 4"],
  },
};

// ─── BEAT SHEET JSON DETECTION ─────────────────────────────────────────────
// Ported from dev-engine-v2's inline detection logic

interface BeatSheetBeat {
  /** Beat title / name */
  title?: string;
  /** Beat name (alias for title) */
  name?: string;
  /** Act affiliation — "ACT 1", "act_1", "ACT 2", etc. */
  act_affiliation?: string;
  /** Act number (fallback when act_affiliation missing) */
  act?: string;
  /** Scene count or approximate page range */
  scene_count?: number;
  /** Any other beat properties */
  [key: string]: unknown;
}

interface BeatSheetJSON {
  beats: BeatSheetBeat[];
  title?: string;
  [key: string]: unknown;
}

interface ParsedBeat {
  beat: string;
  start: number;
  end: number;
}

/**
 * Detect whether the plaintext is a JSON beat sheet (`{ "beats": [...] }`)
 */
function isBeatSheetJSON(text: string): BeatSheetJSON | null {
  try {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{")) return null;
    const parsed = JSON.parse(trimmed) as BeatSheetJSON;
    if (parsed && Array.isArray(parsed.beats) && parsed.beats.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve act number from a beat's act_affiliation field.
 * Accepts "ACT 1", "ACT 2", "act_1", "act_2", "Act I", etc.
 */
function resolveActFromLabel(label: string | undefined): number | null {
  if (!label) return null;
  const norm = label.trim().toUpperCase().replace(/[_\s-]+/g, " ");

  // Direct number match: "ACT 1", "ACT 2", etc.
  const numMatch = norm.match(/ACT\s+(\d+)/i);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n >= 1 && n <= 10) return n;
  }

  // Roman numeral: "ACT I", "ACT II", etc.
  const romanMatch = norm.match(/ACT\s+(I{1,3}|IV|V|VI{1,3})/i);
  if (romanMatch) {
    const romanMap: Record<string, number> = {
      "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6,
      "VII": 7, "VIII": 8, "IX": 9, "X": 10,
    };
    return romanMap[romanMatch[1].toUpperCase()] || null;
  }

  // Ordinal: "First Act", "Second Act"
  const ordinalMatch = norm.match(/(FIRST|SECOND|THIRD|FOURTH|FIFTH)\s+ACT/i);
  const ordinalMap: Record<string, number> = {
    "FIRST": 1, "SECOND": 2, "THIRD": 3, "FOURTH": 4, "FIFTH": 5,
  };
  if (ordinalMatch) {
    return ordinalMap[ordinalMatch[1].toUpperCase()] || null;
  }

  // Underscore format: "act_1", "act_2", "act_3"
  const underscoreMatch = norm.match(/ACT[_\s]+(\d+)/i);
  if (underscoreMatch) {
    const n = parseInt(underscoreMatch[1], 10);
    if (n >= 1 && n <= 10) return n;
  }

  return null;
}

// ─── ASSIGN SCENE ACTS ─────────────────────────────────────────────────────

export interface AssignSceneActsInput {
  /** Total number of scenes */
  totalScenes: number;
  /** Project's assigned_lane from the DB */
  assignedLane: string;
  /** Beat sheet plaintext, if available */
  beatSheetText?: string | null;
}

export interface SceneActAssignment {
  /** Scene index (0-based) */
  sceneIndex: number;
  /** Assigned act number (1-based) */
  act: number;
  /** Human-readable act label */
  actLabel: string;
}

export interface AssignSceneActsResult {
  /** Act assignment for each scene */
  assignments: SceneActAssignment[];
  /** Which execution path was used */
  path: "json_beat_sheet" | "text_beat_sheet" | "pure_proportional";
  /** Number of beats found (for paths A and B) */
  beatsFound?: number;
  /** The lane that was used for threshold selection */
  resolvedLane: string;
}

/**
 * Assign act numbers to each scene based on the available beat sheet data
 * and format-aware thresholds.
 *
 * Path A: JSON beat sheet with act_affiliation → map beats to acts, then
 *          distribute scenes proportionally within each beat's act range.
 * Path B: Text beat sheet → parse beats via parseBeatsFromText, assign acts
 *          via proportional split using format thresholds (beats are metadata).
 * Path C: No beat sheet → pure proportional split using format thresholds.
 */
export function assignSceneActs(input: AssignSceneActsInput): AssignSceneActsResult {
  const { totalScenes, assignedLane, beatSheetText } = input;
  const thresholds = getThresholds(assignedLane);

  // ── PATH A: JSON beat sheet with act_affiliation ──
  if (beatSheetText) {
    const jsonBeatSheet = isBeatSheetJSON(beatSheetText);
    if (jsonBeatSheet && jsonBeatSheet.beats.length > 0) {
      const beats = jsonBeatSheet.beats;
      const actCount = thresholds.actCount;

      // Build act→beats mapping from act_affiliation
      const beatActMap: Map<number, BeatSheetBeat[]> = new Map();
      for (let a = 1; a <= actCount; a++) beatActMap.set(a, []);

      let unaffiliatedBeats = 0;
      for (const beat of beats) {
        const actNum = resolveActFromLabel(beat.act_affiliation || beat.act);
        if (actNum !== null && actNum >= 1 && actNum <= actCount) {
          beatActMap.get(actNum)!.push(beat);
        } else {
          unaffiliatedBeats++;
        }
      }

      // Distribute unaffiliated beats proportionally
      if (unaffiliatedBeats > 0) {
        const beatsPerAct: Map<number, number> = new Map();
        for (let a = 1; a <= actCount; a++) {
          beatsPerAct.set(a, beatActMap.get(a)!.length);
        }
        const assignedSoFar = beats.filter(b => {
          const an = resolveActFromLabel(b.act_affiliation || b.act);
          return an !== null && an >= 1 && an <= actCount;
        }).length;
        const remainingBeats = beats.length - assignedSoFar;
        if (remainingBeats > 0) {
          let unaffixedIdx = 0;
          for (const beat of beats) {
            const an = resolveActFromLabel(beat.act_affiliation || beat.act);
            if (an === null || an < 1 || an > actCount) {
              // Assign to act with fewest beats so far (proportional balance)
              let minAct = 1;
              let minCount = beatsPerAct.get(1)!;
              for (let a = 2; a <= actCount; a++) {
                const cnt = beatsPerAct.get(a)!;
                if (cnt < minCount) {
                  minCount = cnt;
                  minAct = a;
                }
              }
              beatActMap.get(minAct)!.push(beat);
              beatsPerAct.set(minAct, minCount + 1);
              unaffixedIdx++;
            }
          }
        }
      }

      // Compute act boundaries from beats
      // Using cumulative proportional rounding so the remainder is spread
      // across acts rather than dumped into the last act.
      // (was: Math.floor per-beat — 11 scenes dumped into Act 4 for 83/12)
      const actSceneBoundaries: number[] = [];
      let sceneCursor = 0;
      let remainingScenes = totalScenes;
      let remainingBeats = beats.length;

      for (let a = 1; a <= actCount; a++) {
        const actBeats = beatActMap.get(a)!;
        const beatCount = actBeats.length;

        let actScenes: number;
        if (a === actCount) {
          // Last act takes all remaining scenes (guarantees exact total)
          actScenes = remainingScenes;
        } else {
          // Proportional share: scenes proportional to beat count ratio
          // Math.round distributes the remainder across acts naturally
          actScenes = Math.round((beatCount / remainingBeats) * remainingScenes);
          remainingScenes -= actScenes;
          remainingBeats -= beatCount;
        }

        sceneCursor += actScenes;
        actSceneBoundaries.push(Math.min(sceneCursor, totalScenes));
      }

      // Assign acts to scenes
      const assignments: SceneActAssignment[] = [];
      for (let i = 0; i < totalScenes; i++) {
        let act = 1;
        for (let a = 0; a < actSceneBoundaries.length; a++) {
          if (i < actSceneBoundaries[a]) {
            act = a + 1;
            break;
          }
        }
        assignments.push({
          sceneIndex: i,
          act,
          actLabel: thresholds.labels[act - 1] || `ACT ${act}`,
        });
      }

      return {
        assignments,
        path: "json_beat_sheet",
        beatsFound: beats.length,
        resolvedLane: assignedLane,
      };
    }
  }

  // ── PATH B: Text beat sheet (parse beats, acts via proportional thresholds) ──
  if (beatSheetText && beatSheetText.trim()) {
    // We'll use the dev-engine-v2 parseBeatsFromText, but for standalone
    // operation we use the same algorithm defined here locally.
    const parsedBeats = parseBeatsFromTextLocal(beatSheetText);
    if (parsedBeats && parsedBeats.length > 0) {
      // Beats are informational metadata; act boundaries come from format thresholds
      const assignments = assignByProportionalSplit(totalScenes, thresholds);
      return {
        assignments,
        path: "text_beat_sheet",
        beatsFound: parsedBeats.length,
        resolvedLane: assignedLane,
      };
    }
  }

  // ── PATH C: No beat sheet — pure proportional ──
  const assignments = assignByProportionalSplit(totalScenes, thresholds);
  return {
    assignments,
    path: "pure_proportional",
    resolvedLane: assignedLane,
  };
}

// ─── LOCAL PARSE BEATS FROM TEXT ─────────────────────────────────────────────
// ╔═══════════════════════════════════════════════════════════════════╗
// ║  SYNC WARNING — DUPLICATED LOGIC                                ║
// ║  ParseBeatsFromTextLocal is a duplicate of dev-engine-v2's      ║
// ║  parseBeatsFromText() (dev-engine-v2/index.ts ~line 5435).      ║
// ║  Any bug fix or format change to beat parsing MUST be           ║
// ║  applied in BOTH locations.                                     ║
// ║                                                                  ║
// ║  We keep a local copy rather than importing from dev-engine-v2  ║
// ║  because _shared modules must not depend on consumer edge        ║
// ║  functions (dev-engine-v2 is 42K+ lines).                       ║
// ╚═══════════════════════════════════════════════════════════════════╝

export function parseBeatsFromTextLocal(text: string): ParsedBeat[] {
  if (!text || text.trim().length === 0) return [];

  // Try ## Beat header format first
  const headerPattern = /^##\s+Beat\s+\d+/gm;
  const headerStarts: number[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headerPattern.exec(text)) !== null) headerStarts.push(hm.index);
  if (headerStarts.length > 0) {
    return headerStarts.map((start, i) => ({
      beat: text.slice(start, i + 1 < headerStarts.length ? headerStarts[i + 1] : text.length),
      start,
      end: i + 1 < headerStarts.length ? headerStarts[i + 1] : text.length,
    }));
  }

  // Try ### Beat header (h3) format
  const headerPatternH3 = /^###\s+Beat\s+\d+/gm;
  const headerStartsH3: number[] = [];
  let hm3: RegExpExecArray | null;
  while ((hm3 = headerPatternH3.exec(text)) !== null) headerStartsH3.push(hm3.index);
  if (headerStartsH3.length > 0) {
    return headerStartsH3.map((start, i) => ({
      beat: text.slice(start, i + 1 < headerStartsH3.length ? headerStartsH3[i + 1] : text.length),
      start,
      end: i + 1 < headerStartsH3.length ? headerStartsH3[i + 1] : text.length,
    }));
  }

  // Fallback: ### N. Title format (h1/h2/h3 followed by number and period)
  const h3NumberedPattern = /^#{1,3}\s+\d+\.?\s+/gm;
  const h3NumberedStarts: number[] = [];
  let hn3: RegExpExecArray | null;
  while ((hn3 = h3NumberedPattern.exec(text)) !== null) h3NumberedStarts.push(hn3.index);
  if (h3NumberedStarts.length > 0) {
    return h3NumberedStarts.map((start, i) => ({
      beat: text.slice(start, i + 1 < h3NumberedStarts.length ? h3NumberedStarts[i + 1] : text.length),
      start,
      end: i + 1 < h3NumberedStarts.length ? h3NumberedStarts[i + 1] : text.length,
    }));
  }

  // Fallback: numbered markdown format "N. **Beat Name**"
  const numberedPattern = /^\d+\.\s+\*\*/gm;
  const numberedStarts: number[] = [];
  let nm: RegExpExecArray | null;
  while ((nm = numberedPattern.exec(text)) !== null) numberedStarts.push(nm.index);
  if (numberedStarts.length > 0) {
    return numberedStarts.map((start, i) => ({
      beat: text.slice(start, i + 1 < numberedStarts.length ? numberedStarts[i + 1] : text.length),
      start,
      end: i + 1 < numberedStarts.length ? numberedStarts[i + 1] : text.length,
    }));
  }

  // Fallback: plain numbered "N. Name" (no bold markers)
  const plainNumberedPattern = /^\d+\.\s+(?!\*\*)/gm;
  const plainNumberedStarts: number[] = [];
  let pnm: RegExpExecArray | null;
  while ((pnm = plainNumberedPattern.exec(text)) !== null) plainNumberedStarts.push(pnm.index);
  if (plainNumberedStarts.length > 0) {
    return plainNumberedStarts.map((start, i) => ({
      beat: text.slice(start, i + 1 < plainNumberedStarts.length ? plainNumberedStarts[i + 1] : text.length),
      start,
      end: i + 1 < plainNumberedStarts.length ? plainNumberedStarts[i + 1] : text.length,
    }));
  }

  // Fallback: plain text "BEAT N: Name" format
  const beatTextPattern = /^BEAT\s+(\d+)\s*[:—–-]?\s*(.+)/gim;
  const beatTextStarts: number[] = [];
  let btm: RegExpExecArray | null;
  while ((btm = beatTextPattern.exec(text)) !== null) beatTextStarts.push(btm.index);
  if (beatTextStarts.length > 0) {
    return beatTextStarts.map((start, i) => ({
      beat: text.slice(start, i + 1 < beatTextStarts.length ? beatTextStarts[i + 1] : text.length),
      start,
      end: i + 1 < beatTextStarts.length ? beatTextStarts[i + 1] : text.length,
    }));
  }

  return [];
}

// ─── ACT BY PROPORTIONAL SPLIT ──────────────────────────────────────────────
// Pure proportional assignment based on format thresholds

function assignByProportionalSplit(totalScenes: number, thresholds: ActThresholds): SceneActAssignment[] {
  const assignments: SceneActAssignment[] = [];

  for (let i = 0; i < totalScenes; i++) {
    const pct = (i + 0.5) / totalScenes; // Center of scene for smoother boundaries
    let act = 1;
    for (let t = 0; t < thresholds.thresholds.length; t++) {
      if (pct >= thresholds.thresholds[t]) {
        act = t + 2;
      } else {
        break;
      }
    }
    // Clamp to actCount
    act = Math.min(act, thresholds.actCount);

    assignments.push({
      sceneIndex: i,
      act,
      actLabel: thresholds.labels[act - 1] || `ACT ${act}`,
    });
  }

  return assignments;
}

// ─── GET THRESHOLDS ─────────────────────────────────────────────────────────
// Resolve the act thresholds for a given lane, with fallback to unspecified.

function getThresholds(lane: string): ActThresholds {
  const normLane = lane?.toLowerCase().replace(/[\s-]+/g, "_") || "unspecified";
  return ACT_THRESHOLDS[normLane] || ACT_THRESHOLDS["unspecified"];
}

/**
 * Get the number of acts for a given lane.
 * Public export for use by canonicalize-scene-substrate and other consumers.
 */
export function getActCountForLane(lane: string): number {
  return getThresholds(lane).actCount;
}

/**
 * Get the act labels for a given lane.
 * Public export for use by canonicalize-scene-substrate.
 */
export function getActLabelsForLane(lane: string): string[] {
  return getThresholds(lane).labels;
}