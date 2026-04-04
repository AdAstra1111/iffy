import { describe, it, expect } from 'vitest';
import {
  extractCharacterWardrobes,
  getCharacterWardrobeProfile,
  getCharacterWardrobeStates,
  getSignatureGarmentNouns,
  getWardrobeAdjustments,
} from '../characterWardrobeExtractor';

// ── Fixture: Historical Feudal ──

const feudalCanon = {
  characters: [
    { name: 'Hana', role: 'Potter, artisan class', traits: 'Clay-stained hands, quiet determination', goals: 'Master her craft', description: 'A young potter who works in her workshop daily with kiln and wheel' },
    { name: 'Lord Takeda', role: 'Provincial lord, elite samurai', traits: 'Stern, calculating', goals: 'Maintain power', description: 'Wears silk kimono and haori, carries a fan and seal' },
    { name: 'Yuki', role: 'Shrine priestess', traits: 'Serene, devout', goals: 'Protect the sacred sites', description: 'Wears simple linen robe, carries a staff and amulet' },
  ],
  logline: 'A potter caught between feudal power and sacred duty.',
  premise: 'In a strict feudal world, a potter discovers hidden messages in ceramic bowls.',
  tone_style: 'Intimate, tactile, restrained',
  world_rules: 'Strict feudal hierarchy. Tea ceremony and shrine offering are key rituals. No supernatural elements.',
  setting: 'Feudal Japan, rural province',
  ongoing_threads: 'Court ceremony, public festival, workshop labor',
};

// ── Fixture: Modern Romance ──

const modernCanon = {
  characters: [
    { name: 'Sophie', role: 'Fashion designer', traits: 'Creative, impulsive', description: 'Wears tailored jacket and boots, always has a scarf' },
    { name: 'James', role: 'Corporate lawyer', traits: 'Reserved, precise', description: 'Always in a crisp shirt and belt' },
  ],
  logline: 'A fashion designer falls for a corporate lawyer.',
  tone_style: 'Romantic, stylish, bold',
  setting: 'Contemporary London',
};

// ── Fixture: Minimal Canon ──

const minimalCanon = {
  characters: [{ name: 'Unknown Character' }],
};

// ── Profile Extraction Tests ──

describe('extractCharacterWardrobes', () => {
  it('extracts profiles for all characters', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    expect(result.profiles).toHaveLength(3);
    expect(result.extraction_version).toBe('1.5.0');
  });

  it('returns empty for no characters', () => {
    const result = extractCharacterWardrobes({ characters: [] });
    expect(result.profiles).toHaveLength(0);
    expect(result.state_matrix).toEqual({});
  });

  it('detects artisan class for potter', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const hana = getCharacterWardrobeProfile(result, 'Hana');
    expect(hana).not.toBeNull();
    expect(hana!.class_status_expression).toContain('artisan');
  });

  it('detects elite class for lord', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const lord = getCharacterWardrobeProfile(result, 'Lord Takeda');
    expect(lord).not.toBeNull();
    expect(lord!.class_status_expression).toMatch(/elite|military/);
  });

  it('detects religious class for priestess', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const yuki = getCharacterWardrobeProfile(result, 'Yuki');
    expect(yuki).not.toBeNull();
    expect(yuki!.class_status_expression).toContain('religious');
  });

  it('extracts signature garments from character descriptions', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const lord = getCharacterWardrobeProfile(result, 'Lord Takeda');
    expect(lord!.signature_garments).toEqual(expect.arrayContaining(['kimono', 'haori']));
  });

  it('extracts signature accessories', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const lord = getCharacterWardrobeProfile(result, 'Lord Takeda');
    expect(lord!.signature_accessories).toEqual(expect.arrayContaining(['fan', 'seal']));
  });

  it('extracts fabric language from description', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const lord = getCharacterWardrobeProfile(result, 'Lord Takeda');
    expect(lord!.fabric_language).toContain('silk');
  });

  it('derives default fabric for working class', () => {
    const workingCanon = {
      characters: [{ name: 'Farmer Joe', role: 'Farmer, peasant' }],
      setting: 'Medieval countryside',
    };
    const result = extractCharacterWardrobes(workingCanon);
    const joe = getCharacterWardrobeProfile(result, 'Farmer Joe');
    expect(joe!.fabric_language).toMatch(/hemp|homespun|linen/);
  });
});

