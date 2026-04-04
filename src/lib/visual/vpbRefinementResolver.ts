/**
 * vpbRefinementResolver.ts — Deterministic resolver for VPB section coverage.
 *
 * Inspects VPB markdown content for canonical section headings and derives
 * coverage status per refinement area. Pure function, no DB, no LLM.
 */

/**
 * Canonical ordered list of ALL VPB top-level headings.
 * Single source of truth for section ordering across the entire VPB.
 * REFINEMENT_TO_SECTION is a subset view of this registry.
 */
export const VPB_CANONICAL_HEADINGS: readonly string[] = [
  '# Visual Thesis',
  '# World & Design Language',
  '# Character Visual System',
  '# Location & Production Design',
  '# Visual Cohesion & Recurrence',
  '# References & Direction',
  '# Asset Appendix',
] as const;

export type RefinementStatus = 'present' | 'thin' | 'missing';

export interface RefinementAreaState {
  key: string;
  label: string;
  description: string;
  status: RefinementStatus;
  /** Heading found in VPB markdown */
  sectionHeading: string;
  /** Approximate content length (chars) for the section */
  contentLength: number;
  /** Deterministic reason for the status */
  reason: string;
  /** Short excerpt from actual VPB content (first meaningful lines), null if missing */
  excerpt: string | null;
}

/**
 * Mapping from refinement area keys to VPB markdown section headings.
 * These headings are the canonical output of visualProjectBibleCore.ts.
 */
const REFINEMENT_TO_SECTION: Record<string, { heading: string; label: string; description: string }> = {
  visual_tone: {
    heading: '# Visual Thesis',
    label: 'Visual Tone',
    description: 'Palette, mood, and overall visual identity specificity',
  },
  world_visual_language: {
    heading: '# World & Design Language',
    label: 'World Visual Language',
    description: 'Environmental identity rules and recurring aesthetic logic',
  },
  motif_consistency: {
    heading: '# Visual Cohesion & Recurrence',
    label: 'Motif System',
    description: 'Motif integration and symbolic image consistency',
  },
  reference_frames: {
    heading: '# References & Direction',
    label: 'Reference Frames',
    description: 'Curated visual references for coherence and direction',
  },
};

/** Minimum chars for a section to be considered non-thin. */
const THIN_THRESHOLD = 120;
/** Max excerpt length in characters. */
const EXCERPT_MAX_CHARS = 180;

/**
 * Extract content between two top-level headings (or heading to end).
 */
