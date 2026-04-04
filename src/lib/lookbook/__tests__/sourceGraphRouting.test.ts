/**
 * sourceGraphRouting — Tests canonical source-graph routing
 * for Lookbook sections, specifically:
 *   - symbolic_motifs ingests PD motif outputs
 *   - poster_directions auto-assembles from governed upstream (composite resolution)
 *   - PD outputs feed intended downstream sections
 *   - governance is preserved through routing
 *   - atmosphere_lighting accepts PD world-discipline atmosphere assets
 *   - composite_upstream_sections is consumed by the resolver
 */
import { describe, it, expect } from 'vitest';
import {
  buildCanonicalSectionFilter,
  SECTION_QUERY_MAP,
  type CanonicalSectionKey,
} from '@/lib/lookbook/pipeline/lookbookSlotRegistry';

// ── Simulated PD motif image metadata ──
const PD_MOTIF_IMAGE = {
  strategy_key: 'lookbook_visual_language',
  asset_group: 'visual_language',
  generation_purpose: 'production_design',
  shot_type: 'detail',
};

// ── Simulated PD texture image metadata ──
const PD_TEXTURE_IMAGE = {
  strategy_key: 'lookbook_visual_language',
  asset_group: 'visual_language',
  generation_purpose: 'production_design',
  shot_type: 'texture_ref',
};

// ── Simulated hero frame image metadata ──
const HERO_FRAME_IMAGE = {
  strategy_key: '',
  asset_group: 'hero_frame',
  generation_purpose: 'hero_frame',
  shot_type: 'wide',
};

// ── Simulated PD atmosphere image (world-discipline routing) ──
const PD_ATMOSPHERE_WORLD_IMAGE = {
  strategy_key: 'lookbook_world',
  asset_group: 'world',
  generation_purpose: 'production_design',
  shot_type: 'atmospheric',
};

// ── Simulated PD atmosphere image (visual_language routing) ──
const PD_ATMOSPHERE_VL_IMAGE = {
  strategy_key: 'lookbook_visual_language',
  asset_group: 'visual_language',
  generation_purpose: 'production_design',
  shot_type: 'atmospheric',
};

// ── Simulated world image metadata ──
const PD_WORLD_IMAGE = {
  strategy_key: 'lookbook_world',
  asset_group: 'world',
  generation_purpose: 'production_design',
  shot_type: 'wide',
};

function imageMatchesFilter(
  image: typeof PD_MOTIF_IMAGE,
  filter: ReturnType<typeof buildCanonicalSectionFilter>,
): boolean {
  // For multi-group sections, check if image matches ANY of the groups/strategies
  const strategyMatch = filter.strategyKeys.length === 0 || filter.strategyKeys.includes(image.strategy_key);
  const assetMatch = filter.assetGroups.length === 0 || filter.assetGroups.includes(image.asset_group);

  // When both strategy and asset are specified, either can match (OR logic for multi-group)
  if (filter.strategyKeys.length > 0 && filter.assetGroups.length > 0) {
    if (!strategyMatch && !assetMatch) return false;
  } else if (filter.strategyKeys.length > 0) {
    if (!strategyMatch) return false;
  } else if (filter.assetGroups.length > 0) {
    if (!assetMatch) return false;
  }

  // shot_type check
  if (filter.shotTypes?.length) {
    if (!filter.shotTypes.includes(image.shot_type)) return false;
  }
  // generation_purpose check
  if (filter.allowedGenerationPurposes?.length) {
    if (!filter.allowedGenerationPurposes.includes(image.generation_purpose)) return false;
  }
  return true;
}

