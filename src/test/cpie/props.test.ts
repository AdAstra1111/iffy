/**
 * CPIE Prop Inference Tests
 */
import { describe, it, expect } from 'vitest';
import { inferCharacterProps } from '../../lib/cpie/props';
import { crimeDetectiveContext, fantasyRiderContext, sciFiCourierContext } from './helpers';

const e = (key: string, name: string, prof: string) => ({ entity_key: key, canonical_name: name, profession: prof });

describe('Props -- Detective in Pub (Crime)', () => {
  const result = inferCharacterProps(crimeDetectiveContext(), e('p', 'Harry', 'detective'));
  it('non-empty', () => expect(result.inference_count).toBeGreaterThan(0));
  it('primary_prop = notebook', () => {
    const f = result.inferences.find(i => i.field === 'primary_prop');
    expect(f).toBeDefined();
    expect(f!.value).toBe('notebook');
  });
  it('has communication (police_radio)', () => {
    const c = result.inferences.find(i => i.field === 'communication');
    expect(c).toBeDefined();
    expect(c!.value).toBe('police_radio');
  });
  it('every inference has provenance', () => {
    for (const inf of result.inferences) {
      expect(inf.source_type).toBe('inferred');
      expect(inf.confidence_score).toBeGreaterThan(0);
      expect(inf.reasoning.length).toBeGreaterThan(0);
    }
  });
});

describe('Props -- Fantasy Rider', () => {
  const result = inferCharacterProps(fantasyRiderContext(), e('r', 'Rider', 'knight'));
  it('non-empty', () => expect(result.inference_count).toBeGreaterThan(0));
  it('primary_weapon = sword', () => {
    const f = result.inferences.find(i => i.field === 'primary_weapon');
    expect(f).toBeDefined();
    expect(f!.value).toBe('sword');
  });
  it('has horse mount', () => {
    const m = result.inferences.find(i => i.field === 'mount');
    expect(m).toBeDefined();
    expect(m!.value).toBe('horse');
  });
  it('no modern electronics', () => {
    const bad = ['smartphone', 'radio', 'scanner', 'neural_link'];
    for (const inf of result.inferences) expect(bad).not.toContain(inf.value);
  });
});

describe('Props -- Sci-Fi Courier', () => {
  const result = inferCharacterProps(sciFiCourierContext(), e('c', 'Runner', 'courier'));
  it('non-empty', () => expect(result.inference_count).toBeGreaterThan(0));
  it('primary_prop = package', () => {
    const f = result.inferences.find(i => i.field === 'primary_prop');
    expect(f).toBeDefined();
    expect(f!.value).toBe('package');
  });
  it('holographic_reader for future courier', () => {
    const s = result.inferences.find(i => i.field === 'scanner');
    expect(s).toBeDefined();
    expect(s!.value).toBe('holographic_reader');
  });
  it('no WWII contamination', () => {
    const bad = ['stethoscope', 'sword', 'horse'];
    for (const inf of result.inferences) expect(bad).not.toContain(inf.value);
  });
});
