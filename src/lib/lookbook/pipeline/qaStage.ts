/**
 * qaStage — Final deck quality validation with completeness gate.
 *
 * INPUT: LookBookData + optional RequirementResult[]
 * OUTPUT: QAResult with slot-purpose, identity, diversity, fill, coverage,
 *         reuse diagnostics, and deterministic quality grading
 * SIDE EFFECTS: none (pure function)
 */
import type { LookBookData } from '../types';
import type { QAResult, QualityGrade } from './types';
import type { RequirementResult } from './requirementBuilder';
import { validateCandidateForSlidePurpose, isEditorialSlide } from './slotPurposeValidator';

// ── Diagnostic types ─────────────────────────────────────────────────────────

export interface QADiagnostic {
  category: 'slot_purpose' | 'identity' | 'diversity' | 'fill' | 'editorial' | 'coverage' | 'reuse';
  severity: 'info' | 'warning' | 'error';
  slideType: string;
  message: string;
}

// ── Required slide types for a production-grade lookbook ──────────────────────

const REQUIRED_SLIDE_TYPES = ['cover', 'creative_statement', 'characters', 'key_moments', 'closing'] as const;
const RECOMMENDED_SLIDE_TYPES = ['world', 'visual_language', 'themes'] as const;

/** Max times a single image URL should appear across the deck before flagging */
const IMAGE_REUSE_THRESHOLD = 3;

/** Minimum image count for image-bearing editorial slides to not be "sparse" */
const SPARSE_IMAGE_THRESHOLD = 1;

/**
 * Run quality checks on the assembled LookBook deck.
 */
