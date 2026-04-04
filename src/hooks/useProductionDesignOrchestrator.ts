/**
 * useProductionDesignOrchestrator — Auto-build + resume + review orchestration
 * for the Production Design workspace.
 *
 * Uses existing visual_sets infrastructure with PD-specific domains.
 * Uses generate-lookbook-image for world-only image generation.
 * No new tables. No parallel systems.
 *
 * Supports: reject, redo, retry-with-notes per family.
 *
 * ═══ VISUAL AUTHORITY BOUNDARY ═══
 * CANONICAL PATHS:
 *   - Brief retrieval: getVisualCanonBriefContent() only (no direct canon_json key reads)
 *   - Signal extraction: extractVisualCanonSignals() only (no ad hoc prose parsing)
 *   - Enrichment: resolvePDEnrichmentOrNull() only (additive, non-authoritative)
 * FORBIDDEN:
 *   - Direct reads of canon_json['visual_canon_brief_content']
 *   - Ad hoc prose parsing or motif derivation
 *   - Treating enrichment as authoritative truth
 * See: src/lib/visual/visualPublicEntrypoints.ts
 */
import { useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVisualSets, type VisualSet, type VisualSetSlot } from './useVisualSets';
import { useCanonLocations } from './useCanonLocations';
import { useProjectCanon } from './useProjectCanon';
import { useVisualStyleProfile } from './useVisualStyleProfile';
import { useLocationVisualDatasets } from './useLocationVisualDatasets';
import { resolveDatasetForSlot, formatResolutionLog } from '@/lib/visual/datasetRetrievalResolver';
import { computeCanonHashFromSources } from '@/lib/visual/datasetCanonHash';
import { toast } from 'sonner';
import { resolveProductionDesignFromCanon, serializeProductionDesign } from '@/lib/lookbook/productionDesign';
import {
  resolveAuthorityForPDDomain,
  filterTextForSlot,
  filterMaterialsForSlot,
  buildPriorityDirective,
  getSlotNegatives,
} from '@/lib/visual/slotAuthority';
import { validateNoteAgainstCanon, type NoteValidationResult } from '@/lib/visual/canonNoteValidator';
import { interpretForSlot } from '@/lib/visual/semanticRoleInterpreter';
import {
  validateMotifCandidate,
  deriveMotifFingerprint,
  fingerprintKey,
  resolveLineageStatus,
  resolveMotifSelectionStatus,
  serializeMotifDiagnostics,
  MOTIF_SLOT_EXPECTATIONS,
  type MotifFamilyFingerprint,
  type MotifValidationResult,
  type MotifLineageStatus,
  type MotifSelectionStatus,
} from '@/lib/visual/motifValidation';
import { resolveMotifPrimaryAnchor } from '@/lib/visual/motifAnchorResolver';
import type { VisualCanonExtractionResult } from '@/lib/visual/visualCanonExtractor';
import { resolveWorldValidationMode, type WorldValidationRules } from '@/lib/visual/worldValidationMode';
import { resolvePDEnrichmentOrNull } from '@/lib/visual/visualCanonEnrichment';
import { extractVisualCanonSignals } from '@/lib/visual/visualCanonBrief';
import { getVisualCanonBriefContent } from '@/lib/visual/visualCanonBriefAccessor';
// NOTE: World-level costume families removed — costume workflow is now character-driven
// via Character Wardrobe Profiles → Costume-on-Actor Looks → Scene Demo consumption.

// ── PD Family definition ──

export interface PDFamily {
  domain: string;
  targetType: string;
  targetName: string;
  targetId?: string | null;
  label: string;
  description: string;
}

export type PDBuildStatus = 'idle' | 'building' | 'done' | 'error';

export type FamilyBuildState = 'pending' | 'generating' | 'partial' | 'ready' | 'approved' | 'locked' | 'failed' | 'rejected';

export interface FamilyProgress {
  state: FamilyBuildState;
  totalSlots: number;
  filledSlots: number;
  failedSlots: number;
  activeSlotLabel?: string;
}

export interface BuildProgress {
  total: number;
  done: number;
  failed: number;
  activeFamilyKey?: string;
  activeSlotLabel?: string;
  /** Monotonic counter — increments after each slot completes. Used by UI to trigger immediate refresh. */
  slotCompletedTick: number;
  /** The slot key currently being generated (for per-slot loading state). */
  activeSlotKey?: string;
  familyProgress: Map<string, FamilyProgress>;
}

// ── Resolve required PD families from canon ──

function resolveRequiredFamilies(
  locations: Array<{ id: string; canonical_name: string; story_importance: string }>,
  _canonJson: Record<string, unknown>,
): PDFamily[] {
  const families: PDFamily[] = [];

  const sorted = [...locations].sort((a, b) => {
    const order: Record<string, number> = { primary: 0, secondary: 1, tertiary: 2, minor: 3 };
    return (order[a.story_importance] ?? 4) - (order[b.story_importance] ?? 4);
  });
  const topLocations = sorted.slice(0, 4);

  for (const loc of topLocations) {
    families.push({
      domain: 'production_design_location',
      targetType: 'location',
      targetName: loc.canonical_name,
      targetId: loc.id,
      label: loc.canonical_name,
      description: `Environment design for ${loc.canonical_name}`,
    });
  }

  // Atmosphere & Lighting — per-location, bound to specific architecture
  for (const loc of topLocations) {
    families.push({
      domain: 'production_design_atmosphere',
      targetType: 'location',
      targetName: loc.canonical_name,
      targetId: loc.id,
      label: `${loc.canonical_name} — Atmosphere`,
      description: `Light, weather, and spatial mood as expressed through ${loc.canonical_name}`,
    });
  }

  families.push({
    domain: 'production_design_texture',
    targetType: 'project',
    targetName: 'Surface Language',
    label: 'Surface Language',
    description: 'Architectural surfaces, material character, and environmental texture',
  });

  families.push({
    domain: 'production_design_motif',
    targetType: 'project',
    targetName: 'Production Motifs',
    label: 'Production Motifs',
    description: 'Physically real, script-derived recurring objects, surfaces, and material systems',
  });

  // World-level costume families REMOVED — costume workflow is now character-driven:
  // Character Wardrobe Profiles → Costume-on-Actor Looks → Scene Demo consumption.

  return families;
}

// ── Prompt builders (world-only, no characters, authority-governed) ──

function buildLocationPrompt(
  targetName: string,
  pdDirective: string,
  slotKey: string,
  styleProfile: { period?: string; lighting_philosophy?: string; texture_materiality?: string } | null,
  authority: ReturnType<typeof resolveAuthorityForPDDomain>,
  semanticBlock: string,
  userNote?: string,
): string {
  const period = styleProfile?.period || '';
  const filteredName = filterTextForSlot(targetName, authority);
  const base = `${period ? period + ' era ' : ''}environment: ${filteredName}.`;

  const slotInstructions: Record<string, string> = {
    establishing_wide: `Wide establishing shot of ${filteredName}. Show full architecture, scale, and spatial context. No people. Empty environment.`,
    atmospheric: `Atmospheric mood shot of ${filteredName}. Emphasize light, shadow, weather, and emotional tone. ${styleProfile?.lighting_philosophy ? 'Lighting: ' + styleProfile.lighting_philosophy + '.' : ''} No people.`,
    detail: `Architectural and material detail shot within ${filteredName}. Close-up of surfaces, textures, objects. No people.`,
    time_variant: `${filteredName} at a different time of day or season. Show how light and atmosphere transform the space. No people.`,
  };

  const parts = [
    base,
    slotInstructions[slotKey] || `Visual reference for ${filteredName}. No people.`,
  ];

  if (userNote) {
    parts.push('', `[DIRECTOR NOTE]: ${userNote}`);
  }

  parts.push(
    '',
    semanticBlock,
    '',
    buildPriorityDirective(authority),
    '',
    pdDirective,
    '[STRICT] No characters. No people. No figures. Environment only.',
  );

  return parts.join('\n');
}

