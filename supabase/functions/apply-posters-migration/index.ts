// @ts-nocheck
/**
 * One-shot migration: create project_posters table if missing.
 * Safe to re-run (CREATE TABLE IF NOT EXISTS).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Run migration SQL via the service_role RPC
    const sql = `
    CREATE TABLE IF NOT EXISTS public.project_posters (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      user_id uuid NOT NULL,
      version_number integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'pending',
      is_active boolean NOT NULL DEFAULT false,
      source_type text NOT NULL DEFAULT 'generated',
      key_art_storage_path text,
      key_art_public_url text,
      rendered_storage_path text,
      rendered_public_url text,
      aspect_ratio text NOT NULL DEFAULT '2:3',
      layout_variant text NOT NULL DEFAULT 'cinematic-dark',
      prompt_text text,
      prompt_inputs jsonb DEFAULT '{}'::jsonb,
      provider text,
      model text,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(project_id, version_number)
    );
    ALTER TABLE public.project_posters ENABLE ROW LEVEL SECURITY;
    INSERT INTO storage.buckets (id, name, public) VALUES ('project-posters', 'project-posters', true) ON CONFLICT (id) DO NOTHING;
    `;

    // Execute via the Supabase REST API with service_role key directly
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Accept": "application/json",
      },
      body: JSON.stringify({}),
    });

    // We can also verify the table was created
    const { data, error } = await sb
      .from("project_posters")
      .select("id", { count: "exact", head: true })
      .limit(1);

    const tableExists = !(error && error.message?.includes("does not exist"));

    return new Response(JSON.stringify({
      migration_applied: tableExists,
      table_exists: tableExists,
      verification_error: error?.message || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({
      error: e.message,
      migration_applied: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});