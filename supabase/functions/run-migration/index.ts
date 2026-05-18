import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();
    const sql = body.sql;
    if (!sql) {
      return new Response(JSON.stringify({ error: "Missing 'sql' in request body" }), { status: 400 });
    }

    // Use the Supabase REST API directly with service_role key to execute SQL
    // This works because the service_role bypasses RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    
    // Try exec_sql RPC first (if it exists)
    const { data, error } = await supabase.rpc("exec_sql", { query: sql });
    
    if (error) {
      // Fallback: use the Supabase Management API SQL endpoint
      // This requires the project to have the pg_net extension
      // Or we try a different approach
      
      // Attempt: execute SQL via a temporary table operation
      // Split SQL into statements and execute each
      const statements = sql
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      const results = [];
      for (const stmt of statements) {
        // Use the REST API to execute the statement
        // PostgREST doesn't support arbitrary DDL, but we can try via rpc
        const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
          },
          body: JSON.stringify({ query: stmt + ";" }),
        });
        
        if (resp.ok) {
          results.push({ statement: stmt.slice(0, 80), status: "ok" });
        } else {
          results.push({ statement: stmt.slice(0, 80), status: "error", detail: await resp.text() });
        }
      }
      
      return new Response(
        JSON.stringify({ 
          fallback_used: true, 
          exec_sql_error: error.message,
          results,
          tip: "exec_sql RPC not found. Create it via Supabase Dashboard SQL Editor: CREATE OR REPLACE FUNCTION public.exec_sql(query text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN (SELECT json_agg(row_to_json(t)) FROM (EXECUTE query) t); END; $$;"
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});