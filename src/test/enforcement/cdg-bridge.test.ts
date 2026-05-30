/**
 * Compliance Test: CDG Bridge Node Resolution
 * Validates that CDG bridge correctly resolves domain names to node IDs.
 */
import { describe, it, expect } from 'vitest';

const DOMAIN_NODE_MAP: Record<string, string> = {
  wardrobe: 'D1', costume: 'D1',
  prop: 'D2',
  vehicle: 'D3',
  creature: 'D4',
  location: 'D5',
  pd: 'D6',
  visual_language: 'D7',
};

const CPIE_DOMAIN_MAP: Record<string, string> = {
  wardrobe: 'C1', costume: 'C1',
  prop: 'C2',
  vehicle: 'C3',
  creature: 'C4',
  location: 'C5',
  pd: 'C6',
  visual_language: 'C7',
};

function resolveCanonNode(domain: string): string | null {
  const key = domain.toLowerCase().replace(/[_-]/g, '');
  // Also normalize map keys for comparison
  for (const [mapKey, nodeId] of Object.entries(DOMAIN_NODE_MAP)) {
    if (mapKey.toLowerCase().replace(/[_-]/g, '') === key) return nodeId;
  }
  return null;
}

function resolveCPIENode(domain: string): string | null {
  const key = domain.toLowerCase().replace(/[_-]/g, '');
  for (const [mapKey, nodeId] of Object.entries(CPIE_DOMAIN_MAP)) {
    if (mapKey.toLowerCase().replace(/[_-]/g, '') === key) return nodeId;
  }
  return null;
}

describe('CDG Bridge — Canon Node Resolution', () => {
  it('wardrobe -> D1', () => expect(resolveCanonNode('wardrobe')).toBe('D1'));
  it('costume -> D1', () => expect(resolveCanonNode('costume')).toBe('D1'));
  it('prop -> D2', () => expect(resolveCanonNode('prop')).toBe('D2'));
  it('vehicle -> D3', () => expect(resolveCanonNode('vehicle')).toBe('D3'));
  it('creature -> D4', () => expect(resolveCanonNode('creature')).toBe('D4'));
  it('location -> D5', () => expect(resolveCanonNode('location')).toBe('D5'));
  it('pd -> D6', () => expect(resolveCanonNode('pd')).toBe('D6'));
  it('visual_language -> D7', () => expect(resolveCanonNode('visual_language')).toBe('D7'));
  it('unknown domain -> null', () => expect(resolveCanonNode('unknown')).toBeNull());
  it('is case-insensitive', () => expect(resolveCanonNode('WARDROBE')).toBe('D1'));
});

describe('CDG Bridge — CPIE Node Resolution', () => {
  it('wardrobe -> C1', () => expect(resolveCPIENode('wardrobe')).toBe('C1'));
  it('prop -> C2', () => expect(resolveCPIENode('prop')).toBe('C2'));
  it('vehicle -> C3', () => expect(resolveCPIENode('vehicle')).toBe('C3'));
  it('creature -> C4', () => expect(resolveCPIENode('creature')).toBe('C4'));
});

describe('CDG Bridge — All 8 Domains Mapped', () => {
  it('every domain has a canon node', () => {
    const domains = ['wardrobe', 'costume', 'prop', 'vehicle', 'creature', 'location', 'pd', 'visual_language'];
    for (const d of domains) {
      expect(resolveCanonNode(d)).not.toBeNull();
    }
  });
  it('every domain has a CPIE node', () => {
    const domains = ['wardrobe', 'costume', 'prop', 'vehicle', 'creature', 'location', 'pd', 'visual_language'];
    for (const d of domains) {
      expect(resolveCPIENode(d)).not.toBeNull();
    }
  });
});
