/**
 * sceneCostumeEvidence.ts — Scene/State-bound Costume Evidence Layer.
 *
 * Extracts explicit costume references from scene-level text and binds them
 * to specific scenes and characters. Feeds into the existing wardrobe pipeline
 * at Phase 3 (post-extraction resolution seam).
 *
 * PRECEDENCE (enforced by mergeSceneEvidenceIntoStateMatrix):
 * 1. Explicit scene/state costume fact
 * 2. Fixed character costume truth (from profile)
 * 3. World/time/culture/environment/class inference
 * 4. Gap-fill defaults
 *
 * This is NOT a separate wardrobe system. It is a feeder layer that enriches
 * the existing state matrix with scene-derived specificity.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SceneTextInput {
  scene_key: string;
  scene_number?: number;
  slugline?: string;
  content: string;
  characters_present?: string[];
}

export interface SceneCostumeFact {
  /** The raw text passage that contained the costume reference */
  passage: string;
  /** Character this fact applies to (normalized key) */
  character_key: string;
  /** Scene key this was found in */
  scene_key: string;
  scene_number?: number;
  /** What was found */
  garments: string[];
  fabrics: string[];
  accessories: string[];
  colors: string[];
  grooming: string[];
  /** Costume change signals (removing, putting on, changing into) */
  costume_change_signals: string[];
  /** Condition/state signals (torn, wet, bloody, pristine, etc.) */
  condition_signals: string[];
  /** Always 'explicit' — scene text is direct evidence */
  basis: 'explicit';
}

export interface SceneCostumeEvidenceResult {
  /** All extracted scene costume facts */
  facts: SceneCostumeFact[];
  /** Per-character scene-linked state overrides */
  character_scene_states: Record<string, SceneStateOverride[]>;
  /** Diagnostic summary */
  summary: {
    scenes_scanned: number;
    facts_found: number;
    characters_with_scene_evidence: string[];
    scenes_with_costume_facts: string[];
  };
}

export interface SceneStateOverride {
  scene_key: string;
  scene_number?: number;
  /** The wardrobe state this maps to (e.g. 'work', 'public_formal', 'distress_aftermath') */
  resolved_state_key: string;
  /** Human-readable label */
  label: string;
  /** Scene-specific garment overrides (take precedence over profile defaults) */
  garment_overrides: string[];
  /** Scene-specific fabric mentions */
  fabric_overrides: string[];
  /** Scene-specific accessory mentions */
  accessory_overrides: string[];
  /** Scene-specific grooming */
  grooming_overrides: string[];
  /** Condition signals for this scene */
  condition_signals: string[];
  /** The supporting passage */
  evidence_passage: string;
  basis: 'explicit';
}

// ── Patterns ─────────────────────────────────────────────────────────────────

const GARMENT_RE = /\b(robe|kimono|hakama|obi|haori|kosode|tunic|shirt|blouse|vest|jacket|coat|cloak|cape|shawl|sash|apron|skirt|trousers|pants|dress|gown|toga|sarong|caftan|tabard|doublet|bodice|corset|smock|uniform|armor|armour|boots|sandals|shoes|slippers|hat|cap|hood|veil|turban|scarf|wrap|belt|gloves|headwrap|suit|blazer|jeans|t-shirt|sweater|cardigan|hoodie|sneakers|heels|loafers|shorts|tank\s*top|polo|sleeves?)\b/gi;

const FABRIC_RE = /\b(silk|cotton|linen|hemp|wool|felt|leather|suede|fur|brocade|damask|satin|velvet|muslin|gauze|chiffon|canvas|burlap|tweed|homespun|undyed|indigo|woven|knitted|quilted|padded|denim|polyester|nylon|cashmere|jersey|fleece|khaki|chambray)\b/gi;

const ACCESSORY_RE = /\b(comb|hairpin|brooch|necklace|bracelet|ring|earring|pendant|amulet|talisman|fan|parasol|umbrella|pouch|bag|satchel|purse|wallet|dagger|sword|staff|cane|walking\s*stick|spectacles|glasses|watch|medal|badge|pin|token|seal|scroll|pipe|lantern|flask|waterskin|stole|handkerchief|sunglasses|backpack|briefcase|phone|laptop|headphones)\b/gi;

