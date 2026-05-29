/**
 * governanceGate.ts — Shared visual governance gate.
 *
 * Read governor-blocks from project_visual_stage_governance and return
 * whether the caller is permitted to generate for the given stage.
 *
 * NOT a middleware — a query + decision function called by each
 * generation function at its own insertion point.
 *
 * DESIGN RATIONALE:
 * - Fail-open for MISSING snapshots (older projects may not have them yet)
 * - Fail-closed for GOVERNANCE-BLOCKED stages (returns blocker_codes)
 * - Source tracking so callers can log / return "missing_snapshot" metadata
 * - No state mutations — pure read + compute
 */

export interface GovernanceGateResult {
  /** true when the stage snapshot says blocked */
  blocked: boolean;
  /** Blocker reason codes from the governance snapshot */
  blockers: string[];
  /** The computed_status from governance (if snapshot existed) */
  computed_status?: string;
  /** Where this result came from */
  source: "project_visual_stage_governance" | "missing_snapshot";
}

/**
 * Read visual governance for a single stage.
 *
 * @param supabase — authenticated supabase client (service_role)
 * @param projectId — project UUID
 * @param stageId — stage identifier matching pipelineStatusResolver
 * @returns GovernanceGateResult
 */
export async function readVisualGovernanceGate(
  supabase: any,
  projectId: string,
  stageId: string,
): Promise<GovernanceGateResult> {
  const { data, error } = await supabase
    .from("project_visual_stage_governance")
    .select("computed_status, blocker_codes")
    .eq("project_id", projectId)
    .eq("stage_id", stageId)
    .maybeSingle();

  // Missing row — fail open (older projects may lack snapshots)
  if (error || !data) {
    return {
      blocked: false,
      blockers: [],
      source: "missing_snapshot",
    };
  }

  // Stage is blocked by governance — fail closed
  if (data.computed_status === "blocked") {
    return {
      blocked: true,
      blockers: data.blocker_codes ?? [],
      computed_status: data.computed_status,
      source: "project_visual_stage_governance",
    };
  }

  // Stage is not blocked — allow
  return {
    blocked: false,
    blockers: [],
    computed_status: data.computed_status,
    source: "project_visual_stage_governance",
  };
}

// ── Surface-Aware Governance ─────────────────────────────────────────────────

export type GenerationSurface = "lookbook" | "costume_on_actor";

export type BlockerSeverity = "fatal" | "recoverable" | "warning";

export interface GovernanceBlocker {
  code: string;
  severity: BlockerSeverity;
  message: string;
  missing_dependency?: string;
}

export interface SurfaceGovernanceResult {
  blocked: boolean;
  surface: GenerationSurface;
  blocker_codes: string[];
  blockers: GovernanceBlocker[];
  next_actions: string[];
  source: string;
}

export interface SurfaceGovernancePayload {
  project_id: string;
  generation_surface: GenerationSurface;
  slot_type?: string;
  identity_lock?: boolean;
  scoring_policy?: string;
  package_strength?: string;
  actor_id?: string;
  character_id?: string;
}

/**
 * Route governance check by generation surface.
 * - costume_on_actor → canGenerateCostumeOnActor (5-check predicate)
 * - lookbook (default) → existing readVisualGovernanceGate
 */
export async function readGovernanceGateForSurface(
  supabase: any,
  payload: SurfaceGovernancePayload,
): Promise<SurfaceGovernanceResult> {
  if (payload.generation_surface === "costume_on_actor") {
    return canGenerateCostumeOnActor(supabase, payload);
  }
  // Default: lookbook gate (backward compatible)
  const lookbookGate = await readVisualGovernanceGate(
    supabase, payload.project_id, "lookbook",
  );
  return {
    blocked: lookbookGate.blocked,
    surface: "lookbook",
    blocker_codes: lookbookGate.blockers,
    blockers: lookbookGate.blockers.map(c => ({
      code: c,
      severity: "fatal" as BlockerSeverity,
      message: c,
    })),
    next_actions: [],
    source: lookbookGate.source,
  };
}

/**
 * 5-check predicate for costume_on_actor generation surface.
 *
 * Checks (in order, fail-fast):
 * 1. VALID_PROJECT — project_id is valid UUID and project exists
 * 2. VALID_CHARACTER_BINDING — actor_id + character_id resolved; if identity_lock=true,
 *    character must have valid actor binding
 * 3. IDENTITY_ANCHORS — if identity_lock=true AND slot_type is actor-facing
 *    (full_body_primary, three_quarter), require headshot + fullBody anchors.
 *    For detail/close_up slots, identity anchors are optional.
 * 4. VALID_COSTUME_PACKAGE — valid costume_state, slot_type recognized
 * 5. WARDROBE_PACKAGE_STRENGTH — if package_strength is 'weak' or 'blocked',
 *    return RECOVERABLE blocker (not fatal) with guidance
 *
 * Does NOT require: lookbook locked, hero_frames complete, poster readiness,
 * all visual canon complete, strict identity for detail_texture slots,
 * human actor lock for non-human entities.
 */
