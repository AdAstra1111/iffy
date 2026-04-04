/**
 * characterDatasetBuilder — Builds structured Character Visual Datasets
 * from existing canon, DNA, and actor data.
 *
 * Supports reverse-engineering from current projects and forward-generation.
 * Cross-product, not tuned to any single project.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface CharacterRoleLayer {
  primary: string[];
  secondary: string[];
  notes: string;
}

export interface CharacterSlotData {
  primary_truths: string[];
  secondary_truths: string[];
  contextual: string[];
  forbidden_drift: string[];
  hard_negatives: string[];
  notes: string;
}

export interface CharacterVisualDatasetDraft {
  canonical_name: string;
  canonical_character_id: string | null;
  ai_actor_id: string | null;

  identity_type: string;
  age_band: string;
  sex_gender_presentation: string;
  ethnicity_ancestry_expression: string;
  cultural_context: string;
  beauty_mode: string;
  casting_labels: string[];
  reusable_scope: string;

  // Truth model
  identity_core: CharacterRoleLayer;
  proportion_silhouette: CharacterRoleLayer;
  surface_identity: CharacterRoleLayer;
  presence_behavior: CharacterRoleLayer;
  lighting_response: CharacterRoleLayer;
  styling_affinity: CharacterRoleLayer;
  narrative_read: CharacterRoleLayer;

  // Control model
  identity_invariants: { invariants: string[]; notes: string };
  allowed_variation: { variations: string[]; notes: string };
  forbidden_drift: { forbidden: string[]; notes: string };
  anti_confusion: { confusable_with: string[]; differentiators: string[]; notes: string };
  validation_requirements: { required_slots: string[]; min_coherence_score: number; notes: string };

  // Slot blocks
  slot_portrait: CharacterSlotData;
  slot_profile: CharacterSlotData;
  slot_three_quarter: CharacterSlotData;
  slot_full_body: CharacterSlotData;
  slot_expression: CharacterSlotData;
  slot_lighting_response: CharacterSlotData;

  completeness_score: number;
  provenance: Record<string, string>;
}

// ── Extraction Helpers ───────────────────────────────────────────────────────

const AGE_PATTERNS: Array<{ band: string; keywords: string[] }> = [
  { band: 'child', keywords: ['child', 'young girl', 'young boy', 'kid', 'infant'] },
  { band: 'teen', keywords: ['teen', 'adolescent', 'teenage', 'youth'] },
  { band: 'young_adult', keywords: ['young woman', 'young man', 'early twenties', 'mid-twenties', 'late twenties'] },
  { band: 'adult', keywords: ['adult', 'thirties', 'forties', 'middle-aged', 'mature'] },
  { band: 'elder', keywords: ['elder', 'elderly', 'old', 'aged', 'senior', 'ancient', 'grey-haired'] },
];

const GENDER_PATTERNS: Array<{ presentation: string; keywords: string[] }> = [
  { presentation: 'masculine', keywords: ['man', 'male', 'he', 'his', 'lord', 'king', 'prince', 'samurai', 'warrior'] },
  { presentation: 'feminine', keywords: ['woman', 'female', 'she', 'her', 'lady', 'queen', 'princess', 'maiden'] },
  { presentation: 'androgynous', keywords: ['androgynous', 'ambiguous', 'fluid'] },
];

const PRESENCE_TERMS = [
  'commanding', 'gentle', 'fierce', 'quiet', 'imposing', 'delicate', 'stoic',
  'warm', 'cold', 'intense', 'serene', 'nervous', 'confident', 'graceful',
  'heavy', 'nimble', 'measured', 'restless', 'still', 'watchful', 'magnetic',
];

const SILHOUETTE_TERMS = [
  'tall', 'short', 'slender', 'broad', 'muscular', 'lean', 'stocky', 'petite',
  'angular', 'rounded', 'wiry', 'athletic', 'compact', 'lanky', 'sturdy',
];

function extractTerms(text: string, termList: string[]): string[] {
  const lower = text.toLowerCase();
  return termList.filter(t => lower.includes(t));
}

function detectAgeBand(text: string): string {
  const lower = text.toLowerCase();
  for (const { band, keywords } of AGE_PATTERNS) {
    if (keywords.some(k => lower.includes(k))) return band;
  }
  return 'adult';
}

function detectGender(text: string): string {
  const lower = text.toLowerCase();
  for (const { presentation, keywords } of GENDER_PATTERNS) {
    if (keywords.some(k => lower.includes(k))) return presentation;
  }
  return 'unspecified';
}

// ── Main Builder ─────────────────────────────────────────────────────────────

export function buildCharacterVisualDataset(
  characterName: string,
  canonCharacter: Record<string, unknown> | null,
  canonJson: Record<string, unknown> | null,
  dnaRow: {
    visual_prompt_block?: string;
    traits_json?: unknown;
    identity_signature?: unknown;
  } | null,
  actor: {
    id?: string;
    description?: string;
    negative_prompt?: string;
    tags?: string[];
    recipe_json?: Record<string, unknown>;
  } | null,
): CharacterVisualDatasetDraft {
  const traits = String(canonCharacter?.traits || '');
  const role = String(canonCharacter?.role || '');
  const desc = String(canonCharacter?.description || actor?.description || '');
  const combined = `${characterName} ${traits} ${role} ${desc}`;
  const dnaBlock = String(dnaRow?.visual_prompt_block || '');
  const fullText = `${combined} ${dnaBlock}`;

  const ageBand = detectAgeBand(fullText);
  const genderPresentation = detectGender(fullText);
  const presenceTerms = extractTerms(fullText, PRESENCE_TERMS);
  const silhouetteTerms = extractTerms(fullText, SILHOUETTE_TERMS);

  // Extract identity core from DNA + canon
  const identityTraits: string[] = [];
  if (dnaRow?.traits_json) {
    const tj = typeof dnaRow.traits_json === 'string' ? JSON.parse(dnaRow.traits_json) : dnaRow.traits_json;
    if (Array.isArray(tj)) {
      for (const t of tj) {
        if (t?.label) identityTraits.push(String(t.label));
      }
    }
  }

  // Extract invariants from actor recipe
  const recipeInvariants: string[] = [];
  const recipeVariations: string[] = [];
  if (actor?.recipe_json) {
    if (Array.isArray(actor.recipe_json.invariants)) {
      recipeInvariants.push(...actor.recipe_json.invariants.map(String));
    }
    if (Array.isArray(actor.recipe_json.allowed_variations)) {
      recipeVariations.push(...actor.recipe_json.allowed_variations.map(String));
    }
  }

  // Parse negative prompt for forbidden drift
  const forbiddenDrift: string[] = [];
  if (actor?.negative_prompt) {
    forbiddenDrift.push(...actor.negative_prompt.split(',').map(s => s.trim()).filter(Boolean));
  }

  // Identity signature for surface identity
  let surfaceTraits: string[] = [];
  if (dnaRow?.identity_signature) {
    const sig = typeof dnaRow.identity_signature === 'string'
      ? JSON.parse(dnaRow.identity_signature) : dnaRow.identity_signature;
    if (sig?.face) surfaceTraits.push(`Face: ${sig.face}`);
    if (sig?.body) surfaceTraits.push(`Body: ${sig.body}`);
    if (sig?.silhouette) surfaceTraits.push(`Silhouette: ${sig.silhouette}`);
    if (sig?.wardrobe) surfaceTraits.push(`Wardrobe: ${sig.wardrobe}`);
  }

  // Build role layers
  const identity_core: CharacterRoleLayer = {
    primary: identityTraits.length > 0 ? identityTraits.slice(0, 8) : [characterName],
    secondary: [role, ageBand, genderPresentation].filter(Boolean),
    notes: dnaBlock.slice(0, 200),
  };

  const proportion_silhouette: CharacterRoleLayer = {
    primary: silhouetteTerms.length > 0 ? silhouetteTerms : ['standard proportions'],
    secondary: [],
    notes: '',
  };

  const surface_identity: CharacterRoleLayer = {
    primary: surfaceTraits.length > 0 ? surfaceTraits : ['identity from DNA/anchors'],
    secondary: identityTraits.filter(t =>
      ['hair', 'eye', 'skin', 'scar', 'tattoo', 'mark'].some(k => t.toLowerCase().includes(k))
    ),
    notes: '',
  };

  const presence_behavior: CharacterRoleLayer = {
    primary: presenceTerms.length > 0 ? presenceTerms.slice(0, 4) : ['neutral presence'],
    secondary: presenceTerms.slice(4),
    notes: '',
  };

  const lighting_response_layer: CharacterRoleLayer = {
    primary: ['responds to scene lighting'],
    secondary: extractTerms(fullText, ['warm skin', 'cool tone', 'high contrast', 'soft diffusion']),
    notes: '',
  };

  const styling_affinity: CharacterRoleLayer = {
    primary: extractTerms(fullText, [
      'traditional', 'modern', 'military', 'formal', 'casual', 'ceremonial',
      'work clothes', 'armor', 'silk', 'linen', 'cotton', 'leather',
    ]),
    secondary: [],
    notes: '',
  };

  const narrative_read: CharacterRoleLayer = {
    primary: [role].filter(Boolean),
    secondary: extractTerms(fullText, ['protagonist', 'antagonist', 'mentor', 'ally', 'rival', 'mysterious']),
    notes: '',
  };

  // Build control model
  const identity_invariants_block = {
    invariants: recipeInvariants.length > 0 ? recipeInvariants : identityTraits.slice(0, 5),
    notes: 'Must remain consistent across all generations',
  };

  const allowed_variation_block = {
    variations: recipeVariations.length > 0 ? recipeVariations : ['expression', 'lighting angle', 'camera distance'],
    notes: '',
  };

  const forbidden_drift_block = {
    forbidden: forbiddenDrift.length > 0 ? forbiddenDrift : ['age drift', 'gender drift', 'ethnicity drift'],
    notes: '',
  };

  const anti_confusion_block = {
    confusable_with: [] as string[],
    differentiators: identityTraits.slice(0, 3),
    notes: '',
  };

  const validation_requirements_block = {
    required_slots: ['portrait', 'full_body'],
    min_coherence_score: 0.7,
    notes: '',
  };

  // Build slot blocks
  const commonForbidden = ['wrong identity', 'age drift', 'gender swap', 'wrong ethnicity'];
  const commonNegatives = ['deformed', 'blurry', 'low quality', 'watermark', 'text', ...forbiddenDrift.slice(0, 5)];

  const slot_portrait: CharacterSlotData = {
    primary_truths: ['close-up face', 'clear facial features', 'identity-establishing'],
    secondary_truths: identityTraits.filter(t => ['hair', 'eye', 'face', 'scar'].some(k => t.toLowerCase().includes(k))),
    contextual: presenceTerms.slice(0, 2),
    forbidden_drift: commonForbidden,
    hard_negatives: [...commonNegatives, 'full body', 'wide shot'],
    notes: 'Primary identity anchor shot',
  };

  const slot_profile: CharacterSlotData = {
    primary_truths: ['side profile view', 'clear silhouette', 'jaw/nose line'],
    secondary_truths: surfaceTraits.filter(s => s.includes('Face') || s.includes('Silhouette')),
    contextual: [],
    forbidden_drift: commonForbidden,
    hard_negatives: [...commonNegatives, 'frontal', 'full body'],
    notes: 'Profile silhouette anchor',
  };

  const slot_three_quarter: CharacterSlotData = {
    primary_truths: ['three-quarter angle', 'dimensional face read', 'upper body visible'],
    secondary_truths: identityTraits.slice(0, 3),
    contextual: presenceTerms.slice(0, 2),
    forbidden_drift: commonForbidden,
    hard_negatives: [...commonNegatives, 'full body', 'extreme close-up'],
    notes: 'Bridges portrait and full-body identity',
  };

  const slot_full_body: CharacterSlotData = {
    primary_truths: ['full body visible', 'proportions clear', 'posture/stance visible'],
    secondary_truths: [...silhouetteTerms, ...styling_affinity.primary.slice(0, 3)],
    contextual: presenceTerms.slice(0, 2),
    forbidden_drift: commonForbidden,
    hard_negatives: [...commonNegatives, 'close-up', 'head only'],
    notes: 'Full body identity anchor',
  };

  const slot_expression: CharacterSlotData = {
    primary_truths: ['emotional expression visible', 'facial acting', 'character emotion'],
    secondary_truths: presenceTerms.slice(0, 4),
    contextual: ['scene-appropriate emotion'],
    forbidden_drift: [...commonForbidden, 'neutral-only lock'],
    hard_negatives: [...commonNegatives, 'expressionless'],
    notes: 'Expression range testing',
  };

  const slot_lighting_response_data: CharacterSlotData = {
    primary_truths: ['lighting interaction', 'skin/surface response to light', 'tonal range'],
    secondary_truths: lighting_response_layer.secondary,
    contextual: ['scene lighting context'],
    forbidden_drift: commonForbidden,
    hard_negatives: [...commonNegatives, 'flat lighting only'],
    notes: 'Tests identity stability under lighting variation',
  };

  // Completeness scoring
  const checks = [
    identityTraits.length > 0,
    silhouetteTerms.length > 0,
    presenceTerms.length > 0,
    surfaceTraits.length > 0,
    !!role,
    ageBand !== 'adult' || fullText.toLowerCase().includes('adult'),
    genderPresentation !== 'unspecified',
    styling_affinity.primary.length > 0,
    recipeInvariants.length > 0 || identityTraits.length > 3,
    dnaBlock.length > 10,
  ];
  const score = checks.filter(Boolean).length / checks.length;

  return {
    canonical_name: characterName,
    canonical_character_id: canonCharacter?.id ? String(canonCharacter.id) : null,
    ai_actor_id: actor?.id || null,

    identity_type: 'character',
    age_band: ageBand,
    sex_gender_presentation: genderPresentation,
    ethnicity_ancestry_expression: '',
    cultural_context: String(canonJson?.setting || ''),
    beauty_mode: 'natural',
    casting_labels: actor?.tags || [],
    reusable_scope: actor?.id ? 'cross_project' : 'project',

    identity_core,
    proportion_silhouette,
    surface_identity,
    presence_behavior,
    lighting_response: lighting_response_layer,
    styling_affinity,
    narrative_read,

    identity_invariants: identity_invariants_block,
    allowed_variation: allowed_variation_block,
    forbidden_drift: forbidden_drift_block,
    anti_confusion: anti_confusion_block,
    validation_requirements: validation_requirements_block,

    slot_portrait,
    slot_profile,
    slot_three_quarter,
    slot_full_body,
    slot_expression,
    slot_lighting_response: slot_lighting_response_data,

    completeness_score: Math.round(score * 100) / 100,
    provenance: {
      source: 'reverse_engineered',
      character_name: characterName,
      has_dna: dnaRow ? 'yes' : 'no',
      has_actor: actor?.id ? 'yes' : 'no',
      has_canon: canonCharacter ? 'yes' : 'no',
      generated_at: new Date().toISOString(),
    },
  };
}
