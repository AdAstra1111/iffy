/**
 * Edge Function: lookbook-preflight
 *
 * Evaluates whether lookbook generation is ready to execute by checking
 * all upstream visual and narrative dependencies.
 *
 * This function is READ-ONLY — it does NOT trigger any generation, mutation,
 * or auto-run. It only evaluates readiness.
 *
 * POST /lookbook-preflight
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
  MISSING_CANON_HASH: "MISSING_CANON_HASH",
  MISSING_VISUAL_CANON: "MISSING_VISUAL_CANON",
  MISSING_CAST: "MISSING_CAST",
  MISSING_PRODUCTION_DESIGN: "MISSING_PRODUCTION_DESIGN",
  MISSING_HERO_FRAMES: "MISSING_HERO_FRAMES",
  MISSING_VISUAL_LANGUAGE: "MISSING_VISUAL_LANGUAGE",
  MISSING_SCENE_INDEX: "MISSING_SCENE_INDEX",
  HIGH_SEVERITY_STALE_RISK: "HIGH_SEVERITY_STALE_RISK",
  LOCKED_REVIEW_REQUIRED: "LOCKED_REVIEW_REQUIRED",
} as const;

type BlockerCode = typeof BLOCKER_CODES[keyof typeof BLOCKER_CODES];

interface RequirementResult {
  code: BlockerCode;
  passed: boolean;
  detail: string;
}

interface LookbookPreflightResult {
  project_id: string;
  evaluated_at: string;
  all_requirements_pass: boolean;
  requirements: RequirementResult[];
  canon_hash: string | null;
  upstream_stage_statuses: Record<string, string>;
  scene_count: number;
  hero_frame_count: number;
}

// ── Stage status helpers ────────────────────────────────────────────────────

const ACCEPTED_STATUSES = new Set(["approved", "locked"]);

function isStageReady(status: string | undefined | null): boolean {
  return !!status && ACCEPTED_STATUSES.has(status);
}

// ── Database checks ─────────────────────────────────────────────────────────

async function checkCanonHash(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ hash: string | null; exists: boolean; detail: string }> {
  const { data: canonRow } = await supabase
    .from("project_canon")
    .select("canon_json")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!canonRow) {
    return { hash: null, exists: false, detail: "No canon record found" };
  }

  const canonJson = (canonRow as any)?.canon_json;
  const content = typeof canonJson === "object" ? JSON.stringify(canonJson) : "";
  const exists = content.length > 2;

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
    detail: exists ? `Canon exists (hash: ${hash.slice(0, 8)}...)` : "Canon record has no content",
  };
}

async function checkUpstreamStage(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  stageId: string,
): Promise<{ ready: boolean; status: string; detail: string }> {
  const { data: govRow } = await supabase
    .from("project_visual_stage_governance")
    .select("computed_status, stale_risk, blocker_codes")
    .eq("project_id", projectId)
    .eq("stage_id", stageId)
    .maybeSingle();

  if (!govRow) {
    return { ready: false, status: "not_evaluated", detail: `No governance snapshot for ${stageId}` };
  }

  const row = govRow as any;
  const status = row.computed_status ?? "unknown";

  return {
    ready: isStageReady(status),
    status,
    detail: isStageReady(status) ? `${stageId} is ${status}` : `${stageId} is ${status} — not ready`,
  };
}

async function checkHeroFrames(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ ready: boolean; count: number; detail: string }> {
  const { data: images, count } = await supabase
    .from("project_images")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("asset_group", "hero_frame")
    .eq("is_active", true)
    .eq("curation_state", "active");

  const total = count ?? 0;
  const hasApproved = total > 0;

  return {
    ready: hasApproved,
    count: total,
    detail: hasApproved ? `${total} approved hero frame(s)` : "No approved hero frames",
  };
}

async function checkVisualLanguage(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ ready: boolean; detail: string }> {
  const { data: styleRow } = await supabase
    .from("project_visual_language")
    .select("id, style_profile_json")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!styleRow) {
    return { ready: false, detail: "No visual language profile found" };
  }

  const profile = (styleRow as any).style_profile_json;
  const hasProfile = profile && typeof profile === "object" && Object.keys(profile).length > 0;

  return {
    ready: !!hasProfile,
    detail: hasProfile ? "Visual language profile exists" : "Visual language profile has no content",
  };
}

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
    detail: exists ? `${count} scene(s) indexed` : "No scenes found",
  };
}

async function checkHighSeverityStaleRisk(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ blocked: boolean; detail: string }> {
  const upstreamStages = ["visual_canon", "cast", "hero_frames", "production_design", "visual_language"];

  const { data: govRows } = await supabase
    .from("project_visual_stage_governance")
    .select("stage_id, computed_status, stale_risk, blocker_codes")
    .eq("project_id", projectId)
    .in("stage_id", upstreamStages);

  if (!govRows || !Array.isArray(govRows)) {
    return { blocked: false, detail: "No governance data for upstream stages" };
  }

  const highSeverityReasons: string[] = [];
  for (const row of govRows) {
    const r = row as any;
    if (r.stale_risk?.isStale && r.stale_risk?.reasons) {
      for (const reason of r.stale_risk.reasons) {
        if (reason.severity === "high") {
          highSeverityReasons.push(`${r.stage_id}: ${reason.label}`);
        }
      }
    }
  }

  if (highSeverityReasons.length > 0) {
    return {
      blocked: true,
      detail: `High-severity stale risk on: ${highSeverityReasons.join("; ")}`,
    };
  }

  return { blocked: false, detail: "No high-severity stale risk detected" };
}

async function checkLockedReview(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<{ blocked: boolean; detail: string }> {
  const { data: govRow } = await supabase
    .from("project_visual_stage_governance")
    .select("blocker_codes, computed_status")
    .eq("project_id", projectId)
    .eq("stage_id", "lookbook")
    .maybeSingle();

  if (!govRow) {
    return { blocked: false, detail: "No governance snapshot for lookbook" };
  }

  const row = govRow as any;
  if (row.blocker_codes && Array.isArray(row.blocker_codes) && row.blocker_codes.length > 0) {
    return { blocked: true, detail: `Governance blockers: ${row.blocker_codes.join(", ")}` };
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
      canonResult,
      vcResult,
      castResult,
      pdResult,
      hfResult,
      vlResult,
      sceneResult,
      staleResult,
      lockResult,
    ] = await Promise.all([
      checkCanonHash(supabase, projectId),
      checkUpstreamStage(supabase, projectId, "visual_canon"),
      checkUpstreamStage(supabase, projectId, "cast"),
      checkUpstreamStage(supabase, projectId, "production_design"),
      checkHeroFrames(supabase, projectId),
      checkVisualLanguage(supabase, projectId),
      checkSceneIndex(supabase, projectId),
      checkHighSeverityStaleRisk(supabase, projectId),
      checkLockedReview(supabase, projectId),
    ]);

    // Build requirements
    const requirements: RequirementResult[] = [
      {
        code: BLOCKER_CODES.MISSING_CANON_HASH,
        passed: canonResult.exists,
        detail: canonResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_VISUAL_CANON,
        passed: vcResult.ready,
        detail: vcResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_CAST,
        passed: castResult.ready,
        detail: castResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_PRODUCTION_DESIGN,
        passed: pdResult.ready,
        detail: pdResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_HERO_FRAMES,
        passed: hfResult.ready,
        detail: hfResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_VISUAL_LANGUAGE,
        passed: vlResult.ready,
        detail: vlResult.detail,
      },
      {
        code: BLOCKER_CODES.MISSING_SCENE_INDEX,
        passed: sceneResult.exists,
        detail: sceneResult.detail,
      },
      {
        code: BLOCKER_CODES.HIGH_SEVERITY_STALE_RISK,
        passed: !staleResult.blocked,
        detail: staleResult.detail,
      },
      {
        code: BLOCKER_CODES.LOCKED_REVIEW_REQUIRED,
        passed: !lockResult.blocked,
        detail: lockResult.detail,
      },
    ];

    const allPass = requirements.every((r) => r.passed);

    const result: LookbookPreflightResult = {
      project_id: projectId,
      evaluated_at: now,
      all_requirements_pass: allPass,
      requirements,
      canon_hash: canonResult.hash,
      upstream_stage_statuses: {
        visual_canon: vcResult.status,
        cast: castResult.status,
        production_design: pdResult.status,
      },
      scene_count: sceneResult.count,
      hero_frame_count: hfResult.count,
    };

    return jsonRes(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: message }, 500);
  }
});