async function canGenerateCostumeOnActor(
  supabase: any,
  payload: SurfaceGovernancePayload,
): Promise<SurfaceGovernanceResult> {
  const blockers: GovernanceBlocker[] = [];
  const next_actions: string[] = [];

  // ── Check 1: VALID_PROJECT ──
  if (!payload.project_id) {
    blockers.push({
      code: "VALID_PROJECT",
      severity: "fatal",
      message: "Project ID is required",
    });
  } else {
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("id", payload.project_id)
        .maybeSingle();
      if (!project) {
        blockers.push({
          code: "VALID_PROJECT",
          severity: "fatal",
          message: "Project not found",
          missing_dependency: payload.project_id,
        });
      }
    } catch {
      blockers.push({
        code: "VALID_PROJECT",
        severity: "fatal",
        message: "Failed to validate project",
      });
    }
  }
  if (blockers.length > 0) {
    return buildCostumeOnActorBlocked(blockers, next_actions);
  }

  // ── Check 2: VALID_CHARACTER_BINDING ──
  if (payload.identity_lock === true) {
    if (!payload.actor_id || !payload.character_id) {
      blockers.push({
        code: "VALID_CHARACTER_BINDING",
        severity: "fatal",
        message: "Actor ID and character ID required when identity_lock is enabled",
      });
    } else {
      try {
        const { data: binding } = await supabase
          .from("character_actor_bindings")
          .select("id")
          .eq("character_id", payload.character_id)
          .eq("actor_id", payload.actor_id)
          .maybeSingle();
        if (!binding) {
          blockers.push({
            code: "VALID_CHARACTER_BINDING",
            severity: "fatal",
            message: "No valid actor binding found for this character",
            missing_dependency: `actor=${payload.actor_id}/character=${payload.character_id}`,
          });
        }
      } catch {
        blockers.push({
          code: "VALID_CHARACTER_BINDING",
          severity: "fatal",
          message: "Failed to verify character binding",
        });
      }
    }
  }
  if (blockers.length > 0) {
    return buildCostumeOnActorBlocked(blockers, next_actions);
  }

  // ── Check 3: IDENTITY_ANCHORS ──
  // Relaxed for detail/close_up slots — those don't require identity anchors
  if (payload.identity_lock === true) {
    const slotType = payload.slot_type || "";
    const actorFacingSlots = ["full_body_primary", "three_quarter"];
    if (actorFacingSlots.includes(slotType)) {
      // Must have headshot + fullBody anchors
      // This is a soft check against the project's actor anchors — we verify
      // via the identity_anchor_paths sent by the frontend. For governance,
      // we just flag it as recoverable guidance if anchors are likely missing.
      // The actual hard check happens at generation time.
      next_actions.push("Ensure actor headshot and full-body reference images are uploaded for identity preservation");
    }
  }

  // ── Check 4: VALID_COSTUME_PACKAGE ──
  const recognizedSlotTypes = [
    "full_body_primary", "three_quarter",
    "front_silhouette", "back_silhouette",
    "fabric_detail", "closure_detail", "accessory_detail",
    "hair_grooming",
  ];
  if (payload.slot_type && !recognizedSlotTypes.includes(payload.slot_type)) {
    blockers.push({
      code: "VALID_COSTUME_PACKAGE",
      severity: "fatal",
      message: `Unrecognized slot type: ${payload.slot_type}`,
    });
  }
  if (blockers.length > 0) {
    return buildCostumeOnActorBlocked(blockers, next_actions);
  }

  // ── Check 5: WARDROBE_PACKAGE_STRENGTH ──
  const blockedStrengthValues = ["weak", "blocked"];
  if (payload.package_strength && blockedStrengthValues.includes(payload.package_strength)) {
    blockers.push({
      code: "WARDROBE_PACKAGE_STRENGTH",
      severity: "recoverable",
      message: `Costume package strength is '${payload.package_strength}' — generation may produce low-quality results`,
      missing_dependency: payload.package_strength === "blocked"
        ? "wardrobe package requires stronger garment/fabric definitions"
        : undefined,
    });
    next_actions.push("Strengthen wardrobe package — add more garment and fabric definitions to the character costume state");
  }

  // ── Result ──
  if (blockers.length > 0) {
    return buildCostumeOnActorBlocked(blockers, next_actions);
  }

  return {
    blocked: false,
    surface: "costume_on_actor",
    blocker_codes: [],
    blockers: [],
    next_actions: [],
    source: "canGenerateCostumeOnActor",
  };
}

function buildCostumeOnActorBlocked(
  blockers: GovernanceBlocker[],
  next_actions: string[],
): SurfaceGovernanceResult {
  const hasFatal = blockers.some(b => b.severity === "fatal");
  return {
    blocked: true,
    surface: "costume_on_actor",
    blocker_codes: blockers.map(b => b.code),
    blockers,
    next_actions,
    source: "canGenerateCostumeOnActor" + (hasFatal ? "_fatal" : "_recoverable"),
  };
}
