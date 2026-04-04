/**
 * lookbookScorer — Canonical image scoring system for LookBook.
 * 
 * SINGLE SOURCE OF TRUTH for all image scoring.
 * No other module may implement alternative scoring logic.
 * 
 * Pure function — no hidden closures. All context passed explicitly.
 */
import type { ProjectImage } from '@/lib/images/types';
import { classifyOrientation } from '@/lib/images/orientationUtils';

// ── Scoring Context ──────────────────────────────────────────────────────────

export interface SlotIntentContext {
  /** Whether environment dominance is required for this slot */
  requiresEnvironmentDominance?: boolean;
  /** Whether principal identity is required for this slot */
  requiresPrincipalIdentity?: boolean;
  /** Whether scene provenance is required */
  requiresSceneProvenance?: boolean;
  /** Set of entity IDs that are identity-bound principals */
  boundPrincipalIds?: Set<string>;
  /** Whether scene evidence exists for this project */
  hasSceneEvidence?: boolean;
  /** Scene Index — character keys for the active scene (constrains candidate selection) */
  sceneCharacterKeys?: string[];
  /** Scene Index — location key for the active scene (boosts location-matching images) */
  sceneLocationKey?: string | null;
  /** Scene Index — scene number for ordering context */
  sceneNumber?: number;
  /** Scene Index — wardrobe state map for future wardrobe-aware scoring */
  sceneWardrobeStateMap?: Record<string, string>;
}

export interface ScoringContext {
  /** Deck-level URL usage for reuse penalty */
  deckImageUsage: Map<string, { count: number; usedOnSlides: string[] }>;
  /** Semantic fingerprint usage for diversity penalty */
  usedFingerprints: Map<string, number>;
  /** Slot intent context for intelligence hooks */
  slotIntent?: SlotIntentContext;
}

// ── Fingerprint ──────────────────────────────────────────────────────────────

export function getImageFingerprint(img: ProjectImage): string {
  return [
    img.asset_group || 'none',
    img.subject || 'none',
    img.location_ref || 'none',
    img.shot_type || 'none',
  ].join('|');
}

// ── Anti-Pattern Detection ───────────────────────────────────────────────────

/** Detect craft/workshop/occupation imagery */
export function isCraftScene(img: ProjectImage): boolean {
  const text = [
    (img as any).prompt_used || '',
    (img as any).description || '',
    img.subject_ref || '',
    img.location_ref || '',
  ].join(' ').toLowerCase();
  return (
    text.includes('pottery') ||
    text.includes('ceramic') ||
    text.includes('workshop') ||
    text.includes('kiln') ||
    text.includes('craftsman') ||
    text.includes('artisan') ||
    text.includes('handicraft') ||
    text.includes('pottery wheel') ||
    text.includes('forging') ||
    text.includes('blacksmith') ||
    text.includes('weaving') ||
    text.includes('loom') ||
    text.includes('sculpting') ||
    text.includes('performing their trade') ||
    text.includes('craft process')
  );
}

/** Detect character-centered composition in environment context */
export function isCharacterCenteredInEnvironment(img: ProjectImage): boolean {
  const text = ((img as any).prompt_used || '').toLowerCase();
  if (img.asset_group === 'world' || (img as any).subject_type === 'location' || (img as any).subject_type === 'world') {
    return (
      (img.shot_type === 'close_up' || img.shot_type === 'medium') &&
      !!(img.subject_ref) &&
      text.includes('character')
    );
  }
  return false;
}

// ── Canonical Scorer ─────────────────────────────────────────────────────────

/**
 * Score an image for a specific slide type.
 * 
 * This is the ONLY scoring function. All image selection must use this.
 * 
 * @param img - The image to score
 * @param slideType - The target slide type
 * @param applyReusePenalty - Whether to apply deck-level reuse and fingerprint penalties
 * @param context - Explicit scoring context (usage trackers)
 */
