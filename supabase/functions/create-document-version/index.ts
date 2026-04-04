/**
 * create-document-version — Server-authoritative edge function for creating
 * a new project_document_versions row.
 *
 * This is the ONLY entry point for version creation from the client.
 * Delegates to doc-os.createVersion() for all logic.
 *
 * IEL: fail-closed, no silent fallbacks.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createVersion } from "../_shared/doc-os.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: extract JWT from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create user-scoped client for auth validation
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Allowed source modes for client-originated versions ──
    const ALLOWED_SOURCE_MODES = new Set([
      "vpb_section_refinement_commit",
      "manual_edit",
      "script_derive",
      "seed_override",
    ]);

    // Parse + validate body
    const body = await req.json();
    const {
      documentId,
      parentVersionId,
      plaintext,
      label,
      changeSummary,
      generatorId,
      sourceMode,
      status,
      metaJson,
    } = body;

    // Fail-closed validation
    if (!documentId) throw new Error("documentId is required");
    if (!plaintext || plaintext.trim().length === 0) throw new Error("plaintext must be non-empty");
    if (!label) throw new Error("label is required");
    if (!generatorId) throw new Error("generatorId is required");
    if (!sourceMode) throw new Error("sourceMode is required");
    if (!ALLOWED_SOURCE_MODES.has(sourceMode)) {
      throw new Error(`sourceMode "${sourceMode}" is not allowed. Must be one of: ${[...ALLOWED_SOURCE_MODES].join(", ")}`);
    }

    // Use service role client for DB writes (RLS bypass for version creation)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Look up doc_type from document
    const { data: docRow, error: docErr } = await serviceClient
      .from("project_documents")
      .select("doc_type")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr || !docRow) {
      throw new Error(`Document ${documentId} not found`);
    }

    // Delegate to canonical createVersion
    const newVersion = await createVersion(serviceClient, {
      documentId,
      docType: docRow.doc_type,
      plaintext,
      label,
      createdBy: user.id,
      changeSummary: changeSummary || undefined,
      generatorId,
      parentVersionId: parentVersionId || undefined,
      status: status || "draft",
      metaJson: metaJson || {},
      // Structured provenance — typed source_mode, no generic "client" writes
      inputsUsed: {
        source_mode: sourceMode,
        actor: "user",
        user_id: user.id,
      },
    });

    return new Response(
      JSON.stringify({
        versionId: newVersion.id,
        versionNumber: newVersion.version_number,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("[create-document-version] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