export function runQAStage(data: LookBookData, requirementResults?: RequirementResult[]): QAResult {
  const actualImageUrls = new Set<string>();
  const unresolvedSlides: string[] = [];
  const reuseWarnings: string[] = [];
  const fingerprintWarnings: string[] = [];
  const diagnostics: QADiagnostic[] = [];

  // Track URL usage across slides for reuse detection
  const urlSlideUsage = new Map<string, string[]>();
  const trackUrl = (url: string, slideType: string) => {
    actualImageUrls.add(url);
    const existing = urlSlideUsage.get(url) || [];
    existing.push(slideType);
    urlSlideUsage.set(url, existing);
  };

  // Track scene signature diversity across editorial slides
  const editorialSignatures = new Map<string, string[]>();
  const slideTypesPresent = new Set<string>();

  for (const slide of data.slides) {
    slideTypesPresent.add(slide.type);

    if (slide.backgroundImageUrl) trackUrl(slide.backgroundImageUrl, slide.type);
    if (slide.imageUrl) trackUrl(slide.imageUrl, slide.type);
    if (slide.imageUrls) slide.imageUrls.forEach(u => trackUrl(u, slide.type));
    if (slide.characters) {
      for (const c of slide.characters) {
        if (c.imageUrl) trackUrl(c.imageUrl, slide.type);
      }
    }
    if (slide._has_unresolved) unresolvedSlides.push(slide.type);

    // ── Resolution status audit ──
    if (slide._resolutionStatus === 'unresolved') {
      diagnostics.push({
        category: 'fill',
        severity: 'error',
        slideType: slide.type,
        message: `Slide "${slide.type}" is fully unresolved — no valid imagery. Will be excluded from export.`,
      });
    } else if (slide._resolutionStatus === 'partial') {
      diagnostics.push({
        category: 'fill',
        severity: 'warning',
        slideType: slide.type,
        message: `Slide "${slide.type}" is partially resolved — some image slots unfilled.`,
      });
    }

    // ── Hero anchor audit ──
    if (slide._heroAnchorId && !slide._heroAnchorInjected) {
      diagnostics.push({
        category: 'fill',
        severity: 'warning',
        slideType: slide.type,
        message: `Hero anchor ${slide._heroAnchorId.slice(0, 12)}… declared but not injected`,
      });
    }

    // ── Character slide under-fill check ──
    if (slide.type === 'characters') {
      const charCount = slide.characters?.filter(c => c.imageUrl).length || 0;
      if (charCount === 0) {
        diagnostics.push({
          category: 'fill',
          severity: 'error',
          slideType: 'characters',
          message: 'Characters slide has no character images — critically under-filled',
        });
      } else if (charCount < 2) {
        diagnostics.push({
          category: 'fill',
          severity: 'warning',
          slideType: 'characters',
          message: `Characters slide has only ${charCount} character(s) — consider more coverage`,
        });
      }
    }

    // ── Editorial slide content check ──
    if (isEditorialSlide(slide.type)) {
      const imageCount = (slide.imageUrls?.length || 0) + (slide.backgroundImageUrl ? 1 : 0) + (slide.imageUrl ? 1 : 0);
      if (imageCount === 0) {
        diagnostics.push({
          category: 'fill',
          severity: 'warning',
          slideType: slide.type,
          message: `Editorial slide "${slide.type}" has no images`,
        });
      }
    }

    // ── Sparse slide detection (image-bearing non-text slides) ──
    if (['key_moments', 'visual_language', 'world'].includes(slide.type)) {
      const fgCount = slide.imageUrls?.length || 0;
      const bgCount = slide.backgroundImageUrl ? 1 : 0;
      const total = fgCount + bgCount;
      if (total > 0 && total < SPARSE_IMAGE_THRESHOLD + 1 && slide.type !== 'world') {
        // world with 1 image is acceptable; key_moments/visual_language need more
        diagnostics.push({
          category: 'fill',
          severity: 'warning',
          slideType: slide.type,
          message: `Slide "${slide.type}" has only ${total} image(s) — may appear sparse in final deck`,
        });
      }
    }
  }

  // ── Section coverage checks ──
  for (const required of REQUIRED_SLIDE_TYPES) {
    if (!slideTypesPresent.has(required)) {
      diagnostics.push({
        category: 'coverage',
        severity: 'error',
        slideType: required,
        message: `Required section "${required}" is missing from the deck`,
      });
    }
  }
  for (const recommended of RECOMMENDED_SLIDE_TYPES) {
    if (!slideTypesPresent.has(recommended)) {
      diagnostics.push({
        category: 'coverage',
        severity: 'warning',
        slideType: recommended,
        message: `Recommended section "${recommended}" is missing — deck may feel incomplete`,
      });
    }
  }

  // ── Detect cross-slide reuse ──
  for (const [url, slides] of urlSlideUsage.entries()) {
    if (slides.length > 1) {
      reuseWarnings.push(`Image used on ${slides.join(' + ')} (×${slides.length})`);
    }
    // Flag excessive reuse
    if (slides.length >= IMAGE_REUSE_THRESHOLD) {
      diagnostics.push({
        category: 'reuse',
        severity: 'warning',
        slideType: slides[0],
        message: `Image reused ${slides.length}× across slides (${slides.join(', ')}) — deck may appear repetitive`,
      });
    }
  }

  // ── Deck-level duplicate dominance check ──
  const totalImageSlots = Array.from(urlSlideUsage.values()).reduce((sum, s) => sum + s.length, 0);
  const uniqueImages = urlSlideUsage.size;
  if (totalImageSlots > 4 && uniqueImages > 0) {
    const reuseRatio = 1 - (uniqueImages / totalImageSlots);
    if (reuseRatio > 0.5) {
      diagnostics.push({
        category: 'reuse',
        severity: 'warning',
        slideType: 'deck',
        message: `High image reuse: ${uniqueImages} unique images across ${totalImageSlots} slots (${Math.round(reuseRatio * 100)}% reuse) — governed pool may be too shallow`,
      });
    }
  }

  // ── Requirement-level diagnostics ──
  if (requirementResults) {
    const editorialBlocked = requirementResults.filter(r =>
      isEditorialSlide(r.requirement.slideType) && r.status === 'blocked'
    );
    for (const r of editorialBlocked) {
      diagnostics.push({
        category: 'slot_purpose',
        severity: 'warning',
        slideType: r.requirement.slideType,
        message: `Editorial requirement "${r.requirement.label}" is blocked: ${r.blockingReason || 'unknown reason'}`,
      });
    }

    const characterReqs = requirementResults.filter(r => r.requirement.pass === 'character');
    const charBlocked = characterReqs.filter(r => r.status === 'blocked');
    if (charBlocked.length > 0) {
      diagnostics.push({
        category: 'identity',
        severity: 'error',
        slideType: 'characters',
        message: `${charBlocked.length} character requirement(s) blocked: ${charBlocked.map(r => r.requirement.label).join(', ')}`,
      });
    }

    const partialReqs = requirementResults.filter(r => r.status === 'partial');
    for (const r of partialReqs) {
      diagnostics.push({
        category: 'fill',
        severity: 'warning',
        slideType: r.requirement.slideType,
        message: `Requirement "${r.requirement.label}" only partially filled: ${r.generatedCount}/${r.requirement.minRequired}`,
      });
    }
  }

  const slidesWithImages = data.slides.filter(s =>
    s.backgroundImageUrl || s.imageUrl || (s.imageUrls && s.imageUrls.length > 0) ||
    (s.characters && s.characters.some(c => c.imageUrl)),
  ).length;

  // ── Publishability (backward-compat) ──
  let publishable: boolean;
  if (requirementResults && requirementResults.length > 0) {
    const satisfied = requirementResults.filter(r => r.status === 'satisfied').length;
    const critical = requirementResults.filter(r => r.requirement.critical);
    const criticalBlocked = critical.filter(r => r.status === 'blocked').length;
    publishable = criticalBlocked === 0 && satisfied >= Math.ceil(requirementResults.length * 0.5);
  } else {
    publishable = unresolvedSlides.length <= 2 && slidesWithImages >= Math.floor(data.slides.length * 0.6);
  }

  // ── Deterministic quality grading ──
  const qualityGrade = computeQualityGrade({
    totalSlides: data.slides.length,
    slidesWithImages,
    unresolvedCount: unresolvedSlides.length,
    requiredMissing: REQUIRED_SLIDE_TYPES.filter(t => !slideTypesPresent.has(t)).length,
    recommendedMissing: RECOMMENDED_SLIDE_TYPES.filter(t => !slideTypesPresent.has(t)).length,
    errorCount: diagnostics.filter(d => d.severity === 'error').length,
    warningCount: diagnostics.filter(d => d.severity === 'warning').length,
    reuseCount: diagnostics.filter(d => d.category === 'reuse').length,
    uniqueImages,
    totalImageSlots,
    publishable,
  });

  // Log diagnostics summary
  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');
  if (errors.length > 0 || warnings.length > 0) {
    console.log(`[QA] ${errors.length} errors, ${warnings.length} warnings | grade=${qualityGrade}`);
    for (const d of diagnostics) {
      console.log(`[QA:${d.severity}:${d.category}] ${d.slideType}: ${d.message}`);
    }
  }

  return {
    totalSlides: data.slides.length,
    slidesWithImages,
    slidesWithoutImages: data.slides.length - slidesWithImages,
    totalImageRefs: actualImageUrls.size,
    unresolvedSlides,
    reuseWarnings,
    fingerprintWarnings,
    publishable,
    qualityGrade,
    diagnostics,
  };
}

