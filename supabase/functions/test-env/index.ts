import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY_FOR_SUPABASE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  // Fixed: anon key as apikey + service role JWT as Bearer auth
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${supabaseServiceKey}` } },
  });
  
  // Test update with proper auth
  const { data, error } = await supabase
    .from("treatment_acts")
    .update({ status: "done", content: "Test content at " + new Date().toISOString() })
    .eq("treatment_id", "a901a63c-f12b-4864-afd2-c306c71cbdbd")
    .eq("act_key", "act_1_setup");
  
  // Verify
  const { data: verify } = await supabase
    .from("treatment_acts")
    .select("act_key, status, char_length(content) as chars")
    .eq("treatment_id", "a901a63c-f12b-4864-afd2-c306c71cbdbd")
    .eq("act_key", "act_1_setup");
  
  return new Response(JSON.stringify({ 
    updateData: data, 
    updateError: error,
    verify,
    keyType: supabaseServiceKey.includes('.') ? 'JWT' : 'OTHER'
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
