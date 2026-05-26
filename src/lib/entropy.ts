/**
 * entropy.ts — Pure text analysis functions for the Rewrite Trajectory Observatory.
 *
 * All functions are deterministic, library-free, and make zero claims about
 * semantics, artistic merit, or prose quality.
 *
 * APPROVED COMPUTATIONS:
 * - token Jaccard similarity (word-level, split on whitespace + punctuation)
 * - paragraph-change ratio
 * - character delta
 * - proper noun / named entity count (capitalised words in context)
 * - concrete noun ratio (deterministic pattern match, not semantic)
 * - note overlap percentage
 * - CI/GP delta trend
 */

// ── Tokenisation ────────────────────────────────────────────────

/** Split text into lowercase word tokens (strips punctuation) */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

/** Split text into whitespace-separated tokens (preserves case + punctuation) */
export function rawTokens(text: string): string[] {
  if (!text) return [];
  return text.split(/\s+/).filter(Boolean);
}

/** Count of non-empty characters */
export function charCount(text: string): number {
  if (!text) return 0;
  return text.replace(/\s/g, '').length;
}

/** Count of whitespace-separated words */
export function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Count of paragraphs (double-newline separated blocks) */
export function paragraphCount(text: string): number {
  if (!text) return 0;
  return text.split(/\n\s*\n/).filter(Boolean).length;
}

// ── Similarity ──────────────────────────────────────────────────

/**
 * Jaccard similarity on lowercase word tokens.
 * Range: 0 (no overlap) to 1 (identical).
 * This is DETERMINISTIC TOKEN OVERLAP, NOT semantic similarity.
 * Do not present it as semantic understanding.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  let union = tokensA.size;

  for (const tok of tokensB) {
    if (tokensA.has(tok)) {
      intersection++;
    } else {
      union++;
    }
  }

  return intersection / union;
}

// ── Paragraph-change ratio ──────────────────────────────────────

/**
 * What fraction of paragraphs changed between versions.
 * Compares lowercase-tokenised paragraphs by Jaccard overlap.
 * 0 = all paragraphs identical, 1 = all paragraphs different.
 */
export function paragraphChangeRatio(a: string, b: string): number {
  const parasA = a.split(/\n\s*\n/).filter(Boolean);
  const parasB = b.split(/\n\s*\n/).filter(Boolean);

  if (parasA.length === 0 && parasB.length === 0) return 0;
  if (parasA.length === 0 || parasB.length === 0) return 1;

  // Match each paragraph in B to its closest in A by Jaccard
  let changed = 0;
  for (const pb of parasB) {
    const tb = tokenize(pb);
    if (tb.length === 0) continue;
    let bestMatch = 0;
    for (const pa of parasA) {
      const sim = jaccardSimilarity(pa, pb);
      if (sim > bestMatch) bestMatch = sim;
    }
    if (bestMatch < 0.5) changed++;
  }

  return changed / parasB.length;
}

// ── Proper noun / entity extraction ─────────────────────────────

/**
 * Extract words that look like proper nouns:
 * - Capitalised and not at the start of a sentence
 * - Multi-word capitalised sequences (e.g. "Bill Blackstone")
 *
 * Returns unique lowercased identifiers. No semantic entity resolution.
 */
