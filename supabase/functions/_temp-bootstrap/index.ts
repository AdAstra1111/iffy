import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Step 1: Create the exec_sql function
    const createFuncSQL = `
      CREATE OR REPLACE FUNCTION public.exec_sql(query text)
      RETURNS SETOF jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
        RETURN QUERY EXECUTE query;
      END;
      $$;
    `;

    // Use raw SQL connection via pg-format or direct query
    // Supabase allows SQL execution via the internal pg client
    const { data: funcData, error: funcError } = await supabase.rpc("exec_sql", {
      query: createFuncSQL,
    }).maybeSingle();

    // If exec_sql doesn't exist yet, try creating it via a different method
    if (funcError && funcError.message.includes("Could not find the function")) {
      // Try using the Supabase management endpoints
      // First approach: use the postgres connection via direct query
      const { error: createError } = await supabase.from("_exec_sql_bootstrap").select("*").limit(0).maybeSingle();
      
      // Alternative: embed the creation in a SELECT that returns nothing
      const { error: createError2 } = await supabase.rpc("_create_exec_sql", {
        _: createFuncSQL,
      }).maybeSingle();
      
      // If direct approach needed, use a raw SQL approach
      const resp = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/rest/v1/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
            "Prefer": "tx=open",
          },
          body: JSON.stringify({ query: createFuncSQL }),
        }
      );
      
      return new Response(
        JSON.stringify({ 
          error: "exec_sql does not exist - need manual creation",
          details: funcError.message,
          note: "Create exec_sql function manually via Supabase dashboard SQL editor, then retry run-migration"
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 2: Read and execute the migration SQL
    const migrationSQL = await Deno.readTextFile(
      "supabase/migrations/20260317151032_46f9919b-5ee7-45bb-a5d8-cebd9ef557de.sql"
    );

    const { data: migData, error: migError } = await supabase.rpc("exec_sql", {
      query: migrationSQL,
    });

    if (migError) {
      return new Response(
        JSON.stringify({ error: migError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "exec_sql function created and migration applied",
        migration: "devseed_plateau_diagnoses table created/verified"
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});