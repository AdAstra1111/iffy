/**
 * Identity Extraction Quality Hardening Tests.
 *
 * Tests the normalization, generic-value rejection, inference classification,
 * and non-human entity detection logic in buildStructuredIdentityFromTraits
 * and its helper functions.
 *
 * These tests mirror the logic in
 * supabase/functions/generate-visual-dna-from-canon/index.ts
 */

import { describe, it, expect } from 'vitest';

// ── Test helpers (mirrored from edge function) ─────────────────────

const GENERIC_LABELS = new Set([
  'age', 'ages', 'eyes', 'appearance', 'appearances',
  'build', 'body', 'face', 'facial', 'skin', 'hair',
  'height', 'voice', 'ethnicity', 'social class', 'role',
  'look', 'looks', 'feature', 'features', 'type', 'style',
]);

function isGenericLabel(value: string): boolean {
  const clean = value.toLowerCase().replace(/[^a-z\s-]/g, '').trim();
  if (GENERIC_LABELS.has(clean)) return true;
  if (!clean.includes(' ') && GENERIC_LABELS.has(clean)) return true;
  return false;
}

function normalizeValue(raw: string, category: string): string {
  if (!raw) return '';
  let value = raw.trim();
  if (!value) return '';
  if (isGenericLabel(value)) return '';

  value = value.replace(/^appears?\s+(?:to\s+be\s+)?(?:in\s+)?(?:their\s+)?/i, '').trim();
  value = value.replace(/^(?:a\s+|an\s+)/i, '').trim();

  const CATEGORY_SUFFIXES = [
    /^(.*?)\s+(age|ages|gender|build|body|figure|appearance|look|looks|type|description|feature|features)\s*$/i,
    /^(.*?)\s+(years old|year old|years of age)\s*$/i,
    /^appears?\s+(?:to\s+be\s+)?(?:in\s+)?(?:their\s+)?(.+)$/i,
    /^(?:a\s+|an\s+)?(.+)$/i,
  ];

  for (const pattern of CATEGORY_SUFFIXES) {
    const match = value.match(pattern);
    if (match && match[1] && match[1].trim()) {
      const stripped = match[1].trim();
      const suffix = (match[2] || '').toLowerCase();
      // Allow stripping when suffix matches category, is a known generic,
      // or matches one of the descriptive suffixes like "appearance", "looks"
      const descriptorSuffixes = new Set(['appearance', 'look', 'looks', 'type', 'description', 'feature', 'features']);
      if (!suffix || suffix === category.toLowerCase() || descriptorSuffixes.has(suffix)) {
        value = stripped;
        break;
      }
    }
  }

  value = value.replace(/\s+/g, ' ').trim();
  if (isGenericLabel(value)) return '';
  return value;
}

function normalizeAgeRange(raw: string): string {
  if (!raw) return '';

  const appearsMatch = raw.match(/appears?\s+(?:to\s+be\s+)?(?:in\s+)?(?:their\s+)?(\d+)s?/i);
  if (appearsMatch) return appearsMatch[1] + 's';

  const knownAgeBands = new Set([
    'child', 'teen', 'teenager', 'young adult', 'adult',
    'middle-aged', 'middle aged', 'elderly', 'senior',
    'ancient', 'ageless',
  ]);
  const clean = raw.toLowerCase().replace(/[^a-z\s-]/g, '').trim();
  if (knownAgeBands.has(clean)) return clean;

  const yearsOldMatch = raw.match(/(\d+)\s*(?:years?\s*)?old/i);
  if (yearsOldMatch) {
    const age = parseInt(yearsOldMatch[1], 10);
    if (age >= 0 && age <= 12) return 'child';
    if (age >= 13 && age <= 19) return 'teen';
    if (age >= 20 && age <= 29) return '20s';
    if (age >= 30 && age <= 39) return '30s';
    if (age >= 40 && age <= 49) return '40s';
    if (age >= 50 && age <= 59) return '50s';
    if (age >= 60) return '60s+';
  }

  const rangeMatch = raw.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1], 10);
    const high = parseInt(rangeMatch[2], 10);
    return `${low}-${high}`;
  }

  const decadeMatch = raw.match(/(\d+)s/);
  if (decadeMatch) return decadeMatch[1] + 's';

  return raw;
}

function normalizeBiologicalSex(raw: string): string | undefined {
  if (!raw) return undefined;
  const clean = raw.toLowerCase().replace(/[^a-z]/g, '').trim();
  if (clean === 'male' || clean === 'female') return clean;
  if (clean === 'malegender' || clean === 'malegendered') return 'male';
  if (clean === 'femalegender' || clean === 'femalegendered') return 'female';
  return undefined;
}