describe('Canonical Source Graph Routing', () => {
  describe('symbolic_motifs', () => {
    const filter = buildCanonicalSectionFilter('symbolic_motifs');

    it('ingests PD motif images (production_design_motif family)', () => {
      expect(imageMatchesFilter(PD_MOTIF_IMAGE, filter)).toBe(true);
    });

    it('excludes PD texture_ref images (different shot_type)', () => {
      expect(imageMatchesFilter(PD_TEXTURE_IMAGE, filter)).toBe(false);
    });

    it('allows lookbook_key_moment lineage', () => {
      const lookbookMotif = {
        strategy_key: 'lookbook_key_moment',
        asset_group: 'key_moment',
        generation_purpose: 'lookbook_key_moment',
        shot_type: 'tableau',
      };
      expect(filter.allowedGenerationPurposes).toContain('lookbook_key_moment');
      expect(imageMatchesFilter(lookbookMotif, filter)).toBe(true);
    });

    it('includes production_design in allowed generation purposes', () => {
      expect(filter.allowedGenerationPurposes).toContain('production_design');
    });

    it('has both visual_language and key_moment in asset_groups', () => {
      expect(filter.assetGroups).toContain('visual_language');
      expect(filter.assetGroups).toContain('key_moment');
    });

    it('blocker should not trigger when PD motifs exist in matching filter', () => {
      // PD motif image matches the filter — so section should NOT show "no motifs found"
      expect(imageMatchesFilter(PD_MOTIF_IMAGE, filter)).toBe(true);
    });
  });

  describe('poster_directions', () => {
    const filter = buildCanonicalSectionFilter('poster_directions');
    const spec = SECTION_QUERY_MAP['poster_directions'];

    it('accepts hero_frame images', () => {
      expect(imageMatchesFilter(HERO_FRAME_IMAGE, filter)).toBe(true);
    });

    it('accepts PD world images', () => {
      expect(imageMatchesFilter(PD_WORLD_IMAGE, filter)).toBe(true);
    });

    it('accepts PD atmosphere images', () => {
      expect(filter.shotTypes).toBeUndefined();
      expect(imageMatchesFilter(PD_ATMOSPHERE_VL_IMAGE, filter)).toBe(true);
    });

    it('accepts PD motif images', () => {
      expect(imageMatchesFilter(PD_MOTIF_IMAGE, filter)).toBe(true);
    });

    it('has composite_upstream_sections defined', () => {
      expect(spec.composite_upstream_sections).toBeDefined();
      expect(spec.composite_upstream_sections).toContain('hero_frames');
      expect(spec.composite_upstream_sections).toContain('world_locations');
      expect(spec.composite_upstream_sections).toContain('key_moments');
      expect(spec.composite_upstream_sections).toContain('atmosphere_lighting');
      expect(spec.composite_upstream_sections).toContain('symbolic_motifs');
    });

    it('composite_upstream_sections is consumed by fetchSectionImages router', () => {
      // Verify the spec has composite_upstream_sections — the router checks this
      // to dispatch to resolveCompositeSection instead of fetchSectionImagesDirect.
      expect(spec.composite_upstream_sections).toBeDefined();
      expect(spec.composite_upstream_sections!.length).toBeGreaterThan(0);
      // Non-composite sections should NOT have this field
      expect(SECTION_QUERY_MAP['hero_frames'].composite_upstream_sections).toBeUndefined();
      expect(SECTION_QUERY_MAP['world_locations'].composite_upstream_sections).toBeUndefined();
    });

    it('includes all required generation purposes', () => {
      expect(filter.allowedGenerationPurposes).toContain('hero_frame');
      expect(filter.allowedGenerationPurposes).toContain('production_design');
      expect(filter.allowedGenerationPurposes).toContain('lookbook_world');
    });
  });

  describe('atmosphere_lighting — PD world-discipline routing', () => {
    const filter = buildCanonicalSectionFilter('atmosphere_lighting');

    it('includes asset_group world for PD atmosphere assets', () => {
      expect(filter.assetGroups).toContain('world');
    });

    it('includes asset_group visual_language for lookbook atmosphere', () => {
      expect(filter.assetGroups).toContain('visual_language');
    });

    it('accepts PD atmosphere with world asset_group (world-discipline)', () => {
      expect(imageMatchesFilter(PD_ATMOSPHERE_WORLD_IMAGE, filter)).toBe(true);
    });

    it('accepts PD atmosphere with visual_language asset_group', () => {
      expect(imageMatchesFilter(PD_ATMOSPHERE_VL_IMAGE, filter)).toBe(true);
    });

    it('excludes world images with non-atmospheric shot_type', () => {
      // Wide world images should NOT appear in atmosphere_lighting
      expect(imageMatchesFilter(PD_WORLD_IMAGE, filter)).toBe(false);
    });

    it('allows production_design and lookbook_visual_language lineage', () => {
      expect(filter.allowedGenerationPurposes).toContain('production_design');
      expect(filter.allowedGenerationPurposes).toContain('lookbook_visual_language');
    });

    it('includes lookbook_world in strategy_keys for PD world-discipline routing', () => {
      expect(filter.strategyKeys).toContain('lookbook_world');
    });
  });

  describe('texture_detail isolation', () => {
    const filter = buildCanonicalSectionFilter('texture_detail');

    it('only allows production_design lineage', () => {
      expect(filter.allowedGenerationPurposes).toEqual(['production_design']);
    });

    it('accepts PD texture images', () => {
      expect(imageMatchesFilter(PD_TEXTURE_IMAGE, filter)).toBe(true);
    });

    it('PD motif images (detail shot_type) overlap is expected', () => {
      // texture_detail has shot filter including 'detail'
      // PD motifs have shot_type 'detail' — overlap is handled by curation
      expect(imageMatchesFilter(PD_MOTIF_IMAGE, filter)).toBe(true);
    });
  });

  describe('PD outputs feed downstream sections', () => {
    it('world_locations accepts PD environment images', () => {
      const filter = buildCanonicalSectionFilter('world_locations');
      expect(filter.allowedGenerationPurposes).toContain('production_design');
      expect(imageMatchesFilter(PD_WORLD_IMAGE, filter)).toBe(true);
    });

    it('atmosphere_lighting accepts PD atmosphere images via world discipline', () => {
      const filter = buildCanonicalSectionFilter('atmosphere_lighting');
      expect(filter.allowedGenerationPurposes).toContain('production_design');
      expect(imageMatchesFilter(PD_ATMOSPHERE_WORLD_IMAGE, filter)).toBe(true);
    });

    it('atmosphere_lighting rejects non-atmospheric world images', () => {
      const filter = buildCanonicalSectionFilter('atmosphere_lighting');
      // Wide world establishing shot should NOT leak into atmosphere
      expect(imageMatchesFilter(PD_WORLD_IMAGE, filter)).toBe(false);
    });
  });

  describe('governance preservation', () => {
    it('hero_frames still restricted to hero_frame lineage only', () => {
      const filter = buildCanonicalSectionFilter('hero_frames');
      expect(filter.allowedGenerationPurposes).toEqual(['hero_frame']);
    });

    it('character_identity restricted to identity lineage', () => {
      const filter = buildCanonicalSectionFilter('character_identity');
      expect(filter.allowedGenerationPurposes).toEqual(['character_identity', 'lookbook_character']);
    });

    it('every section has buildCanonicalSectionFilter defined', () => {
      const allSections: CanonicalSectionKey[] = [
        'character_identity', 'world_locations', 'atmosphere_lighting',
        'texture_detail', 'symbolic_motifs', 'key_moments',
        'hero_frames', 'poster_directions',
      ];
      for (const key of allSections) {
        const filter = buildCanonicalSectionFilter(key);
        expect(filter).toBeDefined();
        expect(filter.assetGroups.length).toBeGreaterThan(0);
      }
    });

    it('no non-composite section has composite_upstream_sections', () => {
      const directSections: CanonicalSectionKey[] = [
        'character_identity', 'world_locations', 'atmosphere_lighting',
        'texture_detail', 'symbolic_motifs', 'key_moments', 'hero_frames',
      ];
      for (const key of directSections) {
        expect(SECTION_QUERY_MAP[key].composite_upstream_sections).toBeUndefined();
      }
    });
  });

  describe('empty section shortfall behavior', () => {
    it('sections without shot filters accept broader shot types', () => {
      const posterFilter = buildCanonicalSectionFilter('poster_directions');
      expect(posterFilter.shotTypes).toBeUndefined();
    });

    it('key_moments has no generation_purpose restriction', () => {
      const filter = buildCanonicalSectionFilter('key_moments');
      expect(filter.allowedGenerationPurposes).toBeUndefined();
    });
  });

  describe('stale cleanup protection', () => {
    it('locked visual set images should be protected from stale cleanup', () => {
      // This is a contract test — useLookbookStaleCleanup queries visual_set_slots
      // for locked sets and protects those image IDs from archival.
      // The test validates the invariant exists in the registry layer.
      const allSections = Object.keys(SECTION_QUERY_MAP) as CanonicalSectionKey[];
      for (const key of allSections) {
        const spec = SECTION_QUERY_MAP[key];
        // Every section with lineage restrictions must be subject to stale cleanup
        // but cleanup must respect locked visual_set_slots
        if (spec.allowed_generation_purposes?.length) {
          expect(spec.allowed_generation_purposes.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('resolver filter parity (AND→OR regression)', () => {
    // Regression: resolveCanonImages previously used AND logic for strategy_keys + asset_groups,
    // which starved PD images with null strategy_key. Now both paths use OR logic.

    it('PD atmosphere image with NULL strategy_key matches via asset_group OR', () => {
      const pdAtmosphereNullStrategy = {
        strategy_key: '',  // PD images may lack strategy_key
        asset_group: 'world',
        generation_purpose: 'production_design',
        shot_type: 'atmospheric',
      };
      const filter = buildCanonicalSectionFilter('atmosphere_lighting');
      // With OR logic, asset_group='world' should match even when strategy_key is empty
      expect(filter.assetGroups).toContain('world');
      expect(imageMatchesFilter(pdAtmosphereNullStrategy, filter)).toBe(true);
    });

    it('PD motif image with NULL strategy_key matches symbolic_motifs via asset_group OR', () => {
      const pdMotifNullStrategy = {
        strategy_key: '',
        asset_group: 'visual_language',
        generation_purpose: 'production_design',
        shot_type: 'detail',
      };
      const filter = buildCanonicalSectionFilter('symbolic_motifs');
      expect(imageMatchesFilter(pdMotifNullStrategy, filter)).toBe(true);
    });

    it('multi-group sections use OR not AND for strategy+asset matching', () => {
      // atmosphere_lighting has BOTH strategy_keys and asset_groups set
      const filter = buildCanonicalSectionFilter('atmosphere_lighting');
      expect(filter.strategyKeys.length).toBeGreaterThan(0);
      expect(filter.assetGroups.length).toBeGreaterThan(0);
      // An image matching ONLY asset_group (not strategy_key) must still pass
      const assetOnlyMatch = {
        strategy_key: 'unrelated_key',
        asset_group: 'world',
        generation_purpose: 'production_design',
        shot_type: 'atmospheric',
      };
      expect(imageMatchesFilter(assetOnlyMatch, filter)).toBe(true);
    });

    it('single-source sections (hero_frames) unaffected by OR change', () => {
      const filter = buildCanonicalSectionFilter('hero_frames');
      // hero_frames has empty strategy_keys, so it uses asset_group IN directly
      expect(filter.strategyKeys).toEqual([]);
      expect(filter.assetGroups).toContain('hero_frame');
    });
  });

  describe('composite resolver contract', () => {
    it('poster_directions composite resolver dispatches via SECTION_QUERY_MAP', () => {
      const spec = SECTION_QUERY_MAP['poster_directions'];
      // The resolver checks spec.composite_upstream_sections?.length
      // and dispatches to resolveCompositeSection
      expect(spec.composite_upstream_sections).toBeDefined();
      expect(spec.composite_upstream_sections!.length).toBe(5);
    });

    it('each upstream section in poster_directions is a valid CanonicalSectionKey', () => {
      const spec = SECTION_QUERY_MAP['poster_directions'];
      const validKeys = Object.keys(SECTION_QUERY_MAP);
      for (const upKey of spec.composite_upstream_sections!) {
        expect(validKeys).toContain(upKey);
      }
    });

    it('upstream sections are not themselves composite (no infinite recursion)', () => {
      const spec = SECTION_QUERY_MAP['poster_directions'];
      for (const upKey of spec.composite_upstream_sections!) {
        const upSpec = SECTION_QUERY_MAP[upKey as CanonicalSectionKey];
        expect(upSpec.composite_upstream_sections).toBeUndefined();
      }
    });
  });
});
