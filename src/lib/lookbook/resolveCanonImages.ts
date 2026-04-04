/**
 * resolveCanonImages — Resolves active canonical images per lookbook section.
 * Uses the SAME query logic as useLookbookSectionContent (workspace)
 * to ensure presentation and workspace share a single source of truth.
 *
 * CVBE Phase 2: Bound images are preferred over unbound images within each tier.
 *
 * STRICT DECK MODE (vertical-drama):
 * When strictDeckMode=true, ONLY active primary winners are resolved.
 * No candidate fallback, no role fallback, no asset_group-only fallback.
 * Slots without a compliant primary winner remain UNRESOLVED.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ProjectImage } from '@/lib/images/types';
import { classifyVerticalCompliance } from '@/lib/images/verticalCompliance';
import {
  buildCanonicalSectionFilter,
  SECTION_QUERY_MAP,
  type CanonicalSectionKey,
} from '@/lib/lookbook/pipeline/lookbookSlotRegistry';
import { filterForDisplay } from '@/lib/images/premiumDisplayFilter';
import { getHeroAnchor, injectHeroAnchor } from '@/lib/hero/getHeroAnchor';

function applyCanonicalSectionFilter(
  q: any,
  filter: ReturnType<typeof buildCanonicalSectionFilter>,
  options: { includeShotTypes?: boolean } = {},
) {
  const includeShotTypes = options.includeShotTypes ?? true;

  // ── CRITICAL: Match useLookbookSectionContent OR logic ──
  // For multi-group sections (e.g. atmosphere_lighting: world + visual_language),
  // PD images may have strategy_key=NULL but valid asset_group.
  // Using AND logic here would starve those images.
  // Use OR between strategy_keys and asset_groups to capture all valid assets.
  if (filter.strategyKeys.length > 0 && filter.assetGroups.length > 0) {
    q = q.or(
      `strategy_key.in.(${filter.strategyKeys.join(',')}),asset_group.in.(${filter.assetGroups.join(',')})`
    );
  } else if (filter.strategyKeys.length > 0) {
    q = q.in('strategy_key', filter.strategyKeys);
  } else if (filter.assetGroups.length > 0) {
    if (filter.fallbackRoles?.length) {
      q = q.or(`asset_group.in.(${filter.assetGroups.join(',')}),role.in.(${filter.fallbackRoles.join(',')})`);
    } else {
      q = q.in('asset_group', filter.assetGroups);
    }
  } else if (filter.fallbackRoles?.length) {
    q = q.in('role', filter.fallbackRoles);
  }

  if (includeShotTypes && filter.shotTypes?.length) {
    q = q.in('shot_type', filter.shotTypes);
  }

  // LOOKBOOK CANONICAL VISIBILITY BOUNDARY
  // Keep deck resolution aligned with workspace lineage guards.
  if (filter.allowedGenerationPurposes?.length) {
    q = q.in('generation_purpose', filter.allowedGenerationPurposes);
  }

  return q;
}

/** Debug provenance per resolved image */
export interface ResolvedImageProvenance {
  imageId: string;
  source: 'winner_primary' | 'active_non_primary' | 'candidate_fallback' | 'unresolved';
  complianceClass: string;
  actualWidth: number | null;
  actualHeight: number | null;
  isPrimary: boolean;
  curationState: string;
}

export interface SectionImageResult {
  sectionKey: CanonicalSectionKey;
  images: ProjectImage[];
  imageIds: string[];
  /** Per-image provenance for deck debug proof */
  provenance: ResolvedImageProvenance[];
  /** Count of unresolved slots (images needed but not found) */
  unresolvedCount: number;
  /** Hero Anchor Contract metadata — explicit, never inferred from position */
  hasHeroAnchor: boolean;
  heroAnchorId: string | null;
  heroAnchorInjected: boolean;
}

/** Diagnostics for the full resolution run */
export interface ResolutionDiagnostics {
  totalActivePool: number;
  totalCandidatePool: number;
  totalResolved: number;
  sectionsWithZeroActive: string[];
  resolvedImageIds: string[];
}