// ── State Matrix Tests ──

describe('state matrix extraction', () => {
  it('always includes work and domestic states', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const hanaStates = getCharacterWardrobeStates(result, 'Hana');
    const stateKeys = hanaStates.map(s => s.state_key);
    expect(stateKeys).toContain('work');
    expect(stateKeys).toContain('domestic');
    expect(stateKeys).toContain('public_formal');
  });

  it('includes ceremonial state when world references ceremonies', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const lordStates = getCharacterWardrobeStates(result, 'Lord Takeda');
    const stateKeys = lordStates.map(s => s.state_key);
    expect(stateKeys).toContain('ceremonial');
  });

  it('tags explicit states correctly', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const hanaStates = getCharacterWardrobeStates(result, 'Hana');
    const workState = hanaStates.find(s => s.state_key === 'work');
    expect(workState).toBeDefined();
    // Hana's text directly mentions workshop/craft → explicit
    expect(workState!.explicit_or_inferred).toBe('explicit');
  });

  it('tags world-inferred states correctly', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const hanaStates = getCharacterWardrobeStates(result, 'Hana');
    // Weather state should be inferred (not in Hana's text)
    const weatherState = hanaStates.find(s => s.state_key === 'weather_adapted');
    if (weatherState) {
      expect(weatherState.explicit_or_inferred).toBe('inferred');
    }
  });

  it('does not include disguise state unless referenced', () => {
    // Use a canon without disguise/concealment keywords
    const cleanCanon = {
      characters: [{ name: 'Anna', role: 'Baker', traits: 'Cheerful' }],
      world_rules: 'Simple village life',
    };
    const result = extractCharacterWardrobes(cleanCanon);
    const states = getCharacterWardrobeStates(result, 'Anna');
    const stateKeys = states.map(s => s.state_key);
    expect(stateKeys).not.toContain('disguise_concealment');
  });
});

// ── Explicit vs Inferred Tests ──

describe('explicit vs inferred tagging', () => {
  it('marks states with character text evidence as explicit', () => {
    const canon = {
      characters: [{ name: 'Spy', role: 'Spy who must disguise and infiltrate', traits: 'Secretive, wounded in battle' }],
      world_rules: 'Cold winter kingdom',
    };
    const result = extractCharacterWardrobes(canon);
    const states = getCharacterWardrobeStates(result, 'Spy');
    const disguiseState = states.find(s => s.state_key === 'disguise_concealment');
    expect(disguiseState).toBeDefined();
    expect(disguiseState!.explicit_or_inferred).toBe('explicit');

    const distressState = states.find(s => s.state_key === 'distress_aftermath');
    expect(distressState).toBeDefined();
    expect(distressState!.explicit_or_inferred).toBe('explicit');
  });

  it('marks always-infer states as inferred when no direct evidence', () => {
    const result = extractCharacterWardrobes(minimalCanon);
    const states = getCharacterWardrobeStates(result, 'Unknown Character');
    const workState = states.find(s => s.state_key === 'work');
    expect(workState).toBeDefined();
    expect(workState!.explicit_or_inferred).toBe('inferred');
  });
});

// ── Modern Romance Tests ──

describe('modern romance project', () => {
  it('extracts profiles for modern characters', () => {
    const result = extractCharacterWardrobes(modernCanon);
    expect(result.profiles).toHaveLength(2);
  });

  it('extracts garments from modern descriptions', () => {
    const result = extractCharacterWardrobes(modernCanon);
    const sophie = getCharacterWardrobeProfile(result, 'Sophie');
    expect(sophie!.signature_garments).toEqual(expect.arrayContaining(['jacket', 'boots']));
    expect(sophie!.signature_accessories).toEqual(expect.arrayContaining(['scarf']));
  });
});

