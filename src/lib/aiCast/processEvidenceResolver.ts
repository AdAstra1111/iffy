/**
 * processEvidenceResolver — Canonical evidence aggregator for downstream processes.
 *
 * Single source of truth for resolving what evidence is available for a character
 * across all extracted document sources. Downstream consumers (CharacterBrief,
 * casting prompt builder, auto-cast) read from here instead of ad-hoc queries.
 *
 * DETERMINISTIC. READ-ONLY. No LLM.
 */

import { supabase } from '@/integrations/supabase/client';
import { normalizeCharacterKey } from './normalizeCharacterKey';

// ── Types ────────────────────────────────────────────────────────────────────

export type EvidenceStrength = 'strong' | 'partial' | 'weak' | 'none';

export interface EvidenceSource {
  source_type: string;       // e.g. 'canon_facts', 'character_bible', 'scene_index'
  available: boolean;
  record_count: number;
  /** Whether this source contributed data for this specific character */
  contributed: boolean;
}

export interface CharacterEvidenceProfile {
  character_key: string;
  display_name: string;

  // Physical
  gender: string | null;
  age_range: string | null;
  ethnicity: string | null;
  body_type: string | null;
  height: string | null;
  key_visual_traits: string[];

  // Emotional
  core_traits: string[];
  emotional_baseline: string | null;
  emotional_range: string | null;

  // Narrative
  role_type: string | null;
  archetype: string | null;
  energy_level: string | null;
  scene_count: number;
  scene_evidence: string[];
  role_in_story: string | null;

  // Provenance
  sources: EvidenceSource[];
  evidence_strength: EvidenceStrength;
  completeness: number; // 0-100
  missing_sources: string[];
}

// ── Source definitions ───────────────────────────────────────────────────────

/** All source types relevant for casting evidence */
const CASTING_EVIDENCE_SOURCES = [
  'canon_facts',
  'character_visual_dna',
  'scene_index',
  'project_canon',
  'character_bible',
  'character_profile',
  'treatment',
  'story_outline',
  'feature_script',
  'episode_script',
  'screenplay_draft',
  'world_bible',
] as const;

const DOC_TYPES_FOR_CHARACTER = [
  'character_bible', 'character_profile', 'treatment',
  'story_outline', 'feature_script', 'episode_script',
  'screenplay_draft', 'season_script',
];

// ── Appearance extraction patterns (shared with castingBriefResolver) ────────

const AGE_PATTERNS = [
  /\b(?:early|mid|late)\s*(?:teens|twenties|thirties|forties|fifties|sixties|seventies|eighties)\b/gi,
  /\b(?:\d{1,2}[\s-]*(?:year[\s-]*old|years[\s-]*old|yo))\b/gi,
];

const HAIR_PATTERNS = [
  /\b(?:(?:dark|light|blonde?|auburn|red|black|white|grey|gray|silver|brown|chestnut|raven|platinum|copper|golden|jet[\s-]*black)\s+hair\w*)\b/gi,
  /\b(?:cropped|shaved|braided|curly|wavy|straight|long|short)\s+hair\b/gi,
];

const BUILD_PATTERNS = [
  /\b(?:(?:slender|lean|stocky|muscular|athletic|petite|tall|short|heavyset|wiry|compact|broad[\s-]*shouldered|lithe|thin|slight|imposing|statuesque)\s+(?:build|frame|figure|physique|stature)?)\b/gi,
];

const SKIN_PATTERNS = [
  /\b(?:(?:dark|light|olive|pale|fair|tanned|sun[\s-]*kissed|brown|ebony|ivory|porcelain|weathered|freckled)\s+(?:skin|complexion|tone)?)\b/gi,
];

const EYES_PATTERNS = [
  /\b(?:(?:dark|light|blue|green|brown|hazel|grey|gray|amber|black|bright|piercing|deep[\s-]*set|almond[\s-]*shaped|wide[\s-]*set|narrow|hooded)\s+eyes?)\b/gi,
];

