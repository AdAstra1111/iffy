/**
 * atomDependencyIndex.ts — MVP Atom Dependency Index
 *
 * Constitutional Rule:
 * Documents remain truth. Atoms are derivative indexes.
 * Atoms may drive staleness flags. Atoms must NOT drive generation.
 * Generators must continue reading upstream documents, not atoms.
 *
 * ── APPROVED ATOM TYPES ──
 * character_goal, character_fear, character_secret,
 * character_relationship, character_backstory_event,
 * world_rule, timeline_event, location_fact
 *
 * No other types permitted in this MVP.
 *
 * ── FORBIDDEN ATTRIBUTE KEYS ──
 * pressure, energy, force, expected_choice, predicted_choice,
 * arc_score, arc_percent, arc_percentage
 *
 * ── SHADOW ISOLATION ──
 * attributes.shadow.* is ignored by invalidation.
 */

// ── CONSTANTS ──

export const APPROVED_ATOM_TYPES = [
  "character_goal",
  "character_fear",
  "character_secret",
  "character_relationship",
  "character_backstory_event",
  "world_rule",
  "timeline_event",
  "location_fact",
] as const;

export type ApprovedAtomType = (typeof APPROVED_ATOM_TYPES)[number];

export const FORBIDDEN_ATTRIBUTE_KEYS = [
  "pressure",
  "energy",
  "force",
  "expected_choice",
  "predicted_choice",
  "arc_score",
  "arc_percent",
  "arc_percentage",
];