export function scoreImageForSlide(
  img: ProjectImage,
  slideType: string,
  applyReusePenalty: boolean = true,
  context?: ScoringContext,
): number {
  let score = 0;
  const hasNarrative = !!(img.entity_id || img.location_ref || img.moment_ref || img.subject_ref);
  const orientation = classifyOrientation(img.width, img.height);
  const isLandscape = orientation === 'landscape';
  const isPortrait = orientation === 'portrait';

  // Narrative truth bonus (highest priority)
  if (hasNarrative) score += 25;

  // Primary bonus — REDUCED so newer approved images can compete
  if (img.is_primary) score += 3;

  // ── Orientation compliance ──
  // Landscape-requiring slots: cover, closing, world, creative_statement, themes, comparables
  const LANDSCAPE_REQUIRED_SLIDES = ['cover', 'closing', 'world', 'creative_statement', 'themes', 'comparables'];
  // Portrait-requiring slots: poster_directions, character portraits
  const PORTRAIT_PREFERRED_SLIDES = ['poster_directions'];

  if (LANDSCAPE_REQUIRED_SLIDES.includes(slideType)) {
    if (isLandscape) score += 12;
    else if (isPortrait) score -= 18;  // Strong penalty for wrong orientation
    else if (orientation === 'square') score -= 6;
  } else if (PORTRAIT_PREFERRED_SLIDES.includes(slideType)) {
    if (isPortrait) score += 10;
    else if (isLandscape) score -= 12;
  } else {
    // Neutral slides — mild landscape bonus for backgrounds
    if (isLandscape) score += 4;
  }

  // Freshness boost
  const ageMs = Date.now() - new Date(img.created_at || 0).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 1) score += 12;
  else if (ageDays < 3) score += 8;
  else if (ageDays < 7) score += 4;

  // ── Cinematic Fidelity / Photorealism Scoring ──
  const promptText = ((img as any).prompt_used || (img as any).description || '').toLowerCase();
  const isPhotorealPrompt = promptText.includes('photorealistic') || promptText.includes('film still') || promptText.includes('cinematic') || promptText.includes('arri') || promptText.includes('35mm') || promptText.includes('anamorphic') || promptText.includes('natural light');
  const isNonPhotoreal = promptText.includes('illustration') || promptText.includes('painting') || promptText.includes('anime') || promptText.includes('concept art') || promptText.includes('watercolor') || promptText.includes('sketch') || promptText.includes('cartoon') || promptText.includes('digital art') || promptText.includes('3d render');

  // Photorealism is expected for ALL non-texture slots
  const isTextureSlot = slideType === 'visual_language';
  if (isPhotorealPrompt) score += (isTextureSlot ? 4 : 10);
  if (isNonPhotoreal) score -= (isTextureSlot ? 8 : 25);

  // Resolution quality proxy
  const megapixels = ((img.width || 0) * (img.height || 0)) / 1_000_000;
  if (megapixels >= 2) score += 4;
  else if (megapixels >= 1) score += 2;
  else if (megapixels > 0 && megapixels < 0.3) score -= 5;

  // Higher fidelity threshold for hero/poster slots
  if ((slideType === 'cover' || slideType === 'closing') && isNonPhotoreal) {
    score -= 15;
  }

  // Section-specific scoring
  const shotType = img.shot_type || '';
  switch (slideType) {
    case 'world':
      if (['wide', 'atmospheric'].includes(shotType)) score += 15;
      if (img.asset_group === 'world') score += 12;
      if (img.location_ref) score += 10;
      if (['texture_ref', 'detail', 'composition_ref', 'color_ref'].includes(shotType)) score -= 15;
      if (img.asset_group === 'visual_language' && !img.location_ref) score -= 10;
      break;
    case 'themes':
      if (['atmospheric', 'time_variant', 'lighting_ref'].includes(shotType)) score += 15;
      if (img.asset_group === 'visual_language') score += 8;
      if (['texture_ref', 'detail'].includes(shotType) && !img.location_ref) score -= 8;
      break;
    case 'visual_language':
      if (['texture_ref', 'detail', 'composition_ref', 'color_ref', 'lighting_ref'].includes(shotType)) score += 15;
      break;
    case 'key_moments':
      if (['tableau', 'medium', 'close_up', 'wide'].includes(shotType)) score += 15;
      if (img.asset_group === 'key_moment') score += 12;
      if (img.moment_ref) score += 10;
      if (['texture_ref', 'detail', 'composition_ref', 'color_ref'].includes(shotType)) score -= 15;
      break;
    case 'story_engine':
      if (img.moment_ref) score += 12;
      if (img.asset_group === 'key_moment') score += 8;
      if (['texture_ref', 'detail'].includes(shotType)) score -= 10;
      break;
    case 'cover':
      if (img.role === 'poster_primary') score += 20;
      if (img.role === 'poster_variant') score += 10;
      if (['texture_ref', 'detail', 'composition_ref'].includes(shotType)) score -= 20;
      break;
    case 'closing':
      if (img.role === 'poster_primary') score += 20;
      if (img.role === 'poster_variant') score += 10;
      if (['texture_ref', 'detail'].includes(shotType)) score -= 15;
      break;
    case 'creative_statement':
      if (['atmospheric', 'wide'].includes(shotType)) score += 10;
      if (['texture_ref', 'detail'].includes(shotType)) score -= 12;
      break;
  }

  // Deck-level reuse penalty
  if (applyReusePenalty && context && img.signedUrl) {
    const usage = context.deckImageUsage.get(img.signedUrl);
    if (usage && usage.count > 0) {
      score += usage.count * -30;
    }
  }

  // Semantic fingerprint diversity penalty
  if (applyReusePenalty && context) {
    const fp = getImageFingerprint(img);
    const fpCount = context.usedFingerprints.get(fp) || 0;
    score += fpCount * -25;
  }

  // Anti-pattern: craft/workshop imagery penalty on non-visual-language slides
  if (slideType !== 'visual_language' && isCraftScene(img)) {
    score -= 25;
    if (slideType === 'world' || slideType === 'creative_statement') {
      score -= 20;
    }
  }

  // Anti-pattern: character-centered composition in world/environment slot
  if ((slideType === 'world' || slideType === 'creative_statement' || slideType === 'themes') && isCharacterCenteredInEnvironment(img)) {
    score -= 15;
  }

  // ── Slot Intent Intelligence Hooks ──────────────────────────────────────
  const slotIntent = context?.slotIntent;
  if (slotIntent) {
    // World/environment slides: penalize character-centric images when environment dominance required
    if (slotIntent.requiresEnvironmentDominance) {
      if (img.location_ref) {
        score += 8;
        console.log(`[Scorer:intent] ${slideType} +8 env-location for ${img.id.slice(0,8)} (loc=${img.location_ref})`);
      }
      if (img.entity_id && !img.location_ref && (img.shot_type === 'close_up' || img.shot_type === 'medium')) {
        score -= 12;
        console.log(`[Scorer:intent] ${slideType} -12 char-in-env for ${img.id.slice(0,8)} (entity=${img.entity_id?.slice(0,8)}, shot=${img.shot_type})`);
      }
    }

    // Character slides: bonus when image matches a bound principal
    if (slotIntent.requiresPrincipalIdentity && slotIntent.boundPrincipalIds) {
      if (img.entity_id && slotIntent.boundPrincipalIds.has(img.entity_id)) {
        score += 10;
        console.log(`[Scorer:intent] ${slideType} +10 principal-match for ${img.id.slice(0,8)} (entity=${img.entity_id?.slice(0,8)})`);
      }
    }

    // Scene slides: bonus when scene evidence exists and image has moment anchor
    if (slotIntent.requiresSceneProvenance && slotIntent.hasSceneEvidence) {
      if (img.moment_ref) {
        score += 8;
        console.log(`[Scorer:intent] ${slideType} +8 scene-anchor for ${img.id.slice(0,8)} (moment=${img.moment_ref})`);
      }
    }

    // Scene Index: character-key match — boost images whose entity matches scene's character set
    if (slotIntent.sceneCharacterKeys && slotIntent.sceneCharacterKeys.length > 0) {
      const charSet = new Set(slotIntent.sceneCharacterKeys.map(k => k.toLowerCase()));
      if (img.entity_id && charSet.has(img.entity_id.toLowerCase())) {
        score += 12;
        console.log(`[Scorer:scene] ${slideType} +12 scene-char-match for ${img.id.slice(0,8)} (entity=${img.entity_id.slice(0,8)}, scene=${slotIntent.sceneNumber ?? '?'})`);
      } else if (img.subject_ref) {
        const subjectLower = img.subject_ref.toLowerCase();
        if (charSet.has(subjectLower)) {
          score += 8;
          console.log(`[Scorer:scene] ${slideType} +8 scene-subject-match for ${img.id.slice(0,8)} (subject=${img.subject_ref}, scene=${slotIntent.sceneNumber ?? '?'})`);
        }
      }
    }

    // Scene Index: location-key match — boost images whose location matches scene's location
    if (slotIntent.sceneLocationKey) {
      const locKey = slotIntent.sceneLocationKey.toLowerCase();
      if (img.location_ref && img.location_ref.toLowerCase() === locKey) {
        score += 10;
        console.log(`[Scorer:scene] ${slideType} +10 scene-location-match for ${img.id.slice(0,8)} (loc=${img.location_ref}, scene=${slotIntent.sceneNumber ?? '?'})`);
      }
    }
  }

  return score;
}
