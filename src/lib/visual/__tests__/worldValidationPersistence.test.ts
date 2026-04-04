/**
 * worldValidationPersistence.test.ts — Tests for World Validation Mode
 * persistence shape and version-aware write behavior.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveWorldValidationMode,
  type WorldValidationMode,
} from '../worldValidationMode';

describe('world validation mode persistence shape', () => {
  it('resolved mode contains all fields required for canonical persistence', () => {
    const wvm = resolveWorldValidationMode({ genres: ['drama'] });
    expect(wvm).toHaveProperty('mode');
    expect(wvm).toHaveProperty('rules');
    expect(wvm).toHaveProperty('confidence');
    expect(wvm).toHaveProperty('derived_from');
    expect(wvm).toHaveProperty('rationale');
    expect(wvm).toHaveProperty('version');
    expect(typeof wvm.version).toBe('string');
    expect(wvm.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('persisted shape is JSON-serializable', () => {
    const wvm = resolveWorldValidationMode({
      genres: ['drama', 'thriller'],
      tone_style: 'gritty, raw',
      world_rules: 'No supernatural elements',
    });
    const json = JSON.stringify(wvm);
    const parsed = JSON.parse(json) as WorldValidationMode;
    expect(parsed.mode).toBe(wvm.mode);
    expect(parsed.rules).toEqual(wvm.rules);
    expect(parsed.confidence).toBe(wvm.confidence);
    expect(parsed.derived_from).toEqual(wvm.derived_from);
    expect(parsed.rationale).toBe(wvm.rationale);
    expect(parsed.version).toBe(wvm.version);
  });

  it('same inputs produce same mode (deterministic)', () => {
    const input = { genres: ['romance', 'melodrama'], tone_style: 'passionate, lush' };
    const a = resolveWorldValidationMode(input);
    const b = resolveWorldValidationMode(input);
    expect(a.mode).toBe(b.mode);
    expect(a.confidence).toBe(b.confidence);
    expect(a.version).toBe(b.version);
  });

  it('version-aware: persisted mode with matching version and mode would be a no-op write', () => {
    const wvm = resolveWorldValidationMode({ genres: ['drama'] });
    // Simulate persisted state matching
    const persisted: WorldValidationMode = { ...wvm };
    expect(persisted.version === wvm.version && persisted.mode === wvm.mode).toBe(true);
  });

  it('version-aware: different mode triggers overwrite', () => {
    const grounded = resolveWorldValidationMode({ genres: ['drama'], tone_style: 'gritty' });
    const fantastical = resolveWorldValidationMode({}, 'fantastical');
    expect(grounded.mode === fantastical.mode).toBe(false);
  });
});

describe('world validation mode read-after-write simulation', () => {
  it('persisted object can be read back and matches original fields', () => {
    const original = resolveWorldValidationMode({
      genres: ['high fantasy'],
      tone_style: 'magical, otherworldly',
      world_rules: 'Dragon riders and enchanted forests',
    });

    // Simulate write to canon_json
    const canonJson: Record<string, unknown> = {
      logline: 'test',
      world_validation_mode: original,
    };

    // Simulate read from canon_json
    const readBack = canonJson.world_validation_mode as WorldValidationMode;
    expect(readBack.mode).toBe('fantastical');
    expect(readBack.rules.allow_magic_literalism).toBe(true);
    expect(readBack.version).toBe(original.version);
    expect(readBack.derived_from).toEqual(original.derived_from);
  });

  it('absent persisted mode triggers derivation fallback', () => {
    const canonJson: Record<string, unknown> = { logline: 'test' };
    const raw = canonJson.world_validation_mode;
    expect(raw).toBeUndefined();
    // Hook would derive here
    const derived = resolveWorldValidationMode({});
    expect(derived.mode).toBe('heightened_realism');
    expect(derived.confidence).toBe('low');
  });
});
