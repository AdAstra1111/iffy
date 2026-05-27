/**
 * Edge Function: hero-frame-preflight
 *
 * Evaluates whether hero-frame generation is ready to execute by checking
 * all required inputs and preconditions.
 *
 * This function is READ-ONLY — it does NOT trigger any generation, mutation,
 * or auto-run. It only evaluates readiness.
 *
 * POST /hero-frame-preflight
 * Body: { projectId: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Blocker code constants ──────────────────────────────────────────────────

const BLOCKER_CODES = {
  MISSING_SCENE_INDEX: "MISSING_SCENE_INDEX",
  MISSING_CAST_BINDINGS: "MISSING_CAST_BINDINGS",
  MISSING_LOCATION_BINDINGS: "MISSING_LOCATION_BINDINGS",
  MISSING_VISUAL_STYLE: "MISSING_VISUAL_STYLE",
  MISSING_CANON_HASH: "MISSING_CANON_HASH",
  STALE_UPSTREAM_STAGE: "STALE_UPSTREAM_STAGE",
  LOCKED_REVIEW_REQUIRED: "LOCKED_REVIEW_REQUIRED",
} as const;

type BlockerCode = typeof BLOCKER_CODES[keyof typeof BLOCKER_CODES];

interface RequirementResult {
  code: BlockerCode;
  passed: boolean;
  detail: string;
}

interface PreflightResult {
  project_id: string;
  evaluated_at: string;
  all_requirements_pass: boolean;
  requirements: RequirementResult[];
  canon_hash: string | null;
  scene_count: number;
  character_count: number;
  creature_count: number;
  vehicle_count: number;
  prop_count: number;
  location_count: number;
  cast_bound_count: number;
  location_bound_count: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function checkSceneIndex(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ exists: boolean; count: number; detail: string }> {
  const { count, error } = await supabase
    .from("scene_index")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (error) {
    return { exists: false, count: 0, detail: `Query error: ${error.message}` };
  }

  const exists = (count ?? 0) > 0;
  return {
    exists,
    count: count ?? 0,
    detail: exists
      ? `${count} scene(s) indexed`
      : "No scenes found in scene_index",
  };
}

async function checkCastBindings(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{
  characterCount: number;
  boundCount: number;
  detail: string;
}> {
  // Authoritative count: NIT narrative_entities with entity_type='character'
  const { count: nitCharCount, error: nitError } = await supabase
    .from("narrative_entities")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("entity_type", "character")
    .eq("status", "active");

  if (nitError) {
    return {
      characterCount: 0,
      boundCount: 0,
      detail: `Query error: ${nitError.message}`,
    };
  }

  const authoritativeCount = nitCharCount ?? 0;

  // Count characters with visual DNA
  const { count: dnaCount, error: dnaError } = await supabase
    .from("character_visual_dna")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_current", true);

  if (dnaError) {
    return {
      characterCount: 0,
      boundCount: 0,
      detail: `Query error: ${dnaError.message}`,
    };
  }

  const charCount = dnaCount ?? 0;

  // Use authoritative NIT count as primary, fall back to visual DNA count
  let charTotal = authoritativeCount > 0 ? authoritativeCount : charCount;

  // Final fallback: check project_characters if no data from other sources
  if (charTotal === 0) {
    const { count: pcCount } = await supabase
      .from("project_characters")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    charTotal = pcCount ?? 0;
  }

  // Count cast bindings (character_key + ai_actor_id)
  const { count: bindingCount, error: bindError } = await supabase
    .from("project_ai_cast")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .not("ai_actor_id", "is", null);

  if (bindError) {
    return {
      characterCount: charTotal,
      boundCount: 0,
      detail: `Query error: ${bindError.message}`,
    };
  }

  const bound = bindingCount ?? 0;
  const allBound = charTotal > 0 && bound >= charTotal;

  return {
    characterCount: charTotal,
    boundCount: bound,
    detail: allBound
      ? `All ${charTotal} character(s) have cast bindings`
      : `${bound}/${charTotal} character(s) have cast bindings`,
  };
}

/**
 * Check non-character entity bindings (creature, vehicle, prop) by querying
 * entity_visual_states for each entity type.
 */
async function checkNonCharacterBindings(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  entityType: string,
  label: string,
): Promise<{
  boundCount: number;
  detail: string;
}> {
  const { count, error } = await supabase
    .from("entity_visual_states")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("entity_type", entityType);

  if (error) {
    return {
      boundCount: 0,
      detail: `Query error (${label}): ${error.message}`,
    };
  }

  const bound = count ?? 0;
  return {
    boundCount: bound,
    detail: bound > 0
      ? `${bound} ${label}(s) have visual state bindings`
      : `No ${label} visual state bindings found`,
  };
}

