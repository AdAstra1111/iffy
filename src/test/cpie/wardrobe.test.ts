/**
 * CPIE Wardrobe Inference Tests
 */
import { describe, it, expect } from 'vitest';
import { inferCharacterWardrobe } from '../../lib/cpie/wardrobe';
import { crimeDetectiveContext, fantasyRiderContext, sciFiCourierContext } from './helpers';

const e = (key: string, name: string, prof: string) => ({ entity_key: key, canonical_name: name, profession: prof });

describe('Wardrobe -- Detective in Pub (Crime)', () => {
  const result = inferCharacterWardrobe(crimeDetectiveContext(), e('p', 'Harry', 'detective'));
  it('non-empty', () => expect(result.inference_count).toBeGreaterThan(0));
  it('primary_outfit = trench_coat', () => {
    const f = result.inferences.find(i => i.field === 'primary_outfit');
    expect(f).toBeDefined();
    expect(f!.value).toBe('trench_coat');
  });
  it('has footwear', () => expect(result.inferences.find(i => i.field === 'footwear')).toBeDefined());
  it('has headwear (fedora)', () => {
    const h = result.inferences.find(i => i.field === 'headwear');
    expect(h).toBeDefined();
    expect(h!.value).toBe('fedora');
  });
  it('every inference has provenance', () => {
    for (const inf of result.inferences) {
      expect(inf.source_type).toBe('inferred');
      expect(inf.confidence_score).toBeGreaterThan(0);
      expect(inf.reasoning.length).toBeGreaterThan(0);
      expect(inf.registry_anchor_id).toBeTruthy();
    }
  });
});

describe('Wardrobe -- Fantasy Rider', () => {
  const result = inferCharacterWardrobe(fantasyRiderContext(), e('r', 'Rider', 'knight'));
  it('non-empty', () => expect(result.inference_count).toBeGreaterThan(0));
  it('primary_outfit = plate_armor', () => {
    const f = result.inferences.find(i => i.field === 'primary_outfit');
    expect(f).toBeDefined();
    expect(f!.value).toBe('plate_armor');
  });
  it('no modern contamination', () => {
    const bad = ['trench_coat', 'fedora', 'blazer', 'police_uniform'];
    for (const inf of result.inferences) {
      expect(bad).not.toContain(inf.value);
    }
  });
});

describe('Wardrobe -- Sci-Fi Courier', () => {
  const result = inferCharacterWardrobe(sciFiCourierContext(), e('c', 'Runner', 'courier'));
  it('non-empty', () => expect(result.inference_count).toBeGreaterThan(0));
  it('primary_outfit = tech_utility_gear', () => {
    const f = result.inferences.find(i => i.field === 'primary_outfit');
    expect(f).toBeDefined();
    expect(f!.value).toBe('tech_utility_gear');
  });
  it('no WWII contamination', () => {
    const bad = ['fedora', 'military_uniform', 'tank'];
    for (const inf of result.inferences) {
      expect(bad).not.toContain(inf.value);
    }
  });
});
