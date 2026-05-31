const JWT = require("fs").readFileSync(__dirname + "/tmp_jwt.txt", "utf8").trim();
const fetch = require("node-fetch");
const SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co";
const PID = "8a62605d-a239-438d-9b31-7c83429cb17c";

async function main() {
  // Character atomiser (uses SRK, not JWT)
  console.log("1. Character atomiser...");
  try {
    // Read SRK from env
    const env = require("fs").readFileSync(".env.local", "utf8");
    const srk = env.split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY")).split("=")[1].trim().replace(/"/g, "");
    const resp = await fetch(SUPABASE_URL + "/functions/v1/character-atomiser", {
      method: "POST", headers: {"Content-Type": "application/json", "Authorization": "Bearer " + srk, "apikey": srk},
      body: JSON.stringify({ project_id: PID }),
      signal: AbortSignal.timeout(180_000)
    });
    const t = await resp.text();
    console.log("  ", resp.status, t.substring(0, 300));
  } catch(e) { console.log("  ERR:", e.message); }

  // Set generation_status on atoms
  console.log("\n2. Update atom status...");
  const { createClient } = require("@supabase/supabase-js");
  const env2 = require("fs").readFileSync(".env.local", "utf8");
  const srk2 = env2.split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY")).split("=")[1].trim().replace(/"/g, "");
  const sb = createClient(SUPABASE_URL, srk2);
  await sb.from("atoms").update({ generation_status: "completed" }).eq("project_id", PID).eq("atom_type", "character");
  console.log("  done");

  // Governance
  console.log("\n3. Governance...");
  await fetch(SUPABASE_URL + "/functions/v1/evaluate-visual-governance", {
    method: "POST", headers: {"Content-Type": "application/json", "Authorization": "Bearer " + srk2, "apikey": srk2},
    body: JSON.stringify({ projectId: PID }),
  });
  const { data: gov } = await sb.from("project_visual_stage_governance")
    .select("stage_id, computed_status, blocker_codes")
    .eq("project_id", PID);
  console.log("\n=== Governance ===");
  for (const g of gov || []) {
    const bc = g.blocker_codes?.join(", ") || "none";
    console.log("  " + g.stage_id.padEnd(20) + " " + g.computed_status.padEnd(12) + " " + bc);
  }

  // Suggest cast via JWT
  console.log("\n4. Generating cast candidates...");
  const characters = ["Dr. Elena Vasquez", "Dr. Marcus Webb", "Agent Sarah Chen", "Alt-Elena", "Dr. James Vasquez"];
  for (const name of characters) {
    process.stdout.write("Cast " + name + "...");
    try {
      const resp = await fetch(SUPABASE_URL + "/functions/v1/generate-casting-candidates", {
        method: "POST",
        headers: {"Content-Type": "application/json", "Authorization": "Bearer " + JWT},
        body: JSON.stringify({ projectId: PID, candidatesPerCharacter: 2, characterFilter: name, explorationMode: false }),
        signal: AbortSignal.timeout(180_000)
      });
      const t = await resp.text();
      const p = JSON.parse(t);
      if (resp.ok) {
        process.stdout.write(" " + (p.generated || 0) + " generated, " + (p.failed || 0) + " failed\n");
      } else {
        process.stdout.write(" " + resp.status + " " + (p.error || t.substring(0, 60)) + "\n");
      }
    } catch(e) { process.stdout.write(" ERR " + e.message + "\n"); }
  }
}
main();