function classifyInferenceType(
  _category: string,
  rawLabel: string,
  traitConfidence: string,
): string {
  if (traitConfidence === 'high' && rawLabel.length > 3) return 'explicit_canon';
  if (traitConfidence === 'high') return 'strongly_implied';
  if (traitConfidence === 'medium') return 'inferred_style';
  return 'unknown';
}

const NON_HUMAN_MARKERS = [
  /\b(?:ten|forty|fifty|hundred|thousand)\s+(?:feet?|meters?)\s+tall\b/i,
  /\b(?:divine|alien|mythical|mythic|supernatural|demonic|angelic|celestial)\b/i,
  /\b(?:ram[\-\s]like|horn|claw|tentacle|wing|hoof|tail|fang)\b/i,
  /\b(?:colossal|gigantic|massive\s+(?:form|figure|being|creature))\b/i,
  /\bnon[- ]?human\b/i,
];

function isNonHumanEntity(traits: any[]): boolean {
  if (!traits) return false;
  let nonHumanScore = 0;
  for (const t of traits) {
    const combined = `${t.label || ''} ${t.value || ''} ${t.category || ''}`;
    for (const pattern of NON_HUMAN_MARKERS) {
      if (pattern.test(combined)) {
        nonHumanScore++;
        break;
      }
    }
  }
  return nonHumanScore >= 2;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('isGenericLabel', () => {
  it('rejects bare "age"', () => {
    expect(isGenericLabel('age')).toBe(true);
  });

  it('rejects bare "eyes"', () => {
    expect(isGenericLabel('eyes')).toBe(true);
  });

  it('rejects bare "appearance"', () => {
    expect(isGenericLabel('appearance')).toBe(true);
  });

  it('rejects bare "build"', () => {
    expect(isGenericLabel('build')).toBe(true);
  });

  it('rejects bare "face"', () => {
    expect(isGenericLabel('face')).toBe(true);
  });

  it('rejects bare "voice"', () => {
    expect(isGenericLabel('voice')).toBe(true);
  });

  it('rejects bare "ethnicity"', () => {
    expect(isGenericLabel('ethnicity')).toBe(true);
  });

  it('rejects bare "height"', () => {
    expect(isGenericLabel('height')).toBe(true);
  });

  it('allows specific values like "hazel eyes"', () => {
    expect(isGenericLabel('hazel eyes')).toBe(false);
  });

  it('allows "40s weathered"', () => {
    expect(isGenericLabel('40s weathered')).toBe(false);
  });

  it('allows "rugged build" as a multi-word phrase', () => {
    expect(isGenericLabel('rugged build')).toBe(false);
  });

  it('allows "masculine"', () => {
    expect(isGenericLabel('masculine')).toBe(false);
  });
});

describe('normalizeValue', () => {
  it('strips "age" suffix from "40s age"', () => {
    expect(normalizeValue('40s age', 'age')).toBe('40s');
  });

  it('strips "gender" suffix from "male gender"', () => {
    expect(normalizeValue('male gender', 'gender')).toBe('male');
  });

  it('strips "build" suffix from "rugged build"', () => {
    expect(normalizeValue('rugged build', 'build')).toBe('rugged');
  });

  it('strips "appearance" suffix from "tired appearance"', () => {
    expect(normalizeValue('tired appearance', 'face')).toBe('tired');
  });

  it('rejects bare "age" as generic', () => {
    expect(normalizeValue('age', 'age')).toBe('');
  });

  it('rejects bare "eyes" as generic', () => {
    expect(normalizeValue('eyes', 'face')).toBe('');
  });

  it('preserves meaningful multi-word descriptions', () => {
    expect(normalizeValue('huge monstrous figure', 'build')).toBe('huge monstrous figure');
  });

  it('rejects bare "appearance" as category-label-only', () => {
    expect(normalizeValue('appearance', 'face')).toBe('');
  });

  it('strips "appears in 30s" prefix', () => {
    expect(normalizeValue('appears in 30s', 'age')).toBe('30s');
  });

  it('strips "appears to be in their 40s" prefix', () => {
    expect(normalizeValue('appears to be in their 40s', 'age')).toBe('40s');
  });
});

describe('normalizeAgeRange', () => {
  it('normalizes "appears in 30s" to "30s"', () => {
    expect(normalizeAgeRange('appears in 30s')).toBe('30s');
  });

  it('normalizes "appears to be in their 40s" to "40s"', () => {
    expect(normalizeAgeRange('appears to be in their 40s')).toBe('40s');
  });

  it('normalizes "20 years old" to "20s"', () => {
    expect(normalizeAgeRange('20 years old')).toBe('20s');
  });

  it('normalizes "child" to "child"', () => {
    expect(normalizeAgeRange('child')).toBe('child');
  });

  it('normalizes "ancient" to "ancient"', () => {
    expect(normalizeAgeRange('ancient')).toBe('ancient');
  });

  it('preserves "40s" shorthand', () => {
    expect(normalizeAgeRange('40s')).toBe('40s');
  });

  it('parses 8 years old as child', () => {
    expect(normalizeAgeRange('8 years old')).toBe('child');
  });

  it('parses 16 years old as teen', () => {
    expect(normalizeAgeRange('16 years old')).toBe('teen');
  });

  it('parses 75 years old as 60s+', () => {
    expect(normalizeAgeRange('75 years old')).toBe('60s+');
  });

  it('preserves "25-35" range', () => {
    expect(normalizeAgeRange('25-35')).toBe('25-35');
  });

  it('preserves "middle-aged"', () => {
    expect(normalizeAgeRange('middle-aged')).toBe('middle-aged');
  });
});

describe('normalizeBiologicalSex', () => {
  it('passes through "male"', () => {
    expect(normalizeBiologicalSex('male')).toBe('male');
  });

  it('passes through "female"', () => {
    expect(normalizeBiologicalSex('female')).toBe('female');
  });

  it('normalizes "male gender" to "male"', () => {
    expect(normalizeBiologicalSex('male gender')).toBe('male');
  });

  it('normalizes "female gender" to "female"', () => {
    expect(normalizeBiologicalSex('female gender')).toBe('female');
  });

  it('returns undefined for ambiguous values', () => {
    expect(normalizeBiologicalSex('androgynous')).toBeUndefined();
  });

  it('returns undefined for "unknown"', () => {
    expect(normalizeBiologicalSex('unknown')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizeBiologicalSex('')).toBeUndefined();
  });
});

describe('classifyInferenceType', () => {
  it('classifies high confidence + specific as "explicit_canon"', () => {
    expect(classifyInferenceType('age', '40s weathered', 'high')).toBe('explicit_canon');
  });

  it('classifies high confidence + short as "strongly_implied"', () => {
    expect(classifyInferenceType('age', '40s', 'high')).toBe('strongly_implied');
  });

  it('classifies medium confidence as "inferred_style"', () => {
    expect(classifyInferenceType('age', '40s', 'medium')).toBe('inferred_style');
  });

  it('classifies low confidence as "unknown"', () => {
    expect(classifyInferenceType('age', '40s', 'low')).toBe('unknown');
  });
});

describe('isNonHumanEntity', () => {
  it('returns true for Yeti-like traits (colossal + ram-like horns)', () => {
    const traits = [
      { label: 'colossal form', category: 'build', confidence: 'high' },
      { label: 'massive ram-like horns', category: 'face', confidence: 'high' },
      { label: 'fur-covered body', category: 'skin', confidence: 'medium' },
    ];
    expect(isNonHumanEntity(traits)).toBe(true);
  });

  it('returns true for divine/alien entity', () => {
    const traits = [
      { label: 'divine presence', category: 'other', confidence: 'high' },
      { label: 'celestial aura', category: 'other', confidence: 'medium' },
      { label: 'humanoid figure', category: 'build', confidence: 'high' },
    ];
    expect(isNonHumanEntity(traits)).toBe(true);
  });

  it('returns true for Enki-like traits (ten feet tall + divine appearance)', () => {
    const traits = [
      { label: 'ten feet tall', category: 'height', confidence: 'high' },
      { label: 'otherworldly authority', category: 'posture', confidence: 'high' },
      { label: 'divine or alien appearance', category: 'other', confidence: 'medium' },
    ];
    expect(isNonHumanEntity(traits)).toBe(true);
  });

  it('returns false for human character traits', () => {
    const traits = [
      { label: 'tall athletic build', category: 'build', confidence: 'high' },
      { label: 'sharp angular features', category: 'face', confidence: 'medium' },
      { label: 'male gender', category: 'gender', confidence: 'high' },
    ];
    expect(isNonHumanEntity(traits)).toBe(false);
  });

  it('requires at least 2 non-human markers', () => {
    // Only 1 marker (colossal) — not enough
    const traits = [
      { label: 'colossal form', category: 'build', confidence: 'high' },
      { label: 'human face', category: 'face', confidence: 'high' },
    ];
    expect(isNonHumanEntity(traits)).toBe(false);
  });

  it('returns false for empty traits', () => {
    expect(isNonHumanEntity([])).toBe(false);
    expect(isNonHumanEntity(null)).toBe(false);
  });
});

describe('backfillIdentityFromSignature', () => {
  // Minimal reimplementation for testing
  function backfillIdentityFromSignature(
    identitySignature: any,
    existingStructured: Record<string, any>,
  ): Record<string, any> {
    if (!identitySignature) return {};
    const result: Record<string, any> = {};
    const sig = identitySignature;

    const needsFill = (field: string) =>
      existingStructured[field] === null || existingStructured[field] === undefined;

    const inner = sig.signature || sig;

    if (needsFill('age_range') && !result.age_range) {
      if (typeof inner.age === 'string' && inner.age.length > 2) result.age_range = inner.age;
      else if (typeof inner.age === 'object' && inner.age) {
        const ageVal = inner.age.value || inner.age.label || '';
        if (ageVal.length > 2) result.age_range = ageVal;
      }
      else if (sig.age && typeof sig.age === 'string') result.age_range = sig.age;
    }

    if (needsFill('biological_sex') && !result.biological_sex) {
      const genderRaw = inner.gender || sig.gender || '';
      const genderVal = typeof genderRaw === 'string' ? genderRaw.toLowerCase() :
        typeof genderRaw === 'object' ? (genderRaw.value || genderRaw.label || '') : '';
      const clean = genderVal.replace(/[^a-z]/g, '').trim();
      if (clean === 'male' || clean === 'female') result.biological_sex = clean;
    }

    if (needsFill('ethnicity') && !result.ethnicity) {
      const ethRaw = inner.ethnicity || sig.ethnicity || '';
      if (Array.isArray(ethRaw) && ethRaw.length > 0) {
        result.ethnicity = ethRaw.filter((e: any) => typeof e === 'string' && e.length > 1);
      } else if (typeof ethRaw === 'string' && ethRaw.length > 2) {
        result.ethnicity = [ethRaw];
      }
    }

    if (needsFill('height_class') && !result.height_class) {
      const bodyHeight = inner.body?.height || inner.body?.height_estimate || sig.height || '';
      const bodyHeightVal = typeof bodyHeight === 'string' ? bodyHeight :
        typeof bodyHeight === 'object' ? (bodyHeight.value || bodyHeight.label || '') : '';
      if (bodyHeightVal && bodyHeightVal.length > 2) result.height_class = bodyHeightVal;
    }

    return result;
  }

  it('backfills ethnicity from legacy Format B identity_signature', () => {
    const sig = { ethnicity: 'English', height: 'Average to tall', age: '40s' };
    const existing = { age_range: null, biological_sex: null, ethnicity: null, height_class: null, body_type: 'Rugged' };
    const result = backfillIdentityFromSignature(sig, existing);
    expect(result.ethnicity).toEqual(['English']);
    expect(result.height_class).toBe('Average to tall');
    // Should NOT overwrite body_type since it already has a value
    expect(result.body_type).toBeUndefined();
  });

  it('backfills from Format D signature (nested)', () => {
    const sig = { signature: { age: { value: '40s' }, gender: 'male', ethnicity: 'English' } };
    const existing = { age_range: null, biological_sex: null, ethnicity: null, height_class: null };
    const result = backfillIdentityFromSignature(sig, existing);
    expect(result.age_range).toBe('40s');
    expect(result.biological_sex).toBe('male');
    expect(result.ethnicity).toEqual(['English']);
  });

  it('does NOT overwrite existing non-null values', () => {
    const sig = { age: '20s', ethnicity: 'French' };
    const existing = { age_range: '40s', biological_sex: 'male', ethnicity: null, height_class: null };
    const result = backfillIdentityFromSignature(sig, existing);
    // age_range already has '40s' — should not be overwritten
    expect(result.age_range).toBeUndefined();
    // ethnicity still null — should be backfilled
    expect(result.ethnicity).toEqual(['French']);
  });

  it('returns empty object for null signature', () => {
    const result = backfillIdentityFromSignature(null, { age_range: null });
    expect(result).toEqual({});
  });

  it('returns empty object when all fields already populated', () => {
    const sig = { age: '40s', ethnicity: 'English', height: 'Tall' };
    const existing = { age_range: '40s', biological_sex: 'male', ethnicity: ['English'], height_class: 'Tall' };
    const result = backfillIdentityFromSignature(sig, existing);
    expect(Object.keys(result).length).toBe(0);
  });
});