/**
 * lookbookSlotRegistry — Single source of truth for all section/slot/asset-group mappings.
 * Replaces 6+ duplicate mapping locations across the LookBook system.
 *
 * Every module that needs to map between slide types, sections, asset groups,
 * strategy keys, or subject types MUST consume this registry.
 */

// ── Canonical Section Key ────────────────────────────────────────────────────

export type CanonicalSectionKey =
  | 'character_identity'
  | 'world_locations'
  | 'atmosphere_lighting'
  | 'texture_detail'
  | 'symbolic_motifs'
  | 'key_moments'
  | 'hero_frames'
  | 'poster_directions'; // legacy alias — maps to hero_frames

// ── Subject Type ─────────────────────────────────────────────────────────────

export type SubjectType = 'character' | 'world' | 'atmosphere' | 'moment' | 'texture' | 'hero_frame' | 'poster' | 'generic';

// ── Pool Key ─────────────────────────────────────────────────────────────────

export type PoolKey = 'world' | 'atmosphere' | 'texture' | 'motifs' | 'keyMoments' | 'heroFrames' | 'poster';

// ── Canonical Mapping: Section → Query Params ────────────────────────────────

export interface SectionQuerySpec {
  strategy_keys: string[];
  asset_groups: string[];
  fallback_roles?: string[];
  /**
   * CANONICAL LINEAGE GUARD — restrict to images from these generation purposes.
   * If set, images without a matching generation_purpose are excluded (fail-closed).
   * If undefined/empty, no lineage filter is applied (legacy permissive behavior).
   */
  allowed_generation_purposes?: string[];
  /**
   * If set, this section resolves as a composite from the listed upstream section keys.
   * The primary query spec is still used as a direct query, but composite resolution
   * also merges governed images from these upstream sections.
   */
  composite_upstream_sections?: string[];
}

export const SECTION_QUERY_MAP: Record<CanonicalSectionKey, SectionQuerySpec> = {
  character_identity: {
    strategy_keys: ['lookbook_character'],
    asset_groups: ['character'],
    fallback_roles: ['character_primary', 'character_variant'],
    // Only character_identity pipeline images — excludes costume, reference, legacy
    allowed_generation_purposes: ['character_identity', 'lookbook_character'],
  },
  world_locations: {
    strategy_keys: ['lookbook_world'],
    asset_groups: ['world'],
    fallback_roles: ['world_establishing', 'world_detail'],
    // World generation from lookbook pipeline or production design
    allowed_generation_purposes: ['production_design', 'lookbook_world', 'location_reference'],
  },
  atmosphere_lighting: {
    strategy_keys: ['lookbook_visual_language', 'lookbook_world'],
    // PD atmosphere assets route through asset_group='world' (world discipline)
    // AND visual_language for lookbook-native atmosphere outputs.
    asset_groups: ['visual_language', 'world'],
    // Production design + lookbook visual language pipeline
    allowed_generation_purposes: ['production_design', 'lookbook_visual_language'],
  },
  texture_detail: {
    strategy_keys: ['lookbook_visual_language'],
    asset_groups: ['visual_language'],
    // Texture & Detail must come from governed production-design surface studies.
    // Generic lookbook_visual_language outputs are too broad and can admit textile-heavy
    // editorial frames that are not environment/material-world detail.
    allowed_generation_purposes: ['production_design'],
  },
  symbolic_motifs: {
    // Symbolic motifs come from BOTH dedicated lookbook key_moment pipeline
    // AND production design motif families (which use visual_language asset_group).
    // PD motifs are generated with asset_group='visual_language', strategy_key='lookbook_visual_language',
    // generation_purpose='production_design'. We must match both lineages.
    strategy_keys: ['lookbook_key_moment', 'lookbook_visual_language'],
    asset_groups: ['key_moment', 'visual_language'],
    // Production design motifs + lookbook key moment pipeline
    allowed_generation_purposes: ['production_design', 'lookbook_key_moment'],
  },
  key_moments: {
    strategy_keys: ['lookbook_key_moment'],
    asset_groups: ['key_moment'],
    // No lineage restriction — key moments come from multiple sources
  },
  hero_frames: {
    strategy_keys: [],
    asset_groups: ['hero_frame'],
    fallback_roles: ['hero_primary', 'hero_variant'],
    // ONLY hero_frame generation — excludes legacy posters
    allowed_generation_purposes: ['hero_frame'],
  },
  poster_directions: {
    // Poster Directions is a COMPOSITE section — auto-assembles from governed upstream.
    // Direct query catches hero_frame assets; composite resolution supplements from
    // world, key_moments, atmosphere, and symbolic_motifs upstream pools.
    strategy_keys: [],
    asset_groups: ['hero_frame', 'world', 'key_moment', 'visual_language'],
    fallback_roles: ['hero_primary', 'hero_variant'],
    allowed_generation_purposes: ['hero_frame', 'production_design', 'lookbook_world', 'lookbook_key_moment', 'lookbook_visual_language'],
    composite_upstream_sections: ['hero_frames', 'world_locations', 'key_moments', 'atmosphere_lighting', 'symbolic_motifs'],
  },
};

// ── Shot type filters per section ────────────────────────────────────────────