const COLOR_RE = /\b(red|blue|green|white|black|gold|silver|crimson|scarlet|ivory|cream|grey|gray|brown|tan|ochre|amber|indigo|purple|violet|maroon|navy|burgundy|rust|copper|bronze|jade|emerald|sapphire|coral|peach|rose|pink|orange|yellow|teal|turquoise|charcoal|midnight|deep\s*blue|pale\s*green|dark\s*red)\b/gi;

const GROOMING_RE = /\b(hair\s*(?:down|up|loose|tied|braided|bound|unbound|cut|shaved|wet|disheveled)|beard|mustache|makeup|cosmetics|painted\s*(?:lips|face|nails)|clean-?shaven|stubble|ponytail|bun|pigtails|dreadlocks|cornrows|shaved\s*head)\b/gi;

const COSTUME_CHANGE_RE = /\b(chang(?:es?|ing)\s*(?:into|out\s*of)|puts?\s*on|takes?\s*off|removes?|strips?\s*(?:off|down)|dons?|slips?\s*(?:into|on|off)|rolls?\s*up|loosens?|unfastens?|buttons?\s*up|zips?\s*up|ties?\s*(?:up|on)|wraps?\s*(?:around|up)|unwraps?|undress(?:es)?|dress(?:es)?\s*(?:in|up)|wearing|clad\s*in|dressed\s*in|clothed\s*in|draped\s*in|wrapped\s*in)\b/gi;

const CONDITION_RE = /\b(torn|ripped|tattered|stained|blood-?stained|mud-?stained|wet|drenched|soaked|singed|burned|charred|dusty|dirty|filthy|pristine|immaculate|crisp|pressed|wrinkled|crumpled|faded|worn|threadbare|patched|mended|new|fresh|starched|rumpled|disheveled)\b/gi;

