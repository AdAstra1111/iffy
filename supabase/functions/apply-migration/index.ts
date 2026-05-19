import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const sql = `DROP POLICY IF EXISTS "Users can update versions on accessible docs" ON public.project_document_versions;

CREATE POLICY "Users can update versions on accessible docs"
  ON public.project_document_versions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_documents pd
      WHERE pd.id = document_id
      AND public.has_project_access(auth.uid(), pd.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_documents pd
      WHERE pd.id = document_id
      AND public.has_project_access(auth.uid(), pd.project_id)
    )
  );`;

    // Execute SQL via the Supabase REST API with service_role key
    // PostgREST can execute raw SQL queries through the /rest/v1/rpc/ endpoint
    // We use a direct fetch to the Supabase SQL endpoint
    const response = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          "Prefer": "params=single-object",
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    return new Response(
      JSON.stringify({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message, stack: e.stack }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});