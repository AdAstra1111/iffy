/**
 * cascade-engine
 *
 * Phase 2 of Approval + Producer Notes + Cascade Flow.
 *
 * Triggered automatically after a producer note is accepted.
 * Reads the producer note, determines affected downstream doc types,
 * and creates reconciliation_flags for each affected downstream doc version.
 *
 * Dependency chain:
 *   concept_brief → beat_sheet, character_bible
 *   beat_sheet   → character_bible, treatment
 *   character_bible → treatment
 *
 * POST — Run cascade for a producer note
 * Body: {
 *   producer_note_id: uuid,
 *   service_key?: string   -- service role bypass
 * }
 *
 * Returns: { created_flags: ReconciliationFlag[], message: string }
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

// ── Dependency chain ──────────────────────────────────────────────────────────
// Maps each source doc_type → list of downstream doc_types it can affect
const DOWNSTREAM_MAP: Record<string, string[]> = {
  concept_brief:   ["beat_sheet", "character_bible"],
  beat_sheet:      ["character_bible", "treatment"],
  character_bible: ["treatment"],
};

type ReconciliationFlag = {
  id: string;
  project_id: string;
  downstream_doc_type: string;
  downstream_doc_version_id: string;
  triggered_by_producer_note_id: string;
  entity_tag: string | null;
  reason: string;
  created_at: string;
  cleared_at: string | null;
};

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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { producer_note_id, service_key } = body as {
    producer_note_id?: string;
    service_key?: string;
  };

  if (!producer_note_id) {
    return new Response(JSON.stringify({ error: "producer_note_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = await getClient(service_key);

  // ── 1. Fetch the producer note ─────────────────────────────────────────────
  const { data: note, error: noteErr } = await sb
    .from("producer_notes")
    .select("*")
    .eq("id", producer_note_id)
    .single();

  if (noteErr || !note) {
    return new Response(JSON.stringify({ error: "Producer note not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Only cascade for accepted notes
  if (note.decision !== "accepted") {
    return new Response(JSON.stringify({
      created_flags: [],
      message: "Note was rejected — no cascade triggered.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── 2. Determine downstream doc types ────────────────────────────────────────
  const downstreamTypes = DOWNSTREAM_MAP[note.source_doc_type] ?? [];
  if (downstreamTypes.length === 0) {
    return new Response(JSON.stringify({
      created_flags: [],
      message: `Source doc type "${note.source_doc_type}" has no downstream dependencies — no flags created.`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── 3. Find all downstream doc versions in this project ─────────────────────
  // For each downstream doc type, get the latest version ID
  const downstreamVersions: Array<{ doc_type: string; version_id: string; reason: string }> = [];

  for (const downstreamType of downstreamTypes) {
    // Find the latest version of this doc type in the project
    const { data: latestVersion, error: versionErr } = await sb
      .from("project_document_versions")
      .select("id")
      .eq("project_id", note.project_id)
      .eq("doc_type", downstreamType)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionErr) {
      console.error(`[cascade-engine] Error fetching latest ${downstreamType} version:`, versionErr);
      continue;
    }

    if (latestVersion) {
      const reason = `${note.source_doc_type} accepted: ${note.entity_tag ? `entity "${note.entity_tag}" changed` : `divergence ${note.divergence_id} accepted`}`;
      downstreamVersions.push({
        doc_type: downstreamType,
        version_id: latestVersion.id,
        reason,
      });
    }
  }

  if (downstreamVersions.length === 0) {
    return new Response(JSON.stringify({
      created_flags: [],
      message: "No downstream document versions found in project — no flags created.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── 4. Create reconciliation_flags ─────────────────────────────────────────
  const flagsToInsert = downstreamVersions.map(({ doc_type, version_id, reason }) => ({
    project_id: note.project_id,
    downstream_doc_type: doc_type,
    downstream_doc_version_id: version_id,
    triggered_by_producer_note_id: note.id,
    entity_tag: note.entity_tag ?? null,
    reason,
  }));

  const { data: createdFlags, error: insertErr } = await sb
    .from("reconciliation_flags")
    .insert(flagsToInsert)
    .select()
    .order("created_at", { ascending: true });

  if (insertErr) {
    console.error("[cascade-engine] Error creating flags:", insertErr);
    return new Response(JSON.stringify({ error: `Failed to create flags: ${insertErr.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const flagIds = (createdFlags as ReconciliationFlag[]).map((f) => f.id);

  // ── 5. Unapprove affected downstream doc versions ────────────────────────────────────
  // Any approved versions of the affected doc types must be unapproved
  // so the document tray reflects the correct state.
  const unapprovedVersionIds: string[] = [];
  for (const { version_id } of downstreamVersions) {
    const { error: unapproveErr } = await sb
      .from("project_document_versions")
      .update({ approval_status: "unapproved", is_current: false })
      .eq("id", version_id)
      .eq("approval_status", "approved"); // only touch approved versions
    if (!unapproveErr) unapprovedVersionIds.push(version_id);
    else console.warn(`[cascade-engine] Failed to unapprove version ${version_id}:`, unapproveErr.message);
  }

  return new Response(JSON.stringify({
    created_flags: createdFlags,
    unapproved_version_ids: unapprovedVersionIds,
    message: `Cascade complete: ${flagIds.length} reconciliation flag(s) created, ${unapprovedVersionIds.length} version(s) unapproved.`,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
