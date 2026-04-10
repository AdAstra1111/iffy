import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const { version_id } = body as { version_id: string };

  if (!version_id) {
    return new Response(JSON.stringify({ error: "version_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Fetch version details
    const { data: version, error: verErr } = await sb
      .from("project_document_versions")
      .select("id, document_id, is_current, version_number")
      .eq("id", version_id)
      .single();

    if (verErr || !version) {
      return new Response(JSON.stringify({ error: `Version ${version_id} not found` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = version.document_id;

    // Check version count
    const { count: versionCount } = await sb
      .from("project_document_versions")
      .select("*", { count: "exact", head: true })
      .eq("document_id", docId);

    if (versionCount <= 1) {
      return new Response(JSON.stringify({ error: "Cannot delete the only version of a document" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find fallback version (prefer one with plaintext content)
    const { data: fallback } = await sb
      .from("project_document_versions")
      .select("id")
      .eq("document_id", docId)
      .neq("id", version_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    const fallbackId = fallback?.id || null;

    // Update latest_version_id if deleting the current latest
    const { data: doc } = await sb
      .from("project_documents")
      .select("latest_version_id")
      .eq("id", docId)
      .single();

    if (doc?.latest_version_id === version_id && fallbackId) {
      await sb
        .from("project_documents")
        .update({ latest_version_id: fallbackId })
        .eq("id", docId);
    }

    // Clear is_current if needed
    if (version.is_current && fallbackId) {
      await sb
        .from("project_document_versions")
        .update({ is_current: false })
        .eq("id", version_id);
      await sb
        .from("project_document_versions")
        .update({ is_current: true })
        .eq("id", fallbackId);
    }

    // Delete chunks
    await sb.from("project_document_chunks").delete().eq("version_id", version_id);

    // Delete version
    await sb.from("project_document_versions").delete().eq("id", version_id);

    return new Response(JSON.stringify({
      deleted_version_id: version_id,
      fallback_version_id: fallbackId,
      was_latest: doc?.latest_version_id === version_id,
      was_current: version.is_current,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[delete-version] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
