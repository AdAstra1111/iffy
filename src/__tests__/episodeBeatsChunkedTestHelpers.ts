/**
 * Test helpers — re-exports the pure functions from the edge function module
 * in a way that Vitest can import (no Deno deps).
 */

interface EpisodeBeatBlock {
  episodeNumber: number;
  text: string;
}

/**
 * Parse raw LLM text output into episode blocks.
 */
export function parseEpisodeBlocks(raw: string): EpisodeBeatBlock[] {
  const headerPattern = /^#{1,3}\s*(?:EPISODE|EP\.?)\s*(\d+)\b[^\n]*/gim;
  const matches = [...raw.matchAll(headerPattern)];

  if (matches.length === 0) return [];

  const blocks: EpisodeBeatBlock[] = [];
  for (let i = 0; i < matches.length; i++) {
    const epNum = parseInt(matches[i][1], 10);
    const startIdx = matches[i].index!;
    const endIdx = i < matches.length - 1 ? matches[i + 1].index! : raw.length;
    const text = raw.slice(startIdx, endIdx).trim();
    blocks.push({ episodeNumber: epNum, text });
  }

  return blocks;
}

/**
 * Merge episode blocks by episode_number key. Last wins.
 */
export function mergeByEpisodeNumber(existing: EpisodeBeatBlock[], incoming: EpisodeBeatBlock[]): EpisodeBeatBlock[] {
  const map = new Map<number, EpisodeBeatBlock>();
  for (const block of existing) map.set(block.episodeNumber, block);
  for (const block of incoming) map.set(block.episodeNumber, block);
  return [...map.values()].sort((a, b) => a.episodeNumber - b.episodeNumber);
}

/**
 * Find missing episode numbers from expected set 1..N.
 */
export function findMissing(blocks: EpisodeBeatBlock[], expectedCount: number): number[] {
  const present = new Set(blocks.map(b => b.episodeNumber));
  const missing: number[] = [];
  for (let i = 1; i <= expectedCount; i++) {
    if (!present.has(i)) missing.push(i);
  }
  return missing;
}

/**
 * Build a meta_json update preserving bg_started_at from existing version data.
 * This mirrors the logic in generateEpisodeBeatsChunked that was fixed to
 * destructure .data from the .single() Supabase response.
 *
 * .single() returns { data: T | null, error: ... } — not T directly.
 * The fix ensures existingVersion is the actual row, not the response wrapper.
 */
export function buildMetaJsonUpdate(
  existingVersionRow: { meta_json?: { bg_started_at?: string } } | null,
  episodeCount: number,
  maxEpNum: number,
): Record<string, unknown> {
  const origStartedAt = existingVersionRow?.meta_json?.bg_started_at;
  return {
    bg_generating: true,
    episode_count: episodeCount,
    episodes_total: episodeCount,
    episodes_completed: maxEpNum,
    current_episode: maxEpNum,
    ...(origStartedAt ? { bg_started_at: origStartedAt } : {}),
  };
}