function buildAtmospherePrompt(
  targetName: string,
  pdDirective: string,
  slotKey: string,
  styleProfile: { lighting_philosophy?: string; color_response?: string } | null,
  authority: ReturnType<typeof resolveAuthorityForPDDomain>,
  semanticBlock: string,
  userNote?: string,
): string {
  const filteredName = filterTextForSlot(targetName, authority);
  const slotMap: Record<string, string> = {
    atmosphere_primary: `Atmosphere and lighting study of ${filteredName}. How light, weather, haze, and time-of-day express through the REAL architecture of this specific location. Show the actual built environment under atmospheric conditions — not a fantasy vista, not a beauty render, not concept art. ${styleProfile?.lighting_philosophy ? 'Lighting philosophy: ' + styleProfile.lighting_philosophy + '.' : ''} The architecture must remain recognizable as ${filteredName}. No people.`,
    atmosphere_variant: `Atmosphere variant for ${filteredName}. Different time of day, weather, or interior lighting condition — contrasting mood through the SAME real architecture. ${styleProfile?.color_response ? 'Color response: ' + styleProfile.color_response + '.' : ''} Must show the actual location, not an idealized version. No people.`,
    lighting_study: `Lighting study within ${filteredName}. Practical light sources interacting with the real architectural surfaces and volumes of this specific space. Observe how light falls on walls, floors, structural elements. Cinematographic, not decorative. No people.`,
  };
  const parts = [
    slotMap[slotKey] || `Atmospheric reference for ${filteredName}. Light and mood through real architecture. No people.`,
  ];
  if (userNote) parts.push('', `[DIRECTOR NOTE]: ${userNote}`);
  parts.push(
    '',
    semanticBlock,
    '',
    buildPriorityDirective(authority),
    '',
    pdDirective,
    `[STRICT] No characters. No people. Environment and light only. This is ${filteredName} — not a generic atmospheric image. The architecture of this specific location must be visible and recognizable.`,
    '[STRICT] NOT a fantasy postcard. NOT a luxury resort render. NOT concept art. NOT a decorative moodboard. This is a LOCATION-BOUND LIGHTING STUDY showing how atmosphere transforms a REAL architectural space.',
  );
  return parts.join('\n');
}

function buildSurfaceLanguagePrompt(
  pdDirective: string,
  slotKey: string,
  styleProfile: { texture_materiality?: string } | null,
  authority: ReturnType<typeof resolveAuthorityForPDDomain>,
  filteredMaterials: string[],
  semanticBlock: string,
  userNote?: string,
): string {
  // Separate structural vs textile materials
  const STRUCTURAL_MATERIALS = new Set(['wood', 'natural wood', 'stone', 'marble', 'concrete', 'plaster', 'earth', 'clay', 'brick', 'metal', 'steel', 'iron', 'copper', 'bronze', 'gold', 'timber', 'bamboo', 'thatch', 'straw', 'lacquer']);
  const structural = filteredMaterials.filter(m => STRUCTURAL_MATERIALS.has(m.toLowerCase()));
  const contextual = filteredMaterials.filter(m => !STRUCTURAL_MATERIALS.has(m.toLowerCase()));

  const structuralStr = structural.length > 0 ? structural.join(', ') : 'wood, stone, plaster, earth, metal';
  const contextualStr = contextual.length > 0 ? `Contextual only (never dominant): ${contextual.join(', ')}.` : '';

  const MATERIAL_HIERARCHY = `
[MATERIAL HIERARCHY — SURFACE LANGUAGE]
Materials must reflect environment structure and function as seen on camera.

STRUCTURAL (default primary — must define the world):
  ${structuralStr}

SURFACE CONDITION (always relevant — defines realism):
  wear, aging, soot, moisture, damage, polish, patina, grain

TEXTILES (contextual only — never default subject):
  ${contextualStr || 'cloth, banners, bedding — ONLY when contextually embedded in the environment'}

RULES:
- Structural materials define the world
- Surface condition defines cinematic realism
- Textiles appear ONLY when contextually justified by the space
- NO textile-dominant compositions without environmental justification
- NO fabric stacks, material boards, or decorative-only imagery
- Surfaces must belong to a real environment — no isolated material studies`;

  const slotMap: Record<string, string> = {
    texture_primary: `Close-up environmental surface. Show the dominant structural materials of this production world: ${structuralStr}. Surfaces must be part of a wall, floor, beam, pillar, or architectural element — not isolated. ${contextualStr} No people. No isolated objects.`,
    texture_detail: `Surface condition study within an environment. Worn textures, patina, grain, aging marks, moisture patterns on architectural surfaces. Macro-level detail that reveals the history and class of the space. No people. No isolated fabric.`,
    texture_variant: `Material variation across the world. Show how surfaces differ between spaces — rough vs refined, weathered vs maintained. Class and status expressed through surface language. Textiles may appear only if embedded in furnishing or dressing. No people.`,
  };
  const parts = [
    slotMap[slotKey] || 'Environmental surface reference. Architectural materials in context. No people. No isolated objects.',
  ];
  if (userNote) parts.push('', `[DIRECTOR NOTE]: ${userNote}`);
  parts.push(
    '',
    MATERIAL_HIERARCHY,
    '',
    semanticBlock,
    '',
    buildPriorityDirective(authority),
    '',
    pdDirective,
    '[STRICT] No characters. No people. Surfaces must belong to a real environment. No isolated material studies. No fabric catalogues.',
  );
  return parts.join('\n');
}

/** Physical object nouns recognized by the motif validator */
const MOTIF_OBJECT_NOUNS = /\b(bowl|pot|jar|vessel|cup|plate|tool|knife|hammer|chisel|wall|floor|tile|beam|column|shelf|box|chest|basket|door|gate|window|stool|bench|table|hearth|oven|kiln|loom|wheel|rack|hook|nail|rope|cloth|curtain|mat|rug|jug|pitcher|bucket|barrel|crate|sack|comb|scroll|shard|fragment)\b/gi;

/** Material fallback nouns per material family */
const MATERIAL_FALLBACK_OBJECTS: Record<string, string[]> = {
  clay: ['bowl', 'pot', 'vessel', 'cup', 'jar'],
  ceramic: ['bowl', 'vessel', 'pot', 'cup', 'jar'],
  porcelain: ['bowl', 'cup', 'vessel', 'plate'],
  wood: ['shelf', 'box', 'beam', 'bench', 'stool'],
  timber: ['beam', 'shelf', 'bench', 'stool'],
  bamboo: ['rack', 'basket', 'mat'],
  stone: ['wall', 'column', 'hearth', 'tile'],
  iron: ['hook', 'nail', 'hammer', 'chisel'],
  metal: ['hook', 'nail', 'tool', 'rack'],
  copper: ['pot', 'jug', 'pitcher', 'vessel'],
  bronze: ['vessel', 'plate', 'bowl'],
  silk: ['cloth', 'curtain'],
  cotton: ['cloth', 'curtain', 'rug'],
  fabric: ['cloth', 'curtain', 'mat'],
  textile: ['cloth', 'curtain', 'rug'],
  leather: ['sack', 'chest'],
  paper: ['scroll'],
  glass: ['jar', 'vessel', 'plate'],
  plaster: ['wall', 'floor'],
  brick: ['wall', 'hearth', 'oven'],
  tile: ['floor', 'wall'],
  lacquer: ['box', 'bowl', 'plate'],
  straw: ['mat', 'basket', 'rug'],
  thatch: ['mat', 'basket'],
};