async function checkLocationBindings(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{
  locationCount: number;
  boundCount: number;
  detail: string;
}> {
  // Count canon_locations
  const { count: locCount, error: locError } = await supabase
    .from("canon_locations")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("active", true);

  if (locError) {
    return {
      locationCount: 0,
      boundCount: 0,
      detail: `Query error: ${locError.message}`,
    };
  }

  const locTotal = locCount ?? 0;

  // Count locations with location_visual_datasets
  const { data: datasetLocations } = await supabase
    .from("location_visual_datasets")
    .select("canon_location_id")
    .eq("project_id", projectId)
    .eq("is_current", true);

  const boundLocationIds = new Set(
    (datasetLocations ?? []).map((r: any) => r.canon_location_id),
  );
  const boundCount = boundLocationIds.size;

  const allBound = locTotal > 0 && boundCount >= locTotal;

  return {
    locationCount: locTotal,
    boundCount,
    detail: allBound
      ? `All ${locTotal} location(s) have visual datasets`
      : `${boundCount}/${locTotal} location(s) have visual datasets`,
  };
}

async function checkVisualStyle(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ exists: boolean; complete: boolean; detail: string }> {
  const { data: styleRow, error } = await supabase
    .from("project_visual_language")
    .select("id, style_profile_json, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      exists: false,
      complete: false,
      detail: `Query error: ${error.message}`,
    };
  }

  const exists = !!styleRow;
  const hasProfile =
    exists &&
    styleRow.style_profile_json &&
    typeof styleRow.style_profile_json === "object" &&
    Object.keys(styleRow.style_profile_json).length > 0;

  return {
    exists,
    complete: hasProfile ?? false,
    detail: hasProfile
      ? "Visual style profile exists and has content"
      : exists
      ? "Visual style entry exists but profile has no content"
      : "No visual style profile found",
  };
}

async function checkCanonHash(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ hash: string | null; exists: boolean; detail: string }> {
  const { data: canonRow } = await supabase
    .from("project_canon")
    .select("canon_json, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!canonRow) {
    return {
      hash: null,
      exists: false,
      detail: "No canon record found",
    };
  }

  const canonJson = (canonRow as any)?.canon_json;
  const content = typeof canonJson === "object" ? JSON.stringify(canonJson) : "";
  const exists = content.length > 2; // At least {}

  // Compute a hash of the canon content
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(content),
  );
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    hash,
    exists,
    detail: exists
      ? `Canon exists with content (hash: ${hash.slice(0, 8)}...)`
      : "Canon record exists but has no content",
  };
}

async function checkUpstreamStaleness(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ stale: boolean; detail: string }> {
  // Check if any upstream data is newer than existing hero frames
  // Check frontend computeStaleRiskForStage hero_frames logic:
  // stale if canon, cast, or PD is newer than generated frames

  const { data: hfRow } = await supabase
    .from("project_images")
    .select("created_at")
    .eq("project_id", projectId)
    .eq("asset_group", "hero_frame")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!hfRow) {
    // No hero frames exist yet — can't be stale from upstream
    return { stale: false, detail: "No hero frames generated yet" };
  }

  const hfTime = new Date((hfRow as any).created_at).getTime();
  const staleReasons: string[] = [];

  // Check canon
  const { data: canonRow } = await supabase
    .from("project_canon")
    .select("updated_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (canonRow) {
    const canonTime = new Date((canonRow as any).updated_at).getTime();
    if (canonTime > hfTime) {
      staleReasons.push("Canon updated after hero frames");
    }
  }

  // Check cast
  const { data: castRow } = await supabase
    .from("project_ai_cast")
    .select("updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (castRow) {
    const castTime = new Date((castRow as any).updated_at).getTime();
    if (castTime > hfTime) {
      staleReasons.push("Cast updated after hero frames");
    }
  }

  // Check production design (visual_sets)
  const { data: pdRow } = await supabase
    .from("visual_sets")
    .select("updated_at")
    .eq("project_id", projectId)
    .like("domain", "production_design_%")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pdRow) {
    const pdTime = new Date((pdRow as any).updated_at).getTime();
    if (pdTime > hfTime) {
      staleReasons.push("Production Design updated after hero frames");
    }
  }

  if (staleReasons.length > 0) {
    return {
      stale: true,
      detail: staleReasons.join("; "),
    };
  }

  return { stale: false, detail: "No upstream staleness detected" };
}

/**
 * Check if any existing execution output has been rejected (blocks preflight).
 * Also check if the latest completed execution has been accepted.
 * If not reviewed, treat as neutral (not blocking).
 */
