/**
 * worldValidationMode.ts — Canonical World Validation Mode System
 *
 * Determines the allowed level of physical realism, stylization, symbolism,
 * and magical/impossible constructs for a project's visual generation.
 *
 * This is the shared upstream governance layer consumed by:
 * - motif validation
 * - environment generation
 * - costume generation (future)
 * - scene demo generation (future)
 *
 * Modes are derived deterministically from project canon (genre, tone, world_rules, format).
 * No vague freeform reasoning — explicit mapping logic only.
 */

// ── Mode Types ──────────────────────────────────────────────────────────────

export type WorldValidationModeName =
  | 'grounded_realism'
  | 'heightened_realism'
  | 'mythic_symbolic'
  | 'fantastical';

export interface WorldValidationRules {
  /** Whether literal magic (spells, glowing objects, supernatural forces) is allowed in visuals */
  allow_magic_literalism: boolean;
  /** Whether symbolic constructs (allegorical tableaux, abstract installations) are allowed */
  allow_symbolic_constructs: boolean;
  /** Whether impossible/non-physical materials can appear (floating stone, liquid metal, etc.) */
  allow_impossible_materials: boolean;
  /** Whether costume/silhouette exaggeration beyond physical possibility is allowed */
  allow_exaggerated_silhouette: boolean;
  /** Whether all depicted objects must be physically buildable by a production department */
  require_physical_buildability: boolean;
  /** Whether material surfaces must be visually identifiable (clay looks like clay) */
  require_material_legibility: boolean;
  /** Whether world physics must remain consistent (gravity, scale, perspective) */
  require_world_physics_consistency: boolean;
}

export interface WorldValidationMode {
  /** The resolved mode name */
  mode: WorldValidationModeName;
  /** Deterministic rule flags for this mode */
  rules: WorldValidationRules;
  /** How confident the derivation is */
  confidence: 'high' | 'medium' | 'low';
  /** What canon fields contributed to derivation */
  derived_from: string[];
  /** Human-readable explanation */
  rationale: string;
  /** Version for future-proofing */
  version: string;
}

// ── Mode Definitions ────────────────────────────────────────────────────────

const MODE_RULES: Record<WorldValidationModeName, WorldValidationRules> = {
  grounded_realism: {
    allow_magic_literalism: false,
    allow_symbolic_constructs: false,
    allow_impossible_materials: false,
    allow_exaggerated_silhouette: false,
    require_physical_buildability: true,
    require_material_legibility: true,
    require_world_physics_consistency: true,
  },
  heightened_realism: {
    allow_magic_literalism: false,
    allow_symbolic_constructs: false,
    allow_impossible_materials: false,
    allow_exaggerated_silhouette: true,
    require_physical_buildability: true,
    require_material_legibility: true,
    require_world_physics_consistency: true,
  },
  mythic_symbolic: {
    allow_magic_literalism: false,
    allow_symbolic_constructs: true,
    allow_impossible_materials: false,
    allow_exaggerated_silhouette: true,
    require_physical_buildability: true,
    require_material_legibility: true,
    require_world_physics_consistency: true,
  },
  fantastical: {
    allow_magic_literalism: true,
    allow_symbolic_constructs: true,
    allow_impossible_materials: true,
    allow_exaggerated_silhouette: true,
    require_physical_buildability: false,
    require_material_legibility: false,
    require_world_physics_consistency: false,
  },
};

// ── Genre/Tone Mapping Tables ───────────────────────────────────────────────

const GROUNDED_GENRES = [
  'drama', 'thriller', 'crime', 'noir', 'war', 'documentary', 'docudrama',
  'social realism', 'kitchen sink', 'neo-realism', 'biopic', 'courtroom',
  'procedural', 'political', 'espionage', 'medical', 'legal',
];

const HEIGHTENED_GENRES = [
  'romance', 'comedy', 'melodrama', 'musical', 'period', 'historical',
  'western', 'action', 'adventure', 'sports', 'coming-of-age',
  'romantic comedy', 'rom-com', 'satire', 'heist',
];

const MYTHIC_GENRES = [
  'mythology', 'mythic', 'folkloric', 'fable', 'legend', 'parable',
  'magical realism', 'gothic', 'dark fairy tale', 'fairy tale',
  'folklore', 'spiritual', 'sacred',
];

const FANTASTICAL_GENRES = [
  'fantasy', 'high fantasy', 'dark fantasy', 'sci-fi', 'science fiction',
  'superhero', 'space opera', 'cyberpunk', 'steampunk', 'dystopian',
  'post-apocalyptic', 'urban fantasy', 'sword and sorcery',
];

const GROUNDED_TONE_SIGNALS = [
  'gritty', 'realistic', 'raw', 'observational', 'naturalistic',
  'understated', 'documentary-like', 'grounded', 'intimate', 'tactile',
  'austere', 'unflinching', 'restrained', 'minimalist',
];