function deriveMotifSources(canonJson: Record<string, unknown>): {
  materials: string[];
  behaviours: string[];
  themeSignals: string[];
  rituals: string[];
  symbolicObjects: string[];
  surfaceConditions: string[];
  objectNouns: string[];
} {
  const materials: string[] = [];
  const behaviours: string[] = [];
  const themeSignals: string[] = [];
  const rituals: string[] = [];
  const symbolicObjects: string[] = [];
  const surfaceConditions: string[] = [];
  const objectNouns: string[] = [];

  // ── Visual Canon Primitives (canonical upstream truth if extracted) ──
  const vcp = canonJson.visual_canon_primitives as VisualCanonExtractionResult | undefined;
  if (vcp && vcp.extraction_version) {
    // Use structured extraction as primary source
    for (const m of vcp.material_systems || []) materials.push(m.label.toLowerCase());
    for (const r of vcp.ritual_systems || []) rituals.push(r.label);
    for (const o of vcp.recurrent_symbolic_objects || []) {
      symbolicObjects.push(o.label);
      // Extract object nouns from symbolic object labels
      const objMatches = o.label.match(MOTIF_OBJECT_NOUNS);
      if (objMatches) objectNouns.push(...objMatches.map(n => n.toLowerCase()));
    }
    for (const s of vcp.surface_condition_systems || []) surfaceConditions.push(s.label);
    // Also extract behaviours from environment pairings
    for (const e of vcp.environment_behavior_pairings || []) behaviours.push(e.label);
    // Theme signals from thematic functions
    const allThematic = [
      ...(vcp.material_systems || []),
      ...(vcp.surface_condition_systems || []),
    ].flatMap(p => p.thematic_functions || []);
    themeSignals.push(...allThematic);
  }

  // ── Fallback: regex extraction from canon fields ──
  // (Always run to catch anything VCP missed — deduplicated below)
  if (Array.isArray(canonJson.characters)) {
    for (const c of canonJson.characters as any[]) {
      const desc = [c.role || '', c.traits || '', c.goals || ''].join(' ').toLowerCase();
      const craftTerms = desc.match(/\b(potter|pottery|ceramic|weav|blacksmith|forge|carpent|wood\s*work|glass\s*blow|paint|sculpt|cook|brew|garden|fish|farm|tailor|sew|dye|tann|mason|carv|smith)\w*/gi);
      if (craftTerms) behaviours.push(...craftTerms.map(t => t.toLowerCase()));
      const matTerms = desc.match(/\b(clay|wood|stone|iron|silk|fabric|leather|paper|bamboo|lacquer|straw|copper|bronze|glass|ceramic|porcelain|wool|cotton|hemp|linen)\b/gi);
      if (matTerms) materials.push(...matTerms.map(t => t.toLowerCase()));
      // Extract object nouns from character descriptions
      const charObjNouns = desc.match(MOTIF_OBJECT_NOUNS);
      if (charObjNouns) objectNouns.push(...charObjNouns.map(n => n.toLowerCase()));
    }
  }

  const worldText = [
    typeof canonJson.world_rules === 'string' ? canonJson.world_rules : '',
    typeof canonJson.locations === 'string' ? canonJson.locations : '',
    typeof canonJson.setting === 'string' ? canonJson.setting : '',
  ].join(' ').toLowerCase();
  const worldMats = worldText.match(/\b(clay|wood|stone|iron|silk|fabric|leather|paper|bamboo|lacquer|straw|copper|bronze|glass|ceramic|porcelain|thatch|plaster|mortar|earth|mud|brick|tile)\b/gi);
  if (worldMats) materials.push(...worldMats.map(t => t.toLowerCase()));
  // Extract object nouns from world text
  const worldObjNouns = worldText.match(MOTIF_OBJECT_NOUNS);
  if (worldObjNouns) objectNouns.push(...worldObjNouns.map(n => n.toLowerCase()));

  const toneText = [
    typeof canonJson.tone_style === 'string' ? canonJson.tone_style : '',
    typeof canonJson.logline === 'string' ? canonJson.logline : '',
    typeof canonJson.premise === 'string' ? canonJson.premise : '',
  ].join(' ').toLowerCase();
  const themes = toneText.match(/\b(fracture|repair|mend|broken|heal|decay|renewal|transform|restore|rebuild|reclaim|imperfect|wabi.sabi|worn|patina|weather|age|endure|persist|survive|resilience|loss|memory|legacy|tradition|craft|labor|making|growth|erosion)\b/gi);
  if (themes) themeSignals.push(...themes.map(t => t.toLowerCase()));

  // ── Deterministic fallback: derive object nouns from materials if none found ──
  const dedupedObjectNouns = [...new Set(objectNouns)];
  if (dedupedObjectNouns.length === 0) {
    const dedupedMats = [...new Set(materials)];
    for (const mat of dedupedMats) {
      const fallbacks = MATERIAL_FALLBACK_OBJECTS[mat];
      if (fallbacks) {
        objectNouns.push(...fallbacks.slice(0, 2));
        break; // One material family is enough for fallback
      }
    }
  }

  return {
    materials: [...new Set(materials)],
    behaviours: [...new Set(behaviours)],
    themeSignals: [...new Set(themeSignals)],
    rituals: [...new Set(rituals)],
    symbolicObjects: [...new Set(symbolicObjects)],
    surfaceConditions: [...new Set(surfaceConditions)],
    objectNouns: [...new Set(objectNouns)],
  };
}

/**
 * Resolve a concrete object noun phrase for motif slot prompts.
 * Uses canon-derived objectNouns + symbolicObjects, with material-based fallback.
 */
function resolveMotifObjectNoun(
  slotKey: string,
  motifSources: ReturnType<typeof deriveMotifSources>,
): string {
  const { objectNouns, symbolicObjects, materials } = motifSources;

  // Prefer symbolic objects that contain a recognized physical noun
  let primaryNoun = '';
  for (const so of symbolicObjects) {
    if (MOTIF_OBJECT_NOUNS.test(so)) {
      primaryNoun = so.toLowerCase();
      break;
    }
  }
  // Fallback to first extracted object noun
  if (!primaryNoun && objectNouns.length > 0) {
    primaryNoun = objectNouns[0];
  }
  // Last resort: material + generic object
  if (!primaryNoun && materials.length > 0) {
    const mat = materials[0];
    const fallbacks = MATERIAL_FALLBACK_OBJECTS[mat];
    primaryNoun = fallbacks ? `${mat} ${fallbacks[0]}` : `${mat} vessel`;
  }
  // Absolute fallback
  if (!primaryNoun) primaryNoun = 'bowl';

  // Add material qualifier if noun is bare and we have materials
  const hasMatQualifier = materials.some(m => primaryNoun.includes(m));
  const qualifiedNoun = (!hasMatQualifier && materials.length > 0)
    ? `${materials[0]} ${primaryNoun}`
    : primaryNoun;

  // Slot-specific condition modifiers
  switch (slotKey) {
    case 'motif_damage':
      return `cracked ${qualifiedNoun}`;
    case 'motif_repair':
      return `repaired ${qualifiedNoun}`;
    case 'motif_variant':
      return `worn ${qualifiedNoun}`;
    default:
      return qualifiedNoun;
  }
}

/**
 * Extract the base (un-modified) object noun from a motif prompt's opening line.
 * Strips slot-specific prefixes (cracked, worn, repaired) to get the canonical anchor noun.
 */
function extractBaseObjectNounFromPrompt(prompt: string): string | null {
  // Match the opening "Production motif — <noun phrase>."
  const match = prompt.match(/^Production motif\s*[—–-]\s*(.+?)\./m);
  if (!match) return null;
  let noun = match[1].trim().toLowerCase();
  // Strip slot condition modifiers to get the base noun
  noun = noun.replace(/^(cracked|worn|repaired|mended|broken|chipped|fractured|restored|patched|aged|weathered)\s+/i, '');
  return noun || null;
}

/**
 * Resolve motif object noun from a locked anchor noun phrase.
 * Applies slot-specific condition modifiers to the locked base noun.
 */
function resolveMotifObjectNounFromLocked(slotKey: string, lockedNoun: string): string {
  switch (slotKey) {
    case 'motif_damage':
      return `cracked ${lockedNoun}`;
    case 'motif_repair':
      return `repaired ${lockedNoun}`;
    case 'motif_variant':
      return `worn ${lockedNoun}`;
    default:
      return lockedNoun;
  }
}