function extractSectionContent(markdown: string, heading: string): string | null {
  const idx = markdown.indexOf(heading);
  if (idx === -1) return null;
  const afterHeading = markdown.slice(idx + heading.length);
  const nextH1 = afterHeading.search(/\n# [A-Z]/);
  const sectionText = nextH1 === -1 ? afterHeading : afterHeading.slice(0, nextH1);
  return sectionText.trim();
}

/**
 * Extract a short deterministic excerpt from section content.
 * Strips markdown headings/formatting noise, takes first meaningful lines.
 */
function extractExcerpt(content: string): string {
  const lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  let excerpt = '';
  for (const line of lines) {
    if (excerpt.length >= EXCERPT_MAX_CHARS) break;
    const cleaned = line
      .replace(/^\*\*(.+?)\*\*/, '$1')  // strip leading bold
      .replace(/^[-*]\s*/, '');           // strip list markers
    excerpt += (excerpt ? ' ' : '') + cleaned;
  }

  if (excerpt.length > EXCERPT_MAX_CHARS) {
    excerpt = excerpt.slice(0, EXCERPT_MAX_CHARS - 1).trimEnd() + '…';
  }
  return excerpt;
}

/**
 * getVPBRefinementState — Deterministic resolver for refinement area coverage.
 */
export function getVPBRefinementState(vpbMarkdown: string | null): RefinementAreaState[] {
  return Object.entries(REFINEMENT_TO_SECTION).map(([key, { heading, label, description }]) => {
    if (!vpbMarkdown) {
      return {
        key, label, description, sectionHeading: heading,
        status: 'missing' as const, contentLength: 0,
        reason: 'VPB content not loaded — select the Visual Project Bible document',
        excerpt: null,
      };
    }
    const content = extractSectionContent(vpbMarkdown, heading);
    if (content === null) {
      return {
        key, label, description, sectionHeading: heading,
        status: 'missing' as const, contentLength: 0,
        reason: `Expected heading "${heading}" not found in VPB`,
        excerpt: null,
      };
    }
    const len = content.length;
    if (len < THIN_THRESHOLD) {
      return {
        key, label, description, sectionHeading: heading,
        status: 'thin' as const, contentLength: len,
        reason: `Section found but content is below density threshold (${len}/${THIN_THRESHOLD} chars)`,
        excerpt: extractExcerpt(content),
      };
    }
    return {
      key, label, description, sectionHeading: heading,
      status: 'present' as const, contentLength: len,
      reason: `${len} chars of structured content`,
      excerpt: extractExcerpt(content),
    };
  });
}

export const REFINEMENT_AREA_KEYS = Object.keys(REFINEMENT_TO_SECTION);

/** Canonical business order for priority sorting within status groups. */
const CANONICAL_ORDER: string[] = ['visual_tone', 'world_visual_language', 'reference_frames', 'motif_consistency'];

export interface VPBRefinementSummary {
  presentCount: number;
  thinCount: number;
  missingCount: number;
  /** Areas needing attention: missing first, then thin, in canonical business order within each group. */
  priorityAreas: RefinementAreaState[];
  /** True when all areas are present. */
  allPresent: boolean;
}

/**
 * Derive an at-a-glance summary from existing refinement area states.
 * Deterministic: missing → thin → present, canonical order within each group.
 */
export function getVPBRefinementSummary(areas: RefinementAreaState[]): VPBRefinementSummary {
  const presentCount = areas.filter(a => a.status === 'present').length;
  const thinCount = areas.filter(a => a.status === 'thin').length;
  const missingCount = areas.filter(a => a.status === 'missing').length;

  const statusPriority: Record<RefinementStatus, number> = { missing: 0, thin: 1, present: 2 };

  const priorityAreas = [...areas]
    .filter(a => a.status !== 'present')
    .sort((a, b) => {
      const sp = statusPriority[a.status] - statusPriority[b.status];
      if (sp !== 0) return sp;
      return CANONICAL_ORDER.indexOf(a.key) - CANONICAL_ORDER.indexOf(b.key);
    });

  return { presentCount, thinCount, missingCount, priorityAreas, allPresent: presentCount === areas.length };
}

/**
 * Derive a deterministic anchor slug from a VPB section heading.
 * e.g. "# Visual Thesis" → "visual-thesis"
 */
export function getVPBSectionAnchor(heading: string): string {
  return heading
    .replace(/^#+\s*/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Canonical section navigation target for a refinement area.
 * Used by the UI to drive truthful, status-aware navigation.
 */
export interface SectionNavTarget {
  heading: string;
  anchor: string;
  navigable: boolean;
  actionLabel: string;
  actionTitle: string;
}

/**
 * Derive a canonical navigation target from a RefinementAreaState.
 * Single source of truth for section-targeted navigation identity and UX copy.
 */
export function getSectionNavTarget(area: RefinementAreaState): SectionNavTarget {
  const anchor = getVPBSectionAnchor(area.sectionHeading);
  if (area.status === 'missing') {
    return {
      heading: area.sectionHeading,
      anchor,
      navigable: false,
      actionLabel: 'Section missing',
      actionTitle: `Expected section "${area.sectionHeading}" not found in current VPB`,
    };
  }
  return {
    heading: area.sectionHeading,
    anchor,
    navigable: true,
    actionLabel: 'Go to section',
    actionTitle: `Go to ${area.sectionHeading}`,
  };
}

/**
 * Scroll a textarea to the line containing a heading string.
 * Returns true if the heading was found and scrolled to, false otherwise.
 */
/**
 * Structured refinement intent — scoped to one section.
 * No mutation, no generation. Future hook for patch-based rewrite pipeline.
 */
export interface RefinementIntent {
  docType: 'visual_project_bible';
  sectionHeading: string;
  sectionKey: string;
  sectionAnchor: string;
  action: 'create' | 'refine';
  currentStatus: 'missing' | 'thin';
}

/**
 * Build a deterministic RefinementIntent from a refinement area.
 * Returns null for 'present' areas (no action needed).
 */
export function buildRefinementIntent(area: RefinementAreaState): RefinementIntent | null {
  if (area.status === 'present') return null;
  return {
    docType: 'visual_project_bible',
    sectionHeading: area.sectionHeading,
    sectionKey: area.key,
    sectionAnchor: getVPBSectionAnchor(area.sectionHeading),
    action: area.status === 'missing' ? 'create' : 'refine',
    currentStatus: area.status,
  };
}

/**
 * Deterministic session brief for one active refinement target.
 * Assembled from intent + matching resolver area. No mutation, no generation.
 */
export interface RefinementSessionBrief {
  /** Section identity */
  sectionKey: string;
  sectionLabel: string;
  sectionHeading: string;
  sectionAnchor: string;
  /** Action and status */
  action: 'create' | 'refine';
  currentStatus: 'missing' | 'thin';
  /** Evidence from resolver */
  reason: string;
  excerpt: string | null;
  contentLength: number;
  /** Grounding */
  docType: 'visual_project_bible';
}

/**
 * Build a deterministic session brief by resolving an intent against area states.
 * Fails closed: returns null if the target area cannot be found.
 */
export function buildRefinementSessionBrief(
  intent: RefinementIntent,
  areas: RefinementAreaState[],
): RefinementSessionBrief | null {
  const area = areas.find(a => a.key === intent.sectionKey);
  if (!area) return null;
  return {
    sectionKey: intent.sectionKey,
    sectionLabel: area.label,
    sectionHeading: intent.sectionHeading,
    sectionAnchor: intent.sectionAnchor,
    action: intent.action,
    currentStatus: intent.currentStatus,
    reason: area.reason,
    excerpt: area.excerpt,
    contentLength: area.contentLength,
    docType: intent.docType,
  };
}

/**
 * Extract neighboring H1 headings around a target heading in VPB markdown.
 * Returns { prevHeading, nextHeading } or null values if at boundary.
 */
export function extractNeighboringHeadings(
  markdown: string,
  targetHeading: string,
): { prevHeading: string | null; nextHeading: string | null } {
  const h1Pattern = /^# [A-Z].+$/gm;
  const headings: { text: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = h1Pattern.exec(markdown)) !== null) {
    headings.push({ text: match[0], index: match.index });
  }
  const targetIdx = headings.findIndex(h => h.text === targetHeading);
  if (targetIdx === -1) return { prevHeading: null, nextHeading: null };
  return {
    prevHeading: targetIdx > 0 ? headings[targetIdx - 1].text : null,
    nextHeading: targetIdx < headings.length - 1 ? headings[targetIdx + 1].text : null,
  };
}

/**
 * Deterministic handoff payload for one active refinement session.
 * Packages exact target section + local context for a future rewrite layer.
 * No mutation, no generation — structured export only.
 */
export interface RefinementHandoffPayload {
  docType: 'visual_project_bible';
  sectionKey: string;
  sectionLabel: string;
  sectionHeading: string;
  sectionAnchor: string;
  action: 'create' | 'refine';
  currentStatus: 'missing' | 'thin';
  reason: string;
  excerpt: string | null;
  contentLength: number;
  scopeRule: 'one-section-only';
  noMutationYet: true;
  /** Raw markdown content of the target section, null if missing */
  targetSectionBody: string | null;
  /** Previous H1 heading in VPB, null if first */
  prevHeading: string | null;
  /** Next H1 heading in VPB, null if last */
  nextHeading: string | null;
}

/**
 * Build a deterministic handoff payload from an active session brief + VPB markdown.
 * Fails closed: returns null if brief or markdown cannot be resolved.
 */
export function buildRefinementHandoffPayload(
  brief: RefinementSessionBrief,
  vpbMarkdown: string | null,
): RefinementHandoffPayload | null {
  if (!vpbMarkdown && brief.currentStatus !== 'missing') return null;

  const targetSectionBody = vpbMarkdown
    ? extractSectionContent(vpbMarkdown, brief.sectionHeading)
    : null;

  let prevHeading: string | null = null;
  let nextHeading: string | null = null;

  if (vpbMarkdown) {
    if (brief.currentStatus === 'missing') {
      // Target heading doesn't exist — derive expected neighbors from existing headings
      const derived = deriveExpectedNeighbors(vpbMarkdown, brief.sectionHeading);
      prevHeading = derived.prevHeading;
      nextHeading = derived.nextHeading;
    } else {
      const neighbors = extractNeighboringHeadings(vpbMarkdown, brief.sectionHeading);
      prevHeading = neighbors.prevHeading;
      nextHeading = neighbors.nextHeading;
    }
  }

  return {
    docType: brief.docType,
    sectionKey: brief.sectionKey,
    sectionLabel: brief.sectionLabel,
    sectionHeading: brief.sectionHeading,
    sectionAnchor: brief.sectionAnchor,
    action: brief.action,
    currentStatus: brief.currentStatus,
    reason: brief.reason,
    excerpt: brief.excerpt,
    contentLength: brief.contentLength,
    scopeRule: 'one-section-only',
    noMutationYet: true,
    targetSectionBody,
    prevHeading,
    nextHeading,
  };
}

/**
 * Derive expected neighboring headings for a missing section.
 * Uses VPB_CANONICAL_HEADINGS (full registry) to determine canonical order,
 * then scans the document for the closest existing headings before/after.
 */
function deriveExpectedNeighbors(
  markdown: string,
  targetHeading: string,
): { prevHeading: string | null; nextHeading: string | null } {
  const targetCanonIdx = VPB_CANONICAL_HEADINGS.indexOf(targetHeading);

  // Parse ALL existing H1 headings from document
  const h1Pattern = /^# [A-Z].+$/gm;
  const existingHeadings: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = h1Pattern.exec(markdown)) !== null) {
    existingHeadings.push(match[0]);
  }

  let prevHeading: string | null = null;
  let nextHeading: string | null = null;

  if (targetCanonIdx !== -1) {
    // Walk backward through full canonical order to find closest existing prev
    for (let i = targetCanonIdx - 1; i >= 0; i--) {
      if (existingHeadings.includes(VPB_CANONICAL_HEADINGS[i])) {
        prevHeading = VPB_CANONICAL_HEADINGS[i];
        break;
      }
    }
    // Walk forward through full canonical order to find closest existing next
    for (let i = targetCanonIdx + 1; i < VPB_CANONICAL_HEADINGS.length; i++) {
      if (existingHeadings.includes(VPB_CANONICAL_HEADINGS[i])) {
        nextHeading = VPB_CANONICAL_HEADINGS[i];
        break;
      }
    }
  }

  return { prevHeading, nextHeading };
}