// ── Seam Helper Tests ──

describe('seam helpers', () => {
  it('getCharacterWardrobeProfile returns null for unknown character', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    expect(getCharacterWardrobeProfile(result, 'Nonexistent')).toBeNull();
  });

  it('getSignatureGarmentNouns returns garment list', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const nouns = getSignatureGarmentNouns(result, 'Lord Takeda');
    expect(nouns.length).toBeGreaterThan(0);
  });

  it('getWardrobeAdjustments returns state for valid key', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const adj = getWardrobeAdjustments(result, 'Hana', 'work');
    expect(adj).not.toBeNull();
    expect(adj!.state_key).toBe('work');
  });

  it('getWardrobeAdjustments returns null for invalid state', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    expect(getWardrobeAdjustments(result, 'Hana', 'nonexistent_state')).toBeNull();
  });
});

// ── Persistence Shape Tests ──

describe('persistence shape', () => {
  it('extraction result has stable shape', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    expect(result).toHaveProperty('profiles');
    expect(result).toHaveProperty('state_matrix');
    expect(result).toHaveProperty('scene_costume_evidence');
    expect(result).toHaveProperty('extraction_version');
    expect(result).toHaveProperty('extracted_at');
    expect(result).toHaveProperty('source_doc_types');
  });

  it('profile has all required fields', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const profile = result.profiles[0];
    expect(profile).toHaveProperty('character_name');
    expect(profile).toHaveProperty('character_id_or_key');
    expect(profile).toHaveProperty('wardrobe_identity_summary');
    expect(profile).toHaveProperty('silhouette_language');
    expect(profile).toHaveProperty('fabric_language');
    expect(profile).toHaveProperty('palette_logic');
    expect(profile).toHaveProperty('signature_garments');
    expect(profile).toHaveProperty('signature_accessories');
    expect(profile).toHaveProperty('costume_constraints');
    expect(profile).toHaveProperty('confidence');
    expect(profile).toHaveProperty('extraction_version');
  });

  it('state definition has all required fields', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const states = Object.values(result.state_matrix)[0];
    expect(states.length).toBeGreaterThan(0);
    const state = states[0];
    expect(state).toHaveProperty('state_key');
    expect(state).toHaveProperty('label');
    expect(state).toHaveProperty('rationale');
    expect(state).toHaveProperty('explicit_or_inferred');
    expect(state).toHaveProperty('trigger_conditions');
    expect(state).toHaveProperty('garment_adjustments');
    expect(state).toHaveProperty('fabric_adjustments');
    expect(state).toHaveProperty('silhouette_adjustments');
  });
});

// ── Craft/Labor Identity Tests ──

describe('craft and labor identity', () => {
  it('potter gets occupation-derived garments', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const hana = getCharacterWardrobeProfile(result, 'Hana');
    // Should have apron or smock from potter occupation signals
    const garments = hana!.signature_garments;
    expect(garments.some(g => ['apron', 'smock', 'work robe'].includes(g))).toBe(true);
  });

  it('potter gets linen/hemp fabric language', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const hana = getCharacterWardrobeProfile(result, 'Hana');
    expect(hana!.fabric_language).toMatch(/linen|hemp|cotton|undyed/);
  });
});

// ── Class Hierarchy Tests ──

