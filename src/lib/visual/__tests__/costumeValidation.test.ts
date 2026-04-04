import { describe, it, expect } from 'vitest';
import {
  validateCostumeCandidate,
  deriveCostumeFingerprint,
  costumeFingerprintKey,
  serializeCostumeDiagnostics,
  COSTUME_SLOT_EXPECTATIONS,
  type CostumeFamilyFingerprint,
} from '../costumeValidation';
import { getModeRules } from '../worldValidationMode';

// ── Prompt Content Tests ────────────────────────────────────────────────────

describe('costumeValidation — prompt content', () => {
  it('passes when prompt has garment noun + fabric noun', () => {
    const result = validateCostumeCandidate(
      'A worn silk kimono with visible hand stitching and faded indigo dye, draped over a wooden stand.',
      'fabric_primary',
      null,
    );
    expect(result.passed).toBe(true);
    expect(result.hard_fail_codes).not.toContain('no_garment_noun');
    expect(result.hard_fail_codes).not.toContain('no_fabric_noun');
  });

  it('fails when prompt has no garment noun', () => {
    const result = validateCostumeCandidate(
      'A piece of silk fabric with indigo dye and visible weave pattern.',
      'fabric_primary',
      null,
    );
    expect(result.hard_fail_codes).toContain('no_garment_noun');
    expect(result.passed).toBe(false);
  });

  it('fails when prompt has no fabric noun', () => {
    const result = validateCostumeCandidate(
      'A kimono hanging on a wooden stand with visible stitching.',
      'fabric_primary',
      null,
    );
    expect(result.hard_fail_codes).toContain('no_fabric_noun');
    expect(result.passed).toBe(false);
  });

  it('rejects generic "clothing" prompt without specific nouns', () => {
    const result = validateCostumeCandidate(
      'Traditional clothing in a historical setting, outfit displayed on mannequin.',
      'fabric_primary',
      null,
    );
    expect(result.passed).toBe(false);
  });

  it('rejects fashion editorial framing', () => {
    const result = validateCostumeCandidate(
      'A silk kimono on a runway fashion show with model pose, haute couture styling.',
      'fabric_primary',
      null,
    );
    expect(result.hard_fail_codes).toContain('fashion_editorial');
    expect(result.passed).toBe(false);
  });
});

// ── World Validation Mode Tests ─────────────────────────────────────────────

describe('costumeValidation — world validation mode', () => {
  const groundedRules = getModeRules().grounded_realism;
  const fantasticalRules = getModeRules().fantastical;

  it('grounded mode rejects impossible costume constructs', () => {
    const result = validateCostumeCandidate(
      'An enchanted robe of silk with self-weaving threads and glowing fabric patterns.',
      'fabric_primary',
      null,
      groundedRules,
    );
    expect(result.hard_fail_codes).toContain('impossible_costume');
    expect(result.passed).toBe(false);
  });

  it('fantastical mode allows impossible costume constructs', () => {
    const result = validateCostumeCandidate(
      'An enchanted robe of silk with self-weaving threads, worn by a draped figure.',
      'fabric_primary',
      null,
      fantasticalRules,
    );
    expect(result.hard_fail_codes).not.toContain('impossible_costume');
  });
});

// ── Anchor Locking Tests ────────────────────────────────────────────────────

describe('costumeValidation — anchor locking', () => {
  it('fabric_primary establishes anchor fingerprint', () => {
    const result = validateCostumeCandidate(
      'A hemp robe with visible hand stitching and natural undyed weave.',
      'fabric_primary',
      null,
    );
    expect(result.passed).toBe(true);
    expect(result.fingerprint.fabric_family).toBe('hemp');
    expect(result.fingerprint.garment_family).toBe('robe');
  });

  it('downstream fabric_wear preserves anchor family', () => {
    const anchor: CostumeFamilyFingerprint = {
      fabric_family: 'hemp',
      garment_family: 'robe',
      construction_family: 'stitch',
      class_signal: 'unspecified',
    };
    const result = validateCostumeCandidate(
      'A worn hemp robe with frayed seams, sun-faded and threadbare patches.',
      'fabric_wear',
      anchor,
    );
    expect(result.passed).toBe(true);
    expect(result.advisory_codes).not.toContain('fabric_family_mismatch');
  });

  it('downstream fabric_repair requires repair evidence', () => {
    const anchor: CostumeFamilyFingerprint = {
      fabric_family: 'hemp',
      garment_family: 'robe',
      construction_family: 'stitch',
      class_signal: 'unspecified',
    };
    const result = validateCostumeCandidate(
      'A hemp robe in pristine condition, freshly woven fabric.',
      'fabric_repair',
      anchor,
    );
    expect(result.slot_expectation_met).toBe(false);
    expect(result.slot_expectation_failures).toContain('missing_repair_evidence');
  });

  it('fabric_repair passes with repair evidence', () => {
    const anchor: CostumeFamilyFingerprint = {
      fabric_family: 'hemp',
      garment_family: 'robe',
      construction_family: 'stitch',
      class_signal: 'unspecified',
    };
    const result = validateCostumeCandidate(
      'A patched hemp robe with darned seams and re-stitched hem panels.',
      'fabric_repair',
      anchor,
    );
    expect(result.passed).toBe(true);
  });
});

