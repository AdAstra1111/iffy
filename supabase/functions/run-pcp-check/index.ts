// run-pcp-check — check PCP/CPIE dependencies
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const projects = [
    ["Concrete Angels", "b6ae36fb-805b-4ff5-84ba-91fbccd46334"],
    ["Event Horizon", "6c4e2f48-fe9c-47b6-aac8-656a3ed4274b"],
    ["YETI", "9404a383-5cdc-4f06-92aa-2ca70973c556"],
  ];

  const results = [];
  for (const [label, pid] of projects) {
    // Check project_context_profiles
    const { data: pcp, count: pcpCount } = await sb.from("project_context_profiles").select("*", { count: "exact", head: true }).eq("project_id", pid).maybeSingle();
    const { data: pcpAll } = await sb.from("project_context_profiles").select("id, profile_type").eq("project_id", pid).limit(5);

    // Check for a CPIE endpoint or function
    const { data: ci } = await sb.from("character_visual_dna").select("id").eq("project_id", pid).limit(1);
    const { data: cip } = await sb.from("character_identity_packages").select("id").eq("project_id", pid).limit(1);

    // Check for atoms with PCP error
    const { count: pcpErrorAtoms } = await sb.from("atoms").select("*", { count: "exact", head: true }).eq("project_id", pid).eq("atom_type", "costume").filter("attributes", "cs", "PCP profile");

    results.push({
      project: label,
      has_pcp: pcpAll && pcpAll.length > 0,
      pcp_types: pcpAll ? pcpAll.map(p => p.profile_type) : [],
      has_visual_dna: (ci || []).length > 0,
      has_cip: (cip || []).length > 0,
      atoms_with_pcp_error: pcpErrorAtoms || 0,
    });
  }

  return new Response(JSON.stringify(results, null, 2), { headers: { "Content-Type": "application/json" } });
});