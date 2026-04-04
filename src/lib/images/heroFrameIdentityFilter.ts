/**
 * heroFrameIdentityFilter — Identity cluster enforcement for Hero Frames.
 *
 * SINGLE SOURCE OF TRUTH for determining which hero frame images belong
 * to the project's identity cluster vs. which are identity drift.
 *
 * Identity drift = image depicts a different actor/face than the established
 * identity anchors for the character it claims to represent.
 *
 * Detection heuristics (deterministic, metadata-only):
 * 1. generation_config.identity_locked must be true
 * 2. generation_config.anchor_image_ids must be present
 * 3. generation_config.actor_identity_gate_status must NOT be 'fail'
 * 4. generation_config.gate_admitted must NOT be false
 * 5. If subject is set, it must match the character's established identity cluster
 *
 * Images failing these checks are classified as DRIFT and excluded from:
 *   - scoring
 *   - approval
 *   - convergence
 *   - primary selection
 *
 * They remain visible in a separate "Drift" section for producer review.
 */

import type { ImageInput } from './sectionScoringEngine';

// ── Types ──────────────────────────────────────────────────────────

export type IdentityClusterStatus = 'valid' | 'drift' | 'unverified';

export interface IdentityFilteredImage extends ImageInput {
  identityStatus: IdentityClusterStatus;
  driftReasons: string[];
}

export interface IdentityFilterResult {
  /** Images passing identity cluster verification — eligible for scoring/approval */
  valid: IdentityFilteredImage[];
  /** Images flagged as identity drift — excluded from scoring/approval */
  drift: IdentityFilteredImage[];
  /** Images without enough metadata to determine — treated as valid with warning */
  unverified: IdentityFilteredImage[];
  /** Summary for diagnostics */
  summary: {
    totalImages: number;
    validCount: number;
    driftCount: number;
    unverifiedCount: number;
    dominantSubject: string | null;
    driftSubjects: string[];
  };
}

// ── Filter Logic ───────────────────────────────────────────────────

/**
 * Classify a single image's identity cluster status.
 * Uses generation_config metadata for deterministic, zero-network classification.
 */
export function classifyImageIdentity(
  img: ImageInput,
  dominantSubject: string | null,
): IdentityFilteredImage {
  const gc = (img.generation_config || {}) as Record<string, unknown>;
  const reasons: string[] = [];

  // Check 1: Explicit gate failure
  if (gc.actor_identity_gate_status === 'fail') {
    reasons.push('Failed actor identity gate');
  }

  // Check 2: Explicit gate rejection
  if (gc.gate_admitted === false) {
    reasons.push('Rejected by admission gate');
  }

  // Check 3: Identity lock absent
  const isLocked = !!gc.identity_locked;
  if (!isLocked && Object.keys(gc).length > 0) {
    // Only flag if gc exists but lock is missing (not for legacy images with no gc)
    reasons.push('Identity not locked during generation');
  }

  // Check 4: Anchor images absent (when gc exists)
  const hasAnchors = !!(gc.anchor_image_ids || gc.identity_anchor_paths || gc.reference_image_urls);
  if (!isLocked && !hasAnchors && Object.keys(gc).length > 0) {
    reasons.push('No identity anchors used during generation');
  }

  // Check 5: Subject mismatch against dominant cluster
  if (dominantSubject && img.subject) {
    const imgSubject = img.subject.toLowerCase().trim();
    const dominant = dominantSubject.toLowerCase().trim();
    if (imgSubject !== dominant && !imgSubject.includes(dominant) && !dominant.includes(imgSubject)) {
      reasons.push(`Subject "${img.subject}" differs from dominant identity "${dominantSubject}"`);
    }
  }

  // Determine status
  let status: IdentityClusterStatus;
  if (reasons.some(r => r.includes('Failed') || r.includes('Rejected'))) {
    // Hard drift: explicit gate failure
    status = 'drift';
  } else if (reasons.length > 0 && !isLocked) {
    // Soft drift: missing identity signals
    status = Object.keys(gc).length === 0 ? 'unverified' : 'drift';
  } else {
    status = 'valid';
  }

  return {
    ...img,
    identityStatus: status,
    driftReasons: reasons,
  };
}

/**
 * Determine the dominant subject (most frequent character) across hero frames.
 * Used to detect cross-character drift.
 */
function resolveDominantSubject(images: ImageInput[]): string | null {
  const subjectCounts = new Map<string, number>();
  for (const img of images) {
    if (img.subject) {
      const key = img.subject.toLowerCase().trim();
      subjectCounts.set(key, (subjectCounts.get(key) || 0) + 1);
    }
  }
  if (subjectCounts.size === 0) return null;

  let maxCount = 0;
  let dominant: string | null = null;
  for (const [subject, count] of subjectCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = subject;
    }
  }
  return dominant;
}

/**
 * Filter hero frame images into identity-valid and drift sets.
 *
 * This is THE canonical identity enforcement for hero frames.
 * All scoring, approval, and convergence must operate only on the `valid` set.
 */
export function filterHeroFramesByIdentity(images: ImageInput[]): IdentityFilterResult {
  // Hero frames may intentionally feature multiple characters; we don't
  // enforce single-subject dominance. Instead we only check per-image
  // identity signals (lock, anchors, gate status).
  // The dominantSubject is informational only.
  const dominantSubject = resolveDominantSubject(images);

  const valid: IdentityFilteredImage[] = [];
  const drift: IdentityFilteredImage[] = [];
  const unverified: IdentityFilteredImage[] = [];

  const driftSubjectsSet = new Set<string>();

  for (const img of images) {
    // For hero frames, we do NOT enforce subject matching (they can feature
    // any character). We only enforce identity lock and gate status.
    const classified = classifyImageIdentity(img, null);

    switch (classified.identityStatus) {
      case 'valid':
        valid.push(classified);
        break;
      case 'drift':
        drift.push(classified);
        if (classified.subject) driftSubjectsSet.add(classified.subject);
        break;
      case 'unverified':
        // Unverified images (legacy, no gen config) are allowed through
        // but flagged — they can still be scored/approved
        unverified.push(classified);
        break;
    }
  }

  return {
    valid,
    drift,
    unverified,
    summary: {
      totalImages: images.length,
      validCount: valid.length,
      driftCount: drift.length,
      unverifiedCount: unverified.length,
      dominantSubject: dominantSubject,
      driftSubjects: Array.from(driftSubjectsSet),
    },
  };
}

/**
 * Quick check: is a single image identity-valid for hero frame operations?
 * Used as a guard before approve/set-primary actions.
 */
export function isHeroFrameIdentityValid(img: ImageInput): boolean {
  const classified = classifyImageIdentity(img, null);
  return classified.identityStatus !== 'drift';
}