export function extractProperNouns(text: string): string[] {
  if (!text) return [];

  const result = new Set<string>();

  // Multi-word capitalised sequences: 2+ capitalised words in a row
  const multiWord = text.match(/(?:[A-Z][a-z]+[\s-]+)(?:[A-Z][a-z]+)+/g);
  if (multiWord) {
    for (const mw of multiWord) {
      result.add(mw.trim().toLowerCase());
    }
  }

  // Single capitalised words NOT at start of sentence
  const sentences = text.split(/[.!?]\s+/);
  for (const sentence of sentences.slice(1)) {
    const words = sentence.split(/\s+/);
    for (const w of words) {
      const cleaned = w.replace(/[^a-zA-Z]/g, '');
      if (
        cleaned.length >= 2 &&
        cleaned[0] >= 'A' && cleaned[0] <= 'Z' &&
        cleaned.slice(1) === cleaned.slice(1).toLowerCase() &&
        !['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'It', 'I', 'We', 'You', 'He', 'She', 'They', 'My', 'Your', 'His', 'Her', 'Its', 'Our', 'Their', 'And', 'But', 'Or', 'For', 'Nor', 'Yet', 'So'].includes(cleaned)
      ) {
        result.add(cleaned.toLowerCase());
      }
    }
  }

  return [...result].sort();
}

/**
 * Count proper nouns / named entities.
 */
export function countProperNouns(text: string): number {
  return extractProperNouns(text).length;
}

/**
 * Count numeric specificity: occurrences of digits, numbers, percentages, measurements.
 */
export function countNumericSpecificity(text: string): number {
  if (!text) return 0;
  const numbers = text.match(/\b\d+\b/g);
  const percentages = text.match(/\b\d+%/g);
  const measurements = text.match(/\b\d+(?:ft|m|km|mph|kg|lbs|min|hr|sec)s?\b/gi);
  return (numbers?.length ?? 0) + (percentages?.length ?? 0) + (measurements?.length ?? 0);
}

// ── Concrete noun ratio ─────────────────────────────────────────

/**
 * Count words that deterministically look like concrete nouns:
 * - words matching pattern-based heuristics for objects, places, people
 * - NOT semantic - uses suffix/position patterns
 *
 * This is a rough proxy, not a semantic classifier.
 */
export function extractConcreteNounCandidates(text: string): string[] {
  if (!text) return [];

  const candidates = new Set<string>();
  const words = text.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^a-zA-Z]/g, '');
    if (w.length < 3) continue;

    const lower = w.toLowerCase();

    // Words ending in common concrete-noun suffixes
    if (
      lower.endsWith('tion') || lower.endsWith('sion') ||
      lower.endsWith('ment') || lower.endsWith('ness') ||
      lower.endsWith('ity') || lower.endsWith('ence') ||
      lower.endsWith('ance') || lower.endsWith('ship') ||
      lower.endsWith('dom') || lower.endsWith('hood') ||
      lower.endsWith('ism') || lower.endsWith('ist') ||
      lower.endsWith('er') || lower.endsWith('or') ||
      lower.endsWith('ing')
    ) {
      candidates.add(lower);
      continue;
    }

    // Capitalised words (proper nouns - already caught above)
    if (w[0] >= 'A' && w[0] <= 'Z' && w.slice(1) === w.slice(1).toLowerCase()) {
      continue; // Already counted in proper nouns
    }

    // Words after determiners (the, a, an, this, that, these, those, my, his, her, its, our, their)
    if (i > 0) {
      const prev = words[i - 1].toLowerCase().replace(/[^a-z]/g, '');
      if (['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'his', 'her', 'its', 'our', 'their', 'each', 'every', 'some', 'any', 'no', 'many', 'several', 'few', 'both', 'all'].includes(prev)) {
        candidates.add(lower);
      }
    }

    // Words after prepositions in context (in the __, on the __)
    if (i >= 2) {
      const prevPrev = words[i - 2]?.toLowerCase().replace(/[^a-z]/g, '');
      const prev = words[i - 1]?.toLowerCase().replace(/[^a-z]/g, '');
      if (['in', 'on', 'at', 'by', 'with', 'from', 'to', 'into', 'onto', 'under', 'over', 'through', 'across', 'between', 'among', 'along', 'behind', 'beneath', 'beside', 'beyond', 'inside', 'outside', 'toward', 'upon', 'within', 'without'].includes(prevPrev || '') && prev === 'the') {
        candidates.add(lower);
      }
    }
  }

  return [...candidates].sort();
}

export function countConcreteNouns(text: string): number {
  return extractConcreteNounCandidates(text).length;
}

// ── CI/GP delta trend ───────────────────────────────────────────

export interface ScoreTrend {
  gradient: number;        // average change per version (positive = improving)
  direction: 'improving' | 'stable' | 'degrading' | 'unknown';
  volatility: number;      // std dev of changes (high = erratic)
}