const TRAIT_PATTERNS = [
  /\b(?:fierce|gentle|reserved|intense|charismatic|brooding|warm|cold|calculating|impulsive|stoic|passionate|volatile|serene|anxious|confident|humble|arrogant|compassionate|ruthless|playful|serious|witty|quiet|commanding|vulnerable|resilient|determined|stubborn|loyal|cunning|naive|wise|reckless|cautious|charming|intimidating|mysterious|open|guarded|sensitive|tough|graceful|awkward)\b/gi,
];

const ROLE_KEYWORDS: Record<string, string> = {
  protagonist: 'protagonist', hero: 'protagonist', lead: 'protagonist',
  antagonist: 'antagonist', villain: 'antagonist',
  supporting: 'supporting', mentor: 'supporting', sidekick: 'supporting',
  love_interest: 'supporting',
};

const ENERGY_KEYWORDS: Record<string, string> = {
  intense: 'dominant', commanding: 'dominant', powerful: 'dominant',
  quiet: 'passive', reserved: 'passive', gentle: 'passive',
  balanced: 'moderate', steady: 'moderate',
};

// ── Core resolver ────────────────────────────────────────────────────────────

export async function resolveCharacterEvidence(
  projectId: string,
  characterKey: string,
): Promise<CharacterEvidenceProfile> {
  const normKey = normalizeCharacterKey(characterKey);
  const sources: EvidenceSource[] = [];

  let displayName = characterKey;
  let gender: string | null = null;
  let ageRange: string | null = null;
  let ethnicity: string | null = null;
  let bodyType: string | null = null;
  let height: string | null = null;
  const keyVisualTraits: string[] = [];
  const coreTraits: string[] = [];
  let roleType: string | null = null;
  let archetype: string | null = null;
  let energyLevel: string | null = null;
  let sceneCount = 0;
  const sceneEvidence: string[] = [];
  let roleInStory: string | null = null;

  // ── 1. canon_facts ──────────────────────────────────────────────────────
  const { data: charFacts } = await supabase
    .from('canon_facts')
    .select('subject, predicate, object, value')
    .eq('project_id', projectId)
    .eq('is_active', true);

  const allFacts = charFacts || [];
  const characterFacts = allFacts.filter(
    (f: any) => normalizeCharacterKey(f.subject) === normKey,
  );

  if (characterFacts.length > 0) {
    displayName = characterFacts[0].subject || characterKey;
  }

  sources.push({
    source_type: 'canon_facts',
    available: allFacts.length > 0,
    record_count: characterFacts.length,
    contributed: characterFacts.length > 0,
  });

  const PHYSICAL_PREDS = new Set(['gender', 'age', 'ethnicity', 'nationality', 'appearance', 'hair', 'hair_color', 'hair_style', 'eyes', 'eye_color', 'skin', 'skin_tone', 'complexion', 'height', 'build', 'physique', 'body_type', 'weight', 'stature', 'face', 'facial_features', 'scar', 'tattoo', 'piercing']);
  const EMOTIONAL_PREDS = new Set(['character_trait', 'personality', 'trait', 'temperament', 'demeanor', 'disposition', 'nature']);
  const NARRATIVE_PREDS = new Set(['role', 'archetype', 'occupation', 'profession', 'title', 'goal', 'goals', 'motivation', 'arc']);

  for (const fact of characterFacts) {
    const pred = fact.predicate?.toLowerCase() || '';
    const val = fact.object || '';
    if (!val) continue;

    if (pred === 'gender') { gender = val; continue; }
    if (pred === 'age') { ageRange = val; continue; }
    if (pred === 'ethnicity' || pred === 'nationality') { ethnicity = val; continue; }
    if (pred === 'build' || pred === 'physique' || pred === 'body_type') { bodyType = val; continue; }
    if (pred === 'height' || pred === 'stature') { height = val; continue; }

    if (PHYSICAL_PREDS.has(pred) && val.length > 2 && val.length < 80) {
      keyVisualTraits.push(val);
    }
    if (EMOTIONAL_PREDS.has(pred) && val.length > 2 && val.length < 50) {
      coreTraits.push(val);
    }
    if (NARRATIVE_PREDS.has(pred)) {
      if (pred === 'role' || pred === 'archetype') {
        archetype = val;
        const lower = val.toLowerCase();
        for (const [kw, rt] of Object.entries(ROLE_KEYWORDS)) {
          if (lower.includes(kw)) { roleType = rt; break; }
        }
      }
    }
  }

  // ── 2. character_visual_dna ─────────────────────────────────────────────
  const { data: dnaRows } = await (supabase as any)
    .from('character_visual_dna')
    .select('character_name, identity_signature, physical_categories, traits_json')
    .eq('project_id', projectId)
    .eq('is_current', true);

  const matchedDna = (dnaRows || []).find(
    (d: any) => normalizeCharacterKey(d.character_name || '') === normKey,
  );

  sources.push({
    source_type: 'character_visual_dna',
    available: (dnaRows || []).length > 0,
    record_count: matchedDna ? 1 : 0,
    contributed: !!matchedDna,
  });

  if (matchedDna?.identity_signature) {
    const sig = matchedDna.identity_signature;
    if (!gender && sig.gender) gender = sig.gender;
    if (!ageRange && sig.age) ageRange = sig.age;
    if (!ethnicity && sig.ethnicity) ethnicity = sig.ethnicity;
    if (!bodyType && sig.build) bodyType = sig.build;
    if (!height && sig.height) height = sig.height;
    if (sig.hair) keyVisualTraits.push(`Hair: ${sig.hair}`);
    if (sig.face) keyVisualTraits.push(`Face: ${sig.face}`);
  }

  if (matchedDna?.traits_json && Array.isArray(matchedDna.traits_json)) {
    for (const trait of matchedDna.traits_json) {
      if (!trait?.label || !trait?.category) continue;
      const cat = trait.category?.toLowerCase()?.trim();
      if (['face', 'body', 'hair', 'skin', 'eyes', 'physique', 'height', 'build'].includes(cat)) {
        keyVisualTraits.push(trait.label);
      }
    }
  }

  // ── 3. scene_index ──────────────────────────────────────────────────────
  const { data: scenes } = await (supabase as any)
    .from('scene_index')
    .select('scene_number, title, character_keys')
    .eq('project_id', projectId);

  const characterScenes = (scenes || []).filter((s: any) =>
    (s.character_keys || []).some((k: string) => normalizeCharacterKey(k) === normKey),
  );

  sceneCount = characterScenes.length;
  sceneEvidence.push(
    ...characterScenes.slice(0, 3).map((s: any) => s.title || `Scene ${s.scene_number}`).filter(Boolean),
  );

  sources.push({
    source_type: 'scene_index',
    available: (scenes || []).length > 0,
    record_count: characterScenes.length,
    contributed: characterScenes.length > 0,
  });

  // ── 4. project_canon (canon_json.characters) ────────────────────────────
  const { data: canonRow } = await (supabase as any)
    .from('project_canon')
    .select('canon_json')
    .eq('project_id', projectId)
    .maybeSingle();

  let canonContributed = false;
  if (canonRow?.canon_json?.characters) {
    const canonChars = canonRow.canon_json.characters as Array<{
      name?: string; role?: string; traits?: string; goals?: string;
      description?: string; relationships?: string;
    }>;
    const matched = canonChars.find(
      c => c.name && normalizeCharacterKey(c.name) === normKey,
    );
    if (matched) {
      canonContributed = true;
      if (matched.role && !roleInStory) roleInStory = matched.role;
      if (matched.role && !roleType) {
        const lower = matched.role.toLowerCase();
        for (const [kw, rt] of Object.entries(ROLE_KEYWORDS)) {
          if (lower.includes(kw)) { roleType = rt; break; }
        }
      }
      if (matched.traits) {
        const traitList = matched.traits.split(/[,;]+/).map(t => t.trim()).filter(t => t.length > 2 && t.length < 50);
        for (const t of traitList) {
          if (!coreTraits.includes(t)) coreTraits.push(t);
        }
      }
      if (matched.description) {
        // Extract physical cues from description
        extractPhysicalFromText(matched.description, {
          gender: g => { if (!gender) gender = g; },
          age: a => { if (!ageRange) ageRange = a; },
          traits: t => { if (!keyVisualTraits.includes(t)) keyVisualTraits.push(t); },
        });
      }
    }
  }

  sources.push({
    source_type: 'project_canon',
    available: !!canonRow?.canon_json,
    record_count: canonContributed ? 1 : 0,
    contributed: canonContributed,
  });

  // ── 5. Project documents (character_bible, treatment, scripts, etc.) ────
  const { data: docs } = await supabase
    .from('project_documents')
    .select('id, doc_type, plaintext, extracted_text')
    .eq('project_id', projectId)
    .in('doc_type', DOC_TYPES_FOR_CHARACTER);

  const docIds = (docs || []).map(d => d.id);
  let versionMap: Record<string, string> = {};

  if (docIds.length > 0) {
    const { data: versions } = await (supabase as any)
      .from('project_document_versions')
      .select('document_id, plaintext, is_current, version_number')
      .in('document_id', docIds)
      .order('version_number', { ascending: false });

    for (const v of versions || []) {
      if (!versionMap[v.document_id] || v.is_current) {
        if (v.plaintext && v.plaintext.trim().length > 20) {
          versionMap[v.document_id] = v.plaintext;
        }
      }
    }
  }

  for (const doc of docs || []) {
    const text = versionMap[doc.id] || (doc as any).plaintext || (doc as any).extracted_text || '';
    const docType = (doc as any).doc_type || '';
    const hasText = text.trim().length > 20;

    // Check if this doc mentions our character
    let contributed = false;
    if (hasText) {
      const nameVariants = [
        characterKey,
        displayName,
        characterKey.replace(/_/g, ' '),
      ].filter(Boolean);
      
      const lowerText = text.toLowerCase();
      contributed = nameVariants.some(n => lowerText.includes(n.toLowerCase()));

      if (contributed) {
        // Extract character passages and mine for evidence
        const passages = extractCharacterPassagesFromText(text, nameVariants);
        for (const passage of passages) {
          extractPhysicalFromText(passage, {
            gender: g => { if (!gender) gender = g; },
            age: a => { if (!ageRange) ageRange = a; },
            traits: t => { if (!keyVisualTraits.includes(t)) keyVisualTraits.push(t); },
          });

          // Extract emotional traits from passages
          const traitMatches = passage.match(TRAIT_PATTERNS[0]);
          if (traitMatches) {
            for (const tm of traitMatches) {
              const clean = tm.trim().toLowerCase();
              if (clean.length > 2 && !coreTraits.some(c => c.toLowerCase() === clean)) {
                coreTraits.push(clean.charAt(0).toUpperCase() + clean.slice(1));
              }
            }
          }
        }
      }
    }

    sources.push({
      source_type: docType,
      available: hasText,
      record_count: hasText ? 1 : 0,
      contributed,
    });
  }

  // ── Derive energy from traits ───────────────────────────────────────────
  for (const trait of coreTraits) {
    const lower = trait.toLowerCase();
    for (const [keyword, energy] of Object.entries(ENERGY_KEYWORDS)) {
      if (lower.includes(keyword)) { energyLevel = energy; break; }
    }
    if (energyLevel) break;
  }

  // ── Compute completeness & strength ─────────────────────────────────────
  let filled = 0;
  const total = 12;
  if (gender) filled++;
  if (ageRange) filled++;
  if (ethnicity) filled++;
  if (bodyType) filled++;
  if (height) filled++;
  if (keyVisualTraits.length > 0) filled++;
  if (coreTraits.length > 0) filled++;
  if (coreTraits.length > 2) filled++;
  if (roleType) filled++;
  if (archetype || roleInStory) filled++;
  if (sceneCount > 0) filled++;
  if (energyLevel) filled++;

  const completeness = Math.round((filled / total) * 100);
  const contributingSources = sources.filter(s => s.contributed).length;
  const evidenceStrength: EvidenceStrength =
    completeness >= 60 && contributingSources >= 3 ? 'strong' :
    completeness >= 30 && contributingSources >= 2 ? 'partial' :
    completeness > 0 ? 'weak' : 'none';

  // Missing sources = available in project but didn't contribute for this character
  const missingSources = sources
    .filter(s => s.available && !s.contributed)
    .map(s => s.source_type);

  // Deduplicate
  const uniqueTraits = [...new Set(keyVisualTraits)].slice(0, 10);
  const uniqueEmotional = [...new Set(coreTraits)].slice(0, 8);

  return {
    character_key: normKey,
    display_name: displayName,
    gender,
    age_range: ageRange,
    ethnicity,
    body_type: bodyType,
    height,
    key_visual_traits: uniqueTraits,
    core_traits: uniqueEmotional,
    emotional_baseline: uniqueEmotional[0] || null,
    emotional_range: uniqueEmotional.length > 2
      ? `${uniqueEmotional[0]} to ${uniqueEmotional[uniqueEmotional.length - 1]}`
      : null,
    role_type: roleType,
    archetype: archetype || roleInStory,
    energy_level: energyLevel,
    scene_count: sceneCount,
    scene_evidence: sceneEvidence,
    role_in_story: roleInStory,
    sources,
    evidence_strength: evidenceStrength,
    completeness,
    missing_sources: missingSources,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCharacterPassagesFromText(text: string, nameVariants: string[]): string[] {
  const passages: string[] = [];
  const sentences = text.split(/[.!?\n]+/);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (nameVariants.some(n => lower.includes(n.toLowerCase()))) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10 && trimmed.length < 500) {
        passages.push(trimmed);
      }
    }
  }

  return passages.slice(0, 20); // Cap to prevent runaway
}

