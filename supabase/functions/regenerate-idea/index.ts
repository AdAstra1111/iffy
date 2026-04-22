/**
 * regenerate-idea
 * Lightweight Idea regeneration — skips text extraction, entity linking,
 * beat sheet, character bible, and all other pipeline stages.
 * Only re-synthesizes the Idea doc from the script text already in the DB.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callLLM(prompt: string, maxTokens = 6000): Promise<string> {
  const lovable = Deno.env.get("OPENROUTER_API_KEY");
  const openai = Deno.env.get("OPENAI_API_KEY");
  const openrouter = Deno.env.get("OPENROUTER_API_KEY");

  let key = lovable || openai || openrouter;
  let baseUrl = "https://openrouter.ai/api/v1";
  let model = "google/gemini-2.5-flash";

  if (lovable) { baseUrl = "https://openrouter.ai/api/v1"; model = "google/gemini-2.5-flash"; }
  else if (openai) { baseUrl = "https://api.openai.com/v1"; model = "gpt-4o"; }
  else if (openrouter) { baseUrl = "https://openrouter.ai/api/v1"; model = "openai/gpt-4o"; }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a JSON-only API. Return ONLY valid JSON — no markdown, no explanation, no code fences." },
        { role: "user", content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content as string;
}

function extractJSON(raw: string): any {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
  s = s.replace(/^```json\s*/im, "").replace(/^```\s*/im, "").replace(/\s*```$/im, "").trim();
  try { return JSON.parse(s); } catch (_) {}
  const open = s.indexOf("{"), close = s.lastIndexOf("}");
  if (open !== -1 && close > open) { try { return JSON.parse(s.slice(open, close + 1)); } catch (_) {} }
  const match = s.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch (_) {} }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const { project_id } = body as { project_id: string };

  if (!project_id) {
    return new Response(JSON.stringify({ error: "project_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Find the script document
    const { data: scriptDoc } = await sb
      .from("project_documents")
      .select("id, plaintext, extracted_text, latest_version_id")
      .eq("project_id", project_id)
      .like("doc_type", "%script%")
      .single();

    if (!scriptDoc) {
      return new Response(JSON.stringify({ error: "No script found for this project" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get script text — prefer plaintext, fall back to extracted_text
    let scriptText = scriptDoc.plaintext || "";
    if (!scriptText && scriptDoc.extracted_text) scriptText = scriptDoc.extracted_text;
    if (!scriptText && scriptDoc.latest_version_id) {
      const { data: ver } = await sb
        .from("project_document_versions")
        .select("plaintext")
        .eq("id", scriptDoc.latest_version_id)
        .single();
      scriptText = ver?.plaintext || "";
    }

    if (!scriptText || scriptText.length < 100) {
      return new Response(JSON.stringify({ error: "Script text not found — ensure the script has been uploaded and saved" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isTV = /\b(episode\s*\d|ep\.?\s*\d|season\s*\d|series\s*\d)\b/i.test(scriptText.slice(0, 3000));
    const format = isTV ? "tv-series" : "film";
    const SCRIPT_SAMPLE = scriptText.slice(0, 30000);

    // 3. Fetch the project's current resolver hash
    const { data: proj } = await sb
      .from("projects")
      .select("resolved_qualifications_hash, title")
      .eq("id", project_id)
      .single();

    const resolverHash = scriptDoc.latest_version_id || undefined;
    const scriptTitle = proj?.title || "Script";

    // 4. Synthesize Idea content — single LLM call, no pipeline
    const ideaRaw = await callLLM(`You are a senior film/TV development analyst. Read this ${format} script extract and produce the Idea document fields.

SCRIPT EXTRACT:
${SCRIPT_SAMPLE}

RULES:
- title: extract or derive the story title from the content
- logline: 1-2 sentence summary covering protagonist, world, and central conflict
- genre: primary genre (e.g. action-adventure, drama, horror, sci-fi, comedy, thriller)
- subgenre: specific subgenre (e.g. creature feature, period action, survival thriller)
- tone: overall tonal energy in 2-4 keywords (e.g. pulp adventurous high-stakes, dark brooding psychological)
- themes: array of 2-4 core thematic concerns
- target_audience: who this is for in one sentence

Return ONLY valid JSON:
{
  "title": "string",
  "logline": "string",
  "genre": "string",
  "subgenre": "string or null",
  "tone": "string or null",
  "themes": ["string"],
  "target_audience": "string or null"
}`, 4000);

    const ideaParsed = extractJSON(ideaRaw);
    if (!ideaParsed) {
      return new Response(JSON.stringify({ error: "Failed to parse Idea from LLM response", raw: ideaRaw?.slice(0, 500) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Upsert and create version with correct resolver hash
    const ideaData = {
      title: ideaParsed.title || proj?.title || "Untitled",
      logline: ideaParsed.logline || "",
      genre: ideaParsed.genre || null,
      subgenre: ideaParsed.subgenre || null,
      tone: ideaParsed.tone || null,
      themes: Array.isArray(ideaParsed.themes) ? ideaParsed.themes : [],
      target_audience: ideaParsed.target_audience || null,
    };

    const { createVersion } = await import("../_shared/doc-os.ts");

    const { data: ideaDoc, error: upsertErr } = await sb
      .from("project_documents")
      .upsert(
        { project_id, doc_type: "idea", doc_role: "creative_primary", title: ideaData.title },
        { onConflict: "project_id,doc_type" }
      )
      .select("id")
      .single();

    if (upsertErr || !ideaDoc) {
      return new Response(JSON.stringify({ error: `Failed to upsert idea: ${upsertErr?.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If there's a previously approved Idea version, supersede it so only one is approved at a time
    const { data: prevApproved } = await sb
      .from("project_document_versions")
      .select("id")
      .eq("document_id", ideaDoc.id)
      .eq("approval_status", "approved");
    if (prevApproved && prevApproved.length > 0) {
      await sb
        .from("project_document_versions")
        .update({ approval_status: "superseded" })
        .in("id", prevApproved.map((v: any) => v.id));
    }

    const content = JSON.stringify(ideaData, null, 2);
    const plaintext = Object.entries(ideaData)
      .map(([k, v]) => v == null ? "" : `${k.toUpperCase().replace(/_/g, " ")}\n${Array.isArray(v) ? v.join(", ") : v}`)
      .filter(Boolean)
      .join("\n\n");

    const ver = await createVersion(sb, {
      documentId: ideaDoc.id,
      docType: "idea",
      plaintext: content,
      label: "v1 (regenerated)",
      createdBy: "system",
      approvalStatus: "draft",
      isStale: false,
      generatorId: "regenerate-idea",
      dependsOnResolverHash: resolverHash,
      metaJson: { regenerated_at: new Date().toISOString(), source_script: scriptDoc.id, source_script_version: scriptDoc.latest_version_id },
    });

    if (ver) {
      await sb.from("project_documents").update({ latest_version_id: ver.id, plaintext }).eq("id", ideaDoc.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      idea_version_id: ver?.id,
      idea_doc_id: ideaDoc.id,
      resolver_hash: resolverHash,
      idea: ideaData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[regenerate-idea] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