// ── Canonical Binding Preference ─────────────────────────────────────────────

type BindingStatus = 'bound' | 'partially_bound' | 'unbound' | undefined;
type TargetingMode = 'exact' | 'derived' | 'heuristic' | undefined;

function getBindingRank(img: ProjectImage): number {
  const gc = img.generation_config as Record<string, unknown> | null;
  const status = gc?.canonical_binding_status as BindingStatus;
  if (status === 'bound') return 0;
  if (status === 'partially_bound') return 1;
  return 2; // unbound or no provenance
}

function getTargetingRank(img: ProjectImage): number {
  const gc = img.generation_config as Record<string, unknown> | null;
  const mode = gc?.targeting_mode as TargetingMode;
  if (mode === 'exact') return 0;
  if (mode === 'derived') return 1;
  return 2; // heuristic or no provenance
}

/**
 * Narrative truth rank — how strongly this image is anchored to actual
 * script/canon entities vs being generic atmospheric imagery.
 *
 * Images bound to real canon entities (characters, locations, moments)
 * are preferred over beautiful but narratively unanchored images.
 */
function getNarrativeTruthRank(img: ProjectImage): number {
  const hasEntity = !!img.entity_id;
  const hasLocation = !!img.location_ref;
  const hasMoment = !!img.moment_ref;
  const hasSubject = !!img.subject;
  const hasSubjectRef = !!img.subject_ref;

  if (hasEntity && hasLocation) return 0;  // strongest: entity + location
  if (hasEntity || (hasSubjectRef && hasLocation)) return 1;
  if (hasLocation || hasMoment) return 2;
  if (hasSubjectRef || hasSubject) return 3;
  return 4;  // no narrative binding — generic mood imagery
}

/**
 * Sort images: primary > narrative truth > exact-bound > derived-bound >
 * heuristic-bound > partial > unbound > recency.
 *
 * Narrative truth is ranked BEFORE visual binding because a narratively
 * accurate image with weaker binding is more useful than a beautiful
 * but misleading one.
 */
