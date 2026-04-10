/**
 * producer-note
 *
 * Phase 1: Create and list producer notes (locked decisions per divergence).
 *
 * POST — Create a producer note
 * Body: {
 *   project_id: uuid,
 *   source_doc_type: "concept_brief" | "beat_sheet" | "character_bible" | "treatment",
 *   source_doc_version_id: uuid,
 *   divergence_id: string,     -- client-generated ID for the divergence
 *   decision: "accepted" | "rejected",
 *   note_text?: string,        -- optional producer rationale
 *   entity_tag?: string,       -- character/location/concept this affects
 *   service_key?: string       -- service role bypass
 * }
 *
 * Returns: { id, ...producer_note_record }
 *
 * GET — List producer notes for a project
 * Query params: project_id (required)
 * Returns: { notes: ProducerNote[] }
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

const DOC_TYPES = ["concept_brief", "beat_sheet", "character_bible", "treatment"] as const;
type DocType = typeof DOC_TYPES[number];

type ProducerNote = {
  id: string;
  project_id: string;
  source_doc_type: string;
  source_doc_version_id: string;
  divergence_id: string;
  decision: "accepted" | "rejected";
  note_text: string | null;
  entity_tag: string | null;
  created_by: string;
  created_at: string;
  locked: boolean;
};

async function getServiceClient(serviceKey?: string) {
  if (serviceKey === SUPABASE_SERVICE_KEY) {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  // Edge functions get service role from env; if a key was passed, validate it
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");
    if (!projectId) {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = await getServiceClient();
    const { data: notes, error } = await sb
      .from("producer_notes")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[producer-note] GET error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ notes: notes as ProducerNote[] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

    const {
      project_id,
      source_doc_type,
      source_doc_version_id,
      divergence_id,
      decision,
      note_text = null,
      entity_tag = null,
      service_key,
    } = body as {
      project_id: string;
      source_doc_type: string;
      source_doc_version_id: string;
      divergence_id: string;
      decision: "accepted" | "rejected";
      note_text?: string | null;
      entity_tag?: string | null;
      service_key?: string;
    };

    // Validation
    if (!project_id || !source_doc_type || !source_doc_version_id || !divergence_id || !decision) {
      return new Response(JSON.stringify({ error: "project_id, source_doc_type, source_doc_version_id, divergence_id, and decision are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!DOC_TYPES.includes(source_doc_type as DocType)) {
      return new Response(JSON.stringify({ error: `source_doc_type must be one of: ${DOC_TYPES.join(", ")}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (decision !== "accepted" && decision !== "rejected") {
      return new Response(JSON.stringify({ error: 'decision must be "accepted" or "rejected"' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = await getServiceClient(service_key);

    // Upsert: one producer note per divergence_id per doc version (idempotent — replaces prior unlocked note)
    const payload = {
      project_id,
      source_doc_type,
      source_doc_version_id,
      divergence_id,
      decision,
      note_text,
      entity_tag,
      locked: true,
    };

    const { data, error } = await sb
      .from("producer_notes")
      .upsert(payload, {
        onConflict: "project_id,source_doc_type,source_doc_version_id,divergence_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("[producer-note] POST error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ note: data as ProducerNote }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
