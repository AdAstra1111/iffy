/**
 * CPIE Registry Tests
 */
import { describe, it, expect } from 'vitest';
import {
  resolveWardrobe, resolveProps, getRegistryMetadata,
  WARDROBE_RULE_COUNT, PROP_RULE_COUNT, CPIE_REGISTRY_VERSION,
} from '../../lib/cpie/registry';
import { crimeDetectiveContext } from './helpers';

describe('CPIE Registry -- Version', () => {
  it('has version 1.0.0', () => expect(CPIE_REGISTRY_VERSION).toBe('1.0.0'));
  it('has 20+ wardrobe rules', () => expect(WARDROBE_RULE_COUNT).toBeGreaterThan(20));
  it('has 15+ prop rules', () => expect(PROP_RULE_COUNT).toBeGreaterThan(15));
});

describe('CPIE Registry -- Determinism', () => {
  it('same context = same wardrobe output', () => {
    const ctx = crimeDetectiveContext();
    const e = { entity_key: 'protagonist', canonical_name: 'Harry', profession: 'detective' };
    const a = resolveWardrobe(ctx, e);
    const b = resolveWardrobe(ctx, e);
    expect(a.size).toBe(b.size);
    for (const [k, v] of a) expect(v.value).toBe(b.get(k)?.value);
  });
  it('same context = same prop output', () => {
    const ctx = crimeDetectiveContext();
    const e = { entity_key: 'protagonist', canonical_name: 'Harry', profession: 'detective' };
    const a = resolveProps(ctx, e);
    const b = resolveProps(ctx, e);
    expect(a.size).toBe(b.size);
  });
});

describe('CPIE Registry -- Provenance', () => {
  it('every wardrobe inference has reasoning', () => {
    const ctx = crimeDetectiveContext();
    const e = { entity_key: 'protagonist', canonical_name: 'Harry', profession: 'detective' };
    for (const [, inf] of resolveWardrobe(ctx, e)) {
      expect(inf.reasoning.length).toBeGreaterThan(0);
      expect(inf.source_type).toBe('inferred');
      expect(inf.confidence_score).toBeGreaterThan(0);
      expect(inf.pcp_dependencies.length).toBeGreaterThan(0);
    }
  });
  it('every prop inference has reasoning', () => {
    const ctx = crimeDetectiveContext();
    const e = { entity_key: 'protagonist', canonical_name: 'Harry', profession: 'detective' };
    for (const [, inf] of resolveProps(ctx, e)) {
      expect(inf.reasoning.length).toBeGreaterThan(0);
      expect(inf.source_type).toBe('inferred');
      expect(inf.confidence_score).toBeGreaterThan(0);
    }
  });
});
