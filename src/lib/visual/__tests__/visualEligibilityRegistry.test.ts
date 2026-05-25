/**
 * visualEligibilityRegistry tests — pure computation verification.
 */
import { describe, it, expect } from 'vitest';
import {
  isStageEligible,
  VISUAL_STAGE_PREREQUISITES,
  VISUAL_STAGE_ORDER,
  type VisualStage,
} from '../visualEligibilityRegistry';

describe('VISUAL_STAGE_ORDER', () => {
  it('has source_truth as the first stage', () => {
    expect(VISUAL_STAGE_ORDER[0]).toBe('source_truth');
  });

  it('has lookbook as the last stage', () => {
    expect(VISUAL_STAGE_ORDER[VISUAL_STAGE_ORDER.length - 1]).toBe('lookbook');
  });

  it('stages are in dependency order (upstream before downstream)', () => {
    for (const stage of VISUAL_STAGE_ORDER) {
      const prereqs = VISUAL_STAGE_PREREQUISITES[stage as VisualStage] ?? [];
      const stageIdx = VISUAL_STAGE_ORDER.indexOf(stage as VisualStage);
      for (const prereq of prereqs) {
        const prereqIdx = VISUAL_STAGE_ORDER.indexOf(prereq);
        expect(prereqIdx).toBeLessThan(stageIdx);
      }
    }
  });
});

describe('VISUAL_STAGE_PREREQUISITES', () => {
  it('source_truth has no prerequisites', () => {
    expect(VISUAL_STAGE_PREREQUISITES.source_truth).toEqual([]);
  });

  it('visual_canon requires source_truth', () => {
    expect(VISUAL_STAGE_PREREQUISITES.visual_canon).toContain('source_truth');
  });

  it('cast requires source_truth and visual_canon', () => {
    expect(VISUAL_STAGE_PREREQUISITES.cast).toContain('source_truth');
    expect(VISUAL_STAGE_PREREQUISITES.cast).toContain('visual_canon');
  });

  it('hero_frames requires source_truth, visual_canon, cast', () => {
    expect(VISUAL_STAGE_PREREQUISITES.hero_frames).toContain('source_truth');
    expect(VISUAL_STAGE_PREREQUISITES.hero_frames).toContain('visual_canon');
    expect(VISUAL_STAGE_PREREQUISITES.hero_frames).toContain('cast');
  });

  it('production_design requires source_truth, visual_canon, cast', () => {
    expect(VISUAL_STAGE_PREREQUISITES.production_design).toContain('source_truth');
    expect(VISUAL_STAGE_PREREQUISITES.production_design).toContain('visual_canon');
    expect(VISUAL_STAGE_PREREQUISITES.production_design).toContain('cast');
  });

  it('lookbook requires the most prerequisites', () => {
    const prereqs = VISUAL_STAGE_PREREQUISITES.lookbook;
    expect(prereqs.length).toBeGreaterThanOrEqual(4);
  });
});

describe('isStageEligible', () => {
  it('returns true for source_truth (no prerequisites)', () => {
    expect(isStageEligible('source_truth', new Set())).toBe(true);
  });

  it('returns false for visual_canon when source_truth is not complete', () => {
    expect(isStageEligible('visual_canon', new Set())).toBe(false);
  });

  it('returns true for visual_canon when source_truth is complete', () => {
    expect(isStageEligible('visual_canon', new Set(['source_truth']))).toBe(true);
  });

  it('returns false for cast when prerequisites are missing', () => {
    expect(isStageEligible('cast', new Set(['source_truth']))).toBe(false);
  });

  it('returns true for cast when all prerequisites are complete', () => {
    expect(isStageEligible('cast', new Set(['source_truth', 'visual_canon']))).toBe(true);
  });

  it('returns false for hero_frames when cast is missing', () => {
    expect(isStageEligible('hero_frames', new Set(['source_truth', 'visual_canon']))).toBe(false);
  });

  it('returns true for hero_frames when all prerequisites are complete', () => {
    const completed = new Set(['source_truth', 'visual_canon', 'cast']);
    expect(isStageEligible('hero_frames', completed)).toBe(true);
  });

  it('returns false for unknown stages', () => {
    expect(isStageEligible('unknown' as any, new Set())).toBe(false);
  });

  it('handles empty completed set', () => {
    expect(isStageEligible('source_truth', new Set())).toBe(true);
  });
});

describe('VISUAL_STAGE_PREREQUISITES — every stage has prerequisites defined', () => {
  it('has a prerequisites entry for every stage in the order list', () => {
    for (const stage of VISUAL_STAGE_ORDER) {
      expect(VISUAL_STAGE_PREREQUISITES).toHaveProperty(stage);
    }
  });
});