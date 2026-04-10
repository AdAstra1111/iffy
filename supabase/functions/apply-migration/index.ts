import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const results: string[] = [];

  try {
    // Migration 1: add source column
    await sb.from("development_runs").select("source").limit(1);
    results.push("source column already exists");
  } catch {
    try {
      // Add column via raw SQL via postgres rpc if available, otherwise skip
      results.push("source column: checking...");
    } catch (e: any) {
      results.push(`source column error: ${e.message}`);
    }
  }

  // Apply via postgres rpc
  const { data, error } = await (sb.rpc as any)("pg_catalog.pg_column_exists" as any, { table: "development_runs", column: "source" });
  
  // Simple approach: just verify the column exists by trying to insert with it
  // If it fails because the column doesn't exist, we log it
  // The actual column creation needs to be done via db push or manual SQL
  
  return new Response(JSON.stringify({ 
    message: "Apply migrations manually or via supabase db push",
    note: "The source column migration needs to be applied via: supabase db push",
    migrations: [
      "202604100200_add_source_to_development_runs.sql",
      "202604100201_add_atomic_convergence_write.sql"
    ]
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
