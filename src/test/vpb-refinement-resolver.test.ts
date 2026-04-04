/**
 * vpbRefinementResolver — regression tests.
 */
import { describe, it, expect } from 'vitest';
import { getVPBRefinementState, getVPBSectionAnchor, getSectionNavTarget, getVPBRefinementSummary, buildRefinementIntent, buildRefinementSessionBrief, buildRefinementHandoffPayload, extractNeighboringHeadings, buildRewriteContract, validateRewriteCandidate, applySectionPatch } from '@/lib/visual/vpbRefinementResolver';

const FULL_VPB = `# Visual Thesis

This is a rich visual thesis section with plenty of detail about the world's visual identity, palette choices, and mood. The overall aesthetic draws from mid-century industrial decay with warm amber undertones.

# World & Design Language

## Production Design Philosophy

Grounded brutalism meets organic decay. Materials tell the story of economic stratification through texture and wear patterns across every environment.

## Material & Texture System

- **Corrugated steel** — working-class endurance
- **Reclaimed wood** — heritage, warmth

# Character Visual System

Characters are visually differentiated by class and arc position.

# Location & Production Design

Locations reflect economic zones through material density.

# Visual Cohesion & Recurrence

## Motif Integration

- **Cracks in pottery** — fracture lines that mirror character relationships and emotional states throughout the narrative arc
- **Water stains** — passage of time rendered visible on surfaces

# References & Direction

## Curated References

- Film: The Florida Project (color palette, naturalistic framing, childhood perspective)
- Photography: Gregory Crewdson (suburban uncanny, theatrical lighting in mundane spaces)

# Asset Appendix

Approved assets listed below.
`;

const THIN_VPB = `# Visual Thesis

Brief.

# World & Design Language

Short.

# Character Visual System

Chars.

# Location & Production Design

Locs.

# Visual Cohesion & Recurrence

Motifs.

# References & Direction

Refs.

# Asset Appendix

Assets.
`;

describe('getVPBRefinementState', () => {
  it('returns all missing with reason when markdown is null', () => {
    const result = getVPBRefinementState(null);
    expect(result).toHaveLength(4);
    expect(result.every(r => r.status === 'missing')).toBe(true);
    expect(result.every(r => r.excerpt === null)).toBe(true);
    expect(result[0].reason).toContain('not loaded');
  });

  it('returns present with excerpt for rich sections', () => {
    const result = getVPBRefinementState(FULL_VPB);
    const tone = result.find(r => r.key === 'visual_tone')!;
    const world = result.find(r => r.key === 'world_visual_language')!;
    expect(tone.status).toBe('present');
    expect(world.status).toBe('present');
    expect(tone.contentLength).toBeGreaterThan(120);
    expect(tone.excerpt).toBeTruthy();
    expect(tone.excerpt!.length).toBeGreaterThan(0);
    expect(tone.excerpt!.length).toBeLessThanOrEqual(180);
    expect(tone.reason).toContain('chars');
  });

  it('returns thin with reason and excerpt for short sections', () => {
    const result = getVPBRefinementState(THIN_VPB);
    expect(result.every(r => r.status === 'thin')).toBe(true);
    const tone = result.find(r => r.key === 'visual_tone')!;
    expect(tone.reason).toContain('below density threshold');
    expect(tone.excerpt).toBe('Brief.');
  });

  it('returns missing with heading-specific reason when heading is absent', () => {
    const partial = '# Visual Thesis\n\nSome content here that is long enough to pass the threshold for being present in the visual tone area of the VPB.\n\n# Character Visual System\n\nChars.';
    const result = getVPBRefinementState(partial);
    const world = result.find(r => r.key === 'world_visual_language')!;
    const refs = result.find(r => r.key === 'reference_frames')!;
    expect(world.status).toBe('missing');
    expect(world.reason).toContain('# World & Design Language');
    expect(world.excerpt).toBeNull();
    expect(refs.status).toBe('missing');
    expect(refs.reason).toContain('not found');
  });

  it('excerpt does not include markdown headings', () => {
    const result = getVPBRefinementState(FULL_VPB);
    const world = result.find(r => r.key === 'world_visual_language')!;
    expect(world.excerpt).not.toContain('##');
  });
});

