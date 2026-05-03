import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY_FOR_SUPABASE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  
  // Direct update without select
  const { data, error, status } = await supabase
    .from("treatment_acts")
    .update({ status: "done", content: "## Act 1 - Setup\n\nTest content written at " + new Date().toISOString() })
    .eq("treatment_id", "a901a63c-f12b-4864-afd2-c306c71cbdbd")
    .eq("act_key", "act_1_setup");
  
  // Verify
  const { data: verify } = await supabase
    .from("treatment_acts")
    .select("act_key, status, content")
    .eq("treatment_id", "a901a63c-f12b-4864-afd2-c306c71cbdbd")
    .eq("act_key", "act_1_setup");
  
  return new Response(JSON.stringify({ updateData: data, updateError: error, updateStatus: status, verify }, null, 2), { headers: { "Content-Type": "application/json" } });
});
