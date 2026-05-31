const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const srk = env.split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY")).split("=")[1].trim().replace(/"/g, "");
const SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co";
const sb = createClient(SUPABASE_URL, srk);

const PID = "8a62605d-a239-438d-9b31-7c83429cb17c";

async function main() {
  // PART 1: Call evaluate-visual-governance
  console.log("=== PART 1: Governance ===");
  try {
    const resp = await fetch(SUPABASE_URL + "/functions/v1/evaluate-visual-governance", {
      method: "POST",
      headers: {"Content-Type": "application/json", "Authorization": "Bearer " + srk, "apikey": srk},
      body: JSON.stringify({ projectId: PID }),
      signal: AbortSignal.timeout(30_000)
    });
    const t = await resp.text();
    let parsed;
    try { parsed = JSON.parse(t); } catch { parsed = null; }
    if (parsed?.stages) {
      for (const s of parsed.stages) {
        console.log(`\n${s.stage_id}:`);
        console.log(`  status: ${s.computed_status}`);
        console.log(`  stale: ${s.stale_risk?.isStale}`);
        if (s.blocker_codes?.length) {
          console.log(`  blockers: ${s.blocker_codes.join(", ")}`);
        }
        if (s.stale_risk?.reasons?.length) {
          console.log(`  stale_reasons: ${JSON.stringify(s.stale_risk.reasons)}`);
        }
      }
    } else {
      console.log("Gov response:", resp.status, t.substring(0, 500));
    }
  } catch(e) { console.log("Gov error:", e.message); }
  
  // PART 2: Test extract-scene-index
  console.log("\n=== PART 2: Extract Scene Index ===");
  try {
    // Get production draft text
    const { data: pdDoc } = await sb.from("project_documents")
      .select("id, doc_type").eq("project_id", PID).eq("doc_type", "production_draft").single();
    const { data: pdVer } = await sb.from("project_document_versions")
      .select("id, plaintext").eq("document_id", pdDoc.id).eq("is_current", true).single();
    
    if (pdVer?.plaintext && pdVer.plaintext.length > 1000) {
      console.log("PD text:", pdVer.plaintext.length, "chars");
      
      // Call extract-scene-index
      const resp = await fetch(SUPABASE_URL + "/functions/v1/extract-scene-index", {
        method: "POST",
        headers: {"Content-Type": "application/json", "Authorization": "Bearer " + srk, "apikey": srk},
        body: JSON.stringify({ 
          projectId: PID,
          sourceId: pdDoc.id,
          versionId: pdVer.id
        }),
        signal: AbortSignal.timeout(120_000)
      });
      const t = await resp.text();
      let parsed;
      try { parsed = JSON.parse(t); } catch { parsed = null; }
      console.log("Extract:", resp.status);
      if (parsed) console.log("  Response:", JSON.stringify(parsed).substring(0, 300));
      else console.log("  Raw:", t.substring(0, 300));
      
      // Check scene_index after extraction
      const { data: scenes } = await sb.from("scene_index")
        .select("scene_number, slugline, location_key")
        .eq("project_id", PID)
        .order("scene_number")
        .limit(5);
      console.log("\nScene index after extract:");
      if (scenes?.length) {
        console.log(`  ${scenes.length} scenes`);
        scenes.forEach(s => console.log(`  #${s.scene_number}: ${(s.slugline||"").substring(0,60)}`));
      } else {
        console.log("  0 scenes — extract did not populate");
      }
    } else {
      console.log("PD text not available");
    }
  } catch(e) { console.log("Extract error:", e.message); }
}
main();
