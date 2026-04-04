import { describe, it, expect } from 'vitest';
import {
  deriveMotifFingerprint,
  fingerprintKey,
  detectHardFails,
  scorePhysicalPlausibility,
  scoreMaterialLegibility,
  scoreUseTrace,
  scoreWorldEmbeddedness,
  scoreMotifLineage,
  validateMotifCandidate,
  checkMotifInvariants,
  isMotifFamilyApprovalReady,
  type MotifFamilyFingerprint,
} from '../motifValidation';

// ── Test 1: Abstract symbolic object rejected ────────────────────────────
describe('detectHardFails', () => {
  it('rejects abstract symbolic installation', () => {
    const fails = detectHardFails('A symbolic installation representing the spirit of renewal');
    expect(fails).toContain('symbolic_installation');
    expect(fails).toContain('ceremonial_icon_staging'); // "representing"
  });

  it('rejects fantasy/mythic motif', () => {
    const fails = detectHardFails('A mythical dragon gate carved with ancient divine symbols');
    expect(fails).toContain('mythic_imagery');
    expect(fails).toContain('fantasy_creature');
  });

  it('rejects concept art composition', () => {
    const fails = detectHardFails('Concept art mood board of textures and patterns');
    expect(fails).toContain('concept_art_composition');
  });

  it('fails when no material nouns present', () => {
    const fails = detectHardFails('An abstract spiral floating in space');
    expect(fails).toContain('no_material_nouns');
  });

  it('fails when no physical object present', () => {
    const fails = detectHardFails('A symbolic concept with stone material');
    expect(fails).toContain('no_physical_object');
  });

  it('does NOT false-positive on instruction/negative blocks', () => {
    // This is the actual motif prompt structure — the grounding block says
    // "MUST NOT be: a symbolic installation or abstract sculpture"
    // and world rules mention "mythology". These must NOT trigger hard fails.
    const realPrompt = `Production motif — Material Primary. Close-up of a worn ceramic bowl on a wooden shelf.

[MOTIF GROUNDING — MANDATORY]
This motif MUST NOT be:
- a symbolic installation or abstract sculpture
- a fantasy construct or mythic visualization

[STRICT] No abstract sculptures. No symbolic installations. No mythic imagery.

ENVIRONMENT RULES: - Magic and mythology are subtly woven into the world as legends and symbolism.

WORLD RULES:
  - Magic and mythology are subtly woven into the world.`;

    const fails = detectHardFails(realPrompt);
    expect(fails).not.toContain('symbolic_installation');
    expect(fails).not.toContain('abstract_sculpture');
    expect(fails).not.toContain('mythic_imagery');
    // Should still detect material and object presence
    expect(fails).not.toContain('no_material_nouns');
    expect(fails).not.toContain('no_physical_object');
  });
});