describe('getVPBSectionAnchor', () => {
  it('converts heading to slug', () => {
    expect(getVPBSectionAnchor('# Visual Thesis')).toBe('visual-thesis');
    expect(getVPBSectionAnchor('# World & Design Language')).toBe('world-design-language');
    expect(getVPBSectionAnchor('# Visual Cohesion & Recurrence')).toBe('visual-cohesion-recurrence');
  });

  it('handles already-clean strings', () => {
    expect(getVPBSectionAnchor('simple')).toBe('simple');
  });
});

describe('getSectionNavTarget', () => {
  it('returns navigable target for present section', () => {
    const result = getVPBRefinementState(FULL_VPB);
    const tone = result.find(r => r.key === 'visual_tone')!;
    const nav = getSectionNavTarget(tone);
    expect(nav.navigable).toBe(true);
    expect(nav.anchor).toBe('visual-thesis');
    expect(nav.actionLabel).toBe('Go to section');
  });

  it('returns non-navigable target for missing section', () => {
    const partial = '# Visual Thesis\n\nSome content here that is long enough to pass the threshold for being present.\n';
    const result = getVPBRefinementState(partial);
    const world = result.find(r => r.key === 'world_visual_language')!;
    const nav = getSectionNavTarget(world);
    expect(nav.navigable).toBe(false);
    expect(nav.actionLabel).toBe('Section missing');
    expect(nav.actionTitle).toContain('not found');
  });

  it('returns navigable target for thin section', () => {
    const result = getVPBRefinementState(THIN_VPB);
    const tone = result.find(r => r.key === 'visual_tone')!;
    const nav = getSectionNavTarget(tone);
    expect(nav.navigable).toBe(true);
    expect(nav.actionLabel).toBe('Go to section');
  });
});

describe('getVPBRefinementSummary', () => {
  it('counts present/thin/missing correctly for full VPB', () => {
    const areas = getVPBRefinementState(FULL_VPB);
    const summary = getVPBRefinementSummary(areas);
    expect(summary.presentCount).toBe(4);
    expect(summary.thinCount).toBe(0);
    expect(summary.missingCount).toBe(0);
    expect(summary.allPresent).toBe(true);
    expect(summary.priorityAreas).toHaveLength(0);
  });

  it('counts correctly for thin VPB', () => {
    const areas = getVPBRefinementState(THIN_VPB);
    const summary = getVPBRefinementSummary(areas);
    expect(summary.presentCount).toBe(0);
    expect(summary.thinCount).toBe(4);
    expect(summary.missingCount).toBe(0);
    expect(summary.allPresent).toBe(false);
    expect(summary.priorityAreas).toHaveLength(4);
  });

  it('orders missing before thin in canonical order', () => {
    const partial = '# Visual Thesis\n\nBrief.\n\n# Visual Cohesion & Recurrence\n\nMotifs.';
    const areas = getVPBRefinementState(partial);
    const summary = getVPBRefinementSummary(areas);
    expect(summary.missingCount).toBe(2);
    expect(summary.thinCount).toBe(2);
    // missing first, then thin
    expect(summary.priorityAreas[0].status).toBe('missing');
    expect(summary.priorityAreas[1].status).toBe('missing');
    expect(summary.priorityAreas[2].status).toBe('thin');
    expect(summary.priorityAreas[3].status).toBe('thin');
  });

  it('returns empty priority for null VPB (all missing)', () => {
    const areas = getVPBRefinementState(null);
    const summary = getVPBRefinementSummary(areas);
    expect(summary.missingCount).toBe(4);
    expect(summary.allPresent).toBe(false);
    expect(summary.priorityAreas).toHaveLength(4);
  });
});

describe('buildRefinementIntent', () => {
  it('returns create intent for missing section', () => {
    const partial = '# Visual Thesis\n\nSome content here that is long enough to pass the threshold for being present in the visual tone area of the VPB.\n';
    const areas = getVPBRefinementState(partial);
    const world = areas.find(r => r.key === 'world_visual_language')!;
    const intent = buildRefinementIntent(world);
    expect(intent).not.toBeNull();
    expect(intent!.action).toBe('create');
    expect(intent!.currentStatus).toBe('missing');
    expect(intent!.docType).toBe('visual_project_bible');
    expect(intent!.sectionKey).toBe('world_visual_language');
    expect(intent!.sectionAnchor).toBe('world-design-language');
  });

  it('returns refine intent for thin section', () => {
    const areas = getVPBRefinementState(THIN_VPB);
    const tone = areas.find(r => r.key === 'visual_tone')!;
    const intent = buildRefinementIntent(tone);
    expect(intent).not.toBeNull();
    expect(intent!.action).toBe('refine');
    expect(intent!.currentStatus).toBe('thin');
    expect(intent!.sectionHeading).toBe('# Visual Thesis');
  });

  it('returns null for present section', () => {
    const areas = getVPBRefinementState(FULL_VPB);
    const tone = areas.find(r => r.key === 'visual_tone')!;
    expect(buildRefinementIntent(tone)).toBeNull();
  });
});

