/**
 * pipelineStatusResolver tests — stage ordering and dependency gate regression suite.
 */

import { describe, it, expect } from 'vitest';
import { resolvePipelineStages, PIPELINE_STAGES, type PipelineInputs } from '../pipelineStatusResolver';

function makeInputs(overrides: Partial<PipelineInputs> = {}): PipelineInputs {
  return {
    hasCanon: true,
    hasLocations: true,
    locationCount: 3,
    hasVisualStyle: true,
    visualStyleComplete: true,
    totalCharacters: 3,
    lockedCharacters: 3,
    castComplete: true,
    heroFrameTotal: 0,
    heroFrameApproved: 0,
    heroFramePrimaryApproved: false,
    pdTotalFamilies: 0,
    pdLockedFamilies: 0,
    pdCreatedFamilies: 0,
    pdAllLocked: false,
    visualLanguageApproved: false,
    lookbookExists: false,
    lookbookStale: false,
    ...overrides,
  };
}

describe('PIPELINE_STAGES ordering', () => {
  it('production_design comes before hero_frames', () => {
    const pdIdx = PIPELINE_STAGES.indexOf('production_design');
    const hfIdx = PIPELINE_STAGES.indexOf('hero_frames');
    expect(pdIdx).toBeLessThan(hfIdx);
  });

  it('cast comes before production_design', () => {
    const castIdx = PIPELINE_STAGES.indexOf('cast');
    const pdIdx = PIPELINE_STAGES.indexOf('production_design');
    expect(castIdx).toBeLessThan(pdIdx);
  });
});

describe('resolvePipelineStages dependency gates', () => {
  it('hero_frames is blocked when production_design is not locked', () => {
    const stages = resolvePipelineStages(makeInputs({ pdAllLocked: false }));
    const hf = stages.find(s => s.stage === 'hero_frames')!;
    expect(hf.status).toBe('blocked');
    expect(hf.blockers).toContain('Requires Production Design locked');
  });

  it('hero_frames is not_started when production_design is locked', () => {
    const stages = resolvePipelineStages(makeInputs({ pdAllLocked: true }));
    const hf = stages.find(s => s.stage === 'hero_frames')!;
    expect(hf.status).toBe('not_started');
  });

  it('production_design is not gated on hero_frames', () => {
    const stages = resolvePipelineStages(makeInputs({ heroFramePrimaryApproved: false }));
    const pd = stages.find(s => s.stage === 'production_design')!;
    expect(pd.status).not.toBe('blocked');
  });

  it('production_design is blocked only by cast', () => {
    const stages = resolvePipelineStages(makeInputs({ castComplete: false, lockedCharacters: 0 }));
    const pd = stages.find(s => s.stage === 'production_design')!;
    expect(pd.status).toBe('blocked');
    expect(pd.blockers).toContain('Requires cast locked with complete datasets');
  });

  it('stage array order matches PIPELINE_STAGES', () => {
    const stages = resolvePipelineStages(makeInputs());
    const stageKeys = stages.map(s => s.stage);
    expect(stageKeys).toEqual(PIPELINE_STAGES);
  });
});
