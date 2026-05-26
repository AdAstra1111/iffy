/**
 * entropy.ts — Pure text analysis utility for the Rewrite Trajectory Observatory.
 * Zero external dependencies. All functions are deterministic, side-effect-free,
 * and handle edge cases (empty strings, no matches, etc.).
 */

// ── Stop words (common English — excludes capitalized proper nouns) ──

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could',
  'shall', 'should', 'may', 'might', 'must', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'not',
  'no', 'nor', 'so', 'very', 'just', 'then', 'now', 'also', 'too', 'only',
  'well', 'even', 'still', 'already', 'about', 'into', 'over', 'after',
  'before', 'between', 'through', 'during', 'without', 'within', 'along',
  'among', 'upon', 'across', 'down', 'up', 'out', 'off', 'above', 'below',
]);

// ── Tokeniser ──

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(t => t.length > 0);
}

function splitWords(text: string): string[] {
  return text.split(/[\s\p{P}]+/u).filter(t => t.length > 0);
}

// ── Exported functions ──

/**
 * Jaccard similarity between two strings: |intersection| / |union|
 * Tokenises by whitespace/punctuation, lowercases.
 * Both empty → 1.0. One empty → 0.0.
 */
export function jaccardSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  if (union === 0) return 0.0;
  return intersection / union;
}

/**
 * Extract capitalized words (≥3 chars) as named entities.
 * Returns deduplicated, alphabetically sorted.
 */
export function extractEntities(text: string): string[] {
  const words = splitWords(text);
  const entities = new Set<string>();

  for (const w of words) {
    // Capitalized: first char uppercase, rest lowercase, length ≥ 3
    if (w.length >= 3 && /^[A-Z][a-z]/.test(w)) {
      entities.add(w);
    }
  }

  return [...entities].sort();
}

/**
 * Extract common nouns: lowercase words ≥3 chars, not stop words, not
 * capitalized (proper nouns filtered out).
 * Returns deduplicated, alphabetically sorted.
 */
export function extractNouns(text: string): string[] {
  const words = splitWords(text);
  const nouns = new Set<string>();

  for (const w of words) {
    const lower = w.toLowerCase();
    if (
      w.length >= 3 &&
      !STOP_WORDS.has(lower) &&
      lower === w // must be all lowercase (excludes capitalized proper nouns)
    ) {
      nouns.add(lower);
    }
  }

  return [...nouns].sort();
}

/**
 * Compute per-text specificity metrics.
 * Edge: empty text → all zeros, specificityScore = 0.
 */
export function computeSpecificity(text: string): {
  entityCount: number;
  nounCount: number;
  avgWordLength: number;
  lexicalDiversity: number;
  specificityScore: number;
} {
  if (text.length === 0) {
    return {
      entityCount: 0,
      nounCount: 0,
      avgWordLength: 0,
      lexicalDiversity: 0,
      specificityScore: 0,
    };
  }

  const words = splitWords(text);
  const totalWords = words.length;
  if (totalWords === 0) {
    return {
      entityCount: 0,
      nounCount: 0,
      avgWordLength: 0,
      lexicalDiversity: 0,
      specificityScore: 0,
    };
  }

  const entityCount = extractEntities(text).length;
  const nounCount = extractNouns(text).length;

  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  const avgWordLength = totalChars / totalWords;

  const uniqueLower = new Set(words.map(w => w.toLowerCase())).size;
  const lexicalDiversity = uniqueLower / totalWords;

  // Weighted combination, capped at 100
  const specificityScore = Math.min(
    100,
    entityCount * 5 + nounCount * 2 + avgWordLength * 3 + lexicalDiversity * 20,
  );

  return {
    entityCount,
    nounCount,
    avgWordLength: Math.round(avgWordLength * 100) / 100,
    lexicalDiversity: Math.round(lexicalDiversity * 10000) / 10000,
    specificityScore: Math.round(specificityScore * 100) / 100,
  };
}

/**
 * Compute pair-wise metrics between two version plaintexts.
 * prevPlaintext can be empty/null — first version has no predecessor.
 * Edge: if either empty → jaccard/overlaps = 0.0, delta computed normally.
 */
export function computeVersionPairMetrics(
  prevPlaintext: string,
  currPlaintext: string,
): {
  jaccard: number;
  entityOverlap: number;
  nounOverlap: number;
  textLengthDelta: number;
} {
  const prev = prevPlaintext || '';
  const curr = currPlaintext || '';

  if (prev.length === 0 || curr.length === 0) {
    return {
      jaccard: 0.0,
      entityOverlap: 0.0,
      nounOverlap: 0.0,
      textLengthDelta: curr.length - prev.length,
    };
  }

  const jaccard = jaccardSimilarity(prev, curr);

  const prevEntities = extractEntities(prev);
  const currEntities = extractEntities(curr);
  const prevNouns = extractNouns(prev);
  const currNouns = extractNouns(curr);

  const entityOverlap = jaccardSimilarity(prevEntities.join(' '), currEntities.join(' '));
  const nounOverlap = jaccardSimilarity(prevNouns.join(' '), currNouns.join(' '));

  return {
    jaccard: Math.round(jaccard * 10000) / 10000,
    entityOverlap: Math.round(entityOverlap * 10000) / 10000,
    nounOverlap: Math.round(nounOverlap * 10000) / 10000,
    textLengthDelta: curr.length - prev.length,
  };
}