/**
 * Deterministic rewrite contract for one active refinement session.
 * Defines guardrails a future rewrite/generation worker MUST obey.
 * No mutation, no generation — contract only.
 */
export interface RewriteContract {
  docType: 'visual_project_bible';
  sectionKey: string;
  sectionLabel: string;
  sectionHeading: string;
  sectionAnchor: string;
  action: 'create' | 'refine';
  currentStatus: 'missing' | 'thin';
  scopeRule: 'one-section-only';
  allowedTargetHeading: string;
  /** Neighboring H1 heading before target, null if first. Used for create insertion. */
  prevHeading: string | null;
  /** Neighboring H1 heading after target, null if last. Used for create insertion. */
  nextHeading: string | null;
  forbiddenMutations: string[];
  requiredPreservation: string[];
  expectedReturnShape: {
    sectionHeading: string;
    sectionAnchor: string;
    action: 'create' | 'refine';
    replacementSectionMarkdown: string;
  };
  validationRules: string[];
  noMutationYet: true;
}

/** Canonical forbidden mutations for any VPB section rewrite. */
const FORBIDDEN_MUTATIONS: string[] = [
  'Must not change any non-target VPB section heading',
  'Must not reorder top-level VPB sections',
  'Must not delete existing non-target sections',
  'Must not change ladder or project state',
  'Must not mutate document content outside the target section',
  'Must not invent new top-level scope beyond the targeted section',
];