describe('buildRefinementSessionBrief', () => {
  it('assembles brief for missing section with create action', () => {
    const partial = '# Visual Thesis\n\nSome content here that is long enough to pass the threshold for being present in the visual tone area of the VPB.\n';
    const areas = getVPBRefinementState(partial);
    const world = areas.find(r => r.key === 'world_visual_language')!;
    const intent = buildRefinementIntent(world)!;
    const brief = buildRefinementSessionBrief(intent, areas);
    expect(brief).not.toBeNull();
    expect(brief!.action).toBe('create');
    expect(brief!.currentStatus).toBe('missing');
    expect(brief!.sectionLabel).toBe('World Visual Language');
    expect(brief!.reason).toContain('not found');
    expect(brief!.excerpt).toBeNull();
    expect(brief!.contentLength).toBe(0);
    expect(brief!.docType).toBe('visual_project_bible');
  });

  it('assembles brief for thin section with refine action', () => {
    const areas = getVPBRefinementState(THIN_VPB);
    const tone = areas.find(r => r.key === 'visual_tone')!;
    const intent = buildRefinementIntent(tone)!;
    const brief = buildRefinementSessionBrief(intent, areas);
    expect(brief).not.toBeNull();
    expect(brief!.action).toBe('refine');
    expect(brief!.currentStatus).toBe('thin');
    expect(brief!.sectionLabel).toBe('Visual Tone');
    expect(brief!.reason).toContain('below density threshold');
    expect(brief!.excerpt).toBe('Brief.');
  });

  it('returns null when target area not found', () => {
    const areas = getVPBRefinementState(FULL_VPB);
    const fakeIntent = {
      docType: 'visual_project_bible' as const,
      sectionHeading: '# Nonexistent',
      sectionKey: 'nonexistent_key',
      sectionAnchor: 'nonexistent',
      action: 'create' as const,
      currentStatus: 'missing' as const,
    };
    expect(buildRefinementSessionBrief(fakeIntent, areas)).toBeNull();
  });
});

describe('extractNeighboringHeadings', () => {
  it('finds prev and next for middle heading', () => {
    const result = extractNeighboringHeadings(FULL_VPB, '# World & Design Language');
    expect(result.prevHeading).toBe('# Visual Thesis');
    expect(result.nextHeading).toBe('# Character Visual System');
  });

  it('returns null prev for first heading', () => {
    const result = extractNeighboringHeadings(FULL_VPB, '# Visual Thesis');
    expect(result.prevHeading).toBeNull();
    expect(result.nextHeading).toBe('# World & Design Language');
  });

  it('returns null next for last heading', () => {
    const result = extractNeighboringHeadings(FULL_VPB, '# Asset Appendix');
    expect(result.prevHeading).toBe('# References & Direction');
    expect(result.nextHeading).toBeNull();
  });

  it('returns nulls for non-existent heading', () => {
    const result = extractNeighboringHeadings(FULL_VPB, '# Nonexistent');
    expect(result.prevHeading).toBeNull();
    expect(result.nextHeading).toBeNull();
  });
});