// ── Test 4: Valid production motif passes ─────────────────────────────────
describe('validateMotifCandidate', () => {
  it('passes valid chipped ceramic vessel on workshop shelf', () => {
    const prompt = 'Close-up of a chipped ceramic bowl resting on a wooden shelf in a potter workshop. Aged clay surface with visible glaze cracks and fingerprint wear marks. Cinematic detail shot.';
    const result = validateMotifCandidate(prompt, 'motif_primary', null);
    expect(result.hard_fail_codes).toHaveLength(0);
    expect(result.passed).toBe(true);
    expect(result.fingerprint.material_family).toBe('clay_ceramic');
    expect(result.scores.physical_plausibility).toBeGreaterThanOrEqual(50);
  });

  it('passes worn timber joinery with repair', () => {
    const prompt = 'Detail of a repaired wooden beam joint, showing original mortise and tenon with newer wood patch. Visible grain difference, aged patina on original timber. Set interior.';
    const result = validateMotifCandidate(prompt, 'motif_repair', null);
    expect(result.hard_fail_codes).toHaveLength(0);
    expect(result.passed).toBe(true);
    expect(result.fingerprint.material_family).toBe('wood');
  });

  it('rejects abstract sculpture for motif_primary', () => {
    const prompt = 'An abstract sculpture embodying the spirit of transformation. Conceptual art installation in gallery lighting.';
    const result = validateMotifCandidate(prompt, 'motif_primary', null);
    expect(result.hard_fail_codes.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it('rejects pristine gallery object with low use-trace', () => {
    const prompt = 'A perfect pristine ceramic vessel on a museum pedestal in spotlight. Immaculate unblemished surface.';
    const result = validateMotifCandidate(prompt, 'motif_primary', null);
    expect(result.advisory_codes).toContain('gallery_isolation');
    expect(result.scores.use_trace).toBeLessThan(40);
  });
});

// ── Test 5-6: Family lineage ─────────────────────────────────────────────
describe('motif lineage', () => {
  const ceramicAnchor: MotifFamilyFingerprint = {
    material_family: 'clay_ceramic',
    object_family: 'vessel',
    condition_family: 'worn',
    use_trace_family: 'handled',
  };

  it('variant matching primary family scores high', () => {
    const prompt = 'A cracked ceramic pot with visible repair lines, resting among stacked bowls in the workshop.';
    const result = validateMotifCandidate(prompt, 'motif_variant', ceramicAnchor);
    expect(result.scores.motif_lineage).toBeGreaterThanOrEqual(60);
    expect(result.advisory_codes).not.toContain('lineage_material_mismatch');
  });

  it('variant with unrelated material family fails lineage', () => {
    const prompt = 'A rusted iron anvil with hammer marks on a forge floor. Metal working tools scattered around.';
    const result = validateMotifCandidate(prompt, 'motif_variant', ceramicAnchor);
    expect(result.advisory_codes).toContain('lineage_material_mismatch');
    expect(result.scores.motif_lineage).toBeLessThan(60);
  });
});

// ── Test 7-8: Slot expectation enforcement ───────────────────────────────
describe('slot expectation enforcement', () => {
  const anchor: MotifFamilyFingerprint = {
    material_family: 'clay_ceramic',
    object_family: 'vessel',
    condition_family: 'worn',
    use_trace_family: 'handled',
  };

  it('motif_damage without visible damage fails', () => {
    const prompt = 'A pristine intact ceramic vessel with perfect glaze. Beautiful unblemished porcelain bowl on a shelf.';
    const result = validateMotifCandidate(prompt, 'motif_damage', anchor);
    expect(result.advisory_codes).toContain('damage_not_visible');
    expect(result.slot_expectation_met).toBe(false);
  });

  it('motif_repair without visible repair fails', () => {
    const prompt = 'A weathered ceramic bowl stored on shelf. Clay surface with natural aging.';
    const result = validateMotifCandidate(prompt, 'motif_repair', anchor);
    // repair slot requires repaired condition_family
    expect(result.slot_expectation_failures.length).toBeGreaterThan(0);
  });
});

// ── Test 9: Family-dependent slots fail closed when primary missing ──────
describe('IEL invariants', () => {
  it('fails closed when primary is missing and dependent slots exist', () => {
    const variantResult = validateMotifCandidate(
      'A cracked ceramic bowl on workshop shelf. Clay vessel with repair marks.',
      'motif_variant',
      null,
    );
    const violations = checkMotifInvariants([variantResult]);
    const invE = violations.find(v => v.code === 'MOTIF_INV_E');
    expect(invE).toBeDefined();
    expect(invE?.blocking).toBe(true);
  });

  it('family approval blocked when primary is invalid', () => {
    const primaryResult = validateMotifCandidate(
      'An abstract sculpture representing spiritual transformation',
      'motif_primary',
      null,
    );
    const variantResult = validateMotifCandidate(
      'A cracked ceramic bowl on workshop shelf.',
      'motif_variant',
      primaryResult.fingerprint,
    );
    const { ready, blocking_reasons } = isMotifFamilyApprovalReady([primaryResult, variantResult]);
    expect(ready).toBe(false);
    expect(blocking_reasons.length).toBeGreaterThan(0);
  });

  it('valid family passes all invariants', () => {
    const primaryResult = validateMotifCandidate(
      'Close-up of a worn ceramic bowl on a wooden shelf. Chipped rim, aged clay glaze with fingerprint marks.',
      'motif_primary',
      null,
    );
    const variantResult = validateMotifCandidate(
      'A cracked ceramic pot resting on its side near the kiln. Same clay body, different state of wear.',
      'motif_variant',
      primaryResult.fingerprint,
    );
    const damageResult = validateMotifCandidate(
      'A broken ceramic vessel, shattered into shards on earthen floor. Cracked clay fragments visible.',
      'motif_damage',
      primaryResult.fingerprint,
    );
    const repairResult = validateMotifCandidate(
      'A ceramic bowl repaired with visible mending seams. Kintsugi-style joins on clay surface.',
      'motif_repair',
      primaryResult.fingerprint,
    );
    const { ready } = isMotifFamilyApprovalReady([primaryResult, variantResult, damageResult, repairResult]);
    expect(ready).toBe(true);
  });
});

// ── Test 10: Source extraction handles various input types ────────────────
describe('deriveMotifFingerprint', () => {
  it('handles empty string', () => {
    const fp = deriveMotifFingerprint('');
    expect(fp.material_family).toBe('unknown');
    expect(fp.object_family).toBe('unknown');
  });

  it('correctly identifies clay ceramic vessel', () => {
    const fp = deriveMotifFingerprint('A clay pottery bowl with cracked glaze');
    expect(fp.material_family).toBe('clay_ceramic');
    expect(fp.object_family).toBe('vessel');
    expect(fp.condition_family).toBe('cracked');
  });

  it('correctly identifies metal tool', () => {
    const fp = deriveMotifFingerprint('A worn iron hammer on the forge floor');
    expect(fp.material_family).toBe('metal');
    expect(fp.object_family).toBe('tool');
    expect(fp.condition_family).toBe('worn');
  });

  it('correctly identifies repaired wood joinery', () => {
    const fp = deriveMotifFingerprint('Repaired wooden beam with mortise joint patch');
    expect(fp.material_family).toBe('wood');
    expect(fp.object_family).toBe('joinery_fastener');
    expect(fp.condition_family).toBe('repaired');
    expect(fp.use_trace_family).toBe('repaired');
  });

  it('fingerprintKey is deterministic', () => {
    const fp1 = deriveMotifFingerprint('clay bowl chipped');
    const fp2 = deriveMotifFingerprint('clay bowl chipped');
    expect(fingerprintKey(fp1)).toBe(fingerprintKey(fp2));
  });
});

// ── Phase B: Enforcement tests ──────────────────────────────────────────

import {
  resolveLineageStatus,
  resolveMotifSelectionStatus,
  serializeMotifDiagnostics,
  type MotifLineageStatus,
} from '../motifValidation';

describe('resolveLineageStatus', () => {
  const validResult = validateMotifCandidate('clay bowl chipped worn shelf workshop', 'motif_variant', { material_family: 'clay_ceramic', object_family: 'vessel', condition_family: 'intact', use_trace_family: 'handled' });

  it('primary is always anchor', () => {
    expect(resolveLineageStatus('motif_primary', validResult, null, true, true)).toBe('anchor');
  });

  it('dependent slot blocked when primary missing', () => {
    expect(resolveLineageStatus('motif_variant', validResult, null, false, false)).toBe('blocked_missing_primary');
  });

  it('dependent slot blocked when primary invalid', () => {
    const anchor: MotifFamilyFingerprint = { material_family: 'clay_ceramic', object_family: 'vessel', condition_family: 'intact', use_trace_family: 'handled' };
    expect(resolveLineageStatus('motif_variant', validResult, anchor, true, false)).toBe('blocked_invalid_primary');
  });

  it('dependent slot matches when lineage score >= 40', () => {
    const anchor: MotifFamilyFingerprint = { material_family: 'clay_ceramic', object_family: 'vessel', condition_family: 'intact', use_trace_family: 'handled' };
    expect(resolveLineageStatus('motif_variant', validResult, anchor, true, true)).toBe('match');
  });
});

describe('resolveMotifSelectionStatus', () => {
  it('hard fail rejects', () => {
    const v = validateMotifCandidate('A symbolic installation of abstract sculpture', 'motif_primary', null);
    const ls = resolveLineageStatus('motif_primary', v, null, true, true);
    expect(resolveMotifSelectionStatus(v, ls)).toBe('rejected_hard_fail');
  });

  it('valid clay bowl passes', () => {
    const v = validateMotifCandidate('clay ceramic bowl chipped worn shelf workshop detail', 'motif_primary', null);
    const ls = resolveLineageStatus('motif_primary', v, null, true, true);
    expect(resolveMotifSelectionStatus(v, ls)).toBe('selected_valid');
  });

  it('missing primary blocks dependent', () => {
    const v = validateMotifCandidate('clay bowl cracked worn shelf workshop', 'motif_damage', null);
    const ls: MotifLineageStatus = 'blocked_missing_primary';
    expect(resolveMotifSelectionStatus(v, ls)).toBe('blocked_missing_primary_anchor');
  });
});

describe('mixed-material fingerprint stability', () => {
  it('returns dominant material regardless of word order', () => {
    const fp1 = deriveMotifFingerprint('clay ceramic pottery bowl with wood shelf');
    const fp2 = deriveMotifFingerprint('wood shelf holding clay ceramic pottery bowl');
    // clay has more matches (clay, ceramic, pottery) vs wood (wood) — should be clay_ceramic
    expect(fp1.material_family).toBe('clay_ceramic');
    expect(fp2.material_family).toBe('clay_ceramic');
  });
});

describe('repair slot strictness', () => {
  it('craft_labor alone does not satisfy repair slot', () => {
    const v = validateMotifCandidate('clay ceramic pottery making shaping throwing kiln workshop detail', 'motif_repair', null);
    expect(v.slot_expectation_met).toBe(false);
    expect(v.advisory_codes).toContain('repair_not_visible');
  });

  it('actual repair evidence satisfies repair slot', () => {
    const v = validateMotifCandidate('clay ceramic bowl repaired mended kintsugi gold seam shelf workshop detail', 'motif_repair', null);
    expect(v.slot_expectation_met).toBe(true);
  });
});

describe('serializeMotifDiagnostics', () => {
  it('produces canonical payload', () => {
    const v = validateMotifCandidate('clay bowl shelf workshop detail', 'motif_primary', null);
    const diag = serializeMotifDiagnostics(v, 'anchor', 'selected_valid', null);
    expect(diag.motif_validation).toBeDefined();
    const mv = diag.motif_validation as any;
    expect(mv.lineage_status).toBe('anchor');
    expect(mv.selection_status).toBe('selected_valid');
    expect(mv.scoring_model).toBe('motif_physical_v1');
  });
});

// ── False-positive prevention: canonical world binding block ────────────
describe('extractDescriptiveContent - canonical blocks', () => {
  it('strips CANONICAL WORLD BINDING block containing mythology references', () => {
    const prompt = `Production motif — Material Object. A worn ceramic bowl on a shelf.

[CANONICAL WORLD BINDING — PROJECT UNIVERSE COHERENCE REQUIRED]

WORLD RULES:
  - Feudal Japan with rigid social hierarchies and honor codes.
  - Magic and mythology are subtly woven into the world as legends and symbolism.

ENFORCE: All imagery must belong to THIS project's world.`;

    const fails = detectHardFails(prompt);
    expect(fails).not.toContain('mythic_imagery');
    expect(fails).not.toContain('ceremonial_icon_staging');
  });

  it('strips PRODUCTION DESIGN block', () => {
    const prompt = `Close-up of a clay pot with cracks.

[PRODUCTION DESIGN — WORLD CONSISTENCY]
MATERIALS: natural wood, stone, fabric
ENVIRONMENT RULES: - Magic and mythology are subtly woven into the world.`;

    const fails = detectHardFails(prompt);
    expect(fails).not.toContain('mythic_imagery');
  });

  it('strips VISUAL PRIORITY and SEMANTIC ROLE blocks', () => {
    const prompt = `Detail shot of a wooden bowl fragment.

[SEMANTIC ROLE AUTHORITY]
symbolic_motif: symbolic and thematic visual motifs

[VISUAL PRIORITY — SLOT AUTHORITY: motif_symbolic]
SECONDARY: Ambient light, atmospheric haze`;

    const fails = detectHardFails(prompt);
    // "symbolic" in block header should not trigger false positive
    expect(fails).not.toContain('symbolic_installation');
  });
});

// ── Prompt object noun validation tests ──────────────────────────────────
describe('motif prompt object noun requirements', () => {
  it('validator still rejects prompts with only generic "object" or "surface"', () => {
    const genericPrompt = 'Photograph a real, physically existing object or surface that recurs in the world.';
    const fails = detectHardFails(genericPrompt);
    expect(fails).toContain('no_physical_object');
  });

  it('validator passes when concrete object noun "bowl" is present', () => {
    const concretePrompt = 'Production motif — ceramic bowl. Photograph a real ceramic bowl with visible wear and patina.';
    const fails = detectHardFails(concretePrompt);
    expect(fails).not.toContain('no_physical_object');
  });

  it('validator passes when concrete object noun "shelf" is present', () => {
    const prompt = 'Production motif — worn wooden shelf. Show a weathered shelf in a workshop context.';
    const fails = detectHardFails(prompt);
    expect(fails).not.toContain('no_physical_object');
  });

  it('validator passes damage motif with "cracked pot"', () => {
    const prompt = 'Production motif — cracked clay pot. Show real physical damage on a clay pot.';
    const fails = detectHardFails(prompt);
    expect(fails).not.toContain('no_physical_object');
  });

  it('validator passes repair motif with "repaired vessel"', () => {
    const prompt = 'Production motif — repaired ceramic vessel. Show mending and restoration on a vessel.';
    const fails = detectHardFails(prompt);
    expect(fails).not.toContain('no_physical_object');
  });
});