/**
 * Build deterministic required preservation rules from a handoff payload.
 */
function buildPreservationRules(handoff: RefinementHandoffPayload): string[] {
  const rules: string[] = [
    'Preserve all non-target top-level headings',
    'Preserve existing VPB structure outside target section',
    `Preserve section identity: heading="${handoff.sectionHeading}", anchor="${handoff.sectionAnchor}", key="${handoff.sectionKey}"`,
  ];
  if (handoff.prevHeading) rules.push(`Preserve neighboring heading context: prev="${handoff.prevHeading}"`);
  if (handoff.nextHeading) rules.push(`Preserve neighboring heading context: next="${handoff.nextHeading}"`);
  return rules;
}

/**
 * Build deterministic validation rules for the expected rewrite output.
 */
function buildValidationRules(action: 'create' | 'refine', heading: string): string[] {
  const rules: string[] = [
    `Returned heading must equal "${heading}"`,
    'Output must contain exactly one top-level section',
    'Output must not contain any unrelated top-level headings',
  ];
  if (action === 'refine') {
    rules.push('Output must not be empty');
  }
  if (action === 'create') {
    rules.push(`Output must introduce the expected target heading "${heading}" only`);
  }
  return rules;
}

/**
 * Build a deterministic rewrite contract from an active handoff payload.
 * Fails closed: returns null if handoff is null.
 */
