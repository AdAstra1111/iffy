/**
 * identityStackP0/factsDelta.ts
 *
 * Facts Δ computation for Identity Delta P0.
 * 100% deterministic — entity extraction via regex patterns
 * matching the existing cipExtractor.ts style.
 *
 * Compares character names found in document text against
 * CIP facts.characters to compute presence, absence, and additions.
 *
 * Phase 7.2A — relationship and world-rule deltas skipped in P0.
 */

import type { StoredCIP } from "../ncpTypes.ts";
import type { FactsDelta } from "./types.ts";

// ── Pattern Constants ──────────────────────────────────────────────────────

/** Matches bold-name patterns common in character descriptions: **Name:** text */
const BOLD_NAME_RE = /\*\*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\*\*\s*:/g;

/** Matches slugline character introductions: INT. SARAH'S APARTMENT — characters may appear here */
const SLUGLINE_CHAR_RE = /(?:INT|EXT|INT\.\s*\/\s*EXT)\.\s+([A-Z][A-Z\s']+)\s+[-–—]/g;

/** Matches character name cues in screenplay dialogue: SARAH or SARAH (V.O.) */
const DIALOGUE_NAME_RE = /^([A-Z][A-Z\s]+)(?:\([^)]*\))?$/gm;

// ── Extraction Helpers ──────────────────────────────────────────────────────

function extractCharacterNames(text: string): string[] {
  const names = new Set<string>();

  // Extract from bold-name patterns (common in narrative docs: **Character:** text)
  let match: RegExpExecArray | null;
  const boldRe = new RegExp(BOLD_NAME_RE.source, "g");
  while ((match = boldRe.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 1 && name.length < 40) {
      names.add(name);
    }
  }

  // Extract from dialogue cues (common in screenplays)
  const dialgRe = new RegExp(DIALOGUE_NAME_RE.source, "gm");
  while ((match = dialgRe.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 1 && name.length < 40 && !name.includes("INT.") && !name.includes("EXT.")) {
      names.add(name);
    }
  }

  return Array.from(names);
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

// ── Main Computation ───────────────────────────────────────────────────────

/**
 * Compute Facts Δ from document text vs CIP character facts.
 * 100% deterministic. No LLM. Never throws.
 *
 * @param documentText - The projection's plaintext output
 * @param cip - Canon Identity Profile (or null if unavailable)
 * @returns FactsDelta — never null, always { available: true/false }
 */
export function computeFactsDelta(
  documentText: string | null | undefined,
  cip: StoredCIP | null | undefined,
): FactsDelta {
  if (!documentText || documentText.trim().length < 20) {
    return {
      available: false,
      characters_present: [],
      characters_missing: [],
      characters_added: [],
      fact_fidelity: null,
    };
  }

  if (!cip?.facts?.characters || cip.facts.characters.length === 0) {
    return {
      available: true,
      characters_present: [],
      characters_missing: [],
      characters_added: [],
      fact_fidelity: null,
    };
  }

  const documentNames = extractCharacterNames(documentText);
  const docNameSet = new Set(documentNames.map(normalizeName));

  const cipCharacters = cip.facts.characters.map((c) => ({
    original: c.name,
    normalized: normalizeName(c.name),
    role: c.role,
  }));
  const cipNameSet = new Set(cipCharacters.map((c) => c.normalized));

  // Characters from CIP that appear in document
  const charactersPresent = cipCharacters
    .filter((c) => docNameSet.has(c.normalized))
    .map((c) => c.original);

  // Characters from CIP that do NOT appear in document
  const charactersMissing = cipCharacters
    .filter((c) => !docNameSet.has(c.normalized))
    .map((c) => c.original);

  // Characters in document that are NOT in CIP
  const charactersAdded = documentNames
    .filter((n) => !cipNameSet.has(normalizeName(n)))
    .slice(0, 20); // Limit to prevent noise

  // Fact Fidelity: what % of CIP characters are present in document
  let factFidelity: number | null = null;
  if (cipCharacters.length > 0) {
    const present = cipCharacters.filter((c) => docNameSet.has(c.normalized)).length;
    factFidelity = Math.round((present / cipCharacters.length) * 100);
  }

  return {
    available: true,
    characters_present: charactersPresent,
    characters_missing: charactersMissing,
    characters_added: charactersAdded,
    fact_fidelity: factFidelity,
  };
}
