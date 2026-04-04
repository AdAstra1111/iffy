import { describe, it, expect } from 'vitest';
import { interpretCastingNotes } from '@/lib/aiCast/castingNoteInterpreter';

describe('interpretCastingNotes', () => {
  it('extracts gender + ethnicity + age from combined note', () => {
    const r = interpretCastingNotes('extremely beautiful chinese 20-25 female');
    expect(r.hardConstraints.gender).toBe('female');
    expect(r.hardConstraints.ethnicity).toContain('Chinese');
    expect(r.hardConstraints.ageMin).toBe(20);
    expect(r.hardConstraints.ageMax).toBe(25);
    expect(r.softPreferences.attractiveness).toBe('very beautiful');
  });

  it('extracts age word ranges', () => {
    const r = interpretCastingNotes('early thirties, rugged male');
    expect(r.hardConstraints.gender).toBe('male');
    expect(r.hardConstraints.ageMin).toBe(30);
    expect(r.hardConstraints.ageMax).toBe(34);
    expect(r.softPreferences.vibe).toContain('rugged');
  });

  it('extracts vibes and class signals', () => {
    const r = interpretCastingNotes('dangerous but charming, working-class energy');
    expect(r.softPreferences.vibe).toContain('dangerous');
    expect(r.softPreferences.vibe).toContain('charming');
    expect(r.softPreferences.classSignals).toContain('working-class');
  });

  it('handles likeness + descriptors together', () => {
    const r = interpretCastingNotes('looks like Amaury Nolasco, tall, athletic, intimidating');
    expect(r.likeness.has_references).toBe(true);
    expect(r.likeness.references[0].reference_people).toContain('Amaury Nolasco');
    expect(r.softPreferences.build).toBe('athletic');
    expect(r.softPreferences.vibe).toContain('intimidating');
  });

  it('extracts multiple ethnicities', () => {
    const r = interpretCastingNotes('mixed race, black and latino heritage');
    expect(r.hardConstraints.ethnicity).toContain('Mixed Race');
    expect(r.hardConstraints.ethnicity).toContain('Black');
    expect(r.hardConstraints.ethnicity).toContain('Latino/Hispanic');
  });

  it('extracts hair and skin tone', () => {
    const r = interpretCastingNotes('dark-skinned, curly hair, elegant');
    expect(r.softPreferences.skinTone).toBe('dark');
    expect(r.softPreferences.hair).toBe('curly hair');
    expect(r.softPreferences.vibe).toContain('elegant');
  });

  it('returns empty for blank input', () => {
    const r = interpretCastingNotes('');
    expect(r.hardConstraints).toEqual({});
    expect(r.normalizedSummary).toBe('');
  });

  it('builds a normalized summary', () => {
    const r = interpretCastingNotes('beautiful korean female, mid twenties, mysterious');
    expect(r.normalizedSummary).toContain('Gender: female');
    expect(r.normalizedSummary).toContain('Korean');
    expect(r.normalizedSummary).toContain('mysterious');
  });

  it('handles single age with "years old"', () => {
    const r = interpretCastingNotes('around 35 years old, stocky, menacing');
    expect(r.hardConstraints.ageMin).toBe(32);
    expect(r.hardConstraints.ageMax).toBe(38);
    expect(r.softPreferences.build).toBe('stocky/heavy');
    expect(r.softPreferences.vibe).toContain('menacing');
  });
});