export function buildRewriteContract(handoff: RefinementHandoffPayload | null): RewriteContract | null {
  if (!handoff) return null;
  return {
    docType: handoff.docType,
    sectionKey: handoff.sectionKey,
    sectionLabel: handoff.sectionLabel,
    sectionHeading: handoff.sectionHeading,
    sectionAnchor: handoff.sectionAnchor,
    action: handoff.action,
    currentStatus: handoff.currentStatus,
    scopeRule: 'one-section-only',
    allowedTargetHeading: handoff.sectionHeading,
    prevHeading: handoff.prevHeading,
    nextHeading: handoff.nextHeading,
    forbiddenMutations: FORBIDDEN_MUTATIONS,
    requiredPreservation: buildPreservationRules(handoff),
    expectedReturnShape: {
      sectionHeading: handoff.sectionHeading,
      sectionAnchor: handoff.sectionAnchor,
      action: handoff.action,
      replacementSectionMarkdown: '',
    },
    validationRules: buildValidationRules(handoff.action, handoff.sectionHeading),
    noMutationYet: true,
  };
}

/**
 * Deterministic validation result for a rewrite candidate.
 */
export interface RewriteCandidateValidation {
  passed: boolean;
  errors: string[];
  warnings: string[];
  normalizedHeading: string | null;
  detectedTopLevelHeadings: string[];
}

/**
 * Validate a candidate replacementSectionMarkdown against a RewriteContract.
 * Pure deterministic pass/fail — no AI, no fuzzy matching, no mutation.
 * Fails closed on invalid inputs.
 */
export function validateRewriteCandidate(
  contract: RewriteContract | null,
  candidate: string | null | undefined,
): RewriteCandidateValidation {
  const fail = (errors: string[]): RewriteCandidateValidation => ({
    passed: false, errors, warnings: [], normalizedHeading: null, detectedTopLevelHeadings: [],
  });

  if (!contract) return fail(['Contract is null or invalid']);

  const normalized = (candidate ?? '').replace(/\r\n/g, '\n').trim();

  // A. Non-empty check
  if (!normalized) {
    return fail([
      contract.action === 'refine'
        ? 'Refine candidate must not be empty'
        : 'Create candidate must contain usable section content',
    ]);
  }

  // Detect all top-level H1 headings
  const h1Pattern = /^# .+$/gm;
  const detectedTopLevelHeadings: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = h1Pattern.exec(normalized)) !== null) {
    detectedTopLevelHeadings.push(m[0]);
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // B. Heading identity — first H1 must equal allowedTargetHeading
  const firstH1 = detectedTopLevelHeadings[0] ?? null;
  const normalizedTarget = contract.allowedTargetHeading.trim();
  const normalizedFirst = firstH1?.replace(/\s+/g, ' ').trim() ?? null;

  if (!normalizedFirst) {
    errors.push(`Candidate missing required top-level heading "${normalizedTarget}"`);
  } else if (normalizedFirst !== normalizedTarget) {
    errors.push(`First heading "${normalizedFirst}" does not match allowed target "${normalizedTarget}"`);
  }

  // C. One-section-only rule
  if (detectedTopLevelHeadings.length > 1) {
    errors.push(`Candidate contains ${detectedTopLevelHeadings.length} top-level headings; exactly 1 allowed`);
  }

  // D. Scope protection — no forbidden non-target headings
  const forbiddenHeadings = detectedTopLevelHeadings.filter(
    h => h.replace(/\s+/g, ' ').trim() !== normalizedTarget,
  );
  if (forbiddenHeadings.length > 0) {
    errors.push(`Candidate contains forbidden non-target headings: ${forbiddenHeadings.join(', ')}`);
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    normalizedHeading: normalizedFirst,
    detectedTopLevelHeadings,
  };
}

