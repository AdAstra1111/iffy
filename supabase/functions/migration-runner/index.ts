import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://hdfderbphdobomkdjypc.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_DB_PASSWORD = Deno.env.get("SUPABASE_DB_PASSWORD") || "";

serve(async (req) => {
  try {
    const migrationSql = await req.text();
    const projectRef = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Split the migration into individual statements
    const statements = migrationSql
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));

    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    for (const stmt of statements) {
      try {
        // Use Supabase's database/query endpoint via Management API
        const response = await fetch(
          `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ query: stmt + ";" }),
          }
        );
        
        if (response.ok) {
          successCount++;
          const body = await response.json().catch(() => ({}));
          results.push({ status: "ok", stmt: stmt.substring(0, 80) + "...", data: body });
        } else {
          errorCount++;
          const errText = await response.text().catch(() => "unknown");
          results.push({ status: "error", stmt: stmt.substring(0, 80) + "...", error: errText.substring(0, 200) });
        }
      } catch (e) {
        errorCount++;
        results.push({ status: "exception", stmt: stmt.substring(0, 80) + "...", error: e.message });
      }
    }

    return new Response(JSON.stringify({
      success: errorCount === 0,
      total: statements.length,
      successCount,
      errorCount,
      results,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
