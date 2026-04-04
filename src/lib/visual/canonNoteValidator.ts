/**
 * canonNoteValidator — Validates user-provided regeneration notes against
 * project canon to detect conflicts before generation.
 *
 * Classification: SAFE | SOFT_CONFLICT | HARD_CONFLICT
 *
 * Deterministic, no AI, no scoring. Pattern-based conflict detection.
 */

export type ConflictLevel = 'safe' | 'soft_conflict' | 'hard_conflict';

export interface NoteValidationResult {
  level: ConflictLevel;
  reasons: string[];
  /** Cleaned note text (strips obvious injection attempts) */
  sanitizedNote: string;
}

// ── Hard conflict patterns ──
// These directly contradict canon truth categories

interface CanonTruth {
  era?: string;
  setting?: string;
  worldRules?: string[];
  toneStyle?: string;
  forbiddenElements?: string[];
  locations?: string[];
  characters?: Array<{ name: string; role?: string }>;
}

// Era contradiction: user asks for modern in a period piece, etc.
const ERA_KEYWORDS: Record<string, string[]> = {
  modern: ['modern', 'contemporary', 'futuristic', 'sci-fi', 'cyberpunk', 'neon', 'skyscraper', 'smartphone', 'computer', 'car'],
  historical: ['medieval', 'feudal', 'ancient', 'victorian', 'edo', 'samurai', 'renaissance'],
  fantasy: ['magic', 'dragon', 'spell', 'enchanted', 'mystical', 'supernatural'],
};

// Character injection: user tries to inject characters into world-only slots
const CHARACTER_INJECTION_PATTERNS = [
  /\b(add|include|show|feature|depict)\s+(a\s+)?(character|person|figure|people|protagonist|actor)/i,
  /\b(hana|kenji|protagonist|hero|heroine)\s+(should|must|needs?\s+to)\s+(appear|be\s+shown|be\s+visible)/i,
];

// Canon override attempts
const CANON_OVERRIDE_PATTERNS = [
  /\b(ignore|disregard|forget|override)\s+(canon|rules|constraints|style|world)/i,
  /\b(change|alter|modify)\s+(the\s+)?(era|period|setting|world)\b/i,
];

/**
 * Validate a user note against project canon before regeneration.
 */
export function validateNoteAgainstCanon(
  note: string,
  canon: Record<string, unknown>,
  _slotDomain?: string,
): NoteValidationResult {
  if (!note || !note.trim()) {
    return { level: 'safe', reasons: [], sanitizedNote: '' };
  }

  const sanitized = note.trim().slice(0, 500); // Cap length
  const lower = sanitized.toLowerCase();
  const reasons: string[] = [];
  let level: ConflictLevel = 'safe';

  const truth = extractCanonTruth(canon);

  // ── Hard conflict checks ──

  // 1. Canon override attempts
  for (const pattern of CANON_OVERRIDE_PATTERNS) {
    if (pattern.test(lower)) {
      reasons.push('Note attempts to override canon rules');
      level = 'hard_conflict';
    }
  }

  // 2. Character injection into world slots
  for (const pattern of CHARACTER_INJECTION_PATTERNS) {
    if (pattern.test(lower)) {
      reasons.push('Note injects characters into environment-only generation');
      level = 'hard_conflict';
    }
  }

  // 3. Era contradiction
  if (truth.era) {
    const eraLower = truth.era.toLowerCase();
    const isHistorical = Object.entries(ERA_KEYWORDS.historical).some(([, _]) =>
      ERA_KEYWORDS.historical.some(kw => eraLower.includes(kw)),
    ) || /\b(1[0-9]{3}|edo|meiji|feudal|medieval|ancient)\b/i.test(eraLower);

    if (isHistorical) {
      const modernTerms = ERA_KEYWORDS.modern.filter(t => lower.includes(t));
      if (modernTerms.length > 0) {
        reasons.push(`Note requests modern elements ("${modernTerms.join('", "')}") in a ${truth.era} setting`);
        level = 'hard_conflict';
      }
    }

    const isModern = ERA_KEYWORDS.modern.some(kw => eraLower.includes(kw));
    if (isModern) {
      const historicalTerms = ERA_KEYWORDS.historical.filter(t => lower.includes(t));
      if (historicalTerms.length > 0) {
        reasons.push(`Note requests historical elements ("${historicalTerms.join('", "')}") in a ${truth.era} setting`);
        level = 'hard_conflict';
      }
    }
  }

  // 4. Forbidden element inclusion
  if (truth.forbiddenElements && truth.forbiddenElements.length > 0) {
    for (const forbidden of truth.forbiddenElements) {
      if (lower.includes(forbidden.toLowerCase())) {
        reasons.push(`Note includes forbidden element: "${forbidden}"`);
        level = 'hard_conflict';
      }
    }
  }

  // ── Soft conflict checks (only if not already hard) ──
  if (level !== 'hard_conflict') {
    // 5. Tone shift
    if (truth.toneStyle) {
      const toneLower = truth.toneStyle.toLowerCase();
      const toneConflicts: Array<[string[], string]> = [
        [['comedic', 'funny', 'humorous', 'silly', 'cartoonish'], 'dramatic/serious'],
        [['dark', 'gritty', 'violent', 'horror'], 'light/uplifting'],
        [['bright', 'cheerful', 'vibrant', 'colorful'], 'somber/dark'],
      ];

      for (const [noteTerms, conflictWith] of toneConflicts) {
        const matchedNoteTerms = noteTerms.filter(t => lower.includes(t));
        if (matchedNoteTerms.length > 0) {
          // Check if the conflictWith direction matches the canon tone
          const conflictKeywords = conflictWith.split('/');
          if (conflictKeywords.some(ck => toneLower.includes(ck))) {
            reasons.push(`Note shifts tone ("${matchedNoteTerms.join('", "')}") away from project tone`);
            level = 'soft_conflict';
          }
        }
      }
    }

    // 6. Fantasy elements in realistic setting
    if (truth.setting && !truth.setting.toLowerCase().includes('fantasy') && !truth.setting.toLowerCase().includes('magic')) {
      const fantasyTerms = ERA_KEYWORDS.fantasy.filter(t => lower.includes(t));
      if (fantasyTerms.length > 0) {
        reasons.push(`Note introduces fantasy elements ("${fantasyTerms.join('", "')}") in a non-fantasy setting`);
        level = 'soft_conflict';
      }
    }
  }

  return { level, reasons, sanitizedNote: sanitized };
}

function extractCanonTruth(canon: Record<string, unknown>): CanonTruth {
  return {
    era: (typeof canon.era === 'string' ? canon.era
      : typeof canon.period === 'string' ? canon.period
      : typeof canon.time_period === 'string' ? canon.time_period
      : undefined),
    setting: typeof canon.setting === 'string' ? canon.setting : undefined,
    worldRules: Array.isArray(canon.world_rules)
      ? canon.world_rules.filter((r: unknown) => typeof r === 'string') as string[]
      : undefined,
    toneStyle: typeof canon.tone_style === 'string' ? canon.tone_style : undefined,
    forbiddenElements: typeof canon.forbidden_changes === 'string'
      ? canon.forbidden_changes.split(',').map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(canon.forbidden_changes)
      ? (canon.forbidden_changes as string[])
      : undefined,
    locations: typeof canon.locations === 'string' ? [canon.locations] : undefined,
    characters: Array.isArray(canon.characters)
      ? (canon.characters as Array<{ name: string; role?: string }>)
      : undefined,
  };
}