// ── Class/Ceremonial Slot Tests ─────────────────────────────────────────────

describe('costumeValidation — class and ceremonial slots', () => {
  it('working_class requires class signal', () => {
    const result = validateCostumeCandidate(
      'A linen robe with simple hem and visible stitching.',
      'working_class',
      null,
    );
    expect(result.slot_expectation_failures).toContain('missing_class_signal');
  });

  it('working_class passes with class + wear signals', () => {
    const result = validateCostumeCandidate(
      'A worn linen robe of a peasant laborer, frayed and sun-faded from field work.',
      'working_class',
      null,
    );
    expect(result.passed).toBe(true);
  });

  it('ceremonial_variant requires ceremonial context', () => {
    const result = validateCostumeCandidate(
      'A silk kimono with brocade obi sash and embroidery trim.',
      'ceremonial_variant',
      null,
    );
    expect(result.slot_expectation_failures).toContain('missing_ceremonial_context');
  });

  it('ceremonial_variant passes with ceremonial context', () => {
    const result = validateCostumeCandidate(
      'A silk kimono with brocade obi for a formal temple ceremony, ritual processional garment.',
      'ceremonial_variant',
      null,
    );
    expect(result.passed).toBe(true);
  });
});

// ── Diagnostics Serialization Tests ─────────────────────────────────────────

describe('costumeValidation — diagnostics serialization', () => {
  it('produces stable serialized shape', () => {
    const result = validateCostumeCandidate(
      'A worn silk kimono with visible hand stitching.',
      'fabric_primary',
      null,
    );
    const diag = serializeCostumeDiagnostics(result, 'selected_valid', null, 'kimono');
    expect(diag).toHaveProperty('costume_validation');
    const cv = diag.costume_validation as Record<string, unknown>;
    expect(cv).toHaveProperty('slot_key', 'fabric_primary');
    expect(cv).toHaveProperty('fingerprint');
    expect(cv).toHaveProperty('fingerprint_key');
    expect(cv).toHaveProperty('scores');
    expect(cv).toHaveProperty('overall_score');
    expect(cv).toHaveProperty('passed');
    expect(cv).toHaveProperty('hard_fail_codes');
    expect(cv).toHaveProperty('advisory_codes');
    expect(cv).toHaveProperty('slot_expectation_met');
    expect(cv).toHaveProperty('slot_expectation_failures');
    expect(cv).toHaveProperty('selection_status', 'selected_valid');
    expect(cv).toHaveProperty('anchor_ref');
    expect(cv).toHaveProperty('anchor_garment_noun', 'kimono');
    expect(cv).toHaveProperty('scoring_model');
    expect(cv).toHaveProperty('validation_version');
  });
});

// ── Fingerprint Tests ───────────────────────────────────────────────────────

describe('costumeValidation — fingerprint', () => {
  it('derives fabric and garment families correctly', () => {
    const fp = deriveCostumeFingerprint('a silk kimono with embroidery');
    expect(fp.fabric_family).toBe('silk');
    expect(fp.garment_family).toBe('kimono');
  });

  it('fingerprint key is deterministic', () => {
    const fp = deriveCostumeFingerprint('a hemp robe with stitch detail');
    const key = costumeFingerprintKey(fp);
    expect(key).toContain('hemp');
    expect(key).toContain('robe');
    expect(key).toContain('stitch');
  });
});