describe('class hierarchy costume logic', () => {
  const hierarchyCanon = {
    characters: [
      { name: 'King', role: 'The ruling king', description: 'Wears a crown and golden robe' },
      { name: 'Servant', role: 'Palace servant', description: 'Wears simple homespun tunic' },
    ],
    world_rules: 'Strict class hierarchy. Wedding ceremony is a major event.',
  };

  it('king gets elite class expression', () => {
    const result = extractCharacterWardrobes(hierarchyCanon);
    const king = getCharacterWardrobeProfile(result, 'King');
    expect(king!.class_status_expression).toContain('elite');
  });

  it('servant gets working class expression', () => {
    const result = extractCharacterWardrobes(hierarchyCanon);
    const servant = getCharacterWardrobeProfile(result, 'Servant');
    expect(servant!.class_status_expression).toContain('working');
  });

  it('elite damage_wear_logic reflects rarity of damage', () => {
    const result = extractCharacterWardrobes(hierarchyCanon);
    const king = getCharacterWardrobeProfile(result, 'King');
    expect(king!.damage_wear_logic).toMatch(/rare|crisis|status/i);
  });
});

// ── Provenance Tests ──

describe('provenance tracking', () => {
  it('tracks source doc types', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    expect(result.source_doc_types).toEqual(expect.arrayContaining(['world_rules', 'premise']));
  });

  it('profiles track source doc types', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    const profile = result.profiles[0];
    expect(profile.source_doc_types.length).toBeGreaterThan(0);
  });
});

// ── Scene Costume Evidence Tests ──

describe('scene costume evidence', () => {
  const feudalWithScenes = {
    ...feudalCanon,
    scene_texts: [
      {
        scene_key: 'sc-01',
        scene_number: 1,
        slugline: 'INT. POTTERY WORKSHOP - DAY',
        content: 'Hana kneels at the wheel, her linen apron stained with clay. She wears a simple cotton tunic, sleeves rolled up above her elbows.',
        characters_present: ['Hana'],
      },
      {
        scene_key: 'sc-02',
        scene_number: 2,
        slugline: 'INT. GREAT HALL - NIGHT',
        content: 'Lord Takeda enters in his finest silk kimono, a gold obi sash at his waist. His fan is tucked into his belt. The court watches in silence.',
        characters_present: ['Lord Takeda'],
      },
      {
        scene_key: 'sc-03',
        scene_number: 3,
        slugline: 'EXT. MOUNTAIN ROAD - DAY',
        content: 'Hana pulls a torn wool cloak around her shoulders. Her dress is mud-stained from the journey. Rain soaks through the fabric.',
        characters_present: ['Hana'],
      },
    ],
  };

  it('extracts scene costume facts', () => {
    const result = extractCharacterWardrobes(feudalWithScenes);
    expect(result.scene_costume_evidence).not.toBeNull();
    expect(result.scene_costume_evidence!.facts.length).toBeGreaterThan(0);
  });

  it('finds explicit garments from scene text', () => {
    const result = extractCharacterWardrobes(feudalWithScenes);
    const hanaFacts = result.scene_costume_evidence!.facts.filter(f => f.character_key === 'hana');
    expect(hanaFacts.length).toBeGreaterThanOrEqual(1);
    const allGarments = hanaFacts.flatMap(f => f.garments);
    expect(allGarments).toEqual(expect.arrayContaining(['apron']));
  });

  it('detects costume condition signals from scene text', () => {
    const result = extractCharacterWardrobes(feudalWithScenes);
    const sc3Facts = result.scene_costume_evidence!.facts.filter(f => f.scene_key === 'sc-03');
    expect(sc3Facts.length).toBeGreaterThanOrEqual(1);
    const conditions = sc3Facts.flatMap(f => f.condition_signals);
    expect(conditions).toEqual(expect.arrayContaining(['torn']));
  });

  it('enriches state matrix with scene evidence', () => {
    const result = extractCharacterWardrobes(feudalWithScenes);
    const hanaStates = getCharacterWardrobeStates(result, 'Hana');
    // Should have a work state enriched with explicit scene evidence
    const workState = hanaStates.find(s => s.state_key === 'work');
    expect(workState).toBeDefined();
    expect(workState!.explicit_or_inferred).toBe('explicit');
    // Should include scene linkage in trigger conditions
    expect(workState!.trigger_conditions).toEqual(expect.arrayContaining(['scene:sc-01']));
  });

  it('scene evidence includes correct character list', () => {
    const result = extractCharacterWardrobes(feudalWithScenes);
    const summary = result.scene_costume_evidence!.summary;
    expect(summary.characters_with_scene_evidence).toContain('hana');
    expect(summary.scenes_scanned).toBe(3);
  });

  it('preserves global profile while adding scene specificity', () => {
    const result = extractCharacterWardrobes(feudalWithScenes);
    const hana = getCharacterWardrobeProfile(result, 'Hana');
    // Global profile still intact
    expect(hana).not.toBeNull();
    expect(hana!.class_status_expression).toContain('artisan');
    // Scene evidence adds specificity on top
    expect(result.scene_costume_evidence!.facts.length).toBeGreaterThan(0);
  });

  it('tracks scene_text as source doc type', () => {
    const result = extractCharacterWardrobes(feudalWithScenes);
    expect(result.source_doc_types).toContain('scene_text');
  });

  it('returns null scene evidence when no scenes provided', () => {
    const result = extractCharacterWardrobes(feudalCanon);
    expect(result.scene_costume_evidence).toBeNull();
  });
});