/**
 * Result of a section patch application attempt.
 */
export interface PatchResult {
  passed: boolean;
  patchedMarkdown?: string;
  errors: string[];
}

/**
 * Parse all H1 headings with their positions from markdown.
 */
function parseH1Positions(markdown: string): { text: string; start: number; end: number }[] {
  const results: { text: string; start: number; end: number }[] = [];
  const pattern = /^# .+$/gm;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(markdown)) !== null) {
    results.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return results;
}

/**
 * Deterministic section patch engine.
 * Replaces or inserts exactly ONE section, gated by the rewrite candidate validator.
 * Does NOT persist — returns patched markdown only.
 */
export function applySectionPatch(
  originalMarkdown: string,
  contract: RewriteContract,
  candidate: string,
): PatchResult {
  const fail = (errors: string[]): PatchResult => ({ passed: false, errors });

  // PRE-CONDITION: validator gate
  const validation = validateRewriteCandidate(contract, candidate);
  if (!validation.passed) {
    return fail(['Candidate failed validation: ' + validation.errors.join('; ')]);
  }

  const normalizedCandidate = candidate.replace(/\r\n/g, '\n').trim();
  const headings = parseH1Positions(originalMarkdown);
  const targetHeading = contract.allowedTargetHeading.trim();

  if (contract.action === 'refine') {
    // CASE A — REFINE: target section must exist
    const targetMatches = headings.filter(h => h.text === targetHeading);
    if (targetMatches.length === 0) {
      return fail([`Target section "${targetHeading}" not found in document for refine`]);
    }
    if (targetMatches.length > 1) {
      return fail([`Multiple matches for "${targetHeading}" found — ambiguous, cannot patch`]);
    }

    const target = targetMatches[0];
    const targetIdx = headings.indexOf(target);
    const sectionStart = target.start;
    const sectionEnd = targetIdx < headings.length - 1
      ? headings[targetIdx + 1].start
      : originalMarkdown.length;

    // Replace section
    const before = originalMarkdown.slice(0, sectionStart);
    const after = originalMarkdown.slice(sectionEnd);
    const needsTrailingNewline = after.length > 0 && !normalizedCandidate.endsWith('\n');
    const patchedMarkdown = before + normalizedCandidate + (needsTrailingNewline ? '\n\n' : '') + after;

    // STRUCTURAL VALIDATION
    const structResult = validateStructure(originalMarkdown, patchedMarkdown, headings, targetHeading, 'refine');
    if (!structResult.passed) return fail(structResult.errors);

    return { passed: true, patchedMarkdown, errors: [] };

  } else {
    // CASE B — CREATE: target section must NOT exist
    const exists = headings.some(h => h.text === targetHeading);
    if (exists) {
      return fail([`Target section "${targetHeading}" already exists — use refine, not create`]);
    }

    // Determine insertion point from contract neighbor context (canonical source)
    let insertionIndex: number | null = null;

    if (contract.prevHeading) {
      // Insert after prevHeading's section
      const prevMatch = headings.find(h => h.text === contract.prevHeading);
      if (!prevMatch) {
        return fail([`Contract prevHeading "${contract.prevHeading}" not found in document — cannot determine insertion point`]);
      }
      const prevIdx = headings.indexOf(prevMatch);
      // Insert at start of next section, or end of document
      insertionIndex = prevIdx < headings.length - 1
        ? headings[prevIdx + 1].start
        : originalMarkdown.length;
    } else if (contract.nextHeading) {
      // Insert before nextHeading
      const nextMatch = headings.find(h => h.text === contract.nextHeading);
      if (!nextMatch) {
        return fail([`Contract nextHeading "${contract.nextHeading}" not found in document — cannot determine insertion point`]);
      }
      insertionIndex = nextMatch.start;
    } else {
      // No neighbor context — append to end (only valid fallback)
      insertionIndex = originalMarkdown.length;
    }

    const before = originalMarkdown.slice(0, insertionIndex);
    const after = originalMarkdown.slice(insertionIndex);
    const needsLeadingNewline = before.length > 0 && !before.endsWith('\n\n');
    const needsTrailingNewline = after.length > 0 && !normalizedCandidate.endsWith('\n');
    const patchedMarkdown =
      before +
      (needsLeadingNewline ? '\n\n' : '') +
      normalizedCandidate +
      (needsTrailingNewline ? '\n\n' : '') +
      after;

    // STRUCTURAL VALIDATION
    const structResult = validateStructure(originalMarkdown, patchedMarkdown, headings, targetHeading, 'create');
    if (!structResult.passed) return fail(structResult.errors);

    return { passed: true, patchedMarkdown, errors: [] };
  }
}

