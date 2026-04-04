import { describe, it, expect } from 'vitest';
import { parseLikenessReferences, likenessToPromptDirective } from '@/lib/aiCast/likenessParser';

describe('parseLikenessReferences', () => {
  it('detects "looks like X" pattern', () => {
    const result = parseLikenessReferences('Should look like Tom Hardy, more rugged');
    expect(result.has_references).toBe(true);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].reference_people).toEqual(['Tom Hardy']);
    expect(result.references[0].reference_strength).toBe('strong');
    expect(result.remaining_notes).toContain('more rugged');
  });

  it('detects "a mix of X and Y" pattern', () => {
    const result = parseLikenessReferences('a mix of Cate Blanchett and Tilda Swinton');
    expect(result.has_references).toBe(true);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].reference_people).toEqual(['Cate Blanchett', 'Tilda Swinton']);
    expect(result.references[0].reference_strength).toBe('strong');
  });

  it('detects "feels like X" as moderate', () => {
    const result = parseLikenessReferences('feels like Denzel Washington');
    expect(result.has_references).toBe(true);
    expect(result.references[0].reference_strength).toBe('moderate');
  });

  it('detects "someone like X"', () => {
    const result = parseLikenessReferences('someone like Keanu Reeves but older');
    expect(result.has_references).toBe(true);
    expect(result.references[0].reference_people).toEqual(['Keanu Reeves']);
  });

  it('returns empty for notes without references', () => {
    const result = parseLikenessReferences('taller, more rugged, blonde hair');
    expect(result.has_references).toBe(false);
    expect(result.references).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(parseLikenessReferences('').has_references).toBe(false);
    expect(parseLikenessReferences(null as any).has_references).toBe(false);
  });

  it('rejects blocklisted words', () => {
    const result = parseLikenessReferences('looks like someone tall');
    expect(result.has_references).toBe(false);
  });

  it('handles multiple references', () => {
    const result = parseLikenessReferences('looks like Brad Pitt, feels like Oscar Isaac');
    expect(result.has_references).toBe(true);
    expect(result.references).toHaveLength(2);
  });
});

describe('likenessToPromptDirective', () => {
  it('generates prompt for single reference', () => {
    const refs = [{ raw_match: 'looks like Tom Hardy', reference_people: ['Tom Hardy'], reference_mode: 'likeness_guidance' as const, reference_strength: 'strong' as const }];
    const directive = likenessToPromptDirective(refs);
    expect(directive).toContain('Tom Hardy');
    expect(directive).toContain('not a likeness or portrait');
  });

  it('generates blend prompt for mix references', () => {
    const refs = [{ raw_match: 'mix', reference_people: ['Cate Blanchett', 'Tilda Swinton'], reference_mode: 'likeness_guidance' as const, reference_strength: 'strong' as const }];
    const directive = likenessToPromptDirective(refs);
    expect(directive).toContain('Blend');
    expect(directive).toContain('Cate Blanchett and Tilda Swinton');
  });

  it('returns empty for no references', () => {
    expect(likenessToPromptDirective([])).toBe('');
  });
});
