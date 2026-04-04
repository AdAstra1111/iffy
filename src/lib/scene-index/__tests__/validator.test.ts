import { describe, it, expect } from 'vitest';
import { validateSceneIndex, validateSceneIndexBatch } from '../validator';
import type { SceneIndexInsert } from '../types';

const validScene: SceneIndexInsert = {
  project_id: 'proj-1',
  scene_number: 1,
  source_doc_type: 'script',
  character_keys: ['hana', 'kai'],
  wardrobe_state_map: { hana: 'work', kai: 'casual' },
};

describe('validateSceneIndex', () => {
  it('passes valid scene', () => {
    const result = validateSceneIndex(validScene);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty character_keys', () => {
    const result = validateSceneIndex({ ...validScene, character_keys: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must not be empty');
  });

  it('rejects wardrobe_state_map key not in character_keys', () => {
    const result = validateSceneIndex({
      ...validScene,
      wardrobe_state_map: { hana: 'work', kai: 'casual', unknown: 'fancy' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"unknown"');
  });

  it('rejects character missing from wardrobe_state_map', () => {
    const result = validateSceneIndex({
      ...validScene,
      wardrobe_state_map: { hana: 'work' }, // missing kai
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"kai" missing');
  });

  it('rejects unknown characters when context provided', () => {
    const result = validateSceneIndex(validScene, {
      projectCharacterKeys: ['hana'], // kai not known
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('unknown character "kai"');
  });

  it('rejects orphan wardrobe states when context provided', () => {
    const result = validateSceneIndex(validScene, {
      projectCharacterKeys: ['hana', 'kai'],
      projectWardrobeStates: { hana: ['work', 'formal'], kai: ['formal'] }, // kai has no 'casual'
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"casual" not valid for character "kai"');
  });
});

describe('validateSceneIndexBatch', () => {
  it('detects duplicate scene numbers', () => {
    const result = validateSceneIndexBatch([
      { ...validScene, scene_number: 1 },
      { ...validScene, scene_number: 1 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
  });

  it('passes valid batch', () => {
    const result = validateSceneIndexBatch([
      { ...validScene, scene_number: 1 },
      { ...validScene, scene_number: 2 },
    ]);
    expect(result.valid).toBe(true);
  });
});