// ── Quality Grade Computation ────────────────────────────────────────────────

interface GradeInputs {
  totalSlides: number;
  slidesWithImages: number;
  unresolvedCount: number;
  requiredMissing: number;
  recommendedMissing: number;
  errorCount: number;
  warningCount: number;
  reuseCount: number;
  uniqueImages: number;
  totalImageSlots: number;
  publishable: boolean;
}

/**
 * Deterministic quality grade computation.
 *
 * - incomplete: missing required sections OR too many errors OR not publishable
 * - exportable: publishable but has significant warnings/gaps
 * - publishable: good coverage, minor issues only
 * - strong: full coverage, no errors, minimal warnings, good image diversity
 */
export function computeQualityGrade(inputs: GradeInputs): QualityGrade {
  // Gate: incomplete if not publishable or missing required sections
  if (!inputs.publishable || inputs.requiredMissing > 0) return 'incomplete';

  // Gate: incomplete if more than 2 errors
  if (inputs.errorCount > 2) return 'incomplete';

  // Exportable: some errors or heavy warnings
  if (inputs.errorCount > 0 || inputs.warningCount > 5 || inputs.reuseCount > 2) return 'exportable';

  // Publishable vs strong
  const imageRatio = inputs.totalSlides > 0 ? inputs.slidesWithImages / inputs.totalSlides : 0;
  const hasGoodDiversity = inputs.uniqueImages >= 5;
  const noRecommendedGaps = inputs.recommendedMissing === 0;
  const fewWarnings = inputs.warningCount <= 2;
  const noUnresolved = inputs.unresolvedCount === 0;

  if (imageRatio >= 0.8 && hasGoodDiversity && noRecommendedGaps && fewWarnings && noUnresolved) {
    return 'strong';
  }

  return 'publishable';
}