function extractPhysicalFromText(
  text: string,
  callbacks: {
    gender: (g: string) => void;
    age: (a: string) => void;
    traits: (t: string) => void;
  },
) {
  // Age
  for (const pat of AGE_PATTERNS) {
    const m = text.match(pat);
    if (m) { callbacks.age(m[0]); break; }
  }

  // Hair
  for (const pat of HAIR_PATTERNS) {
    const matches = text.match(pat);
    if (matches) {
      for (const m of matches.slice(0, 2)) callbacks.traits(`Hair: ${m.trim()}`);
    }
  }

  // Build
  for (const pat of BUILD_PATTERNS) {
    const matches = text.match(pat);
    if (matches) {
      for (const m of matches.slice(0, 1)) callbacks.traits(`Build: ${m.trim()}`);
    }
  }

  // Eyes
  for (const pat of EYES_PATTERNS) {
    const matches = text.match(pat);
    if (matches) {
      for (const m of matches.slice(0, 1)) callbacks.traits(`Eyes: ${m.trim()}`);
    }
  }

  // Skin
  for (const pat of SKIN_PATTERNS) {
    const matches = text.match(pat);
    if (matches) {
      for (const m of matches.slice(0, 1)) callbacks.traits(`Skin: ${m.trim()}`);
    }
  }

  // Gender inference from pronouns
  const heCount = (text.match(/\bhe\b|\bhis\b|\bhim\b/gi) || []).length;
  const sheCount = (text.match(/\bshe\b|\bher\b|\bhers\b/gi) || []).length;
  if (heCount > 3 && heCount > sheCount * 2) callbacks.gender('Male');
  if (sheCount > 3 && sheCount > heCount * 2) callbacks.gender('Female');
}