function buildMotifPrompt(
  pdDirective: string,
  slotKey: string,
  authority: ReturnType<typeof resolveAuthorityForPDDomain>,
  semanticBlock: string,
  userNote?: string,
  canonJson?: Record<string, unknown>,
  lockedAnchorNoun?: string | null,
): string {
  const motifSources = canonJson ? deriveMotifSources(canonJson) : { materials: [], behaviours: [], themeSignals: [], rituals: [], symbolicObjects: [], surfaceConditions: [], objectNouns: [] };

  // If a locked anchor noun exists, use it instead of re-deriving from canon
  const objectNoun = lockedAnchorNoun
    ? resolveMotifObjectNounFromLocked(slotKey, lockedAnchorNoun)
    : resolveMotifObjectNoun(slotKey, motifSources);

  // Build material/behaviour context — enriched by visual canon primitives
  const materialContext = motifSources.materials.length > 0
    ? `Core materials: ${motifSources.materials.slice(0, 6).join(', ')}`
    : '';
  const behaviourContext = motifSources.behaviours.length > 0
    ? `Character activities: ${motifSources.behaviours.slice(0, 4).join(', ')}`
    : '';
  const themeContext = motifSources.themeSignals.length > 0
    ? `Theme signals: ${motifSources.themeSignals.slice(0, 4).join(', ')}`
    : '';
  const objectContext = motifSources.symbolicObjects.length > 0
    ? `Recurrent objects: ${motifSources.symbolicObjects.slice(0, 4).join(', ')}`
    : '';
  const surfaceContext = motifSources.surfaceConditions.length > 0
    ? `Surface conditions: ${motifSources.surfaceConditions.slice(0, 4).join(', ')}`
    : '';

  const slotMap: Record<string, string> = {
    motif_primary: [
      `Production motif — ${objectNoun}.`,
      `Photograph a real, physically existing ${objectNoun} that recurs throughout this production's world.`,
      `This ${objectNoun} must be something a props department could source or an art department could build.`,
      materialContext,
      behaviourContext,
      objectContext,
      `Show the ${objectNoun} in its natural use context within the world — not isolated, not displayed, not symbolic.`,
      `Cinematic close-up or medium shot. Real lighting. Real wear and patina. No people.`,
    ].filter(Boolean).join(' '),
    motif_variant: [
      `Production motif — ${objectNoun}.`,
      `The same core object as the primary motif (${objectNoun}), shown in a different physical state:`,
      `weathered, aged, repurposed, or in a different stage of its lifecycle.`,
      materialContext,
      themeContext,
      surfaceContext,
      `Must be physically real and buildable. Show the ${objectNoun} embedded in environment, not isolated.`,
      `Cinematic detail shot. Real materials. Real wear. No people.`,
    ].filter(Boolean).join(' '),
    motif_damage: [
      `Production motif — ${objectNoun}.`,
      `Show real physical damage, fracture, or breakage on a ${objectNoun} from this world.`,
      materialContext,
      surfaceContext,
      `Cracked, chipped, broken, eroded, stained, scarred — evidence of time, use, or conflict visible on the ${objectNoun}.`,
      `This must be photographable on a real set. Cinematic detail. No people.`,
    ].filter(Boolean).join(' '),
    motif_repair: [
      `Production motif — ${objectNoun}.`,
      `Show evidence of physical repair, mending, or restoration on a ${objectNoun}.`,
      materialContext,
      behaviourContext,
      surfaceContext,
      `Patched, glued, bound, reinforced, re-joined — evidence of care and restoration visible on the ${objectNoun}.`,
      `Must be physically real. Cinematic detail. No people.`,
    ].filter(Boolean).join(' '),
  };

  const parts = [
    slotMap[slotKey] || slotMap['motif_primary'],
  ];

  if (userNote) parts.push('', `[DIRECTOR NOTE]: ${userNote}`);

  parts.push(
    '',
    '[MOTIF GROUNDING — MANDATORY]',
    'This motif MUST:',
    '- originate from real materials (wood, clay, stone, fabric, metal, ceramic)',
    '- be physically constructible by a props or art department',
    '- exist as a real object, surface, or built element in this world',
    '- show evidence of use, age, or human interaction',
    '',
    'This motif MUST NOT be:',
    '- a symbolic installation or abstract sculpture',
    '- a fantasy construct or mythic visualization',
    '- a decorative concept-art composition',
    '- a metaphoric or allegorical scene',
    '- anything that could not physically exist on a production set',
    '',
    'If it cannot be built, touched, and photographed on set → it is INVALID.',
    '',
    semanticBlock,
    '',
    buildPriorityDirective(authority),
    '',
    pdDirective,
    '',
    '[STRICT] No characters. No people. No abstract symbolism. No fantasy constructs.',
    'Only real, physical objects and surfaces that exist in this world.',
    'No dragons. No abstract sculptures. No symbolic installations. No mythic imagery.',
  );
  return parts.join('\n');
}

// World-level costume prompt builders REMOVED — costume generation is now character-driven.

function extractBaseCostumeNounFromPrompt(prompt: string): string | null {
  const match = prompt.match(/^Costume\s+\w+\s+reference\s*[—–-]\s*(.+?)\./m)
    || prompt.match(/^Costume\s+\w+\s+\w+\s*[—–-]\s*(.+?)\./m);
  if (!match) return null;
  let noun = match[1].trim().toLowerCase();
  noun = noun.replace(/^(worn|mended|rough|practical|fine|ceremonial|layered)\s+/i, '');
  noun = noun.replace(/\s+(variant|closure detail|silhouette variant)$/i, '');
  return noun || null;
}

// ── Family key helper ──
function familyKey(f: PDFamily): string {
  return `${f.domain}:${f.targetName}`;
}

// ── Hook ──