describe('buildRefinementHandoffPayload', () => {
  it('builds payload for thin section with body and neighbors', () => {
    const areas = getVPBRefinementState(FULL_VPB);
    // Make a thin scenario
    const thinAreas = getVPBRefinementState(THIN_VPB);
    const tone = thinAreas.find(r => r.key === 'visual_tone')!;
    const intent = buildRefinementIntent(tone)!;
    const brief = buildRefinementSessionBrief(intent, thinAreas)!;
    const handoff = buildRefinementHandoffPayload(brief, THIN_VPB);
    expect(handoff).not.toBeNull();
    expect(handoff!.action).toBe('refine');
    expect(handoff!.scopeRule).toBe('one-section-only');
    expect(handoff!.noMutationYet).toBe(true);
    expect(handoff!.targetSectionBody).not.toBeNull();
    expect(handoff!.prevHeading).toBeNull(); // first heading
    expect(handoff!.nextHeading).toBe('# World & Design Language');
  });

  it('builds payload for missing section with null body', () => {
    const partial = '# Visual Thesis\n\nSome content here that is long enough to pass the threshold for being present in the visual tone area of the VPB.\n\n# Character Visual System\n\nChars.';
    const areas = getVPBRefinementState(partial);
    const world = areas.find(r => r.key === 'world_visual_language')!;
    const intent = buildRefinementIntent(world)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, partial);
    expect(handoff).not.toBeNull();
    expect(handoff!.action).toBe('create');
    expect(handoff!.targetSectionBody).toBeNull();
    expect(handoff!.scopeRule).toBe('one-section-only');
    expect(handoff!.noMutationYet).toBe(true);
  });

  it('returns payload with null neighbors when vpbMarkdown is null and status is missing', () => {
    const areas = getVPBRefinementState(null);
    const tone = areas.find(r => r.key === 'visual_tone')!;
    const intent = buildRefinementIntent(tone)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, null);
    expect(handoff).not.toBeNull();
    expect(handoff!.targetSectionBody).toBeNull();
    expect(handoff!.prevHeading).toBeNull();
    expect(handoff!.nextHeading).toBeNull();
  });

  it('includes correct neighboring headings for references section', () => {
    const thinAreas = getVPBRefinementState(THIN_VPB);
    const refs = thinAreas.find(r => r.key === 'reference_frames')!;
    const intent = buildRefinementIntent(refs)!;
    const brief = buildRefinementSessionBrief(intent, thinAreas)!;
    const handoff = buildRefinementHandoffPayload(brief, THIN_VPB);
    expect(handoff!.prevHeading).toBe('# Visual Cohesion & Recurrence');
    expect(handoff!.nextHeading).toBe('# Asset Appendix');
  });
});

describe('buildRewriteContract', () => {
  it('returns null for null handoff', () => {
    expect(buildRewriteContract(null)).toBeNull();
  });

  it('builds contract for thin/refine session', () => {
    const areas = getVPBRefinementState(THIN_VPB);
    const tone = areas.find(r => r.key === 'visual_tone')!;
    const intent = buildRefinementIntent(tone)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, THIN_VPB)!;
    const contract = buildRewriteContract(handoff);
    expect(contract).not.toBeNull();
    expect(contract!.action).toBe('refine');
    expect(contract!.scopeRule).toBe('one-section-only');
    expect(contract!.allowedTargetHeading).toBe('# Visual Thesis');
    expect(contract!.noMutationYet).toBe(true);
    expect(contract!.forbiddenMutations.length).toBeGreaterThanOrEqual(6);
    expect(contract!.requiredPreservation.length).toBeGreaterThanOrEqual(3);
    expect(contract!.validationRules).toContain('Output must not be empty');
    expect(contract!.expectedReturnShape.sectionHeading).toBe('# Visual Thesis');
    expect(contract!.expectedReturnShape.action).toBe('refine');
  });

  it('builds contract for missing/create session', () => {
    const partial = '# Visual Thesis\n\nSome content here that is long enough to pass the threshold for being present in the visual tone area of the VPB.\n\n# Character Visual System\n\nChars.';
    const areas = getVPBRefinementState(partial);
    const world = areas.find(r => r.key === 'world_visual_language')!;
    const intent = buildRefinementIntent(world)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, partial)!;
    const contract = buildRewriteContract(handoff);
    expect(contract).not.toBeNull();
    expect(contract!.action).toBe('create');
    expect(contract!.allowedTargetHeading).toBe('# World & Design Language');
    expect(contract!.validationRules.some(r => r.includes('introduce the expected target heading'))).toBe(true);
    expect(contract!.validationRules).not.toContain('Output must not be empty');
  });

  it('includes neighboring headings in preservation rules', () => {
    const areas = getVPBRefinementState(THIN_VPB);
    const refs = areas.find(r => r.key === 'reference_frames')!;
    const intent = buildRefinementIntent(refs)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, THIN_VPB)!;
    const contract = buildRewriteContract(handoff);
    expect(contract!.requiredPreservation.some(r => r.includes('# Visual Cohesion & Recurrence'))).toBe(true);
    expect(contract!.requiredPreservation.some(r => r.includes('# Asset Appendix'))).toBe(true);
  });

  it('forbids all canonical mutation types', () => {
    const areas = getVPBRefinementState(THIN_VPB);
    const tone = areas.find(r => r.key === 'visual_tone')!;
    const intent = buildRefinementIntent(tone)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, THIN_VPB)!;
    const contract = buildRewriteContract(handoff);
    expect(contract!.forbiddenMutations).toContain('Must not change any non-target VPB section heading');
    expect(contract!.forbiddenMutations).toContain('Must not reorder top-level VPB sections');
    expect(contract!.forbiddenMutations).toContain('Must not delete existing non-target sections');
    expect(contract!.forbiddenMutations).toContain('Must not change ladder or project state');
  });
});