// State mapping from scene-level signals
const SCENE_STATE_SIGNALS: Record<string, RegExp> = {
  work: /\b(work|labor|craft|workshop|forge|field|studio|kiln|loom|garden|farm|office|desk|meeting)\b/i,
  domestic: /\b(home|domestic|private|chamber|bedroom|quarters|bath|morning|kitchen|living\s*room)\b/i,
  public_formal: /\b(court|audience|formal|public|ceremony|reception|banquet|feast|gala|ball|dinner\s*party)\b/i,
  ceremonial: /\b(ceremony|ritual|wedding|funeral|coronation|rite|sacred|blessing|offering|festival|procession)\b/i,
  travel: /\b(travel|journey|road|passage|expedition|march|ride|riding|horseback|carriage|ship|flee|escape)\b/i,
  intimate_private: /\b(intimate|lover|embrace|bed|night|undress|bare|skin)\b/i,
  distress_aftermath: /\b(wound|blood|torn|injured|beaten|attack|aftermath|disaster|fire|battle|grief|shock)\b/i,
  disguise_concealment: /\b(disguise|conceal|hidden|incognito|cover|mask|cloak|hood|infiltrate)\b/i,
  weather_adapted: /\b(rain|snow|storm|cold|heat|wind|monsoon|winter|drenched|soaked)\b/i,
  night_rest: /\b(sleep|night|rest|bed|dawn|pajama|nightgown|resting)\b/i,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function matchAll(text: string, pattern: RegExp): string[] {
  const matches = text.match(new RegExp(pattern.source, pattern.flags));
  return [...new Set((matches || []).map(m => m.toLowerCase().trim()))];
}

/**
 * Find sentences/passages near a character mention that contain costume evidence.
 */
function findCostumePassagesForCharacter(
  sceneText: string,
  characterName: string,
): string[] {
  const passages: string[] = [];
  // Split into sentences
  const sentences = sceneText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const nameRe = new RegExp(`\\b${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  // Also match pronouns near character name (he/she/they in sentences after character mention)
  
  let lastCharSentenceIdx = -999;
  
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (nameRe.test(s)) {
      lastCharSentenceIdx = i;
    }
    // Check if this sentence has costume evidence
    const hasCostumeEvidence = GARMENT_RE.test(s) || FABRIC_RE.test(s) ||
      COSTUME_CHANGE_RE.test(s) || CONDITION_RE.test(s) || GROOMING_RE.test(s);
    // Reset regex lastIndex
    GARMENT_RE.lastIndex = 0;
    FABRIC_RE.lastIndex = 0;
    COSTUME_CHANGE_RE.lastIndex = 0;
    CONDITION_RE.lastIndex = 0;
    GROOMING_RE.lastIndex = 0;

    if (hasCostumeEvidence && (nameRe.test(s) || (i - lastCharSentenceIdx <= 2 && lastCharSentenceIdx >= 0))) {
      passages.push(s);
    }
  }
  
  return passages;
}

/**
 * Resolve which wardrobe state a scene most likely represents, from scene text.
 */
function resolveSceneStateKey(sceneText: string, slugline?: string): string {
  const combined = `${slugline || ''} ${sceneText}`;
  for (const [stateKey, re] of Object.entries(SCENE_STATE_SIGNALS)) {
    if (re.test(combined)) return stateKey;
  }
  return 'core_default';
}

const STATE_LABELS: Record<string, string> = {
  work: 'Work / Labor',
  domestic: 'Domestic / Private',
  public_formal: 'Public / Formal',
  ceremonial: 'Ceremonial',
  travel: 'Travel',
  intimate_private: 'Intimate / Private',
  distress_aftermath: 'Distress / Aftermath',
  disguise_concealment: 'Disguise / Concealment',
  weather_adapted: 'Weather-Adapted',
  night_rest: 'Night / Rest',
  core_default: 'Default Presentation',
};

// ── Main Extraction ──────────────────────────────────────────────────────────

/**
 * Extract scene-bound costume evidence from scene text.
 * This is the scene/state evidence feeder for the canonical wardrobe pipeline.
 */
export function extractSceneCostumeEvidence(
  scenes: SceneTextInput[],
  characterNames: string[],
): SceneCostumeEvidenceResult {
  const facts: SceneCostumeFact[] = [];
  const characterSceneStates: Record<string, SceneStateOverride[]> = {};
  const scenesWithFacts = new Set<string>();
  const charsWithEvidence = new Set<string>();

  for (const scene of scenes) {
    if (!scene.content || scene.content.trim().length === 0) continue;
    
    // Determine which characters appear in this scene
    const presentChars = scene.characters_present?.length
      ? scene.characters_present
      : characterNames; // If not specified, scan for all

    for (const charName of presentChars) {
      const charKey = normalizeKey(charName);
      const passages = findCostumePassagesForCharacter(scene.content, charName);
      
      if (passages.length === 0) continue;
      
      const allPassageText = passages.join(' ');
      const garments = matchAll(allPassageText, GARMENT_RE);
      const fabrics = matchAll(allPassageText, FABRIC_RE);
      const accessories = matchAll(allPassageText, ACCESSORY_RE);
      const colors = matchAll(allPassageText, COLOR_RE);
      const grooming = matchAll(allPassageText, GROOMING_RE);
      const costumeChanges = matchAll(allPassageText, COSTUME_CHANGE_RE);
      const conditions = matchAll(allPassageText, CONDITION_RE);

      // Only record if there's actual costume evidence
      if (garments.length === 0 && fabrics.length === 0 && accessories.length === 0 &&
          costumeChanges.length === 0 && conditions.length === 0 && grooming.length === 0) continue;

      const fact: SceneCostumeFact = {
        passage: passages.join('. '),
        character_key: charKey,
        scene_key: scene.scene_key,
        scene_number: scene.scene_number,
        garments,
        fabrics,
        accessories,
        colors,
        grooming,
        costume_change_signals: costumeChanges,
        condition_signals: conditions,
        basis: 'explicit',
      };
      facts.push(fact);
      scenesWithFacts.add(scene.scene_key);
      charsWithEvidence.add(charKey);

      // Build scene state override
      const stateKey = resolveSceneStateKey(scene.content, scene.slugline);
      if (!characterSceneStates[charKey]) characterSceneStates[charKey] = [];

      characterSceneStates[charKey].push({
        scene_key: scene.scene_key,
        scene_number: scene.scene_number,
        resolved_state_key: stateKey,
        label: `${STATE_LABELS[stateKey] || stateKey} (Scene ${scene.scene_number ?? scene.scene_key})`,
        garment_overrides: garments,
        fabric_overrides: fabrics,
        accessory_overrides: accessories,
        grooming_overrides: grooming,
        condition_signals: conditions,
        evidence_passage: passages[0] || '',
        basis: 'explicit',
      });
    }
  }

  return {
    facts,
    character_scene_states: characterSceneStates,
    summary: {
      scenes_scanned: scenes.length,
      facts_found: facts.length,
      characters_with_scene_evidence: [...charsWithEvidence],
      scenes_with_costume_facts: [...scenesWithFacts],
    },
  };
}

/**
 * Merge scene-derived costume evidence into existing state matrix.
 *
 * PRECEDENCE:
 * 1. Explicit scene/state costume facts → override adjustments
 * 2. Fixed character costume truth (from profile) → preserved
 * 3. World/context inference → preserved as baseline
 * 4. Gap-fill → only where nothing else exists
 *
 * Does NOT remove existing states. Enriches and adds scene-linked states.
 */
export function mergeSceneEvidenceIntoStateMatrix(
  stateMatrix: Record<string, import('./characterWardrobeExtractor').WardrobeStateDefinition[]>,
  sceneEvidence: SceneCostumeEvidenceResult,
): Record<string, import('./characterWardrobeExtractor').WardrobeStateDefinition[]> {
  const enriched = { ...stateMatrix };

  for (const [charKey, sceneStates] of Object.entries(sceneEvidence.character_scene_states)) {
    if (!enriched[charKey]) enriched[charKey] = [];
    const existingStates = enriched[charKey];

    for (const sceneState of sceneStates) {
      // Find if state_key already exists in matrix
      const existingIdx = existingStates.findIndex(s => s.state_key === sceneState.resolved_state_key);

      if (existingIdx >= 0) {
        // Enrich existing state with scene-specific overrides
        const existing = existingStates[existingIdx];
        existingStates[existingIdx] = {
          ...existing,
          // Upgrade to explicit if we have scene evidence
          explicit_or_inferred: 'explicit',
          rationale: `Scene evidence from scene ${sceneState.scene_number ?? sceneState.scene_key}: "${sceneState.evidence_passage.slice(0, 100)}"`,
          // Scene-specific adjustments take precedence
          garment_adjustments: sceneState.garment_overrides.length > 0
            ? [...sceneState.garment_overrides, ...existing.garment_adjustments.filter(a => !a.startsWith('['))]
            : existing.garment_adjustments,
          fabric_adjustments: sceneState.fabric_overrides.length > 0
            ? [...sceneState.fabric_overrides, ...existing.fabric_adjustments.filter(a => !a.startsWith('['))]
            : existing.fabric_adjustments,
          accessory_adjustments: sceneState.accessory_overrides.length > 0
            ? [...sceneState.accessory_overrides, ...existing.accessory_adjustments.filter(a => !a.startsWith('['))]
            : existing.accessory_adjustments,
          grooming_adjustments: sceneState.grooming_overrides.length > 0
            ? [...sceneState.grooming_overrides, ...existing.grooming_adjustments]
            : existing.grooming_adjustments,
          // Append scene-specific continuity notes
          continuity_notes: [
            ...existing.continuity_notes,
            ...(sceneState.condition_signals.length > 0
              ? [`Scene ${sceneState.scene_number ?? sceneState.scene_key}: condition ${sceneState.condition_signals.join(', ')}`]
              : []),
          ],
          // Track scene linkage in trigger conditions
          trigger_conditions: [
            ...existing.trigger_conditions,
            `scene:${sceneState.scene_key}`,
          ],
        };
      } else {
        // Create new scene-derived state
        existingStates.push({
          state_key: sceneState.resolved_state_key,
          label: sceneState.label,
          rationale: `Explicit scene evidence from scene ${sceneState.scene_number ?? sceneState.scene_key}`,
          explicit_or_inferred: 'explicit',
          trigger_conditions: [`scene:${sceneState.scene_key}`],
          garment_adjustments: sceneState.garment_overrides,
          fabric_adjustments: sceneState.fabric_overrides,
          silhouette_adjustments: [],
          accessory_adjustments: sceneState.accessory_overrides,
          grooming_adjustments: sceneState.grooming_overrides,
          continuity_notes: sceneState.condition_signals.length > 0
            ? [`Scene ${sceneState.scene_number ?? sceneState.scene_key}: condition ${sceneState.condition_signals.join(', ')}`]
            : [],
        });
      }
    }
  }

  return enriched;
}