export const SECTION_SHOT_FILTER: Partial<Record<CanonicalSectionKey, string[]>> = {
  // Atmosphere: PD atmosphere assets use 'atmospheric'/'time_variant'/'lighting_ref' shot types
  // regardless of whether they're in world or visual_language asset_group.
  atmosphere_lighting: ['atmospheric', 'time_variant', 'lighting_ref'],
  texture_detail: ['texture_ref', 'detail', 'composition_ref', 'color_ref'],
  key_moments: ['tableau', 'medium', 'close_up', 'wide'],
  // Symbolic motifs: when PD motifs share asset_group with textures, shot_type helps disambiguate.
  // PD motifs use 'detail'; we also include motif-specific and tableau shots.
  symbolic_motifs: ['detail', 'tableau', 'close_up', 'composition_ref'],
};

// ── Slide Type → Subject Type ────────────────────────────────────────────────

export const SLIDE_SUBJECT_TYPE: Record<string, SubjectType> = {
  cover: 'hero_frame',
  creative_statement: 'atmosphere',
  world: 'world',
  key_moments: 'moment',
  characters: 'character',
  visual_language: 'texture',
  themes: 'atmosphere',
  story_engine: 'moment',
  comparables: 'atmosphere',
  closing: 'hero_frame',
};

// ── Slide Type → Pool Key ────────────────────────────────────────────────────

export const SLIDE_TO_POOL: Record<string, PoolKey> = {
  cover: 'heroFrames',
  closing: 'heroFrames',
  world: 'world',
  themes: 'atmosphere',
  creative_statement: 'atmosphere',
  visual_language: 'texture',
  key_moments: 'keyMoments',
  story_engine: 'keyMoments',
};

// ── Slide Type → Section Affinity (for background selection) ─────────────────

export const SLIDE_SECTION_AFFINITY: Record<string, PoolKey[]> = {
  cover: ['heroFrames', 'world', 'keyMoments'],
  creative_statement: ['atmosphere', 'world'],
  world: ['world'],
  key_moments: ['keyMoments'],
  characters: [],
  visual_language: ['texture', 'motifs', 'atmosphere'],
  themes: ['atmosphere', 'world'],
  story_engine: ['keyMoments', 'motifs'],
  comparables: ['atmosphere', 'world'],
  closing: ['heroFrames', 'world', 'atmosphere'],
};

// ── Subject → Asset Group (for orchestrator) ─────────────────────────────────

export const SUBJECT_TO_ASSET_GROUP: Record<string, string> = {
  character: 'character',
  world: 'world',
  atmosphere: 'visual_language',
  moment: 'key_moment',
  texture: 'visual_language',
  hero_frame: 'hero_frame',
  poster: 'poster',
  generic: 'visual_language',
};

// ── Subject → Strategy Keys (for orchestrator) ───────────────────────────────

export const SUBJECT_TO_STRATEGY_KEYS: Record<string, string[]> = {
  character: ['lookbook_character'],
  world: ['lookbook_world'],
  atmosphere: ['lookbook_visual_language'],
  moment: ['lookbook_key_moment'],
  texture: ['lookbook_visual_language'],
  hero_frame: [],
  poster: [],
  generic: ['lookbook_visual_language'],
};

// ── Canonical Section Filter Builder ─────────────────────────────────────────
// Single function to build DB query filters for a section.
// MUST be used by ALL code that queries or mutates section-scoped images.

export interface CanonicalSectionFilter {
  strategyKeys: string[];
  assetGroups: string[];
  fallbackRoles?: string[];
  shotTypes?: string[];
  /**
   * LOOKBOOK CANONICAL VISIBILITY BOUNDARY
   * If set, only images with matching generation_purpose are visible.
   * DO NOT BROADEN TO HISTORICAL PROJECT_IMAGES WITHOUT LINEAGE.
   */
  allowedGenerationPurposes?: string[];
}

export function buildCanonicalSectionFilter(sectionKey: CanonicalSectionKey): CanonicalSectionFilter {
  const mapping = SECTION_QUERY_MAP[sectionKey];
  const shotTypes = SECTION_SHOT_FILTER[sectionKey];
  return {
    strategyKeys: mapping.strategy_keys,
    assetGroups: mapping.asset_groups,
    fallbackRoles: mapping.fallback_roles,
    shotTypes: shotTypes || undefined,
    allowedGenerationPurposes: mapping.allowed_generation_purposes,
  };
}

// ── Section Key → Edge Function Section Param ────────────────────────────────

export function sectionKeyToEdgeFunctionSection(sectionKey: CanonicalSectionKey): string {
  switch (sectionKey) {
    case 'character_identity': return 'character';
    case 'world_locations': return 'world';
    case 'atmosphere_lighting': return 'visual_language';
    case 'texture_detail': return 'visual_language';
    case 'symbolic_motifs': return 'key_moment';
    case 'key_moments': return 'key_moment';
    case 'hero_frames': return 'world';
    case 'poster_directions': return 'world';
  }
}

export function sectionKeyToAssetGroup(sectionKey: CanonicalSectionKey): string {
  switch (sectionKey) {
    case 'character_identity': return 'character';
    case 'world_locations': return 'world';
    case 'atmosphere_lighting': return 'visual_language';
    case 'texture_detail': return 'visual_language';
    case 'symbolic_motifs': return 'key_moment';
    case 'key_moments': return 'key_moment';
    case 'hero_frames': return 'hero_frame';
    case 'poster_directions': return 'hero_frame';
  }
}