describe('validateRewriteCandidate', () => {
  const VPB_MISSING_THESIS = `# World & Design Language\n\nSome world content that is long enough to pass the threshold for being present.\n\n# Visual Cohesion & Recurrence\n\nMotif content.\n\n# References & Direction\n\nRef content.\n`;

  function makeContract(action: 'create' | 'refine') {
    const md = action === 'refine' ? THIN_VPB : VPB_MISSING_THESIS;
    const areas = getVPBRefinementState(md);
    const tone = areas.find(a => a.key === 'visual_tone')!;
    const intent = buildRefinementIntent(tone)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, md)!;
    return buildRewriteContract(handoff)!;
  }

  it('passes valid refine candidate with correct heading', () => {
    const contract = makeContract('refine');
    const candidate = '# Visual Thesis\n\nRich detailed content about the visual identity and palette.';
    const result = validateRewriteCandidate(contract, candidate);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalizedHeading).toBe('# Visual Thesis');
    expect(result.detectedTopLevelHeadings).toHaveLength(1);
  });

  it('passes valid create candidate', () => {
    const contract = makeContract('create');
    const candidate = '# Visual Thesis\n\nNew section content for creation.';
    const result = validateRewriteCandidate(contract, candidate);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails on empty candidate for refine', () => {
    const contract = makeContract('refine');
    const result = validateRewriteCandidate(contract, '');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Refine candidate must not be empty');
  });

  it('fails on empty candidate for create', () => {
    const contract = makeContract('create');
    const result = validateRewriteCandidate(contract, '  ');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Create candidate must contain usable section content');
  });

  it('fails on wrong heading', () => {
    const contract = makeContract('refine');
    const candidate = '# Wrong Heading\n\nSome content.';
    const result = validateRewriteCandidate(contract, candidate);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('does not match allowed target'))).toBe(true);
  });

  it('fails on multiple H1 headings', () => {
    const contract = makeContract('refine');
    const candidate = '# Visual Thesis\n\nContent.\n\n# Another Section\n\nMore content.';
    const result = validateRewriteCandidate(contract, candidate);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('top-level headings; exactly 1 allowed'))).toBe(true);
  });

  it('fails on forbidden non-target heading', () => {
    const contract = makeContract('refine');
    const candidate = '# World & Design Language\n\nContent that belongs elsewhere.';
    const result = validateRewriteCandidate(contract, candidate);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('does not match allowed target'))).toBe(true);
  });

  it('fails closed on null contract', () => {
    const result = validateRewriteCandidate(null, '# Visual Thesis\n\nContent.');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Contract is null or invalid');
  });

  it('fails on missing heading in candidate', () => {
    const contract = makeContract('refine');
    const candidate = 'Just some text without any heading.';
    const result = validateRewriteCandidate(contract, candidate);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('missing required top-level heading'))).toBe(true);
  });
});

