/**
 * stage-compare
 *
 * Diffs a reverse-engineered document against the original source script to
 * produce a compliance/accuracy report.
 *
 * Request body: { project_id, document_id, document_type }
 * document_type: "concept_brief" | "beat_sheet" | "character_bible" | "treatment"
 *
 * Returns:
 * {
 *   accuracy_score: number,
 *   total_claims: number,
 *   confirmed: number,
 *   contradicted: number,
 *   unverifiable: number,
 *   extrapolated: number,
 *   issues: string[],
 *   summary: string
 * }
 *
 * Also stores the report in a narrative_units record tagged unit_type="stage_compare".
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveGateway } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Document types that come from project_documents / project_document_versions ───
const PROJECT_DOC_TYPES = ["concept_brief", "beat_sheet", "character_bible", "treatment"] as const;
type DocumentType = typeof PROJECT_DOC_TYPES[number];

// ─── callAI helper ─────────────────────────────────────────────────────────────
async function callAI(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.15,
): Promise<string> {
  const gw = resolveGateway();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('LLM call timed out after 90s')), 90_000);

  try {
    const response = await fetch(gw.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gw.apiKey}`,
        "Content-Type": "application/json",
      },
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

    if (!response.ok) {
      if (response.status === 429) throw new Error("Rate limit exceeded. Please try again in a moment.");
      if (response.status === 402) throw new Error("AI usage limit reached. Please add credits.");
      const errText = await response.text();
      console.error("[stage-compare] AI gateway error:", response.status, errText);
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("Stage compare analysis timed out.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── JSON extraction ───────────────────────────────────────────────────────────
function extractJSON(raw: string): any {
  // Strip markdown fences
  let cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last !== -1) cleaned = cleaned.slice(first, last + 1);
  return JSON.parse(cleaned);
}

// ─── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { project_id, document_id, document_type } = body as {
      project_id: string;
      document_id: string;
      document_type: DocumentType;
    };

    if (!project_id || !document_id || !document_type) {
      return new Response(
        JSON.stringify({ error: "project_id, document_id, and document_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!PROJECT_DOC_TYPES.includes(document_type)) {
      return new Response(
        JSON.stringify({ error: `document_type must be one of: ${PROJECT_DOC_TYPES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Supabase client (service role for full access) ──────────────────────
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 1. Fetch the generated document content ─────────────────────────────
    console.log(`[stage-compare] Fetching ${document_type} doc ${document_id} for project ${project_id}`);

    // Try project_documents first, then seed_pack_versions as fallback
    let generatedContent: string | null = null;
    let generatedDocTitle: string = document_type;

    // Look up in project_documents
    const { data: docRecord, error: docErr } = await sb
      .from("project_documents")
      .select("id, doc_type, latest_version_id, title")
      .eq("id", document_id)
      .eq("project_id", project_id)
      .maybeSingle();

    if (docRecord) {
      generatedDocTitle = docRecord.title || docRecord.doc_type || document_type;

      // Get the latest version's plaintext
      const { data: versionRecord } = await sb
        .from("project_document_versions")
        .select("id, plaintext, version_number")
        .eq("document_id", docRecord.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (versionRecord?.plaintext) {
        generatedContent = versionRecord.plaintext;
      }
    }

    // Fallback: try seed_pack_versions
    if (!generatedContent) {
      const { data: seedRecord } = await sb
        .from("seed_pack_versions")
        .select("id, content, doc_type")
        .eq("id", document_id)
        .eq("project_id", project_id)
        .maybeSingle();

      if (seedRecord?.content) {
        generatedContent = typeof seedRecord.content === "string"
          ? seedRecord.content
          : JSON.stringify(seedRecord.content);
      }
    }

    if (!generatedContent) {
      return new Response(
        JSON.stringify({ error: `No content found for document ${document_id}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 2. Fetch the original script text ───────────────────────────────────
    // Look for the source script document (doc_type = "script" or "screenplay")
    const { data: scriptDocs } = await sb
      .from("project_documents")
      .select("id, doc_type, latest_version_id")
      .eq("project_id", project_id)
      .in("doc_type", ["script", "screenplay", "feature_script", "episode_script", "vertical_episode_script"]);

    let scriptText: string | null = null;

    if (scriptDocs && scriptDocs.length > 0) {
      const scriptDocIds = scriptDocs.map((d: any) => d.id);

      const { data: scriptVersions } = await sb
        .from("project_document_versions")
        .select("id, document_id, plaintext, version_number, is_current, approval_status")
        .in("document_id", scriptDocIds)
        .order("version_number", { ascending: false });

      if (scriptVersions && scriptVersions.length > 0) {
        // Prefer current approved version, then any approved, then latest
        const current = scriptVersions.find((v: any) => v.is_current && v.approval_status === "approved");
        const approved = scriptVersions.find((v: any) => v.approval_status === "approved");
        const chosen = current || approved || scriptVersions[0];
        scriptText = chosen?.plaintext ?? null;
      }
    }

    // Fallback: look for any plaintext document version with a large body (likely a script)
    if (!scriptText) {
      const { data: allVersions } = await sb
        .from("project_document_versions")
        .select("id, document_id, plaintext, version_number")
        .eq("project_id", project_id)
        .not("plaintext", "is", null)
        .order("version_number", { ascending: false })
        .limit(20);

      if (allVersions && allVersions.length > 0) {
        // Pick the largest plaintext (most likely to be the full script)
        const byLength = allVersions
          .filter((v: any) => v.plaintext && v.plaintext.length > 1000)
          .sort((a: any, b: any) => b.plaintext.length - a.plaintext.length);
        scriptText = byLength[0]?.plaintext ?? null;
      }
    }

    if (!scriptText) {
      return new Response(
        JSON.stringify({ error: "No original script text found for this project." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 3. Fetch scene-level narrative units ────────────────────────────────
    const { data: sceneUnits } = await sb
      .from("narrative_units")
      .select("id, unit_key, unit_type, payload_json")
      .eq("project_id", project_id)
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

    // ── 4. Call LLM for compliance/accuracy report ──────────────────────────
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

    const userPrompt = `DOCUMENT TYPE: ${document_type.replace(/_/g, " ").toUpperCase()}
DOCUMENT TITLE: ${generatedDocTitle}

===== GENERATED DOCUMENT (to be audited) =====
${docSnippet}

===== ORIGINAL SOURCE SCRIPT =====
${scriptSnippet}

${sceneContext ? `===== SCENE-LEVEL INDEX (from script analysis) =====\n${sceneContext}\n` : ""}

Audit the generated document against the original script. Extract every factual claim (character names, locations, plot events, relationships, timeline, themes) and verify each against the source script. Return your compliance report as JSON now.`;

    console.log(`[stage-compare] Calling LLM for compliance analysis...`);
    const rawResponse = await callAI(systemPrompt, userPrompt);

    let report: Record<string, any>;
    try {
      report = extractJSON(rawResponse);
    } catch (parseErr) {
      console.error("[stage-compare] Failed to parse LLM response:", rawResponse.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse AI compliance report. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate and normalise the report shape
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

    // ── 5. Store the report in narrative_units (unit_type = "stage_compare") ─
    const jobPayload = {
      status: "complete",
      document_id,
      document_type,
      generated_at: new Date().toISOString(),
      report: normalised,
    };

    // Upsert: use document_id + document_type as a natural key for idempotency
    const unitKey = `stage_compare:${document_id}`;
    const { data: existingUnit } = await sb
      .from("narrative_units")
      .select("id")
      .eq("project_id", project_id)
      .eq("unit_type", "stage_compare")
      .eq("unit_key", unitKey)
      .maybeSingle();

    let jobId: string | null = null;

    if (existingUnit?.id) {
      jobId = existingUnit.id;
      await sb
        .from("narrative_units")
        .update({ payload_json: jobPayload })
        .eq("id", jobId);
      console.log(`[stage-compare] Updated existing stage_compare unit ${jobId}`);
    } else {
      const { data: newUnit, error: insertErr } = await sb
        .from("narrative_units")
        .insert({
          project_id,
          unit_type: "stage_compare",
          unit_key: unitKey,
          status: "complete",
          payload_json: jobPayload,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("[stage-compare] Failed to insert narrative_unit:", insertErr);
      } else {
        jobId = newUnit?.id ?? null;
        console.log(`[stage-compare] Created new stage_compare unit ${jobId}`);
      }
    }

    // ── 6. Return the report ────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ ...normalised, unit_id: jobId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[stage-compare] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
