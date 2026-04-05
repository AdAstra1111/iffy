import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = 'https://tzdxrhklarzccqamxbxw.supabase.co'
    const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6ZHhyaGtsYXJ6Y2NxYW14Ynh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjg4Mjg5MSwiZXhwIjoxNzg4NDU4ODkxfQ.Lhl_34PCnDMB65pe0rG0dsAOTMhTCglzIaYFwv8LSsk'
    
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    
    // Run a test query
    const { data, error } = await supabase.from('narrative_units').select('id').limit(1)
    
    if (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message,
        hint: 'Service role key may be invalid'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      })
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Connected to database',
      data: data
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})