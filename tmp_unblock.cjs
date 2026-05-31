const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const srk = env.split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY")).split("=")[1].trim().replace(/"/g, "");
const SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co";
const sb = createClient(SUPABASE_URL, srk);

const PID = "8a62605d-a239-438d-9b31-7c83429cb17c";

async function callFn(name, body, label) {
  process.stdout.write(label + "...");
  try {
    const resp = await fetch(SUPABASE_URL + "/functions/v1/" + name, {
      method: "POST", headers: {"Content-Type": "application/json", "Authorization": "Bearer " + srk, "apikey": srk},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000)
    });
    const t = await resp.text();
    console.log(" " + resp.status, t.substring(0, 300));
  } catch(e) { console.log(" ERR:", e.message); }
}

async function main() {
  // Clean up old canon_import entities
  await sb.from("narrative_entities").delete().eq("project_id", PID).eq("source_kind", "canon_import");
  console.log("Cleaned canon_import entities");

  // Populate canon_locations from narrative_entities
  const { data: ents } = await sb.from("narrative_entities").select("canonical_name, meta_json").eq("project_id", PID).eq("entity_type", "location");
  for (const e of ents || []) {
    const { error } = await sb.from("canon_locations").insert({
      project_id: PID, name: e.canonical_name, description: (e.meta_json?.description) || ""
    });
    if (error) console.log("  loc sync:", e.canonical_name, error.message?.substring(0,60));
  }
  console.log("Locations synced");

  // Run character atomiser
  await callFn("character-atomiser", {project_id: PID}, "Atomiser");

  // Run governance
  await callFn("evaluate-visual-governance", {projectId: PID}, "Governance");

  // Show results
  const { data: gov } = await sb.from("project_visual_stage_governance")
    .select("stage_id, computed_status, blocker_codes")
    .eq("project_id", PID);
  console.log("\n=== Governance After ===");
  if (gov) gov.forEach(g => {
    const bc = g.blocker_codes?.join(", ") || "none";
    console.log("  " + g.stage_id.padEnd(20) + " " + g.computed_status.padEnd(12) + " " + bc);
  });
}
main();
