import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = await req.json();
    const sql = body.sql;
    if (!sql) {
      return new Response(JSON.stringify({ error: "Missing 'sql' in request body" }), { status: 400 });
    }

    // Split into individual statements and execute each
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const results = [];
    let hasError = false;

    for (const stmt of statements) {
      try {
        // exec_sql returns SETOF json — an array of rows
        const { data, error } = await supabase.rpc("exec_sql", { query: stmt + ";" });
        if (error) {
          results.push({ statement: stmt.slice(0, 80), error: error.message });
          hasError = true;
        } else {
          results.push({ statement: stmt.slice(0, 80), rows: data?.length ?? 0 });
        }
      } catch (e: any) {
        results.push({ statement: stmt.slice(0, 80), error: e.message });
        hasError = true;
      }
    }

    return new Response(
      JSON.stringify({ success: !hasError, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});