const HEIGHTENED_TONE_SIGNALS = [
  'heightened', 'stylish', 'theatrical', 'operatic', 'lush', 'grand',
  'sweeping', 'passionate', 'exuberant', 'vibrant', 'bold',
  'melodramatic', 'extravagant', 'sensual', 'romantic',
];

const MYTHIC_TONE_SIGNALS = [
  'mythic', 'folkloric', 'legendary', 'sacred', 'ritualistic',
  'ceremonial', 'spiritual', 'timeless', 'archetypal', 'parabolic',
];

const FANTASTICAL_TONE_SIGNALS = [
  'magical', 'supernatural', 'otherworldly', 'ethereal', 'fantastical',
  'cosmic', 'dreamlike', 'surreal', 'transcendent', 'enchanted',
];

// ── World Rules Signals ─────────────────────────────────────────────────────

const MAGIC_WORLD_SIGNALS = [
  'magic', 'spell', 'enchant', 'supernatural', 'wizard', 'sorcerer',
  'demon', 'spirit world', 'mystical force', 'arcane', 'witchcraft',
  'dragon', 'elf', 'orc', 'dwarf', 'shapeshifter',
];

const GROUNDED_WORLD_SIGNALS = [
  'real world', 'contemporary', 'modern day', 'historical',
  'based on true', 'period accurate', 'no supernatural',
  'strict hierarchy', 'feudal', 'colonial', 'industrial',
];

// ── Derivation Engine ───────────────────────────────────────────────────────

export interface WorldValidationInput {
  genres?: string[];
  tone_style?: string;
  world_rules?: string;
  format?: string;
  logline?: string;
  premise?: string;
  setting?: string;
}

/**
 * Deterministically derive the World Validation Mode from project canon.
 * Uses explicit mapping logic — no vague freeform reasoning.
 */
export function resolveWorldValidationMode(
  input: WorldValidationInput,
  explicitOverride?: WorldValidationModeName,
): WorldValidationMode {
  if (explicitOverride) {
    return buildMode(explicitOverride, 'high', ['explicit_override'], `Explicit override to ${explicitOverride}`);
  }

  const derived_from: string[] = [];
  const scores: Record<WorldValidationModeName, number> = {
    grounded_realism: 0,
    heightened_realism: 0,
    mythic_symbolic: 0,
    fantastical: 0,
  };

  // 1. Genre signals (strongest signal)
  const genres = (input.genres || []).map(g => g.toLowerCase());
  if (genres.length > 0) {
    derived_from.push('genres');
    for (const g of genres) {
      if (FANTASTICAL_GENRES.some(fg => g.includes(fg))) scores.fantastical += 30;
      if (MYTHIC_GENRES.some(mg => g.includes(mg))) scores.mythic_symbolic += 25;
      if (HEIGHTENED_GENRES.some(hg => g.includes(hg))) scores.heightened_realism += 20;
      if (GROUNDED_GENRES.some(gg => g.includes(gg))) scores.grounded_realism += 25;
    }
  }

  // 2. Tone signals
  const tone = (input.tone_style || '').toLowerCase();
  if (tone) {
    derived_from.push('tone_style');
    if (FANTASTICAL_TONE_SIGNALS.some(s => tone.includes(s))) scores.fantastical += 15;
    if (MYTHIC_TONE_SIGNALS.some(s => tone.includes(s))) scores.mythic_symbolic += 15;
    if (HEIGHTENED_TONE_SIGNALS.some(s => tone.includes(s))) scores.heightened_realism += 12;
    if (GROUNDED_TONE_SIGNALS.some(s => tone.includes(s))) scores.grounded_realism += 15;
  }

  // 3. World rules (direct magic/realism signals)
  const worldRules = (input.world_rules || '').toLowerCase();
  if (worldRules) {
    derived_from.push('world_rules');
    if (MAGIC_WORLD_SIGNALS.some(s => worldRules.includes(s))) scores.fantastical += 20;
    if (GROUNDED_WORLD_SIGNALS.some(s => worldRules.includes(s))) scores.grounded_realism += 15;
  }

  // 4. Premise / logline (secondary signals)
  const combined = `${(input.logline || '')} ${(input.premise || '')} ${(input.setting || '')}`.toLowerCase();
  if (combined.trim()) {
    if (MAGIC_WORLD_SIGNALS.some(s => combined.includes(s))) {
      scores.fantastical += 10;
      derived_from.push('premise');
    }
  }

  // 5. Format-based adjustment
  const format = (input.format || '').toLowerCase();
  if (format) {
    derived_from.push('format');
    if (format.includes('animation') || format.includes('anim')) {
      scores.fantastical += 5;
      scores.heightened_realism += 5;
    }
    if (format.includes('documentary') || format.includes('doc')) {
      scores.grounded_realism += 15;
    }
  }

  // Resolve winner
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [winnerMode, winnerScore] = sorted[0];
  const [, runnerUpScore] = sorted[1];

  // Confidence based on margin
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (winnerScore >= 20 && winnerScore - runnerUpScore >= 10) confidence = 'high';
  else if (winnerScore >= 10) confidence = 'medium';

  // If no signal at all, default to heightened_realism (safe middle ground)
  if (winnerScore === 0) {
    return buildMode('heightened_realism', 'low', ['default'], 'No genre/tone/world signals found — defaulting to heightened realism');
  }

  const rationale = `Derived from ${derived_from.join(', ')}: ${winnerMode} scored ${winnerScore} (runner-up: ${runnerUpScore})`;
  return buildMode(winnerMode as WorldValidationModeName, confidence, derived_from, rationale);
}