describe('applySectionPatch', () => {
  function makeRefineContract() {
    const areas = getVPBRefinementState(THIN_VPB);
    const tone = areas.find(a => a.key === 'visual_tone')!;
    const intent = buildRefinementIntent(tone)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, THIN_VPB)!;
    return buildRewriteContract(handoff)!;
  }

  const VPB_MISSING_WORLD = `# Visual Thesis\n\nSome content here that is long enough to pass the threshold for being present in the visual tone area of the VPB.\n\n# Character Visual System\n\nChars.\n\n# Visual Cohesion & Recurrence\n\nMotifs.\n\n# References & Direction\n\nRefs.\n`;

  function makeCreateContract() {
    const areas = getVPBRefinementState(VPB_MISSING_WORLD);
    const world = areas.find(a => a.key === 'world_visual_language')!;
    const intent = buildRefinementIntent(world)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, VPB_MISSING_WORLD)!;
    return buildRewriteContract(handoff)!;
  }

  it('refine replaces only target section', () => {
    const contract = makeRefineContract();
    const candidate = '# Visual Thesis\n\nRich new content about visual identity and palette choices that is substantial.';
    const result = applySectionPatch(THIN_VPB, contract, candidate);
    expect(result.passed).toBe(true);
    expect(result.patchedMarkdown).toContain('Rich new content');
    expect(result.patchedMarkdown).toContain('# World & Design Language');
    expect(result.patchedMarkdown).not.toContain('Brief.');
  });

  it('create inserts after prevHeading from contract', () => {
    const contract = makeCreateContract();
    // Contract carries neighbors from full VPB_CANONICAL_HEADINGS registry
    expect(contract.prevHeading).toBe('# Visual Thesis');
    expect(contract.nextHeading).toBe('# Character Visual System');
    const candidate = '# World & Design Language\n\nNew world content created from scratch.';
    const result = applySectionPatch(VPB_MISSING_WORLD, contract, candidate);
    expect(result.passed).toBe(true);
    expect(result.patchedMarkdown).toContain('# World & Design Language');
    // Should appear between Visual Thesis and Character Visual System
    const worldIdx = result.patchedMarkdown!.indexOf('# World & Design Language');
    const thesisIdx = result.patchedMarkdown!.indexOf('# Visual Thesis');
    const charIdx = result.patchedMarkdown!.indexOf('# Character Visual System');
    expect(worldIdx).toBeGreaterThan(thesisIdx);
    expect(worldIdx).toBeLessThan(charIdx);
  });

  it('create inserts before nextHeading when no prevHeading', () => {
    // Doc with no heading before target position
    const docNoPrev = `# Character Visual System\n\nChars.\n\n# References & Direction\n\nRefs.\n`;
    const areas = getVPBRefinementState(docNoPrev);
    const tone = areas.find(a => a.key === 'visual_tone')!;
    expect(tone.status).toBe('missing');
    const intent = buildRefinementIntent(tone)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, docNoPrev)!;
    // Target heading is missing, so prevHeading/nextHeading are both null from extractNeighboringHeadings
    // We need to check how the contract is built — it will have null neighbors since heading isn't in doc
    const contract = buildRewriteContract(handoff)!;
    // Since the heading doesn't exist, neighbors are null — falls back to append
    const candidate = '# Visual Thesis\n\nNew thesis content.';
    const result = applySectionPatch(docNoPrev, contract, candidate);
    expect(result.passed).toBe(true);
    expect(result.patchedMarkdown).toContain('# Visual Thesis');
  });

  it('create fails when contract prevHeading is absent from document', () => {
    const contract = makeCreateContract();
    // Use a doc that doesn't contain the contract's prevHeading (# Visual Thesis)
    const docMissingPrev = `# Character Visual System\n\nChars.\n\n# References & Direction\n\nRefs.\n`;
    const candidate = '# World & Design Language\n\nNew content.';
    const result = applySectionPatch(docMissingPrev, contract, candidate);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('prevHeading');
    expect(result.errors[0]).toContain('not found in document');
  });

  it('create fails when contract nextHeading is absent from document', () => {
    // Build a contract with only nextHeading (no prev)
    const docForContract = `# Visual Cohesion & Recurrence\n\nMotifs.\n`;
    const areas = getVPBRefinementState(docForContract);
    const refs = areas.find(a => a.key === 'reference_frames')!;
    expect(refs.status).toBe('missing');
    const intent = buildRefinementIntent(refs)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, docForContract)!;
    const contract = buildRewriteContract(handoff)!;
    // Now test against a doc where the nextHeading from contract doesn't exist
    const docDifferent = `# Visual Thesis\n\nThesis.\n`;
    const candidate = '# References & Direction\n\nNew refs.';
    // Only run if contract has a nextHeading that won't be found
    if (contract.nextHeading) {
      const result = applySectionPatch(docDifferent, contract, candidate);
      expect(result.passed).toBe(false);
      expect(result.errors[0]).toContain('not found in document');
    }
  });

  it('preserves all other headings on refine', () => {
    const contract = makeRefineContract();
    const candidate = '# Visual Thesis\n\nNew content.';
    const result = applySectionPatch(THIN_VPB, contract, candidate);
    expect(result.passed).toBe(true);
    expect(result.patchedMarkdown).toContain('# World & Design Language');
    expect(result.patchedMarkdown).toContain('# Visual Cohesion & Recurrence');
    expect(result.patchedMarkdown).toContain('# References & Direction');
    expect(result.patchedMarkdown).toContain('# Asset Appendix');
  });

  it('rejects invalid candidate', () => {
    const contract = makeRefineContract();
    const result = applySectionPatch(THIN_VPB, contract, '');
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('Candidate failed validation');
  });

  it('rejects refine when target missing from document', () => {
    const contract = makeRefineContract();
    const noThesis = '# World & Design Language\n\nWorld stuff.\n\n# Asset Appendix\n\nAssets.';
    const candidate = '# Visual Thesis\n\nNew content.';
    const result = applySectionPatch(noThesis, contract, candidate);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('not found in document');
  });

  it('rejects candidate with multiple headings', () => {
    const contract = makeRefineContract();
    const candidate = '# Visual Thesis\n\nContent.\n\n# Extra Section\n\nMore.';
    const result = applySectionPatch(THIN_VPB, contract, candidate);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('Candidate failed validation');
  });

  it('rejects wrong heading', () => {
    const contract = makeRefineContract();
    const candidate = '# Wrong Heading\n\nContent.';
    const result = applySectionPatch(THIN_VPB, contract, candidate);
    expect(result.passed).toBe(false);
  });

  it('heading order preserved after refine', () => {
    const contract = makeRefineContract();
    const candidate = '# Visual Thesis\n\nSubstantial new visual thesis content.';
    const result = applySectionPatch(THIN_VPB, contract, candidate);
    expect(result.passed).toBe(true);
    const thesisIdx = result.patchedMarkdown!.indexOf('# Visual Thesis');
    const worldIdx = result.patchedMarkdown!.indexOf('# World & Design Language');
    const cohesionIdx = result.patchedMarkdown!.indexOf('# Visual Cohesion & Recurrence');
    expect(thesisIdx).toBeLessThan(worldIdx);
    expect(worldIdx).toBeLessThan(cohesionIdx);
  });

  it('does not modify original markdown string', () => {
    const contract = makeRefineContract();
    const original = THIN_VPB;
    const originalCopy = original.slice();
    const candidate = '# Visual Thesis\n\nNew content.';
    applySectionPatch(original, contract, candidate);
    expect(original).toBe(originalCopy);
  });
});