/**
 * Compute trend statistics from an array of scores.
 * Minimum 2 data points needed for meaningful results; returns 'unknown' otherwise.
 */
export function computeScoreTrend(scores: (number | null)[]): ScoreTrend {
  const valid = scores.filter((s): s is number => s !== null);
  if (valid.length < 2) {
    return { gradient: 0, direction: 'unknown', volatility: 0 };
  }

  const deltas: number[] = [];
  for (let i = 1; i < valid.length; i++) {
    deltas.push(valid[i] - valid[i - 1]);
  }

  const gradient = deltas.reduce((a, b) => a + b, 0) / deltas.length;

  // Volatility = standard deviation of deltas
  const mean = gradient;
  const variance = deltas.reduce((acc, d) => acc + (d - mean) ** 2, 0) / deltas.length;
  const volatility = Math.sqrt(variance);

  let direction: ScoreTrend['direction'] = 'stable';
  if (gradient > 2) direction = 'improving';
  else if (gradient < -2) direction = 'degrading';

  return { gradient, direction, volatility };
}

// ── Note overlap ────────────────────────────────────────────────

/**
 * Percentage of note keys that appear across consecutive versions.
 * High overlap = same issues persisting.
 */
export function noteOverlapPercentage(
  prevNoteKeys: string[],
  currNoteKeys: string[],
): number {
  if (currNoteKeys.length === 0) return 0;
  if (prevNoteKeys.length === 0) return 0;

  const setA = new Set(prevNoteKeys);
  let overlap = 0;
  for (const key of currNoteKeys) {
    if (setA.has(key)) overlap++;
  }

  return (overlap / currNoteKeys.length) * 100;
}

// ── Helper: version pair processing ─────────────────────────────

export interface VersionPair {
  fromVersion: number;
  toVersion: number;
  jaccardSimilarity: number;
  paragraphChangeRatio: number;
  charDelta: number;
  wordCountFrom: number;
  wordCountTo: number;
  properNounCountFrom: number;
  properNounCountTo: number;
  concreteNounCountFrom: number;
  concreteNounCountTo: number;
  numericSpecificityFrom: number;
  numericSpecificityTo: number;
}

/**
 * Compute a set of version-pair metrics from sequential versions.
 * Returns pairs like [(v1,v2), (v2,v3), ...].
 */
export function computeVersionPairs(
  versions: Array<{ versionNumber: number; plaintext: string }>,
): VersionPair[] {
  if (versions.length < 2) return [];

  const pairs: VersionPair[] = [];
  for (let i = 1; i < versions.length; i++) {
    const prev = versions[i - 1];
    const curr = versions[i];

    pairs.push({
      fromVersion: prev.versionNumber,
      toVersion: curr.versionNumber,
      jaccardSimilarity: jaccardSimilarity(prev.plaintext, curr.plaintext),
      paragraphChangeRatio: paragraphChangeRatio(prev.plaintext, curr.plaintext),
      charDelta: charCount(curr.plaintext) - charCount(prev.plaintext),
      wordCountFrom: wordCount(prev.plaintext),
      wordCountTo: wordCount(curr.plaintext),
      properNounCountFrom: countProperNouns(prev.plaintext),
      properNounCountTo: countProperNouns(curr.plaintext),
      concreteNounCountFrom: countConcreteNouns(prev.plaintext),
      concreteNounCountTo: countConcreteNouns(curr.plaintext),
      numericSpecificityFrom: countNumericSpecificity(prev.plaintext),
      numericSpecificityTo: countNumericSpecificity(curr.plaintext),
    });
  }

  return pairs;
}

// ── Blockers-reduced check ──────────────────────────────────────

/**
 * Check if blocker count decreased between two versions.
 * Returns the raw delta (negative = fewer blockers).
 */
export function blockerDelta(
  prevBlockerCount: number,
  currBlockerCount: number,
): number {
  return currBlockerCount - prevBlockerCount;
}