// ── Profile Reinforcement Tests ──

describe('Profile Reinforcement from Scene Evidence', () => {
  it('reinforces weak profile with scene-derived garments and fabrics', () => {
    const sparseCanon = {
      characters: [
        { name: 'Kira', role: 'Wanderer', traits: 'Quiet' },
      ],
      logline: 'A wanderer crosses the desert.',
      setting: 'Ancient desert',
      scene_texts: [
        {
          scene_key: 'sc-1',
          scene_number: 1,
          slugline: 'EXT. DESERT ROAD - DAY',
          content: 'Kira adjusts her leather belt and pulls the linen cloak tighter against the wind. Her boots are worn from travel.',
          characters_present: ['Kira'],
        },
      ],
    };
    const result = extractCharacterWardrobes(sparseCanon);
    const profile = result.profiles.find(p => p.character_id_or_key === 'kira')!;
    expect(profile.signature_garments).toContain('cloak');
    expect(profile.signature_garments).toContain('boots');
    expect(profile.fabric_language).toContain('linen');
    expect(profile.source_doc_types).toContain('scene_reinforcement');
    expect(profile.confidence).not.toBe('low');
  });

  it('does not overwrite strong profiles', () => {
    const strongCanon = {
      characters: [
        { name: 'Lord Takeda', role: 'Provincial lord, elite samurai', description: 'Wears silk kimono and haori, carries a fan and seal' },
      ],
      setting: 'Feudal Japan',
      scene_texts: [
        {
          scene_key: 'sc-5',
          scene_number: 5,
          content: 'Lord Takeda loosens his haori as he enters the garden.',
          characters_present: ['Lord Takeda'],
        },
      ],
    };
    const result = extractCharacterWardrobes(strongCanon);
    const profile = result.profiles.find(p => p.character_name === 'Lord Takeda')!;
    // Strong profile should keep its existing garments, not be overwritten
    expect(profile.signature_garments.length).toBeGreaterThanOrEqual(2);
    expect(profile.confidence).toBe('high');
  });

  it('upgrades low confidence to medium when scene facts exist', () => {
    const weakCanon = {
      characters: [
        { name: 'Ghost', traits: 'Mysterious' },
      ],
      scene_texts: [
        {
          scene_key: 'sc-1',
          scene_number: 1,
          content: 'Ghost appears wearing a torn cloak, leather boots caked in mud.',
          characters_present: ['Ghost'],
        },
      ],
    };
    const result = extractCharacterWardrobes(weakCanon);
    const profile = result.profiles.find(p => p.character_id_or_key === 'ghost')!;
    expect(profile.confidence).not.toBe('low');
    expect(profile.signature_garments).toContain('cloak');
    expect(profile.signature_garments).toContain('boots');
  });
});
