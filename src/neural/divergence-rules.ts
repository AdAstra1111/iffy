// ═══════════════════════════════════════════════════════════════
// IFFY Neural Validation — Divergence Rule Database
// THE REAL MOAT. These rules compound with every beat validated.
// ═══════════════════════════════════════════════════════════════

import { DivergenceRule } from './types';

/**
 * The divergence rule database.
 *
 * Core principle:
 *   WHEN divergence X occurs,
 *   elite storytellers tend to apply correction Y.
 *
 * Each rule captures one such observation.
 * Rules start as 'hypothesis' and graduate through observation/validation/replication.
 */
export const DIVERGENCE_RULES: DivergenceRule[] = [
  {
    id: 'dr-001',
    signature: 'pfc-overload',
    name: 'Cognitive Overload Correction',
    description: 'When PFC is elevated, the audience is thinking instead of feeling. The text is too analytical, expository, or informationally dense.',
    neural_pattern: 'PFC > +0.05, Amygdala < +0.00, Insula flat',
    correction_principle: 'Remove explanation. Increase implication. Trust the audience to infer.',
    example_corrections: [
      'Replace "His son\'s safety binds him" with a physical action that shows the constraint',
      'Remove one sentence of exposition per paragraph',
      'Let a silence or a pause carry the meaning instead of dialogue',
    ],
    domain: ['exposition', 'dialogue', 'action-line'],
    source: 'sebastian',
    verification_status: 'observed',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['beat-7', 'yet-i-act1', 'proven-in-comparison'],
  },
  {
    id: 'dr-002',
    signature: 'tpj-weak',
    name: 'Character Connection Deficiency',
    description: 'When TPJ is low, the audience has not formed a theory-of-mind connection with the character. They observe the character but do not feel with them.',
    neural_pattern: 'TPJ < +0.01, Amygdala moderate, PFC moderate',
    correction_principle: 'Create a readable character choice. Expose vulnerability. Let the audience infer an internal state from external behaviour.',
    example_corrections: [
      'Give the character a small action that reveals their emotional state (hand trembling, looking away, not touching something)',
      'Create an asymmetry — character knows something the audience doesn\'t, or vice versa',
      'Remove the character\'s reaction line and let a physical detail carry the emotion',
    ],
    domain: ['character-choice', 'action-line', 'performance'],
    source: 'sebastian',
    verification_status: 'observed',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['beat-7', 'character-fingerprint'],
  },
  {
    id: 'dr-003',
    signature: 'insula-absent',
    name: 'Visceral Response Deficiency',
    description: 'When Insula is flat, the audience understands the emotion intellectually but does not feel it in their body. The scene lacks sensory grounding.',
    neural_pattern: 'Insula < +0.02, PFC moderate, Amygdala variable',
    correction_principle: 'Add sensory grounding. Temperature, texture, weight, sound, smell. Let the body feel what the mind is processing.',
    example_corrections: [
      'Describe a physical sensation the character experiences but does not comment on',
      'Ground the scene in a sensory detail — cold glass, rough fabric, distant sound',
      'Let the camera (or action line) linger on a physical detail before cutting to reaction',
    ],
    domain: ['sensory-detail', 'action-line'],
    source: 'sebastian',
    verification_status: 'observed',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['sensory-craft', 'embodiment'],
  },
  {
    id: 'dr-004',
    signature: 'amygdala-fatigue',
    name: 'Emotional Exhaustion Correction',
    description: 'When high-Amygdala beats are sequenced without recovery, the audience becomes numb. Each subsequent intense beat produces a weaker response.',
    neural_pattern: 'Amygdala sustained > +0.05 across 3+ consecutive beats with no recovery interval',
    correction_principle: 'Insert a recovery beat before the next intense beat. Give the audience room to breathe and process.',
    example_corrections: [
      'Insert a quiet observation beat between two intense emotional beats',
      'Use symbolic stillness — a wide shot, a silent moment, a landscape — to reset the emotional baseline',
      'Let a minor character provide a moment of relief or contrast before escalating again',
    ],
    domain: ['pacing', 'recovery-beat'],
    source: 'red',
    verification_status: 'hypothesis',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['contrast-theory', 'pacing'],
  },
  {
    id: 'dr-005',
    signature: 'dmn-flat',
    name: 'Narrative Absorption Deficiency',
    description: 'When DMN is flat, the audience is not absorbed in the story. They remain at a critical distance, evaluating rather than experiencing.',
    neural_pattern: 'DMN < +0.01, PFC elevated, TPJ variable',
    correction_principle: 'Reinforce the thematic through-line. Increase emotional continuity. Reduce structural awareness.',
    example_corrections: [
      'Connect this scene explicitly to the story\'s central thematic question',
      'Reduce scene headings or structural markers that remind the audience they are watching a constructed story',
      'Let a character\'s choice resonate with a previous beat, creating a sense of inevitability',
    ],
    domain: ['exposition', 'pacing'],
    source: 'red',
    verification_status: 'hypothesis',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['absorption', 'theme'],
  },
  {
    id: 'dr-006',
    signature: 'symbolic-accumulation-weak',
    name: 'Symbolic Payoff Enhancement',
    description: 'When a symbol reappears but does not produce amplified neural response, the audience has not tracked its accumulated meaning.',
    neural_pattern: 'TPJ + Amygdala for symbol reappearance is not significantly higher than first appearance',
    correction_principle: 'Change the emotional context of the symbol. Re-present it under altered circumstances so the audience feels its meaning has shifted.',
    example_corrections: [
      'Show the same object in a completely different emotional context on each reappearance',
      'Let a character interact with the symbol differently each time — first with hope, then with dread',
      'Increase the camera\'s attention to the symbol with each recurrence (wider → tighter)',
    ],
    domain: ['symbol-placement', 'camera'],
    source: 'red',
    verification_status: 'hypothesis',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['symbolism', 'accumulation'],
  },
  {
    id: 'dr-007',
    signature: 'character-drift',
    name: 'Character Neural Trajectory Drift',
    description: 'When a character\'s neural fingerprint changes without intentional dramatic reason, the audience\'s relationship to them is destabilized.',
    neural_pattern: 'Character X: TPJ drops > 0.03 from previous scene, or Amygdala shifts > 0.04 without narrative cause',
    correction_principle: 'Re-align the scene\'s treatment of the character with their established neural trajectory, or make the shift intentional and visible.',
    example_corrections: [
      'Add a moment that re-establishes the audience\'s relationship with the character before the shift',
      'If the shift IS intentional (betrayal, revelation), make sure the character\'s behaviour is the cause, not the writing',
      'Remove dialogue that contradicts the character\'s established voice without narrative justification',
    ],
    domain: ['dialogue', 'character-choice'],
    source: 'sebastian',
    verification_status: 'hypothesis',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['character-fingerprint', 'consistency'],
  },
  {
    id: 'dr-008',
    signature: 'contrast-absent',
    name: 'Emotional Contrast Deficiency',
    description: 'When beats with similar neural profiles are adjacent, contrast is lost and emotional impact diminishes regardless of absolute values.',
    neural_pattern: 'Adjacent beats have < 10% variance across all ROIs',
    correction_principle: 'Introduce variance. Change at least one ROI trajectory between adjacent beats. Silence after noise, intimacy after spectacle.',
    example_corrections: [
      'Insert a quiet beat between two loud beats',
      'Change the sensory register — from visual to auditory, from dialogue to silence',
      'Shift perspective — from wide to close, from the protagonist\'s POV to an observer\'s',
    ],
    domain: ['pacing', 'camera', 'silence'],
    source: 'red',
    verification_status: 'hypothesis',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['contrast-theory', 'pacing', 'trajectory'],
  },
  {
    id: 'dr-009',
    signature: 'tone-mismatch',
    name: 'Tonal Register Correction',
    description: 'When the tone of a scene conflicts with the audience\'s expected tonal register, cognitive dissonance reduces absorption even if individual ROIs look good.',
    neural_pattern: 'PFC elevated, DMN suppressed, TPJ moderate — audience is "figuring out" the tone rather than experiencing it',
    correction_principle: 'Establish or re-establish the tonal register early. If the shift is intentional (dramatic irony, genre subversion), make it legible.',
    example_corrections: [
      'Add an establishing moment that signals the tonal register before the scene\'s emotional payload',
      'If shifting tone, do it through action not explanation — let the audience discover the shift',
      'Remove tonal ambiguity unless it serves the thematic purpose',
    ],
    domain: ['exposition', 'performance', 'pacing'],
    source: 'sebastian',
    verification_status: 'hypothesis',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['tone', 'genre-mode'],
  },
  {
    id: 'dr-010',
    signature: 'thematic-drift',
    name: 'Thematic Coherence Restoration',
    description: 'When a beat\'s neural profile is strong but serves a different theme than intended, the audience feels something powerful — but the wrong thing.',
    neural_pattern: 'Strong activation (Amygdala + Insula + TPJ consistent) but DMN activation pattern does not match the intended thematic destination',
    correction_principle: 'Reframe the beat to connect its emotional payload to the story\'s central thematic question. Make the feeling about the right thing.',
    example_corrections: [
      'Change what the character is reacting to — not the surface threat but what it MEANS',
      'Add a single line that redirects the audience\'s interpretation of the emotional event',
      'Use the symbol system — let an object carry the thematic connection so the audience feels it rather than having it explained',
    ],
    domain: ['dialogue', 'symbol-placement', 'character-choice'],
    source: 'sebastian',
    verification_status: 'hypothesis',
    created_at: '2026-05-21T00:00:00Z',
    tags: ['theme', 'coherence', 'through-lines'],
  },
];

/**
 * Match divergence flags to rules in the database.
 */
export function matchDivergenceRules(signatures: string[]): DivergenceRule[] {
  return DIVERGENCE_RULES.filter(rule =>
    signatures.some(sig => sig === rule.signature)
  );
}

/**
 * Get rules by verification status.
 */
export function getRulesByStatus(status: DivergenceRule['verification_status']): DivergenceRule[] {
  return DIVERGENCE_RULES.filter(rule => rule.verification_status === status);
}

/**
 * Get all rules that have been at least observed (not pure hypothesis).
 */
export function getTrustedRules(): DivergenceRule[] {
  return DIVERGENCE_RULES.filter(rule => rule.verification_status !== 'hypothesis');
}

export default DIVERGENCE_RULES;
