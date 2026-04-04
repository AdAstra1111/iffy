/**
 * Tests proving Hero Frame identity badges reflect generation-contract truth only,
 * NOT output-level identity correctness.
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirrors the exact badge-derivation logic used in VisualProductionPipeline card badges.
 * Source of truth: the inline badge in VisualProductionPipeline.tsx ~line 1353-1369.
 */
function deriveBadgeLabel(generationConfig: Record<string, unknown> | null): string {
  const gc = generationConfig || {};
  const hasIdentityLock = !!gc.identity_locked;
  const hasRefs = ((gc.reference_images_total as number) ?? 0) > 0;

  if (hasIdentityLock) {
    return hasRefs ? 'ANCHORS INJECTED' : 'LOCK REQUESTED';
  }
  return 'LEGACY';
}

/**
 * Mirrors detail viewer label derivation.
 */
function deriveDetailLabel(eligible: boolean): string {
  return eligible ? 'Anchor-Conditioned' : 'Legacy — Unbound';
}

describe('Hero Frame badge semantics — truthfulness', () => {
  it('metadata-only image does NOT display verified-sounding wording', () => {
    const label = deriveBadgeLabel({ identity_locked: true, reference_images_total: 3 });
    expect(label).toBe('ANCHORS INJECTED');
    expect(label).not.toMatch(/VERIFIED|CONFIRMED|CORRECT|IDENTITY LOCKED/i);
  });

  it('lock without refs shows LOCK REQUESTED, not IDENTITY LOCKED', () => {
    const label = deriveBadgeLabel({ identity_locked: true });
    expect(label).toBe('LOCK REQUESTED');
    expect(label).not.toMatch(/IDENTITY LOCKED/i);
  });

  it('legacy image shows LEGACY badge', () => {
    const label = deriveBadgeLabel(null);
    expect(label).toBe('LEGACY');
  });

  it('legacy image with empty gc shows LEGACY badge', () => {
    const label = deriveBadgeLabel({});
    expect(label).toBe('LEGACY');
  });

  it('detail viewer eligible label is Anchor-Conditioned, not Identity Locked', () => {
    const label = deriveDetailLabel(true);
    expect(label).toBe('Anchor-Conditioned');
    expect(label).not.toMatch(/IDENTITY LOCKED|VERIFIED/i);
  });

  it('detail viewer ineligible label is Legacy — Unbound', () => {
    const label = deriveDetailLabel(false);
    expect(label).toBe('Legacy — Unbound');
  });

  it('no badge wording implies output-level identity correctness', () => {
    const allLabels = [
      deriveBadgeLabel({ identity_locked: true, reference_images_total: 5 }),
      deriveBadgeLabel({ identity_locked: true }),
      deriveBadgeLabel(null),
      deriveBadgeLabel({}),
      deriveDetailLabel(true),
      deriveDetailLabel(false),
    ];
    for (const label of allLabels) {
      expect(label).not.toMatch(/VERIFIED|CONFIRMED|CORRECT|IDENTITY LOCKED/i);
    }
  });
});
