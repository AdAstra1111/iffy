/**
 * blockRemediation.test.ts — Tests for canonical block-reason → remediation mapping.
 */
import { describe, it, expect } from 'vitest';
import {
  getBlockRemediation,
  isRepairAvailable,
  getBlockReasonLabel,
} from '../blockRemediation';

describe('getBlockRemediation', () => {
  it('degraded_wardrobe_profile is repair-eligible', () => {
    const rem = getBlockRemediation('degraded_wardrobe_profile');
    expect(rem).not.toBeNull();
    expect(rem!.canAutoRepair).toBe(true);
    expect(rem!.repairAction).toBe('reextract_wardrobe_profile');
    expect(rem!.repairLabel).toBeTruthy();
  });

  it('no_wardrobe_profile is repair-eligible', () => {
    const rem = getBlockRemediation('no_wardrobe_profile');
    expect(rem).not.toBeNull();
    expect(rem!.canAutoRepair).toBe(true);
    expect(rem!.repairAction).toBe('reextract_wardrobe_profile');
  });

  it('no_actor_binding is NOT repair-eligible', () => {
    const rem = getBlockRemediation('no_actor_binding');
    expect(rem).not.toBeNull();
    expect(rem!.canAutoRepair).toBe(false);
    expect(rem!.repairAction).toBeNull();
    expect(rem!.repairLabel).toBeNull();
  });

  it('no_actor_version is NOT repair-eligible', () => {
    const rem = getBlockRemediation('no_actor_version');
    expect(rem).not.toBeNull();
    expect(rem!.canAutoRepair).toBe(false);
    expect(rem!.repairAction).toBeNull();
  });

  it('null/undefined returns null', () => {
    expect(getBlockRemediation(null)).toBeNull();
    expect(getBlockRemediation(undefined)).toBeNull();
  });
});

describe('isRepairAvailable', () => {
  it('true for degraded_wardrobe_profile', () => {
    expect(isRepairAvailable('degraded_wardrobe_profile')).toBe(true);
  });

  it('true for no_wardrobe_profile', () => {
    expect(isRepairAvailable('no_wardrobe_profile')).toBe(true);
  });

  it('false for no_actor_binding', () => {
    expect(isRepairAvailable('no_actor_binding')).toBe(false);
  });

  it('false for no_actor_version', () => {
    expect(isRepairAvailable('no_actor_version')).toBe(false);
  });

  it('false for null', () => {
    expect(isRepairAvailable(null)).toBe(false);
  });
});

describe('getBlockReasonLabel', () => {
  it('returns canonical label for known reasons', () => {
    expect(getBlockReasonLabel('no_actor_binding')).toBe('No actor bound');
    expect(getBlockReasonLabel('degraded_wardrobe_profile')).toContain('degraded');
  });

  it('returns fallback for null', () => {
    expect(getBlockReasonLabel(null)).toBe('Missing requirements');
  });
});