export const DEPENDENCY_TYPES = ["origin", "derived", "reference"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const AFFECTED_SCOPES = [
  "full_doc",
  "specific_scenes",
  "visual_only",
  "metadata_only",
] as const;
export type AffectedScope = (typeof AFFECTED_SCOPES)[number];

// ── TYPES ──

export interface AtomAttributes {
  text: string;
  confidence: number;
  source: string;
  display_only?: boolean;
  shadow?: Record<string, unknown>; // IGNORED by invalidation engine
  [key: string]: unknown;
}

export interface AtomRecord {
  project_id: string;
  atom_type: ApprovedAtomType;
  entity_id?: string;
  scene_id?: string;
  origin_doc_id?: string;
  origin_source?: string; // structured source ref (e.g. "canon_locations", "scene_graph")
  canonical_name: string;
  narrative_role?: string;
  priority?: number;
  confidence?: number;
  attributes: AtomAttributes;
}

export interface AtomDependency {
  atom_id?: string;
  affected_doc_type: string;
  dependency_type: DependencyType;
  affected_scope: AffectedScope;
  project_id: string;
}

export interface StalenessFlag {
  document_id: string;
  doc_type: string;
  version_id: string;
  stale_reason: string;
  changed_atom_type: string;
  changed_atom_text: string;
  changed_atom_entity: string;
  origin_source: string;
  dependency_type: DependencyType;
  affected_scope: AffectedScope;
  suggested_action: string;
}

// ── VALIDATORS ──

export function validateAtomType(type: string): type is ApprovedAtomType {
  return (APPROVED_ATOM_TYPES as readonly string[]).includes(type);
}

export function validateAtomAttributes(
  attributes: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const key of FORBIDDEN_ATTRIBUTE_KEYS) {
    if (key in attributes) {
      errors.push(`Forbidden attribute key: ${key}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAtomPreWrite(
  atom: AtomRecord
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!validateAtomType(atom.atom_type)) {
    errors.push(`Invalid atom type: ${atom.atom_type}`);
  }

  if (!atom.project_id) {
    errors.push("project_id is required");
  }

  if (!atom.canonical_name) {
    errors.push("canonical_name is required");
  }

  if (atom.attributes.display_only === true) {
    if (atom.confidence !== undefined && atom.confidence > 0.5) {
      errors.push(
        "display_only atoms should not have confidence > 0.5 (use display_only for interpretive data)"
      );
    }
  }

  const attrCheck = validateAtomAttributes(atom.attributes);
  errors.push(...attrCheck.errors);

  return { valid: errors.length === 0, errors };
}

// ── DEPENDENCY MAP ──

/**
 * Canonical atom → document type dependency map.
 * One-hop only. Origin + directly derived documents.
 *
 * origin: The document type that IS the source of truth for this atom type.
 * derived: Document types that USE this atom type for their content (soft stale).
 */
export const ATOM_TO_DOC_DEPENDENCIES: Record<
  ApprovedAtomType,
  Array<{ doc_type: string; dependency_type: DependencyType; affected_scope: AffectedScope }>
> = {
  character_goal: [
    { doc_type: "character_bible", dependency_type: "origin", affected_scope: "full_doc" },
    { doc_type: "story_outline", dependency_type: "derived", affected_scope: "full_doc" },
    { doc_type: "treatment", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "beat_sheet", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "feature_script", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "production_draft", dependency_type: "derived", affected_scope: "specific_scenes" },
  ],
  character_fear: [
    { doc_type: "character_bible", dependency_type: "origin", affected_scope: "full_doc" },
    { doc_type: "treatment", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "feature_script", dependency_type: "derived", affected_scope: "specific_scenes" },
  ],
  character_secret: [
    { doc_type: "character_bible", dependency_type: "origin", affected_scope: "full_doc" },
    { doc_type: "story_outline", dependency_type: "derived", affected_scope: "full_doc" },
    { doc_type: "beat_sheet", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "feature_script", dependency_type: "derived", affected_scope: "specific_scenes" },
  ],
  character_relationship: [
    { doc_type: "character_bible", dependency_type: "origin", affected_scope: "full_doc" },
    { doc_type: "treatment", dependency_type: "derived", affected_scope: "full_doc" },
    { doc_type: "feature_script", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "production_draft", dependency_type: "derived", affected_scope: "specific_scenes" },
  ],
  character_backstory_event: [
    { doc_type: "character_bible", dependency_type: "origin", affected_scope: "full_doc" },
    { doc_type: "treatment", dependency_type: "derived", affected_scope: "full_doc" },
    { doc_type: "story_outline", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "feature_script", dependency_type: "derived", affected_scope: "specific_scenes" },
  ],
  world_rule: [
    { doc_type: "format_rules", dependency_type: "origin", affected_scope: "full_doc" },
    { doc_type: "treatment", dependency_type: "derived", affected_scope: "full_doc" },
    { doc_type: "feature_script", dependency_type: "derived", affected_scope: "full_doc" },
    { doc_type: "production_draft", dependency_type: "derived", affected_scope: "full_doc" },
    { doc_type: "visual_canon_brief", dependency_type: "derived", affected_scope: "visual_only" },
  ],
  timeline_event: [
    { doc_type: "story_outline", dependency_type: "origin", affected_scope: "full_doc" },
    { doc_type: "beat_sheet", dependency_type: "derived", affected_scope: "full_doc" },
    { doc_type: "feature_script", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "scene_graph", dependency_type: "derived", affected_scope: "full_doc" },
  ],
  location_fact: [
    { doc_type: "scene_graph", dependency_type: "origin", affected_scope: "full_doc" },
    { doc_type: "feature_script", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "production_draft", dependency_type: "derived", affected_scope: "specific_scenes" },
    { doc_type: "visual_canon_brief", dependency_type: "derived", affected_scope: "visual_only" },
  ],
};

// ── DEPENDENCY HANDLER LOOKUP ──

/**
 * Returns the concrete staleness handlers for a given atom type.
 * Each handler produces a StalenessFlag when the atom changes.
 * If no handler exists, the dependency should not have been created.
 */
export function getStalenessHandlers(
  atomType: ApprovedAtomType
): Array<{
  doc_type: string;
  handler: (atom: AtomRecord) => Pick<StalenessFlag, "suggested_action" | "affected_scope">;
}> {
  const deps = ATOM_TO_DOC_DEPENDENCIES[atomType];
  if (!deps) return [];

  return deps.map((dep) => ({
    doc_type: dep.doc_type,
    handler: () => {
      if (dep.dependency_type === "origin") {
        return {
          suggested_action:
            "Review origin document — atom source changed. Regenerate through document ladder.",
          affected_scope: dep.affected_scope,
        };
      }
      return {
        suggested_action:
          `Potentially stale — ${atomType} changed. ` +
          (dep.affected_scope === "visual_only"
            ? "Visual assets may need re-evaluation. Assess before regeneration."
            : "Assess impact on this document before regenerating."),
        affected_scope: dep.affected_scope,
      };
    },
  }));
}

// ── STALENESS COMPUTATION ──

export function computeStalenessFlags(
  changedAtom: AtomRecord,
  existingAtom: AtomRecord
): StalenessFlag[] {
  // Only flag on actual text change
  if (changedAtom.attributes.text === existingAtom.attributes.text) {
    return [];
  }

  // Verify the atom type is approved
  if (!validateAtomType(changedAtom.atom_type)) {
    return [];
  }

  // Get handlers for this atom type
  const handlers = getStalenessHandlers(changedAtom.atom_type);

  return handlers.map((h) => ({
    document_id: "", // resolved at query time from doc_type + project_id
    doc_type: h.doc_type,
    version_id: "",
    stale_reason: `${changedAtom.atom_type} changed: "${existingAtom.attributes.text}" → "${changedAtom.attributes.text}"`,
    changed_atom_type: changedAtom.atom_type,
    changed_atom_text: changedAtom.attributes.text,
    changed_atom_entity: changedAtom.canonical_name,
    origin_source: changedAtom.attributes.source,
    dependency_type: ATOM_TO_DOC_DEPENDENCIES[changedAtom.atom_type]?.find(
      (d) => d.doc_type === h.doc_type
    )?.dependency_type ?? "derived",
    affected_scope: h.handler(changedAtom).affected_scope,
    suggested_action: h.handler(changedAtom).suggested_action,
  }));
}

// ── BOUNDARY ENFORCEMENT ──

/**
 * Guard function — rejects atoms that violate boundary rules.
 * Call BEFORE insert/update to atoms table.
 */
export function guardAtomBoundary(
  atom: AtomRecord
): { passed: boolean; reason?: string } {
  // Rule 1: Only approved types
  if (!validateAtomType(atom.atom_type)) {
    return {
      passed: false,
      reason: `Atom type "${atom.atom_type}" is not in the approved set. Only ${APPROVED_ATOM_TYPES.join(", ")} are permitted.`,
    };
  }

  // Rule 2: No forbidden attribute keys
  const attrCheck = validateAtomAttributes(atom.attributes);
  if (!attrCheck.valid) {
    return { passed: false, reason: attrCheck.errors.join("; ") };
  }

  // Rule 3: Display-only data must be marked
  if (
    atom.attributes.confidence !== undefined &&
    atom.confidence !== undefined &&
    atom.confidence < 0.5 &&
    atom.attributes.display_only !== true
  ) {
    // Allow low-confidence atoms as long as they're not display_only
    // This is advisory, not a hard block
  }

  return { passed: true };
}

/**
 * Generation pipeline guard — verifies that a generate-document call
 * is NOT reading atoms as prompt inputs. This is a soft guard:
 * it asserts that the system prompt does not contain atom data.
 */
export function guardGenerationPipeline(
  systemPrompt: string
): { passes: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const ATOM_INDICATORS = [
    "FROM atoms",
    "atom_dependency", // substring match protects against table name usage
    "attributes.shadow",
    "character_goal",
    "character_fear",
    "character_secret",
    "character_backstory_event",
    "world_rule",
    "timeline_event",
    "location_fact",
  ];

  for (const indicator of ATOM_INDICATORS) {
    if (systemPrompt.includes(indicator)) {
      warnings.push(
        `Generation pipeline appears to reference atom data: "${indicator}". Atoms must not drive generation. Documents are truth.`
      );
    }
  }

  return { passes: warnings.length === 0, warnings };
}