function sortWithBindingPreference(images: ProjectImage[]): ProjectImage[] {
  return [...images].sort((a, b) => {
    const pa = a.is_primary ? 0 : 1;
    const pb = b.is_primary ? 0 : 1;
    if (pa !== pb) return pa - pb;
    // Narrative truth — prefer images bound to actual story entities
    const na = getNarrativeTruthRank(a);
    const nb = getNarrativeTruthRank(b);
    if (na !== nb) return na - nb;
    const ba = getBindingRank(a);
    const bb = getBindingRank(b);
    if (ba !== bb) return ba - bb;
    const ta = getTargetingRank(a);
    const tb = getTargetingRank(b);
    if (ta !== tb) return ta - tb;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}

/**
 * CVBE Phase 2+3 — Canonical exclusion gate.
 */
function applyCanonicalExclusionGate(images: ProjectImage[]): ProjectImage[] {
  if (images.length <= 1) return images;
  const hasBound = images.some(i => getBindingRank(i) === 0);
  const hasPartial = images.some(i => getBindingRank(i) === 1);
  let filtered = images;
  if (hasBound || hasPartial) {
    const withoutUnbound = images.filter(i => getBindingRank(i) <= 1);
    if (withoutUnbound.length > 0) filtered = withoutUnbound;
  }
  const hasExact = filtered.some(i => getBindingRank(i) === 0 && getTargetingRank(i) === 0);
  if (hasExact) {
    const exactOrDerived = filtered.filter(i => getTargetingRank(i) <= 1);
    if (exactOrDerived.length > 0) filtered = exactOrDerived;
  }
  return filtered;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hydrateSignedUrls(images: ProjectImage[]): Promise<void> {
  const bucketGroups = new Map<string, ProjectImage[]>();
  for (const img of images) {
    const bucket = img.storage_bucket || 'project-posters';
    if (!bucketGroups.has(bucket)) bucketGroups.set(bucket, []);
    bucketGroups.get(bucket)!.push(img);
  }
  await Promise.all(
    Array.from(bucketGroups.entries()).map(async ([bucket, imgs]) => {
      await Promise.all(
        imgs.map(async (img) => {
          try {
            const { data: signed } = await supabase.storage
              .from(bucket)
              .createSignedUrl(img.storage_path, 3600);
            img.signedUrl = signed?.signedUrl || undefined;
          } catch {
            img.signedUrl = undefined;
          }
        }),
      );
    }),
  );
}

function buildProvenance(img: ProjectImage, isVDStrict: boolean, projectFormat: string, projectLane: string): ResolvedImageProvenance {
  const isPrimary = !!(img as any).is_primary;
  const curationState = (img as any).curation_state || 'unknown';
  const source: ResolvedImageProvenance['source'] =
    isPrimary && curationState === 'active' ? 'winner_primary'
    : curationState === 'active' ? 'active_non_primary'
    : curationState === 'candidate' ? 'candidate_fallback'
    : 'unresolved';

  let complianceClass = 'n/a';
  if (isVDStrict) {
    const result = classifyVerticalCompliance(
      { width: img.width, height: img.height, shot_type: img.shot_type },
      img.shot_type || '',
      projectFormat,
      projectLane,
    );
    complianceClass = result.level;
  }

  return {
    imageId: img.id,
    source,
    complianceClass,
    actualWidth: img.width || null,
    actualHeight: img.height || null,
    isPrimary,
    curationState,
  };
}

/**
 * Fetch section images.
 *
 * strictDeckMode=true (vertical-drama final deck):
 *   - ONLY active + is_primary images
 *   - NO candidate fallback
 *   - NO role/asset_group-only fallback
 *   - Unresolved slots stay empty
 *
 * strictDeckMode=false (workspace, non-VD decks):
 *   - Full fallback chain as before
 */
/**
 * Resolve composite section by merging governed images from upstream sections.
 * Used for poster_directions which assembles from hero_frames, world_locations, etc.
 * Each upstream section's images are fetched independently with their own governance,
 * then de-duplicated and merged.
 */
async function resolveCompositeSection(
  projectId: string,
  sectionKey: CanonicalSectionKey,
  upstreamSections: string[],
  limit: number,
  strictDeckMode: boolean,
  projectFormat: string,
  projectLane: string,
): Promise<SectionImageResult> {
  const allImages: ProjectImage[] = [];
  const seenIds = new Set<string>();
  const upstreamContributions: Record<string, number> = {};

  // Fetch each upstream section with its own canonical governance
  for (const upKey of upstreamSections) {
    const upResult = await fetchSectionImagesDirect(
      projectId,
      upKey as CanonicalSectionKey,
      null,
      Math.ceil(limit / upstreamSections.length) + 2,
      strictDeckMode,
      projectFormat,
      projectLane,
    );
    let contributed = 0;
    for (const img of upResult.images) {
      if (!seenIds.has(img.id)) {
        seenIds.add(img.id);
        allImages.push(img);
        contributed++;
      }
    }
    upstreamContributions[upKey] = contributed;
  }

  // Apply composite section's own governance as a second pass
  const { governed } = filterForDisplay(allImages as any, sectionKey);
  let finalImages = (governed as unknown as ProjectImage[]).slice(0, limit);

  // ── HERO ANCHOR CONTRACT: explicit injection, not sort-based ──
  const anchor = await getHeroAnchor(projectId);
  if (anchor) {
    finalImages = injectHeroAnchor(anchor, finalImages) as ProjectImage[];
    finalImages = finalImages.slice(0, limit);
  }

  console.log('[HERO_ANCHOR_CONTRACT]', {
    projectId,
    section: sectionKey,
    hasAnchor: !!anchor,
    anchorId: anchor?.id || null,
  });

  await hydrateSignedUrls(finalImages);

  const provenance = finalImages.map(img => buildProvenance(img, strictDeckMode, projectFormat, projectLane));

  console.log(`[LookBook:resolveComposite] ${sectionKey}: ${finalImages.length} images from upstream`, upstreamContributions);

  return {
    sectionKey,
    images: finalImages,
    imageIds: finalImages.map(i => i.id),
    provenance,
    unresolvedCount: finalImages.length === 0 ? 1 : 0,
    hasHeroAnchor: !!anchor,
    heroAnchorId: anchor?.id || null,
    heroAnchorInjected: !!anchor,
  };
}

async function fetchSectionImagesDirect(
  projectId: string,
  sectionKey: CanonicalSectionKey,
  laneKey: string | null = null,
  limit = 12,
  strictDeckMode = false,
  projectFormat = '',
  projectLane = '',
): Promise<SectionImageResult> {
  // Character identity needs a higher limit to ensure all characters are represented
  const effectiveLimit = sectionKey === 'character_identity' ? Math.max(limit, 40) : limit;
  const filter = buildCanonicalSectionFilter(sectionKey);
  const isVDStrict = strictDeckMode;

  // ── Primary query: active curation_state ──
  let q = (supabase as any)
    .from('project_images')
    .select('*')
    .eq('project_id', projectId)
    .eq('curation_state', 'active');

  q = applyCanonicalSectionFilter(q, filter);
  q = q
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(effectiveLimit);

  const { data: rows, error } = await q;
  if (error) {
    console.warn(`[LookBook:resolveCanonImages] ${sectionKey} query error:`, error.message);
  }

  let images = (rows || []) as ProjectImage[];

  // ── GOVERNANCE DISPLAY FILTER (premium + identity) ──
  {
    const { governed } = filterForDisplay(images as any, sectionKey);
    images = governed as unknown as ProjectImage[];
  }

  // ── STRICT DECK MODE: ALL active images (not just primaries) ──
  // Previous behavior filtered to is_primary only, starving pools.
  // Now we return all active images and let the scoring layer in
  // generateLookBookData elect winners based on merit.
  if (strictDeckMode) {
    // For VD, filter to compliant images only
    if (isVDStrict && images.length > 0) {
      const compliant = images.filter(img => {
        const result = classifyVerticalCompliance(
          { width: img.width, height: img.height, shot_type: img.shot_type },
          img.shot_type || '',
          projectFormat,
          projectLane,
        );
        return result.eligibleForWinnerSelection;
      });
      // Only restrict if we have compliant images; otherwise keep all active
      if (compliant.length > 0) images = compliant;
    }

    // If shot_type filter yielded 0 results, retry WITHOUT shot_type filter
    // This prevents sections like key_moments from starving due to strict shot_type matching
    if (images.length === 0 && filter.shotTypes?.length) {
      let relaxedQ = (supabase as any)
        .from('project_images')
        .select('*')
        .eq('project_id', projectId)
        .eq('curation_state', 'active');
      relaxedQ = applyCanonicalSectionFilter(relaxedQ, filter, { includeShotTypes: false });
      relaxedQ = relaxedQ
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(effectiveLimit);
      const { data: relaxedRows } = await relaxedQ;
      if (relaxedRows?.length) {
        console.log(`[LookBook:resolveCanonImages:STRICT] ${sectionKey}: shot_type filter relaxed, recovered ${relaxedRows.length} images`);
        images = relaxedRows as ProjectImage[];
      }
    }

    // Candidate augmentation: even in strict mode, add candidates to expand pool
    // They participate in scoring but don't auto-promote to canon
    if (images.length < 4) {
      let cq = (supabase as any)
        .from('project_images')
        .select('*')
        .eq('project_id', projectId)
        .eq('curation_state', 'candidate');
      cq = applyCanonicalSectionFilter(cq, filter);
      cq = cq.order('created_at', { ascending: false }).limit(effectiveLimit);
      const { data: candidateRows } = await cq;
      if (candidateRows?.length) {
        const existingIds = new Set(images.map(i => i.id));
        const newCandidates = (candidateRows as ProjectImage[]).filter(i => !existingIds.has(i.id));
        if (newCandidates.length > 0) {
          console.log(`[LookBook:resolveCanonImages:STRICT] ${sectionKey}: augmented with ${newCandidates.length} candidates (pool was ${images.length})`);
          images = [...images, ...newCandidates];
        }
      }
    }

    // NO fallback chain in strict mode (but we now have richer pools)
    images = applyCanonicalExclusionGate(images);
    images = sortWithBindingPreference(images);
    const provenance = images.map(img => buildProvenance(img, isVDStrict, projectFormat, projectLane));
    await hydrateSignedUrls(images);

    console.log(`[LookBook:resolveCanonImages:STRICT] ${sectionKey}: ${images.length} images resolved (active + candidate augmentation)`);

    return {
      sectionKey,
      images,
      imageIds: images.map(i => i.id),
      provenance,
      unresolvedCount: images.length === 0 ? 1 : 0,
      hasHeroAnchor: false,
      heroAnchorId: null,
      heroAnchorInjected: false,
    };
  }

  // ── NON-STRICT MODE: full fallback chain (workspace, non-VD decks) ──
  
  // Fallback 1: fallback_roles with active curation
  if (images.length === 0 && filter.fallbackRoles?.length && filter.strategyKeys.length > 0) {
    let fallbackQ = (supabase as any)
      .from('project_images')
      .select('*')
      .eq('project_id', projectId)
      .eq('curation_state', 'active')
      .in('role', filter.fallbackRoles);
    if (filter.allowedGenerationPurposes?.length) {
      fallbackQ = fallbackQ.in('generation_purpose', filter.allowedGenerationPurposes);
    }
    const { data: fallbackRows } = await fallbackQ
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    images = (fallbackRows || []) as ProjectImage[];
  }

  // Fallback 2: active asset_group without strategy_key filter
  if (images.length === 0 && filter.assetGroups.length > 0) {
    let aq = (supabase as any)
      .from('project_images')
      .select('*')
      .eq('project_id', projectId)
      .eq('curation_state', 'active')
      .in('asset_group', filter.assetGroups);
    if (filter.shotTypes?.length) {
      aq = aq.in('shot_type', filter.shotTypes);
    }
    if (filter.allowedGenerationPurposes?.length) {
      aq = aq.in('generation_purpose', filter.allowedGenerationPurposes);
    }
    aq = aq
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    const { data: assetRows } = await aq;
    if (assetRows?.length) {
      images = assetRows as ProjectImage[];
    }
  }

  // Fallback 3: candidate images — augment when pool is thin (not just empty)
  // This ensures newly generated candidates enter contention alongside active images
  if (images.length < 6) {
    let cq = (supabase as any)
      .from('project_images')
      .select('*')
      .eq('project_id', projectId)
      .eq('curation_state', 'candidate');
    cq = applyCanonicalSectionFilter(cq, filter);
    cq = cq
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    const { data: candidateRows } = await cq;
    if (candidateRows?.length) {
      const existingIds = new Set(images.map(i => i.id));
      const newCandidates = (candidateRows as ProjectImage[]).filter(i => !existingIds.has(i.id));
      if (newCandidates.length > 0) {
        const mode = images.length === 0 ? 'primary source' : 'augmenting';
        console.log(`[LookBook:resolveCanonImages] ${sectionKey}: ${mode} with ${newCandidates.length} candidates (active pool was ${images.length})`);
        images = [...images, ...newCandidates];
      }
    }
  }

  // ── Binding/sorting ──
  images = applyCanonicalExclusionGate(images);
  images = sortWithBindingPreference(images);

  await hydrateSignedUrls(images);

  const provenance = images.map(img => buildProvenance(img, false, projectFormat, projectLane));

  console.log(`[LookBook:resolveCanonImages] ${sectionKey}: resolved ${images.length} images (lane=${laneKey || 'none'})`);

  return {
    sectionKey,
    images,
    imageIds: images.map(i => i.id),
    provenance,
    unresolvedCount: images.length === 0 ? 1 : 0,
    hasHeroAnchor: false,
    heroAnchorId: null,
    heroAnchorInjected: false,
  };
}

/**
 * fetchSectionImages — Router that dispatches to composite or direct resolution.
 * Composite sections (like poster_directions) merge from upstream governed sections.
 * Direct sections query project_images with canonical filters.
 */
async function fetchSectionImages(
  projectId: string,
  sectionKey: CanonicalSectionKey,
  laneKey: string | null = null,
  limit = 12,
  strictDeckMode = false,
  projectFormat = '',
  projectLane = '',
): Promise<SectionImageResult> {
  const spec = SECTION_QUERY_MAP[sectionKey];
  if (spec.composite_upstream_sections?.length) {
    return resolveCompositeSection(
      projectId,
      sectionKey,
      spec.composite_upstream_sections,
      limit,
      strictDeckMode,
      projectFormat,
      projectLane,
    );
  }
  return fetchSectionImagesDirect(projectId, sectionKey, laneKey, limit, strictDeckMode, projectFormat, projectLane);
}

export interface ResolvedCanonImages {
  character_identity: SectionImageResult;
  world_locations: SectionImageResult;
  atmosphere_lighting: SectionImageResult;
  texture_detail: SectionImageResult;
  symbolic_motifs: SectionImageResult;
  key_moments: SectionImageResult;
  hero_frames: SectionImageResult;
  poster_directions: SectionImageResult;
  _diagnostics?: ResolutionDiagnostics;
}

/**
 * Resolves all canonical lookbook section images in parallel.
 *
 * @param strictDeckMode — When true (vertical-drama final deck), resolves
 *   ONLY active primary compliant winners. No candidate/fallback leakage.
 */
export async function resolveAllCanonImages(
  projectId: string,
  laneKey: string | null = null,
  strictDeckMode = false,
  projectFormat = '',
  projectLane = '',
): Promise<ResolvedCanonImages> {
  const sections: CanonicalSectionKey[] = [
    'character_identity',
    'world_locations',
    'atmosphere_lighting',
    'texture_detail',
    'symbolic_motifs',
    'key_moments',
    'hero_frames',
    'poster_directions',
  ];

  const results = await Promise.all(
    sections.map(key => fetchSectionImages(projectId, key, laneKey, 12, strictDeckMode, projectFormat, projectLane)),
  );

  // ── HERO ANCHOR CONTRACT: explicit injection into hero_frames result ──
  const anchor = await getHeroAnchor(projectId);

  const map: Record<string, SectionImageResult> = {};
  let totalUnresolved = 0;
  for (const r of results) {
    // Inject hero anchor explicitly into hero_frames section
    if (r.sectionKey === 'hero_frames' && anchor) {
      r.images = injectHeroAnchor(anchor, r.images) as ProjectImage[];
      r.imageIds = r.images.map(i => i.id);
      r.provenance = r.images.map(img => buildProvenance(img, strictDeckMode, projectFormat, projectLane));
      r.hasHeroAnchor = true;
      r.heroAnchorId = anchor.id;
      r.heroAnchorInjected = true;
    }
    map[r.sectionKey] = r;
    totalUnresolved += r.unresolvedCount;
  }

  console.log('[HERO_ANCHOR_CONTRACT]', {
    projectId,
    section: 'resolveAllCanonImages',
    hasAnchor: !!anchor,
    anchorId: anchor?.id || null,
  });

  const mode = strictDeckMode ? 'STRICT' : 'standard';
  console.log(`[LookBook:resolveCanonImages] summary (mode=${mode}, lane=${laneKey || 'generic'}):`,
    Object.entries(map).map(([k, v]) => `${k}=${v.images.length}`).join(', '),
    strictDeckMode ? `| unresolved=${totalUnresolved}` : '',
  );

  // Build diagnostics
  const allResolvedIds = results.flatMap(r => r.imageIds);
  const totalResolved = allResolvedIds.length;

  const result = map as unknown as ResolvedCanonImages;
  result._diagnostics = {
    totalActivePool: totalResolved, // all come from active query
    totalCandidatePool: 0, // candidates only used as fallback
    totalResolved,
    sectionsWithZeroActive: results.filter(r => r.images.length === 0).map(r => r.sectionKey),
    resolvedImageIds: allResolvedIds,
  };

  console.log(`[LookBook:resolveCanonImages] diagnostics:`, result._diagnostics);

  return result;
}
