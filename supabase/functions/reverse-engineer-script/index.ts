import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Stages ──────────────────────────────────────────────────────────────────
const JOB_STAGES = [
  { key: "structure",       label: "Analysing script structure..." },
  { key: "beat_sheet",      label: "Building beat sheet..." },
  { key: "character_bible",  label: "Building character bible..." },
  { key: "storing_docs",    label: "Saving foundation documents..." },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveGatewayKey(): { key: string; baseUrl: string; model: string } {
  const lovable = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("OPENROUTER_API_KEY");
  if (lovable) return { key: lovable, baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-2.5-flash" };
  const openai = Deno.env.get("OPENAI_API_KEY");
  if (openai) return { key: openai, baseUrl: "https://api.openai.com/v1", model: "gpt-4o" };
  throw new Error("No AI gateway key configured");
}

async function callLLM(prompt: string, maxTokens = 8000): Promise<any> {
  const { key, baseUrl, model } = resolveGatewayKey();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.25 }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000)); continue; }
        throw new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
      }
      const raw = (await res.json()).choices[0].message.content as string;
      const cleaned = raw.replace(/^```json\s*/im, "").replace(/^```\s*/im, "").replace(/\s*```$/im, "").trim();
      try { return JSON.parse(cleaned); }
      catch { const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}"); if (s !== -1 && e !== -1) return JSON.parse(cleaned.slice(s, e + 1)); throw new Error("No valid JSON in LLM response"); }
    } catch (err: any) { if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000)); else throw err; }
  }
  throw new Error("LLM call failed");
}

async function storeDoc(sb: any, projectId: string, scriptDocId: string, userId: string | null, docType: string, docRole: string, title: string, data: any): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const plaintext = Object.entries(data).map(([k, v]) => {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return `${k.toUpperCase().replace(/_/g," ")}\n${v.map((i: any) => typeof i === "object" ? JSON.stringify(i, null, 2) : `• ${i}`).join("\n")}`;
    if (typeof v === "object") return `${k.toUpperCase().replace(/_/g," ")}\n${JSON.stringify(v, null, 2)}`;
    return `${k.toUpperCase().replace(/_/g," ")}\n${v}`;
  }).filter(Boolean).join("\n\n");

  const { data: doc, error } = await sb.from("project_documents").upsert({ project_id: projectId, doc_type: docType, doc_role: docRole, title, plaintext, user_id }, { onConflict: "project_id,doc_type" }).select("id").single();
  if (error || !doc) throw new Error(`Failed to upsert ${docType}: ${error?.message}`);
  try {
    const { createVersion } = await import("../_shared/doc-os.ts");
    const ver = await createVersion(sb, { documentId: doc.id, docType, plaintext: content, label: "v1 (reverse-engineered)", createdBy: userId || "system", approvalStatus: "approved", isStale: false, generatorId: "reverse-engineer-script", inputsUsed: { extracted_from: scriptDocId }, metaJson: { reverse_engineered: true } });
    if (ver) await sb.from("project_documents").update({ latest_version_id: ver.id }).eq("id", doc.id);
  } catch (e) { console.warn("Version creation skipped:", e); }
}

function updateStage(payload: any, stageKey: string, status: string) {
  if (payload.stages?.[stageKey]) payload.stages[stageKey].status = status;
  payload.current_stage = stageKey;
  payload.updated_at = new Date().toISOString();
}

// ─── Main handler (returns job_id immediately) ────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Background worker (called by the foreground) ──────────────────────────
  const body = await req.json().catch(() => ({}));
  if (body._bg && body._job_id) {
    // ── ACTUAL WORK: runs after main response is sent ──────────────────────
    const { _job_id: jobId, project_id, script_document_id, user_id, script_text, format } = body;
    let payload: any = null;
    try {
      const { data: job } = await sb.from("narrative_units").select("id, payload_json").eq("id", jobId).single();
      if (!job) return new Response("job not found", { status: 404 });
      payload = { ...job.payload_json };

      // Structure analysis
      updateStage(payload, "structure", "running");
      await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);
      const call1 = await callLLM(`You are a senior script analyst. Analyse this ${format} script.\n\nSCRIPT:\n${script_text.slice(0, 42000)}\n\nReturn JSON: {"metadata":{...},"concept_brief":{...},"market_sheet":{...},"treatment":{...},"voice_profile":{...}}`, 10000);

      // Beat sheet
      updateStage(payload, "beat_sheet", "running");
      await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);
      const call2 = await callLLM(`Extract a beat sheet from this ${format} script.\n\nSCRIPT:\n${script_text.slice(0, 42000)}\n\nReturn JSON: {"title":"","total_beats":N,"beats":[{"number":1,"name":"","page_range":"","description":"","emotional_shift":"","protagonist_state":"","dramatic_function":""}],"structural_notes":"","pacing_notes":"","turning_points":[]}`.slice(0, 4000) + `\n\nSCRIPT:\n${script_text.slice(0, 42000)}`, 8000);

      // Character bible
      updateStage(payload, "character_bible", "running");
      await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);
      const call3 = await callLLM(`Write a complete character bible for this ${format} script.\n\nSCRIPT:\n${script_text.slice(0, 42000)}\n\nReturn JSON: {"characters":[{"name":"","age":"","role":"","physical_description":"","backstory":"","psychology":"","want":"","need":"","fatal_flaw":"","arc":"","voice_and_speech":"","sample_dialogue":"","casting_suggestions":[]}],"relationship_dynamics":"","ensemble_notes":""}`, 8000);

      // Store docs
      updateStage(payload, "storing_docs", "running");
      await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);

      const { metadata } = call1;
      const isTV = format === "tv-series";

      await storeDoc(sb, project_id, script_document_id, user_id, "concept_brief", "creative_primary", `${metadata.title} — Concept Brief`,
        { title: metadata.title, logline: metadata.logline, genre: metadata.genre, subgenre: metadata.subgenre, tone: metadata.tone, themes: metadata.themes || [], target_audience: metadata.target_audience, ...call1.concept_brief });

      const marketType = isTV ? "vertical_market_sheet" : "market_sheet";
      await storeDoc(sb, project_id, script_document_id, user_id, marketType, "creative_primary", `${metadata.title} — Market Sheet`,
        { title: metadata.title, logline: metadata.logline, genre: metadata.genre, format, ...call1.market_sheet });

      const arcType = isTV ? "season_arc" : "treatment";
      await storeDoc(sb, project_id, script_document_id, user_id, arcType, "creative_primary", `${metadata.title} — ${isTV ? "Season Arc" : "Treatment"}`,
        { title: metadata.title, logline: metadata.logline, format, ...call1.treatment });

      const beatType = isTV ? "format_rules" : "beat_sheet";
      await storeDoc(sb, project_id, script_document_id, user_id, beatType, "creative_primary", `${metadata.title} — Beat Sheet`, call2);

      await storeDoc(sb, project_id, script_document_id, user_id, "character_bible", "creative_primary", `${metadata.title} — Character Bible`, call3);

      const outlineType = isTV ? "episode_grid" : "story_outline";
      await storeDoc(sb, project_id, script_document_id, user_id, outlineType, "creative_primary", `${metadata.title} — Story Outline`,
        { title: metadata.title, format, entries: call2.beats?.slice(0, 20)?.map((b: any, i: number) => ({ number: i + 1, title: b.name, description: b.description })) || [] });

      try {
        const { data: canon } = await sb.from("project_canon").select("id, canon_json").eq("project_id", project_id).single();
        if (canon) await sb.from("project_canon").update({ canon_json: { ...(canon.canon_json || {}), voice_profile: call1.voice_profile, title: metadata.title } }).eq("id", canon.id);
        else await sb.from("project_canon").insert({ project_id, canon_json: { voice_profile: call1.voice_profile, title: metadata.title } });
      } catch (_) {}

      await sb.from("projects").update({ title: metadata.title, lifecycle_stage: outlineType, format: isTV ? "tv-series" : "film" }).eq("id", project_id);

      for (const s of JOB_STAGES) updateStage(payload, s.key, "done");
      payload.status = "done";
      payload.current_stage = "done";
      payload.updated_at = new Date().toISOString();
      payload.result = { title: metadata.title, documents_created: ["concept_brief", marketType, arcType, beatType, "character_bible", outlineType] };

    } catch (err: any) {
      console.error("[reverse-engineer] background error:", err?.message);
      if (payload) { payload.status = "error"; payload.error = err?.message; payload.updated_at = new Date().toISOString(); }
    }
    if (payload) await sb.from("narrative_units").update({ payload_json: payload }).eq("id", jobId);
    return new Response(JSON.stringify({ ok: true, job_id: jobId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── Foreground: create job, return immediately ───────────────────────────
  try {
    const { project_id, script_document_id, script_version_id, user_id } = body;
    if (!project_id || !script_document_id)
      return new Response(JSON.stringify({ error: "project_id and script_document_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch script text
    let scriptText = "";
    if (script_version_id) {
      const { data: v } = await sb.from("project_document_versions").select("plaintext").eq("id", script_version_id).maybeSingle();
      scriptText = v?.plaintext || "";
    }
    if (!scriptText) {
      const { data: doc } = await sb.from("project_documents").select("plaintext, latest_version_id").eq("id", script_document_id).maybeSingle();
      if (doc?.latest_version_id) {
        const { data: latestVer } = await sb.from("project_document_versions").select("plaintext").eq("id", doc.latest_version_id).maybeSingle();
        scriptText = latestVer?.plaintext || "";
      }
      if (!scriptText && doc?.plaintext) scriptText = doc.plaintext;
    }
    if (!scriptText) {
      const { data: latestVer } = await sb.from("project_document_versions").select("plaintext").eq("document_id", script_document_id).order("version_number", { ascending: false }).limit(1).maybeSingle();
      scriptText = latestVer?.plaintext || "";
    }
    if (!scriptText || scriptText.length < 100)
      return new Response(JSON.stringify({ error: "Script text not found — ensure the script has been uploaded and saved." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const isTV = /\b(episode\s*\d|ep\.?\s*\d|season\s*\d|series\s*\d)\b/i.test(scriptText.slice(0, 3000));
    const format = isTV ? "tv-series" : "film";

    // Create job record in narrative_units
    const jobKey = `reverse_job_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const jobRecord = {
      unit_type: "async_job",
      unit_key: jobKey,
      project_id,
      source_doc_type: "script",
      payload_json: {
        job_type: "reverse_engineer",
        script_document_id,
        user_id,
        status: "pending",
        current_stage: "pending",
        stages: JOB_STAGES.reduce((acc: any, s) => { acc[s.key] = { label: s.label, status: "pending" }; return acc; }, {}),
        result: null,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      status: "active",
    };

    const { data: created, error: jobErr } = await sb.from("narrative_units").insert(jobRecord).select("id").single();
    if (jobErr || !created)
      return new Response(JSON.stringify({ error: `Failed to create job: ${jobErr?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Update job to running
    const runningPayload = { ...jobRecord.payload_json, status: "running", current_stage: JOB_STAGES[0].key, stages: { ...jobRecord.payload_json.stages, [JOB_STAGES[0].key]: { label: JOB_STAGES[0].label, status: "running" } } };
    await sb.from("narrative_units").update({ payload_json: runningPayload }).eq("id", created.id);

    // Trigger background work (fire-and-forget)
    const bgPayload = JSON.stringify({ _bg: true, _job_id: created.id, project_id, script_document_id, user_id, script_text: scriptText, format });
    // Use nohup-style approach: spawn a throwaway fetch that will complete even after response is sent
    // Since Edge Functions are synchronous HTTP, we use a detached fetch:
    const bgHeaders = new Headers({ "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` });
    // The fetch itself will run until completion before the edge function terminates
    // To ensure it survives, we don't await it:
    fetch(`${SUPABASE_URL}/functions/v1/reverse-engineer-script`, { method: "POST", headers: bgHeaders, body: bgPayload }).catch(e => console.error("[bg] fetch failed:", e));

    return new Response(JSON.stringify({
      job_id: created.id,
      status: "running",
      message: "Reverse-engineering started",
      stages: JOB_STAGES,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("[reverse-engineer] error:", err?.message);
    return new Response(JSON.stringify({ error: err?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
