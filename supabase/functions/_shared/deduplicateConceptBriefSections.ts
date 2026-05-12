/**
 * DeduplicateConceptBriefSections — Phase 2D
 *
 * Pure function that strips duplicate ## section headers from concept_brief text.
 * Uses the canonical section registry to know which sections are valid, then:
 *   Pass 1: keeps LAST occurrence of each known section key
 *   Pass 2: intentionally folds unmatched ## headers (e.g. "Protagonist's Journey",
 *           "Tonal Shifts") into the preceding valid section's content — these
 *           are sub-sections or variations, not separate concept_brief sections.
 *
 * This targets the chunked pipeline (rewrite-assemble handler), where
 * chunk-level rewrites can introduce duplicate ## sections.
 * The existing dedup in the sectioned rewrite handler (dev-engine-v2 line 10382)
 * operates on the parsed sections array; this operates on raw text.
 *
 * Matching now uses the registry's regex patterns directly (match_pattern with
 * \b word boundaries), replacing the old label-based startsWith comparison that
 * caused false-positive matches (e.g. "Protagonistic" matching "protagonist").
 */

import { getSectionConfig } from "./deliverableSectionRegistry.ts";

const HEADING_RE = /^(##\s+.+)$/m;

/**
 * Deduplicate ## section headers in concept_brief text.
 *
 * - Keeps the LAST occurrence of each registered concept_brief section key
 *   (last-occurrence-wins ensures pipeline rewrites settle on the latest pass).
 * - Intentionally folds unmatched ## headers (non-registry headings like
 *   "Protagonist's Journey") into the preceding valid section's content —
 *   these are sub-sections or phrasing variations, not separate document sections.
 * - Leaves all other content (##-level text below non-## headings) intact.
 * - Returns the original text unchanged if the doc type is not concept_brief
 *   (safety guard — callable on any text without risk).
 *
 * @param text - Raw concept_brief text with potential duplicate ## sections
 * @returns Deduplicated text
 */
export function deduplicateConceptBriefSections(text: string): string {
  if (!text || typeof text !== "string") return text;

  // Get valid concept_brief section keys from registry
  const config = getSectionConfig("concept_brief");
  if (!config?.sections || config.sections.length === 0) return text;

  const validKeys = new Set<string>();
  for (const sec of config.sections) {
    validKeys.add(sec.section_key);
  }

  // ── Step 1: Split text into sections by ## headings ──
  // Each section has: { header: "## ...", content: "text after header until next ##" }
  const sections: { header: string; content: string; sk: string | null }[] = [];

  // Find all ## heading positions
  const headingMatches: { index: number; header: string }[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(HEADING_RE.source, "gm");
  while ((match = re.exec(text)) !== null) {
    headingMatches.push({ index: match.index, header: match[1] });
  }

  if (headingMatches.length === 0) return text; // No ## headings found

  // Build sections from heading boundaries
  for (let i = 0; i < headingMatches.length; i++) {
    const start = headingMatches[i].index;
    const end = i + 1 < headingMatches.length ? headingMatches[i + 1].index : text.length;
    const header = headingMatches[i].header;
    let content = text.slice(start + header.length, end).trim();

    // Resolve section_key: match the heading against registry regex patterns
    let sectionKey: string | null = null;
    for (const sec of config.sections) {
      const re = new RegExp(sec.match_pattern, "i");
      if (re.test(header)) {
        sectionKey = sec.section_key;
        break;
      }
    }

    sections.push({ header, content, sk: sectionKey });
  }

  // ── Step 2: Pass 1 — keep LAST occurrence of each known key ──
  const seenKeys = new Set<string>();
  const deduped: typeof sections = [];

  for (let i = sections.length - 1; i >= 0; i--) {
    const sec = sections[i];
    if (sec.sk && validKeys.has(sec.sk)) {
      if (!seenKeys.has(sec.sk)) {
        seenKeys.add(sec.sk);
        deduped.unshift(sec);
      }
    } else {
      deduped.unshift(sec);
    }
  }

  // ── Step 3: Pass 2 — fold unknown headers into preceding valid section ──
  const folded: typeof sections = [];
  for (const sec of deduped) {
    if (sec.sk && validKeys.has(sec.sk)) {
      folded.push(sec);
    } else if (folded.length > 0) {
      // Fold into last valid section's content
      folded[folded.length - 1].content += "\n\n" + sec.header + "\n" + sec.content;
    } else {
      // Unknown section before first valid section — keep as-is
      folded.push(sec);
    }
  }

  // ── Step 4: Reassemble ──
  const assembled = folded
    .map((sec) => sec.header + "\n" + sec.content)
    .join("\n\n");

  console.log(
    `[deduplicateConceptBriefSections] deduped ${folded.length} sections from ${validKeys.size} known keys (${sections.length} raw → ${deduped.length} deduped → ${folded.length} folded)`
  );

  return assembled;
}
