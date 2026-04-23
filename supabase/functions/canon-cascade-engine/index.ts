/**
 * canon-cascade-engine — Canon Cascade MVP
 *
 * Triggered after a canonical document is promoted (via auto-run finalizeBest).
 * Enumerates upstream + downstream ladder targets, flags upstream docs,
 * and regenerates downstream docs via dev-engine-v2.
 *
 * SR metadata is read from project_document_versions.meta_json.
 * No SR scoring logic lives here — cascade reads persisted SR only.
 *
 * Input: {
 *   projectId: string,
 *   triggerDocId: string,
 *   triggerDocType: string,
 *   triggerVersionId: string,
 *   direction: 'both' | 'downstream_only'
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

// FORMAT_LADDERS inline — mirrors stage-ladders.json FORMAT_LADDERS exactly
// Keep in sync with supabase/_shared/stage-ladders.json
const FORMAT_LADDERS: Record<string, string[]> = {
  "film":               ["idea","concept_brief","treatment","story_outline","character_bible","beat_sheet","feature_script","production_draft"],
  "feature":            ["idea","concept_brief","treatment","story_outline","character_bible","beat_sheet","feature_script","production_draft"],
  "tv-series":          ["idea","concept_brief","treatment","story_outline","character_bible","beat_sheet","episode_beats","episode_script","season_master_script","production_draft"],
  "limited-series":     ["idea","concept_brief","treatment","story_outline","character_bible","beat_sheet","episode_beats","episode_script","season_master_script","production_draft"],
  "digital-series":     ["idea","concept_brief","treatment","story_outline","character_bible","beat_sheet","episode_beats","episode_script","season_master_script","production_draft"],
  "vertical-drama":     ["idea","concept_brief","character_bible","format_rules","season_arc","episode_grid","vertical_episode_beats","season_script"],
  "documentary":        ["idea","concept_brief","documentary_outline"],
  "documentary-series": ["idea","concept_brief","documentary_outline"],
  "hybrid-documentary": ["idea","concept_brief","documentary_outline","treatment"],
  "short":              ["idea","concept_brief","feature_script"],
  "animation":          ["idea","concept_brief","treatment","character_bible","beat_sheet","feature_script"],
  "anim-series":        ["idea","concept_brief","treatment","story_outline","character_bible","beat_sheet","episode_beats","episode_script","season_master_script","production_draft"],
  "reality":            ["idea","concept_brief","treatment","beat_sheet","episode_beats","episode_script"],
};
const SAFE_TARGET_LIMIT = 20;

// ── Types ──────────────────────────────────────────────────────────────────

interface CascadeInput {
  projectId: string;
  triggerDocId: string;
  triggerDocType: string;
  triggerVersionId: string;
  direction?: "both" | "downstream_only";
}

interface TargetDoc {
  docId: string;
  docType: string;
  direction: "upstream" | "downstream";
  cascadeOrder: number;
}

// ── SR read from meta_json ─────────────────────────────────────────────────

async function readVersionSR(supabase: any, docId: string): Promise<{
  promotionAllowed: boolean;
  srStatus: string;
  srScore: number | null;
  overrideAllowed: boolean;
  ci: number | null;
  gp: number | null;
} | null> {
  const { data: ver } = await supabase
    .from("project_document_versions")
    .select("meta_json, id")
    .eq("document_id", docId)
    .eq("is_current", true)
    .maybeSingle();

  if (!ver) return null;
  const meta = ver.meta_json ?? {};
  return {
    promotionAllowed: meta.promotion_allowed ?? false,
    srStatus: meta.stage_readiness_status ?? "UNSCORABLE",
    srScore: meta.stage_readiness_score ?? null,
    overrideAllowed: meta.override_allowed ?? false,
    ci: meta.ci ?? meta.creative_integrity ?? null,
    gp: meta.gp ?? meta.greenlight_probability ?? null,
  };
}

// ── Enumerate cascade targets from FORMAT_LADDERS DAG ─────────────────────

function enumerateTargets(
  format: string,
  triggerDocType: string,
  direction: "both" | "downstream_only",
  existingDocTypes: Set<string>,
): { downstream: string[]; upstream: string[] } {
  const ladder = FORMAT_LADDERS[format] ?? FORMAT_LADDERS["film"] ?? [];
  const triggerIdx = ladder.indexOf(triggerDocType);
  if (triggerIdx === -1) return { downstream: [], upstream: [] };

  const downstream = ladder
    .slice(triggerIdx + 1)
    .filter(dt => existingDocTypes.has(dt));

  const upstream = direction === "downstream_only"
    ? []
    : ladder
      .slice(0, triggerIdx)
      .reverse()
      .filter(dt => existingDocTypes.has(dt));

  return { downstream, upstream };
}

// ── Main ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body: CascadeInput = await req.json();
    const { projectId, triggerDocId, triggerDocType, triggerVersionId } = body;
    const direction = body.direction ?? "both";

    if (!projectId || !triggerDocId || !triggerDocType || !triggerVersionId) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // ── 1. Get project format ──────────────────────────────────────────────
    const { data: project } = await supabase
      .from("projects")
      .select("format, id")
      .eq("id", projectId)
      .single();

    if (!project) {
      return Response.json({ ok: false, error: "Project not found" }, { status: 404 });
    }
    const format = project.format ?? "film";

    // ── 2. Cancel any active cascade for this project ─────────────────────
    await supabase
      .from("canon_cascade_jobs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("status", "active");

    // ── 3. Get existing docs for this project (dedup by doc_type) ─────────
    const { data: projectDocs } = await supabase
      .from("project_documents")
      .select("id, doc_type")
      .eq("project_id", projectId);

    if (!projectDocs || projectDocs.length === 0) {
      return Response.json({ ok: false, error: "No documents found for project" }, { status: 404 });
    }

    // Build map: doc_type → doc_id (most recent if multiple)
    const docTypeMap: Record<string, string> = {};
    for (const doc of projectDocs) {
      if (!docTypeMap[doc.doc_type]) docTypeMap[doc.doc_type] = doc.id;
    }
    const existingDocTypes = new Set(Object.keys(docTypeMap));

    // ── 4. Enumerate targets ───────────────────────────────────────────────
    const { downstream, upstream } = enumerateTargets(format, triggerDocType, direction, existingDocTypes);
    const totalTargets = downstream.length + upstream.length;

    // ── 5. Create cascade job ──────────────────────────────────────────────
    const { data: job, error: jobErr } = await supabase
      .from("canon_cascade_jobs")
      .insert({
        project_id: projectId,
        trigger_doc_id: triggerDocId,
        trigger_doc_type: triggerDocType,
        trigger_version_id: triggerVersionId,
        direction,
        status: "active",
        safe_target_limit: SAFE_TARGET_LIMIT,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobErr || !job) {
      console.error("[canon-cascade-engine] job create failed:", jobErr);
      return Response.json({ ok: false, error: "Failed to create cascade job" }, { status: 500 });
    }

    const jobId = job.id;

    // ── 6. Safe target limit check ────────────────────────────────────────
    if (totalTargets > SAFE_TARGET_LIMIT) {
      await supabase
        .from("canon_cascade_jobs")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      return Response.json({
        ok: false,
        confirmation_required: true,
        jobId,
        message: `Cascade will regenerate ${totalTargets} documents. Confirm to proceed.`,
        downstream_count: downstream.length,
        upstream_count: upstream.length,
      }, { status: 200 });
    }

    // ── 7. Enumerate target rows ───────────────────────────────────────────
    const targetRows: TargetDoc[] = [];
    downstream.forEach((dt, i) => {
      const docId = docTypeMap[dt];
      if (docId) targetRows.push({ docId, docType: dt, direction: "downstream", cascadeOrder: i });
    });
    upstream.forEach((dt, i) => {
      const docId = docTypeMap[dt];
      if (docId) targetRows.push({ docId, docType: dt, direction: "upstream", cascadeOrder: i });
    });

    if (targetRows.length === 0) {
      await supabase.from("canon_cascade_jobs")
        .update({ status: "complete", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      return Response.json({ ok: true, jobId, message: "No targets to cascade — job complete" });
    }

    // Insert target rows
    await supabase.from("canon_cascade_targets").insert(
      targetRows.map(t => ({
        cascade_job_id: jobId,
        target_doc_id: t.docId,
        target_doc_type: t.docType,
        direction: t.direction,
        cascade_order: t.cascadeOrder,
        status: "pending",
        retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
    );

    // ── 8. Flag upstream targets immediately (no rewrite) ─────────────────
    if (upstream.length > 0) {
      const upstreamDocIds = upstream.map(dt => docTypeMap[dt]).filter(Boolean);
      await supabase.from("canon_cascade_targets")
        .update({ status: "flagged", updated_at: new Date().toISOString() })
        .eq("cascade_job_id", jobId)
        .eq("direction", "upstream");

      // Mark upstream versions as stale (invalidation — no deletion)
      for (const docId of upstreamDocIds) {
        await supabase.from("project_document_versions")
          .update({
            is_stale: true,
            stale_reason: `canon_cascade:${jobId}`,
            is_current: false,
          })
          .eq("document_id", docId)
          .eq("is_current", true);
      }
    }

    // ── 9. Return immediately — downstream processing is async ────────────
    const bgWork = processDownstreamTargets(supabase, supabaseUrl, serviceKey, jobId, downstream, docTypeMap, projectId);
    if (typeof (globalThis as any).EdgeRuntime !== "undefined") {
      (globalThis as any).EdgeRuntime.waitUntil(bgWork);
    } else {
      bgWork.catch((e: any) => console.error("[canon-cascade-engine] bg error:", e?.message));
    }

    return Response.json({
      ok: true,
      jobId,
      downstream_targets: downstream.length,
      upstream_flagged: upstream.length,
    });

  } catch (err: any) {
    console.error("[canon-cascade-engine] fatal error:", err);
    return Response.json({ ok: false, error: err?.message ?? "unknown error" }, { status: 500 });
  }
});

// ── Downstream processing (async, non-blocking) ───────────────────────────

async function processDownstreamTargets(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  jobId: string,
  downstream: string[],
  docTypeMap: Record<string, string>,
  projectId: string,
): Promise<void> {
  for (const docType of downstream) {
    const docId = docTypeMap[docType];
    if (!docId) continue;

    // Check job still active
    const { data: jobCheck } = await supabase
      .from("canon_cascade_jobs")
      .select("status")
      .eq("id", jobId)
      .single();
    if (!jobCheck || jobCheck.status !== "active") {
      console.log(`[canon-cascade-engine] job ${jobId} no longer active — stopping`);
      return;
    }

    // ── Mark target "regenerating" + revoke current version ──────────────
    await supabase.from("canon_cascade_targets")
      .update({ status: "regenerating", updated_at: new Date().toISOString() })
      .eq("cascade_job_id", jobId)
      .eq("target_doc_id", docId);

    // Revoke currently-trusted version
    const { data: currentVer } = await supabase
      .from("project_document_versions")
      .select("id")
      .eq("document_id", docId)
      .eq("is_current", true)
      .maybeSingle();

    if (currentVer) {
      await supabase.from("project_document_versions")
        .update({
          is_stale: true,
          stale_reason: `canon_cascade:${jobId}`,
          is_current: false,
        })
        .eq("id", currentVer.id);
    }

    // ── Regenerate via dev-engine-v2 ──────────────────────────────────────
    let regenError: string | null = null;
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/dev-engine-v2`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          deliverableType: docType,
          rewrite: true,
          allowPropagation: false,
          cascadeJobId: jobId,
          cascadeMode: true,
        }),
      });
      if (!resp.ok) {
        regenError = `dev-engine-v2 returned ${resp.status}`;
      }
    } catch (e: any) {
      regenError = e?.message ?? "fetch error";
    }

    if (regenError) {
      await supabase.from("canon_cascade_targets")
        .update({
          status: "failed",
          error_message: regenError,
          updated_at: new Date().toISOString(),
        })
        .eq("cascade_job_id", jobId)
        .eq("target_doc_id", docId);
      // Pause the job on error
      await supabase.from("canon_cascade_jobs")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      return;
    }

    // ── Read SR from newly-current version ────────────────────────────────
    // dev-engine-v2 sets is_current=true on the new version
    const sr = await readVersionSR(supabase, docId);

    // Get new version id
    const { data: newVer } = await supabase
      .from("project_document_versions")
      .select("id, meta_json")
      .eq("document_id", docId)
      .eq("is_current", true)
      .maybeSingle();

    const meta = newVer?.meta_json ?? {};
    const ci = meta.ci ?? meta.creative_integrity ?? null;
    const gp = meta.gp ?? meta.greenlight_probability ?? null;

    // ── Apply cascade gate ────────────────────────────────────────────────
    const promotionAllowed = sr?.promotionAllowed ?? false;
    const srStatus = sr?.srStatus ?? "UNSCORABLE";
    const srScore = sr?.srScore ?? null;
    const overrideAllowed = sr?.overrideAllowed ?? false;

    let targetStatus: string;
    let jobShouldPause = false;
    let jobShouldCancel = false;

    if (promotionAllowed) {
      targetStatus = "approved";
    } else if (srStatus === "AT_RISK") {
      targetStatus = "paused";
      jobShouldPause = true;
    } else if (srStatus === "BLOCKED") {
      targetStatus = "blocked";
      jobShouldPause = true;
    } else if (srStatus === "UNSCORABLE") {
      targetStatus = "failed";
      jobShouldCancel = true;
    } else {
      // promotion_allowed=false but status=READY — shouldn't happen, pause
      targetStatus = "paused";
      jobShouldPause = true;
    }

    await supabase.from("canon_cascade_targets")
      .update({
        status: targetStatus,
        new_version_id: newVer?.id ?? null,
        ci_score: ci,
        gp_score: gp,
        composite_score: ci != null && gp != null ? ci + gp : null,
        sr_status: srStatus,
        sr_score: srScore,
        promotion_allowed: promotionAllowed,
        override_allowed: overrideAllowed,
        updated_at: new Date().toISOString(),
      })
      .eq("cascade_job_id", jobId)
      .eq("target_doc_id", docId);

    if (jobShouldCancel) {
      await supabase.from("canon_cascade_jobs")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      console.log(`[canon-cascade-engine] job ${jobId} cancelled — UNSCORABLE on ${docType}`);
      return;
    }

    if (jobShouldPause) {
      await supabase.from("canon_cascade_jobs")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      console.log(`[canon-cascade-engine] job ${jobId} paused — ${srStatus} on ${docType}`);
      return;
    }

    console.log(`[canon-cascade-engine] target ${docType} approved, continuing cascade`);
  }

  // All downstream complete
  await supabase.from("canon_cascade_jobs")
    .update({ status: "complete", updated_at: new Date().toISOString() })
    .eq("id", jobId);
  console.log(`[canon-cascade-engine] job ${jobId} complete`);
}