async function checkReviewState(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  stageId: string,
): Promise<{ blocked: boolean; accepted: boolean; detail: string }> {
  const { data: executions } = await supabase
    .from("project_visual_execution_provenance")
    .select("execution_state, review_state, execution_number")
    .eq("project_id", projectId)
    .eq("stage_id", stageId)
    .order("execution_number", { ascending: false })
    .limit(5);

  if (!executions || !Array.isArray(executions) || executions.length === 0) {
    return { blocked: false, accepted: false, detail: "No executions to review" };
  }

  const rejected = executions.find((r: any) => r.review_state === "rejected");
  if (rejected) {
    return {
      blocked: true,
      accepted: false,
      detail: `Execution #${rejected.execution_number} was rejected — review must be resolved before regeneration`,
    };
  }

  const accepted = executions.find(
    (r: any) => r.execution_state === "completed" && r.review_state === "accepted",
  );
  if (accepted) {
    return { blocked: false, accepted: true, detail: `Execution #${accepted.execution_number} is accepted` };
  }

  return { blocked: false, accepted: false, detail: "Executions exist but not yet reviewed" };
}

async function checkLockedReview(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ blocked: boolean; detail: string }> {
  // Check if governance has any blockers for hero_frames
  const { data: govRow } = await supabase
    .from("project_visual_stage_governance")
    .select("blocker_codes, computed_status, stale_risk")
    .eq("project_id", projectId)
    .eq("stage_id", "hero_frames")
    .maybeSingle();

  if (!govRow) {
    return { blocked: false, detail: "No governance snapshot for hero frames" };
  }

  const row = govRow as any;

  // Check for explicit blockers
  if (
    row.blocker_codes &&
    Array.isArray(row.blocker_codes) &&
    row.blocker_codes.length > 0
  ) {
    return {
      blocked: true,
      detail: `Governance blockers: ${row.blocker_codes.join(", ")}`,
    };
  }

  // Check for locked review requirement (stale + exists = needs refresh)
  if (
    row.computed_status === "stale" &&
    row.stale_risk?.isStale
  ) {
    return {
      blocked: true,
      detail: "Governance reports stale status — review required before execution",
    };
  }

  return { blocked: false, detail: "No locked review requirements" };
}

// ── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const projectId = body?.projectId as string | undefined;

    if (!projectId) {
      return jsonRes({ error: "projectId is required" }, 400);
    }

    const now = new Date().toISOString();

    // Run all checks in parallel
    const [
      sceneResult,
      castResult,
      creatureResult,
      vehicleResult,
      propResult,
      locationResult,
      styleResult,
      canonResult,
      staleResult,
      lockResult,
    ] = await Promise.all([
      checkSceneIndex(supabase, projectId),
      checkCastBindings(supabase, projectId),
      checkNonCharacterBindings(supabase, projectId, "creature", "creature"),
      checkNonCharacterBindings(supabase, projectId, "vehicle", "vehicle"),
      checkNonCharacterBindings(supabase, projectId, "prop", "prop"),
      checkLocationBindings(supabase, projectId),
      checkVisualStyle(supabase, projectId),
      checkCanonHash(supabase, projectId),
      checkUpstreamStaleness(supabase, projectId),
      checkLockedReview(supabase, projectId),
    ]);

    // Build requirements
    const requirements: RequirementResult[] = [
      {
        code: BLOCKER_CODES.MISSING_SCENE_INDEX,
        passed: sceneResult.exists,
        detail: sceneResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_CAST_BINDINGS,
        passed:
          castResult.characterCount > 0 &&
          castResult.boundCount >= castResult.characterCount,
        detail: castResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_CAST_BINDINGS,
        passed: true,
        detail: creatureResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_CAST_BINDINGS,
        passed: true,
        detail: vehicleResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_CAST_BINDINGS,
        passed: true,
        detail: propResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_LOCATION_BINDINGS,
        passed:
          locationResult.locationCount > 0 &&
          locationResult.boundCount >= locationResult.locationCount,
        detail: locationResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_VISUAL_STYLE,
        passed: styleResult.complete,
        detail: styleResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_CANON_HASH,
        passed: canonResult.exists,
        detail: canonResult.detail,
      },
      {
        code: BLOCKER_CODES.STALE_UPSTREAM_STAGE,
        passed: !staleResult.stale,
        detail: staleResult.detail,
      },
      {
        code: BLOCKER_CODES.LOCKED_REVIEW_REQUIRED,
        passed: !lockResult.blocked,
        detail: lockResult.detail,
      },
    ];

    const allPass = requirements.every((r) => r.passed);

    const result: PreflightResult = {
      project_id: projectId,
      evaluated_at: now,
      all_requirements_pass: allPass,
      requirements,
      canon_hash: canonResult.hash,
      scene_count: sceneResult.count,
      character_count: castResult.characterCount,
      creature_count: creatureResult.boundCount,
      vehicle_count: vehicleResult.boundCount,
      prop_count: propResult.boundCount,
      location_count: locationResult.locationCount,
      cast_bound_count: castResult.boundCount,
      location_bound_count: locationResult.boundCount,
    };

    return jsonRes(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: message }, 500);
  }
});