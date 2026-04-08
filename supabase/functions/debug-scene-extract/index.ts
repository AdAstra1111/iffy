import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { project_id } = await req.json();
    if (!project_id) return new Response(JSON.stringify({ error: "project_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get project documents
    const { data: docs } = await supabase
      .from("project_documents")
      .select("id, doc_type, created_at")
      .eq("project_id", project_id)
      .in("doc_type", ["script", "script_pdf", "treatment"])
      .order("created_at", { ascending: false })
      .limit(5);

    // Get plaintext from latest script version
    let scriptText = "";
    let versionId = "";
    let docId = docs?.[0]?.id || "";
    
    if (docId) {
      const { data: ver } = await supabase
        .from("project_document_versions")
        .select("id, plaintext")
        .eq("document_id", docId)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();
      scriptText = ver?.plaintext || "";
      versionId = ver?.id || "";
    }

    const lines = scriptText.split('\n');
    const sluglineStartPattern = /^(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.?)\s/i;
    const sluglineStartNoSpacePattern = /^(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.?)/i;
    const orphanedNumberPattern = /^\s*(\d+)\s*[\.\)\s]*$/;
    const sceneBreaks: { startLine: number; headingLine: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (sluglineStartPattern.test(line)) {
        let headingLine = line;
        if (i > 0 && orphanedNumberPattern.test(lines[i - 1])) {
          const num = lines[i - 1].trim().replace(/[\.\)]+$/, '');
          headingLine = `${num}\n${line}`;
        }
        sceneBreaks.push({ startLine: i, headingLine });
      } else if (sluglineStartNoSpacePattern.test(line)) {
        let headingLine = line;
        if (i > 0 && orphanedNumberPattern.test(lines[i - 1])) {
          const num = lines[i - 1].trim().replace(/[\.\)]+$/, '');
          headingLine = `${num}\n${line}`;
        }
        sceneBreaks.push({ startLine: i, headingLine });
      }
    }

    // Write to debug table
    const { error: insertErr } = await supabase.from("scene_extract_debug").insert({
      project_id,
      script_length: scriptText.length,
      doc_id: docId || null,
      version_id: versionId || null,
      first_200: scriptText.slice(0, 200),
      lines_0_5: lines.slice(0, 5).join('|'),
      lines_5_10: lines.slice(5, 10).join('|'),
      lines_10_15: lines.slice(10, 15).join('|'),
      scene_count: sceneBreaks.length,
    });

    return new Response(JSON.stringify({
      ok: true,
      project_id,
      script_length: scriptText.length,
      doc_id: docId,
      version_id: versionId,
      first_200: scriptText.slice(0, 200),
      lines_0_5: lines.slice(0, 5),
      lines_5_10: lines.slice(5, 10),
      lines_10_15: lines.slice(10, 15),
      scene_breaks_found: sceneBreaks.length,
      scene_headings: sceneBreaks.slice(0, 10).map(b => b.headingLine),
      debug_written: !insertErr,
      insert_error: insertErr?.message,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