/**
 * Post-patch structural validation (IEL step).
 * Verifies document integrity after patch application.
 */
function validateStructure(
  original: string,
  patched: string,
  originalHeadings: { text: string; start: number; end: number }[],
  targetHeading: string,
  action: 'create' | 'refine',
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  const newHeadings = parseH1Positions(patched);
  const originalTexts = originalHeadings.map(h => h.text);
  const newTexts = newHeadings.map(h => h.text);

  // A. Heading count: refine = same, create = +1
  const expectedCount = action === 'create'
    ? originalHeadings.length + 1
    : originalHeadings.length;
  if (newHeadings.length !== expectedCount) {
    errors.push(`Heading count mismatch: expected ${expectedCount}, got ${newHeadings.length}`);
  }

  // B. All original non-target headings still exist
  for (const h of originalTexts) {
    if (h === targetHeading && action === 'refine') continue; // target is replaced, still exists
    if (!newTexts.includes(h)) {
      errors.push(`Original heading "${h}" missing after patch`);
    }
  }

  // C. Order preserved — non-target headings must appear in same relative order
  const originalNonTarget = originalTexts.filter(h => h !== targetHeading);
  const newNonTarget = newTexts.filter(h => h !== targetHeading);
  if (originalNonTarget.length !== newNonTarget.length) {
    errors.push('Non-target heading count changed after patch');
  } else {
    for (let i = 0; i < originalNonTarget.length; i++) {
      if (originalNonTarget[i] !== newNonTarget[i]) {
        errors.push(`Non-target heading order changed at position ${i}: "${originalNonTarget[i]}" → "${newNonTarget[i]}"`);
        break;
      }
    }
  }

  // D. No duplicate target headings
  const targetCount = newTexts.filter(h => h === targetHeading).length;
  if (targetCount > 1) {
    errors.push(`Duplicate target heading "${targetHeading}" found (${targetCount} occurrences)`);
  }

  // E. No unexpected new headings (for refine, set should be identical; for create, only target is new)
  const newOnly = newTexts.filter(h => !originalTexts.includes(h));
  if (action === 'refine' && newOnly.length > 0) {
    errors.push(`Unexpected new headings after refine: ${newOnly.join(', ')}`);
  }
  if (action === 'create') {
    const unexpectedNew = newOnly.filter(h => h !== targetHeading);
    if (unexpectedNew.length > 0) {
      errors.push(`Unexpected new headings after create: ${unexpectedNew.join(', ')}`);
    }
  }

  return { passed: errors.length === 0, errors };
}

/**
 * Scroll a textarea to the line containing a heading string.
 * Returns true if the heading was found and scrolled to, false otherwise.
 */
export function scrollTextareaToHeading(ta: HTMLTextAreaElement, heading: string): boolean {
  const idx = ta.value.indexOf(heading);
  if (idx === -1) return false;
  ta.focus();
  ta.setSelectionRange(idx, idx + heading.length);
  const linesBefore = ta.value.slice(0, idx).split('\n').length - 1;
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  ta.scrollTop = Math.max(0, linesBefore * lineHeight - 40);
  return true;
}
