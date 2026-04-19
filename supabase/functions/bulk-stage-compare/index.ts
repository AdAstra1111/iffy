/**
 * bulk-stage-compare
 *
 * Runs stage-compare across all (or specified) foundation document types
 * for a project in one shot. Designed for post-regeneration drift audits.
 *
 * Request body:
 * {
 *   project_id: string,
 *   doc_types?: string[],   // defaults to all foundation types
 *   regenerate?: boolean    // if true, re-generate stale docs first via regenerate-stale-docs
 * }
 *
 * Returns:
 * {
 *   project_id: string,
 *   reports: Array<{
 *     document_type: string,
 *     document_id: string | null,
 *     status: "compared" | "skipped" | "error",
 *     error?: string,
 *     report?: {
 *       accuracy_score: number,
 *       total_claims: number,
 *       confirmed: number,
 *       contradicted: number,
 *       unverifiable: number,
 *       extrapolated: number,
 *       issues: string[],
 *       summary: string,
 *     }
 *   }>,
 *   overall_accuracy: number,   // weighted average, excludes skipped
 *   drift_count: number,         // docs with contradicted > 0
 *   hallucination_count: number, // docs with issues.length > 0
 *   actionable: boolean,         // true if any doc needs attention
 *   generated_at: string
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveGateway } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_DOC_TYPES = ["concept_brief", "beat_sheet", "character_bible", "treatment"] as const;

// ─── JSON extraction ───────────────────────────────────────────────────────────
function extractJSON(raw: string): any {
  let cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last !== -1) cleaned = cleaned.slice(first, last + 1);
  return JSON.parse(cleaned);
}

// ─── LLM caller ────────────────────────────────────────────────────────────────
async function callAI(systemPrompt: string, userPrompt: string, temperature = 0.15): Promise<string> {
  const gw = resolveGateway();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('LLM call timed out after 90s')), 90_000);
  try {
    const response = await fetch(gw.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${gw.apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens: 8000,
      }),
    });
    if (!response.ok) throw new Error(`AI gateway ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Single-doc stage-compare logic ──────────────────────────────────────────
async function compareDocument(
  sb: ReturnType<typeof createClient>,
  projectId: string,
  docType: string,
  documentId: string,
  scriptProjectId?: string,
): Promise<{ status: "compared" | "skipped" | "error"; report?: any; error?: string }> {
  try {
    // ── 1. Fetch generated document content ─────────────────────────────────
    let generatedContent: string | null = null;
    let generatedDocTitle = docType;

    const { data: docRecord } = await sb
      .from("project_documents")
      .select("id, doc_type, latest_version_id, title")
      .eq("id", documentId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (docRecord) {
      generatedDocTitle = docRecord.title || docRecord.doc_type || docType;
      const { data: versionRecord } = await sb
        .from("project_document_versions")
        .select("id, plaintext, version_number")
        .eq("document_id", docRecord.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      generatedContent = versionRecord?.plaintext || null;
    }

    if (!generatedContent) {
      // Try seed_pack_versions as fallback
      const { data: seedRecord } = await sb
        .from("seed_pack_versions")
        .select("id, content")
        .eq("id", documentId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (seedRecord?.content) {
        generatedContent = typeof seedRecord.content === "string"
          ? seedRecord.content
          : JSON.stringify(seedRecord.content);
      }
    }

    if (!generatedContent) {
      return { status: "skipped", error: `No content found for document ${documentId}` };
    }

    // ── 2. Fetch original script text ───────────────────────────────────────
    // Search in the doc's project first, then fall back to scriptProjectId
    const scriptSearchProjects = [
      ...(scriptProjectId && scriptProjectId !== projectId ? [scriptProjectId] : []),
      projectId,
    ];
    const { data: scriptDocs } = await sb
      .from("project_documents")
      .select("id, doc_type, latest_version_id")
      .in("project_id", scriptSearchProjects)
      .in("doc_type", ["script", "screenplay", "feature_script", "episode_script", "vertical_episode_script"]);

    let scriptText: string | null = null;
    if (scriptDocs && scriptDocs.length > 0) {
      const { data: scriptVersions } = await sb
        .from("project_document_versions")
        .select("id, document_id, plaintext, version_number, is_current, approval_status")
        .in("document_id", scriptDocs.map((d: any) => d.id))
        .order("version_number", { ascending: false });
      if (scriptVersions && scriptVersions.length > 0) {
        const current = scriptVersions.find((v: any) => v.is_current && v.approval_status === "approved");
        const approved = scriptVersions.find((v: any) => v.approval_status === "approved");
        const chosen = current || approved || scriptVersions[0];
        scriptText = chosen?.plaintext ?? null;
      }
    }

    if (!scriptText) {
      const { data: allVersions } = await sb
        .from("project_document_versions")
        .select("id, document_id, plaintext, version_number")
        .in("project_id", scriptSearchProjects)
        .not("plaintext", "is", null)
        .order("version_number", { ascending: false })
        .limit(20);
      if (allVersions && allVersions.length > 0) {
        const byLength = allVersions
          .filter((v: any) => v.plaintext && v.plaintext.length > 1000)
          .sort((a: any, b: any) => b.plaintext.length - a.plaintext.length);
        scriptText = byLength[0]?.plaintext ?? null;
      }
    }

    if (!scriptText) {
      return { status: "skipped", error: "No original script text found for this project" };
    }

    // ── 3. Fetch scene-level narrative units ─────────────────────────────────
    const { data: sceneUnits } = await sb
      .from("narrative_units")
      .select("id, unit_key, unit_type, payload_json")
      .eq("project_id", projectId)
      .eq("unit_type", "scene")
      .limit(200);

    const sceneContext = (sceneUnits || [])
      .map((u: any) => {
        const p = u.payload_json || {};
        return [
          `Scene ${u.unit_key || u.id}`,
          p.location ? `Location: ${p.location}` : null,
          p.characters?.length ? `Characters: ${p.characters.join(", ")}` : null,
          p.summary ? `Summary: ${p.summary}` : null,
        ].filter(Boolean).join(" | ");
      })
      .join("\n");

    // ── 4. Build prompts ─────────────────────────────────────────────────────
    const SCRIPT_CAP = 80_000;
    const DOC_CAP = 30_000;
    const scriptSnippet = scriptText.length > SCRIPT_CAP
      ? scriptText.slice(0, SCRIPT_CAP) + "\n[...truncated]"
      : scriptText;
    const docSnippet = generatedContent.length > DOC_CAP
      ? generatedContent.slice(0, DOC_CAP) + "\n[...truncated]"
      : generatedContent;

    const systemPrompt = `You are IFFY — an elite film/TV compliance and accuracy analysis engine. Your task is to audit a reverse-engineered document against the original source script and produce a rigorous, structured compliance report.

You will:
1. Extract key claims from the generated document (character names, locations, plot beats, timeline events, relationships, themes)
2. Verify each claim against the original script
3. Classify each claim as:
   - confirmed: explicitly supported by the script
   - contradicted: directly conflicts with the script
   - unverifiable: cannot be confirmed or denied from the script text
   - extrapolated: a reasonable inference not explicitly stated
4. Calculate an accuracy score (0-100) based on confirmed / (total non-extrapolated claims)
5. List specific hallucinations, misalignments, or errors as issues

Respond ONLY with valid JSON matching this exact structure:
{
  "accuracy_score": number (0-100),
  "total_claims": number,
  "confirmed": number,
  "contradicted": number,
  "unverifiable": number,
  "extrapolated": number,
  "issues": ["string — specific factual error or misalignment", ...],
  "summary": "string — 2-4 sentence executive summary of the compliance assessment"
}`;

    const userPrompt = `DOCUMENT TYPE: ${docType.replace(/_/g, " ").toUpperCase()}
DOCUMENT TITLE: ${generatedDocTitle}

===== GENERATED DOCUMENT (to be audited) =====
${docSnippet}

===== ORIGINAL SOURCE SCRIPT =====
${scriptSnippet}

${sceneContext ? `===== SCENE-LEVEL INDEX (from script analysis) =====\n${sceneContext}\n` : ""}

Audit the generated document against the original script. Extract every factual claim (character names, locations, plot events, relationships, timeline, themes) and verify each against the source script. Return your compliance report as JSON now.`;

    // ── 5. Call LLM ───────────────────────────────────────────────────────────
    const rawResponse = await callAI(systemPrompt, userPrompt);
    let report: Record<string, any>;
    try {
      report = extractJSON(rawResponse);
    } catch {
      return { status: "error", error: "Failed to parse AI compliance report", report: null };
    }

    const normalised = {
      accuracy_score: Number(report.accuracy_score ?? 0),
      total_claims: Number(report.total_claims ?? 0),
      confirmed: Number(report.confirmed ?? 0),
      contradicted: Number(report.contradicted ?? 0),
      unverifiable: Number(report.unverifiable ?? 0),
      extrapolated: Number(report.extrapolated ?? 0),
      issues: Array.isArray(report.issues) ? report.issues : [],
      summary: String(report.summary ?? ""),
    };

    // ── 6. Store in narrative_units ──────────────────────────────────────────
    const unitKey = `bulk_stage_compare:${docType}:${documentId}`;
    const { data: existingUnit } = await sb
      .from("narrative_units")
      .select("id")
      .eq("project_id", projectId)
      .eq("unit_type", "bulk_stage_compare")
      .eq("unit_key", unitKey)
      .maybeSingle();

    const jobPayload = {
      status: "complete",
      document_id: documentId,
      document_type: docType,
      generated_at: new Date().toISOString(),
      report: normalised,
    };

    if (existingUnit?.id) {
      await sb.from("narrative_units").update({ payload_json: jobPayload }).eq("id", existingUnit.id);
    } else {
      await sb.from("narrative_units").insert({
        project_id: projectId,
        unit_type: "bulk_stage_compare",
        unit_key: unitKey,
        status: "complete",
        payload_json: jobPayload,
      });
    }

    return { status: "compared", report: normalised };
  } catch (err: any) {
    return { status: "error", error: err?.message || "Unknown error" };
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth: support both user JWTs and internal service-key bypass ───────────────
    // Internal bypass: pass {"service_key": "<PAT>"} in request body.
    // This lets server-side callers (Trinity exec, cron jobs) invoke without a user JWT.
    const authHeader = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    const INTERNAL_BYPASS_KEY = Deno.env.get("SERVICE_KEY_BYPASS") ??
      "sbp_df2d8c24a726e40ac574b56565260ef017a026cb";

    if (body.service_key === INTERNAL_BYPASS_KEY) {
      // Internal server-side call — skip user JWT, use service role for DB
      (req as any)._userId = "00000000-0000-0000-0000-000000000000";
    } else {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sbUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await sbUser.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      (req as any)._userId = user.id;
    }

    // Parse body AFTER auth check
    const { project_id, doc_types: requestedDocTypes, regenerate_first, script_project_id } = body as {
      project_id?: string;
      doc_types?: string[];
      regenerate_first?: boolean;
      script_project_id?: string;
    };

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docTypes = requestedDocTypes?.length
      ? requestedDocTypes
      : DEFAULT_DOC_TYPES;

    // ── Optional: regenerate stale docs first ────────────────────────────────
    if (regenerate_first) {
      try {
        const staleRes = await fetch(`${SUPABASE_URL}/functions/v1/regenerate-stale-docs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ projectId: project_id, docTypes, mode: "draft" }),
        });
        console.log("[bulk-stage-compare] regenerate-stale-docs:", staleRes.status);
      } catch (e: any) {
        console.warn("[bulk-stage-compare] regenerate-stale-docs failed:", e.message);
      }
    }

    // ── Find document IDs for each doc type ──────────────────────────────────
    const { data: projectDocs } = await sb
      .from("project_documents")
      .select("id, doc_type, doc_role, latest_version_id")
      .eq("project_id", project_id)
      .in("doc_type", docTypes);

    const docIdMap: Record<string, string | null> = {};
    for (const dt of docTypes) {
      const found = (projectDocs || []).find(
        (d: any) => d.doc_type === dt && d.latest_version_id,
      );
      docIdMap[dt] = found?.id ?? null;
    }

    // ── Run compare for each doc type sequentially ────────────────────────────
    const reports: any[] = [];
    for (const docType of docTypes) {
      const documentId = docIdMap[docType];
      if (!documentId) {
        reports.push({
          document_type: docType,
          document_id: null,
          status: "skipped",
          error: `No document of type ${docType} found for this project`,
        });
        continue;
      }
      console.log(`[bulk-stage-compare] Comparing ${docType} (${documentId})…`);
      const result = await compareDocument(sb, project_id, docType, documentId, script_project_id);
      reports.push({
        document_type: docType,
        document_id: documentId,
        ...result,
      });
    }

    // ── Compute summary stats ─────────────────────────────────────────────────
    const compared = reports.filter(r => r.status === "compared");
    const overall_accuracy = compared.length > 0
      ? Math.round(
          compared.reduce((sum, r) => sum + (r.report?.accuracy_score ?? 0), 0) / compared.length
        )
      : 0;
    const drift_count = compared.filter(r => (r.report?.contradicted ?? 0) > 0).length;
    const hallucination_count = compared.filter(r => (r.report?.issues?.length ?? 0) > 0).length;
    const actionable = drift_count > 0 || hallucination_count > 0 || compared.length < docTypes.length;

    const response = {
      project_id,
      reports,
      overall_accuracy,
      drift_count,
      hallucination_count,
      actionable,
      generated_at: new Date().toISOString(),
    };

    console.log(`[bulk-stage-compare] Done. overall_accuracy=${overall_accuracy}, drift=${drift_count}, hallucination=${hallucination_count}, actionable=${actionable}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[bulk-stage-compare] Unhandled error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
