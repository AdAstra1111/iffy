// run-pd-single — test PD generation for Ghost Frequency (single call)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const GHOST_PROJECT = "8a62605d-a239-438d-9b31-7c83429cb17c";
  const DOC_ID = "03ba576b-42cf-46a6-b725-a35fd51563f1";
  const V6_ID = "c36d3907-ec84-45c1-8b35-4bfbfd9ac8ce";

  // Get current chunk status BEFORE
  const { data: chunksBefore } = await sb
    .from("project_document_chunks")
    .select("chunk_index, chunk_key, status, char_count")
    .eq("document_id", DOC_ID)
    .eq("version_id", V6_ID)
    .order("chunk_index", { ascending: true });

  const statusBefore = tallyChunks(chunksBefore || []);

  // Clear stuck running chunks
  if (statusBefore.running > 0) {
    await sb.from("project_document_chunks")
      .update({ status: "pending", attempts: 0, error: null })
      .eq("document_id", DOC_ID)
      .eq("version_id", V6_ID)
      .eq("status", "running");
  }

  // Call generate-document with a SHORT timeout
  const startTime = Date.now();
  let generateResponse, generateError;
  try {
    const res = await fetch(supabaseUrl + "/functions/v1/generate-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + serviceKey,
      },
      body: JSON.stringify({
        projectId: GHOST_PROJECT,
        docType: "production_draft",
      }),
    });
    generateResponse = await res.text();
    try { generateResponse = JSON.parse(generateResponse); } catch {}
  } catch (e) {
    generateError = e.message;
  }
  const elapsed = (Date.now() - startTime) / 1000;

  // Get chunk status AFTER
  const { data: chunksAfter } = await sb
    .from("project_document_chunks")
    .select("chunk_index, chunk_key, status, char_count")
    .eq("document_id", DOC_ID)
    .eq("version_id", V6_ID)
    .order("chunk_index", { ascending: true });

  const statusAfter = tallyChunks(chunksAfter || []);

  return new Response(JSON.stringify({
    elapsed_seconds: elapsed,
    generate_error: generateError || null,
    generate_response: generateResponse,
    before: statusBefore,
    after: statusAfter,
    delta: {
      done: statusAfter.done - statusBefore.done,
      pending: statusAfter.pending - statusBefore.pending,
    },
  }), { headers: { "Content-Type": "application/json" } });

  function tallyChunks(chunks) {
    const done = chunks.filter(c => c.status === "done" && c.char_count > 0).length;
    const running = chunks.filter(c => c.status === "running").length;
    const pending = chunks.filter(c => c.status === "pending").length;
    const failed = chunks.filter(c => c.status === "failed_validation").length;
    const totalChars = chunks.filter(c => c.status === "done").reduce((s, c) => s + (c.char_count || 0), 0);
    return { total: chunks.length, done, running, pending, failed, total_chars: totalChars };
  }
});