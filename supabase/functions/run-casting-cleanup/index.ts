// run-casting-cleanup — deduplicate and verify cast records
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const CONCRETE = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";
  const EVENT = "6c4e2f48-fe9c-47b6-aac8-656a3ed4274b";

  async function verifyAndClean(projectId) {
    // Get all cast rows
    const { data: castRows } = await sb
      .from("project_ai_cast")
      .select("id, character_key, ai_actor_id, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (!castRows) return { rows: 0, cleaned: 0, current: 0, chars: [] };

    // Find duplicates: group by character_key
    const byKey = {};
    for (const row of castRows) {
      const key = (row.character_key || "unknown").toLowerCase().replace(/^char_/, "");
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(row);
    }

    const chars = [];
    let cleaned = 0;

    for (const [key, rows] of Object.entries(byKey)) {
      if (rows.length > 1) {
        // Keep the newest one (last created), delete older ones
        rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        for (const old of rows.slice(0, -1)) {
          await sb.from("project_ai_cast").delete().eq("id", old.id);
          // Also cleanup orphaned ai_actors
          if (old.ai_actor_id && !rows[rows.length - 1].ai_actor_id.endsWith(old.ai_actor_id.slice(-36))) {
            await sb.from("ai_actors").delete().eq("id", old.ai_actor_id);
          }
          cleaned++;
        }
        chars.push({ key: rows[rows.length - 1].character_key, id: rows[rows.length - 1].id, ai_actor_id: rows[rows.length - 1].ai_actor_id });
      } else if (rows.length === 1) {
        chars.push({ key: rows[0].character_key, id: rows[0].id, ai_actor_id: rows[0].ai_actor_id });
      }
    }

    // Re-query
    const { data: finalRows } = await sb
      .from("project_ai_cast")
      .select("id, character_key, ai_actor_id")
      .eq("project_id", projectId);

    return {
      rows_before: castRows.length,
      cleaned: cleaned,
      rows_after: (finalRows || []).length,
      chars: chars,
    };
  }

  const concrete = await verifyAndClean(CONCRETE);
  const event = await verifyAndClean(EVENT);

  // Also check if CIPs and visual DNA exist
  const conCip = await sb.from("character_identity_packages").select("id").eq("project_id", CONCRETE).limit(1);
  const evCip = await sb.from("character_identity_packages").select("id").eq("project_id", EVENT).limit(1);
  const conDna = await sb.from("character_visual_dna").select("id").eq("project_id", CONCRETE).limit(1);
  const evDna = await sb.from("character_visual_dna").select("id").eq("project_id", EVENT).limit(1);

  return new Response(JSON.stringify({
    concrete_angels: {
      cast: concrete,
      has_cips: (conCip.data || []).length > 0,
      has_visual_dna: (conDna.data || []).length > 0,
    },
    event_horizon: {
      cast: event,
      has_cips: (evCip.data || []).length > 0,
      has_visual_dna: (evDna.data || []).length > 0,
    },
  }), { headers: { "Content-Type": "application/json" } });
});