function buildMode(
  mode: WorldValidationModeName,
  confidence: 'high' | 'medium' | 'low',
  derived_from: string[],
  rationale: string,
): WorldValidationMode {
  return {
    mode,
    rules: MODE_RULES[mode],
    confidence,
    derived_from,
    rationale,
    version: '1.0.0',
  };
}

// ── Prompt Block Formatters ─────────────────────────────────────────────────

/**
 * Format world validation mode into a prompt governance block.
 */
export function formatWorldValidationPromptBlock(wvm: WorldValidationMode): string {
  const lines: string[] = ['[WORLD VALIDATION MODE — MANDATORY]', `Mode: ${wvm.mode.replace(/_/g, ' ').toUpperCase()}`];

  if (wvm.rules.require_physical_buildability) {
    lines.push('All depicted objects and environments must be physically constructible by a real production department.');
  }
  if (wvm.rules.require_material_legibility) {
    lines.push('All materials must be visually identifiable — clay must look like clay, wood like wood.');
  }
  if (wvm.rules.require_world_physics_consistency) {
    lines.push('World physics must be consistent — gravity, scale, and perspective apply.');
  }
  if (!wvm.rules.allow_magic_literalism) {
    lines.push('DO NOT depict literal magic, supernatural forces, glowing enchantments, or impossible phenomena.');
  }
  if (!wvm.rules.allow_symbolic_constructs) {
    lines.push('DO NOT depict allegorical tableaux, abstract symbolic installations, or concept-art compositions.');
  }
  if (!wvm.rules.allow_impossible_materials) {
    lines.push('DO NOT depict impossible materials (floating stone, liquid metal, self-illuminating surfaces).');
  }
  if (!wvm.rules.allow_exaggerated_silhouette) {
    lines.push('Costume and object silhouettes must remain physically plausible.');
  }

  return lines.join('\n');
}

/**
 * Format world validation mode into negative prompt terms.
 */
export function getWorldValidationNegatives(wvm: WorldValidationMode): string {
  const negatives: string[] = [];

  if (!wvm.rules.allow_magic_literalism) {
    negatives.push('magical glow', 'supernatural light', 'enchanted objects', 'spellcasting');
  }
  if (!wvm.rules.allow_symbolic_constructs) {
    negatives.push('symbolic installation', 'abstract sculpture', 'allegorical tableau');
  }
  if (!wvm.rules.allow_impossible_materials) {
    negatives.push('floating objects', 'impossible geometry', 'self-illuminating materials');
  }
  if (!wvm.rules.allow_exaggerated_silhouette) {
    negatives.push('exaggerated proportions', 'impossible silhouette');
  }

  return negatives.join(', ');
}

// ── Rule Query Helpers ──────────────────────────────────────────────────────

/**
 * Check if a specific validation rule is active for the current mode.
 */
export function isRuleActive(wvm: WorldValidationMode, rule: keyof WorldValidationRules): boolean {
  return wvm.rules[rule] as boolean;
}

/**
 * Get human-readable summary of active constraints for UI display.
 */
export function getActiveConstraintsSummary(wvm: WorldValidationMode): string[] {
  const summary: string[] = [];
  const r = wvm.rules;

  if (r.require_physical_buildability) summary.push('Objects must be physically buildable');
  if (r.require_material_legibility) summary.push('Materials must be visually identifiable');
  if (r.require_world_physics_consistency) summary.push('World physics must be consistent');
  if (!r.allow_magic_literalism) summary.push('No literal magic or supernatural forces');
  if (!r.allow_symbolic_constructs) summary.push('No symbolic/abstract constructs');
  if (!r.allow_impossible_materials) summary.push('No impossible materials');
  if (!r.allow_exaggerated_silhouette) summary.push('No exaggerated silhouettes');

  // Permissions (for less restrictive modes)
  if (r.allow_magic_literalism) summary.push('Magic and supernatural forces allowed');
  if (r.allow_symbolic_constructs) summary.push('Symbolic constructs allowed');
  if (r.allow_impossible_materials) summary.push('Impossible materials allowed');

  return summary;
}

/**
 * Get the MODE_RULES constant for external inspection/testing.
 */
export function getModeRules(): Record<WorldValidationModeName, WorldValidationRules> {
  return { ...MODE_RULES };
}