export function useProductionDesignOrchestrator(projectId: string | undefined) {
  const [buildStatus, setBuildStatus] = useState<PDBuildStatus>('idle');
  const [buildProgress, setBuildProgress] = useState<BuildProgress>({
    total: 0, done: 0, failed: 0, slotCompletedTick: 0, familyProgress: new Map(),
  });
  const abortRef = useRef(false);
  /** Tracks the motif primary anchor fingerprint during a build session */
  const motifPrimaryAnchorRef = useRef<MotifFamilyFingerprint | null>(null);
  const motifPrimaryValidRef = useRef(false);
  /** Tracks the motif primary anchor object noun phrase during a build session */
  const motifAnchorObjectNounRef = useRef<string | null>(null);

  const visualSets = useVisualSets(projectId);
  const { locations } = useCanonLocations(projectId);
  const { canon } = useProjectCanon(projectId);
  const { profile: styleProfile } = useVisualStyleProfile(projectId);
  const locationDatasets = useLocationVisualDatasets(projectId);

  // ── Visual Canon Enrichment for PD (non-authoritative) ──
  // ARCHITECTURE: PD resolver remains truth owner. Enrichment from visual_canon_brief
  // is additive context only — structured signals, never raw prose.
  // RETRIEVAL: Uses canonical accessor (getVisualCanonBriefContent) — no ad hoc key reads.
  const pdEnrichment = useMemo(() => {
    if (!canon) return null;
    const access = getVisualCanonBriefContent(canon as Record<string, unknown>);
    if (access.status !== 'present' || !access.content) {
      // Explicit degradation: enrichment unavailable with diagnosable reason
      if (access.status !== 'missing') {
        console.warn(`[PD Enrichment] Visual canon brief unavailable: ${access.diagnostic}`);
      }
      return null;
    }
    try {
      const signals = extractVisualCanonSignals(access.content);
      return resolvePDEnrichmentOrNull(signals);
    } catch (err) {
      console.warn('[PD Enrichment] Signal extraction failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }, [canon]);

  const pd = useMemo(() => resolveProductionDesignFromCanon(canon, pdEnrichment), [canon, pdEnrichment]);
  const pdDirective = useMemo(() => serializeProductionDesign(pd), [pd]);

  // Resolve world validation rules once for motif enforcement
  const worldValidationRules = useMemo<WorldValidationRules | null>(() => {
    const wvm = resolveWorldValidationMode({
      genres: Array.isArray(canon?.genres) ? canon.genres as string[] : [],
      tone_style: typeof canon?.tone_style === 'string' ? canon.tone_style : undefined,
      world_rules: typeof canon?.world_rules === 'string' ? canon.world_rules : undefined,
      format: typeof canon?.format_constraints === 'string' ? canon.format_constraints : undefined,
      logline: typeof canon?.logline === 'string' ? canon.logline : undefined,
      premise: typeof canon?.premise === 'string' ? canon.premise : undefined,
    });
    return wvm.rules;
  }, [canon]);

  const requiredFamilies = useMemo(
    () => resolveRequiredFamilies(locations, canon),
    [locations, canon],
  );

  const pdSets = useMemo(() => {
    return (visualSets.sets || []).filter(s =>
      s.domain.startsWith('production_design_') && s.status !== 'archived',
    );
  }, [visualSets.sets]);

  const familySetMap = useMemo(() => {
    const map = new Map<string, VisualSet>();
    for (const family of requiredFamilies) {
      const match = pdSets.find(
        s => s.domain === family.domain && s.target_name === family.targetName,
      );
      if (match) map.set(familyKey(family), match);
    }
    return map;
  }, [requiredFamilies, pdSets]);

  const progressSummary = useMemo(() => {
    let total = requiredFamilies.length;
    let created = 0;
    let locked = 0;
    let rejected = 0;
    let readyToLock = 0;
    for (const family of requiredFamilies) {
      const set = familySetMap.get(familyKey(family));
      if (set) {
        created++;
        if (set.status === 'locked') locked++;
        if (set.status === 'stale') rejected++;
        if (set.status === 'ready_to_lock') readyToLock++;
      }
    }
    const allCreated = created === total && total > 0;
    const allLocked = locked === total && total > 0;
    // Lock All eligible: all created, none failed/generating, all either locked or ready_to_lock
    const lockAllEligible = allCreated && !allLocked && (locked + readyToLock) === total && total > 0;
    return { total, created, locked, rejected, readyToLock, allLocked, lockAllEligible };
  }, [requiredFamilies, familySetMap]);

  // ── Core generation for a single slot ──
  const generateSlot = useCallback(async (
    task: { setId: string; slot: VisualSetSlot; family: PDFamily; userNote?: string },
  ): Promise<'success' | 'failed'> => {
    try {
      const authority = resolveAuthorityForPDDomain(task.family.domain, task.family.targetName);
      const filteredPdDirective = filterTextForSlot(pdDirective, authority);
      const slotNegatives = getSlotNegatives(authority);

      // ── Dataset-first retrieval via canonical resolver ──
      let datasetBlock = '';
      let datasetNegatives: string[] = [];
      let datasetResolutionMode = 'no_dataset';

      const hasLocationBinding = (task.family.domain === 'production_design_location' || task.family.domain === 'production_design_atmosphere') && task.family.targetId;
      if (hasLocationBinding) {
        // Compute current canon hash for freshness evaluation
        const matchingLocation = locations.find(l => l.id === task.family.targetId);
        const currentHash = matchingLocation
          ? computeCanonHashFromSources(matchingLocation, canon, styleProfile, pd.material_palette)
          : null;

        const resolution = resolveDatasetForSlot({
          pdSlotKey: task.slot.slot_key,
          canonLocationId: task.family.targetId!,
          datasets: locationDatasets.datasets,
          currentCanonHash: currentHash,
        });

        // IEL: log resolution provenance
        console.log(formatResolutionLog(resolution));
        datasetResolutionMode = resolution.mode;

        if (resolution.promptBlocks) {
          const blocks = [
            resolution.promptBlocks.primaryBlock,
            resolution.promptBlocks.secondaryBlock,
            resolution.promptBlocks.contextualBlock,
            resolution.promptBlocks.forbiddenBlock,
            resolution.promptBlocks.hierarchyBlock,
          ].filter(Boolean);
          if (blocks.length > 0) {
            const freshLabel = resolution.freshnessStatus === 'stale' ? ' (STALE)' : '';
            datasetBlock = `\n[LOCATION VISUAL DATASET — ${task.family.targetName}${freshLabel}]\n${blocks.join('\n')}`;
          }
          datasetNegatives = resolution.negatives;
        }
      }

      // Semantic role interpretation — classify canon/materials by visual role for this slot
      const slotPurposeMap: Record<string, string> = {
        production_design_location: authority,
        production_design_atmosphere: 'atmosphere_lighting',
        production_design_texture: 'surface_language',
        production_design_motif: 'motif_symbolic',
      };
      const slotPurpose = slotPurposeMap[task.family.domain] || authority;
      const canonText = filteredPdDirective + ' ' + (task.family.targetName || '');
      const { promptBlock: semanticBlock } = interpretForSlot(canonText, pd.material_palette, slotPurpose);

      let prompt = '';
      
      if (task.family.domain === 'production_design_location') {
        prompt = buildLocationPrompt(task.family.targetName, filteredPdDirective, task.slot.slot_key, styleProfile, authority, semanticBlock, task.userNote);
      } else if (task.family.domain === 'production_design_atmosphere') {
        prompt = buildAtmospherePrompt(task.family.targetName, filteredPdDirective, task.slot.slot_key, styleProfile, authority, semanticBlock, task.userNote);
      } else if (task.family.domain === 'production_design_texture') {
        const filteredMaterials = filterMaterialsForSlot(pd.material_palette, authority);
        prompt = buildSurfaceLanguagePrompt(filteredPdDirective, task.slot.slot_key, styleProfile, authority, filteredMaterials, semanticBlock, task.userNote);
      } else {
        // For dependent motif slots, use locked anchor noun if available
        const anchorNoun = (task.slot.slot_key !== 'motif_primary')
          ? motifAnchorObjectNounRef.current
          : null;
        prompt = buildMotifPrompt(filteredPdDirective, task.slot.slot_key, authority, semanticBlock, task.userNote, canon as Record<string, unknown>, anchorNoun);
      }

      // Append dataset block if available (structured truth takes priority)
      if (datasetBlock) {
        prompt += datasetBlock;
      }

      // Append hard negatives from slot authority + dataset
      const allNegatives = [...slotNegatives, ...datasetNegatives];
      if (allNegatives.length > 0) {
        prompt += `\n\n[HARD NEGATIVES FROM SLOT AUTHORITY]\nDo NOT depict: ${[...new Set(allNegatives)].join(', ')}`;
      }

      // Route atmosphere through 'world' section like location families — NOT 'visual_language'
      const section = (task.family.domain === 'production_design_location' || task.family.domain === 'production_design_atmosphere') ? 'world' : 'visual_language';
      const shotTypeMap: Record<string, string> = {
        establishing_wide: 'wide',
        atmospheric: 'atmospheric',
        detail: 'detail',
        time_variant: 'time_variant',
        atmosphere_primary: 'atmospheric',
        atmosphere_variant: 'atmospheric',
        lighting_study: 'lighting_ref',
        texture_primary: 'texture_ref',
        texture_detail: 'detail',
        texture_variant: 'texture_ref',
        motif_primary: 'detail',
        motif_variant: 'detail',
        motif_damage: 'detail',
        motif_repair: 'detail',
        // Costume slots
        fabric_primary: 'detail',
        fabric_variant: 'detail',
        fabric_wear: 'detail',
        fabric_repair: 'detail',
        silhouette_primary: 'wide',
        silhouette_variant: 'wide',
        layering_system: 'wide',
        closure_system: 'detail',
        working_class: 'wide',
        artisan_class: 'wide',
        elite_class: 'wide',
        ceremonial_variant: 'wide',
      };

      const { data, error } = await supabase.functions.invoke('generate-lookbook-image', {
        body: {
          project_id: projectId,
          section,
          count: 1,
          asset_group: section === 'world' ? 'world' : 'visual_language',
          custom_prompt: prompt,
          forced_shot_type: shotTypeMap[task.slot.slot_key] || 'atmospheric',
          generation_purpose: 'production_design',
          subject: task.family.targetName,
          // Pass location binding for location + atmosphere families — enables canon_location_id on images
          ...(hasLocationBinding ? {
            location_id: task.family.targetId,
            location_name: task.family.targetName,
          } : {}),
          // Dataset provenance for downstream traceability
          dataset_provenance: {
            dataset_resolution_mode: datasetResolutionMode,
            dataset_id: hasLocationBinding ? (
              locationDatasets.datasets.find(d => d.canon_location_id === task.family.targetId && d.is_current)?.id || null
            ) : null,
            dataset_slot_key: task.slot.slot_key,
            dataset_freshness_status: datasetResolutionMode.includes('dataset') ? (
              locationDatasets.datasets.find(d => d.canon_location_id === task.family.targetId && d.is_current)?.freshness_status || null
            ) : null,
            dataset_fallback_reason: datasetResolutionMode === 'semantic_fallback' || datasetResolutionMode === 'missing_dataset' || datasetResolutionMode === 'unmapped_slot'
              ? `mode:${datasetResolutionMode}` : null,
          },
        },
      });

      if (error) throw error;

      const results = data?.results || [];
      const success = results.find((r: any) => r.status === 'ready');
      if (success?.image_id) {
        const isMotif = task.family.domain === 'production_design_motif';
        
        let shouldSelect = true;
        let validationDiagnostics: Record<string, unknown> | null = null;

        if (isMotif) {
          // Resolve family anchor for family-dependent slots
          const slotKey = task.slot.slot_key;
          const isPrimary = slotKey === 'motif_primary';

          // Cross-session anchor resolution: try memory first, then persisted
          let anchorForValidation: MotifFamilyFingerprint | null = null;
          let primaryExists = isPrimary || motifPrimaryAnchorRef.current !== null;
          let primaryValid = isPrimary || motifPrimaryValidRef.current;

          if (!isPrimary) {
            if (motifPrimaryAnchorRef.current) {
              anchorForValidation = motifPrimaryAnchorRef.current;
            } else {
              // Persisted anchor resolution (cross-session / resume / reload)
              const anchorResolution = await resolveMotifPrimaryAnchor(task.setId);
              anchorForValidation = anchorResolution.fingerprint;
              primaryExists = anchorResolution.fingerprint !== null;
              primaryValid = anchorResolution.approvalGrade;
              // Populate memory refs from persisted anchor
              if (anchorResolution.fingerprint) {
                motifPrimaryAnchorRef.current = anchorResolution.fingerprint;
                motifPrimaryValidRef.current = anchorResolution.approvalGrade;
                motifAnchorObjectNounRef.current = anchorResolution.anchorObjectNoun;
              }
              console.log(`[PD-motif-validation] persisted-anchor source=${anchorResolution.source} valid=${anchorResolution.valid} approvalGrade=${anchorResolution.approvalGrade} confidence=${anchorResolution.confidence} imageId=${anchorResolution.primaryImageId} anchorNoun=${anchorResolution.anchorObjectNoun}`);
            }
          }

          const motifValidation = validateMotifCandidate(prompt, slotKey, anchorForValidation, worldValidationRules);

          // Resolve lineage + selection status deterministically
          const lineageStatus = resolveLineageStatus(
            slotKey,
            motifValidation,
            anchorForValidation,
            primaryExists,
            primaryValid,
          );
          const selectionStatus = resolveMotifSelectionStatus(motifValidation, lineageStatus);

          console.log(`[PD-motif-validation] slot=${slotKey} passed=${motifValidation.passed} score=${motifValidation.overall_score} selection=${selectionStatus} lineage=${lineageStatus} fingerprint=${motifValidation.fingerprint_key}`);

          // Block invalid candidates from auto-selection
          if (selectionStatus !== 'selected_valid') {
            shouldSelect = false;
            console.warn(`[PD-motif-validation] BLOCKED slot=${slotKey}: selection=${selectionStatus} hard_fails=${motifValidation.hard_fail_codes.join(',') || 'none'} expectations=${motifValidation.slot_expectation_failures.join(',') || 'none'}`);
          }

          // If primary is valid, store as family anchor for subsequent dependent slots
          if (isPrimary && motifValidation.passed) {
            motifPrimaryAnchorRef.current = motifValidation.fingerprint;
            motifPrimaryValidRef.current = true;
            // Extract and persist the base object noun used in this prompt
            const baseNoun = extractBaseObjectNounFromPrompt(prompt);
            motifAnchorObjectNounRef.current = baseNoun;
          } else if (isPrimary && !motifValidation.passed) {
            motifPrimaryAnchorRef.current = motifValidation.fingerprint;
            motifPrimaryValidRef.current = false;
          }

          // Resolve the anchor object noun for diagnostics persistence
          const diagnosticAnchorNoun = isPrimary
            ? (motifValidation.passed ? motifAnchorObjectNounRef.current : null)
            : motifAnchorObjectNounRef.current;

          // Build canonical diagnostics payload
          validationDiagnostics = serializeMotifDiagnostics(
            motifValidation,
            lineageStatus,
            selectionStatus,
            anchorForValidation ? fingerprintKey(anchorForValidation) : null,
            diagnosticAnchorNoun,
          );
        }

        // Persist validation diagnostics to image generation_config
        if (validationDiagnostics) {
          try {
            const { data: imgRow } = await (supabase as any)
              .from('project_images')
              .select('generation_config')
              .eq('id', success.image_id)
              .maybeSingle();
            const existingConfig = (imgRow?.generation_config && typeof imgRow.generation_config === 'object')
              ? imgRow.generation_config : {};
            await (supabase as any)
              .from('project_images')
              .update({ generation_config: { ...existingConfig, ...validationDiagnostics } })
              .eq('id', success.image_id);
          } catch (persistErr) {
            console.warn('[PD-validation] Failed to persist diagnostics:', persistErr);
          }
        }

        // Wire image to slot — only auto-select if motif validation passes (or not a motif)
        await visualSets.wireImageToSlot({
          setId: task.setId,
          imageId: success.image_id,
          shotType: task.slot.slot_key,
          selectForSlot: shouldSelect,
        });
        return shouldSelect ? 'success' : 'failed';
      }
      return 'failed';
    } catch (err) {
      console.error(`[PD] Slot ${task.slot.slot_key} generation failed:`, err);
      return 'failed';
    }
  }, [projectId, pdDirective, styleProfile, pd.material_palette, visualSets]);

  // ── Collect incomplete tasks from families ──
  const collectTasks = useCallback(async (
    families: PDFamily[],
    mode: 'all' | 'failed_only' | 'redo',
    userNote?: string,
  ) => {
    const tasks: Array<{ setId: string; slot: VisualSetSlot; family: PDFamily; userNote?: string }> = [];
    const initialFamilyProgress = new Map<string, FamilyProgress>();

    for (const family of families) {
      const key = familyKey(family);
      const existingSet = familySetMap.get(key);

      // Skip locked families entirely
      if (existingSet?.status === 'locked') {
        initialFamilyProgress.set(key, {
          state: 'locked', totalSlots: 0, filledSlots: 0, failedSlots: 0,
        });
        continue;
      }

      // For redo mode: archive old set and create fresh
      let set: VisualSet;
      if (mode === 'redo' && existingSet) {
        // Archive the existing set (supersede, don't delete)
        await visualSets.updateSetStatus.mutateAsync({ setId: existingSet.id, status: 'archived' });
        // Create a fresh set
        set = await visualSets.ensureVisualSetForTarget({
          domain: family.domain,
          targetType: family.targetType,
          targetName: family.targetName,
          targetId: family.targetId,
        });
      } else {
        set = existingSet || await visualSets.ensureVisualSetForTarget({
          domain: family.domain,
          targetType: family.targetType,
          targetName: family.targetName,
          targetId: family.targetId,
        });
      }

      const slots = await visualSets.fetchSlotsForSet(set.id);
      const actionableSlots = slots.filter(s => {
        if (s.state === 'approved' || s.state === 'locked') return false;
        if (mode === 'failed_only') return !s.selected_image_id;
        // In redo mode, process ALL slots
        if (mode === 'redo') return true;
        return !s.selected_image_id;
      });

      const filledCount = slots.filter(s => !!s.selected_image_id).length;
      initialFamilyProgress.set(key, {
        state: actionableSlots.length > 0 ? 'pending' : (filledCount === slots.length ? 'ready' : 'partial'),
        totalSlots: slots.length,
        filledSlots: filledCount,
        failedSlots: 0,
      });

      for (const slot of actionableSlots) {
        tasks.push({ setId: set.id, slot, family, userNote });
      }
    }

    return { tasks, initialFamilyProgress };
  }, [familySetMap, visualSets]);

  // ── Run build with progress tracking ──
  const runBuild = useCallback(async (
    families: PDFamily[],
    mode: 'all' | 'failed_only' | 'redo',
    userNote?: string,
  ) => {
    if (!projectId || buildStatus === 'building') return;
    abortRef.current = false;
    motifPrimaryAnchorRef.current = null;
    motifPrimaryValidRef.current = false;
    motifAnchorObjectNounRef.current = null;
    
    setBuildStatus('building');

    try {
      // Auto-populate location visual datasets if empty — ensures dataset-first retrieval is active
      if (locationDatasets.datasets.length === 0 && locations.length > 0) {
        console.log('[PD] No location visual datasets found — auto-populating before build');
        try {
          await locationDatasets.regenerate.mutateAsync();
          // Wait for query invalidation to propagate
          await locationDatasets.refetch();
        } catch (dsErr) {
          console.warn('[PD] Dataset auto-population failed (continuing with semantic fallback):', dsErr);
        }
      }

      const { tasks, initialFamilyProgress } = await collectTasks(families, mode, userNote);

      if (tasks.length === 0) {
        toast.info('Nothing to generate — all slots are filled or locked');
        setBuildStatus('done');
        visualSets.invalidate();
        return;
      }

      // Refresh sets query so familySetMap includes newly created sets before generation starts
      // Without this, FamilyRow receives set=undefined and cannot render slot thumbnails
      await visualSets.refetchSets();

      const progress: BuildProgress = {
        total: tasks.length,
        done: 0,
        failed: 0,
        slotCompletedTick: 0,
        familyProgress: initialFamilyProgress,
      };
      setBuildProgress({ ...progress, familyProgress: new Map(progress.familyProgress) });

      // Mark generating families
      for (const task of tasks) {
        const key = familyKey(task.family);
        const fp = progress.familyProgress.get(key);
        if (fp && fp.state === 'pending') {
          fp.state = 'generating';
        }
      }

      const CONCURRENCY = 2;
      let taskIdx = 0;

      const runTask = async () => {
        while (taskIdx < tasks.length && !abortRef.current) {
          const idx = taskIdx++;
          const task = tasks[idx];
          if (!task) break;

          const key = familyKey(task.family);

          progress.activeFamilyKey = key;
          progress.activeSlotLabel = task.slot.slot_label;
          progress.activeSlotKey = task.slot.slot_key;
          const fp = progress.familyProgress.get(key);
          if (fp) {
            fp.state = 'generating';
            fp.activeSlotLabel = task.slot.slot_label;
          }
          setBuildProgress({ ...progress, familyProgress: new Map(progress.familyProgress) });

          const result = await generateSlot(task);

          if (result === 'success') {
            progress.done++;
            progress.slotCompletedTick++;
            if (fp) fp.filledSlots++;
          } else {
            progress.failed++;
            progress.slotCompletedTick++;
            if (fp) fp.failedSlots++;
          }

          if (fp) {
            const remaining = tasks.filter(
              (t, i) => i > idx && familyKey(t.family) === key,
            ).length;
            if (remaining === 0) {
              fp.state = fp.failedSlots > 0 ? 'failed' : 'ready';
              fp.activeSlotLabel = undefined;
            }
          }

          progress.activeSlotKey = undefined;
          setBuildProgress({ ...progress, familyProgress: new Map(progress.familyProgress) });
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, () => runTask()));

      const failedCount = progress.failed;
      if (failedCount > 0) {
        toast.warning(`Production Design built with ${failedCount} failed slot${failedCount > 1 ? 's' : ''} — use Retry Failed`);
      } else {
        toast.success(`Production Design built — ${progress.done} images generated`);
      }
      setBuildStatus(failedCount > 0 ? 'error' : 'done');
      visualSets.invalidate();
    } catch (err: any) {
      console.error('[PD] Build failed:', err);
      toast.error(`Build failed: ${err.message}`);
      setBuildStatus('error');
    }
  }, [projectId, buildStatus, collectTasks, generateSlot, visualSets]);

  // ── Public actions ──

  const autoBuild = useCallback(() => runBuild(requiredFamilies, 'all'), [runBuild, requiredFamilies]);

  const continueBuild = useCallback(() => runBuild(requiredFamilies, 'all'), [runBuild, requiredFamilies]);

  const retryFailed = useCallback(() => runBuild(requiredFamilies, 'failed_only'), [runBuild, requiredFamilies]);

  const retryFamily = useCallback((family: PDFamily) => runBuild([family], 'all'), [runBuild]);

  const cancelBuild = useCallback(() => { abortRef.current = true; }, []);

  // ── Single-slot regeneration (for image detail drawer) ──

  const regenerateSlotWithPrompt = useCallback(async (
    imageId: string,
    customPrompt: string,
  ): Promise<void> => {
    if (!projectId) throw new Error('No project');

    // Find which slot this image belongs to
    let targetSlot: VisualSetSlot | null = null;
    let targetSetId: string | null = null;
    let targetFamily: PDFamily | null = null;

    for (const family of requiredFamilies) {
      const set = familySetMap.get(familyKey(family));
      if (!set || set.status === 'locked') continue;
      const slots = await visualSets.fetchSlotsForSet(set.id);
      const match = slots.find(s => s.selected_image_id === imageId);
      if (match) {
        targetSlot = match;
        targetSetId = set.id;
        targetFamily = family;
        break;
      }
    }

    if (!targetSlot || !targetSetId || !targetFamily) {
      throw new Error('Image not found in any active PD slot');
    }

    const authority = resolveAuthorityForPDDomain(targetFamily.domain, targetFamily.targetName);
    const slotNegatives = getSlotNegatives(authority);
    let prompt = customPrompt;
    if (slotNegatives.length > 0) {
      prompt += `\n\n[HARD NEGATIVES FROM SLOT AUTHORITY]\nDo NOT depict: ${slotNegatives.join(', ')}`;
    }

    const section = (targetFamily.domain === 'production_design_location' || targetFamily.domain === 'production_design_atmosphere') ? 'world' : 'visual_language';
    const shotTypeMap: Record<string, string> = {
      establishing_wide: 'wide', atmospheric: 'atmospheric', detail: 'detail',
      time_variant: 'time_variant', atmosphere_primary: 'atmospheric',
      atmosphere_variant: 'atmospheric', lighting_study: 'lighting_ref',
      texture_primary: 'texture_ref', texture_detail: 'detail',
      texture_variant: 'texture_ref', motif_primary: 'detail',
      motif_variant: 'detail', motif_damage: 'detail', motif_repair: 'detail',
    };

    const { data, error } = await supabase.functions.invoke('generate-lookbook-image', {
      body: {
        project_id: projectId,
        section,
        count: 1,
        asset_group: section === 'world' ? 'world' : 'visual_language',
        custom_prompt: prompt,
        forced_shot_type: shotTypeMap[targetSlot.slot_key] || 'atmospheric',
        generation_purpose: 'production_design',
        subject: targetFamily.targetName,
      },
    });

    if (error) throw error;

    const results = data?.results || [];
    const success = results.find((r: any) => r.status === 'ready');
    if (success?.image_id) {
      const isMotif = targetFamily.domain === 'production_design_motif';
      let shouldSelect = true;

      // Apply motif validation for single-slot regen too
      if (isMotif) {
        const slotKey = targetSlot.slot_key;
        const isPrimary = slotKey === 'motif_primary';

        let anchorForValidation: MotifFamilyFingerprint | null = null;
        let primaryExists = isPrimary || motifPrimaryAnchorRef.current !== null;
        let primaryValid = isPrimary || motifPrimaryValidRef.current;

        let anchorObjectNoun: string | null = null;

        if (!isPrimary) {
          if (motifPrimaryAnchorRef.current) {
            anchorForValidation = motifPrimaryAnchorRef.current;
            anchorObjectNoun = motifAnchorObjectNounRef.current;
          } else {
            const anchorResolution = await resolveMotifPrimaryAnchor(targetSetId);
            anchorForValidation = anchorResolution.fingerprint;
            primaryExists = anchorResolution.fingerprint !== null;
            primaryValid = anchorResolution.approvalGrade;
            anchorObjectNoun = anchorResolution.anchorObjectNoun;
            // Populate memory refs from persisted anchor for this session
            if (anchorResolution.fingerprint) {
              motifPrimaryAnchorRef.current = anchorResolution.fingerprint;
              motifPrimaryValidRef.current = anchorResolution.approvalGrade;
              motifAnchorObjectNounRef.current = anchorResolution.anchorObjectNoun;
            }
            console.log(`[PD-motif-regen] persisted-anchor source=${anchorResolution.source} approvalGrade=${anchorResolution.approvalGrade} confidence=${anchorResolution.confidence} anchorNoun=${anchorObjectNoun}`);
          }
        }

        const motifValidation = validateMotifCandidate(prompt, slotKey, anchorForValidation, worldValidationRules);
        const lineageStatus = resolveLineageStatus(slotKey, motifValidation, anchorForValidation, primaryExists, primaryValid);
        const selectionStatus = resolveMotifSelectionStatus(motifValidation, lineageStatus);

        console.log(`[PD-motif-regen] slot=${slotKey} passed=${motifValidation.passed} selection=${selectionStatus} lineage=${lineageStatus}`);

        if (selectionStatus !== 'selected_valid') {
          shouldSelect = false;
          console.warn(`[PD-motif-regen] BLOCKED slot=${slotKey}: selection=${selectionStatus}`);
        }

        if (isPrimary && motifValidation.passed) {
          motifPrimaryAnchorRef.current = motifValidation.fingerprint;
          motifPrimaryValidRef.current = true;
          const baseNoun = extractBaseObjectNounFromPrompt(prompt);
          motifAnchorObjectNounRef.current = baseNoun;
          anchorObjectNoun = baseNoun;
        }

        // Persist diagnostics with anchor object noun
        const diagnosticNoun = isPrimary
          ? (motifValidation.passed ? anchorObjectNoun : null)
          : anchorObjectNoun;
        const motifDiagnostics = serializeMotifDiagnostics(
          motifValidation, lineageStatus, selectionStatus,
          anchorForValidation ? fingerprintKey(anchorForValidation) : null,
          diagnosticNoun,
        );
        try {
          const { data: imgRow } = await (supabase as any)
            .from('project_images').select('generation_config').eq('id', success.image_id).maybeSingle();
          const existingConfig = (imgRow?.generation_config && typeof imgRow.generation_config === 'object') ? imgRow.generation_config : {};
          await (supabase as any).from('project_images')
            .update({ generation_config: { ...existingConfig, ...motifDiagnostics } })
            .eq('id', success.image_id);
        } catch (persistErr) {
          console.warn('[PD-motif-regen] Failed to persist diagnostics:', persistErr);
        }
      }

      await visualSets.wireImageToSlot({
        setId: targetSetId,
        imageId: success.image_id,
        shotType: targetSlot.slot_key,
        selectForSlot: shouldSelect,
      });
      visualSets.invalidate();
    } else {
      throw new Error('Generation did not produce a ready image');
    }
  }, [projectId, requiredFamilies, familySetMap, pdSets, visualSets]);

  const redoSlotAsIs = useCallback(async (imageId: string): Promise<void> => {
    // Load original prompt
    const { data: img } = await (supabase as any)
      .from('project_images')
      .select('prompt_used')
      .eq('id', imageId)
      .maybeSingle();
    if (!img?.prompt_used) throw new Error('No prompt found for this image');
    await regenerateSlotWithPrompt(imageId, img.prompt_used);
  }, [regenerateSlotWithPrompt]);

  // ── Reject family: archive existing set ──
  const rejectFamily = useCallback(async (family: PDFamily) => {
    const key = familyKey(family);
    const set = familySetMap.get(key);
    if (!set) return;
    if (set.status === 'locked') {
      toast.error('Cannot reject a locked family');
      return;
    }
    try {
      await visualSets.updateSetStatus.mutateAsync({ setId: set.id, status: 'archived' });
      visualSets.invalidate();
      toast.success(`${family.label} rejected — regeneration required`);
    } catch (err: any) {
      toast.error(`Reject failed: ${err.message}`);
    }
  }, [familySetMap, visualSets]);

  // ── Redo family: archive old + regenerate ──
  const redoFamily = useCallback(async (family: PDFamily) => {
    const key = familyKey(family);
    const set = familySetMap.get(key);
    if (set?.status === 'locked') {
      toast.error('Cannot redo a locked family');
      return;
    }
    await runBuild([family], 'redo');
  }, [familySetMap, runBuild]);

  // ── Retry with notes: validate note, then redo ──
  const validateNote = useCallback((note: string): NoteValidationResult => {
    return validateNoteAgainstCanon(note, canon || {});
  }, [canon]);

  const retryWithNotes = useCallback(async (family: PDFamily, note: string) => {
    const key = familyKey(family);
    const set = familySetMap.get(key);
    if (set?.status === 'locked') {
      toast.error('Cannot retry a locked family');
      return;
    }
    const validation = validateNote(note);
    if (validation.level === 'hard_conflict') {
      toast.error(`Cannot regenerate: ${validation.reasons[0]}`);
      return;
    }
    if (validation.level === 'soft_conflict') {
      toast.warning(`Note has soft conflicts: ${validation.reasons[0]}`);
    }
    await runBuild([family], 'redo', validation.sanitizedNote);
  }, [familySetMap, runBuild, validateNote]);

  // ── Unapprove + Redo (for approved but not locked sets) ──
  const unapproveAndRedo = useCallback(async (family: PDFamily) => {
    const key = familyKey(family);
    const set = familySetMap.get(key);
    if (!set) return;
    if (set.status === 'locked') {
      toast.error('Cannot unapprove a locked family');
      return;
    }
    // Move to draft first, then redo
    try {
      await visualSets.updateSetStatus.mutateAsync({ setId: set.id, status: 'draft' });
    } catch {
      // Best-effort status reset
    }
    await redoFamily(family);
  }, [familySetMap, visualSets, redoFamily]);

  // ── Derived: has incomplete work ──
  const hasIncompleteWork = useMemo(() => {
    for (const family of requiredFamilies) {
      const set = familySetMap.get(familyKey(family));
      if (!set) return true;
      if (set.status !== 'locked' && set.status !== 'ready_to_lock') return true;
    }
    return false;
  }, [requiredFamilies, familySetMap]);

  const hasFailedSlots = useMemo(() => {
    for (const [, fp] of buildProgress.familyProgress) {
      if (fp.failedSlots > 0) return true;
    }
    return false;
  }, [buildProgress]);

  // ── Derived: family effective state including rejected ──
  const getFamilyEffectiveState = useCallback((family: PDFamily, buildState?: FamilyProgress): FamilyBuildState => {
    if (buildState?.state === 'generating' || buildState?.state === 'failed') return buildState.state;
    const set = familySetMap.get(familyKey(family));
    if (!set) return 'pending';
    if (set.status === 'locked') return 'locked';
    if (set.status === 'archived') return 'rejected';
    if (set.status === 'ready_to_lock') return 'approved';
    if (set.status === 'curating' || set.status === 'autopopulated') return 'ready';
    return 'pending';
  }, [familySetMap]);

  // ── Lock All: lock every eligible family in one action ──
  const lockAll = useCallback(async () => {
    const results: { family: string; success: boolean; reason?: string }[] = [];
    for (const family of requiredFamilies) {
      const set = familySetMap.get(familyKey(family));
      if (!set) {
        results.push({ family: family.label, success: false, reason: 'No set exists' });
        continue;
      }
      if (set.status === 'locked') {
        results.push({ family: family.label, success: true, reason: 'Already locked' });
        continue;
      }
      if (set.status !== 'ready_to_lock') {
        results.push({ family: family.label, success: false, reason: `Status is ${set.status}, not ready_to_lock` });
        continue;
      }
      try {
        const { data, error } = await (supabase as any).rpc('lock_visual_set', { p_set_id: set.id });
        if (error) throw error;
        if (!data?.success) {
          results.push({ family: family.label, success: false, reason: data?.blocking_reasons?.[0] || 'Lock validation failed' });
        } else {
          results.push({ family: family.label, success: true });
        }
      } catch (err: any) {
        results.push({ family: family.label, success: false, reason: err.message });
      }
    }

    visualSets.invalidate();

    const locked = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);
    if (locked > 0) toast.success(`Locked ${locked} families`);
    if (failed.length > 0) {
      toast.error(`${failed.length} families could not be locked: ${failed[0].reason}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ''}`);
    }
    return results;
  }, [requiredFamilies, familySetMap, visualSets]);

  return {
    requiredFamilies,
    pdSets,
    familySetMap,
    progressSummary,
    pd,
    styleProfile,
    canon,
    locationDatasets,
    buildStatus,
    buildProgress,
    autoBuild,
    continueBuild,
    retryFailed,
    retryFamily,
    cancelBuild,
    rejectFamily,
    redoFamily,
    retryWithNotes,
    validateNote,
    unapproveAndRedo,
    getFamilyEffectiveState,
    hasIncompleteWork,
    hasFailedSlots,
    familyKey,
    regenerateSlotWithPrompt,
    redoSlotAsIs,
    fetchSlotsForSet: visualSets.fetchSlotsForSet,
    fetchCandidatesForSet: visualSets.fetchCandidatesForSet,
    approveAllSafe: visualSets.approveAllSafe,
    lockSet: visualSets.lockSet,
    selectCandidate: visualSets.selectCandidate,
    deselectSlot: visualSets.deselectSlot,
    invalidate: visualSets.invalidate,
    lockAll,
  };
}
