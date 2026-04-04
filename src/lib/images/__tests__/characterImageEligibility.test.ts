import { describe, it, expect } from 'vitest';
import {
  classifyCharacterIdentity,
  isCharacterImageEligible,
  filterEligibleImages,
  assertCharacterImageEligible,
  requiresCharacterIdentityGate,
} from '../characterImageEligibility';

const baseImg = (overrides: any = {}) => ({
  id: 'img-1',
  subject_type: 'character',
  subject: 'Hana',
  generation_config: { identity_locked: true },
  ...overrides,
});

describe('characterImageEligibility — fail-closed invariant', () => {
  describe('requiresCharacterIdentityGate', () => {
    it('gates explicit character subject_type', () => {
      expect(requiresCharacterIdentityGate(null, { id: '1', subject_type: 'character' })).toBe(true);
    });
    it('does NOT gate explicit safe non-character types', () => {
      expect(requiresCharacterIdentityGate('hero_frames', { id: '1', subject_type: 'location' })).toBe(false);
      expect(requiresCharacterIdentityGate(null, { id: '1', subject_type: 'texture' })).toBe(false);
    });
    it('gates null subject_type in character-bearing sections (fail-closed)', () => {
      expect(requiresCharacterIdentityGate('hero_frames', { id: '1', subject_type: null })).toBe(true);
      expect(requiresCharacterIdentityGate('key_moments', { id: '1' })).toBe(true);
    });
    it('does NOT gate null subject_type outside character-bearing sections', () => {
      expect(requiresCharacterIdentityGate('atmosphere_lighting', { id: '1', subject_type: null })).toBe(false);
      expect(requiresCharacterIdentityGate(null, { id: '1', subject_type: null })).toBe(false);
    });
  });

  describe('classifyCharacterIdentity — fail-closed', () => {
    it('passes non-character images with safe subject_type', () => {
      const result = classifyCharacterIdentity({ id: '1', subject_type: 'location' });
      expect(result.eligible).toBe(true);
      expect(result.status).toBe('pass');
    });

    it('passes character images with identity_locked', () => {
      const result = classifyCharacterIdentity(baseImg());
      expect(result.eligible).toBe(true);
      expect(result.status).toBe('pass');
    });

    it('BLOCKS character images with null generation_config (no legacy pass)', () => {
      const result = classifyCharacterIdentity(baseImg({ generation_config: null }));
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('blocked_missing_evidence');
    });

    it('BLOCKS character images with empty generation_config (no legacy pass)', () => {
      const result = classifyCharacterIdentity(baseImg({ generation_config: {} }));
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('blocked_missing_evidence');
    });

    it('BLOCKS null subject_type in character-bearing section', () => {
      const result = classifyCharacterIdentity(
        { id: '1', subject_type: null, generation_config: null },
        'hero_frames',
      );
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('blocked_missing_evidence');
    });

    it('rejects images with gate failure as drift', () => {
      const result = classifyCharacterIdentity(baseImg({
        generation_config: { actor_identity_gate_status: 'fail', identity_locked: true },
      }));
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('drift');
      expect(result.reasons).toContain('Failed actor identity gate');
    });

    it('rejects images with gate_admitted false', () => {
      const result = classifyCharacterIdentity(baseImg({
        generation_config: { gate_admitted: false, identity_locked: true },
      }));
      expect(result.eligible).toBe(false);
      expect(result.status).toBe('drift');
    });

    it('blocks character images without identity_locked', () => {
      const result = classifyCharacterIdentity(baseImg({
        generation_config: { some_field: 'value' },
      }));
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('Identity not locked during generation');
    });
  });

  describe('isCharacterImageEligible', () => {
    it('returns true for eligible', () => {
      expect(isCharacterImageEligible(baseImg())).toBe(true);
    });
    it('returns false for drift', () => {
      expect(isCharacterImageEligible(baseImg({
        generation_config: { actor_identity_gate_status: 'fail' },
      }))).toBe(false);
    });
    it('returns false for missing evidence on character', () => {
      expect(isCharacterImageEligible(baseImg({ generation_config: null }))).toBe(false);
    });
    it('respects section context', () => {
      // null subject_type in hero_frames → blocked
      expect(isCharacterImageEligible({ id: '1', subject_type: null }, 'hero_frames')).toBe(false);
      // null subject_type outside character-bearing → pass
      expect(isCharacterImageEligible({ id: '1', subject_type: null }, 'texture_detail')).toBe(true);
    });
  });

  describe('filterEligibleImages', () => {
    it('separates eligible, drift, and blocked', () => {
      const images = [
        baseImg({ id: 'a' }), // pass
        baseImg({ id: 'b', generation_config: { actor_identity_gate_status: 'fail' } }), // drift
        baseImg({ id: 'c', generation_config: null }), // blocked
        { id: 'd', subject_type: 'location' } as any, // pass (non-character)
      ];
      const result = filterEligibleImages(images);
      expect(result.eligible.map(i => i.id)).toEqual(['a', 'd']);
      expect(result.drift.map(i => i.id)).toEqual(['b']);
      expect(result.blocked.map(i => i.id)).toEqual(['c']);
    });

    it('passes section context through', () => {
      const images = [
        { id: 'x', subject_type: null, generation_config: null } as any,
      ];
      // In hero_frames → blocked
      const r1 = filterEligibleImages(images, 'hero_frames');
      expect(r1.eligible).toHaveLength(0);
      expect(r1.blocked).toHaveLength(1);
      // In atmosphere_lighting → pass
      const r2 = filterEligibleImages(images, 'atmosphere_lighting');
      expect(r2.eligible).toHaveLength(1);
    });
  });

  describe('assertCharacterImageEligible', () => {
    it('does not throw for eligible image', () => {
      expect(() => assertCharacterImageEligible(baseImg(), 'approve')).not.toThrow();
    });
    it('throws for drift image', () => {
      expect(() => assertCharacterImageEligible(
        baseImg({ generation_config: { actor_identity_gate_status: 'fail' } }),
        'approve',
      )).toThrow(/Identity drift/);
    });
    it('throws for missing evidence', () => {
      expect(() => assertCharacterImageEligible(
        baseImg({ generation_config: null }),
        'set as primary',
      )).toThrow(/Missing identity evidence/);
    });
  });
});