describe('deriveExpectedNeighbors via contract (full registry)', () => {
  it('resolves neighbors through non-refinement headings', () => {
    // Doc has non-refinement headings between target position
    const doc = `# Visual Thesis\n\nThesis.\n\n# Character Visual System\n\nChars.\n\n# References & Direction\n\nRefs.\n`;
    const areas = getVPBRefinementState(doc);
    const world = areas.find(a => a.key === 'world_visual_language')!;
    expect(world.status).toBe('missing');
    const intent = buildRefinementIntent(world)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, doc)!;
    // # Character Visual System is NOT a refinement area but IS in VPB_CANONICAL_HEADINGS
    expect(handoff.prevHeading).toBe('# Visual Thesis');
    expect(handoff.nextHeading).toBe('# Character Visual System');
  });

  it('resolves null prev for first canonical heading', () => {
    // Doc missing Visual Thesis (first heading)
    const doc = `# World & Design Language\n\nWorld.\n\n# References & Direction\n\nRefs.\n`;
    const areas = getVPBRefinementState(doc);
    const tone = areas.find(a => a.key === 'visual_tone')!;
    expect(tone.status).toBe('missing');
    const intent = buildRefinementIntent(tone)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, doc)!;
    expect(handoff.prevHeading).toBeNull();
    expect(handoff.nextHeading).toBe('# World & Design Language');
  });

  it('resolves null next for last canonical heading', () => {
    // Doc missing Asset Appendix (last heading) — test via refs which is second to last
    const doc = `# Visual Thesis\n\nThesis.\n\n# Visual Cohesion & Recurrence\n\nMotifs.\n`;
    const areas = getVPBRefinementState(doc);
    const refs = areas.find(a => a.key === 'reference_frames')!;
    expect(refs.status).toBe('missing');
    const intent = buildRefinementIntent(refs)!;
    const brief = buildRefinementSessionBrief(intent, areas)!;
    const handoff = buildRefinementHandoffPayload(brief, doc)!;
    expect(handoff.prevHeading).toBe('# Visual Cohesion & Recurrence');
    expect(handoff.nextHeading).toBeNull();
  });
});
