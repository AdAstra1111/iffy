/**
 * reconciliation-flags
 *
 * Phase 2 of Approval + Producer Notes + Cascade Flow.
 *
 * GET  — List flags for a project (all or unresolved)
 *        ?project_id=uuid&unresolved=true
 *
 * DELETE — Clear a specific flag (called after downstream reconciliation + re-approval)
 *        Body: { id: uuid }
 *
 * POST (clear_many) — Clear all flags for a downstream doc version
 *        Body: { downstream_doc_version_id: uuid }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getClient(serviceKey?: string) {
  if (serviceKey === SUPABASE_SERVICE_KEY) {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET — list flags
  if (req.method === "GET") {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");
    const unresolved = url.searchParams.get("unresolved") === "true";

    if (!projectId) {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = await getClient();
    let query = sb
      .from("reconciliation_flags")
      .select("*, producer_note:producer_notes(id, source_doc_type, decision, note_text, entity_tag)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (unresolved) {
      query = query.is("cleared_at", null);
    }

    const { data: flags, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ flags }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // POST — clear all flags for a downstream doc version (called after re-approval)
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { downstream_doc_version_id, service_key } = body as {
      downstream_doc_version_id?: string;
      service_key?: string;
    };

    if (!downstream_doc_version_id) {
      return new Response(JSON.stringify({ error: "downstream_doc_version_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = await getClient(service_key);

    const { data, error } = await sb
      .from("reconciliation_flags")
      .update({ cleared_at: new Date().toISOString() })
      .eq("downstream_doc_version_id", downstream_doc_version_id)
      .is("cleared_at", null)
      .select();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      cleared: data,
      message: `${(data || []).length} flag(s) cleared for downstream doc version ${downstream_doc_version_id}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // DELETE — clear a specific flag
  if (req.method === "DELETE") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { id, service_key } = body as { id?: string; service_key?: string };
    if (!id) {
      return new Response(JSON.stringify({ error: "id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = await getClient(service_key);
    const { error } = await sb
      .from("reconciliation_flags")
      .update({ cleared_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ id, cleared_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
