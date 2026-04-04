/**
 * premiumDisplayFilter — Client-side post-fetch governance filter
 * for premium-facing display surfaces.
 *
 * This bridges the gap between DB queries (which can't inspect JSONB
 * generation_config) and the premium governance gates.
 *
 * Apply AFTER fetching from useLookbookSectionContent / resolveCanonImages
 * to exclude rows that fail identity or premium quality gates.
 *
 * Uses the SAME gates as scoring/mutation paths — no duplicate logic.
 */
import { classifyCharacterIdentity, type GateImageInput } from './characterImageEligibility';
import {
  classifyPremiumImageQuality,
  isPremiumSection as isPremiumSectionCheck,
  type QualityGateImageInput,
} from './premiumQualityGate';

export interface DisplayFilterResult<T> {
  /** Images passing all governance gates */
  governed: T[];
  /** Images excluded by governance */
  excluded: T[];
  /** Summary for debug surfaces */
  summary: {
    total: number;
    governedCount: number;
    identityExcluded: number;
    premiumExcluded: number;
  };
}

/**
 * Apply governance filters to images for display on a section surface.
 * For non-premium sections, only identity gate applies.
 * For premium sections, both identity + premium quality gates apply.
 *
 * This is the canonical post-fetch display filter — all premium-facing
 * display paths must use this.
 */
export function filterForDisplay<T extends GateImageInput & QualityGateImageInput>(
  images: T[],
  sectionKey: string,
): DisplayFilterResult<T> {
  const isPremium = isPremiumSectionCheck(sectionKey);
  const governed: T[] = [];
  const excluded: T[] = [];
  let identityExcluded = 0;
  let premiumExcluded = 0;

  for (const img of images) {
    // Identity gate
    const identity = classifyCharacterIdentity(img, sectionKey);
    if (!identity.eligible) {
      excluded.push(img);
      identityExcluded++;
      continue;
    }

    // Premium quality gate (premium sections only)
    if (isPremium) {
      const quality = classifyPremiumImageQuality(img);
      if (quality.status === 'premium_fail') {
        excluded.push(img);
        premiumExcluded++;
        continue;
      }
    }

    governed.push(img);
  }

  if (excluded.length > 0) {
    console.warn('[DISPLAY_GOVERNANCE_FILTER]', {
      sectionKey,
      total: images.length,
      governed: governed.length,
      identityExcluded,
      premiumExcluded,
    });
  }

  return {
    governed,
    excluded,
    summary: {
      total: images.length,
      governedCount: governed.length,
      identityExcluded,
      premiumExcluded,
    },
  };
}
